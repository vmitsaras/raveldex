#!/usr/bin/env python3
"""Pure fixture validation only: never launches native engines or collectors."""
from pathlib import Path
import datetime,hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[5]
OUT=Path(__file__).resolve().parent
PATHS=['bench/n10/host-recovery-case.mjs','bench/n10/host-recovery-verification.mjs','bench/n10/host-recovery-profile.mjs','bench/n10/host-recovery.mjs','test/comparison/n10-host-recovery-profile.test.mjs']
def pins():
 return {p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in PATHS}
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
before=pins()
command=['node','--test','--test-concurrency=1','test/comparison/n10-host-recovery-profile.test.mjs']
result=subprocess.run(command,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(OUT/'focused-output.txt').write_text(result.stdout)
after=pins()
counts={}
for line in result.stdout.splitlines():
 for key in ['tests','suites','pass','fail','cancelled','skipped','todo']:
  if line.startswith('ℹ '+key+' '):counts[key]=int(line.split()[-1])
report={'kind':'rx9006-slice2-independent-fake-profile-validation-v1','startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'exitCode':result.returncode,'counts':counts,'inputsBefore':before,'inputsAfter':after,'inputsStable':before==after,'outcome':'Pass' if result.returncode==0 and before==after else 'Fail','scope':'Pure hand-derived fixtures, injected clocks, d95fca1 source differential. No native engines, canaries or collectors. Not measured performance evidence.','baseline':'reference/pins.json','canariesStarted':0,'benchmarkCollectionsStarted':0,'nativeEnginesCreated':0}
(OUT/'focused.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'outcome':report['outcome'],'counts':counts,'inputsStable':before==after}))
raise SystemExit(0 if report['outcome']=='Pass' else 1)
