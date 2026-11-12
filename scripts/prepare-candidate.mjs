import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCandidate } from './candidate-check.mjs';
import { digest, REPO_ROOT } from './lib/packed-consumer.mjs';

// Preparation never invokes a publish command, reads release credentials or
// changes package metadata. Publication requires a separate owner decision.
export async function prepareCandidate({ output } = {}) {
  const requested = resolve(output ?? join(tmpdir(), `raveldex-preparation-${randomUUID()}`));
  const parent = await realpath(dirname(requested));
  assert.ok((await stat(parent)).isDirectory(), 'output parent must be an existing directory');
  const destination = join(parent, basename(requested));
  try { await lstat(destination); throw new Error('Candidate output must be a new directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const metadata = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(metadata.private, false, 'release metadata must be publishable');
  assert.equal(metadata.version, '1.0.0', 'prepare the declared stable release only');
  assert.deepEqual(metadata.publishConfig, { access: 'public' }, 'explicit public npm access');
  assert.deepEqual(metadata.dependencies ?? {}, {});
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, 'Run through npm run candidate:prepare');
  const startedAt = new Date().toISOString();
  let check;
  try {
    check = await promisify(execFile)(process.execPath, [npmCli, 'run', 'check'], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    // Preserve a failed check without packing a purported verified candidate.
    await mkdir(destination);
    await writeFile(join(destination, 'verification.log'), (error.stdout ?? '') + (error.stderr ?? ''), { flag: 'wx' });
    await writeFile(join(destination, 'preparation.json'), JSON.stringify({
      kind: 'raveldex-candidate-preparation-v1', status: 'Fail', stage: 'project-check',
      startedAt, completedAt: new Date().toISOString(), packageVersion: metadata.version,
      exitCode: error.code ?? null, candidatePacked: false,
    }, null, 2) + '\n', { flag: 'wx' });
    throw error;
  }
  // The full check builds dist. Verify exactly that result without rebuilding.
  const log = check.stdout + check.stderr;
  let candidate;
  try { candidate = await verifyCandidate({ output: destination }); }
  catch (error) {
    if (error.candidateOutput === destination) {
      await writeFile(join(destination, 'verification.log'), log, { flag: 'wx' });
      await writeFile(join(destination, 'preparation.json'), JSON.stringify({
        kind: 'raveldex-candidate-preparation-v1', status: 'Fail', stage: 'candidate-check',
        startedAt, completedAt: new Date().toISOString(), packageVersion: metadata.version,
        projectCheck: { exitCode: 0, sha256: digest(log) }, candidateReport: 'candidate-report.json',
      }, null, 2) + '\n', { flag: 'wx' });
    }
    throw error;
  }
  await writeFile(join(destination, 'verification.log'), log, { flag: 'wx' });
  const report = {
    kind: 'raveldex-candidate-preparation-v1', status: 'Pass', startedAt,
    completedAt: new Date().toISOString(), packageVersion: metadata.version, private: metadata.private,
    publishConfig: metadata.publishConfig,
    projectCheck: { command: 'npm run check', exitCode: 0, log: 'verification.log', sha256: digest(log) },
    candidateReport: { path: 'candidate-report.json', sha256: digest(await readFile(candidate.reportPath)) },
    publication: 'Not performed; no publish, tag, release, credentials or remote tracking command is part of preparation.',
  };
  await writeFile(join(destination, 'preparation.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return { output: destination, report, candidate };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--output' && args[1]),
    'usage: npm run candidate:prepare -- [--output NEW_DIRECTORY]');
  const result = await prepareCandidate(args.length ? { output: args[1] } : {});
  console.log(JSON.stringify({ status: result.report.status, output: result.output,
    tarball: result.candidate.report.package.tarball, sha256: result.candidate.report.package.sha256 }));
}
