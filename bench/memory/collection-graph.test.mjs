import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectionGraph, compareCollectionCohort, auditCollectionIdentity, COLLECTION_ROLES } from './collection-graph.mjs';

function literal({ release = false, bodySurvives = false, resized = false, missingBody = false } = {}) {
  const nodeTypes = ['synthetic', 'object', 'array', 'string', 'concatenated string'], edgeTypes = ['property', 'internal', 'weak'];
  const defs = [
    [1, 'synthetic', 'root', [['property', '__raveldexCollectionHolders', 2], ['property', '__raveldexCollectionExternal', 8]]],
    [2, 'object', 'marker', [['property', 'data', 3], ['property', 'controls', 4]]],
    [3, 'object', 'data', COLLECTION_ROLES.flatMap((name, index) => release && index === 2 ? [] : [['property', name, 5 + index]])],
    [4, 'object', 'controls', [['property', 'positive', 9], ...release ? [] : [['property', 'negative', 10], ['property', 'sharedLeft', 8], ['property', 'sharedRight', 8]]]],
    [5, 'object', 'reverse', [['property', 'term', 11], ['internal', 'elements', 12], ['property', '__proto__', 13], ['weak', 'weak', 16]]],
    [6, 'object', 'fields', [['property', 'term', 11]]],
    ...release ? [] : [[7, 'object', 'side', missingBody ? [] : [['property', 'body', 14]]]],
    [8, 'object', 'outside shared', bodySurvives && release ? [['property', 'retains', 14]] : []], [9, 'object', 'positive', []],
    ...release ? [] : [[10, 'object', 'negative', []]],
    [11, 'string', 'shared term', []], [12, 'array', '(object elements)', [['internal', '0', 15]]], [13, 'object', 'excluded proto', []],
    ...release && !bodySurvives || missingBody ? [] : [[14, 'concatenated string', 'body', [['internal', 'first', 17], ['internal', 'second', 18]]], [17, 'string', 'left', []], [18, 'string', 'right', []]],
    [15, 'string', 'frozen array contents', []], [16, 'object', 'excluded weak target', []],
  ];
  const strings = [], intern = value => { if (!strings.includes(value)) strings.push(value); return strings.indexOf(value); };
  const indices = new Map(defs.map((row, index) => [row[0], index])), nodes = [], edges = [];
  for (const [id, type, name, children] of defs) {
    nodes.push(nodeTypes.indexOf(type), intern(name), id, resized && id === 5 ? 52 : id * 10, children.length);
    for (const [edgeType, edgeName, target] of children) edges.push(edgeTypes.indexOf(edgeType), intern(edgeName), indices.get(target) * 5);
  }
  return { snapshot: { meta: { node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'], node_types: [nodeTypes, 'string', 'number', 'number', 'number'],
    edge_fields: ['type', 'name_or_index', 'to_node'], edge_types: [edgeTypes, 'string_or_number', 'node'] } }, nodes, edges, strings };
}
test('literal cohort includes frozen-array/string backing data and overlapping roles, excluding prototypes/weak edges', () => {
  const graph = collectionGraph(literal());
  assert.deepEqual([...graph.membership.keys()].sort((a, b) => a - b), [5, 6, 7, 11, 12, 14, 15, 17, 18]);
  assert.equal(graph.membership.get(11), 3); assert.equal(graph.membership.get(17), 4);
  assert.equal(graph.controls.sharedLeft, graph.externalId); assert.equal(graph.controls.sharedRight, graph.externalId);
});
test('later ID presence is raw arithmetic only; even matching descriptors leave attribution blocked', () => {
  const baseline = collectionGraph(literal()), noop = collectionGraph(literal());
  const gone = compareCollectionCohort(baseline, noop, collectionGraph(literal({ release: true })));
  assert.deepEqual(gone.summary.baselineToNoopMissing, { nodes: 0, baselineSelfSizeBytes: 0 });
  assert.deepEqual(gone.summary.baselineToFinalMissing, { nodes: 4, baselineSelfSizeBytes: 560 });
  assert.deepEqual(gone.summary.finalMissingBySelectedRoleMask[4], { nodes: 4, baselineSelfSizeBytes: 560 });
  const surviving = compareCollectionCohort(baseline, noop, collectionGraph(literal({ release: true, bodySurvives: true, resized: true })));
  assert.deepEqual(surviving.summary.baselineToFinalMissing, { nodes: 1, baselineSelfSizeBytes: 70 });
  assert.deepEqual(surviving.summary.sameIdRecordedSizeDifferences, [{ id: 5, baseline: 50, final: 52 }]);
  assert.equal(surviving.summary.attributionStatus, 'Blocked');
  assert.equal(surviving.summary.identity.sameDescriptorDoesNotProveIdentity, true);
});
test('same-ID object-to-code/name changes are rejected as identity evidence, including unchanged sizes', () => {
  const baseline = collectionGraph(literal()), later = collectionGraph(literal());
  later.byId.set(5, { ...later.byId.get(5), type: 'code', name: 'system / FeedbackVector' });
  const result = auditCollectionIdentity(baseline, baseline, later);
  assert.equal(result.attributionStatus, 'Blocked'); assert.equal(result.observedDescriptorConflicts.length, 1);
  assert.deepEqual(result.observedDescriptorConflicts[0], { id: 5, stage: 'final', baseline: { type: 'object', name: 'reverse', size: 50 }, later: { type: 'code', name: 'system / FeedbackVector', size: 50 } });
  assert.equal(auditCollectionIdentity(baseline, baseline, baseline).attributionStatus, 'Blocked');
});
test('no-op churn and unexpected ID reappearance remain explicit', () => {
  const baseline = collectionGraph(literal()), noop = collectionGraph(literal({ missingBody: true }));
  const result = compareCollectionCohort(baseline, noop, baseline);
  assert.deepEqual(result.summary.baselineToNoopMissing, { nodes: 3, baselineSelfSizeBytes: 490 });
  assert.deepEqual(result.summary.reappearedIds.sort((a, b) => a - b), [14, 17, 18]);
  assert.deepEqual(result.summary.noopToFinalMissing, { nodes: 0, baselineSelfSizeBytes: 0 });
});
test('malformed schema, duplicate IDs and invalid edge targets reject rather than inventing sizes', () => {
  const badSchema = literal(); badSchema.snapshot.meta.node_types[2] = 'string'; assert.throws(() => collectionGraph(badSchema));
  const duplicate = literal(); duplicate.nodes[7] = duplicate.nodes[2]; assert.throws(() => collectionGraph(duplicate));
  const target = literal(); target.edges[2] = 999999; assert.throws(() => collectionGraph(target));
  const truncated = literal(); truncated.nodes.pop(); assert.throws(() => collectionGraph(truncated));
  const overflow = literal(); overflow.nodes[4] += 2 ** 32; assert.throws(() => collectionGraph(overflow));
  const sum = literal(); for (let at = 3; at < sum.nodes.length; at += 5) sum.nodes[at] = Number.MAX_SAFE_INTEGER;
  const graph = collectionGraph(sum); assert.throws(() => compareCollectionCohort(graph, graph, graph));
});
