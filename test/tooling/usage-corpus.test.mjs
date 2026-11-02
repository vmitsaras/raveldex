import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { buildUsageCorpus, USAGE_SOURCES } from '../../examples/docs-search/usage-corpus.mjs';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';

test('usage demo selects five practical guides, owns exact section bodies and leaves the qualification corpus unchanged', () => {
  const usage = buildUsageCorpus();
  assert.equal(usage.sources.length, 5);
  assert.ok(usage.records.length > 10);
  assert.ok(usage.sections.some(item => item.id === 'usage:docs/api/ADDONS.md#typed-filters-and-exact-facets'));
  assert.ok(usage.sections.some(item => item.id === 'usage:docs/api/HOSTS.md#one-owner-module-worker'));
  assert.ok(usage.sources.every(item => item.path.startsWith('docs/api/')));
  assert.equal(new Set(usage.records.map(item => item.id)).size, usage.records.length);
  assert.ok(Object.isFrozen(usage.records[0].text));
  assert.deepEqual(buildUsageCorpus(), usage);
  assert.equal(buildCorpus().hash, '267ec0eeb44c09bb3e24cf8a8e71cd90a73441d16f406a891c73f8f8603fdded');
});

test('usage extraction ignores code headings and refuses malformed/empty content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'raveldex-usage-corpus-'));
  try {
    for (const { path } of USAGE_SOURCES) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await copyFile(new URL('../../' + path, import.meta.url), join(root, path));
    }
    const target = join(root, USAGE_SOURCES[0].path), original = await readFile(target, 'utf8');
    await writeFile(target, original + '\n```md\n## Not a real section\n```\n');
    assert.ok(!buildUsageCorpus(root).sections.some(item => item.title === 'Not a real section'));
    await writeFile(target, original + '\n```js\n');
    assert.throws(() => buildUsageCorpus(root), /Unclosed code fence/);
    await writeFile(target, '# Guide\n\n## Empty\n');
    assert.throws(() => buildUsageCorpus(root), /Empty usage section/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
