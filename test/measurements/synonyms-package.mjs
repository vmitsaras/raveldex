import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

const schema = { text: { title: {}, body: {} } };
const records = [
  { id: 'a', text: { title: 'source atomic', body: 'bodyonly' } },
  { id: 'b', text: { title: 'snapshot atomic' } },
  { id: 'c', text: { title: 'cache source' } },
  { id: 'd', text: { title: 'store' } },
  { id: 'e', text: { title: 'persist' } },
  { id: 'f', text: { title: 'café data' } },
  { id: 'g', text: { title: 'plain' } },
  { id: 'h', text: { title: 'origin' } },
];
const mappings = [
  { from: 'origin', to: 'source' }, { from: 'save', to: 'snapshot' },
  { from: 'cache', to: 'store' }, { from: 'store', to: 'persist' },
  { from: 'persist', to: 'cache' }, { from: 'alias', to: 'source' },
];
const vocabularyVersion = 'package-v1';
const synonyms = text => ({ kind: 'extension', capability: 'synonyms', version: 1, payload: { text, fields: ['title'] } });
const group = alternatives => ({ kind: 'group', fields: ['title'], variants: alternatives.map(([text, weight]) => ({ text, weight, match: 'exact' })) });
// Literal one-step expectations authored independently of the production table lookup.
const cases = [
  ['origin', [['origin', 1], ['source', 0.5]], ['a', 'c', 'h']],
  ['save', [['save', 1], ['snapshot', 0.5]], ['b']],
  ['cache', [['cache', 1], ['store', 0.5]], ['c', 'd']],
  ['store', [['store', 1], ['persist', 0.5]], ['d', 'e']],
  ['persist', [['persist', 1], ['cache', 0.5]], ['c', 'e']],
  ['source', [['source', 1]], ['a', 'c']],
  ['missing', [['missing', 1]], []],
  ['cafe', [['cafe', 1]], []],
  ['CAFÉ', [['café', 1]], ['f']],
].map(([text, alternatives, expectedIds]) => ({ query: synonyms(text), expected: group(alternatives), expectedIds }));
cases.push(
  { query: synonyms('origin atomic'), expected: { kind: 'and', children: [group([['origin', 1], ['source', 0.5]]), group([['atomic', 1]])] }, expectedIds: ['a'] },
  { query: synonyms('origin alias'), expected: { kind: 'and', children: [group([['origin', 1], ['source', 0.5]]), group([['alias', 1], ['source', 0.5]])] }, expectedIds: ['a', 'c'] },
  { query: synonyms('origin origin'), expected: group([['origin', 1], ['source', 0.5]]), expectedIds: ['a', 'c', 'h'] },
  { query: synonyms('!!!'), expected: { kind: 'none' }, expectedIds: [] },
);

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
  import {createSynonyms,SYNONYMS_POLICY} from '@vmitsaras/raveldex/addons/synonyms';
  const fixture=JSON.parse(await readFile('synonyms-fixture.json','utf8'));
  const addon=createSynonyms({fields:['title','body'],vocabularyVersion:fixture.vocabularyVersion,mappings:fixture.mappings});
  assert.equal(SYNONYMS_POLICY,'directional-one-step-v1');
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
      assert.equal(complete.extensions.synonyms.policy,SYNONYMS_POLICY+':'+fixture.vocabularyVersion);
      assert.ok(Object.isFrozen(complete.extensions.synonyms)&&Object.isFrozen(complete.extensions.synonyms.groups));
      for(const page of [{limit:100},{limit:0},{offset:1,limit:1}]) {
        const actual=await engine.search(entry.query,page), expected=await baseline.search(entry.expected,page);
        compare(actual,expected); rows.push({query:entry.query,page,result:actual});
      }
    }
    const mapped=rows.find(row=>row.query.payload.text==='origin').result.extensions.synonyms.groups[0];
    assert.deepEqual(mapped.alternatives,[{term:'origin',match:'exact',weight:1},{term:'source',match:'exact',weight:0.5}]);
    assert.ok(mapped.dictionaryEntriesVisited>0 && mapped.workUnits>0);
    const chain=rows.find(row=>row.query.payload.text==='cache').result.extensions.synonyms.groups[0];
    assert.deepEqual(chain.alternatives,[{term:'cache',match:'exact',weight:1},{term:'store',match:'exact',weight:0.5}]);
    const strict=[];
    for(const query of ['origin','source',{kind:'group',fields:['title'],variants:[{text:'ori',match:'prefix'}]}]) {
      const actual=await engine.search(query), expected=await baseline.search(query); assert.deepEqual(actual,expected); strict.push(actual);
    }
    const replacement=await engine.replace({id:'a',text:{title:'unrelated atomic'}}), replaced=await engine.search(fixture.cases[0].query);
    assert.equal(replacement.revision,2); assert.equal(replaced.revision,2); assert.deepEqual(replaced.hits.map(hit=>hit.id).sort(),['c','h']);
    const removal=await engine.remove(['c']),removed=await engine.search(fixture.cases[0].query);
    assert.equal(removal.revision,3);assert.equal(removed.revision,3);assert.deepEqual(removed.hits.map(hit=>hit.id),['h']);
    assert.deepEqual(removed.extensions.synonyms.groups[0].alternatives,[{term:'origin',match:'exact',weight:1}]);
    const clear=await engine.clear(),empty=await engine.search(fixture.cases[0].query);
    assert.equal(clear.revision,4); assert.equal(empty.revision,4); assert.equal(empty.total,0);
    assert.deepEqual(empty.extensions.synonyms.groups[0].alternatives,[]);
    await engine.dispose(); await assert.rejects(engine.search('source'),error=>error instanceof RaveldexError&&error.code==='DISPOSED');
    console.log(JSON.stringify({rows,strict,replacement,replaced,removal,removed,clear,empty}));
  } finally { await engine.dispose(); await baseline.dispose(); }
`;

async function workerProbe(directory) {
  // A real Node worker/structured-clone bridge tests the declared semantic
  // identity and protocol. It is not browser or cross-host qualification.
  await writeFile(join(directory, 'synonyms-worker.mjs'), `
    import {parentPort,workerData} from 'node:worker_threads';
    import {serveRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/host';
    import {createSynonyms} from '@vmitsaras/raveldex/addons/synonyms';
    const listeners=new Map();
    serveRaveldexWorker({postMessage:message=>parentPort.postMessage(message),
      addEventListener(type,listener){let byType=listeners.get(type);if(!byType){byType=new Map();listeners.set(type,byType)}const wrapped=value=>listener({data:value});byType.set(listener,wrapped);parentPort.on(type,wrapped)},
      removeEventListener(type,listener){const byType=listeners.get(type),wrapped=byType?.get(listener);if(wrapped)parentPort.off(type,wrapped);byType?.delete(listener)}},
      {addons:[createSynonyms(workerData.options)]});
  `);
  await writeFile(join(directory, 'synonyms-worker-probe.mjs'), `
    import assert from 'node:assert/strict'; import {Worker} from 'node:worker_threads'; import {readFile} from 'node:fs/promises';
    import {createRaveldex} from '@vmitsaras/raveldex';
    import {createSynonyms} from '@vmitsaras/raveldex/addons/synonyms';
    import {createWorkerRaveldex,WorkerAdapterError} from '@vmitsaras/raveldex/adapters/worker';
    const fixture=JSON.parse(await readFile('synonyms-fixture.json','utf8'));
    function endpoint(worker){const listeners=new Map();return {postMessage:message=>worker.postMessage(message),
      addEventListener(type,listener){let byType=listeners.get(type);if(!byType){byType=new Map();listeners.set(type,byType)}const wrapped=value=>listener(type==='message'?{data:value}:value);byType.set(listener,wrapped);worker.on(type,wrapped)},
      removeEventListener(type,listener){const byType=listeners.get(type),wrapped=byType?.get(listener);if(wrapped)worker.off(type,wrapped);byType?.delete(listener)},terminate(){void worker.terminate()}}}
    const options={fields:['title','body'],vocabularyVersion:fixture.vocabularyVersion,mappings:fixture.mappings};
    const direct=createRaveldex({schema:fixture.schema,addons:[createSynonyms(options)]});
    const reordered={...options,fields:['body','title'],mappings:[...fixture.mappings].reverse().concat([{from:'ORIGIN',to:'SOURCE'},{from:'source',to:'source'}])};
    const worker=new Worker(new URL('./synonyms-worker.mjs',import.meta.url),{workerData:{options:reordered}});
    // Transport intentionally owns records as null-prototype data. Compare
    // every serialized field, without treating local prototypes as wire data.
    const compareWire=(actual,expected)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
    let remote;
    try {
      remote=await createWorkerRaveldex({worker:endpoint(worker),configuration:{schema:fixture.schema,addons:[createSynonyms(options)]},ownership:'owned',sameHost:true,responseTimeoutMs:10000});
      await remote.addMany(fixture.records); await direct.addMany(fixture.records);
      let comparisons=0;
      for(const entry of fixture.cases){compareWire(await remote.search(entry.query),await direct.search(entry.query));comparisons++}
      for(const query of [{kind:'or',children:[fixture.cases[0].query,{kind:'text',text:'data'}]}, {kind:'not',child:fixture.cases[0].query}, {kind:'extension',capability:'synonyms',version:1,payload:{text:'',fields:['title']}}]) {compareWire(await remote.search(query),await direct.search(query));comparisons++}
      for(const [method,value] of [['replace',{id:'a',text:{title:'unrelated atomic'}}],['remove',['c']],['clear',undefined]]){
        await remote[method](value);await direct[method](value);compareWire(await remote.search(fixture.cases[0].query),await direct.search(fixture.cases[0].query));comparisons++;
      }
      const mismatches=[];
      for(const [kind,changedOptions] of [
        ['same version, changed mapping contents',{...options,mappings:[...fixture.mappings.slice(1),{from:'origin',to:'snapshot'}]}],
        ['same contents, changed vocabulary version',{...options,vocabularyVersion:'package-v2'}],
        ['changed alternative budget',{...options,maxAlternatives:14}],
      ]){
        const changed=new Worker(new URL('./synonyms-worker.mjs',import.meta.url),{workerData:{options:changedOptions}});
        try { await assert.rejects(createWorkerRaveldex({worker:endpoint(changed),configuration:{schema:fixture.schema,addons:[createSynonyms(options)]},ownership:'owned',sameHost:true,responseTimeoutMs:10000}),error=>error instanceof WorkerAdapterError&&error.code==='INCOMPATIBLE_WORKER');mismatches.push({kind,result:'INCOMPATIBLE_WORKER'}); }
        finally { await changed.terminate(); }
      }
      console.log(JSON.stringify({status:'Pass',transport:'Actual Node worker_threads with a structural browser-endpoint bridge',comparisons,canonicalReorderAndNormalization:'Pass',semanticMismatches:mismatches,scope:'Node protocol and clone parity only; no browser or native-snapshot qualification'}));
    } finally { if(remote)await remote.destroy();await worker.terminate();await direct.dispose(); }
  `);
  return JSON.parse((await command(process.execPath, ['synonyms-worker-probe.mjs'], directory)).stdout);
}

export async function measurePackedSynonyms() {
  const consumer = await prepareConsumer({ schema, records }, []);
  try {
    await writeFile(join(consumer.directory, 'synonyms-fixture.json'), JSON.stringify({ schema, records, cases, mappings, vocabularyVersion }));
    await writeFile(join(consumer.directory, 'synonyms-types.ts'), `
      import {createRaveldex,type Query,type AddonRegistration,type ExpansionContext,type ExpansionAlternative} from '@vmitsaras/raveldex';
      import {createSynonyms,SYNONYMS_POLICY,type SynonymsOptions,type SynonymsResult} from '@vmitsaras/raveldex/addons/synonyms';
      const options:SynonymsOptions={fields:['title'],vocabularyVersion:'types-v1',mappings:[{from:'origin',to:'source'}],maxAlternatives:8,maxWorkUnits:10000};
      const policy:'directional-one-step-v1'=SYNONYMS_POLICY;
      const addon:AddonRegistration=createSynonyms(options);
      const query:Query={kind:'extension',capability:'synonyms',version:1,payload:{text:'origin',fields:['title']}};
      void createRaveldex({schema:{text:{title:{}}},addons:[addon]}).search(query); void policy;
      declare const context:ExpansionContext; declare const alternative:ExpansionAlternative; void context;
      // @ts-expect-error Selected fields are readonly.
      options.fields.push('body');
      // @ts-expect-error Normalized alternatives are readonly.
      alternative.weight=0.1;
      declare const result:SynonymsResult;
      // @ts-expect-error Expansion result arrays are readonly.
      result.groups.push(result.groups[0]!);
      // @ts-expect-error Missing vocabulary identity is not accepted.
      createSynonyms({fields:['title'],mappings:[]});
      // @ts-expect-error Factory-owned mappings remain readonly.
      options.mappings.push({from:'a',to:'b'});
      // @ts-expect-error Mapping endpoints remain readonly.
      options.mappings[0]!.to='other';
      // @ts-expect-error Implementation modules stay private.
      import {captureSynonymsOptions} from '@vmitsaras/raveldex/addons/synonyms/options';
    `);
    const config = JSON.parse(await readFile(join(consumer.directory, 'tsconfig.json'), 'utf8'));
    config.include = ['synonyms-types.ts']; await writeFile(join(consumer.directory, 'synonyms-tsconfig.json'), JSON.stringify(config));
    await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'synonyms-tsconfig.json')], consumer.directory);
    const core = await bundleConsumer(consumer.directory);
    const synonymsOnly = await graph(consumer.directory, 'synonyms-only', "export {createSynonyms,SYNONYMS_POLICY} from '@vmitsaras/raveldex/addons/synonyms';\n");
    const combined = await graph(consumer.directory, 'synonyms-combined', "export {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex'; export {createSynonyms,SYNONYMS_POLICY} from '@vmitsaras/raveldex/addons/synonyms';\n");
    assert.ok(core.inputs.every(({ path }) => !path.includes('/addons/synonyms/')));
    assert.ok(synonymsOnly.inputs.some(({ path }) => path.endsWith('/addons/synonyms/index.js')));
    assert.ok(synonymsOnly.inputs.every(({ path }) => !/execution\/engine|\/adapters\/|\/addons\/(?!synonyms)/.test(path)));
    const startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex'), await checkStartup(consumer.directory, './core-bundle.mjs'),
      await freshImport(consumer.directory, '@vmitsaras/raveldex/addons/synonyms', ['SYNONYMS_POLICY', 'createSynonyms']),
      await freshImport(consumer.directory, './synonyms-only-bundle.mjs', ['SYNONYMS_POLICY', 'createSynonyms']),
      await freshImport(consumer.directory, './synonyms-combined-bundle.mjs', ['ERROR_CODES', 'RaveldexError', 'SYNONYMS_POLICY', 'createRaveldex', 'createSynonyms'])];
    await command(process.execPath, ['--input-type=module', '--eval', `import assert from 'node:assert/strict';for(const path of ['@vmitsaras/raveldex/addons/synonyms/options','@vmitsaras/raveldex/dist/addons/synonyms/options.js'])await assert.rejects(import(path),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`], consumer.directory);
    await writeFile(join(consumer.directory, 'packed-synonyms.mjs'), runner);
    const packed = JSON.parse((await command(process.execPath, ['packed-synonyms.mjs'], consumer.directory)).stdout);
    const bundledRunner = runner.replace("import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';", '')
      .replace("import {createSynonyms,SYNONYMS_POLICY} from '@vmitsaras/raveldex/addons/synonyms';", "import {createRaveldex,RaveldexError,createSynonyms,SYNONYMS_POLICY} from './synonyms-combined-bundle.mjs';");
    await writeFile(join(consumer.directory, 'bundled-synonyms.mjs'), bundledRunner);
    const bundled = JSON.parse((await command(process.execPath, ['bundled-synonyms.mjs'], consumer.directory)).stdout);
    assert.deepEqual(bundled, packed);
    const worker = await workerProbe(consumer.directory);
    const documentation = await readFile(join(consumer.installed, 'docs/api/SYNONYMS.md'), 'utf8');
    const example = /```js\n([\s\S]*?)\n```/.exec(documentation)?.[1];
    assert.ok(example, 'exact installed synonyms documentation example exists');
    await writeFile(join(consumer.directory, 'documented-synonyms.mjs'), example);
    const documented = await command(process.execPath, ['documented-synonyms.mjs'], consumer.directory);
    assert.match(documented.stdout, /directional-one-step-v1/);
    return { kind: 'raveldex-synonyms-package-cost-v1', environment: { node: process.version, platform: process.platform, arch: process.arch },
      package: consumer.package, declarations: 'Pass, isolated installed public types with ES2022 and no DOM/Node ambient types',
      core, synonymsOnly, combined, startup, worker, documentation: { status: 'Pass', source: 'docs/api/SYNONYMS.md', exampleSha256: digest(example), stdout: documented.stdout },
      correctness: { status: 'Pass', authoredQueries: cases.length, fullPageScoreComparisonsPerRun: packed.rows.length, strictUnrequestedComparisonsPerRun: packed.strict.length,
        mutations: 'Replace/remove/clear read the live dictionary at each revision; dispose rejects later search', bundledParity: 'Pass' },
      logicalState: { extraRetainedIndexEntries: 0, retainedConfiguration: { normalizedMappings: mappings.length, vocabularyVersion }, basis: 'Owned bounded normalized vocabulary configuration is retained; no corpus side index/cache. Not a heap, allocation-byte or physical-copy peak measurement' }, packed };
  } finally { await rm(consumer.directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await measurePackedSynonyms();
  if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ correctness: report.correctness, packageBytes: report.package.tarballBytes,
    coreGzip: report.core.gzipBytes, coreTargetMet: report.core.targetMet, synonymsOnlyGzip: report.synonymsOnly.gzipBytes, combinedGzip: report.combined.gzipBytes, worker: report.worker }));
}
