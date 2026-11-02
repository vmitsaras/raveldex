import { createServer } from 'node:http';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prepareUsageDemo } from './lib/ui-consumer.mjs';

const args = process.argv.slice(2);
let output, port = 4173, serve = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) output = resolve(args[++i]);
  else if (args[i] === '--port' && /^\d+$/.test(args[i + 1] ?? '')) port = Number(args[++i]);
  else if (args[i] === '--no-serve') serve = false;
  else throw new Error(`Unknown pilot option: ${args[i]}`);
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid local port');
const pilot = await prepareUsageDemo();
if (output) {
  await mkdir(output, { recursive: true });
  for (const file of ['demo-build.json', 'corpus.json']) await copyFile(join(pilot.directory, file), join(output, file));
}
console.log(`Search example: ${pilot.directory}`);
console.log(`Searches ${pilot.corpus.records.length} sections from five usage guides.`);
if (serve) {
  // Serve exactly these local artifacts, never arbitrary repository/cache files.
  const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
    '/main.mjs': ['main.mjs', 'text/javascript'], '/engine-worker.mjs': ['engine-worker.mjs', 'text/javascript'], '/ui.css': ['ui.css', 'text/css'],
    '/pilot.css': ['pilot.css', 'text/css'], '/corpus.json': ['corpus.json', 'application/json'] };
  const server = createServer(async (request, response) => {
    const path = (request.url ?? '').split('?')[0];
    const file = Object.hasOwn(files, path) ? files[path] : undefined;
    if (!file || !['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(404); response.end(); return; }
    try {
      const bytes = await readFile(join(pilot.directory, file[0]));
      response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(500); response.end('Local artifact unavailable'); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  console.log(`Open http://127.0.0.1:${server.address().port}/ (Ctrl-C stops this local server).`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); });
}
