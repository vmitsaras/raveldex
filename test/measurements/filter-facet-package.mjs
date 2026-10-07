import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup } from '../../scripts/lib/packed-consumer.mjs';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS } from '../fixtures/docs/judgments.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

const and = (...children) => ({ kind: 'and', children });
const or = (...children) => ({ kind: 'or', children });
const not = child => ({ kind: 'not', child });
const range = payload => ({ kind: 'range', ...payload });
const set = payload => ({ kind: 'set', ...payload });
const text = value => ({ kind: 'text', text: value });
const phrase = value => ({ kind: 'phrase', text: value });
const pages = [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 1 }];

/** Complete independent filtering and original-source phrase/BM25 reference.
 * Neither the package predicate nor its analyzer/scorer is imported here. */
function lower(query, metadata) {
  if (query.kind === 'range' || query.kind === 'set') {
    const present = Object.hasOwn(metadata, query.field), raw = metadata[query.field];
    const values = Array.isArray(raw) ? raw : [raw];
    const matches = present && values.some(value => query.kind === 'set'
      ? query.values.some(candidate => value === candidate)
      : typeof value === 'number' && (!Object.hasOwn(query, 'gt') || value > query.gt)
        && (!Object.hasOwn(query, 'gte') || value >= query.gte)
        && (!Object.hasOwn(query, 'lt') || value < query.lt)
        && (!Object.hasOwn(query, 'lte') || value <= query.lte));
    return { kind: matches ? 'all' : 'none' };
  }
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(child => lower(child, metadata)) };
  if (query.kind === 'not') return { ...query, child: lower(query.child, metadata) };
  return query;
}
function scanQuery(records, schema, query, options = {}) {
  const corpus = scanPhraseSourceCorpus(records, schema), hits = [];
  for (const document of corpus.documents) {
    const result = sourcePhraseQueryResult({ ...corpus, documents: [document] }, lower(query, document.metadata), { limit: 1 });
    if (result.total) hits.push(result.hits[0]);
  }
  hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { total: hits.length, qualified: new Set(hits.map(hit => hit.id)), hits: hits.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 20)) };
}
function scanFacets(records, payload) {
  const missing = Symbol('missing');
  return { fields: payload.fields.map(selection => {
    const counts = new Map();
    for (const record of records) {
      const metadata = record.metadata ?? {};
      if (!Object.hasOwn(metadata, selection.field)) {
        if (selection.missing) counts.set(missing, (counts.get(missing) ?? 0) + 1);
        continue;
      }
      const raw = metadata[selection.field];
      for (const value of new Set(Array.isArray(raw) ? raw : [raw])) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const sorted = [...counts].sort(([a, ac], [b, bc]) => bc - ac
      || (a === missing || b === missing ? a === b ? 0 : a === missing ? 1 : -1
        : a === null || b === null ? a === b ? 0 : a === null ? -1 : 1
          : a < b ? -1 : a > b ? 1 : 0));
    const buckets = sorted.slice(0, selection.limit ?? 20).map(([value, count]) => value === missing ? { kind: 'missing', count } : { kind: 'value', value, count });
    return { field: selection.field, buckets, distinctValueTotal: counts.size, omittedBucketCount: counts.size - buckets.length };
  }) };
}
function compare(actual, records, schema, query, page, payload, revision) {
  const expected = scanQuery(records, schema, query, page);
  assert.equal(actual.revision, revision); assert.equal(actual.model, 'raveldex-bm25-v1'); assert.equal(actual.completeness, 'complete');
  assert.equal(actual.total, expected.total);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
  for (let index = 0; index < actual.hits.length; index++) assert.ok(Math.abs(actual.hits[index].score - expected.hits[index].score) <= Math.max(1e-12, Math.abs(expected.hits[index].score) * 1e-12));
  assert.deepEqual(actual.extensions, { facets: scanFacets(records.filter(record => expected.qualified.has(record.id)), payload) });
}

function scenarios(corpus) {
  const numeric = range({ field: 'price', gte: 10, lte: 20 }), red = set({ field: 'tags', values: ['red'] });
  const typed = {
    name: 'typed',
    schema: { text: { title: { boost: 2 }, body: {} }, metadata: { price: { type: 'number', multi: true, nullable: true }, quality: { type: 'number' }, tags: { type: 'string', multi: true, nullable: true }, status: { type: 'string' }, active: { type: 'boolean', multi: true, nullable: true } } },
    records: [
      { id: 'a', text: { title: 'alpha beta', body: 'beta alpha' }, metadata: { price: [5, 25], quality: 0, tags: ['red', 'red', null], status: '', active: [false, null] } },
      { id: 'b', text: { title: 'alpha', body: ['alpha beta', 'gamma'] }, metadata: { price: [10, 20], quality: 10, tags: ['blue', 'red'], status: 'open', active: [true] } },
      { id: 'c', text: { title: 'beta', body: 'alpha alpha gamma' }, metadata: { price: [15, null], quality: 20, tags: [null], status: 'closed', active: [false] } },
      { id: 'd', text: { title: 'gamma', body: ['alpha', 'beta'] }, metadata: { price: [], tags: [], active: [] } },
      { id: 'e', text: { title: 'beta alpha beta', body: '' }, metadata: { price: [null], tags: [null], active: [null] } },
      { id: 'f', text: { title: 'alpha beta beta', body: 'gamma' } },
      { id: 'g', text: {}, metadata: { price: [-1, 0], quality: -0, tags: ['10', 'é', '😀'], status: '10', active: [false, true] } },
      { id: 'h', text: { title: 'alpha alpha', body: 'beta' }, metadata: { price: [10.5], quality: 1.5, tags: ['Red'], status: 'open', active: [true] } },
    ],
    queries: [{ kind: 'all' }, numeric, red, set({ field: 'tags', values: [null] }), not(set({ field: 'tags', values: [null] })), and(text('alpha'), numeric), or(text('alpha'), red), and(red, numeric), or(phrase('alpha beta'), numeric), not(phrase('alpha beta')), or(and(phrase('alpha beta'), red), and(text('beta'), numeric)), and(set({ field: 'active', values: [false] }), range({ field: 'quality', gte: 0 }))],
    facetRequests: [
      { fields: [{ field: 'tags', limit: 100, missing: true }, { field: 'status', limit: 100, missing: true }] },
      { fields: [{ field: 'tags', limit: 1, missing: true }, { field: 'status', limit: 0, missing: true }] },
      { fields: [{ field: 'tags', limit: 0 }, { field: 'status', limit: 1, missing: true }] },
    ],
  };
  const docs = { name: 'real-docs', schema: corpus.schema, records: corpus.records,
    queries: [{ kind: 'all' }, set({ field: 'category', values: ['spec'] }), and(text('native'), set({ field: 'category', values: ['architecture'] })), or(phrase('commit point'), set({ field: 'sourcePath', values: ['docs/specs/RANKING.md'] })), not(set({ field: 'category', values: ['architecture'] })), and(text('unfindablefixtureword'), set({ field: 'category', values: ['spec'] }))],
    facetRequests: [{ fields: [{ field: 'category', limit: 20, missing: true }, { field: 'sourcePath', limit: 2 }] }, { fields: [{ field: 'category', limit: 0 }, { field: 'sourcePath', limit: 0, missing: true }] }],
  };
  const hand = { name: 'hand-numerical', schema: { text: { title: {} }, metadata: { price: { type: 'number' }, tags: { type: 'string', multi: true, nullable: true } } },
    records: [{ id: 'a', text: { title: 'alpha alpha' }, metadata: { price: 10, tags: ['red', 'red'] } }, { id: 'b', text: { title: 'alpha beta' }, metadata: { price: 20, tags: ['blue', null] } }, { id: 'c', text: { title: 'gamma' } }],
    queries: [and(text('alpha'), range({ field: 'price', gte: 10 }))], facetRequests: [{ fields: [{ field: 'tags', limit: 10, missing: true }] }],
  };
  return [typed, docs, hand];
}

function native(query) {
  if (query.kind === 'range' || query.kind === 'set' || query.kind === 'phrase') {
    const { kind, ...payload } = query;
    return { kind: 'extension', capability: kind === 'range' ? 'numeric-range' : kind === 'set' ? 'set-membership' : 'phrases', version: 1, payload };
  }
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(native) };
  if (query.kind === 'not') return { ...query, child: native(query.child) };
  return query;
}

async function graph(directory, name, entry) {
  await writeFile(join(directory, `${name}.mjs`), entry);
  const settings = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
  const result = await build({ ...settings, absWorkingDir: directory, entryPoints: [`${name}.mjs`], outfile: `${name}-bundle.mjs`, logLevel: 'silent' });
  assert.equal(result.outputFiles.length, 1);
  const bytes = result.outputFiles[0].contents, gzipSettings = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 };
  const compressed = gzipSync(bytes, gzipSettings);
  const inputs = Object.entries(result.metafile.inputs).map(([path, input]) => ({ path, bytes: input.bytes, imports: input.imports }));
  for (const input of inputs) { assert.ok(input.path === `${name}.mjs` || input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/')); assert.ok(input.imports.every(item => !item.external)); }
  assert.deepEqual(Object.values(result.metafile.outputs)[0].imports, []);
  await writeFile(join(directory, `${name}-bundle.mjs`), bytes);
  return { entry, esbuild: version, settings, gzip: { ...gzipSettings, mtime: 0 }, minifiedBytes: bytes.length, gzipBytes: compressed.length, sha256: digest(bytes), gzipSha256: digest(compressed), inputs, metafile: result.metafile };
}
async function guard(directory, specifier, expected) {
  const script = `const reads=[];for(const name of ['window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask'])Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});const mod=await import(process.argv[1]);console.log(JSON.stringify({specifier:process.argv[1],reads,exports:Object.keys(mod).sort()}));`;
  const result = JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', script, specifier], directory)).stdout);
  assert.deepEqual(result.reads, []); assert.deepEqual(result.exports, expected); return result;
}

const declarationFixture = `
import {createRaveldex,type Query,type SearchOptions} from '@vmitsaras/raveldex';
import {createFilters,type FilterOptions,type NumericRangePayload,type SetMembershipPayload} from '@vmitsaras/raveldex/addons/filters';
import {createFacets,type FacetOptions,type FacetRequest,type FacetResult,type FacetBucket,type FacetFieldResult} from '@vmitsaras/raveldex/addons/facets';
const filters:FilterOptions={fields:['price','tags']}; const facets:FacetOptions={fields:['tags']};
const range:NumericRangePayload={field:'price',gte:1,lte:20};const selected:SetMembershipPayload={field:'tags',values:['red',null]};
const request:FacetRequest={fields:[{field:'tags',limit:0,missing:true}]};const options:SearchOptions={limit:0,extensions:{facets:request}};
const query:Query={kind:'extension',capability:'numeric-range',version:1,payload:range};
const engine=createRaveldex({schema:{text:{title:{}},metadata:{price:{type:'number'},tags:{type:'string',multi:true,nullable:true}}},addons:[createFilters(filters),createFacets(facets)]});
void engine.search(query,options);void selected; void engine.dispose();
// @ts-expect-error selected fields remain readonly
filters.fields.push('other');
// @ts-expect-error request values remain readonly
selected.values.push('blue');
// @ts-expect-error range endpoints remain readonly
range.gte=2;
// @ts-expect-error facet requests remain readonly
request.fields[0]!.limit=1;
// @ts-expect-error facet options remain readonly
facets.maxBucketsPerField=200;
function inspect(result:FacetResult,field:FacetFieldResult,bucket:FacetBucket){void field;void bucket;
// @ts-expect-error facet output is readonly
result.fields.push(field);
// @ts-expect-error bucket count is readonly
bucket.count=0;}
void inspect;
// @ts-expect-error private options capture is not public
import {captureFilterOptions} from '@vmitsaras/raveldex/addons/filters';
// @ts-expect-error private facet protocol files are not exported
import {createFacets as hidden} from '@vmitsaras/raveldex/dist/addons/facets/facets.js';
`;

const runner = `
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
import {createFilters} from '@vmitsaras/raveldex/addons/filters';
import {createFacets} from '@vmitsaras/raveldex/addons/facets';
import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
const scenarios=JSON.parse(await readFile('filter-facet-scenarios.json','utf8')),runs=[];
for(const scenario of scenarios){
  const textFields=Object.keys(scenario.schema.text),metadataFields=Object.keys(scenario.schema.metadata),facetFields=metadataFields.filter(field=>scenario.schema.metadata[field].type==='string');
  const engine=createRaveldex({schema:scenario.schema,addons:[createFilters({fields:metadataFields}),createFacets({fields:facetFields}),createSourceProvider({fields:textFields}),createSourcePhrases({fields:textFields})]});
  assert.ok(Object.isFrozen(engine));const facadeKeys=Object.keys(engine).sort();await engine.addMany(scenario.records);const rows=[];
  for(const query of scenario.queries)for(const page of scenario.pages)for(const payload of scenario.facetRequests)rows.push({query,page,payload,result:await engine.search(query,{...page,extensions:{facets:payload}})});
  const first=scenario.records[0],metadata={...first.metadata},field=facetFields[0],declared=scenario.schema.metadata[field];
  metadata[field]=declared.multi?['package-new','package-new',...(declared.nullable?[null]:[]) ]:'package-new';
  const numeric=metadataFields.find(name=>scenario.schema.metadata[name].type==='number');if(numeric)metadata[numeric]=scenario.schema.metadata[numeric].multi?[12]:12;
  const replacement={...first,text:{...first.text,[textFields[0]]:'alpha beta revision'},metadata};
  const probe={kind:'and',children:[{kind:'extension',capability:'phrases',version:1,payload:{text:'alpha beta',fields:[textFields[0]]}},{kind:'extension',capability:'set-membership',version:1,payload:{field,values:['package-new']}}]},payload=scenario.facetRequests[0],page={limit:100};
  const replace=await engine.replace(replacement),updated=await engine.search(probe,{...page,extensions:{facets:payload}});
  const remove=await engine.remove(first.id),removed=await engine.search(probe,{limit:0,extensions:{facets:payload}});
  const clear=await engine.clear(),empty=await engine.search({kind:'all'},{limit:0,extensions:{facets:payload}});
  const add=await engine.add(first),restored=await engine.search(scenario.queries[0],{...page,extensions:{facets:payload}});
  await assert.rejects(engine.search({kind:'extension',capability:'numeric-range',version:2,payload:{field:numeric??field,gte:0}}),error=>error instanceof RaveldexError&&error.code==='INCOMPATIBLE_CAPABILITY');
  await engine.dispose();await assert.rejects(engine.search('alpha'),error=>error instanceof RaveldexError&&error.code==='DISPOSED');
  const bare=createRaveldex({schema:scenario.schema});await bare.add(first);await assert.rejects(bare.search({kind:'extension',capability:'set-membership',version:1,payload:{field,values:['package-new']}}),error=>error instanceof RaveldexError&&error.code==='MISSING_CAPABILITY');const bareResult=await bare.search({kind:'all'});assert.equal(bareResult.total,1);assert.equal(bareResult.extensions,undefined);await bare.dispose();
  runs.push({name:scenario.name,facadeKeys,rows,replacement,probe,payload,page,replace,updated,remove,removed,clear,empty,add,restored,bareResult});
}console.log(JSON.stringify(runs));`;

export async function measurePackedFilterFacets() {
  const corpus = buildCorpus(), consumer = await prepareConsumer(corpus, DOCS_JUDGMENTS);
  try {
    const compiledFiles = [];
    for (const file of consumer.package.files.filter(file => /^dist\/.+(?:\.js|\.d\.ts)$/.test(file.path))) {
      const sourcePath = file.path.replace(/^dist\//, 'src/').replace(/\.d\.ts$|\.js$/, '.ts');
      const sourceBytes = await readFile(join(fileURLToPath(new URL('../../', import.meta.url)), sourcePath));
      compiledFiles.push({ path: file.path, sourcePath, sourceSha256: digest(sourceBytes), compiledSha256: digest(await readFile(join(consumer.installed, file.path))) });
    }
    assert.ok(compiledFiles.length > 0);
    const core = await bundleConsumer(consumer.directory);
    core.metafile = JSON.parse(await readFile(join(consumer.directory, 'metafile.json'), 'utf8'));
    const startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex'), await checkStartup(consumer.directory, './core-bundle.mjs')];
    const graphs = {};
    graphs.filters = await graph(consumer.directory, 'filters', "export {createFilters} from '@vmitsaras/raveldex/addons/filters';");
    graphs.facets = await graph(consumer.directory, 'facets', "export {createFacets} from '@vmitsaras/raveldex/addons/facets';");
    graphs.combined = await graph(consumer.directory, 'combined', "export {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex'; export {createFilters} from '@vmitsaras/raveldex/addons/filters'; export {createFacets} from '@vmitsaras/raveldex/addons/facets'; export {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';");
    for (const [name, excluded] of [['filters', /facets\//], ['facets', /filters\//]]) {
      assert.ok(graphs[name].inputs.every(({ path }) => !excluded.test(path) && !/phrases\/|positions\/|adapters\/|core\/(execution|query|index|mutations)\//.test(path)));
    }
    assert.ok(graphs.combined.inputs.every(({ path }) => !/positions\/|adapters\//.test(path)));
    for (const [specifier, exports] of [['@vmitsaras/raveldex/addons/filters', ['createFilters']], ['@vmitsaras/raveldex/addons/facets', ['createFacets']], ['./filters-bundle.mjs', ['createFilters']], ['./facets-bundle.mjs', ['createFacets']], ['./combined-bundle.mjs', ['ERROR_CODES', 'RaveldexError', 'createFacets', 'createFilters', 'createRaveldex', 'createSourcePhrases', 'createSourceProvider']]]) startup.push(await guard(consumer.directory, specifier, exports));
    const denied = ['@vmitsaras/raveldex/addons/filters/options', '@vmitsaras/raveldex/addons/facets/facets', '@vmitsaras/raveldex/addons/facets/options', '@vmitsaras/raveldex/addons/metadata/payload', '@vmitsaras/raveldex/dist/addons/filters/index.js', '@vmitsaras/raveldex/dist/addons/facets/facets.js', '@vmitsaras/raveldex/dist/addons/metadata/payload.js', '@vmitsaras/raveldex/dist/core/query/search.js'];
    const denial = JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', `import assert from 'node:assert/strict';const rows=[];for(const specifier of JSON.parse(process.argv[1])){await assert.rejects(import(specifier),error=>{assert.equal(error.code,'ERR_PACKAGE_PATH_NOT_EXPORTED');rows.push({specifier,code:error.code});return true;});}console.log(JSON.stringify(rows));`, JSON.stringify(denied)], consumer.directory)).stdout);
    await writeFile(join(consumer.directory, 'filter-facet-types.ts'), declarationFixture);
    await writeFile(join(consumer.directory, 'filter-facet-tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: [], strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true }, include: ['filter-facet-types.ts'] }));
    await command(join(fileURLToPath(new URL('../../', import.meta.url)), 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'filter-facet-tsconfig.json')], consumer.directory);
    const inputs = scenarios(corpus);
    await writeFile(join(consumer.directory, 'filter-facet-scenarios.json'), JSON.stringify(inputs.map(scenario => ({ ...scenario, queries: scenario.queries.map(native), pages }))));
    await writeFile(join(consumer.directory, 'packed-filter-facets.mjs'), runner);
    const packed = JSON.parse((await command(process.execPath, ['packed-filter-facets.mjs'], consumer.directory)).stdout);
    let completeComparisons = 0;
    for (const [scenarioIndex, run] of packed.entries()) {
      const scenario = inputs[scenarioIndex]; assert.equal(run.name, scenario.name);
      assert.deepEqual(run.facadeKeys, ['add', 'addMany', 'clear', 'dispose', 'remove', 'replace', 'search']);
      let row = 0;
      for (const query of scenario.queries) for (const page of pages) for (const payload of scenario.facetRequests) {
        compare(run.rows[row++].result, scenario.records, scenario.schema, query, page, payload, 1); completeComparisons++;
      }
      const changed = scenario.records.map(record => record.id === run.replacement.id ? run.replacement : record);
      const probe = and({ kind: 'phrase', text: 'alpha beta', fields: [Object.keys(scenario.schema.text)[0]] }, set({ field: Object.keys(scenario.schema.metadata).find(field => scenario.schema.metadata[field].type === 'string'), values: ['package-new'] }));
      compare(run.updated, changed, scenario.schema, probe, run.page, run.payload, 2);
      compare(run.removed, changed.filter(record => record.id !== run.replacement.id), scenario.schema, probe, { limit: 0 }, run.payload, 3);
      compare(run.empty, [], scenario.schema, { kind: 'all' }, { limit: 0 }, run.payload, 4);
      compare(run.restored, [scenario.records[0]], scenario.schema, scenario.queries[0], run.page, run.payload, 5);
      assert.equal(run.replace.revision, 2); assert.equal(run.remove.revision, 3); assert.equal(run.clear.revision, 4); assert.equal(run.add.revision, 5);
      completeComparisons += 4;
    }
    const numerical = packed.find(run => run.name === 'hand-numerical').rows[0].result;
    const idf = Math.log(1 + (3 - 2 + 0.5) / (2 + 0.5)), normalizer = 1.2 * (1 - 0.75 + 0.75 * 2 / (5 / 3));
    const handScores = [{ id: 'a', score: idf * (2 * 2.2) / (2 + normalizer) }, { id: 'b', score: idf * 2.2 / (1 + normalizer) }];
    assert.equal(numerical.total, 2); assert.deepEqual(numerical.hits.map(hit => hit.id), ['a', 'b']);
    for (let index = 0; index < 2; index++) assert.ok(Math.abs(numerical.hits[index].score - handScores[index].score) <= 1e-12);
    const bundledRunner = runner.replace(/import \{[^\n]+\} from '@vmitsaras\/raveldex[^']*';/g, '')
      .replace('const scenarios=', "import {createRaveldex,RaveldexError,createFilters,createFacets,createSourceProvider,createSourcePhrases} from './combined-bundle.mjs'; const scenarios=");
    await writeFile(join(consumer.directory, 'bundled-filter-facets.mjs'), bundledRunner);
    const bundled = JSON.parse((await command(process.execPath, ['bundled-filter-facets.mjs'], consumer.directory)).stdout); assert.deepEqual(bundled, packed);
    return { package: consumer.package, environment: { node: process.version, platform: process.platform, arch: process.arch },
      measurementScriptSha256: digest(await readFile(fileURLToPath(import.meta.url))),
      corpus: { records: corpus.records.length, hash: corpus.hash, sources: corpus.sources },
      scenarios: inputs.map(scenario => ({ name: scenario.name, records: scenario.records.length, queryCount: scenario.queries.length, pageCount: pages.length, facetRequests: scenario.facetRequests, hash: digest(JSON.stringify(scenario)) })),
      core, graphs, startup, privateDenial: denial,
      compiledFiles: { status: 'Pass', filesVerified: compiledFiles.length, mapping: compiledFiles },
      declarations: { status: 'Pass', publicFixtureSha256: digest(await readFile(join(consumer.directory, 'public-types.ts'))), metadataFixtureSha256: digest(declarationFixture) },
      correctness: { status: 'Pass', completeComparisonsPerRun: completeComparisons, completeFacetTablesPerRun: completeComparisons, bundledParity: 'Pass', handScores, scenarios: inputs.length }, packed };
  } finally { await rm(consumer.directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await measurePackedFilterFacets();
  if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ correctness: report.correctness, packageBytes: report.package.tarballBytes, coreGzip: report.core.gzipBytes, coreTargetMet: report.core.targetMet, graphs: Object.fromEntries(Object.entries(report.graphs).map(([name, graph]) => [name, { minifiedBytes: graph.minifiedBytes, gzipBytes: graph.gzipBytes, inputs: graph.inputs.length }])) }));
}
