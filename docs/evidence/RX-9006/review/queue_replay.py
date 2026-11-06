#!/usr/bin/env python3
"""Independent native-queue diagnostic event/source/state/arithmetic replay."""
from pathlib import Path
from collections import Counter
import datetime, hashlib, json, math, sys
from oracle import records, materialize, expected_hits, verify_result, verify_root

OUT = Path(__file__).resolve().parent
directory = Path(sys.argv[1]).resolve()
def read(path):
    return json.loads(path.read_text())
def digest(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()
def sha(path):
    return digest(path.read_bytes())
report = read(directory / 'report.json')
assert report['kind'] == 'rx9006-native-queue-diagnostic-v1'
assert report['outcome'] == 'Collected' and report['guards'] == 'Pass' and report['normalTimingEvidence'] is False
assert report['method']['contexts'] == 4 and report['method']['totalMs'] == 300000 and report['method']['perContextWatchdogMs'] == 60000
assert report['elapsedMs'] <= 300000
assert len(report['runs']) == 4
base_records = records('adversarial', 1000)
base = materialize(base_records)
queries = {'common': 'n9common', 'rare': 'n9rare',
           'narrow-prefix': {'kind': 'group', 'variants': [{'text': 'n9key00000', 'match': 'prefix'}]},
           'source-phrase': {'kind': 'extension', 'capability': 'phrases', 'payload': {'text': 'n9red n9blue'}}}
reference = {name: expected_hits(base, query) for name, query in queries.items()}
counts, outcomes, keys, pids = Counter(), Counter(), set(), set()
pins = []
event_rows = []
for run in report['runs']:
    assert run['code'] == 0 and run['timedOut'] is False
    path = Path(run['output'])
    assert path.is_relative_to(directory)
    row = read(path)
    key = (row['role'], row['deadline'])
    assert key not in keys and key[0] in ['preN9', 'current'] and key[1] in ['default30s', 'explicit60s']
    keys.add(key)
    assert row['pid'] not in pids
    pids.add(row['pid'])
    assert row['outcome'] == 'Collected' and row['normalTimingEvidence'] is False
    assert row['options'] == ({} if row['deadline'] == 'default30s' else {'deadlineMs': 60000})
    calls = row['publicCalls']
    labels = ['long-common', 'queued-rare', 'deadline-1ms', 'abort-queued']
    assert [item['label'] for item in calls] == labels
    assert [item['label'] for item in row['events']] == labels
    for call, event in zip(calls, row['events']):
        assert call['outcome'] in ['Pass', 'Refused', 'Cancelled', 'Unknown']
        expected_terminal = 'Pass' if call['outcome'] == 'Pass' else call['error']['code']
        assert event['terminalCode'] == expected_terminal
        assert all(value is False for value in event['cleanup'].values())
        assert event['admittedAt'] <= event['enqueuedAt'] <= event['terminalAt']
        captured_ms = 1 if event['label'] == 'deadline-1ms' else 30000 if row['deadline'] == 'default30s' else 60000
        assert event['capturedDeadlineMs'] == captured_ms
        assert abs(event['deadline'] - event['admittedAt'] - captured_ms) < 1e-6
        assert abs(event['admissionToEnqueueMs'] - (event['enqueuedAt'] - event['admittedAt'])) < 1e-9
        assert abs(event['enqueueToTerminalMs'] - (event['terminalAt'] - event['enqueuedAt'])) < 1e-9
        if event['startedAt'] is None:
            assert event['enqueueToCursorStartMs'] is None and event['noCursorBeforeTerminal'] is True
        else:
            assert event['enqueuedAt'] <= event['startedAt'] <= event['terminalAt']
            assert abs(event['enqueueToCursorStartMs'] - (event['startedAt'] - event['enqueuedAt'])) < 1e-9
            assert event['noCursorBeforeTerminal'] is False
        if event['wasQueued']:
            assert event['queueLengthAfterEnqueue'] >= 1
            counts['observedQueuedInsertions'] += 1
        else:
            counts['notQueuedAtInsertion'] += 1
        if call['outcome'] == 'Pass':
            counts['publicScores'] += verify_result(call['result'], reference['common' if call['label'] == 'long-common' else 'rare'], 4)
        outcomes[(row['role'], row['deadline'], event['label'], call['outcome'])] += 1
        event_rows.append({'role': row['role'], 'deadlineCohort': row['deadline'], **event})
        counts['operations'] += 1
    assert row['rootPreservedByIdentity'] is True
    assert row['rootBefore']['canonical'] == row['rootAfter']['canonical']
    for field in ['rootBefore', 'rootAfter']:
        root = json.loads(row[field]['canonical'])
        assert digest(row[field]['canonical']) == row[field]['sha256']
        assert root['revision'] == row[field]['revision'] == 4
        for participant in root['participants'].values():
            assert participant['revision'] == 4
            participant['revision'] = 0
        for name, value in verify_root(root, base, 'source').items():
            counts['root:' + name] += value
        counts['roots'] += 1
    for phase in ['before', 'after']:
        snapshot = json.loads(row['source'][phase])
        assert snapshot['format'] == 'raveldex-source' and snapshot['body']['header']['originRevision'] == 4
        wanted = [{'id': item['id'], 'text': {'body': item['text']['body'] if isinstance(item['text']['body'], list) else [item['text']['body']]}, 'metadata': item['metadata']} for item in base_records]
        assert snapshot['body']['payload']['records'] == wanted
        counts['sourceRecords'] += len(wanted)
    assert row['source']['before'] == row['source']['after']
    for name, capture in row['completeQueries'].items():
        assert capture['complete'] is True and capture['outcome'] == 'Pass'
        pages = capture['pages']
        expected = reference[name]
        assert len(pages) == math.ceil(max(1, len(expected)) / 100)
        assert capture['hits'] == [hit for page in pages for hit in page['hits']]
        assert len(capture['hits']) == len(expected)
        for index, page in enumerate(pages):
            counts['fullPageScores'] += verify_result(page, expected, 4, index * 100, 100)
            counts['pages'] += 1
    recovery = row['recovery']
    assert recovery['addedReceipt']['revision'] == 5 and recovery['removeReceipt']['revision'] == 6
    added = {'id': 'queue-recovery', 'text': {'body': 'n9common n9rare queueafter'}, 'metadata': {'group': 'recovery'}}
    after_add = materialize([*base_records, added])
    counts['laterWriteScores'] += verify_result(recovery['addedResult'], expected_hits(after_add, 'queueafter'), 5)
    assert recovery['completeSource']['outcome'] == 'Pass' and recovery['completeSource']['records'] == 1000
    assert row['disposal']['authoritativeRootReleased'] is row['disposal']['operationOwnedCleanup'] is True
    pins.append({'path': str(path.relative_to(directory)), 'sha256': sha(path)})
assert keys == {(role, deadline) for role in ['preN9', 'current'] for deadline in ['default30s', 'explicit60s']}
result = {'kind': 'rx9006-independent-queue-replay-v1', 'status': 'Pass', 'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'verifierSourcePins': [{'path': str(path), 'sha256': sha(path)} for path in [Path(__file__).resolve(), OUT / 'oracle.py']],
          'directory': str(directory), 'reportSha256': sha(directory / 'report.json'), 'counts': dict(counts), 'rowPins': pins,
          'outcomes': [{'role': role, 'deadline': deadline, 'label': label, 'outcome': outcome, 'calls': count} for (role, deadline, label, outcome), count in sorted(outcomes.items())],
          'events': event_rows,
          'limitations': ['Four sparse intrusive native Node observations, not normal performance evidence or browser/worker queue evidence',
                         'Post-enqueue to cursor-start includes instrumentation, signal/timer installation and pump setup; no pure queue-service estimate',
                         'Zero recorded operation closure/queue ownership does not establish global native handle counts or retained/peak heap']}
(OUT / 'queue-replay.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ['rowPins', 'events']}, indent=2))
