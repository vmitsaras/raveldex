#!/usr/bin/env python3
"""RX-9003 independent read-only source/archive audit. No build/install/collector.

Writes only this directory's inventory.json and audit.json. Optional --candidate
is a freshly prepared archive; --consumer is the installed package directory.
Run from the repository root. Every compared archive is read in place.
"""
import argparse
import datetime
import difflib
import hashlib
import gzip
import json
from pathlib import Path, PurePosixPath
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent

def sha(data):
    return hashlib.sha256(data).hexdigest()

def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def pin(path):
    data = (ROOT / path).read_bytes()
    return {'path': path, 'bytes': len(data), 'sha256': sha(data)}

def archive(path):
    payload = {}
    with tarfile.open(path, 'r:gz') as t:
        for m in t:
            if m.isdir():
                continue
            name = PurePosixPath(m.name)
            assert m.isfile() and name.parts[0] == 'package' and len(name.parts) > 1
            assert '..' not in name.parts and not name.is_absolute() and '\\' not in m.name
            relative = '/'.join(name.parts[1:])
            assert relative not in payload, ('duplicate package member', relative)
            payload[relative] = t.extractfile(m).read()
            assert len(payload[relative]) == m.size
    members = [{'path': p, 'bytes': len(b), 'sha256': sha(b)} for p, b in sorted(payload.items())]
    metadata = json.loads(payload['package.json'])
    assert metadata['private'] is True and metadata['version'] == '0.1.0-rc.0'
    assert metadata['name'] == '@vmitsaras/raveldex' and metadata.get('dependencies', {}) == {}
    runtime = [m for m in members if m['path'].startswith('dist/')]
    return {
        'archive': str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
        'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size,
        'memberCount': len(members), 'members': members,
        'payloadDigest': sha(encoded(members)),
        'implementationMemberCount': len(runtime), 'implementationDigest': sha(encoded(runtime)),
        'implementationClassCounts': {
            'js': sum(m['path'].endswith('.js') for m in runtime),
            'declarations': sum(m['path'].endswith('.d.ts') for m in runtime),
            'css': sum(m['path'].endswith('.css') for m in runtime),
            'otherDist': sum(not m['path'].endswith(('.js', '.d.ts', '.css')) for m in runtime),
        },
        'package': {k: metadata[k] for k in ['name', 'version', 'private']},
        'runtimeDependencies': metadata.get('dependencies', {}),
    }, payload

def delta(a, b):
    return sorted(p for p in set(a) | set(b) if a.get(p) != b.get(p))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--consumer', type=Path)
    args = parser.parse_args()
    manifest = json.loads((ROOT/'docs/evidence/RX-9001/identity/artifacts.json').read_text())
    old_source = manifest['source']['runtimeSourceInventory']
    source = []
    for old in old_source:
        current = pin(old['path'])
        assert current['sha256'] == old['sha256'] and current['bytes'] == old['bytes'], ('source changed', old['path'])
        assert git('show', 'HEAD:'+old['path']) == (ROOT/old['path']).read_bytes(), ('head source changed', old['path'])
        source.append({**current, 'gitBlob': old['gitBlob']})
    expected_source = sorted(m['path'] for m in source)
    actual_source = sorted(set(p.decode() for p in git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'src', 'integrations', 'package.json', 'package-lock.json').split(b'\0') if p))
    assert expected_source == actual_source, ('source membership changed', delta(dict.fromkeys(expected_source,1), dict.fromkeys(actual_source,1)))
    frozen = json.loads((ROOT/'docs/evidence/RX-9001/method-freeze.json').read_text())
    method = [pin(p) for p in frozen['files']]
    for row in method:
        assert row['sha256'] == frozen['files'][row['path']], ('method freeze changed', row['path'])
    build_paths = sorted({p.relative_to(ROOT).as_posix() for p in ROOT.glob('tsconfig*.json')} | {
        'integrations/astro/tsconfig.build.json', 'integrations/astro/tsconfig.json',
        'scripts/clean-build.mjs', 'scripts/copy-ui-css.mjs', 'scripts/copy-migration-license.mjs', 'scripts/link-astro-peer.mjs',
    })
    build = [pin(p) for p in build_paths]
    for row in build:
        assert sha(git('show','HEAD:'+row['path'])) == row['sha256'], ('build input changed', row['path'])
    prior_verification = json.loads((ROOT/'docs/evidence/RX-9002/verification/validation.json').read_text())
    prior_guard = json.load(gzip.open(ROOT/'docs/evidence/RX-9002/verification/worktree-guard.json.gz', 'rt'))
    assert prior_guard['unchanged'] is True and prior_guard['before'] == prior_guard['after']
    assert sha((ROOT/'docs/evidence/RX-9002/verification/full-check.txt').read_bytes()) == prior_verification['logSha256']
    assert sha((ROOT/'docs/evidence/RX-9002/verification/candidate-report.json').read_bytes()) == prior_verification['candidateReportSha256']
    prior_pins = prior_guard['after']['sha256']
    regression_paths = sorted(p for p in prior_pins if p.startswith(('test/', 'bench/n9/')))
    regression = [pin(p) for p in regression_paths]
    for row in regression:
        assert row['sha256'] == prior_pins[row['path']], ('regression input changed since full RX-9002 run', row['path'])
    artifacts, payloads = {}, {}
    for original in manifest['artifacts']:
        role = original['role']
        record, payload = archive(Path(original['archive']))
        assert record['sha256'] == original['sha256'], ('historical archive drift', role)
        assert record['members'] == original['members'], ('historical member drift', role)
        record['source'] = original['source']
        record['historicalConsumerPresent'] = Path(original.get('consumer', '/nonexistent')).is_dir()
        artifacts[role], payloads[role] = record, payload
    for role, path in [
        ('rx9001Verified', 'docs/evidence/RX-9001/verification/closing-core.tar.gz'),
        ('rx9002Verified', 'docs/evidence/RX-9002/verification/verified-core.tar.gz'),
    ]:
        record, payload = archive(ROOT/path)
        assert record['sha256'] == '4dd0f8333ff95d0c7e50f2a91a028e41122bdf127f5fadf92dd1104eb4589b0c'
        artifacts[role], payloads[role] = record, payload
    if args.candidate:
        record, payload = archive(args.candidate.resolve(strict=True))
        artifacts['rx9003Verified'], payloads['rx9003Verified'] = record, payload
        assert record['sha256'] == artifacts['rx9002Verified']['sha256'], 'fresh candidate archive changed'
    target = 'rx9003Verified' if args.candidate else 'rx9002Verified'
    comparisons = {}
    for before in ['acceptedN9', 'reviewedCurrent', 'current', 'rx9001Verified', 'rx9002Verified']:
        changed = delta(payloads[before], payloads[target])
        implementation_changed = [p for p in changed if p.startswith('dist/')]
        assert implementation_changed == [], ('implementation changed', before, target, implementation_changed)
        assert [p for p in changed if p == 'package.json'] == [], 'package metadata changed'
        comparisons[before+'To'+target] = {
            'implementationChangedPaths': implementation_changed, 'allChangedPaths': changed,
            'nonImplementationDiffs': {p: ''.join(difflib.unified_diff(payloads[before].get(p,b'').decode().splitlines(True),payloads[target].get(p,b'').decode().splitlines(True),fromfile=before+'/'+p,tofile=target+'/'+p)) for p in changed},
        }
    installed = None
    if args.consumer:
        package = args.consumer.resolve(strict=True)
        actual = []
        for p in sorted(package.rglob('*')):
            assert not p.is_symlink(), ('installed symlink', str(p))
            if p.is_file():
                data=p.read_bytes();actual.append({'path':p.relative_to(package).as_posix(),'bytes':len(data),'sha256':sha(data)})
        assert actual == artifacts[target]['members'], 'installed candidate differs from frozen archive'
        installed={'path':str(package),'memberCount':len(actual),'payloadDigest':sha(encoded(actual)),'allMembersMatchArchive':True}
    inventory={'source':source,'buildInputs':build,'rx9001Method':method,'regressionAndN9Inputs':regression,'artifacts':artifacts,'comparisons':comparisons,'installed':installed}
    (OUT/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
    summary={
        'kind':'rx9003-independent-artifact-audit-v1','status':'Pass',
        'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sourceHead':git('rev-parse','HEAD').decode().strip(),
        'scope':'Current worktree inputs and retained actual archives; no clean committed-head or fresh full-check claim is made by this audit.',
        'runtimeSourceMembers':len(source),'sourceMatchesRx9001AndHead':True,'extraOrMissingRuntimeSourcePaths':[],
        'buildInputs':len(build),'buildInputsMatchHead':True,'methodFrozenFiles':len(method),'rx9001MethodFreezeUnchanged':True,
        'regressionAndN9Inputs':len(regression),'regressionInputsMatchRx9002FullCheckGuard':True,'rx9002RawVerificationLogAndReportPinsMatch':True,
        'candidateRole':target,'archiveSha256':artifacts[target]['sha256'],'archiveMembers':artifacts[target]['memberCount'],
        'implementationMembers':artifacts[target]['implementationMemberCount'],'classCounts':artifacts[target]['implementationClassCounts'],
        'sameImplementationAs':['acceptedN9','reviewedCurrent','current','rx9001Verified','rx9002Verified'],
        'archiveByteIdenticalToRx9002':artifacts[target]['sha256']==artifacts['rx9002Verified']['sha256'],
        'installed':installed,
        'inventory':{'path':'inventory.json','sha256':sha((OUT/'inventory.json').read_bytes())},
        'downstreamPreparation':'RX-9001 temporary installed consumers no longer exist. Reinstall the original pinned archives to new consumers and capture a new artifact/run manifest before RX-9004; preserve prior manifest/method unchanged. Current runtime equals the frozen RX-9001 current role; its archive differs only in publication-status prose.',
        'limitations':['No build, install, test, timing collector or network request was executed by this audit.','Source equality and retained member identity alone do not establish a newly passing full check, remote CI, performance improvement, retained/peak heap or future environment equivalence.'],
    }
    (OUT/'audit.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))

if __name__ == '__main__':
    main()
