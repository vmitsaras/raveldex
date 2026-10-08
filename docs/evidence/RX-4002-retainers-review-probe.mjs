import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, symlink, link, rm, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { analyzeRetainerCuts } from '../../bench/memory/retainer-cuts.mjs';
import { assertUnprotectedOutput } from '../../bench/memory/retainer-output.mjs';

const root = resolve(import.meta.dirname, '../..'), baseline = '32f2a13';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async path => JSON.parse(await readFile(resolve(root, path)));
const groups = [], add = (name, detail) => groups.push({ name, status: 'Pass', detail });
let reusedHeapObservations;
const componentLabels = ['reverseDocuments', 'dictionaryPostingsStatistics', 'sourceOrPositions'];
const policyNames = ['recorded-nonweak-root-shortcuts', 'recorded-nonweak-all-shortcuts', 'recorded-key-only-ephemerons'];
const nodeTypes = ['object', 'hidden', 'synthetic', 'string', 'array', 'closure', 'native'];
const edgeTypes = ['weak', 'property', 'context', 'shortcut', 'internal', 'element', 'hidden'];
// Review-owned high-level graph and a different field/enum order from owner tests.
function fixture(backing = false, exported = false) {
  const specs = [
    ['synthetic', '', 0, [['shortcut', 'global', 1]]],
    ['object', 'global', 32, [['context', 'owner', 2], ['property', '__raveldexMemoryMarkers', 9], ['context', 'outside', 17]]],
    ['object', 'owner', 24, [['internal', 'root', 3]]],
    ['object', 'IndexRoot', 48, [['property', 'documents', 4], ['property', 'fields', 5], ['property', 'participants', 6], ['property', 'counts', 7], ['property', 'configuration', 8]]],
    ['object', 'documents', 40, [['property', 'shared', 11], ['property', 'cycle', 12], ['internal', 'private', 14]]],
    ['object', 'fields', 24, [['property', 'shared', 11]]], ['object', 'participants', 24, [['property', 'shared', 11]]],
    ['object', 'counts', 8, []], ['object', 'configuration', 16, []],
    ['object', 'markers', 32, [['property', 'reverseDocuments', 4], ['property', 'dictionaryPostingsStatistics', 5], ['property', 'sourceOrPositions', 6], ['property', 'indexRoot', 3]]],
    ['hidden', 'system / PropertyArray', 40, [['hidden', 0, 4], ['hidden', 1, 5], ['hidden', 2, 6], ['hidden', 3, 3]]],
    ['string', 'shared', 24, []], ['object', 'cycleA', 16, [['property', 'b', 13]]],
    ['object', 'cycleB', 24, [['property', 'a', 12]]], ['string', 'private', 64, []],
    ['object', 'key', 24, []], ['string', 'encoding', 32, []], ['object', 'outside', 24, []],
  ];
  if (backing) specs[9][3].push(['internal', 'properties', 10]);
  if (exported) { specs[9][3].push(['property', 'exportedString', 16]); specs[1][3].push(['property', 'encoding', 16]); }
  return specs;
}
function encode(specs) {
  const nf = ['id', 'edge_count', 'name', 'self_size', 'type'], ef = ['to_node', 'name_or_index', 'type'];
  const strings = [], intern = value => { let i = strings.indexOf(value); if (i < 0) { i = strings.length; strings.push(value); } return i; };
  const nodes = [], edges = [];
  specs.forEach(([type, name, size, links], i) => {
    nodes.push(1001 + 7 * i, links.length, intern(name), size, nodeTypes.indexOf(type));
    for (const [kind, name, target] of links) edges.push(target * nf.length, ['hidden', 'element'].includes(kind) ? name : intern(name), edgeTypes.indexOf(kind));
  });
  return { snapshot: { node_count: specs.length, edge_count: edges.length / 3, meta: { node_fields: nf,
    node_types: ['number', 'number', 'string', 'number', nodeTypes], edge_fields: ef, edge_types: ['node', 'string_or_number', edgeTypes] } }, nodes, edges, strings };
}
function decode(snapshot) {
  const m = snapshot.snapshot.meta, nf = m.node_fields, ef = m.edge_fields, nw = nf.length, ew = ef.length;
  const nt = m.node_types[nf.indexOf('type')], et = m.edge_types[ef.indexOf('type')], specs = [];
  let edgeAt = 0;
  for (let off = 0; off < snapshot.nodes.length; off += nw) {
    const at = field => snapshot.nodes[off + nf.indexOf(field)], links = [];
    for (let i = 0; i < at('edge_count'); i++) {
      const values = field => snapshot.edges[edgeAt + ef.indexOf(field)], kind = et[values('type')], key = values('name_or_index');
      links.push([kind, ['hidden', 'element'].includes(kind) ? key : snapshot.strings[key], values('to_node') / nw]); edgeAt += ew;
    }
    specs.push([nt[at('type')], snapshot.strings[at('name')], at('self_size'), links, at('id')]);
  }
  assert.equal(edgeAt, snapshot.edges.length); return specs;
}
// Independent Set/stack relation traversal; no owner parser, policy flags,
// queues, reachability, sums or reported cutNodes are used for expectations.
function reachable(specs, scaffolding, cuts, policy) {
  const blocked = new Set([...scaffolding, ...cuts]), seen = new Set(), stack = [0];
  while (stack.length) {
    const source = stack.pop(); if (seen.has(source) || blocked.has(source)) continue;
    seen.add(source);
    for (const [kind, label, target] of specs[source][3]) {
      if (kind === 'weak' || kind === 'shortcut' && source !== 0 && policy !== 1) continue;
      const table = typeof label === 'string' && label.includes(' / part of key (') ? /table @(\d+)\)/.exec(label) : undefined;
      if (policy === 2 && table && specs[source][4] === Number(table[1])) continue;
      if (!seen.has(target) && !blocked.has(target)) stack.push(target);
    }
  }
  return seen;
}
function describe(specs) {
  const markerLinks = [];
  specs.forEach((node, source) => node[3].forEach(([type, label, target]) => {
    if (type === 'property' && label === '__raveldexMemoryMarkers') markerLinks.push({ source, target });
  }));
  assert.equal(markerLinks.length, 1); const marker = markerLinks[0].target;
  const seeds = new Map(specs[marker][3].filter(([kind, key]) => kind === 'property' && key !== '__proto__').map(([, key, target]) => [key, target]));
  const scaffold = [marker];
  for (const [type, label, target] of specs[marker][3]) if (type === 'internal' && label === 'properties' && specs[target][3].some(([kind, , to]) => kind !== 'weak' && [...seeds.values()].includes(to))) scaffold.push(target);
  const roots = [];
  specs.forEach(([type, , , links], i) => {
    if (type === 'object' && ['documents', 'fields', 'counts', 'configuration', 'participants'].every(key => links.some(([kind, name]) => kind === 'property' && name === key))) roots.push(i);
  });
  return { marker, seeds, scaffold, roots };
}
function aggregate(specs, nodes) {
  const byType = {}; let selfSizeBytes = 0;
  for (const i of nodes) { const [type, , size] = specs[i], row = byType[type] ??= { nodes: 0, selfSizeBytes: 0 }; row.nodes++; row.selfSizeBytes += size; selfSizeBytes += size; }
  return { nodes: nodes.size, selfSizeBytes, byType };
}
let comparedCuts = 0;
function check(specs, actual) {
  const { seeds, scaffold, roots } = describe(specs);
  assert.deepEqual(actual.markerNeutralization.scaffoldNodes.map(row => row.ordinal), scaffold);
  assert.deepEqual(actual.seeds.map(row => [row.label, row.node.ordinal]), [...seeds]);
  assert.deepEqual(actual.indexRootShapeCandidates.map(row => row.ordinal), roots);
  for (let policy = 0; policy < 3; policy++) {
    const observed = actual.policies[policy]; assert.equal(observed.id, policyNames[policy]);
    const before = reachable(specs, scaffold, [], policy); assert.deepEqual(observed.baselineRootReachable, aggregate(specs, before));
    const effects = new Map(), expectedCuts = [...seeds].map(([name, i]) => [name, [i]]);
    expectedCuts.push(['selected-component-joint-cut', [...new Set(componentLabels.map(label => seeds.get(label)))]]);
    expectedCuts.push(...roots.map(i => [`index-root-shape-candidate-${specs[i][4]}`, [i]]), ['index-root-shape-candidates-joint-cut', roots]);
    const rows = [...observed.individualCuts, observed.selectedComponentJointCut, ...observed.rootShapeCandidateCuts]; assert.equal(rows.length, expectedCuts.length);
    for (const [label, cuts] of expectedCuts) {
      const row = rows.find(row => row.label === label); assert.ok(row); assert.deepEqual(row.cutNodes.map(node => node.ordinal), cuts);
      const after = reachable(specs, scaffold, cuts, policy), lost = new Set([...before].filter(i => !after.has(i))); effects.set(label, lost);
      const expected = aggregate(specs, lost); assert.equal(row.lostBaselineReachableNodes, expected.nodes);
      assert.equal(row.graphCutSelfSizeBytes, expected.selfSizeBytes); assert.deepEqual(row.byType, expected.byType); comparedCuts++;
    }
    const individual = componentLabels.map(label => effects.get(label)), union = new Set(individual.flatMap(set => [...set]));
    const shared = new Set([...union].filter(i => individual.filter(set => set.has(i)).length > 1));
    const jointOnly = new Set([...effects.get('selected-component-joint-cut')].filter(i => !union.has(i)));
    assert.deepEqual(observed.individualComponentCutEffectUnion, aggregate(specs, union));
    assert.deepEqual(observed.sharedIndividualComponentCutEffects, aggregate(specs, shared));
    assert.deepEqual(observed.additionalJointCutEffect, aggregate(specs, jointOnly));
  }
}
const literal = fixture(true, true), literalDump = encode(literal), literalSpecs = decode(literalDump), result = analyzeRetainerCuts(literalDump);
check(literalSpecs, result);
const primary = result.policies[0], byLabel = name => primary.individualCuts.find(row => row.label === name).graphCutSelfSizeBytes;
assert.equal(byLabel('reverseDocuments'), 144); assert.equal(byLabel('dictionaryPostingsStatistics'), 24);
assert.equal(byLabel('sourceOrPositions'), 24); assert.equal(byLabel('indexRoot'), 288);
assert.equal(primary.selectedComponentJointCut.graphCutSelfSizeBytes, 216); assert.equal(primary.additionalJointCutEffect.selfSizeBytes, 24);
const alias = fixture(true); alias[17][3].push(['property', 'seedAlias', 4]);
const aliasDump = encode(alias); check(decode(aliasDump), analyzeRetainerCuts(aliasDump));
const released = structuredClone(alias); released[3][3] = released[3][3].filter(([, name]) => name !== 'documents');
assert.ok(reachable(decode(encode(released)), [9, 10], [], 0).has(4));
const aliasedComponents = fixture();
aliasedComponents[3][3].find(([, name]) => name === 'fields')[2] = 4;
aliasedComponents[9][3].find(([, name]) => name === 'dictionaryPostingsStatistics')[2] = 4;
const aliasedDump = encode(aliasedComponents); check(decode(aliasedDump), analyzeRetainerCuts(aliasedDump));
for (const kind of edgeTypes) {
  const outside = fixture(true); outside[17][3].push([kind, ['hidden', 'element'].includes(kind) ? 0 : 'outsidePrivate', 14]);
  const dump = encode(outside); check(decode(dump), analyzeRetainerCuts(dump));
}
add('Independent literal cuts, three-way sharing, cycles, every outside edge and owner-release distinction', { manualPrimaryBytes: { reverse: 144, dictionary: 24, participant: 24, root: 288, joint: 216 }, ownerEdgeReleaseKeepsAliasedSeed: true });

let randomState = 8191;
const random = n => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) % n; };
for (let example = 0; example < 64; example++) {
  const specs = fixture(example % 2 === 0, example % 4 === 0), start = specs.length;
  for (let i = 0; i < 9; i++) specs.push([['object', 'hidden', 'array', 'closure', 'native'][random(5)], `generated-${i}`, random(150), []]);
  for (let i = 0; i < 70; i++) {
    const source = [1, 2, 3, 4, 5, 6, 17, ...Array.from({ length: 9 }, (_, n) => start + n)][random(16)];
    const target = [4, 5, 6, 11, 12, 13, 14, ...Array.from({ length: 9 }, (_, n) => start + n)][random(16)], kind = edgeTypes[random(7)];
    specs[source][3].push([kind, ['hidden', 'element'].includes(kind) ? i : `edge-${i}`, target]);
  }
  const snapshot = encode(specs); check(decode(snapshot), analyzeRetainerCuts(snapshot));
}
const ephemeron = fixture(); ephemeron[1][3].push(['property', 'keyTable', 17]); ephemeron[4][3].push(['property', 'key', 15]);
const pairName = i => `${i} / part of key (Object @${1001 + 7 * 15}) -> value (String @${1001 + 7 * 14}) pair in WeakMap (table @${1001 + 7 * 17})`;
ephemeron[17][3].push(['internal', pairName(3), 14], ['weak', 'weakKey', 15]); ephemeron[15][3].push(['internal', pairName(4), 14]);
check(decode(encode(ephemeron)), analyzeRetainerCuts(encode(ephemeron)));
add('Separate generated-topology removal oracle and labelled ephemeron sensitivity', { generatedGraphs: 64, policyVariants: 3, comparedCuts, collectorLivenessNotInferred: true });

const bad = [], base = encode(fixture(true, true));
bad.push(['missing marker', s => { const specs = fixture(); specs[1][3] = specs[1][3].filter(([, key]) => key !== '__raveldexMemoryMarkers'); return encode(specs); }]);
bad.push(['missing seed', s => { const specs = fixture(); specs[9][3].pop(); return encode(specs); }]);
bad.push(['unreachable seed', s => { const specs = fixture(); specs[2][3] = []; return encode(specs); }]);
bad.push(['outside backing alias', s => { const specs = fixture(true); specs[17][3].push(['hidden', 0, 10]); return encode(specs); }]);
bad.push(['component marker mismatch', s => { const specs = fixture(); specs[9][3][0][2] = 7; return encode(specs); }]);
bad.push(['non-string export', s => { const specs = fixture(false, true); specs[16][0] = 'object'; return encode(specs); }]);
bad.push(['incomplete ephemeron pair', s => { const specs = structuredClone(ephemeron); specs[15][3] = []; return encode(specs); }]);
bad.push(['malformed ephemeron label', s => { const specs = structuredClone(ephemeron); specs[15][3][0][1] = '4 / part of key (unknown)'; return encode(specs); }]);
bad.push(['ephemeron wrong value target', s => { const specs = structuredClone(ephemeron); specs[15][3][0][2] = 11; return encode(specs); }]);
for (const [name, mutate] of [
  ['type schema', s => { s.snapshot.meta.node_types[4].push('unknown'); }], ['descriptor schema', s => { s.snapshot.meta.node_types[3] = 'string'; }],
  ['edge descriptor', s => { s.snapshot.meta.edge_types[0] = 'number'; }], ['duplicate field', s => { s.snapshot.meta.node_fields[2] = 'id'; }],
  ['negative size', s => { s.nodes[3] = -1; }], ['fraction size', s => { s.nodes[3] = 0.5; }], ['unsafe id', s => { s.nodes[0] = 2 ** 53; }],
  ['duplicate id', s => { s.nodes[5] = s.nodes[0]; }], ['count mismatch', s => { s.snapshot.edge_count++; }],
  ['unaligned target', s => { s.edges[0]++; }], ['out of range name', s => { s.nodes[2] = s.strings.length; }],
  ['unknown edge', s => { s.edges[2] = 7; }], ['incomplete count', s => { s.nodes[1]--; }], ['non-string table', s => { s.strings[0] = 17; }],
]) bad.push([name, s => { mutate(s); return s; }]);
for (const [name, mutate] of bad) assert.throws(() => analyzeRetainerCuts(mutate(structuredClone(base))), assert.AssertionError, name);
const zero = fixture(); zero[6][2] = 0; const zeroResult = analyzeRetainerCuts(encode(zero));
assert.equal(zeroResult.policies[0].individualCuts.find(row => row.label === 'sourceOrPositions').graphCutSelfSizeBytes, 0);
add('Contradictory schema/marker/export and missing/unreachable failures versus a genuine zero', { rejectedInputs: bad.length, genuineZeroSelfSizeAccepted: true });

const scratch = await mkdtemp('/private/tmp/RX-4002-retainers-review-');
try {
  const protectedFile = resolve(scratch, 'frozen.json'), second = resolve(scratch, 'second.mjs');
  await writeFile(protectedFile, 'original-evidence'); await writeFile(second, 'original-source'); await mkdir(resolve(scratch, 'child'));
  await symlink(protectedFile, resolve(scratch, 'symbolic.json')); await symlink(scratch, resolve(scratch, 'directory-alias'));
  await link(second, resolve(scratch, 'hardlinked.mjs')); await symlink(resolve(scratch, 'absent'), resolve(scratch, 'dangling.json'));
  const forbidden = [protectedFile, `${scratch}/child/../frozen.json`, resolve(scratch, 'symbolic.json'),
    resolve(scratch, 'directory-alias/frozen.json'), resolve(scratch, 'hardlinked.mjs'), second];
  for (const output of forbidden) await assert.rejects(assertUnprotectedOutput(output, [protectedFile, second]), /Output aliases protected|Output hardlinks protected/);
  await assert.rejects(assertUnprotectedOutput(resolve(scratch, 'dangling.json'), [protectedFile]), /Dangling output symlink/);
  await assert.rejects(assertUnprotectedOutput(resolve(scratch, 'child'), [protectedFile]), /regular file/);
  const allowed = await assertUnprotectedOutput(resolve(scratch, 'directory-alias/new.json'), [protectedFile, second]);
  assert.equal(allowed.canonicalOutput, resolve(scratch, 'new.json'));
  assert.equal(await readFile(protectedFile, 'utf8'), 'original-evidence'); assert.equal(await readFile(second, 'utf8'), 'original-source');
} finally { await rm(scratch, { recursive: true, force: true }); }
add('Independent scratch-only canonical/symlink/hardlink output-preservation guard', { forbiddenOutputs: 8, allowedNewOutput: true, originalEvidenceSourcesAndDumpsNeverUsedAsProbeOutputs: true });

const raw = await read('docs/evidence/RX-4002-memory.json'), retained = await read('docs/evidence/RX-4002-memory-retainers.json');
assert.equal(retained.outcome, 'Pass'); assert.equal(retained.analyzedOriginalSnapshots, 16); assert.equal(retained.workloadReruns, 0);
assert.equal(hash(await readFile(resolve(root, retained.rawSource.path))), retained.rawSource.sha256);
assert.equal(retained.invocation.input, retained.rawSource.path);
assert.equal(retained.invocation.output, 'docs/evidence/RX-4002-memory-retainers.json');
assert.equal(retained.invocation.argv.length, 2);
assert.equal(await realpath(retained.invocation.argv[1]), await realpath(resolve(root, 'bench/memory/analyse-retainers.mjs')));
assert.deepEqual(retained.invocation.nodeExecArgv, []);
assert.equal(retained.invocation.outputProtection.requestedOutput, retained.invocation.output);
assert.equal(retained.invocation.outputProtection.canonicalOutput, await realpath(resolve(root, retained.invocation.output)));
const protectedOriginalPaths = [...new Set([retained.rawSource.path, ...retained.preservedOriginalArtifacts.map(row => row.path),
  ...(await readdir(resolve(root, 'bench/memory'))).filter(name => name.endsWith('.mjs')).map(name => `bench/memory/${name}`),
  ...raw.graphObservations.flatMap(row => row.graphs.map(graph => graph.path))])];
assert.equal(protectedOriginalPaths.length, 42); assert.equal(retained.invocation.outputProtection.protectedFilesChecked, protectedOriginalPaths.length);
const pendingBindings = [];
for (const source of retained.sourceBindings) {
  const current = hash(await readFile(resolve(root, source.path)));
  if (current !== source.sha256) {
    assert.ok(process.argv.includes('--pending-bindings') && source.path !== 'bench/memory/retainer-cuts.mjs', 'Final source binding mismatch');
    pendingBindings.push({ path: source.path, recordedSha256: source.sha256, currentSha256: current });
  }
}
const baselineEvidencePaths = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, '--', 'docs/evidence'], { cwd: root, encoding: 'utf8' }).trim().split('\n'));
let baselineArtifactComparisons = 0;
for (const source of retained.preservedOriginalArtifacts) {
  const current = await readFile(resolve(root, source.path)); assert.equal(hash(current), source.sha256);
  if (baselineEvidencePaths.has(source.path)) {
    assert.deepEqual(current, execFileSync('git', ['show', `${baseline}:${source.path}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })); baselineArtifactComparisons++;
  }
}
assert.equal(baselineArtifactComparisons, 14);
const manifest = await read('docs/planning/roadmap.json'), priorManifest = JSON.parse(execFileSync('git', ['show', `${baseline}:docs/planning/roadmap.json`], { cwd: root, encoding: 'utf8' }));
assert.deepEqual(manifest.tasks.filter(row => row.id !== 'RX-4002'), priorManifest.tasks.filter(row => row.id !== 'RX-4002'));
assert.deepEqual(manifest.tasks.find(row => row.id === 'RX-4002').acceptanceCriteria, priorManifest.tasks.find(row => row.id === 'RX-4002').acceptanceCriteria);
assert.equal(execFileSync('git', ['diff', baseline, '--', 'src', 'package-lock.json'], { cwd: root, encoding: 'utf8' }), '');
for (const row of retained.graphObservations) for (const graph of row.graphs) {
  const old = raw.graphObservations.find(o => o.mode === row.mode && o.size === row.size).graphs.find(o => o.phase === graph.phase);
  assert.equal(graph.sha256, old.sha256); assert.equal(graph.fileBytes, old.fileBytes); assert.deepEqual(graph.schema, old.schema);
  for (const policy of graph.policies) for (const effect of [...policy.individualCuts, policy.selectedComponentJointCut, ...policy.rootShapeCandidateCuts]) {
    assert.equal(Object.values(effect.byType).reduce((sum, row) => sum + row.selfSizeBytes, 0), effect.graphCutSelfSizeBytes);
    assert.equal(Object.values(effect.byType).reduce((sum, row) => sum + row.nodes, 0), effect.lostBaselineReachableNodes);
  }
}
add('Original report/dump/source provenance, immutable previous artifacts and unchanged criteria/runtime', { baseline, recordedDumps: 16, oldArtifactsByteComparedToCommit: baselineArtifactComparisons,
  allPreservedArtifactsHashed: retained.preservedOriginalArtifacts.length, invocationAndCanonicalOutputChecked: true, protectedOriginalSourceAndDumpPaths: protectedOriginalPaths.length,
  sourceBindings: retained.sourceBindings });

const method = (await readFile(resolve(root, 'docs/evaluation/RX-4002-memory-method.md'), 'utf8')).split('## Offline recorded-graph cuts')[1].split('## Outstanding qualification')[0];
const tableRows = method.split('\n').filter(line => /^\| (Core|Source phrases|Positions \+ offsets) \/ /.test(line)).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
assert.equal(tableRows.length, 6);
for (const row of retained.graphObservations) {
  const name = `${{ 'core-only': 'Core', 'source-phrase': 'Source phrases', 'positions-offsets': 'Positions + offsets' }[row.mode]} / ${row.size.toLocaleString('en-US')}`;
  const cells = tableRows.find(cells => cells[0] === name); assert.ok(cells); const built = row.graphs.find(graph => graph.phase === 'built').policies[0];
  const expected = [...componentLabels.map(label => built.individualCuts.find(cut => cut.label === label).graphCutSelfSizeBytes), built.selectedComponentJointCut.graphCutSelfSizeBytes];
  assert.deepEqual(cells.slice(1).map(cell => Number(cell.replaceAll(',', ''))), expected);
  for (const graph of row.graphs) {
    assert.equal(graph.markerNeutralization.scaffoldNodes.length, 1);
    for (const policy of graph.policies.slice(1)) {
      assert.deepEqual(policy.individualCuts, graph.policies[0].individualCuts);
      assert.deepEqual(policy.rootShapeCandidateCuts, graph.policies[0].rootShapeCandidateCuts);
      assert.deepEqual(policy.selectedComponentJointCut, graph.policies[0].selectedComponentJointCut);
    }
    if (graph.phase === 'mutation-precommit') {
      assert.equal(graph.indexRootShapeCandidates.length, 3);
      assert.equal(graph.policies[0].selectedComponentJointCut.graphCutSelfSizeBytes, row.size === 1000 ? 13544 : 14888);
    }
  }
}
assert.match(method, /13,544[\s\S]*14,888/);
add('Printed graph-cut table and checkpoint/policy claims reconciled to raw observations', { numericTableCells: 24, rows: 6, snapshotsWithEqualReportedCutEffectsAcrossThreePolicies: 16, precommitJointBytes: { 1000: 13544, 10000: 14888 }, noStagePeakOrCollectorInference: true });

const packageAudit = await read('docs/evidence/RX-4002-retainers-package-audit.json');
const packaged = await read('docs/evidence/RX-4002-retainers-package.json');
const primaryPackage = await read('docs/evidence/RX-4002-package.json');
const acceptedBrowser = await read('docs/evidence/RX-4002-browsers-accepted.json');
const metadata = await read('package.json'), oldMetadata = JSON.parse(execFileSync('git', ['show', `${baseline}:package.json`], { cwd: root, encoding: 'utf8' }));
const fixedMetadataKeys = ['name', 'version', 'private', 'exports', 'types', 'sideEffects', 'files', 'engines', 'devDependencies'];
for (const key of fixedMetadataKeys) assert.deepEqual(metadata[key], oldMetadata[key], key);
assert.deepEqual(metadata.dependencies ?? {}, {});
const observedConsumers = [primaryPackage.consumer, packaged.consumer, raw.consumer];
for (const source of acceptedBrowser.sourceReports) {
  const bytes = await readFile(resolve(root, source.path)); assert.equal(hash(bytes), source.sha256);
  const observation = JSON.parse(bytes); assert.equal(observation.package.installedDirectory, source.installedDirectory);
  assert.equal(observation.package.package.sha256, source.packageSha256); observedConsumers.push(source.installedDirectory);
}
assert.deepEqual([...new Set(observedConsumers)], packageAudit.consumers);
assert.equal(packageAudit.consumers.length, 7); assert.equal(packageAudit.productionFiles.length, 208);
async function relativeFiles(directory, prefix = '') {
  const paths = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) paths.push(...await relativeFiles(directory, path));
    else { assert.ok(entry.isFile()); paths.push(path); }
  }
  return paths.sort();
}
const expectedPaths = packageAudit.productionFiles.map(row => row.path).sort();
assert.deepEqual((await relativeFiles(join(root, 'dist'))).map(path => `dist/${path}`), expectedPaths);
for (const directory of packageAudit.consumers) {
  const installed = join(directory, 'node_modules/@vmitsaras/raveldex'); assert.equal(await realpath(installed), installed);
  assert.deepEqual((await relativeFiles(join(installed, 'dist'))).map(path => `dist/${path}`), expectedPaths);
  const installedMetadata = JSON.parse(await readFile(join(installed, 'package.json')));
  for (const key of fixedMetadataKeys) assert.deepEqual(installedMetadata[key], metadata[key], key);
  assert.deepEqual(installedMetadata.dependencies ?? {}, {});
  for (const file of packageAudit.productionFiles) {
    const bytes = await readFile(join(installed, file.path)); assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256);
    assert.deepEqual(bytes, await readFile(join(root, file.path)));
  }
}
const freshInstalled = join(packaged.consumer, 'node_modules/@vmitsaras/raveldex');
assert.deepEqual(JSON.parse(await readFile(join(freshInstalled, 'package.json'))), metadata);
for (const file of ['README.md', 'LICENSE']) assert.deepEqual(await readFile(join(freshInstalled, file)), await readFile(join(root, file)));
const tarball = await readFile(join(packaged.consumer, 'vmitsaras-raveldex-0.0.0.tgz'));
assert.equal(hash(tarball), packaged.package.sha256); assert.equal(tarball.length, packaged.package.tarballBytes);
for (const [path, digest, size] of [['core-bundle.mjs', packaged.core.sha256, packaged.core.minifiedBytes], ['core-bundle.mjs.gz', packaged.core.gzipSha256, packaged.core.gzipBytes]]) {
  const bytes = await readFile(join(packaged.consumer, path)); assert.equal(hash(bytes), digest); assert.equal(bytes.length, size);
}
assert.equal(packaged.core.sha256, primaryPackage.core.sha256); assert.equal(packaged.core.gzipSha256, primaryPackage.core.gzipSha256);
assert.equal(packaged.core.gzipBytes, 16829); assert.equal(packaged.core.targetGzipBytes, 15360); assert.equal(packaged.core.targetMet, false);
assert.deepEqual(packaged.startup, { specifier: '@vmitsaras/raveldex', reads: [], exports: ['ERROR_CODES', 'RaveldexError', 'createRaveldex'] });
assert.ok(packaged.core.inputs.every(input => input.path === 'core-entry.mjs' || /^node_modules\/@vmitsaras\/raveldex\/dist\/(core\/|index\.js$)/.test(input.path)));
add('Independent fresh/recorded package identity and unchanged public contracts', { distinctInstalledDirectories: 7, productionFilesPerDirectory: 208, comparedInstalledProductionFiles: 1456,
  sourceReportBindings: acceptedBrowser.sourceReports.length, freshPackageSha256: packaged.package.sha256, fixedCoreSha256: packaged.core.sha256,
  gzipBytes: 16829, targetGzipBytes: 15360, targetMet: false, startupObservationReusedFromFreshPackageReport: true,
  packageAudit: { path: 'docs/evidence/RX-4002-retainers-package-audit.json', sha256: hash(await readFile(resolve(root, 'docs/evidence/RX-4002-retainers-package-audit.json'))) },
  packageReport: { path: 'docs/evidence/RX-4002-retainers-package.json', sha256: hash(await readFile(resolve(root, 'docs/evidence/RX-4002-retainers-package.json'))) }, noResourceOrStartupRerun: true });

const fullCheckPath = 'docs/evidence/RX-4002-retainers-final-check.log';
const checkLogBytes = await readFile(resolve(root, fullCheckPath)), checkLog = checkLogBytes.toString('utf8');
const phaseValues = key => [...checkLog.matchAll(new RegExp(`^ℹ ${key} (\\d+)$`, 'gm'))].map(match => Number(match[1]));
assert.deepEqual(phaseValues('tests'), [491, 15, 24, 26, 1]); assert.deepEqual(phaseValues('pass'), [491, 15, 24, 26, 1]);
for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.deepEqual(phaseValues(key), [0, 0, 0, 0, 0]);
assert.equal(manifest.tasks.find(row => row.id === 'RX-4002').status, 'blocked');
assert.equal(manifest.tasks.find(row => row.id === 'RX-4003').status, 'planned');
assert.equal(manifest.tasks.filter(row => row.status === 'done').length, 19);
for (const path of manifest.tasks.find(row => row.id === 'RX-4002').evidence) assert.ok((await readFile(resolve(root, path))).length > 0, path);
add('Final completed check-log and existing-evidence planner reconciliation', { checkLog: { path: fullCheckPath, sha256: hash(checkLogBytes) },
  phases: [491, 15, 24, 26, 1], passedTests: 557, failures: 0, cancelled: 0, skipped: 0,
  processExitCodeConfirmedSeparatelyByParent: 0, doneReleaseTasks: 19, rx4002: 'blocked', rx4003: 'planned/waiting', noCriterionWaiver: true });

if (process.argv.includes('--heaps')) {
  for (const [mode, size, phase] of [['core-only', 1000, 'built'], ['source-phrase', 1000, 'built'],
    ['positions-offsets', 1000, 'mutation-precommit'], ['source-phrase', 1000, 'serialization-string-held'], ['positions-offsets', 10000, 'built']]) {
    const graph = retained.graphObservations.find(row => row.mode === mode && row.size === size).graphs.find(row => row.phase === phase);
    const bytes = await readFile(graph.path); assert.equal(hash(bytes), graph.sha256); assert.equal(bytes.length, graph.fileBytes);
    const specs = decode(JSON.parse(bytes)), oldCount = comparedCuts; check(specs, graph);
    add(`Independent actual whole-recorded-graph oracle: ${mode}/${size}/${phase}`, { dumpSha256: graph.sha256, fileBytes: bytes.length,
      nodes: specs.length, comparedCuts: comparedCuts - oldCount, neutralizedNodes: graph.markerNeutralization.scaffoldNodes.length,
      indexRootShapeCandidates: graph.indexRootShapeCandidates.length, primaryJointCutBytes: graph.policies[0].selectedComponentJointCut.graphCutSelfSizeBytes });
    console.log(JSON.stringify({ mode, size, phase, outcome: 'Pass' }));
  }
} else if (process.argv.includes('--reuse-heaps')) {
  const previous = await read('docs/evidence/RX-4002-retainers-review-probe.json');
  assert.equal(previous.outcome, 'Pass'); assert.deepEqual(previous.pendingBindings, []);
  assert.equal(previous.retainedArtifact.sha256, hash(await readFile(resolve(root, previous.retainedArtifact.path))));
  assert.equal(previous.analyzer.sha256, hash(await readFile(resolve(root, previous.analyzer.path))));
  const actualGroups = previous.groups.filter(group => group.name.startsWith('Independent actual whole-recorded-graph oracle:'));
  assert.equal(actualGroups.length, 5);
  for (const group of actualGroups) { assert.equal(group.status, 'Pass'); groups.push(group); }
  reusedHeapObservations = { recordedAt: previous.reusedHeapObservations?.recordedAt ?? previous.recordedAt,
    executedProbeSha256: previous.reusedHeapObservations?.executedProbeSha256 ?? previous.probeSha256,
    method: 'Prior direct five-heap oracle observations reused only for the identical frozen artifact/analyzer. This reconciliation does not reread heap files.' };
}
const report = { kind: 'rx4002-retainers-independent-probe-v1', recordedAt: new Date().toISOString(), baseline,
  outcome: pendingBindings.length ? 'Pending source rebind' : 'Pass',
  scope: 'Independent literal/generated node-removal oracle, schema failures and provenance; optional existing-heap reads only. No native workload, browser/AT/device run or GC-retention/peak claim.',
  retainedArtifact: { path: 'docs/evidence/RX-4002-memory-retainers.json', sha256: hash(await readFile(resolve(root, 'docs/evidence/RX-4002-memory-retainers.json'))) },
  analyzer: { path: 'bench/memory/retainer-cuts.mjs', sha256: hash(await readFile(resolve(root, 'bench/memory/retainer-cuts.mjs'))) },
  probeSha256: hash(await readFile(import.meta.filename)), reusedHeapObservations, pendingBindings, groups };
await writeFile(resolve(root, 'docs/evidence/RX-4002-retainers-review-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ groups: groups.length, comparedCuts, outcome: pendingBindings.length ? 'Pending source rebind' : 'Pass' }));
