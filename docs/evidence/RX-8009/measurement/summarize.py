from pathlib import Path
from collections import Counter
import json,hashlib
base=Path('/tmp/raveldex-rx8009-20261104');sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text())
pairs=[('planning','baseline','planning'),('scheduling','planning','scheduling'),('prefix','scheduling','prefix'),('ranking','prefix','ranking'),('bulk','ranking','combined'),('combined','baseline','combined')]
node=read(base/'node/report.json');sem=read(base/'semantics/report.json');assert node['outcome']==sem['outcome']=='Collected'
rows=[read(base/'node'/r['output']) for r in node['runs']];semanticRows=[read(base/'semantics'/r['output']) for r in sem['runs']]
report={'kind':'rx8009-accepted-observations-v1','node':{'cases':len(rows),'queryRelations':dict(Counter(x['relation'] for x in node['parity'])),'operationOutcomes':dict(Counter(item['outcome'] for row in rows for item in row['samples']+row['observations'])),'metrics':[],'capacity':[]},'semantics':{'cases':len(semanticRows),'pairedComparisons':len(sem['comparisons']),'captures':dict(Counter(query['capture']['outcome'] for row in semanticRows for query in row['queries'])),'completeCaptures':sum(query['capture']['complete'] for row in semanticRows for query in row['queries']),'pages':sum(len(query['capture']['pages']) for row in semanticRows for query in row['queries']),'selectedOutcomes':dict(Counter(query['outcome'] for row in semanticRows for query in row['selected'])),'arithmeticAssertions':sum(query.get('arithmetic',{}).get('arithmeticAssertions',0) for row in semanticRows for query in row['selected']),'fixtures':sum(len(row.get('fixtures',[])) for row in semanticRows),'laterWrites':sum(len(f['writes']) for row in semanticRows for f in row.get('fixtures',[]))},'browser':{'pairs':[],'metrics':[]},'limits':['Adjacent archived pairs estimate conditional increments; they are not standalone or additive effects.','Node tails use120 correlated calls across3fresh owners at adversarial100 only. p95 not estimated in small cells. Chrome has its own120sample cells; no CPU/heap measurement.','Data-only complete semantic lane injects a queued zero-clock host while retaining native data/work caps; it is not elapsed deadline, host or timing evidence.','Exact known refusals and Not-run availability remain visible; capacity changes never receive equal-work speedup ratios.','Normal timings and intrusive work/yield diagnostics remain separate. Desktop/OS noise is uncontrolled; no population, pvalue, physical-input/paint, release or publication claim.']}
assert len(rows)==96 and len(semanticRows)==30
inputGroups={}
for row in rows:
 data=row['samples']+row['observations'];exported=next(x for x in data if x['operation']=='exportSource');restore=next(x for x in data if x['operation']=='restoreSource')
 if exported['outcome']=='Pass':
  p=base/'node'/exported['snapshotArtifact'];assert sha(p.read_bytes())==exported['result']['encodedSha256'];inputGroups.setdefault((row['family'],row['size']),set()).add(exported['result']['encodedSha256'])
 for item in [exported,restore]:report['node']['capacity'].append({'variant':row['variant'],'family':row['family'],'size':row['size'],'mode':row['mode'],'owner':row['owner'],'operation':item['operation'],'outcome':item['outcome'],'error':item.get('error'),'oldStatePreserved':item.get('oldStatePreserved'),'completeSource':item.get('completeSource')})
assert all(len(values)==1 for values in inputGroups.values());report['node']['sourceInputParity']={family+':'+str(size):next(iter(values)) for (family,size),values in inputGroups.items()}
def slim(x):return {k:v for k,v in x.items() if k!='samples'}
for intervention,before,after in pairs:
 families=['real-docs','high-cardinality','adversarial'] if intervention=='combined' else ['adversarial']
 for family in families:
  for size in [100,1000,10000]:
   left=[x for x in node['summaries'] if x['variant']==before and x['family']==family and x['size']==size];right=[x for x in node['summaries'] if x['variant']==after and x['family']==family and x['size']==size]
   keys={(x['operation'],x['phase']) for x in left+right}
   semantic=next(x for x in sem['comparisons'] if x['intervention']==intervention and x['family']==family and x['size']==size)
   for operation,phase in sorted(keys,key=str):
    a=[x for x in left if (x['operation'],x['phase'])==(operation,phase)];b=[x for x in right if (x['operation'],x['phase'])==(operation,phase)];assert a and b
    sameSuccess=len(a)==len(b)==1 and a[0]['outcome']==b[0]['outcome']=='Pass';ratio=b[0]['p50WallMs']/a[0]['p50WallMs'] if sameSuccess and a[0]['p50WallMs']>0 and b[0]['p50WallMs']>0 else None
    query=operation.removeprefix('query:');semanticQuery=next((x for x in semantic['queries'] if x['id']==query),None)
    diag=[]
    for variant in [before,after]:
     row=next(x for x in rows if x['variant']==variant and x['family']==family and x['size']==size and x['mode']=='diagnostic');item=next(x for x in row['observations'] if x['operation']==operation);diag.append({'variant':variant,'outcome':item['outcome'],'counters':item.get('counters')})
    report['node']['metrics'].append({'intervention':intervention,'family':family,'size':size,'operation':operation,'phase':phase,'before':[slim(x) for x in a],'after':[slim(x) for x in b],'p50AfterOverBefore':ratio,'interpretation':'Scoped exact-request latency; descriptive sample/owner counts apply.' if sameSuccess else 'Finding: refusal/unavailable/capacity outcomes; no equal-work success speedup.','completeQueryComparison':semanticQuery,'diagnostics':diag})
for intervention,before,after in pairs:
 p=base/('browser-'+intervention);r=read(p/'report.json');assert r['outcome']=='Collected' and r['coverage']['allCompleteQueryCaptures'];cases=[read(p/run['output']) for run in r['runs']];assert len(cases)==16
 report['browser']['pairs'].append({'intervention':intervention,'cases':len(cases),'queryOutcomes':dict(Counter(item['outcome'] for row in cases for item in row['case']['samples']+row['case']['observations'])),'transitions':r['coverage']['transitions'],'environment':r['environment']})
 for a in r['summaries']:
  if a['variant']!='baseline':continue
  b=next(x for x in r['summaries'] if x['variant']=='candidate' and x['execution']==a['execution'] and x['query']==a['query']);assert a['attempts']==b['attempts']==120
  diag=[]
  for variant in ['baseline','candidate']:
   row=next(x for x in cases if x['variant']==variant and x['execution']==a['execution'] and x['mode']=='diagnostic');item=next(x for x in row['case']['observations'] if x['query']==a['query']);diag.append({'variant':variant,'outcome':item['outcome'],'counters':item['counters']})
  report['browser']['metrics'].append({'intervention':intervention,'execution':a['execution'],'size':r['method']['size'],'query':a['query'],'before':a,'after':b,'p50AfterOverBefore':b['p50WallMs']/a['p50WallMs'] if a['successes']==b['successes']==120 and a['p50WallMs']>0 and b['p50WallMs']>0 else None,'timerFloor':a['p50WallMs']==0 or b['p50WallMs']==0,'diagnostics':diag})
(base/'summary.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report['semantics'].items()},indent=2))
for intervention,query in [('planning','rare'),('scheduling','common'),('prefix','narrow-prefix'),('ranking','common'),('combined','rare')]:
 r=next(x for x in report['node']['metrics'] if x['intervention']==intervention and x['family']=='adversarial' and x['size']==10000 and x['operation']=='query:'+query and x['phase']=='first-call-for-query');a=r['before'][0];b=r['after'][0];print(intervention,query,'wall',a['p50WallMs'],b['p50WallMs'],'cpu',a['p50CpuUserMs'],b['p50CpuUserMs'],'work',r['diagnostics'][0]['counters']['emittedWorkUnits'],r['diagnostics'][1]['counters']['emittedWorkUnits'])
