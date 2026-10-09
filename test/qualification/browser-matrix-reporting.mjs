import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { release } from 'node:os';

export const MATRIX_SCENARIOS = Object.freeze([
  { id: 'semantics', label: 'Run finite semantics and direct/worker parity' },
  { id: 'persistence', label: 'Run IndexedDB recovery and namespace erasure' },
  { id: '1000-direct-core', label: 'Run 1,000 records: direct core' },
  { id: '1000-worker-source', label: 'Run 1,000 records: source worker' },
  { id: '10000-direct-core', label: 'Run 10,000 records: direct core' },
  { id: '10000-worker-source', label: 'Run 10,000 records: source worker' },
]);
export const MATRIX_BODY_LIMIT = 1024 * 1024;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key));
const failure = (status, message) => Object.assign(new Error(message), { status });
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const errorShape = value => plain(value) && typeof value.name === 'string' && (typeof value.message === 'string' || typeof value.code === 'string');
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const searchShape = value => plain(value) && Number.isSafeInteger(value.revision) && value.revision >= 0
  && Number.isSafeInteger(value.total) && value.total >= 0 && value.completeness === 'complete' && value.model === 'raveldex-bm25-v1'
  && Array.isArray(value.hits) && value.hits.length <= value.total
  && value.hits.every(hit => plain(hit) && typeof hit.id === 'string' && Number.isFinite(hit.score) && hit.score >= 0);
function validateResult(input) {
  if (!['Pass', 'Fail', 'RejectedOutcome', 'Blocked'].includes(input.outcome) || !iso(input.startedAt) || !iso(input.finishedAt)
    || Date.parse(input.finishedAt) < Date.parse(input.startedAt) || !Array.isArray(input.cleanup) || !Array.isArray(input.pageErrors)
    || !input.pageErrors.every(errorShape) || !input.cleanup.every(row => keys(row, ['value', 'error', 'databaseName'])
      && (!Object.hasOwn(row, 'error') || (errorShape(row.error) && !Object.hasOwn(row, 'value')))
      && (!Object.hasOwn(row, 'databaseName') || (typeof row.databaseName === 'string' && row.databaseName.startsWith('raveldex-rx4002-'))))
    || (Object.hasOwn(input, 'error') && !errorShape(input.error))) throw failure(400, 'Malformed result timestamps, errors or cleanup observations.');
  const hasErrors = input.cleanup.some(row => row.error) || input.pageErrors.length || input.error;
  if (hasErrors && input.outcome !== 'Fail') throw failure(400, 'Errors cannot be recorded as a successful observation.');
  if (input.outcome === 'Fail' && !hasErrors && input.evidence?.configurationOutcome !== 'Fail') throw failure(400, 'Fail requires an observed error or failed configuration.');
  if (input.outcome === 'Blocked' && !(plain(input.evidence) && typeof input.evidence.reason === 'string' && typeof input.evidence.requiredObservation === 'string')) throw failure(400, 'Blocked requires the unavailable observation and reason.');
  if (input.outcome === 'Pass' && input.scenarioId === 'semantics') {
    const evidence = input.evidence;
    if (!plain(evidence) || evidence.independentMembershipQueries !== 50 || evidence.numericalAssertions !== 2
      || !Array.isArray(evidence.rows) || evidence.rows.length !== 53 || !evidence.rows.every(plain) || !searchShape(evidence.scores)
      || evidence.scores.total !== 2 || evidence.scores.hits.length !== 2 || !plain(evidence.expectedScores)
      || !Number.isFinite(evidence.expectedScores.a) || !Number.isFinite(evidence.expectedScores.b)) throw failure(400, 'Missing finite semantics result structure.');
  }
  if (input.outcome === 'Pass' && input.scenarioId === 'persistence') {
    const value = input.evidence, generation = value?.saved?.generation;
    if (!plain(value) || typeof generation !== 'string' || !generation || value.saved.durable !== true || value.saved.format !== 'raveldex-source'
      || !Number.isSafeInteger(value.saved.encodedBytes) || value.saved.encodedBytes <= 0
      || !['loaded', 'secondLoad'].every(key => value[key]?.status === 'restored' && value[key].generation === generation && plain(value[key].restore))
      || !searchShape(value.actual) || !searchShape(value.expected) || value.actual.total !== 2 || value.expected.total !== 2
      || value.erased?.erased !== true || value.erased.generation !== null || value.erased.durable !== true
      || value.missing?.status !== 'missing' || value.missing.generation !== null || value.databaseCleanup !== 'deleted') throw failure(400, 'Missing successful storage recovery/erasure/cleanup result structure.');
  }
  if (['Pass', 'RejectedOutcome'].includes(input.outcome) && input.scenarioId.includes('-')) {
    const value = input.evidence, size = Number(input.scenarioId.split('-')[0]);
    if (!plain(value) || value.kind !== input.scenarioId.slice(input.scenarioId.indexOf('-') + 1) || value.requestedRecords !== size
      || !Number.isSafeInteger(value.admittedRecords) || value.admittedRecords < 0 || value.admittedRecords > size
      || value.configurationOutcome !== input.outcome || !Array.isArray(value.operationFailures) || !Array.isArray(value.rows)
      || !searchShape(value.all) || value.all.total !== value.admittedRecords || !searchShape(value.after) || !plain(value.common) || !plain(value.selective) || !plain(value.replacement)
      || (value.kind === 'worker-source' && !plain(value.phrase))
      || (input.outcome === 'Pass' ? value.admittedRecords !== size || value.operationFailures.length !== 0 : value.operationFailures.length === 0)) throw failure(400, 'Resource configuration/result structure does not match its outcome.');
  } else if (input.outcome === 'RejectedOutcome') throw failure(400, 'Only bounded resource refusals use RejectedOutcome.');
}

export async function readMatrixBody(request) {
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MATRIX_BODY_LIMIT) throw failure(413, 'Matrix report exceeds the one MiB capture bound.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function createMatrixRecorder({ directory, origin, packageIdentity, harnessIdentity }) {
  const sessionId = randomUUID(), artifactPath = join(directory, 'RX-4002-installed-matrix.jsonl');
  const manifest = { kind: 'raveldex-rx4002-installed-matrix-journal-v1', sessionId, createdAt: new Date().toISOString(), origin,
    package: structuredClone(packageIdentity), harness: structuredClone(harnessIdentity), scenarios: MATRIX_SCENARIOS,
    serverRuntime: { node: process.version, platform: process.platform, release: release(), arch: process.arch },
    errorCapture: 'Cumulative current-document errors through scenario cleanup and the next host task. No guarantee is made about errors arriving after that capture interval.',
    scope: 'Finite installed-browser in-page engine/storage/resource assertions. Labels are operator assignments; request User-Agent is separately captured. No AT, physical input/presentation or memory qualification.' };
  const manifestSha256 = sha256(JSON.stringify(manifest));
  const file = await open(artifactPath, 'wx');
  async function append(row) { await file.writeFile(JSON.stringify(row) + '\n'); await file.sync(); }
  try { await append({ type: 'manifest', manifestSha256, manifest }); } catch (error) { await file.close(); throw error; }
  const completed = new Map(); let active, queue = Promise.resolve();
  const session = () => ({ sessionId, manifestSha256, packageSha256: manifest.package.package.sha256,
    scenarios: MATRIX_SCENARIOS, artifactName: 'RX-4002-installed-matrix.jsonl', active: active && { attemptId: active.attemptId, scenarioId: active.scenarioId, label: active.label } });
  async function accept({ path, method, headers, bytes }) {
    if (method !== 'POST') throw failure(405, 'Only POST records matrix observations.');
    if (headers.origin !== origin || headers.host !== new URL(origin).host) throw failure(403, 'Matrix observations require the exact local origin.');
    if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] ?? '')) throw failure(415, 'Matrix observations require JSON.');
    if (bytes.length > MATRIX_BODY_LIMIT) throw failure(413, 'Matrix report exceeds the one MiB capture bound.');
    let input; try { input = JSON.parse(bytes); } catch { throw failure(400, 'Invalid matrix JSON.'); }
    const common = ['sessionId', 'clientId', 'attemptId', 'scenarioId', 'label'];
    if (!keys(input, path === '/matrix/start' ? [...common, 'activation'] : [...common, 'outcome', 'evidence', 'error', 'cleanup', 'pageErrors', 'startedAt', 'finishedAt'])
      || input.sessionId !== sessionId || !identifier(input.clientId) || !identifier(input.attemptId)
      || !MATRIX_SCENARIOS.some(row => row.id === input.scenarioId) || !['Firefox', 'Safari'].includes(input.label)) throw failure(400, 'Unknown or malformed matrix identity/scenario.');
    const requestUserAgent = String(headers['user-agent'] ?? '').slice(0, 2048);
    if (path === '/matrix/start') {
      if (active || completed.has(input.attemptId)) throw failure(409, 'Another attempt is active, or this attempt already completed.');
      if (!keys(input.activation, ['isTrusted', 'eventTimeStamp']) || typeof input.activation.isTrusted !== 'boolean' || !Number.isFinite(input.activation.eventTimeStamp)) throw failure(400, 'Missing activation observation.');
      const row = { type: 'start', ...input, requestUserAgent, recordedAt: new Date().toISOString(), manifestSha256 };
      await append(row); active = row;
      return { recorded: true, sessionId, attemptId: input.attemptId, manifestSha256 };
    }
    if (path !== '/matrix/result') throw failure(404, 'Unknown matrix reporting route.');
    const hash = sha256(bytes), previous = completed.get(input.attemptId);
    if (previous) {
      if (previous.hash !== hash || previous.requestUserAgent !== requestUserAgent) throw failure(409, 'Completed attempt received a mismatched duplicate.');
      return { ...previous.acknowledgement, duplicate: true };
    }
    if (!active || common.some(key => active[key] !== input[key]) || active.requestUserAgent !== requestUserAgent) throw failure(409, 'Result does not match its recorded start.');
    validateResult(input);
    const row = { type: 'result', ...input, requestUserAgent, recordedAt: new Date().toISOString(), manifestSha256 };
    await append(row);
    const acknowledgement = { recorded: true, sessionId, attemptId: input.attemptId, outcome: input.outcome, manifestSha256 };
    completed.set(input.attemptId, { hash, requestUserAgent, acknowledgement }); active = undefined;
    return acknowledgement;
  }
  return { artifactPath, sessionId, manifestSha256, session,
    accept(request) { const next = queue.then(() => accept(request)); queue = next.catch(() => {}); return next; },
    async close() { await queue; try { if (active) await append({ type: 'unfinished', attemptId: active.attemptId, scenarioId: active.scenarioId,
      label: active.label, outcome: 'Not completed', recordedAt: new Date().toISOString(), reason: 'Server closed without an acknowledged result; execution outcome is unknown.' }); } finally { await file.close(); } },
  };
}
