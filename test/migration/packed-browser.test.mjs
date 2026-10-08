import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { platform, release, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { prepareConsumer, REPO_ROOT, digest, command, checkStartup, bundleConsumer } from '../../scripts/lib/packed-consumer.mjs';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS } from '../fixtures/docs/judgments.mjs';
const reportPath = resolve(process.env.RAVELDEX_MIGRATION_BROWSER_REPORT ?? '/tmp/raveldex-rx3004-migration-browser.json');
test('installed public migration exports rebuild update persist reload and erase actual browser source state', async () => {
  const report = { kind: 'raveldex-installed-migration-browser-v1', startedAt: new Date().toISOString(),
    environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion },
    qualification: 'Headless Chromium actual same-origin IndexedDB source persistence; no native/browser snapshot or physical power-loss guarantee.',
    status: 'Running' };
  let server, browser, page, context;
  try {
    const consumer = await prepareConsumer(buildCorpus(REPO_ROOT), DOCS_JUDGMENTS);
    report.package = consumer.package; report.installedDirectory = consumer.directory;
    assert.ok(consumer.package.files.some(file => file.path === 'dist/integrations/localsearch/index.js'));
    assert.ok(consumer.package.files.some(file => file.path === 'dist/integrations/localsearch/LICENSE.LocalSearch'));
    assert.ok(consumer.package.files.every(file => !file.path.startsWith('integrations/minisearch/') && !file.path.includes('companion-comparator')));
    for (const [source, target] of [['test/migration/browser-entry.mjs', 'browser-entry.mjs'], ['test/migration/fixtures/records.mjs', 'records.mjs'], ['examples/migration/convert-and-rebuild.mjs', 'convert-and-rebuild.mjs'], ['examples/migration/run.mjs', 'run-migration.mjs'], ['test/migration/public-types.ts', 'migration-types.ts'], ['test/migration/fixtures/representative.json', 'representative.json']])
      await copyFile(join(REPO_ROOT, source), join(consumer.directory, target));
    report.core = await bundleConsumer(consumer.directory);
    assert.ok(report.core.inputs.every(input => !input.path.includes('/integrations/')));
    report.startup = await checkStartup(consumer.directory, '@vmitsaras/raveldex');
    await writeFile(join(consumer.directory, 'converter-entry.mjs'), "export * from '@vmitsaras/raveldex/integrations/localsearch';\n");
    const graphs = {};
    for (const [name, entry] of [['converter', 'converter-entry.mjs'], ['browser', 'browser-entry.mjs']]) {
      const output = name + '-bundle.mjs';
      const built = await build({ absWorkingDir: consumer.directory, entryPoints: [entry], outfile: join(consumer.directory, output), bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, logLevel: 'silent' });
      const bytes = await readFile(join(consumer.directory, output)); const inputs = Object.entries(built.metafile.inputs).map(([path, item]) => ({ path, ...item }));
      for (const input of inputs) { assert.ok(input.imports.every(item => !item.external)); assert.doesNotMatch(input.path, /(?:minisearch|fuse|flexsearch|orama|companion-comparator|LocalSearch)/); }
      assert.deepEqual(Object.values(built.metafile.outputs)[0].imports, []);
      if (name === 'converter') assert.ok(inputs.every(input => input.path === entry || input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/core/') || input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/integrations/localsearch/')));
      graphs[name] = { entry, output, sha256: digest(bytes), bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length, inputs, metafile: built.metafile };
    }
    report.graphs = graphs;
    await writeFile(join(consumer.directory, 'migration-types.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: [], strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true }, include: ['migration-types.ts'] }));
    await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', 'migration-types.json'], consumer.directory);
    report.publicTypes = { status: 'Pass', libraries: ['ES2022'], ambientNodeAndDOM: 'Excluded', readonlyNegativeExpectations: 5 };
    const startup = await command(process.execPath, ['--input-type=module', '--eval', `
      const reads=[];for(const name of ['window','document','navigator','indexedDB','fetch','Worker','localStorage','crypto','TextEncoder','TextDecoder','setTimeout','setInterval'])Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});
      const module=await import('@vmitsaras/raveldex/integrations/localsearch');if(reads.length)throw Error('import-time side effects');
      for(const path of ['@vmitsaras/raveldex/integrations/minisearch','@vmitsaras/raveldex/integrations/localsearch/legacy','@vmitsaras/raveldex/dist/integrations/localsearch/index.js']){try{await import(path);throw Error('private path import permitted')}catch(error){if(error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error}}
      console.log(JSON.stringify({reads,exports:Object.keys(module).sort(),privateForeignPaths:'Excluded'}));
    `], consumer.directory);
    report.converterStartup = JSON.parse(startup.stdout);
    const example = await command(process.execPath, ['run-migration.mjs', 'representative.json', 'red'], consumer.directory); report.publicExample = JSON.parse(example.stdout);
    assert.equal(report.publicExample.result.model, 'raveldex-bm25-v1'); assert.equal(report.publicExample.nativeSourceFormat, 'raveldex-source');
    server = createServer(async (request, response) => {
      try {
        const path = new URL(request.url, 'http://localhost').pathname;
        if (path === '/') { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html><head><title>Migration behavioral fixture</title></head><body><script type="module" src="/browser-bundle.mjs"></script></body></html>'); }
        else if (['/browser-bundle.mjs', '/representative.json'].includes(path)) { response.setHeader('content-type', path.endsWith('.json') ? 'application/json' : 'text/javascript'); response.end(await readFile(join(consumer.directory, path.slice(1)))); }
        else { response.writeHead(404); response.end(); }
      } catch (error) { response.writeHead(500); response.end(String(error)); }
    });
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const channel = process.env.RAVELDEX_MIGRATION_BROWSER ?? process.env.RAVELDEX_INDEXEDDB_BROWSER ?? 'chrome'; assert.ok(['chrome', 'chromium'].includes(channel));
    browser = await chromium.launch({ ...(channel === 'chrome' ? { channel } : {}), headless: true }); report.environment.browser = { channel, version: browser.version(), headless: true };
    context = await browser.newContext(); page = await context.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => !!window.migrationHarness);
    report.prepared = await page.evaluate(() => window.migrationHarness.prepare());
    await page.reload(); await page.waitForFunction(() => !!window.migrationHarness);
    report.recovered = await page.evaluate(() => window.migrationHarness.recover());
    assert.equal(report.recovered.loaded.generation, report.prepared.saved.generation); assert.equal(report.recovered.loaded.restore.reindexed, true);
    assert.equal(report.recovered.missing.status, 'missing'); assert.equal(report.recovered.erased.erased, true);
    report.completeComparisons = report.prepared.queries.length + report.prepared.afterUpdate.length + report.recovered.completeComparisons;
    await page.evaluate(() => window.migrationHarness.cleanup()); report.status = 'Pass';
  } catch (error) { report.status = 'Fail'; report.error = String(error); throw error; }
  finally {
    await context?.close(); await browser?.close(); if (server?.listening) await new Promise((yes, no) => server.close(error => error ? no(error) : yes()));
    report.finishedAt = new Date().toISOString(); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
}, { timeout: 120000 });
