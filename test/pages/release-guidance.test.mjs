import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');
const anchors = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(match => ({ href: match[1], label: match[2].replace(/<[^>]*>/g, '').trim() }));

test('published starter guidance reaches the real chooser and galleries', async () => {
  for (const path of ['docs/guide/overview/index.html', 'docs/examples/api/index.html']) {
    const chooser = anchors(await text(path)).find(link => link.label === 'solution chooser');
    assert.ok(chooser, path + ': solution chooser is discoverable');
    assert.equal(chooser.href, '/raveldex/examples/', path + ': complete projects are not small API recipes');
  }
  const galleries = anchors(await text('docs/reference/hosts/index.html')).filter(link => /gallery/i.test(link.label));
  assert.ok(galleries.length >= 5);
  for (const gallery of galleries) assert.match(gallery.href, /^\/raveldex\/examples\/(?:inline|modal|dropdown|directory|cards)\//, gallery.label);
});

test('copyable localization and theme assets are exact public downloads', async () => {
  const manifest = JSON.parse(await text('docs/_pages-manifest.json'));
  for (const [name, guide] of [['consumer-messages.de.mjs', 'localization'], ['consumer-themes.css', 'hosts']]) {
    const path = 'example-files/' + name;
    assert.ok(manifest.files.some(file => file.path === path), 'public inventory contains ' + name);
    assert.equal(await text('docs/' + path), await text('docs/api/examples/' + name), 'download equals shipped example');
    assert.ok(anchors(await text('docs/reference/' + guide + '/index.html')).some(link => link.href === '/raveldex/' + path), guide + ': direct download, no private source dependency');
  }
});
