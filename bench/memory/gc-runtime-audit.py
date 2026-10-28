"""Independent bounded replay of the task-only GC-aware allocation stream.

Uses the previously tested AVL index, never calls the instrumented runtime.
The native summary is checked against reconstructed extents, not trusted.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('prior_extent_audit', Path(__file__).with_name('runtime-audit.py'))
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)


def require(condition, message):
    if not condition:
        raise ValueError(message)


class Extents:
    def __init__(self):
        self.index = prior.IntervalIndex()

    @property
    def total(self):
        return self.index.total

    def pieces(self, a, b):
        result = []
        while a < b:
            found = self.index.first_overlap((a, b))
            if found is None:
                break
            x, y, _ = found
            result.append((max(a, x), min(b, y)))
            a = y
        return result

    def add(self, a, b):
        require(0 < a < b <= 2**64 - 1, 'Invalid extent')
        require(self.index.first_overlap((a, b)) is None, 'Overlapping occupied extents')
        self.index.insert(a, b)

    def cut(self, a, b):
        removed = 0
        while True:
            found = self.index.first_overlap((a, b))
            if found is None:
                break
            x, y, _ = found
            self.index.remove(x)
            removed += min(y, b) - max(x, a)
            if x < a:
                self.add(x, a)
            if b < y:
                self.add(b, y)
        return removed


METRICS = ('gross_birth_bytes', 'mutator_occupied_high_water_bytes', 'occupied_at_stop_bytes', 'trimmed_bytes', 'gc_removed_bytes')


def audit(path):
    digest = hashlib.sha256()
    measured = 0
    state = Extents()
    gross = peak = trimmed = reclaimed = count = gcs = moves = census_count = 0
    gc = None
    prefix_failure = None
    inspections = []
    births = set()
    reused_birth_addresses = 0

    with Path(path).open('rb') as stream:
        def read(n):
            nonlocal measured
            value = stream.read(n)
            require(len(value) == n, 'Truncated stream')
            measured += n
            require(measured <= 256 * 1024 * 1024, 'Audit input exceeds 256MiB')
            digest.update(value)
            return value

        def integer():
            value = 0
            for number in range(10):
                byte = read(1)[0]
                value |= (byte & 127) << (7 * number)
                if not byte & 128:
                    require(value < 2**64 and (number == 0 or byte != 0), 'Noncanonical/overflow integer')
                    return value
            raise ValueError('Unterminated integer')

        line = stream.readline(4097)
        require(line.endswith(b'\n') and len(line) <= 4096, 'Header bound')
        digest.update(line); measured += len(line)
        header = json.loads(line, object_pairs_hook=prior.unique_object)
        require(header['schema'] == 'raveldex-gc-extents-varint-v1', 'Schema mismatch')
        require(header['fields'] == ['kind', 'address', 'to', 'bytes', 'old_bytes', 'marker'], 'Record layout mismatch')
        require(type(header['active_extent_cap_per_map']) is int and 1 <= header['active_extent_cap_per_map'] <= 1000000, 'Map cap mismatch')
        require(type(header['map_count_max']) is int and header['map_count_max'] == 5, 'Map count mismatch')
        require(type(header['stream_byte_cap']) is int and 1048576 <= header['stream_byte_cap'] <= 16384*1048576, 'Stream cap mismatch')
        require(header['stdio_buffer_bytes'] == 65536 and header['physical_memory_measured'] is False, 'Native overhead/scope mismatch')
        require(header['single_threaded'] is True and header['incremental_marking'] is False, 'GC mode mismatch')
        require(header['inline_new'] is False and header['turbo_allocation_folding'] is False, 'Allocation mode mismatch')
        require(header['collector_overlap_measured'] is False and header['includes_preexisting_objects'] is False, 'Metric scope mismatch')
        while True:
            start = measured
            kind = integer()
            if kind == 0:
                length = integer()
                require(length <= 4096, 'Footer bound')
                summary = json.loads(read(length), object_pairs_hook=prior.unique_object)
                require(stream.read(1) == b'', 'Trailing bytes')
                require(summary['stream_bytes_before_summary'] == start, 'Stream offset mismatch')
                break
            require(1 <= kind <= 10, 'Unknown event')
            a, to, size, old, marker = (integer() for _ in range(5))
            count += 1
            if prefix_failure is not None:
                continue
            try:
                if kind == 1:
                    require(gc is None, 'Birth during GC')
                    state.add(a, a + size); gross += size; peak = max(peak, state.total)
                    reused_birth_addresses += a in births; births.add(a)
                elif kind == 2:
                    require(size > 0, 'Empty move')
                    if gc is None:
                        require(to > a, 'Unsupported non-GC move')
                        covered = sum(y - x for x, y in state.pieces(a, to + size))
                        require(covered in (0, to + size - a), 'Partial left trim')
                        if covered:
                            trimmed += state.cut(a, to)
                    else:
                        gc['sources'].add(a, a + size); gc['destinations'].add(to, to + size)
                        gc['moves'].append((a, to, size))
                        moves += 1
                elif kind == 3:
                    require(0 < size <= old, 'Invalid shrink')
                    if gc is None:
                        covered = sum(y - x for x, y in state.pieces(a, a + old))
                        require(covered in (0, old), 'Partial shrink')
                        if covered:
                            trimmed += state.cut(a + size, a + old)
                    else:
                        require(not state.pieces(a, a + old), 'Tracked GC shrink')
                        for source, destination, length in gc['moves']:
                            for x, y in state.pieces(source, source + length):
                                require(destination + y - source <= a or destination + x - source >= a + old, 'Moved tracked GC shrink')
                elif kind == 5:
                    require((size, old) == (state.total, peak), 'Mark metric mismatch')
                elif kind in (6, 7):
                    inspections.append(dict(seq=count, kind=kind, marker=marker, address=a, size=size,
                                            monitoredBytes=sum(y-x for x, y in state.pieces(a, a+size))))
                elif kind == 8:
                    require(gc is None and marker in (0, 1) and size == state.total, 'Invalid GC begin')
                    gc = dict(collector=marker, before=state.total, sources=Extents(), destinations=Extents(), moves=[], census=[])
                    gcs += 1
                elif kind == 10:
                    require(gc is not None and size > 0, 'Census outside GC')
                    gc['census'].append((a, a + size)); census_count += 1
                elif kind == 9:
                    require(gc is not None and marker == gc['collector'] and old == gc['before'], 'Invalid GC end')
                    # Compute all moved tags from the same immutable pre-GC map.
                    tagged = []
                    for source, destination, length in gc['moves']:
                        tagged.extend((destination+x-source, destination+y-source) for x, y in state.pieces(source, source+length))
                    for source, destination, length in gc['moves']:
                        state.cut(source, source+length); state.cut(destination, destination+length)
                    for x, y in tagged:
                        state.add(x, y)
                    survivors, census = Extents(), Extents()
                    for x, y in gc['census']:
                        census.add(x, y)
                        for first, last in state.pieces(x, y):
                            survivors.add(first, last)
                    require(survivors.total <= gc['before'], 'GC increased tracked occupied bytes')
                    reclaimed += gc['before'] - survivors.total
                    state = survivors; gc = None
                    require(size == state.total, 'GC census metric mismatch')
            except (ValueError, prior.AuditError) as error:
                prefix_failure = dict(sequence=count, reason=str(error))
        require(count == summary['events'], 'Event count mismatch')
        require(type(summary['attempted_events']) is int and type(summary['dropped_events']) is int and summary['dropped_events'] >= 0 and
                summary['attempted_events'] == summary['events'] + summary['dropped_events'], 'Loss count mismatch')
        require(measured <= header['stream_byte_cap'], 'File exceeds native cap')
        require(type(summary['valid']) is bool, 'Validity type mismatch')
        if summary['valid']:
            require(prefix_failure is None and gc is None, 'Valid footer with invalid replay: ' + str(prefix_failure))
            require(summary['errors'] == 0 and summary['dropped_events'] == 0 and not summary['aborted'], 'Invalid accepted footer')
            expected = (gross, peak, state.total, trimmed, reclaimed)
            require(tuple(summary[key] for key in METRICS) == expected, 'Derived summary mismatch')
            require((summary['gc_cycles'], summary['gc_moves'], summary['census_objects']) == (gcs, moves, census_count), 'GC counters mismatch')
            require(summary['heap_gc_count_stop'] - summary['heap_gc_count_start'] == gcs, 'Missing internal GC')
        else:
            require(summary['errors'] > 0 and all(summary[key] is None for key in METRICS), 'Invalid footer exposes metrics')
    return dict(path=str(path), sha256=digest.hexdigest(), bytes=measured, events=count, valid=summary['valid'],
                independentReplay='Pass' if summary['valid'] else 'Invalid window retained; numeric prefix unqualified',
                prefixFailure=prefix_failure, summary=summary, inspections=inspections, reusedBirthAddresses=reused_birth_addresses)


if __name__ == '__main__':
    print(json.dumps([audit(Path(path)) for path in sys.argv[1:]], indent=2))
