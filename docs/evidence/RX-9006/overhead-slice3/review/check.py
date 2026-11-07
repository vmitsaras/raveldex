"""Pure policy and inert-context validation only; never invokes collection."""
import datetime
import hashlib
import json
import pathlib
import re
import subprocess

HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[4]
paths=[f'bench/n10/{name}' for name in ['host-recovery.mjs','host-recovery-policy.mjs','host-recovery-policy-child.mjs','host-recovery-supervisor.mjs','host-recovery-case.mjs','host-recovery-verification.mjs','host-recovery-profile.mjs']]+['test/comparison/n10-host-recovery-policy.test.mjs','test/comparison/n10-host-recovery-supervisor.test.mjs']
def pins():
    return {path:hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in paths}
before=pins();command=['node','--test','--test-concurrency=1','test/comparison/n10-host-recovery-policy.test.mjs']
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
r=subprocess.run(command,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
after=pins();log=r.stdout.decode();(HERE/'policy-final-output.txt').write_bytes(r.stdout)
counts={key:sum(map(int,re.findall(r'^(?:#|ℹ) '+key+r' (\d+)$',log,re.M))) for key in ['tests','pass','fail','cancelled','skipped','todo']}
report={'status':'Pass' if r.returncode==0 and before==after else 'Fail','command':command,'exitCode':r.returncode,'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'counts':counts,'sourceAndTestsUnchanged':before==after,'pins':after,'logSha256':hashlib.sha256(r.stdout).hexdigest(),'scope':'Independent pure policy fixtures and extracted actual browser-context helper with inert page/persistence fakes only. No socket, Browser instance, native engine, canary or benchmark collection.'}
(HERE/'policy-final.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));assert r.returncode==0 and before==after
