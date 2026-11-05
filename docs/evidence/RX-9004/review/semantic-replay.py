#!/usr/bin/env python3
"""Independent Python original-source/BM25/core/Inspector replay of actual outputs.
No engine, production analyzer/scorer, JS oracle or collector execution.
"""
from pathlib import Path
import json,math,unicodedata,collections,re,hashlib,sys,datetime
ROOT=Path(__file__).resolve().parents[4];OUT=Path(__file__).resolve().parent
sem=Path(sys.argv[1]).resolve();timed=Path(sys.argv[2]).resolve()
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def units(s):return len(s.encode('utf-16-le','surrogatepass'))//2
def tokens(s):
 raw=[];word=''
 for c in s:
  cat=unicodedata.category(c)[0]
  if cat in 'LN' or word and cat=='M':word+=c
  elif word:raw.append(unicodedata.normalize('NFKC',word).lower());word=''
 if word:raw.append(unicodedata.normalize('NFKC',word).lower())
 return raw
source=read(ROOT/'test/fixtures/relevance/corpus.json')['records']
def excerpt(item):
 s=item['text']['title']+'\n'+item['text']['body']
 if units(s)<=512:return s
 head=s.encode('utf-16-le','surrogatepass')[:1024].decode('utf-16-le','surrogatepass');m=re.search(r'\s+\S*$',head);assert m and m.start()>0;return head[:m.start()]
def corpus(family,n):
 docs={};df=collections.Counter();total=0;valuecount=0;codeunits=0
 for i in range(n):
  original=excerpt(source[i%len(source)]);body=original
  if family!='real-docs':
   key=f'n9key{i:06d}';controls=f'n9common {"n9rare"if i%997==7 else ""} {"n9left"if i%3==0 else ""} {key}a {key}b {key}c';phrase='n9red n9blue'if i%3==0 else'n9red n9gap n9blue'
   body=original+'\nCatalog '+controls+' '+phrase if family=='high-cardinality'else [controls+' n9echo n9echo n9echo n9echo','n9red','n9blue']if i%3==2 else controls+' n9echo n9echo n9echo n9echo '+phrase
  values=body if isinstance(body,list)else[body];byvalue=[tokens(x)for x in values];terms=collections.Counter(t for value in byvalue for t in value);length=sum(terms.values());assert length>0
  id=f'{family}:{i:05d}';docs[id]={'values':values,'tokens':byvalue,'terms':terms,'length':length,'group':f'g{i%5}','units':sum(units(x)for x in values)};df.update(terms.keys());total+=length;valuecount+=len(values);codeunits+=docs[id]['units']
 return {'family':family,'n':n,'docs':docs,'df':df,'total':total,'values':valuecount,'units':codeunits}
def bm(c,d,term):
 tf=d['terms'].get(term,0)
 if not tf:return 0
 df=c['df'][term];N=c['n'];avg=c['total']/N;idf=math.log(1+(N-df+.5)/(df+.5));normalizer=1.2*(.25+.75*d['length']/avg)
 return idf*((tf*2.2)/(tf+normalizer))
def expected(c,q):
 real=c['family']=='real-docs';common,rare,left=('the','unqualified','source')if real else('n9common','n9rare','n9left')
 # Real overlap uses revision OR source, whereas rare uses unqualified.
 overlap=['revision','source']if real else[rare,left]
 prefix=('snap' if real else 'n9key00000') if q=='narrow-prefix' else ('re' if real else 'n9key')
 if q in['narrow-prefix','broad-prefix','broad-prefix-refusal']and sum(t.startswith(prefix)for t in c['df'])>256:return None
 hits=[]
 for id,d in c['docs'].items():
  terms=d['terms'];score=0;match=False
  if q=='common':match=common in terms;score=bm(c,d,common)
  elif q=='rare':match=rare in terms;score=bm(c,d,rare)
  elif q=='overlapping-or':match=any(t in terms for t in overlap);score=sum(bm(c,d,t)for t in sorted(overlap)if t in terms)
  elif q=='negative-only':match=('snapshot'if real else rare)not in terms
  elif q=='filtered':match=common in terms and d['group']=='g0';score=bm(c,d,common)
  elif q in['narrow-prefix','broad-prefix','broad-prefix-refusal']:
   matches=[t for t in terms if t.startswith(prefix)];match=bool(matches);score=max([bm(c,d,t)for t in matches],default=0)
  elif q=='source-phrase':
   phrase=['source','mapping']if real else['n9red','n9blue'];match=any(any(ts[j:j+len(phrase)]==phrase for j in range(len(ts)))for ts in d['tokens']);score=sum(bm(c,d,t)for t in sorted(phrase))
  else:raise AssertionError(q)
  if match:hits.append({'id':id,'score':score})
 return sorted(hits,key=lambda h:(-h['score'],h['id']))
def close(x,y):assert math.isfinite(x)and math.isfinite(y)and abs(x-y)<=max(1e-12,abs(y)*1e-12),(x,y)
counts=collections.Counter();cache={};rowpins=[]
sreport=read(sem/'report.json');assert sreport['outcome']=='Pass'and sreport['guards']=='Pass'and len(sreport['runs'])==27
for run in sreport['runs']:
 row=read(sem/run['output']);key=(row['family'],row['size']);c=cache.setdefault(key,corpus(*key))if key not in cache else cache[key];ex={q['id']:expected(c,q['id'])for q in row['queries']}
 assert len(row['queries'])==8 and row['host']['pending']==0
 corepath=sem/row['core']['canonicalFile'];core=read(corepath);assert sha(corepath)==row['core']['sha256'];rowpins.append({'path':str(sem/run['output']),'sha256':sha(sem/run['output']),'coreSha256':sha(corepath)})
 assert core['revision']==math.ceil(c['n']/256)and set(core['documents'])==set(c['docs'])
 field=core['fields']['body'];assert field['documents']==c['n']and field['length']==c['total']and set(field['terms'])==set(c['df']);assert core['participants']['source']['revision']==core['revision']
 postingrelations=0
 for id,d in c['docs'].items():
  doc=core['documents'][id];assert doc['fields']['body']['length']==d['length']and doc['fields']['body']['terms']==d['terms'];assert doc['metadata']=={'group':d['group']}and doc['textCodeUnits']==d['units']
  src=core['participants']['source']['records'][id];assert src['text']=={'body':d['values']}and src['textCodeUnits']==d['units']
  for term,tf in d['terms'].items():assert field['terms'][term]['postings'][id]==tf;postingrelations+=1
 for term,df in c['df'].items():
  termrow=field['terms'][term];assert termrow['df']==df and len(termrow['postings'])==df and termrow['frequency']==sum(termrow['postings'].values())
 assert core['counts']=={'documents':c['n'],'tokens':c['total'],'dictionaryEntries':len(c['df']),'postingEntries':postingrelations,'textCodeUnits':c['units']}
 counts['coreDocuments']+=c['n'];counts['coreTerms']+=len(c['df']);counts['corePostingRelations']+=postingrelations;counts['sourceValues']+=c['values']
 for q in row['queries']:
  ref=ex[q['id']];cap=q['capture'];assert ref is None or cap['total']==len(ref)
  if ref is None:assert cap['outcome']=='Refused'and cap['error']['code']=='LIMIT_EXCEEDED';counts['expectedExpansionRefusals']+=1;continue
  for i,page in enumerate(cap['pages']):
   expect=ref[i*100:i*100+len(page['hits'])];assert page['total']==len(ref)and page['completeness']=='complete';assert [h['id']for h in page['hits']]==[h['id']for h in expect],(key,q['id'],'pageOrder')
   for actual,want in zip(page['hits'],expect):close(actual['score'],want['score']);counts['fullPageScores']+=1
   counts['pages']+=1
  if cap['complete']:assert [h['id']for h in cap['hits']]==[h['id']for h in ref];counts['completeQueries']+=1
  else:assert cap['error']['code']in['WORK_LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'];counts['resourceRefusedPageCaptures']+=1
 for q in row['selected']:
  if q['outcome']!='Pass':counts['selectedRefusals']+=1;continue
  result=q['result'];ref=ex[q['id']];assert ref is not None;assert [h['id']for h in result['hits']]==[h['id']for h in ref[:20]]and result['total']==len(ref)
  for actual,want in zip(result['hits'],ref[:20]):close(actual['score'],want['score']);counts['selectedScores']+=1
  facts=result['extensions']['inspector']['trace']['facts'];ff=[f for f in facts if f['kind']=='field']
  for f in ff:
   d=c['docs'][f['id']];assert f['field']=='body'and f['N']==c['n']and f['totalLength']==c['total']and f['length']==d['length']and f['tf']==d['terms'][f['term']]and f['df']==c['df'][f['term']]and f['boost']==1 and f['weight']==1 and f['k1']==1.2 and f['b']==.75
   avg=c['total']/c['n'];idf=math.log(1+(c['n']-f['df']+.5)/(f['df']+.5));normalizer=1.2*(.25+.75*d['length']/avg);tfpart=d['terms'][f['term']]*2.2/(d['terms'][f['term']]+normalizer)
   for k,v in [('avgLength',avg),('idf',idf),('normalizer',normalizer),('tfPart',tfpart),('base',idf*tfpart),('selected',idf*tfpart)]:close(f[k],v)
   counts['sourceFieldFacts']+=1;counts['fieldArithmeticAssertions']+=6
  for f in facts:
   if f['kind']=='group':close(f['score'],sum(g['selected']for g in ff if g['id']==f['id']and g['group']==f['group']));counts['groupArithmeticAssertions']+=1
   if f['kind']=='document':close(f['score'],sum(g['score']for g in facts if g['kind']=='group'and g['id']==f['id']));counts['documentArithmeticAssertions']+=1
 counts['semanticChildren']+=1
# Every actual ordinary/diagnostic successful timed prefix gets the same fresh
# Python source-derived reference; expected/resource errors never become scores.
treport=read(timed/'report.json');assert treport['outcome']=='Collected'
for run in treport['runs']:
 row=read(timed/run['output']);c=cache[(row['family'],row['size'])];refs={}
 for sample in row['samples']if row['mode']=='normal'else row['observations']:
  if not sample['operation'].startswith('query:'):continue
  q=sample['operation'].split(':',1)[1]
  if q not in refs:refs[q]=expected(c,q)
  cap=row['resultCaptures'][sample['resultSha256']];counts['timedCaptureLinks']+=1
  if 'error'in cap:counts['timedRefusals']+=1;continue
  ref=refs[q];assert ref is not None;result=cap['result'];assert result['total']==len(ref)and [h['id']for h in result['hits']]==[h['id']for h in ref[:20]],(row['family'],row['size'],q,'timedOrder')
  for actual,want in zip(result['hits'],ref[:20]):close(actual['score'],want['score']);counts['timedScores']+=1
assert counts['semanticChildren']==27 and counts['timedCaptureLinks']==13968
result={'kind':'rx9004-independent-python-semantic-replay-v1','status':'Pass','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'semanticDirectory':str(sem),'timedDirectory':str(timed),'semanticReportSha256':sha(sem/'report.json'),'timedReportSha256':sha(timed/'report.json'),'counts':dict(counts),'semanticRowPins':rowpins,'method':'Python reproduces all9 frozen family/size original-source fixtures from retained source corpus, independent Unicode-category token scan and NFKC/lower, literal query participation/value-local phrase adjacency, original TF/DF/length and BM25; no JS oracle/production scorer/tokenizer/engine call. Raw pages/order/core/source/facts and all timed top20 captures replayed.','limitations':['Same-body lexical source tracks only; separate retained fixture position-offset/facet observations are not rederived element-by-element by this Python replay','Numerical tolerance max(1e-12,abs(expected)*1e-12); full returned ID order is exact','No semantic timing, actual deadline, universal fairness, browser/AT, memory or new engine execution claim']}
(OUT/'semantic-replay.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='semanticRowPins'},indent=2))
