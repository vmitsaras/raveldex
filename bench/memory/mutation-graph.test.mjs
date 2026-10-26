import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMutationGraph } from './mutation-graph.mjs';

function literal() {
  const defs = [
    ['global', 10, [['__raveldexMutationMarkers', 1]]],
    ['marker', 10, [['old', 2], ['candidate', 3], ['core', 4], ['context', 5], ['changes', 6], ['request', 7]]],
    ['old', 10, [['documents', 8], ['fields', 9], ['participants', 10], ['counts', 11], ['configuration', 12]]],
    ['candidate', 10, [['documents', 13], ['fields', 14], ['participants', 15], ['counts', 16], ['configuration', 12]]],
    ['core', 10, [['documents', 13], ['fields', 14], ['participants', 10], ['counts', 16], ['configuration', 12]]],
    ['context', 10, [['previous', 2], ['core', 4], ['changes', 6], ['records', 17]]],
    ['changes', 20, [['previous', 18], ['next', 19]]],
    ['request', 30, [['records', 17]]],
    ['oldDocs', 40, [['changed', 18], ['untouched', 20], ['__proto__', 26]]],
    ['oldFields', 50, [['term', 21]]], ['oldSide', 60, [['original', 22]]], ['oldCounts', 10, []], ['configuration', 10, []],
    ['newDocs', 70, [['changed', 19], ['untouched', 20], ['__proto__', 26]]],
    ['newFields', 80, [['term', 21]]], ['newSide', 90, [['original', 23]]], ['newCounts', 10, []],
    ['requestRecords', 100, [['value', 23]]], ['oldChanged', 110, []], ['newChanged', 120, []], ['untouched', 130, []],
    ['shared term', 140, []], ['old original', 150, []], ['new original', 160, []],
    ['array backing', 170, []], ['frozen array element', 180, []], ['excluded prototype', 190, []],
  ];
  const types = ['object', 'string', 'array', 'concatenated string'], edgeTypes = ['property', 'internal', 'weak', 'hidden'], strings = [];
  const intern = value => { if (!strings.includes(value)) strings.push(value); return strings.indexOf(value); };
  const nodes = [], edges = [];
  for (const [index, [name, size, children]] of defs.entries()) {
    nodes.push(types.indexOf(index === 21 || index === 22 || index === 23 ? 'string' : index === 24 ? 'array' : 'object'), intern(name), 100 + index, size, children.length);
    for (const [label, target] of children) edges.push(0, intern(label), target * 5);
  }
  return { snapshot: { meta: { node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'], node_types: [types, 'string', 'number', 'number', 'number'],
    edge_fields: ['type', 'name_or_index', 'to_node'], edge_types: [edgeTypes, 'string_or_number', 'node'] } }, nodes, edges, strings };
}
test('one-dump old/candidate/request/change groups have hand-derived sharing and deduplicated sums', () => {
  const { summary: s } = analyzeMutationGraph(literal());
  // Old:40+50+60+110+130+140+150=680; candidate:70+80+90+120+130+140+160=790.
  assert.equal(s.oldData.selfSizeBytes, 680); assert.equal(s.candidateData.selfSizeBytes, 790);
  assert.equal(s.sharedData.selfSizeBytes, 270); assert.equal(s.oldOnly.selfSizeBytes, 410); assert.equal(s.candidateOnly.selfSizeBytes, 520);
  assert.equal(s.dataUnion.selfSizeBytes, 1200); assert.equal(s.requestOutsideData.selfSizeBytes, 130);
  assert.equal(s.changesOutsideDataAndRequest.selfSizeBytes, 20); assert.equal(s.allSelectedUnion.selfSizeBytes, 1350);
  assert.equal(s.roles.request.selfSizeBytes, 290); assert.equal(s.roles.changes.selfSizeBytes, 250);
  assert.equal(s.roleRoots.oldDocuments, 108); assert.equal(s.roleRoots.candidateDocuments, 113);
  assert.ok(!s.roles.oldDocuments.byType.code);
});
test('literal frozen-array backing contents and string parents are selected; maps/weak/hidden/prototypes are excluded', () => {
  const f = literal(), i = f.nodes.length / 5 - 1;
  // Add backing and frozen numeric edges at the final otherwise-excluded node,
  // then make the old document point to it as an ordinary value.
  f.nodes[i * 5] = 2; f.nodes[i * 5 + 4] = 4;
  f.nodes[25 * 5] = 3; f.nodes[25 * 5 + 4] = 2;
  const names = ['elements', '0', 'map', 'weak', 'hidden', 'first', 'second']; for (const n of names) if (!f.strings.includes(n)) f.strings.push(n);
  f.edges.push(1, f.strings.indexOf('first'), 22 * 5, 1, f.strings.indexOf('second'), 23 * 5,
    1, f.strings.indexOf('0'), 25 * 5, 1, f.strings.indexOf('map'), 24 * 5, 2, f.strings.indexOf('weak'), 24 * 5, 3, 0, 24 * 5);
  // Change oldDocs __proto__ to ordinary property so node26 is reachable.
  f.strings[f.strings.indexOf('__proto__')] = 'ordinaryBacking';
  const { rows } = analyzeMutationGraph(f);
  assert.ok(rows.some(row => row[0] === 125)); assert.ok(rows.some(row => row[0] === 126)); assert.ok(!rows.some(row => row[0] === 124));
  assert.ok(rows.find(row => row[0] === 123)[3] & 1, 'Old graph reaches string through concat parent edges');
});
test('wrong lexical aliases and missing/duplicate marker refuse graph attribution', () => {
  const wrong = literal();
  // Redirect context.previous to candidate.
  const previous = wrong.strings.indexOf('previous');
  const at = wrong.edges.findIndex((v, i) => i % 3 === 1 && v === previous); wrong.edges[at + 1] = 3 * 5;
  assert.throws(() => analyzeMutationGraph(wrong));
  const missing = literal(); missing.strings[missing.strings.indexOf('__raveldexMutationMarkers')] = 'absent'; assert.throws(() => analyzeMutationGraph(missing));
  const duplicate = literal(); duplicate.nodes[4]++;
  duplicate.edges.splice(3, 0, ...duplicate.edges.slice(0, 3)); assert.throws(() => analyzeMutationGraph(duplicate));
});
test('malformed fields, duplicate IDs, target/count bounds and unsafe sums refuse analysis', () => {
  for (const mutate of [f => f.nodes.pop(), f => f.nodes[7] = f.nodes[2], f => f.edges[2] = 999999,
    f => f.nodes[4] += 2 ** 32, f => f.snapshot.meta.node_types[3] = 'string',
    f => { for (let i = 3; i < f.nodes.length; i += 5) f.nodes[i] = Number.MAX_SAFE_INTEGER; }]) {
    const f = literal(); mutate(f); assert.throws(() => analyzeMutationGraph(f));
  }
});
