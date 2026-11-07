"""Focused recovery checks; short fixture processes, no benchmark workloads."""
import datetime
import hashlib
import json
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[4]
names = ['n10-host-browser-method', 'n10-host-recovery-method',
         'n10-host-recovery-verification', 'n10-host-recovery-verification-coverage',
         'n10-host-recovery-profile', 'n10-host-recovery-policy',
         'n10-host-recovery-supervisor']
command = ['node', '--test', '--test-concurrency=1',
           *['test/comparison/' + name + '.test.mjs' for name in names]]
paths = ['bench/n10/host-recovery.mjs', 'bench/n10/host-recovery-policy.mjs',
         'bench/n10/host-recovery-policy-child.mjs', 'bench/n10/host-recovery-supervisor.mjs',
         'bench/n10/host-recovery-case.mjs', 'bench/n10/host-recovery-verification.mjs',
         'bench/n10/host-recovery-profile.mjs',
         *['test/comparison/' + name + '.test.mjs' for name in names]]
def pins():
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths}

assert not (HERE / 'focused.json').exists(), 'Preserve prior check attempts'
before = pins()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
result = subprocess.run(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
blob = result.stdout
(HERE / 'focused-output.txt').write_bytes(blob)
counts = {key: sum(map(int, re.findall(r'^(?:#|ℹ) ' + key + r' (\d+)$', blob.decode(), re.M)))
          for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}
after = pins()
passed = (result.returncode == 0 and before == after and counts['tests'] >= 302
          and counts['pass'] == counts['tests']
          and not any(counts[key] for key in ['fail', 'cancelled', 'skipped', 'todo']))
report = {'status': 'Pass' if passed else 'Fail', 'command': command, 'startedAt': started,
          'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'exitCode': result.returncode, 'counts': counts, 'sourceAndTestPins': before,
          'inputsStable': before == after, 'logSha256': hashlib.sha256(blob).hexdigest(),
          'scope': 'Original focused regressions, pure policy/row/clock fixtures and short fake Node child lifecycle tests. No installed recovery workload, real Chromium named path, engine canary or benchmark collection.'}
(HERE / 'focused.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'sourceAndTestPins'}, indent=2))
assert passed, report
