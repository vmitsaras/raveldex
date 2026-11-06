"""Closing project/private-candidate checks; never invokes a benchmark collector."""
import datetime
import gzip
import hashlib
import json
import os
import pathlib
import platform
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[4]
attempt = sys.argv[1] if len(sys.argv) == 2 else 'attempt-01'
assert re.fullmatch(r'attempt-\d\d', attempt)
out = HERE / attempt
assert not out.exists(), 'Preserve earlier check attempts'
out.mkdir()
temporary = pathlib.Path('/private/tmp/raveldex-rx9006-overhead-slice1-20261106')
temporary.mkdir(exist_ok=True)
work = temporary / attempt
assert not work.exists()
work.mkdir()
prefix = str(HERE.relative_to(ROOT)) + '/'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def included(path):
    return not path.startswith(prefix) or path.endswith(('.py', '.mjs'))

def snapshot():
    paths = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT,
    ).decode().split('\0')
    status = subprocess.check_output(['git', 'status', '--short', '-uall'], cwd=ROOT, text=True).splitlines()
    return {
        'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'status': [line for line in status if prefix not in line or line.endswith(('.py', '.mjs'))],
        'files': {p: sha(ROOT / p) for p in paths if p and included(p) and (ROOT / p).is_file()},
    }

env = os.environ.copy()
cleared_reports = [key for key in env if key.startswith('RAVELDEX_') and key.endswith('_REPORT')]
for key in cleared_reports:
    env.pop(key)
env['npm_config_offline'] = 'true'
env['npm_config_cache'] = '/private/tmp/raveldex-rx9006-20261105/npm-cache'
for key in ['RAVELDEX_UI_BROWSER', 'RAVELDEX_WORKER_BROWSER',
            'RAVELDEX_INDEXEDDB_BROWSER', 'RAVELDEX_CANDIDATE_BROWSER']:
    env[key] = 'chromium'
env['RAVELDEX_RX9002_BULK_REPORT'] = str(work / 'browser-proof.json')
env.pop('RAVELDEX_RX8010_CONSUMER', None)
before = snapshot()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
command = ['npm', 'run', 'candidate:prepare', '--', '--output', str(work / 'candidate')]
with (out / 'process.txt').open('w') as output:
    result = subprocess.run(command, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT)
after = snapshot()
stable = before == after
with gzip.open(out / 'input-guard.json.gz', 'wt') as handle:
    json.dump({'before': before, 'after': after, 'stable': stable}, handle, indent=2)
log_path = work / 'candidate/verification.log'
log = log_path.read_text() if log_path.exists() else ''
counts = {key: sum(map(int, re.findall(r'^(?:#|ℹ) ' + key + r' (\d+)$', log, re.M)))
          for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}
counts_ok = (counts['tests'] >= 1409 and counts['pass'] + counts['skipped'] == counts['tests']
             and counts['skipped'] == 8
             and counts['fail'] == counts['cancelled'] == counts['todo'] == 0)
for source, destination in [
    ('candidate/verification.log', 'full-check.txt'),
    ('candidate/candidate-report.json', 'candidate-report.json'),
    ('candidate/preparation.json', 'preparation.json'),
    ('browser-proof.json', 'browser-proof.json'),
]:
    path = work / source
    if path.exists():
        shutil.copyfile(path, out / destination)
report = {
    'status': 'Pass' if result.returncode == 0 and stable and counts_ok else 'Fail',
    'command': command, 'startedAt': started,
    'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'exitCode': result.returncode, 'counts': counts,
    'guardedInputFiles': len(before['files']), 'headStatusAndInputsUnchanged': stable,
    'sourceHead': before['head'],
    'environment': {
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'npm': subprocess.check_output(['npm', '--version'], text=True).strip(),
        'platform': platform.platform(), 'npmOffline': True,
        'npmCache': env['npm_config_cache'],
        'configuredTestVariables': {key: env[key] for key in [
            'RAVELDEX_UI_BROWSER', 'RAVELDEX_WORKER_BROWSER',
            'RAVELDEX_INDEXEDDB_BROWSER', 'RAVELDEX_CANDIDATE_BROWSER',
            'RAVELDEX_RX9002_BULK_REPORT']},
        'clearedInheritedOptionalReportVariables': cleared_reports,
    },
    'scope': 'Local uncommitted source and private-candidate checks only. No canary, benchmark collector, remote CI or publication. Original v1 sources, validation inputs and all files outside these check outputs are guarded.',
}
if result.returncode == 0:
    candidate = json.loads((out / 'candidate-report.json').read_text())
    archive = pathlib.Path(candidate['package']['tarball'])
    shutil.copyfile(archive, out / 'verified-core.tar.gz')
    report['verifiedArchiveSha256'] = sha(out / 'verified-core.tar.gz')
    report['archiveEqualsOriginalRx9006'] = report['verifiedArchiveSha256'] == sha(
        ROOT / 'docs/evidence/RX-9006/verification/verified-core.tar.gz')
    if not report['archiveEqualsOriginalRx9006']:
        report['status'] = 'Fail'
report['files'] = {p.name: {'bytes': p.stat().st_size, 'sha256': sha(p)}
                   for p in out.iterdir() if p.is_file()}
(out / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'files'}, indent=2))
assert result.returncode == 0 and stable, report
assert counts['tests'] >= 1409 and counts['pass'] + counts['skipped'] == counts['tests'], counts
assert counts['skipped'] == 8 and counts['fail'] == counts['cancelled'] == counts['todo'] == 0, counts
assert report['archiveEqualsOriginalRx9006']
