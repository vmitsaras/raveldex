"""Independent source preservation/diff witness; no engine invocation."""
import datetime
import hashlib
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[4]
SLICE = HERE.parent
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
pins = json.loads((SLICE / 'v1-source-pins.json').read_text())['preservedHarness']
preserved = []
for pin in pins:
    path = SLICE / pin['preservedCopy']
    assert sha(path) == pin['sha256'], pin['path']
    preserved.append({'path': pin['path'], 'preservedCopy': pin['preservedCopy'], 'sha256': pin['sha256']})
old = (SLICE / 'v1/bench/n10/host-recovery-case.mjs').read_text()
new = (ROOT / 'bench/n10/host-recovery-case.mjs').read_text()
functions = []
for name, start, end in [
    ('observe', ' async function observe(', ' async function build('),
    ('build', ' async function build(', ' async function source('),
    ('inspectQueries', ' async function inspectQueries(', ' async function laterWrite('),
    ('captureRecoveryRoot', 'export function captureRecoveryRoot(', None),
]:
    a = old[old.index(start):old.index(end, old.index(start))] if end else old[old.index(start):]
    b = new[new.index(start):new.index(end, new.index(start))] if end else new[new.index(start):]
    assert a == b, name
    functions.append({'function': name, 'unchanged': True, 'utf8Sha256': hashlib.sha256(a.encode()).hexdigest()})
unchanged = []
for pin in pins:
    if pin['path'] not in ['bench/n10/host-recovery-case.mjs', 'bench/n10/host-recovery.mjs']:
        assert sha(ROOT / pin['path']) == pin['sha256'], pin['path']
        unchanged.append(pin['path'])
old_host = (SLICE / 'v1/bench/n10/host-recovery.mjs').read_text()
host = (ROOT / 'bench/n10/host-recovery.mjs').read_text()
for prefix in ['export const RECOVERY_METHOD=', 'export function recoveryPlan()']:
    assert next(line for line in old_host.splitlines() if line.startswith(prefix)) == next(line for line in host.splitlines() if line.startswith(prefix)), prefix
reviewed = ['bench/n10/host-recovery-verification.mjs', 'bench/n10/host-recovery-case.mjs',
            'bench/n10/host-recovery.mjs', 'test/comparison/n10-host-recovery-verification.test.mjs',
            'test/comparison/n10-host-recovery-verification-coverage.test.mjs']
runtime = json.loads((ROOT / 'docs/evidence/RX-9002/baseline.json').read_text())['runtimeSourceInventory']
for member in runtime:
    assert sha(ROOT / member['path']) == member['sha256'], member['path']
freeze = json.loads((ROOT / 'docs/evidence/RX-9001/method-freeze.json').read_text())['files']
for path, value in freeze.items():
    assert sha(ROOT / path) == value, path
report = {
    'status': 'Pass', 'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'preservedExecutedSourcePins': preserved,
    'unchangedFrozenInputPaths': unchanged,
    'unchangedFunctionText': functions,
    'originalRecoveryMethodAnd204PlanUnchanged': True,
    'runtimeSourceMembersUnchanged': len(runtime),
    'originalFrozenMethodFilesUnchanged': len(freeze),
    'currentReviewedSource': [{'path': path, 'sha256': sha(ROOT / path)} for path in reviewed],
    'findings': [{'id': 'R1', 'status': 'Resolved',
                  'issue': 'Standalone row validator originally checked new revision metadata only when supplied through context; malformed advertised row metadata could be accepted without that context.',
                  'resolution': 'Presence-aware row/exercise/context advertisement now requires exact current revision on both row and exercise; null, undefined, false and single-sided advertised fields fail. Genuinely absent historical fields remain accepted. Actual collector paths were already context-bound.',
                  'regression': 'test/comparison/n10-host-recovery-verification.test.mjs standalone revision advertisement test'}],
    'reviewConclusions': [
        'Only the three requested verifier efficiencies plus minimal revision/pin/copy integration are implemented.',
        'Opaque handles are exact-text/context bound and immutable; each fresh capture still calls the strict historical source validator.',
        'Owned raw literal copies precede native calls; derived IDs/source expectations remain lazy, with explicit allocation/warming differences.',
        'Source-only position expectation allocation is gated while core/source checks and exact participant rejection remain; position mode retains every occurrence/offset check.',
        'Observed data is freshly captured and checked. Native/public paging, snapshot, later-write, abort, lifecycle and live root/staging behavior is unchanged in the reviewed diff.',
        'Outer cleanup finally releases context authority even on early returns, Unknown branches or throwing disposal.',
        'Original N9 helpers, production/runtime/dependencies and original native/worker/collection bounds remain unchanged.',
        'No conditional comparator, profiling, new orchestration budget or measurement authorization infrastructure is introduced.',
    ],
    'limitations': [
        'Source review and data-only adversarial checks do not establish native/browser/worker runtime qualification or performance savings.',
        'Raw expectation ownership is not a general detector of mutations to caller-owned inputs; it prevents those mutations from poisoning oracle authority.',
        'No garbage-collection, retained/peak heap, physical-input or new capacity claim follows.',
        'RX-9006 remains blocked on complete collection acceptance; parent integration/project evidence is reviewed separately.',
    ],
}
(HERE / 'source-review.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['status', 'originalRecoveryMethodAnd204PlanUnchanged', 'findings', 'limitations']}, indent=2))
