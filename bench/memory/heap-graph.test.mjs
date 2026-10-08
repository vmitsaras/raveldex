import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeHeapGraph } from './heap-graph.mjs';

// Literal heap-shaped fixture, independent of V8 dump writer and production
// state. Hand sums demonstrate shared-string accounting and excluded edges.
function fixture(threeWayShared = false) {
  const strings = [''], types = ['object', 'string', 'array'], edgeTypes = ['property', 'element', 'internal', 'weak', 'hidden'];
  const string = text => { let at = strings.indexOf(text); if (at < 0) { at = strings.length; strings.push(text); } return at; };
  const specs = [
    ['object', 'global', 24, [['property', '__raveldexMemoryMarkers', 1]]],
    ['object', 'markers', 40, [['property', 'reverseDocuments', 2], ['property', 'dictionaryPostingsStatistics', 3], ['property', 'sourceOrPositions', 4], ['property', 'indexRoot', 5]]],
    ['object', 'document', 24, [['property', 'shared', 6], ['property', '__proto__', 7], ['internal', 'properties', 8], ['weak', 'hiddenLeak', 11]]],
    ['object', 'dictionary', 24, [['property', 'shared', 6], ['internal', 'map', 7]]],
    ['object', 'side', 16, threeWayShared ? [['property', 'shared', 6]] : []],
    ['object', 'root', 48, [['property', 'documents', 2], ['property', 'fields', 3], ['property', 'participants', 4], ['property', 'counts', 9], ['property', 'configuration', 10]]],
    ['string', 'shared', 24, []],
    ['object', 'prototype', 24, [['property', 'irrelevant', 11]]],
    ['array', 'properties', 32, [['internal', '0', 12]]],
    ['object', 'counts', 16, []],
    ['object', 'configuration', 24, []],
    ['string', 'secret excluded', 128, []],
    ['string', 'frozen array child', 64, []],
  ];
  const nodes = [], edges = [];
  specs.forEach(([type, name, size, links], index) => {
    nodes.push(types.indexOf(type), string(name), 100 + index, size, links.length);
    for (const [edgeType, name, target] of links) edges.push(edgeTypes.indexOf(edgeType), string(name), target * 5);
  });
  return { snapshot: { meta: { node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'], node_types: [types],
    edge_fields: ['type', 'name_or_index', 'to_node'], edge_types: [edgeTypes] } }, nodes, edges, strings };
}
test('selected-data graph keeps backing stores, counts shared strings once and excludes prototypes/maps/weak edges', () => {
  const result = analyzeHeapGraph(fixture());
  assert.deepEqual(result.components.map(row => [row.label, row.reachableSelfSizeBytes, row.disjointAmongSelectedDataGraphsSelfSizeBytes]), [
    ['reverseDocuments', 144, 120], ['dictionaryPostingsStatistics', 48, 24], ['sourceOrPositions', 16, 16],
  ]);
  assert.equal(result.unionSelectedDataSelfSizeBytes, 184); assert.equal(result.sharedSelectedDataSelfSizeBytes, 24);
  assert.equal(result.indexRootShapeCandidates.length, 1); assert.equal(result.indexRootShapeCandidates[0].isMarkedCommittedRoot, true);
});
test('missing graph marker fails instead of returning an invented zero measurement', () => {
  const sample = fixture(); sample.strings[sample.strings.indexOf('__raveldexMemoryMarkers')] = 'different-marker';
  assert.throws(() => analyzeHeapGraph(sample), assert.AssertionError);
});
test('a three-way shared node contributes once to union rather than sum minus one overlap', () => {
  const result = analyzeHeapGraph(fixture(true));
  assert.equal(result.unionSelectedDataSelfSizeBytes, 184); assert.equal(result.sharedSelectedDataSelfSizeBytes, 24);
  assert.equal(result.components.reduce((sum,row)=>sum+row.reachableSelfSizeBytes,0), 232);
  assert.deepEqual(result.components.map(row=>row.disjointAmongSelectedDataGraphsSelfSizeBytes), [120,24,16]);
});
