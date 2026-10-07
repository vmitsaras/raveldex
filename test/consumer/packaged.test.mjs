import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS } from '../fixtures/docs/judgments.mjs';
import { prepareConsumer, bundleConsumer, executePilot, checkStartup, command } from '../../scripts/lib/packed-consumer.mjs';
import { verifyPilot, judgeResults } from './verify.mjs';

let corpus, consumer, bundle, pilot;
before(async () => {
  corpus = await buildCorpus();
  consumer = await prepareConsumer(corpus, DOCS_JUDGMENTS);
  bundle = await bundleConsumer(consumer.directory);
  pilot = await executePilot(consumer.directory, 'run.mjs', 'atomic');
});
after(async () => { if (consumer) await rm(consumer.directory, { recursive: true, force: true }); });

test('corpus uses reproducible current sections, stable IDs and source links', async () => {
  assert.deepEqual(await buildCorpus(), corpus);
  assert.ok(corpus.records.length >= 20 && corpus.records.length <= 100);
  assert.equal(new Set(corpus.records.map(({ id }) => id)).size, corpus.records.length);
  for (const source of corpus.sources) {
    assert.match(source.path, /^docs\/(?:specs|architecture)\/[^/]+\.md$/);
    assert.doesNotMatch(source.path, /decisions|evidence|archive|planning|log/i);
  }
  for (const section of corpus.sections) {
    assert.equal(section.id, `doc:${section.sourcePath}#${section.anchor}`);
    assert.match(section.sourceUrl, /^https:\/\/github\.com\/vmitsaras\/raveldex\/blob\/main\//);
    assert.ok(section.startLine < section.endLine);
    assert.ok(corpus.records.some(({ id, text }) => id === section.id && text.title === section.title && text.body.length > 0));
  }
});

test('tarball contains compiled core/declarations and installs public API without hidden dependencies', async () => {
  const metadata = consumer.package;
  assert.equal(metadata.name, '@vmitsaras/raveldex'); assert.equal(metadata.version, '0.0.0'); assert.equal(metadata.private, true);
  const paths = metadata.files.map(({ path }) => path);
  assert.ok(paths.includes('dist/index.js')); assert.ok(paths.includes('dist/index.d.ts'));
  for (const path of paths) assert.ok(['README.md', 'LICENSE', 'package.json'].includes(path) || path.startsWith('dist/'), path);
  assert.ok(paths.every((path) => !path.startsWith('src/') && !path.includes('node_modules/') && !path.startsWith('test/')));
  // prepareConsumer already ran a standalone DOM-free public typecheck with negative fixtures.
  const probe = `
    import assert from 'node:assert/strict';
    const { createRaveldex } = await import('@vmitsaras/raveldex');
    const engine = createRaveldex({schema:{text:{body:{}}}});
    assert.deepEqual(Reflect.ownKeys(engine).sort(), ['add','addMany','clear','dispose','remove','replace','search']);
    assert.equal(Object.getPrototypeOf(engine), Object.prototype);
    assert.ok(Object.isFrozen(engine));
    for (const name of ['root','admit','mutate','pump','check']) assert.equal(name in engine, false);
    const detached = engine.add;
    assert.equal((await detached({id:'opaque',text:{body:'red'}})).revision, 1);
    const dispose = engine.dispose; assert.equal(dispose(), dispose()); await dispose();
    for (const name of ['@vmitsaras/raveldex/dist/core/execution/engine.js', '@vmitsaras/raveldex/src/index.ts', '@vmitsaras/raveldex/addons/phrases/verifier']) {
      await assert.rejects(import(name), (error) => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
    }
  `;
  await command(process.execPath, ['--input-type=module', '--eval', probe], consumer.directory);
});

test('packed real-content CLI retrieval and every update agree with independent source expectations', () => {
  const verification = verifyPilot(corpus, DOCS_JUDGMENTS, pilot);
  assert.equal(verification.correctness, 'Pass'); assert.equal(verification.mutations, 8);
  assert.ok(pilot.navigation.hits.length > 0);
  for (const hit of pilot.navigation.hits) {
    assert.equal(hit.sourceUrl, corpus.sections.find(({ id }) => id === hit.id).sourceUrl);
    assert.equal(hit.title, corpus.sections.find(({ id }) => id === hit.id).title);
  }
});

test('relevance judgments keep expected empties and lexical/ranking misses visible', () => {
  const relevance = judgeResults(DOCS_JUDGMENTS, pilot);
  assert.equal(relevance.rows.length, DOCS_JUDGMENTS.length);
  assert.equal(relevance.metrics.rankedQueries + relevance.metrics.intendedEmptyQueries, DOCS_JUDGMENTS.length);
  assert.ok(relevance.metrics.intendedEmptyQueries >= 2);
  assert.ok(relevance.rows.some(({ expectation, outcome }) => expectation === 'lexical-mismatch' && outcome === 'unintended-empty'));
});

test('public package and measured bundle import without platform startup access', async () => {
  for (const name of ['@vmitsaras/raveldex', './core-bundle.mjs']) assert.deepEqual((await checkStartup(consumer.directory, name)).reads, []);
  assert.equal(bundle.method.esbuild, '0.28.2');
  assert.ok(bundle.gzipBytes > 1000); assert.equal(bundle.targetGzipBytes, 15360);
  // A budget miss is an observed qualification result, not permission to delete behavior.
});

test('full minified core performs the same real retrieval, mutations and typed errors', async () => {
  const bundled = await executePilot(consumer.directory, 'run-bundle.mjs');
  assert.equal(verifyPilot(corpus, DOCS_JUDGMENTS, bundled).correctness, 'Pass');
  assert.deepEqual(bundled.queries.map(({ result }) => result), pilot.queries.map(({ result }) => result));
  assert.deepEqual(bundled.mutations, pilot.mutations);
});

test('packed public scores match hand arithmetic before and after deletion', async () => {
  const result = JSON.parse((await command(process.execPath, ['arithmetic.mjs'], consumer.directory)).stdout);
  assert.equal(result.arithmetic, 'Pass');
});

test('packed public cancellation rolls back a real admitted batch and recovers', async () => {
  const source = `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
    const corpus = JSON.parse(await readFile('corpus.json', 'utf8'));
    const owner = createRaveldex({ schema: corpus.schema });
    const abort = new AbortController();
    const operation = owner.addMany(corpus.records, { signal: abort.signal });
    abort.abort();
    await assert.rejects(operation, (error) => error instanceof RaveldexError && error.code === 'CANCELLED');
    assert.equal((await owner.search({kind:'all'})).total, 0);
    assert.equal((await owner.addMany(corpus.records)).revision, 1);
    assert.equal((await owner.search({kind:'all'}, {limit:0})).total, corpus.records.length);
    await owner.dispose();
  `;
  await writeFile(join(consumer.directory, 'cancel.mjs'), source);
  await command(process.execPath, ['cancel.mjs'], consumer.directory);
});
