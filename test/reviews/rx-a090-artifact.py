#!/usr/bin/env python3
"""Read-only independent RX-A090 artifact audit; no build/npm/git/remote work.

Usage: python3 test/reviews/rx-a090-artifact.py CANDIDATE_JSON FEATURE_JSON FULL_CHECK_LOG OUTPUT_JSON
"""
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[2]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load(path):
    return json.loads(pathlib.Path(path).read_text())

def main():
    candidate_path, feature_path, full_log, output = map(pathlib.Path, sys.argv[1:])
    checks = []
    def check(name, condition, **details):
        assert condition, name
        checks.append({'check': name, 'status': 'Pass', **details})
        print('Pass:', name, flush=True)
    candidate, feature = load(candidate_path), load(feature_path)
    check('Closed candidate report passes', candidate['status'] == 'Pass' and candidate['completedAt'])
    package = candidate['package']
    tarball = pathlib.Path(package['tarball'])
    raw = tarball.read_bytes()
    check('Tarball matches closed candidate identity and byte length', sha(raw) == package['sha256'] and len(raw) == package['tarballBytes'])
    with tarfile.open(tarball, 'r:gz') as tar:
        members = tar.getmembers()
        names = [member.name for member in members]
        check('All tar members are unique safe regular package files', len(names) == len(set(names)) and all(member.isfile() and member.name.startswith('package/') and all(part not in ('', '.', '..') for part in member.name.split('/')) and not member.name.startswith('/') for member in members), members=len(members))
        content = {member.name[len('package/'):]: tar.extractfile(member).read() for member in members}
    inventory = package['files']
    check('Closed inventory exactly equals tar members without duplicates', len(inventory) == len(content) and len({item['path'] for item in inventory}) == len(inventory) and {item['path'] for item in inventory} == set(content))
    check('Every tar member matches closed inventory size and SHA-256', all(len(content[item['path']]) == item['bytes'] and sha(content[item['path']]) == item['sha256'] for item in inventory))
    check('Every tar member is byte-current in checkout', all((ROOT / path).is_file() and (ROOT / path).read_bytes() == data for path, data in content.items()))
    installed = pathlib.Path(package['installedDirectory'])
    check('Every tar member equals actual installed consumer bytes', all((installed / path).is_file() and (installed / path).read_bytes() == data for path, data in content.items()))
    installed_files = {str(path.relative_to(installed)) for path in installed.rglob('*') if path.is_file()}
    check('Installed package has no extra or missing files', installed_files == set(content))
    metadata = json.loads(content['package.json'])
    check('Candidate remains private pure ESM with no runtime/optional/peer dependencies', metadata['private'] is True and metadata['type'] == 'module' and metadata['version'] == '0.1.0-rc.0' and not metadata.get('dependencies') and not metadata.get('optionalDependencies') and not metadata.get('peerDependencies'))
    exports = metadata['exports']
    check('Explicit exports expose 28 JavaScript entries and independent CSS only', len(exports) == 29 and sum(isinstance(target, dict) for target in exports.values()) == 28 and exports['./addons/ui/styles.css'] == './dist/addons/ui/styles.css' and exports['./addons/patch'] == {'types': './dist/addons/patch/index.d.ts', 'import': './dist/addons/patch/index.js'} and not any('*' in path for path in exports))
    check('Root public module source and declarations stay isolated from patch entry', b'patch' not in content['dist/index.js'] and b'patch' not in content['dist/index.d.ts'] and b'patch' not in (ROOT/'src/index.ts').read_bytes())
    check('Candidate startup, declarations and closed graphs cover every JavaScript entry', candidate['startup']['status'] == candidate['types']['status'] == candidate['graphs']['status'] == 'Pass' and len(candidate['startup']['outputs']) == len(candidate['types']['surface']) == len(candidate['graphs']['entries']) == 28)
    graph_rows = candidate['graphs']['entries']
    check('Every closed candidate bundle and its source inputs retain exact recorded hashes', all(pathlib.Path(row['output']).is_file() and sha(pathlib.Path(row['output']).read_bytes()) == row['sha256'] and len(pathlib.Path(row['output']).read_bytes()) == row['minifiedBytes'] and all((installed.parents[2] / item['path']).is_file() and sha((installed.parents[2] / item['path']).read_bytes()) == item['sha256'] and len((installed.parents[2] / item['path']).read_bytes()) == item['bytes'] for item in row['inputs']) for row in graph_rows))
    patch_type = next(row for row in candidate['types']['surface'] if row['specifier'].endswith('/addons/patch'))
    check('Patch public declaration exports are exactly the documented surface', set(patch_type['exports']) == {'createPatch', 'Patches', 'RecordPatch', 'RecordPatchSet', 'RecordPatchUnset'})
    # The candidate uses public installed modules. Run a separate artifact probe,
    # without importing the feature package helper or relying on its expected result.
    node_probe = """import assert from 'node:assert/strict';
import * as core from '@vmitsaras/raveldex';
import * as patch from '@vmitsaras/raveldex/addons/patch';
import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';
assert.deepEqual(Object.keys(core).sort(),['ERROR_CODES','RaveldexError','createRaveldex']);
assert.deepEqual(Object.keys(patch),['createPatch']);
const engine=core.createRaveldex({schema:{text:{body:{}}},addons:[createSourceProvider({fields:['body']})]});
try{assert.deepEqual(Object.keys(engine).sort(),['add','addMany','clear','dispose','remove','replace','search']);
await engine.add({id:'audit',text:{body:'before'}});const handle=patch.createPatch(engine);assert.deepEqual(Object.keys(handle),['patch']);assert.ok(Object.isFrozen(handle));
const changed=await handle.patch({id:'audit',expectedRevision:1,set:{text:{body:'after'}}});assert.equal(changed.revision,2);assert.equal((await engine.search('after')).total,1);assert.equal((await engine.search('before')).total,0);
await assert.rejects(handle.patch({id:'audit',expectedRevision:1,unset:{text:['body']}}),{code:'REVISION_MISMATCH'});
for(const name of ['@vmitsaras/raveldex/addons/patch/capture','@vmitsaras/raveldex/dist/addons/patch/index.js'])await assert.rejects(import(name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
console.log(JSON.stringify({runtimeExports:Object.keys(patch),facadeUnchanged:true,successfulRevision:changed.revision,staleRefusal:true,privateImportRefusals:2}));
}finally{await engine.dispose();}
"""
    consumer = installed.parents[2]
    assert consumer.name == 'consumer', consumer
    proc = subprocess.run(['node', '--input-type=module', '--eval', node_probe], cwd=consumer, capture_output=True, text=True, timeout=30)
    check('Independent installed runtime probe preserves facade, patch atomic success/stale refusal and private imports', proc.returncode == 0, observation=json.loads(proc.stdout) if proc.returncode == 0 else {'stdout': proc.stdout, 'stderr': proc.stderr})
    document = content['docs/api/RECORD_PATCH.md'].decode()
    match = re.search(r'```js\n([\s\S]*?)\n```', document)
    check('Installed documentation has the exact executable first JavaScript fence', match is not None)
    example = match.group(1)
    proc = subprocess.run(['node', '--input-type=module', '--eval', example], cwd=consumer, capture_output=True, text=True, timeout=30)
    check('Independent execution of the unchanged installed documentation fence succeeds', proc.returncode == 0 and proc.stdout == '2 1 guide\n' and sha(example.encode()) == feature['documentation']['exampleSha256'], exampleSha256=sha(example.encode()), stdout=proc.stdout)
    check('Accepted feature package report identifies this exact final tar artifact', feature['package']['sha256'] == sha(raw) and feature['package']['tarballBytes'] == len(raw) and feature['package']['files'] and {item['path'] for item in feature['package']['files']} == set(content) and all(item['size'] == len(content[item['path']]) for item in feature['package']['files']))
    check('Feature report retains actual installed/minified, source recovery and worker direct-only boundaries', feature['correctness']['status'] == feature['correctness']['minifiedParity'] == feature['snapshots']['status'] == feature['worker']['status'] == 'Pass' and feature['worker']['code'] == 'MISSING_CAPABILITY' and feature['worker']['ordinaryWorkerReplacement'] == 'Pass' and feature['correctness']['completeComparisonsPerRun'] > 0 and all(not row['reads'] for row in feature['startup']))
    binding_reports = []
    for role in ('runtime', 'verification'):
        path = ROOT / f'docs/evidence/RX-A090-{role}-review.json'
        review = load(path)
        check(f'{role.capitalize()} review is Ready with no mandatory findings', review['verdict'] == 'Ready with follow-ups' and not review['mandatoryFindings'] and review['passCount'] > 0)
        bindings = review['sourceBindings']
        check(f'Every {role} review source binding is current', all((ROOT / item['path']).is_file() and sha((ROOT/item['path']).read_bytes()) == item['sha256'] and len((ROOT/item['path']).read_bytes()) == item['bytes'] for item in bindings), bindings=len(bindings))
        binding_reports.append({'review': role, 'path': str(path.relative_to(ROOT)), 'sha256': sha(path.read_bytes()), 'currentBindings': len(bindings)})
    log = full_log.read_text()
    groups = {key: list(map(int, re.findall(r'^ℹ ' + key + r' (\d+)\s*$', log, re.M))) for key in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo')}
    check('Completed full check records five complete passing test batches with no omitted failure counts', len(groups['tests']) == 5 and all(len(groups[key]) == 5 for key in groups) and groups['tests'] == groups['pass'] and all(n == 0 for key in ('fail', 'cancelled', 'skipped', 'todo') for n in groups[key]) and sum(groups['tests']) > 819, testBatches=groups['tests'], total=sum(groups['tests']), logSha256=sha(full_log.read_bytes()))
    identities = [{'path': path, 'bytes': len(data), 'sha256': sha(data)} for path, data in sorted(content.items())]
    report = {'kind': 'raveldex-rx-a090-artifact-review-v1', 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'status': 'Pass', 'verdict': 'Ready with follow-ups', 'mandatoryFindings': [], 'authorshipBoundary': 'Independent read-only audit of the closed candidate artifact, installed bytes, raw review source bindings and full-check log. The reviewer authored feature package tests; those are not independently re-reviewed. Artifact/node documentation probes do not import that helper.', 'tarball': {'sha256': sha(raw), 'bytes': len(raw), 'members': len(content), 'unpackedBytes': sum(map(len, content.values()))}, 'checks': checks, 'memberIdentities': identities, 'sourceBindings': binding_reports, 'reproducer': {'path': str(pathlib.Path(__file__).resolve().relative_to(ROOT)), 'sha256': sha(pathlib.Path(__file__).read_bytes())}, 'closedReports': [{'path': str(path), 'sha256': sha(path.read_bytes())} for path in (candidate_path, feature_path, full_log)], 'limitations': ['No builds, npm, Git or remote commands performed; exact local artifact/consumer audit only.', 'No independent self-review of reviewer-authored feature helper. Native correctness/verification review verdicts remain separately scoped.', 'Logical graph/bundle observations do not establish allocation/copy peaks, latency, broad browser/AT support, remote CI or publication readiness.']}
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'verdict': report['verdict'], 'checks': len(checks), 'tarball': report['tarball']}), flush=True)

if __name__ == '__main__':
    main()
