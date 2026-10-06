import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildCorpus, SOURCE_ALLOWLIST } from '../../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS, DOCS_ERROR_JUDGMENTS } from '../fixtures/docs/judgments.mjs';
import { digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

test('section extraction keeps exact source, fences, nested content and source hashes', async () => {
  const corpus = buildCorpus();
  for (const section of corpus.sections) {
    const source = await readFile(join(REPO_ROOT, section.sourcePath), 'utf8');
    const record = corpus.records.find(({ id }) => id === section.id);
    const lines = source.split('\n');
    assert.match(lines[section.startLine - 1], /^#{1,6} /);
    assert.equal(record.text.body, lines.slice(section.startLine, section.endLine).join('\n') + '\n');
    assert.equal(section.contentHash, digest(JSON.stringify(record)));
  }
  for (const source of corpus.sources) assert.equal(source.sha256, digest(await readFile(join(REPO_ROOT, source.path))));
  const { hash, ...content } = corpus;
  assert.equal(hash, digest(JSON.stringify(content)));
  assert.ok(Object.isFrozen(corpus.records[0].text));
  const ids = new Set(corpus.records.map(({ id }) => id));
  for (const judgment of [...DOCS_JUDGMENTS, ...DOCS_ERROR_JUDGMENTS]) {
    for (const id of [...judgment.intendedIds, ...judgment.acceptableIds]) assert.ok(ids.has(id), `${judgment.id}: ${id}`);
  }
});

test('missing, duplicate and malformed source cannot silently produce a partial corpus', async () => {
  const root = await mkdtemp(join(tmpdir(), 'raveldex-corpus-negative-'));
  try {
    for (const source of SOURCE_ALLOWLIST) {
      const path = join(root, source.path); await mkdir(dirname(path), { recursive: true });
      await copyFile(join(REPO_ROOT, source.path), path);
    }
    const path = join(root, SOURCE_ALLOWLIST[0].path);
    const source = await readFile(path, 'utf8');
    await writeFile(path, source.replace('## Public API contract', '## Missing API heading'));
    assert.throws(() => buildCorpus(root), /Expected exactly one heading/);
    await writeFile(path, source + '\n## Public API contract\nDuplicate content.\n');
    assert.throws(() => buildCorpus(root), /found 2/);
    await writeFile(path, Buffer.from([0xc3, 0x28]));
    assert.throws(() => buildCorpus(root), /Invalid UTF-8/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
