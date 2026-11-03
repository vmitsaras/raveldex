import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { BASE } from '../site/pages.mjs';
import { loadManifest, verifyFiles, verifyInputs, auditSurface } from './lib/pages.mjs';
const root = await realpath(fileURLToPath(new URL('../docs/', import.meta.url)));
const manifest = await loadManifest(root);
assert.ok(manifest, 'Run npm run pages:build first');
await verifyFiles(root, manifest);
await verifyInputs(await realpath(fileURLToPath(new URL('../', import.meta.url))), manifest);
const publicFiles = new Set(await auditSurface(root, manifest));
const args = process.argv.slice(2);
assert.ok(!args.length || args.length === 2 && args[0] === '--port', 'Usage: npm run pages:preview -- [--port 4174]');
const port = Number(args[1] ?? 4174);
assert.ok(Number.isInteger(port) && port >= 0 && port <= 65535);
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', txt: 'text/plain', gz: 'application/gzip', svg: 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const key = path.startsWith(BASE) ? path.slice(BASE.length) : null;
    const file = key !== null ? key + (!key || key.endsWith('/') ? 'index.html' : '') : null;
    const found = file && publicFiles.has(file) && ['GET', 'HEAD'].includes(request.method);
    const selected = found ? file : '404.html';
    const bytes = await readFile(join(root, selected));
    response.writeHead(found ? 200 : 404, { 'Content-Type': `${types[selected.split('.').at(-1)] ?? 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(400); response.end('Invalid request'); }
});
await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
console.log(`Open http://127.0.0.1:${server.address().port}${BASE} (Ctrl-C stops this preview).`);
console.log('Only the verified public file inventory is served; this is not a Jekyll build.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
