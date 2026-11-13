import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishGenerated, verifyFiles, verifyInputs, auditSurface, auditLinks, rewriteMarkdown, sha256 } from '../../scripts/lib/pages.mjs';
import * as pages from '../../site/pages.mjs';
const { JEKYLL } = pages;

async function fixture(fn) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'raveldex-pages-test-')));
  try {
    const docs = join(base, 'docs'), stage = join(base, 'stage');
    await mkdir(join(docs, 'evidence'), { recursive: true });
    await writeFile(join(docs, 'evidence/unchanged.txt'), 'immutable evidence');
    await mkdir(stage);
    await writeFile(join(stage, 'index.html'), '<h1 id="start">Hello</h1><a href="#start">Start</a>');
    await writeFile(join(stage, '404.html'), '<h1>Missing</h1>');
    await writeFile(join(stage, '_config.yml'), JEKYLL);
    await fn({ base, docs, stage });
  } finally { await rm(base, { recursive: true, force: true }); }
}
test('Pages generation preserves excluded evidence and only replaces owned files', () => fixture(async ({ docs, stage }) => {
  const first = await publishGenerated(docs, stage);
  await verifyFiles(docs, first);
  await writeFile(join(stage, 'index.html'), '<h1 id="new">Changed</h1>');
  const second = await publishGenerated(docs, stage);
  assert.notEqual(first.files.find(x => x.path === 'index.html').sha256, second.files.find(x => x.path === 'index.html').sha256);
  assert.equal(await readFile(join(docs, 'evidence/unchanged.txt'), 'utf8'), 'immutable evidence');
  assert.deepEqual(await auditSurface(docs, second), ['404.html', 'index.html']);
}));
test('Pages refuses edited output and unowned files before modifying anything', () => fixture(async ({ docs, stage }) => {
  const manifest = await publishGenerated(docs, stage);
  await writeFile(join(docs, 'private.txt'), 'must not publish');
  await assert.rejects(publishGenerated(docs, stage), /Unknown non-excluded/);
  await verifyFiles(docs, manifest);
  await rm(join(docs, 'private.txt'));
  await writeFile(join(docs, 'index.html'), 'human edit');
  await assert.rejects(publishGenerated(docs, stage), /Changed managed/);
  assert.equal(await readFile(join(docs, 'index.html'), 'utf8'), 'human edit');
}));
test('Pages refuses symlinks, .nojekyll and manifest traversal', () => fixture(async ({ base, docs, stage }) => {
  const manifest = await publishGenerated(docs, stage);
  await writeFile(join(docs, '.nojekyll'), '');
  await assert.rejects(auditSurface(docs, manifest), /bypasses required exclusions/);
  await rm(join(docs, '.nojekyll'));
  await symlink(join(base, 'stage'), join(docs, 'demo'));
  await assert.rejects(publishGenerated(docs, stage), /symlink/);
  await rm(join(docs, 'demo'));
  manifest.files[0].path = '../outside';
  await writeFile(join(docs, '_pages-manifest.json'), JSON.stringify(manifest));
  await assert.rejects(publishGenerated(docs, stage), /Unmanaged/);
}));
test('Pages link audit detects missing fragments and project-root escapes', () => fixture(async ({ stage }) => {
  const manifest = { files: ['index.html', '404.html', '_config.yml'].map(path => ({ path })) };
  assert.deepEqual(await auditLinks(stage, manifest), { pages: 2, links: 1 });
  await writeFile(join(stage, 'index.html'), '<a href="#missing">Broken</a>');
  await assert.rejects(auditLinks(stage, manifest), /missing fragment/);
  await writeFile(join(stage, 'index.html'), '<a href="/assets/style.css">Broken</a>');
  await assert.rejects(auditLinks(stage, manifest), /leaves project base/);
}));
test('Pages rewrites prose navigation without rewriting executable fenced examples', () => {
  const routes = new Map([['docs/api/CORE.md', '/raveldex/reference/core/']]);
  const code = '```js\nconst text = "[Core](CORE.md)";\n```';
  const rendered = rewriteMarkdown('[Core](CORE.md#schema)\n[Evidence](../evidence/test.md)\n' + code, 'docs/api/README.md', routes, new Map());
  assert.ok(rendered.includes('[Core](/raveldex/reference/core/#schema)'));
  assert.ok(rendered.includes('Evidence (repository access)'));
  assert.ok(rendered.endsWith(code));
});
test('Pages preserves the Markdown overview source alias with a single public destination', () => {
  const routes = new Map(pages.PAGES.map(([source, route]) => [source, pages.href(route)]));
  for (const [source, route] of pages.SOURCE_ALIASES ?? []) routes.set(source, pages.href(route));
  const rendered = rewriteMarkdown('[Compare](../../examples/README.md#choose-a-search-solution)', 'docs/api/HOSTS.md', routes, new Map());
  assert.equal(rendered, '[Compare](/raveldex/examples/#choose-a-search-solution)');
  assert.equal(pages.PAGES.filter(([, route]) => route === 'examples').length, 1);
});
test('Pages audits real tags while escaped HTML examples create neither links nor fragment targets', () => fixture(async ({ stage }) => {
  const manifest = { files: ['index.html', '404.html', '_config.yml'].map(path => ({ path })) };
  const example = '<pre><code>&lt;a href="/guide/" id="example-only"&gt;Browse&lt;/a&gt;</code></pre>';
  await writeFile(join(stage, 'index.html'), '<h1 id="start">Hello</h1>' + example + '<a title="A > B" href="#start">Start</a>');
  assert.deepEqual(await auditLinks(stage, manifest), { pages: 2, links: 1 });
  await writeFile(join(stage, 'index.html'), example + '<a href="#example-only">Broken</a>');
  await assert.rejects(auditLinks(stage, manifest), /missing fragment/);
  await writeFile(join(stage, 'index.html'), example + '<a title="A > B" href="/assets/style.css">Broken</a>');
  await assert.rejects(auditLinks(stage, manifest), /leaves project base/);
}));
test('Pages stale source guard refuses changed inputs', () => fixture(async ({ base }) => {
  await writeFile(join(base, 'guide.md'), 'first');
  const manifest = { inputs: [{ path: 'guide.md', sha256: sha256('first') }] };
  await verifyInputs(base, manifest);
  await writeFile(join(base, 'guide.md'), 'changed');
  await assert.rejects(verifyInputs(base, manifest), /Stale Pages output/);
}));
