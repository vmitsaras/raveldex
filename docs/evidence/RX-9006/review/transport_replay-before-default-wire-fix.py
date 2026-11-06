#!/usr/bin/env python3
"""Independent exact-packet worker boundary, clock and semantic replay."""
from pathlib import Path
from collections import Counter
import datetime, hashlib, json, math, sys
from oracle import records, materialize, expected_hits, verify_result

OUT = Path(__file__).resolve().parent
directory = Path(sys.argv[1]).resolve()
def read(path):
    return json.loads(path.read_text())
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
def close(a, b):
    assert math.isfinite(a) and math.isfinite(b) and abs(a - b) < 1e-7, (a, b)
def fnv(text):
    value, raw = 2166136261, text.encode('utf-16-le', 'surrogatepass')
    for index in range(0, len(raw), 2):
        value = ((value ^ (raw[index] | raw[index + 1] << 8)) * 16777619) & 0xffffffff
    return f'{value:08x}'
def check_snapshot(encoded, expected_records, revision):
    snapshot = json.loads(encoded)
    assert snapshot['format'] == 'raveldex-source' and snapshot['formatVersion'] == 1
    assert snapshot['codec'] == {'id': 'raveldex-json-v1', 'version': 1}
    body_text = json.dumps(snapshot['body'], ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    assert snapshot['integrity'] == {'algorithm': 'fnv1a32-utf16', 'value': fnv(body_text)}
    assert snapshot['body']['header']['originRevision'] == revision
    wanted = sorted([{'id': item['id'], 'text': {'body': item['text']['body'] if isinstance(item['text']['body'], list) else [item['text']['body']]}, 'metadata': item.get('metadata', {})} for item in expected_records], key=lambda item: item['id'])
    assert snapshot['body']['payload'] == {'records': wanted}
    return len(wanted)

report = read(directory / 'report.json')
assert report['kind'] == 'rx9006-same-call-worker-boundaries-v1'
assert report['outcome'] == 'Collected' and report['guards'] == 'Pass' and report['normalTimingEvidence'] is False
assert report['method']['contexts'] == 4 and report['method']['perContextWatchdogMs'] == 180000 and report['method']['totalMs'] == 900000
assert report['method']['publicWorkerResponseTimeoutMs'] == 65000
assert report['collectionElapsedMs'] <= 900000 and len(report['runs']) == 4
manifest_path = Path(report['artifactManifest'])
assert sha(manifest_path) == report['artifactManifestSha256']
manifest = read(manifest_path)
repository = Path(__file__).resolve().parents[4]
for pin in report['harness']:
    assert sha(repository / pin['path']) == pin['sha256']
for role in ['preN9', 'current']:
    artifact = next(item for item in manifest['artifacts'] if item['role'] == role)
    for configuration in ['source', 'positions-offsets']:
        pack = report['prepared'][role][configuration]
        assert pack['originalMembers'] == artifact['members'] and pack['artifactSha256'] == artifact['sha256']
        installed = Path(pack['root'])
        actual = {str(path.relative_to(installed)): (path.stat().st_size, sha(path)) for path in installed.rglob('*') if path.is_file()}
        assert actual == {item['path']: (item['bytes'], item['sha256']) for item in artifact['members']}
        for name, pin in pack['assets'].items():
            path = Path(pack['directory']) / name
            assert sha(path) == pin['sha256']

base_records, counts = records('adversarial', 1000), Counter()
base = materialize(base_records)
queries = {'common': 'n9common', 'rare': 'n9rare',
           'narrow-prefix': {'kind': 'group', 'variants': [{'text': 'n9key00000', 'match': 'prefix'}]},
           'source-phrase': {'kind': 'extension', 'capability': 'phrases', 'payload': {'text': 'n9red n9blue'}}}
hits = {name: expected_hits(base, query) for name, query in queries.items()}
prior = [{'id': 'prior-state', 'text': {'body': 'n9oldstate'}, 'metadata': {'group': 'prior'}}]
seen, context_ids, clock_observations, joins, pins = set(), set(), [], [], []
def replay_clock(clock, identity):
    assert clock['calls'] == 32768 and clock['adjacentComparisons'] == 32767
    positive, negative = clock['positiveDeltas'], clock['negativeDeltas']
    assert len(positive) == clock['positiveTicks']
    assert clock['zeroDeltas'] + len(positive) + len(negative) == 32767
    indices = [item['sampleIndex'] for item in positive + negative]
    assert len(set(indices)) == len(indices) and all(1 <= index <= 32767 for index in indices)
    assert [item['sampleIndex'] for item in positive] == sorted(item['sampleIndex'] for item in positive)
    assert [item['sampleIndex'] for item in negative] == sorted(item['sampleIndex'] for item in negative)
    assert all(math.isfinite(item['deltaMs']) and item['deltaMs'] > 0 for item in positive)
    assert all(math.isfinite(item['deltaMs']) and item['deltaMs'] < 0 for item in negative)
    minimum = min((item['deltaMs'] for item in positive), default=None)
    assert clock['minimumObservedPositiveDeltaMs'] == minimum
    close(sum(item['deltaMs'] for item in positive + negative), clock['lastObservedAt'] - clock['firstObservedAt'])
    counts['clockReads'] += clock['calls']
    counts['negativeClockIntervals'] += len(negative)
    clock_observations.append({**identity, 'minimumObservedPositiveDeltaMs': minimum, 'crossOriginIsolated': clock['crossOriginIsolated'],
                               'positiveIntervals': len(positive), 'zeroIntervals': clock['zeroDeltas'], 'negativeIntervals': len(negative)})

for run in report['runs']:
    path = directory / run['output']
    assert path.parent == directory
    row = read(path)
    key = (row['role'], row['deadline'])
    assert key not in seen and row['outcome'] == 'Collected'
    seen.add(key)
    assert row['contextId'] not in context_ids
    context_ids.add(row['contextId'])
    assert row['artifactSha256'] == next(item for item in manifest['artifacts'] if item['role'] == row['role'])['sha256']
    assert row['artifactManifestSha256'] == report['artifactManifestSha256'] and row['browserVersion'] == '149.0.7827.55'
    assert row['pageErrors'] == row['externalRequests'] == []
    assert [item['configuration'] for item in row['configurations']] == ['source', 'positions-offsets']
    for item in row['configurations']:
        data, configuration = item['data'], item['configuration']
        identity = {'role': row['role'], 'deadline': row['deadline'], 'configuration': configuration}
        assert data['outcome'] == 'Collected' and data['configuration'] == configuration and data['deadline'] == row['deadline']
        assert data['options'] == ({} if row['deadline'] == 'default30s' else {'deadlineMs': 60000})
        assert data['buildReceipt']['revision'] == 4 and data['priorReceipt']['revision'] == 1
        assert data['workerObjectsCreated'] == 2 and [worker['role'] for worker in data['workers']] == ['donor', 'receiver']
        for phase in ['clockBefore', 'clockAfter']:
            replay_clock(data[phase], {**identity, 'realm': 'main-page', 'phase': phase})
        for worker in data['workers']:
            assert worker['cleanup']['terminationCalls'] >= 1 and worker['cleanup']['observerRemoved'] is True and worker['cleanup']['pendingControls'] == 0
            assert worker['server']['listenerCount'] == 1
            for phase in ['clockAtStartup', 'clockAtDump']:
                replay_clock(worker['server'][phase], {**identity, 'realm': 'actual-module-worker', 'worker': worker['role'], 'phase': phase})
            counts['explicitlyTerminatedWorkerObjects'] += 1
        assert [operation['label'] for operation in data['operations']] == ['common', 'exportSource', 'restoreSource']
        assert len(item['sameCallBoundaries']) == len(data['operations']) == 3
        for call, joined in zip(data['operations'], item['sameCallBoundaries']):
            assert call['label'] == joined['label'] and call['outcome'] == joined['outcome']
            counts['selectedPublicCalls'] += 1
            if call['outcome'] == 'Not run':
                assert call['attempts'] == 0 and joined['join'] == 'Not run'
                counts['dependentNotRun'] += 1
                continue
            close(call['clientWallMs'], call['clientEndAt'] - call['clientBeginAt'])
            assert call['clientWallMs'] >= 0
            worker = next(worker for worker in data['workers'] if worker['role'] == call['owner'])
            if 'request' not in call:
                assert call['outcome'] != 'Pass' and joined['serverHandlerWallMs'] is joined['combinedNonserverResidualMs'] is None
                counts['notDispatched'] += 1
                continue
            def same(event):
                return all(event[name] == call['request'][name] for name in ['session', 'id', 'operation'])
            requests = [event for event in worker['requests'] if same(event)]
            receives = [event for event in worker['server']['events'] if event['kind'] == 'receive' and same(event)]
            replies = [event for event in worker['server']['events'] if event['kind'] == 'reply' and same(event)]
            responses = [event for event in worker['responses'] if same(event)]
            assert len(requests) == 1 and all(len(events) <= 1 for events in [receives, replies, responses])
            request = requests[0]
            assert call['clientBeginAt'] <= request['postEntryAt'] <= request['postReturnAt'] <= call['clientEndAt']
            if call['outcome'] == 'Unknown':
                assert joined['serverHandlerWallMs'] is joined['combinedNonserverResidualMs'] is None
                counts['unjoinedUnknownFirstOutcomes'] += 1
                continue
            assert len(receives) == len(replies) == len(responses) == 1
            receive, reply, response = receives[0], replies[0], responses[0]
            assert request['packet'] == receive['packet'] and response['packet'] == reply['packet']
            assert request['postReturnAt'] <= response['receivedAt'] <= call['clientEndAt']
            assert receive['receivedAt'] <= reply['replyEntryAt'] <= reply['replyReturnAt'] and reply['postThrew'] is False
            assert response['kind'] == reply['replyKind'] == ('result' if call['outcome'] == 'Pass' else 'error')
            if call['outcome'] == 'Pass':
                assert call['result'] == response['packet']['value']
            server_wall = reply['replyEntryAt'] - receive['receivedAt']
            close(joined['serverHandlerWallMs'], server_wall)
            close(joined['postMessageSyncMs'], reply['replyReturnAt'] - reply['replyEntryAt'])
            close(joined['clientPostMessageSyncMs'], request['postReturnAt'] - request['postEntryAt'])
            residual = call['clientWallMs'] - server_wall
            close(joined['combinedNonserverResidualMs'], residual)
            for packet, prefix in [(request['packet'], 'request'), (response['packet'], 'response')]:
                raw = compact(packet).encode()
                assert joined[prefix + 'PacketSha256'] == hashlib.sha256(raw).hexdigest()
                assert joined[prefix + 'PacketUtf8Bytes'] == len(raw)
                counts['exactPacketRepresentations'] += 1
            assert request['packet']['payload']['options']['deadlineMs'] == (30000 if row['deadline'] == 'default30s' else 60000)
            joins.append({**identity, 'operation': call['operation'], 'outcome': call['outcome'], 'clientWallMs': call['clientWallMs'],
                          'serverReceiveToReplyEntryMs': server_wall, 'combinedNonserverResidualMs': residual})
            counts['sameCallJoins'] += 1
            if residual <= 0:
                assert 'Inconclusive' in joined['residualInterpretation']
                counts['nonpositiveResidualsRetained'] += 1
        operations = {operation['label']: operation for operation in data['operations']}
        if operations['common']['outcome'] == 'Pass':
            counts['selectedQueryScores'] += verify_result(operations['common']['result'], hits['common'], 4)
        counts['literalSourceRecords'] += check_snapshot(data['priorSource'], prior, 1)
        if operations['exportSource']['outcome'] == 'Pass':
            counts['literalSourceRecords'] += check_snapshot(operations['exportSource']['result'], base_records, 4)
            restored = operations['restoreSource']
            if restored['outcome'] == 'Pass':
                assert restored['result']['revision'] == 2 and restored['result']['originRevision'] == 4 and restored['result']['format'] == 'raveldex-source' and restored['result']['reindexed'] is True
                assert restored['operationId'] == restored['request']['session'] + ':' + str(restored['request']['id'])
                assert data['restoreReceipt']['status'] == 'committed' and data['restoreReceipt']['result'] == restored['result']
                counts['literalSourceRecords'] += check_snapshot(data['restoredSource'], base_records, 2)
                counts['literalSourceRecords'] += check_snapshot(data['finalSource'], base_records, 4)
                for name, capture in data['completeQueries'].items():
                    assert capture['complete'] is True and capture['outcome'] == 'Pass'
                    assert capture['hits'] == [hit for page in capture['pages'] for hit in page['hits']]
                    assert len(capture['hits']) == len(hits[name]) and len(capture['pages']) == math.ceil(max(1, len(hits[name])) / 100)
                    for index, page in enumerate(capture['pages']):
                        counts['fullPageScores'] += verify_result(page, hits[name], 2, index * 100, 100)
                        counts['pages'] += 1
                subsequent = data['subsequentWrite']
                assert subsequent['add']['revision'] == 3 and subsequent['remove']['revision'] == 4
                added = {'id': 'transport-after', 'text': {'body': 'n9common n9rare transportafter'}, 'metadata': {'group': 'after'}}
                counts['laterWriteScores'] += verify_result(subsequent['found'], expected_hits(materialize([*base_records, added]), 'transportafter'), 3)
                counts['successfulRestoreReceiptsAndWriteRecoveries'] += 1
            elif restored['outcome'] in ['Refused', 'Cancelled']:
                assert data['preservedPriorSource'] == data['priorSource']
                counts['preservedPriorQueries'] += verify_result(data['preservedPriorQuery'], expected_hits(materialize(prior), 'n9oldstate'), 1)
            else:
                assert restored['outcome'] == 'Unknown' and 'Unknown' in data['deliveryState']
        else:
            assert operations['restoreSource']['outcome'] == 'Not run'
        counts['configurations'] += 1
    counts['contexts'] += 1
    pins.append({'path': run['output'], 'sha256': sha(path)})
assert seen == {(role, deadline) for role in ['preN9', 'current'] for deadline in ['default30s', 'explicit60s']}
result = {'kind': 'rx9006-independent-transport-replay-v1', 'status': 'Pass', 'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'verifierSourcePins': [{'path': str(path), 'sha256': sha(path)} for path in [Path(__file__).resolve(), OUT / 'oracle.py']],
          'directory': str(directory), 'reportSha256': sha(directory / 'report.json'), 'normalTimingEvidence': False,
          'counts': dict(counts), 'sameCallObservations': joins, 'clockObservations': clock_observations, 'rowPins': pins,
          'limitations': ['Sparse separate observer-conditioned worker diagnostic; packet retention/startup clocks can affect this lane, never pooled normal performance evidence',
                         'Server receive-to-reply-entry includes server packet capture/admission/queue/native work/result construction; synchronous post window separate and can overlap main delivery',
                         'Same-call duration residual combines client/IPC/event-loop/delivery and clock quantization; not pure transport, exclusive engine CPU, physical copied bytes or calibrated hardware precision',
                         'Main/worker adjacent-clock observations are bounded empirical facts, not a hard universal clock-error bound or timing correction',
                         'Selected source+positions enabled, but detailed private offsets are independently checked in recovery lane, not enumerated here']}
(OUT / 'transport-replay.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ['sameCallObservations', 'clockObservations', 'rowPins']}, indent=2))
