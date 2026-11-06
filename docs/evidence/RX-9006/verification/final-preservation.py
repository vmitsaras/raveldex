"""Bind final scope to the original checkout and the closing-check snapshot."""
import datetime
import gzip
import hashlib
import json
import pathlib
import subprocess

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parents[3]
EV = OUT.parent
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

baseline = json.loads((EV / 'baseline.json').read_text())
sync = json.loads((EV / 'identity/documentation-sync-inputs.json').read_text())
roadmap = json.loads((ROOT / 'docs/planning/roadmap.json').read_text())
with gzip.open(OUT / 'worktree-guard.json.gz', 'rt') as handle:
    checked = json.load(handle)
assert checked['stable']
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
assert head == baseline['head'] == checked['after']['head']
paths = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT,
).decode().split('\0')
current = {p: sha(ROOT / p) for p in paths if p and (ROOT / p).is_file()
           and not p.startswith('docs/evidence/RX-9006/')}
owned = {'CODEX_HANDOFF.md', 'PROJECT_CONTEXT.md', 'ROADMAP.md',
         'IMPLEMENTATION_TASKS.md', 'docs/planning/roadmap.json',
         'docs/specs/N10_HARDENING_PERFORMANCE_REVIEW.md'}
foreign = {'docs/planning/GITHUB_TRACKING.md', 'docs/planning/github-links.json'}
changed = sorted(p for p, value in baseline['files'].items() if current.get(p) != value)
assert set(changed) == owned | foreign, changed
assert all(current[p] == value for p, value in sync['foreignFiles'].items())
assert [t for t in roadmap['tasks'] if t['id'] != 'RX-9006'] == sync['allOtherTasks']
assert roadmap['milestones'] == sync['milestones']
assert next(t for t in roadmap['tasks'] if t['id'] == 'RX-9006')['status'] == 'blocked'
assert next(t for t in roadmap['tasks'] if t['id'] == 'RX-9007')['status'] == 'planned'
after_check_changes = sorted(p for p, value in checked['after']['files'].items()
                             if current.get(p) != value)
assert set(after_check_changes) == {
    'CODEX_HANDOFF.md', 'PROJECT_CONTEXT.md',
    'docs/specs/N10_HARDENING_PERFORMANCE_REVIEW.md', 'docs/evidence/RX-9006.md',
    'docs/evaluation/RX-9006.md',
}, after_check_changes
assert set(current) == set(checked['after']['files'])
new_paths = sorted(set(current) - set(baseline['files']))
assert set(new_paths) == {
    'bench/n10/host-browser.mjs', 'bench/n10/host-recovery.mjs',
    'bench/n10/host-recovery-case.mjs', 'bench/n10/host-recovery-instrument.mjs',
    'test/comparison/n10-host-browser-method.test.mjs',
    'test/comparison/n10-host-recovery-method.test.mjs',
    'docs/evaluation/RX-9006.md', 'docs/evidence/RX-9006.md',
    'docs/planning/N11_GITHUB.md', 'docs/specs/N11_UI_UX_POLISH.md',
}, new_paths
report = {
    'status': 'Pass', 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'head': head, 'originalTrackedFiles': len(baseline['files']),
    'ownedChangedOriginalFiles': sorted(owned),
    'preservedForeignChangedOriginalFiles': sorted(foreign),
    'unrelatedOriginalFilesUnchanged': len(baseline['files']) - len(changed),
    'newNonTaskEvidencePaths': new_paths, 'foreignFilesUnchanged': sync['foreignFiles'],
    'otherTaskObjectsPreserved': len(sync['allOtherTasks']),
    'allMilestoneObjectsPreserved': len(sync['milestones']),
    'afterFullCheckDocumentationChanges': after_check_changes,
    'allOtherCheckedRuntimeHarnessTestAndNonTaskInputsUnchanged': True,
    'scope': 'Local byte/object preservation only, no remote synchronization or clean committed-head claim.',
    'currentNonTaskFileHashes': current,
}
(OUT / 'final-preservation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'currentNonTaskFileHashes'}, indent=2))
