import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateCandidateManifest, verifyCandidate } from '../../scripts/candidate-check.mjs';
import * as releaseChecks from '../../scripts/candidate-check.mjs';
import { REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

const metadata = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
const selectedFiles = () => [...new Set(['README.md', 'LICENSE', 'dist/integrations/localsearch/LICENSE.LocalSearch',
  ...Object.values(metadata.exports).flatMap(value => typeof value === 'string' ? [value.slice(2)] : Object.values(value).map(path => path.slice(2))),
])].map(path => ({ path, size: 1 }));

test('stable release gate accepts 1.0.0 public packages and rejects development metadata', () => {
  const stable = { ...metadata, version: '1.0.0', private: false, publishConfig: { access: 'public' } };
  assert.equal(validateCandidateManifest(stable, selectedFiles()).status, 'Pass');
  assert.throws(() => validateCandidateManifest({ ...stable, version: '0.1.0-rc.0' }, selectedFiles()), /1\.0\.0/);
  assert.throws(() => validateCandidateManifest({ ...stable, private: true }, selectedFiles()), /publishable/);
  assert.throws(() => validateCandidateManifest({ ...stable, publishConfig: { access: 'restricted' } }, selectedFiles()), /public/);
});

test('packaged documentation links resolve inside the artifact without a source checkout', () => {
  assert.equal(typeof releaseChecks.validateDocumentationLinks, 'function');
  const files = [{ path: 'README.md' }, { path: 'docs/api/CORE.md' }];
  const docs = [{ path: 'README.md', text: '[Core](docs/api/CORE.md#queries) [Source](https://github.com/vmitsaras/raveldex)\n```md\n[Example](not-an-actual-link.md)\n```' }];
  assert.equal(releaseChecks.validateDocumentationLinks(docs, files), 1);
  assert.throws(() => releaseChecks.validateDocumentationLinks([{ path: 'docs/api/CORE.md', text: '[Starter](../../examples/README.md)' }], files), /Missing packaged documentation target/);
  assert.throws(() => releaseChecks.validateDocumentationLinks([{ path: 'README.md', text: '[Outside](../README.md)' }], files), /Missing packaged documentation target/);
});

test('candidate package gate rejects public export expansion and missing exported CSS', () => {
  assert.equal(validateCandidateManifest(metadata, selectedFiles()).status, 'Pass');
  const expanded = structuredClone(metadata);
  expanded.exports['./core/private-owner'] = { import: './dist/core/execution/engine.js', types: './dist/core/execution/engine.d.ts' };
  assert.throws(() => validateCandidateManifest(expanded, selectedFiles()), /explicit public entrypoint contract/);
  assert.throws(() => validateCandidateManifest(metadata, selectedFiles().filter(file => !file.path.endsWith('.css'))), /separate published CSS/);
  assert.throws(() => validateCandidateManifest(metadata, selectedFiles().filter(file => !file.path.endsWith('/inline.css'))), /separate published CSS/);
  assert.throws(() => validateCandidateManifest(metadata, selectedFiles().filter(file => !file.path.endsWith('/dropdown.css'))), /separate published CSS/);
  assert.throws(() => validateCandidateManifest(metadata, selectedFiles().filter(file => !file.path.endsWith('/directory.css'))), /separate published CSS/);
  assert.throws(() => validateCandidateManifest(metadata, selectedFiles().filter(file => !file.path.endsWith('/directory-cards.css'))), /separate published CSS/);
});

test('candidate package gate rejects hidden dependencies, private packages and bundled JS side effects', () => {
  for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.throws(() => validateCandidateManifest({ ...metadata, [key]: { unexpected: '1.0.0' } }, selectedFiles()), /runtime/);
  }
  assert.throws(() => validateCandidateManifest({ ...metadata, private: true }, selectedFiles()), /publishable/);
  assert.throws(() => validateCandidateManifest({ ...metadata, sideEffects: ['**/*.js', '**/*.css'] }, selectedFiles()), /CSS alone/);
});

test('candidate package gate refuses source, evaluation evidence and undeclared tarball members', () => {
  assert.equal(validateCandidateManifest(metadata,[...selectedFiles(),{path:'docs/api/examples/consumer-themes.css',size:1}]).status,'Pass');
  for (const path of ['src/index.ts', 'test/private.mjs', 'docs/evidence/sensitive.json', 'docs/release/PUBLICATION_STATUS.md', 'docs/support/RX-4003.md', 'dist/../secret.js', '.env', 'dist/core/owner.js.map', 'node_modules/foreign/index.js','docs/api/examples/undeclared.css']) {
    assert.throws(() => validateCandidateManifest(metadata, [...selectedFiles(), { path, size: 1 }]), /tarball member|unexpected/);
  }
});

test('candidate checker refuses existing directories and symlinks before writing evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'raveldex-candidate-output-refusal-'));
  try {
    const sentinel = join(directory, 'sentinel.txt'), link = directory + '-link';
    await writeFile(sentinel, 'preserve existing evidence\n');
    await symlink(directory, link);
    try {
      for (const output of [directory, link]) {
        await assert.rejects(verifyCandidate({ output }), error => error.code === 'EEXIST' && error.candidateOutput === undefined);
      }
      assert.equal(await readFile(sentinel, 'utf8'), 'preserve existing evidence\n');
      await assert.rejects(stat(join(directory, 'candidate-report.json')), { code: 'ENOENT' });
    } finally { await rm(link); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('offline native candidate installs every entry, checks declarations/isolation and runs packaged documentation in Node and a real browser', async () => {
  const result = await verifyCandidate();
  try {
    assert.equal(result.report.status, 'Pass');
    assert.equal(result.report.startup.outputs.length, 35);
    assert.equal(result.report.types.surface.length, 35);
    assert.equal(result.report.graphs.entries.length, 35);
    assert.equal(result.report.documentation.sources.length, 7);
    assert.equal(result.report.documentation.browser.status, 'Pass');
    assert.equal(result.report.package.private, false);
    assert.equal(result.report.package.version, '1.0.0');
    assert.deepEqual(JSON.parse(await readFile(result.reportPath, 'utf8')), result.report);
  } finally {
    if (process.env.RAVELDEX_CANDIDATE_TEST_KEEP !== '1') await rm(result.output, { recursive: true, force: true });
  }
});
