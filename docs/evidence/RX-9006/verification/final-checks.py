"""Read-only closing documentation/planner/site inventory checks."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess

OUT = pathlib.Path(__file__).resolve().parent
ROOT = OUT.parents[3]
env = os.environ.copy()
env['npm_config_offline'] = 'true'
env['npm_config_cache'] = '/tmp/raveldex-rx9006-20261105/npm-cache'
commands = [
    ('docs', ['npm', 'run', 'docs:check']),
    ('planner', ['npm', 'run', 'handoff:check']),
    ('pages', ['npm', 'run', 'pages:check']),
    ('next', ['npm', 'run', 'handoff:next']),
    ('tracking-preview', ['npm', 'run', 'tracking:preview']),
    ('diff', ['git', 'diff', '--check']),
]
results = []
for name, command in commands:
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True)
    blob = result.stdout + result.stderr
    path = OUT / ('final-' + name + '.txt')
    path.write_bytes(blob)
    results.append({'name': name, 'command': command, 'startedAt': started,
                    'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'exitCode': result.returncode, 'bytes': len(blob),
                    'sha256': hashlib.sha256(blob).hexdigest(), 'log': path.name})
    print(name, result.returncode, flush=True)
report = {'status': 'Pass' if all(r['exitCode'] == 0 for r in results) else 'Fail',
          'results': results,
          'scope': 'Local checks only. Tracking preview performs no network requests or remote writes; Pages is an existing-output inventory/link check, not a rebuild or hosted observation.'}
(OUT / 'final-checks.json').write_text(json.dumps(report, indent=2) + '\n')
assert report['status'] == 'Pass'
