import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Local-only native browser/AT review of the exact accepted installed runtime.
// This is an evidence fixture, not a published example or new product behavior.
const root = process.cwd(), evidence = join(root, 'docs/evidence/RX-9112');
const primary = JSON.parse(await readFile(join(evidence, 'primary-family-report.json'), 'utf8'));
const work = primary.consumer.directory, installed = primary.consumer.installed;
const fixture = await readFile(join(root, 'test/consumer/family-qualification-fixture.mjs'), 'utf8');
await writeFile(join(work, 'native-family-fixture.mjs'), fixture);
const entry = `import './native-family-fixture.mjs';
document.getElementById('fail-next').addEventListener('click', () => window.family.fail());
document.getElementById('hold-next').addEventListener('click', () => window.family.hold());
document.getElementById('release').addEventListener('click', () => window.family.release());
function dimensions() {
  document.getElementById('dimensions').textContent = 'Layout witness: width ' + innerWidth + ', client ' + document.documentElement.clientWidth + ', scroll ' + document.documentElement.scrollWidth + ', DPR ' + devicePixelRatio;
}
addEventListener('resize', dimensions); document.getElementById('measure').addEventListener('click', dimensions); dimensions();
`;
await writeFile(join(work, 'native-review-entry.mjs'), entry);
await build({ absWorkingDir: work, entryPoints: ['native-review-entry.mjs'], outfile: 'native-review-bundle.mjs', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
const css = ['inline.css', 'modal.css', 'dropdown.css', 'directory.css', 'directory-cards.css'];
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname, name = path.split('/').at(-1);
    if (path === '/fixture.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(work, 'native-review-bundle.mjs'))); }
    else if (css.includes(name)) { response.setHeader('content-type', 'text/css'); response.end(await readFile(join(installed, 'dist/addons/ui', name))); }
    else if (path.startsWith('/resource/')) { response.end('<!doctype html><html lang="en"><title>Native result destination</title><main><h1>Native result destination</h1><a href="/inline/">Return to inline review</a></main>'); }
    else response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raveldex finite native review</title>${css.map(name => `<link rel="stylesheet" href="/${name}">`).join('')}<body style="font-family:system-ui,sans-serif;margin:16px"><main><h1>Raveldex native review</h1><p>Candidate ${primary.package.sha256.slice(0,12)}. Explicit test fixture; no remote data.</p><nav aria-label="Review surfaces">${['inline','modal','dropdown','directory','cards'].map(s => `<a style="display:inline-block;margin:0 .6rem .6rem 0" href="/${s}/">${s}</a>`).join('')}</nav><p><button id="fail-next" type="button">Fail next request (fixture)</button> <button id="hold-next" type="button">Hold next request (fixture)</button> <button id="release" type="button">Release request (fixture)</button> <button id="measure" type="button">Record layout</button></p><p id="dimensions"></p><p id="query-echo"></p><button id="family-trigger" type="button">Open search dialog</button><section id="family-root" aria-label="Native consumer review"><p>Original browse fallback</p></section></main><script type="module" src="/fixture.mjs"></script></body></html>`);
  } catch (error) { response.writeHead(500); response.end('Local fixture failed'); process.stderr.write(String(error) + '\n'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const sha = text => createHash('sha256').update(text).digest('hex');
const info = { kind: 'raveldex-native-review-server-v1', origin: 'http://127.0.0.1:' + server.address().port, packageSHA256: primary.package.sha256, installed, sourceFixtureSHA256: sha(fixture), entrySHA256: sha(entry), serverSHA256: sha(await readFile(new URL(import.meta.url))), scope: 'Local native CUA interaction, real browser zoom and available native AT. Fixture controls inject one refusal/held real reply; they are outside product UI. Layout witness is DOM measurement, not physical paint or speech.' };
await writeFile(join(evidence, 'native-server.json'), JSON.stringify(info, null, 2) + '\n');
process.stdout.write(JSON.stringify(info) + '\n');
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
