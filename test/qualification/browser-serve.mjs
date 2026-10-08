import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, version } from 'esbuild';
import { prepareConsumer, digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

export async function prepareBrowserQualification() {
  const consumer = await prepareConsumer([], []), graphs = {};
  const fixtureFiles = ['browser-entry.mjs', 'browser-worker.mjs', 'browser-config.mjs', 'browser-ui-driver.mjs'];
  for (const file of fixtureFiles) await copyFile(join(REPO_ROOT, 'test/qualification', file), join(consumer.directory, file));
  await copyFile(join(REPO_ROOT, 'test/ui/fixture-entry.mjs'), join(consumer.directory, 'browser-ui-entry.mjs'));
  for (const [entry, output] of [['browser-entry.mjs', 'browser-bundle.mjs'], ['browser-worker.mjs', 'browser-worker-bundle.mjs'], ['browser-ui-driver.mjs', 'browser-ui-bundle.mjs']]) {
    const settings = { absWorkingDir: consumer.directory, entryPoints: [entry], bundle: true, minify: true,
      platform: 'browser', format: 'esm', target: 'es2022', treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false,
      metafile: true, outfile: join(consumer.directory, output), logLevel: 'silent' };
    const bundled = await build(settings), inputs = [];
    for (const [path, input] of Object.entries(bundled.metafile.inputs)) {
      assert.ok([...fixtureFiles, 'browser-ui-entry.mjs'].includes(path) || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `unexpected runtime graph input ${path}`);
      assert.ok(input.imports.every(item => !item.external), `external runtime input ${path}`);
      inputs.push({ path, ...input, sha256: digest(await readFile(join(consumer.directory, path))) });
    }
    graphs[entry] = { esbuild: version, settings: { ...settings, absWorkingDir: '(isolated installed consumer)', outfile: output },
      sha256: digest(await readFile(join(consumer.directory, output))), inputs, metafile: bundled.metafile };
  }
  await copyFile(join(consumer.directory, 'browser-worker-bundle.mjs'), join(consumer.directory, 'browser-worker.mjs'));
  await copyFile(join(consumer.installed, 'dist/addons/ui/styles.css'), join(consumer.directory, 'styles.css'));
  const shell = body => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raveldex RX-4002 installed package qualification</title><link rel="stylesheet" href="/styles.css"></head><body><main><h1>Raveldex installed package qualification</h1>${body}</main></body></html>`;
  const pages = {
    '/': shell('<p>Automated engine qualification fixture.</p><script type="module" src="/browser-bundle.mjs"></script>'),
    '/ui': shell('<p>Test-only controls affect this installed fixture.</p><p><button id="inject-error" type="button">Inject next search error</button> <button id="destroy-ui" type="button">Destroy UI</button> <button id="remount-ui" type="button">Remount UI</button></p><p id="fixture-status" role="status">Starting fixture UI.</p><div id="fixture-root"><p id="authored">Authored fallback <a href="/authored">documentation</a></p></div><script type="module" src="/browser-ui-bundle.mjs"></script>'),
    '/worker': shell('<p>Test-only fault controls affect this fixture and its worker. Recovery explicitly rebuilds the three fixture records.</p><p><button id="inject-error" type="button">Inject next search error</button> <button id="terminate-worker" type="button">Terminate worker</button> <button id="recover-worker" type="button">Recover from authoritative source</button></p><p id="fixture-status" role="status">Starting fixture worker.</p><div id="worker-root"><p>Fixture source fallback.</p></div><script type="module" src="/browser-bundle.mjs"></script>'),
  };
  const paths = new Map([['/browser-bundle.mjs', 'browser-bundle.mjs'], ['/browser-worker.mjs', 'browser-worker.mjs'], ['/browser-ui-bundle.mjs', 'browser-ui-bundle.mjs'], ['/styles.css', 'styles.css']]);
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");
    if (pages[path]) { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(pages[path]); return; }
    const file = paths.get(path); if (!file) { response.writeHead(404); response.end(); return; }
    try { response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(await readFile(join(consumer.directory, file))); }
    catch { response.writeHead(500); response.end(); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const report = { kind: 'raveldex-rx4002-browser-package-v1', package: consumer.package, installedDirectory: consumer.directory, graphs,
    sourceFixtures: await Promise.all([...fixtureFiles.map(file => `test/qualification/${file}`), 'test/ui/fixture-entry.mjs'].map(async path => ({ path, sha256: digest(await readFile(join(REPO_ROOT, path))) }))),
    cssSha256: digest(await readFile(join(consumer.directory, 'styles.css'))) };
  await writeFile(join(consumer.directory, 'RX-4002-browser-package.json'), JSON.stringify(report, null, 2) + '\n');
  return { ...consumer, origin, report, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
