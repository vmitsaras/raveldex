#!/usr/bin/env python3
"""Independent stopped-prefix denominators/vectors/p50 audit, no parent imports."""
from pathlib import Path
from collections import Counter, defaultdict
import datetime, gzip, hashlib, json, math

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
RAW = Path('/private/tmp/raveldex-rx9006-20261105/recovery-full-01')
ANALYSIS = Path('/private/tmp/raveldex-rx9006-20261105/recovery-prefix-fresh/recovery-prefix.json')
def read(path):
    return json.loads(path.read_text())
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
def p50(values):
    assert values and all(math.isfinite(value) for value in values)
    return sorted(values)[math.ceil(len(values) / 2) - 1]
report, analysis = read(RAW / 'report.json'), read(ANALYSIS)
semantic = read(OUT / 'recovery-incomplete-replay.json')
assert semantic['reportSha256'] == sha(RAW / 'report.json') and semantic['fullAcceptance'] is False
assert semantic['completedDescriptorSemanticVerification'] == 'Pass'
assert gzip.decompress((ROOT / 'docs/evidence/RX-9006/analysis/recovery-prefix.json.gz').read_bytes()) == ANALYSIS.read_bytes()
assert analysis['status'] == 'Incomplete' and analysis['coverageStatus'] == 'Incomplete original frozen matrix'
assert analysis['performanceAcceptance'].startswith('Not established')
assert analysis['rawReportBinding']['sha256'] == sha(RAW / 'report.json')
assert analysis['actualCollectorFacts'] == {name: report.get(name) for name in analysis['actualCollectorFacts']}
assert analysis['inputIntegrity']['findings'] == [] and analysis['rejectedDescriptors'] == [] and analysis['unacceptedRawRows'] == []
assert analysis['denominators'] == {'expectedContexts': 204, 'collectedContexts': 146, 'interruptedContexts': 1, 'notCollectedContexts': 57,
                                     'rawDescriptorRecords': 146, 'rejectedDescriptorRecords': 0, 'unacceptedRawRows': 0}
prepared = read(RAW / 'prepared.json')
assert sha(RAW / 'prepared.json') == report['preparedSha256']
jobs = prepared['jobs']
assert len(jobs) == 204 and len(analysis['slots']) == 204
row_map, raw_inventory = {}, {item['file']: item for item in semantic['rawInventory']['files']}
for index, slot in enumerate(analysis['slots']):
    assert slot['job'] == jobs[index]
    assert slot['status'] == ('Collected' if index < 146 else 'Interrupted' if index == 146 else 'Not collected')
    if index < 146:
        run = report['runs'][index]
        assert slot['descriptor'] == run and slot['rowBinding']['sha256'] == run['sha256']
        row_map[index] = read(RAW / run['file'])
    else:
        assert not any(name in slot for name in ['attempts', 'wallMs', 'cpuUserMs', 'nativeOutcome', 'operations'])
lanes = {mode: {'collectedContexts': 0, 'productWindowRecords': 0, 'operationWindowAttempts': 0, 'actualNotRunProductOperations': 0,
                'outcomes': Counter(), 'operations': defaultdict(Counter)} for mode in ['normal', 'diagnostic']}
groups, startups, resources = {}, [], []
metric_fields = ['wallMs', 'invocationToReturnMs', 'returnToSettlementMs', 'cpuUserMs', 'cpuSystemMs', 'cpuTotalMs']
counter_fields = ['emittedSteps', 'emittedWorkUnits', 'hostYields', 'continuationsScheduled', 'deadlineCallbacks', 'maxStepWorkUnits']
dimensions = ['family', 'size', 'host', 'variant', 'role', 'deadline', 'mode', 'control']
refusal_codes, missing_dimensions = Counter(), Counter()
for index in range(146):
    row, job = row_map[index], jobs[index]
    operations = row['exercise']['samples'] if job['mode'] == 'normal' else row['exercise']['observations']
    lane = lanes[job['mode']]
    lane['collectedContexts'] += 1
    binding = analysis['slots'][index]['rowBinding']
    for operation in operations:
        lane['productWindowRecords'] += 1
        lane['operationWindowAttempts'] += operation['attempts']
        lane['actualNotRunProductOperations'] += operation['outcome'] == 'Not run'
        lane['outcomes'][operation['outcome']] += 1
        lane['operations'][operation['operation']][operation['outcome']] += 1
        if 'error' in operation:
            refusal_codes[(job['mode'], operation['operation'], operation['error'].get('code'))] += 1
        identity = {name: job[name] for name in dimensions}
        identity.update(operation=operation['operation'], outcome=operation['outcome'], actualDeadlineOptions=operation.get('deadlineOptions'))
        key = canonical(identity)
        if key not in groups:
            groups[key] = {'identity': identity, 'samples': []}
        sample = {'owner': job['owner'], 'contextIndex': index, 'jobKey': job['key'], 'sourceRow': binding, 'attempts': operation['attempts']}
        for name in metric_fields[:-1]:
            if name in operation:
                sample[name] = operation[name]
        if 'cpuUserMs' in operation and 'cpuSystemMs' in operation:
            sample['cpuTotalMs'] = operation['cpuUserMs'] + operation['cpuSystemMs']
        if 'error' in operation:
            sample['reportedError'] = operation['error']
        if 'reason' in operation:
            sample['reportedReason'] = operation['reason']
        if 'counters' in operation:
            sample['logicalCounters'] = {name: operation['counters'][name] for name in counter_fields if name in operation['counters'] and type(operation['counters'][name]) is int and operation['counters'][name] >= 0}
        groups[key]['samples'].append(sample)
        if 'processSamples' in operation:
            resources.append((index, operation['operation'], 'process', operation['processSamples']))
    startups.extend((index, startup) for startup in row['exercise']['startup'])
    if row['exercise'].get('resources'):
        resources.append((index, None, 'owned', row['exercise']['resources']))
assert lanes == analysis['lanes']
cells = {canonical({name: cell[name] for name in [*dimensions, 'operation', 'outcome', 'actualDeadlineOptions']}): cell for cell in analysis['operationCells']}
assert len(cells) == len(analysis['operationCells']) == len(groups) == 430 and set(cells) == set(groups)
vector_counts = Counter()
for key, group in groups.items():
    cell, samples = cells[key], group['samples']
    owners = sorted(set(sample['owner'] for sample in samples))
    assert cell['windowRecords'] == len(samples) and cell['operationWindowAttempts'] == sum(sample['attempts'] for sample in samples)
    assert cell['ownerNumbers'] == owners and cell['observedOwners'] == len(owners)
    assert cell['expectedOwnersForThisLane'] == (2 if cell['mode'] == 'normal' else 1)
    assert cell['perOwner'] == [{'owner': owner, 'samples': [sample for sample in samples if sample['owner'] == owner]} for owner in owners]
    expected_metrics = {}
    for name in metric_fields:
        values = [sample[name] for sample in samples if name in sample]
        if values:
            expected_metrics[name] = values
            actual = cell['metrics'][name]
            assert set(actual) == {'actualValues', 'observations', 'descriptiveP50', 'quantileRecipe'}
            assert actual['actualValues'] == values and actual['observations'] == len(values) and actual['descriptiveP50'] == p50(values)
            vector_counts['timingAndCpuVectors'] += 1
    assert set(cell['metrics']) == set(expected_metrics)
    expected_counters = {}
    for name in counter_fields:
        values = [sample['logicalCounters'][name] for sample in samples if name in sample.get('logicalCounters', {})]
        if values:
            expected_counters[name] = values
            actual = cell['logicalCounters'][name]
            assert set(actual) == {'actualValues', 'observations', 'descriptiveP50', 'quantileRecipe', 'scope'}
            assert actual['actualValues'] == values and actual['observations'] == len(values) and actual['descriptiveP50'] == p50(values)
            vector_counts['logicalCounterVectors'] += 1
    assert set(cell['logicalCounters']) == set(expected_counters)
    assert 'classification' not in cell and 'p95' not in cell and 'ratio' not in cell
assert len(startups) == len(analysis['startupObservations']) == 530
for (index, expected), actual in zip(startups, analysis['startupObservations']):
    assert actual['job'] == jobs[index] and actual['actualStartupObservation'] == expected
assert len(resources) == len(analysis['separateResourceObservations']) == 196
for (index, operation, resource_type, expected), actual in zip(resources, analysis['separateResourceObservations']):
    assert actual['job'] == jobs[index]
    assert actual['actualProcessSamples' if resource_type == 'process' else 'actualOwnedResourceObservations'] == expected
    if resource_type == 'process':
        assert actual['operation'] == operation
for binding in analysis['inputIntegrity']['files']:
    path = Path(binding['path'])
    if path.parent == RAW:
        meta = raw_inventory[path.name]
        assert binding['bytes'] == meta['bytes'] and binding['sha256'] == meta['sha256']
    else:
        assert path.stat().st_size == binding['bytes'] and sha(path) == binding['sha256']
for job in jobs[146:]:
    missing_dimensions[(job['mode'], job['control'])] += 1
assert lanes['normal']['collectedContexts'] == 120 and lanes['diagnostic']['collectedContexts'] == 26
assert lanes['normal']['outcomes'] == {'Pass': 320, 'Refused': 128, 'Cancelled': 104, 'Not run': 48}
assert lanes['diagnostic']['outcomes'] == {'Pass': 72, 'Refused': 28, 'Cancelled': 24, 'Not run': 6}
assert sum(lane['operationWindowAttempts'] for lane in lanes.values()) == 676
assert analysis['actualFailedContextArtifact']['nativeOutcome'] is None
result = {'kind': 'rx9006-independent-recovery-prefix-statistics-v1', 'status': 'Pass for completed-prefix accounting; collection remains INCOMPLETE',
          'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'fullAcceptance': False,
          'coverage': analysis['denominators'], 'lanes': analysis['lanes'], 'operationCells': len(cells), 'vectors': dict(vector_counts),
          'actualStartupObservations': len(startups), 'actualSeparateResourceObservations': len(resources),
          'missingDimensions': [{'mode': mode, 'control': control, 'contexts': count} for (mode, control), count in missing_dimensions.items()],
          'observedErrorCodes': [{'mode': mode, 'operation': operation, 'code': code, 'rows': count} for (mode, operation, code), count in refusal_codes.items()],
          'orchestrationInterruption': {'index': 146, 'nativeOutcome': None, 'notAProductNotRun': True},
          'pins': [{'path': str(path), 'sha256': sha(path)} for path in [Path(__file__).resolve(), RAW / 'report.json', RAW / 'prepared.json', ANALYSIS, OUT / 'recovery-incomplete-replay.json']],
          'limitations': ['Only committed descriptor observations enter vectors;58 missing completed contexts acquire no invented attempt, timing, CPU or native outcome',
                         '54 actual dependent product Not-run rows have zero attempts, distinct from1 interrupted/57 uncollected matrix slots',
                         'P50 is outcome/lane/host/provider/deadline/role specific nearest rank, even-n lower middle; no recovery p95/speed ratio/classification or full204 acceptance',
                         'Logical counters, startup/resource observations and process memory samples retain separate scopes and prove no exclusive CPU/retained/peak/browser heap or physical response']}
(OUT / 'recovery-prefix-statistics.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ['pins', 'lanes', 'observedErrorCodes']}, indent=2))
