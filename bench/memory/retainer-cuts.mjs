import assert from 'node:assert/strict';

// Exact counterfactual cuts in a declared recorded graph, not V8 GC retained
// size. In particular, a node cut removes *every* alias to that node.
const knownNodeTypes = new Set(['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'native',
  'synthetic', 'concatenated string', 'sliced string', 'symbol', 'bigint', 'object shape']);
const knownEdgeTypes = new Set(['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak']);
const labels = ['reverseDocuments', 'dictionaryPostingsStatistics', 'sourceOrPositions', 'indexRoot'];
const ephemeronPattern = /^\d+ \/ part of key \(.*? @(\d+)\) -> value \(.*? @(\d+)\) pair in WeakMap \(table @(\d+)\)$/;
export const RETAINER_POLICIES = Object.freeze([
  { id: 'recorded-nonweak-root-shortcuts', bit: 1, description: 'Every context/element/property/internal/hidden edge; root shortcuts only; no weak edges. Ephemeron pair internal edges are independent recorded graph edges.' },
  { id: 'recorded-nonweak-all-shortcuts', bit: 2, description: 'Same graph plus non-root shortcuts, as a display-edge sensitivity only.' },
  { id: 'recorded-key-only-ephemerons', bit: 4, description: 'Primary graph with labelled WeakMap table-to-value pair edges omitted; key-to-value pair edges stay. This is a heuristic sensitivity, not conditional V8 GC.' },
]);

export function analyzeRetainerCuts(snapshot) {
  const meta = snapshot?.snapshot?.meta, { nodes, edges, strings } = snapshot ?? {};
  assert.ok(meta && Array.isArray(nodes) && Array.isArray(edges) && Array.isArray(strings), 'Heap snapshot arrays/meta required');
  assert.ok(strings.every(value => typeof value === 'string'), 'String table must contain strings');
  const nf = meta.node_fields, ef = meta.edge_fields;
  assert.ok(Array.isArray(nf) && Array.isArray(ef), 'Field schemas required');
  assert.equal(new Set(nf).size, nf.length, 'Duplicate node field'); assert.equal(new Set(ef).size, ef.length, 'Duplicate edge field');
  assert.ok(nf.every(field => ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'].includes(field)), 'Unknown node field');
  assert.deepEqual([...ef].sort(), ['name_or_index', 'to_node', 'type'], 'Unknown/incomplete edge fields');
  const required = name => { const at = nf.indexOf(name); assert.ok(at >= 0, `Missing node field ${name}`); return at; };
  const ntAt = required('type'), nameAt = required('name'), idAt = required('id'), sizeAt = required('self_size'), countAt = required('edge_count');
  const etAt = ef.indexOf('type'), enAt = ef.indexOf('name_or_index'), toAt = ef.indexOf('to_node');
  const nt = meta.node_types?.[ntAt], et = meta.edge_types?.[etAt], nw = nf.length, ew = ef.length;
  for (let at = 0; at < nf.length; at++) if (at !== ntAt) assert.equal(meta.node_types?.[at], nf[at] === 'name' ? 'string' : 'number', `Contradictory node descriptor ${nf[at]}`);
  assert.equal(meta.edge_types?.[enAt], 'string_or_number', 'Contradictory edge name descriptor');
  assert.equal(meta.edge_types?.[toAt], 'node', 'Contradictory edge target descriptor');
  assert.ok(Array.isArray(nt) && nt.length && nt.every(type => knownNodeTypes.has(type)), 'Unknown node type schema');
  assert.ok(Array.isArray(et) && et.length && et.every(type => knownEdgeTypes.has(type)), 'Unknown edge type schema');
  assert.equal(new Set(nt).size, nt.length, 'Duplicate node type'); assert.equal(new Set(et).size, et.length, 'Duplicate edge type');
  assert.equal(nodes.length % nw, 0, 'Misaligned nodes'); assert.equal(edges.length % ew, 0, 'Misaligned edges');
  const count = nodes.length / nw, edgeCount = edges.length / ew;
  assert.ok(count > 0 && count < 2 ** 32 && edgeCount < 2 ** 32, 'Unsupported graph cardinality');
  if (snapshot.snapshot.node_count !== undefined) assert.equal(snapshot.snapshot.node_count, count, 'Node count mismatch');
  if (snapshot.snapshot.edge_count !== undefined) assert.equal(snapshot.snapshot.edge_count, edgeCount, 'Edge count mismatch');
  const integer = (value, message) => assert.ok(Number.isSafeInteger(value) && value >= 0, message);
  const offsets = new Uint32Array(count + 1), sizes = new Float64Array(count), targets = new Uint32Array(edgeCount);
  const flags = new Uint8Array(edgeCount), types = new Uint8Array(edgeCount), ids = new Map(), edgeCounts = {};
  let totalBytes = 0;
  for (let node = 0; node < count; node++) {
    for (const field of nf) integer(nodes[node * nw + nf.indexOf(field)], `Malformed ${field} at node ${node}`);
    assert.ok(nodes[node * nw + ntAt] < nt.length && nodes[node * nw + nameAt] < strings.length, 'Invalid node type/name');
    const id = nodes[node * nw + idAt]; assert.ok(!ids.has(id), 'Duplicate snapshot node ID'); ids.set(id, node);
    sizes[node] = nodes[node * nw + sizeAt]; totalBytes += sizes[node]; integer(totalBytes, 'Unsafe total self-size');
    const next = offsets[node] + nodes[node * nw + countAt]; assert.ok(next <= edgeCount, 'Edge count overflow'); offsets[node + 1] = next;
  }
  assert.equal(offsets[count], edgeCount, 'Node edge counts do not cover edge array');
  const nodeType = node => nt[nodes[node * nw + ntAt]], nodeName = node => strings[nodes[node * nw + nameAt]];
  assert.equal(nodeType(0), 'synthetic', 'First node must be the recorded synthetic GC root');
  if (snapshot.snapshot.root_index !== undefined) assert.equal(snapshot.snapshot.root_index, 0, 'Nonzero root unsupported');
  const info = node => ({ ordinal: node, snapshotId: nodes[node * nw + idAt], type: nodeType(node), selfSizeBytes: sizes[node] });
  const edgeType = edge => et[types[edge]];
  const edgeName = edge => ['element', 'hidden'].includes(edgeType(edge)) ? edges[edge * ew + enAt] : strings[edges[edge * ew + enAt]];
  const markers = [], pairs = new Map();
  let nonRootShortcuts = 0, tablePairEdges = 0, keyPairEdges = 0;
  for (let source = 0; source < count; source++) for (let edge = offsets[source]; edge < offsets[source + 1]; edge++) {
    const raw = edge * ew, type = edges[raw + etAt], name = edges[raw + enAt], target = edges[raw + toAt];
    integer(type, 'Malformed edge type'); integer(name, 'Malformed edge name/index'); integer(target, 'Malformed edge target');
    assert.ok(type < et.length, 'Unknown edge type'); assert.ok(target % nw === 0 && target / nw < count, 'Invalid edge target');
    types[edge] = type; targets[edge] = target / nw;
    const kind = et[type]; if (!['element', 'hidden'].includes(kind)) assert.ok(name < strings.length, 'Invalid edge name');
    edgeCounts[kind] = (edgeCounts[kind] ?? 0) + 1;
    flags[edge] = kind === 'weak' ? 0 : kind === 'shortcut' && source !== 0 ? 2 : 7;
    if (kind === 'shortcut' && source !== 0) nonRootShortcuts++;
    const text = edgeName(edge);
    if (kind === 'property' && text === '__raveldexMemoryMarkers') markers.push({ source, edge, target: targets[edge] });
    if (kind === 'internal' && typeof text === 'string' && text.includes(' / part of key (')) {
      const match = ephemeronPattern.exec(text); assert.ok(match, 'Unrecognized ephemeron pair encoding');
      const [keyId, valueId, tableId] = match.slice(1).map(Number);
      for (const id of [keyId, valueId, tableId]) assert.ok(Number.isSafeInteger(id) && ids.has(id), 'Ephemeron refers to missing node');
      const sourceId = nodes[source * nw + idAt]; assert.equal(nodes[targets[edge] * nw + idAt], valueId, 'Ephemeron target mismatch');
      assert.ok(keyId !== tableId && [keyId, tableId].includes(sourceId), 'Ambiguous ephemeron source');
      const key = `${keyId}:${valueId}:${tableId}`, pair = pairs.get(key) ?? { keyEdges: 0, tableEdges: 0 };
      if (sourceId === tableId) { flags[edge] &= ~4; pair.tableEdges++; tablePairEdges++; } else { pair.keyEdges++; keyPairEdges++; }
      pairs.set(key, pair);
    }
  }
  for (const pair of pairs.values()) assert.ok(pair.keyEdges && pair.tableEdges, 'Incomplete ephemeron pair');
  assert.equal(markers.length, 1, 'Exactly one named observation marker required');
  const marker = markers[0].target; assert.ok(marker !== 0 && nodeType(marker) === 'object', 'Malformed observation marker');
  const seeds = new Map();
  for (let edge = offsets[marker]; edge < offsets[marker + 1]; edge++) if (edgeType(edge) === 'property') {
    const label = edgeName(edge); if (label === '__proto__') continue;
    assert.ok([...labels, 'exportedString'].includes(label), 'Unknown marker seed');
    assert.ok(!seeds.has(label), 'Duplicate marker seed'); seeds.set(label, targets[edge]);
  }
  for (const label of labels) assert.ok(seeds.has(label), `Missing marker seed ${label}`);
  for (const [label, node] of seeds) assert.ok(node !== 0 && node !== marker, `Malformed seed ${label}`);
  if (seeds.has('exportedString')) assert.ok(['string', 'concatenated string', 'sliced string'].includes(nodeType(seeds.get('exportedString'))), 'Exported string seed has non-string type');
  const neutralized = new Set([marker]), backingCandidates = [];
  // V8 may duplicate marker property references in an out-of-line PropertyArray.
  // Neutralize only a marker-owned property store that actually points to seeds.
  // An outside nonweak alias makes ownership ambiguous and fails this analysis.
  for (let edge = offsets[marker]; edge < offsets[marker + 1]; edge++) if (edgeType(edge) === 'internal' && edgeName(edge) === 'properties') {
    const backing = targets[edge];
    if (![...seeds.values()].some(seed => {
      for (let at = offsets[backing]; at < offsets[backing + 1]; at++) if (targets[at] === seed && flags[at]) return true;
      return false;
    })) continue;
    assert.ok((nodeType(backing) === 'hidden' && nodeName(backing) === 'system / PropertyArray') || nodeType(backing) === 'array', 'Unrecognized marker property store');
    assert.ok(![...seeds.values()].includes(backing), 'Marker backing store is also a measured seed');
    neutralized.add(backing); backingCandidates.push(backing);
  }
  for (let source = 0; source < count; source++) for (let edge = offsets[source]; edge < offsets[source + 1]; edge++) {
    if (backingCandidates.includes(targets[edge]) && flags[edge]) assert.ok(neutralized.has(source), 'Outside retainer of observation backing store');
  }
  const rootCandidates = [];
  for (let node = 0; node < count; node++) if (nodeType(node) === 'object') {
    const properties = new Map();
    for (let edge = offsets[node]; edge < offsets[node + 1]; edge++) if (edgeType(edge) === 'property') properties.set(edgeName(edge), targets[edge]);
    if (['documents', 'fields', 'counts', 'configuration', 'participants'].every(name => properties.has(name))) rootCandidates.push({
      ...info(node), isMarkedCommittedRoot: node === seeds.get('indexRoot'),
      documentsSnapshotId: info(properties.get('documents')).snapshotId, fieldsSnapshotId: info(properties.get('fields')).snapshotId,
      participantsSnapshotId: info(properties.get('participants')).snapshotId,
    });
  }
  assert.ok(rootCandidates.some(row => row.ordinal === seeds.get('indexRoot')), 'Marked index root shape missing');
  const markedRoot = rootCandidates.find(row => row.isMarkedCommittedRoot);
  for (const [label, field] of [['reverseDocuments', 'documentsSnapshotId'], ['dictionaryPostingsStatistics', 'fieldsSnapshotId'], ['sourceOrPositions', 'participantsSnapshotId']]) {
    assert.equal(info(seeds.get(label)).snapshotId, markedRoot[field], `Marker component ${label} contradicts indexRoot`);
  }
  function reachable(bit, cuts = []) {
    const excluded = new Uint8Array(count); for (const node of neutralized) excluded[node] = 1;
    for (const node of cuts) excluded[node] = 1;
    const visited = new Uint8Array(count), queue = new Uint32Array(count); let head = 0, tail = 1;
    queue[0] = 0; visited[0] = 1;
    while (head < tail) {
      const source = queue[head++];
      for (let edge = offsets[source]; edge < offsets[source + 1]; edge++) {
        const target = targets[edge]; if (!(flags[edge] & bit) || visited[target] || excluded[target]) continue;
        visited[target] = 1; queue[tail++] = target;
      }
    }
    return visited;
  }
  function aggregate(predicate) {
    let nodeCount = 0, selfSizeBytes = 0; const byType = {};
    for (let node = 0; node < count; node++) if (predicate(node)) {
      nodeCount++; selfSizeBytes += sizes[node]; const type = nodeType(node), row = byType[type] ??= { nodes: 0, selfSizeBytes: 0 };
      row.nodes++; row.selfSizeBytes += sizes[node];
    }
    return { nodes: nodeCount, selfSizeBytes, byType };
  }
  const incoming = new Map([...seeds].map(([label]) => [label, []]));
  for (let source = 0; source < count; source++) for (let edge = offsets[source]; edge < offsets[source + 1]; edge++) {
    for (const [label, seed] of seeds) if (targets[edge] === seed && flags[edge]) incoming.get(label).push({ edgeOrdinal: edge, source: info(source),
      type: edgeType(edge), acceptedPrimary: Boolean(flags[edge] & 1), observationScaffold: neutralized.has(source) });
  }
  const policies = RETAINER_POLICIES.map(policy => {
    const baseline = reachable(policy.bit);
    for (const [label, node] of seeds) assert.ok(baseline[node], `Unreachable seed ${label} under ${policy.id}`);
    for (const candidate of rootCandidates) assert.ok(baseline[candidate.ordinal], `Unreachable root-shape candidate under ${policy.id}`);
    const effects = [];
    const measure = (label, cutNodes) => {
      const after = reachable(policy.bit, cutNodes), lost = new Uint8Array(count);
      for (let node = 0; node < count; node++) lost[node] = baseline[node] && !after[node] ? 1 : 0;
      const stats = aggregate(node => lost[node]);
      return { label, cutNodes: cutNodes.map(info), lostBaselineReachableNodes: stats.nodes, graphCutSelfSizeBytes: stats.selfSizeBytes, byType: stats.byType, lost };
    };
    for (const [label, seed] of seeds) effects.push(measure(label, [seed]));
    const components = effects.filter(row => labels.slice(0, 3).includes(row.label));
    const group = measure('selected-component-joint-cut', [...new Set(labels.slice(0, 3).map(label => seeds.get(label)))]);
    const individualUnion = aggregate(node => components.some(row => row.lost[node]));
    const overlap = aggregate(node => components.filter(row => row.lost[node]).length > 1);
    const jointOnly = aggregate(node => group.lost[node] && !components.some(row => row.lost[node]));
    const candidateCuts = rootCandidates.map(row => measure(`index-root-shape-candidate-${row.snapshotId}`, [row.ordinal]));
    candidateCuts.push(measure('index-root-shape-candidates-joint-cut', rootCandidates.map(row => row.ordinal)));
    return { id: policy.id, baselineRootReachable: aggregate(node => baseline[node]),
      individualCuts: effects.map(({ lost, ...row }) => row), selectedComponentJointCut: (({ lost, ...row }) => row)(group),
      individualComponentCutEffectUnion: individualUnion, sharedIndividualComponentCutEffects: overlap, additionalJointCutEffect: jointOnly,
      rootShapeCandidateCuts: candidateCuts.map(({ lost, ...row }) => row) };
  });
  return { schema: meta, snapshotNodeCount: count, snapshotEdgeCount: edgeCount, snapshotTotalNodeSelfSizeBytes: totalBytes,
    root: info(0), edgeCounts, markerNeutralization: { rule: 'Exclude the marker object and only its verified exclusively marker-owned property backing store; preserve every other recorded retainer.',
      marker: info(marker), namedMarkerEdgeOrdinal: markers[0].edge, scaffoldNodes: [...neutralized].map(info) },
    seeds: [...seeds].map(([label, node]) => ({ label, node: info(node), recordedNonweakIncoming: incoming.get(label) })),
    indexRootShapeCandidates: rootCandidates, edgeSensitivity: { weakEdgesExcluded: edgeCounts.weak ?? 0, nonRootShortcuts,
      recognizedEphemeronPairs: pairs.size, ephemeronKeyToValueEdges: keyPairEdges, ephemeronTableToValueEdges: tablePairEdges,
      limitation: 'These graph policies do not implement the conditional key-and-table liveness of ephemerons, DevTools page-object filtering, or V8 collector semantics. Their differences are policy sensitivity, not bounds on exact GC retained bytes.' },
    policies };
}
