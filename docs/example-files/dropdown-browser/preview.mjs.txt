import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const base = process.env.RAVELDEX_DROPDOWN_BASE ?? '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Invalid deployment base');
const args = process.argv.slice(2), port = Number(args.length === 2 && args[0] === '--port' ? args[1] : args.length === 0 ? 4178 : NaN);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use --port 4178');
const mime = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
    let file = resolve(root, decodeURIComponent(pathname.slice(base.length)));
    if (file !== root && !file.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const bytes = await readFile(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${port}${base} — Ctrl+C stops this preview.`));
