import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, cpSync, mkdtempSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync, constants } from 'node:zlib';
const repo = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../../', import.meta.url));
const packageReport = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL('RX-1006-review-package.json', import.meta.url));
const { build, version } = await import(pathToFileURL(join(repo,'node_modules/esbuild/lib/main.js')).href);
const { buildCorpus, SOURCE_ALLOWLIST } = await import(pathToFileURL(join(repo,'examples/core-docs/corpus.mjs')).href);
const { DOCS_JUDGMENTS, DOCS_ERROR_JUDGMENTS } = await import(pathToFileURL(join(repo,'test/fixtures/docs/judgments.mjs')).href);
const directory = JSON.parse(readFileSync(packageReport,'utf8')).directory;
const corpus = buildCorpus();
const hash = b => createHash('sha256').update(b).digest('hex');
const sourceEvidence = [];
for (const source of corpus.sources) {
  const bytes = readFileSync(join(repo,source.path));
  assert.equal(hash(bytes),source.sha256);assert.equal(bytes.length,source.bytes);
  const lines = bytes.toString('utf8').split('\n');
  for (const section of corpus.sections.filter(s=>s.sourcePath===source.path)) {
    const record = corpus.records.find(r=>r.id===section.id);
    assert.equal(lines[section.startLine-1].replace(/^#+\s+/,''),section.title);
    assert.equal(record.text.body,lines.slice(section.startLine,section.endLine).join('\n')+'\n');
    assert.equal(hash(JSON.stringify(record)),section.contentHash);
    assert.equal(section.id,`doc:${source.path}#${section.anchor}`);
    assert.equal(section.sourceUrl,`${source.url}#${section.anchor}`);
  }
  sourceEvidence.push({path:source.path,hash:source.sha256,sourceBytes:bytes.length});
}
const copyRoot = realpathSync(mkdtempSync(join(tmpdir(),'raveldex-corpus-review-')));
for (const source of SOURCE_ALLOWLIST) {mkdirSync(join(copyRoot,source.path,'..'),{recursive:true});cpSync(join(repo,source.path),join(copyRoot,source.path));}
mkdirSync(join(copyRoot,'docs/evidence'),{recursive:true});
writeFileSync(join(copyRoot,'docs/evidence/ARCHIVED.md'),'# Archived proposal\nsynthetic archived secret tokens\n');
assert.deepEqual(buildCorpus(copyRoot),corpus);
const firstPath = join(copyRoot,SOURCE_ALLOWLIST[0].path);
writeFileSync(firstPath,readFileSync(firstPath,'utf8').replace('Synchronously validates configuration','Synchronously validates the configuration'));
const edited = buildCorpus(copyRoot);
assert.deepEqual(edited.records.map(r=>r.id),corpus.records.map(r=>r.id));
assert.deepEqual(edited.sections.map(s=>s.sourceUrl),corpus.sections.map(s=>s.sourceUrl));
assert.notEqual(edited.hash,corpus.hash);
writeFileSync(join(directory,'independent-corpus.json'),JSON.stringify({corpus,judgments:DOCS_JUDGMENTS,errors:DOCS_ERROR_JUDGMENTS}));
const runner = `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
const {corpus,judgments,errors}=JSON.parse(readFileSync('independent-corpus.json','utf8'));
const tokenize=s=>[...s.matchAll(/[\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M}]*/gu)].map(m=>m[0].normalize('NFKC').toLowerCase());
const tokens=(record,field)=>{const value=record.text[field];return value===undefined?[]:Array.isArray(value)?value.flatMap(tokenize):tokenize(value);};
const match=(r,q)=>{
 if(typeof q==='string')q={kind:'text',text:q};
 const fields=q.fields??Object.keys(corpus.schema.text);
 switch(q.kind){
 case'text':{const requested=tokenize(q.text);if(!requested.length)return false;const present=new Set(fields.flatMap(f=>tokens(r,f)));return(q.operator==='or'?requested.some(t=>present.has(t)):requested.every(t=>present.has(t)));}
 case'group':return fields.some(f=>tokens(r,f).some(t=>q.variants.some(v=>{const variant=tokenize(v.text);assert.equal(variant.length,1);return v.match==='prefix'?t.startsWith(variant[0]):t===variant[0];})));
 case'and':return q.children.every(c=>match(r,c));case'or':return q.children.some(c=>match(r,c));case'not':return!match(r,q.child);
 case'eq':return Object.hasOwn(r.metadata??{},q.field)&&(Array.isArray(r.metadata[q.field])?r.metadata[q.field].includes(q.value):r.metadata[q.field]===q.value);
 case'all':return true;case'none':return false;default:throw Error('Unexpected judged AST');
 }};
const engine=createRaveldex({schema:corpus.schema});
const outcomes=[];let comparisons=0;
try{
 assert.equal((await engine.addMany(corpus.records)).revision,1);
 for(const judgment of judgments){const expected=corpus.records.filter(r=>match(r,judgment.query)).map(r=>r.id).sort();const actual=await engine.search(judgment.query,{limit:100});assert.deepEqual(actual.hits.map(h=>h.id).sort(),expected);assert.equal(actual.total,expected.length);assert.equal(actual.revision,1);comparisons++;outcomes.push({id:judgment.id,total:actual.total,intendedRank:judgment.intendedIds.map(id=>actual.hits.findIndex(h=>h.id===id)+1)});}
 for(const judgment of errors)await assert.rejects(engine.search(judgment.query),e=>e instanceof RaveldexError&&e.code===judgment.code);
 let live=corpus.records.slice();let revision=1;const first=live[0];
 for(const op of ['replace','restore','remove','add','clear','reload']){
 let result;if(op==='replace'){const replacement={...first,text:{...first.text,title:''}};result=await engine.replace(replacement);live[0]=replacement;}
 if(op==='restore'){result=await engine.replace(first);live[0]=first;}
 if(op==='remove'){result=await engine.remove(first.id);live=live.filter(r=>r.id!==first.id);}
 if(op==='add'){result=await engine.add(first);live.push(first);}
 if(op==='clear'){result=await engine.clear();live=[];}
 if(op==='reload'){result=await engine.addMany(corpus.records);live=corpus.records.slice();}
 assert.equal(result.revision,++revision);
 for(const q of [{kind:'all'},'source','atomic batch']){const actual=await engine.search(q,{limit:100});const expected=live.filter(r=>match(r,q)).map(r=>r.id).sort();assert.equal(actual.total,expected.length);assert.deepEqual(actual.hits.map(h=>h.id).sort(),expected);assert.equal(actual.revision,revision);comparisons++;}
 }
}finally{await engine.dispose();}
console.log(JSON.stringify({membershipComparisons:comparisons,errorChecks:errors.length,outcomes}));
`;
writeFileSync(join(directory,'docs-review.mjs'),runner);
const command=(args)=>execFileSync(process.execPath,args,{cwd:directory,encoding:'utf8',timeout:120000});
const runtime=JSON.parse(command(['docs-review.mjs']));
writeFileSync(join(directory,'review-entry.mjs'),"export {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex';\n");
const settings={bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false};
const bundled=await build({...settings,absWorkingDir:directory,entryPoints:['review-entry.mjs'],outfile:'review-core.mjs',logLevel:'silent'});
const bytes=bundled.outputFiles[0].contents;
const gzipSettings={level:9,windowBits:15,memLevel:8,strategy:constants.Z_DEFAULT_STRATEGY};
const gzip=gzipSync(bytes,gzipSettings);assert.equal(gzip.readUInt32LE(4),0);
const inputs=Object.keys(bundled.metafile.inputs);
assert.ok(inputs.every(p=>p==='review-entry.mjs'||p.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
assert.ok(inputs.every(p=>!/(addons|adapters|construction|invariants|oracle|esbuild|typescript)/.test(p)));
assert.ok(Object.values(bundled.metafile.outputs).every(o=>!o.imports.length));
writeFileSync(join(directory,'review-core.mjs'),bytes);
writeFileSync(join(directory,'review-core.mjs.gz'),gzip);
const guard=`const accessed=[];for(const key of ['document','window','navigator','fetch','Worker','indexedDB','performance','setTimeout','clearTimeout','queueMicrotask']){Object.defineProperty(globalThis,key,{get(){accessed.push(key);throw Error('startup '+key)},configurable:true});}const api=await import(process.argv[1]);if(accessed.length)throw Error('startup access');console.log(JSON.stringify({exports:Object.keys(api).sort(),accessed}));`;
const startup=['@vmitsaras/raveldex','./review-core.mjs'].map(s=>JSON.parse(command(['--input-type=module','--eval',guard,s])));
console.log(JSON.stringify({directory,corpusHash:corpus.hash,corpusRecords:corpus.records.length,sourceEvidence,archiveExcluded:true,stableIdsAfterBodyEdit:true,runtime,bundle:{esbuild:version,settings,gzipSettings,minifiedBytes:bytes.length,gzipBytes:gzip.length,minifiedHash:hash(bytes),gzipHash:hash(gzip),mtime:0,inputCount:inputs.length,inputs},startup},null,2));
