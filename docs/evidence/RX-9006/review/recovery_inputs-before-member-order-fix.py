#!/usr/bin/env python3
"""Independent stopped-original-attempt input and watchdog-scope audit."""
from pathlib import Path
import datetime, gzip, hashlib, json, os
from oracle import records

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'docs/evidence/RX-9006'
RAW = Path('/private/tmp/raveldex-rx9006-20261105/recovery-full-01')
def read(path):
    return json.loads(path.read_text())
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def inventory(directory):
    assert directory.resolve() == directory and not directory.is_symlink()
    actual = {}
    for path in directory.rglob('*'):
        assert not path.is_symlink()
        if path.is_file():
            actual[str(path.relative_to(directory))] = (path.stat().st_size, sha(path))
    return actual
report = read(RAW / 'report.json')
wrapper_path = BASE / 'identity/recovery-full-01.json'
wrapper = read(wrapper_path)
guard_path = BASE / 'identity/recovery-full-01-worktree-guard.json.gz'
guard = json.loads(gzip.decompress(guard_path.read_bytes()))
assert report['outcome'] == 'Fail' and report['guards'] == 'Pass' and report['budgetExceeded'] is True
assert report['acceptedPerformanceEvidence'] is False and report['planned'] == 204 and len(report['runs']) == 146
assert report['method']['budgetMs'] == 10800000 and report['method']['perContextWatchdogMs'] == 300000
assert wrapper['status'] == 'Fail' and wrapper['exitCode'] == 1 and wrapper['headAndAllNonTaskEvidenceInputsUnchanged'] is True
assert guard['stable'] is True and guard['before'] == guard['after']
before = guard['before']['files']
original_prepared = Path(report['prepared'])
sealed = RAW / 'prepared.json'
assert sha(sealed) == sha(original_prepared) == report['preparedSha256']
copy_path = BASE / 'identity/recovery-postcollection-prepared-copy.json'
copy = read(copy_path)
assert copy['status'] == 'Pass' and copy['sha256'] == report['preparedSha256']
assert Path(copy['source']) == original_prepared and Path(copy['destination']) == sealed
assert copy['collectorFinishedAt'] == report['finishedAt']
assert datetime.datetime.fromisoformat(copy['copiedAt']) > datetime.datetime.fromisoformat(report['finishedAt'].replace('Z', '+00:00'))
prepared = read(sealed)
manifest_path = Path(prepared['artifacts'])
assert sha(manifest_path) == prepared['artifactManifestSha256']
manifest = read(manifest_path)
for pin in prepared['harness']:
    assert before[pin['path']] == pin['sha256'] == sha(ROOT / pin['path'])
for pin in manifest['source']['runtimeSourceInventory']:
    assert before[pin['path']] == pin['sha256'] == sha(ROOT / pin['path'])
freeze = read(ROOT / 'docs/evidence/RX-9001/method-freeze.json')
for name, digest in freeze['files'].items():
    assert before[name] == digest == sha(ROOT / name)
archives, original_counts = {}, {}
for artifact in manifest['artifacts']:
    archives[artifact['role']] = sha(Path(artifact['archive']))
    assert archives[artifact['role']] == artifact['sha256']
    if artifact['role'] in ['preN9', 'acceptedN9', 'current']:
        expected = {item['path']: (item['bytes'], item['sha256']) for item in artifact['members']}
        assert inventory(Path(artifact['consumer']) / 'node_modules/@vmitsaras/raveldex') == expected
        original_counts[artifact['role']] = len(expected)
staged_count = 0
for package in prepared['packages'].values():
    artifact = next(item for item in manifest['artifacts'] if item['role'] == package['role'])
    assert package['artifactSha256'] == artifact['sha256'] and package['archive'] == artifact['archive']
    expected_shas = {item['path']: item['sha256'] for item in artifact['members']}
    if package['mode'] == 'normal':
        assert package['instrumentation'] is None
    else:
        assert package['mode'] == 'diagnostic'
        instrumentation = package['instrumentation']
        assert instrumentation['originalMembers'] == artifact['members']
        for patch in [*instrumentation['generic']['patches'], *instrumentation['patches']]:
            assert expected_shas[patch['path']] == patch.get('originalSha256', patch.get('beforeSha256'))
            expected_shas[patch['path']] = patch['instrumentedSha256']
    actual = inventory(Path(package['directory']) / 'node_modules/@vmitsaras/raveldex')
    assert actual == {item['path']: (item['bytes'], item['sha256']) for item in package['inventory']}
    assert {name: value[1] for name, value in actual.items()} == expected_shas
    staged_count += len(actual)
for pin in prepared['preparedFiles']:
    assert sha(Path(pin['path'])) == pin['sha256']
for workload in prepared['workloads'].values():
    data = read(Path(workload['path']))
    assert data['identity'] == workload['identity']
    assert data['records'] == records(data['identity']['family'], data['identity']['size'])
    assert data['schema'] == {'text': {'body': {}}, 'metadata': {'group': {'type': 'string'}}}
environment = manifest['environment']
original_environment = read(ROOT / 'docs/evidence/RX-9001/identity/artifacts.json')['environment']
for key in ['node', 'npm', 'os', 'uname']:
    assert environment[key] == original_environment[key]
assert environment['browsers']['chromium'] == original_environment['browsers']['chromium']
assert prepared['environment']['chromium'] == environment['browsers']['chromium']
for executable in [environment['node']['executable'], environment['browsers']['chromium']['executable']]:
    path = Path(executable.get('path') or environment['node']['execPath'])
    assert sha(path) == executable['sha256']
assert os.uname().release == environment['uname']['release'] and os.cpu_count() == environment['node']['hardware']['logicalCpuCount']
failed = read(RAW / report['failedContext']['file'])
assert failed['job'] == report['activeJob'] == prepared['jobs'][146]
assert failed['nativeOutcome'] is None and failed['outcome'] == 'Fail'
assert failed['pageErrors'] == failed['externalRequests'] == []
assert failed['error']['message'] == report['failure']['message'] == 'Absolute context watchdog, not native deadline'
assert 0 < failed['contextElapsedMs'] < 300000
assert report['elapsedMs'] > 10800000
source = (ROOT / 'bench/n10/host-recovery.mjs').read_text()
assert 'Math.min(RECOVERY_METHOD.perContextWatchdogMs,budget-(performance.now()-started))' in source
assert 'remaining-(performance.now()-contextStart)' in source
assert 'contextElapsedMs<=RECOVERY_METHOD.perContextWatchdogMs' in source
assert 'report.elapsedMs>budget' in source
semantic = read(OUT / 'recovery-incomplete-replay.json')
assert semantic['reportSha256'] == sha(RAW / 'report.json') and semantic['fullAcceptance'] is False
assert semantic['completedDescriptorSemanticVerification'] == 'Pass'
assert semantic['orphanFiles'] == [{'file': 'prepared.json', 'bytes': sealed.stat().st_size, 'sha256': sha(sealed),
                                   'reason': 'No unique frozen job filename attribution; not a verified observation'}]
result = {'kind': 'rx9006-independent-incomplete-recovery-input-audit-v1', 'status': 'Pass for original inputs; collection remains INCOMPLETE',
          'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'fullAcceptance': False,
          'originalCollector': {'outcome': report['outcome'], 'guards': report['guards'], 'elapsedMs': report['elapsedMs'], 'budgetMs': 10800000,
                                'reportedOverrunMs': report['elapsedMs'] - 10800000, 'wrapperStatus': wrapper['status'], 'wrapperExitCode': wrapper['exitCode'],
                                'headAndNonTaskInputsUnchanged': True, 'head': guard['before']['head']},
          'inputChecks': {'guardedNonTaskFilesUnchanged': len(before), 'runtimeSourceInputs': len(manifest['source']['runtimeSourceInventory']),
                          'frozenMethodFiles': len(freeze['files']), 'harnessPins': len(prepared['harness']), 'originalInstalledMembers': original_counts,
                          'stagedPackages': len(prepared['packages']), 'stagedMembers': staged_count, 'preparedFilePins': len(prepared['preparedFiles']),
                          'independentLiteralWorkloadFiles': len(prepared['workloads']), 'archivePins': archives,
                          'normalPackagesExact': True, 'diagnosticTransformChainsExact': True, 'frozenEnvironmentAndExecutablesMatch': True},
          'watchdogScope': {'interruptedIndex': 146, 'contextElapsedMs': failed['contextElapsedMs'], 'contextBoundMs': 300000,
                            'conclusion': 'Remaining-total 180-minute orchestration watchdog, not an observed native30s deadline or full300s context exhaustion',
                            'basis': 'Unchanged source arms min(contextBound, remainingTotal) and subtracts context setup from its watchdog; actual context elapsed176237.58ms is below300000 while final global elapsed exceeds10800000. Failure is generic Error with nativeOutcome:null.',
                            'nativeOutcome': None, 'timerArmValueRecorded': False,
                            'limitation': 'Exact original watchdog-arm remaining milliseconds and native in-flight publication state were not recorded; no rollback/commit/refusal/Unknown code is invented.'},
          'postcollectionControl': {'file': 'prepared.json', 'sha256': sha(sealed), 'bytes': sealed.stat().st_size,
                                    'provenance': str(copy_path.relative_to(ROOT)), 'provenanceSha256': sha(copy_path),
                                    'classification': 'Known postcollection byte-identical sealed-preparation control; not unexplained native orphan data'},
          'pins': [{'path': str(path), 'sha256': sha(path)} for path in [Path(__file__).resolve(), RAW / 'report.json', sealed, wrapper_path, guard_path, manifest_path, copy_path, OUT / 'recovery-incomplete-replay.json']],
          'limitations': ['No full204-cell acceptance, rerun, extension, probe pooling, native cap change or cause attribution to historical high-cardinality timeout',
                         'Filesystem/source/recorded environment identities do not prove absence of all external OS activity, heap peaks or physical responsiveness']}
(OUT / 'recovery-inputs.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'pins'}, indent=2))
