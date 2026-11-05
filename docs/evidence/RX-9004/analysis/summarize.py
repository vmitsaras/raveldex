"""Reconstruct ordinary distributions and comparisons from every actual raw child.
No engine execution; run only after timed and semantic collectors have stopped.
"""
import json,pathlib,statistics,math,collections,sys,hashlib,csv
raw=pathlib.Path(sys.argv[1]);out=pathlib.Path(__file__).resolve().parent
report=json.loads((raw/'report.json').read_text());assert report['outcome']=='Collected' and report['guards']=='Pass'
assert len(report['runs'])==216
rows=[json.loads((raw/r['output']).read_text()) for r in report['runs']]
assert len({r['pid'] for r in rows})==216
fields=['family','size','deadline','operation','phase']
def key(row,item):return (row['family'],row['size'],row['deadline'],item['operation'],item.get('phase','whole-operation'))
def quantile(a,p):return sorted(a)[max(0,math.ceil(len(a)*p)-1)] if a else None
def metric(item,k):return item['cpuUserMs']+item['cpuSystemMs'] if k=='cpuTotalMs' else item[k]
metrics=['wallMs','cpuUserMs','cpuSystemMs','cpuTotalMs']
groups=collections.defaultdict(list);diagnostics=[];denom=collections.Counter();errors=collections.Counter();warmups=0
for row in rows:
 assert row['outcome']=='Collected'
 mode=row['mode'];warmups+=len(row['warmups'])
 for item in row['samples'] if mode=='normal' else row['observations']:
  denom[(mode,item['operation'].split(':')[0],item['outcome'])]+=1
  if item.get('error'):errors[(mode,item['operation'],item['error']['code'])]+=1
  if mode=='normal':
   assert 'counters' not in item
   groups[(key(row,item),row['role'])].append({'pid':row['pid'],'owner':row['owner'],**item})
  else:diagnostics.append({**dict(zip(fields,key(row,item))),'role':row['role'],'owner':row['owner'],**item})
assert sum(v for (m,op,o),v in denom.items() if m=='normal' and op=='query')==13536
assert sum(v for (m,op,o),v in denom.items() if m=='diagnostic' and op=='query')==432
cells=[];indexed={}
for (k,role),items in sorted(groups.items()):
 outcomes=dict(collections.Counter(i['outcome'] for i in items));success=[i for i in items if i['outcome']=='Pass'];owners=sorted({i['owner'] for i in items});assert owners==[0,1,2]
 entry={**dict(zip(fields,k)),'role':role,'records':len(items),'attempts':sum(i['outcome']!='Not run' for i in items),'outcomes':outcomes,'owners':len(owners),'metrics':{},'ownerSummaries':[]}
 for m in metrics:
  a=[metric(i,m) for i in success];entry['metrics'][m]={'successfulSamples':len(a),'p50':quantile(a,.5),'p95':quantile(a,.95) if len(a)>=100 else None,'p95Scope':'Descriptive nearest-rank across correlated calls' if len(a)>=100 else 'Not estimated: fewer than100 actual same-cell successful observations'}
 for owner in owners:
  ix=[i for i in items if i['owner']==owner];passing=[i for i in ix if i['outcome']=='Pass'];entry['ownerSummaries'].append({'owner':owner,'pid':ix[0]['pid'],'outcomes':dict(collections.Counter(i['outcome'] for i in ix)),'successfulSamples':len(passing),'medians':{m:quantile([metric(i,m) for i in passing],.5) for m in metrics}})
 cells.append(entry);indexed[(k,role)]=entry
comparisons=[]
for k in sorted({k for k,role in groups}):
 for before,after in [('preN9','current'),('acceptedN9','current')]:
  a,b=indexed[(k,before)],indexed[(k,after)];case={**dict(zip(fields,k)),'before':before,'after':after,'beforeOutcomes':a['outcomes'],'afterOutcomes':b['outcomes'],'sameRuntimeControl':before=='acceptedN9','metrics':{}}
  # An owner with any refused/missing call cannot provide a comparable full-success distribution.
  eligible=all(x['outcomes']=={'Pass':x['records']} for x in [a,b])
  if not eligible:
   sa=a['outcomes'].get('Pass',0);sb=b['outcomes'].get('Pass',0)
   case['comparison']='capacity-improved' if sa==0 and sb==b['records'] else 'capacity-regressed' if sb==0 and sa==a['records'] else 'mixed-outcomes' if sa or sb else 'no-successful-latency-comparison'
  else:
   case['comparison']='matched-success'
   for m in metrics:
    am=[x['medians'][m] for x in a['ownerSummaries']];bm=[x['medians'][m] for x in b['ownerSummaries']]
    pa,pb=a['metrics'][m]['p50'],b['metrics'][m]['p50'];classification='observed-slower' if max(am)<min(bm) else 'observed-faster' if max(bm)<min(am) else 'inconclusive-within-observed-variation'
    if min(am+bm)<=0:classification='inconclusive-timer-floor'
    case['metrics'][m]={'beforeP50':pa,'afterP50':pb,'absoluteChangeMs':pb-pa,'relativeChangePercent':100*(pb-pa)/pa if pa else None,'beforeOwnerMedianRange':[min(am),max(am)],'afterOwnerMedianRange':[min(bm),max(bm)],'beforeP95':a['metrics'][m]['p95'],'afterP95':b['metrics'][m]['p95'],'classification':classification,'interpretation':'Same-runtime method/environment variation; never an additional optimization' if before=='acceptedN9' else 'Scoped observed owner-range separation; not a population confidence interval'}
  comparisons.append(case)
result={'kind':'rx9004-ordinary-reconstruction-v1','sourceReportSha256':hashlib.sha256((raw/'report.json').read_bytes()).hexdigest(),'rawDirectory':str(raw),'children':len(rows),'normalChildren':sum(r['mode']=='normal' for r in rows),'diagnosticChildren':sum(r['mode']=='diagnostic' for r in rows),'untimedWarmupCalls':warmups,'denominators':[{'mode':m,'operation':op,'outcome':o,'records':n} for (m,op,o),n in sorted(denom.items())],'errors':[{'mode':m,'operation':op,'code':c,'records':n} for (m,op,c),n in sorted(errors.items())],'cells':cells,'comparisons':comparisons,'diagnostics':diagnostics,'limitations':['Normal process CPU includes harness/promise activity; no isolated engine CPU claim.','No success/refusal pooling, no diagnostic time subtraction, no across-deadline/family/query pooling.','Build is the complete sequence of native admitted batches, each with its own operation deadline; total build wall may exceed30s.','Sparse cells preserve first/repeated phases; tail cells are after2untimed warmups.','No weighted overall winner or another optimization from identical-runtime controls.','Full semantic acceptance is separate and must pass before these descriptive numbers are accepted.']}
(out/'results.json').write_text(json.dumps(result,indent=2)+'\n')
with (out/'comparisons.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=fields+['before','after','comparison','sameRuntimeControl','metric','classification','beforeP50','afterP50','absoluteChangeMs','relativeChangePercent','beforeP95','afterP95','beforeOwnerMedianRange','afterOwnerMedianRange']);writer.writeheader()
 for c in comparisons:
  if not c['metrics']:writer.writerow({**{k:c[k] for k in fields+['before','after','comparison','sameRuntimeControl']},'classification':c['comparison']})
  for m,v in c['metrics'].items():writer.writerow({**{k:c[k] for k in fields+['before','after','comparison','sameRuntimeControl']},'metric':m,**{k:v[k] for k in ['classification','beforeP50','afterP50','absoluteChangeMs','relativeChangePercent','beforeP95','afterP95','beforeOwnerMedianRange','afterOwnerMedianRange']}})
print(json.dumps({'children':len(rows),'cells':len(cells),'comparisons':len(comparisons),'denominators':result['denominators'],'wallClassifications':dict(collections.Counter(c['metrics'].get('wallMs',{}).get('classification',c['comparison']) for c in comparisons if c['before']=='preN9'))},indent=2))
