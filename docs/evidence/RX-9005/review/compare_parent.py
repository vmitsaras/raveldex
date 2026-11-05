"""Compare independent raw statistics with all parent cells/comparisons.
Run after both raw reconstruct.py and parent analysis exist and timing has stopped.
"""
import pathlib,json,hashlib,collections
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[3]
ind_path=HERE/'reconstruction.json';parent_path=ROOT/'docs/evidence/RX-9005/analysis/results.json'
ind=json.loads(ind_path.read_text());parent=json.loads(parent_path.read_text());assert ind['status']=='Pass'
fields=['size','configuration','deadline','caseKey','phase'];metrics=['wallMs','cpuUserMs','cpuSystemMs','cpuTotalMs','invocationToReturnSumMs','returnToSettlementSumMs']
def key(c):return tuple(c[k] for k in fields)
summaries={(key(s),s['role'],s['outcome']):s for s in ind['summaries']};allkeys={(k,role) for k,role,outcome in summaries}
indexed={(key(c),c['role']):c for c in parent['cells']};assert set(indexed)==allkeys and len(indexed)==1380
raw=pathlib.Path(ind['rawDirectory']);pids={};raw_groups=collections.defaultdict(list);outcomes=collections.Counter();calls=collections.Counter();errors=collections.Counter();preps={};verifications={};diagnostics=[]
for pin in ind['rowPins']:
 data=(raw/pin['path']).read_bytes();assert hashlib.sha256(data).hexdigest()==pin['sha256'];r=json.loads(data)
 pids[(r['size'],r['configuration'],r['deadline'],r['role'],r['owner'])]=r['pid']
 for item in r['samples'] if r['mode']=='normal' else r['observations']:
  outcomes[(r['mode'],item['kind'],item['outcome'])]+=1;calls[(r['mode'],'attemptedCalls')]+=item['attemptedCalls'];calls[(r['mode'],'completedCalls')]+=item['completedCalls']
  if item.get('error'):errors[(r['mode'],item['caseKey'],item['error']['code'])]+=1
  if r['mode']=='normal':raw_groups[((r['size'],r['configuration'],r['deadline'],item['caseKey'],item['phase']),r['role'])].append({**item,'owner':r['owner']})
  else:diagnostics.append({**dict(zip(fields,(r['size'],r['configuration'],r['deadline'],item['caseKey'],item['phase']))),'role':r['role'],'owner':r['owner'],**{k:item[k] for k in ['id','kind','batch','outcome','attemptedCalls','completedCalls']},'counters':item.get('counters'),'error':item.get('error')})
 rowkey=(r['size'],r['configuration'],r['role'],r['deadline'],r['mode'],r['owner']);public=[p for p in r['preparation'] if p['purpose'] not in ['initialize-native-factory-and-providers','excluded-warmup-native-window']]
 preps[rowkey]={'childElapsedMs':r['elapsedMs'],'publicPreparationCalls':len(public),'initialization':r['preparation'][0],**{'publicPreparation'+m[0].upper()+m[1:]:sum(p[m] for p in public) for m in ['wallMs','cpuUserMs','cpuSystemMs']}}
 verifications[rowkey]={'checkpoints':len(r['checkpoints']),'stateFiles':r['uniqueStateFiles'],'wallMs':sum(c['verificationWallMs'] for c in r['checkpoints']),'queryPagesActuallyExecuted':sum(c['stats']['queryPages'] for c in r['checkpoints']),'queryScoresActuallyChecked':sum(c['stats']['queryScores'] for c in r['checkpoints'])}
for (k,role),c in indexed.items():
 ss=[s for (kk,rr,oo),s in summaries.items() if kk==k and rr==role];passing=summaries.get((k,role,'Pass'));items=raw_groups[(k,role)]
 assert c['records']==sum(s['records'] for s in ss) and c['outcomes']=={s['outcome']:s['records'] for s in ss} and c['owners']==3
 assert c['attemptedCalls']==sum(i['attemptedCalls'] for i in items) and c['completedCalls']==sum(i['completedCalls'] for i in items)
 assert c['beforePopulation']==sorted({i['beforePopulation'] for i in items}) and c['afterPopulation']==sorted({i['afterPopulation'] for i in items})
 for f in ['id','kind','batch','publicCall']:assert c[f]==items[0][f]
 assert c['requestedCallsPerWindow']==items[0]['requestedCalls']
 for m in metrics:
  expected=passing['metrics'][m] if passing else {'p50':None,'p95':None};actual=c['metrics'][m]
  assert actual['successfulWindows']==(passing['records'] if passing else 0) and actual['p50']==expected['p50'] and actual['p95']==expected['p95'],(k,role,m)
 for owner in c['ownerSummaries']:
  oo=owner['owner'];os=next((x for x in passing['ownerSummaries'] if x['owner']==oo),None) if passing else None
  assert owner['pid']==pids[(k[0],k[1],k[2],role,oo)] and owner['successfulWindows']==(os['samples'] if os else 0)
  assert owner['outcomes']==dict(collections.Counter(i['outcome'] for i in items if i['owner']==oo))
  for m in metrics:assert owner['medians'][m]==(os['medians'][m] if os else None)
ind_pairs={(key(c),c['before'],c['after']):c for c in ind['comparisons']};parent_pairs={(key(c),c['before'],c['after']):c for c in parent['comparisons']};assert set(ind_pairs)==set(parent_pairs) and len(ind_pairs)==920
classifications=collections.Counter();adverse=[];controls=[]
for k,c in parent_pairs.items():
 expected=ind_pairs[k]
 assert 'beforePopulation' not in c and 'afterPopulation' not in c
 a,b=indexed[(k[0],k[1])],indexed[(k[0],k[2])]
 for f,wanted in [('beforeRolePrePopulation',a['beforePopulation']),('afterRolePrePopulation',b['beforePopulation']),('beforeRolePostPopulation',a['afterPopulation']),('afterRolePostPopulation',b['afterPopulation'])]:assert c[f]==wanted,(k,f)
 for f in ['beforeOutcomes','afterOutcomes','comparison','sameRuntimeControl']:assert c[f]==expected[f],(k,f)
 assert set(c['metrics'])==set(expected['metrics'])
 for m,v in expected['metrics'].items():
  for f,w in v.items():assert c['metrics'][m][f]==w,(k,m,f)
  classifications[(c['before'],m,v['classification'])]+=1
  if c['before']=='preN9' and v['classification']=='observed-slower':adverse.append({'cell':list(k[0]),'metric':m,**v})
  if c['before']=='acceptedN9' and v['classification'] in ['observed-faster','observed-slower']:controls.append({'cell':list(k[0]),'metric':m,**v})
assert {(x['mode'],x['kind'],x['outcome']):x['windows'] for x in parent['outcomes']}==outcomes
assert {(x['mode'],x['kind']):x['calls'] for x in parent['nativeCalls']}==calls
assert {(x['mode'],x['caseKey'],x['code']):x['windows'] for x in parent['errors']}==errors
assert parent['sourceReportSha256']==ind['sourceReportSha256']
assert parent['diagnostics']==diagnostics
for group,expected in [('preparation',preps),('verification',verifications)]:
 assert len(parent[group])==len(expected)==144
 for actual in parent[group]:
  k=tuple(actual[f] for f in ['size','configuration','role','deadline','mode','owner'])
  for f,v in expected[k].items():assert actual[f]==v,(group,k,f)
result={'kind':'rx9005-independent-parent-analysis-comparison-v1','status':'Pass','parentResultsSha256':hashlib.sha256(parent_path.read_bytes()).hexdigest(),'independentReconstructionSha256':hashlib.sha256(ind_path.read_bytes()).hexdigest(),'cells':len(indexed),'comparisons':len(parent_pairs),'metricsCompared':metrics,'successfulP95Cells':sum(c['metrics']['wallMs']['p95'] is not None for c in parent['cells']),'classifications':[{'before':a,'metric':m,'classification':cl,'cells':n} for (a,m,cl),n in sorted(classifications.items())],'adverseCells':adverse,'sameRuntimeSeparatedCells':controls,'scope':'Every parent ordinary cell successful quantile, owner median, comparison difference/range/classification and raw outcome/native-call/error total equals independent raw reconstruction. No engine or timing execution. Selected semantic query verification is separate; unweighted classifications do not establish an overall speedup.'}
(HERE/'parent-analysis.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['adverseCells','sameRuntimeSeparatedCells']},indent=2))
