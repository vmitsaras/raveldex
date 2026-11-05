"""RX-9005 raw-only ordinary statistics. Never executes a search engine.
Run only after the complete serial collector has stopped; independent review is
required before these descriptive distributions become accepted evidence.
"""
import pathlib,json,collections,math,hashlib,csv,sys
raw=pathlib.Path(sys.argv[1]);out=pathlib.Path(__file__).resolve().parent
run=json.loads((raw/'report.json').read_text());assert run['profile']=='full' and run['outcome']=='Collected' and run['guards']=='Pass'
assert len(run['runs'])==144
rows=[json.loads((raw/r['output']).read_text()) for r in run['runs']];assert len({r['pid'] for r in rows})==144
fields=['size','configuration','deadline','caseKey','phase'];metrics=['wallMs','cpuUserMs','cpuSystemMs','cpuTotalMs','invocationToReturnSumMs','returnToSettlementSumMs']
def key(r,i):return (r['size'],r['configuration'],r['deadline'],i['caseKey'],i['phase'])
def quantile(a,p):return sorted(a)[max(0,math.ceil(len(a)*p)-1)] if a else None
def metric(i,m):
 if m=='cpuTotalMs':return i['cpuUserMs']+i['cpuSystemMs']
 if m=='invocationToReturnSumMs':return sum(c['invocationToReturnMs'] for c in i['callWindows'])
 if m=='returnToSettlementSumMs':return sum(c['returnToSettlementMs'] for c in i['callWindows'])
 return i[m]
groups=collections.defaultdict(list);diagnostics=[];outcomes=collections.Counter();errors=collections.Counter();warmups=0;na=0;prep=[];verification=[];counts=collections.Counter()
for row in rows:
 assert row['outcome']=='Collected';mode=row['mode'];warmups+=len(row['warmups']);na+=len(row['notApplicable']);assert all(x['attempts']==0 for x in row['notApplicable'])
 prep.append({'size':row['size'],'configuration':row['configuration'],'role':row['role'],'deadline':row['deadline'],'mode':mode,'owner':row['owner'],'childElapsedMs':row['elapsedMs'],'publicPreparationCalls':sum(p['purpose']!='initialize-native-factory-and-providers' and p['purpose']!='excluded-warmup-native-window' for p in row['preparation']),'initialization':row['preparation'][0],'publicPreparationWallMs':sum(p['wallMs'] for p in row['preparation'] if p['purpose'] not in ['initialize-native-factory-and-providers','excluded-warmup-native-window']),'publicPreparationCpuUserMs':sum(p['cpuUserMs'] for p in row['preparation'] if p['purpose'] not in ['initialize-native-factory-and-providers','excluded-warmup-native-window']),'publicPreparationCpuSystemMs':sum(p['cpuSystemMs'] for p in row['preparation'] if p['purpose'] not in ['initialize-native-factory-and-providers','excluded-warmup-native-window'])})
 verification.append({'size':row['size'],'configuration':row['configuration'],'role':row['role'],'deadline':row['deadline'],'mode':mode,'owner':row['owner'],'checkpoints':len(row['checkpoints']),'stateFiles':row['uniqueStateFiles'],'wallMs':sum(x['verificationWallMs'] for x in row['checkpoints']),'queryPagesActuallyExecuted':sum(x['stats']['queryPages'] for x in row['checkpoints']),'queryScoresActuallyChecked':sum(x['stats']['queryScores'] for x in row['checkpoints'])})
 for i in row['samples'] if mode=='normal' else row['observations']:
  outcomes[(mode,i['kind'],i['outcome'])]+=1;counts[(mode,'attemptedCalls')]+=i['attemptedCalls'];counts[(mode,'completedCalls')]+=i['completedCalls']
  if i.get('error'):errors[(mode,i['caseKey'],i['error']['code'])]+=1
  if mode=='normal':assert 'counters' not in i;groups[(key(row,i),row['role'])].append({'pid':row['pid'],'owner':row['owner'],**i})
  else:diagnostics.append({**dict(zip(fields,key(row,i))),'role':row['role'],'owner':row['owner'],'id':i['id'],'kind':i['kind'],'batch':i['batch'],'outcome':i['outcome'],'attemptedCalls':i['attemptedCalls'],'completedCalls':i['completedCalls'],'counters':i.get('counters'),'error':i.get('error')})
assert sum(n for (mode,k,o),n in outcomes.items() if mode=='normal')==5544
assert sum(n for (mode,k,o),n in outcomes.items() if mode=='diagnostic')==696
assert warmups==72 and na==240
cells=[];index={}
for (k,role),items in sorted(groups.items()):
 success=[i for i in items if i['outcome']=='Pass'];owners=sorted({i['owner'] for i in items});assert owners==[0,1,2]
 cell={**dict(zip(fields,k)),'role':role,'id':items[0]['id'],'kind':items[0]['kind'],'batch':items[0]['batch'],'publicCall':items[0]['publicCall'],'records':len(items),'owners':3,'outcomes':dict(collections.Counter(i['outcome'] for i in items)),'requestedCallsPerWindow':items[0]['requestedCalls'],'attemptedCalls':sum(i['attemptedCalls'] for i in items),'completedCalls':sum(i['completedCalls'] for i in items),'beforePopulation':sorted({i['beforePopulation'] for i in items}),'afterPopulation':sorted({i['afterPopulation'] for i in items}),'metrics':{},'ownerSummaries':[]}
 for m in metrics:
  a=[metric(i,m) for i in success];cell['metrics'][m]={'successfulWindows':len(a),'p50':quantile(a,.5),'p95':quantile(a,.95) if len(a)>=100 else None,'p95Scope':'Descriptive nearest rank across correlated windows' if len(a)>=100 else 'Not estimated: fewer than100 actual same-cell successful windows'}
 for owner in owners:
  ii=[i for i in items if i['owner']==owner];passing=[i for i in ii if i['outcome']=='Pass'];cell['ownerSummaries'].append({'owner':owner,'pid':ii[0]['pid'],'outcomes':dict(collections.Counter(i['outcome'] for i in ii)),'successfulWindows':len(passing),'medians':{m:quantile([metric(i,m) for i in passing],.5) for m in metrics}})
 cells.append(cell);index[(k,role)]=cell
comparisons=[]
for k in sorted({k for k,role in groups}):
 for before,after in [('preN9','current'),('acceptedN9','current')]:
  a,b=index[(k,before)],index[(k,after)];c={**dict(zip(fields,k)),'id':a['id'],'kind':a['kind'],'batch':a['batch'],'publicCall':a['publicCall'],'before':before,'after':after,'sameRuntimeControl':before=='acceptedN9','beforeOutcomes':a['outcomes'],'afterOutcomes':b['outcomes'],'beforeRolePrePopulation':a['beforePopulation'],'afterRolePrePopulation':b['beforePopulation'],'beforeRolePostPopulation':a['afterPopulation'],'afterRolePostPopulation':b['afterPopulation'],'metrics':{}}
  assert a['beforePopulation']==b['beforePopulation'];assert a['requestedCallsPerWindow']==b['requestedCallsPerWindow']
  if not all(x['outcomes']=={'Pass':x['records']} for x in [a,b]):
   sa=a['outcomes'].get('Pass',0);sb=b['outcomes'].get('Pass',0);c['comparison']='capacity-improved' if sa==0 and sb==b['records'] else 'capacity-regressed' if sb==0 and sa==a['records'] else 'mixed-outcomes' if sa or sb else 'no-successful-latency-comparison'
  else:
   assert a['afterPopulation']==b['afterPopulation'];c['comparison']='matched-success'
   for m in metrics:
    am=[x['medians'][m] for x in a['ownerSummaries']];bm=[x['medians'][m] for x in b['ownerSummaries']];pa,pb=a['metrics'][m]['p50'],b['metrics'][m]['p50'];classification='observed-slower' if max(am)<min(bm) else 'observed-faster' if max(bm)<min(am) else 'inconclusive-within-observed-variation'
    if min(am+bm)<=0:classification='inconclusive-timer-floor'
    c['metrics'][m]={'beforeP50':pa,'afterP50':pb,'absoluteChangeMs':pb-pa,'relativeChangePercent':100*(pb-pa)/pa if pa else None,'beforeOwnerMedianRange':[min(am),max(am)],'afterOwnerMedianRange':[min(bm),max(bm)],'beforeP95':a['metrics'][m]['p95'],'afterP95':b['metrics'][m]['p95'],'classification':classification,'interpretation':'Same-runtime observer-conditioned method/environment variation, never another implementation gain' if before=='acceptedN9' else 'Scoped observed owner-median range separation, not population confidence interval'}
  comparisons.append(c)
assert len(cells)==1380 and len(comparisons)==920
result={'kind':'rx9005-ordinary-reconstruction-v1','sourceReportSha256':hashlib.sha256((raw/'report.json').read_bytes()).hexdigest(),'rawDirectory':str(raw),'children':144,'normalChildren':108,'diagnosticChildren':36,'warmupCalls':warmups,'zeroAttemptInapplicableCaseRows':na,'outcomes':[{'mode':m,'kind':k,'outcome':o,'windows':n} for (m,k,o),n in sorted(outcomes.items())],'nativeCalls':[{'mode':m,'kind':k,'calls':n} for (m,k),n in sorted(counts.items())],'errors':[{'mode':m,'caseKey':c,'code':code,'windows':n} for (m,c,code),n in sorted(errors.items())],'cells':cells,'comparisons':comparisons,'diagnostics':diagnostics,'preparation':prep,'verification':verification,'limits':['Mutation windows are invocation-through-Promise settlement, not isolated queue/admission/engine CPU.','Invocation-return includes synchronous ownership/admission/first pump; remainder is not pure queue wait.','Sequence windows retain clocks/vectors/receipts/immutable roots, affecting resource lifetime; no overhead subtraction or pure unobserved batch claim.','Reset and verification run in the same process outside windows and can warm analyzer/JIT; first/repeated is not coldmachine.','No per-call sequence pooling to manufacture100-observation p95; batchthroughput stays whole-window per fixed B.','Fresh/cached/selected query verification scopes remain separate from measured mutation latency and current-root query admission.','Current/accepted bytes are equal; observed variations are controls, not additional optimization.']}
(out/'results.json').write_text(json.dumps(result,indent=2)+'\n')
with (out/'comparisons.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=fields+['kind','batch','publicCall','before','after','sameRuntimeControl','comparison','metric','classification','beforeP50','afterP50','absoluteChangeMs','relativeChangePercent','beforeP95','afterP95','beforeOwnerMedianRange','afterOwnerMedianRange']);writer.writeheader()
 for c in comparisons:
  base={k:c[k] for k in fields+['kind','batch','publicCall','before','after','sameRuntimeControl','comparison']}
  if not c['metrics']:writer.writerow({**base,'classification':c['comparison']})
  for m,v in c['metrics'].items():writer.writerow({**base,'metric':m,**{k:v[k] for k in ['classification','beforeP50','afterP50','absoluteChangeMs','relativeChangePercent','beforeP95','afterP95','beforeOwnerMedianRange','afterOwnerMedianRange']}})
print(json.dumps({'children':144,'windows':sum(outcomes.values()),'normalCells':len(cells),'comparisons':len(comparisons),'successfulP95Cells':sum(c['metrics']['wallMs']['p95'] is not None for c in cells),'outcomes':result['outcomes'],'nativeCalls':result['nativeCalls'],'preCurrentClassifications':{m:dict(collections.Counter(c['metrics'].get(m,{}).get('classification',c['comparison']) for c in comparisons if c['before']=='preN9')) for m in metrics}},indent=2))
