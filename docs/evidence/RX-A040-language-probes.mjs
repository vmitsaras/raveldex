import assert from 'node:assert/strict';
import {readFile,writeFile}from 'node:fs/promises';
import {createHash}from 'node:crypto';
import {pathToFileURL}from 'node:url';
import {execFileSync}from 'node:child_process';
const root='/Users/vasilis/Documents/GitHub/raveldex';
const oldRoot='/tmp/raveldex-rx-a030-final-candidate/consumer/node_modules/@vmitsaras/raveldex';
const load=(base,path)=>import(pathToFileURL(base+'/'+path).href);
const {stemEnglish}=await load(root,'dist/integrations/languages/english/stem.js');
const {createEnglishAnalyzer,ENGLISH_ANALYZER}=await load(root,'dist/integrations/languages/english/index.js');
const {sourceEnglishStem}=await load(root,'test/oracle/english.mjs');
const {originalSourceTokens}=await load(root,'test/oracle/query.mjs');
const {createRaveldex}=await load(root,'dist/index.js');
const {FakeHost}=await load(root,'test/fixtures/execution/host.mjs');
const drain=cursor=>{let units=0,steps=0;for(;;){const next=cursor.next();if(next.done)return{value:next.value,units,steps};assert.ok(Number.isSafeInteger(next.value.workUnits)&&next.value.workUnits>0);units+=next.value.workUnits;steps++;}};
const plain=value=>JSON.parse(JSON.stringify(value));
const results=[];
async function probe(name,fn){try{const observation=await fn();results.push({name,status:'Pass',observation});}catch(error){results.push({name,status:'Fail',error:{code:error.code,message:error.message,stack:error.stack}});}}
const phrase=(text,fields=['title'])=>({kind:'extension',capability:'phrases',version:1,payload:{text,fields}});
async function modules(base){return Object.assign({},await load(base,'dist/addons/phrases/index.js'),await load(base,'dist/addons/positions/index.js'),await load(base,'dist/addons/positions/phrases.js'),await load(base,'dist/addons/phrases/mixed.js'),await load(base,'dist/addons/evidence/index.js'),await load(base,'dist/addons/snippets/index.js'));}
const m=await modules(root);
await probe('primary original-paper variant and longest-rule conformance, not modern Porter2/BLI/LOGI behavior',()=>{
  const literal=[['conformabli','conform'],['possibly','possibli'],['analogies','analogi'],['homologou','homolog'],['accing','ac'],['feed','feed'],['sing','sing'],['rate','rate'],['cease','ceas'],['toy','toi'],['syzygy','syzygi'],['sky','sky'],['news','new'],['cancell','cancel'],['cancellation','cancel']];
  for(const [input,expected]of literal)assert.equal(drain(stemEnglish(input)).value,expected,input);
  return{primary:'https://snowballstem.org/algorithms/porter/stemmer.html',scope:'Literal outputs hand-derived from complete original-paper steps; ABLI/OU and generic double-consonant policy explicitly distinguished',cases:literal};
});
await probe('finite token bounds, positive charged work and nonASCII/digit passthrough',()=>{
  const passes=['café','δοκιμή','source2','1⁄2','𐐨test','as','is','a',''];for(const input of passes)assert.equal(drain(stemEnglish(input)).value,input);
  const result=drain(stemEnglish('a'.repeat(256)));assert.ok(result.units>256);assert.throws(()=>drain(stemEnglish('a'.repeat(257))),{code:'LIMIT_EXCEEDED'});
  return{passthrough:passes,maximumInputCodeUnits:256,workUnitsAtMaximum:result.units};
});
await probe('secondary differential against structurally different source reference across real corpus and seeded ASCII words',async()=>{
  const corpus=JSON.parse(await readFile(root+'/test/fixtures/relevance/corpus.json','utf8'));
  const words=new Set(corpus.records.flatMap(r=>Object.values(r.text).flatMap(v=>(typeof v==='string'?[v]:v).flatMap(value=>originalSourceTokens(value).map(t=>t.term)))));
  let seed=0x9f13ab4;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};const alphabet='abcdefghijklmnopqrstuvwxyz';
  const endings=['','sses','ies','ss','s','eed','ed','ing','y','ational','tional','enci','anci','izer','abli','alli','entli','eli','ousli','ization','ation','ator','alism','iveness','fulness','ousness','aliti','iviti','biliti','icate','ative','alize','iciti','ical','ful','ness','al','ance','ence','er','ic','able','ible','ant','ement','ment','ent','ion','ou','ism','ate','iti','ous','ive','ize','e','ll'];
  for(let i=0;i<12000;i++){let word='';for(let j=0,length=random(18)+1;j<length;j++)word+=alphabet[random(alphabet.length)];words.add(word+endings[random(endings.length)]);}
  let comparisons=0;for(const word of words){assert.equal(drain(stemEnglish(word)).value,sourceEnglishStem(word),word);comparisons++;}
  return{comparisons,seed:'0x09f13ab4',generatedAttempts:12000,scope:'Secondary algorithmic differential only; oracle authored by this reviewer is not a second human language judgment'};
});
await probe('nonidempotent canonical term is never restemmed during retrieval, phrase verification or source/offset evidence',async()=>{
  assert.equal(drain(stemEnglish('agreed')).value,'agre');assert.equal(drain(stemEnglish('agre')).value,'agr');
  const observations=[];
  for(const strategy of ['source','positions']){
    const addons=[createEnglishAnalyzer(),...(strategy==='source'?[m.createSourceProvider({fields:['title']}),m.createSourcePhrases({fields:['title']})]:[m.createPositionProvider({fields:['title'],offsets:['title']}),m.createPositionPhrases({fields:['title']})]),m.createMatchEvidence({fields:{title:strategy==='source'?'source':'offsets'}})];
    const engine=createRaveldex({schema:{text:{title:{}}},analyzer:ENGLISH_ANALYZER,addons});
    try{await engine.add({id:'a',text:{title:'agreed running'}});const query=phrase('agreed run'),result=await engine.search(query,{extensions:{'match-evidence':{ids:['a'],fields:['title']}}});assert.equal(result.total,1);assert.deepEqual(plain(result.extensions['match-evidence'].documents[0].ranges),[{field:'title',valueIndex:0,position:0,start:0,end:6,term:'agre'},{field:'title',valueIndex:0,position:1,start:7,end:14,term:'run'}]);assert.equal((await engine.search('agre')).total,0);observations.push({strategy,result:plain(result)});}finally{await engine.dispose();}
  }
  return observations;
});
await probe('source/positions/mixed phrase adjacency preserves boundaries, repeats and stop words',async()=>{
  const data=[{id:'adjacent',text:{title:'running runs'}},{id:'split',text:{title:['running','runs']}},{id:'stopped',text:{title:'running and runs'}},{id:'one',text:{title:'running'}},{id:'other',text:{body:'running runs'}}];const observations=[];
  for(const strategy of ['source','positions','mixed']){
    const addons=[createEnglishAnalyzer(),...(strategy==='source'?[m.createSourceProvider({fields:['title','body']}),m.createSourcePhrases({fields:['title','body']})]:strategy==='positions'?[m.createPositionProvider({fields:['title','body'],offsets:['title','body']}),m.createPositionPhrases({fields:['title','body']})]:[m.createSourceProvider({fields:['title']}),m.createPositionProvider({fields:['body'],offsets:['body']}),m.createPhrases({fields:{title:'source',body:'positions'}})])];const engine=createRaveldex({schema:{text:{title:{},body:{}}},analyzer:ENGLISH_ANALYZER,addons});
    try{await engine.addMany(data);const result=await engine.search(phrase('run run',['title','body']),{limit:100});assert.deepEqual(result.hits.map(h=>h.id).sort(),['adjacent','other']);assert.deepEqual((await engine.search(phrase('run and run',['title','body']))).hits.map(h=>h.id),['stopped']);observations.push({strategy,complete:plain(result)});}finally{await engine.dispose();}
  }
  assert.deepEqual(observations[0].complete,observations[1].complete);assert.deepEqual(observations[0].complete,observations[2].complete);return observations;
});
await probe('English snippet highlights preserve entire original Unicode-aware coordinates for source and offset providers',async()=>{
  const observations=[];for(const strategy of ['source','offsets']){
    const addons=[createEnglishAnalyzer(),m.createSourceProvider({fields:['title']}),...(strategy==='offsets'?[m.createPositionProvider({fields:['title'],offsets:['title']})]:[]),m.createSnippetEvidence({fields:{title:strategy}})];const engine=createRaveldex({schema:{text:{title:{}}},analyzer:ENGLISH_ANALYZER,addons});
    try{const text='😀 agreed running café ﬁles';await engine.add({id:'a',text:{title:text}});const result=await engine.search({kind:'text',text:'agreed run café file',operator:'or',fields:['title']},{extensions:{snippets:{ids:['a'],fields:['title']}}});const doc=result.extensions.snippets.documents[0];assert.deepEqual(plain(doc.ranges),[{field:'title',valueIndex:0,position:0,start:3,end:9,term:'agre'},{field:'title',valueIndex:0,position:1,start:10,end:17,term:'run'},{field:'title',valueIndex:0,position:2,start:18,end:22,term:'café'},{field:'title',valueIndex:0,position:3,start:23,end:27,term:'file'}]);for(const snippet of doc.snippets){assert.equal(snippet.text,text.slice(snippet.start,snippet.end));for(const mark of snippet.highlights)assert.ok(['agreed','running','café','ﬁles','agreed running','agreed running café','agreed running café ﬁles'].includes(snippet.text.slice(mark.start,mark.end)));}observations.push({strategy,documents:plain(result.extensions.snippets.documents)});}finally{await engine.dispose();}
  }assert.deepEqual(observations[0].documents,observations[1].documents);return observations;
});
await probe('the baseline installed consumer used by the work comparison matches every committed RX-A030 tar member',async()=>{
  const tar=root+'/docs/evidence/RX-A030-candidate-0.1.0-rc.0.tgz';
  const members=execFileSync('tar',['-tzf',tar],{encoding:'utf8'}).trim().split('\n');
  for(const member of members){assert.ok(member.startsWith('package/')&&!member.includes('..'));const bytes=execFileSync('tar',['-xOzf',tar,member],{maxBuffer:10485760});assert.ok(bytes.equals(await readFile(oldRoot+'/'+member.slice(8))),member);}
  return{members:members.length,tarSha256:createHash('sha256').update(await readFile(tar)).digest('hex'),installedDirectory:oldRoot};
});
await probe('basic snippet path has identical logical search work and complete output to committed RX-A030 installed candidate',async()=>{
  const observations=[];
  for(const base of [oldRoot,root]){
    const mod=await modules(base),{captureConfiguration}=await load(base,'dist/core/contracts/schema.js'),{initializeParticipants}=await load(base,'dist/core/capabilities/participants.js'),{emptyRoot,ExecutionOwner}=await load(base,'dist/core/execution/engine.js'),{executeSearch}=await load(base,'dist/core/query/search.js');
    const host=new FakeHost(),configuration=captureConfiguration({schema:{text:{title:{}}},addons:[mod.createSourceProvider({fields:['title']}),mod.createSnippetEvidence({fields:{title:'source'}})]}),installed=initializeParticipants(configuration),engine=new ExecutionOwner(emptyRoot(configuration,installed.states),host,installed.participants);const adding=engine.add({id:'a',text:{title:'😀 source original source café'}});host.runReady();await adding;
    const result=drain(executeSearch(engine.root,'source',{extensions:{snippets:{ids:['a'],fields:['title']}}}));observations.push({base,units:result.units,steps:result.steps,result:plain(result.value)});const disposing=engine.dispose();host.runReady();await disposing;
  }
  assert.equal(observations[0].units,observations[1].units);assert.equal(observations[0].steps,observations[1].steps);assert.deepEqual(observations[0].result,observations[1].result);return observations;
});
await probe('public English documentation example uses the selected descriptor and preserves the recorded relevance limitation',async()=>{
  const doc=await readFile(root+'/docs/api/ENGLISH.md','utf8'),spec=await readFile(root+'/docs/specs/ENGLISH_ANALYZER.md','utf8');
  const example=/```js\n([\s\S]*?)\n```/.exec(doc)?.[1];assert.ok(example);
  const executable=example.replaceAll("'@vmitsaras/raveldex'",JSON.stringify(pathToFileURL(root+'/dist/index.js').href)).replaceAll("'@vmitsaras/raveldex/integrations/languages/english'",JSON.stringify(pathToFileURL(root+'/dist/integrations/languages/english/index.js').href));
  await import('data:text/javascript,'+encodeURIComponent(executable));
  assert.match(doc,/cancell/);assert.match(doc,/failed intended-empty goal/);assert.match(spec,/zero-false-positive aspiration may fail/);assert.match(doc,/not native-human review/);
  return{exampleSha256:createHash('sha256').update(example).digest('hex'),scope:'Exact current documentation source with imports mapped to the current built entries, not an installed-package claim',frozenGoal:'Retained failed intended-empty aspiration is explicitly documented; AI review is not labeled human'};
});
const sources=['dist/integrations/languages/english/stem.js','dist/integrations/languages/english/index.js','dist/addons/phrases/index.js','dist/addons/phrases/verifier.js','dist/addons/positions/store.js','dist/addons/positions/verifier.js','dist/addons/evidence/providers.js','dist/addons/evidence/builder.js','dist/addons/snippets/snippets.js','src/integrations/languages/english/stem.ts','src/integrations/languages/english/index.ts','src/addons/phrases/index.ts','src/addons/phrases/verifier.ts','src/addons/positions/store.ts','src/addons/positions/verifier.ts','src/addons/evidence/providers.ts','src/addons/evidence/builder.ts','src/addons/snippets/snippets.ts','docs/api/ENGLISH.md','docs/specs/ENGLISH_ANALYZER.md'];
const hashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update(await readFile(root+'/'+p)).digest('hex')])));
const report={kind:'raveldex-rx-a040-independent-language-probes-v1',at:new Date().toISOString(),reviewer:'/root/english_evaluation',environment:{node:process.version,platform:process.platform,arch:process.arch},status:results.every(r=>r.status==='Pass')?'Pass':'Fail',sources:hashes,results};
await writeFile('/tmp/raveldex-rx-a040-language-probes.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,results:results.map(({name,status,error})=>({name,status,error:error?.message}))}));if(report.status==='Fail')process.exitCode=1;
