// RX-8007 disposable-package diagnostics only. Never imported by production.
import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { instrumentPackage } from './instrument.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Self-contained for serialization into an actual browser/worker realm.
 * Memory callback is diagnostic-only and optional; samples are not heap peaks. */
export function createRestoreDiagnostic({ memory } = {}) {
  const key = Symbol.for('raveldex.n9.restore'), generic = Symbol.for('raveldex.n9.diagnostics');
  let active;
  function summary(root) {
    return { revision: root.revision, documents: root.documents.size, counts: { ...root.counts }, participants: Object.entries(root.participants).map(([id, value]) => ({ id, kind: value?.kind ?? null, revision: value?.revision ?? null, records: value?.records?.size ?? null, retainedEntries: value?.retainedEntries ?? null, textCodeUnits: value?.textCodeUnits ?? null, occurrenceCount: value?.occurrenceCount ?? null, offsetCount: value?.offsetCount ?? null, termEntries: value?.termEntries ?? null, termCodeUnits: value?.termCodeUnits ?? null })) };
  }
  return {
    start(meta = {}) {
      if (active || globalThis[key] || globalThis[generic]) throw Error('Restore diagnostics must be serial and nonnested');
      const counts = { idfComputations: 0, averageLengthComputations: 0, fieldsPrepared: 0, candidates: 0, documentsEvaluated: 0, documentsScored: 0, exactDictionaryProbes: 0, prefixDictionaryVisits: 0, postingsVisited: 0, emittedSteps: 0, emittedWorkUnits: 0, maxStepWorkUnits: 0, hostYields: 0, continuationsScheduled: 0, deadlineCallbacks: 0, restorePhase: null, restorePhases: {} };
      const data = { operation: meta.operation ?? null, phase: 'none', mutationPhase: null, participant: null, validationParticipant: null, phaseEvents: [], phaseWork: {}, detailWork: {}, recordsAttempted: 0, recordsCaptured: 0, recordsCompleted: 0, captureWallMs: 0, analysisCalls: {}, tokens: {}, copy: { directories: 0, directoryPointers: 0, buckets: 0, bucketEntries: 0, seals: 0 }, participantWork: {}, budgetRefusals: [], budgetConstructions: {}, snapshots: [], memorySamples: [], authoritativeUnchangedDuringStaging: true, finalAuthoritativeSame: null, observerErrors: [] };
      const sample = point => { if (!memory || data.memorySamples.length >= 128) return; try { data.memorySamples.push({ point, phase: data.phase, recordsCompleted: data.recordsCompleted, at: performance.now(), value: memory() }); } catch (error) { data.observerErrors.push(String(error)); } };
      const budgetRoles = new WeakMap(), sampledPhases = new Set();
      const state = {
        data, summary,
        sidecar(stage) { (data.sidecarStages ??= {})[data.participant] = stage; },
        labelBudget(budget, role) { if (budget) { budgetRoles.set(budget, role); data.budgetConstructions[role] = (data.budgetConstructions[role] ?? 0) + 1; } },
        roleFor(budget) { return budgetRoles.get(budget) ?? 'unlabelled'; },
        phase(value) { if (typeof value !== 'string' || !value.startsWith('snapshot.') || value === data.phase) return; data.phase = value; if (data.phaseEvents.length < 128) data.phaseEvents.push({ phase: value, at: performance.now(), emittedWorkUnits: counts.emittedWorkUnits }); if (!sampledPhases.has(value)) { sampledPhases.add(value); sample(value); } },
        step(units) { const top = data.phaseWork[data.phase] ??= { steps: 0, workUnits: 0 }; top.steps++; top.workUnits += units; const name = data.phase === 'snapshot.staging' ? `mutation.${data.mutationPhase ?? 'between-records'}${data.participant ? ':' + data.participant : ''}` : data.phase === 'snapshot.export.validation' ? `${data.phase}:${data.validationParticipant ?? 'nonparticipant-structural'}` : data.phase; const detail = data.detailWork[name] ??= { steps: 0, workUnits: 0 }; detail.steps++; detail.workUnits += units; },
        old(root, current) { data.oldRoot = summary(root); data.inputActive = true; state.currentSame = () => current() === root; sample('old-authoritative-root'); },
        decoded(records, textUnits) { data.decodedRecords = records; data.decodedBodyCodeUnits = textUnits; sample('decoded-input'); },
        staged(root) { data.recordsCompleted++; data.lastStagedRoot = summary(root); const same = state.currentSame?.() ?? true; data.authoritativeUnchangedDuringStaging &&= same; if (data.recordsCompleted === 1 || data.recordsCompleted % 256 === 0) { data.snapshots.push({ ...data.lastStagedRoot, authoritativeSame: same }); sample('private-staging-root'); } },
        partial(stage) { data.recordsCompleted++; data.lastUnsealedStage = stage; const same = state.currentSame?.() ?? true; data.authoritativeUnchangedDuringStaging &&= same; if (data.recordsCompleted === 1 || data.recordsCompleted % 256 === 0) { data.snapshots.push({ kind: 'unsealed-bulk-stage', ...stage, authoritativeSame: same }); sample('private-unsealed-stage'); } },
        finish(current) { data.finalAuthoritativeSame = state.currentSame?.() ?? null; data.finalAuthoritativeRoot = summary(current); data.inputActive = false; delete state.currentSame; sample('restore-finished'); },
        sample,
      };
      active = { counts, data, state }; globalThis[generic] = counts; globalThis[key] = state; sample('observation-start');
    },
    stop() {
      if (!active) throw Error('Restore diagnostic observation not started');
      const { counts, data, state } = active; state.sample('observation-stop'); delete state.currentSame;
      delete globalThis[key]; delete globalThis[generic]; active = undefined;
      return { ...counts, restore: data };
    },
  };
}
const prelude = `const rx7 = () => globalThis[Symbol.for('raveldex.n9.restore')];\n`;
const patches = [
  { path: 'dist/core/execution/engine.js', anchors: [
    ['phase', 'check(op, phase) {', 'check(op, phase) {\n        rx7()?.phase(phase);'],
    ['step', 'consumed += step.value.workUnits;', 'consumed += step.value.workUnits; rx7()?.step(step.value.workUnits);'],
  ] },
  { path: 'dist/adapters/snapshots/snapshots.js', anchors: [
    ['whole-budget', 'const budget = new WorkBudget(maximum);', "const budget = new WorkBudget(maximum); rx7()?.labelBudget(budget, 'snapshot.total');"],
    ['participant-total-budget', 'const budget = new WorkBudget(participant.maxWorkUnits ?? configuration.limits.maxMutationWorkUnits);', "const budget = new WorkBudget(participant.maxWorkUnits ?? configuration.limits.maxMutationWorkUnits); rx7()?.labelBudget(budget, 'snapshot.participant.total:' + participant.id);"],
    ['export-validation', 'try {\n        yield* validateNative(native, root.configuration, root.revision, check, root.fields);', "rx7()?.phase('snapshot.export.validation');\n    try {\n        yield* validateNative(native, root.configuration, root.revision, check, root.fields);"],
    ['export-source', "const payload = format === 'raveldex-source' ?", "rx7()?.phase('snapshot.export.source');\n    const payload = format === 'raveldex-source' ?"],
    ['export-encode', 'const body = yield* encodeJson(', "rx7()?.phase('snapshot.export.encode');\n    const body = yield* encodeJson("],
    ['export-checksum', 'const integrity = yield* checksum(body);', "rx7()?.phase('snapshot.export.checksum');\n    const integrity = yield* checksum(body);"],
    ['export-utf8', 'yield* utf8Bytes(result, maximum);', "rx7()?.phase('snapshot.export.utf8');\n    yield* utf8Bytes(result, maximum);"],
    ['record-capture-phase', 'for (const record of data.records) {', "for (const record of data.records) { if (rx7()) rx7().data.mutationPhase = 'capture';"],
    ['restore-start', 'function* restoreCursor(engine, root, encoded, maximum, publish, check) {', 'function* restoreCursor(engine, root, encoded, maximum, publish, check) {\n    rx7()?.old(root, () => getExecutionOwner(engine)?.root);\n    try {'],
    ['restore-finish', 'publish(next);\n    // There must be no stop check or yield after publication.\n    return result;\n}', 'publish(next);\n    // There must be no stop check or yield after publication.\n    return result;\n    } finally { const current = getExecutionOwner(engine)?.root; if (current) rx7()?.finish(current); }\n}'],
    ['decoded', 'const format = envelope.format, body = object(envelope.body, [\'header\', \'payload\']);', "const format = envelope.format, body = object(envelope.body, ['header', 'payload']); rx7()?.decoded(body.payload?.records?.length ?? null, decoded.bodyText.length);"],
    ['attempt', "const request = owner.capture('add', record);", "if (rx7()) rx7().data.recordsAttempted++;\n        const captureStarted = performance.now();\n        const request = owner.capture('add', record);\n        if (rx7()) { rx7().data.captureWallMs += performance.now() - captureStarted; rx7().data.recordsCaptured++; }"],
    ['single-record', 'yield* owner.execute(request, { analyze });', "yield* owner.execute(request, { analyze, checkpoint: phase => { if (rx7()) rx7().data.mutationPhase = phase; } });\n        rx7()?.staged(owner.root);"],
    ['participant', 'const cursor = participant.prepare(previous, context);', "if (rx7()) rx7().data.participant = participant.id;\n                const cursor = participant.prepare(previous, context);"],
    ['participant-work', 'budget.charge(step.value.workUnits);\n                        yield step.value;', "budget.charge(step.value.workUnits);\n                        if (rx7()) { const row = rx7().data.participantWork[participant.id] ??= { steps: 0, workUnits: 0 }; row.steps++; row.workUnits += step.value.workUnits; }\n                        yield step.value;"],
    ['participant-end', "catch { /* Preserve first failure. */ }\n                    }\n                }", "catch { /* Preserve first failure. */ }\n                    }\n                    if (rx7()) rx7().data.participant = null;\n                }"],
    ['analysis', 'const analyze = createAnalysis(configuration, check);', "const baseAnalyze = createAnalysis(configuration, check);\n    const analyze = function* (...args) { const name = rx7()?.data.participant ?? 'core'; if (rx7()) rx7().data.analysisCalls[name] = (rx7().data.analysisCalls[name] ?? 0) + 1; for (const step of baseAnalyze(...args)) { if (step.token && rx7()) rx7().data.tokens[name] = (rx7().data.tokens[name] ?? 0) + 1; yield step; } };"],
  ] },
  { path: 'dist/adapters/snapshots/native.js', anchors: [
    ['validation-analysis', 'const analyze = createAnalysis(configuration, check);', "const baseAnalyze = createAnalysis(configuration, check);\n    const analyze = function* (...args) { const name = 'native-validation:' + (rx7()?.data.validationParticipant ?? 'core'); if (rx7()) rx7().data.analysisCalls[name] = (rx7().data.analysisCalls[name] ?? 0) + 1; for (const step of baseAnalyze(...args)) { if (step.token && rx7()) rx7().data.tokens[name] = (rx7().data.tokens[name] ?? 0) + 1; yield step; } };"],
    ['validation-participant', 'const budget = new WorkBudget(Math.min(registration.manifest.limits.maxWorkUnits, limits.maxMutationWorkUnits));', "if (rx7()) rx7().data.validationParticipant = id;\n        const budget = new WorkBudget(Math.min(registration.manifest.limits.maxWorkUnits, limits.maxMutationWorkUnits)); rx7()?.labelBudget(budget, 'native.validation.participant:' + id);"],
    ['validation-participant-end', 'catch { /* Preserve validation failure. */ }\n            }\n        }', 'catch { /* Preserve validation failure. */ }\n            }\n            if (rx7()) rx7().data.validationParticipant = null;\n        }'],
  ] },
  { path: 'dist/core/index/staging.js', anchors: [
    ['directory-copy', 'const pointers = Object.create(null);', 'const pointers = Object.create(null); if (rx7()?.data.inputActive) rx7().data.copy.directories++;'],
    ['pointer-copy', 'pointers[slot] = this.original.buckets[slot];', 'pointers[slot] = this.original.buckets[slot]; if (rx7()?.data.inputActive) rx7().data.copy.directoryPointers++;'],
    ['bucket-copy', 'const bucket = Object.create(null);', 'const bucket = Object.create(null); if (rx7()?.data.inputActive) rx7().data.copy.buckets++;'],
    ['entry-copy', 'bucket[entry] = previous[entry];', 'bucket[entry] = previous[entry]; if (rx7()?.data.inputActive) rx7().data.copy.bucketEntries++;'],
    ['seal', '*finish() {', '*finish() { if (rx7()?.data.inputActive) rx7().data.copy.seals++;'],
  ] },
  { path: 'dist/core/mutations/owner.js', anchors: [
    ['record-budget', 'const old = this.#root, budget = new WorkBudget(old.configuration.limits.maxMutationWorkUnits);', "const old = this.#root, budget = new WorkBudget(old.configuration.limits.maxMutationWorkUnits); rx7()?.labelBudget(budget, 'mutation.record');"],
    ['participant-record-budget', 'const participantBudget = participant.maxWorkUnits === undefined ? undefined : new WorkBudget(participant.maxWorkUnits);', "const participantBudget = participant.maxWorkUnits === undefined ? undefined : new WorkBudget(participant.maxWorkUnits); rx7()?.labelBudget(participantBudget, 'mutation.participant:' + participant.id);"],
  ] },
  { path: 'dist/core/limits/work.js', anchors: [
    ['refusal', "invalid('WORK_LIMIT_EXCEEDED', 'work');", "{ if (rx7()) rx7().data.budgetRefusals.push({ role: rx7().roleFor(this), emittedBefore: globalThis[Symbol.for('raveldex.n9.diagnostics')]?.emittedWorkUnits ?? 0, maximum: this.maximum, attempted: this.used, units, phase: rx7().data.phase, mutationPhase: rx7().data.mutationPhase, participant: rx7().data.participant }); invalid('WORK_LIMIT_EXCEEDED', 'work'); }"],
  ] },
];
const legacyOnly = new Set(['participant-total-budget', 'record-capture-phase', 'attempt', 'single-record', 'participant', 'participant-work', 'participant-end', 'analysis']);
const bulkPatch = { path: 'dist/adapters/snapshots/bulk.js', anchors: [
  ['participant-total-budget', 'budget: new WorkBudget(maximum)', "budget: (() => { const budget = new WorkBudget(maximum); rx7()?.labelBudget(budget, 'snapshot.participant.total:' + id); return budget; })()"],
  ['record-capture', "const request = captureMutation(configuration, 'add', record);", "if (rx7()) rx7().data.recordsAttempted++; const captureStarted = performance.now();\n        const request = captureMutation(configuration, 'add', record);\n        if (rx7()) { rx7().data.captureWallMs += performance.now() - captureStarted; rx7().data.recordsCaptured++; }"],
  ['record-budget', 'budget = new WorkBudget(configuration.limits.maxMutationWorkUnits);\n        const owned', "budget = new WorkBudget(configuration.limits.maxMutationWorkUnits); rx7()?.labelBudget(budget, 'mutation.record');\n        const owned"],
  ['final-budget', "budget = new WorkBudget(configuration.limits.maxMutationWorkUnits);\n    boundary('snapshot.source.finalization');", "budget = new WorkBudget(configuration.limits.maxMutationWorkUnits); rx7()?.labelBudget(budget, 'snapshot.bulk.finalization');\n    boundary('snapshot.source.finalization');"],
  ['invocation-budget', 'const invocation = new WorkBudget(participant.maximum);', "const invocation = new WorkBudget(participant.maximum); rx7()?.labelBudget(invocation, 'mutation.participant:' + participant.id); if (rx7()) rx7().data.participant = participant.id;", 2],
  ['participant-work', 'participant.budget.charge(step.value.workUnits);', "participant.budget.charge(step.value.workUnits); if (rx7()) { const row = rx7().data.participantWork[participant.id] ??= { steps: 0, workUnits: 0 }; row.steps++; row.workUnits += step.value.workUnits; }", 2],
  ['participant-end', '/* Preserve first outcome, including success. */', '/* Preserve first outcome, including success. */'],
  ['participant-clear', 'currentStates = Object.freeze(nextStates);', 'if (rx7()) rx7().data.participant = null;\n        currentStates = Object.freeze(nextStates);'],
  ['stage', 'revision++;', "revision++; rx7()?.partial({ revision, counts: { ...delta.counts, dictionaryEntries: delta.liveDictionaryEntries }, participants: Object.entries(currentStates).map(([id, value]) => ({ id, ...(rx7()?.data.sidecarStages?.[id] ?? { kind: value?.kind, revision: value?.revision, records: value?.records?.size, retainedEntries: value?.retainedEntries, occurrenceCount: value?.occurrenceCount, offsetCount: value?.offsetCount }) })) });"],
  ['analysis', 'const analyze = createAnalysis(configuration, check);', "const baseAnalyze = createAnalysis(configuration, check);\n    const analyze = function* (...args) { const name = rx7()?.data.participant ?? 'core'; if (rx7()) rx7().data.analysisCalls[name] = (rx7().data.analysisCalls[name] ?? 0) + 1; for (const step of baseAnalyze(...args)) { if (step.token && rx7()) rx7().data.tokens[name] = (rx7().data.tokens[name] ?? 0) + 1; yield step; } };"],
] };
const workerOwnerPatch = { path: 'dist/adapters/worker/snapshots-host.js', anchors: [
  ['diagnostic-owner', 'const engine = facadeFromExecutionOwner(owner);', "const engine = facadeFromExecutionOwner(owner); globalThis[Symbol.for('raveldex.n9.bulk.owner')] = () => owner.root;"],
] };
export async function instrumentRestorePackage(packageRoot) {
  const root = await realpath(packageRoot);
  const bulk = await readFile(resolve(root, 'dist/adapters/snapshots/snapshots.js'), 'utf8').then(source => source.includes('reconstructSource('));
  const selectedPatches = patches.map(patch => patch.path === 'dist/adapters/snapshots/snapshots.js' && bulk ? { ...patch, anchors: patch.anchors.filter(([name]) => !legacyOnly.has(name)) } : patch);
  if (bulk) {
    selectedPatches.push(bulkPatch);
    for (const [path, counters] of [
      ['dist/addons/phrases/store.js', 'retainedEntries, textCodeUnits'],
      ['dist/addons/positions/store.js', 'retainedEntries, occurrenceCount, offsetCount, termEntries, termCodeUnits'],
    ]) selectedPatches.push({ path, anchors: [['unsealed-sidecar', 'revision = context.revision;', `revision = context.revision; rx7()?.sidecar({ kind: old.kind, revision, records: stage.size, ${counters}, sealed: false });`]] });
  }
  selectedPatches.push(workerOwnerPatch);
  // Preflight every additional source anchor before generic instrumentation.
  for (const patch of selectedPatches) { const source = await readFile(resolve(root, patch.path), 'utf8'); for (const [name, from, , expected = 1] of patch.anchors) assert.equal(source.split(from).length - 1, expected, `Restore diagnostic anchor drift: ${patch.path} ${name}`); }
  const generic = await instrumentPackage(root), staged = [];
  for (const patch of selectedPatches) {
    const path = resolve(root, patch.path), original = await readFile(path, 'utf8'); let changed = original;
    for (const [name, from, to, expected = 1] of patch.anchors) { assert.equal(changed.split(from).length - 1, expected, `Restore anchor drift after generic instrumentation: ${name}`); changed = changed.replaceAll(from, to); }
    changed = prelude + changed; staged.push({ path, changed, report: { path: patch.path, beforeSha256: digest(original), instrumentedSha256: digest(changed), anchors: patch.anchors.map(([name]) => name) } });
  }
  for (const file of staged) await writeFile(file.path, file.changed);
  return { version: 'rx8008-paired-restore-diagnostic-v1', generic, patches: staged.map(file => file.report), scope: 'Diagnostic-only disposable copy; actual yielded work and sampled process memory, no complete peak or retained-heap claim.' };
}
