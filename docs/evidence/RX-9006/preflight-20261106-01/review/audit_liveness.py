"""One read-only OS snapshot, filtered to the recorded attempt; no signals."""
from pathlib import Path
import datetime,json,subprocess
HERE=Path(__file__).resolve().parent
raw=Path('/private/tmp/raveldex-rx9006-preflight-20261106-01/attempt')
s=json.loads((raw/'supervisor.json').read_text());r=json.loads((raw/'inner/report.json').read_text());process=json.loads((HERE.parent/'process.json').read_text())
pids={process['pid'],*(x['pid'] for x in s['ownedGroups'])}
for run in r['runs']:
 row=json.loads((raw/'inner'/run['file']).read_text())
 if row['job']['host']=='Node-direct':pids.add(row['pid'])
groups={x['pgid'] for x in s['ownedGroups']}
command=['/bin/ps','-ax','-o','pid=,ppid=,pgid=,stat=']
result=subprocess.run(command,capture_output=True,text=True,timeout=5);assert result.returncode==0,result.stderr
matched=[]
for line in result.stdout.splitlines():
 values=line.split();assert len(values)==4
 pid,ppid,pgid=map(int,values[:3]);state=values[3]
 if pid in pids or pgid in groups:matched.append({'pid':pid,'ppid':ppid,'pgid':pgid,'state':state})
live=[x for x in matched if not x['state'].startswith('Z')]
report={'status':'Pass' if not live else 'Fail','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'recordedPids':sorted(pids),'recordedGroups':sorted(groups),'matchedRows':matched,'liveRecordedWork':live,'signalsSent':False,'scope':'One post-exit process-table metadata read, filtered before persistence to recorded attempt PIDs/groups. No signal, process-name discovery/kill, browser/engine launch or heap inference. Non-executing orphan zombies, if any, are distinguished from live work.'}
(HERE/'cleanup-liveness.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));assert not live,report
