#!/usr/bin/env python3
"""Independent Python raw browser matrix/source-score/statistic replay."""
from pathlib import Path
from collections import Counter, defaultdict
import datetime, hashlib, json, math, sys
from oracle import records, materialize, expected_hits, verify_result

OUT = Path(__file__).resolve().parent
directory = Path(sys.argv[1]).resolve()
destination = OUT / (sys.argv[2] if len(sys.argv) > 2 else 'browser-replay.json')
partial = '--partial' in sys.argv[3:]
def read(path):
    return json.loads(path.read_text())
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
def value_sha(value):
    return hashlib.sha256(compact(value).encode()).hexdigest()
def quantile(values, fraction):
    return sorted(values)[math.ceil(len(values) * fraction) - 1] if values else None
def typed_outcome(error):
    code = error.get('code') or ''
    if 'UNKNOWN' in code or error.get('name') == 'WorkerAdapterError' and code in ['TIMEOUT', 'TERMINATED', 'WORKER_UNAVAILABLE']:
        return 'Unknown'
    if code == 'CANCELLED':
        return 'Cancelled'
    if code in ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED']:
        return 'Refused'
    return 'Rejected'

report = read(directory / 'report.json')
assert report['kind'] == 'rx9006-host-browser-run-v1'
assert report['outcome'] == ('Fail' if partial else 'Collected')
assert report['acceptedPerformanceEvidence'] is False
if not partial:
    assert report['guards'] == 'Pass'
prepared = report['prepared']
method = report['method']
assert method['contexts'] == 96 and method['normalQueryCalls'] == 6048 and method['diagnosticQueryCalls'] == 96
assert method['budgetMs'] == 5400000 and method['perContextWatchdogMs'] == 300000
assert report['environment']['browserVersion'] == '149.0.7827.55'
if not partial:
    assert report['elapsedMs'] <= (5400000 if report['profile'] == 'full' else 600000)
roles = ['preN9', 'acceptedN9', 'current']
channels = ['direct', 'real-module-worker']
query_ids = ['common', 'rare', 'narrow-prefix', 'source-phrase']
queries = {'common': {'kind': 'text', 'text': 'n9common', 'fields': ['body']},
           'rare': {'kind': 'text', 'text': 'n9rare', 'fields': ['body']},
           'narrow-prefix': {'kind': 'group', 'fields': ['body'], 'variants': [{'text': 'n9key00000', 'match': 'prefix'}]},
           'source-phrase': {'kind': 'extension', 'capability': 'phrases', 'version': 1, 'payload': {'text': 'n9red n9blue', 'fields': ['body']}}}
jobs = {}
for owner in range(4):
    for size in [100, 1000]:
        for channel in channels:
            for deadline in ['default30s', 'explicit60s']:
                for role in roles:
                    mode = 'diagnostic' if owner == 3 else 'normal'
                    key = (role, size, channel, deadline, owner, mode)
                    jobs[key] = {'samples': 1 if mode == 'diagnostic' else 2 if size == 100 else 40,
                                 'warmups': 2 if mode == 'normal' and size == 1000 else 0,
                                 'deadlineOptions': {} if deadline == 'default30s' else {'deadlineMs': 60000}}
if report['profile'] == 'probe':
    jobs = {key: value for key, value in jobs.items() if key[4] in [0, 3]
            and (key[3] == 'default30s' if key[1] == 100 else key[0] != 'acceptedN9')}
else:
    assert report['profile'] == 'full'
assert len(report['runs']) <= len(jobs) if partial else len(report['runs']) == len(jobs)
models, hits_cache, groups = {}, {}, defaultdict(list)
counts = Counter()
pins, seen, contexts = [], set(), set()
for run in report['runs']:
    path = directory / run['output']
    assert path.parent == directory and path.is_file()
    row = read(path)
    key = tuple(row[name] for name in ['role', 'size', 'channel', 'deadline', 'owner', 'mode'])
    assert key in jobs and key not in seen
    seen.add(key)
    job = jobs[key]
    assert row['contextId'] not in contexts
    contexts.add(row['contextId'])
    assert row['family'] == 'adversarial' and row['outcome'] == row['case']['outcome'] == 'Collected'
    for name, value in job.items():
        assert row[name] == value
    assert row['pageErrors'] == row['externalRequests'] == [] and row['timedOut'] is False
    assert row['browserVersion'] == '149.0.7827.55'
    artifact = next(item for item in prepared['manifest']['artifacts'] if item['role'] == row['role'])
    assert row['artifactSha256'] == artifact['sha256'] and row['artifactSource'] == artifact['source']
    for name in ['artifactManifestSha256', 'methodSha256']:
        assert row[name] == prepared[name]
    assert row['harnessSha256'] == value_sha(prepared['harness'])
    expected_member_hash = value_sha(sorted(artifact['members'], key=lambda item: item['path'].lower()))
    assert row['packageInventorySha256'] == expected_member_hash
    staged = prepared['packages'][row['role']]['contexts'][row['mode']][str(row['size'])]
    assert row['assetsSha256'] == value_sha(staged['assets'])
    assert row['executedPackageInventorySha256'] == value_sha(sorted(staged['members'], key=lambda item: item['path'].lower()))
    assert row['workloadIdentity'] == staged['workload']
    size, revision = row['size'], math.ceil(row['size'] / 256)
    if size not in models:
        models[size] = materialize(records('adversarial', size))
        hits_cache[size] = {name: expected_hits(models[size], query) for name, query in queries.items()}
    data = row['case']['samples'] if row['mode'] == 'normal' else row['case']['observations']
    assert (row['case']['observations'] if row['mode'] == 'normal' else row['case']['samples']) == []
    assert len(data) == len(row['case']['resultCaptures']) == 4 * job['samples']
    assert len(row['case']['warmups']) == 4 * job['warmups']
    assert row['case']['build']['outcome'] == 'Pass' and row['case']['build']['revision'] == revision
    used_captures = set()
    for name in query_ids:
        hits = hits_cache[size][name]
        actual = [item for item in data if item['query'] == name]
        assert [item['repetition'] for item in actual] == list(range(job['samples']))
        warmups = [item for item in row['case']['warmups'] if item['query'] == name]
        assert [item['repetition'] for item in warmups] == list(range(job['warmups']))
        for warmup in warmups:
            assert 'wallMs' not in warmup and 'counters' not in warmup
            if warmup['outcome'] == 'Pass':
                counts['warmupScores'] += verify_result(warmup['result'], hits, revision)
            else:
                assert typed_outcome(warmup['error']) == warmup['outcome'] != 'Rejected'
            counts['warmups'] += 1
        for sample in actual:
            phase = 'diagnostic-first-call' if row['mode'] == 'diagnostic' else 'after-two-warmups' if job['warmups'] else 'repeat-same-owner' if sample['repetition'] else 'first-call-for-query'
            assert sample['phase'] == phase
            for metric in ['wallMs', 'invocationReturnMs', 'returnSettlementMs']:
                assert math.isfinite(sample[metric]) and sample[metric] >= 0
            assert abs(sample['wallMs'] - sample['invocationReturnMs'] - sample['returnSettlementMs']) < 1e-6
            assert 'cpuUserMs' not in sample and 'cpuSystemMs' not in sample
            assert ('counters' in sample) == (row['mode'] == 'diagnostic')
            index = sample['captureIndex']
            assert index not in used_captures
            used_captures.add(index)
            capture = row['case']['resultCaptures'][index]
            if sample['outcome'] == 'Pass':
                counts['timedScores'] += verify_result(capture['result'], hits, revision)
                assert 'error' not in capture and 'error' not in sample
            else:
                assert capture['error'] == sample['error'] and 'result' not in capture
                assert typed_outcome(sample['error']) == sample['outcome'] != 'Rejected'
            if row['mode'] == 'normal':
                identity = tuple(row[name] for name in ['role', 'size', 'channel', 'deadline']) + (name, phase)
                groups[identity].append({**sample, 'owner': row['owner']})
            else:
                counters = sample['counters']
                for counter in ['emittedSteps', 'emittedWorkUnits', 'hostYields', 'continuationsScheduled']:
                    assert isinstance(counters[counter], int) and counters[counter] >= 0
                counts['diagnosticPumps'] += len(counters['spans']['pumps'])
                counts['diagnosticLogicalSteps'] += counters['emittedSteps']
                counts['diagnosticLogicalWorkUnits'] += counters['emittedWorkUnits']
            counts['normalCalls' if row['mode'] == 'normal' else 'diagnosticCalls'] += 1
            counts['outcome:' + sample['outcome']] += 1
        complete = row['case']['completeQueries'][name]
        assert complete['revision'] == revision and complete['total'] == len(hits)
        flattened = []
        for index, page in enumerate(complete['pages']):
            counts['fullPageScores'] += verify_result(page, hits, revision, index * 100, 100)
            counts['pages'] += 1
            flattened.extend(page['hits'])
        if complete['outcome'] == 'Pass':
            assert complete['complete'] is True
            assert flattened == complete['hits'] and len(flattened) == len(hits)
            counts['completeCaptures'] += 1
        else:
            assert complete['complete'] is False and typed_outcome(complete['error']) == complete['outcome'] != 'Rejected'
            counts['incompleteCaptures'] += 1
    assert used_captures == set(range(len(data)))
    pins.append({'path': run['output'], 'sha256': sha(path)})
    counts['contexts'] += 1
assert seen <= set(jobs) if partial else seen == set(jobs)
summaries = []
for key, samples in groups.items():
    successful = [item['wallMs'] for item in samples if item['outcome'] == 'Pass']
    owners = sorted({item['owner'] for item in samples})
    summary = dict(zip(['role', 'size', 'channel', 'deadline', 'query', 'phase'], key))
    summary.update({'attempts': len(samples), 'successes': len(successful), 'owners': len(owners),
                    'outcomes': dict(Counter(item['outcome'] for item in samples)),
                    'p50WallMs': quantile(successful, .5), 'p95WallMs': quantile(successful, .95) if len(successful) >= 100 else None,
                    'maximumWallMs': max(successful) if successful else None,
                    'ownerMedians': [{'owner': owner, 'successes': len(values := [item['wallMs'] for item in samples if item['owner'] == owner and item['outcome'] == 'Pass']), 'p50WallMs': quantile(values, .5)} for owner in owners],
                    'cpu': 'Not measured', 'heap': 'Not measured'})
    summaries.append(summary)
    if summary['p95WallMs'] is not None:
        assert summary['size'] == 1000 and summary['phase'] == 'after-two-warmups'
        assert summary['attempts'] == 120 and 100 <= summary['successes'] <= 120
        counts['eligibleP95Cells'] += 1
def sort_summary(summary):
    return tuple(str(summary[key]) for key in ['role', 'size', 'channel', 'deadline', 'query', 'phase'])
if 'summaries' in report:
    assert sorted(summaries, key=sort_summary) == sorted(report['summaries'], key=sort_summary), 'raw quantiles/owner summaries'
else:
    assert partial
if report['profile'] == 'full' and not partial:
    assert counts['contexts'] == 96 and counts['normalCalls'] == 6048 and counts['diagnosticCalls'] == 96
result = {'kind': 'rx9006-independent-browser-replay-v1', 'status': 'Completed rows verified; collection incomplete' if partial else 'Pass', 'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'verifierSourcePins': [{'path': str(path), 'sha256': sha(path)} for path in [Path(__file__).resolve(), OUT / 'oracle.py']],
          'directory': str(directory), 'profile': report['profile'], 'reportSha256': sha(directory / 'report.json'),
          'counts': dict(counts), 'summaryCells': len(summaries), 'rowPins': pins,
          'coverage': {'collectionOutcome': report['outcome'], 'complete': seen == set(jobs), 'completedRowsVerified': len(seen), 'plannedRows': len(jobs), 'acceptedPerformanceEvidence': False},
          'method': 'Python literal fixture reconstruction; independent Unicode-category original-span scan/NFKC/lower and full source TF/DF/BM25, prefix maximum and value-local phrase membership; every returned timed/warmup/page score/order and raw statistic replayed without JS helper/runtime imports.',
          'limitations': ['Read-only replay does not reobserve live native deadlines, private browser heap, worker delivery or physical input',
                         'Full successful capture reflects untimed explicit60s verifier queries, not another default cohort sample',
                         'Correlated repetitions and three context owners are not independent machines/population guarantees']}
destination.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'rowPins'}, indent=2))
