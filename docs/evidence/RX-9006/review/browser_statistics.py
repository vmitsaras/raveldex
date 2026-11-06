#!/usr/bin/env python3
"""Independent raw ordinary-vector reconstruction; no parent helper execution."""
from pathlib import Path
from collections import Counter, defaultdict
import csv, datetime, hashlib, json, math

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
A = ROOT / 'docs/evidence/RX-9006/analysis'
B = Path('/private/tmp/raveldex-rx9006-20261105/browser-full-01')
T = Path('/private/tmp/raveldex-rx9006-20261105/transport-diagnostic-01')
def read(path):
    return json.loads(path.read_text())
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def csv_rows(path):
    with path.open() as source:
        return list(csv.DictReader(source))
def quantile(values, p=.5):
    return sorted(values)[math.ceil(p * len(values)) - 1]
def metric(samples, name):
    values = [sample[name] for sample in samples if sample['outcome'] == 'Pass']
    assert values and all(math.isfinite(value) and value >= 0 for value in values)
    return {'successSamples': len(values), 'p50': quantile(values), 'p95': quantile(values, .95) if len(values) >= 100 else None, 'maximum': max(values)}
def close(actual, expected):
    if expected is None:
        assert actual == '' or actual is None
    else:
        assert actual != '' and actual is not None
        assert math.isfinite(float(actual)) and abs(float(actual) - expected) <= max(1e-10, abs(expected) * 1e-12), (actual, expected)
fields = ['role', 'size', 'channel', 'deadline', 'query', 'phase']
metrics = ['wallMs', 'invocationReturnMs', 'returnSettlementMs']
report = read(B / 'report.json')
assert report['outcome'] == 'Collected' and report['guards'] == 'Pass' and report['profile'] == 'full'
groups = defaultdict(list)
counts = Counter()
for run in report['runs']:
    row = read(B / run['output'])
    if row['mode'] == 'diagnostic':
        counts['excludedDiagnosticCalls'] += len(row['case']['observations'])
        continue
    counts['excludedWarmups'] += len(row['case']['warmups'])
    for sample in row['case']['samples']:
        key = (row['role'], row['size'], row['channel'], row['deadline'], sample['query'], sample['phase'])
        groups[key].append({**sample, 'owner': row['owner']})
        counts['ordinaryCalls'] += 1
cells = {}
for key, samples in groups.items():
    owners = sorted(set(sample['owner'] for sample in samples))
    assert owners == [0, 1, 2]
    expected_attempts = 120 if key[1] == 1000 else 3
    assert len(samples) == expected_attempts
    cells[key] = {**dict(zip(fields, key)), 'attempts': len(samples), 'outcomes': dict(Counter(sample['outcome'] for sample in samples)),
                  'metrics': {name: metric(samples, name) for name in metrics},
                  'owners': [{'owner': owner, 'metrics': {name: metric([sample for sample in samples if sample['owner'] == owner], name) for name in metrics}} for owner in owners]}
parent_cells = read(A / 'browser-cells.json')
assert len(parent_cells) == len(cells) == 144
assert {tuple(cell[field] for field in fields): cell for cell in parent_cells} == cells
counts['pooledMetricVectors'] = len(cells) * 3
counts['ownerMetricVectors'] = len(cells) * 3 * 3
counts['eligibleWallP95Cells'] = sum(cell['metrics']['wallMs']['p95'] is not None for cell in cells.values())
counts['eligibleAllMetricP95Scalars'] = sum(value['p95'] is not None for cell in cells.values() for value in cell['metrics'].values())
expected_comparisons = {}
for key, after in cells.items():
    if key[0] != 'current':
        continue
    for before_role in ['preN9', 'acceptedN9']:
        before = cells[(before_role, *key[1:])]
        for name in metrics:
            old, new = before['metrics'][name], after['metrics'][name]
            x = [owner['metrics'][name]['p50'] for owner in before['owners']]
            y = [owner['metrics'][name]['p50'] for owner in after['owners']]
            if before['outcomes'] != {'Pass': before['attempts']} or after['outcomes'] != {'Pass': after['attempts']}:
                classification = 'Outcome transition / no matched-success latency classification'
            elif min(x + y) <= 0:
                classification = 'Inconclusive: timer floor'
            elif max(y) < min(x):
                classification = 'Observed faster'
            elif min(y) > max(x):
                classification = 'Observed slower'
            else:
                classification = 'Overlapping / inconclusive'
            identity = (before_role + '→current', *key[1:], name)
            expected_comparisons[identity] = {'classification': classification,
                'beforeAttempts': before['attempts'], 'afterAttempts': after['attempts'], 'beforeSuccesses': old['successSamples'], 'afterSuccesses': new['successSamples'],
                'beforeP50': old['p50'], 'afterP50': new['p50'], 'absoluteChange': new['p50'] - old['p50'],
                'percentChange': (new['p50'] - old['p50']) / old['p50'] * 100 if old['p50'] > 0 else None,
                'beforeOwnerMedianMinimum': min(x), 'beforeOwnerMedianMaximum': max(x), 'afterOwnerMedianMinimum': min(y), 'afterOwnerMedianMaximum': max(y)}
def comparison_key(row):
    return (row['comparison'], int(row['size']), row['channel'], row['deadline'], row['query'], row['phase'], row['metric'])
raw_rows = csv_rows(A / 'browser-comparisons.csv')
assert len(raw_rows) == len(expected_comparisons) == 288
raw = {comparison_key(row): row for row in raw_rows}
assert len(raw) == len(raw_rows) and set(raw) == set(expected_comparisons)
raw_counts, positive_changes, positive_absolute_changes, floor_ratios = defaultdict(Counter), Counter(), Counter(), []
for key, expected in expected_comparisons.items():
    actual = raw[key]
    assert actual['classification'] == expected['classification']
    for name, value in expected.items():
        if name != 'classification':
            close(actual[name], value)
    assert actual['scope'] == ('Equal-runtime method control; no new optimization' if key[0] == 'acceptedN9→current' else 'Observed three-owner ranges; not a confidence interval/population guarantee')
    raw_counts[(key[0], key[-1])][expected['classification']] += 1
    if expected['percentChange'] is not None and expected['percentChange'] > 0:
        positive_changes[(key[0], key[-1])] += 1
    if expected['absoluteChange'] > 0:
        positive_absolute_changes[(key[0], key[-1])] += 1
    if expected['classification'] == 'Inconclusive: timer floor' and actual['percentChange'] != '':
        floor_ratios.append(key)
transport = read(T / 'report.json')
assert transport['outcome'] == 'Collected' and transport['guards'] == 'Pass'
observed_ticks, main_observations, worker_observations = [], [], []
for run in transport['runs']:
    row = read(T / run['output'])
    for configuration in row['configurations']:
        data = configuration['data']
        for phase in ['clockBefore', 'clockAfter']:
            clock = data[phase]
            actual_min = min(item['deltaMs'] for item in clock['positiveDeltas'])
            assert actual_min == clock['minimumObservedPositiveDeltaMs'] and clock['negativeDeltas'] == [] and clock['crossOriginIsolated'] is False
            observed_ticks.append(actual_min)
            main_observations.append({'role': row['role'], 'deadline': row['deadline'], 'configuration': configuration['configuration'], 'phase': phase,
                                      'minimumObservedPositiveDeltaMs': actual_min, 'crossOriginIsolated': False, 'positiveTicks': len(clock['positiveDeltas']), 'zeroDeltas': clock['zeroDeltas'], 'negativeDeltas': 0})
        for worker in data['workers']:
            for phase in ['clockAtStartup', 'clockAtDump']:
                clock = worker['server'][phase]
                worker_observations.append({'role': row['role'], 'deadline': row['deadline'], 'configuration': configuration['configuration'], 'owner': worker['role'], 'phase': phase,
                                             'minimumObservedPositiveDeltaMs': min(item['deltaMs'] for item in clock['positiveDeltas']), 'crossOriginIsolated': clock['crossOriginIsolated'],
                                             'positiveTicks': len(clock['positiveDeltas']), 'zeroDeltas': clock['zeroDeltas'], 'negativeDeltas': len(clock['negativeDeltas'])})
quantum, tolerance = max(observed_ticks), 1e-6
qualification = read(A / 'clock-qualification.json')
assert qualification['mainClockObservations'] == main_observations and qualification['workerClockObservations'] == worker_observations
assert qualification['conservativeObservedMainQuantumMs'] == quantum and qualification['numericalToleranceMs'] == tolerance
qualified_rows = csv_rows(A / 'browser-comparisons-qualified.csv')
assert len(qualified_rows) == 288
qualified = {comparison_key(row): row for row in qualified_rows}
assert len(qualified) == len(qualified_rows) and set(qualified) == set(raw)
transition_counts, qualified_counts, changed = Counter(), defaultdict(Counter), []
for key, row in qualified.items():
    original = raw[key]
    assert all(row[name] == value for name, value in original.items()), 'qualification rewrote original metrics/classifications'
    expected = expected_comparisons[key]
    at_floor = min(expected['beforeOwnerMedianMinimum'], expected['afterOwnerMedianMinimum']) <= quantum + tolerance
    decision = 'Inconclusive: at observed main-clock quantum' if at_floor else expected['classification']
    assert row['frozenClassification'] == expected['classification'] and row['qualifiedDecision'] == decision
    close(row['observedMainQuantumMs'], quantum)
    close(row['numericalRoundingToleranceMs'], tolerance)
    qualified_counts[(key[0], key[-1])][decision] += 1
    if decision != expected['classification']:
        transition_counts[(expected['classification'], decision)] += 1
        changed.append(row)
assert qualification['comparisons'] == 288 and qualification['changedLabels'] == len(changed) == 122
expected_changed_cells = []
for row in qualified_rows:
    if row['qualifiedDecision'] != row['frozenClassification']:
        projected = dict(row)
        for field in ['observedMainQuantumMs', 'numericalRoundingToleranceMs']:
            projected[field] = float(projected[field])
        expected_changed_cells.append(projected)
assert qualification['changedCells'] == expected_changed_cells
def count_projection(counts):
    return {role: {name: dict(counts[(role, name)]) for name in metrics} for role in ['preN9→current', 'acceptedN9→current']}
assert qualification['qualifiedClassifications'] == count_projection(qualified_counts)
summary = read(A / 'summary-browser-only.json')
assert summary['browserClassifications'] == count_projection(raw_counts)
assert summary['counts']['browser'] == {'contexts': 96, 'normalContexts': 72, 'normalCalls': 6048, 'diagnosticCalls': 96, 'excludedWarmups': 288, 'cells': 144, 'comparisons': 288, 'p95EligibleWallCells': 48}
assert summary['rawReports']['browser']['sha256'] == sha(B / 'report.json')
assert summary['rawReports']['browser']['elapsedMs'] == report['elapsedMs']
assert not any(row['classification'] == 'Observed slower' for row in raw_rows)
assert not (A / 'browser-adverse.csv').exists(), 'unexpected stale adverse table'
positive_inventory = csv_rows(A / 'browser-positive-median-changes.csv')
assert positive_inventory == [row for row in raw_rows if row['absoluteChange'] != '' and float(row['absoluteChange']) > 0]
assert len(positive_inventory) == 49 and all(row['comparison'] == 'acceptedN9→current' for row in positive_inventory)
assert sum(row['percentChange'] == '' for row in positive_inventory) == 5
correction = read(A / 'scope-wording-correction.json')
assert correction['allRawComparisonsUnchanged'] is True
assert correction['beforeRawComparisonsSha256'] == correction['afterRawComparisonsSha256'] == sha(A / 'browser-comparisons.csv')
plan_path = ROOT / 'docs/evidence/RX-9006/clock-qualification-plan.json'
plan = read(plan_path)
assert plan['recordedBeforeFullRunAcceptance'] is True and '0.000001ms' in plan['qualification']
assert report['startedAt'] < plan['recordedAt'] < report['finishedAt'] < transport['collectionStartedAt']
assert qualification['bindings'][str(T / 'report.json')] == sha(T / 'report.json')
assert qualification['bindings']['browser-comparisons.csv'] == sha(A / 'browser-comparisons.csv')
assert qualification['bindings']['clock-qualification-plan.json'] == sha(plan_path)
result = {'kind': 'rx9006-independent-browser-statistics-qualification-v1', 'status': 'Pass for numerical reconstruction; narrative corrections recorded',
          'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'counts': dict(counts), 'cells': 144, 'rawComparisons': 288, 'qualifiedComparisons': 288,
          'rawClassifications': count_projection(raw_counts), 'qualifiedClassifications': count_projection(qualified_counts), 'observedMainQuantumMs': quantum, 'roundingToleranceMs': tolerance,
          'classificationTransitions': [{'frozen': before, 'qualified': after, 'labels': count} for (before, after), count in transition_counts.items()],
          'positivePooledMedianChangesRetained': [{'comparison': role, 'metric': name, 'cells': count} for (role, name), count in positive_changes.items()],
          'positiveAbsolutePooledMedianChangesRetained': [{'comparison': role, 'metric': name, 'cells': count} for (role, name), count in positive_absolute_changes.items()],
          'rawFloorClassifiedRowsWithArithmeticRatios': len(floor_ratios),
          'narrativeFindingsResolved': {'record': str(A / 'scope-wording-correction.json'), 'sha256': sha(A / 'scope-wording-correction.json'),
                                      'allRawComparisonsUnchanged': True, 'positiveAbsoluteInventoryRows': 49, 'zeroBeforeRowsWithNoPercentRatioRetained': 5},
          'narrativeCorrections': ['122 labels change, including63 alreadyzero-floor inconclusive and35 overlapping/inconclusive; exactly24 Observed faster labels become quantum-inconclusive',
                                   '37 zero-floor-classified rows retain raw arithmetic percentChange; do not claim all floor ratios absent or interpret their raw ratios as speedups',
                                   'Zero strictly Observed slower rows does not imply no adverse variation:49 positive absolute pooled-median control changes remain (44 have defined positive percent changes; five start at zero)'],
          'pins': [{'path': str(path), 'sha256': sha(path)} for path in [Path(__file__).resolve(), B / 'report.json', T / 'report.json', A / 'browser-cells.json', A / 'browser-comparisons.csv', A / 'browser-comparisons-qualified.csv', A / 'browser-positive-median-changes.csv', A / 'scope-wording-correction.json', A / 'clock-qualification.json', plan_path]],
          'limitations': ['Three fresh context-owner range rule is descriptive, not a confidence interval or population guarantee',
                         'Separate observed0.1ms clock facts are conservative interpretation, not hard precision/error bounds or timing correction',
                         'Every original favorable/adverse/overlapping/floor cell, raw median/tail/delta/ratio is preserved; no weighted overall winner or same-runtime optimization claim']}
(OUT / 'browser-statistics.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'pins'}, indent=2))
