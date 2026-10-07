// Replay after npm run build. argv[2] may override the repository root.
// When saved under docs/evidence/, the repository root is inferred.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repository = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const outputPath = fileURLToPath(new URL(import.meta.url.replace(/\.mjs$/, '.json')));
const moduleFromRepo = path => import(pathToFileURL(resolve(repository, path)).href);
const { createRaveldex } = await moduleFromRepo('dist/index.js');
const { createSourceProvider, createSourcePhrases } = await moduleFromRepo('dist/addons/phrases/index.js');
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const schema={text:{a:{},b:{}},metadata:{flag:{type:'boolean'}}};
const records=[
 {id:'p',text:{a:'red blue'}},
 {id:'q',text:{a:'red x blue keep'},metadata:{flag:true}},
 {id:'r',text:{a:['red','blue']}},
 {id:'s',text:{a:'red',b:'blue'}},
 {id:'t',text:{a:'red red blue'}},
 {id:'u',text:{a:'red blue red blue'}},
 {id:'v',text:{b:'red blue'}},
 {id:'w',text:{a:'ﬁle—½'}},
 {id:'e',text:{},metadata:{flag:true}}
];
const token = text => Array.from(text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu),m=>m[0].normalize('NFKC').toLowerCase());
const fieldTerms=(record,field)=>Object.hasOwn(record.text,field)?(typeof record.text[field]==='string'?[record.text[field]]:record.text[field]).flatMap(token):[];
const stats=Object.fromEntries(['a','b'].map(f=>{const ts=records.map(r=>fieldTerms(r,f));return[f,{N:ts.filter(t=>t.length).length,L:ts.reduce((s,t)=>s+t.length,0),ts}]}));
function expectedScore(id,terms){let score=0;const ix=records.findIndex(r=>r.id===id);for(const term of [...new Set(terms)].sort()){let gs=0;for(const field of ['a','b']){const s=stats[field],t=s.ts[ix],tf=t.filter(x=>x===term).length;if(!tf)continue;const df=s.ts.filter(t=>t.includes(term)).length,idf=Math.log(1+(s.N-df+.5)/(df+.5)),norm=1.2*(1-.75+.75*t.length/(s.L/s.N)),tfpart=(tf*(1.2+1))/(tf+norm);gs+=idf*tfpart;}score+=gs;}return score;}
const phrase=text=>({kind:'extension',capability:'phrases',version:1,payload:{text}}), text=value=>({kind:'text',text:value});
const engine=createRaveldex({schema,addons:[createSourcePhrases({fields:['a','b']}),createSourceProvider({fields:['a','b']})]});
const added=await engine.addMany(records);assert.equal(added.revision,1);
const cases=[
 ['phrase',phrase('red blue'),{p:['red','blue'],t:['red','blue'],u:['red','blue'],v:['red','blue']}],
 ['repeats',phrase('red red'),{t:['red']}],
 ['OR ordinary branch',{kind:'or',children:[phrase('red blue'),text('keep')]},{p:['red','blue'],q:['keep'],t:['red','blue'],u:['red','blue'],v:['red','blue']}],
 ['OR equality branch',{kind:'or',children:[phrase('red blue'),{kind:'eq',field:'flag',value:true}]},{p:['red','blue'],q:[],t:['red','blue'],u:['red','blue'],v:['red','blue'],e:[]}],
 ['NOT complement',{kind:'not',child:phrase('red blue')},{q:[],r:[],s:[],w:[],e:[]}],
 ['failed AND in OR',{kind:'or',children:[{kind:'and',children:[phrase('red blue'),text('absent')]},text('keep')]},{q:['keep']}],
 ['normalization',phrase('file ½'),{w:['file','1⁄2']}],
 ['empty NOT',{kind:'not',child:phrase('😀')},Object.fromEntries(records.map(r=>[r.id,[]]))],
];
const out={searches:[],mutations:[],failures:[]};
for(const [name,query,groups]of cases){const actual=await engine.search(query,{limit:100});assert.equal(actual.revision,1);assert.equal(actual.total,Object.keys(groups).length);assert.deepEqual(actual.hits.map(h=>h.id).sort(),Object.keys(groups).sort());for(const hit of actual.hits){const expected=expectedScore(hit.id,groups[hit.id]);assert.ok(Math.abs(hit.score-expected)<=Math.max(1e-12,Math.abs(expected)*1e-12));}out.searches.push({name,query,actual,expectedScores:Object.fromEntries(Object.entries(groups).map(([id,terms])=>[id,expectedScore(id,terms)]))});}
for(const options of [{limit:0},{limit:1},{limit:1,offset:1}]){const actual=await engine.search(phrase('red blue'),options);assert.equal(actual.total,4);assert.equal(actual.revision,1);out.searches.push({name:'pagination',options,actual});}
const replacement={id:'p',text:{a:['red blue']}};const pending=engine.replace(replacement);replacement.text.a[0]='red green blue';out.mutations.push(await pending);assert.equal((await engine.search(phrase('red blue'))).total,4);
out.mutations.push(await engine.replace({id:'p',text:{a:['red','blue']}}));const after=await engine.search(phrase('red blue'));assert.equal(after.total,3);assert.equal(after.revision,3);out.searches.push({name:'replace source boundary',actual:after});
out.mutations.push(await engine.remove(['p','q']));assert.equal((await engine.search(phrase('red blue'))).total,3);
out.mutations.push(await engine.clear());const cleared=await engine.search(phrase('red blue'));assert.equal(cleared.total,0);assert.equal(cleared.revision,5);out.searches.push({name:'clear',actual:cleared});
out.mutations.push(await engine.add({id:'fresh',text:{a:'red blue'}}));const fresh=await engine.search(phrase('red blue'));assert.equal(fresh.total,1);assert.equal(fresh.revision,6);out.searches.push({name:'repopulate',actual:fresh});await engine.dispose();
const bounded=createRaveldex({schema:{text:{a:{}}},addons:[createSourceProvider({fields:['a'],maxRetainedEntries:6}),createSourcePhrases({fields:['a']})]});await bounded.add({id:'kept',text:{a:'red blue'}});
try{await bounded.addMany([{id:'one',text:{a:'red blue'}},{id:'two',text:{a:'red blue'}}]);assert.fail('retained cap did not reject');}catch(e){assert.equal(e.code,'LIMIT_EXCEEDED');out.failures.push({name:'retention cap',code:e.code});}
const rollback=await bounded.search(phrase('red blue'));assert.equal(rollback.revision,1);assert.equal(rollback.total,1);assert.equal(rollback.hits[0].id,'kept');out.searches.push({name:'retention rollback',actual:rollback});await bounded.dispose();
writeFileSync(outputPath,JSON.stringify(out,null,2));console.log(JSON.stringify({searches:out.searches.length,mutations:out.mutations.length,failures:out.failures,result:'PASS',artifact:outputPath},null,2));
