"""Independent raw policy/identity/clock/phase audit; never runs an engine."""
from collections import Counter, defaultdict
from pathlib import Path
import datetime, gzip, hashlib, json, math

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
BASE=HERE.parent
RAW=Path('/private/tmp/raveldex-rx9006-preflight-20261106-01/attempt')
INNER=RAW/'inner'
load=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
canonical=lambda value:json.dumps(value,ensure_ascii=False,separators=(',',':'))
parse=lambda value:datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
r=load(INNER/'report.json');s=load(RAW/'supervisor.json');process=load(BASE/'process.json')
p=load(Path(r['binding']['prepared']['path']));grant=load(BASE/'authorization.json');binding=load(BASE/'binding.json')
expected=[176,178,87,89,*range(180,188),*range(196,204),141,179]
assert process['exitCode']==0 and process['attempts']==1 and process['retryStarted'] is False and process['fullRunStarted'] is False
assert process['command'][2]=='collect-named' and '--preflight' not in process['command'] and len(process['command'])==9
assert process['policy']==r['runPolicy']==s['identity']['policy']==p['runPolicy']==grant['binding']['policy']
policy=r['runPolicy'];assert policy['id']=='rx9006-recommended-preflight-2026-11-06'
assert [policy[k] for k in ['contexts','budgetMs','perContextWatchdogMs','preflightGateMs','closingReserveMs','workCutoffMs']]==[22,9000000,360000,324000,600000,8400000]
assert r['outcome']=='Collected' and r['guards']==r['launchGate']=='Pass' and r['acceptedPerformanceEvidence'] is False
assert r['interrupted'] is False and r['budgetExceeded'] is False and r['activeJob'] is None
assert r['planned']==len(r['runs'])==22 and [x['job']['index'] for x in r['runs']]==expected
assert s['outcome']==s['cleanup']=='Pass' and s['nativeOutcome'] is None and s['childExit']=={'code':0,'signal':None}
assert not any(s.get(k) for k in ['failure','cleanupFailure','reportWriteFailure','budgetExceeded'])
assert not (RAW/'supervisor-incomplete.json').exists() and not (RAW/'supervisor-overrun.json').exists()
assert s['innerReport']=={'path':str(INNER/'report.json'),'sha256':sha(INNER/'report.json')}
assert s['identity']==r['binding']==binding==grant['binding']
assert s['bindingSha256']==hashlib.sha256(canonical(binding).encode()).hexdigest()
assert r['supervisorBinding']=={'attemptId':s['attemptId'],'bindingSha256':s['bindingSha256']}
assert s['authorizationSha256']==r['authorizationSha256']==sha(BASE/'authorization.json')
assert grant['ownerInstruction']['scopes']==['preflight'] and grant['ownerInstruction']['sha256']==sha(BASE/'owner-instruction.txt')
assert parse(grant['issuedAt'])<=parse(s['startedAt']) and parse(grant['expiresAt'])>=parse(s['startedAt'])+datetime.timedelta(milliseconds=policy['budgetMs'])
assert parse(process['startedAt'])<=parse(s['startedAt'])<=parse(r['startedAt'])<=parse(r['finishedAt'])<=parse(s['finishedAt'])<=parse(process['finishedAt'])
assert 0<=r['elapsedMs']<=s['elapsedMs']<=process['commandElapsedMs']<=policy['budgetMs']
assert sha(Path(binding['prepared']['path']))==binding['prepared']['sha256']
assert r['method']==p['method']==binding['baseMethod'] and r['method']['budgetMs']==10800000 and r['method']['perContextWatchdogMs']==300000
assert p['policyJobs']==[p['jobs'][i] for i in expected]
for pin in s['pins']:assert sha(Path(pin['path']))==pin['sha256']
for pin in p['harness']:assert sha(ROOT/pin['path'])==pin['sha256']
for pin in p['preparedFiles']:assert sha(Path(pin['path']))==pin['sha256']
for executable in p['executables'].values():assert sha(Path(executable['path']))==executable['sha256']
assert s['nodeExecutable']=={k:p['executables']['node'][k] for k in ['path','sha256']}
assert len(s['launchers'])==1 and len(s['ownedGroups'])==2
for launcher in s['launchers']:
 assert sha(Path(launcher['path']))==launcher['sha256']
 assert launcher['executablePath']==p['executables']['chromium']['path'] and launcher['executableSha256']==p['executables']['chromium']['sha256']
 assert launcher['moduleSha256']==sha(ROOT/'bench/n10/host-recovery-supervisor.mjs')
with gzip.open(BASE/'input-guard.json.gz','rt') as f:guard=json.load(f)
assert guard['stable'] and guard['before']==guard['after'] and len(guard['before']['files'])==process['guardedInputFiles']==6355
assert process['headStatusAndInputsUnchanged'] is True
with gzip.open(BASE/'launch-inputs.json.gz','rt') as f:assert json.load(f)==guard['before']
# Recheck only immutable execution inputs; parent may update current docs after run.
for name,digest in guard['before']['files'].items():
 if name.startswith(('src/','bench/','test/','integrations/')):assert sha(ROOT/name)==digest
ledger=[e for e in s['events'] if e['type'] in ['context-begin','context-end']]
assert len(ledger)==44
rows=[];pids=set();outcomes=Counter();refusal_codes=Counter();artifact_pins={};configs=0;process_reports=0;window_sums=Counter();phase_groups=defaultdict(list);phase_rows=[];rows_audit=[]
PROFILE_REV={'id':'rx9006-recovery-phases-2026-11-06-slice2','date':'2026-11-06'}
clock='realm-local performance.now()'
semantics='Inclusive wall spans; nested spans overlap. Never sum parent and child durations or timestamps from different realms; not exclusive CPU, engine or heap cost.'
phase_counts=Counter()
def profile(value,realm):
 assert set(value)=={'revision','realm','clock','semantics','spans','remote'} and value['revision']==PROFILE_REV and value['realm']==realm and value['clock']==clock and value['semantics']==semantics
 assert len(value['spans'])<=10000 and len(value['remote'])<=10000
 by_id={};active=[];previous=-math.inf;top=[]
 for span in value['spans']:
  assert set(span)=={'id','parentId','phase','label','startMs','endMs','wallMs','outcome'}
  assert span['id']==len(by_id)+1 and span['outcome'] in ['Pass','Fail']
  assert isinstance(span['phase'],str) and 0<len(span['phase'])<=100 and isinstance(span['label'],str) and len(span['label'])<=200
  assert all(isinstance(span[k],(int,float)) and not isinstance(span[k],bool) and math.isfinite(span[k]) and span[k]>=0 for k in ['startMs','endMs','wallMs'])
  assert span['startMs']>=previous and span['endMs']>=span['startMs'] and abs(span['endMs']-span['startMs']-span['wallMs'])<1e-6
  previous=span['startMs']
  while active and active[-1]['id']!=span['parentId']:assert active.pop()['endMs']<=span['startMs']+1e-6
  assert (active[-1]['id'] if active else None)==span['parentId']
  if span['parentId'] is not None:
   parent=by_id[span['parentId']];assert parent['startMs']<=span['startMs'] and parent['endMs']>=span['endMs']
  else:top.append(span)
  by_id[span['id']]=span;active.append(span);phase_groups[(realm,span['phase'])].append(span['wallMs']);phase_counts[realm]+=1
 for remote in value['remote']:
  assert realm=='browser-main' and remote['realm']=='browser-worker' and remote['remote']==[]
  profile(remote,'browser-worker')
 assert len(value['spans'])+sum(len(remote['spans']) for remote in value['remote'])<=10000
 return {'localSpans':len(value['spans']),'remoteProfiles':len(value['remote']),'remoteSpans':sum(len(remote['spans']) for remote in value['remote']),'localTopLevelInclusiveMs':sum(span['wallMs'] for span in top),'scope':'Top-level local spans only; worker domains are separate. Not total exclusive verification/CPU/heap cost.'}
def artifacts(value):
 if isinstance(value,dict):
  if 'artifact' in value:
   name=value['artifact'];assert '/' not in name and '\\' not in name
   assert name not in artifact_pins
   artifact_pins[name]={k:value[k] for k in ['sha256','bytes']}
  for item in value.values():artifacts(item)
 elif isinstance(value,list):
  for item in value:artifacts(item)
previous_end=0
for i,run in enumerate(r['runs']):
 job=run['job'];assert job==p['jobs'][expected[i]]
 assert job['deadlineOptions']==({} if job['deadline']=='default30s' else {'deadlineMs':60000})
 assert previous_end<=run['dispatchElapsedMs'] and run['dispatchElapsedMs']+policy['perContextWatchdogMs']<=policy['workCutoffMs']
 assert 0<=run['contextElapsedMs']<=policy['preflightGateMs']<policy['perContextWatchdogMs']
 assert abs(run['dispatchElapsedMs']+run['contextElapsedMs']-run['endElapsedMs'])<1e-6 and run['endElapsedMs']<=r['elapsedMs']
 previous_end=run['endElapsedMs']
 begin,end=ledger[2*i:2*i+2]
 assert begin['type']=='context-begin' and end['type']=='context-end' and begin['key']==end['key']==job['key']
 assert begin['elapsedMs']==begin['dispatchElapsedMs']==end['dispatchElapsedMs']==run['dispatchElapsedMs']
 assert end['elapsedMs']==end['endElapsedMs']==run['endElapsedMs'] and end['contextElapsedMs']==run['contextElapsedMs']
 path=INNER/run['file'];assert run['file']==job['key']+'.json' and sha(path)==run['sha256'];row=load(path);case=row['exercise'];rows.append(row)
 assert row['job']==job and row['outcome']==case['outcome']=='Collected' and row['runPolicy']==policy and row['cohortIdentity']==binding['cohortIdentity'] and row['authorizationSha256']==r['authorizationSha256']
 assert row['verificationRevision']==case['verificationRevision']==p['verificationRevision'] and row['profilingRevision']==p['profilingRevision']
 assert row['preparedSha256']==binding['prepared']['sha256'] and row['artifactSha256']==p['packages'][job['role']+'-'+job['mode']]['artifactSha256']
 assert row['identity']==p['workloads'][job['family']+'-'+str(job['size'])]['identity']
 config_path=INNER/run['config']['file'];assert run['config']['file']==job['key']+'.config.json' and sha(config_path)==run['config']['sha256'];config=load(config_path)
 workload=load(Path(p['workloads'][job['family']+'-'+str(job['size'])]['path']))
 assert config=={'job':job,**workload,'profilingRevision':p['profilingRevision'],'verificationRevision':p['verificationRevision'],'artifactSha256':row['artifactSha256'],'preparedSha256':binding['prepared']['sha256']};configs+=1
 if job['host']=='Node-direct':
  pr=INNER/run['process']['file'];assert run['process']['file']==job['key']+'.process.json' and sha(pr)==run['process']['sha256'];execution=load(pr);process_reports+=1
  assert execution['code']==0 and execution['signal'] is None and execution['timedOut'] is False and execution['pid']==row['pid'] and row['pid'] not in pids
  pids.add(row['pid']);assert row['runtime']['node']==p['executables']['node']['version']
 else:assert run['process'] is None and row['pageErrors']==row['externalRequests']==[] and row['browserVersion']==r['browserVersion']=='149.0.7827.55'
 ops=case['samples'] if job['mode']=='normal' else case['observations'];assert (case['observations'] if job['mode']=='normal' else case['samples'])==[]
 assert [x['operation'] for x in ops]==['build','exportSource','restoreSource','deadlineRestore','abortedRestore']
 for operation in ops:
  outcomes[operation['outcome']]+=1
  if operation['outcome']=='Refused':refusal_codes[operation['error']['code']]+=1
  assert 'phaseProfileError' not in case and 'phaseProfile' not in operation
  if operation['outcome']!='Not run':
   assert operation['attempts']==1 and ('counters' in operation)==(job['mode']=='diagnostic')
   assert operation['deadlineOptions']==({'deadlineMs':1} if operation['operation']=='deadlineRestore' else job['deadlineOptions'])
   window_sums[(job['mode'],operation['operation'])]+=operation['wallMs']
  else:assert operation['attempts']==0
 if job['mode']=='normal':assert 'phaseProfile' not in case
 else:
  realm='node-main' if job['host']=='Node-direct' else 'browser-main';entry=profile(case['phaseProfile'],realm)
  if realm=='browser-main':
   worker_labels=[span['label'] for remote in case['phaseProfile']['remote'] for span in remote['spans']]
   bridge_labels=[span['label'] for span in case['phaseProfile']['spans'] if span['phase']=='bridge.worker-root-roundtrip']
   assert worker_labels==bridge_labels
  phase_rows.append({'index':job['index'],'realm':realm,**entry,'selectedOperationWindowMs':sum(op.get('wallMs',0) for op in ops),'contextElapsedMs':run['contextElapsedMs']})
 artifacts(case)
 rows_audit.append({'index':job['index'],'contextElapsedMs':run['contextElapsedMs'],'gateMarginMs':policy['preflightGateMs']-run['contextElapsedMs'],'watchdogMarginMs':policy['perContextWatchdogMs']-run['contextElapsedMs'],'rowSha256':run['sha256']})
for name,meta in artifact_pins.items():assert sha(INNER/name)==meta['sha256'] and (INNER/name).stat().st_size==meta['bytes']
assert len(pids)==17 and configs==22 and process_reports==17 and len(artifact_pins)==58
assert outcomes==Counter({'Pass':26,'Refused':22,'Not run':60,'Cancelled':2})
assert not list(INNER.glob('*.failure.json'))
semantic=load(HERE/'semantic-replay.json');assert semantic['status']=='Pass' and semantic['reportSha256']==sha(INNER/'report.json')
phases={'status':'Pass','contextProfiles':phase_rows,'spanCountsByRealm':dict(phase_counts),'inclusivePhaseSummaries':[{'realm':realm,'phase':phase,'spans':len(values),'inclusiveMsSum':sum(values),'minMs':min(values),'maxMs':max(values)} for (realm,phase),values in sorted(phase_groups.items())],'selectedOperationWindows':[{'mode':mode,'operation':op,'wallMsSum':value} for (mode,op),value in sorted(window_sums.items())],'scope':'Diagnostic inclusive wall observations only. Never add phase totals across overlapping parent/children or across realm clocks. Normal rows have no phaseProfile/counters. Captured sums do not establish exclusive CPU, removable overhead, speedup, GC or heap.'}
(HERE/'phase-summary.json').write_text(json.dumps(phases,indent=2)+'\n')
report={'status':'Pass','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rawDirectory':str(RAW),'innerReportSha256':sha(INNER/'report.json'),'supervisorSha256':sha(RAW/'supervisor.json'),'processSha256':sha(BASE/'process.json'),'innerElapsedMs':r['elapsedMs'],'supervisorElapsedMsBeforeOwnTerminalWrite':s['elapsedMs'],'actualCliCommandElapsedMs':process['commandElapsedMs'],'policy':policy,'contexts':len(rows),'normalContexts':sum(x['job']['mode']=='normal' for x in rows),'diagnosticContexts':len(phase_rows),'rowConfigFiles':configs,'nodeProcessReports':process_reports,'actualNodePids':sorted(pids),'sourceAndRootArtifacts':len(artifact_pins),'operationRows':sum(outcomes.values()),'attemptedOperationRows':sum(outcomes.values())-outcomes['Not run'],'operationOutcomes':dict(outcomes),'refusalCodes':dict(refusal_codes),'contextAudit':rows_audit,'maximumContext':max(rows_audit,key=lambda x:x['contextElapsedMs']),'inputGuardFiles':6355,'inputGuardStable':True,'currentExecutionInputsEqualRunSnapshot':True,'normalObserverIsolation':'Pass','profileClockAndTreeValidation':'Pass','semanticReplay':'semantic-replay.json','phaseSummary':'phase-summary.json','cleanupReportClaim':s['cleanup'],'ownedGroups':s['ownedGroups'],'actualCliExitStatus':0,'unresolvedFindings':[],'limits':['This is one22-context preflight, not the full204-context recovery collection or a matched speed verdict. No samples are pooled.','Saved donor/receiver query results and all membership/later-write pages are independently scored. Post-refusal repeated query parity and prior-removal queries are checked online but their repeated result arrays are not separately serialized; unchanged reviewed source and existing online witnesses remain that evidence layer.','Serialized replay cannot recreate immutable-object/AVL shape observations, physical heap/GC or OS scheduler fairness.','Supervisor serialized elapsed precedes its own terminal write; actual successful CLI duration is the complete invocation witness and also fits150minutes.']}
(HERE/'metadata-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['contextAudit','policy','limits','ownedGroups']},indent=2))
