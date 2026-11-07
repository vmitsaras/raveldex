"""One authorized named preflight. No retries or full-run invocation."""
import datetime
import gzip
import hashlib
import json
import os
import pathlib
import subprocess
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
manifest = json.loads((HERE / 'launch-manifest.json').read_text())
assert manifest['policy']['id'] == 'rx9006-recommended-preflight-2026-11-06'
assert manifest['policy']['budgetMs'] == 9000000
assert manifest['policy']['perContextWatchdogMs'] == 360000
assert manifest['policy']['preflightGateMs'] == 324000
assert manifest['fullRunAuthorized'] is False
assert len(manifest['jobs']) == 22
authorization = json.loads((HERE / 'authorization.json').read_text())
assert authorization['ownerInstruction']['scopes'] == ['preflight']
assert not pathlib.Path(manifest['output']).exists()
for key in ['NODE_OPTIONS', 'NODE_V8_COVERAGE']:
    assert os.environ.get(key, '') == '', key + ' would change the named recipe'
fixed = {'prepare-binding.mjs', 'run-preflight.py', 'authorization.json', 'binding.json',
         'owner-instruction.txt', 'launch-manifest.json', 'prepared.json.gz', 'baseline.json.gz'}
prefix = str(HERE.relative_to(ROOT)) + '/'
def included(path):
    return not path.startswith(prefix) or path.removeprefix(prefix) in fixed
def snapshot():
    paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    status = subprocess.check_output(['git', 'status', '--short', '-uall'], cwd=ROOT, text=True).splitlines()
    return {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'status': [line for line in status if prefix not in line or any(line.endswith(name) for name in fixed)],
            'files': {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths if p and included(p) and (ROOT / p).is_file()}}

with (HERE / 'launch-lock.json').open('x') as handle:
    json.dump({'kind': 'one-preflight-only', 'retryAuthorized': False, 'fullRunAuthorized': False}, handle)
before = snapshot()
with gzip.open(HERE / 'launch-inputs.json.gz', 'wt') as handle:
    json.dump(before, handle)
command = [manifest['executables']['node']['path'], str(ROOT / 'bench/n10/host-recovery.mjs'),
           'collect-named', '--prepared', manifest['preparedPath'], '--output', manifest['output'],
           '--authorization', manifest['authorizationPath']]
started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
started = time.monotonic()
with (HERE / 'process-output.txt').open('x') as output:
    child = subprocess.Popen(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT)
    print(json.dumps({'status': 'Running', 'pid': child.pid, 'policy': manifest['policy']['id'],
                      'startedAt': started_at, 'output': manifest['output']}), flush=True)
    exit_code = child.wait()
command_elapsed = (time.monotonic() - started) * 1000
finished_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
# The measured controller/supervisor has exited. This independent worktree audit
# runs afterward; it is not inserted into native windows or the collector clock.
after = snapshot()
with gzip.open(HERE / 'input-guard.json.gz', 'wt') as handle:
    json.dump({'before': before, 'after': after, 'stable': before == after}, handle)
report = {'kind': 'rx9006-preflight-command-process-v1', 'command': command, 'pid': child.pid,
          'startedAt': started_at, 'finishedAt': finished_at, 'exitCode': exit_code,
          'commandElapsedMs': command_elapsed, 'guardedInputFiles': len(before['files']),
          'headStatusAndInputsUnchanged': before == after,
          'policy': manifest['policy'], 'rawOutput': manifest['output'], 'attempts': 1,
          'retryStarted': False, 'fullRunStarted': False,
          'preflightAcceptance': 'Pending independent audit',
          'verificationFinishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'scope': 'Actual named preflight CLI process status; command wall includes prelaunch binding checks. Fixed policy supervision owns the 150-minute collector cap. Independent post-exit worktree audit is separate. No retry, full run or performance verdict.'}
(HERE / 'process.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
if exit_code != 0:
    raise SystemExit(exit_code if exit_code > 0 else 1)
assert before == after, 'Do not accept changed run inputs'
