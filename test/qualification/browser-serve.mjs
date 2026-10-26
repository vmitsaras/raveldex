import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, version } from 'esbuild';
import { prepareConsumer, digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { createMatrixRecorder, MATRIX_SCENARIOS, readMatrixBody } from './browser-matrix-reporting.mjs';

export async function prepareBrowserQualification() {
  const consumer = await prepareConsumer([], []), graphs = {};
  const fixtureFiles = ['browser-entry.mjs', 'browser-worker.mjs', 'browser-config.mjs', 'browser-ui-driver.mjs', 'browser-announcements.mjs', 'browser-input.mjs'];
  for (const file of fixtureFiles) await copyFile(join(REPO_ROOT, 'test/qualification', file), join(consumer.directory, file));
  await copyFile(join(REPO_ROOT, 'test/ui/fixture-entry.mjs'), join(consumer.directory, 'browser-ui-entry.mjs'));
  for (const [entry, output] of [['browser-entry.mjs', 'browser-bundle.mjs'], ['browser-worker.mjs', 'browser-worker-bundle.mjs'], ['browser-ui-driver.mjs', 'browser-ui-bundle.mjs'], ['browser-announcements.mjs', 'browser-announcements-bundle.mjs'], ['browser-input.mjs', 'browser-input-bundle.mjs']]) {
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
  await copyFile(join(REPO_ROOT, 'test/qualification/browser-input.css'), join(consumer.directory, 'browser-input.css'));
  const shell = (body, inputStyles = false) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raveldex RX-4002 installed package qualification</title><link rel="stylesheet" href="/styles.css">${inputStyles ? '<link rel="stylesheet" href="/browser-input.css">' : ''}</head><body><main><h1>Raveldex installed package qualification</h1>${body}</main></body></html>`;
  const pages = {
    '/': shell('<p>Automated engine qualification fixture.</p><script type="module" src="/browser-bundle.mjs"></script>'),
    '/matrix': shell(`<p>Finite installed-browser engine, IndexedDB and admitted resource observations. No AT, physical input/presentation or memory qualification.</p><p><label for="matrix-browser">Operator-assigned browser label</label> <select id="matrix-browser"><option value="">Choose a label</option><option>Firefox</option><option>Safari</option></select></p><fieldset id="matrix-controls" disabled><legend>Run one scenario at a time</legend>${MATRIX_SCENARIOS.map(row => `<p><button type="button" data-matrix-scenario="${row.id}">${row.label}</button></p>`).join('')}</fieldset><p id="matrix-status" role="status">Loading package identity.</p><p id="matrix-identity"></p><button id="matrix-retry-save" type="button" hidden>Retry saving existing result</button><pre id="matrix-result" aria-label="Actual scenario result"></pre><script type="module" src="/browser-bundle.mjs"></script>`),
    '/ui': shell('<p>Test-only controls affect this installed fixture.</p><p><button id="inject-error" type="button">Inject next search error</button> <button id="destroy-ui" type="button">Destroy UI</button> <button id="remount-ui" type="button">Remount UI</button></p><p id="fixture-status" role="status">Starting fixture UI.</p><div id="fixture-root"><p id="authored">Authored fallback <a href="/authored">documentation</a></p></div><script type="module" src="/browser-ui-bundle.mjs"></script>'),
    '/ui-input': shell('<h2>Physical input observation</h2><p>This page keeps the installed search UI unchanged. Recording is opt-in and stays in this page; no input trace is sent to the server. Use only test text. Start before beginning composition, then stop after the final result settles. The trace records DOM input and search calls, not speech or proof of physical input. Do not paste passwords or personal text.</p><p id="input-identity">Loading package identity.</p><p><label for="input-source">Input source used (reported by you)</label> <input id="input-source" maxlength="128" placeholder="For example: German"></p><p><button id="input-start" type="button" disabled>Start recording</button> <button id="input-stop" type="button" disabled>Stop and show trace</button></p><p id="input-recording-status" role="status">Not recording.</p><p id="fixture-status" role="status">Starting fixture UI.</p><div id="fixture-root"><p id="authored">Authored fallback <a href="/authored">documentation</a></p></div><p><label for="input-trace">Input trace (available after stopping)</label></p><textarea id="input-trace" readonly rows="12" cols="30"></textarea><script type="module" src="/browser-input-bundle.mjs"></script>', true),
    '/ui-announcements': shell('<h2>Manual announcement comparison</h2><p>This is an experimental fixture, not a library change. Keep the same VoiceOver settings between modes. Wait for the fixture to be ready, type red normally, then pause for five seconds. Record what you actually hear and whether input focus remains usable.</p><nav aria-label="Announcement comparison modes"><p>Whole UI busy (baseline): <a href="/ui-announcements?mode=original&amp;busy=shell">A: Original polite status</a> | <a href="/ui-announcements?mode=settled-polite&amp;busy=shell">B: Settled polite announcement</a> | <a href="/ui-announcements?mode=settled-assertive&amp;busy=shell">C: Settled assertive announcement</a></p><p>Search UI busy removed: <a href="/ui-announcements?mode=original&amp;busy=off">A: Original polite status</a> | <a href="/ui-announcements?mode=settled-polite&amp;busy=off">B: Settled polite announcement</a> | <a href="/ui-announcements?mode=settled-assertive&amp;busy=off">C: Settled assertive announcement</a></p><p>Results list busy only: <a href="/ui-announcements?mode=original&amp;busy=results">A: Original polite status</a> | <a href="/ui-announcements?mode=settled-polite&amp;busy=results">B: Settled polite announcement</a> | <a href="/ui-announcements?mode=settled-assertive&amp;busy=results">C: Settled assertive announcement</a></p></nav><p id="announcement-mode">Preparing comparison.</p><p>A to B changes progress chatter and status location; whole UI busy also changes busy ancestry. It does not isolate these causes. B to C changes priority only. C is an experimental interruption control. Within A, B or C, compare whole UI busy, busy removed and results-only busy to isolate the busy-scope variable. Inspector busy behavior is unchanged.</p><p><button id="inject-error" type="button">Inject next search error</button> <button id="destroy-ui" type="button">Destroy UI</button> <button id="remount-ui" type="button">Remount UI</button></p><p id="fixture-status" role="status">Starting fixture UI.</p><section aria-labelledby="announcement-output-heading"><h2 id="announcement-output-heading">Last completed experimental announcement</h2><p id="announcement-output"></p></section><div id="fixture-root"><p id="authored">Authored fallback <a href="/authored">documentation</a></p></div><details><summary>Diagnostic state: DOM observations, not recorded speech</summary><pre id="announcement-trace"></pre></details><script type="module" src="/browser-announcements-bundle.mjs"></script>'),
    '/worker': shell('<p>Test-only fault controls affect this fixture and its worker. Recovery explicitly rebuilds the three fixture records.</p><p><button id="inject-error" type="button">Inject next search error</button> <button id="terminate-worker" type="button">Terminate worker</button> <button id="recover-worker" type="button">Recover from authoritative source</button></p><p id="fixture-status" role="status">Starting fixture worker.</p><div id="worker-root"><p>Fixture source fallback.</p></div><script type="module" src="/browser-bundle.mjs"></script>'),
  };
  const paths = new Map([['/browser-bundle.mjs', 'browser-bundle.mjs'], ['/browser-worker.mjs', 'browser-worker.mjs'], ['/browser-ui-bundle.mjs', 'browser-ui-bundle.mjs'], ['/browser-announcements-bundle.mjs', 'browser-announcements-bundle.mjs'], ['/browser-input-bundle.mjs', 'browser-input-bundle.mjs'], ['/styles.css', 'styles.css'], ['/browser-input.css', 'browser-input.css']]);
  let matrix;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");
    if (path === '/matrix/session' || path === '/matrix/start' || path === '/matrix/result') {
      response.setHeader('content-type', 'application/json'); response.setHeader('cache-control', 'no-store');
      try {
        if (!matrix) throw Object.assign(new Error('Matrix capture is starting.'), { status: 503 });
        const result = path === '/matrix/session' && request.method === 'GET' ? matrix.session()
          : await matrix.accept({ path, method: request.method, headers: request.headers, bytes: await readMatrixBody(request) });
        response.end(JSON.stringify(result));
      } catch (error) { response.writeHead(error.status ?? 500); response.end(JSON.stringify({ error: error.message })); }
      return;
    }
    if (pages[path]) { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(pages[path]); return; }
    const file = paths.get(path); if (!file) { response.writeHead(404); response.end(); return; }
    try { response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(await readFile(join(consumer.directory, file))); }
    catch { response.writeHead(500); response.end(); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const report = { kind: 'raveldex-rx4002-browser-package-v1', package: consumer.package, installedDirectory: consumer.directory, graphs,
    sourceFixtures: await Promise.all([...fixtureFiles.map(file => `test/qualification/${file}`), 'test/ui/fixture-entry.mjs'].map(async path => ({ path, sha256: digest(await readFile(join(REPO_ROOT, path))) }))),
    cssSha256: digest(await readFile(join(consumer.directory, 'styles.css'))),
    inputCssSha256: digest(await readFile(join(consumer.directory, 'browser-input.css'))) };
  try {
    matrix = await createMatrixRecorder({ directory: consumer.directory, origin, packageIdentity: report,
      harnessIdentity: await Promise.all(['scripts/qualify-browsers.mjs', 'test/qualification/browser-serve.mjs', 'test/qualification/browser-matrix-reporting.mjs'].map(async path => ({ path, sha256: digest(await readFile(join(REPO_ROOT, path))) }))) });
    report.matrix = { url: `${origin}/matrix`, artifactPath: matrix.artifactPath, sessionId: matrix.sessionId, manifestSha256: matrix.manifestSha256 };
    await writeFile(join(consumer.directory, 'RX-4002-browser-package.json'), JSON.stringify(report, null, 2) + '\n');
  } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (matrix) await matrix.close(); throw error; }
  return { ...consumer, origin, report, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await matrix.close(); } };
}
