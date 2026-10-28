#!/usr/bin/env python3
"""Independent, offline audit of the finite Raveldex managed-block trace.

Uses a sorted list of half-open intervals, not the native map implementation.
Never launches a runtime, compiles code, attaches to a process, or reads payloads.
The reference patch describes logical allocation extents under changed flags;
neither a consistent ledger nor these tests establishes allocator coverage.
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import unittest


U64 = (1 << 64) - 1
U32 = (1 << 32) - 1
REFERENCE_PATCH = "46565b1129e860ff0f3a2c52d9c5bc04776855edef8f989650bd7242ef4652e9"
MEASUREMENTS = (
    "gross_birth_bytes", "monitored_non_filler_bytes_at_stop",
    "monitored_non_filler_high_water_bytes", "filler_or_reclaimable_excluded_bytes",
)
KINDS = {
    "birth", "move", "size_change", "size_update", "mark", "inspect_object",
    "inspect_elements", "gc_prologue", "gc_epilogue",
}


class AuditError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise AuditError(message)


def integer(value, name, maximum=U64):
    require(type(value) is int and 0 <= value <= maximum, "Invalid integer: " + name)
    return value


def address(value):
    require(isinstance(value, str) and value.startswith("0x"), "Invalid address spelling")
    digits = value[2:]
    require(bool(digits) and all(c in "0123456789abcdef" for c in digits), "Invalid hex address")
    result = int(digits, 16)
    require(result <= U64, "Address exceeds 64 bits")
    return result


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON member: " + key)
        result[key] = value
    return result


def parse_text(text):
    rows = []
    for number, line in enumerate(text.splitlines(), 1):
        require(line and len(line) <= 16384, "Empty/oversized JSONL line " + str(number))
        try:
            row = json.loads(line, object_pairs_hook=unique_object)
        except (ValueError, TypeError) as exc:
            raise AuditError("JSONL line {}: {}".format(number, exc))
        require(isinstance(row, dict), "JSONL record is not an object")
        rows.append(row)
    return audit_rows(rows)


class IntervalReplay:
    """Nonmerging interval list: adjoining births keep their distinct bounds."""

    def __init__(self):
        self.live = []
        self.births = []
        self.gross = self.current = self.peak = self.excluded = self.unknown = 0
        self.errors = []
        self.inspections = []

    def problem(self, seq, reason):
        self.errors.append({"seq": seq, "reason": reason})

    def span(self, seq, start, size):
        if start == 0 or size == 0 or size > U64 - start:
            self.problem(seq, "invalid_extent")
            return None
        return (start, start + size)

    def containing(self, seq, span, reason):
        overlapping = [(lo, hi) for lo, hi in self.live if lo < span[1] and span[0] < hi]
        if not overlapping:
            self.unknown += 1
            return None
        if len(overlapping) != 1 or not (
            overlapping[0][0] <= span[0] and span[1] <= overlapping[0][1]
        ):
            self.problem(seq, reason)
            return None
        return overlapping[0]

    def cut(self, owner, start, end):
        self.live.remove(owner)
        if owner[0] < start:
            self.live.append((owner[0], start))
        if end < owner[1]:
            self.live.append((end, owner[1]))
        self.live.sort()
        self.current -= end - start
        self.excluded += end - start

    def event(self, e):
        seq, kind = e["seq"], e["kind"]
        start, to = address(e["address"]), address(e["to"])
        size, old = e["bytes"], e["old_bytes"]
        if kind == "birth":
            span = self.span(seq, start, size)
            if span is None:
                return
            if any(lo < span[1] and span[0] < hi for lo, hi, _ in self.births):
                self.problem(seq, "birth_overlap_or_address_reuse")
                return
            if size > U64 - self.gross or size > U64 - self.current:
                self.problem(seq, "byte_counter_overflow")
                return
            self.births.append((span[0], span[1], seq))
            self.live.append(span)
            self.live.sort()
            self.gross += size
            self.current += size
            self.peak = max(self.peak, self.current)
        elif kind == "size_change":
            span = self.span(seq, start, old)
            if span is None:
                return
            if size == 0 or size > old:
                self.problem(seq, "invalid_size_change")
                return
            owner = self.containing(seq, span, "size_change_partial_or_unknown_overlap")
            if owner is not None and size < old:
                self.cut(owner, start + size, span[1])
        elif kind == "move":
            if to <= start or size == 0 or size > U64 - (to - start):
                self.problem(seq, "unsupported_non_gc_move")
                return
            span = self.span(seq, start, size + to - start)
            if span is None:
                return
            owner = self.containing(seq, span, "move_partial_or_unknown_overlap")
            if owner is not None:
                self.cut(owner, start, to)
        elif kind in {"size_update", "inspect_object", "inspect_elements"}:
            item = {"seq": seq, "kind": kind, "marker": e["marker"],
                    "address": e["address"], "bytes": size}
            if start == 0:
                if kind.startswith("inspect_"):
                    item["coverage"] = "non_heap_value"
                    self.inspections.append(item)
                return
            span = self.span(seq, start, size)
            errors_before = len(self.errors)
            owner = self.containing(seq, span, "observed_partial_or_unknown_overlap") if span else None
            if kind.startswith("inspect_"):
                if len(self.errors) != errors_before or span is None:
                    item["coverage"] = "invalid_extent"
                elif owner is None:
                    item["coverage"] = "preexisting_or_unmonitored"
                else:
                    item["coverage"] = "contained_at_this_event"
                    item["current_ledger_extent"] = [hex(owner[0]), hex(owner[1])]
                    matches = [(lo, hi, birth_seq) for lo, hi, birth_seq in self.births
                               if lo <= span[0] and span[1] <= hi]
                    require(len(matches) == 1, "Covered inspection lacks one captured birth block")
                    lo, hi, birth_seq = matches[0]
                    item["birth_block"] = {"seq": birth_seq, "begin": hex(lo), "end": hex(hi)}
                    item["one_birth_is_one_object"] = False
                self.inspections.append(item)
        require(self.current == sum(hi - lo for lo, hi in self.live), "Independent interval sum drift")


def audit_rows(rows):
    require(len(rows) >= 2, "Missing trace header/footer")
    header, footer = rows[0], rows[-1]
    require(header.get("record") == "header", "First record is not header")
    require(footer.get("record") == "summary", "Last record is not summary")
    require(header.get("schema") == "raveldex-managed-block-trace-v1", "Unexpected schema")
    require(header.get("mode") == footer.get("mode") == "no-inline-new-main-thread-blocks", "Unexpected mode")
    capacity = integer(header.get("capacity"), "capacity", 1000000)
    require(capacity > 0, "Zero event capacity")
    for field in ("inline_new", "turbo_allocation_folding", "includes_preexisting_objects",
                  "gc_deaths_tracked", "physical_or_committed_memory"):
        require(header.get(field) is False, "Unexpected header capability: " + field)
    record_bytes = integer(header.get("event_record_bytes"), "event_record_bytes")
    require(record_bytes == 56, "Unexpected native record size for reviewed 64-bit struct")
    buffer_bytes = integer(header.get("event_buffer_bytes"), "event_buffer_bytes")
    require(buffer_bytes == record_bytes * capacity, "Buffer byte capacity mismatch")
    events = rows[1:-1]
    require(len(events) <= capacity, "Stored count exceeds capacity")
    diagnostic_gross, diagnostic_overflows = 0, 0
    diagnostic_error_sequences = []
    raw_gc = {"gc_prologue": 0, "gc_epilogue": 0}
    for ordinal, event in enumerate(events, 1):
        require(event.get("record") == "event", "Non-event between header and footer")
        require(event.get("seq") == ordinal and type(event.get("seq")) is int, "Noncontiguous event sequence")
        kind = event.get("kind")
        require(kind in KINDS, "Unknown event kind")
        a, t = address(event.get("address")), address(event.get("to"))
        size = integer(event.get("bytes"), "event bytes")
        old = integer(event.get("old_bytes"), "event old_bytes")
        integer(event.get("marker"), "event marker", U32)
        if kind == "move":
            require(old == 0 and event["marker"] == 0, "Malformed move metadata")
        else:
            require(t == 0, "Unexpected destination address")
        if kind in {"birth", "size_update"}:
            require(a != 0 and old == 0 and event["marker"] == 0, "Malformed allocation/update metadata")
        if kind == "size_change":
            require(event["marker"] == 0, "Malformed size-change marker")
        if kind.startswith("inspect_"):
            require(old == 0 and (a != 0 or size == 0), "Malformed inspection metadata")
        if kind == "mark":
            require(a == 0 and size == old == 0, "Malformed operation marker")
        if kind in raw_gc:
            require(a == 0 and size == 0, "Malformed GC marker")
            raw_gc[kind] += 1
        if kind == "birth":
            if size > U64 - diagnostic_gross:
                diagnostic_overflows += 1
                diagnostic_error_sequences.append(ordinal)
            else:
                diagnostic_gross += size
    for field in ("events", "attempted_events", "dropped_events", "gc_prologues", "gc_epilogues",
                  "heap_gc_count_start", "heap_gc_count_stop", "ledger_errors", "recorded_gross_birth_bytes",
                  "preexisting_or_unmonitored_events"):
        integer(footer.get(field), field)
    dropped = footer["dropped_events"]
    require(footer["events"] == len(events), "Footer stored-event count mismatch")
    require(footer["attempted_events"] == len(events) + dropped, "Footer attempted-event count mismatch")
    require(dropped == 0 or len(events) == capacity, "Drop before buffer became full")
    require(footer["recorded_gross_birth_bytes"] == diagnostic_gross, "Diagnostic birth sum mismatch")
    for kind, field in (("gc_prologue", "gc_prologues"), ("gc_epilogue", "gc_epilogues")):
        require(raw_gc[kind] <= footer[field], "Raw GC count exceeds footer counter")
        require(dropped != 0 or raw_gc[kind] == footer[field], "GC counter mismatch without dropped records")
    no_gc = (footer["gc_prologues"] == footer["gc_epilogues"] == 0 and
             footer["heap_gc_count_start"] == footer["heap_gc_count_stop"])
    replayed = no_gc and dropped == 0
    require(footer.get("ledger_replayed") is replayed, "Native replay guard mismatch")
    require(type(footer.get("aborted")) is bool, "Invalid abort flag")
    require(footer.get("coverage_calibrated_by_runtime") is False, "Runtime falsely self-certifies coverage")
    replay = IntervalReplay()
    if replayed:
        for event in events:
            replay.event(event)
    error_count = diagnostic_overflows + len(replay.errors)
    require(footer["ledger_errors"] == error_count, "Native/independent ledger error count differs")
    require(isinstance(footer.get("first_ledger_error"), str), "Missing first ledger error")
    require((footer["first_ledger_error"] == "none") == (error_count == 0), "First-error state mismatch")
    first_candidates = [(seq, 0, "recorded_birth_counter_overflow")
                        for seq in diagnostic_error_sequences]
    first_candidates.extend((error["seq"], 1, error["reason"]) for error in replay.errors)
    if first_candidates:
        require(footer["first_ledger_error"] == min(first_candidates)[2], "Native first ledger error differs")
    require(footer["preexisting_or_unmonitored_events"] == replay.unknown, "Unknown/preexisting event count mismatch")
    valid = not footer["aborted"] and replayed and error_count == 0
    require(footer.get("valid_no_gc_window") is valid, "Native validity disagrees with independent guards")
    expected = dict(zip(MEASUREMENTS, (replay.gross, replay.current, replay.peak, replay.excluded)))
    for name, value in expected.items():
        if valid:
            require(type(footer.get(name)) is int and footer[name] == value, "Native measurement mismatch: " + name)
        else:
            require(footer.get(name, "missing") is None, "Invalid window exposes derived measurement: " + name)
    reasons = []
    if not no_gc:
        reasons.append("gc_callback_or_heap_gc_counter_changed")
    if dropped:
        reasons.append("event_buffer_dropped_records")
    if footer["aborted"]:
        reasons.append("abandoned_or_aborted_capture")
    reasons.extend(error["reason"] for error in replay.errors)
    if diagnostic_overflows:
        reasons.append("recorded_birth_counter_overflow")
    return {
        "artifact_consistent": True, "measurement_valid": valid,
        "independent_replay_performed": replayed, "guard_reasons": reasons,
        "recorded_events": len(events), "attempted_events": footer["attempted_events"],
        "derived": expected if valid else None,
        "preexisting_or_unmonitored_events": replay.unknown,
        "direct_inspections": replay.inspections,
        "scope": "Captured main-thread logical block extents excluding reported filler/reclaimable tails; includes unreachable objects until GC; no preexisting reconstruction, physical memory, death, ordinary-runtime peak, or universal coverage claim.",
        "coverage_established_by_this_audit": False,
    }


def fixture(events, gross=0, live=0, peak=0, excluded=0, unknown=0,
            capacity=64, dropped=0, gc=0, aborted=False, errors=0,
            first_error="none", gc_counter_changed=False):
    """Literal expected measurements are supplied by each test, not replay."""
    header = {"record": "header", "schema": "raveldex-managed-block-trace-v1",
              "mode": "no-inline-new-main-thread-blocks", "capacity": capacity,
              "inline_new": False, "turbo_allocation_folding": False,
              "event_record_bytes": 56, "event_buffer_bytes": 56 * capacity,
              "includes_preexisting_objects": False, "gc_deaths_tracked": False,
              "physical_or_committed_memory": False}
    replayed = not gc and not gc_counter_changed and not dropped
    valid = replayed and not aborted and not errors
    footer = {"record": "summary", "mode": header["mode"], "valid_no_gc_window": valid,
              "aborted": aborted, "events": len(events), "attempted_events": len(events) + dropped,
              "dropped_events": dropped, "gc_prologues": gc, "gc_epilogues": gc,
              "heap_gc_count_start": 4, "heap_gc_count_stop": 5 if gc_counter_changed else 4,
              "ledger_replayed": replayed, "ledger_errors": errors,
              "first_ledger_error": first_error, "recorded_gross_birth_bytes": gross,
              "preexisting_or_unmonitored_events": unknown,
              "coverage_calibrated_by_runtime": False}
    for name, number in zip(MEASUREMENTS, (gross, live, peak, excluded)):
        footer[name] = number if valid else None
    return [header] + [dict(e, seq=i) for i, e in enumerate(events, 1)] + [footer]


def event(kind, start=0, size=0, old=0, to=0, marker=0):
    return {"record": "event", "kind": kind, "address": hex(start), "to": hex(to),
            "bytes": size, "old_bytes": old, "marker": marker}


class LiteralTests(unittest.TestCase):
    def test_empty(self):
        self.assertTrue(audit_rows(fixture([]))["measurement_valid"])

    def test_two_births(self):
        r = audit_rows(fixture([event("birth", 1000, 64), event("birth", 2000, 80)], 144, 144, 144))
        self.assertEqual(r["derived"][MEASUREMENTS[2]], 144)

    def test_coallocation_interior_trim_and_direct_binding(self):
        r = audit_rows(fixture([event("birth", 1000, 160),
            event("inspect_object", 1000, 32, marker=1),
            event("inspect_elements", 1032, 128, marker=1),
            event("size_change", 1032, 32, old=128),
            event("size_update", 1032, 32),
            event("inspect_elements", 1032, 32, marker=2)], 160, 64, 160, 96))
        self.assertEqual(r["direct_inspections"][-1]["current_ledger_extent"], [hex(1000), hex(1064)])
        self.assertEqual(r["direct_inspections"][-1]["birth_block"]["seq"], 1)
        self.assertFalse(r["direct_inspections"][-1]["one_birth_is_one_object"])

    def test_left_trim_then_new_birth(self):
        r = audit_rows(fixture([event("birth", 4096, 80), event("move", 4096, 64, to=4112),
                               event("birth", 8192, 32)], 112, 96, 96, 16))
        self.assertEqual(r["derived"][MEASUREMENTS[1]], 96)

    def test_preexisting_not_guessed(self):
        r = audit_rows(fixture([event("inspect_object", 9000, 24), event("birth", 1000, 32),
                               event("size_change", 9000, 32, old=64)], 32, 32, 32, unknown=2))
        self.assertNotIn("birth_block", r["direct_inspections"][0])

    def test_gc_positive_invalidates(self):
        r = audit_rows(fixture([event("birth", 1000, 32), event("gc_prologue", marker=4),
                               event("gc_epilogue", marker=4)], 32, gc=1, gc_counter_changed=True))
        self.assertFalse(r["measurement_valid"])
        self.assertIsNone(r["derived"])

    def test_counter_only_gc_invalidates(self):
        self.assertFalse(audit_rows(fixture([], gc_counter_changed=True))["measurement_valid"])

    def test_drop_invalidates_prefix(self):
        r = audit_rows(fixture([event("birth", 1000, 32)], 32, capacity=1, dropped=3))
        self.assertFalse(r["independent_replay_performed"])

    def test_aborted_nulls_derived(self):
        self.assertIsNone(audit_rows(fixture([event("birth", 1000, 32)], 32, aborted=True))["derived"])

    def test_reuse_of_excluded_tail_invalidates(self):
        r = audit_rows(fixture([event("birth", 1000, 128), event("size_change", 1000, 64, old=128),
                               event("birth", 1064, 32)], 160, errors=1, first_error="birth_overlap_or_address_reuse"))
        self.assertIn("birth_overlap_or_address_reuse", r["guard_reasons"])

    def test_partial_overlap_invalidates(self):
        r = audit_rows(fixture([event("birth", 1000, 32), event("size_change", 1016, 16, old=32)],
                               32, errors=1, first_error="size_change_partial_or_unknown_overlap"))
        self.assertFalse(r["measurement_valid"])

    def test_adjoining_births_are_not_merged(self):
        r = audit_rows(fixture([event("birth", 1000, 32), event("birth", 1032, 32),
                               event("inspect_object", 1016, 32)], 64, errors=1,
                               first_error="observed_partial_or_unknown_overlap"))
        self.assertFalse(r["measurement_valid"])

    def test_nonforward_move_invalidates(self):
        r = audit_rows(fixture([event("birth", 1000, 64), event("move", 1000, 64, to=992)],
                               64, errors=1, first_error="unsupported_non_gc_move"))
        self.assertFalse(r["measurement_valid"])

    def test_extent_overflow_invalidates(self):
        r = audit_rows(fixture([event("birth", U64 - 7, 16)], 16, errors=1, first_error="invalid_extent"))
        self.assertFalse(r["measurement_valid"])

    def test_tampered_high_water_is_rejected(self):
        rows = fixture([event("birth", 1000, 64)], 64, 64, 64)
        rows[-1][MEASUREMENTS[2]] = 63
        with self.assertRaises(AuditError):
            audit_rows(rows)

    def test_sequence_gap_is_rejected(self):
        rows = fixture([event("mark")])
        rows[1]["seq"] = 2
        with self.assertRaises(AuditError):
            audit_rows(rows)

    def test_invalid_window_numeric_measurement_is_rejected(self):
        rows = fixture([], aborted=True)
        rows[-1][MEASUREMENTS[0]] = 0
        with self.assertRaises(AuditError):
            audit_rows(rows)

    def test_missing_footer_is_rejected(self):
        with self.assertRaises(AuditError):
            audit_rows(fixture([])[:-1])

    def test_duplicate_json_members_are_rejected(self):
        with self.assertRaises(AuditError):
            parse_text('{"record":"header","record":"summary"}\n')

    def test_gc_footer_cannot_hide_raw_event(self):
        rows = fixture([event("gc_prologue", marker=4), event("gc_epilogue", marker=4)], gc=1)
        rows[-1]["gc_prologues"] = rows[-1]["gc_epilogues"] = 0
        with self.assertRaises(AuditError):
            audit_rows(rows)

    def test_first_error_text_is_verified(self):
        rows = fixture([event("birth", 1000, 32), event("birth", 1016, 32)],
                       64, errors=1, first_error="unrelated_error")
        with self.assertRaises(AuditError):
            audit_rows(rows)

    def test_buffer_header_cannot_claim_a_different_record_layout(self):
        rows = fixture([])
        rows[0]["event_record_bytes"] = 48
        rows[0]["event_buffer_bytes"] = 48 * rows[0]["capacity"]
        with self.assertRaises(AuditError):
            audit_rows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("traces", nargs="*", type=Path)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--output", type=Path, help="NEW audit JSON path; exclusive creation")
    args = parser.parse_args()
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(LiteralTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        if not result.wasSuccessful():
            return 1
    if not args.traces:
        require(args.self_test and args.output is None, "Supply traces, or --self-test without --output")
        return 0
    audited = []
    for path in args.traces:
        require(path.stat().st_size <= 512 * 1024 * 1024, "Trace exceeds audit input bound")
        raw = path.read_bytes()
        result = parse_text(raw.decode("utf-8", errors="strict"))
        audited.append({"path": str(path.resolve()), "bytes": len(raw),
                        "sha256": hashlib.sha256(raw).hexdigest(), **result})
    output = {"schema": "raveldex-independent-managed-trace-audit-v1",
              "reviewed_semantics_patch_sha256": REFERENCE_PATCH,
              "audit_source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "traces": audited, "coverage_or_product_qualification": False}
    rendered = json.dumps(output, indent=2) + "\n"
    if args.output:
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(rendered)
    else:
        sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AuditError, OSError, UnicodeError) as exc:
        print("AUDIT FAIL: " + str(exc), file=sys.stderr)
        sys.exit(1)
