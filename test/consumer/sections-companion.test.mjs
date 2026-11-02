import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareConsumer, command, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { packAstro } from '../../scripts/pack-astro.mjs';

let consumer, browser;
const report = { kind: 'raveldex-installed-sections-v1', observations: [], graphs: [],
  limits: ['Automated installed consumer and Chromium observations; no human AT, physical input, memory or deployment claim.'] };
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
const corpus = await readJSON(new URL('../fixtures/page-sections/corpus.json', import.meta.url));
const projection = await readJSON(new URL('../fixtures/page-sections/projection.json', import.meta.url));

before(async () => {
  consumer = await prepareConsumer([], []);
  const astro = await packAstro({ output: join(consumer.directory, 'astro-pack') });
  await command('npm', ['install', astro.tarball, '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund',
    '--package-lock=false', '--cache', join(consumer.directory, '.npm-cache')], consumer.directory);
  for (const name of ['raveldex', 'raveldex-astro']) {
    const path = join(consumer.directory, 'node_modules/@vmitsaras', name);
    assert.equal(await realpath(path), path, 'actual installed package, no workspace symlink');
  }
  await writeFile(join(consumer.directory, 'fixtures.json'), JSON.stringify({ corpus, projection }));
  await writeFile(join(consumer.directory, 'configuration.mjs'), `
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createSectionEvidence } from '@vmitsaras/raveldex/addons/sections';
export const configuration = strategy => ({ schema: ${JSON.stringify(corpus.schema)}, addons: [
  createSourceProvider({ fields: ['body','title'] }),
  ...(strategy === 'offsets' ? [createPositionProvider({ fields: ['body','title'], offsets: ['body','title'] })] : []),
  createSectionEvidence({ fields: { body: strategy, title: strategy } })] });
`);
  await writeFile(join(consumer.directory, 'create-artifacts.mjs'), `
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {buildStaticSearch} from '@vmitsaras/raveldex-astro/build';
import {configuration} from './configuration.mjs';
const {corpus,projection}=JSON.parse(await readFile('fixtures.json','utf8'));
const [output,base,strategy]=process.argv.slice(2);
const input={configuration:configuration(strategy),entries:corpus.records.map(record=>({record,title:'Guide '+record.id,path:'/guide/'+record.id.slice(-1)+'/'})),buildId:'sections-installed-v1',base};
const old=await buildStaticSearch(input), next=await buildStaticSearch({...input,pageSections:projection.pages});
for(const [file,wire] of Object.entries(old.files)) assert.equal(next.files[file],wire,'exact existing v1 bytes');
assert.equal(Object.keys(next.files).length,Object.keys(old.files).length+2);
await mkdir(join(output,'raveldex'),{recursive:true});
for(const [file,wire] of Object.entries(next.files))await writeFile(join(output,'raveldex',file),wire);
console.log(JSON.stringify({unchangedFiles:Object.keys(old.files),companionFiles:Object.keys(next.files).filter(x=>!Object.hasOwn(old.files,x))}));
`);
  await writeFile(join(consumer.directory, 'browser-sections.mjs'), `
import {loadStaticSearch} from '@vmitsaras/raveldex-astro/client';
import {mountRaveldexInline} from '@vmitsaras/raveldex/addons/ui/inline';
import {configuration} from './configuration.mjs';
document.querySelector('button').addEventListener('click',async()=>{
  const owner=await loadStaticSearch({manifestUrl:new URL('./raveldex/manifest.json',location.href).href,expectedBuildId:'sections-installed-v1',configuration:configuration(document.body.dataset.strategy)});
  const pageSections=await owner.loadSections();
  const documents=await owner.loadDocuments();
  const ui=mountRaveldexInline({root:document.getElementById('search'),engine:owner.engine,documents,pageSections,pageSize:2,maxRenderedResults:4});
  window.installedSections={owner,ui,pageSections};
  document.body.dataset.ready='true';
});
`);
  const bundled = await build({ absWorkingDir: consumer.directory, entryPoints: ['browser-sections.mjs'],
    outfile: join(consumer.directory, 'browser-bundle.mjs'), bundle: true, platform: 'browser', format: 'esm',
    minify: true, target: 'es2022', metafile: true, logLevel: 'silent' });
  for (const [path, value] of Object.entries(bundled.metafile.inputs)) {
    assert.ok(['browser-sections.mjs', 'configuration.mjs'].includes(path) || /^node_modules\/@vmitsaras\/raveldex(?:-astro)?\/dist\//.test(path), path);
    assert.ok(value.imports.every(item => !item.external));
    report.graphs.push({ path, bytes: value.bytes });
  }
  browser = await chromium.launch({ ...(process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
  report.browser = browser.version();
});
after(async () => {
  await browser?.close();
  if (process.env.RAVELDEX_SECTIONS_CONSUMER_REPORT)
    await writeFile(process.env.RAVELDEX_SECTIONS_CONSUMER_REPORT, JSON.stringify(report, null, 2) + '\n');
});

test('installed section and companion declarations preserve legacy handle compatibility and readonly contracts', async () => {
  const coreTypes = await readFile(join(REPO_ROOT, 'test/consumer/sections-types.ts'), 'utf8');
  await writeFile(join(consumer.directory, 'sections-types.ts'), coreTypes);
  await writeFile(join(consumer.directory, 'companion-types.ts'), `
import type {Configuration} from '@vmitsaras/raveldex';
import type {PageSections,PageSectionPage} from '@vmitsaras/raveldex/addons/sections';
import {buildStaticSearch,type StaticBuildOptions} from '@vmitsaras/raveldex-astro/build';
import {loadStaticSearch,type LoadedStaticSearch} from '@vmitsaras/raveldex-astro/client';
declare const configuration:Configuration;
const pages:readonly PageSectionPage[]=[];
const options:StaticBuildOptions={configuration,entries:[],buildId:'one',pageSections:pages};
void buildStaticSearch(options);
declare const loaded:LoadedStaticSearch;
const legacy:LoadedStaticSearch={engine:loaded.engine,manifest:loaded.manifest,loadDocuments:loaded.loadDocuments,dispose:loaded.dispose};
const maps:Promise<PageSections>|undefined=loaded.loadSections?.({timeoutMs:30000});
void maps;void legacy;void loadStaticSearch;
// @ts-expect-error The new input is a parallel option, never an entry property.
buildStaticSearch({configuration,buildId:'one',entries:[{record:{id:'a',text:{}},title:'A',path:'/a/',sections:[]}]});
// @ts-expect-error Runtime maps must include owner revision.
const map:PageSections={kind:'raveldex-page-sections',version:1,pages:[]};
void map;
`);
  await writeFile(join(consumer.directory, 'sections-tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'], types: [],
    strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, verbatimModuleSyntax: true,
    skipLibCheck: false, noEmit: true }, files: ['sections-types.ts', 'companion-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', 'sections-tsconfig.json'], consumer.directory);
  report.observations.push({ name: 'actual paired installed public declarations', status: 'Pass' });
});

test('paired installed source/offset companions preserve v1 bytes, native paging and actual encoded anchor destinations at root/help bases', async () => {
  for (const base of ['/', '/help/']) for (const strategy of ['source', 'offsets']) {
    const output = join(consumer.directory, `site-${strategy}-${base === '/' ? 'root' : 'help'}`);
    const artifacts = JSON.parse((await command(process.execPath, ['create-artifacts.mjs', output, base, strategy], consumer.directory)).stdout);
    const css = await readFile(join(consumer.installed, 'dist/addons/ui/inline.css'));
    await writeFile(join(output, 'inline.css'), css);
    await writeFile(join(output, 'browser.mjs'), await readFile(join(consumer.directory, 'browser-bundle.mjs')));
    await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Installed sections</title><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="${base}inline.css"></head><body data-strategy="${strategy}"><h1>Guides</h1><button>Enable search</button><div id="search"><p>Browse the guides.</p></div><script type="module" src="${base}browser.mjs"></script></body></html>`);
    for (const record of corpus.records) {
      const sections = projection.pages.find(page => page.pageId === record.id)?.sections ?? [];
      const directory = join(output, 'guide', record.id.slice(-1)); await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Guide ${record.id}</title><h1>Guide ${record.id}</h1>` +
        sections.map(section => `<h2 id="${escape(section.anchor)}">${escape(section.heading)}</h2><p>${escape((Array.isArray(record.text[section.field]) ? record.text[section.field][section.valueIndex] : record.text[section.field]).slice(section.start, section.end))}</p>`).join(''));
    }
    const requests = [];
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://fixture.invalid'); requests.push(url.pathname);
      if (!url.pathname.startsWith(base)) { response.writeHead(404).end(); return; }
      const path = resolve(output, '.' + '/' + url.pathname.slice(base.length));
      if (!(path === output || path.startsWith(output + '/'))) { response.writeHead(403).end(); return; }
      try {
        const data = await readFile(url.pathname.endsWith('/') ? join(path, 'index.html') : path);
        response.writeHead(200, { 'content-type': path.endsWith('.mjs') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.json') ? 'application/json' : 'text/html' }).end(data);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    try {
      await page.goto(origin + base);
      assert.deepEqual(requests.filter(path => path.includes('/raveldex/')), []);
      await page.getByRole('button', { name: 'Enable search' }).click();
      await page.waitForFunction(() => document.body.dataset.ready === 'true');
      await page.evaluate(() => window.installedSections.ui.search('alp'));
      assert.deepEqual(await page.locator('[data-raveldex-inline-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexInlineResult)), ['page:a', 'page:b']);
      assert.match(await page.locator('.raveldex-inline__status').innerText(), /4 results/);
      const link = page.getByRole('link', { name: 'Further details', exact: true });
      const target = origin + base + 'guide/a/#%25%23caf%C3%A9';
      assert.equal(await link.getAttribute('href'), target);
      assert.deepEqual(await page.locator('[data-raveldex-inline-result]').first().locator('mark').allTextContents(), ['alpha', 'alpha', 'alpha']);
      await page.getByRole('button', { name: 'Load more', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 4);
      const observed = await page.evaluate(async () => {
        const { owner, pageSections } = window.installedSections;
        const main = await owner.engine.search('alpha');
        return { ids: main.hits.map(hit => hit.id), total: main.total, revision: main.revision, mapRevision: pageSections.revision };
      });
      assert.deepEqual(observed.ids, ['page:a', 'page:b', 'page:c', 'page:d']);
      assert.equal(observed.total, 4); assert.equal(observed.revision, observed.mapRevision);
      assert.equal(requests.filter(path => path.endsWith('/sections-manifest.json')).length, 1);
      assert.equal(requests.filter(path => /\/sections-[a-f0-9]+\.json$/.test(path)).length, 1);
      await link.click(); await page.waitForURL(target);
      await page.getByRole('heading', { name: 'Further details', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => {
        const id = decodeURIComponent(location.hash.slice(1));
        return document.getElementById(id)?.textContent;
      }), 'Further details');
      assert.deepEqual(errors, []);
      report.observations.push({ name: 'paired installed anchored navigation', base, strategy, status: 'Pass', artifacts, observed, requests });
    } finally {
      await context.close(); await new Promise(done => server.close(done));
    }
  }
});
