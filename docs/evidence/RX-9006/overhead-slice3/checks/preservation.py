"""Audit bounded changes against the initial dirty checkout and check inputs."""
import datetime
import gzip
import hashlib
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[4]
SLICE = HERE.parent
prefix = str(SLICE.relative_to(ROOT)) + '/'
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

with gzip.open(SLICE / 'baseline.json.gz', 'rt') as handle:
    baseline = json.load(handle)
paths = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT,
).decode().split('\0')
current = {p: sha(ROOT / p) for p in paths if p and (ROOT / p).is_file() and not p.startswith(prefix)}
allowed = {
    'bench/n10/host-recovery.mjs',
    'PROJECT_CONTEXT.md', 'CODEX_HANDOFF.md', 'ROADMAP.md', 'IMPLEMENTATION_TASKS.md',
    'docs/planning/roadmap.json', 'docs/specs/N10_HARDENING_PERFORMANCE_REVIEW.md',
    'docs/planning/RX-9006_VERIFICATION_OVERHEAD_PLAN.md',
}
changed = sorted(p for p, value in baseline['files'].items() if current.get(p) != value)
assert set(changed) == allowed, changed
added = sorted(set(current) - set(baseline['files']))
assert set(added) == {
    'bench/n10/host-recovery-policy.mjs',
    'bench/n10/host-recovery-policy-child.mjs',
    'bench/n10/host-recovery-supervisor.mjs',
    'test/comparison/n10-host-recovery-policy.test.mjs',
    'test/comparison/n10-host-recovery-supervisor.test.mjs',
}, added
assert set(baseline['files']) <= set(current)
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
assert head == baseline['sourceHead']
roadmap = json.loads((ROOT / 'docs/planning/roadmap.json').read_text())
assert [t for t in roadmap['tasks'] if t['id'] != 'RX-9006'] == [
    t for t in baseline['roadmap']['tasks'] if t['id'] != 'RX-9006']
assert roadmap['milestones'] == baseline['roadmap']['milestones']
task = next(t for t in roadmap['tasks'] if t['id'] == 'RX-9006')
assert task['status'] == 'blocked'
foreign = ['docs/planning/GITHUB_TRACKING.md', 'docs/planning/github-links.json',
           'docs/planning/N11_GITHUB.md', 'docs/specs/N11_UI_UX_POLISH.md']
assert all(current[p] == baseline['files'][p] for p in foreign)
preserved = [p for p in (SLICE / 'baseline').rglob('*') if p.is_file()]
assert all(sha(p) == baseline['files'][str(p.relative_to(SLICE / 'baseline'))] for p in preserved)
with gzip.open(HERE / 'attempt-01/input-guard.json.gz', 'rt') as handle:
    checked = json.load(handle)
assert checked['stable']
code_pins = {p: value for p, value in checked['after']['files'].items()
             if p.endswith(('.mjs', '.py', '.ts', '.json')) and not p.startswith(prefix)}
assert all(current[p] == value for p, value in code_pins.items())
authored = [ROOT / p for p in added] + [ROOT / p for p in allowed if p.endswith('.mjs')]
assert all(all(line == line.rstrip() for line in path.read_text().splitlines()) for path in authored)
report = {
    'status': 'Pass', 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceHead': head, 'baselineFiles': len(baseline['files']),
    'originalFilesUnchanged': len(baseline['files']) - len(changed),
    'authorizedChangedExistingPaths': changed, 'newSourceTestPaths': added,
    'otherTaskObjectsPreserved': len(roadmap['tasks']) - 1,
    'milestoneObjectsPreserved': len(roadmap['milestones']),
    'foreignFilesPreserved': {p: current[p] for p in foreign},
    'exactInitialHarnessCopies': len(preserved),
    'checkedCodeInputsStillUnchanged': len(code_pins),
    'scope': 'Bounded local byte/object preservation and source whitespace only; original evidence unchanged, full task still blocked, no commit/remote/measurement qualification.',
    'currentNonSliceHashes': current,
}
(HERE / 'preservation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'currentNonSliceHashes'}, indent=2))
