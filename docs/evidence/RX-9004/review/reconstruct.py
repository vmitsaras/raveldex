#!/usr/bin/env python3
"""Independent read-only full raw reconstruction. No runtime imports or engine work.

Run only after timed collection ends. Reads actual JSON records and writes this
review directory's reconstruction.json. Semantic acceptance remains separate.
"""
from pathlib import Path
import collections,datetime,hashlib,json,math,sys
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
raw=Path(sys.argv[1]).resolve()
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def q(values,fraction=.5):
 assert values and all(isinstance(x,(int,float)) and math.isfinite(x) and x>=0 for x in values)
 return sorted(values)[max(0,math.ceil(len(values)*fraction)-1)]
def keystr(key):return json.dumps(key,separators=(',',':'),ensure_ascii=False)
def finite(x):return isinstance(x,(int,float)) and math.isfinite(x) and x>=0
preflight=read(OUT/'preflight.json');expected=preflight['jobs']
report=read(raw/'report.json');assert report['outcome']=='Collected' and report['guards']=='Pass'
assert report['profile']=='full' and report['intendedPerformanceCollection'] is True and report['acceptedPerformanceEvidence'] is False
assert len(report['runs'])==216
rows=[];pins=[];pids=set();counts=collections.Counter();summarygroups=collections.defaultdict(list);cohorts=collections.defaultdict(list);effects=collections.defaultdict(list)
for job,run in zip(expected,report['runs']):
 for k in ['family','size','deadline','role','owner','mode','samples','warmups']:assert run[k]==job[k],(k,run[k],job[k])
 assert run['exitCode']==0 and run['signal'] is None and run['timedOut'] is False
 path=raw/run['output'];row=read(path);rows.append(row);pins.append({'path':str(path),'bytes':path.stat().st_size,'sha256':sha(path)})
 assert row['outcome']=='Collected' and row['profile']=='full' and row['pid'] not in pids;pids.add(row['pid'])
 for k in ['family','size','deadline','role','owner','mode']:assert row[k]==job[k]
 assert row['requestedSamples']==job['samples'] and row['requestedWarmups']==job['warmups']
 assert row['deadlineOptions']==({} if row['deadline']=='default30s' else {'deadlineMs':60000})
 assert row['artifactManifestSha256']==report['artifactManifestSha256'] and row['harnessSha256']==report['harnessSha256'] and row['contractSha256']==report['contractSha256']
 mode=row['mode'];data=row['samples'] if mode=='normal' else row['observations'];hidden=row['observations'] if mode=='normal' else row['samples'];assert not hidden
 assert len(data)==3+8*job['samples'];assert len(row['warmups'])==8*job['warmups']
 counts[mode+'Children']+=1;counts['warmups']+=len(row['warmups'])
 operations=collections.Counter(s['operation'] for s in data);assert len(operations)==11
 for op in ['build','exportSource','restoreSource']:assert operations[op]==1
 for op,n in operations.items():
  if op.startswith('query:'):assert n==job['samples']
 for s in data:
  op=s['operation'];outcome=s['outcome'];counts[mode+'Records']+=1;counts[mode+':'+outcome]+=1
  if op.startswith('query:'):
   counts[mode+'QueryCalls']+=1;assert s['resultSha256'] in row['resultCaptures']
   cap=row['resultCaptures'][s['resultSha256']];assert ('result'in cap)!=('error'in cap)
   if 'result'in cap:assert outcome=='Pass' and cap['result']['completeness']=='complete' and cap['result']['revision']==math.ceil(row['size']/256)
   else:assert outcome=='Refused' and cap['error']==s['error'] and s['error']['code'] in ['WORK_LIMIT_EXCEEDED','DEADLINE_EXCEEDED','LIMIT_EXCEEDED']
  if outcome=='Not run':
   assert op=='restoreSource';assert all(k not in s for k in ['wallMs','cpuUserMs','cpuSystemMs','counters','error','result']);assert next(x for x in data if x['operation']=='exportSource')['outcome']=='Refused'
  else:
   assert all(finite(s.get(k)) for k in ['wallMs','cpuUserMs','cpuSystemMs'])
  if mode=='normal':
   assert 'counters'not in s
   base=(row['deadline'],row['variant'],row['family'],row['size'],op,s.get('phase'))
   item={**s,'owner':row['owner'],'pid':row['pid']}
   cohorts[base].append(item);summarygroups[base+(outcome,)].append(item)
   effects[(row['deadline'],row['family'],row['size'],op,s.get('phase'),row['role'])].append(item)
  elif outcome!='Not run':assert isinstance(s.get('counters'),dict)
assert len(pids)==216 and counts['normalChildren']==162 and counts['diagnosticChildren']==54
assert counts['normalQueryCalls']==13536 and counts['diagnosticQueryCalls']==432 and counts['warmups']==576
assert counts['normalRecords']==14022 and counts['diagnosticRecords']==594
actuals={}
for s in report['summaries']:
 k=(s['deadline'],s['variant'],s['family'],s['size'],s['operation'],s['phase'],s['outcome']);assert k not in actuals;actuals[k]=s
assert set(actuals)==set(summarygroups)
reconstructed=[];eligible=0
for k,samples in summarygroups.items():
 actual=[s for s in samples if finite(s.get('wallMs'))];allrows=cohorts[k[:-1]];attempts=[s for s in allrows if s['outcome']!='Not run'];totals=dict(collections.Counter(s['outcome'] for s in allrows))
 expected={'records':len(samples),'attempts':len(actual),'totalAttempts':len(attempts),'outcomes':totals,'failureRate':sum(s['outcome']!='Pass' for s in attempts)/len(attempts) if attempts else None,'outcomeFraction':len(samples)/len(allrows),'owners':len(set(s['pid'] for s in samples)),'p50WallMs':q([s['wallMs'] for s in actual]) if actual else None,'p95WallMs':q([s['wallMs'] for s in actual],.95) if len(actual)>=100 else None,'p50CpuUserMs':q([s['cpuUserMs'] for s in actual]) if actual else None,'p50CpuSystemMs':q([s['cpuSystemMs'] for s in actual]) if actual else None}
 observed=actuals[k]
 for f,v in expected.items():assert observed[f]==v,(k,f,observed[f],v)
 assert observed['samples']==actual
 if expected['p95WallMs']is not None:eligible+=1
 reconstructed.append({'key':list(k),**expected})

def stat(samples):
 successful=[x for x in samples if x['outcome']=='Pass'];actual=[x for x in samples if finite(x.get('wallMs'))];owners=collections.defaultdict(list)
 for x in successful:owners[x['pid']].append(x)
 ownerstats=[]
 for pid,items in owners.items():
  ownerstats.append({'pid':pid,'owner':items[0]['owner'],'calls':len(items),'medianWallMs':q([x['wallMs']for x in items]),'medianCpuUserMs':q([x['cpuUserMs']for x in items]),'medianCpuSystemMs':q([x['cpuSystemMs']for x in items]),'medianCpuTotalMs':q([x['cpuUserMs']+x['cpuSystemMs']for x in items])})
 return {'records':len(samples),'attempts':len(actual),'outcomes':dict(collections.Counter(x['outcome']for x in samples)),'errors':dict(collections.Counter(x['error']['code']for x in samples if 'error'in x)),'successfulCalls':len(successful),'successfulOwnerCount':len(owners),'owners':ownerstats,'medianWallMs':q([x['wallMs']for x in successful]) if successful else None,'medianCpuUserMs':q([x['cpuUserMs']for x in successful]) if successful else None,'medianCpuSystemMs':q([x['cpuSystemMs']for x in successful]) if successful else None,'medianCpuTotalMs':q([x['cpuUserMs']+x['cpuSystemMs']for x in successful]) if successful else None,'p95SuccessfulWallMs':q([x['wallMs']for x in successful],.95) if len(successful)>=100 else None}
def change(a,b,field):
 x,y=a[field],b[field]
 return {'before':x,'after':y,'absolute':y-x if x is not None and y is not None else None,'relativePercent':100*(y/x-1) if x is not None and y is not None and x>0 else None}
def classify(a,b,ownerfield):
 if a['outcomes']=={'Refused':a['records']} and b['outcomes']=={'Pass':b['records']}:return 'Capacity improved; no equal-work ratio'
 if a['outcomes']=={'Pass':a['records']} and b['outcomes']=={'Refused':b['records']}:return 'Capacity regressed; no equal-work ratio'
 if a['outcomes']!={'Pass':a['records']} or b['outcomes']!={'Pass':b['records']}:return 'Inconclusive: nonuniform or unsuccessful outcomes'
 if a['successfulOwnerCount']<3 or b['successfulOwnerCount']<3:return 'Inconclusive: insufficient owners'
 ar=[o[ownerfield] for o in a['owners']];br=[o[ownerfield] for o in b['owners']]
 if min(ar+br)<=0:return 'Inconclusive: zero timer/CPU floor'
 if max(br)<min(ar):return 'Observed faster in these repeats'
 if min(br)>max(ar):return 'Observed slower in these repeats'
 return 'Inconclusive/within observed variation'
comparisons=[]
keys=set(k[:-1]for k in effects)
for base in sorted(keys,key=keystr):
 for before,after in [('preN9','current'),('acceptedN9','current')]:
  a,b=stat(effects[base+(before,)]),stat(effects[base+(after,)])
  wall=classify(a,b,'medianWallMs');cpu=classify(a,b,'medianCpuTotalMs');bothsuccess=a['outcomes']=={'Pass':a['records']} and b['outcomes']=={'Pass':b['records']}
  comparisons.append({'key':list(base),'beforeRole':before,'afterRole':after,'sameRuntimeControl':before=='acceptedN9','before':a,'after':b,'wallClass':wall,'cpuClass':cpu,'interpretation':'Method/environment control, not another optimization'if before=='acceptedN9' else 'Observed pair under frozen owner-median range rule; not population guarantee','successfulLatencyChanges':{k:change(a,b,k)for k in ['medianWallMs','medianCpuUserMs','medianCpuSystemMs','medianCpuTotalMs','p95SuccessfulWallMs']}if bothsuccess else None})
result={'kind':'rx9004-independent-raw-reconstruction-v1','status':'Pass raw reconstruction; full semantic acceptance separate','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rawDirectory':str(raw),'rawReportSha256':sha(raw/'report.json'),'rawRowPins':pins,'counts':dict(counts),'uniqueChildPids':len(pids),'summaryCellsReconstructed':len(reconstructed),'eligibleOutcomeP95Cells':eligible,'summaries':reconstructed,'comparisons':comparisons,'classificationCounts':dict(collections.Counter((('sameRuntime:'if c['sameRuntimeControl']else'preCurrent:')+c['wallClass'])for c in comparisons)),'limitations':['No engine, test, build, collector, installation or network execution by reviewer','Raw group/owner/quantile reconstruction is independent of collector summary functions; selected numerical semantic reconstruction is a separate gate','Same-runtime variation does not represent another implementation gain; no weighted winner or population guarantee','No latency ratio for capacity transition, mixed or unsuccessful outcome cells']}
(OUT/'reconstruction.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items()if k not in ['rawRowPins','summaries','comparisons']},indent=2))
