import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareCandidate } from '../../scripts/prepare-candidate.mjs';
import { REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

test('preparation refuses existing output and symlink aliases without changing the sentinel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'raveldex-prepare-guard-'));
  try {
    await writeFile(join(root, 'sentinel'), 'preserved');
    await symlink(root, join(root, 'alias'), 'dir');
    for (const output of [root, join(root, 'alias'), join(root, 'sentinel')]) {
      await assert.rejects(prepareCandidate({ output }), /new directory/);
    }
    assert.equal(await readFile(join(root, 'sentinel'), 'utf8'), 'preserved');
    assert.deepEqual((await readdir(root)).sort(), ['alias', 'sentinel']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a failed full check preserves its actual log and never packs a verified candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'raveldex-prepare-failure-'));
  try {
    const cli = join(root, 'deliberate-failing-npm.cjs');
    await writeFile(cli, `require('node:assert/strict').deepEqual(process.argv.slice(2), ['run','check']);
console.log('intentional full-check failure fixture'); process.exit(23);\n`);
    const output = join(root, 'output');
    await assert.rejects(promisify(execFile)(process.execPath,
      [join(REPO_ROOT, 'scripts/prepare-candidate.mjs'), '--output', output],
      { cwd: REPO_ROOT, env: { ...process.env, npm_execpath: cli }, timeout: 30_000 }), error => error.code !== 0);
    assert.deepEqual((await readdir(output)).sort(), ['preparation.json', 'verification.log']);
    const report = JSON.parse(await readFile(join(output, 'preparation.json'), 'utf8'));
    assert.equal(report.status, 'Fail'); assert.equal(report.stage, 'project-check');
    assert.equal(report.exitCode, 23); assert.equal(report.candidatePacked, false);
    assert.match(await readFile(join(output, 'verification.log'), 'utf8'), /intentional full-check failure fixture/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
