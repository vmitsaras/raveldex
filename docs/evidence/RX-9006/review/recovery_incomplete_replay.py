#!/usr/bin/env python3
"""Final failed-attempt review only; never substitutes for strict full acceptance.

This separate source fork retains the strict reviewer's literal state/source/
offset/receipt/staging checks for committed descriptor rows. It requires a final
failed full-run report and completed outer process record. Uncommitted, orphan
or interrupted data is inventoried, never promoted into verified observations.
No probe, replacement run, inferred zero duration or invented native outcome.
"""
from pathlib import Path
from collections import Counter
import datetime, hashlib, json, math, sys
from oracle import records, materialize, expected_hits, verify_result, verify_root, units

OUT = Path(__file__).resolve().parent
directory = Path(sys.argv[1]).resolve()
destination = OUT / (sys.argv[2] if len(sys.argv) > 2 else 'recovery-incomplete-replay.json')
def read(path):
    return json.loads(path.read_text())
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
def fnv(text):
    value = 2166136261
    raw = text.encode('utf-16-le', 'surrogatepass')
    for index in range(0, len(raw), 2):
        value = ((value ^ (raw[index] | raw[index + 1] << 8)) * 16777619) & 0xffffffff
    return f'{value:08x}'
def typed(error):
    code = error.get('code') or ''
    if 'UNKNOWN' in code or error.get('name') == 'WorkerAdapterError' and code in ['TIMEOUT', 'TERMINATED', 'WORKER_UNAVAILABLE']:
        return 'Unknown'
    if code == 'CANCELLED':
        return 'Cancelled'
    if code in ['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'] or error.get('reason') == 'ENCODED_LIMIT_EXCEEDED':
        return 'Refused'
    return 'Rejected'
prior = [{'id': 'prior-state', 'text': {'body': 'n9oldstate'}, 'metadata': {'group': 'prior'}}]
def jobs_all():
    result = []
    for owner in range(3):
        for deadline in (['explicit60s', 'default30s'] if owner % 2 else ['default30s', 'explicit60s']):
            for size in [1000, 10000]:
                for host in ['Node-direct', 'browser-direct', 'browser-real-module-worker']:
                    for variant in ['source', 'positions-offsets']:
                        for role in (['current', 'acceptedN9', 'preN9'] if owner % 2 else ['preN9', 'acceptedN9', 'current']):
                            if size == 10000 and role == 'acceptedN9':
                                continue
                            result.append({'family': 'adversarial', 'size': size, 'host': host, 'variant': variant, 'role': role, 'deadline': deadline, 'deadlineOptions': {} if deadline == 'default30s' else {'deadlineMs': 60000}, 'owner': owner, 'mode': 'normal' if owner < 2 else 'diagnostic', 'control': False})
    for owner in range(3):
        for deadline in (['explicit60s', 'default30s'] if owner % 2 else ['default30s', 'explicit60s']):
            for family in ['real-docs', 'high-cardinality']:
                for role in (['current', 'preN9'] if owner % 2 else ['preN9', 'current']):
                    result.append({'family': family, 'size': 10000, 'host': 'Node-direct', 'variant': 'source', 'role': role, 'deadline': deadline, 'deadlineOptions': {} if deadline == 'default30s' else {'deadlineMs': 60000}, 'owner': owner, 'mode': 'normal' if owner < 2 else 'diagnostic', 'control': True})
    for index, job in enumerate(result):
        job['index'] = index
        job['key'] = '-'.join(str(value) for value in [index, job['family'], job['size'], job['host'], job['variant'], job['role'], job['deadline'], job['owner'], job['mode']])
    assert len(result) == 204
    return result

report = read(directory / 'report.json')
assert report['kind'] == 'rx9006-recovery-collection-v1'
assert report['outcome'] == 'Fail' and report['profile'] == 'full', 'Only an original final failed full attempt belongs here; strict acceptance remains separate'
assert isinstance(report.get('startedAt'), str) and isinstance(report.get('finishedAt'), str), 'Final finished report required; never read progress as terminal'
started_at = datetime.datetime.fromisoformat(report['startedAt'].replace('Z', '+00:00'))
finished_at = datetime.datetime.fromisoformat(report['finishedAt'].replace('Z', '+00:00'))
assert started_at.tzinfo is not None and finished_at.tzinfo is not None and finished_at >= started_at
assert report.get('guards') in [None, 'Pass', 'Fail'], 'Original guard status is retained without upgrading'
assert report['acceptedPerformanceEvidence'] is False
assert isinstance(report.get('elapsedMs'), (int, float)) and math.isfinite(report['elapsedMs']) and report['elapsedMs'] >= 0
repository = Path(__file__).resolve().parents[4]
wrapper_path = repository / 'docs/evidence/RX-9006/identity' / (directory.name + '.json')
wrapper = read(wrapper_path)
assert wrapper['status'] == 'Fail' and isinstance(wrapper.get('exitCode'), int)
assert isinstance(wrapper.get('completedAt'), str), 'Outer collector process must have completed; no live review'
wrapper_finished = datetime.datetime.fromisoformat(wrapper['completedAt'].replace('Z', '+00:00'))
assert wrapper_finished >= finished_at
assert Path(wrapper['command'][wrapper['command'].index('--output') + 1]).resolve() == directory
if '--profile' in wrapper['command']:
    assert wrapper['command'][wrapper['command'].index('--profile') + 1] == 'full'
prepared_path = Path(report['prepared'])
assert sha(prepared_path) == report['preparedSha256']
prepared = read(prepared_path)
assert prepared['method']['contexts'] == 204 and prepared['method']['budgetMs'] == 10800000
assert prepared['method']['perContextWatchdogMs'] == 300000 and prepared['method']['priorReceiver'] == prior[0]
full_jobs = jobs_all()
assert prepared['jobs'] == full_jobs
assert report['planned'] == 204 and 0 <= len(report['runs']) <= 204
assert [run['job'] for run in report['runs']] == full_jobs[:len(report['runs'])], 'Only the actual serial committed descriptor prefix; no pooled/skipped/replacement cells'
assert report['method']['budgetMs'] == 10800000 and report['method']['perContextWatchdogMs'] == 300000
owner_decision_path = repository / 'docs/evidence/RX-9006/recovery-budget-owner-decision.json'
assert owner_decision_path.is_file(), 'Preserve the original-only owner decision binding'
manifest_path = Path(prepared['artifacts'])
assert sha(manifest_path) == prepared['artifactManifestSha256']
manifest = read(manifest_path)
counts, outcomes, artifacts_seen = Counter(), Counter(), set()
models, source_cache, pins, node_pids, seen = {}, {}, [], set(), set()
def model(family, size, label):
    base_key = (family, size)
    if base_key not in source_cache:
        source_cache[base_key] = records(family, size)
    source_records = source_cache[base_key]
    if label in ['donor', 'donor-export-refused']:
        input_records, revision = source_records, math.ceil(size / 256)
    elif label.endswith('-before') or label.endswith('-preserved'):
        input_records, revision = prior, 1
    elif label.endswith('-restored'):
        input_records, revision = source_records, 2
    elif label.endswith('-recovery-write'):
        input_records = [{'id': prior[0]['id'], 'text': {'body': 'n10afterwrite n9red n9blue'}, 'metadata': {'group': 'after'}}]
        revision = 2
    elif label.endswith('-later-write'):
        input_records = [{'id': source_records[0]['id'], 'text': {'body': 'n10afterwrite n9red n9blue'}, 'metadata': {'group': 'after'}}, *source_records[1:]]
        revision = 3
    else:
        raise AssertionError(('unknown state label', label))
    cache_key = (family, size, 'prior' if input_records is prior else label.split('-', 1)[-1] if label not in ['donor', 'donor-export-refused'] else 'donor')
    # Caching depends on exact authored records, never current native roots.
    cache_key = (family, size, len(input_records), revision, input_records[0]['id'], input_records[0]['text']['body'] if isinstance(input_records[0]['text']['body'], str) else tuple(input_records[0]['text']['body']))
    if cache_key not in models:
        models[cache_key] = materialize(input_records)
    return models[cache_key], revision

def artifact(meta):
    name = meta['artifact']
    assert '/' not in name and '\\' not in name and name not in ['', '.', '..']
    path = directory / name
    assert path.is_file() and sha(path) == meta['sha256'] and path.stat().st_size == meta['bytes']
    artifacts_seen.add(name)
    return path

def verify_snapshot(meta, reference, revision):
    path = artifact(meta)
    encoded = path.read_text()
    envelope = json.loads(encoded)
    assert set(envelope) == {'format', 'formatVersion', 'codec', 'body', 'integrity'}
    assert envelope['format'] == 'raveldex-source' and envelope['formatVersion'] == 1
    assert envelope['codec'] == {'id': 'raveldex-json-v1', 'version': 1}
    assert envelope['integrity'] == {'algorithm': 'fnv1a32-utf16', 'value': fnv(canonical(envelope['body']))}
    assert envelope['body']['header']['originRevision'] == revision
    expected_records = sorted([{'id': item['id'], 'text': {'body': item['text']['body'] if isinstance(item['text']['body'], list) else [item['text']['body']]}, 'metadata': item.get('metadata', {})} for item in reference['records']], key=lambda item: item['id'])
    assert envelope['body']['payload'] == {'records': expected_records}, 'complete source record/metadata/value order'
    counts['sourceSnapshots'] += 1
    counts['sourceRecordAssertions'] += len(expected_records)
    return encoded

query_definitions = {'common': lambda family: {'kind': 'text', 'text': 'the' if family == 'real-docs' else 'n9common', 'fields': ['body']},
                     'rare': lambda family: {'kind': 'text', 'text': 'unqualified' if family == 'real-docs' else 'n9rare', 'fields': ['body']},
                     'narrow-prefix': lambda family: {'kind': 'group', 'fields': ['body'], 'variants': [{'text': 'snap' if family == 'real-docs' else 'n9key00000', 'match': 'prefix'}]},
                     'source-phrase': lambda family: {'kind': 'extension', 'capability': 'phrases', 'payload': {'text': 'source mapping' if family == 'real-docs' else 'n9red n9blue', 'fields': ['body']}}}
query_cache = {}
prefix_cache = {}
def prefix_summaries(reference):
    identity = id(reference)
    if identity in prefix_cache:
        return prefix_cache[identity]
    vocabulary, total, result = set(), Counter(), {}
    for index, record in enumerate(reference['records'], 1):
        doc = reference['documents'][record['id']]
        field = doc['fields'].get('body', {'terms': {}, 'length': 0})
        vocabulary.update(field['terms'])
        source = reference['sources'][record['id']]
        position = reference['positions'][record['id']]
        total.update({'tokens': field['length'], 'textCodeUnits': doc['textCodeUnits'], 'postingEntries': len(field['terms']),
                      'sourceEntries': source['retainedEntries'], 'positionEntries': position['retainedEntries'],
                      'occurrences': position['occurrenceCount'], 'termEntries': position['termEntries'], 'termCodeUnits': position['termCodeUnits']})
        if index == 1 or index % 256 == 0 or index == len(reference['records']):
            result[index] = {'counts': {'documents': index, 'tokens': total['tokens'], 'textCodeUnits': total['textCodeUnits'],
                                        'postingEntries': total['postingEntries'], 'dictionaryEntries': len(vocabulary)},
                             'source': {'retainedEntries': total['sourceEntries'], 'textCodeUnits': total['textCodeUnits']},
                             'positions': {'retainedEntries': total['positionEntries'], 'occurrenceCount': total['occurrences'],
                                           'offsetCount': total['occurrences'], 'termEntries': total['termEntries'], 'termCodeUnits': total['termCodeUnits']}}
    prefix_cache[identity] = result
    return result
def verify_summary(summary, expected, variant, revision):
    assert summary['revision'] == revision and summary['counts'] == expected['counts']
    if 'documents' in summary:
        assert summary['documents'] == expected['counts']['documents']
    participants = {item['id']: item for item in summary['participants']}
    assert set(participants) == ({'source'} if variant == 'source' else {'source', 'positions'})
    for name, item in participants.items():
        assert item['revision'] == revision and item['records'] == expected['counts']['documents']
        assert item['kind'] == ('raveldex-source-v1' if name == 'source' else 'raveldex-positions-v1')
        for key, value in expected[name].items():
            assert item[key] == value
        if 'sealed' in item:
            assert item['sealed'] is False

def verify_queries(query_rows, reference, family, size, revision):
    assert [item['id'] for item in query_rows] == list(query_definitions)
    for item in query_rows:
        if item['outcome'] == 'Pass':
            key = (family, size, item['id'])
            if key not in query_cache:
                query_cache[key] = expected_hits(reference, query_definitions[item['id']](family))
            counts['queryScores'] += verify_result(item['result'], query_cache[key], revision)
            counts['successfulQueries'] += 1
        else:
            assert item['outcome'] == typed(item['error']) == 'Refused'
            counts['refusedQueries'] += 1

for run in report['runs']:
    job = run['job']
    assert job == full_jobs[job['index']] and job['key'] not in seen
    seen.add(job['key'])
    path = directory / run['file']
    assert path.parent == directory and sha(path) == run['sha256']
    row = read(path)
    assert row['job'] == job and row['outcome'] == row['exercise']['outcome'] == 'Collected'
    expected_artifact = next(item for item in manifest['artifacts'] if item['role'] == job['role'])
    assert row['artifactSha256'] == expected_artifact['sha256'] and row['preparedSha256'] == report['preparedSha256']
    assert row['identity'] == prepared['workloads'][job['family'] + '-' + str(job['size'])]['identity']
    if job['host'] == 'Node-direct':
        assert row['pid'] not in node_pids and row['runtime']['node'] == 'v24.21.0'
        node_pids.add(row['pid'])
        process = read(directory / (job['key'] + '.process.json'))
        assert process['code'] == 0 and process['timedOut'] is False and process['pid'] == row['pid']
    else:
        assert row['pageErrors'] == row['externalRequests'] == [] and row['browserVersion'] == '149.0.7827.55'
    case = row['exercise']
    assert not case.get('cleanupErrors'), 'cleanup failure hidden by successful collection'
    assert case['priorRecord'] == prior[0] and case['deadlineOptions'] == job['deadlineOptions']
    operations = case['samples'] if job['mode'] == 'normal' else case['observations']
    assert (case['observations'] if job['mode'] == 'normal' else case['samples']) == []
    assert [item['operation'] for item in operations] == ['build', 'exportSource', 'restoreSource', 'deadlineRestore', 'abortedRestore']
    base_model, donor_revision = model(job['family'], job['size'], 'donor')
    if operations[0]['outcome'] == 'Pass':
        assert operations[0]['result']['revision'] == donor_revision
        verify_queries(case['donorQueries'], base_model, job['family'], job['size'], donor_revision)
    else:
        assert all(item['outcome'] == 'Not run' for item in operations[1:])
    source_by_label, state_by_label, membership_by_label = {}, {}, {}
    for entry in case.get('verification', []):
        label = entry['label']
        reference, revision = model(job['family'], job['size'], label)
        if entry['type'] == 'source':
            assert label not in source_by_label
            source_by_label[label] = verify_snapshot(entry, reference, revision)
        elif entry['type'] == 'private-root':
            if entry.get('outcome') == 'Not observed':
                assert job['host'] == 'browser-real-module-worker' and job['mode'] == 'normal'
                counts['explicitUnobservedPrivateRoots'] += 1
                continue
            path_state = artifact(entry)
            state = read(path_state)
            assert state['revision'] == entry['revision'] == revision
            for key, value in verify_root(state, reference, job['variant']).items():
                counts['root:' + key] += value
            state_by_label[label] = state
            counts['privateRootCaptures'] += 1
        elif entry['type'] == 'complete-membership':
            assert entry['outcome'] == 'Pass' and entry['records'] == len(reference['records']) and entry['pageSize'] == 100
            all_hits = [{'id': item['id'], 'score': 0} for item in sorted(reference['records'], key=lambda item: item['id'])]
            assert len(entry['pages']) == math.ceil(max(1, len(all_hits)) / 100)
            for index, page in enumerate(entry['pages']):
                counts['membershipScores'] += verify_result(page, all_hits, revision, index * 100, 100)
                counts['membershipPages'] += 1
            membership_by_label[label] = entry
        else:
            raise AssertionError(('unknown verification type', entry))
    if operations[1]['outcome'] == 'Pass':
        export = operations[1]['result']
        encoded = verify_snapshot(export, base_model, donor_revision)
        assert len(encoded.encode()) == export['encodedBytes'] and units(encoded) == export['encodedCodeUnits']
    elif operations[0]['outcome'] == 'Pass':
        assert all(item['outcome'] == 'Not run' for item in operations[2:])
        assert operations[1]['donorQueriesPreserved'] is True
    for operation in operations:
        name, outcome = operation['operation'], operation['outcome']
        outcomes[(job['mode'], name, outcome)] += 1
        counts['operationRows'] += 1
        if outcome == 'Not run':
            assert operation['attempts'] == 0 and operation['reason']
            for key in ['wallMs', 'invocationToReturnMs', 'returnToSettlementMs', 'cpuUserMs', 'cpuSystemMs', 'counters', 'result', 'error']:
                assert key not in operation
            continue
        assert operation['attempts'] == 1
        if name in ['restoreSource', 'deadlineRestore', 'abortedRestore']:
            counts['attemptedMutatingRestores'] += 1
        for key in ['wallMs', 'invocationToReturnMs', 'returnToSettlementMs']:
            assert math.isfinite(operation[key]) and operation[key] >= 0
        assert abs(operation['wallMs'] - operation['invocationToReturnMs'] - operation['returnToSettlementMs']) < 1e-6
        assert operation['deadlineOptions'] == ({'deadlineMs': 1} if name == 'deadlineRestore' else job['deadlineOptions'])
        assert ('counters' in operation) == (job['mode'] == 'diagnostic')
        if job['host'] == 'Node-direct':
            assert all(math.isfinite(operation[key]) and operation[key] >= 0 for key in ['cpuUserMs', 'cpuSystemMs'])
        else:
            assert 'cpuUserMs' not in operation and 'cpuSystemMs' not in operation
        if outcome != 'Pass':
            assert typed(operation['error']) == outcome != 'Rejected'
        if job['mode'] == 'diagnostic':
            for key in ['emittedSteps', 'emittedWorkUnits', 'hostYields', 'continuationsScheduled']:
                assert isinstance(operation['counters'][key], int) and operation['counters'][key] >= 0
                counts['diagnostic:' + key] += operation['counters'][key]
            diagnostic = operation['counters']['restore']
            assert diagnostic['observerErrors'] == []
            assert diagnostic['authoritativeUnchangedDuringStaging'] is True
            assert len(diagnostic['memorySamples']) <= 128
            counts['diagnosticProcessSamples'] += len(diagnostic['memorySamples'])
            if 'oldRoot' in diagnostic:
                old_model, _ = model(job['family'], job['size'], name + '-before')
                verify_summary(diagnostic['oldRoot'], prefix_summaries(old_model)[1], job['variant'], 1)
                assert diagnostic['inputActive'] is False
                assert isinstance(diagnostic['finalAuthoritativeSame'], bool)
                if outcome == 'Pass':
                    assert diagnostic['finalAuthoritativeSame'] is False
                    verify_summary(diagnostic['finalAuthoritativeRoot'], prefix_summaries(base_model)[job['size']], job['variant'], 2)
                    assert diagnostic['recordsAttempted'] == diagnostic['recordsCaptured'] == diagnostic['recordsCompleted'] == job['size']
                elif outcome in ['Refused', 'Cancelled']:
                    assert diagnostic['finalAuthoritativeSame'] is True
                    verify_summary(diagnostic['finalAuthoritativeRoot'], prefix_summaries(old_model)[1], job['variant'], 1)
                completed = diagnostic['recordsCompleted']
                expected_snapshot_counts = ([1] if completed >= 1 else []) + list(range(256, completed + 1, 256))
                assert [item['counts']['documents'] for item in diagnostic['snapshots']] == expected_snapshot_counts
                for snapshot in diagnostic['snapshots']:
                    prefix_count = snapshot['counts']['documents']
                    assert snapshot['authoritativeSame'] is True
                    verify_summary(snapshot, prefix_summaries(base_model)[prefix_count], job['variant'], prefix_count)
                    counts['independentStagedPrefixSummaries'] += 1
                counts['observedRestoreTerminalOwnershipFlags'] += 1
            else:
                assert diagnostic['finalAuthoritativeSame'] is None and 'inputActive' not in diagnostic
                assert diagnostic['snapshots'] == []
                counts['diagnosticNoRestoreCursorEntered'] += 1
        if name not in ['restoreSource', 'deadlineRestore', 'abortedRestore']:
            continue
        assert operation['priorRevision'] == operation['priorDocuments'] == 1
        if outcome == 'Unknown':
            assert 'Unknown' in operation['stateClaim'] and not operation.get('oldSourceBytesPreserved') and not operation.get('oldRemoved')
            counts['unresolvedOrReconciledUnknowns'] += 1
            continue
        before_label = name + '-before'
        assert before_label in source_by_label and before_label in membership_by_label
        if outcome == 'Pass':
            receipt = operation['result']
            assert receipt['revision'] == 2 and receipt['originRevision'] == donor_revision and receipt['format'] == 'raveldex-source' and receipt['reindexed'] is True
            assert operation['oldRemoved'] is True and operation['completeSource'] == {'outcome': 'Pass', 'records': job['size']}
            verify_queries(operation['receiverQueries'], base_model, job['family'], job['size'], 2)
            after_label, write_label, after_revision = name + '-restored', name + '-later-write', 3
        else:
            assert operation['oldSourceBytesPreserved'] is operation['oldQueriesPreserved'] is True
            after_label, write_label, after_revision = name + '-preserved', name + '-recovery-write', 2
            assert source_by_label[before_label] == source_by_label[after_label]
            if before_label in state_by_label:
                assert state_by_label[before_label]['canonical'] == state_by_label[after_label]['canonical']
                assert state_by_label[before_label]['encounterCanonical'] == state_by_label[after_label]['encounterCanonical']
                assert operation['oldRootPreserved'] is True
            counts['authoritativeOldSourcePreservations'] += 1
        for label in [after_label, write_label]:
            assert label in source_by_label and label in membership_by_label
            if job['host'] != 'browser-real-module-worker' or job['mode'] == 'diagnostic':
                assert label in state_by_label
        write = operation['laterWrite']
        assert write['outcome'] == 'Pass' and write['receipt']['changed'] is True and write['receipt']['revision'] == after_revision
        write_model, _ = model(job['family'], job['size'], write_label)
        counts['laterWriteScores'] += verify_result(write['query'], expected_hits(write_model, 'n10afterwrite'), after_revision)
        assert write['sourceRecords'] == len(write_model['records'])
        counts['subsequentWrites'] += 1
    for resource in case['resources']:
        if job['host'] == 'Node-direct':
            assert 'workerObjectsOwned' not in resource
        else:
            assert resource['diagnosticPending'] == 0
            assert resource['workerObjectsOwned'] == (0 if job['host'] == 'browser-direct' else resource['created'])
            counts['postTerminalZeroDiagnosticPendingChecks'] += 1
            # These checkpoints precede context-finally worker termination. The
            # deliberately retained harness Set is not a native active-worker or
            # heap count, and must not be relabelled a zero-owned-worker claim.
            if job['host'] == 'browser-real-module-worker':
                counts['preTerminationHarnessWorkerReferences'] += resource['workerObjectsOwned']
    counts['contexts'] += 1
    pins.append({'file': run['file'], 'sha256': sha(path)})
assert len(seen) == len(report['runs'])
assert len(seen) <= 204
counts['actualNodeProcesses'] = len(node_pids)
counts['pinnedStateAndSourceArtifacts'] = len(artifacts_seen)

# Inventory every actual regular raw file only after terminal state. A native
# child may have written a Collected row before the parent refused to commit its
# descriptor (watchdog, validation or cap). Such data remains UNACCEPTED.
raw_files, nonregular_entries = {}, []
for path in sorted(directory.iterdir()):
    if path.is_symlink() or not path.is_file():
        nonregular_entries.append({'name': path.name, 'symlink': path.is_symlink(), 'directory': path.is_dir()})
        continue
    raw_files[path.name] = {'file': path.name, 'bytes': path.stat().st_size, 'sha256': sha(path)}
assert nonregular_entries == [], 'Unexpected linked/directory raw entries require explicit review'
assert artifacts_seen <= set(raw_files), 'A replayed state/source artifact is absent from the final raw inventory'
control_files = {'report.json', 'progress.json', 'start.json'}
job_files = {job['key']: [] for job in full_jobs}
orphan_files = []
for name, meta in raw_files.items():
    if name in control_files:
        continue
    matching = [job for job in full_jobs if name.startswith(job['key'] + '.') or name.startswith(job['key'] + '-')]
    if len(matching) == 1:
        job_files[matching[0]['key']].append(meta)
    else:
        orphan_files.append({**meta, 'reason': 'No unique frozen job filename attribution; not a verified observation'})
uncommitted_jobs = []
for job in full_jobs:
    if job['key'] in seen:
        continue
    evidence = job_files[job['key']]
    detail = {'job': job, 'completedDescriptor': False, 'semanticVerification': 'Not run: no committed descriptor',
              'nativeOutcome': None, 'nativeAttempts': None,
              'status': 'Interrupted or uncommitted evidence present' if evidence else 'No completed observation recorded',
              'files': evidence}
    row_name = job['key'] + '.json'
    if row_name in raw_files:
        try:
            unaccepted = read(directory / row_name)
            detail['unacceptedRowHeader'] = {'kind': unaccepted.get('kind'), 'outcome': unaccepted.get('outcome'),
                                            'jobIdentityMatchesFrozen': unaccepted.get('job') == job,
                                            'exerciseOutcome': (unaccepted.get('exercise') or {}).get('outcome'),
                                            'note': 'Header inventory only; this uncommitted row contributes zero verified observations, never a fake zero-time/native outcome'}
        except (ValueError, TypeError, AttributeError) as error:
            detail['unacceptedRowParseError'] = str(error)
    process_name = job['key'] + '.process.json'
    if process_name in raw_files:
        try:
            process = read(directory / process_name)
            detail['processTerminalFacts'] = {key: process.get(key) for key in ['code', 'signal', 'timedOut', 'pid']}
        except (ValueError, TypeError, AttributeError) as error:
            detail['processRecordParseError'] = str(error)
    uncommitted_jobs.append(detail)
assert len(uncommitted_jobs) + len(seen) == 204
active_job = report.get('activeJob')
if active_job is not None:
    assert active_job == full_jobs[active_job['index']]
failed_context = report.get('failedContext')
if failed_context is not None:
    assert failed_context['job'] == full_jobs[failed_context['job']['index']]
    failure_file = failed_context['file']
    assert Path(failure_file).name == failure_file and failure_file in raw_files
committed_row_files = {run['file'] for run in report['runs']}
committed_auxiliary_files = {job['key'] + suffix for job in full_jobs if job['key'] in seen for suffix in ['.config.json', '.process.json']}
unreferenced_for_completed_jobs = [meta for job in full_jobs if job['key'] in seen for meta in job_files[job['key']]
                                  if meta['file'] not in artifacts_seen | committed_row_files | committed_auxiliary_files]
assert counts['contexts'] == len(report['runs']) and counts['operationRows'] == 5 * len(report['runs'])
result = {'kind': 'rx9006-independent-incomplete-recovery-review-v1',
          'status': 'INCOMPLETE — original full attempt remains unaccepted',
          'completedDescriptorSemanticVerification': 'Pass' if len(seen) else 'Not run: no committed completed rows',
          'fullAcceptance': False, 'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'verifierSourcePins': [{'path': str(path), 'sha256': sha(path)} for path in [Path(__file__).resolve(), OUT / 'recovery_replay.py', OUT / 'oracle.py']],
          'directory': str(directory), 'profile': report['profile'], 'reportSha256': sha(directory / 'report.json'), 'preparedSha256': sha(prepared_path),
          'acceptedPerformanceEvidence': False,
          'originalCollector': {'outcome': report['outcome'], 'guards': report.get('guards'), 'failure': report.get('failure'),
                                'guardFailure': report.get('guardFailure'), 'budgetExceeded': report.get('budgetExceeded'),
                                'startedAt': report['startedAt'], 'finishedAt': report['finishedAt'], 'elapsedMs': report['elapsedMs'],
                                'budgetMs': 10800000, 'perContextWatchdogMs': 300000, 'activeJob': active_job, 'failedContext': failed_context,
                                'wrapperStatus': wrapper['status'], 'wrapperExitCode': wrapper['exitCode'], 'wrapperSha256': sha(wrapper_path)},
          'originalOnlyOwnerDecision': {'path': str(owner_decision_path), 'sha256': sha(owner_decision_path), 'scope': 'Original180-minute attempt only; no rerun, extension, replacement cell or probe pooling'},
          'coverage': {'completedContexts': counts['contexts'], 'frozenFullContexts': 204, 'fullCollectionAttempted': True,
                       'completeContextCoverage': len(seen) == 204, 'collectionAccepted': False, 'missingCommittedContexts': len(uncommitted_jobs),
                       'attemptedMutatingRestores': counts['attemptedMutatingRestores'], 'observedSubsequentWrites': counts['subsequentWrites']},
          'counts': dict(counts), 'operationOutcomes': [{'mode': mode, 'operation': name, 'outcome': outcome, 'rows': count} for (mode, name, outcome), count in sorted(outcomes.items())],
          'rowPins': pins,
          'missingOrUncommittedContextCounts': {'missingCommittedContexts': len(uncommitted_jobs),
                                               'withUncommittedRawEvidence': sum(bool(job['files']) for job in uncommitted_jobs),
                                               'withoutRecordedRawFiles': sum(not job['files'] for job in uncommitted_jobs),
                                               'unacceptedRowFiles': sum('unacceptedRowHeader' in job or 'unacceptedRowParseError' in job for job in uncommitted_jobs)},
          'missingOrUncommittedContexts': uncommitted_jobs, 'orphanFiles': orphan_files,
          'rawInventory': {'regularFiles': len(raw_files), 'files': list(raw_files.values()), 'allReferencedStateAndSourceArtifactsAccountedFor': True,
                           'unreferencedFilesForCompletedJobs': unreferenced_for_completed_jobs},
          'method': 'Independent Python frozen literal corpus, Unicode-category/NFKC/original UTF-16 scan, all reverse TF/DF/postings/counts/source/positions/offset assertions, complete public membership, source integrity, receipt/revision/old-state/later-write and selected numerical result replay. No engine/production scorer/tokenizer/JS-helper imports or execution.',
          'limitations': ['Incomplete failed full attempt: only committed complete run-descriptor rows receive semantic replay. Missing, interrupted, orphan and unaccepted row data never become successful or zero-attempt measurements',
                         'Original collection outcome/guards and cap are retained; this review cannot make RX9006 done or satisfy full204-context acceptance',
                         'No rerun, extension or probe pooling; native attempts/outcomes for uncommitted contexts stay unknown rather than fabricated zeros',
                         'Normal public worker has no private root seam; complete private positions/root are diagnostic observations, normal source/membership/receipt/later-write observations remain separate',
                         'Source projection revisions are normalized by capture and live root immutability/AVL shape are source/online checks, not independently reobserved by Python serialized replay',
                         'Recovery has two ordinary owners and no p95 or frozen three-owner separated-range speed verdict',
                         'Only actually attempted fields are replayed; zero-attempt Not-run restores establish no fresh restore/old-state/later-write observation',
                         'Read-only replay cannot establish scheduler fairness, physical input, retained/peak/browser heap or cause of historical timeout']}
destination.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ['rowPins', 'rawInventory', 'missingOrUncommittedContexts', 'orphanFiles']}, indent=2))
