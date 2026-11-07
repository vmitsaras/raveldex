"""Compare closing package/runtime inputs with the preserved measured artifacts."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tarfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[4]
out = HERE / (sys.argv[1] if len(sys.argv) == 2 else 'attempt-01')
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def payload(path):
    result = {}
    with tarfile.open(path, 'r:gz') as archive:
        for member in archive:
            if member.isfile():
                name = member.name.removeprefix('package/')
                assert name not in result
                result[name] = archive.extractfile(member).read()
    return result

verified = out / 'verified-core.tar.gz'
actual = payload(verified)
measured = payload(ROOT / 'docs/evidence/RX-9001/identity/current-core.tar.gz')
assert actual.keys() == measured.keys()
implementation = [name for name in actual if name.startswith('dist/')]
assert len(implementation) == 345
assert all(actual[name] == measured[name] for name in implementation)
differences = [name for name in sorted(actual) if actual[name] != measured[name]]
assert differences == ['docs/release/PUBLICATION_STATUS.md']
candidate = json.loads((out / 'candidate-report.json').read_text())
installed = pathlib.Path(candidate['package']['installedDirectory'])
assert installed.resolve() == installed
for name, blob in actual.items():
    assert (ROOT / name).read_bytes() == blob == (installed / name).read_bytes(), name
assert sha(verified) == sha(ROOT / 'docs/evidence/RX-9006/verification/verified-core.tar.gz')
source = json.loads((ROOT / 'docs/evidence/RX-9002/baseline.json').read_text())['runtimeSourceInventory']
for row in source:
    assert sha(ROOT / row['path']) == row['sha256']
    assert hashlib.sha256(subprocess.check_output(
        ['git', 'show', 'HEAD:' + row['path']], cwd=ROOT)).hexdigest() == row['sha256']
freeze = json.loads((ROOT / 'docs/evidence/RX-9001/method-freeze.json').read_text())
assert all(sha(ROOT / name) == value for name, value in freeze['files'].items())
report = {
    'status': 'Pass', 'runtimeInputsEqualFrozenAndHead': len(source),
    'originalFrozenMethodFilesUnchanged': len(freeze['files']),
    'verifiedArchiveSha256': sha(verified), 'wholeInstalledMembersMatch': len(actual),
    'compiledMembersEqualOriginalMeasuredCurrent': len(implementation),
    'nonImplementationDifferencesFromMeasuredCurrent': differences,
    'archiveEqualsOriginalRx9006': True, 'installedDirectory': str(installed),
    'scope': 'Local current package/source identity; preflight evidence only; runtime unchanged, no measured speedup, heap, clean-head or remote qualification.',
}
(out / 'identity.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
