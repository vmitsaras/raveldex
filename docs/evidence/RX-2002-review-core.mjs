import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo=resolve(process.argv[2]??process.cwd());
const root=await import(pathToFileURL(join(repo,'dist/index.js')));
const source=await import(pathToFileURL(join(repo,'dist/addons/phrases/index.js')));
const positions=await import(pathToFileURL(join(repo,'dist/addons/positions/index.js')));
const positional=await import(pathToFileURL(join(repo,'dist/addons/positions/phrases.js')));
const mixed=await import(pathToFileURL(join(repo,'dist/addons/phrases/mixed.js')));
const report={status:'running',environment:{node:process.version,platform:process.platform,arch:process.arch},expectationBasis:'Literal original inputs paired with explicit expected token sequences; separate BM25 arithmetic and Boolean positive-group evaluation; no production tokenizer/scorer or repository test oracle imports.',comparisons:0,queries:0,fixtures:0,registrationErrors:[],capErrors:[]};
const schema={text:{title:{boost:2},body:{boost:1}},metadata:{kind:{type:'string'}}};
const pair=(raw,terms)=>({raw,terms});
const fixtures=[
 ['a',[pair('red red car',['red','red','car'])],[pair('ﬁle a\u0301 ½',['file','á','1⁄2'])],'guide'],
 ['b',[pair('red car',['red','car'])],[pair('red',['red']),pair('',[]),pair('blue',['blue'])],'guide'],
 ['c',[pair('blue',['blue'])],[pair('red—blue',['red','blue'])],'api'],
 ['d',[pair('',[])],[pair('red gap blue',['red','gap','blue'])],'api'],
 ['e',[pair('½ blue',['1⁄2','blue'])],[pair('red blue red blue',['red','blue','red','blue'])],'guide'],
 ['f',[pair('1/2 blue',['1','2','blue'])],[pair('1 2 blue',['1','2','blue'])],'api'],
 ['g',[pair('😀 ﬁle',['file'])],[pair('\u0301 a\u0301—ﬁle',['á','file'])],'guide'],
 ['h',[pair('𐐀 red',['𐐨','red'])],[pair('RED RED',['red','red'])],'api'],
 ['__proto__',[],[pair('',[])],'guide'],
 ['j',[pair('red',['red'])],[],'guide'],
 ['k',[],[],'api'],
 ['l',[pair('blue red',['blue','red'])],[pair('blue red blue red',['blue','red','blue','red'])],'api'],
];
const variants=[pair('red',['red']),pair('BLUE',['blue']),pair('car',['car']),pair('ﬁle',['file']),pair('a\u0301',['á']),pair('½',['1⁄2']),pair('𐐀',['𐐨'])];
let seed=0x61c2ab9;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
for(let i=0;i<64;i++){
 const values=[];for(let f=0;f<2;f++){const vs=[];for(let j=0;j<(rand()%3);j++){const n=rand()%8, chosen=[];for(let k=0;k<n;k++)chosen.push(variants[rand()%variants.length]);vs.push(pair(chosen.map(x=>x.raw).join(j%2?'—':' 😀 '),chosen.flatMap(x=>x.terms)));}values.push(vs);}
 fixtures.push([`generated:${i}`,values[0],values[1],i%2?'guide':'api']);
}
report.fixtures=fixtures.length;
const records=fixtures.map(([id,title,body,kind])=>({id,text:{...(title.length?{title:title.map(x=>x.raw)}:{}),...(body.length?{body:body.map(x=>x.raw)}:{})},metadata:{kind}}));
const corpus=fixtures.map(([id,title,body,kind])=>({id,fields:{title:title.map(x=>x.terms),body:body.map(x=>x.terms)},kind}));
const fields=['body','title'];
const stats={};for(const f of fields){const lengths=corpus.map(d=>d.fields[f].flat().length);const live=lengths.filter(Boolean);const df={};for(const d of corpus)for(const t of new Set(d.fields[f].flat()))df[t]=(df[t]??0)+1;stats[f]={N:live.length,L:live.reduce((a,b)=>a+b,0),df};}
const lexical=(raw,terms,selected=fields)=>({kind:'text',raw,terms,fields:[...selected].sort()});
const phrase=(raw,terms,selected=fields)=>({kind:'phrase',raw,terms,fields:[...selected].sort()});
const key=(term,fs)=>JSON.stringify([fs,term]);
function groupSet(q){return new Map([...new Set(q.terms)].map(t=>[key(t,q.fields),{term:t,fields:q.fields}]));}
function termExists(d,t,fs){return fs.some(f=>d.fields[f].some(v=>v.includes(t)));}
function evaluate(d,q){
 if(q.kind==='all')return {ok:true,groups:new Map()};if(q.kind==='none')return {ok:false,groups:new Map()};
 if(q.kind==='eq')return {ok:d.kind===q.value,groups:new Map()};
 if(q.kind==='not'){const child=evaluate(d,q.child);return {ok:!child.ok,groups:new Map()};}
 if(q.kind==='and'||q.kind==='or'){const children=q.children.map(c=>evaluate(d,c)),ok=q.kind==='and'?children.every(x=>x.ok):children.some(x=>x.ok);const groups=new Map();if(ok)for(const c of children)if(c.ok)for(const [k,g]of c.groups)groups.set(k,g);return {ok,groups};}
 const groups=groupSet(q);let ok=q.terms.length>0&&q.terms.every(t=>termExists(d,t,q.fields));
 if(ok&&q.kind==='phrase')ok=q.fields.some(f=>d.fields[f].some(v=>v.some((_,start)=>q.terms.every((t,j)=>v[start+j]===t))));
 return {ok,groups:ok?groups:new Map()};
}
function expected(q,page){
 const hits=[];for(const d of corpus){const e=evaluate(d,q);if(!e.ok)continue;let score=0;
 for(const[,g]of[...e.groups].sort(([a],[b])=>a<b?-1:a>b?1:0)){let sum=0;for(const f of g.fields){const ts=d.fields[f].flat(),tf=ts.filter(t=>t===g.term).length;if(!tf)continue;const {N,L,df}=stats[f],idf=Math.log(1+(N-df[g.term]+0.5)/(df[g.term]+0.5)),normalizer=1.2*(1-0.75+0.75*ts.length/(L/N)),tfPart=tf*(1.2+1)/(tf+normalizer);sum+=(schema.text[f].boost??1)*idf*tfPart;}score+=sum;}
 hits.push({id:d.id,score});}
 hits.sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0));return {total:hits.length,hits:hits.slice(page.offset??0,(page.offset??0)+(page.limit??100))};
}
function native(q){if(q.kind==='phrase')return {kind:'extension',capability:'phrases',version:1,payload:{text:q.raw,fields:q.fields}};if(q.kind==='text')return {kind:'text',text:q.raw,fields:q.fields};if(q.kind==='and'||q.kind==='or')return {kind:q.kind,children:q.children.map(native)};if(q.kind==='not')return {kind:'not',child:native(q.child)};if(q.kind==='eq')return {kind:'eq',field:'kind',value:q.value};return {kind:q.kind};}
function compare(actual,want,label){assert.equal(actual.total,want.total,label);assert.equal(actual.completeness,'complete',label);assert.deepEqual(actual.hits.map(x=>x.id),want.hits.map(x=>x.id),label);for(let i=0;i<want.hits.length;i++)assert.ok(Math.abs(actual.hits[i].score-want.hits[i].score)<=Math.max(1e-12,Math.abs(want.hits[i].score)*1e-12),`${label}: score ${want.hits[i].id}`);report.comparisons++;}
const cases=[phrase('',[]),phrase('😀',[]),phrase('red blue',['red','blue']),phrase('red red',['red','red']),phrase('blue red blue',['blue','red','blue']),phrase('red red red',['red','red','red']),phrase('½ blue',['1⁄2','blue']),phrase('1/2 blue',['1','2','blue']),phrase('ﬁle a\u0301',['file','á']),phrase('a\u0301 ﬁle',['á','file']),phrase('𐐀 red',['𐐨','red']),phrase('red—blue',['red','blue'],['body']),phrase('red car',['red','car'],['title']),phrase('red',['red']),lexical('red red car',['red','red','car']),{kind:'not',child:phrase('red blue',['red','blue'])},{kind:'not',child:phrase('',[])},{kind:'not',child:{kind:'not',child:phrase('red blue',['red','blue'])}},{kind:'or',children:[phrase('red blue',['red','blue']),lexical('car',['car'])]},{kind:'or',children:[{kind:'and',children:[phrase('red blue',['red','blue']),lexical('ﬁle',['file'])]},lexical('red',['red'])]},{kind:'or',children:[{kind:'all'},phrase('red red',['red','red'])]},{kind:'and',children:[{kind:'eq',value:'guide'},phrase('blue red',['blue','red'])]}];
for(let i=0;i<64;i++){const selected=i%3===0?['title']:i%3===1?['body']:fields,n=1+rand()%4,selectedTokens=[];for(let j=0;j<n;j++)selectedTokens.push(variants[rand()%variants.length]);const p=phrase(selectedTokens.map(x=>x.raw).join('—'),selectedTokens.flatMap(x=>x.terms),selected);cases.push(i%4===0?{kind:'or',children:[p,lexical('red',['red'])]}:i%4===1?{kind:'not',child:p}:i%4===2?{kind:'and',children:[p,{kind:'eq',value:'guide'}]}:p);}
const configs={
 source:[source.createSourceProvider({fields}),source.createSourcePhrases({fields})],
 positions:[positions.createPositionProvider({fields}),positional.createPositionPhrases({fields})],
 offsets:[positions.createPositionProvider({fields,offsets:['body']}),positional.createPositionPhrases({fields})],
 mixed:[source.createSourceProvider({fields:['title']}),positions.createPositionProvider({fields:['body']}),mixed.createPhrases({fields:{title:'source',body:'positions'}})],
 reverseMixed:[source.createSourceProvider({fields:['body']}),positions.createPositionProvider({fields:['title'],offsets:['title']}),mixed.createPhrases({fields:{title:'positions',body:'source'}})],
};
const engines={};try{
 for(const[name,addons]of Object.entries(configs)){const engine=root.createRaveldex({schema,addons:[...addons].reverse()});engines[name]=engine;await engine.addMany(records);}
 for(const q of cases)for(const page of [{limit:100},{limit:0},{offset:2,limit:3}]){const want=expected(q,page),actuals=[];for(const[name,engine]of Object.entries(engines)){const result=await engine.search(native(q),page);assert.equal(result.revision,1);compare(result,want,`${name}:${JSON.stringify(q)}:${JSON.stringify(page)}`);actuals.push(result);}for(let i=1;i<actuals.length;i++)assert.deepEqual(actuals[i],actuals[0]);report.queries++;}
 const core=root.createRaveldex({schema});try{await core.addMany(records);for(const q of [lexical('red blue',['red','blue']),lexical('red red car',['red','red','car']),lexical('½',['1⁄2']),{kind:'not',child:lexical('red',['red'])}]){const actual=await core.search(native(q),{limit:100});compare(actual,expected(q,{limit:100}),'core unchanged');for(const[name,engine]of Object.entries(engines))assert.deepEqual(await engine.search(native(q),{limit:100}),actual,name);}}finally{await core.dispose();}
}finally{for(const e of Object.values(engines))await e.dispose();}
async function errorCase(name,fn,code){let thrown;try{const result=await fn();if(result?.dispose)await result.dispose();}catch(error){thrown=error;}assert.ok(thrown instanceof root.RaveldexError,name);assert.equal(thrown.code,code,name);report.registrationErrors.push({name,code,path:thrown.details.path});}
const pp=()=>positions.createPositionProvider({fields});const sp=()=>source.createSourceProvider({fields});const ph=()=>positional.createPositionPhrases({fields});
for(const options of [{fields:[]},{fields:['title','title']},{fields:['title'],offsets:['body']},{fields:['title'],offsets:['title','title']},{fields:['title'],offsets:true},{fields:['title'],unexpected:1},{fields:['title'],maxWorkUnits:0},{fields:['title'],maxRetainedEntries:-1},{fields:['title'],id:''}])await errorCase(`options ${JSON.stringify(options)}`,()=>positions.createPositionProvider(options),'INVALID_OPTIONS');
await errorCase('missing positions registration',()=>root.createRaveldex({schema,addons:[ph()]}),'MISSING_CAPABILITY');
await errorCase('source cannot satisfy positions',()=>root.createRaveldex({schema,addons:[sp(),ph()]}),'MISSING_CAPABILITY');
await errorCase('duplicate positions providers',()=>root.createRaveldex({schema,addons:[pp(),positions.createPositionProvider({fields,id:'other'})]}),'INCOMPATIBLE_CAPABILITY');
await errorCase('missing mixed source',()=>root.createRaveldex({schema,addons:[pp(),mixed.createPhrases({fields:{title:'source',body:'positions'}})]}),'MISSING_CAPABILITY');
await errorCase('missing mixed positions',()=>root.createRaveldex({schema,addons:[sp(),mixed.createPhrases({fields:{title:'source',body:'positions'}})]}),'MISSING_CAPABILITY');
await errorCase('wrong strategy',()=>mixed.createPhrases({fields:{title:'offsets'}}),'INVALID_OPTIONS');
await errorCase('wrong field',()=>root.createRaveldex({schema,addons:[positions.createPositionProvider({fields:['absent']})]}),'INCOMPATIBLE_CAPABILITY');
const mutated=pp();for(const[part,value]of[['contractVersion',2],['version','bad'],['execution',{direct:true,worker:true}],['roles',['analyzer']]])await errorCase(`manifest ${part}`,()=>root.createRaveldex({schema,addons:[{...mutated,manifest:{...mutated.manifest,[part]:value}}]}),'INCOMPATIBLE_CAPABILITY');
for(const kind of ['source','positions','mixed']){
 const addons=kind==='source'?[source.createSourceProvider({fields:['title']}),source.createSourcePhrases({fields:['title']})]:kind==='positions'?[positions.createPositionProvider({fields:['title']}),positional.createPositionPhrases({fields:['title']})]:[source.createSourceProvider({fields:['title']}),positions.createPositionProvider({fields:['body']}),mixed.createPhrases({fields:{title:'source',body:'positions'}})];
 const e=root.createRaveldex({schema,addons});try{for(const text of ['', 'never found']){const selected=kind==='mixed'?['title','body']:['title','body'];if(kind==='mixed'){assert.equal((await e.search({kind:'extension',capability:'phrases',version:1,payload:{text,fields:selected}})).total,0);}else await errorCase(`${kind} missing requested field with zero candidates ${text}`,()=>e.search({kind:'extension',capability:'phrases',version:1,payload:{text,fields:selected}}),'MISSING_CAPABILITY');}}finally{await e.dispose();}
}

// Authoritative state incompatibility must remain observable on empty/unmatched
// leaves and through a mixed leaf whose other field already matches.
function corruptProvider(provider, transform, onPrepare=false){return {...provider,participant:{initialize(configuration){const initial=provider.participant.initialize(configuration);return onPrepare?initial:transform(initial);},*prepare(previous,context){const next=yield* provider.participant.prepare(previous,context);return onPrepare?transform(next):next;}}};}
const emptyDirectory=()=>Object.freeze({size:0,buckets:Object.freeze(Object.create(null))});
for(const [name,transform,code]of[
 ['wrong revision',r=>Object.freeze({...r,revision:r.revision+1}),'REVISION_MISMATCH'],
 ['wrong analyzer id',r=>Object.freeze({...r,analyzer:Object.freeze({...r.analyzer,id:'other'})}),'INCOMPATIBLE_CAPABILITY'],
 ['wrong analyzer profile',r=>Object.freeze({...r,analyzer:Object.freeze({...r.analyzer,environmentProfile:'other'})}),'INCOMPATIBLE_CAPABILITY'],
 ['wrong kind',r=>Object.freeze({...r,kind:'wrong'}),'INCOMPATIBLE_CAPABILITY'],
 ['missing selected field',r=>Object.freeze({...r,fields:Object.freeze(['title']),maxRetainedEntries:0}),'MISSING_CAPABILITY'],
]){const e=root.createRaveldex({schema,addons:[corruptProvider(pp(),transform),ph()]});try{for(const raw of ['', 'nothing'])await errorCase(`position header ${name} at zero candidates ${raw}`,()=>e.search({kind:'extension',capability:'phrases',version:1,payload:{text:raw,fields:['body']}}),code);}finally{await e.dispose();}}
for(const kind of ['positions','mixedSourceMissing','mixedPositionsMissing']){
 const doomed=provider=>corruptProvider(provider,r=>Object.freeze({...r,records:emptyDirectory()}),true);
 const addons=kind==='positions'?[doomed(pp()),ph()]:kind==='mixedSourceMissing'?[doomed(source.createSourceProvider({fields:['title']})),positions.createPositionProvider({fields:['body']}),mixed.createPhrases({fields:{title:'source',body:'positions'}})]:[source.createSourceProvider({fields:['body']}),doomed(positions.createPositionProvider({fields:['title']})),mixed.createPhrases({fields:{title:'positions',body:'source'}})];
 const e=root.createRaveldex({schema,addons});try{await e.add({id:'a',text:{title:'red blue',body:'red blue'}});await errorCase(`${kind} missing authoritative candidate even though other selected field matches`,()=>e.search({kind:'extension',capability:'phrases',version:1,payload:{text:'red blue',fields:['body','title']}},{limit:0}),'MISSING_CAPABILITY');}finally{await e.dispose();}
}
for(const badRequirements of [[],[{id:'source:title',contractVersion:1}]])await errorCase('position refinement cannot omit declared positions requirements',()=>root.createRaveldex({schema,addons:[pp(),sp(),{...ph(),manifest:{...ph().manifest,requires:badRequirements}}]}),'MISSING_CAPABILITY');
for(const factory of [()=>positional.createPositionPhrases({fields,maxWorkUnits:1}),()=>mixed.createPhrases({fields:{title:'source',body:'positions'},maxWorkUnits:1})]){
 const handler=factory(),addons=handler.manifest.dataRequirements.source?[source.createSourceProvider({fields:['title']}),positions.createPositionProvider({fields:['body']}),handler]:[pp(),handler];const e=root.createRaveldex({schema,addons});try{await e.addMany([{id:'a',text:{title:'red blue',body:'red blue'}},{id:'b',text:{title:'red gap blue',body:'red gap blue'}}]);await errorCase('phrase manifest work cap fails complete exact total even limit0',()=>e.search({kind:'extension',capability:'phrases',version:1,payload:{text:'red blue'}},{limit:0}),'WORK_LIMIT_EXCEEDED');assert.equal((await e.search('red',{limit:0})).total,2);}finally{await e.dispose();}
}
report.status='Pass';report.searchCases=cases.length;report.configurations=Object.keys(configs);report.inputHash=(await import('node:crypto')).createHash('sha256').update(JSON.stringify({records,cases})).digest('hex');
await writeFile(resolve(process.argv[1]).replace(/\.mjs$/,'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
