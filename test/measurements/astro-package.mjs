import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium } from 'playwright-core';
import axe from 'axe-core';
import { prepareConsumer, bundleConsumer, command, digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { packAstro } from '../../scripts/pack-astro.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';

const exec = promisify(execFile);
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const fixtureSource = join(REPO_ROOT, 'examples/astro');
const queries = ['atomic', 'original', 'records', 'native', 'marzipanprivate', { kind: 'all' }, { kind: 'not', child: { kind: 'text', text: 'atomic' } }];
const pages = [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 2 }];
function compare(actual, expected, label) {
  assert.equal(actual.completeness, 'complete', label); assert.equal(actual.model, 'raveldex-bm25-v1', label);
  assert.equal(actual.total, expected.total, label); assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id), label);
  for (let i = 0; i < actual.hits.length; i++) assert.ok(Math.abs(actual.hits[i].score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12), `${label}: independent source BM25`);
}
async function files(directory, prefix = '') {
  const result = [];
  for (const item of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const name = join(prefix, item.name);
    if (item.isDirectory()) result.push(...await files(directory, name));
    else { assert.ok(item.isFile(), `No generated symlinks/special files: ${name}`); const data = await readFile(join(directory, name)); result.push({ path: name, bytes: data.length, sha256: digest(data) }); }
  }
  return result.sort((a, b) => a.path < b.path ? -1 : 1);
}
async function graph(directory, name, entry, platform = 'browser') {
  await writeFile(join(directory, name + '.mjs'), entry);
  const settings = { bundle: true, platform, format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
  const result = await build({ ...settings, absWorkingDir: directory, entryPoints: [name + '.mjs'], outfile: name + '-bundle.mjs', logLevel: 'silent' });
  const bytes = result.outputFiles[0].contents, gzip = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 }, compressed = gzipSync(bytes, gzip);
  const inputs = Object.entries(result.metafile.inputs).map(([path, input]) => ({ path, bytes: input.bytes, imports: input.imports }));
  for (const input of inputs) {
    assert.ok(input.path === name + '.mjs' || /^node_modules\/@vmitsaras\/raveldex(?:-astro)?\/dist\//.test(input.path), `No foreign framework/parser/engine graph ${input.path}`);
    if (platform === 'browser') assert.ok(input.imports.every(item => !item.external));
    else assert.ok(input.imports.filter(item => item.external).every(item => /^node:(fs\/promises|path|url)$/.test(item.path)));
  }
  assert.ok(Object.values(result.metafile.outputs)[0].imports.every(item => platform === 'node' && /^node:(fs\/promises|path|url)$/.test(item.path)));
  await writeFile(join(directory, name + '-bundle.mjs'), bytes);
  return { esbuild: esbuildVersion, settings, minifiedBytes: bytes.length, gzipBytes: compressed.length, sha256: digest(bytes), gzipSha256: digest(compressed), gzip: { ...gzip, mtime: 0 }, inputs, runtimeImports: Object.values(result.metafile.outputs)[0].imports };
}
async function inert(directory, entry) {
  const code = `import assert from 'node:assert/strict';const reads=[];for(const key of ['window','document','navigator','fetch','XMLHttpRequest','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','setTimeout','setInterval','performance'])Object.defineProperty(globalThis,key,{configurable:true,get(){reads.push(key);throw Error(key)}});const module=await import(${JSON.stringify(entry)});let calls=0;if(module.default){const instance=module.default({configuration:{schema:{text:{body:{}}}},buildId:'inert',getEntries(){calls++;return[]}});assert.equal(instance.name,'@vmitsaras/raveldex-astro');}assert.equal(calls,0);assert.deepEqual(reads,[]);console.log(JSON.stringify({entry:${JSON.stringify(entry)},exports:Object.keys(module).sort(),reads,callbacks:calls}));`;
  return JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', code], directory)).stdout);
}
async function declarationCheck(directory) {
  await writeFile(join(directory, 'astro-public-types.ts'), `import type {Configuration} from '@vmitsaras/raveldex';import {buildStaticSearch,type StaticEntry,type StaticArtifacts,type StaticBuildOptions} from '@vmitsaras/raveldex-astro/build';import {loadStaticSearch,type StaticLoadOptions,type LoadedStaticSearch} from '@vmitsaras/raveldex-astro/client';
const configuration:Configuration={schema:{text:{body:{}}}},entry:StaticEntry={record:{id:'a',text:{body:'native'}},title:'Native',path:'/guide/'},options:StaticBuildOptions={configuration,entries:[entry],buildId:'v1'},artifacts:Promise<StaticArtifacts>=buildStaticSearch(options);void artifacts;const load:StaticLoadOptions={configuration,manifestUrl:'https://docs.test/raveldex/manifest.json',expectedBuildId:'v1'},handle:Promise<LoadedStaticSearch>=loadStaticSearch(load);void handle;
// @ts-expect-error Explicit build identity required.
buildStaticSearch({configuration,entries:[entry]});
// @ts-expect-error Immutable allowlist values.
entry.path='/changed/';
// @ts-expect-error Runtime load identity is readonly.
load.expectedBuildId='v2';
// @ts-expect-error No private deep import.
import * as hidden from '@vmitsaras/raveldex-astro/dist/client.js';
`);
  await writeFile(join(directory, 'astro-public-tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true, lib: ['ES2022', 'DOM'], types: [] }, include: ['astro-public-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(directory, 'astro-public-tsconfig.json')], directory);
  await writeFile(join(directory, 'astro-hook-types.ts'), `import type {AstroIntegration} from 'astro';import raveldexAstro,{type RaveldexAstroOptions} from '@vmitsaras/raveldex-astro';const options:RaveldexAstroOptions={configuration:{schema:{text:{body:{}}}},buildId:'v1',getEntries:()=>[]};const integration:AstroIntegration=raveldexAstro(options);void integration;
// @ts-expect-error Trusted callback handle is readonly.
options.getEntries=()=>[];
`);
  await writeFile(join(directory, 'astro-hook-tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, noEmit: true, lib: ['ES2022', 'DOM'], typeRoots: [join(REPO_ROOT, 'node_modules/@types')], types: ['node'] }, include: ['astro-hook-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(directory, 'astro-hook-tsconfig.json')], directory);
  await command(process.execPath, ['--input-type=module', '--eval', "import assert from 'node:assert/strict';for(const specifier of ['@vmitsaras/raveldex-astro/dist/client.js','@vmitsaras/raveldex-astro/common'])await assert.rejects(import(specifier),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});"], directory);
  return 'Pass: paired actual tarball public declarations; browser build/client compile with ES2022+DOM and no Node ambient types, hook usage with exact Astro+Node peer types and skipLibCheck for transitive framework declarations; readonly/required identity/private imports checked.';
}
async function serve(directory, base) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://fixture.invalid').pathname; requests.push({ method: request.method, pathname });
    if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
    let target = resolve(directory, '.' + '/' + decodeURIComponent(pathname.slice(base.length)));
    if (!(target === directory || target.startsWith(directory + '/'))) { response.writeHead(403).end(); return; }
    try {
      if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
      const data = await readFile(target);
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' }[extname(target)] ?? 'application/octet-stream';
      response.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' }); response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, requests, origin, close: () => new Promise((yes, no) => { server.close(error => error ? no(error) : yes()); server.closeAllConnections(); }) };
}
async function nodeProbe(directory, site, origin, base, expected, fixture) {
  const code = `import assert from 'node:assert/strict';import {loadStaticSearch} from '@vmitsaras/raveldex-astro/client';import {configuration} from ${JSON.stringify(pathToFileURL(join(site, 'configuration.mjs')).href)};import {qualification} from ${JSON.stringify(pathToFileURL(join(site, 'qualification.mjs')).href)};const expected=${JSON.stringify(expected)},queries=${JSON.stringify(queries)},pages=${JSON.stringify(pages)},manifestUrl=${JSON.stringify(origin + base + 'raveldex/manifest.json')};let comparisons=0;const formats=[];
function compare(actual,wanted){assert.equal(actual.total,wanted.total);assert.equal(actual.completeness,'complete');assert.deepEqual(actual.hits.map(h=>h.id),wanted.hits.map(h=>h.id));for(let i=0;i<actual.hits.length;i++)assert.ok(Math.abs(actual.hits[i].score-wanted.hits[i].score)<=Math.max(1e-12,Math.abs(wanted.hits[i].score)*1e-12));}
for(const format of ['source','native']){const handle=await loadStaticSearch({manifestUrl,expectedBuildId:${JSON.stringify(fixture.buildId)},configuration:configuration(),format,...(format==='native'?{nativeQualification:qualification()}:{})});try{for(let q=0;q<queries.length;q++)for(let p=0;p<pages.length;p++){compare(await handle.engine.search(queries[q],pages[p]),expected[q][p]);comparisons++;}const docs=await handle.loadDocuments();assert.equal(docs.length,3);assert.ok(docs.every(doc=>doc.url.startsWith(${JSON.stringify(base + 'guide/')})));formats.push({format,recordCount:handle.manifest.recordCount,documents:docs.map(doc=>({id:doc.id,url:doc.url}))});}finally{await handle.dispose();}}
const failures=[];for(const [name,changes,expectedCode,reason]of [['stale',{expectedBuildId:'stale'},'STALE_BUILD'],['missing',{manifestUrl:${JSON.stringify(origin + base + 'missing/raveldex/manifest.json')}},'MISSING_ARTIFACT'],['configuration',{configuration:{...configuration(),schema:{text:{title:{boost:3},body:{}}}}},'INCOMPATIBLE_ARTIFACT'],['native-profile',{format:'native',nativeQualification:{...qualification(),profileId:'other-profile'}},'INCOMPATIBLE_CAPABILITY','PROFILE_MISMATCH']]){await assert.rejects(loadStaticSearch({manifestUrl,expectedBuildId:${JSON.stringify(fixture.buildId)},configuration:configuration(),...changes}),error=>{assert.equal(error.code,expectedCode);if(reason)assert.equal(error.reason,reason);failures.push({name,code:error.code,reason:error.reason});return true;});}console.log(JSON.stringify({status:'Pass',comparisons,formats,failures,scope:'Actual HTTP source rebuild and exact-current-Node native artifact restore. No cross-host/browser-native portability.'}));`;
  await writeFile(join(directory, `node-${base === '/' ? 'root' : 'base'}-probe.mjs`), code);
  return JSON.parse((await command(process.execPath, [base === '/' ? 'node-root-probe.mjs' : 'node-base-probe.mjs'], directory)).stdout);
}
async function hookOwnershipProbe(directory, site, fixture) {
  const output = join(directory, 'hook-ownership-output'); await mkdir(output);
  const code = `import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{pathToFileURL}from'node:url';import raveldexAstro from'@vmitsaras/raveldex-astro';import{configuration}from ${JSON.stringify(pathToFileURL(join(site,'configuration.mjs')).href)};import{qualification}from ${JSON.stringify(pathToFileURL(join(site,'qualification.mjs')).href)};const conf=configuration();conf.limits={maxHits:2};const qualified=qualification(),initial=structuredClone(qualified);let calls=0;const input={configuration:conf,nativeQualification:qualified,buildId:'capture-original',getEntries(){calls++;return ${JSON.stringify(fixture.entries.map(({record,title,path})=>({record,title,path})))}}};const integration=raveldexAstro(input);assert.equal(calls,0);conf.limits.maxHits=3;qualified.profileId='capture-mutated';qualified.evidence[0]='capture-mutated';input.buildId='capture-mutated';input.getEntries=()=>{throw Error('replacedcallback')};await integration.hooks['astro:config:done']({config:{output:'static',base:'/',build:{format:'directory'}},buildOutput:'static'});await integration.hooks['astro:build:done']({dir:pathToFileURL(${JSON.stringify(output+'/')}),logger:{info(){}}});const manifest=JSON.parse(await readFile(${JSON.stringify(join(output,'raveldex/manifest.json'))},'utf8')),snapshot=JSON.parse(await readFile(${JSON.stringify(join(output,'raveldex/'))}+manifest.assets.native.file,'utf8'));assert.equal(manifest.buildId,'capture-original');assert.equal(snapshot.body.header.limits.maxHits,2);assert.equal(snapshot.body.header.nativeQualification.profileId,initial.profileId);assert.deepEqual(snapshot.body.header.nativeQualification.evidence,initial.evidence);assert.equal(calls,1);let getters=0;const schema={};Object.defineProperty(schema,'text',{enumerable:true,get(){getters++;return{body:{}}}});assert.throws(()=>raveldexAstro({configuration:{schema},buildId:'getters',getEntries:()=>[]}),{code:'INVALID_INPUT'});assert.equal(getters,0);console.log(JSON.stringify({status:'Pass',capturedMaxHits:2,capturedQualification:initial,buildId:manifest.buildId,trustedCallbackCalls:calls,getterCalls:getters,scope:'Actual installed public hook direct lifecycle ownership regression; genuine Astro builds are separate.'}));`;
  await writeFile(join(directory,'hook-ownership-probe.mjs'),code);
  const result=await command(process.execPath,['hook-ownership-probe.mjs'],directory);await writeFile(join(directory,'hook-ownership-probe.log'),result.stdout+result.stderr);
  return JSON.parse(result.stdout);
}
async function browserProbe(browser, origin, base, expected, fixture) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' }), page = await context.newPage(), requested = [], pageErrors = [], externalRequests = [];
  page.on('request', request => { const url = request.url(); if (!url.startsWith(origin)) externalRequests.push(url); if (url.includes('/raveldex/')) requested.push(new URL(url).pathname); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  const observations = []; let comparisons = 0;
  try {
    await page.goto(origin + base); await page.waitForFunction(() => document.body.dataset.searchState === 'idle');
    assert.equal(requested.length, 0, 'No import/page-startup artifact request');
    await page.route('**/raveldex/manifest.json', route => route.fulfill({ status: 404, body: '' }));
    await page.getByRole('button', { name: 'Load search data', exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.searchState === 'failed');
    assert.match(await page.locator('#fixture-status').innerText(), /MISSING_ARTIFACT/); assert.equal(await page.locator('[data-authored-fallback]').isVisible(), true);
    await page.unroute('**/raveldex/manifest.json');
    await page.getByRole('button', { name: 'Load search data', exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.searchState === 'ready');
    const initialAssets = [...requested]; assert.equal(initialAssets.filter(path => path.includes('documents-')).length, 0); assert.equal(initialAssets.filter(path => path.includes('source-')).length, 1);
    for (let q = 0; q < queries.length; q++) for (let p = 0; p < pages.length; p++) {
      const actual = await page.evaluate(({ query, options }) => window.raveldexAstroFixture.search(query, options), { query: queries[q], options: pages[p] });
      compare(actual, expected[q][p], `Browser actual native source results at ${base}`); comparisons++;
    }
    const native = await page.evaluate(() => window.raveldexAstroFixture.native());
    assert.equal(native.reason, 'UNQUALIFIED_PROFILE'); assert.equal(native.unexpectedlyLoaded, undefined);
    observations.push({ name: 'explicit loading and failure recovery', initialAssets, optionalDisplayRequestsBeforeOpen: 0, nativeBrowserRefusal: native });
    let acknowledge, releaseDisplay;
    const heldDisplay = new Promise(resolve => { acknowledge = resolve; }), displayGate = new Promise(resolve => { releaseDisplay = resolve; });
    await page.route('**/documents-*.json', async route => { acknowledge(); await displayGate; try { await route.continue(); } catch { /* The unloaded owner's request was explicitly aborted. */ } });
    await page.getByRole('button', { name: 'Open search', exact: true }).click(); await heldDisplay;
    assert.equal(await page.evaluate(() => window.raveldexAstroFixture.pendingOpen()), 1);
    await page.getByRole('button', { name: 'Unload search data', exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.searchState === 'unloaded' && window.raveldexAstroFixture.pendingOpen() === 0);
    assert.equal(await page.getByRole('button', { name: 'Open search', exact: true }).isDisabled(), true); assert.equal(await page.getByRole('searchbox').count(), 0);
    assert.equal(await page.evaluate(() => window.raveldexAstroFixture.fallbackRestored()), true);
    observations[0].delayedDisplayUnload = { status: 'Pass', pendingOpenSettled: true, state: await page.locator('body').getAttribute('data-search-state'), openDisabled: true, authoredFallbackRestored: true, visibleStatus: await page.locator('#fixture-status').innerText(), scope: 'Actual intercepted pending display read, lifetime abort, and stale wrapper completion; no fabricated result.' };
    releaseDisplay(); await page.unroute('**/documents-*.json');
    await page.getByRole('button', { name: 'Load search data', exact: true }).click(); await page.waitForFunction(() => document.body.dataset.searchState === 'ready');
    const cancelledDisplayRequests = requested.filter(path => path.includes('documents-')).length;
    assert.equal(cancelledDisplayRequests, 1);
    await page.getByRole('button', { name: 'Open search', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
    assert.equal(requested.filter(path => path.includes('documents-')).length, cancelledDisplayRequests + 1);
    const input = page.getByRole('searchbox', { name: 'Search documentation', exact: true }); assert.equal(await input.count(), 1);
    await input.fill('atomic'); await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-raveldex-status]')?.textContent === '1 results. Showing 1–1.');
    assert.equal(await input.evaluate(node => node === document.activeElement), true);
    assert.deepEqual(await page.locator('[data-raveldex-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult)), ['guide:atomic']);
    const actualResultLink = page.locator('[data-raveldex-result-title]').first();
    assert.equal(await actualResultLink.getAttribute('href'), origin + base + 'guide/atomic/');
    await page.locator('[data-raveldex-inspect]').click(); await page.waitForFunction(() => document.querySelector('dialog')?.open === true);
    assert.equal(await page.locator('[data-raveldex-inspector-close]').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Tab');
    const modalTab = await page.evaluate(() => ({ documentHasFocus: document.hasFocus(), activeTag: document.activeElement.tagName, dialogContains: document.querySelector('dialog').contains(document.activeElement) }));
    assert.ok(!modalTab.documentHasFocus || modalTab.dialogContains, 'Native Tab must not focus another page control; browser chrome remains a separate host surface');
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.locator('dialog').evaluate(node => node.contains(document.activeElement)), true);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog').open); assert.equal(await page.locator('[data-raveldex-inspect]').evaluate(node => node === document.activeElement), true);
    await page.getByRole('button', { name: 'Inject next search error', exact: true }).click(); await input.focus(); await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-raveldex-status]')?.textContent === 'Search failed. Retry is available.');
    assert.equal(await input.evaluate(node => node === document.activeElement), true);
    await page.getByRole('button', { name: 'Retry search', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-raveldex-status]')?.textContent === '1 results. Showing 1–1.');
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.addScriptTag({ content: axe.source }); const audit = await page.evaluate(async () => {
      const value = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return { violations: value.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.length })), passes: value.passes.length, incomplete: value.incomplete.map(item => item.id) };
    });
    assert.deepEqual(audit.violations, []);
    await page.getByRole('button', { name: 'Close search', exact: true }).click();
    assert.equal(await page.evaluate(() => window.raveldexAstroFixture.fallbackRestored()), true); assert.equal(await page.getByRole('searchbox').count(), 0);
    await page.getByRole('button', { name: 'Open search', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
    assert.equal(requested.filter(path => path.includes('documents-')).length, cancelledDisplayRequests + 2, 'Explicit display calls are not implicitly cached');
    await page.getByRole('button', { name: 'Unload search data', exact: true }).click(); await page.waitForFunction(() => document.body.dataset.searchState === 'unloaded');
    assert.equal(await page.evaluate(() => window.raveldexAstroFixture.fallbackRestored()), true);
    observations.push({ name: 'existing native UI and cleanup', focusRetained: true, labelledSearchbox: true, inspectorEscapeRestore: true, nativeTabObservation: { ...modalTab, classification: 'Observation: browser chrome outside document is not a custom focus-trap pass' }, typedErrorRetry: true, authoredFallbackRestored: true, narrowViewport: 320, reducedMotion: true, axe: audit });
    await page.getByRole('button', { name: 'Load search data', exact: true }).click(); await page.waitForFunction(() => document.body.dataset.searchState === 'ready');
    await page.getByRole('button', { name: 'Open search', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
    await page.getByRole('searchbox', { name: 'Search documentation', exact: true }).fill('atomic');
    await page.waitForFunction(() => document.querySelector('[data-raveldex-status]')?.textContent === '1 results. Showing 1–1.');
    await page.locator('[data-raveldex-result-title]').first().click(); await page.waitForURL(origin + base + 'guide/atomic/');
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Atomic publication');
    assert.equal(await page.locator('[data-document-body]').innerText(), fixture.entries.find(entry => entry.slug === 'atomic').record.text.body);
    await page.getByRole('link', { name: 'Back to documentation search', exact: true }).click(); await page.waitForURL(origin + base);
    await page.waitForFunction(() => document.body.dataset.searchState === 'idle');
    await page.goto(origin + base + 'guide/draft/'); assert.match(await page.locator('[data-document-body]').innerText(), /marzipanprivate/);
    assert.ok(requested.every(path => path.startsWith(base + 'raveldex/')));
    assert.deepEqual(pageErrors, []); assert.deepEqual(externalRequests, []);
    observations.push({ name: 'actual rendered source navigation and excluded draft', destination: origin + base + 'guide/atomic/', excludedDraftRendered: true, excludedQueryTotal: expected[4][0].total, requestsSameDeploymentBase: true });
    return { status: 'Pass', base, comparisons, requested, observations, pageErrors, externalRequests, scope: 'Finite recorded headless browser automation, semantic/keyboard/axe evidence; see environment for the selected browser. Not speech, physical input, broad browser qualification or latency/allocation/copy peaks.' };
  } catch(error) { error.browserObservation={base,comparisons,requested,pageErrors,externalRequests,observations,url:page.url(),status:await page.locator('#fixture-status').textContent().catch(()=>undefined)};throw error; } finally { await context.close(); }
}

export async function measurePackedAstro() {
  const fixture = await readJSON(join(fixtureSource, 'content.json')), provenance = await readJSON(join(fixtureSource, 'content-provenance.json'));
  for (const item of provenance.selections) { assert.ok((await readFile(join(REPO_ROOT, item.source), 'utf8')).includes(item.body)); assert.equal(digest(item.body), item.paragraphSha256); }
  const corpus = { schema: { text: { title: { boost: 2 }, body: {} } }, records: fixture.entries.map(entry => entry.record) }, model = scanSourceCorpus(corpus.records, corpus.schema), expected = queries.map(query => pages.map(page => sourceQueryResult(model, query, page)));
  const consumer = await prepareConsumer(corpus, []); let browser;
  try {
    const integration = await packAstro({ output: join(consumer.directory, 'astro-package') });
    await command('npm', ['install', integration.tarball, '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--cache', join(consumer.directory, '.npm-cache')], consumer.directory);
    const installed = join(consumer.directory, 'node_modules/@vmitsaras/raveldex-astro'); assert.equal(await realpath(installed), installed, 'Actual standalone integration tarball; no workspace symlink'); assert.equal(await realpath(consumer.installed), consumer.installed);
    const astroDirectory = join(REPO_ROOT, 'node_modules/astro'), astroMetadata = await readJSON(join(astroDirectory, 'package.json')); assert.equal(astroMetadata.version, '7.3.2');
    await symlink(astroDirectory, join(consumer.directory, 'node_modules/astro'), 'dir');
    const declarations = await declarationCheck(consumer.directory);
    const core = await bundleConsumer(consumer.directory), previous = (await readJSON(join(REPO_ROOT, 'docs/evidence/RX-A090-package.json'))).core;
    for (const key of ['minifiedBytes', 'gzipBytes', 'sha256', 'gzipSha256']) assert.equal(core[key], previous[key], `Core byte unchanged ${key}`);
    const graphs = { client: await graph(consumer.directory, 'astro-client', "export {loadStaticSearch,StaticSearchError,STATIC_SEARCH_ERROR_CODES} from '@vmitsaras/raveldex-astro/client';"), builder: await graph(consumer.directory, 'astro-builder', "export {buildStaticSearch,StaticSearchError,STATIC_SEARCH_ERROR_CODES} from '@vmitsaras/raveldex-astro/build';"), hook: await graph(consumer.directory, 'astro-hook', "export {default} from '@vmitsaras/raveldex-astro';", 'node') };
    assert.ok(graphs.client.inputs.every(item => !/\/astro\/|\/src\/index\.js|\/dist\/index\.js$/.test(item.path.replace('node_modules/@vmitsaras/raveldex/dist/index.js', 'core-public-index'))));
    const startup = [];
    for (const entry of ['@vmitsaras/raveldex-astro', '@vmitsaras/raveldex-astro/build', '@vmitsaras/raveldex-astro/client', './astro-client-bundle.mjs']) startup.push(await inert(consumer.directory, entry));
    const readme = await readFile(join(installed, 'README.md'), 'utf8'), example = /```js\n([\s\S]*?)\n```/.exec(readme)?.[1]; assert.ok(example); await writeFile(join(consumer.directory, 'documented-astro.mjs'), example); const documentation = await command(process.execPath, ['documented-astro.mjs'], consumer.directory); assert.equal(documentation.stdout, '1 /docs/\n');
    const astroBin = join(astroDirectory, typeof astroMetadata.bin === 'string' ? astroMetadata.bin : astroMetadata.bin.astro);
    const channel = process.env.RAVELDEX_CANDIDATE_BROWSER ?? 'chrome';
    assert.ok(['chrome', 'chromium'].includes(channel), 'RAVELDEX_CANDIDATE_BROWSER is chrome or chromium');
    browser = await chromium.launch({ ...(channel === 'chrome' ? { channel } : {}), headless: true }); const builds = []; let hookOwnership;
    for (const base of ['/', '/docs/']) {
      const site = join(consumer.directory, base === '/' ? 'site-root' : 'site-base'); await cp(fixtureSource, site, { recursive: true });
      const built = await exec(process.execPath, [astroBin, 'build', '--root', site], { cwd: consumer.directory, env: { ...process.env, RAVELDEX_ASTRO_BASE: base, ASTRO_TELEMETRY_DISABLED: '1' }, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
      await writeFile(join(site,'build.log'),built.stdout+built.stderr);
      if(base==='/')hookOwnership=await hookOwnershipProbe(consumer.directory,site,fixture);
      const output = join(site, 'dist'), generated = await files(output), server = await serve(output, base);
      try {
        const manifest = await readJSON(join(output, 'raveldex/manifest.json')); assert.equal(manifest.base, base); assert.equal(manifest.recordCount, 3); assert.ok(manifest.assets.native);
        const node = await nodeProbe(consumer.directory, site, server.origin, base, expected, fixture);await writeFile(join(site,'node-probe.json'),JSON.stringify(node,null,2)+'\n');
        let browsing;try{browsing=await browserProbe(browser,server.origin,base,expected,fixture)}catch(error){await writeFile(join(site,'browser-failure.json'),JSON.stringify(error.browserObservation??{error:String(error)},null,2)+'\n');throw error;}
        await writeFile(join(site,'browser-probe.json'),JSON.stringify(browsing,null,2)+'\n');
        builds.push({ base, status: 'Pass', directory: output, manifest, generated, buildLog: built.stdout + built.stderr, node, browser: browsing, actualHTTPRequests: server.requests });
      } finally { await server.close(); }
    }
    // A public file copied into the reserved namespace must survive failed hook admission unchanged.
    const collision = join(consumer.directory, 'site-collision'); await cp(fixtureSource, collision, { recursive: true }); await mkdir(join(collision, 'public/raveldex'), { recursive: true }); await writeFile(join(collision, 'public/raveldex/owner.txt'), 'human-owned reserved namespace witness\n');
    let refused;
    try { await exec(process.execPath, [astroBin, 'build', '--root', collision], { cwd: consumer.directory, env: { ...process.env, RAVELDEX_ASTRO_BASE: '/', ASTRO_TELEMETRY_DISABLED: '1' }, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }); } catch (error) { refused = error; }
    assert.ok(refused); assert.match(refused.stdout + refused.stderr, /INVALID_INPUT/); assert.equal(await readFile(join(collision, 'dist/raveldex/owner.txt'), 'utf8'), 'human-owned reserved namespace witness\n');
    await assert.rejects(stat(join(collision, 'dist/raveldex/manifest.json')), { code: 'ENOENT' });
    return { kind: 'raveldex-astro-package-v1', status: 'Pass', environment: { node: process.version, platform: process.platform, arch: process.arch, astro: astroMetadata.version, browser: browser.version(), browserChannel: channel, developerTool: 'Exact pinned Astro devtool linked to this isolated consumer; core/integration are independent real installed tarballs. ASTRO_TELEMETRY_DISABLED=1.' }, consumerDirectory: consumer.directory, corePackage: consumer.package, integrationPackage: integration.report.package, declarations, core, coreUnchanged: { status: 'Pass', baseline: 'docs/evidence/RX-A090-package.json' }, graphs, startup, documentation: { status: 'Pass', exampleSha256: digest(example), stdout: documentation.stdout, scope: 'Exact first installed standalone README JavaScript fence executed unchanged' }, corpus: { records: fixture.entries.length, sha256: digest(JSON.stringify(corpus)), provenance }, queries, pages, correctness: { status: 'Pass', builds: 2, browserComparisons: builds.reduce((n, item) => n + item.browser.comparisons, 0), nodeSourceNativeComparisons: builds.reduce((n, item) => n + item.node.comparisons, 0), frameworkBuild: 'Genuine pinned Astro static build, not a fake hook invocation', expectedTruth: 'Independent original-source token scan and native BM25 arithmetic; no production builder/loader/tokenizer/scorer supplies expected results' }, builds, hookOwnership, collision: { status: 'Pass', explicitHookRefusal: 'INVALID_INPUT', userWitnessPreserved: true, manifestWritten: false, actualBuildOutput: refused.stdout + refused.stderr }, limitations: ['One finite selected-browser automation and exact-current-Node qualification; not new physical AT/cross-browser/native portability support.', 'Bundle graphs overlap; bytes are not heap/allocation/transport-copy peaks or latency.', 'No publication, remote write, deployment or automatic content discovery performed.'] };
  } finally { await browser?.close(); if (process.env.RAVELDEX_ASTRO_KEEP_CONSUMER !== '1') await rm(consumer.directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await measurePackedAstro(); if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, correctness: report.correctness, environment: report.environment, core: { minifiedBytes: report.core.minifiedBytes, gzipBytes: report.core.gzipBytes }, graphs: Object.fromEntries(Object.entries(report.graphs).map(([name, graph]) => [name, { minifiedBytes: graph.minifiedBytes, gzipBytes: graph.gzipBytes }])) }));
}
