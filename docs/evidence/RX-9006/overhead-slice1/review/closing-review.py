"""Inspect actual closing records and small package/source data; no test rerun."""
import datetime
import gzip
import hashlib
import json
import pathlib
import re
import subprocess
import tarfile
from urllib.parse import unquote, urlsplit

HERE = pathlib.Path(__file__).resolve().parent
SLICE = HERE.parent
ROOT = HERE.parents[4]
CHECKS = SLICE / 'checks'
ATTEMPT = CHECKS / 'attempt-01'
PREFIX = str(SLICE.relative_to(ROOT)) + '/'
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):
    return json.loads(path.read_text())
def read_gzip(path):
    with gzip.open(path, 'rt') as handle:
        return json.load(handle)

validation = read(ATTEMPT / 'validation.json')
identity = read(ATTEMPT / 'identity.json')
candidate = read(ATTEMPT / 'candidate-report.json')
preparation = read(ATTEMPT / 'preparation.json')
checked = read_gzip(ATTEMPT / 'input-guard.json.gz')
preserved = read(CHECKS / 'preservation.json')
baseline = read_gzip(SLICE / 'baseline.json.gz')
final_checks = read(CHECKS / 'final-checks.json')
source = read(HERE / 'source-review.json')
assert validation['status'] == identity['status'] == candidate['status'] == preparation['status'] == preserved['status'] == final_checks['status'] == 'Pass'
assert validation['exitCode'] == preparation['projectCheck']['exitCode'] == 0
assert checked['stable'] and checked['before'] == checked['after']
assert len(checked['before']['files']) == len(checked['after']['files']) == validation['guardedInputFiles'] == 6195
assert validation['headStatusAndInputsUnchanged']
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
assert head == validation['sourceHead'] == checked['after']['head'] == baseline['sourceHead'] == preserved['sourceHead']
for name, expected in validation['files'].items():
    path = ATTEMPT / name
    assert path.stat().st_size == expected['bytes'] and sha(path) == expected['sha256'], name
log = (ATTEMPT / 'full-check.txt').read_text()
counts = {key: sum(map(int, re.findall(r'^(?:#|ℹ) ' + key + r' (\d+)$', log, re.M)))
          for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}
assert counts == validation['counts'] == {'tests': 1489, 'pass': 1481, 'fail': 0, 'cancelled': 0, 'skipped': 8, 'todo': 0}
assert preparation['projectCheck']['sha256'] == sha(ATTEMPT / 'full-check.txt')
assert len(final_checks['results']) == 6
for item in final_checks['results']:
    path = CHECKS / item['log']
    assert item['exitCode'] == 0 and path.stat().st_size == item['bytes'] and sha(path) == item['sha256'], item['name']
assert 'No release task can start.' in (CHECKS / 'final-next.txt').read_text()
assert 'no network requests or remote mutations' in (CHECKS / 'final-tracking-preview.txt').read_text()

current = preserved['currentNonSliceHashes']
assert len(baseline['files']) == preserved['baselineFiles'] == 6143
assert len(current) == 6146
changes = sorted(path for path, value in baseline['files'].items() if current.get(path) != value)
added = sorted(set(current) - set(baseline['files']))
assert changes == preserved['authorizedChangedExistingPaths'] and len(changes) == 9
assert added == preserved['newSourceTestPaths'] and len(added) == 3
assert len(baseline['files']) - len(changes) == preserved['originalFilesUnchanged'] == 6134
checked_code = {path: value for path, value in checked['after']['files'].items()
                if path.endswith(('.mjs', '.py', '.ts', '.json')) and not path.startswith(PREFIX)}
assert len(checked_code) == preserved['checkedCodeInputsStillUnchanged'] == 3555
assert all(current[path] == value for path, value in checked_code.items())
roadmap = read(ROOT / 'docs/planning/roadmap.json')
assert [t for t in roadmap['tasks'] if t['id'] != 'RX-9006'] == [t for t in baseline['roadmap']['tasks'] if t['id'] != 'RX-9006']
assert roadmap['milestones'] == baseline['roadmap']['milestones']
assert len(roadmap['tasks']) - 1 == preserved['otherTaskObjectsPreserved'] == 79
assert len(roadmap['milestones']) == preserved['milestoneObjectsPreserved'] == 12
task = next(t for t in roadmap['tasks'] if t['id'] == 'RX-9006')
old_task = next(t for t in baseline['roadmap']['tasks'] if t['id'] == 'RX-9006')
assert task['status'] == old_task['status'] == 'blocked'
assert task['blocker'].startswith(old_task['blocker'])
assert [p for p in task['evidence'] if p not in old_task['evidence']] == [PREFIX + 'README.md']
assert set(old_task['evidence']) <= set(task['evidence'])
assert {k: v for k, v in task.items() if k not in ['evidence', 'blocker']} == {k: v for k, v in old_task.items() if k not in ['evidence', 'blocker']}
assert all((ROOT / path).is_file() for path in task['evidence'])
for path, value in preserved['foreignFilesPreserved'].items():
    assert value == baseline['files'][path] == current[path] == sha(ROOT / path), path
pins = read(SLICE / 'v1-source-pins.json')['preservedHarness']
assert len(pins) == preserved['exactV1HarnessCopies'] == 16
for item in pins:
    assert sha(SLICE / item['preservedCopy']) == item['sha256'], item['path']
for item in source['currentReviewedSource']:
    assert sha(ROOT / item['path']) == item['sha256'] == checked['after']['files'][item['path']], item['path']
runtime = read(ROOT / 'docs/evidence/RX-9002/baseline.json')['runtimeSourceInventory']
freeze = read(ROOT / 'docs/evidence/RX-9001/method-freeze.json')['files']
for item in runtime:
    assert sha(ROOT / item['path']) == item['sha256'] == checked['after']['files'][item['path']], item['path']
for path, value in freeze.items():
    assert sha(ROOT / path) == value == checked['after']['files'][path], path
assert len(runtime) == identity['runtimeInputsEqualFrozenAndHead'] == 194
assert len(freeze) == identity['originalFrozenMethodFilesUnchanged'] == 9

archive = ATTEMPT / 'verified-core.tar.gz'
archive_sha = sha(archive)
assert archive_sha == identity['verifiedArchiveSha256'] == validation['verifiedArchiveSha256'] == candidate['package']['sha256'] == sha(ROOT / 'docs/evidence/RX-9006/verification/verified-core.tar.gz')
assert identity['archiveEqualsOriginalRx9006'] and validation['archiveEqualsOriginalRx9006']
assert candidate['package']['private'] is True and candidate['package']['runtimeDependencies'] == []
members = candidate['package']['files']
assert len(members) == len({row['path'] for row in members}) == identity['wholeInstalledMembersMatch'] == 380
payload = {}
with tarfile.open(archive, 'r:gz') as handle:
    for member in handle:
        path = pathlib.PurePosixPath(member.name)
        assert not path.is_absolute() and '..' not in path.parts and path.parts[0] == 'package'
        if member.isdir():
            continue
        assert member.isfile() and not member.issym() and not member.islnk()
        name = member.name.removeprefix('package/')
        assert name not in payload
        payload[name] = handle.extractfile(member).read()
assert set(payload) == {row['path'] for row in members}
installed = pathlib.Path(candidate['package']['installedDirectory'])
for member in members:
    path = member['path']; blob = payload[path]
    assert len(blob) == member['bytes'] and hashlib.sha256(blob).hexdigest() == member['sha256'], path
    assert (installed / path).read_bytes() == blob == (ROOT / path).read_bytes(), path
assert sum(path.startswith('dist/') for path in payload) == identity['compiledMembersEqualOriginalMeasuredCurrent'] == 345
assert identity['nonImplementationDifferencesFromMeasuredCurrent'] == ['docs/release/PUBLICATION_STATUS.md']

documents = [SLICE / 'README.md', ROOT / 'PROJECT_CONTEXT.md', ROOT / 'CODEX_HANDOFF.md',
             ROOT / 'docs/specs/N10_HARDENING_PERFORMANCE_REVIEW.md',
             ROOT / 'docs/planning/RX-9006_VERIFICATION_OVERHEAD_PLAN.md']
local_links = 0
for path in documents:
    text = path.read_text()
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
        target = target.strip('<>')
        split = urlsplit(target)
        if split.scheme or split.netloc or not split.path:
            continue
        assert (path.parent / unquote(split.path)).resolve().exists(), (str(path), target)
        local_links += 1
readme = documents[0].read_text()
assert '1,489 tests, 1,481 passed' in readme
assert 'The independent replay gate rejects wrong-model fixtures' in readme
assert 'No canary or benchmark collection was started' in readme
assert 'proposed 450-minute/360-second policy is not implemented or activated' in readme
assert '146/204 completed contexts' in readme

bindings = ['checks/attempt-01/validation.json', 'checks/attempt-01/identity.json',
            'checks/attempt-01/input-guard.json.gz', 'checks/attempt-01/full-check.txt',
            'checks/attempt-01/preparation.json', 'checks/attempt-01/candidate-report.json',
            'checks/final-checks.json', 'checks/preservation.json', 'README.md']
report = {
    'status': 'Pass for authorized slice implementation and local closing verification',
    'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'rx9006Acceptance': 'blocked; original 146/204 coverage remains incomplete',
    'sourceHead': head, 'countsReconstructedFromActualLog': counts,
    'fullCheckGuard': {'files': 6195, 'beforeAfterMapsAndHeadStatusEqual': True},
    'preservationMapAudit': {'baseline': 6143, 'unchanged': 6134, 'authorizedChanged': 9,
                             'newSourceTestPaths': 3, 'checkedCodeInputsUnchanged': 3555,
                             'otherTaskObjects': 79, 'milestones': 12, 'foreignFiles': 4,
                             'exactV1Copies': 16},
    'directCurrentIdentityAudit': {'runtimeInputs': 194, 'methodFiles': 9,
                                   'reviewedChangedSourcePaths': len(source['currentReviewedSource']),
                                   'archiveSha256': archive_sha, 'installedArchiveAndCurrentMembers': 380,
                                   'compiledMembers': 345},
    'closingReadOnlyCommands': [row['name'] for row in final_checks['results']],
    'currentDocumentationLinksChecked': local_links,
    'currentDocumentation': [{'path': str(path.relative_to(ROOT)), 'sha256': sha(path)} for path in documents],
    'evidenceBindings': [{'path': PREFIX + path, 'sha256': sha(SLICE / path)} for path in bindings],
    'sourceStageReview': 'final.json',
    'unresolvedBlockingFindings': [],
    'scope': 'Independent reconstruction of existing logs, guards, small package/member/source data and documentation only. No test rerun, benchmark, canary, new native engine exercise or heavy saved-capture replay.',
    'limitations': ['Local dirty-worktree evidence, not exact committed-head or remote CI qualification.',
                    'No measured savings, heap improvement, fresh benchmark deadline behavior or canary readiness is established.',
                    'Original incomplete measurement and historical source/review bytes remain preserved; proposed run policies remain unimplemented.',
                    'Only the final pointer/closing summary and coordination status may change inside this slice after these bound records; no runtime/source/test changes are qualified by this review.'],
}
(HERE / 'closing.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['status', 'rx9006Acceptance', 'countsReconstructedFromActualLog', 'fullCheckGuard', 'preservationMapAudit', 'directCurrentIdentityAudit', 'currentDocumentationLinksChecked']}, indent=2))
