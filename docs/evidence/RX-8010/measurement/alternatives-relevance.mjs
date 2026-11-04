import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLexicalAdapter} from './alternatives-lexical.mjs';
import {createOtherAdapter} from './alternatives-other.mjs';
import {compareMembership,hash} from './alternatives-method.mjs';
import {loadFrozenFixture,calculateMetrics,publicQuery} from '../relevance-lib.mjs';
import {scanPhraseSourceCorpus,sourcePhraseQueryResult} from '../../test/oracle/phrases.mjs';
const [consumer,output]=process.argv.slice(2),require=createRequire(join(consumer,'package.json'));
const load=async name=>import(pathToFileURL(name.startsWith('@vmitsaras/raveldex') ? join(consumer,'node_modules/@vmitsaras/raveldex',JSON.parse(await readFile(join(consumer,'node_modules/@vmitsaras/raveldex/package.json'))).exports[name==='@vmitsaras/raveldex'?'.':'.'+name.slice('@vmitsaras/raveldex'.length)].import) : require.resolve(name)));
const {corpus,judgments,freeze,context}=await loadFrozenFixture(),reference=scanPhraseSourceCorpus(corpus.records,corpus.schema);
const report={kind:'rx8010-relevance-v1',startedAt:new Date().toISOString(),identity:{freeze,context,corpusSha256:hash(corpus),judgmentsSha256:hash(judgments)},method:'Frozen source-authored labels unchanged. Full34section title/body fields kept distinct, declaredtitle2/body1 weighting where engine accepts. Metrics are supported-subset descriptive quality, no different-denominator head-to-head winner. Unsupported operators retained perrow, fuzzy metric separate. No relevance tuning from outputs.',engines:[]};
for(const engine of ['raveldex','minisearch','flexsearch','orama','lunr','fuse']){
 let adapter;
 if(engine==='raveldex'){const {createRaveldex}=await load('@vmitsaras/raveldex'),{createSourceProvider,createSourcePhrases}=await load('@vmitsaras/raveldex/addons/phrases');const native=createRaveldex({schema:corpus.schema,addons:[createSourceProvider({fields:['title','body']}),createSourcePhrases({fields:['title','body']})]});await native.addMany(corpus.records);adapter={metadata:{fields:['title','body'],boosts:{title:2,body:1},ranking:'raveldex-bm25-v1',sourcePhrases:true},search:async def=>{const r=await native.search(publicQuery(def.query),{limit:100,deadlineMs:60000});return{ids:r.hits.map(h=>h.id),total:r.total,native:r};},destroy:()=>native.dispose()};}
 else adapter=await(['minisearch','flexsearch','lunr'].includes(engine)?createLexicalAdapter:createOtherAdapter)(engine,await load(engine==='orama'?'@orama/orama':engine==='fuse'?'fuse.js':engine),corpus.records,{fields:['title','body'],boosts:{title:2,body:1}});
 const rows=[],included=[],results=[];
 try{for(const judgment of judgments){const query=typeof judgment.query==='string'?{kind:'text',text:judgment.query}:judgment.query,definition={id:judgment.id,query};const result=await adapter.search(definition);if(result.status==='Not comparable'){rows.push({id:judgment.id,query,status:result.status,reason:result.reason});continue;}
 const expected=sourcePhraseQueryResult(reference,judgment.query,{limit:100}),comparison=compareMembership(result,expected.hits.map(h=>h.id));if(engine==='raveldex'){assert.equal(comparison.status,'Equivalent membership','native relevance membership mismatch');assert.equal(result.total,expected.total);}
 rows.push({id:judgment.id,query,...comparison,result,expectedIds:expected.hits.map(h=>h.id),...(engine==='fuse'?{status:'Separate fuzzy observation',reason:'Different metric/matching, not lexical equivalence'}:{})});
 if(comparison.status==='Equivalent membership'||engine==='fuse'){included.push(judgment);results.push({id:judgment.id,total:result.total,hits:result.ids.map(id=>({id}))});}
 }}finally{await adapter.destroy();}
 report.engines.push({engine,metadata:adapter.metadata??adapter.configuration,judgmentsTotal:judgments.length,included:included.length,omitted:judgments.length-included.length,rows,metrics:calculateMetrics(included,results,100)});
}
const nativeRows=new Map(report.engines[0].rows.map(row=>[row.id,row]));
for(const evaluated of report.engines.slice(1)){if(evaluated.engine==='fuse')continue;const ids=new Set(evaluated.rows.filter(row=>row.status==='Equivalent membership').map(row=>row.id));const selected=judgments.filter(j=>ids.has(j.id));evaluated.nativeSameSubsetMetrics=calculateMetrics(selected,selected.map(j=>{const r=nativeRows.get(j.id).result;return{id:j.id,total:r.total,hits:r.ids.map(id=>({id}))};}),100);}
report.completedAt=new Date().toISOString();await writeFile(output,JSON.stringify(report,null,2)+'\n');
