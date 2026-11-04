import json, hashlib, math, subprocess, collections
from urllib.parse import urlparse, unquote
from pathlib import Path
root=Path('/tmp/raveldex-rx8010-20261104'); repo=Path('/Users/vasilis/Documents/GitHub/raveldex')
refs=json.loads(subprocess.check_output(['node','--input-type=module','--eval',"import {FAMILIES,SIZES,workloadFor,verifyFrozen} from './bench/n9/workloads.mjs'; import {RELEVANCE_JUDGMENTS} from './test/fixtures/relevance/judgments.mjs'; console.log(JSON.stringify({workloads:FAMILIES.flatMap(f=>SIZES.map(s=>verifyFrozen(workloadFor(f,s)))),judgments:RELEVANCE_JUDGMENTS}));"],cwd=repo))
workloads={(w['family'],w['size']):w for w in refs['workloads']}
node=json.loads((root/'node/report.json').read_text()); rows=[json.loads((root/'node'/r['file']).read_text()) for r in node['runs']]
actualkeys={(r['engine'],r['family'],r['size'],r['owner']) for r in rows}
expectedkeys={(e,f,s,o) for e in node['method']['engines'] for f in node['method']['families'] for s in node['method']['sizes'] for o in range(node['method']['owners'])}
assert actualkeys==expectedkeys and len(rows)==len(actualkeys)==162
querycounts=collections.Counter(); errorcounts=collections.Counter(); normalgroups={}
for r in rows:
 w=workloads[(r['family'],r['size'])];defs={q['id']:q for q in w['queries']}
 assert r['identity']==w['identity']
 for q in r['queries']:
  querycounts[(r['engine'],q['status'])]+=1
  if q.get('error'):errorcounts[q['error']['code']]+=1
  capture=q.get('capture')
  if capture and r['engine']!='raveldex':
   assert capture['total']==len(capture['ids'])==len(set(capture['ids']))
   if q['status']=='Equivalent membership':assert set(capture['ids'])==set(defs[q['id']]['expectedIds'])
  if q.get('completeMembership',{}).get('status')=='Equivalent membership':assert set(q['completeIds'])==set(defs[q['id']]['expectedIds']) and len(q['completeIds'])==len(defs[q['id']]['expectedIds'])
 for sample in r['samples']:
  key=(r['engine'],r['family'],r['size'],sample['operation'],sample['phase'],sample['outcome']);normalgroups.setdefault(key,[]).append(sample)
assert len(normalgroups)==len(node['summaries'])
for s in node['summaries']:
 key=tuple(s[k] for k in ['engine','family','size','operation','phase','outcome']);g=normalgroups[key];assert s['count']==len(g)
 for source,target,p in [('wallMs','wallP50Ms',.5),('cpuUserMs','cpuUserP50Ms',.5),('cpuSystemMs','cpuSystemP50Ms',.5)]:assert s[target]==sorted(x[source] for x in g)[math.ceil(len(g)*p)-1]
 assert s['wallP95Ms']==(sorted(x['wallMs'] for x in g)[math.ceil(len(g)*.95)-1] if len(g)>=100 else None)
pagefiles=0; pagebytes=0; pagetimings=0; hydratations=0; membership=collections.Counter(); pagepairs=set(); pagereports=[]
for run in json.loads((root/'pagefind/runs.json').read_text()):
 p=Path(run['output']);r=json.loads((p/'report.json').read_text()); w=workloads[(run['family'],run['size'])];defs={q['id']:q for q in w['queries']}
 assert r['status']=='Collected' and r['comparability']=='Not comparable' and r['workload']==w['identity'];assert r['errors']==[]
 assert r['package']['name']=='pagefind' and r['package']['version']=='1.6.0'
 assert len(r['queries'])==8 and set(q['id'] for q in r['queries'])==set(defs)
 assert run['generatedFiles']==len(r['files']) and run['buildWallMs']==r['build']['wallMs'] and r['build']['records']==w['size']
 origins={u.split('/')[2] for u in r['requests']};assert len(origins)==1 and next(iter(origins)).startswith('127.0.0.1:')
 pagepairs.add((w['family'],w['size']))
 for f in r['files']:
  data=(p/f['path']).read_bytes();assert len(data)==f['bytes'] and hashlib.sha256(data).hexdigest()==f['sha256'];pagefiles+=1;pagebytes+=len(data)
 for q in r['queries']:
  if q['status']=='Not comparable':assert q['reason'];continue
  assert q['status']=='Collected' and q['comparability']=='Not comparable' and q['p95WallMs'] is None
  assert len(q['wallMs'])==10 and len(q['warmupWallMs'])==2 and all(x>=0 and math.isfinite(x) for x in q['wallMs']+q['warmupWallMs'])
  assert q['p50WallMs']==sorted(q['wallMs'])[4]
  ids=[h['sourceId'] for h in q['hydrated']];assert len(ids)==q['total']==len(set(ids));assert set(ids)<=set(x['id'] for x in w['records'])
  for h in q['hydrated']:assert unquote(urlparse(h['url']).path).endswith('/records/'+h['sourceId']+'/')
  expected=set(defs[q['id']]['expectedIds']);assert q['nativeMembershipEqual']==(set(ids)==expected)
  membership[q['nativeMembershipEqual']]+=1;pagetimings+=len(q['wallMs']);hydratations+=len(ids)
 pagereports.append({'family':w['family'],'size':w['size'],'reportSha256':hashlib.sha256((p/'report.json').read_bytes()).hexdigest(),'browser':r['environment']['browser']})
assert pagepairs==set(workloads) and pagefiles==33636 and pagetimings==360
relevance=json.loads((root/'relevance.json').read_text());judgments={j['id']:j for j in refs['judgments']}
def checkmetrics(metrics, engine_rows):
 selected=[r for r in engine_rows if r['status']=='Equivalent membership' or r['status']=='Separate fuzzy observation']; byid={r['id']:r for r in selected}
 assert metrics['queryCount']==len(selected);assert set(r['id'] for r in metrics['rows'])==set(byid)
 ranked=[];empty=[]
 for m in metrics['rows']:
  j=judgments[m['id']];r=byid[m['id']]['result'];ids=r['ids']; acceptable=set(j['acceptableIds']);rank=next((i+1 for i,id in enumerate(ids) if id in acceptable),None)
  assert m['firstAcceptableRank']==rank;assert m['top1']==(rank==1);assert m['top3']==(rank is not None and rank<=3)
  expectedreciprocal=1/rank if rank else 0; assert m['reciprocalRank']==expectedreciprocal
  n=sum(id in acceptable for id in ids[:10]);assert m['knownRelevantInTop10']==n and m['knownRelevantCount']==len(acceptable)
  assert m['recall10']==(n/len(acceptable) if acceptable else None)
  (empty if j['expectation']=='intended-empty' else ranked).append(m)
 assert metrics['rankingDenominator']==len(ranked) and metrics['intendedEmptyDenominator']==len(empty)
 for key,predicate in [('top1',lambda m:m['top1']),('top3',lambda m:m['top3'])]:
  metric=metrics[key];n=sum(predicate(m) for m in ranked);assert metric=={'numerator':n,'denominator':len(ranked),'value':n/len(ranked) if ranked else None}
 assert metrics['mrr']['reciprocalRankSum']==sum(m['reciprocalRank'] for m in ranked)
 assert metrics['recall10Macro']['recallSum']==sum(m['recall10'] for m in ranked)
 assert metrics['recall10Micro']['numerator']==sum(m['knownRelevantInTop10'] for m in ranked)
 assert metrics['recall10Micro']['denominator']==sum(m['knownRelevantCount'] for m in ranked)
 for key,sumkey in [('mrr','reciprocalRankSum'),('recall10Macro','recallSum')]:
  m=metrics[key];assert m['denominator']==len(ranked) and m['value']==(m[sumkey]/len(ranked) if ranked else None)
 m=metrics['recall10Micro'];assert m['value']==(m['numerator']/m['denominator'] if m['denominator'] else None)
 for key,metric_rows,predicate in [('correctIntendedEmpty',empty,lambda m:m['returnedEmpty']),('unexpectedNonempty',empty,lambda m:not m['returnedEmpty']),('unintendedEmpty',ranked,lambda m:m['returnedEmpty'])]:
  n=sum(predicate(m) for m in metric_rows);assert metrics[key]=={'numerator':n,'denominator':len(metric_rows),'value':n/len(metric_rows) if metric_rows else None}
 return len(selected)
relevancecounts={};native=relevance['engines'][0];nativebyid={r['id']:r for r in native['rows']}
for e in relevance['engines']:
 assert len(e['rows'])==len(judgments)==76 and len(set(r['id'] for r in e['rows']))==76
 included=checkmetrics(e['metrics'],e['rows']);assert included==e['included'] and e['omitted']==76-included
 if e['engine'] not in ('raveldex','fuse'):
  selectedids={r['id'] for r in e['rows'] if r['status']=='Equivalent membership'}
  assert checkmetrics(e['nativeSameSubsetMetrics'],[nativebyid[id] for id in selectedids])==included
 relevancecounts[e['engine']]={'included':included,'omitted':e['omitted'],'top1':e['metrics']['top1']}
baseline=json.loads((repo/'docs/evidence/RX-8010/verification/runtime-baseline.json').read_text())
for pin in baseline['files']:assert hashlib.sha256((repo/pin['path']).read_bytes()).hexdigest()==pin['sha256']
archives=json.loads((repo/'docs/evidence/RX-8010/setup/archives.json').read_text())
for pin in archives:
 data=(repo/'docs/evidence/RX-8010/setup'/pin['file']).read_bytes();assert len(data)==pin['bytes'] and hashlib.sha256(data).hexdigest()==pin['sha256']
binary=json.loads((repo/'docs/evidence/RX-8010/setup/binary-cache-archive.json').read_text());data=(repo/'docs/evidence/RX-8010/setup'/binary['file']).read_bytes();assert len(data)==binary['bytes'] and hashlib.sha256(data).hexdigest()==binary['sha256']
import base64
assert 'sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()==binary['package']['integrity']
output={'status':'Pass','verifiedPlatformArchives':1,'runtimeBaselineFiles':len(baseline['files']),'verifiedArchives':len(archives),'node':{'reportSha256':hashlib.sha256((root/'node/report.json').read_bytes()).hexdigest(),'acceptedChildren':len(rows),'summaryGroups':len(normalgroups),'p95Groups':sum(s['wallP95Ms'] is not None for s in node['summaries']),'queryErrorCodes':dict(errorcounts),'coverage':[{ 'engine':k[0],'status':k[1],'count':v} for k,v in sorted(querycounts.items())]},'pagefind':{'cells':len(pagepairs),'generatedFilesVerified':pagefiles,'generatedBytesVerified':pagebytes,'ordinarySamples':pagetimings,'hydratedResults':hydratations,'coincidentalMembershipEqualQueries':membership[True],'differentMembershipQueries':membership[False],'reports':pagereports},'relevance':relevancecounts}
(root/'independent-review.json').write_text(json.dumps(output,indent=2)+'\n'); print(json.dumps(output,indent=2))
