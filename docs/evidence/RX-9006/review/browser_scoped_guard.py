#!/usr/bin/env python3
"""Audit broad guard failure without rewriting it or excusing measured drift."""
from pathlib import Path
import datetime, gzip, hashlib, json, os, tarfile

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'docs/evidence/RX-9006'
RAW = Path('/private/tmp/raveldex-rx9006-20261105/browser-full-01')
def read(path):
    return json.loads(path.read_text())
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def inventory(directory):
    assert directory.resolve() == directory and not directory.is_symlink()
    result = {}
    for path in directory.rglob('*'):
        assert not path.is_symlink()
        if path.is_file():
            result[str(path.relative_to(directory))] = (path.stat().st_size, sha(path))
    return result

guard_path = BASE / 'identity/browser-full-01-worktree-guard.json.gz'
guard = json.loads(gzip.decompress(guard_path.read_bytes()))
before, after = guard['before']['files'], guard['after']['files']
assert guard['stable'] is False and guard['before']['head'] == guard['after']['head'] == '576c0412aa7876ec443abd2ee884c2d286ba6b0c'
changed = sorted(path for path in before.keys() & after.keys() if before[path] != after[path])
added, removed = sorted(after.keys() - before.keys()), sorted(before.keys() - after.keys())
assert changed == ['IMPLEMENTATION_TASKS.md', 'ROADMAP.md', 'docs/planning/GITHUB_TRACKING.md', 'docs/planning/github-links.json']
assert added == ['docs/planning/N11_GITHUB.md'] and removed == []
wrapper_path = BASE / 'identity/browser-full-01.json'
wrapper = read(wrapper_path)
assert wrapper['status'] == 'Fail' and wrapper['exitCode'] == 0 and wrapper['headAndAllNonTaskEvidenceInputsUnchanged'] is False
report_path = RAW / 'report.json'
report = read(report_path)
assert report['outcome'] == 'Collected' and report['guards'] == 'Pass' and report['profile'] == 'full'
assert report['coverage']['contexts'] == 96 and report['coverage']['normalCalls'] == 6048 and report['coverage']['diagnosticCalls'] == 96
prepared = report['prepared']
manifest_path = Path(prepared['artifactManifest'])
assert sha(manifest_path) == prepared['artifactManifestSha256']
manifest = read(manifest_path)
assert manifest['provisional'] is False and manifest['freshCurrentCandidate'] is True
for pin in prepared['harness']:
    assert before[pin['path']] == after[pin['path']] == pin['sha256'] == sha(ROOT / pin['path'])
for pin in manifest['source']['runtimeSourceInventory']:
    assert before[pin['path']] == after[pin['path']] == pin['sha256'] == sha(ROOT / pin['path'])
method = read(ROOT / 'docs/evidence/RX-9001/method-freeze.json')
for path, digest in method['files'].items():
    assert before[path] == after[path] == digest == sha(ROOT / path)
for path in ['docs/planning/roadmap.json', 'docs/specs/N11_UI_UX_POLISH.md']:
    assert path in before and path in after and before[path] == after[path] == sha(ROOT / path)

archives, compiled = {}, {}
for artifact in manifest['artifacts']:
    archive = Path(artifact['archive'])
    assert sha(archive) == artifact['sha256']
    actual = {}
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar:
            assert member.isfile() and member.name.startswith('package/')
            name = member.name[8:]
            assert name not in actual and all(part not in ['', '.', '..'] for part in name.split('/'))
            data = tar.extractfile(member).read()
            actual[name] = (len(data), hashlib.sha256(data).hexdigest())
    expected = {member['path']: (member['bytes'], member['sha256']) for member in artifact['members']}
    assert actual == expected
    archives[artifact['role']] = len(actual)
    compiled[artifact['role']] = {name: value for name, value in actual.items() if name.startswith('dist/')}
    if artifact['role'] in ['preN9', 'acceptedN9', 'current']:
        original = Path(artifact['consumer']) / 'node_modules/@vmitsaras/raveldex'
        assert inventory(original) == expected
assert compiled['acceptedN9'] == compiled['current'] == compiled['reviewedCurrent']
staged_packages, staged_members, asset_count = 0, 0, 0
for role, pack in prepared['packages'].items():
    artifact = next(item for item in manifest['artifacts'] if item['role'] == role)
    original_shas = {member['path']: member['sha256'] for member in artifact['members']}
    for mode, sizes in pack['contexts'].items():
        for size, staged in sizes.items():
            actual = inventory(Path(staged['root']))
            assert actual == {member['path']: (member['bytes'], member['sha256']) for member in staged['members']}
            expected_shas = dict(original_shas)
            if mode == 'normal':
                assert staged['instrumentation'] is None
            else:
                assert mode == 'diagnostic'
                instrumentation = staged['instrumentation']
                for patch in instrumentation['counters']['patches']:
                    assert expected_shas[patch['path']] == patch['originalSha256']
                    expected_shas[patch['path']] = patch['instrumentedSha256']
                span = instrumentation['spans']
                assert expected_shas[span['path']] == span['originalSha256']
                expected_shas[span['path']] = span['instrumentedSha256']
            assert {name: value[1] for name, value in actual.items()} == expected_shas
            for name, pin in staged['assets'].items():
                path = Path(staged['directory']) / name
                assert sha(path) == pin['sha256'] and path.stat().st_size == pin['bytes']
                asset_count += 1
            staged_packages += 1
            staged_members += len(actual)
environment = manifest['environment']
original_environment = read(ROOT / 'docs/evidence/RX-9001/identity/artifacts.json')['environment']
for key in ['node', 'npm', 'os', 'uname']:
    assert environment[key] == original_environment[key]
assert environment['browsers']['chromium'] == original_environment['browsers']['chromium']
for executable in [environment['node']['executable'], environment['browsers']['chromium']['executable']]:
    path = Path(executable.get('path') or environment['node']['execPath'])
    assert sha(path) == executable['sha256']
    if 'realPath' in executable:
        assert str(path.resolve()) == executable['realPath']
assert report['environment']['node'] == environment['node']['node']
assert report['environment']['browserVersion'] == '149.0.7827.55'
assert os.uname().release == environment['uname']['release']
assert os.cpu_count() == environment['node']['hardware']['logicalCpuCount']

result = {'kind': 'rx9006-independent-browser-scoped-input-audit-v1', 'status': 'Pass for measured inputs; original broad wrapper remains Fail',
          'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'originalBroadGuard': {'status': wrapper['status'], 'unchanged': False, 'changed': changed, 'added': added, 'removed': removed,
                                 'beforeGuardedFiles': len(before), 'unchangedExistingFiles': len(before) - len(changed),
                                 'headBefore': guard['before']['head'], 'headAfter': guard['after']['head']},
          'canonicalN11PlanningPredatedGuardSnapshots': {'manifestPresentBeforeAndAfter': True, 'specificationPresentBeforeAndAfter': True, 'bothHashesUnchanged': True},
          'measuredInputChecks': {'runtimeSourceInputs': len(manifest['source']['runtimeSourceInventory']), 'frozenMethodInputs': len(method['files']),
                                  'harnessPins': len(prepared['harness']), 'archiveMembers': archives, 'equalCurrentAcceptedReviewedCompiledMembers': len(compiled['current']),
                                  'stagedPackages': staged_packages, 'stagedMembers': staged_members, 'executedAssets': asset_count,
                                  'originalAndStagedMembersExact': True, 'diagnosticTransformChainsExact': True,
                                  'frozenEnvironmentAndCurrentNodeChromiumExecutablesMatch': True},
          'recommendation': 'Accept separately scoped full browser matrix correctness/identity and observed performance only after remaining semantic/statistical/clock-qualification gates; retain original broad Fail and disclose overlapping foreign planning/tracking activity as external run context. Do not claim a wholly unchanged worktree or absence of all external activity.',
          'overlapEvidenceLimits': 'Filesystem snapshots prove metadata deltas and unchanged measured inputs. N11_GITHUB records planning/docs/tracking commands and explicitly no full build/check/browser collection. This review does not observe every OS process or prove zero external CPU/network activity.',
          'pins': [{'path': str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path), 'sha256': sha(path)} for path in [guard_path, wrapper_path, report_path, manifest_path, ROOT / 'docs/planning/N11_GITHUB.md', Path(__file__).resolve()]],
          'limitations': ['No rewriting of original broad failure, failed/excluded probes, foreign N11 work or raw matrix acceptance flag',
                         'Node/browser package/input identity is not immunity to uncontrolled desktop/OS noise, population evidence, physical response or heap evidence']}
(OUT / 'browser-scoped-inputs.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'pins'}, indent=2))
