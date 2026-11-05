from pathlib import Path
import json,collections,math,hashlib
ROOT=Path(__file__).resolve().parents[4];OUT=Path(__file__).resolve().parent
ind=json.loads((OUT/'reconstruction.json').read_text());parent=json.loads((ROOT/'docs/evidence/RX-9004/analysis/results.json').read_text())
raw=Path(ind['rawDirectory']);groups=collections.defaultdict(list)
q=lambda xs,p:sorted(xs)[max(0,math.ceil(len(xs)*p)-1)] if xs else None
metric=lambda x,m:x['cpuUserMs']+x['cpuSystemMs']if m=='cpuTotalMs'else x[m]
fields=['wallMs','cpuUserMs','cpuSystemMs','cpuTotalMs']
for pin in ind['rawRowPins']:
 row=json.loads(Path(pin['path']).read_text())
 if row['mode']!='normal':continue
 for item in row['samples']:groups[(row['family'],row['size'],row['deadline'],item['operation'],item.get('phase','whole-operation'),row['role'])].append({**item,'pid':row['pid'],'owner':row['owner']})
indexed={}
for c in parent['cells']:
 key=(c['family'],c['size'],c['deadline'],c['operation'],c['phase'],c['role']);assert key not in indexed;indexed[key]=c
assert set(indexed)==set(groups)
for key,items in groups.items():
 c=indexed[key];success=[i for i in items if i['outcome']=='Pass'];owners={i['owner']for i in items}
 assert c['records']==len(items) and c['attempts']==sum(i['outcome']!='Not run'for i in items) and c['outcomes']==dict(collections.Counter(i['outcome']for i in items)) and c['owners']==len(owners)
 for m in fields:
  a=[metric(i,m)for i in success];assert c['metrics'][m]['successfulSamples']==len(a);assert c['metrics'][m]['p50']==q(a,.5);assert c['metrics'][m]['p95']==(q(a,.95)if len(a)>=100 else None)
 for o in c['ownerSummaries']:
  a=[i for i in items if i['owner']==o['owner']];passing=[i for i in a if i['outcome']=='Pass'];assert o['pid']==a[0]['pid'] and o['outcomes']==dict(collections.Counter(i['outcome']for i in a)) and o['successfulSamples']==len(passing)
  for m in fields:assert o['medians'][m]==q([metric(i,m)for i in passing],.5)
comparisoncounts=collections.Counter();adverse=[];controls=[];comparisons=[]
for c in parent['comparisons']:
 base=(c['family'],c['size'],c['deadline'],c['operation'],c['phase']);a=indexed[base+(c['before'],)];b=indexed[base+(c['after'],)]
 assert c['beforeOutcomes']==a['outcomes'] and c['afterOutcomes']==b['outcomes']
 good=all(x['outcomes']=={'Pass':x['records']}for x in[a,b])
 if not good:
  sa=a['outcomes'].get('Pass',0);sb=b['outcomes'].get('Pass',0);expected='capacity-improved'if sa==0 and sb==b['records']else'capacity-regressed'if sb==0 and sa==a['records']else'mixed-outcomes'if sa or sb else'no-successful-latency-comparison'
  assert c['comparison']==expected and not c['metrics'];comparisoncounts[(c['before'],'outcomes',expected)]+=1;continue
 assert c['comparison']=='matched-success'
 for m in fields:
  x,y=a['metrics'][m]['p50'],b['metrics'][m]['p50'];ar=[o['medians'][m]for o in a['ownerSummaries']];br=[o['medians'][m]for o in b['ownerSummaries']]
  classification='observed-slower'if max(ar)<min(br)else'observed-faster'if max(br)<min(ar)else'inconclusive-within-observed-variation'
  if min(ar+br)<=0:classification='inconclusive-timer-floor'
  row=c['metrics'][m]
  expected={'beforeP50':x,'afterP50':y,'absoluteChangeMs':y-x,'relativeChangePercent':100*(y-x)/x if x else None,'beforeOwnerMedianRange':[min(ar),max(ar)],'afterOwnerMedianRange':[min(br),max(br)],'beforeP95':a['metrics'][m]['p95'],'afterP95':b['metrics'][m]['p95'],'classification':classification}
  for k,v in expected.items():assert row[k]==v,(base,m,k,row[k],v)
  comparisoncounts[(c['before'],m,classification)]+=1
  if c['before']=='preN9' and classification=='observed-slower':adverse.append({'cell':base,'metric':m,**expected})
  if c['before']=='acceptedN9'and classification in['observed-faster','observed-slower']:controls.append({'cell':base,'metric':m,**expected})
result={'kind':'rx9004-independent-parent-analysis-comparison-v1','status':'Pass','parentResultsSha256':hashlib.sha256((ROOT/'docs/evidence/RX-9004/analysis/results.json').read_bytes()).hexdigest(),'independentReconstructionSha256':hashlib.sha256((OUT/'reconstruction.json').read_bytes()).hexdigest(),'cells':len(indexed),'comparisons':len(parent['comparisons']),'successfulP95Cells':sum(c['metrics']['wallMs']['p95']is not None for c in parent['cells']),'allOutcomeP95Cells':ind['eligibleOutcomeP95Cells'],'counts':[{'before':a,'metric':m,'classification':cl,'cells':n}for(a,m,cl),n in sorted(comparisoncounts.items())],'adverseCpuAndWallCells':adverse,'sameRuntimeSeparatedCells':controls,'scope':'Raw actual cell/owner/quantile/absolute/relative outcome reconstruction agrees with every parent cell and comparison. No engine execution or timing. Same-runtime separation is observed control variation, not an implementation gain. Counts are unweighted cells, not aggregate speedup.'}
(OUT/'parent-analysis.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k not in['adverseCpuAndWallCells','sameRuntimeSeparatedCells']},indent=2))
