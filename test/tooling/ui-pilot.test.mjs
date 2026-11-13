import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { REPO_ROOT, command } from '../../scripts/lib/packed-consumer.mjs';

function pilot(t, args) {
  const child = spawn(process.execPath, ['scripts/ui-pilot.mjs', ...args], {
    cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let log = '';
  child.stderr.on('data', bytes => { log += bytes; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
  });
  const ready = new Promise((accept, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => reject(new Error(`Pilot exited (${code ?? signal}): ${log}`)));
    child.stdout.on('data', bytes => {
      log += bytes;
      const url = log.match(/Open (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
      if (url) accept(url);
    });
  });
  return { child, exited, ready };
}

async function occupy(t, port) {
  const server = createServer((_request, response) => response.end('existing server'));
  t.after(() => new Promise(accept => server.close(accept)));
  try {
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', accept);
    });
  } catch (error) {
    // An existing user process can already occupy the default. Never stop it.
    if (port !== 4173 || error.code !== 'EADDRINUSE') throw error;
  }
  return server;
}

test('UI pilot serves on another port when the default is occupied', { timeout: 120_000 }, async t => {
  await occupy(t, 4173);
  const running = pilot(t, []);
  const url = await running.ready;
  assert.notEqual(new URL(url).port, '4173');
  const response = await fetch(url, { headers: { connection: 'close' } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<html/);
  running.child.kill('SIGTERM');
  assert.deepEqual(await running.exited, [0, null]);
});

test('UI pilot preserves an available explicit port and falls back on an explicit collision', { timeout: 120_000 }, async t => {
  const reservation = await occupy(t, 0);
  const port = reservation.address().port;
  await new Promise(accept => reservation.close(accept));
  const first = pilot(t, ['--port', String(port)]);
  const firstURL = await first.ready;
  assert.equal(new URL(firstURL).port, String(port));
  const second = pilot(t, ['--port', String(port)]);
  const url = await second.ready;
  assert.notEqual(new URL(url).port, String(port));
  const response = await fetch(url, { headers: { connection: 'close' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  await response.text();
  for (const [path, method, expected] of [['/corpus.json', 'HEAD', 200], ['/package.json', 'GET', 404], ['/', 'POST', 404]]) {
    const result = await fetch(new URL(path, url), { method, headers: { connection: 'close' } });
    assert.equal(result.status, expected);
    assert.equal(await result.text(), '');
  }
  second.child.kill('SIGTERM');
  assert.deepEqual(await second.exited, [0, null]);
  assert.equal((await fetch(firstURL, { headers: { connection: 'close' } })).status, 200);
});

test('UI pilot accepts port zero and SIGINT closes its server', { timeout: 120_000 }, async t => {
  const running = pilot(t, ['--port', '0']);
  const url = await running.ready;
  assert.ok(Number(new URL(url).port) > 0);
  assert.equal((await fetch(url, { headers: { connection: 'close' } })).status, 200);
  running.child.kill('SIGINT');
  assert.deepEqual(await running.exited, [0, null]);
});

test('UI pilot rejects invalid ports and --no-serve exits without a URL', { timeout: 120_000 }, async () => {
  for (const port of ['-1', '65536', 'not-a-port']) {
    await assert.rejects(command(process.execPath, ['scripts/ui-pilot.mjs', '--port', port]), /Invalid local port|Unknown pilot option/);
  }
  const { stdout } = await command(process.execPath, ['scripts/ui-pilot.mjs', '--no-serve']);
  assert.match(stdout, /Search example:/);
  assert.doesNotMatch(stdout, /Open http:/);
});
