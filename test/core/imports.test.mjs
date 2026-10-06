import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../dist/core/', import.meta.url)));
async function modules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => entry.isDirectory() ? modules(resolve(directory, entry.name)) : entry.name.endsWith('.js') ? [resolve(directory, entry.name)] : []));
  return files.flat();
}

test('compiled core runtime graph contains only relative core modules and has no platform/optional imports', async () => {
  const files = await modules(root);
  assert.ok(files.length >= 10, 'checks a real nonempty core build');
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      const target = match[1];
      assert.ok(target.startsWith('.'), `${file}: ${target}`);
      const resolved = resolve(dirname(file), target);
      assert.ok(resolved.startsWith(root + '/'), resolved);
      assert.ok(files.includes(resolved), `compiled dependency exists: ${resolved}`);
    }
    assert.doesNotMatch(source, /\b(?:require\s*\(|import\s*\()/, 'no hidden dynamic dependency');
  }
});

test('fresh core imports never read DOM, scheduling, network, workers or storage globals', async () => {
  const files = await modules(root);
  const script = `
    const denied = ['window', 'document', 'navigator', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'SharedWorker', 'indexedDB', 'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask'];
    for (const name of denied) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('platform access: ' + name); } });
    for (const path of JSON.parse(process.argv[1])) await import(path);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script, JSON.stringify(files)], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(result.stdout, '');
});
