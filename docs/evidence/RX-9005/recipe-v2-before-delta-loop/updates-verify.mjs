// RX-9005 independent authored-source checks. No production tokenizer/scorer imports.
// Actual read-only query generators are injected by the installed-package child.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { originalSourceTokens } from '../../test/oracle/query.mjs';
import { UPDATE_CONTRACT } from './updates-contract.mjs';
const compare=(a,b)=>a<b?-1:a>b?1:0;
const ordered=entries=>[...entries].sort(([a],[b])=>compare(a,b));
function plain(value){if(value===null||typeof value!=='object')return value;if(Array.isArray(value))return value.map(plain);return Object.fromEntries(Object.keys(value).sort(compare).map(k=>[k,plain(value[k])]));}
const text=value=>JSON.stringify(plain(value));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:text(value)).digest('hex');
const close=(a,b)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1e-12,Math.abs(b)*1e-12),`independent BM25 ${a} != ${b}`);
const verifiedBucketEntries=new WeakMap(),verifiedDirectoryEntries=new WeakMap();
function ownBucketOf(key){let h=2166136261;for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);return String((h>>>0)&255);}
function frozenDataDescriptors(value,label){
 assert.ok(value&&Object.isFrozen(value)&&!Array.isArray(value),label+' immutable object');
 assert.ok(Object.getPrototypeOf(value)===null||Object.getPrototypeOf(value)===Object.prototype,label+' plain data');
 const result=Object.getOwnPropertyDescriptors(value);
 for(const key of Reflect.ownKeys(value)){assert.equal(typeof key,'string',label+' no symbols');const d=result[key];assert.ok(d&&'value' in d&&d.enumerable,label+' no accessors or hidden data');}
 return result;
}
function entries(directory){
 const existing=verifiedDirectoryEntries.get(directory);if(existing)return existing;
 const header=frozenDataDescriptors(directory,'actual directory');assert.deepEqual(Object.keys(header).sort(),['buckets','size']);
 const size=header.size.value,buckets=header.buckets.value;assert.ok(Number.isSafeInteger(size)&&size>=0,'actual directory size');
 const slots=frozenDataDescriptors(buckets,'actual directory buckets'),result=[];
 for(const [slot,descriptor]of Object.entries(slots)){
  assert.ok(/^(0|[1-9][0-9]*)$/.test(slot)&&Number(slot)<256,'actual directory slot');
  const bucket=descriptor.value;let cached=verifiedBucketEntries.get(bucket);
  if(cached)assert.equal(cached.slot,slot,'immutable bucket cannot move to a different FNV slot');
  else {
   const own=frozenDataDescriptors(bucket,'actual directory bucket'),pairs=[];assert.ok(Object.keys(own).length>0,'no empty actual directory bucket');
   for(const [id,d]of Object.entries(own)){assert.equal(ownBucketOf(id),slot,'actual key placement '+id);pairs.push(Object.freeze([id,d.value]));}
   cached={slot,entries:Object.freeze(pairs)};verifiedBucketEntries.set(bucket,cached);
  }
  // Each key is unique inside its own data-only bucket. Across buckets, a key
  // cannot duplicate because every first-seen bucket is bound to its one FNV
  // slot and immutable bucket reuse must retain that same slot.
  for(const pair of cached.entries)result.push(pair);
 }
 assert.equal(result.length,size,'complete actual directory size');const frozen=Object.freeze(result);verifiedDirectoryEntries.set(directory,frozen);return frozen;
}
function directoryGet(directory,id){for(const bucket of Object.values(directory.buckets))if(Object.hasOwn(bucket,id))return bucket[id];return undefined;}
function drain(iterator){let steps=0;for(;;){const step=iterator.next();if(step.done)return step.value;assert.ok(++steps<=60_000_000,'bounded untimed query generator did not finish');}}
function validateOrder(node,expectedKeys){const seen=new Set(),keys=[];function visit(n,lower,upper){if(n===null)return 0;assert.ok(n&&Object.isFrozen(n)&&!seen.has(n));seen.add(n);assert.ok(typeof n.key==='string'&&(lower===undefined||n.key>lower)&&(upper===undefined||n.key<upper));const a=visit(n.left,lower,n.key);keys.push(n.key);const b=visit(n.right,n.key,upper);assert.equal(n.height,1+Math.max(a,b));assert.ok(Math.abs(a-b)<=1);return n.height;}visit(node);assert.deepEqual(keys,expectedKeys);return keys.length;}
function expectedRecord(record){
 const values=typeof record.text.body==='string'?[record.text.body]:record.text.body;assert.ok(Array.isArray(values));const frequencies=new Map(),positionValues=[];
 let tokens=0,positionEntries=2,occurrences=0,termEntries=0,termCodeUnits=0;
 for(const value of values){const found=originalSourceTokens(value),terms={};positionEntries++;for(let position=0;position<found.length;position++){const token=found[position];frequencies.set(token.term,(frequencies.get(token.term)??0)+1);tokens++;if(!Object.hasOwn(terms,token.term)){terms[token.term]=[];termEntries++;termCodeUnits+=token.term.length;positionEntries++;}terms[token.term].push({position,positionLength:1,start:token.start,end:token.end});positionEntries+=3;occurrences++;}positionValues.push({tokenCount:found.length,terms});}
 const metadata=record.metadata??{},units=values.reduce((a,b)=>a+b.length,0),reverse={id:record.id,textCodeUnits:units,metadata,fields:tokens?{body:{length:tokens,terms:Object.fromEntries(ordered(frequencies))}}:{}};
 const source={text:{body:values},retainedEntries:2+values.length,textCodeUnits:units};
 const positions={positions:{body:positionValues},retainedEntries:positionEntries,occurrenceCount:occurrences,offsetCount:occurrences,termEntries,termCodeUnits};
 return {record,values,frequencies,tokens,units,metadata,reverse,source,positions,identity:hash(record),coreIdentity:hash(reverse)};
}
/** Standalone source identity helper; expected data never consults the runtime. */
export function expectedState(records,configuration='core-only'){
 const documents=records.map(expectedRecord);return {configuration,records:records.length,sourceSha256:hash([...records].sort((a,b)=>compare(a.id,b.id))),coreSourceSha256:hash(documents.map(d=>[d.record.id,d.coreIdentity]).sort(([a],[b])=>compare(a,b)))};
}
export function createUpdateVerifier({executeSearch,configuration='core-only',size,pageSize=100}={}){
 assert.equal(typeof executeSearch,'function');assert.ok(['core-only','source-positions'].includes(configuration));assert.ok([100,1000,10000].includes(size));assert.equal(pageSize,100);
 const hasSidecars=configuration==='source-positions',recordCache=new WeakMap(),documentCache=new WeakMap(),sourceCache=new WeakMap(),positionCache=new WeakMap(),termCache=new WeakMap(),deepFrozenNodes=new WeakSet(),expectedHashes=new WeakMap(),orderedRootCache=new WeakMap(),queryCache=new Map();
 let live=new Map(),terms=new Map(),population=0,totalLength=0,textCodeUnits=0,postingEntries=0,termSequence=0,expectedMembershipVersion=0,sortedMembershipVersion=-1,sortedExpectedKeys=[],previousStateHash=null,previousActualDocuments=new Map(),previousTerms=new Map(),previousSources=new Map(),previousPositions=new Map(),inspections=0;
 let sideCounts={sourceRetainedEntries:0,positionRetainedEntries:0,occurrenceCount:0,offsetCount:0,termEntries:0,termCodeUnits:0};
 function reference(record){let ref=recordCache.get(record);if(!ref){ref=expectedRecord(record);recordCache.set(record,ref);}return ref;}
 function adjust(ref,sign){
  population+=sign*(ref.tokens>0?1:0);totalLength+=sign*ref.tokens;textCodeUnits+=sign*ref.units;postingEntries+=sign*ref.frequencies.size;
  sideCounts.sourceRetainedEntries+=sign*ref.source.retainedEntries;
  for(const key of ['retainedEntries','occurrenceCount','offsetCount','termEntries','termCodeUnits'])sideCounts[key==='retainedEntries'?'positionRetainedEntries':key]+=sign*ref.positions[key];
  for(const [term,tf]of ref.frequencies){let entry=terms.get(term);if(sign<0){assert.ok(entry);entry.postings.delete(ref.record.id);entry.df--;entry.frequency-=tf;if(!entry.df){terms.delete(term);expectedMembershipVersion++;continue;}}else{if(!entry){entry={df:0,frequency:0,postings:new Map(),version:++termSequence};terms.set(term,entry);expectedMembershipVersion++;}entry.postings.set(ref.record.id,tf);entry.df++;entry.frequency+=tf;}entry.version=++termSequence;}
 }
 function synchronize(records){assert.equal(new Set(records.map(r=>r.id)).size,records.length);const next=new Map(records.map(r=>[r.id,reference(r)])),changed=new Set();for(const [id,old]of live){const fresh=next.get(id);if(!fresh||fresh.identity!==old.identity){adjust(old,-1);changed.add(id);}}for(const [id,fresh]of next){const old=live.get(id);if(!old||old.identity!==fresh.identity){adjust(fresh,1);changed.add(id);}}live=next;return changed;}
 function deepFrozen(value){if(value===null||typeof value!=='object'||deepFrozenNodes.has(value))return;assert.ok(Object.isFrozen(value),'immutable cache requires every nested actual object frozen');for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(d&&'value' in d,'no actual accessors in immutable data');deepFrozen(d.value);}deepFrozenNodes.add(value);}
 function match(actual,expected,cache,label){assert.ok(actual&&Object.isFrozen(actual),label+' frozen');let key=expectedHashes.get(expected);if(!key){key=hash(expected);expectedHashes.set(expected,key);}if(cache.get(actual)!==key){deepFrozen(actual);assert.deepEqual(plain(actual),plain(expected),label);cache.set(actual,key);}}
 function checkTerm(actual,expected,label){assert.ok(actual&&Object.isFrozen(actual));deepFrozen(actual);const old=termCache.get(actual);if(old&&old.expected===expected&&old.version===expected.version)return;assert.equal(actual.df,expected.df,label+' df');assert.equal(actual.frequency,expected.frequency,label+' frequency');assert.equal(actual.postings.size,expected.df);let count=0;for(const [id,tf]of entries(actual.postings)){assert.equal(tf,expected.postings.get(id),label+' posting '+id);count++;}assert.equal(count,expected.postings.size);termCache.set(actual,{expected,version:expected.version});}
 function freshQuery(root,queryId){
  const target=queryId===UPDATE_CONTRACT.queryPolicy.targetedId,all=queryId==='all';
  const selectedTerms=target?UPDATE_CONTRACT.queryPolicy.freshTargeted:all?[]:[queryId];
  const raw=target?{kind:'or',children:selectedTerms.map(term=>({kind:'text',text:term}))}:all?{kind:'all'}:{kind:'text',text:queryId};
  const expected=[];
  for(const [id,ref]of live){let matched=all,score=0;for(const term of selectedTerms){const tf=ref.frequencies.get(term);if(!tf)continue;matched=true;const entry=terms.get(term),idf=Math.log(1+(population-entry.df+.5)/(entry.df+.5)),avg=totalLength/population;score+=idf*(tf*2.2)/(tf+1.2*(.25+.75*ref.tokens/avg));}if(matched)expected.push({id,score});}
  expected.sort((a,b)=>b.score-a.score||compare(a.id,b.id));if(target)assert.ok(expected.length<=UPDATE_CONTRACT.queryPolicy.targetedMaximumMatches,'targeted OR exceeds frozen267match bound');
  const selected=!target&&size===10000,pageCount=Math.max(1,Math.ceil(expected.length/pageSize));
  const pageIndices=selected?[...new Set([0,Math.floor((pageCount-1)/2),pageCount-1])].sort((a,b)=>a-b):Array.from({length:pageCount},(_,i)=>i);
  const coverage={mode:selected?'selected-first-lower-middle-last-pages':'fully-paginated',fullyEnumerated:!selected,pageSize,expectedPages:pageCount,selectedPageIndices:pageIndices,recipe:UPDATE_CONTRACT.queryPolicy.version};
  const pages=[],hits=[],pageRequests=[];let scores=0;
  for(const pageIndex of pageIndices){const offset=pageIndex*pageSize,limit=Math.min(pageSize,Math.max(1,expected.length-offset));pageRequests.push({offset,limit});let result;
   try{result=drain(executeSearch(root,raw,{offset,limit,deadlineMs:60000}));}catch(error){assert.ok(['WORK_LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(error.code),'untimed query unexpected refusal');return {id:queryId,query:raw,complete:false,fullyEnumerated:false,verificationComplete:false,outcome:'Refused',coverage,error:{name:error.name,code:error.code,details:error.details??null,message:error.message},failedOffset:offset,total:expected.length,pageRequests,pages,hits,scoreAssertions:scores,scope:'Actual directly drained query refused under native work/resource bounds; no clock/default-deadline/fairness observation.'};}
   assert.equal(result.revision,root.revision);assert.equal(result.model,'raveldex-bm25-v1');assert.equal(result.completeness,'complete');assert.equal(result.total,expected.length);const wanted=expected.slice(offset,offset+limit);assert.deepEqual(result.hits.map(h=>h.id),wanted.map(h=>h.id));for(let i=0;i<wanted.length;i++){close(result.hits[i].score,wanted[i].score);scores++;}const normalized={...plain(result),revision:0};pages.push(normalized);hits.push(...plain(result.hits));
  }
  return {id:queryId,query:raw,complete:!selected,fullyEnumerated:!selected,verificationComplete:true,outcome:'Pass',coverage,total:expected.length,pageRequests,pages,hits,scoreAssertions:scores,scope:selected?'Only the declared first/lower-middle/last native pages executed and verified; exact native total, selected IDs/order and source-derived scores. No full enumeration claim.':'Every admitted public-style page, exact total/order/source-derived BM25; actual directly drained generator, outside timing.'};
 }
 function inspect(root,records,revision=root?.revision,{queryScope='full',captureMode='delta',forceCheckpoint=false}={}){
  assert.ok(['full','targeted'].includes(queryScope));assert.ok(['full','delta'].includes(captureMode));assert.ok(root&&Object.isFrozen(root));assert.equal(root.revision,revision);assert.equal(root.configuration.analyzer.id,'basic-v1');assert.equal(root.configuration.analyzer.environmentProfile,'unqualified');assert.deepEqual(Object.keys(root.fields),['body']);
  const changed=synchronize(records),expectedCounts={documents:live.size,textCodeUnits,tokens:totalLength,dictionaryEntries:terms.size,postingEntries};assert.deepEqual(plain(root.counts),expectedCounts);const actualDocuments=new Map(entries(root.documents));assert.equal(actualDocuments.size,live.size);
  for(const [id,actual]of actualDocuments){const ref=live.get(id);assert.ok(ref,'unexpected document '+id);match(actual,ref.reverse,documentCache,'reverse '+id);}
  const field=root.fields.body;assert.equal(field.documents,population);assert.equal(field.length,totalLength);const actualTerms=new Map(entries(field.terms));assert.equal(actualTerms.size,terms.size);for(const [term,actual]of actualTerms){const expected=terms.get(term);assert.ok(expected,'unexpected term '+term);checkTerm(actual,expected,term);}
  let orderStatus;
  if(Object.hasOwn(field,'order')){
   // Membership epochs come only from the independent source model. Changing
   // TF/DF without creating/deleting a live term does not change the key set.
   // An actual immutable ordered root can only reuse a validation performed
   // against this same epoch; all actual term/posting data above is still checked.
   if(sortedMembershipVersion!==expectedMembershipVersion){sortedExpectedKeys=[...terms.keys()].sort(compare);sortedMembershipVersion=expectedMembershipVersion;}
   const cached=field.order===null?undefined:orderedRootCache.get(field.order);
   if(cached&&cached.membershipVersion===expectedMembershipVersion)orderStatus={status:'validated',keys:cached.keys,validation:'reused-immutable-ordered-root',sourceMembershipVersion:expectedMembershipVersion};
   else {const keys=validateOrder(field.order,sortedExpectedKeys);if(field.order!==null)orderedRootCache.set(field.order,{membershipVersion:expectedMembershipVersion,keys});orderStatus={status:'validated',keys,validation:'fresh-complete-ordered-tree',sourceMembershipVersion:expectedMembershipVersion};}
  }else orderStatus={status:'not-present-in-baseline',keys:null};
  const expectedIds=hasSidecars?['positions','source']:[];assert.deepEqual(Object.keys(root.participants).sort(compare),expectedIds);let sources=new Map(),positions=new Map(),sourceHeader=null,positionHeader=null;
  if(hasSidecars){const a=root.participants.source,b=root.participants.positions;assert.ok(Object.isFrozen(a)&&Object.isFrozen(b));assert.equal(a.kind,'raveldex-source-v1');assert.equal(b.kind,'raveldex-positions-v1');assert.equal(a.revision,revision);assert.equal(b.revision,revision);assert.deepEqual(plain(a.fields),['body']);assert.deepEqual(plain(b.fields),['body']);assert.deepEqual(plain(b.offsetFields),['body']);assert.deepEqual(plain(a.analyzer),{id:'basic-v1',environmentProfile:'unqualified'});assert.deepEqual(plain(b.analyzer),{id:'basic-v1',environmentProfile:'unqualified'});
   assert.equal(a.retainedEntries,sideCounts.sourceRetainedEntries);assert.equal(a.textCodeUnits,textCodeUnits);for(const key of ['retainedEntries','occurrenceCount','offsetCount','termEntries','termCodeUnits'])assert.equal(b[key],sideCounts[key==='retainedEntries'?'positionRetainedEntries':key]);sources=new Map(entries(a.records));positions=new Map(entries(b.records));assert.equal(sources.size,live.size);assert.equal(positions.size,live.size);for(const [id,ref]of live){match(sources.get(id),ref.source,sourceCache,'source '+id);match(positions.get(id),ref.positions,positionCache,'positions/UTF16 '+id);}
   sourceHeader={kind:a.kind,fields:plain(a.fields),analyzer:plain(a.analyzer),retainedEntries:a.retainedEntries,textCodeUnits:a.textCodeUnits,maxRetainedEntries:a.maxRetainedEntries,maxTextCodeUnits:a.maxTextCodeUnits};positionHeader={kind:b.kind,fields:plain(b.fields),offsetFields:plain(b.offsetFields),analyzer:plain(b.analyzer),retainedEntries:b.retainedEntries,occurrenceCount:b.occurrenceCount,offsetCount:b.offsetCount,termEntries:b.termEntries,termCodeUnits:b.termCodeUnits,maxRetainedEntries:b.maxRetainedEntries,maxOccurrences:b.maxOccurrences,maxTermCodeUnits:b.maxTermCodeUnits};
  }
  const configurationData={id:configuration,schema:plain(root.configuration.schema),analyzer:plain(root.configuration.analyzer),limits:plain(root.configuration.limits),manifests:(root.configuration.capabilities?.ordered??[]).map(x=>plain(x.manifest))};
  const coreSemanticSha256=queryScope==='full'?hash({recipe:UPDATE_CONTRACT.queryPolicy.version,configuration:configurationData,documents:ordered(live).map(([id,ref])=>[id,ref.coreIdentity]),counts:expectedCounts}):null;
  const checkpoint=previousStateHash===null||forceCheckpoint;const actualChanged=new Set(changed);for(const [id,doc]of actualDocuments)if(previousActualDocuments.get(id)!==doc)actualChanged.add(id);for(const id of previousActualDocuments.keys())if(!actualDocuments.has(id))actualChanged.add(id);
  const recordUpdates={};for(const id of [...actualChanged].sort(compare)){recordUpdates[id]=actualDocuments.has(id)?{core:plain(actualDocuments.get(id)),...(hasSidecars?{source:plain(sources.get(id)),positions:plain(positions.get(id))}:{})}:null;}
  const termUpdates={};for(const term of new Set([...actualTerms.keys(),...previousTerms.keys()])){const current=actualTerms.get(term),old=previousTerms.get(term);if(current===old)continue;if(!current){termUpdates[term]=null;continue;}const postings={};for(const id of actualChanged){const tf=directoryGet(current.postings,id),oldTf=old?directoryGet(old.postings,id):undefined;if(tf!==oldTf)postings[id]=tf??null;}termUpdates[term]={df:current.df,frequency:current.frequency,postings};}
  let snapshot;if(checkpoint){snapshot={documents:Object.fromEntries([...actualDocuments].map(([id,d])=>[id,plain(d)])),terms:Object.fromEntries([...actualTerms].map(([term,e])=>[term,{df:e.df,frequency:e.frequency,postings:Object.fromEntries(entries(e.postings))}])),...(hasSidecars?{sources:Object.fromEntries([...sources].map(([id,d])=>[id,plain(d)])),positions:Object.fromEntries([...positions].map(([id,d])=>[id,plain(d)]))}:{})};}
  const targeted=[freshQuery(root,UPDATE_CONTRACT.queryPolicy.targetedId)];let full=[],fullProvenance=[];
  if(queryScope==='full')for(const id of UPDATE_CONTRACT.queryPolicy.fullAtWindows){const key=UPDATE_CONTRACT.queryPolicy.version+':'+coreSemanticSha256+':'+id;let cached=queryCache.get(key);if(cached){full.push(cached.capture);fullProvenance.push({id,kind:'reused-verified-core-query',originalRevision:cached.revision,originalCoreSemanticSha256:cached.coreSemanticSha256,originalCaptureSha256:hash(cached.capture)});}else{const capture=freshQuery(root,id);cached={capture,revision,coreSemanticSha256};queryCache.set(key,cached);full.push(capture);fullProvenance.push({id,kind:'fresh',originalRevision:revision,originalCoreSemanticSha256:coreSemanticSha256,originalCaptureSha256:hash(capture)});}}
  const capture={kind:'rx9005-complete-state-delta-v2',configuration:configurationData,previous:checkpoint?null:previousStateHash,checkpoint,counts:expectedCounts,field:{documents:field.documents,length:field.length},sourceHeader,positionHeader,...(snapshot?{snapshot}:{delta:{records:recordUpdates,terms:termUpdates}}),coreSemanticSha256,coreIdentityScope:queryScope==='full'?'Stable complete verified lexical-core/configuration content hash':'Complete actual checkpoint/delta lineage binds this root; stable whole-core/source hash omitted because no window-query cache lookup occurs.',queries:{scope:'Untimed directly drained installed query generator; all pages have revision normalized0, actual current revision separately checked.',targeted,full:full.map((q,i)=>fullProvenance[i].kind==='fresh'?{...fullProvenance[i],capture:q}:{...fullProvenance[i],captureReferenceSha256:hash(q)})}};
  const normalizedSha256=hash(capture);previousStateHash=normalizedSha256;previousActualDocuments=actualDocuments;previousTerms=actualTerms;previousSources=sources;previousPositions=positions;inspections++;
  const queryCaptures={targeted,full};const stats={documents:live.size,dictionaryTerms:terms.size,postingRelations:postingEntries,sourceValues:hasSidecars?[...live.values()].reduce((s,x)=>s+x.values.length,0):0,positionOccurrences:hasSidecars?sideCounts.occurrenceCount:0,offsets:hasSidecars?sideCounts.offsetCount:0,changedRecords:actualChanged.size,changedTerms:Object.keys(termUpdates).length,queryPages:targeted.reduce((s,q)=>s+q.pages.length,0)+fullProvenance.reduce((s,q,i)=>s+(q.kind==='fresh'?full[i].pages.length:0),0),queryScores:targeted.reduce((s,q)=>s+q.scoreAssertions,0)+fullProvenance.reduce((s,q,i)=>s+(q.kind==='fresh'?full[i].scoreAssertions:0),0),freshWindowQueryCaptures:fullProvenance.filter(q=>q.kind==='fresh').length,reusedWindowQueryCaptures:fullProvenance.filter(q=>q.kind!=='fresh').length,freshFullyEnumeratedWindowQueries:fullProvenance.filter((q,i)=>q.kind==='fresh'&&full[i].fullyEnumerated).length,freshSelectedPageWindowQueries:fullProvenance.filter((q,i)=>q.kind==='fresh'&&!full[i].fullyEnumerated&&full[i].verificationComplete).length,orderedDictionary:orderStatus,inspections};
  return {capture,stats,normalizedSha256,coreSemanticSha256,queryCaptures,queryProvenance:{targeted:'Fresh actual root/current revision on every inspect',full:fullProvenance,scope:'Prior query captures are explicitly reused correctness-identity evidence only, not another execution or a current-root resource-admission/deadline outcome. Coverage records complete versus selected-page enumeration. Page revisions are normalized0; actualRevision below is independently checked.'},actualRevision:revision,expectedSourceSha256:queryScope==='full'?hash(ordered(live).map(([id,ref])=>[id,ref.identity])):null};
 }
 return {inspect,inspectPrefix:(root,records,revision=root.revision)=>inspect(root,records,revision,{queryScope:'targeted',captureMode:'delta'}),get inspections(){return inspections;}};
}
