// Actual installed/bundled Chrome direct and real module-worker restore diagnosis.
// No production package edits, builds, installs, external requests or cap changes.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, copyFile, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { inventory, digest } from './run.mjs';
import { schema, workloadFor, verifyFrozen } from './workloads.mjs';
import { instrumentRestorePackage, createRestoreDiagnostic } from './restore-instrument.mjs';
import { createBulkVerifier } from './bulk-verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const BROWSER_RESTORE_VARIANTS = Object.freeze(['source', 'positions-offsets']);
export const BROWSER_RESTORE_MODES = Object.freeze(['normal', 'diagnostic']);
export const BROWSER_RESTORE_EXECUTIONS = Object.freeze(['direct', 'worker']);
const browserOperationRows = row => row.mode === 'normal' ? row.case.samples : row.case.observations;
function snapshotIdentity(operation) {
  const value = operation.result;
  assert.ok(value && Number.isSafeInteger(value.encodedBytes) && value.encodedBytes > 0, 'missing successful snapshot bytes');
  assert.ok(Number.isSafeInteger(value.encodedCodeUnits) && value.encodedCodeUnits > 0, 'missing successful snapshot code units');
  assert.match(value.encodedSha256 ?? '', /^[a-f0-9]{64}$/, 'missing successful snapshot digest');
  assert.ok(value.header && Number.isSafeInteger(value.header.originRevision), 'missing successful snapshot header');
  return { encodedBytes: value.encodedBytes, encodedCodeUnits: value.encodedCodeUnits, encodedSha256: value.encodedSha256, header: value.header };
}
function normalizedQueryObservations(observations, revision) {
  assert.ok(Array.isArray(observations), 'missing query observations');
  assert.deepEqual(observations.map(item => item.id), ['all', 'common', 'rare', 'narrow-prefix', 'source-phrase'], 'missing/reordered query observation');
  return observations.map(item => {
    assert.ok(['Pass', 'Refused'].includes(item.outcome), 'unexpected inspection query outcome');
    if (item.outcome === 'Refused') { assert.ok(item.error?.code || item.error?.reason, 'missing inspection refusal'); return item; }
    assert.ok(item.result && Number.isSafeInteger(item.result.revision), 'missing successful query result');
    assert.equal(item.result.revision, revision, 'query revision does not match its owner');
    return { ...item, result: { ...item.result, revision: 0 } };
  });
}
function compareQueryObservations(reference, observed, context, parity, transitions) {
  assert.equal(observed.length, reference.length, 'query observation coverage drift');
  for (let index = 0; index < reference.length; index++) {
    const a = reference[index], b = observed[index]; assert.equal(b.id, a.id, 'query identity drift');
    if (a.outcome === 'Pass' && b.outcome === 'Pass') { assert.deepEqual(b, a, 'numerical query result drift'); parity.push({ ...context, query: a.id, relation: 'equal-result' }); }
    else if (JSON.stringify(a) === JSON.stringify(b)) parity.push({ ...context, query: a.id, relation: 'equal-refusal' });
    else transitions.push({ ...context, query: a.id, reference: a, observed: b, relation: 'inspection-outcome-or-error-transition' });
  }
}
/** Compare actual data, not timing or phase-dependent refusal location. A
 * successful exported snapshot must be identical across matching profiles;
 * every successful restore retains its own receipt/revision checks and full
 * numerical pages. Known outcome differences stay explicit for adjudication. */
export function validateBrowserRestoreParity(rows, sizes, variants = BROWSER_RESTORE_VARIANTS) {
  const parity = [], transitions = [];
  for (const size of sizes) for (const variant of variants) {
    const selected = rows.filter(row => row.size === size && row.variant === variant);
    const reference = selected.find(row => row.mode === 'normal' && row.execution === 'direct'); assert.ok(reference);
    const referenceBuild = browserOperationRows(reference).find(item => item.operation === 'build');
    assert.equal(referenceBuild.outcome, 'Pass', 'admitted donor build required');
    assert.equal(referenceBuild.result?.revision, Math.ceil(size / 256), 'donor build revision/batch drift');
    const referenceDonor = normalizedQueryObservations(reference.case.donorResults, referenceBuild.result?.revision);
    let successfulSnapshot, successfulReceipt, successfulQueries, preservedPrior;
    for (const row of selected) {
      const context = { size, variant, mode: row.mode, execution: row.execution }, operations = browserOperationRows(row);
      const built = operations.find(item => item.operation === 'build'); assert.equal(built.outcome, 'Pass', 'admitted donor build required');
      assert.deepEqual(built.result, referenceBuild.result, 'donor build receipt drift');
      const donor = normalizedQueryObservations(row.case.donorResults, built.result?.revision);
      if (row !== reference) compareQueryObservations(referenceDonor, donor, { ...context, stage: 'donor' }, parity, transitions);
      const exported = operations.find(item => item.operation === 'exportSource');
      if (exported.outcome === 'Pass') {
        const identity = snapshotIdentity(exported); assert.equal(identity.header.originRevision, built.result.revision, 'snapshot origin does not match donor');
        if (successfulSnapshot) { assert.deepEqual(identity, successfulSnapshot, 'snapshot byte/hash/header drift'); parity.push({ ...context, stage: 'exportSource', relation: 'equal-snapshot-identity' }); }
        else successfulSnapshot = identity;
      }
      for (const operation of operations.filter(item => ['exportSource','restoreSource','deadlineRestore','abortedRestore'].includes(item.operation))) {
        const old = browserOperationRows(reference).find(item => item.operation === operation.operation);
        const errorIdentity = item => ({ outcome: item.outcome, ...(item.error ? { error: item.error } : {}), ...(item.reason ? { reason: item.reason } : {}) });
        if (row !== reference && JSON.stringify(errorIdentity(old)) !== JSON.stringify(errorIdentity(operation))) transitions.push({ ...context, operation: operation.operation, relation: 'operation-outcome-or-error-transition', reference: errorIdentity(old), observed: errorIdentity(operation) });
        if (operation.operation === 'exportSource' || operation.outcome === 'Not run' || operation.outcome === 'Unknown') continue;
        assert.ok(Number.isSafeInteger(operation.priorRevision) && operation.priorRevision >= 0, 'missing prior revision');
        if (operation.outcome === 'Pass') {
          assert.equal(exported.outcome, 'Pass', 'restore success requires a real exported source snapshot');
          const receipt = operation.result; assert.ok(receipt, 'missing restore receipt');
          assert.equal(receipt.format, 'raveldex-source'); assert.equal(receipt.reindexed, true);
          assert.equal(receipt.originRevision, exported.result.header.originRevision, 'restore origin drift');
          assert.equal(receipt.revision, operation.priorRevision + 1, 'restore must publish exactly once'); assert.equal(operation.oldRemoved, true);
          assert.equal(operation.completeSource?.outcome, 'Pass', 'complete public receiving source required'); assert.equal(operation.completeSource.records, size);
          assert.equal(operation.completeMembership?.outcome, 'Pass', 'complete public receiving membership required'); assert.equal(operation.completeMembership.records, size);
          if (row.mode === 'diagnostic') { assert.equal(operation.completeState?.outcome, 'Pass', 'complete diagnostic core/sidecar equality required'); assert.match(operation.completeState.donor?.sha256 ?? '', /^[a-f0-9]{64}$/); assert.equal(operation.completeState.receiver?.sha256, operation.completeState.donor.sha256); }
          const queries = normalizedQueryObservations(operation.postcondition, receipt.revision);
          compareQueryObservations(donor, queries, { ...context, stage: operation.operation + ':donor' }, parity, transitions);
          const normalizedReceipt = { ...receipt, originRevision: 0, revision: 0 };
          if (successfulReceipt) { assert.deepEqual(normalizedReceipt, successfulReceipt, 'successful restore receipt drift'); compareQueryObservations(successfulQueries, queries, { ...context, stage: operation.operation + ':restored' }, parity, transitions); }
          else { successfulReceipt = normalizedReceipt; successfulQueries = queries; }
        } else {
          assert.ok(operation.postcondition && typeof operation.postcondition === 'object', 'missing preserved prior queries');
          const prior = Object.fromEntries(['all','lexical','phrase'].map(key => { const result = operation.postcondition[key]; assert.ok(result, 'missing preserved prior query'); assert.equal(result.revision, operation.priorRevision); return [key, { ...result, revision: 0 }]; }));
          if (preservedPrior) assert.deepEqual(prior, preservedPrior, 'preserved prior numerical query drift'); else preservedPrior = prior;
        }
      }
    }
  }
  return { parity, transitions };
}
export function validateBrowserRestoreRows(rows, sizes, variants = BROWSER_RESTORE_VARIANTS) {
  assert.equal(rows.length, sizes.length * variants.length * BROWSER_RESTORE_MODES.length * BROWSER_RESTORE_EXECUTIONS.length, 'missing browser restore configuration');
  const keys = new Set();
  for (const size of sizes) for (const variant of variants) for (const mode of BROWSER_RESTORE_MODES) for (const execution of BROWSER_RESTORE_EXECUTIONS) {
    const selected = rows.filter(row => row.size === size && row.variant === variant && row.mode === mode && row.execution === execution);
    assert.equal(selected.length, 1, 'missing/duplicate browser restore owner');
    const row = selected[0], key = JSON.stringify([size, variant, mode, execution]); assert.ok(!keys.has(key)); keys.add(key);
    assert.equal(row.case.outcome, 'Collected', 'unfinished browser restore diagnosis');
    assert.deepEqual(row.pageErrors, [], 'browser page error'); assert.deepEqual(row.externalRequests, [], 'external browser request');
    const operations = mode === 'normal' ? row.case.samples : row.case.observations;
    assert.equal((mode === 'normal' ? row.case.observations : row.case.samples).length, 0, 'mixed normal and diagnostic work');
    assert.deepEqual(operations.map(item => item.operation), ['build', 'exportSource', 'restoreSource', 'deadlineRestore', 'abortedRestore']);
    for (const operation of operations) {
      assert.ok(['Pass', 'Refused', 'Cancelled', 'Unknown', 'Not run'].includes(operation.outcome), 'unexpected restore outcome');
      if (operation.outcome === 'Not run') { assert.ok(operation.reason); assert.notEqual(operation.operation, 'build'); continue; }
      assert.ok(Number.isFinite(operation.wallMs) && operation.wallMs >= 0, 'invalid wall time');
      assert.equal(operation.cpuUserMs, undefined, 'browser CPU must not be fabricated');
      assert.equal(operation.cpuSystemMs, undefined, 'browser CPU must not be fabricated');
      assert.equal(Boolean(operation.counters), mode === 'diagnostic', 'diagnostic scope mismatch');
      if (operation.outcome !== 'Pass') assert.ok(operation.error?.code || operation.error?.reason, 'typed refusal/cancel/unknown required');
      if (operation.outcome === 'Refused' || operation.outcome === 'Cancelled') {
        if (['restoreSource', 'deadlineRestore', 'abortedRestore'].includes(operation.operation)) {
          assert.equal(operation.oldQueriesPreserved, true); assert.equal(operation.oldSourceBytesPreserved, true);
        }
      }
      if (operation.outcome === 'Unknown') assert.ok(operation.stateClaim?.includes('Unknown') || operation.operation === 'exportSource', 'unknown must not claim authoritative old state');
    }
  }
  return { configurations: rows.length, ...validateBrowserRestoreParity(rows, sizes, variants), method: 'Complete pinned configurations and actual data parity; Collected means observation coverage, never successful restore capacity. Refusal transitions remain explicit.' };
}
export function summarizeBrowserRestoreOutcomes(rows) {
  return rows.flatMap(row => (row.mode === 'normal' ? row.case.samples : row.case.observations).map(item => ({
    size: row.size, variant: row.variant, execution: row.execution, mode: row.mode, operation: item.operation,
    outcome: item.outcome, ...(item.error ? { error: item.error } : {}), ...(item.reason ? { reason: item.reason } : {}),
    ...(item.wallMs === undefined ? {} : { wallMs: item.wallMs }),
  })));
}
const imports = `import {createRaveldex} from '@vmitsaras/raveldex';
import {createSnapshots} from '@vmitsaras/raveldex/adapters/snapshots';
import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';`;
const addonDefinition = `const addons=variant=>variant==='source'?[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]:[createSourceProvider({fields:['body']}),createPositionProvider({fields:['body'],offsets:['body']}),createPositionPhrases({fields:['body']})];`;
async function bundle(directory, source, name) {
  const result = await build({ stdin: { contents: source, sourcefile: name + '.entry.mjs', resolveDir: directory }, absWorkingDir: directory,
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, write: false, metafile: true, logLevel: 'silent' });
  for (const [path, input] of Object.entries(result.metafile.inputs)) {
    assert.ok(path === name + '.entry.mjs' || path === 'restore-case.mjs' || path === 'bulk-verify.mjs' || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), 'unexpected bundle input: ' + path);
    assert.ok(input.imports.every(entry => !entry.external), 'external bundle input');
  }
  const bytes = result.outputFiles[0].contents;
  return { bytes, identity: { file: name, bytes: bytes.length, sha256: digest(bytes), inputs: result.metafile.inputs } };
}
async function stage(directory, destination, workload, variant, mode) {
  const diagnosticDefinition = mode === 'diagnostic' ? `const localDiagnostic=(${createRestoreDiagnostic.toString()})();
const rootVerifier=(${createBulkVerifier.toString()})();
const hashData=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
const rootDigest=async root=>{const state=rootVerifier.rootState(root);return{sha256:await hashData(state.canonical),encounterSha256:await hashData(state.encounterCanonical),revision:state.revision,summary:state.summary,scope:state.scope};};` : '';
  const controls = mode === 'diagnostic' ? `
self.addEventListener('message',async event=>{if(!event.data?.restoreBench)return;event.stopImmediatePropagation();const {id,operation,meta}=event.data;try{const value=operation==='rootState'?await rootDigest(globalThis[Symbol.for('raveldex.n9.bulk.owner')]()):operation==='start'?localDiagnostic.start(meta):localDiagnostic.stop();self.postMessage({restoreBench:true,id,value});}catch(error){self.postMessage({restoreBench:true,id,error:{name:error.name,message:error.message}});}});` : '';
  const workerSource = imports + `import {serveSnapshotRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/snapshots/host';${addonDefinition}${diagnosticDefinition}${controls}
const variant=new URL(import.meta.url).searchParams.get('variant');if(!['source','positions-offsets'].includes(variant))throw Error('Unknown restore variant');serveSnapshotRaveldexWorker(self,{addons:addons(variant)});`;
  const appSource = imports + (mode === 'diagnostic' ? `import {getExecutionOwner} from './node_modules/@vmitsaras/raveldex/dist/core/execution/engine.js';` : '') + `import {exerciseRestore} from './restore-case.mjs';
import {createWorkerRaveldex} from '@vmitsaras/raveldex/adapters/worker';
import {createWorkerSnapshots} from '@vmitsaras/raveldex/adapters/worker/snapshots';${addonDefinition}${diagnosticDefinition}
const records=${JSON.stringify(workload.records)},queries=${JSON.stringify(workload.queries)},schema=${JSON.stringify(schema)},variant=${JSON.stringify(variant)},mode=${JSON.stringify(mode)};
window.restoreExercise=async execution=>{
 const workers=new Set(),bridges=new WeakMap();let sequence=0;
 const create=async({role})=>{if(execution==='direct')return createRaveldex({schema,addons:addons(variant)});
  const worker=new Worker(new URL('./worker.mjs?variant='+encodeURIComponent(variant),import.meta.url),{type:'module'});workers.add(worker);const pending=new Map();
  const rpc=(operation,meta)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);const error=Error('Diagnostic worker control outcome unknown');error.code='OUTCOME_UNKNOWN';reject(error);},120000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});worker.postMessage({restoreBench:true,id,operation,meta});});
  worker.addEventListener('message',event=>{if(!event.data?.restoreBench)return;event.stopImmediatePropagation();const p=pending.get(event.data.id);if(!p)return;pending.delete(event.data.id);event.data.error?p.reject(Object.assign(Error(event.data.error.message),{name:event.data.error.name})):p.resolve(event.data.value);});
  try{const engine=await createWorkerRaveldex({worker,configuration:{schema,addons:addons(variant)},ownership:'owned',sameHost:true});bridges.set(engine,{rpc,worker,role,pending});return engine;}catch(error){worker.terminate();workers.delete(worker);throw error;}};
 const snapshots=engine=>execution==='direct'?createSnapshots(engine):createWorkerSnapshots(engine);
 const diagnostic=mode==='diagnostic'?{start:({operation,engine,role})=>execution==='direct'?localDiagnostic.start({operation,role}):bridges.get(engine).rpc('start',{operation,role}),stop:({engine})=>execution==='direct'?localDiagnostic.stop():bridges.get(engine).rpc('stop')}:undefined;
 const captureRoot=mode==='diagnostic'?engine=>execution==='direct'?rootDigest(getExecutionOwner(engine).root):bridges.get(engine).rpc('rootState'):undefined;
 try{return await exerciseRestore({create,createSnapshots:snapshots,records,queries,mode,diagnostic,captureRoot,deadlineMs:60000,onSnapshot:async(encoded,meta)=>window.persistRestoreSnapshot(encoded,meta)});}catch(error){return{outcome:'Fail',failure:{name:error.name,code:error.code??null,message:error.message},partial:error.restoreReport??null};}finally{for(const worker of workers)worker.terminate();workers.clear();}
};`;
  await mkdir(destination, { recursive: true });
  const bundles = {};
  for (const [name, source] of [['worker.mjs', workerSource], ['app.mjs', appSource]]) {
    const result = await bundle(directory, source, name); await writeFile(join(destination, name), result.bytes); bundles[name] = result.identity;
  }
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>RX-8007 restore diagnosis</title><body><h1>Restore diagnosis</h1><script type="module" src="./app.mjs"></script></body></html>';
  await writeFile(join(destination, 'index.html'), html); bundles['index.html'] = { bytes: Buffer.byteLength(html), sha256: digest(html) };
  return bundles;
}
async function main() {
  assert.equal(process.argv.length, 4, 'Pass installed consumer and fresh output directory');
  const consumer = await realpath(resolve(process.argv[2])), source = join(consumer, 'node_modules/@vmitsaras/raveldex'); assert.equal(await realpath(source), source, 'workspace package link refused');
  const output = resolve(process.argv[3]); await mkdir(output); const canonicalOutput = await realpath(output);
  const metadata = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')); assert.equal(metadata.name, '@vmitsaras/raveldex'); assert.equal(metadata.private, true); assert.deepEqual(metadata.dependencies ?? {}, {});
  const originalInventory = await inventory(source), sizes = (process.env.RAVELDEX_N9_RESTORE_BROWSER_SIZES ?? '1000,10000').split(',').map(Number), variants = (process.env.RAVELDEX_N9_RESTORE_BROWSER_VARIANTS ?? BROWSER_RESTORE_VARIANTS.join(',')).split(',');
  assert.ok(sizes.length && new Set(sizes).size === sizes.length && sizes.every(size => [100,1000,10000].includes(size)));
  assert.ok(variants.length && new Set(variants).size === variants.length && variants.every(variant => BROWSER_RESTORE_VARIANTS.includes(variant)));
  const harness = [];
  for (const path of ['bench/n9/restore-browser.mjs','bench/n9/restore-case.mjs','bench/n9/bulk-verify.mjs','bench/n9/restore-instrument.mjs','bench/n9/instrument.mjs','bench/n9/workloads.mjs','bench/n9/run.mjs','test/fixtures/n9/freeze.json','test/fixtures/relevance/corpus.json']) harness.push({ path, sha256: digest(await readFile(join(root,path))) });
  const packages = {}, routes = {}, bundles = {}, workloads = sizes.map(size => verifyFrozen(workloadFor('adversarial', size)));
  for (const mode of BROWSER_RESTORE_MODES) {
    const directory = join(canonicalOutput, mode), packageRoot = join(directory, 'node_modules/@vmitsaras/raveldex'); await mkdir(dirname(packageRoot), { recursive: true }); await cp(source, packageRoot, { recursive: true }); await writeFile(join(directory,'package.json'), JSON.stringify({ private:true,type:'module' }));
    await copyFile(join(root,'bench/n9/restore-case.mjs'), join(directory,'restore-case.mjs'));
    await copyFile(join(root,'bench/n9/bulk-verify.mjs'), join(directory,'bulk-verify.mjs'));
    const instrumentation = mode === 'diagnostic' ? await instrumentRestorePackage(packageRoot) : null;
    packages[mode] = { directory, packageRoot, metadata, instrumentation, inventory: await inventory(packageRoot), stagedCaseSha256: digest(await readFile(join(directory,'restore-case.mjs'))), stagedVerifierSha256: digest(await readFile(join(directory,'bulk-verify.mjs'))) };
    for (const workload of workloads) for (const variant of variants) {
      const label = [mode,variant,workload.size].join('-'), destination = join(directory,'assets',variant+'-'+workload.size);
      bundles[label] = await stage(directory,destination,workload,variant,mode); routes[label] = destination;
    }
  }
  const server = createServer(async (request,response) => {
    const match = /^\/([^/]+)\/(index\.html|app\.mjs|worker\.mjs)$/.exec(new URL(request.url,'http://localhost').pathname);
    if (!match || !routes[match[1]]) { response.writeHead(404).end(); return; }
    try { response.setHeader('content-type',match[2].endsWith('.html')?'text/html':'text/javascript'); response.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'"); response.end(await readFile(join(routes[match[1]],match[2]))); } catch { response.writeHead(500).end(); }
  });
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);}); const origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_N9_RESTORE_BROWSER ?? 'chrome'; assert.ok(['chrome','chromium'].includes(channel));
  const report = { kind:'rx8007-browser-restore-v1', startedAt:new Date().toISOString(), harness, sourcePackage:{ source,metadata,inventory:originalInventory }, packages, bundles,
    workloads:workloads.map(item=>({identity:item.identity,size:item.size})), environment:{ node:process.version,platform:process.platform,arch:process.arch,playwright:JSON.parse(await readFile(join(root,'node_modules/playwright-core/package.json'))).version,esbuild:esbuildVersion },
    method:{ sizes,variants,executions:BROWSER_RESTORE_EXECUTIONS,modes:BROWSER_RESTORE_MODES,ownersPerConfiguration:1,operationDeadlineMs:60000,workerTransport:'Actual module Worker and selected source snapshot bridge, default8MiB message cap and default65000ms response timeout. Diagnostic control timeout120000ms is separate from native operations.',normal:'One fresh context and actual donor/receiver/probe owners per direct/worker case. Actual complete RPC Promise wall for workers; no cross-host subtraction. No quantiles.',diagnostic:'Disposable instrumented packages only. Out-of-band diagnostic commands execute in the corresponding actual worker realm. Instrumented wall is not normal latency.',memory:'Browser/worker retained and peak heap Not measured. Encoded bytes, logical roots/sidecars and transport buffers are distinct.',scope:'Pinned local browser/configuration reproduction. No physical input, paint, universal browser/platform, capacity repair or publication claim.' }, runs:[],outcome:'Running' };
  await writeFile(join(output,'start.json'),JSON.stringify(report,null,2)+'\n');let browser;
  try {
    browser = await chromium.launch({ ...(channel==='chrome'?{channel:'chrome'}:{}),headless:true }); report.environment.browser={ channel,version:browser.version(),headless:true };
    for (const size of sizes) for (const variant of variants) for (const mode of BROWSER_RESTORE_MODES) for (const execution of BROWSER_RESTORE_EXECUTIONS) {
      const name=[channel,size,variant,mode,execution].join('-'),context=await browser.newContext(),page=await context.newPage(),pageErrors=[],externalRequests=[];page.on('pageerror',error=>pageErrors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin))externalRequests.push(request.url());});
      try {
        await page.exposeFunction('persistRestoreSnapshot',async(encoded,meta)=>{assert.equal(meta.operation,'exportSource');assert.equal(meta.role,'donor');const file=name+'-source.json';await writeFile(join(output,file),encoded);return{snapshotFile:file,encodedSha256:digest(encoded)};});
        await page.goto(`${origin}/${[mode,variant,size].join('-')}/index.html`);await page.waitForFunction(()=>typeof window.restoreExercise==='function');
        const result=await page.evaluate(execution=>window.restoreExercise(execution),execution),row={browser:channel,browserVersion:browser.version(),size,variant,mode,execution,case:result,pageErrors,externalRequests};
        await writeFile(join(output,name+'.json'),JSON.stringify(row,null,2)+'\n');report.runs.push({size,variant,mode,execution,output:name+'.json',collectionOutcome:result.outcome});await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');assert.equal(result.outcome,'Collected',name+' unfinished');assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);console.log(JSON.stringify({name,collectionOutcome:result.outcome,operations:(result.samples.length?result.samples:result.observations).map(item=>({operation:item.operation,outcome:item.outcome}))}));
      } catch(error) { report.failureContext={name,pageErrors,externalRequests};throw error; } finally { await context.close(); }
    }
    const rows=await Promise.all(report.runs.map(row=>readFile(join(output,row.output),'utf8').then(JSON.parse)));const checked=validateBrowserRestoreRows(rows,sizes,variants);report.snapshots=[];for(const row of rows){const exported=browserOperationRows(row).find(item=>item.operation==='exportSource');if(exported.outcome!=='Pass')continue;const file=exported.result.snapshotFile;assert.ok(typeof file==='string'&&!file.includes('/')&&!file.includes('\\'),'unsafe snapshot artifact path');const bytes=await readFile(join(output,file));assert.equal(digest(bytes),exported.result.encodedSha256,'persisted snapshot digest drift');assert.equal(bytes.length,exported.result.encodedBytes,'persisted snapshot byte drift');assert.equal(bytes.toString('utf8').length,exported.result.encodedCodeUnits,'persisted snapshot code-unit drift');report.snapshots.push({file,bytes:bytes.length,sha256:digest(bytes),size:row.size,variant:row.variant,mode:row.mode,execution:row.execution});}report.coverage={configurations:checked.configurations,method:checked.method};report.parity=checked.parity;report.transitions=checked.transitions;report.operations=summarizeBrowserRestoreOutcomes(rows);report.outcome='Collected';
    report.acceptanceBoundary='Collection coverage only. Known Refused/Cancelled/Unknown/Not run remain distinct; parent reviews actual phase/state evidence. Collected is not repaired restore capacity.';
  } catch(error) { report.outcome='Fail';report.failure={name:error.name,code:error.code??null,message:error.message};throw error; }
  finally {
    await browser?.close();await new Promise(yes=>server.close(yes));
    try {
      assert.deepEqual(await inventory(source),originalInventory,'original installed package changed');report.originalPackageUnchanged=true;
      for(const mode of BROWSER_RESTORE_MODES){assert.deepEqual(await inventory(packages[mode].packageRoot),packages[mode].inventory,'staged package changed');assert.equal(digest(await readFile(join(packages[mode].directory,'restore-case.mjs'))),packages[mode].stagedCaseSha256);assert.equal(digest(await readFile(join(packages[mode].directory,'bulk-verify.mjs'))),packages[mode].stagedVerifierSha256);packages[mode].packageUnchanged=true;packages[mode].stagedCaseUnchanged=true;}
      for(const file of harness)assert.equal(digest(await readFile(join(root,file.path))),file.sha256,'harness source drift');
      for(const [label,files] of Object.entries(bundles))for(const [name,identity] of Object.entries(files))assert.equal(digest(await readFile(join(routes[label],name))),identity.sha256,'executed bundle drift');
    } catch(error){report.outcome='Fail';report.guardFailure={name:error.name,message:error.message};throw error;}
    finally{report.finishedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
  }
}
if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>undefined)===fileURLToPath(import.meta.url))await main();
