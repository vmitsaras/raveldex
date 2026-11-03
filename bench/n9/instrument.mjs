// Diagnostic-only source transform of a disposable installed-package copy.
// No production source/public API changes and no observer in normal timing runs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const diagnosticKey = Symbol.for('raveldex.n9.diagnostics');
const digest = value => createHash('sha256').update(value).digest('hex');
const prelude = `// RX-8002 diagnostic-only observer; never used for normal timing.\nconst n9Count = (name, units = 1) => { const d = globalThis[Symbol.for('raveldex.n9.diagnostics')]; if (d) d[name] += units; };\n`;
const patches = [
  { path: 'dist/core/query/search.js', anchors: [
    ['candidate-loop', 'for (const [id, doc] of directoryEntries(root.documents)) {', 'for (const [id, doc] of directoryEntries(root.documents)) {\n        n9Count(\'candidates\');'],
    ['evaluation-call', 'const qualified = yield* evaluate(compiled.node, doc, expansions, charge, facts, \'query\', extensions?.leaves);', 'n9Count(\'documentsEvaluated\');\n        const qualified = yield* evaluate(compiled.node, doc, expansions, charge, facts, \'query\', extensions?.leaves);'],
  ] },
  { path: 'dist/core/ranking/bm25.js', anchors: [
    ['scorer-entry', 'export function* scoreDocument(root, doc, participating, expansions, charge, facts) {', 'export function* scoreDocument(root, doc, participating, expansions, charge, facts) {\n    n9Count(\'documentsScored\');'],
  ] },
  { path: 'dist/core/retrieval/expand.js', anchors: [
    ['exact-probe', 'const entry = directoryGet(field.terms, variant.term);', 'n9Count(\'exactDictionaryProbes\');\n                    const entry = directoryGet(field.terms, variant.term);'],
    ['prefix-term', 'for (const [term, entry] of directoryEntries(field.terms)) {', 'for (const [term, entry] of directoryEntries(field.terms)) {\n                        n9Count(\'prefixDictionaryVisits\');'],
    ['posting-entry', 'for (const [id, tf] of directoryEntries(entry.postings)) {', 'for (const [id, tf] of directoryEntries(entry.postings)) {\n                    n9Count(\'postingsVisited\');'],
  ] },
  { path: 'dist/core/execution/engine.js', anchors: [
    ['phase-check', 'check(op, phase) {', `check(op, phase) {\n        const n9 = globalThis[Symbol.for('raveldex.n9.diagnostics')];\n        if (n9 && phase?.startsWith('snapshot.')) {\n            n9.restorePhase = phase;\n            const row = n9.restorePhases[phase] ??= { checks: 0, emittedSteps: 0, emittedWorkUnits: 0 };\n            row.checks++;\n        }`],
    ['emitted-step', 'consumed += step.value.workUnits;', `consumed += step.value.workUnits;\n                        const n9 = globalThis[Symbol.for('raveldex.n9.diagnostics')];\n                        if (n9) {\n                            n9.emittedSteps++; n9.emittedWorkUnits += step.value.workUnits;\n                            n9.maxStepWorkUnits = Math.max(n9.maxStepWorkUnits, step.value.workUnits);\n                            if (n9.restorePhase) { const row = n9.restorePhases[n9.restorePhase]; row.emittedSteps++; row.emittedWorkUnits += step.value.workUnits; }\n                        }`],
    ['continuation-callback', 'op.resume = this.#host.schedule(() => { op.resume = undefined; this.pump(); }, 0);', 'n9Count(\'continuationsScheduled\');\n                            op.resume = this.#host.schedule(() => { n9Count(\'hostYields\'); op.resume = undefined; this.pump(); }, 0);'],
    // Both deadline scheduling sites are deliberately counted by identical token,
    // including early timer rearming; resume callbacks have a distinct anchor.
    ['deadline-callback', '() => { op.timer = undefined; this.stop(op); }', '() => { n9Count(\'deadlineCallbacks\'); op.timer = undefined; this.stop(op); }', 2],
  ] },
];

/** Validate every anchor before writing any file. Re-running or source drift is
 * a hard failure. Caller must supply a fresh disposable package copy. */
export async function instrumentPackage(packageRoot) {
  const directory = await realpath(packageRoot);
  const repository = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
  assert.notEqual(directory, repository, 'Refusing to instrument repository build output');
  const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  assert.equal(metadata.name, '@vmitsaras/raveldex');
  const search = await readFile(resolve(directory, 'dist/core/query/search.js'), 'utf8');
  const bounded = search.includes('for (const [id, doc] of documents) {');
  const staged = [];
  for (const patch of patches) {
    const path = resolve(directory, patch.path), original = await readFile(path, 'utf8');
    const anchors = patch.path === 'dist/core/query/search.js' && bounded ? [
      ['candidate-loop', 'const candidate = !bound || bound.has(id);', 'const candidate = !bound || bound.has(id);\n        if (candidate) n9Count(\'candidates\');'],
      ...patch.anchors.slice(1),
    ] : patch.anchors;
    let changed = original;
    for (const [name, from, to, occurrences = 1] of anchors) {
      assert.equal(changed.split(from).length - 1, occurrences, `Instrumentation anchor drift: ${patch.path} ${name}`);
      changed = changed.split(from).join(to);
    }
    changed = prelude + changed;
    staged.push({ path, original, changed, report: { path: patch.path, originalSha256: digest(original), instrumentedSha256: digest(changed),
      anchors: anchors.map(([name, , , occurrences = 1]) => ({ name, occurrences })) } });
  }
  for (const file of staged) await writeFile(file.path, file.changed);
  return { version: 'rx8003-private-observer-v2', candidateProfile: bounded ? 'postings-bound' : 'document-universe', patches: staged.map(file => file.report) };
}

export async function collectDiagnostics(call) {
  assert.equal(globalThis[diagnosticKey], undefined, 'Diagnostic observations must be serial and non-nested');
  const counters = { candidates: 0, documentsEvaluated: 0, documentsScored: 0, exactDictionaryProbes: 0, prefixDictionaryVisits: 0,
    postingsVisited: 0, emittedSteps: 0, emittedWorkUnits: 0, maxStepWorkUnits: 0, hostYields: 0, continuationsScheduled: 0,
    deadlineCallbacks: 0, restorePhase: null, restorePhases: {} };
  globalThis[diagnosticKey] = counters;
  try { return { result: await call(), counters }; }
  catch (error) { return { error, counters }; }
  finally { delete globalThis[diagnosticKey]; }
}
