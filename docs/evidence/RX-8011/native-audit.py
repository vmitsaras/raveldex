#!/usr/bin/env python3
"""Read-only independent replay of persisted native evidence; no runtime collectors.

Run from repository root: python3 docs/evidence/RX-8011/native-audit.py
Only its sibling native-audit.json is written. Uses Python stdlib, no production
benchmark summary, scorer, tokenizer, or search implementation.
"""
import collections
import gzip
import hashlib
import json
import math
import pathlib
import subprocess
import tarfile
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[3]
E = ROOT / 'docs/evidence/RX-8009'
OUT = pathlib.Path(__file__).with_suffix('.json')
stats = collections.Counter()
findings = {}

def read(p):
    return json.loads(pathlib.Path(p).read_text())

def sha(data):
    return hashlib.sha256(data).hexdigest()

def near(a, b):
    assert math.isclose(a, b, abs_tol=1e-12, rel_tol=1e-12), (a, b)

def q(values, fraction):
    return sorted(values)[math.ceil(len(values) * fraction) - 1] if values else None

def key(row, sample, outcome=True):
    return (row['variant'], row['family'], row['size'], sample['operation'], sample.get('phase')) + ((sample['outcome'],) if outcome else ())

def walk(x):
    if isinstance(x, dict):
        yield x
        for value in x.values():
            yield from walk(value)
    elif isinstance(x, list):
        for value in x:
            yield from walk(value)

report = read(E / 'node/report.json')
freeze = {(x['family'], x['size']): x for x in read(ROOT / 'test/fixtures/n9/freeze.json')['workloads']}
groups = collections.defaultdict(list)
cohorts = collections.defaultdict(list)
node_rows = []
all_outcomes = collections.Counter()
restore_outcomes = collections.Counter()
for run in report['runs']:
    row = read(E / 'node' / run['output'])
    assert run['exitCode'] == 0 and row['outcome'] == 'Collected'
    assert row['identity'] == freeze[row['family'], row['size']]
    node_rows.append(row)
    data = row['samples'] if row['mode'] == 'normal' else row['observations']
    assert not (row['observations'] if row['mode'] == 'normal' else row['samples'])
    for sample in data:
        all_outcomes[sample['outcome']] += 1
        if sample['operation'] == 'restoreSource':
            restore_outcomes[sample['outcome']] += 1
            if sample['outcome'] == 'Refused':
                assert sample['oldStatePreserved'] is True
        if sample['outcome'] == 'Not run':
            assert sample['operation'] == 'restoreSource'
            assert not any(k in sample for k in ['wallMs', 'cpuUserMs', 'cpuSystemMs', 'error', 'result'])
        if row['mode'] == 'normal':
            assert 'counters' not in sample
            groups[key(row, sample)].append((row, sample))
            cohorts[key(row, sample, False)].append(sample)
        else:
            assert sample['outcome'] == 'Not run' or 'counters' in sample
        if sample['operation'].startswith('query:'):
            cap = row['resultCaptures'][sample['resultSha256']]
            assert isinstance(cap, dict) and ('result' in cap or 'error' in cap)
            stats['rawQueryCapturesResolved'] += 1
    stats['nodeRuns'] += 1
for summary in report['summaries']:
    k = key(summary, summary)
    actual = [(r, s) for r, s in groups[k] if 'wallMs' in s]
    all_samples = cohorts[k[:-1]]
    attempts = [s for s in all_samples if s['outcome'] != 'Not run']
    assert summary['records'] == len(groups[k])
    assert summary['attempts'] == len(actual)
    assert summary['totalAttempts'] == len(attempts)
    assert summary['outcomes'] == dict(collections.Counter(s['outcome'] for s in all_samples))
    assert summary['failureRate'] == (sum(s['outcome'] != 'Pass' for s in attempts)/len(attempts) if attempts else None)
    assert summary['outcomeFraction'] == len(groups[k])/len(all_samples)
    assert summary['owners'] == len({r['pid'] for r, _ in groups[k]})
    for field, target in [('wallMs', 'p50WallMs'), ('cpuUserMs', 'p50CpuUserMs'), ('cpuSystemMs', 'p50CpuSystemMs')]:
        assert summary[target] == q([s[field] for _, s in actual], .5)
    assert summary['p95WallMs'] == (q([s['wallMs'] for _, s in actual], .95) if len(actual) >= 100 else None)
    stats['nodeSummaryGroups'] += 1
    stats['nodeGroupsWithP95' if summary['p95WallMs'] is not None else 'nodeGroupsWithoutP95'] += 1
findings['nodeOperationOutcomes'] = dict(all_outcomes)
findings['restoreOutcomes'] = dict(restore_outcomes)

# Recompute observed raw result/error agreement against the same family/query.
# Full public result object is compared, not only total or IDs.
references = {}
for row in node_rows:
    for sample in row['samples'] + row['observations']:
        if not sample['operation'].startswith('query:'):
            continue
        k = (row['family'], row['size'], sample['operation'])
        cap = row['resultCaptures'][sample['resultSha256']]
        if k in references:
            assert cap == references[k], k
            stats['nodeExactRawCaptureComparisons'] += 1
        else:
            references[k] = cap

for intervention in ['planning', 'scheduling', 'prefix', 'ranking', 'bulk', 'combined']:
    folder = E / ('browser-' + intervention)
    br = read(folder / 'report.json')
    bg = collections.defaultdict(list)
    for run in br['runs']:
        row = read(folder / run['output'])
        assert not row['pageErrors'] and not row['externalRequests']
        if row['mode'] == 'normal':
            assert not row['case']['observations']
            for sample in row['case']['samples']:
                assert 'counters' not in sample
                bg[row['variant'], row['execution'], sample['query']].append(sample)
                stats['browserNormalSamples'] += 1
        else:
            assert not row['case']['samples']
        stats['browserRuns'] += 1
    for s in br['summaries']:
        samples = bg[s['variant'], s['execution'], s['query']]
        good = [a['wallMs'] for a in samples if a['outcome'] == 'Pass']
        assert len(samples) == s['attempts'] == 120
        assert s['successes'] == len(good)
        assert s['outcomes'] == dict(collections.Counter(a['outcome'] for a in samples))
        assert s['failureRate'] == (len(samples)-len(good))/len(samples)
        assert s['p50WallMs'] == q(good, .5)
        assert s['p95WallMs'] == (q(good, .95) if len(good) >= 100 else None)
        stats['browserSummaryGroups'] += 1

# Hash actual archived members independently; check current source against the
# measurement pins rather than assuming a later HEAD is the measured checkout.
manifest = read(E / 'artifacts.json')
limits = set()
for variant, entry in manifest['variants'].items():
    artifact = entry['artifact']
    path = pathlib.Path(artifact['path'])
    if not path.exists() and variant == 'combined':
        path = ROOT / 'docs/evidence/RX-8009/verification/core.tar.gz'
    assert sha(path.read_bytes()) == artifact['sha256'], path
    with tarfile.open(path) as tar:
        members = {m.name: sha(tar.extractfile(m).read()) for m in tar.getmembers() if m.isfile()}
    assert members == artifact['members'], variant
    limits.add(members['package/dist/core/limits/limits.js'])
    stats['archiveMembers'] += len(members)
    stats['archivePackages'] += 1
assert limits == {manifest['unchangedLimitsSha256']}
pins = read(E / 'runtime-pins.json')
for path, digest in pins.items():
    assert sha((ROOT / path).read_bytes()) == digest, path
    stats['currentRuntimeSourcePins'] += 1
for pin in report['harness']:
    assert sha((ROOT / pin['path']).read_bytes()) == pin['sha256'], pin['path']
    stats['currentNodeHarnessPins'] += 1
for entry in freeze.values():
    assert sha((ROOT / entry['source']['path']).read_bytes()) == entry['source']['sha256']

# Reconstruct field/posting statistics from reverse document maps in selected
# persisted graphs; arithmetic below independently uses facts and these maps.
selected_cores = {}
for family, size in [('adversarial', 100), ('adversarial', 10000), ('real-docs', 1000), ('high-cardinality', 1000)]:
    before = None
    for variant in ['baseline', 'combined']:
        name = f'{family}-{size}-{variant}'
        raw = gzip.decompress((E / 'semantics' / (name+'.core.json.gz')).read_bytes())
        core = json.loads(raw)
        selected_cores[name] = core
        if before is not None:
            assert core == before
        before = core
        assert len(core['documents']) == size == core['counts']['documents']
        for field, directory in core['fields'].items():
            docs = {id: doc['fields'][field] for id, doc in core['documents'].items() if field in doc['fields']}
            assert directory['documents'] == len(docs)
            assert directory['length'] == sum(d['length'] for d in docs.values())
            postings = collections.defaultdict(dict)
            for id, doc in docs.items():
                assert doc['length'] == sum(doc['terms'].values())
                for term, tf in doc['terms'].items():
                    postings[term][id] = tf
            assert set(postings) == set(directory['terms'])
            for term, expected in postings.items():
                actual = directory['terms'][term]
                assert actual['postings'] == expected
                assert actual['df'] == len(expected)
                assert actual['frequency'] == sum(expected.values())
                stats['reconstructedFieldTerms'] += 1
        stats['selectedCoreGraphs'] += 1
        stats['selectedReverseDocuments'] += size

semantics = read(E / 'semantics/report.json')
capture_outcomes = collections.Counter()
semantic_references = {}
for run in semantics['runs']:
    row = read(E / 'semantics' / run['output'])
    assert row['identity'] == freeze[row['family'], row['size']]
    for query in row['queries']:
        cap = query['capture']
        identity = (row['family'], row['size'], query['id'])
        if identity in semantic_references:
            assert cap == semantic_references[identity], identity
            stats['semanticExactCaptureComparisons'] += 1
        else:
            semantic_references[identity] = cap
        capture_outcomes[cap['outcome']] += 1
        if cap['outcome'] == 'Pass':
            assert cap['complete'] is True and cap['total'] == len(cap['hits'])
            assert len({h['id'] for h in cap['hits']}) == len(cap['hits'])
            stats['completeSemanticQueryCaptures'] += 1
        else:
            assert cap['complete'] is False
    for fact in walk(row['selected']):
        if fact.get('kind') != 'field':
            continue
        N, df, tf = fact['N'], fact['df'], fact['tf']
        avg = fact['totalLength']/N
        idf = math.log(1+(N-df+.5)/(df+.5))
        norm = 1.2*(1-.75+.75*fact['length']/avg)
        tf_part = tf*2.2/(tf+norm)
        base = fact['boost']*idf*tf_part
        for actual, expected in [(fact['avgLength'], avg), (fact['idf'], idf), (fact['normalizer'], norm), (fact['tfPart'], tf_part), (fact['base'], base), (fact['selected'], fact['weight']*base)]:
            near(actual, expected)
            stats['independentNumericalAssertions'] += 1
    stats['semanticCases'] += 1
findings['semanticQueryCaptureOutcomes'] = dict(capture_outcomes)

# RX-8008 is the larger direct/worker restore lane; RX-8009's browser query
# contexts are only 100 records and cannot supply this capacity evidence.
bulk_outcomes = collections.Counter()
for stage in ['before', 'after']:
    for host in ['node', 'browser']:
        folder = ROOT / 'docs/evidence/RX-8008' / f'{stage}-{host}'
        bulk_report = read(folder / 'report.json')
        for run in bulk_report['runs']:
            row = read(folder / run['output'])
            exercise = row['exercise' if host == 'node' else 'case']
            ops = exercise['samples'] + exercise['observations']
            restore = next(a for a in ops if a['operation'] == 'restoreSource')
            expected = 'Refused' if stage == 'before' and run['size'] == 10000 else 'Pass'
            assert restore['outcome'] == expected
            bulk_outcomes[f'{stage}/{run["size"]}/{expected}'] += 1
            if expected == 'Pass':
                assert restore['completeSource']['records'] == run['size']
                assert restore['completeMembership']['records'] == run['size']
                assert restore['result']['revision'] == restore['priorRevision'] + 1
            else:
                assert restore['error']['code'] == 'WORK_LIMIT_EXCEEDED'
                assert restore['oldQueriesPreserved'] and restore['oldSourceBytesPreserved']
            for name, outcome, code in [('deadlineRestore', 'Refused', 'DEADLINE_EXCEEDED'), ('abortedRestore', 'Cancelled', 'CANCELLED')]:
                stop = next(a for a in ops if a['operation'] == name)
                assert stop['outcome'] == outcome and stop['error']['code'] == code
                assert stop['oldQueriesPreserved'] and stop['oldSourceBytesPreserved']
                stats['bulkKnownStopChecks'] += 1
            if stage == 'after' and run['mode'] == 'diagnostic' and run['size'] == 10000:
                counters = restore['counters']
                assert counters['emittedWorkUnits'] == (23043299 if run['variant'] == 'source' else 28435912)
                assert sum(v['emittedWorkUnits'] for v in counters['restorePhases'].values()) == counters['emittedWorkUnits']
                stats['bulkAggregatePhaseWorkChecks'] += 1
            stats['bulkRawCases'] += 1
findings['bulkRestoreOutcomes'] = dict(bulk_outcomes)

# Original UTF-16 offsets must slice original source before NFKC normalization.
# Inspect literal position+offset fixtures (all six adversarial variants, 100).
for variant in manifest['variants']:
    row = read(E / 'semantics' / f'adversarial-100-{variant}.json')
    for fixture in row['fixtures']:
        if fixture['kind'] != 'offsets':
            continue
        core = json.loads(fixture['initialCore']['canonical'])
        source = next(v for v in core['participants'].values() if v['kind'] == 'raveldex-source-v1')
        positions = next(v for v in core['participants'].values() if v['kind'] == 'raveldex-positions-v1')
        for id, record in positions['records'].items():
            for field, values in record['positions'].items():
                raw_values = source['records'][id]['text'][field]
                assert len(raw_values) == len(values)
                for raw_value, value in zip(raw_values, values):
                    encoded = raw_value.encode('utf-16-le')
                    for term, occurrences in value['terms'].items():
                        for occurrence in occurrences:
                            piece = encoded[occurrence['start']*2:occurrence['end']*2].decode('utf-16-le')
                            assert unicodedata.normalize('NFKC', piece).lower() == term
                            stats['independentUtf16OffsetPairs'] += 1
        assert fixture['recovery']['receipt']['revision'] == 2
        assert [w['receipt']['revision'] for w in fixture['writes']] == [3,4,5]
        stats['offsetFixtureRecoveryAndWrites'] += 1

sizes = read(E / 'core-sizes.json')['rows']
assert stats['independentUtf16OffsetPairs'] > 0, 'offset lane was not visited'
assert sizes[-1]['gzipBytes'] - sizes[0]['gzipBytes'] == 2051
findings['uniformCoreGraphGzipDelta'] = 2051
findings['consequentialDocumentationCorrection'] = {
    'omittedOperationDeadlineMs': 30000,
    'defaultDeadlineCeilingMs': 60000,
    'explicitComparedCollectorDeadlineMs': 60000,
    'historicalDefault60sWording': 'Incorrect; current guidance requires visible correction, raw measurements unchanged',
}
findings['status'] = 'Pass within explicitly reviewed persisted/native scope'
findings['reviewHead'] = subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip()
findings['newTimingCollection'] = False
findings['counts'] = dict(stats)
OUT.write_text(json.dumps(findings, indent=2)+'\n')
print(json.dumps(findings, indent=2))
