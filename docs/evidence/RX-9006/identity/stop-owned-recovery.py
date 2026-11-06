"""Execute ONLY after explicit owner approval; stop one owned benchmark child.

No wildcard process killing, repository reset or data deletion. The active native
child/owned Chromium is signalled so the collector can retain its own failure and
run its finally/identity guards. All original observations remain unmodified.
"""
import pathlib,subprocess,json,hashlib,os,signal,time,datetime
ROOT=pathlib.Path(__file__).resolve().parents[4];OUT=pathlib.Path(__file__).resolve().parent
RAW=pathlib.Path('/private/tmp/raveldex-rx9006-20261105/recovery-full-01');PREP=pathlib.Path('/private/tmp/raveldex-rx9006-20261105/recovery-prepared-04/prepared.json')
approval=ROOT/'docs/evidence/RX-9006/collection-budget-revision.json';approved=json.loads(approval.read_text())
assert approved['status']=='Owner approved' and approved['id']=='owner-approved-300m-20261105'
assert approved['newFullBudgetMs']==18000000 and approved['originalFullBudgetMs']==10800000
assert approved['authorizesStoppingCurrentAttempt'] is True
expected=['bench/n10/host-recovery.mjs','collect','--prepared',str(PREP.parent),'--output',str(RAW),'--profile','full']
def processes():
 text=subprocess.check_output(['ps','-axo','pid=,ppid=,command='],text=True)
 result=[]
 for line in text.splitlines():
  parts=line.strip().split(None,2)
  if len(parts)==3:result.append({'pid':int(parts[0]),'ppid':int(parts[1]),'command':parts[2]})
 return result
def root_match(row):
 parts=row['command'].split()
 return len(parts)>1 and pathlib.Path(parts[0]).name=='node' and parts[1:]==expected
rows=processes();roots=[r for r in rows if root_match(r)];assert len(roots)==1,('Expected exactly one owned collector',len(roots));collector=roots[0]
known={collector['pid']}
while True:
 new=known|{r['pid'] for r in rows if r['ppid'] in known}
 if new==known:break
 known=new
owned=[r for r in rows if r['pid'] in known]
prepared=json.loads(PREP.read_text());exe=prepared['environment']['chromium']['executable']['path'];target=None
for retry in range(20):
 rows=processes();current=next((r for r in rows if r['pid']==collector['pid']),None);assert current and root_match(current),'Collector changed/exited before stop; no signal sent'
 progress=json.loads((RAW/'progress.json').read_text());job=progress.get('activeJob');assert job,'No recorded active job; no signal sent'
 if job['host']=='Node-direct':
  config=str(RAW/(job['key']+'.config.json'));output=str(RAW/(job['key']+'.json'));child=str(pathlib.Path(prepared['packages'][job['role']+'-'+job['mode']]['directory'])/'node-child.mjs')
  candidates=[r for r in rows if r['ppid']==collector['pid'] and r['command'].split()[1:]==[child,config,output]]
 else:
  candidates=[r for r in rows if r['pid'] in known and r['command'].startswith(exe+' ') and '--type=' not in r['command'] and '--remote-debugging-pipe' in r['command'] and '--user-data-dir=' in r['command']]
 if len(candidates)==1:target=candidates[0];break
 assert len(candidates)==0,'Ambiguous owned child; no signal sent';time.sleep(.2)
assert target,'No unique active owned child identified; no signal sent'
# Recheck exact PID+parent+command immediately before the single signal.
check=next((r for r in processes() if r['pid']==target['pid']),None);assert check==target,'Owned target changed; no signal sent'
record={'kind':'rx9006-operator-stop-v1','status':'Stop requested','requestedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'approvalPath':str(approval.relative_to(ROOT)),'approvalSha256':hashlib.sha256(approval.read_bytes()).hexdigest(),'collector':collector,'activeJob':job,'target':target,'signal':'SIGTERM','ownedProcessSnapshot':owned,'scope':'Explicitly authorized operator stop of only this private attempt. Original180minute bound and partial files preserved; not budget exhaustion, native deadline/refusal or product cancellation evidence. No sample pooling.'}
file=OUT/'first-attempt-operator-stop.json';assert not file.exists();file.write_text(json.dumps(record,indent=2)+'\n')
os.kill(target['pid'],signal.SIGTERM)
closed=False
for _ in range(60):
 if not any(r['pid']==collector['pid'] and root_match(r) for r in processes()):closed=True;break
 time.sleep(.5)
record['collectorExited']=closed;record['observedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();record['status']='Owned active child signalled; collector exited' if closed else 'Owned active child signalled; collector exit pending';record['rawReportExists']=(RAW/'report.json').exists();file.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:v for k,v in record.items() if k not in ['ownedProcessSnapshot']},indent=2));assert closed,'Collector did not exit within30s; no broader kill attempted'
