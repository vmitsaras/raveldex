// RX-8009 selected installed Chrome direct/real-worker pairs. Never builds,
// installs, fetches dependencies or mutates production/package source.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, realpath, copyFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { instrumentPackage } from './instrument.mjs';
import { inventory, digest } from './run.mjs';
import { workloadFor, verifyFrozen, schema } from './workloads.mjs';
import { createPairedVerifier } from './paired-verify.mjs';

export const BROWSER_PAIRED_METHOD = Object.freeze({ size: 100, owners: 3, samples: 40, warmups: 2,
  queries: Object.freeze(['common', 'rare', 'narrow-prefix', 'source-phrase']), executions: Object.freeze(['direct', 'worker']), deadlineMs: 60000, batch: 256 });
export function pairedBrowserQuantile(values, fraction) {
  assert.ok(Number.isFinite(fraction) && fraction > 0 && fraction <= 1, 'quantile fraction outside (0,1]');
  assert.ok(values.length && values.every(value => Number.isFinite(value) && value >= 0));
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
}
export function summarizePairedBrowser(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => row.mode === 'normal')) for (const sample of row.case.samples) {
    assert.equal(sample.counters, undefined, 'normal timing has diagnostic counters');
    const key = JSON.stringify([row.variant, row.execution, row.size, sample.query]);
    if (!groups.has(key)) groups.set(key, { variant: row.variant, execution: row.execution, size: row.size, query: sample.query, samples: [] });
    groups.get(key).samples.push(sample);
  }
  return [...groups.values()].map(({ samples, ...identity }) => {
    const pass = samples.filter(sample => sample.outcome === 'Pass'), values = pass.map(sample => sample.wallMs);
    return { ...identity, attempts: samples.length, successes: pass.length,
      outcomes: Object.fromEntries([...new Set(samples.map(sample => sample.outcome))].map(outcome => [outcome, samples.filter(sample => sample.outcome === outcome).length])),
      failureRate: samples.filter(sample => sample.outcome !== 'Pass').length / samples.length,
      p50WallMs: values.length ? pairedBrowserQuantile(values, .5) : null, p95WallMs: values.length >= 100 ? pairedBrowserQuantile(values, .95) : null,
      observedMaximumWallMs: values.length ? Math.max(...values) : null,
      quantiles: 'Empirical nearest-rank; p95 requires at least 100 successes. Correlated repetitions across fresh owners are not a population/device guarantee. Failed samples remain separate.',
      cpu: 'Not measured', heap: 'Not measured' };
  });
}
export function validatePairedBrowser(rows, method = BROWSER_PAIRED_METHOD) {
  assert.equal(rows.length, 2 * method.executions.length * (method.owners + 1), 'missing or extra browser owners');
  const keys = new Set(), parity = [], transitions = [], verifier = createPairedVerifier();
  for (const execution of method.executions) {
    const selected = rows.filter(row => row.execution === execution);
    const successReferences = Object.fromEntries(method.queries.map(query => [query, selected.find(row => row.case?.queryResults?.[query]?.outcome === 'Pass')?.case.queryResults[query]]));
    const completeReferences = Object.fromEntries(method.queries.map(query => [query, selected.find(row => row.case?.completeQueries?.[query]?.outcome === 'Pass' && row.case.completeQueries[query].complete === true)?.case.completeQueries[query]]));
    let reference;
    for (const variant of ['baseline', 'candidate']) {
      const owners = selected.filter(row => row.variant === variant);
      assert.equal(owners.filter(row => row.mode === 'normal').length, method.owners);
      assert.equal(owners.filter(row => row.mode === 'diagnostic').length, 1);
      for (const row of owners) {
        const key = JSON.stringify([row.variant, row.execution, row.owner]); assert.ok(!keys.has(key), 'duplicate owner'); keys.add(key);
        assert.ok(['normal', 'diagnostic'].includes(row.mode)); assert.ok(Number.isInteger(row.owner));
        assert.ok(row.mode === 'normal' ? row.owner >= 0 && row.owner < method.owners : row.owner === method.owners, 'owner index/mode drift');
        assert.equal(row.size, method.size); assert.deepEqual(row.pageErrors, []); assert.deepEqual(row.externalRequests, []);
        assert.equal(row.case.outcome, 'Collected', 'case did not finish'); assert.equal(row.case.build?.outcome, 'Pass', 'admitted build required');
        assert.equal(row.case.build?.revision, Math.ceil(method.size / method.batch), 'build revision drift');
        assert.equal(row.mode === 'normal' ? row.case.observations.length : row.case.samples.length, 0, 'mixed normal/diagnostic observations');
        const observations = row.mode === 'normal' ? row.case.samples : row.case.observations;
        assert.equal(new Set(observations.map(sample => JSON.stringify([sample.query, sample.repetition]))).size, observations.length, 'duplicate observation');
        assert.equal(observations.length, method.queries.length * (row.mode === 'normal' ? method.samples : 1), 'missing query observations');
        assert.equal(row.case.warmups.length, row.mode === 'normal' ? method.queries.length * method.warmups : 0, 'warmup coverage drift');
        assert.equal(new Set(row.case.warmups.map(sample => JSON.stringify([sample.query, sample.repetition]))).size, row.case.warmups.length, 'duplicate warmup');
        for (const query of method.queries) {
          assert.equal(row.case.warmups.filter(sample => sample.query === query).length, row.mode === 'normal' ? method.warmups : 0);
          assert.equal(observations.filter(sample => sample.query === query).length, row.mode === 'normal' ? method.samples : 1);
          assert.ok(row.case.queryResults[query], 'missing actual query result/error');
          const actual = row.case.queryResults[query];
          verifier.compareOutcomes(actual, actual);
          assert.notEqual(actual.outcome, 'Rejected', 'unexpected nonresource query error');
          const anySuccess = [...observations, ...row.case.warmups].some(sample => sample.query === query && sample.outcome === 'Pass');
          if (anySuccess) assert.equal(actual.outcome, 'Pass', 'successful query reference was hidden by an earlier failure');
          const capture = row.case.completeQueries?.[query]; assert.ok(capture, 'missing complete public query capture');
          assert.notEqual(capture.outcome, 'Rejected', 'unexpected nonresource capture error');
          if (capture.outcome === 'Pass') { assert.equal(capture.complete, true); assert.ok(Number.isSafeInteger(capture.total)); assert.equal(capture.hits.length, capture.total); assert.equal(capture.revision, row.case.build.revision); assert.ok(Array.isArray(capture.pages) && capture.pages.length > 0); }
          else { assert.ok(capture.error?.code, 'incomplete capture lacks a typed error'); assert.notEqual(capture.complete, true); }
        }
        for (const sample of observations) {
          assert.ok(['Pass', 'Refused', 'Cancelled', 'Unknown'].includes(sample.outcome), 'unexpected or hidden rejection');
          assert.ok(Number.isFinite(sample.wallMs) && sample.wallMs >= 0);
          assert.equal(sample.cpuUserMs, undefined, 'browser CPU is not measured'); assert.equal(sample.cpuSystemMs, undefined, 'browser CPU is not measured');
          assert.equal(Boolean(sample.counters), row.mode === 'diagnostic', 'diagnostic scope mismatch');
          if (sample.outcome !== 'Pass') assert.ok(sample.error?.code && sample.error.message, 'typed error missing');
          if (sample.counters) for (const name of ['emittedSteps', 'emittedWorkUnits', 'hostYields', 'continuationsScheduled']) assert.ok(Number.isSafeInteger(sample.counters[name]) && sample.counters[name] >= 0, 'missing diagnostic count');
        }
        if (!reference) reference = row;
        for (const query of method.queries) {
          const actual = row.case.queryResults[query], success = successReferences[query];
          if (actual.outcome === 'Pass') verifier.compareOutcomes(success, actual);
          const expected = reference.case.queryResults[query], compared = verifier.compareOutcomes(expected, actual, { allowCapacityTransition: true });
          if (compared.status === 'Finding') transitions.push({ execution, variant, owner: row.owner, mode: row.mode, query, reference: expected, observed: actual, relation: 'actual-outcome-transition', comparison: compared, stateParityVerified: false });
          const beforeCapture = reference.case.completeQueries[query], afterCapture = row.case.completeQueries[query], complete = completeReferences[query];
          if (afterCapture.complete) verifier.compareCaptures(complete, afterCapture);
          // Successful partial pages are still real results and must agree even
          // when their later pagination operation ends with a typed refusal.
          for (let index = 0; index < afterCapture.pages.length; index++) {
            const prior = complete?.pages[index] ?? selected.find(other => other.case?.completeQueries?.[query]?.pages?.[index])?.case.completeQueries[query].pages[index];
            if (prior) verifier.compareResults(prior, afterCapture.pages[index]);
          }
          const captureComparison = verifier.compareCaptures(beforeCapture, afterCapture, { allowCapacityTransition: true });
          if (captureComparison.status === 'Finding') transitions.push({ execution, variant, owner: row.owner, mode: row.mode, query, reference: beforeCapture, observed: afterCapture, relation: 'complete-capture-outcome-transition', comparison: captureComparison, stateParityVerified: false });
        }
        for (const transition of row.case.queryTransitions ?? []) {
          assert.ok(method.queries.includes(transition.query), 'unknown transition query');
          assert.notEqual(transition.reference.outcome, 'Rejected', 'nonresource transition error'); assert.notEqual(transition.observed.outcome, 'Rejected', 'nonresource transition error');
          const compared = verifier.compareOutcomes(transition.reference, transition.observed, { allowCapacityTransition: true });
          if (transition.reference.outcome === 'Pass') verifier.compareOutcomes(successReferences[transition.query], transition.reference);
          if (transition.observed.outcome === 'Pass') verifier.compareOutcomes(successReferences[transition.query], transition.observed);
          if (compared.status === 'Finding') transitions.push({ execution, variant, owner: row.owner, mode: row.mode, ...transition, relation: 'same-owner-outcome-transition', comparison: compared, stateParityVerified: false });
        }
        parity.push({ execution, variant, owner: row.owner, mode: row.mode, completeCaptures: method.queries.every(query => row.case.completeQueries[query].outcome === 'Pass' && row.case.completeQueries[query].complete === true) });
      }
    }
  }
  return { owners: rows.length, parity, transitions, allCompleteQueryCaptures: parity.every(row => row.completeCaptures) };
}

/** Host-neutral: data validation and complete captures are outside timing. */
export async function exercisePairedBrowser({ create, records, queries, mode, samples, warmups, deadlineMs, diagnostic, captureComplete, compareObservations }) {
  const ensure = (condition, message) => { if (!condition) throw Error(message); };
  const errorData = error => ({ name: error?.name ?? 'Error', code: error?.code ?? null, reason: error?.reason ?? null, details: error?.details ?? null, message: String(error?.message ?? error) });
  const classify = error => !error ? 'Pass' : /UNKNOWN/.test(error.code ?? '') || error.name === 'WorkerAdapterError' && ['TIMEOUT', 'TERMINATED', 'WORKER_UNAVAILABLE'].includes(error.code) ? 'Unknown' : error.code === 'CANCELLED' ? 'Cancelled' : ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code) ? 'Refused' : 'Rejected';
  const row = { samples: [], observations: [], warmups: [], queryResults: {}, queryTransitions: [], completeQueries: {}, outcome: 'Running' };
  ensure(typeof compareObservations === 'function', 'strict observation comparator required');
  const engine = await create();
  function verify(found, query) {
    const actual = found.error ? { outcome: classify(found.error), error: errorData(found.error) } : { outcome: 'Pass', result: found.result };
    if (found.result) {
      const eligible = new Set(query.expectedIds), result = found.result;
      ensure(result.revision === Math.ceil(records.length / 256) && result.total === eligible.size && result.completeness === 'complete' && result.model === 'raveldex-bm25-v1', 'query revision/total/model drift');
      ensure(result.hits.length === Math.min(20, eligible.size) && new Set(result.hits.map(hit => hit.id)).size === result.hits.length, 'query page drift');
      ensure(result.hits.every(hit => eligible.has(hit.id) && Number.isFinite(hit.score)), 'ineligible/nonfinite query hit');
    }
    ensure(actual.outcome !== 'Rejected', 'unexpected query rejection: ' + JSON.stringify(actual));
    const previous = row.queryResults[query.id];
    if (previous) {
      const comparison = compareObservations(previous, actual);
      if (comparison.status === 'Finding') row.queryTransitions.push({ query: query.id, reference: previous, observed: actual, comparison });
      // An early warmup refusal must never hide later successful scores/order.
      if (previous.outcome !== 'Pass' && actual.outcome === 'Pass') row.queryResults[query.id] = actual;
    } else row.queryResults[query.id] = actual;
  }
  try {
    const start = performance.now(); let receipt;
    for (let offset = 0; offset < records.length; offset += 256) receipt = await engine.addMany(records.slice(offset, offset + 256), { deadlineMs });
    row.build = { outcome: 'Pass', wallMs: performance.now() - start, revision: receipt.revision, batches: Math.ceil(records.length / 256) };
    for (const query of queries) {
      if (mode === 'normal') for (let repetition = 0; repetition < warmups; repetition++) {
        let result, error; try { result = await engine.search(query.query, { limit: 20, deadlineMs }); } catch (caught) { error = caught; }
        row.warmups.push({ query: query.id, repetition, outcome: classify(error), ...(error ? { error: errorData(error) } : {}) }); verify({ result, error }, query);
      }
      for (let repetition = 0; repetition < (mode === 'normal' ? samples : 1); repetition++) {
        if (mode === 'diagnostic') await diagnostic.start();
        const start = performance.now(); let result, error;
        try { result = await engine.search(query.query, { limit: 20, deadlineMs }); } catch (caught) { error = caught; }
        const wallMs = performance.now() - start, counters = mode === 'diagnostic' ? await diagnostic.stop() : undefined;
        const sample = { query: query.id, repetition, outcome: classify(error), wallMs, ...(error ? { error: errorData(error) } : {}), ...(counters ? { counters } : {}) };
        (mode === 'normal' ? row.samples : row.observations).push(sample); verify({ result, error }, query);
      }
    }
    for (const query of queries) row.completeQueries[query.id] = await captureComplete(engine, query, row.build.revision);
    row.outcome = 'Collected'; return row;
  } catch (error) { row.outcome = 'Fail'; row.failure = errorData(error); return row; }
  finally { await engine.dispose(); }
}
export function localPairedDiagnostic() {
  const key = Symbol.for('raveldex.n9.diagnostics');
  return { start() {
    if (globalThis[key]) throw Error('Diagnostic scope must be serial');
    globalThis[key] = { idfComputations: 0, averageLengthComputations: 0, fieldsPrepared: 0, candidates: 0, documentsEvaluated: 0, documentsScored: 0, exactDictionaryProbes: 0, prefixDictionaryVisits: 0, postingsVisited: 0, emittedSteps: 0, emittedWorkUnits: 0, maxStepWorkUnits: 0, hostYields: 0, continuationsScheduled: 0, deadlineCallbacks: 0, restorePhase: null, restorePhases: {} };
  }, stop() { const result = globalThis[key]; if (!result) throw Error('Diagnostic scope missing'); delete globalThis[key]; return result; } };
}
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const imports = `import {createRaveldex} from '@vmitsaras/raveldex';import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';`;
const addonCode = `const addons=()=>[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})];`;
async function bundle(directory, contents, name) {
  const result = await build({ stdin: { contents, sourcefile: name + '.entry.mjs', resolveDir: directory }, absWorkingDir: directory,
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', write: false, metafile: true, logLevel: 'silent' });
  for (const [path, input] of Object.entries(result.metafile.inputs)) {
    assert.ok(path === name + '.entry.mjs' || path === 'paired-verify.mjs' || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), 'unexpected bundle input: ' + path);
    assert.ok(input.imports.every(entry => !entry.external), 'external bundle import');
  }
  const bytes = result.outputFiles[0].contents; await writeFile(join(directory, name), bytes);
  return { file: name, bytes: bytes.length, sha256: digest(bytes), inputs: result.metafile.inputs };
}
async function stage(directory, workload, mode, method) {
  const diagnosticCode = mode === 'diagnostic' ? `const localDiagnostic=(${localPairedDiagnostic.toString()})();` : '';
  const controls = mode === 'diagnostic' ? `self.addEventListener('message',event=>{if(!event.data?.pairedBench)return;event.stopImmediatePropagation();const{id,operation}=event.data;try{const value=operation==='start'?localDiagnostic.start():localDiagnostic.stop();self.postMessage({pairedBench:true,id,value});}catch(error){self.postMessage({pairedBench:true,id,error:{name:error.name,message:error.message}});}});` : '';
  const workerSource = imports + `import {serveRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/host';${addonCode}${diagnosticCode}${controls}serveRaveldexWorker(self,{addons:addons()});`;
  const appSource = imports + `import {createWorkerRaveldex} from '@vmitsaras/raveldex/adapters/worker';import {createPairedVerifier} from './paired-verify.mjs';${addonCode}${diagnosticCode}
const exercise=(${exercisePairedBrowser.toString()});const records=${JSON.stringify(workload.records)},queries=${JSON.stringify(workload.queries.filter(query => method.queries.includes(query.id)))},schema=${JSON.stringify(schema)},mode=${JSON.stringify(mode)},method=${JSON.stringify(method)};
window.pairedExercise=async execution=>{let worker,sequence=0;const pending=new Map();
const rpc=operation=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(Error('Diagnostic worker control outcome unknown'),{code:'OUTCOME_UNKNOWN'}));},120000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});worker.postMessage({pairedBench:true,id,operation});});
const create=execution==='direct'?()=>createRaveldex({schema,addons:addons()}):async()=>{worker=new Worker('./worker.mjs',{type:'module'});worker.addEventListener('message',event=>{if(!event.data?.pairedBench)return;event.stopImmediatePropagation();const request=pending.get(event.data.id);if(!request)return;pending.delete(event.data.id);event.data.error?request.reject(Object.assign(Error(event.data.error.message),{name:event.data.error.name})):request.resolve(event.data.value);});return await createWorkerRaveldex({worker,configuration:{schema,addons:addons()},ownership:'owned',sameHost:true});};
const verifier=createPairedVerifier();
try{return await exercise({create,records,queries,mode,samples:method.samples,warmups:method.warmups,deadlineMs:method.deadlineMs,diagnostic:mode==='diagnostic'?(execution==='direct'?localDiagnostic:{start:()=>rpc('start'),stop:()=>rpc('stop')}):undefined,compareObservations:(before,after)=>verifier.compareOutcomes(before,after,{allowCapacityTransition:true}),captureComplete:(engine,query,revision)=>verifier.capturePages(engine,query.query,{expectedIds:query.expectedIds,revision,pageSize:100,deadlineMs:method.deadlineMs})});}
finally{worker?.terminate();for(const request of pending.values())request.reject(Object.assign(Error('Diagnostic worker ended'),{code:'OUTCOME_UNKNOWN'}));pending.clear();}};`;
  const assets = {};
  for (const [name, contents] of [['worker.mjs', workerSource], ['app.mjs', appSource]]) assets[name] = await bundle(directory, contents, name);
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>RX-8009 paired native browser benchmark</title><body><h1>Paired native browser benchmark</h1><script type="module" src="./app.mjs"></script></body></html>';
  await writeFile(join(directory, 'index.html'), html); assets['index.html'] = { file: 'index.html', bytes: Buffer.byteLength(html), sha256: digest(html) };
  return assets;
}
async function prepare(consumer, output, variant, workload, method) {
  const directory = await realpath(resolve(consumer)), source = join(directory, 'node_modules/@vmitsaras/raveldex');
  assert.equal(await realpath(source), source, 'workspace package symlink refused');
  const metadata = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  assert.equal(metadata.name, '@vmitsaras/raveldex'); assert.equal(metadata.private, true); assert.deepEqual(metadata.dependencies ?? {}, {});
  const original = await inventory(source), modes = {};
  for (const mode of ['normal', 'diagnostic']) {
    const directory = join(output, variant + '-' + mode), packageRoot = join(directory, 'node_modules/@vmitsaras/raveldex');
    await mkdir(dirname(packageRoot), { recursive: true }); await cp(source, packageRoot, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    await copyFile(join(repository, 'bench/n9/paired-verify.mjs'), join(directory, 'paired-verify.mjs'));
    const instrumentation = mode === 'diagnostic' ? await instrumentPackage(packageRoot) : null;
    const members = await inventory(packageRoot), assets = await stage(directory, workload, mode, method);
    modes[mode] = { directory, packageRoot, inventory: members, inventorySha256: digest(JSON.stringify(members)), instrumentation, assets,
      stagedVerifierSha256: digest(await readFile(join(directory, 'paired-verify.mjs'))) };
  }
  return { source, metadata, originalInventory: original, originalInventorySha256: digest(JSON.stringify(original)), modes };
}
async function main() {
  assert.equal(process.argv.length, 5, 'usage: node bench/n9/paired-browser.mjs BASELINE_CONSUMER CANDIDATE_CONSUMER FRESH_OUTPUT');
  const output = resolve(process.argv[4]); await mkdir(output); const canonicalOutput = await realpath(output);
  const method = { ...BROWSER_PAIRED_METHOD, size: Number(process.env.RAVELDEX_N9_PAIRED_BROWSER_SIZE ?? BROWSER_PAIRED_METHOD.size),
    owners: Number(process.env.RAVELDEX_N9_PAIRED_BROWSER_OWNERS ?? BROWSER_PAIRED_METHOD.owners), samples: Number(process.env.RAVELDEX_N9_PAIRED_BROWSER_SAMPLES ?? BROWSER_PAIRED_METHOD.samples) };
  assert.ok([100, 1000, 10000].includes(method.size)); assert.ok(Number.isInteger(method.owners) && method.owners > 0); assert.ok(Number.isInteger(method.samples) && method.samples > 0);
  const workload = verifyFrozen(workloadFor('adversarial', method.size));
  const paths = ['bench/n9/paired-browser.mjs', 'bench/n9/paired-verify.mjs', 'bench/n9/instrument.mjs', 'bench/n9/run.mjs', 'bench/n9/workloads.mjs', 'test/fixtures/n9/freeze.json', 'test/fixtures/relevance/corpus.json'];
  const harness = await Promise.all(paths.map(async path => ({ path, sha256: digest(await readFile(join(repository, path))) })));
  const packages = { baseline: await prepare(process.argv[2], canonicalOutput, 'baseline', workload, method), candidate: await prepare(process.argv[3], canonicalOutput, 'candidate', workload, method) };
  const routes = Object.fromEntries(Object.entries(packages).flatMap(([variant, pack]) => Object.entries(pack.modes).map(([mode, value]) => [variant + '-' + mode, value.directory])));
  const server = createServer(async (request, response) => {
    const match = /^\/((?:baseline|candidate)-(?:normal|diagnostic))\/(index\.html|app\.mjs|worker\.mjs)$/.exec(new URL(request.url, 'http://localhost').pathname);
    if (!match || !routes[match[1]]) { response.writeHead(404).end(); return; }
    try { response.setHeader('content-type', match[2].endsWith('.html') ? 'text/html' : 'text/javascript'); response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'"); response.end(await readFile(join(routes[match[1]], match[2]))); }
    catch { response.writeHead(500).end(); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); }); const origin = 'http://127.0.0.1:' + server.address().port;
  const report = { kind: 'rx8009-paired-browser-v1', startedAt: new Date().toISOString(), harness, packages, workload: workload.identity,
    method: { ...method, normal: 'Separate fresh contexts/owners; two discarded warmups then forty measured calls by default. Variant/execution order alternates across owners. Full public pagination and result validation are outside windows.', diagnostic: 'One separate instrumented owner per variant/execution, same-realm work/yield counters via out-of-band real-worker control. Never pooled into ordinary timing.', quantiles: 'Empirical nearest-rank p50; p95 only with >=100 actual successes per cell. Calls are correlated within owner; no population/universal claim.', cpu: 'Not measured', heap: 'Not measured', scope: 'Frozen adversarial source retention/source phrases only; actual Chrome direct and module-worker configurations. No cross-host subtraction, physical-input/paint, unknown rollback or publication claim.' },
    environment: { node: process.version, platform: process.platform, arch: process.arch, esbuild: esbuildVersion, playwright: JSON.parse(await readFile(join(repository, 'node_modules/playwright-core/package.json'))).version }, runs: [], outcome: 'Running' };
  await writeFile(join(output, 'start.json'), JSON.stringify(report, null, 2) + '\n'); let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true }); report.environment.browser = { channel: 'chrome', version: browser.version(), headless: true };
    for (let owner = 0; owner <= method.owners; owner++) for (const execution of owner % 2 ? [...method.executions].reverse() : method.executions) for (const variant of owner % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      const mode = owner === method.owners ? 'diagnostic' : 'normal', context = await browser.newContext(), page = await context.newPage(), pageErrors = [], externalRequests = [];
      page.on('pageerror', error => pageErrors.push(error.message)); page.on('request', request => { if (!request.url().startsWith(origin)) externalRequests.push(request.url()); });
      const name = [variant, execution, owner, mode].join('-');
      try {
        await page.goto(origin + '/' + variant + '-' + mode + '/index.html'); await page.waitForFunction(() => typeof window.pairedExercise === 'function');
        const result = await page.evaluate(execution => window.pairedExercise(execution), execution);
        const row = { variant, execution, owner, mode, size: method.size, browser: 'chrome', browserVersion: browser.version(), pageErrors, externalRequests, case: result };
        await writeFile(join(output, name + '.json'), JSON.stringify(row, null, 2) + '\n'); report.runs.push({ variant, execution, owner, mode, size: method.size, output: name + '.json', outcome: result.outcome });
        await writeFile(join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n'); assert.equal(result.outcome, 'Collected', name + ' failed: ' + JSON.stringify(result.failure)); assert.deepEqual(pageErrors, []); assert.deepEqual(externalRequests, []);
        console.log(JSON.stringify({ name, outcome: result.outcome }));
      } catch (error) {
        const failure = { variant, execution, owner, mode, size: method.size, pageErrors, externalRequests, outcome: 'Fail', error: { name: error.name, message: error.message } };
        await writeFile(join(output, name + '-failure.json'), JSON.stringify(failure, null, 2) + '\n'); report.failureContext = failure; throw error;
      } finally { await context.close(); }
    }
    const rows = await Promise.all(report.runs.map(run => readFile(join(output, run.output), 'utf8').then(JSON.parse)));
    report.coverage = validatePairedBrowser(rows, method); report.summaries = summarizePairedBrowser(rows); report.outcome = 'Collected';
  } catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message }; throw error; }
  finally {
    await browser?.close(); await new Promise(yes => server.close(yes));
    try {
      for (const pack of Object.values(packages)) {
        assert.deepEqual(await inventory(pack.source), pack.originalInventory, 'original installed package drift'); pack.originalPackageUnchanged = true;
        for (const mode of Object.values(pack.modes)) {
          assert.deepEqual(await inventory(mode.packageRoot), mode.inventory, 'staged package drift'); mode.packageUnchanged = true;
          assert.equal(digest(await readFile(join(mode.directory, 'paired-verify.mjs'))), mode.stagedVerifierSha256, 'staged verifier drift'); mode.stagedVerifierUnchanged = true;
          for (const [name, identity] of Object.entries(mode.assets)) assert.equal(digest(await readFile(join(mode.directory, name))), identity.sha256, 'executed asset drift'); mode.assetsUnchanged = true;
        }
      }
      for (const pin of harness) assert.equal(digest(await readFile(join(repository, pin.path))), pin.sha256, 'harness drift');
    } catch (error) { report.outcome = 'Fail'; report.guardFailure = error.message; throw error; }
    finally { report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => undefined) === fileURLToPath(import.meta.url)) await main();
