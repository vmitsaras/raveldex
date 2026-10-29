import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

const schema = { text: { title: {}, body: {} } };
const records = [
  { id: 'a', text: { title: 'source source source atomic', body: 'snapshot source' } },
  { id: 'b', text: { title: 'source soup', body: 'source' } },
  { id: 'c', text: { title: 'soup solar', body: 'soup' } },
  { id: 'd', text: { title: 'café café', body: 'cafe' } },
];
// Hand-authored dictionary statistics; repeated occurrences do not add field DF.
const cases = [
  { request: { text: 'so' }, total: 3, items: [['source', 4], ['soup', 3], ['solar', 1]] },
  { request: { text: 'so', fields: ['title'] }, total: 3, items: [['soup', 2], ['source', 2], ['solar', 1]] },
  { request: { text: 'sou', limit: 1 }, total: 2, items: [['source', 4]] },
  { request: { text: 'source' }, total: 1, items: [['source', 4]] },
  { request: { text: 'ca' }, total: 2, items: [['cafe', 1], ['café', 1]] },
  { request: { text: 'ca', limit: 0 }, total: 2, items: [] },
  { request: { text: 'zzzz' }, total: 0, items: [] },
  { request: { text: 's' }, total: 0, items: [] },
  { request: { text: '' }, total: 0, items: [] },
];

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
    import assert from 'node:assert/strict'; const reads=[];
    for(const name of ['window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask'])
      Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});
    const module=await import(process.argv[1]); assert.deepEqual(Object.keys(module).sort(),JSON.parse(process.argv[2]));
    assert.deepEqual(reads,[]);console.log(JSON.stringify({specifier:process.argv[1],reads,exports:Object.keys(module).sort()}));
  `;
  return JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', source, specifier, JSON.stringify(exports.sort())], directory)).stdout);
}

const runner = `
  import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises';
  import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
  import {createSuggestions,SUGGESTIONS_POLICY} from '@vmitsaras/raveldex/addons/suggestions';
  const fixture=JSON.parse(await readFile('suggestions-fixture.json','utf8'));
  const addon=createSuggestions({fields:['title','body']});
  assert.equal(SUGGESTIONS_POLICY,'dictionary-prefix-df-v1');assert.equal(addon.manifest.indexEffect,'none');assert.equal(addon.manifest.limits.maxRetainedEntries,0);
  const engine=createRaveldex({schema:fixture.schema,addons:[addon]}),baseline=createRaveldex({schema:fixture.schema});
  const plain=result=>{const {extensions,...rest}=result;return rest};
  const wire=value=>JSON.parse(JSON.stringify(value));
  try {
    await engine.addMany(fixture.records);await baseline.addMany(fixture.records);const rows=[];
    for(const entry of fixture.cases)for(const page of [{limit:100},{limit:0},{offset:1,limit:1}]){
      const actual=await engine.search('source',{...page,extensions:{suggestions:entry.request}}), expected=await baseline.search('source',page);
      assert.deepEqual(plain(actual),expected);const completion=actual.extensions.suggestions;
      assert.equal(completion.policy,SUGGESTIONS_POLICY);assert.equal(completion.total,entry.total);
      assert.equal(completion.omitted,entry.total-entry.items.length);
      assert.deepEqual(wire(completion.items),entry.items.map(([term,fieldDocumentFrequency])=>({term,fieldDocumentFrequency})));
      assert.equal(Object.isFrozen(completion),true);assert.equal(Object.isFrozen(completion.items),true);
      rows.push({request:entry.request,page,result:actual});
    }
    const missing=await engine.search('unmatched',{extensions:{suggestions:{text:'so'}}});
    assert.equal(missing.total,0);assert.deepEqual(wire(missing.extensions.suggestions.items),[{term:'source',fieldDocumentFrequency:4},{term:'soup',fieldDocumentFrequency:3},{term:'solar',fieldDocumentFrequency:1}]);
    const strict=[];for(const query of ['source','cafe',{kind:'group',fields:['title'],variants:[{text:'so',match:'prefix'}]}]){
      const actual=await engine.search(query);assert.deepEqual(actual,await baseline.search(query));strict.push(actual);
    }
    const replacement=await engine.replace({id:'a',text:{title:'solar',body:'snapshot'}});
    const replaced=await engine.search('',{extensions:{suggestions:{text:'sou'}}});
    assert.equal(replacement.revision,2);assert.equal(replaced.revision,2);
    assert.deepEqual(wire(replaced.extensions.suggestions.items),[{term:'soup',fieldDocumentFrequency:3},{term:'source',fieldDocumentFrequency:2}]);
    const removal=await engine.remove(['b']);const removed=await engine.search('',{extensions:{suggestions:{text:'sou'}}});
    assert.equal(removal.revision,3);assert.equal(removed.revision,3);assert.deepEqual(wire(removed.extensions.suggestions.items),[{term:'soup',fieldDocumentFrequency:2}]);
    const clear=await engine.clear(),empty=await engine.search('',{extensions:{suggestions:{text:'so'}}});
    assert.equal(clear.revision,4);assert.equal(empty.revision,4);assert.equal(empty.extensions.suggestions.total,0);assert.deepEqual(wire(empty.extensions.suggestions.items),[]);
    await engine.dispose();await assert.rejects(engine.search('source'),error=>error instanceof RaveldexError&&error.code==='DISPOSED');
    console.log(JSON.stringify({rows,missing,strict,replacement,replaced,removal,removed,clear,empty}));
  }finally{await engine.dispose();await baseline.dispose();}
`;

async function workerProbe(directory) {
  await writeFile(join(directory, 'suggestions-worker.mjs'), `
    import {parentPort,workerData} from 'node:worker_threads';
    import {serveRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/host';
    import {createSuggestions} from '@vmitsaras/raveldex/addons/suggestions';
    const listeners=new Map();serveRaveldexWorker({postMessage:message=>parentPort.postMessage(message),
      addEventListener(type,listener){let byType=listeners.get(type);if(!byType){byType=new Map();listeners.set(type,byType)}const wrapped=value=>listener({data:value});byType.set(listener,wrapped);parentPort.on(type,wrapped)},
      removeEventListener(type,listener){const byType=listeners.get(type),wrapped=byType?.get(listener);if(wrapped)parentPort.off(type,wrapped);byType?.delete(listener)}},
      {addons:[createSuggestions({fields:['title','body'],maxSuggestions:workerData.maxSuggestions})]});
  `);
  await writeFile(join(directory, 'suggestions-worker-probe.mjs'), `
    import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';import {readFile} from 'node:fs/promises';
    import {createRaveldex} from '@vmitsaras/raveldex';import {createSuggestions} from '@vmitsaras/raveldex/addons/suggestions';
    import {createWorkerRaveldex,WorkerAdapterError} from '@vmitsaras/raveldex/adapters/worker';
    const fixture=JSON.parse(await readFile('suggestions-fixture.json','utf8'));
    function endpoint(worker){const listeners=new Map();return{postMessage:message=>worker.postMessage(message),
      addEventListener(type,listener){let byType=listeners.get(type);if(!byType){byType=new Map();listeners.set(type,byType)}const wrapped=value=>listener(type==='message'?{data:value}:value);byType.set(listener,wrapped);worker.on(type,wrapped)},
      removeEventListener(type,listener){const byType=listeners.get(type),wrapped=byType?.get(listener);if(wrapped)worker.off(type,wrapped);byType?.delete(listener)},terminate(){void worker.terminate()}}}
    const direct=createRaveldex({schema:fixture.schema,addons:[createSuggestions({fields:['title','body']})]});
    const worker=new Worker(new URL('./suggestions-worker.mjs',import.meta.url),{workerData:{maxSuggestions:10}});
    // Owned wire objects intentionally use null prototypes; compare every data value.
    const compare=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));let remote;
    try{
      remote=await createWorkerRaveldex({worker:endpoint(worker),configuration:{schema:fixture.schema,addons:[createSuggestions({fields:['body','title']})]},ownership:'owned',sameHost:true,responseTimeoutMs:10000});
      await remote.addMany(fixture.records);await direct.addMany(fixture.records);let comparisons=0;
      for(const entry of fixture.cases){const options={extensions:{suggestions:entry.request}};compare(await remote.search('source',options),await direct.search('source',options));comparisons++}
      const query={kind:'not',child:{kind:'text',text:'source'}},options={extensions:{suggestions:{text:'so'}}};
      compare(await remote.search(query,options),await direct.search(query,options));comparisons++;
      for(const [method,arg] of [['replace',{id:'a',text:{title:'solar',body:'snapshot'}}],['remove',['b']],['clear',undefined]]){
        await remote[method](arg);await direct[method](arg);compare(await remote.search('',options),await direct.search('',options));comparisons++;
      }
      const changed=new Worker(new URL('./suggestions-worker.mjs',import.meta.url),{workerData:{maxSuggestions:9}});
      try{await assert.rejects(createWorkerRaveldex({worker:endpoint(changed),configuration:{schema:fixture.schema,addons:[createSuggestions({fields:['title','body']})]},ownership:'owned',sameHost:true,responseTimeoutMs:10000}),error=>error instanceof WorkerAdapterError&&error.code==='INCOMPATIBLE_WORKER')}
      finally{await changed.terminate()}
      console.log(JSON.stringify({status:'Pass',transport:'Actual Node worker_threads with structural browser-endpoint bridge',comparisons,semanticOptionMismatch:'INCOMPATIBLE_WORKER',scope:'Node worker protocol and clone parity only; no browser or native-snapshot qualification'}));
    }finally{if(remote)await remote.destroy();await worker.terminate();await direct.dispose();}
  `);
  return JSON.parse((await command(process.execPath, ['suggestions-worker-probe.mjs'], directory)).stdout);
}

export async function measurePackedSuggestions() {
  const consumer = await prepareConsumer({ schema, records }, []);
  try {
    await writeFile(join(consumer.directory, 'suggestions-fixture.json'), JSON.stringify({ schema, records, cases }));
    await writeFile(join(consumer.directory, 'suggestions-types.ts'), `
      import {createRaveldex,type AddonRegistration,type DictionaryContext,type DictionaryEntryStep} from '@vmitsaras/raveldex';
      import {createSuggestions,SUGGESTIONS_POLICY,type SuggestionsOptions,type SuggestionRequest,type SuggestionsResult} from '@vmitsaras/raveldex/addons/suggestions';
      const options:SuggestionsOptions={fields:['title'],maxSuggestions:5,maxCandidates:100,maxWorkUnits:10000};
      const policy:'dictionary-prefix-df-v1'=SUGGESTIONS_POLICY;const addon:AddonRegistration=createSuggestions(options);
      const request:SuggestionRequest={text:'so',fields:['title'],limit:3};
      void createRaveldex({schema:{text:{title:{}}},addons:[addon]}).search('',{extensions:{suggestions:request}});void policy;
      declare const context:DictionaryContext;declare const entry:DictionaryEntryStep;void context;
      // @ts-expect-error Selected fields remain readonly.
      options.fields.push('body');
      // @ts-expect-error Dictionary facts remain readonly.
      entry.documentFrequency=0;
      declare const result:SuggestionsResult;
      // @ts-expect-error Suggestion results remain readonly.
      result.items.push(result.items[0]!);
      // @ts-expect-error Completion policy cannot silently become fuzzy.
      createSuggestions({fields:['title'],maxDistance:2});
      // @ts-expect-error Private implementation modules are not public exports.
      import {captureSuggestionsOptions} from '@vmitsaras/raveldex/addons/suggestions/options';
    `);
    const config = JSON.parse(await readFile(join(consumer.directory, 'tsconfig.json'), 'utf8'));
    config.include = ['suggestions-types.ts'];await writeFile(join(consumer.directory, 'suggestions-tsconfig.json'), JSON.stringify(config));
    await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'suggestions-tsconfig.json')], consumer.directory);
    const core = await bundleConsumer(consumer.directory);
    const suggestionsOnly = await graph(consumer.directory, 'suggestions-only', "export {createSuggestions,SUGGESTIONS_POLICY} from '@vmitsaras/raveldex/addons/suggestions';\n");
    const combined = await graph(consumer.directory, 'suggestions-combined', "export {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex';export {createSuggestions,SUGGESTIONS_POLICY} from '@vmitsaras/raveldex/addons/suggestions';\n");
    assert.ok(core.inputs.every(({ path }) => !path.includes('/addons/suggestions/')));
    assert.ok(suggestionsOnly.inputs.some(({ path }) => path.endsWith('/addons/suggestions/index.js')));
    assert.ok(suggestionsOnly.inputs.every(({ path }) => !/execution\/engine|\/adapters\/|\/addons\/(?!suggestions|metadata)/.test(path)));
    const startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex'),await checkStartup(consumer.directory, './core-bundle.mjs'),
      await freshImport(consumer.directory, '@vmitsaras/raveldex/addons/suggestions', ['SUGGESTIONS_POLICY','createSuggestions']),
      await freshImport(consumer.directory, './suggestions-only-bundle.mjs', ['SUGGESTIONS_POLICY','createSuggestions']),
      await freshImport(consumer.directory, './suggestions-combined-bundle.mjs', ['ERROR_CODES','RaveldexError','SUGGESTIONS_POLICY','createRaveldex','createSuggestions'])];
    await command(process.execPath, ['--input-type=module','--eval',`import assert from 'node:assert/strict';for(const path of ['@vmitsaras/raveldex/addons/suggestions/options','@vmitsaras/raveldex/dist/addons/suggestions/index.js'])await assert.rejects(import(path),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`], consumer.directory);
    await writeFile(join(consumer.directory, 'packed-suggestions.mjs'), runner);
    const packed = JSON.parse((await command(process.execPath, ['packed-suggestions.mjs'], consumer.directory)).stdout);
    const bundledRunner = runner.replace("import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';",'')
      .replace("import {createSuggestions,SUGGESTIONS_POLICY} from '@vmitsaras/raveldex/addons/suggestions';","import {createRaveldex,RaveldexError,createSuggestions,SUGGESTIONS_POLICY} from './suggestions-combined-bundle.mjs';");
    await writeFile(join(consumer.directory, 'bundled-suggestions.mjs'), bundledRunner);
    const bundled = JSON.parse((await command(process.execPath, ['bundled-suggestions.mjs'], consumer.directory)).stdout);
    assert.deepEqual(bundled,packed);const worker = await workerProbe(consumer.directory);
    const documentation = await readFile(join(consumer.installed, 'docs/api/SUGGESTIONS.md'),'utf8');
    const example = /```js\n([\s\S]*?)\n```/.exec(documentation)?.[1];assert.ok(example,'exact installed suggestions documentation example exists');
    await writeFile(join(consumer.directory,'documented-suggestions.mjs'),example);
    const documented = await command(process.execPath,['documented-suggestions.mjs'],consumer.directory);assert.match(documented.stdout,/dictionary-prefix-df-v1/);
    return {kind:'raveldex-suggestions-package-cost-v1',environment:{node:process.version,platform:process.platform,arch:process.arch},
      package:consumer.package,declarations:'Pass, isolated installed public types with ES2022 and no DOM/Node ambient types',core,suggestionsOnly,combined,startup,worker,
      documentation:{status:'Pass',source:'docs/api/SUGGESTIONS.md',exampleSha256:digest(example),stdout:documented.stdout},
      correctness:{status:'Pass',authoredRequests:cases.length,fullPageComparisonsPerRun:packed.rows.length,strictUnrequestedComparisonsPerRun:packed.strict.length,
        queryIndependentOutput:'Pass, suggestions are present even for no search hits',mutations:'Replace/remove/clear use current dictionary and revision; disposal rejects later searches',bundledParity:'Pass'},
      logicalState:{extraRetainedIndexEntries:0,basis:'Stateless registration manifest and direct live dictionary output; not a heap or allocation peak measurement'},packed};
  }finally{await rm(consumer.directory,{recursive:true,force:true});}
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await measurePackedSuggestions();if(process.argv[2])await writeFile(resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({correctness:report.correctness,packageBytes:report.package.tarballBytes,coreGzip:report.core.gzipBytes,coreTargetMet:report.core.targetMet,suggestionsOnlyGzip:report.suggestionsOnly.gzipBytes,combinedGzip:report.combined.gzipBytes,worker:report.worker}));
}
