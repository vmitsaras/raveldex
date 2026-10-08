import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Explicit selected-edge reachable *data* graph. This is not V8 retained size,
// dominator analysis, an allocation profile, or whole-isolate memory attribution.
export function analyzeHeapGraph(snapshot) {
  const { meta } = snapshot.snapshot, { nodes, edges, strings } = snapshot;
  const fields = meta.node_fields, edgeFields = meta.edge_fields, width = fields.length, edgeWidth = edgeFields.length;
  const field = name => { const at = fields.indexOf(name); assert.ok(at >= 0); return at; };
  const edgeField = name => { const at = edgeFields.indexOf(name); assert.ok(at >= 0); return at; };
  const typeAt = field('type'), nameAt = field('name'), idAt = field('id'), sizeAt = field('self_size'), countAt = field('edge_count');
  const edgeTypeAt = edgeField('type'), edgeNameAt = edgeField('name_or_index'), targetAt = edgeField('to_node');
  const nodeTypes = meta.node_types[typeAt], edgeTypes = meta.edge_types[edgeTypeAt];
  const count = nodes.length / width, offsets = new Uint32Array(count + 1);
  assert.ok(Number.isInteger(count));
  for (let index = 0; index < count; index++) offsets[index + 1] = offsets[index] + nodes[index * width + countAt] * edgeWidth;
  assert.equal(offsets[count], edges.length);
  const type = index => nodeTypes[nodes[index * width + typeAt]];
  const name = index => strings[nodes[index * width + nameAt]];
  const info = index => ({ id: nodes[index * width + idAt], type: type(index), name: name(index), selfSizeBytes: nodes[index * width + sizeAt] });
  function entries(index) {
    const result = [];
    for (let at = offsets[index]; at < offsets[index + 1]; at += edgeWidth) {
      const edgeType = edgeTypes[edges[at + edgeTypeAt]], raw = edges[at + edgeNameAt];
      result.push({ type: edgeType, name: edgeType === 'element' || edgeType === 'hidden' ? raw : strings[raw], target: edges[at + targetAt] / width });
    }
    return result;
  }
  let markers;
  for (let index = 0; index < count; index++) for (const edge of entries(index)) if (edge.type === 'property' && edge.name === '__raveldexMemoryMarkers') {
    assert.equal(markers, undefined, 'one snapshot graph marker expected'); markers = edge.target;
  }
  assert.ok(markers !== undefined);
  const seedRows = entries(markers).filter(edge => edge.type === 'property' && edge.name !== '__proto__');
  const permitted = (index, edge) => {
    if (edge.type === 'property') return edge.name !== '__proto__';
    if (edge.type === 'element') return true;
    if (edge.type !== 'internal') return false;
    if (['properties', 'elements'].includes(edge.name)) return true;
    // This actual V8 version represents frozen-array backing contents with
    // internal numeric edges. They are data references, unlike object maps.
    if (type(index) === 'array' && /^(0|[1-9][0-9]*)$/.test(edge.name)) return true;
    return ['string', 'concatenated string', 'sliced string'].includes(type(index)) && ['first', 'second', 'parent'].includes(edge.name);
  };
  function reachable(seed) {
    const visited = new Set(), stack = [seed];
    while (stack.length) {
      const index = stack.pop(); if (visited.has(index)) continue; visited.add(index);
      for (const edge of entries(index)) if (permitted(index, edge)) stack.push(edge.target);
    }
    return visited;
  }
  const selectedSeeds = seedRows.filter(row => row.name !== 'indexRoot'), sets = selectedSeeds.map(row => reachable(row.target));
  const bytes = set => [...set].reduce((sum, index) => sum + nodes[index * width + sizeAt], 0);
  const union = new Set(sets.flatMap(set => [...set]));
  const components = selectedSeeds.map((seed, component) => {
    const set = sets[component], exclusive = new Set([...set].filter(index => sets.every((other, otherIndex) => otherIndex === component || !other.has(index))));
    const byType = {};
    for (const index of set) { const key = type(index); const row = byType[key] ??= { nodes: 0, selfSizeBytes: 0 }; row.nodes++; row.selfSizeBytes += nodes[index * width + sizeAt]; }
    return { label: seed.name, root: info(seed.target), reachableNodes: set.size, reachableSelfSizeBytes: bytes(set),
      disjointAmongSelectedDataGraphsNodes: exclusive.size, disjointAmongSelectedDataGraphsSelfSizeBytes: bytes(exclusive), byType };
  });
  const shared = new Set([...union].filter(index => sets.filter(set => set.has(index)).length > 1));
  // Detect committed and staged IndexRoot-shaped data without interpreting
  // absent SMI revision edges. This is a shape observation, not an API promise.
  const roots = [];
  for (let index = 0; index < count; index++) if (type(index) === 'object') {
    const properties = new Map(entries(index).filter(edge => edge.type === 'property').map(edge => [edge.name, edge.target]));
    if (['documents', 'fields', 'counts', 'configuration', 'participants'].every(key => properties.has(key))) {
      roots.push({ node: info(index), documentsNodeId: info(properties.get('documents')).id, fieldsNodeId: info(properties.get('fields')).id,
        participantsNodeId: info(properties.get('participants')).id,
        isMarkedCommittedRoot: seedRows.find(row => row.name === 'indexRoot').target === index });
    }
  }
  return { schema: meta, snapshotNodeCount: count, snapshotEdgeCount: edges.length / edgeWidth,
    method: 'Selected property/element/internal backing store, numeric internal backing-array contents and string-parent graph, excluding prototypes/maps/code/weak/hidden edges. Self-size sums count selected-data reachability; no retained-size/dominator or browser/process claim.',
    components, unionSelectedDataNodes: union.size, unionSelectedDataSelfSizeBytes: bytes(union),
    sharedSelectedDataNodes: shared.size, sharedSelectedDataSelfSizeBytes: bytes(shared), indexRootShapeCandidates: roots };
}
export async function analyzeHeapSnapshot(path) {
  const raw = await readFile(path);
  return { path, fileBytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex'), ...analyzeHeapGraph(JSON.parse(raw)) };
}
