import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateCandidateManifest, verifyCandidate } from '../../scripts/candidate-check.mjs';
import { REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

const metadata = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
const selectedFiles = () => [...new Set(['README.md', 'LICENSE', 'dist/integrations/localsearch/LICENSE.LocalSearch',
  ...Object.values(metadata.exports).flatMap(value => typeof value === 'string' ? [value.slice(2)] : Object.values(value).map(path => path.slice(2))),
])].map(path => ({ path, size: 1 }));

test('candidate package gate rejects public export expansion and missing exported CSS', () => {
  assert.equal(validateCandidateManifest(metadata, selectedFiles()).status, 'Pass');
  const expanded = structuredClone(metadata);
  expanded.exports['./core/private-owner'] = { import: './dist/core/execution/engine.js', types: './dist/core/execution/engine.d.ts' };
  assert.throws(() => validateCandidateManifest(expanded, selectedFiles()), /explicit public entrypoint contract/);
  assert.throws(() => validateCandidateManifest(metadata, selectedFiles().filter(file => !file.path.endsWith('.css'))), /separate published CSS/);
});

test('candidate package gate rejects hidden dependencies, publication exposure and bundled JS side effects', () => {
  for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.throws(() => validateCandidateManifest({ ...metadata, [key]: { unexpected: '1.0.0' } }, selectedFiles()), /runtime/);
  }
  assert.throws(() => validateCandidateManifest({ ...metadata, private: false }, selectedFiles()), /publication guard/);
  assert.throws(() => validateCandidateManifest({ ...metadata, sideEffects: ['**/*.js', '**/*.css'] }, selectedFiles()), /CSS alone/);
});

test('candidate package gate refuses source, evaluation evidence and undeclared tarball members', () => {
  for (const path of ['src/index.ts', 'test/private.mjs', 'docs/evidence/sensitive.json', 'dist/../secret.js', '.env', 'dist/core/owner.js.map', 'node_modules/foreign/index.js']) {
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
    assert.equal(result.report.startup.outputs.length, 21);
    assert.equal(result.report.types.surface.length, 21);
    assert.equal(result.report.graphs.entries.length, 21);
    assert.equal(result.report.documentation.sources.length, 7);
    assert.equal(result.report.documentation.browser.status, 'Pass');
    assert.equal(result.report.package.private, true);
    assert.deepEqual(JSON.parse(await readFile(result.reportPath, 'utf8')), result.report);
  } finally {
    if (process.env.RAVELDEX_CANDIDATE_TEST_KEEP !== '1') await rm(result.output, { recursive: true, force: true });
  }
});
