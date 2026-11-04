// This function is also serialized into browser/worker harnesses. Keep it host-neutral.
export async function exerciseScheduling({ create, records, queries, samples = 40, warmups = 2, mode = 'normal', diagnostic, cpuUsage }) {
  const ensure = (value, text) => { if (!value) throw Error(text); };
  const row = { mode, samples: [], observations: [], queryResults: {}, build: null };
  const engine = await create();
  const errorData = error => ({ name: error.name, code: error.code ?? null, reason: error.reason ?? null, details: error.details ?? null, message: error.message });
  function verify(value, query) {
    const eligible = new Set(query.expectedIds);
    ensure(value.completeness === 'complete' && value.model === 'raveldex-bm25-v1', 'incomplete/model result');
    ensure(value.revision === Math.ceil(records.length / 256), 'revision drift');
    ensure(value.total === eligible.size && value.hits.length === Math.min(20, eligible.size), 'full total/page drift');
    ensure(new Set(value.hits.map(hit => hit.id)).size === value.hits.length, 'duplicate hit');
    for (const hit of value.hits) ensure(eligible.has(hit.id) && Number.isFinite(hit.score), 'ineligible/nonfinite hit');
    const wire = JSON.stringify(value);
    if (row.queryResults[query.id]) ensure(row.queryResults[query.id] === wire, 'same-owner semantic drift');
    else row.queryResults[query.id] = wire;
  }
  try {
    const buildStart = performance.now();
    for (let offset = 0; offset < records.length; offset += 256) await engine.addMany(records.slice(offset, offset + 256), { deadlineMs: 60000 });
    row.build = { outcome: 'Pass', wallMs: performance.now() - buildStart, batches: Math.ceil(records.length / 256) };
    for (const query of queries) {
      for (let warmup = 0; warmup < warmups; warmup++) verify(await engine.search(query.query, { limit: 20, deadlineMs: 60000 }), query);
      const repetitions = mode === 'diagnostic' ? 1 : samples;
      for (let index = 0; index < repetitions; index++) {
        let counters;
        if (mode === 'diagnostic') await diagnostic.start();
        const cpu = cpuUsage?.(), start = performance.now(); let result, error;
        try { result = await engine.search(query.query, { limit: 20, deadlineMs: 60000 }); } catch (caught) { error = caught; }
        const wallMs = performance.now() - start, usage = cpuUsage?.(cpu);
        if (mode === 'diagnostic') counters = await diagnostic.stop();
        const sample = { query: query.id, repetition: index, outcome: error ? /UNKNOWN/.test(error.code ?? '') ? 'Unknown' : ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code) ? 'Refused' : 'Rejected' : 'Pass', wallMs,
          ...(usage ? { cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000 } : {}), ...(error ? { error: errorData(error) } : {}), ...(counters ? { counters } : {}) };
        (mode === 'diagnostic' ? row.observations : row.samples).push(sample);
        if (result) verify(result, query);
      }
    }
  } catch (error) { row.failure = errorData(error); row.outcome = 'Fail'; }
  finally { await engine.dispose(); }
  row.outcome ??= [...row.samples, ...row.observations].every(sample => sample.outcome === 'Pass') ? 'Pass' : 'Fail';
  return row;
}

export function localSchedulingDiagnostic() {
  const key = Symbol.for('raveldex.n9.scheduling'); let timer;
  return { start() {
    if (globalThis[key]) throw Error('scheduling observations must be serial');
    const value = { steps: 0, workUnits: 0, hostYields: 0, tasks: [], heartbeats: 0, maxHeartbeatGapMs: 0, lastHeartbeat: performance.now(), firstWorkAt: null, engineSettled: false };
    globalThis[key] = value;
    timer = setInterval(() => { if (!value.steps || value.engineSettled) return; const now = performance.now(); value.maxHeartbeatGapMs = Math.max(value.maxHeartbeatGapMs, now - value.lastHeartbeat); value.lastHeartbeat = now; value.heartbeats++; }, 4);
  }, stop() {
    clearInterval(timer); const value = globalThis[key]; delete globalThis[key];
    value.endHeartbeatGapMs = (value.engineSettledAt ?? performance.now()) - value.lastHeartbeat; delete value.lastHeartbeat;
    return value;
  } };
}

if (globalThis.process?.argv?.[1]) {
  const { fileURLToPath } = await import('node:url');
  const { realpath } = await import('node:fs/promises');
  const entry = await realpath(process.argv[1]).catch(() => undefined);
  if (entry === fileURLToPath(import.meta.url)) {
    const [workloadURL, rawSize, mode, output] = process.argv.slice(2);
    const { workloadFor, verifyFrozen, schema } = await import(workloadURL);
    const { createRaveldex } = await import('@vmitsaras/raveldex');
    const { createSourceProvider, createSourcePhrases } = await import('@vmitsaras/raveldex/addons/phrases');
    const workload = verifyFrozen(workloadFor('adversarial', Number(rawSize)));
    if (process.env.RAVELDEX_SCHEDULING_FALLBACK === '1') for (const key of ['setImmediate','clearImmediate','MessageChannel']) Object.defineProperty(globalThis,key,{value:undefined,configurable:true,writable:true});
    const result = await exerciseScheduling({ create: () => createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] }),
      records: workload.records, queries: workload.queries.filter(row => ['common', 'rare'].includes(row.id)), mode,
      samples: Number(process.env.RAVELDEX_SCHEDULING_SAMPLES ?? 40), warmups: 2, diagnostic: localSchedulingDiagnostic(), cpuUsage: process.cpuUsage });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(output, JSON.stringify({ ...result, pid: process.pid, workload: workload.identity, runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv } }, null, 2) + '\n');
    if (result.outcome !== 'Pass') process.exitCode = 1;
  }
}
