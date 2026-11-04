// Host-neutral diagnosis runner: actual factories are supplied by Node/browser.
// No imports; this module can be bundled or serialized into actual worker hosts.
export const RESTORE_VARIANTS = Object.freeze(['source', 'positions-offsets']);
export const RESTORE_OPERATIONS = Object.freeze(['build', 'exportSource', 'restoreSource', 'deadlineRestore', 'abortedRestore']);
export function restoreError(error) {
  return { name: error?.name ?? 'Error', code: error?.code ?? null, reason: error?.reason ?? null, details: error?.details ?? null, message: String(error?.message ?? error) };
}
export function restoreOutcome(error) {
  if (!error) return 'Pass';
  if (/UNKNOWN/.test(error.code ?? '') || error.name === 'WorkerAdapterError' && ['TIMEOUT', 'TERMINATED', 'WORKER_UNAVAILABLE'].includes(error.code)) return 'Unknown';
  if (error.code === 'CANCELLED') return 'Cancelled';
  if (['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code) || error.reason === 'ENCODED_LIMIT_EXCEEDED') return 'Refused';
  return 'Rejected';
}
export function priorRestoreRecords(records) {
  return records.slice(0, Math.min(1000, records.length)).map(record => ({ id: 'prior:' + record.id,
    text: { body: ['n9priorstate n9red n9blue', ...(Array.isArray(record.text.body) ? record.text.body : [record.text.body])] }, metadata: { group: 'prior' } }));
}
export async function exerciseRestore({ create, createSnapshots, records, queries, mode = 'normal', diagnostic, cpuUsage, memory, onSnapshot, deadlineMs = 60000 }) {
  const ensure = (condition, message) => { if (!condition) throw Error(message); };
  const equal = (actual, expected, message) => ensure(JSON.stringify(actual) === JSON.stringify(expected), message);
  const errorData = error => ({ name: error?.name ?? 'Error', code: error?.code ?? null, reason: error?.reason ?? null, details: error?.details ?? null, message: String(error?.message ?? error) });
  const classify = error => !error ? 'Pass' : /UNKNOWN/.test(error.code ?? '') || error.name === 'WorkerAdapterError' && ['TIMEOUT', 'TERMINATED', 'WORKER_UNAVAILABLE'].includes(error.code) ? 'Unknown' : error.code === 'CANCELLED' ? 'Cancelled' : ['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code) || error.reason === 'ENCODED_LIMIT_EXCEEDED' ? 'Refused' : 'Rejected';
  const priorRecords = records.slice(0, Math.min(1000, records.length)).map(record => ({ id: 'prior:' + record.id,
    text: { body: ['n9priorstate n9red n9blue', ...(Array.isArray(record.text.body) ? record.text.body : [record.text.body])] }, metadata: { group: 'prior' } }));
  const row = { mode, size: records.length, priorRecords: priorRecords.length, samples: [], observations: [], memory: [], outcome: 'Running',
    scope: 'One actual donor/receiver per case; ordinary wall/CPU excludes metadata/hash/postcondition work. Diagnostic observations are intrusive, not normal timings or retained/peak heap.' };
  const operationRows = mode === 'diagnostic' ? row.observations : row.samples;
  async function memoryPoint(operation, point, engine, role) {
    if (mode === 'diagnostic' && memory) row.memory.push({ operation, point, ...await memory({ operation, point, engine, role }) });
  }
  async function observe(operation, engine, role, call) {
    await memoryPoint(operation, 'before', engine, role);
    if (mode === 'diagnostic') { ensure(diagnostic, 'diagnostic hooks required'); await diagnostic.start({ operation, engine, role }); }
    const cpu = cpuUsage?.(), start = performance.now(); let result, error, operationId;
    try { const pending = call(); operationId = pending?.operationId; result = await pending; } catch (caught) { error = caught; }
    const wallMs = performance.now() - start, usage = cpuUsage?.(cpu);
    const sample = { operation, outcome: classify(error), wallMs, ...(usage ? { cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000 } : {}),
      ...(operationId ? { operationId } : {}), ...(error ? { error: errorData(error) } : {}) };
    if (mode === 'diagnostic') sample.counters = await diagnostic.stop({ operation, engine, role });
    await memoryPoint(operation, 'after', engine, role); operationRows.push(sample); return { result, error, row: sample };
  }
  async function build(engine, input) { let result; for (let offset = 0; offset < input.length; offset += 256) result = await engine.addMany(input.slice(offset, offset + 256), { deadlineMs }); return result; }
  const selectedQueries = [{ id: 'all', query: { kind: 'all' }, expectedIds: records.map(record => record.id) }, ...queries.filter(query => ['common', 'rare', 'narrow-prefix', 'source-phrase'].includes(query.id))];
  async function inspect(engine, expectedRevision) {
    const results = [];
    for (const query of selectedQueries) {
      let result;
      try { result = await engine.search(query.query, { limit: 20, deadlineMs }); }
      catch (error) { ensure(classify(error) === 'Refused', 'unexpected inspection query rejection'); results.push({ id: query.id, outcome: 'Refused', error: errorData(error) }); continue; }
      const eligible = new Set(query.expectedIds);
      ensure(result.completeness === 'complete' && result.model === 'raveldex-bm25-v1', 'incomplete/model postcondition');
      ensure(result.revision === expectedRevision && result.total === eligible.size, 'revision/total postcondition');
      ensure(result.hits.length === Math.min(20, eligible.size) && new Set(result.hits.map(hit => hit.id)).size === result.hits.length, 'page postcondition');
      for (const hit of result.hits) ensure(eligible.has(hit.id) && Number.isFinite(hit.score), 'ineligible/nonfinite postcondition');
      results.push({ id: query.id, outcome: 'Pass', result });
    }
    return results;
  }
  async function priorState(engine) {
    const all = await engine.search({ kind: 'all' }, { limit: 20, deadlineMs });
    const lexical = await engine.search('n9priorstate', { limit: 20, deadlineMs });
    const phrase = await engine.search({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'n9red n9blue', fields: ['body'] } }, { limit: 20, deadlineMs });
    ensure(all.total === priorRecords.length && lexical.total === priorRecords.length && phrase.total === priorRecords.length, 'prior fixture incomplete');
    const encoded = await createSnapshots(engine).exportSource({ deadlineMs });
    return { all, lexical, phrase, encoded };
  }
  const donor = await create({ role: 'donor' }); let encoded;
  try {
    const built = await observe('build', donor, 'donor', () => build(donor, records)); if (built.error) throw built.error;
    built.row.result = built.result; built.row.admittedBatches = Math.ceil(records.length / 256);
    const donorRevision = built.result.revision, donorResults = await inspect(donor, donorRevision); row.donorResults = donorResults;
    const exported = await observe('exportSource', donor, 'donor', () => createSnapshots(donor).exportSource({ deadlineMs }));
    if (exported.error) {
      ensure(['Refused', 'Cancelled', 'Unknown'].includes(exported.row.outcome), 'unexpected export rejection');
      equal(await inspect(donor, donorRevision), donorResults, 'export failure changed donor'); exported.row.donorQueriesPreserved = true;
      for (const operation of ['restoreSource', 'deadlineRestore', 'abortedRestore']) operationRows.push({ operation, outcome: 'Not run', reason: 'Source export did not produce an admitted snapshot', exportOutcome: exported.row.outcome });
      row.outcome = 'Collected'; return row;
    }
    encoded = exported.result; ensure(typeof encoded === 'string', 'export did not return text');
    const snapshot = (() => { const envelope = JSON.parse(encoded); ensure(envelope.format === 'raveldex-source', 'wrong snapshot format'); ensure(envelope.body.payload.records.length === records.length, 'snapshot missing records'); return { header: envelope.body.header }; })();
    exported.row.result = { encodedBytes: new TextEncoder().encode(encoded).length, encodedCodeUnits: encoded.length, header: snapshot.header,
      ...(onSnapshot ? await onSnapshot(encoded, { operation: 'exportSource', role: 'donor' }) : {}) };
    for (const [operation, role] of [['restoreSource', 'receiver'], ['deadlineRestore', 'deadline'], ['abortedRestore', 'abort']]) {
      const receiver = await create({ role });
      try {
        await build(receiver, priorRecords); const before = await priorState(receiver), snapshots = createSnapshots(receiver);
        let controller, timer, settled = false, abortRequested = false, abortRequestedWhilePending = false;
        const restored = await observe(operation, receiver, role, () => {
          if (operation === 'abortedRestore') {
            controller = new AbortController();
            timer = setTimeout(() => { abortRequested = true; abortRequestedWhilePending = !settled; controller.abort(); }, 0);
          }
          const pending = snapshots.restore(encoded, { deadlineMs: operation === 'deadlineRestore' ? 1 : deadlineMs, ...(controller ? { signal: controller.signal } : {}) });
          pending.then(() => { settled = true; }, () => { settled = true; }); return pending;
        });
        settled = true; if (timer !== undefined) clearTimeout(timer);
        if (controller) Object.assign(restored.row, { abortRequested, abortRequestedWhilePending });
        restored.row.priorRevision = before.all.revision; restored.row.priorDocuments = priorRecords.length;
        if (restored.row.outcome === 'Unknown') {
          restored.row.authority = snapshots.reconcile && restored.row.operationId ? await snapshots.reconcile(restored.row.operationId) : { status: 'unresolved' };
          restored.row.stateClaim = 'Unknown outcome; no authoritative-state preservation or commit claim. No blind retry.';
          continue;
        }
        if (restored.error) {
          ensure(['Refused', 'Cancelled'].includes(restored.row.outcome), 'unexpected restore rejection');
          const after = await priorState(receiver); equal(after.all, before.all, 'failed restore changed all query'); equal(after.lexical, before.lexical, 'failed restore changed lexical query'); equal(after.phrase, before.phrase, 'failed restore changed phrase query'); ensure(after.encoded === before.encoded, 'failed restore changed exact source/metadata/revision bytes');
          restored.row.oldQueriesPreserved = true; restored.row.oldSourceBytesPreserved = true; restored.row.postcondition = { all: after.all, lexical: after.lexical, phrase: after.phrase };
        } else {
          ensure(restored.result.revision === before.all.revision + 1 && restored.result.originRevision === donorRevision && restored.result.reindexed === true && restored.result.format === 'raveldex-source', 'restore receipt drift');
          restored.row.result = restored.result; const after = await inspect(receiver, restored.result.revision);
          equal(after.map(item => item.result ? { ...item, result: { ...item.result, revision: 0 } } : item), donorResults.map(item => item.result ? { ...item, result: { ...item.result, revision: 0 } } : item), 'restored queries differ from donor');
          const old = await receiver.search('n9priorstate', { deadlineMs }); ensure(old.total === 0 && old.revision === restored.result.revision, 'restore retained prior records');
          restored.row.postcondition = after; restored.row.oldRemoved = true;
        }
      } finally { await receiver.dispose(); }
    }
    row.outcome = 'Collected'; return row;
  } catch (error) { row.outcome = 'Fail'; row.failure = errorData(error); error.restoreReport = row; throw error; }
  finally { await donor.dispose(); }
}
