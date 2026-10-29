import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

const schema = { text: { title: {}, body: {} } };
const records = [
  { id: 'a', text: { title: 'source atom', body: 'bodyonly' } },
  { id: 'b', text: { title: 'sauces atom' } },
  { id: 'c', text: { title: 'café data' } },
  { id: 'd', text: { title: 'cafe data' } },
  { id: 'e', text: { title: 'atom' } },
];
const typo = text => ({ kind: 'extension', capability: 'typo', version: 1, payload: { text, fields: ['title'] } });
const group = alternatives => ({ kind: 'group', fields: ['title'], variants: alternatives.map(([text, weight]) => ({ text, weight, match: 'exact' })) });
// Authored alternatives are independent of the implementation's matcher.
const cases = [
  ['source', [['source', 1]], ['a']],
  ['soruce', [['source', 0.5]], ['a']],
  ['sourxe', [['source', 0.5]], ['a']],
  ['soure', [['source', 0.5]], ['a']],
  ['sourcce', [['source', 0.5]], ['a']],
  ['caff', [['cafe', 0.5], ['café', 0.5]], ['c', 'd']],
  ['cafe', [['cafe', 1]], ['d']],
  ['zzzzzz', [['zzzzzz', 1]], []],
  ['cat', [['cat', 1]], []],
].map(([text, alternatives, expectedIds]) => ({ query: typo(text), expected: group(alternatives), expectedIds }));
cases.push({ query: typo('soruce atmo'), expected: { kind: 'and', children: [group([['source', 0.5]]), group([['atom', 0.5]])] }, expectedIds: ['a'] });

async function graph(directory, name, entry) {
  await writeFile(join(directory, `${name}.mjs`), entry);
  const settings = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
    treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
  const result = await build({ ...settings, absWorkingDir: directory, entryPoints: [`${name}.mjs`], outfile: `${name}-bundle.mjs`, logLevel: 'silent' });
  const bytes = result.outputFiles[0].contents, gzipSettings = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 };
  const compressed = gzipSync(bytes, gzipSettings);
  const inputs = Object.entries(result.metafile.inputs).map(([path, input]) => ({ path, bytes: input.bytes, imports: input.imports }));
  for (const input of inputs) {
    assert.ok(input.path === `${name}.mjs` || input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `foreign graph input ${input.path}`);
    assert.ok(input.imports.every(item => !item.external));
  }
  assert.deepEqual(Object.values(result.metafile.outputs)[0].imports, []);
  await writeFile(join(directory, `${name}-bundle.mjs`), bytes);
  return { esbuild: version, settings, gzip: { ...gzipSettings, mtime: 0 }, minifiedBytes: bytes.length,
    gzipBytes: compressed.length, sha256: digest(bytes), gzipSha256: digest(compressed), inputs, metafile: result.metafile };
}

async function freshImport(directory, specifier, exports) {
  const source = `
    import assert from 'node:assert/strict';
    const reads=[];
    for(const name of ['window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask'])
      Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});
    const module=await import(process.argv[1]); assert.deepEqual(Object.keys(module).sort(),JSON.parse(process.argv[2]));
    assert.deepEqual(reads,[]);
    console.log(JSON.stringify({specifier:process.argv[1],reads,exports:Object.keys(module).sort()}));
  `;
  return JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', source, specifier, JSON.stringify(exports.sort())], directory)).stdout);
}

const runner = `
  import assert from 'node:assert/strict';
  import {readFile} from 'node:fs/promises';
  import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
  import {createTypoTolerance,TYPO_POLICY} from '@vmitsaras/raveldex/addons/typo';
  const fixture=JSON.parse(await readFile('typo-fixture.json','utf8'));
  const addon=createTypoTolerance({fields:['title','body']});
  assert.equal(TYPO_POLICY,'unicode-osa1-exact-first-v1');
  assert.equal(addon.manifest.indexEffect,'none'); assert.equal(addon.manifest.limits.maxRetainedEntries,0);
  const engine=createRaveldex({schema:fixture.schema,addons:[addon]}), baseline=createRaveldex({schema:fixture.schema});
  const compare=(actual,expected)=>{
    assert.equal(actual.revision,expected.revision); assert.equal(actual.completeness,'complete'); assert.equal(actual.total,expected.total);
    assert.deepEqual(actual.hits.map(hit=>hit.id),expected.hits.map(hit=>hit.id));
    for(let i=0;i<actual.hits.length;i++) assert.ok(Math.abs(actual.hits[i].score-expected.hits[i].score)<=Math.max(1e-12,Math.abs(expected.hits[i].score)*1e-12));
  };
  try {
    await engine.addMany(fixture.records); await baseline.addMany(fixture.records);
    const rows=[];
    for(const entry of fixture.cases) {
      const complete=await engine.search(entry.query,{limit:100}); assert.deepEqual(complete.hits.map(hit=>hit.id).sort(),entry.expectedIds);
      assert.equal(complete.extensions.typo.policy,TYPO_POLICY);
      for(const page of [{limit:100},{limit:0},{offset:1,limit:1}]) {
        const actual=await engine.search(entry.query,page), expected=await baseline.search(entry.expected,page);
        compare(actual,expected); rows.push({query:entry.query,page,result:actual});
      }
    }
    const repair=rows.find(row=>row.query.payload.text==='soruce').result.extensions.typo.groups[0];
    assert.deepEqual(repair.alternatives,[{term:'source',match:'exact',weight:0.5}]);
    assert.ok(repair.dictionaryEntriesVisited>0 && repair.workUnits>0);
    const exact=rows.find(row=>row.query.payload.text==='source').result.extensions.typo.groups[0];
    assert.deepEqual(exact.alternatives,[{term:'source',match:'exact',weight:1}]); assert.equal(exact.dictionaryEntriesVisited,0);
    const strict=[];
    for(const query of ['source','cafe',{kind:'group',fields:['title'],variants:[{text:'sor',match:'prefix'}]}]) {
      const actual=await engine.search(query), expected=await baseline.search(query); assert.deepEqual(actual,expected); strict.push(actual);
    }
    const update=await engine.replace({id:'a',text:{title:'sauce atom'}}), updated=await engine.search(fixture.cases[1].query);
    assert.equal(update.revision,2); assert.equal(updated.revision,2); assert.equal(updated.total,0);
    const clear=await engine.clear(), empty=await engine.search(fixture.cases[1].query);
    assert.equal(clear.revision,3); assert.equal(empty.revision,3); assert.equal(empty.total,0);
    assert.deepEqual(empty.extensions.typo.groups[0].alternatives,[]);
    await engine.dispose(); await assert.rejects(engine.search('source'),error=>error instanceof RaveldexError&&error.code==='DISPOSED');
    console.log(JSON.stringify({rows,strict,update,updated,clear,empty}));
  } finally { await engine.dispose(); await baseline.dispose(); }
`;

async function workerProbe(directory) {
  // A real Node worker/structured-clone bridge tests the declared semantic
  // identity and protocol. It is not browser or cross-host qualification.
  await writeFile(join(directory, 'typo-worker.mjs'), `
    import {parentPort,workerData} from 'node:worker_threads';
    import {serveRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/host';
    import {createTypoTolerance} from '@vmitsaras/raveldex/addons/typo';
    const listeners=new Map();
    serveRaveldexWorker({postMessage:message=>parentPort.postMessage(message),
      addEventListener(type,listener){let byType=listeners.get(type);if(!byType){byType=new Map();listeners.set(type,byType)}const wrapped=value=>listener({data:value});byType.set(listener,wrapped);parentPort.on(type,wrapped)},
      removeEventListener(type,listener){const byType=listeners.get(type),wrapped=byType?.get(listener);if(wrapped)parentPort.off(type,wrapped);byType?.delete(listener)}},
      {addons:[createTypoTolerance({fields:['title','body'],maxAlternatives:workerData.maxAlternatives})]});
  `);
  await writeFile(join(directory, 'typo-worker-probe.mjs'), `
    import assert from 'node:assert/strict'; import {Worker} from 'node:worker_threads'; import {readFile} from 'node:fs/promises';
    import {createRaveldex} from '@vmitsaras/raveldex';
    import {createTypoTolerance} from '@vmitsaras/raveldex/addons/typo';
    import {createWorkerRaveldex,WorkerAdapterError} from '@vmitsaras/raveldex/adapters/worker';
    const fixture=JSON.parse(await readFile('typo-fixture.json','utf8'));
    function endpoint(worker){const listeners=new Map();return {postMessage:message=>worker.postMessage(message),
      addEventListener(type,listener){let byType=listeners.get(type);if(!byType){byType=new Map();listeners.set(type,byType)}const wrapped=value=>listener(type==='message'?{data:value}:value);byType.set(listener,wrapped);worker.on(type,wrapped)},
      removeEventListener(type,listener){const byType=listeners.get(type),wrapped=byType?.get(listener);if(wrapped)worker.off(type,wrapped);byType?.delete(listener)},terminate(){void worker.terminate()}}}
    const direct=createRaveldex({schema:fixture.schema,addons:[createTypoTolerance({fields:['title','body']})]});
    const worker=new Worker(new URL('./typo-worker.mjs',import.meta.url),{workerData:{maxAlternatives:15}});
    // Transport intentionally owns records as null-prototype data. Compare
    // every serialized field, without treating local prototypes as wire data.
    const compareWire=(actual,expected)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
    let remote;
    try {
      remote=await createWorkerRaveldex({worker:endpoint(worker),configuration:{schema:fixture.schema,addons:[createTypoTolerance({fields:['body','title']})]},ownership:'owned',sameHost:true,responseTimeoutMs:10000});
      await remote.addMany(fixture.records); await direct.addMany(fixture.records);
      let comparisons=0;
      for(const entry of fixture.cases){compareWire(await remote.search(entry.query),await direct.search(entry.query));comparisons++}
      for(const query of [{kind:'or',children:[fixture.cases[1].query,{kind:'text',text:'data'}]}, {kind:'not',child:fixture.cases[1].query}, {kind:'extension',capability:'typo',version:1,payload:{text:'',fields:['title']}}]) {compareWire(await remote.search(query),await direct.search(query));comparisons++}
      const replacement={id:'a',text:{title:'sauce atom'}}; await remote.replace(replacement);await direct.replace(replacement);
      compareWire(await remote.search(fixture.cases[1].query),await direct.search(fixture.cases[1].query));comparisons++;
      const changed=new Worker(new URL('./typo-worker.mjs',import.meta.url),{workerData:{maxAlternatives:14}});
      try { await assert.rejects(createWorkerRaveldex({worker:endpoint(changed),configuration:{schema:fixture.schema,addons:[createTypoTolerance({fields:['title','body']})]},ownership:'owned',sameHost:true,responseTimeoutMs:10000}),error=>error instanceof WorkerAdapterError&&error.code==='INCOMPATIBLE_WORKER'); }
      finally { await changed.terminate(); }
      await remote.destroy(); await direct.dispose();
      console.log(JSON.stringify({status:'Pass',transport:'Actual Node worker_threads with a structural browser-endpoint bridge',comparisons,semanticOptionMismatch:'INCOMPATIBLE_WORKER',scope:'Node protocol and same-process clone observation only; no browser or native-snapshot qualification'}));
    } finally { if(remote)await remote.destroy();await worker.terminate();await direct.dispose(); }
  `);
  return JSON.parse((await command(process.execPath, ['typo-worker-probe.mjs'], directory)).stdout);
}

export async function measurePackedTypo() {
  const consumer = await prepareConsumer({ schema, records }, []);
  try {
    await writeFile(join(consumer.directory, 'typo-fixture.json'), JSON.stringify({ schema, records, cases }));
    await writeFile(join(consumer.directory, 'typo-types.ts'), `
      import {createRaveldex,type Query,type AddonRegistration,type ExpansionContext,type ExpansionAlternative} from '@vmitsaras/raveldex';
      import {createTypoTolerance,TYPO_POLICY,type TypoOptions,type TypoResult} from '@vmitsaras/raveldex/addons/typo';
      const options:TypoOptions={fields:['title'],maxAlternatives:8,maxWorkUnits:10000};
      const policy:'unicode-osa1-exact-first-v1'=TYPO_POLICY;
      const addon:AddonRegistration=createTypoTolerance(options);
      const query:Query={kind:'extension',capability:'typo',version:1,payload:{text:'soruce',fields:['title']}};
      void createRaveldex({schema:{text:{title:{}}},addons:[addon]}).search(query); void policy;
      declare const context:ExpansionContext; declare const alternative:ExpansionAlternative; void context;
      // @ts-expect-error Selected fields are readonly.
      options.fields.push('body');
      // @ts-expect-error Normalized alternatives are readonly.
      alternative.weight=0.1;
      declare const result:TypoResult;
      // @ts-expect-error Expansion result arrays are readonly.
      result.groups.push(result.groups[0]!);
      // @ts-expect-error Distance/normalization policy is not a configuration override.
      createTypoTolerance({fields:['title'],maxDistance:2});
      // @ts-expect-error Implementation modules stay private.
      import {oneEdit} from '@vmitsaras/raveldex/addons/typo/distance';
    `);
    const config = JSON.parse(await readFile(join(consumer.directory, 'tsconfig.json'), 'utf8'));
    config.include = ['typo-types.ts']; await writeFile(join(consumer.directory, 'typo-tsconfig.json'), JSON.stringify(config));
    await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'typo-tsconfig.json')], consumer.directory);
    const core = await bundleConsumer(consumer.directory);
    const typoOnly = await graph(consumer.directory, 'typo-only', "export {createTypoTolerance,TYPO_POLICY} from '@vmitsaras/raveldex/addons/typo';\n");
    const combined = await graph(consumer.directory, 'typo-combined', "export {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex'; export {createTypoTolerance,TYPO_POLICY} from '@vmitsaras/raveldex/addons/typo';\n");
    assert.ok(core.inputs.every(({ path }) => !path.includes('/addons/typo/')));
    assert.ok(typoOnly.inputs.some(({ path }) => path.endsWith('/addons/typo/distance.js')));
    assert.ok(typoOnly.inputs.every(({ path }) => !/execution\/engine|\/adapters\/|\/addons\/(?!typo)/.test(path)));
    const startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex'), await checkStartup(consumer.directory, './core-bundle.mjs'),
      await freshImport(consumer.directory, '@vmitsaras/raveldex/addons/typo', ['TYPO_POLICY', 'createTypoTolerance']),
      await freshImport(consumer.directory, './typo-only-bundle.mjs', ['TYPO_POLICY', 'createTypoTolerance']),
      await freshImport(consumer.directory, './typo-combined-bundle.mjs', ['ERROR_CODES', 'RaveldexError', 'TYPO_POLICY', 'createRaveldex', 'createTypoTolerance'])];
    await command(process.execPath, ['--input-type=module', '--eval', `import assert from 'node:assert/strict';for(const path of ['@vmitsaras/raveldex/addons/typo/distance','@vmitsaras/raveldex/dist/addons/typo/options.js'])await assert.rejects(import(path),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`], consumer.directory);
    await writeFile(join(consumer.directory, 'packed-typo.mjs'), runner);
    const packed = JSON.parse((await command(process.execPath, ['packed-typo.mjs'], consumer.directory)).stdout);
    const bundledRunner = runner.replace("import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';", '')
      .replace("import {createTypoTolerance,TYPO_POLICY} from '@vmitsaras/raveldex/addons/typo';", "import {createRaveldex,RaveldexError,createTypoTolerance,TYPO_POLICY} from './typo-combined-bundle.mjs';");
    await writeFile(join(consumer.directory, 'bundled-typo.mjs'), bundledRunner);
    const bundled = JSON.parse((await command(process.execPath, ['bundled-typo.mjs'], consumer.directory)).stdout);
    assert.deepEqual(bundled, packed);
    const worker = await workerProbe(consumer.directory);
    const documentation = await readFile(join(consumer.installed, 'docs/api/TYPO.md'), 'utf8');
    const example = /```js\n([\s\S]*?)\n```/.exec(documentation)?.[1];
    assert.ok(example, 'exact installed typo documentation example exists');
    await writeFile(join(consumer.directory, 'documented-typo.mjs'), example);
    const documented = await command(process.execPath, ['documented-typo.mjs'], consumer.directory);
    assert.match(documented.stdout, /^1 /);
    assert.match(documented.stdout, /unicode-osa1-exact-first-v1/);
    return { kind: 'raveldex-typo-package-cost-v1', environment: { node: process.version, platform: process.platform, arch: process.arch },
      package: consumer.package, declarations: 'Pass, isolated installed public types with ES2022 and no DOM/Node ambient types',
      core, typoOnly, combined, startup, worker, documentation: { status: 'Pass', source: 'docs/api/TYPO.md', exampleSha256: digest(example), stdout: documented.stdout },
      correctness: { status: 'Pass', authoredQueries: cases.length, fullPageScoreComparisonsPerRun: packed.rows.length, strictUnrequestedComparisonsPerRun: packed.strict.length,
        mutations: 'Replace removes a stale live-dictionary alternative; clear empties alternatives at one new revision; dispose rejects later search', bundledParity: 'Pass' },
      logicalState: { extraRetainedIndexEntries: 0, basis: 'Stateless registration manifest and direct dictionary expansion; not a heap or peak-memory measurement' }, packed };
  } finally { await rm(consumer.directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await measurePackedTypo();
  if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ correctness: report.correctness, packageBytes: report.package.tarballBytes,
    coreGzip: report.core.gzipBytes, coreTargetMet: report.core.targetMet, typoOnlyGzip: report.typoOnly.gzipBytes, combinedGzip: report.combined.gzipBytes, worker: report.worker }));
}
