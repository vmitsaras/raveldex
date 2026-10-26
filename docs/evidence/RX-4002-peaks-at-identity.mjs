// Offline byte-identity audit. No browser, product operations or resource rerun.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const basis = '448cb80';
const report = JSON.parse(await readFile('docs/evidence/RX-4002-focus-package.json'));
const archiveRaw = gunzipSync(await readFile('docs/evidence/RX-4002-memory-peak-capability.json.gz'));
const archive = JSON.parse(archiveRaw), rows = [];
for (const file of archive.files) {
  const bytes = Buffer.from(file.text);
  assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), file.sha256);
  rows.push({ path: file.path, bytes: file.bytes, sha256: file.sha256 });
}
// Requires the recorded temporary consumer. Its absence is a failed prerequisite,
// not permission to report a new package/runtime observation.
const installed = join(report.package.installedDirectory, 'node_modules/@vmitsaras/raveldex/dist');
const files = [];
async function walk(directory, relative = '') {
  for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) await walk(directory, path); else files.push(path);
  }
}
await walk('dist');
for (const path of files) assert.equal(sha(await readFile(join(installed, path))), sha(await readFile(join('dist', path))), path);
const originalInputs = report.package.graphs['browser-ui-driver.mjs'].inputs;
const observedInputs = report.package.graphs['browser-focus.mjs'].inputs;
for (const file of originalInputs) assert.equal(file.sha256, observedInputs.find(input => input.path === file.path)?.sha256, file.path);
const unchanged = [];
for (const path of ['docs/evidence/RX-4002-memory-transport.json', 'docs/evidence/RX-4002-memory-codec.json',
  'docs/evidence/RX-4002-memory-mutation.json', 'docs/evidence/RX-4002-memory-browser.json.gz',
  'docs/evidence/RX-4002-memory-collection.json', 'docs/evidence/RX-4002-dead-key.json']) {
  const current = await readFile(path), original = execFileSync('git', ['show', `${basis}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(sha(current), sha(original), path); unchanged.push({ path, sha256: sha(current) });
}
assert.equal(execFileSync('git', ['diff', basis, '--', 'src', 'package.json', 'package-lock.json']).length, 0);
console.log(JSON.stringify({ kind: 'raveldex-rx4002-peaks-at-parent-identity-check-v1', status: 'Pass', basis,
  archiveFiles: rows, productionFilesMatched: files.length, originalUIGraphInputsMatched: originalInputs.length,
  packageSha256: report.package.package.sha256, unchangedReports: unchanged, productionAndDependencyDiff: 'empty',
  scope: 'Static byte identities and archival reconstruction, not AT or product peak observations.' }, null, 2));
