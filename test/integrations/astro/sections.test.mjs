import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, readdir, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSourceProvider } from '../../../dist/addons/phrases/index.js';
import { createSectionEvidence } from '../../../dist/addons/sections/index.js';
import { currentNodeSnapshotEnvironment } from '../../../dist/adapters/snapshots/index.js';
import { buildStaticSearch } from '../../../integrations/astro/dist/build.js';
import { loadStaticSearch } from '../../../integrations/astro/dist/client.js';
import raveldexAstro from '../../../integrations/astro/dist/index.js';

const corpus = JSON.parse(await readFile(new URL('../../fixtures/page-sections/corpus.json', import.meta.url)));
const projection = JSON.parse(await readFile(new URL('../../fixtures/page-sections/projection.json', import.meta.url)));
const entries = corpus.records.map((record, index) => ({ record, title: corpus.documents[index].title, path: `/guide/${String.fromCharCode(97 + index)}/` }));
const encoder = new TextEncoder(), clone = structuredClone;
const hash = text => createHash('sha256').update(typeof text === 'string' ? encoder.encode(text) : text).digest('hex');
const configuration = (extra = {}) => ({ schema: corpus.schema, addons: [createSourceProvider({ fields: ['body', 'title'] }), createSectionEvidence({ fields: { body: 'source', title: 'source' } })], ...extra });
const opts = (extra = {}) => ({ configuration: configuration(), entries, pageSections: projection.pages, buildId: 'sections-1', ...extra });
const code = (...codes) => error => { assert.ok(codes.includes(error.code), `${error.name}/${error.code}`); assert.doesNotMatch(error.message, /guide|café|alpha|secret/); return true; };
const frozen = value => { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); } };
function response(url, body, status = 200) {
  const value = new Response(body, { status }); Object.defineProperty(value, 'url', { value: url }); return value;
}
function network(artifacts) {
  const directory = `https://static.example${artifacts.manifest.base}raveldex/`, manifestUrl = directory + 'manifest.json';
  const files = new Map(Object.entries(artifacts.files).map(([name, body]) => [directory + name, body])), requests = [];
  const net = { directory, manifestUrl, files, requests, override: undefined, async fetch(input, options = {}) {
    const url = String(input); requests.push(url); assert.equal(options.redirect, 'error');
    if (net.override) { const result = await net.override(url, options); if (result !== undefined) return result; }
    return files.has(url) ? response(url, files.get(url)) : response(url, '', 404);
  } }; return net;
}
const load = (artifacts, net, extra = {}) => loadStaticSearch({ manifestUrl: net.manifestUrl, expectedBuildId: artifacts.manifest.buildId, configuration: configuration(), fetch: net.fetch, ...extra });
function changed(artifacts, changeManifest, changeAsset) {
  const files = { ...artifacts.files }, manifest = clone(JSON.parse(files['sections-manifest.json']));
  if (changeAsset) {
    const data = JSON.parse(files[manifest.asset.file]); changeAsset(data);
    const text = JSON.stringify(data), sha256 = hash(text), file = `sections-${sha256}.json`;
    delete files[manifest.asset.file]; files[file] = text;
    manifest.asset = { file, sha256, bytes: encoder.encode(text).length };
  }
  changeManifest?.(manifest); files['sections-manifest.json'] = JSON.stringify(manifest);
  return { ...artifacts, files };
}

// These adapter tests use the established explicit development peer. Parent's
// installed-consumer tests separately exercise genuine packed public artifacts.
test('optional companion preserves every existing v1 byte and exact native pages at root and subdirectory bases', async t => {
  let comparisons = 0;
  for (const base of ['/', '/help/']) {
    const withMaps = await buildStaticSearch(opts({ base }));
    const ordinaryOptions = opts({ base }); delete ordinaryOptions.pageSections;
    const ordinary = await buildStaticSearch(ordinaryOptions);
    assert.deepEqual(withMaps.manifest, ordinary.manifest);
    for (const [file, text] of Object.entries(ordinary.files)) assert.equal(withMaps.files[file], text, file);
    assert.equal(Object.keys(withMaps.files).length, Object.keys(ordinary.files).length + 2);
    const meta = JSON.parse(withMaps.files['sections-manifest.json']);
    assert.equal(meta.sourceSha256, withMaps.manifest.assets.source.sha256); assert.equal(meta.documentsSha256, withMaps.manifest.assets.documents.sha256);
    assert.equal(meta.asset.file, `sections-${hash(withMaps.files[meta.asset.file])}.json`);
    const net = network(withMaps), loaded = await load(withMaps, net), flatNet = network(ordinary), flat = await load(ordinary, flatNet);
    try {
      assert.equal(net.requests.length, 2); assert.ok(net.requests.every(url => !url.includes('sections-') && !url.includes('documents-')));
      for (const query of corpus.queries) for (const page of corpus.expectedPages.pages) {
        const actual = await loaded.engine.search(query.query, { offset: page.offset, limit: page.limit });
        assert.deepEqual(actual, await flat.engine.search(query.query, { offset: page.offset, limit: page.limit }));
        assert.equal(actual.total, 4); assert.deepEqual(actual.hits.map(hit => hit.id), page.ids); comparisons++;
      }
      const sections = await loaded.loadSections(); frozen(sections); assert.equal(sections.revision, 1);
      assert.deepEqual(sections.pages.map(page => page.pageId), ['page:a', 'page:b', 'page:c', 'page:d']);
      assert.deepEqual(sections.pages[1].sections, []);
      assert.deepEqual(sections.pages[3].sections.map(section => section.anchor), ['early-value', 'later-value', 'title']);
      assert.equal(net.requests.length, 4); assert.equal(net.requests[2], net.directory + 'sections-manifest.json');
      await loaded.loadSections(); assert.equal(net.requests.length, 6, 'explicit calls are uncached');
      assert.equal((await loaded.loadDocuments()).length, 4); assert.equal(net.requests.length, 7);
    } finally { await loaded.dispose(); await flat.dispose(); }
  }
  t.diagnostic(JSON.stringify({ unchangedV1Bytes: true, nativePageComparisons: comparisons, bases: ['/', '/help/'], companionReadsPerExplicitLoad: 2 }));
});

test('omitted maps emit no companion; explicit empty maps emit every ID with an empty list without silently requiring the factory', async () => {
  const options = opts(); delete options.pageSections;
  const old = await buildStaticSearch(options), net = network(old), loaded = await load(old, net);
  try { await assert.rejects(loaded.loadSections(), code('MISSING_ARTIFACT')); assert.equal((await loaded.engine.search('alpha')).total, 4); assert.equal(net.requests.length, 3); } finally { await loaded.dispose(); }
  const withoutFactory = { schema: corpus.schema, addons: [createSourceProvider({ fields: ['body', 'title'] })] };
  const empty = await buildStaticSearch(opts({ configuration: withoutFactory, pageSections: [] }));
  const meta = JSON.parse(empty.files['sections-manifest.json']), data = JSON.parse(empty.files[meta.asset.file]);
  assert.equal(data.pages.length, 4); assert.ok(data.pages.every(page => page.sections.length === 0));
  const metadataOnly = await buildStaticSearch(opts({ configuration: withoutFactory }));
  const metaNet = network(metadataOnly), metadataLoaded = await load(metadataOnly, metaNet, { configuration: withoutFactory });
  try { assert.equal((await metadataLoaded.loadSections()).pages[0].sections.length, 4); } finally { await metadataLoaded.dispose(); }
});

test('builder owns metadata synchronously and rejects malformed maps, source ranges, fields, anchors and getters', async t => {
  const input = opts({ pageSections: clone(projection.pages) }), pending = buildStaticSearch(input);
  input.pageSections[0].sections[0].heading = 'mutated after call'; input.pageSections.length = 0;
  const built = await pending, meta = JSON.parse(built.files['sections-manifest.json']);
  assert.equal(JSON.parse(built.files[meta.asset.file]).pages[0].sections[0].heading, 'Details');
  const mutations = [
    pages => pages.push(clone(pages[0])), pages => { pages[0].pageId = 'foreign'; },
    pages => { pages[0].extra = true; }, pages => { pages[0].sections[0].extra = true; },
    pages => { pages[0].sections[0].anchor = ''; }, pages => { pages[0].sections[0].anchor = 'bad id'; },
    pages => { pages[0].sections[0].anchor = 'x:~:text'; }, pages => { pages[0].sections[0].anchor = '\u0000'; },
    pages => { pages[0].sections[0].anchor = '\ud800'; }, pages => { pages[0].sections[0].heading = ' '; },
    pages => { pages[0].sections[0].headingLevel = 7; }, pages => { pages[0].sections[0].field = 'missing'; },
    pages => { pages[0].sections[0].valueIndex = 2; }, pages => { pages[0].sections[0].start = 1; },
    pages => { pages[0].sections[0].end = 7; }, pages => { pages[0].sections[0].end = 100; },
    pages => { pages[0].sections[0].end = 22; }, pages => { pages[0].sections[1].anchor = 'details'; },
    pages => { pages[0].sections[0].start = pages[0].sections[0].end; },
    pages => { delete pages[0].sections[0]; }, pages => { pages[0].sections = Array(65).fill(pages[0].sections[0]); },
  ];
  for (const mutate of mutations) { const pages = clone(projection.pages); mutate(pages); await assert.rejects(buildStaticSearch(opts({ pageSections: pages })), code('INVALID_INPUT', 'ASSET_LIMIT')); }
  let getters = 0; const malicious = clone(projection.pages);
  Object.defineProperty(malicious[0].sections[0], 'heading', { enumerable: true, get() { getters++; return 'unsafe'; } });
  await assert.rejects(buildStaticSearch(opts({ pageSections: malicious })), code('INVALID_INPUT')); assert.equal(getters, 0);
  const fragment = clone(entries); fragment[0].path += '#heading'; await assert.rejects(buildStaticSearch(opts({ entries: fragment })), code('INVALID_INPUT'));
  t.diagnostic(JSON.stringify({ malformedMapCases: mutations.length, getterInvocations: getters, ownedBeforeAwait: true }));
});

test('companion metadata verifies every generation binding and strict descriptor before requesting its asset', async t => {
  const artifacts = await buildStaticSearch(opts()); let count = 0;
  const cases = [
    [meta => { meta.kind = 'foreign'; }, 'INVALID_ARTIFACT'], [meta => { meta.version = 2; }, 'INVALID_ARTIFACT'],
    [meta => { meta.buildId = 'other'; }, 'STALE_BUILD'], [meta => { meta.base = '/other/'; }, 'INCOMPATIBLE_ARTIFACT'],
    [meta => { meta.recordCount = 3; }, 'INCOMPATIBLE_ARTIFACT'], [meta => { meta.configurationSha256 = '0'.repeat(64); }, 'INCOMPATIBLE_ARTIFACT'],
    [meta => { meta.documentIdsSha256 = '0'.repeat(64); }, 'INCOMPATIBLE_ARTIFACT'], [meta => { meta.sourceSha256 = '0'.repeat(64); }, 'INCOMPATIBLE_ARTIFACT'],
    [meta => { meta.documentsSha256 = '0'.repeat(64); }, 'INCOMPATIBLE_ARTIFACT'], [meta => { meta.sourceSha256 = 'invalid'; }, 'INVALID_ARTIFACT'],
    [meta => { meta.asset.file = '../outside.json'; }, 'INVALID_ARTIFACT'], [meta => { meta.asset.extra = true; }, 'INVALID_ARTIFACT'],
    [meta => { meta.asset.bytes = 4 * 1024 * 1024 + 1; }, 'ASSET_LIMIT'], [meta => { meta.extra = true; }, 'INVALID_ARTIFACT'],
  ];
  for (const [change, expected] of cases) {
    const value = changed(artifacts, change), net = network(value), owner = await load(value, net);
    try { await assert.rejects(owner.loadSections(), code(expected)); assert.equal(net.requests.length, 3); assert.equal((await owner.engine.search('alpha')).total, 4); count++; } finally { await owner.dispose(); }
  }
  t.diagnostic(JSON.stringify({ strictMetadataCases: count, ordinaryOwnerRemainsUsable: true }));
});

test('rehashed companion data still validates canonical IDs, complete coverage, source fields and original grapheme endpoints', async t => {
  const artifacts = await buildStaticSearch(opts()); let count = 0;
  const mutations = [
    data => { data.kind = 'foreign'; }, data => { data.version = 2; }, data => { data.extra = true; },
    data => { data.buildId = 'other'; }, data => { data.pages.pop(); }, data => { data.pages.reverse(); },
    data => { data.pages[0].pageId = 'foreign'; }, data => { data.pages[1].pageId = 'page:a'; },
    data => { data.pages[0].sections.reverse(); }, data => { data.pages[0].sections[0].start = 1; },
    data => { data.pages[0].sections[0].end = 7; }, data => { data.pages[0].sections[0].field = 'unknown'; },
    data => { data.pages[0].sections[0].valueIndex = 64; }, data => { data.pages[0].sections[0].anchor = ':~:'; },
  ];
  for (const change of mutations) {
    const value = changed(artifacts, undefined, change), net = network(value), owner = await load(value, net);
    try { await assert.rejects(owner.loadSections(), code('INVALID_ARTIFACT', 'INCOMPATIBLE_ARTIFACT', 'STALE_BUILD')); assert.equal((await owner.engine.search('alpha')).total, 4); count++; } finally { await owner.dispose(); }
  }
  const reorderedKeys = changed(artifacts, undefined, data => { data.pages[0] = { sections: data.pages[0].sections, pageId: data.pages[0].pageId }; });
  const net = network(reorderedKeys), owner = await load(reorderedKeys, net);
  try { assert.equal((await owner.loadSections()).pages.length, 4); } finally { await owner.dispose(); }
  t.diagnostic(JSON.stringify({ rehashedInvalidDataCases: count, JSONKeyOrderIsNotSemantic: true }));
});

test('companion stream integrity, UTF-8, read limits, redirects, abort and timeout refuse safely', async t => {
  const artifacts = await buildStaticSearch(opts()); let cancellations = 0;
  const scenarios = [
    ['INTEGRITY_MISMATCH', (net, url) => url.includes('sections-') && !url.endsWith('sections-manifest.json') ? response(url, '{}') : undefined],
    ['INVALID_ARTIFACT', (net, url) => url.endsWith('sections-manifest.json') ? response(url, new Uint8Array([0xc3, 0x28])) : undefined],
    ['ASSET_LIMIT', (net, url) => url.endsWith('sections-manifest.json') ? response(url, new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); }, cancel() { cancellations++; } })) : undefined],
    ['FETCH_FAILED', (net, url) => url.endsWith('sections-manifest.json') ? response('https://foreign.example/sections-manifest.json', '{}') : undefined],
  ];
  for (const [expected, override] of scenarios) {
    const net = network(artifacts), owner = await load(artifacts, net); net.override = url => override(net, url);
    try { await assert.rejects(owner.loadSections(), code(expected)); assert.equal((await owner.engine.search('alpha')).total, 4); } finally { await owner.dispose(); }
  }
  assert.equal(cancellations, 1);
  const net = network(artifacts), owner = await load(artifacts, net), pre = new AbortController(); pre.abort();
  try {
    await assert.rejects(owner.loadSections({ signal: pre.signal }), code('CANCELLED')); assert.equal(net.requests.length, 2);
    net.override = url => url.endsWith('sections-manifest.json') ? new Promise(() => {}) : undefined;
    await assert.rejects(owner.loadSections({ timeoutMs: 5 }), code('FETCH_FAILED'));
    const active = new AbortController(), pending = owner.loadSections({ signal: active.signal });
    active.abort(); await assert.rejects(pending, code('CANCELLED')); assert.equal((await owner.engine.search('alpha')).total, 4);
  } finally { await owner.dispose(); }
  t.diagnostic(JSON.stringify({ streamCases: scenarios.length, explicitCancellation: 2, timeout: 1, oversizedStreamCancelled: cancellations }));
});

test('receiver mutation before or during section load refuses without making the ordinary engine unusable', async () => {
  const artifacts = await buildStaticSearch(opts());
  for (const phase of ['before', 'during']) {
    const net = network(artifacts), owner = await load(artifacts, net);
    try {
      if (phase === 'before') await owner.engine.add({ id: 'new', text: { body: 'fresh alpha' } });
      else net.override = async url => { if (url.endsWith('sections-manifest.json')) { net.override = undefined; await owner.engine.add({ id: 'new', text: { body: 'fresh alpha' } }); } };
      await assert.rejects(owner.loadSections(), code('INCOMPATIBLE_ARTIFACT')); assert.equal((await owner.engine.search('fresh')).total, 1);
      if (phase === 'before') assert.equal(net.requests.length, 2, 'mismatch observed before companion I/O');
    } finally { await owner.dispose(); }
  }
});

test('native handles refuse section loading before companion I/O while source maps use the receiving revision', async () => {
  const nativeQualification = { profileId: 'rx6005-native', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['test/integrations/astro/sections.test.mjs local only'] };
  const artifacts = await buildStaticSearch(opts({ nativeQualification })), net = network(artifacts), owner = await load(artifacts, net, { format: 'native', nativeQualification });
  try { await assert.rejects(owner.loadSections(), code('INCOMPATIBLE_ARTIFACT')); assert.equal(net.requests.length, 2); assert.equal((await owner.engine.search('alpha')).total, 4); } finally { await owner.dispose(); }
  // maxMutationBatch 1 makes builder origin 4, but restore is a single revision.
  const config = configuration({ limits: { maxMutationBatch: 1 } }), many = await buildStaticSearch(opts({ configuration: config }));
  const source = JSON.parse(many.files[many.manifest.assets.source.file]); assert.equal(source.body.header.originRevision, 4);
  const sourceNet = network(many), received = await load(many, sourceNet, { configuration: config });
  try { const map = await received.loadSections(); assert.equal(map.revision, 1); assert.equal((await received.engine.search('alpha')).revision, 1); } finally { await received.dispose(); }
});

test('dispose aborts optional reads, closes admission and releases late unaccepted response bodies', async () => {
  const artifacts = await buildStaticSearch(opts()), net = network(artifacts), owner = await load(artifacts, net);
  let release, ready; const started = new Promise(resolve => { ready = resolve; }); let cancelled = 0;
  net.override = url => url.endsWith('sections-manifest.json') ? new Promise(resolve => { release = resolve; ready(); }) : undefined;
  const pending = owner.loadSections().then(value => ({ value }), error => ({ error })); await started; await owner.dispose();
  assert.equal((await pending).error.code, 'DISPOSED');
  await assert.rejects(owner.loadSections(), code('DISPOSED'));
  release(response(net.directory + 'sections-manifest.json', new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('{}')); }, cancel() { cancelled++; } })));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, 1);
});

test('missing or unusable Segmenter stays a typed native environment refusal in build and explicit load', async () => {
  const artifacts = await buildStaticSearch(opts()), descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  try {
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
    await assert.rejects(buildStaticSearch(opts()), code('UNSUPPORTED_ENVIRONMENT'));
    const net = network(artifacts), owner = await load(artifacts, net);
    try { await assert.rejects(owner.loadSections(), code('UNSUPPORTED_ENVIRONMENT')); assert.equal((await owner.engine.search('alpha')).total, 4); } finally { await owner.dispose(); }
  } finally { Object.defineProperty(Intl, 'Segmenter', descriptor); }
});

test('hook writes only the separate companion in its fresh namespace and refuses existing directories or symlinks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'raveldex-section-hook-'));
  try {
    const integration = raveldexAstro({ configuration: configuration(), getEntries: () => entries, pageSections: projection.pages, buildId: 'hook-1' });
    integration.hooks['astro:config:done']({ config: { output: 'static', base: '/help', build: { format: 'directory' } }, buildOutput: 'static' });
    const args = { dir: pathToFileURL(directory + '/'), logger: { info() {} } };
    await integration.hooks['astro:build:done'](args);
    const names = await readdir(join(directory, 'raveldex'));
    assert.ok(names.includes('sections-manifest.json')); assert.equal(names.filter(name => /^sections-[a-f0-9]{64}\.json$/.test(name)).length, 1);
    const first = await readFile(join(directory, 'raveldex/manifest.json'), 'utf8');
    await assert.rejects(integration.hooks['astro:build:done'](args), code('INVALID_INPUT')); assert.equal(await readFile(join(directory, 'raveldex/manifest.json'), 'utf8'), first);
    await rm(join(directory, 'raveldex'), { recursive: true });
    await writeFile(join(directory, 'sentinel'), 'unchanged'); await symlink(join(directory, 'sentinel'), join(directory, 'raveldex'));
    await assert.rejects(integration.hooks['astro:build:done'](args), code('INVALID_INPUT')); assert.equal(await readFile(join(directory, 'sentinel'), 'utf8'), 'unchanged');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the 64-section page ceiling and 16384-section collection ceiling are inclusive without truncation', async t => {
  const section = ordinal => ({ anchor: `anchor-${ordinal}`, heading: 'Section', headingLevel: 2, field: 'body', valueIndex: 0, start: ordinal * 2, end: ordinal * 2 + 1 });
  const manyEntries = Array.from({ length: 256 }, (_, ordinal) => ({ record: { id: `many:${String(ordinal).padStart(3, '0')}`, text: { body: 'a '.repeat(64) } }, title: 'Many sections', path: `/many/${ordinal}/` }));
  const maps = manyEntries.map(entry => ({ pageId: entry.record.id, sections: Array.from({ length: 64 }, (_, ordinal) => section(ordinal)) }));
  const artifacts = await buildStaticSearch(opts({ entries: manyEntries, pageSections: maps }));
  const meta = JSON.parse(artifacts.files['sections-manifest.json']), wire = JSON.parse(artifacts.files[meta.asset.file]);
  assert.equal(wire.pages.length, 256); assert.equal(wire.pages.reduce((total, page) => total + page.sections.length, 0), 16_384);
  const net = network(artifacts), owner = await load(artifacts, net);
  try { const captured = await owner.loadSections(); assert.equal(captured.pages.reduce((total, page) => total + page.sections.length, 0), 16_384); } finally { await owner.dispose(); }
  const extraEntry = { record: { id: 'many:extra', text: { body: 'a' } }, title: 'One over', path: '/many/extra/' };
  await assert.rejects(buildStaticSearch(opts({ entries: [...manyEntries, extraEntry], pageSections: [...maps, { pageId: 'many:extra', sections: [section(0)] }] })), code('ASSET_LIMIT'));
  const sixtyFive = [{ ...manyEntries[0], record: { ...manyEntries[0].record, text: { body: 'a '.repeat(65) } } }];
  await assert.rejects(buildStaticSearch(opts({ entries: sixtyFive, pageSections: [{ pageId: sixtyFive[0].record.id, sections: Array.from({ length: 65 }, (_, ordinal) => section(ordinal)) }] })), code('ASSET_LIMIT'));
  const byteOver = maps.map(page => ({ ...page, sections: page.sections.map(item => ({ ...item, heading: '漢'.repeat(200) })) }));
  await assert.rejects(buildStaticSearch(opts({ entries: manyEntries, pageSections: byteOver })), code('ASSET_LIMIT'));
  t.diagnostic(JSON.stringify({ completeMapSections: 16_384, sectionsPerPage: 64, oneBeyondCollectionRejected: true, oneBeyondPageRejected: true, UTF8BytesOverLimitRejected: true, assetBytes: meta.asset.bytes }));
});

test('a selected section factory constrains map fields while metadata-only configurations may serialize every declared text field', async () => {
  const config = { schema: corpus.schema, addons: [createSourceProvider({ fields: ['body', 'title'] }), createSectionEvidence({ fields: { body: 'source' } })] };
  await assert.rejects(buildStaticSearch(opts({ configuration: config })), code('INVALID_INPUT'));
  const maps = clone(projection.pages).map(page => ({ ...page, sections: page.sections.filter(section => section.field === 'body') }));
  const artifacts = await buildStaticSearch(opts({ configuration: config, pageSections: maps }));
  const invalid = changed(artifacts, undefined, data => { data.pages[0].sections[0] = { ...data.pages[0].sections[0], field: 'title', valueIndex: 0, start: 0, end: 11 }; data.pages[0].sections.sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : a.valueIndex - b.valueIndex || a.start - b.start); });
  const net = network(invalid), owner = await load(invalid, net, { configuration: config });
  try { await assert.rejects(owner.loadSections(), code('INVALID_ARTIFACT')); assert.equal((await owner.engine.search('alpha')).total, 4); } finally { await owner.dispose(); }
  const metadata = await buildStaticSearch(opts({ configuration: { schema: corpus.schema, addons: [createSourceProvider({ fields: ['body', 'title'] })] } }));
  const manifest = JSON.parse(metadata.files['sections-manifest.json']);
  assert.equal(JSON.parse(metadata.files[manifest.asset.file]).pages[3].sections.at(-1).field, 'title');
});
