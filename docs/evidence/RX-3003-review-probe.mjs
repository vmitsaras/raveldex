import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { platform, release, arch } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium } from 'playwright-core';

const repo = resolve(new URL('../..', import.meta.url).pathname);
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--directory')) throw new Error('Pass --directory with an already installed packed consumer; this reviewer never builds or packs the package.');
const directory = resolve(option('--directory'));
const reportPath = resolve(args.includes('--output') ? option('--output') : join(repo, 'docs/evidence/RX-3003-review-probe.json'));
const installed = join(directory, 'node_modules/@vmitsaras/raveldex');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const run = { kind: 'raveldex-independent-packed-indexeddb-review-v1', startedAt: new Date().toISOString(),
  environment: { node: process.version, versions: process.versions, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion },
  installedDirectory: directory, records: [], browserErrors: [], limitations: [
    'Quota faults are injected DOMException outcomes, not exhaustion of physical browser quota.',
    'Encoded strings, package/bundle bytes and row counts do not measure retained or peak memory.',
    'This is one actual local Chrome engine; it does not qualify browser native snapshots or cross-browser Unicode portability.',
  ] };
const previous = await readFile(reportPath, 'utf8').then(JSON.parse).catch(() => undefined);
const report = { runs: [...(previous?.runs ?? []), run] };
run.reviewerProgramSha256 = digest(await readFile(new URL(import.meta.url)));
const save = async () => { await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); };
const exec = promisify(execFile);
async function filesAt(root, prefix = '') {
  const rows = [];
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, item.name);
    if (item.isDirectory()) rows.push(...await filesAt(root, path));
    else if (item.isFile()) rows.push({ path, sha256: digest(await readFile(join(root, path))) });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
run.sourceBefore = await filesAt(join(repo, 'src'));
run.package = { packageJsonSha256: digest(await readFile(join(installed, 'package.json'))), distribution: await filesAt(join(installed, 'dist')) };
run.currentPackage = { packageJsonSha256: digest(await readFile(join(repo, 'package.json'))), distribution: await filesAt(join(repo, 'dist')) };
run.packageMatchesCurrent = JSON.stringify(run.package) === JSON.stringify(run.currentPackage);
if (args.includes('--package')) {
  const path = resolve(option('--package')), raw = await readFile(path);
  const artifact=JSON.parse(raw);run.packageArtifact = { path, sha256: digest(raw), package:artifact.package,corpus:artifact.corpus };
  const tarballs=(await readdir(directory)).filter(path=>path.endsWith('.tgz'));assert.equal(tarballs.length,1,'One actual package tarball');
  const tarball=await readFile(join(directory,tarballs[0]));assert.equal(digest(tarball),artifact.package.sha256,'Actual installed package capture tarball identity');assert.equal(tarball.length,artifact.package.tarballBytes,'Actual tarball size');
  const corpus=JSON.parse(await readFile(join(directory,'corpus.json'),'utf8'));const {hash,...content}=corpus;
  assert.equal(digest(Buffer.from(JSON.stringify(content))),hash,'Corpus content hash independently recomputed');assert.equal(hash,artifact.corpus.hash,'Primary graph/corpus capture identity');
  const sources=await Promise.all(artifact.corpus.sources.map(async source=>({path:source.path,sha256:digest(await readFile(join(repo,source.path))),expected:source.sha256})));
  assert.ok(sources.every(source=>source.sha256===source.expected),'All current corpus source identities agree with the packaged capture');
  const graphs=[];
  for(const [name,graph] of Object.entries(artifact.bundles)){
    const inputs=await Promise.all(graph.inputs.map(async input=>({path:input.path,sha256:digest(await readFile(join(directory,input.path))),expected:input.sha256})));
    assert.ok(inputs.every(input=>input.sha256===input.expected),'Every captured graph input identity agrees');
    const result=await build({absWorkingDir:directory,entryPoints:[graph.entry],outfile:graph.outfile,bundle:true,platform:'browser',format:'esm',target:'es2022',minify:graph.method.minify,treeShaking:true,charset:'ascii',legalComments:'none',sourcemap:false,write:false,logLevel:'silent'});
    const bytes=result.outputFiles[0].contents,compressed=gzipSync(bytes,graph.method.gzip);
    assert.equal(digest(bytes),graph.sha256,'Independent graph reproduction '+name);assert.equal(digest(compressed),graph.gzipSha256,'Independent gzip reproduction '+name);
    graphs.push({name,inputCount:inputs.length,sha256:digest(bytes),gzipSha256:digest(compressed),minifiedBytes:bytes.length,gzipBytes:compressed.length});
  }
  run.artifactAudit={status:'Pass',tarball:artifact.package.sha256,corpus:{hash,records:corpus.records.length,sources},graphs};
}
if(args.includes('--require-current'))assert.ok(run.packageMatchesCurrent,'Installed distribution and package.json must agree with current built workspace');
if (platform() === 'darwin') run.environment.os.product = (await exec('/usr/bin/sw_vers', [])).stdout.trim();
run.environment.playwright = JSON.parse(await readFile(join(repo, 'node_modules/playwright-core/package.json'))).version;
await save();

const common = `
import { createRaveldex } from '@vmitsaras/raveldex';
import * as snapshots from '@vmitsaras/raveldex/adapters/snapshots';
import * as persistence from '@vmitsaras/raveldex/adapters/indexeddb';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';
import { createMatchEvidence } from '@vmitsaras/raveldex/addons/evidence';
export const records = [
 {id:'a', text:{title:'alpha beta',body:['λ red—blue','𐐀 green']},metadata:{category:'Guide'}},
 {id:'b', text:{title:['alpha','beta'],body:'blue red'},metadata:{category:'Other'}},
 {id:'empty',text:{title:'!!!'},metadata:{category:'Guide'}}
];
export function addons(){return [createSourceProvider({fields:['title','body']}),createPositionProvider({fields:['body'],offsets:['body']}),createPhrases({fields:{title:'source',body:'positions'}}),createFacets({fields:['category']}),createInspector({sourceFields:['title','body']}),createMatchEvidence({fields:{title:'source',body:'offsets'}})];}
export function configuration(){return {schema:{text:{title:{},body:{}},metadata:{category:{type:'string'}}},addons:addons()};}
export function expect(value,message){if(!value)throw Error(message);}
export function equal(actual,expected,message){const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';expect(canonical(actual)===canonical(expected),message+': '+JSON.stringify(actual)+' !== '+JSON.stringify(expected));}
export async function rejected(promise,code){try{await promise;throw Error('Expected rejection '+code);}catch(error){expect(error.code===code,'Expected '+code+', observed '+error.name+': '+error.code);return {name:error.name,code:error.code,reason:error.reason,details:error.details};}}
export async function rows(databaseName){const request=indexedDB.open(databaseName);const db=await new Promise((yes,no)=>{request.onsuccess=()=>yes(request.result);request.onerror=()=>no(request.error);});try{const tx=db.transaction([...db.objectStoreNames],'readonly');const result={};const done=new Promise((yes,no)=>{tx.oncomplete=yes;tx.onabort=()=>no(tx.error);});await Promise.all([...db.objectStoreNames].map(async name=>{const store=tx.objectStore(name),values=store.getAll(),keys=store.getAllKeys();result[name]=await new Promise((yes,no)=>{let count=0;const complete=()=>{if(++count===2)yes({keys:keys.result,values:values.result});};values.onsuccess=complete;keys.onsuccess=complete;values.onerror=()=>no(values.error);keys.onerror=()=>no(keys.error);});}));await done;return result;}finally{db.close();}}
export async function change(databaseName,body){const request=indexedDB.open(databaseName);const db=await new Promise((yes,no)=>{request.onsuccess=()=>yes(request.result);request.onerror=()=>no(request.error);});try{const tx=db.transaction([...db.objectStoreNames],'readwrite');const done=new Promise((yes,no)=>{tx.oncomplete=yes;tx.onabort=()=>no(tx.error);});body(tx);await done;}finally{db.close();}}
export {createRaveldex,snapshots,persistence};
`;
await writeFile(join(directory, 'rx3003-review-common.mjs'), common);
await writeFile(join(directory, 'rx3003-review-entry.mjs'), `import * as runtime from './rx3003-review-common.mjs';\nimport * as worker from '@vmitsaras/raveldex/adapters/worker';\nimport * as workerSnapshots from '@vmitsaras/raveldex/adapters/worker/snapshots';\nwindow.reviewRuntime={...runtime,worker,workerSnapshots};\n`);
await writeFile(join(directory, 'rx3003-review-worker.mjs'), `import {serveSnapshotRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/snapshots/host';\nimport {addons} from './rx3003-review-common.mjs';\nserveSnapshotRaveldexWorker(self,{addons:addons()});\n`);
run.literalCorpus = { sha256: digest(Buffer.from(JSON.stringify([
  { id: 'a', text: { title: 'alpha beta', body: ['λ red—blue', '𐐀 green'] }, metadata: { category: 'Guide' } },
  { id: 'b', text: { title: ['alpha', 'beta'], body: 'blue red' }, metadata: { category: 'Other' } },
  { id: 'empty', text: { title: '!!!' }, metadata: { category: 'Guide' } },
]))), method: 'Explicit literal records and memberships/UTF-16 coordinates; no implementation tokenizer/scorer/oracle is used for expected values.' };
async function bundle(entry, output) {
  const settings = { absWorkingDir: directory, entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, charset: 'ascii', legalComments: 'none', metafile: true, outfile: join(directory, output), logLevel: 'silent' };
  const built = await build(settings), bytes = await readFile(join(directory, output));
  const inputs = await Promise.all(Object.entries(built.metafile.inputs).map(async ([path, value]) => ({ path, ...value, sha256: digest(await readFile(join(directory, path))) })));
  assert.ok(inputs.every(input => input.path.startsWith('rx3003-review-') || input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/')), 'all runtime inputs come from the installed package or explicit independent entry');
  assert.ok(inputs.every(input => input.imports.every(item => !item.external)), 'no foreign runtime dependency');
  return { entry, output, bytes: bytes.length, sha256: digest(bytes), inputs, settings: { ...settings, absWorkingDir: undefined } };
}
run.bundles = { browser: await bundle('rx3003-review-entry.mjs', 'rx3003-review-bundle.mjs'), worker: await bundle('rx3003-review-worker.mjs', 'rx3003-review-worker-bundle.mjs') };
const startup = await exec(process.execPath, ['--input-type=module', '--eval', `
 const reads=[];for(const name of ['window','document','navigator','fetch','Worker','SharedWorker','indexedDB','localStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','queueMicrotask','crypto']) Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});
 const storage=await import('@vmitsaras/raveldex/adapters/indexeddb');const snapshots=await import('@vmitsaras/raveldex/adapters/snapshots');const ordinaryHost=await import('@vmitsaras/raveldex/adapters/worker/host');const selectedHost=await import('@vmitsaras/raveldex/adapters/worker/snapshots/host');const workerBridge=await import('@vmitsaras/raveldex/adapters/worker/snapshots');
 if(reads.length)throw Error('Import touched host');if(Object.keys(ordinaryHost).join(',')!=='serveRaveldexWorker')throw Error('Ordinary worker host leaked private seam');console.log(JSON.stringify({reads,storageExports:Object.keys(storage).sort(),snapshotExports:Object.keys(snapshots).sort(),ordinaryHostExports:Object.keys(ordinaryHost).sort(),selectedHostExports:Object.keys(selectedHost).sort(),workerBridgeExports:Object.keys(workerBridge).sort()}));
`], { cwd: directory });
run.startup = JSON.parse(startup.stdout);
await save();
if(args.includes('--audit-only')) {
  const accepted=report.runs.slice(0,-1).findLast(candidate=>candidate.summary?.passed===11&&candidate.summary?.failed===0&&candidate.sourceStable===true&&candidate.packageMatchesCurrent===true);
  assert.ok(accepted,'Audit-only needs a previous accepted complete independent browser run');
  run.previousBehavioralQualification={startedAt:accepted.startedAt,package:accepted.packageArtifact?.package.sha256,summary:accepted.summary};
  run.sameProductionDistribution=JSON.stringify(accepted.package.distribution)===JSON.stringify(run.package.distribution);
  assert.ok(run.sameProductionDistribution,'Production distribution changed; fresh browser probes are required');
  run.sourceAfter=await filesAt(join(repo,'src'));run.sourceStable=JSON.stringify(run.sourceBefore)===JSON.stringify(run.sourceAfter);
  run.auditOnly=true;run.finishedAt=new Date().toISOString();run.summary={artifactAudit:run.artifactAudit?.status,behavioral:'Not rerun; exact production distribution matches accepted 11-probe qualification'};
  await save();assert.ok(run.sourceStable,'Source changed during artifact audit');process.exit(0);
}
let browser, server;
async function scenario(name, evaluate) {
  const context = await browser.newContext(), page = await context.newPage();
  page.on('pageerror', error => run.browserErrors.push({ scenario: name, error: String(error) }));
  try {
    await page.goto(run.origin); await page.waitForFunction(() => !!window.reviewRuntime);
    const evidence = await evaluate(page, context); run.records.push({ name, status: 'Pass', evidence });
  } catch (error) { run.records.push({ name, status: 'Fail', error: String(error), stack: error.stack }); }
  finally { await context.close(); await save(); }
}
try {
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = { '/bundle.mjs': 'rx3003-review-bundle.mjs', '/worker.mjs': 'rx3003-review-worker-bundle.mjs' }[path];
    if (path === '/') { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html lang="en"><title>Independent persistence review</title><script type="module" src="/bundle.mjs"></script></html>'); return; }
    if (!file) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(directory, file)));
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  run.origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  run.environment.browser = { channel: 'chrome', version: browser.version(), headless: true };
  await save();
  await scenario('Direct durable save and complete selected-addon atomic restore use the next local revision', page => page.evaluate(async () => {
    const R=window.reviewRuntime, donor=R.createRaveldex(R.configuration()), receiver=R.createRaveldex(R.configuration());
    const databaseName='review-direct', namespace='selected';
    const save=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(donor),{databaseName,namespace});
    const load=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(receiver),{databaseName,namespace});
    try{
      await donor.addMany(R.records);const before=await donor.search({kind:'all'});const serialized=await R.snapshots.createSnapshots(donor).exportSource();
      const missing=await load.load();R.equal(missing,{status:'missing',generation:null},'Missing is explicit');
      const saved=await save.save({expectedGeneration:null});R.expect(saved.durable===true&&saved.format==='raveldex-source','Save establishes durable source completion');
      R.equal((await donor.search({kind:'all'})).revision,before.revision,'Save cannot commit engine state');
      const persisted=await R.rows(databaseName);R.equal(Object.keys(persisted).sort(),['metadata','snapshots'],'Exact adapter-owned stores');
      R.equal(persisted.metadata.keys,[namespace],'Exactly selected namespace metadata');R.equal(persisted.snapshots.keys,[namespace],'Exactly selected namespace snapshot');
      R.equal(persisted.snapshots.values[0].encoded,serialized,'Durable bytes are the serialized owner root');
      R.equal(persisted.metadata.values[0].generation,saved.generation,'Metadata and result generation agree');
      R.equal(persisted.metadata.values[0].encodedBytes,new TextEncoder().encode(serialized).length,'Exact encoded UTF-8 envelope bytes');
      await receiver.add({id:'sentinel',text:{title:'old private state'}});const restored=await load.load();
      R.equal(restored.status,'restored','Load reports actual restoration');R.equal(restored.generation,saved.generation,'Load selects saved generation');
      R.equal(restored.restore.revision,2,'Next receiving revision');R.equal(restored.restore.originRevision,1,'Origin remains metadata');R.equal(restored.restore.reindexed,true,'Browser source rebuild explicit');
      const all=await receiver.search({kind:'all'},{limit:10});R.equal(all.hits.map(hit=>hit.id),['a','b','empty'],'Complete restored membership');R.equal(all.revision,2,'One published root revision');
      const phrase=await receiver.search({kind:'extension',capability:'phrases',version:1,payload:{text:'alpha beta',fields:['title']}});R.equal(phrase.hits.map(hit=>hit.id),['a'],'Phrase cannot cross original values');
      const evidence=await receiver.search('green',{extensions:{'match-evidence':{ids:['a','sentinel']}}});
      const inspected=await receiver.search('green',{extensions:{inspector:{ids:['a'],sourceFields:['title','body']}}});
      R.equal(evidence.total,1,'Exact green total');R.equal(evidence.extensions['match-evidence'].documents[0].ranges,[{field:'body',valueIndex:1,position:1,start:3,end:8,term:'green'}],'Original astral UTF-16 offset restored');
      R.equal(inspected.extensions.inspector.documents[0].source.fields.body.values,['λ red—blue','𐐀 green'],'Complete original source restored');
      R.equal(evidence.extensions['match-evidence'].revision,2,'Positions and core agree');R.equal(inspected.extensions.inspector.revision,2,'Source and core agree');
      return {saved,restored,all,phrase,evidence,inspected,stores:persisted};
    }finally{await save.dispose();await load.dispose();await donor.dispose();await receiver.dispose();}
  }));
  await scenario('Independent simultaneous clients conflict, namespace erase removes all records, stale recreate token rejects', async (page,context) => {
    const other=await context.newPage();await other.goto(run.origin);await other.waitForFunction(()=>!!window.reviewRuntime);
    const setup=tab=>tab.evaluate(async()=>{const R=window.reviewRuntime;window.reviewEngine=R.createRaveldex(R.configuration());await window.reviewEngine.addMany(R.records);window.reviewStore=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(window.reviewEngine),{databaseName:'review-conflict',namespace:'shared'});});
    await setup(page);await setup(other);
    const first=await page.evaluate(()=>window.reviewStore.save({expectedGeneration:null}));
    const conflict=await other.evaluate(()=>window.reviewRuntime.rejected(window.reviewStore.save({expectedGeneration:null}),'GENERATION_CONFLICT'));
    const selected=await other.evaluate(()=>window.reviewStore.load());assert.equal(selected.generation,first.generation);
    const second=await page.evaluate(async generation=>{await window.reviewEngine.replace({id:'a',text:{title:'changed gamma',body:'changed body'},metadata:{category:'Changed'}});return window.reviewStore.save({expectedGeneration:generation});},first.generation);
    const stale=await other.evaluate(generation=>window.reviewRuntime.rejected(window.reviewStore.erase({expectedGeneration:generation}),'GENERATION_CONFLICT'),first.generation);
    const isolation=await page.evaluate(async generation=>{const R=window.reviewRuntime;const independent=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(window.reviewEngine),{databaseName:'review-conflict',namespace:'other'});try{const kept=await independent.save({expectedGeneration:null});const erased=await window.reviewStore.erase({expectedGeneration:generation});const after=await R.rows('review-conflict');R.equal(after.metadata.keys,['other'],'All selected metadata removed');R.equal(after.snapshots.keys,['other'],'All selected source/side envelope removed');R.expect(Object.values(after).every(store=>store.values.every(row=>row.namespace!=='shared')),'No selected namespace artifact or tombstone');const repeated=await window.reviewStore.erase({expectedGeneration:null});R.equal(repeated.erased,false,'Missing erasure is idempotent');const memory=await window.reviewEngine.search('gamma');R.equal(memory.total,1,'Erasure leaves borrowed memory intact');const recreated=await window.reviewStore.save({expectedGeneration:null});R.expect(recreated.generation!==generation,'New generation cannot reuse erased token');return {kept,erased,repeated,recreated,after,memory};}finally{await independent.dispose();}},second.generation);
    const recreateConflict=await other.evaluate(generation=>window.reviewRuntime.rejected(window.reviewStore.save({expectedGeneration:generation}),'GENERATION_CONFLICT'),second.generation);
    for(const tab of [page,other])await tab.evaluate(async()=>{await window.reviewStore.dispose();await window.reviewEngine.dispose();});
    return {first,second,conflict,selected,stale,isolation,recreateConflict};
  });
  await scenario('Injected quota and request-success-then-transaction-abort preserve exact durable generation and engine state', page=>page.evaluate(async()=>{
    const R=window.reviewRuntime,engine=R.createRaveldex(R.configuration());await engine.addMany(R.records);
    const store=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(engine),{databaseName:'review-fault',namespace:'main'});
    try{const saved=await store.save({expectedGeneration:null}),before=await R.rows('review-fault');await engine.replace({id:'a',text:{title:'later green'},metadata:{category:'Later'}});const engineBefore=await engine.search({kind:'all'});
      const original=IDBObjectStore.prototype.put;let quota,abort,requestSucceeded=false;
      try{IDBObjectStore.prototype.put=function(...args){if(this.name==='snapshots')throw new DOMException('Injected quota','QuotaExceededError');return original.apply(this,args);};quota=await R.rejected(store.save({expectedGeneration:saved.generation}),'QUOTA_EXCEEDED');}finally{IDBObjectStore.prototype.put=original;}
      R.equal(await R.rows('review-fault'),before,'Quota preserves all durable rows');R.equal(await engine.search({kind:'all'}),engineBefore,'Quota cannot roll back committed engine mutation');
      try{IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);if(this.name==='snapshots')request.addEventListener('success',()=>{requestSucceeded=true;this.transaction.abort();});return request;};abort=await R.rejected(store.save({expectedGeneration:saved.generation}),'TRANSACTION_FAILED');}finally{IDBObjectStore.prototype.put=original;}
      R.expect(requestSucceeded,'Injected abort follows actual successful snapshot request');R.equal(await R.rows('review-fault'),before,'Request success is not durable transaction completion');R.equal(await engine.search({kind:'all'}),engineBefore,'Transaction abort keeps committed memory distinct');
      const recovery=await store.save({expectedGeneration:saved.generation});R.expect(recovery.generation!==saved.generation,'Explicit retry after known aborted transaction produces one new generation');return {quota,abort,requestSucceeded,recovery,engineBefore,durableBefore:before};
    }finally{await store.dispose();await engine.dispose();}
  }));
  await scenario('Corrupted snapshots and orphan metadata fail atomic load yet selected erasure remains recovery',page=>page.evaluate(async()=>{
    const R=window.reviewRuntime,donor=R.createRaveldex(R.configuration()),receiver=R.createRaveldex(R.configuration());await donor.addMany(R.records);await receiver.add({id:'sentinel',text:{title:'old private'}});
    const save=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(donor),{databaseName:'review-corrupt',namespace:'main'}),load=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(receiver),{databaseName:'review-corrupt',namespace:'main'});
    try{const saved=await save.save({expectedGeneration:null}),before=await receiver.search({kind:'all'}),durable=await R.rows('review-corrupt'),snapshot=durable.snapshots.values[0];
      await R.change('review-corrupt',tx=>tx.objectStore('metadata').put({...durable.metadata.values[0],format:'raveldex-native'}));const metadataMismatch=await R.rejected(load.load(),'CORRUPT_DATA');R.equal(await receiver.search({kind:'all'}),before,'Metadata format failure preserves old complete root');await R.change('review-corrupt',tx=>tx.objectStore('metadata').put(durable.metadata.values[0]));
      snapshot.encoded=snapshot.encoded.replace('alpha beta','omega beta');await R.change('review-corrupt',tx=>tx.objectStore('snapshots').put(snapshot));const corrupted=await R.rejected(load.load(),'CORRUPT_DATA');R.equal(await receiver.search({kind:'all'}),before,'Integrity failure preserves exact old complete result');
      const erased=await save.erase({expectedGeneration:saved.generation});const empty=await R.rows('review-corrupt');R.equal(empty.snapshots.values,[],'Corrupt source erased');R.equal(empty.metadata.values,[],'Corrupt source metadata erased');
      const again=await save.save({expectedGeneration:null});await R.change('review-corrupt',tx=>tx.objectStore('snapshots').delete('main'));const orphan=await R.rejected(load.load(),'CORRUPT_DATA');R.equal(await receiver.search({kind:'all'}),before,'Orphan load preserves memory');const orphanErased=await save.erase({expectedGeneration:again.generation});R.equal((await R.rows('review-corrupt')).metadata.values,[],'Orphan metadata fully erased');return {metadataMismatch,corrupted,erased,orphan,orphanErased,before,empty};
    }finally{await save.dispose();await load.dispose();await donor.dispose();await receiver.dispose();}
  }));
  await scenario('Unavailable storage, future schema and canceled late open settle with explicit errors and release connections',page=>page.evaluate(async()=>{
    const R=window.reviewRuntime,engine=R.createRaveldex(R.configuration());await engine.addMany(R.records);const snapshots=R.snapshots.createSnapshots(engine);
    const unavailable=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-unavailable',namespace:'main',indexedDB:{open(){throw new DOMException('Denied','SecurityError');}}});
    const denied=await R.rejected(unavailable.load(),'UNAVAILABLE');await unavailable.dispose();
    const futureRequest=indexedDB.open('review-future',2);const future=await new Promise((yes,no)=>{futureRequest.onsuccess=()=>yes(futureRequest.result);futureRequest.onerror=()=>no(futureRequest.error);});future.close();
    const incompatible=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-future',namespace:'main'});const futureError=await R.rejected(incompatible.load(),'INCOMPATIBLE_DATABASE');await incompatible.dispose();
    const seed=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-late',namespace:'main'});const saved=await seed.save({expectedGeneration:null});await seed.dispose();
    let lateCloses=0;const factory={open(...args){const native=indexedDB.open(...args);let success;const result={get result(){return native.result;},get error(){return native.error;},get transaction(){return native.transaction;}};for(const name of ['onerror','onblocked','onupgradeneeded'])Object.defineProperty(result,name,{get(){return native[name];},set(value){native[name]=value;}});Object.defineProperty(result,'onsuccess',{get(){return success;},set(value){success=value;}});native.onsuccess=event=>{const db=native.result,close=db.close.bind(db);db.close=()=>{lateCloses++;close();};setTimeout(()=>success?.(event),80);};return result;}};
    const delayed=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-late',namespace:'main',indexedDB:factory,openTimeoutMs:15,operationTimeoutMs:100});const timeout=await R.rejected(delayed.load(),'TIMEOUT');await delayed.dispose();await new Promise(yes=>setTimeout(yes,100));R.equal(lateCloses,1,'Late successful open closes exactly once');
    const reopen=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-late',namespace:'main'});const restored=await reopen.load();R.equal(restored.generation,saved.generation,'Late timeout does not lose durable state');await reopen.dispose();await engine.dispose();return {denied,futureError,timeout,lateCloses,restored};
  }));
  await scenario('Actual direct postcommit stop preserves restore success; an unobserved foreign restore settles unknown and dispose releases admission',page=>page.evaluate(async()=>{
    const R=window.reviewRuntime,donor=R.createRaveldex(R.configuration()),receiver=R.createRaveldex(R.configuration());await donor.addMany(R.records);await receiver.add({id:'sentinel',text:{title:'old'}});
    const donorSnapshots=R.snapshots.createSnapshots(donor),real=R.snapshots.createSnapshots(receiver),controller=new AbortController();
    const save=R.persistence.createIndexedDBPersistence(donorSnapshots,{databaseName:'review-late-stop',namespace:'main'});
    const wrapped={exportSource:real.exportSource,restore(encoded,options){const promise=real.restore(encoded,options);promise.then(()=>controller.abort());return promise;}};
    const load=R.persistence.createIndexedDBPersistence(wrapped,{databaseName:'review-late-stop',namespace:'main'});
    try{await save.save({expectedGeneration:null});const restored=await load.load({signal:controller.signal});R.expect(controller.signal.aborted,'Stop actually follows native owner commit');R.equal(restored.restore.revision,2,'Late stop cannot revoke known committed success');R.equal((await receiver.search({kind:'all'})).hits.map(hit=>hit.id),['a','b','empty'],'Committed complete state remains visible');
      const ignored=R.persistence.createIndexedDBPersistence({exportSource:donorSnapshots.exportSource,restore(){return new Promise(()=>{});}},{databaseName:'review-late-stop',namespace:'main',operationTimeoutMs:15});const unknown=await R.rejected(ignored.load(),'OUTCOME_UNKNOWN');await ignored.dispose();const rejected=await R.rejected(ignored.load(),'DISPOSED');return {restored,unknown,rejected};
    }finally{await load.dispose();await save.dispose();await receiver.dispose();await donor.dispose();}
  }));
  await scenario('Actual worker restoration, same-result-event abort, lost reply reconciliation and receipt domains preserve commit truth',page=>page.evaluate(async()=>{
    const R=window.reviewRuntime,donor=R.createRaveldex(R.configuration());await donor.addMany(R.records);const direct=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(donor),{databaseName:'review-worker',namespace:'main'});const saved=await direct.save({expectedGeneration:null});
    const native=new Worker('/worker.mjs',{type:'module'}),listeners=new Map(),counts={restorePosts:0,dropped:0,terminations:0,actualRestoreReplies:0};let drop=false,afterReply;
    const endpoint={postMessage(message){if(message.operation==='snapshotRestore')counts.restorePosts++;native.postMessage(message);},addEventListener(type,listener){const wrapped=event=>{if(type==='message'&&event.data?.operation==='snapshotRestore'){counts.actualRestoreReplies++;if(drop){counts.dropped++;return;}}listener(event);if(type==='message')afterReply?.(event.data);};listeners.set(listener,{type,wrapped});native.addEventListener(type,wrapped);},removeEventListener(type,listener){const selected=listeners.get(listener);if(selected){native.removeEventListener(type,selected.wrapped);listeners.delete(listener);}},terminate(){counts.terminations++;native.terminate();}};
    const engine=await R.worker.createWorkerRaveldex({worker:endpoint,configuration:R.configuration(),ownership:'owned',sameHost:true,responseTimeoutMs:100});const bridge=R.workerSnapshots.createWorkerSnapshots(engine),load=R.persistence.createIndexedDBPersistence(bridge,{databaseName:'review-worker',namespace:'main',operationTimeoutMs:1000});
    try{await engine.add({id:'sentinel',text:{title:'old'}});const restored=await load.load();R.equal(restored.restore.revision,2,'Actual worker uses next owner revision');R.equal((await engine.search({kind:'all'})).hits.map(hit=>hit.id),['a','b','empty'],'Actual complete worker recovered state');
      const controller=new AbortController();afterReply=message=>{if(message?.operation==='snapshotRestore'&&message.kind==='result')controller.abort();};const late=await load.load({signal:controller.signal});afterReply=undefined;R.expect(controller.signal.aborted,'Abort happened in the native committed-result event');R.equal(late.restore.revision,3,'Known worker result wins event-level late stop');
      drop=true;const unknown=await R.rejected(load.load(),'OUTCOME_UNKNOWN');drop=false;R.expect(counts.dropped===1,'One actual authoritative restore reply dropped');R.equal(unknown.details.selectedGeneration,saved.generation,'Unknown restore still identifies the selected durable generation');const receipt=await bridge.reconcile(unknown.details.operationId);R.equal(receipt.status,'committed','Source restore receipt is conclusive');R.equal(receipt.result.revision,4,'Exactly one lost-response restore commit');const ordinary=await R.rejected(engine.reconcile(unknown.details.operationId),'INVALID_TRANSPORT');R.equal((await engine.search({kind:'all'})).revision,4,'Authoritative recovered root remains usable');R.equal(counts.restorePosts,3,'No automatic retry of unknown restoration');
      await load.dispose();await engine.destroy();R.equal(listeners.size,0,'All endpoint listeners released');R.equal(counts.terminations,1,'Owned actual worker terminated once');const durable=await R.rows('review-worker');R.equal(durable.metadata.values[0].generation,saved.generation,'Recovery does not mutate durable generation');return {restored,late,unknown,receipt,ordinary,counts,remainingListeners:listeners.size};
    }finally{await load.dispose();await engine.destroy();await direct.dispose();await donor.dispose();}
  }));
  await scenario('Real versionchange closes cached connection; actual blocked forced upgrade later aborts and releases its request',page=>page.evaluate(async()=>{
    const R=window.reviewRuntime,engine=R.createRaveldex(R.configuration());await engine.addMany(R.records);const snapshots=R.snapshots.createSnapshots(engine),store=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-versionchange',namespace:'main'});
    try{await store.save({expectedGeneration:null});const upgrade=indexedDB.open('review-versionchange',2),events=[];upgrade.onblocked=()=>events.push('blocked');const upgraded=await new Promise((yes,no)=>{upgrade.onsuccess=()=>yes(upgrade.result);upgrade.onerror=()=>no(upgrade.error);});R.equal(events,[],'Adapter closes cached connection for real versionchange');upgraded.close();const changed=await R.rejected(store.load(),'INCOMPATIBLE_DATABASE');
      const seed=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-blocked',namespace:'main'});await seed.save({expectedGeneration:null});await seed.dispose();const heldRequest=indexedDB.open('review-blocked',1);const held=await new Promise((yes,no)=>{heldRequest.onsuccess=()=>yes(heldRequest.result);heldRequest.onerror=()=>no(heldRequest.error);});
      let request;const observed=[];const factory={open(databaseName){request=indexedDB.open(databaseName,2);request.addEventListener('blocked',()=>observed.push('actual-blocked'));request.addEventListener('upgradeneeded',()=>observed.push('actual-late-upgrade'));request.addEventListener('error',()=>observed.push(request.error.name));return request;}};
      const blockedStore=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-blocked',namespace:'main',indexedDB:factory,openTimeoutMs:100});const blocked=await R.rejected(blockedStore.load(),'BLOCKED');held.close();await new Promise(yes=>setTimeout(yes,25));await blockedStore.dispose();R.equal(observed,['actual-blocked','actual-late-upgrade','AbortError'],'Abandoned real upgrade transaction aborts after blocked failure');
      const reopen=indexedDB.open('review-blocked',2);let reblocked=false;reopen.onblocked=()=>{reblocked=true;};const healthy=await new Promise((yes,no)=>{reopen.onsuccess=()=>yes(reopen.result);reopen.onerror=()=>no(reopen.error);});R.equal(reblocked,false,'No abandoned connection can block next actual upgrade');healthy.close();return {changed,blocked,observed,reblocked,method:'Injected factory changes requested version from adapter1 to native2 against held real1; all blocked/upgrade/error events are actual browser events.'};
    }finally{await store.dispose();await engine.dispose();}
  }));
  await scenario('Admission queue deadlines and canceled exports settle boundedly; browser native qualification stays unsupported',page=>page.evaluate(async()=>{
    const R=window.reviewRuntime;let opens=0,exports=0;
    const ignored=R.persistence.createIndexedDBPersistence({exportSource(){exports++;return new Promise(()=>{});},restore(){return Promise.reject(Error('Unused'));}},{databaseName:'review-queue',namespace:'main',operationTimeoutMs:15,indexedDB:{open(){opens++;throw Error('No storage action expected');}}});
    const outcome=promise=>promise.then(value=>({value}),error=>({code:error.code}));const queued=[outcome(ignored.save({expectedGeneration:null,deadlineMs:15})),...Array.from({length:63},()=>outcome(ignored.save({expectedGeneration:null,deadlineMs:1})))];const overflow=await R.rejected(ignored.save({expectedGeneration:null}),'QUEUE_FULL');const results=await Promise.all(queued);R.expect(results.every(result=>result.code==='TIMEOUT'),'Queue time is part of each deadline');R.equal(opens,0,'Timed out serialization cannot open storage');await ignored.dispose();R.equal(exports,1,'Expired queued work cannot begin serialization');
    const engine=R.createRaveldex(R.configuration());await engine.addMany(R.records);const native=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(engine),{databaseName:'review-native-gate',namespace:'main',format:'native'});
    try{const unqualified=await R.rejected(native.save({expectedGeneration:null}),'INCOMPATIBLE_CAPABILITY');R.equal(unqualified.reason,'UNQUALIFIED_PROFILE','Browser owner is not silently qualified');R.expect(!(await indexedDB.databases()).some(db=>db.name==='review-native-gate'),'Failed native serialization cannot create storage');return {overflow,results,exports,opens,unqualified};}finally{await native.dispose();await engine.dispose();}
  }));
  await scenario('Load returns its readonly-selected generation when a later concurrent save advances the durable head',page=>page.evaluate(async()=>{
    const R=window.reviewRuntime,donor=R.createRaveldex(R.configuration()),receiver=R.createRaveldex(R.configuration());await donor.addMany(R.records);await receiver.add({id:'sentinel',text:{title:'old'}});const real=R.snapshots.createSnapshots(receiver),save=R.persistence.createIndexedDBPersistence(R.snapshots.createSnapshots(donor),{databaseName:'review-selected',namespace:'main'});
    let ready,release;const selected=new Promise(yes=>{ready=yes;}),gate=new Promise(yes=>{release=yes;});const load=R.persistence.createIndexedDBPersistence({exportSource:real.exportSource,restore(encoded,options){ready();return gate.then(()=>real.restore(encoded,options));}},{databaseName:'review-selected',namespace:'main'});
    try{const first=await save.save({expectedGeneration:null}),loading=load.load();await selected;await donor.replace({id:'a',text:{title:'new gamma'},metadata:{category:'New'}});const later=await save.save({expectedGeneration:first.generation});release();const restored=await loading;R.equal(restored.generation,first.generation,'Load identifies selected generation, not a lease on current head');R.equal((await receiver.search('green')).total,1,'Receiver restores exactly selected older envelope');R.equal((await receiver.search('gamma')).total,0,'Later durable save is not blended into selected recovery');R.equal((await R.rows('review-selected')).metadata.values[0].generation,later.generation,'Durable head advanced independently');const conflict=await R.rejected(load.save({expectedGeneration:restored.generation}),'GENERATION_CONFLICT');R.equal(conflict.details.actualGeneration,later.generation,'Stale selected token cannot overwrite newer durable head');return {first,later,restored,conflict};
    }finally{release();await load.dispose();await save.dispose();await donor.dispose();await receiver.dispose();}
  }));
  await scenario('Storage byte validation yields after actual serialization and cancels before any database action',page=>page.evaluate(async()=>{
    const R=window.reviewRuntime,engine=R.createRaveldex(R.configuration());await engine.add({id:'large',text:{title:'word '.repeat(8000)},metadata:{category:'Large'}});const real=R.snapshots.createSnapshots(engine),controller=new AbortController();let serializedBytes=0,opens=0;
    const snapshots={exportSource(options){return real.exportSource(options).then(encoded=>{serializedBytes=new TextEncoder().encode(encoded).length;setTimeout(()=>controller.abort(),0);return encoded;});},restore:real.restore};const store=R.persistence.createIndexedDBPersistence(snapshots,{databaseName:'review-byte-scan',namespace:'main',operationTimeoutMs:10000,indexedDB:{open(){opens++;throw Error('Storage must not begin after cancelled byte scan');}}});
    try{const cancelled=await R.rejected(store.save({expectedGeneration:null,signal:controller.signal}),'CANCELLED');R.expect(serializedBytes>32768,'Actual valid snapshot exceeds one byte-scan task');R.equal(opens,0,'Timer abort during adapter byte scan precedes database access');R.equal((await engine.search('word')).total,1,'The borrowed engine remains complete and usable');return {cancelled,serializedBytes,opens,scope:'Observed adapter host-task opportunity, not a physical latency or heap bound.'};}finally{await store.dispose();await engine.dispose();}
  }));
} catch(error) {
  run.executionFailure={classification:'harness or environment setup failure',error:String(error),stack:error.stack};throw error;
} finally {
  await browser?.close(); if (server?.listening) await new Promise((yes, no) => server.close(error => error ? no(error) : yes()));
  run.sourceAfter = await filesAt(join(repo, 'src'));
  run.sourceStable = JSON.stringify(run.sourceBefore) === JSON.stringify(run.sourceAfter);
  run.finishedAt = new Date().toISOString(); run.summary = { passed: run.records.filter(item => item.status === 'Pass').length, failed: run.records.filter(item => item.status === 'Fail').length };
  await save();
}
assert.ok(run.sourceStable, 'source changed during independent execution; capture a new coherent candidate');
assert.ok(run.records.length > 0, 'no browser scenarios have run');
assert.equal(run.summary.failed, 0, 'independent browser observations failed; raw failures are preserved');
