from pathlib import Path
import json,collections,hashlib
root=Path('/Users/vasilis/Documents/GitHub/raveldex/docs/evidence/RX-8010');temp=Path('/tmp/raveldex-rx8010-20261104')
r=json.loads((temp/'node/report.json').read_text());rel=json.loads((temp/'relevance.json').read_text());audit=json.loads((temp/'node-audit.json').read_text())
summary={'kind':'rx8010-derived-summary-v1','node':{'completeRuns':len(r['runs']),'failedAttempts':len(r['failedAttempts']),'audit':audit,'coverageByEngine':{},'adversarial100CommonTiming':[],'timingWarning':'Native exact-total/top20 vs foreign complete-ranked retrieval/normalization; Fuse fuzzy separately. Descriptive120call p50/p95 only, no equal-output speedup ratio.'},'relevance':[],'pagefind':{'track':'Not comparable static-site/WASM','cells':[]}}
for engine in r['method']['engines']:
 summary['node']['coverageByEngine'][engine]=dict(collections.Counter(x['status']for x in r['coverage']if x['engine']==engine))
 summary['node']['adversarial100CommonTiming'] += [x for x in r['summaries']if x['engine']==engine and x['family']=='adversarial'and x['size']==100 and x['operation']=='query:common']
summary['node']['refusals']=[]
for run in r['runs']:
 row=json.loads((temp/'node'/run['file']).read_text())
 for q in row['queries']:
  if q.get('error'):summary['node']['refusals'].append({'engine':row['engine'],'family':row['family'],'size':row['size'],'owner':row['owner'],'id':q['id'],'error':q['error']})
for e in rel['engines']:
 summary['relevance'].append({'engine':e['engine'],'totalJudgments':e['judgmentsTotal'],'included':e['included'],'omitted':e['omitted'],'metrics':e['metrics'],'nativeSameSubsetMetrics':e.get('nativeSameSubsetMetrics')})
for run in json.loads((temp/'pagefind/runs.json').read_text()):
 p=temp/'pagefind'/f"{run['family']}-{run['size']}"/'report.json';cell=json.loads(p.read_text());qs=[q for q in cell['queries']if q['status']=='Collected']
 assert cell['status']=='Collected'and not cell['errors']and len(qs)==4
 summary['pagefind']['cells'].append({**run,'samples':sum(len(q['wallMs'])for q in qs),'warmups':sum(len(q['warmupWallMs'])for q in qs),'hydratedIDs':sum(q['total']for q in qs),'membershipCoincidences':sum(q['nativeMembershipEqual']for q in qs),'queries':[{k:q[k]for k in ['id','total','p50WallMs','p95WallMs','nativeMembershipEqual']}for q in qs]})
summary['pagefind']['totals']={key:sum(row[key]for row in summary['pagefind']['cells'])for key in ['samples','warmups','hydratedIDs','membershipCoincidences','generatedFiles']}
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'node':audit,'pagefindTotals':summary['pagefind']['totals'],'relevance':[{k:e[k]for k in ['engine','included','omitted']}for e in summary['relevance']]},indent=2))
