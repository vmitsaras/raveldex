import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, mkdir, symlink, link, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeRetainerCuts } from './retainer-cuts.mjs';
import { assertUnprotectedOutput } from './retainer-output.mjs';

function fixture({ backing = false, outside, ephemeron = false } = {}) {
  const specs = [
    ['synthetic', '', 0, [['shortcut', 'global', 1]]],
    ['object', 'global', 16, [['property', 'owner', 2], ['property', '__raveldexMemoryMarkers', 3]]],
    ['object', 'owner', 24, [['property', '#root', 4]]],
    ['object', 'marker', 32, [['property', 'reverseDocuments', 5], ['property', 'dictionaryPostingsStatistics', 6], ['property', 'sourceOrPositions', 7], ['property', 'indexRoot', 4]]],
    ['object', 'IndexRoot', 48, [['property', 'documents', 5], ['property', 'fields', 6], ['property', 'participants', 7], ['property', 'counts', 8], ['property', 'configuration', 9]]],
    ['object', 'documents', 40, [['property', 'shared', 10], ['internal', 'properties', 11], ['property', 'cycle', 12]]],
    ['object', 'dictionary', 24, [['property', 'shared', 10]]],
    ['object', 'side', 24, [['property', 'shared', 10]]],
    ['object', 'counts', 16, []], ['object', 'configuration', 24, []], ['string', 'shared', 24, []],
    ['array', 'properties', 32, [['internal', '0', 13]]], ['object', 'cycle', 16, [['property', 'back', 5]]],
    ['string', 'private', 64, []], ['hidden', 'system / PropertyArray', 40, [['hidden', 0, 5], ['hidden', 1, 6], ['hidden', 2, 7], ['hidden', 3, 4]]],
    ['object', 'outside', 24, []], ['object', 'key', 24, []],
  ];
  if (backing) specs[3][3].push(['internal', 'properties', 14]);
  if (outside) { specs[1][3].push(['context', 'outside', 15]); specs[15][3].push([outside, ['hidden', 'element'].includes(outside) ? 0 : 'alias', 13]); }
  if (ephemeron) {
    specs[1][3].push(['property', 'table', 15]); specs[5][3].push(['property', 'key', 16]);
    specs[15][3].push(['weak', 'key', 16], ['weak', 'value', 13], ['internal', '3 / part of key (Object @116) -> value (String @113) pair in WeakMap (table @115)', 13]);
    specs[16][3].push(['internal', '4 / part of key (Object @116) -> value (String @113) pair in WeakMap (table @115)', 13]);
  }
  return { specs, snapshot: encode(specs) };
}
function encode(specs) {
  const nt = ['synthetic', 'object', 'array', 'string', 'hidden'], et = ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'];
  const strings = [], nodes = [], edges = [];
  const string = value => { let index = strings.indexOf(value); if (index < 0) { index = strings.length; strings.push(value); } return index; };
  specs.forEach(([type, name, size, links], node) => {
    nodes.push(nt.indexOf(type), string(name), 100 + node, size, links.length);
    for (const [kind, label, target] of links) edges.push(et.indexOf(kind), ['hidden', 'element'].includes(kind) ? Number(label) : string(label), target * 5);
  });
  return { snapshot: { meta: { node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'], node_types: [nt, 'string', 'number', 'number', 'number', 'number'],
    edge_fields: ['type', 'name_or_index', 'to_node'], edge_types: [et, 'string_or_number', 'node'] }, node_count: specs.length, edge_count: edges.length / 3 }, nodes, edges, strings };
}
const cut = (result, label, policy = 0) => result.policies[policy].individualCuts.find(row => row.label === label);

test('literal cycles and three-way sharing: individual effects are not summed as a joint effect', () => {
  const result = analyzeRetainerCuts(fixture().snapshot), primary = result.policies[0];
  assert.equal(cut(result, 'reverseDocuments').graphCutSelfSizeBytes, 152);
  assert.equal(cut(result, 'dictionaryPostingsStatistics').graphCutSelfSizeBytes, 24);
  assert.equal(cut(result, 'sourceOrPositions').graphCutSelfSizeBytes, 24);
  assert.equal(cut(result, 'indexRoot').graphCutSelfSizeBytes, 312);
  assert.equal(primary.individualComponentCutEffectUnion.selfSizeBytes, 200);
  assert.equal(primary.selectedComponentJointCut.graphCutSelfSizeBytes, 224);
  assert.equal(primary.additionalJointCutEffect.selfSizeBytes, 24);
  assert.equal(primary.sharedIndividualComponentCutEffects.selfSizeBytes, 0);
});
test('complete graph preserves an outside hidden/context path to a descendant', () => {
  const result = analyzeRetainerCuts(fixture({ outside: 'hidden' }).snapshot);
  assert.equal(cut(result, 'reverseDocuments').graphCutSelfSizeBytes, 88);
  assert.equal(result.policies[0].selectedComponentJointCut.graphCutSelfSizeBytes, 160);
});
test('hypothetical node deletion removes every seed alias, unlike releasing one owner property', () => {
  const { specs } = fixture(); specs[1][3].push(['property', 'outsideDocumentsAlias', 5]);
  const result = analyzeRetainerCuts(encode(specs));
  assert.equal(cut(result, 'reverseDocuments').graphCutSelfSizeBytes, 152);
  const ownerRelease = structuredClone(specs); ownerRelease[4][3] = ownerRelease[4][3].filter(([, name]) => name !== 'documents');
  assert.ok(referenceReachability(ownerRelease, [], 0, false).has(5), 'Outside alias preserves seed after one owner edge release');
});
test('marker-owned PropertyArray aliases are neutralized; unrelated outside paths survive', () => {
  const result = analyzeRetainerCuts(fixture({ backing: true, outside: 'hidden' }).snapshot);
  assert.deepEqual(result.markerNeutralization.scaffoldNodes.map(row => row.ordinal), [3, 14]);
  assert.equal(cut(result, 'reverseDocuments').graphCutSelfSizeBytes, 88);
});
test('ambiguous externally retained marker backing store fails rather than deleting that retainer', () => {
  const { specs } = fixture({ backing: true }); specs[1][3].push(['internal', 'outsideBacking', 14]);
  assert.throws(() => analyzeRetainerCuts(encode(specs)), /Outside retainer of observation backing store/);
});
test('weak edges never become strong; non-root shortcuts produce explicit sensitivity', () => {
  const weak = analyzeRetainerCuts(fixture({ outside: 'weak' }).snapshot);
  assert.equal(cut(weak, 'reverseDocuments').graphCutSelfSizeBytes, 152);
  const shortcuts = analyzeRetainerCuts(fixture({ outside: 'shortcut' }).snapshot);
  assert.equal(cut(shortcuts, 'reverseDocuments').graphCutSelfSizeBytes, 152);
  assert.equal(cut(shortcuts, 'reverseDocuments', 1).graphCutSelfSizeBytes, 88);
  assert.ok(shortcuts.policies.every(row => row.baselineRootReachable.nodes > 0), 'Root shortcut is traversed by every policy');
});
test('labelled ephemeron table/key edges change graph sensitivity without pretending conditional GC', () => {
  const result = analyzeRetainerCuts(fixture({ ephemeron: true }).snapshot);
  assert.equal(result.edgeSensitivity.recognizedEphemeronPairs, 1);
  assert.equal(cut(result, 'reverseDocuments').graphCutSelfSizeBytes, 112);
  assert.equal(cut(result, 'reverseDocuments', 2).graphCutSelfSizeBytes, 176);
  assert.match(result.edgeSensitivity.limitation, /do not implement the conditional/);
});
test('missing, duplicate, malformed and unreachable seeds fail with reasons, not invented zeros', () => {
  const missing = fixture(); missing.specs[3][3] = missing.specs[3][3].filter(([, label]) => label !== 'sourceOrPositions');
  assert.throws(() => analyzeRetainerCuts(encode(missing.specs)), /Missing marker seed/);
  const duplicate = fixture(); duplicate.specs[3][3].push(['property', 'reverseDocuments', 5]);
  assert.throws(() => analyzeRetainerCuts(encode(duplicate.specs)), /Duplicate marker seed/);
  const malformed = fixture(); malformed.specs[3][3][0][2] = 0;
  assert.throws(() => analyzeRetainerCuts(encode(malformed.specs)), /Malformed seed/);
  const unreachable = fixture(); unreachable.specs[2][3] = [];
  assert.throws(() => analyzeRetainerCuts(encode(unreachable.specs)), /Unreachable seed reverseDocuments/);
  const zero = fixture(); zero.specs[7][2] = 0;
  assert.equal(cut(analyzeRetainerCuts(encode(zero.specs)), 'sourceOrPositions').graphCutSelfSizeBytes, 0, 'Reachable zero-self-size cut is a real graph zero');
});
test('missing or ambiguous observation marker is an error', () => {
  const missing = fixture(); missing.specs[1][3] = missing.specs[1][3].filter(([, label]) => label !== '__raveldexMemoryMarkers');
  assert.throws(() => analyzeRetainerCuts(encode(missing.specs)), /Exactly one named observation marker/);
  const duplicate = fixture(); duplicate.specs[2][3].push(['property', '__raveldexMemoryMarkers', 3]);
  assert.throws(() => analyzeRetainerCuts(encode(duplicate.specs)), /Exactly one named observation marker/);
});
test('malformed schema/count/target/self-size and unfamiliar edge types fail explicitly', () => {
  const sample = fixture().snapshot, mutations = [
    row => { row.snapshot.meta.edge_types[0].push('new-edge-kind'); },
    row => { row.nodes[3] = -1; }, row => { row.edges[2] = 1; },
    row => { row.snapshot.node_count++; }, row => { row.nodes[4]++; },
    row => { row.snapshot.meta.node_types[1] = 'number'; }, row => { row.snapshot.meta.node_types[3] = 'string'; },
    row => { row.snapshot.meta.edge_types[1] = 'node'; }, row => { row.snapshot.meta.edge_types[2] = 'number'; },
  ];
  for (const mutate of mutations) { const changed = structuredClone(sample); mutate(changed); assert.throws(() => analyzeRetainerCuts(changed), assert.AssertionError); }
});
test('component labels must agree with the actual marked index root property targets', () => {
  for (const label of ['reverseDocuments', 'dictionaryPostingsStatistics', 'sourceOrPositions']) {
    const { specs } = fixture(); specs[3][3].find(([, name]) => name === label)[2] = 8;
    assert.throws(() => analyzeRetainerCuts(encode(specs)), /Marker component .* contradicts indexRoot/);
  }
});
test('exported string marker accepts string families and rejects a mislabeled object', () => {
  const valid = fixture(); valid.specs[3][3].push(['property', 'exportedString', 13]);
  assert.equal(cut(analyzeRetainerCuts(encode(valid.specs)), 'exportedString').graphCutSelfSizeBytes, 64);
  const invalid = fixture(); invalid.specs[3][3].push(['property', 'exportedString', 8]);
  assert.throws(() => analyzeRetainerCuts(encode(invalid.specs)), /Exported string seed has non-string type/);
});
test('aliased component seeds have overlapping individual effects and a deduplicated joint cut', () => {
  const { specs } = fixture(); specs[3][3].find(([, name]) => name === 'dictionaryPostingsStatistics')[2] = 5;
  specs[4][3].find(([, name]) => name === 'fields')[2] = 5;
  const primary = analyzeRetainerCuts(encode(specs)).policies[0];
  assert.equal(primary.sharedIndividualComponentCutEffects.selfSizeBytes, 152);
  assert.equal(primary.individualComponentCutEffectUnion.selfSizeBytes, 176);
  assert.equal(primary.selectedComponentJointCut.graphCutSelfSizeBytes, 200);
  assert.equal(primary.additionalJointCutEffect.selfSizeBytes, 24);
});
test('malformed, incomplete and incorrect-target ephemeron encodings fail explicitly', () => {
  for (const mutation of ['name', 'incomplete', 'target']) {
    const { specs } = fixture({ ephemeron: true });
    if (mutation === 'name') specs[16][3][0][1] = '4 / part of key (unrecognized)';
    if (mutation === 'incomplete') specs[16][3] = [];
    if (mutation === 'target') specs[16][3][0][2] = 10;
    assert.throws(() => analyzeRetainerCuts(encode(specs)), /ephemeron|Ephemeron/);
  }
});

// Independent tiny-graph oracle: iterate the edge relation to a fixed point;
// never call production traversal, schema parsing, policy flags or sums.
function referenceReachability(specs, cuts, policy, backing) {
  const excluded = new Set([3, ...(backing ? [14] : []), ...cuts]), seen = new Set([0]); let changed = true;
  while (changed) {
    changed = false;
    specs.forEach(([, , , links], source) => {
      if (!seen.has(source) || excluded.has(source)) return;
      for (const [type, name, target] of links) {
        if (type === 'weak' || type === 'shortcut' && source !== 0 && policy !== 1 ||
          policy === 2 && source === 15 && typeof name === 'string' && name.includes(' / part of key (')) continue;
        if (!excluded.has(target) && !seen.has(target)) { seen.add(target); changed = true; }
      }
    });
  }
  return seen;
}
test('48 deterministic generated graphs match the independent fixed-point removal oracle', () => {
  let state = 78123; const random = max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
  for (let caseIndex = 0; caseIndex < 48; caseIndex++) {
    const { specs } = fixture({ backing: caseIndex % 2 === 0, ephemeron: caseIndex % 3 === 0 });
    const extraStart = specs.length;
    for (let node = 0; node < 12; node++) specs.push(['object', `extra${node}`, random(64), []]);
    for (let edge = 0; edge < 56; edge++) {
      const source = [0, 1, 2, 4, 5, 6, 7, ...Array.from({ length: 12 }, (_, i) => extraStart + i)][random(19)];
      const target = [5, 6, 7, 10, 11, 12, 13, ...Array.from({ length: 12 }, (_, i) => extraStart + i)][random(19)];
      const type = ['property', 'context', 'internal', 'weak', 'shortcut', 'hidden', 'element'][random(7)];
      specs[source][3].push([type, ['hidden', 'element'].includes(type) ? edge : `generated${edge}`, target]);
    }
    const result = analyzeRetainerCuts(encode(specs));
    for (let policy = 0; policy < 3; policy++) {
      const baseline = referenceReachability(specs, [], policy, caseIndex % 2 === 0);
      for (const row of [...result.policies[policy].individualCuts, result.policies[policy].selectedComponentJointCut, ...result.policies[policy].rootShapeCandidateCuts]) {
        const after = referenceReachability(specs, row.cutNodes.map(node => node.ordinal), policy, caseIndex % 2 === 0);
        const lost = [...baseline].filter(node => !after.has(node));
        assert.equal(row.lostBaselineReachableNodes, lost.length, `case ${caseIndex} ${policy} ${row.label} nodes`);
        assert.equal(row.graphCutSelfSizeBytes, lost.reduce((sum, node) => sum + specs[node][2], 0), `case ${caseIndex} ${policy} ${row.label} bytes`);
      }
    }
  }
});
test('output guard rejects normalized, symlink and hardlink aliases using only disposable scratch files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'raveldex-retainer-output-test-'));
  try {
    const protectedPath = join(directory, 'original.json'), otherPath = join(directory, 'other.json');
    await writeFile(protectedPath, 'frozen-primary'); await writeFile(otherPath, 'frozen-other'); await mkdir(join(directory, 'nested'));
    await symlink(protectedPath, join(directory, 'file-alias.json')); await symlink(directory, join(directory, 'directory-alias'));
    await link(otherPath, join(directory, 'hardlink-alias.json')); await symlink(join(directory, 'missing.json'), join(directory, 'dangling.json'));
    for (const output of [protectedPath, `${directory}/nested/../original.json`, join(directory, 'file-alias.json'),
      join(directory, 'directory-alias', 'original.json'), otherPath, join(directory, 'hardlink-alias.json')]) {
      await assert.rejects(assertUnprotectedOutput(output, [protectedPath, otherPath]), /Output aliases protected|Output hardlinks protected/);
    }
    await assert.rejects(assertUnprotectedOutput(join(directory, 'dangling.json'), [protectedPath]), /Dangling output symlink/);
    assert.equal((await assertUnprotectedOutput(join(directory, 'new.json'), [protectedPath, otherPath])).protectedFilesChecked, 2);
    assert.equal(await readFile(protectedPath, 'utf8'), 'frozen-primary'); assert.equal(await readFile(otherPath, 'utf8'), 'frozen-other');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
