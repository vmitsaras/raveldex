// Offline artifact integrity/extraction only. Numerical replay is the separate
// independent Python auditor. No runtime launch, build or process attachment.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && args[0] === '--extract-managed',
  'Usage: node audit.mjs [--extract-managed /absolute/NEW-directory]');
const extraction = args[1];
if (extraction) assert.ok(isAbsolute(extraction), 'Extraction path must be absolute');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = JSON.parse(await readFile(join(project,
  'docs/evidence/RX-4002-runtime-instrumentation-identity-20261028.json'), 'utf8'));
assert.equal(identity.schema, 'raveldex-runtime-instrumentation-identity-v1');
assert.equal(identity.archives.length, 2);
const report = { schema: 'raveldex-runtime-archive-audit-v1', archives: [],
  externalFilesVerified: false, numericalReplayPerformed: false };
let managed;
for (const expected of identity.archives) {
  assert.ok(expected.path.startsWith('docs/evidence/') && !expected.path.includes('..'));
  const compressed = await readFile(join(project, expected.path));
  assert.equal(compressed.length, expected.bytes);
  assert.equal(hash(compressed), expected.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: 128 * 1024 * 1024 });
  assert.equal(raw.length, expected.rawBytes);
  assert.equal(hash(raw), expected.rawSha256);
  const archive = JSON.parse(raw);
  assert.equal(archive.schema, expected.schema);
  assert.equal(archive.members.length, expected.members);
  assert.equal((archive.references ?? archive.omittedReferences).length, expected.externalReferences);
  const names = new Set();
  for (const member of archive.members) {
    assert.equal(typeof member.name, 'string');
    assert.ok(!isAbsolute(member.name) && !member.name.includes('\\') && !member.name.includes('\0'));
    assert.ok(member.name.split('/').every(part => part && part !== '.' && part !== '..'));
    assert.ok(!names.has(member.name), 'Duplicate archive member'); names.add(member.name);
    assert.equal(typeof member.text, 'string');
    const bytes = Buffer.from(member.text);
    assert.equal(bytes.length, member.bytes, member.name);
    assert.equal(hash(bytes), member.sha256, member.name);
  }
  report.archives.push({ path: expected.path, sha256: expected.sha256,
    membersVerified: archive.members.length, externalReferences: expected.externalReferences });
  if (archive.schema === 'raveldex-managed-runtime-archive-v1') managed = archive;
}
assert.ok(managed);
const auditor = await readFile(join(project, identity.independent.auditorPath));
assert.equal(hash(auditor), identity.independent.auditorSha256);
const numerical = JSON.parse(managed.members.find(member =>
  member.name === identity.independent.numericalAuditMember).text);
assert.equal(numerical.traces.length, identity.independent.auditedTraces);
assert.equal(numerical.traces.reduce((sum, trace) => sum + trace.recorded_events, 0),
  identity.independent.auditedEvents);
assert.equal(numerical.traces.filter(trace => trace.measurement_valid).length,
  identity.independent.validMeasurements);
assert.equal(numerical.traces.filter(trace => !trace.measurement_valid).length,
  identity.independent.expectedInvalidMeasurements);

// Validation finishes before any optional extraction. mkdir refuses an existing
// root; each file is then created exclusively within that new task-owned root.
if (extraction) {
  await mkdir(extraction);
  for (const member of managed.members) {
    const destination = join(extraction, member.name);
    if (dirname(destination) !== extraction) await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, member.text, { flag: 'wx', mode: 0o600 });
  }
  report.managedExtractedTo = extraction;
}
report.outcome = 'Pass: durable member integrity; external files and numerical replay are separate';
console.log(JSON.stringify(report, null, 2));
