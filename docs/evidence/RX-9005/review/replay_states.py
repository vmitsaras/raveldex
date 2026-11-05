"""Independent retained-state/source/position/query replay. No engine or JS imports.
Usage: python3 replay_states.py RAW_DIRECTORY OUTPUT_JSON [--probe]
Only run after timing has stopped. A probe is explicitly never accepted full evidence.
"""
import pathlib,json,sys,hashlib,math,re,collections,decimal
RAW=pathlib.Path(sys.argv[1]).resolve(); OUT=pathlib.Path(sys.argv[2]).resolve()
PROBE='--probe' in sys.argv[3:]
def sha(data):return hashlib.sha256(data).hexdigest()
def jsnumber(n):
 if isinstance(n,int):return str(n)
 assert math.isfinite(n)
 if n==0:return '0'
 s=repr(n).lower()
 if 1e-6<=abs(n)<1e21:
  s=format(decimal.Decimal(s),'f')
  return s.rstrip('0').rstrip('.') if '.' in s else s
 if 'e' in s:
  a,b=s.split('e');a=a[:-2] if a.endswith('.0') else a;e=int(b)
  return a+'e'+('+' if e>=0 else '-')+str(abs(e))
 return s[:-2] if s.endswith('.0') else s
def canonical(v):
 if v is None:return 'null'
 if v is True:return 'true'
 if v is False:return 'false'
 if isinstance(v,(int,float)):return jsnumber(v)
 if isinstance(v,str):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
 if isinstance(v,list):return '['+','.join(map(canonical,v))+']'
 return '{'+','.join(canonical(k)+':'+canonical(v[k]) for k in sorted(v))+'}'
def h(v):return sha(canonical(v).encode())
def original(n):
 result={}
 for i in range(n):
  key=f'n9key{i:06d}';controls=f"n9common {'n9rare' if i%997==7 else ''} {'n9left' if i%3==0 else ''} {key}a {key}b {key}c"
  phrase='n9red n9blue' if i%3==0 else 'n9red n9gap n9blue'
  body=[controls+' n9echo n9echo n9echo n9echo','n9red','n9blue'] if i%3==2 else controls+' n9echo n9echo n9echo n9echo '+phrase
  r={'id':f'adversarial:{i:05d}','text':{'body':body},'metadata':{'group':f'g{i%5}'}};result[r['id']]=r
 return result
REFS={}
def ref(record):
 key=canonical(record)
 if key in REFS:return REFS[key]
 values=record['text']['body'];values=[values] if isinstance(values,str) else values
 frequencies=collections.Counter();position_values=[];entries=2;occ=0;term_entries=0;term_units=0
 for value in values:
  terms={};found=list(re.finditer(r'[A-Za-z0-9]+',value));entries+=1
  for position,match in enumerate(found):
   term=match.group().lower();frequencies[term]+=1
   if term not in terms:terms[term]=[];entries+=1;term_entries+=1;term_units+=len(term)
   terms[term].append({'position':position,'positionLength':1,'start':len(value[:match.start()].encode('utf-16-le'))//2,'end':len(value[:match.end()].encode('utf-16-le'))//2});entries+=3;occ+=1
  position_values.append({'tokenCount':len(found),'terms':terms})
 units=sum(len(v.encode('utf-16-le'))//2 for v in values);tokens=sum(frequencies.values())
 core={'id':record['id'],'textCodeUnits':units,'metadata':record.get('metadata',{}),'fields':{'body':{'length':tokens,'terms':dict(sorted(frequencies.items()))}} if tokens else {}}
 source={'text':{'body':values},'retainedEntries':2+len(values),'textCodeUnits':units}
 positions={'positions':{'body':position_values},'retainedEntries':entries,'occurrenceCount':occ,'offsetCount':occ,'termEntries':term_entries,'termCodeUnits':term_units}
 r={'record':record,'core':core,'source':source,'positions':positions,'freq':frequencies,'tokens':tokens,'units':units,'corehash':h(core),'sourcehash':h(record)};REFS[key]=r;return r
def close(a,b):assert math.isfinite(a) and abs(a-b)<=max(1e-12,abs(b)*1e-12),(a,b)
report=json.loads((RAW/'report.json').read_text());assert report['outcome']=='Collected' and report['guards']=='Pass'
assert PROBE or (report['profile']=='full' and len(report['runs'])==144)
stats=collections.Counter();pins=[]
for run in report['runs']:
 rowfile=RAW/run['output'];row=json.loads(rowfile.read_text());n=row['size'];side=row['configuration']=='source-positions';base=original(n)
 assert set(row['states'])=={c['state'] for c in row['checkpoints']} and row['uniqueStateFiles']==len(row['states'])
 # State-to-source mappings retain only the changed trailing IDs. Exact trace
 # membership/fingerprints are checked independently by reconstruct.py.
 expected_states={row['checkpoints'][0]['state']:{}}
 for item in row['samples']+row['observations']+row['warmups']:
  trace=row['traces'][item['traceSha256']];b=item['batch'];tail=list(base)[-b:];patch={i:None for i in tail}
  first=trace['calls'][0];case=item['id']
  if case in ['replace-existing-vocabulary','replace-existing-records','replace-new-vocabulary','remove','remove-existing-records','remove-unique-vocabulary']:
   for j,i in enumerate(tail):
    if case=='replace-existing-vocabulary':body='n9common n9red n9blue' if item['repetition']%2==0 else 'n9blue n9common n9red';group='g0'
    elif case=='remove-unique-vocabulary':body='n10novel n10replacement n9common';group='g1'
    else:body='n9common n9red n9blue';group='g0'
    patch[i]={'id':i,'text':{'body':body},'metadata':{'group':group}}
  expected_states[item['beforeState']]=dict(patch)
  for call,prefix in zip(trace['calls'],item['prefixStates']):
   if call['method']=='remove':patch[call['input']]=None
   else:
    for record in call['input'] if call['method']=='addMany' else [call['input']]:patch[record['id']]=record
   expected_states[prefix['state']]=dict(patch)
  expected_states[item['afterState']]=dict(patch)
 expected={i:ref(r) for i,r in base.items()};terms={};counts={'documents':n,'textCodeUnits':0,'tokens':0,'dictionaryEntries':0,'postingEntries':0};sums=collections.Counter()
 def adjust(i,r,sign):
  counts['textCodeUnits']+=sign*r['units'];counts['tokens']+=sign*r['tokens'];counts['postingEntries']+=sign*len(r['freq'])
  for t,tf in r['freq'].items():
   e=terms.setdefault(t,{'df':0,'frequency':0,'postings':{}});e['df']+=sign;e['frequency']+=sign*tf
   if sign>0:e['postings'][i]=tf
   else:del e['postings'][i]
   if not e['df']:del terms[t]
  sums['sourceRetainedEntries']+=sign*r['source']['retainedEntries']
  sums['sourceValues']+=sign*len(r['source']['text']['body'])
  for k in ['retainedEntries','occurrenceCount','offsetCount','termEntries','termCodeUnits']:sums['positionRetainedEntries' if k=='retainedEntries' else k]+=sign*r['positions'][k]
 for i,r in expected.items():adjust(i,r,1)
 counts['dictionaryEntries']=len(terms)
 actual_docs={};actual_terms={};actual_source={};actual_positions={};previous=None;old_patch={};fresh_queries={};semantic_cache={};source_cache={}
 for cp in row['checkpoints']:
  query_pages_before=stats['freshQueryPages'];query_scores_before=stats['sourceDerivedScores']
  sid=cp['state'];entry=row['states'][sid];raw=(RAW/entry['file']).read_bytes();assert len(raw)==entry['bytes'] and sha(raw)==entry['sha256'];cap=json.loads(raw)
  assert cap['kind']=='rx9005-complete-state-delta-v2' and h(cap)==sid==entry['normalizedSha256']
  assert cap['previous']==previous and cap['checkpoint']==(previous is None);patch=expected_states[sid];changed=set();affected=set()
  for i in set(old_patch)|set(patch):
   wanted=patch.get(i,base.get(i));old=expected.get(i)
   if (None if old is None else old['record'])==wanted:continue
   changed.add(i)
   if old is not None:affected.update(old['freq']);adjust(i,old,-1);del expected[i]
   if wanted is not None:fresh=ref(wanted);expected[i]=fresh;affected.update(fresh['freq']);adjust(i,fresh,1)
  counts['documents']=len(expected);counts['dictionaryEntries']=len(terms)
  if cap['checkpoint']:
   snapshot=cap['snapshot'];actual_docs=snapshot['documents'];actual_terms=snapshot['terms'];actual_source=snapshot.get('sources',{});actual_positions=snapshot.get('positions',{});check_ids=set(expected);check_terms=set(terms)
  else:
   delta=cap['delta'];check_ids=set(delta['records'])|changed;check_terms=set(delta['terms'])|affected
   for i,value in delta['records'].items():
    if value is None:actual_docs.pop(i,None);actual_source.pop(i,None);actual_positions.pop(i,None)
    else:
     actual_docs[i]=value['core']
     if side:actual_source[i]=value['source'];actual_positions[i]=value['positions']
   for t,value in delta['terms'].items():
    if value is None:actual_terms.pop(t,None)
    else:
     e=actual_terms.setdefault(t,{'df':0,'frequency':0,'postings':{}});e['df']=value['df'];e['frequency']=value['frequency']
     for i,tf in value['postings'].items():
      if tf is None:e['postings'].pop(i,None)
      else:e['postings'][i]=tf
  assert cap['counts']==counts and len(actual_docs)==len(expected) and len(actual_terms)==len(terms)
  assert cap['field']=={'documents':len(expected),'length':counts['tokens']}
  for i in check_ids:
   r=expected.get(i);assert actual_docs.get(i)==(r['core'] if r else None)
   if side:assert actual_source.get(i)==(r['source'] if r else None) and actual_positions.get(i)==(r['positions'] if r else None)
  for t in check_terms:assert actual_terms.get(t)==terms.get(t),('term',t)
  if side:
   assert len(actual_source)==len(expected)==len(actual_positions)
   a=cap['sourceHeader'];b=cap['positionHeader'];assert a['retainedEntries']==sums['sourceRetainedEntries'] and a['textCodeUnits']==counts['textCodeUnits']
   for k in ['retainedEntries','occurrenceCount','offsetCount','termEntries','termCodeUnits']:assert b[k]==sums['positionRetainedEntries' if k=='retainedEntries' else k]
  else:assert cap['sourceHeader'] is None and cap['positionHeader'] is None
  semantic_key=tuple((i,ref(r)['corehash'] if r else None) for i,r in sorted(patch.items()));source_key=tuple((i,ref(r)['sourcehash'] if r else None) for i,r in sorted(patch.items()))
  if cap['coreSemanticSha256'] is not None:
   if semantic_key not in semantic_cache:semantic_cache[semantic_key]=h({'recipe':'rx9005-bounded-query-recipe-v2','configuration':cap['configuration'],'documents':[[i,r['corehash']] for i,r in sorted(expected.items())],'counts':counts})
   assert cap['coreSemanticSha256']==cp['coreSemanticSha256']==semantic_cache[semantic_key]
   if source_key not in source_cache:source_cache[source_key]=h([[i,r['sourcehash']] for i,r in sorted(expected.items())])
   assert cp['expectedSourceSha256']==source_cache[source_key]
  else:assert cp['coreSemanticSha256'] is None and cp['expectedSourceSha256'] is None
  def check_query(q):
   qid=q['id'];selected=qid!='targeted-or' and n==10000;wanted_terms=['n10novel','n10replacement','n10batchnovel','n9rare'] if qid=='targeted-or' else [] if qid=='all' else [qid]
   assert qid in ['targeted-or','all','n9common']
   wanted_query={'kind':'or','children':[{'kind':'text','text':t} for t in wanted_terms]} if qid=='targeted-or' else {'kind':'all'} if qid=='all' else {'kind':'text','text':qid};assert q['query']==wanted_query
   ids=set(expected) if qid=='all' else set().union(*(set(terms.get(t,{}).get('postings',{})) for t in wanted_terms));hits=[]
   for i in ids:
    r=expected[i];score=0
    for t in wanted_terms:
     tf=r['freq'].get(t,0)
     if tf:df=terms[t]['df'];idf=math.log(1+(len(expected)-df+.5)/(df+.5));score+=idf*(tf*2.2)/(tf+1.2*(.25+.75*r['tokens']/(counts['tokens']/len(expected))))
    hits.append((i,score))
   hits.sort(key=lambda x:(-x[1],x[0]));pages=max(1,math.ceil(len(hits)/100));indices=sorted(set([0,(pages-1)//2,pages-1])) if selected else list(range(pages));requests=[{'offset':j*100,'limit':min(100,max(1,len(hits)-j*100))} for j in indices]
   assert q['total']==len(hits) and q['coverage']['selectedPageIndices']==indices and q['coverage']['fullyEnumerated']==(not selected)
   assert q['coverage']['mode']==('selected-first-lower-middle-last-pages' if selected else 'fully-paginated') and q['coverage']['pageSize']==100
   assert q['coverage']['expectedPages']==pages and q['coverage']['recipe']=='rx9005-bounded-query-recipe-v2'
   refused=q['outcome']=='Refused';assert q['outcome'] in ['Pass','Refused']
   assert q['verificationComplete']==(not refused) and q['fullyEnumerated']==(not selected and not refused) and q['complete']==(not selected and not refused)
   assert q['pageRequests']==requests[:len(q['pages'])+(1 if refused else 0)]
   if not refused:assert len(q['pages'])==len(requests)
   else:assert q['error']['code'] in ['WORK_LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'] and q['failedOffset']==q['pageRequests'][-1]['offset']
   score_count=0;flat=[]
   for page,request in zip(q['pages'],requests):
    assert page['revision']==0 and page['model']=='raveldex-bm25-v1' and page['completeness']=='complete' and page['total']==len(hits)
    wanted=hits[request['offset']:request['offset']+request['limit']];assert [x['id'] for x in page['hits']]==[x[0] for x in wanted]
    for actual,(_,score) in zip(page['hits'],wanted):close(actual['score'],score);score_count+=1
    flat+=page['hits']
   assert q['hits']==flat and q['scoreAssertions']==score_count
   stats['freshQueryPages']+=len(q['pages']);stats['sourceDerivedScores']+=score_count;stats['freshQueries']+=1;stats['selectedPageQueries' if selected else 'fullyPaginatedQueries']+=1;stats['queryRefusals']+=refused
  assert len(cap['queries']['targeted'])==1 and cap['queries']['targeted'][0]['id']=='targeted-or';check_query(cap['queries']['targeted'][0])
  assert len(cap['queries']['full'])==(2 if cap['coreSemanticSha256'] else 0)
  for wrapper in cap['queries']['full']:
   assert wrapper['originalCoreSemanticSha256']==cap['coreSemanticSha256']
   key=(wrapper['originalCaptureSha256'],wrapper['originalCoreSemanticSha256'],wrapper['originalRevision'],wrapper['id'])
   if wrapper['kind']=='fresh':
    assert wrapper['originalRevision']==cp['revision'];q=wrapper['capture'];assert h(q)==wrapper['originalCaptureSha256'];check_query(q);fresh_queries[key]=q
   else:
    assert wrapper['kind']=='reused-verified-core-query' and wrapper['captureReferenceSha256']==wrapper['originalCaptureSha256'] and key in fresh_queries;stats['reusedCorrectnessQueries']+=1
  assert cp['queryProvenance']['full']==[{k:v for k,v in w.items() if k not in ['capture','captureReferenceSha256']} for w in cap['queries']['full']]
  cs=cp['stats'];assert cs['documents']==len(expected) and cs['dictionaryTerms']==len(terms) and cs['postingRelations']==counts['postingEntries']
  assert cs['sourceValues']==(sums['sourceValues'] if side else 0) and cs['positionOccurrences']==(sums['occurrenceCount'] if side else 0) and cs['offsets']==(sums['offsetCount'] if side else 0)
  fresh=[w['capture'] for w in cap['queries']['full'] if w['kind']=='fresh'];assert cs['freshWindowQueryCaptures']==len(fresh) and cs['reusedWindowQueryCaptures']==len(cap['queries']['full'])-len(fresh)
  assert cs['freshFullyEnumeratedWindowQueries']==sum(q['fullyEnumerated'] for q in fresh) and cs['freshSelectedPageWindowQueries']==sum(not q['fullyEnumerated'] and q['verificationComplete'] for q in fresh)
  assert cs['queryPages']==stats['freshQueryPages']-query_pages_before and cs['queryScores']==stats['sourceDerivedScores']-query_scores_before
  previous=sid;old_patch=patch;stats['states']+=1;stats['recordAssertions']+=len(check_ids);stats['termAssertions']+=len(check_terms)
 stats['children']+=1;pins.append({'path':run['output'],'sha256':sha(rowfile.read_bytes())})
result={'kind':'rx9005-independent-state-replay-v1','status':'Pass','scope':'Independent Python literal source/token/position/TF/DF/posting reconstruction from complete initial actual state and every retained actual delta; raw file/canonical capsule/query hashes; source-derived BM25 and selected/complete pagination; explicit semantic cache provenance. No engine, tokenizer, scorer, collector or JS helper import/execution. Normalized query revisions cannot independently re-observe the original running engine revision. Root BST/frozen-object properties require source/negative-gate evidence, not serialized replay.','fullMatrixReplay':not PROBE,'acceptedPerformanceEvidence':False,'sourceReportSha256':sha((RAW/'report.json').read_bytes()),'counts':dict(stats),'rowPins':pins}
OUT.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='rowPins'},indent=2))
