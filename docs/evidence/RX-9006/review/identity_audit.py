#!/usr/bin/env python3
"""Read-only independent archive/member/source/graph verification; no build."""
from pathlib import Path
import datetime, gzip, hashlib, json, tarfile

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'docs/evidence/RX-9006'
def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()
def sha(path):
    return sha_bytes(path.read_bytes())
def read(path):
    return json.loads(path.read_text())

manifest_path = BASE / 'identity/artifacts.json'
manifest = read(manifest_path)
assert manifest['kind'] == 'rx9001-artifacts-v1'
assert manifest['provisional'] is False and manifest['freshCurrentCandidate'] is True
roles = {entry['role']: entry for entry in manifest['artifacts']}
assert set(roles) == {'preN9', 'acceptedN9', 'current', 'reviewedCurrent'}
archive_pins = {'preN9': '3f4f31eb03951f13366256dd019710f0bd5c58b29d7ae687d8a96f0ea5ecec11',
                'acceptedN9': '1d7dab63dbbd9bee7dd67394dd6893c227711caad471d448a02e704c91225fbe',
                'reviewedCurrent': '45747067b227db1f2238381241997e9ea3dfb687dcb1daa91196927be6494f3b'}
counts, runtime_members = {}, {}
for role, artifact in roles.items():
    archive = Path(artifact['archive'])
    assert sha(archive) == artifact['sha256']
    if role in archive_pins:
        assert artifact['sha256'] == archive_pins[role]
    members = {}
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar:
            assert member.isfile() and member.name.startswith('package/')
            name = member.name[len('package/'):]
            assert name and not name.startswith('/') and all(part not in ('', '.', '..') for part in name.split('/'))
            assert name not in members
            data = tar.extractfile(member).read()
            members[name] = (len(data), sha_bytes(data))
    assert members == {item['path']: (item['bytes'], item['sha256']) for item in artifact['members']}
    if role != 'reviewedCurrent':
        installed = Path(artifact['consumer']) / 'node_modules/@vmitsaras/raveldex'
        assert installed.resolve() == installed and not installed.is_symlink()
        actual = {}
        for path in installed.rglob('*'):
            assert not path.is_symlink()
            if path.is_file():
                actual[str(path.relative_to(installed))] = (path.stat().st_size, sha(path))
        assert actual == members
    counts[role] = len(members)
    runtime_members[role] = {name: value for name, value in members.items() if name.startswith('dist/')}
assert runtime_members['acceptedN9'] == runtime_members['current'] == runtime_members['reviewedCurrent']
source_inputs = manifest['source']['runtimeSourceInventory']
for item in source_inputs:
    assert sha(ROOT / item['path']) == item['sha256']
for item in read(BASE / 'verification/focused-inputs.json')['testInputs']:
    assert sha(ROOT / item['path']) == item['sha256']
compiled = read(BASE / 'verification/focused-inputs.json')['members']
for item in compiled:
    assert sha(ROOT / item['path']) == item['sha256']
    name = item['path'].removeprefix('dist/')
    assert item['sha256'] == runtime_members['current']['dist/' + name][1]

graphs = read(BASE / 'identity/core-graphs.json')
assert graphs['status'] == 'Pass' and graphs['esbuild'] == '0.28.2'
assert graphs['method']['entry'] == "export * from '@vmitsaras/raveldex';"
graph_rows = []
for item in graphs['rows']:
    role = item['role']
    raw = BASE / 'identity' / (role + '-core.mjs')
    compressed = raw.with_suffix('.mjs.gz')
    assert sha(raw) == item['sha256'] and raw.stat().st_size == item['bytes']
    assert sha(compressed) == item['gzipSha256'] and compressed.stat().st_size == item['gzipBytes']
    assert gzip.decompress(compressed.read_bytes()) == raw.read_bytes()
    assert item['archiveSha256'] == roles[role]['sha256']
    for name, meta in item['inputs'].items():
        assert name == 'core-entry.mjs' or name.startswith('node_modules/@vmitsaras/raveldex/dist/')
        assert not any(imported.get('external') for imported in meta.get('imports', []))
        if name != 'core-entry.mjs':
            original = Path(roles[role]['consumer']) / name
            assert original.stat().st_size == meta['bytes']
    graph_rows.append({key: item[key] for key in ['role', 'bytes', 'gzipBytes', 'sha256', 'gzipSha256']})
assert graph_rows[1] | {'role': 'current'} == graph_rows[2]
before, after = graph_rows[0], graph_rows[2]

focus_logs = {name: (BASE / 'verification' / name).read_text() for name in ['resource-ownership.txt', 'continuation-queue.txt']}
assert 'tests 1' in focus_logs['resource-ownership.txt'] and 'pass 1' in focus_logs['resource-ownership.txt']
assert 'tests 5' in focus_logs['continuation-queue.txt'] and 'pass 5' in focus_logs['continuation-queue.txt']
actual_node = json.loads(next(line[line.index('{'):] for line in focus_logs['continuation-queue.txt'].splitlines() if 'rx9002-actual-node-continuation-observation' in line))
assert actual_node['nativeContinuationCallbacks'] == 426 and actual_node['zeroTimerCallbacks'] == 53
assert actual_node['handlesAfterSettlement'] == actual_node['signalListenersAfterAbort'] == 0

result = {'kind': 'rx9006-independent-identity-graph-audit-v1', 'status': 'Pass',
          'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'manifestSha256': sha(manifest_path), 'archiveMembers': counts,
          'equalCurrentAcceptedReviewedCompiledMembers': len(runtime_members['current']),
          'currentRuntimeSourceInputs': len(source_inputs), 'freshFocusedCompiledMembers': len(compiled),
          'graphs': graph_rows, 'coreGraphDelta': {'bytes': after['bytes'] - before['bytes'], 'gzipBytes': after['gzipBytes'] - before['gzipBytes']},
          'freshDeterministicTests': 6, 'freshActualNodeContinuationObservation': actual_node,
          'pins': [{'path': str(path.relative_to(ROOT)), 'sha256': sha(path)} for path in [manifest_path, BASE / 'identity/core-graphs.json', BASE / 'identity/graph.mjs', BASE / 'verification/focused-inputs.json', *(BASE / 'verification' / name for name in focus_logs)]],
          'limitations': ['Read-only archive/member/source/graph/recorded-result replay; does not rerun engine, tests or bundler',
                         'Core code graph is the new exact three-role recipe, not asserted byte-identical to historical RX8009 recipe',
                         'Fresh injected-host resource composition and actual Node handles are not retained/peak/browser heap or universal scheduler evidence']}
(OUT / 'identity-graph.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ['pins', 'graphs', 'freshActualNodeContinuationObservation']}, indent=2))
