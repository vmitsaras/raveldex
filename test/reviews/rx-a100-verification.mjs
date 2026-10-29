import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, relative, extname } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import raveldexAstro from '../../integrations/astro/dist/index.js';
import { createRaveldex } from '../../dist/index.js';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { currentNodeSnapshotEnvironment } from '../../dist/adapters/snapshots/index.js';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { packAstro } from '../../scripts/pack-astro.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const readJSON = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const exec = promisify(execFile), observations = [], temporaries = [];
const probes = [];
const inspect = (name, task) => probes.push([name, task]);
const makeTemp = async () => { const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'raveldex-rx-a100-verification-'))); temporaries.push(directory); return directory; };
const source = () => ({ schema: { text: { body: {} } }, limits: { maxHits: 2 }, addons: [createSourceProvider({ fields: ['body'] })] });
const entries = [{ record: { id: 'atomic', text: { body: 'atomic commits retain one revision' } }, title: 'Atomic', path: '/atomic/' }];
function configure(integration, base = '/') { integration.hooks['astro:config:done']({ config: { output: 'static', base, build: { format: 'directory' } }, buildOutput: 'static' }); }
async function complete(integration, directory) { return integration.hooks['astro:build:done']({ dir: pathToFileURL(directory + '/'), logger: { info() {} } }); }
async function artifact(directory) {
  const manifest = await readJSON(join(directory, 'raveldex/manifest.json'));
  const encoded = await readJSON(join(directory, 'raveldex', manifest.assets.source.file));
  return { manifest, header: encoded.body.header, records: encoded.body.payload.records };
}

inspect('Hook factories own constant configuration/qualification while deferring the trusted content callback', async () => {
  const directory = await makeTemp(), configuration = source(), qualification = { profileId: 'review-initial', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['before'] }; let called = 0;
  const options = { configuration, nativeQualification: qualification, buildId: 'captured-build', getEntries() { called++; return entries; } };
  const integration = raveldexAstro(options); assert.equal(called, 0); configure(integration, '/docs'); assert.equal(called, 0);
  configuration.limits.maxHits = 3; qualification.profileId = 'review-mutated'; qualification.evidence[0] = 'after'; options.buildId = 'later-build'; options.getEntries = () => { throw Error('replaced callback'); };
  await complete(integration, directory); const { manifest, header } = await artifact(directory);
  assert.equal(called, 1); assert.equal(manifest.buildId, 'captured-build'); assert.equal(manifest.base, '/docs/'); assert.equal(header.limits.maxHits, 2); assert.equal(header.analyzer.environmentProfile, 'review-initial'); assert.deepEqual(header.nativeQualification.evidence, ['before']);
  return { callbackBeforeBuild: 0, callbackAtBuild: called, maxHits: header.limits.maxHits, profile: header.analyzer.environmentProfile, evidence: header.nativeQualification.evidence, outerPrimitiveAndHandleCaptured: true };
});

inspect('No callback or participant initialization happens before build and unsafe factory/configuration input rejects', async () => {
  let calls = 0, initialized = 0, accessors = 0;
  const addon = createSourceProvider({ fields: ['body'] }), provider = { ...addon, participant: { ...addon.participant, initialize(...args) { initialized++; return addon.participant.initialize(...args); } } };
  const options = { configuration: { schema: { text: { body: {} } }, addons: [provider] }, buildId: 'deferred', getEntries() { calls++; return entries; } };
  const integration = raveldexAstro(options); assert.equal(calls, 0); assert.equal(initialized, 0); configure(integration); assert.equal(calls, 0); assert.equal(initialized, 0);
  const hostile = { ...options }; Object.defineProperty(hostile, 'getEntries', { get() { accessors++; return options.getEntries; } });
  assert.throws(() => raveldexAstro(hostile), { code: 'INVALID_INPUT' });
  const nested = { ...options, configuration: { schema: { text: { body: {} } } } }; Object.defineProperty(nested.configuration.schema.text.body, 'boost', { get() { accessors++; return 1; } });
  assert.throws(() => raveldexAstro(nested), { code: 'INVALID_INPUT' }); assert.equal(accessors, 0);
  for (const [output, buildOutput, format, base] of [['server', 'server', 'directory', '/'], ['static', 'server', 'directory', '/'], ['static', 'static', 'file', '/'], ['static', 'static', 'directory', '/../'], ['static', 'static', 'directory', '//other/'], ['static', 'static', 'directory', '/bad%2f/']]) {
    const rejected = raveldexAstro(options); assert.throws(() => rejected.hooks['astro:config:done']({ config: { output, base, build: { format } }, buildOutput }), { code: 'INVALID_INPUT' });
  }
  assert.equal(calls, 0); assert.equal(initialized, 0);
  return { callbackCalls: calls, participantInitializations: initialized, executedAccessors: accessors, rejectedStaticModesOrBases: 6 };
});

inspect('Complete artifacts are content addressed and the manifest is the final exclusive write', async () => {
  const directory = await makeTemp(), witness = join(directory, 'human.html'); await fs.writeFile(witness, 'outside namespace\n');
  const writes = [], original = fs.writeFile;
  fs.writeFile = async function(path, data, options) { writes.push({ path: String(path), flag: options?.flag }); return original.call(this, path, data, options); };
  syncBuiltinESMExports();
  try { const integration = raveldexAstro({ configuration: source(), getEntries: () => entries, buildId: 'complete' }); configure(integration); await complete(integration, directory); }
  catch (error) { if (error.code !== 'INVALID_INPUT') throw error; throw error; }
  finally { fs.writeFile = original; syncBuiltinESMExports(); }
  assert.ok(writes.length >= 3, 'actual ESM builtin instrumentation received writes'); assert.equal(writes.at(-1).path, join(directory, 'raveldex/manifest.json')); assert.ok(writes.every(row => row.flag === 'wx'));
  const { manifest, records } = await artifact(directory); assert.equal(manifest.recordCount, 1); assert.equal(records[0].id, 'atomic'); assert.equal(await fs.readFile(witness, 'utf8'), 'outside namespace\n');
  for (const [role, item] of Object.entries(manifest.assets)) { const raw = await fs.readFile(join(directory, 'raveldex', item.file)); assert.equal(raw.length, item.bytes); assert.equal(digest(raw), item.sha256); assert.equal(item.file, `${role}-${item.sha256}.json`); }
  return { actualWrites: writes.map(row => ({ file: relative(directory, row.path), flag: row.flag })), manifestLast: true, outsideWitnessUnchanged: true };
});

inspect('Existing directories/files/symlinks and failed application records preserve all outside files', async () => {
  const outcomes = [];
  for (const kind of ['directory', 'file', 'symlink']) {
    const directory = await makeTemp(), external = await makeTemp(), namespace = join(directory, 'raveldex'), witness = kind === 'file' ? namespace : join(kind === 'symlink' ? external : namespace, 'witness.txt');
    if (kind === 'directory') await fs.mkdir(namespace);
    if (kind === 'symlink') await fs.symlink(external, namespace, 'dir');
    await fs.writeFile(witness, 'keep\n');
    const integration = raveldexAstro({ configuration: source(), getEntries: () => entries, buildId: 'collision' }); configure(integration);
    await assert.rejects(complete(integration, directory), { code: 'INVALID_INPUT' }); assert.equal(await fs.readFile(witness, 'utf8'), 'keep\n');
    if (kind !== 'file') await assert.rejects(fs.stat(join(namespace, 'manifest.json')), { code: 'ENOENT' });
    outcomes.push({ kind, witnessUnchanged: true });
  }
  const bad = await makeTemp(); await fs.writeFile(join(bad, 'outside.txt'), 'preserved');
  const integration = raveldexAstro({ configuration: source(), getEntries: () => [{ ...entries[0], record: { id: 'atomic', text: { body: null } } }], buildId: 'invalid-record' }); configure(integration);
  await assert.rejects(complete(integration, bad), { code: 'INVALID_RECORD' }); assert.deepEqual(await fs.readdir(bad), ['outside.txt']);
  return { refused: outcomes, invalidRecordCreatedNamespace: false };
});

inspect('A real second-content-write failure never creates a manifest or overwrites the authored page', async () => {
  const directory = await makeTemp(), witness = join(directory, 'outside.txt'); await fs.writeFile(witness, 'unmodified');
  const original = fs.writeFile; let calls = 0;
  fs.writeFile = async function(path, data, options) { if (++calls === 2) { const error = Error('injected disk failure'); error.code = 'EIO'; throw error; } return original.call(this, path, data, options); }; syncBuiltinESMExports();
  try { const integration = raveldexAstro({ configuration: source(), getEntries: () => entries, buildId: 'write-failure' }); configure(integration); await assert.rejects(complete(integration, directory), { code: 'INVALID_ARTIFACT' }); }
  finally { fs.writeFile = original; syncBuiltinESMExports(); }
  assert.equal(calls, 2); await assert.rejects(fs.stat(join(directory, 'raveldex/manifest.json')), { code: 'ENOENT' }); assert.equal(await fs.readFile(witness, 'utf8'), 'unmodified');
  return { injectedWrite: 2, partialContentFiles: (await fs.readdir(join(directory, 'raveldex'))).length, manifestPresent: false, outsideWitnessUnchanged: true };
});

/** Independent ASCII character boundary scanner for the three actual prose
 * selections. It does not call production/test tokenizer, scorer or adapter. */
function words(text) { const out = []; let token = ''; for (const char of text) { const point = char.codePointAt(0), letter = point >= 65 && point <= 90 || point >= 97 && point <= 122 || point >= 48 && point <= 57; if (letter) token += char.toLowerCase(); else if (token) { out.push(token); token = ''; } } if (token) out.push(token); return out; }
function expected(records, query, page) {
  const names = ['body', 'title'], boosts = { title: 2, body: 1 };
  const tokens = new Map(records.map(record => [record.id, Object.fromEntries(names.map(name => [name, words(record.text[name] ?? '')]))]));
  function term(id, word) { let result = 0; for (const field of names) { const present = records.filter(record => tokens.get(record.id)[field].length), own = tokens.get(id)[field], tf = own.filter(value => value === word).length; if (!tf) continue; const N = present.length, df = present.filter(record => tokens.get(record.id)[field].includes(word)).length, average = present.reduce((sum, record) => sum + tokens.get(record.id)[field].length, 0) / N; result += boosts[field] * Math.log(1 + (N - df + 0.5) / (df + 0.5)) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * own.length / average)); } return result; }
  function match(node, id) {
    if (typeof node === 'string' || node.kind === 'text') { const selected = [...new Set(words(typeof node === 'string' ? node : node.text))], matches = selected.length > 0 && selected.every(word => names.some(field => tokens.get(id)[field].includes(word))); return { matches, groups: matches ? new Set(selected) : new Set() }; }
    if (node.kind === 'all' || node.kind === 'none') return { matches: node.kind === 'all', groups: new Set() };
    if (node.kind === 'not') return { matches: !match(node.child, id).matches, groups: new Set() };
    const children = node.children.map(child => match(child, id)), matches = node.kind === 'and' ? children.every(child => child.matches) : children.some(child => child.matches);
    return { matches, groups: matches ? new Set(children.filter(child => child.matches).flatMap(child => [...child.groups])) : new Set() };
  }
  const rows = records.map(record => { const row = match(query, record.id); return { id: record.id, ...row }; }).filter(row => row.matches).map(row => ({ id: row.id, score: [...row.groups].sort().reduce((sum, word) => sum + term(row.id, word), 0) })).sort((a,b) => b.score-a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { total: rows.length, hits: rows.slice(page.offset ?? 0, (page.offset ?? 0) + page.limit) };
}
function compare(actual, wanted) { assert.equal(actual.total, wanted.total); assert.deepEqual(actual.hits.map(row=>row.id), wanted.hits.map(row=>row.id)); for (let i=0;i<wanted.hits.length;i++) assert.ok(Math.abs(actual.hits[i].score-wanted.hits[i].score)<=Math.max(1e-12,Math.abs(wanted.hits[i].score)*1e-12)); }
inspect('Actual prose expected results and test oracle agree with independently reconstructed field statistics and Boolean arithmetic', async () => {
  const content = await readJSON(join(root, 'examples/astro/content.json')), provenance = await readJSON(join(root, 'examples/astro/content-provenance.json'));
  for (const row of provenance.selections) { assert.ok((await fs.readFile(join(root,row.source),'utf8')).includes(row.body)); assert.equal(digest(row.body),row.paragraphSha256); }
  const schema = { text: { title: { boost:2 }, body:{} } }, records=content.entries.map(row=>row.record), oracle=scanSourceCorpus(records,schema), engine=createRaveldex({schema}); let pages=0;
  const queries=['atomic','original','records','native','marzipanprivate','constant time','source','empty',{kind:'all'},{kind:'none'},{kind:'not',child:{kind:'text',text:'atomic'}},{kind:'or',children:[{kind:'text',text:'atomic'},{kind:'text',text:'records'}]}];
  try { await engine.addMany(records); for(const query of queries) for(const page of [{limit:100},{limit:0},{offset:1,limit:2}]) { const wanted=expected(records,query,page);compare(sourceQueryResult(oracle,query,page),wanted);compare(await engine.search(query,page),wanted);pages++; } } finally { await engine.dispose(); }
  assert.equal(pages,36);assert.equal(content.entries.length,3);return { actualProseParagraphs:3, declaredProvenanceSelections:provenance.selections.length, independentQueries:queries.length, completePages:pages, comparisons:pages*2, expectedMethod:'Separate ASCII character loop, field-local N/DF/TF/length/boost statistics and BM25, explicit Boolean groups; no production or test tokenizer/scorer supplies expected truth' };
});

inspect('Pack output guards and public emitted declarations preserve independent package and framework boundaries', async () => {
  const existing=await makeTemp();await fs.writeFile(join(existing,'witness.txt'),'unchanged');await assert.rejects(packAstro({output:existing}));assert.equal(await fs.readFile(join(existing,'witness.txt'),'utf8'),'unchanged');
  const linkParent=await makeTemp(),target=await makeTemp(),link=join(linkParent,'output');await fs.symlink(target,link,'dir');await fs.writeFile(join(target,'witness.txt'),'outside');await assert.rejects(packAstro({output:link}));assert.equal(await fs.readFile(join(target,'witness.txt'),'utf8'),'outside');
  const metadata=await readJSON(join(root,'integrations/astro/package.json'));assert.equal(metadata.private,true);assert.deepEqual(metadata.dependencies??{},{});assert.deepEqual(metadata.peerDependencies,{'@vmitsaras/raveldex':'0.1.0-rc.0',astro:'7.3.2'});assert.deepEqual(metadata.peerDependenciesMeta,{astro:{optional:true}});
  for(const name of ['build','client','index']) {const declaration=await fs.readFile(join(root,'integrations/astro/dist',name+'.d.ts'),'utf8');assert.doesNotMatch(declaration,/(?:from|import\s*\()\s*['"](?:\.\.\/|\/)/);if(name!=='index')assert.doesNotMatch(declaration,/from ['"]astro['"]|node:/);}
  const core=await readJSON(join(root,'package.json'));assert.equal(core.private,true);assert.deepEqual(core.dependencies??{},{});assert.ok(!Object.keys(core.exports).some(name=>name.includes('astro')));
  return { outputCollisionRefusals:2, originalWitnessesPreserved:true, integrationRuntimeDependencies:0, exactCorePeer:true, optionalAstroPeer:true, coreRuntimeDependencies:0, newCoreAstroExport:false };
});


inspect('Actual new Astro build suppresses delayed Open callbacks after Unload and permits normal recovery', async () => {
  const reportPath=process.env.RAVELDEX_ASTRO_REVIEW_PACKAGE_REPORT??'/tmp/raveldex-rx-a100-package-initial.json',report=await readJSON(reportPath),directory=report.builds.find(item=>item.base==='/').directory;
  const server=createServer(async(req,res)=>{try{let target=resolve(directory,'.'+new URL(req.url,'http://fixture.invalid').pathname);if(!(target===directory||target.startsWith(directory+'/'))){res.writeHead(403).end();return}if((await fs.stat(target)).isDirectory())target=join(target,'index.html');const raw=await fs.readFile(target);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'}[extname(target)]??'application/octet-stream'}).end(raw)}catch{res.writeHead(404).end()}});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes)});const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});let release;
  try{const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.goto(origin+'/');await page.getByRole('button',{name:'Load search data',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.searchState==='ready');let started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);await page.route('**/raveldex/documents-*.json',async route=>{started();await gate;await route.continue().catch(()=>{})});await page.getByRole('button',{name:'Open search',exact:true}).click();await ready;await page.getByRole('button',{name:'Unload search data',exact:true}).click();await page.waitForFunction(()=>window.raveldexAstroFixture.pendingOpen()===0);const result=await page.evaluate(()=>({state:document.body.dataset.searchState,status:document.querySelector('#fixture-status').textContent,openDisabled:document.querySelector('#open-search').disabled,unloadDisabled:document.querySelector('#unload-search').disabled,loadDisabled:document.querySelector('#load-search').disabled,searchboxes:document.querySelectorAll('input[type=search]').length,fallbackRestored:window.raveldexAstroFixture.fallbackRestored()}));assert.equal(result.state,'unloaded');assert.equal(result.status,'Search data was unloaded.');assert.equal(result.openDisabled,true);assert.equal(result.unloadDisabled,true);assert.equal(result.loadDisabled,false);assert.equal(result.searchboxes,0);assert.equal(result.fallbackRestored,true);release();await page.unroute('**/raveldex/documents-*.json');await page.getByRole('button',{name:'Load search data',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.searchState==='ready');await page.getByRole('button',{name:'Open search',exact:true}).click();const input=page.getByRole('searchbox',{name:'Search documentation',exact:true});await input.fill('atomic');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-raveldex-status]')?.textContent==='1 results. Showing 1–1.');assert.deepEqual(await page.locator('[data-raveldex-result]').evaluateAll(nodes=>nodes.map(node=>node.dataset.raveldexResult)),['guide:atomic']);await page.getByRole('button',{name:'Unload search data',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.searchState==='unloaded');assert.deepEqual(errors,[]);return {browser:browser.version(),base:'/',origin,afterDelayedUnload:result,reloadAndSearchRecovery:true,pageErrors:errors,scope:'Actual installed headless Chrome over new packed genuine Astro output; no physical input or screen-reader speech claim'};
  }finally{release?.();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
});

inspect('Closed paired tarballs, actual generated files and documentation agree with the package helper claims', async () => {
  const reportPath=process.env.RAVELDEX_ASTRO_REVIEW_PACKAGE_REPORT??'/tmp/raveldex-rx-a100-package-initial.json',r=await readJSON(reportPath);assert.equal(r.status,'Pass');assert.equal(r.environment.astro,'7.3.2');assert.equal(r.correctness.builds,2);assert.equal(r.correctness.browserComparisons,42);assert.equal(r.correctness.nodeSourceNativeComparisons,84);assert.deepEqual(r.builds.map(row=>row.base),['/','/docs/']);
  const installed=join(r.consumerDirectory,'node_modules/@vmitsaras/raveldex-astro'),installedCore=join(r.consumerDirectory,'node_modules/@vmitsaras/raveldex');assert.equal(await fs.realpath(installed),installed);assert.equal(await fs.realpath(installedCore),installedCore);assert.equal(digest(await fs.readFile(r.integrationPackage.tarball)),r.integrationPackage.sha256);const coreTar=join(r.consumerDirectory,'vmitsaras-raveldex-0.1.0-rc.0.tgz');assert.equal(digest(await fs.readFile(coreTar)),r.corePackage.sha256);
  for(const row of r.integrationPackage.files){const data=await fs.readFile(join(installed,row.path));assert.equal(data.length,row.bytes);assert.equal(digest(data),row.sha256);if(row.path.startsWith('dist/'))assert.equal(digest(await fs.readFile(join(root,'integrations/astro',row.path))),row.sha256)}
  let generatedFiles=0;for(const build of r.builds){assert.equal(build.status,'Pass');assert.equal(build.browser.status,'Pass');assert.equal(build.node.status,'Pass');assert.equal(build.manifest.recordCount,3);assert.deepEqual(build.browser.pageErrors,[]);assert.deepEqual(build.browser.externalRequests,[]);for(const row of build.generated){const data=await fs.readFile(join(build.directory,row.path));assert.equal(data.length,row.bytes);assert.equal(digest(data),row.sha256);generatedFiles++}}
  assert.match(r.declarations,/skipLibCheck/);assert.match(r.environment.developerTool,/linked/);assert.deepEqual(r.integrationPackage.runtimeDependencies,[]);assert.equal(r.collision.status,'Pass');assert.equal(r.collision.manifestWritten,false);assert.equal(r.collision.userWitnessPreserved,true);assert.ok(r.startup.every(row=>row.reads.length===0&&row.callbacks===0));
  const readme=await fs.readFile(join(installed,'README.md'),'utf8'),example=/```js\n([\s\S]*?)\n```/.exec(readme)?.[1];assert.ok(example);assert.equal(digest(example),r.documentation.exampleSha256);const documented=await exec(process.execPath,['--input-type=module','--eval',example],{cwd:r.consumerDirectory,encoding:'utf8',timeout:30000});assert.equal(documented.stdout,r.documentation.stdout);assert.equal(documented.stdout,'1 /docs/\n');
  for(const key of ['minifiedBytes','gzipBytes','sha256','gzipSha256'])assert.equal(r.core[key],(await readJSON(join(root,'docs/evidence/RX-A090-package.json'))).core[key]);
  for(const name of ['client','builder'])assert.deepEqual(r.graphs[name].runtimeImports,[]);assert.ok(r.graphs.hook.runtimeImports.every(row=>/^node:(fs\/promises|path|url)$/.test(row.path)));
  return {reportPath,reportSha256:digest(await fs.readFile(reportPath)),actualPairedRealTarballInstallations:true,generatedFilesCurrent:generatedFiles,integrationMembers:r.integrationPackage.files.length,actualAstroBuilds:2,browserComparisons:42,nodeSourceNativeComparisons:84,exactInstalledDocumentationOutput:documented.stdout,coreFourIdentitiesUnchanged:true,optionalAstroDevtoolLinkDisclosed:true,hookTransitiveDeclarationSkipDisclosed:true,scope:'Independent byte/shape audit and actual documentation replay; helper-authored browser observations remain finite automation, not speech/physical/cross-host claims'};
});

const bindingPaths=[
'integrations/astro/src/index.ts','integrations/astro/dist/index.js','integrations/astro/package.json','integrations/astro/tsconfig.json','integrations/astro/tsconfig.build.json',
'examples/astro/astro.config.mjs','examples/astro/configuration.mjs','examples/astro/qualification.mjs','examples/astro/content.json','examples/astro/content-provenance.json','examples/astro/src/main.mjs','examples/astro/src/pages/index.astro','examples/astro/src/pages/guide/[slug].astro','examples/astro/src/style.css',
'test/integrations/astro/runtime.test.mjs','test/integrations/astro/browser.test.mjs','test/fixtures/astro/records.mjs','test/measurements/astro-package.mjs','scripts/pack-astro.mjs','scripts/link-astro-peer.mjs','scripts/clean-build.mjs','package.json','package-lock.json',
];
const bind=async path=>{const data=await fs.readFile(join(root,path));return{path,bytes:data.length,sha256:digest(data)}};
const start=await Promise.all(bindingPaths.map(bind));let failed;
try { for(const[name,task]of probes){const data=await task();observations.push({name,status:'Pass',...data});console.log(JSON.stringify(observations.at(-1)));} }
catch(error){failed=error;observations.push({name:probes[observations.length]?.[0],status:'Fail',message:String(error.stack??error)});console.log(JSON.stringify(observations.at(-1)));}
finally { for(const directory of temporaries) await fs.rm(directory,{recursive:true,force:true}); }
const end=await Promise.all(bindingPaths.map(bind));assert.deepEqual(end,start,'Other-authored review inputs changed during probes');
const beforePath='/tmp/raveldex-rx-a100-hook-capture-before.log',before=await fs.readFile(beforePath,'utf8');
const harnessPath='/tmp/raveldex-rx-a100-verification-attempt1.log',harness=await fs.readFile(harnessPath,'utf8'),wrapperBeforePath='/tmp/raveldex-rx-a100-open-unload-before.log',wrapperBefore=await fs.readFile(wrapperBeforePath,'utf8');
const report={kind:'raveldex-rx-a100-verification-review-v1',recordedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},authorshipBoundary:'Independent review of other-authored hook, fixture, verification oracle, packaging scripts and declarations. This reviewer authored integrations/astro/src/{build,client,common,error,types}.ts; those five runtime sources and their emitted output are excluded from the independent verdict. Actual runtime review is separately owned.',sourceBindings:start,observations,passCount:observations.filter(row=>row.status==='Pass').length,mandatoryFindings:failed?[{status:'Open',message:String(failed.stack??failed)}]:[],resolvedFindings:[{id:'hook-constant-ownership',status:'Resolved',beforeProbe:{path:beforePath,sha256:digest(before),observed:JSON.parse(before)},afterProbe:observations[0]},{id:'example-delayed-open-after-unload',status:failed?'Pending final review':'Resolved',beforeProbe:{path:wrapperBeforePath,sha256:digest(wrapperBefore),observed:JSON.parse(wrapperBefore)},afterProbe:observations[7]}],reviewHarnessCorrection:{path:harnessPath,sha256:digest(harness),classification:'First reviewer assertion compared a /var temporary path to the hook canonical /private/var path. Corrected only reviewer temp-directory normalization; no product change. Original failed attempt retained.'},verdict:failed?'Needs changes':'Ready with follow-ups',limitations:['Actual paired artifacts and delayed example unload were audited here on one installed headless Chrome. No browser speech, physical input or broad browser qualification is inferred.','Review does not independently approve author-owned runtime code.','Logical graphs and byte hashes do not establish heap/allocation/copy peaks.','No build, npm, Git, remote write or publication command executed by this review.']};
await fs.writeFile(join(root,'docs/evidence/RX-A100-verification-review.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.verdict,passCount:report.passCount,mandatoryFindings:report.mandatoryFindings.length}));if(failed)process.exitCode=1;
