"""Run the recorded retention plan only after the original collector terminated."""
import datetime
import hashlib
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
plan = json.loads((HERE / 'retention-plan.json').read_text())
terminal = json.loads((HERE / 'recovery-full-01.json').read_text())
assert terminal['completedAt'] and terminal['exitCode'] == 1
results = []
for item in plan['sources']:
    log = HERE / (item['label'] + '-retention-output.txt')
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with log.open('w') as output:
        result = subprocess.run(
            [sys.executable, '-B', str(HERE / 'retain-shards.py'), item['source'], item['label']],
            cwd=ROOT, stdout=output, stderr=subprocess.STDOUT,
        )
    results.append({**item, 'startedAt': started,
                    'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'exitCode': result.returncode,
                    'logSha256': hashlib.sha256(log.read_bytes()).hexdigest()})
    (HERE / 'retention-execution.json').write_text(json.dumps({
        'status': 'Fail' if result.returncode else 'In progress', 'results': results,
    }, indent=2) + '\n')
    print(item['label'], result.returncode, flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
(HERE / 'retention-execution.json').write_text(json.dumps({
    'status': 'Pass', 'sources': len(results), 'results': results,
    'scope': 'Archive creation only; actual member equivalence requires the independent audit.',
}, indent=2) + '\n')
