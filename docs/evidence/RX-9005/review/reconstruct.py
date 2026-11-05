"""Independent RX-9005 raw trace/distribution reconstruction; no engine imports.
Run after collection. Does not import the JS collector, verifier or summarizer.
"""
import pathlib,json,sys,hashlib,math,collections
RAW=pathlib.Path(sys.argv[1]).resolve();OUT=pathlib.Path(sys.argv[2]).resolve() if len(sys.argv)>2 else pathlib.Path(__file__).with_name('reconstruction.json')
ROOT=pathlib.Path(__file__).resolve().parents[4]
report=json.loads((RAW/'report.json').read_text());assert report['profile']=='full' and report['outcome']=='Collected' and report['guards']=='Pass'
method=json.loads((ROOT/'docs/evaluation/RX-9001-method.json').read_text());u=method['updates'];assert u['children']==144 and u['normalOwners']==3 and u['diagnosticOwners']==1
assert u['budgetMs']==5400000 and u['watchdogMs']==600000,'original machine method remains immutable'
APPROVED_BUDGET_REVISION={'id':'owner-approved-150m-20261105','originalBudgetMs':5400000,'revisedBudgetMs':9000000,'perChildMs':600000}
APPROVED_BUDGET_RECORD_SHA='feb836e8568ab3c2cf490a400194e0b5b6d443a722c68447443a88659f236999'
if report.get('budgetRevision') is None:assert report['budgetMs']==5400000
else:
 assert report['budgetRevision']==APPROVED_BUDGET_REVISION and report['budgetMs']==9000000
 record_path='docs/evidence/RX-9005/collection-budget-revision.json';pins=[p for p in report['harness'] if p['path']==record_path]
 assert pins==[{'path':record_path,'sha256':APPROVED_BUDGET_RECORD_SHA}]
 record_bytes=(RAW/'executed-harness'/record_path).read_bytes();assert hashlib.sha256(record_bytes).hexdigest()==APPROVED_BUDGET_RECORD_SHA
 record=json.loads(record_bytes)
 for k,v in APPROVED_BUDGET_REVISION.items():assert record[k]==v
assert report['perChildMs']==600000 and 0<=report['elapsedMs']<=report['budgetMs']
ROLES=['preN9','acceptedN9','current'];SIZES=[100,1000,10000];CONFIGS=['core-only','source-positions'];DEADLINES=['default30s','explicit60s']
SINGLES=['add-new-vocabulary','replace-existing-vocabulary','replace-new-vocabulary','remove','reinsert','remove-unique-vocabulary']
BATCHES=['addMany-new-vocabulary','addMany-existing-vocabulary','replace-existing-records','remove-existing-records','reinsert-removed-records']
PUBLIC={'add-new-vocabulary':'add','replace-existing-vocabulary':'replace','replace-new-vocabulary':'replace','remove':'remove','reinsert':'add','remove-unique-vocabulary':'remove','addMany-new-vocabulary':'addMany','addMany-existing-vocabulary':'addMany','replace-existing-records':'B sequential replace calls','remove-existing-records':'B sequential remove calls','reinsert-removed-records':'addMany'}
def digest(data):return hashlib.sha256(data).hexdigest()
def compact(value):return json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()
def expected_jobs():
 result=[]
 for owner in range(4):
  rev=owner%2==1;seq=lambda a:list(reversed(a)) if rev else a
  for size in seq(SIZES):
   for configuration in seq(CONFIGS):
    for deadline in seq(DEADLINES):
     for role in seq(ROLES):result.append({'profile':'full','size':size,'configuration':configuration,'deadline':deadline,'deadlineOptions':{} if deadline=='default30s' else {'deadlineMs':60000},'role':role,'owner':owner,'mode':'diagnostic' if owner==3 else 'normal'})
 return result
jobs=expected_jobs();assert len(report['runs'])==len(jobs)==144
assert report.get('intendedPerformanceCollection') is True
rows=[];pids=set();totals=collections.Counter();groups=collections.defaultdict(list);row_pins=[]
def key(row,item):return (row['size'],row['configuration'],row['deadline'],item['caseKey'],item['phase'])
def original_records(n):
 result=[]
 for i in range(n):
  record_id=f'adversarial:{i:05d}';k=f'n9key{i:06d}'
  controls=f"n9common {'n9rare' if i%997==7 else ''} {'n9left' if i%3==0 else ''} {k}a {k}b {k}c"
  phrase='n9red n9blue' if i%3==0 else 'n9red n9gap n9blue'
  body=[controls+' n9echo n9echo n9echo n9echo','n9red','n9blue'] if i%3==2 else controls+' n9echo n9echo n9echo n9echo '+phrase
  result.append({'id':record_id,'text':{'body':body},'metadata':{'group':f'g{i%5}'}})
 return result
originals={n:original_records(n) for n in SIZES}
def authored(record_id,kind,j=0):
 body={'A':'n9common n9red n9blue','B':'n9blue n9common n9red','novel':'n10novel n10replacement n9common'}.get(kind,f'n9common n10batchnovel n10batch{j:06d}')
 return {'id':record_id,'text':{'body':body},'metadata':{'group':'g0' if kind in ['A','B'] else 'g1'}}
def scenario(n,case_id,kind,batch,repetition):
 b=1 if kind=='single' else batch;base=originals[n][:-b];ids=[r['id'] for r in originals[n][-b:]];a=[authored(i,'A') for i in ids];bb=[authored(i,'B') for i in ids];novel=[authored(i,'novel' if kind=='single' else 'batchNovel',j) for j,i in enumerate(ids)]
 prep=[]
 if case_id=='add-new-vocabulary':before=base;after=base+novel;calls=[{'method':'add','input':novel[0]}];rule='create-unique'
 elif case_id=='replace-existing-vocabulary':before=base+(a if repetition%2==0 else bb);after=base+(bb if repetition%2==0 else a);calls=[{'method':'replace','input':after[-1]}];rule='same-live-terms'
 elif case_id=='replace-new-vocabulary':before=base+a;after=base+novel;calls=[{'method':'replace','input':novel[0]}];rule='replace-create-unique'
 elif case_id=='remove':before=base+a;after=base;calls=[{'method':'remove','input':ids[0]}];rule='remove-existing'
 elif case_id=='reinsert':before=base;after=base+a;calls=[{'method':'add','input':a[0]}];prep=[{'method':'add','input':a[0]},{'method':'remove','input':ids[0]}];rule='restore-source-after-real-removal'
 elif case_id=='remove-unique-vocabulary':before=base+novel;after=base;calls=[{'method':'remove','input':ids[0]}];rule='remove-unique'
 elif case_id=='addMany-new-vocabulary':before=base;after=base+novel;calls=[{'method':'addMany','input':novel}];rule='create-batch-unique'
 elif case_id=='addMany-existing-vocabulary':before=base;after=base+a;calls=[{'method':'addMany','input':a}];rule='same-live-terms'
 elif case_id=='replace-existing-records':before=base+a;after=base+bb;calls=[{'method':'replace','input':r} for r in bb];rule='same-live-terms'
 elif case_id=='remove-existing-records':before=base+a;after=base;calls=[{'method':'remove','input':i} for i in ids];rule='remove-existing'
 elif case_id=='reinsert-removed-records':before=base;after=base+a;calls=[{'method':'addMany','input':a}];prep=[{'method':'addMany','input':a}]+[{'method':'remove','input':i} for i in ids];rule='restore-source-after-real-removal'
 else:raise AssertionError(case_id)
 return {'before':before,'after':after,'calls':calls,'prep':prep,'rule':rule}
trace_cache={}
for run,job in zip(report['runs'],jobs):
 assert run['exitCode']==0 and run['timedOut'] is False and run['signal'] is None
 for k,v in job.items():assert run[k]==v,(k,run[k],v)
 file=RAW/run['output'];row=json.loads(file.read_text());rows.append(row);row_pins.append({'path':run['output'],'sha256':digest(file.read_bytes())})
 assert row['kind']=='rx9005-update-child-v1' and row['outcome']=='Collected'
 assert 0<=row['elapsedMs']<=report['perChildMs']
 for k,v in job.items():assert row[k]==v,(k,row[k],v)
 assert row['pid'] not in pids and isinstance(row['pid'],int);pids.add(row['pid'])
 assert row['runtime']['execArgv']==[] and row['runtime']['node']==report['artifacts']['environment']['node']['node']
 assert row['artifactManifestSha256']==report['artifactManifestSha256'] and row['harnessSha256']==report['harnessSha256'] and row['contractSha256']==report['contractSha256']
 artifact=next(a for a in report['artifacts']['artifacts'] if a['role']==row['role']);assert row['artifactSha256']==artifact['sha256'] and row['artifactSource']==artifact['source']
 assert row['packageMetadataSha256']==next(a['sha256'] for a in artifact['members'] if a['path']=='package.json')
 n=row['size'];descriptors=[(name,'single',1,name) for name in SINGLES]+[(name,'batch',b,f'{name}:B{b}') for b in [1,32,256] if b<=n for name in BATCHES]
 na=row['notApplicable'];assert len(na)==(5 if n==100 else 0)
 for i,name in enumerate(BATCHES if n==100 else []):assert na[i]['id']==name and na[i]['batch']==256 and na[i]['attempts']==0 and na[i]['outcome']=='Not applicable' and not any(k in na[i] for k in ['wallMs','cpuUserMs','cpuSystemMs'])
 totals['notApplicable']+=len(na)
 selected=row['samples'] if row['mode']=='normal' else row['observations'];assert (row['observations'] if row['mode']=='normal' else row['samples'])==[]
 expected_count=0
 for case_id,kind,b,case_key in descriptors:
  reps=1 if row['mode']=='diagnostic' else 40 if n==1000 and case_id=='replace-existing-vocabulary' else 2;warmup_count=2 if row['mode']=='normal' and n==1000 and case_id=='replace-existing-vocabulary' else 0;expected_count+=reps
  picked=[s for s in selected if s['caseKey']==case_key];warm=[s for s in row['warmups'] if s['caseKey']==case_key]
  assert [s['repetition'] for s in picked]==list(range(reps));assert [s['repetition'] for s in warm]==list(range(warmup_count))
  for is_warm,items in [(False,picked),(True,warm)]:
   for item in items:
    assert item['id']==case_id and item['kind']==kind and item['batch']==b and item['publicCall']==PUBLIC[case_id]
    ck=(n,case_id,kind,b,item['repetition']%2 if case_id=='replace-existing-vocabulary' else 0)
    if ck not in trace_cache:
     expected=scenario(n,case_id,kind,b,item['repetition']);trace_cache[ck]=expected
    expected=trace_cache[ck];trace=row['traces'][item['traceSha256']];assert digest(compact(trace))==item['traceSha256'];assert trace['calls']==expected['calls'] and trace['preparationCalls']==expected['prep'];assert trace['caseKey']==case_key and trace['batch']==b and trace['vocabularyRule']==expected['rule'];assert trace['beforeRecordsSha256']==digest(compact(expected['before']));assert trace['afterRecordsSha256']==digest(compact(expected['after']))
    assert item['beforePopulation']==len(expected['before']) and item['requestedCalls']==len(expected['calls']);assert item['completedCalls']==len(item['receipts'])==len(item['prefixStates'])==item['atomicCallsVerified'];assert item['attemptedCalls']==len(item['callWindows'])==item['completedCalls']+(1 if item['outcome']=='Refused' else 0)
    assert item['outcome'] in ['Pass','Refused'];assert item['attemptedCalls']<=item['requestedCalls'];assert item['afterRevision']==item['beforeRevision']+item['completedCalls']
    population=item['beforePopulation']
    for index,receipt in enumerate(item['receipts']):
     call=expected['calls'][index];count=len(call['input']) if call['method']=='addMany' else 1;want={'revision':item['beforeRevision']+index+1,'changed':True,'added':count if call['method'] in ['add','addMany'] else 0,'replaced':1 if call['method']=='replace' else 0,'removed':1 if call['method']=='remove' else 0};assert receipt==want;population+=want['added']-want['removed'];assert item['prefixStates'][index]['revision']==want['revision'];assert item['prefixStates'][index]['state'] in row['states']
    for index,boundary in enumerate(item['callWindows']):
     assert boundary['callIndex']==index and boundary['method']==expected['calls'][index]['method'] and boundary['returned'] is True;assert boundary['outcome']==('Pass' if index<item['completedCalls'] else 'Refused');a,b1,c=[boundary[k] for k in ['invocationToReturnMs','returnToSettlementMs','invocationToSettlementMs']];assert all(math.isfinite(x) and x>=0 for x in [a,b1,c]) and abs(c-a-b1)<1e-6
    assert item['afterPopulation']==population and item['beforeState'] in row['states'] and item['afterState'] in row['states']
    if item['outcome']=='Pass':assert item['completedCalls']==item['requestedCalls'] and item['afterPopulation']==len(expected['after']) and 'error' not in item
    else:assert item['error']['code'] in ['WORK_LIMIT_EXCEEDED','DEADLINE_EXCEEDED','LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'] and item['failedCallPreservedAuthoritativePrefix'] is True
    if is_warm:
     assert item['phase']=='untimed-warmup' and not any(k in item for k in ['wallMs','cpuUserMs','cpuSystemMs']);totals['warmups']+=1
    else:
     phase='diagnostic-first-call' if row['mode']=='diagnostic' else 'after-two-warmups' if n==1000 and case_id=='replace-existing-vocabulary' else 'repeat-same-owner' if item['repetition'] else 'first-call-for-case';assert item['phase']==phase
     assert all(math.isfinite(item[k]) and item[k]>=0 for k in ['wallMs','cpuUserMs','cpuSystemMs'])
     if row['mode']=='normal':assert 'counters' not in item;groups[(key(row,item),row['role'],item['outcome'])].append({'owner':row['owner'],'pid':row['pid'],**item})
     else:assert all(isinstance(item['counters'][k],int) and item['counters'][k]>=0 for k in ['emittedSteps','emittedWorkUnits','hostYields'])
     totals[row['mode']+'Windows']+=1;totals[row['mode']+'PublicCalls']+=item['attemptedCalls'];totals[row['mode']+'RequestedCalls']+=item['requestedCalls'];totals[(row['mode'],item['outcome'])]+=1
  assert len(picked)==reps
 assert len(selected)==expected_count
 assert all(p['outcome']=='Pass' for p in row['preparation'])
assert totals['normalWindows']==5544 and totals['diagnosticWindows']==696 and totals['warmups']==72 and totals['notApplicable']==240
assert totals['normalRequestedCalls']==92376 and totals['diagnosticRequestedCalls']==15168
metrics=['wallMs','cpuUserMs','cpuSystemMs','cpuTotalMs','invocationToReturnSumMs','returnToSettlementSumMs']
def value(s,m):
 if m=='cpuTotalMs':return s['cpuUserMs']+s['cpuSystemMs']
 if m=='invocationToReturnSumMs':return sum(c['invocationToReturnMs'] for c in s['callWindows'])
 if m=='returnToSettlementSumMs':return sum(c['returnToSettlementMs'] for c in s['callWindows'])
 return s[m]
def quantile(values,p):return sorted(values)[max(0,math.ceil(len(values)*p)-1)] if values else None
summaries=[]
for (k,role,outcome),samples in sorted(groups.items()):
 owners=sorted({s['owner'] for s in samples});assert owners and set(owners)<=set([0,1,2])
 summaries.append({'size':k[0],'configuration':k[1],'deadline':k[2],'caseKey':k[3],'phase':k[4],'role':role,'outcome':outcome,'records':len(samples),'owners':len(owners),'metrics':{m:{'p50':quantile([value(s,m) for s in samples],.5),'p95':quantile([value(s,m) for s in samples],.95) if len(samples)>=100 else None} for m in metrics},'ownerSummaries':[{'owner':owner,'samples':sum(s['owner']==owner for s in samples),'medians':{m:quantile([value(s,m) for s in samples if s['owner']==owner],.5) for m in metrics}} for owner in owners]})
result={'kind':'rx9005-independent-raw-reconstruction-v1','status':'Pass','sourceReportSha256':digest((RAW/'report.json').read_bytes()),'children':len(rows),'uniquePids':len(pids),'totals':[{'key':list(k) if isinstance(k,tuple) else k,'count':v} for k,v in totals.items()],'summaries':summaries,'successfulP95Cells':sum(s['outcome']=='Pass' and s['metrics']['wallMs']['p95'] is not None for s in summaries),'rowPins':row_pins,'scope':'Raw trace/receipt/population/observable-boundary/coverage and ordinary-distribution reconstruction only; full state/source/position/query replay is a separate review. No engine/scorer/tokenizer/collector import or execution.'}
effects=collections.defaultdict(list)
for (k,role,outcome),samples in groups.items():effects[(k,role)]+=samples
comparisons=[]
for k in sorted({k for k,role in effects}):
 for before,after in [('preN9','current'),('acceptedN9','current')]:
  a,b=effects[(k,before)],effects[(k,after)];oa,ob=[dict(collections.Counter(s['outcome'] for s in ss)) for ss in [a,b]];good=all(o=={'Pass':len(s)} for o,s in [(oa,a),(ob,b)])
  comparison={'size':k[0],'configuration':k[1],'deadline':k[2],'caseKey':k[3],'phase':k[4],'before':before,'after':after,'sameRuntimeControl':before=='acceptedN9','beforeOutcomes':oa,'afterOutcomes':ob,'metrics':{}}
  if good:
   comparison['comparison']='matched-success'
   for m in metrics:
    def owner_medians(ss):return [quantile([value(s,m) for s in ss if s['owner']==owner],.5) for owner in sorted({s['owner'] for s in ss})]
    ar,br=owner_medians(a),owner_medians(b);x,y=[quantile([value(s,m) for s in ss],.5) for ss in [a,b]]
    classification='inconclusive-insufficient-owners' if min(len(ar),len(br))<3 else 'inconclusive-timer-floor' if min(ar+br)<=0 else 'observed-faster' if max(br)<min(ar) else 'observed-slower' if min(br)>max(ar) else 'inconclusive-within-observed-variation'
    comparison['metrics'][m]={'beforeP50':x,'afterP50':y,'absoluteChangeMs':y-x,'relativeChangePercent':100*(y-x)/x if x else None,'beforeOwnerMedianRange':[min(ar),max(ar)],'afterOwnerMedianRange':[min(br),max(br)],'beforeP95':quantile([value(s,m) for s in a],.95) if len(a)>=100 else None,'afterP95':quantile([value(s,m) for s in b],.95) if len(b)>=100 else None,'classification':classification}
  else:
   sa,sb=oa.get('Pass',0),ob.get('Pass',0);comparison['comparison']='capacity-improved' if not sa and sb==len(b) else 'capacity-regressed' if not sb and sa==len(a) else 'mixed-outcomes' if sa or sb else 'no-successful-latency-comparison'
  comparisons.append(comparison)
result['rawDirectory']=str(RAW);result['comparisons']=comparisons
OUT.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['rowPins','summaries','comparisons']},indent=2))
