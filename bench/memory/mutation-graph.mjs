import assert from 'node:assert/strict';

export const MUTATION_ROLES = ['oldDocuments', 'oldFields', 'oldParticipants', 'candidateDocuments', 'candidateFields', 'candidateParticipants', 'request', 'changes'];

// Single-snapshot membership only. No ID is ever matched across dumps.
export function analyzeMutationGraph(snapshot) {
  const meta = snapshot?.snapshot?.meta, { nodes, edges, strings } = snapshot ?? {};
  assert.ok(meta && Array.isArray(nodes) && Array.isArray(edges) && Array.isArray(strings));
  const nf = meta.node_fields, ef = meta.edge_fields;
  assert.ok(Array.isArray(nf) && Array.isArray(ef)); assert.equal(new Set(nf).size, nf.length); assert.equal(new Set(ef).size, ef.length);
  const field = (fields, name) => { const i = fields.indexOf(name); assert.ok(i >= 0, `Missing ${name}`); return i; };
  const nt = field(nf, 'type'), nn = field(nf, 'name'), ni = field(nf, 'id'), ns = field(nf, 'self_size'), nc = field(nf, 'edge_count');
  const et = field(ef, 'type'), en = field(ef, 'name_or_index'), to = field(ef, 'to_node'), nw = nf.length, ew = ef.length;
  const types = meta.node_types?.[nt], edgeTypes = meta.edge_types?.[et];
  assert.ok(Array.isArray(types) && Array.isArray(edgeTypes));
  for (const i of [ni, ns, nc]) assert.equal(meta.node_types[i], 'number');
  assert.equal(meta.node_types[nn], 'string'); assert.equal(meta.edge_types[en], 'string_or_number'); assert.equal(meta.edge_types[to], 'node');
  assert.equal(nodes.length % nw, 0); assert.equal(edges.length % ew, 0);
  const count = nodes.length / nw, offsets = new Float64Array(count + 1), ids = new Set();
  const integer = v => Number.isSafeInteger(v) && v >= 0;
  for (let i = 0; i < count; i++) {
    const at = i * nw, id = nodes[at + ni], children = nodes[at + nc];
    assert.ok(integer(id) && !ids.has(id) && integer(nodes[at + ns]) && integer(children) && typeof types[nodes[at + nt]] === 'string' && typeof strings[nodes[at + nn]] === 'string', 'Malformed node');
    ids.add(id); offsets[i + 1] = offsets[i] + children * ew;
    assert.ok(Number.isSafeInteger(offsets[i + 1]) && offsets[i + 1] <= edges.length, 'Edge-count overflow');
  }
  assert.equal(offsets[count], edges.length);
  const type = i => types[nodes[i * nw + nt]], size = i => nodes[i * nw + ns], id = i => nodes[i * nw + ni];
  function entries(i) {
    const result = [];
    for (let at = offsets[i]; at < offsets[i + 1]; at += ew) {
      const kind = edgeTypes[edges[at + et]], target = edges[at + to] / nw, raw = edges[at + en];
      const name = ['element', 'hidden'].includes(kind) ? raw : strings[raw];
      assert.ok(typeof kind === 'string' && Number.isInteger(target) && target >= 0 && target < count && (typeof name === 'string' || integer(name)), 'Malformed edge');
      result.push({ kind, name, target });
    }
    return result;
  }
  let marker;
  // Visiting every node also validates every edge, including excluded edges.
  for (let i = 0; i < count; i++) for (const edge of entries(i)) if (edge.kind === 'property' && edge.name === '__raveldexMutationMarkers') {
    assert.equal(marker, undefined, 'Ambiguous observer marker'); marker = edge.target;
  }
  assert.ok(marker !== undefined, 'Missing observer marker');
  const props = i => {
    const values = new Map();
    for (const e of entries(i)) if (e.kind === 'property' && e.name !== '__proto__') { assert.ok(!values.has(e.name), 'Duplicate named property'); values.set(e.name, e.target); }
    return values;
  };
  const required = (properties, name) => { assert.ok(properties.has(name), `Missing property ${name}`); return properties.get(name); };
  const seeds = props(marker), old = required(seeds, 'old'), candidate = required(seeds, 'candidate'), core = required(seeds, 'core'), context = required(seeds, 'context');
  assert.notEqual(old, candidate);
  const oldProps = props(old), candidateProps = props(candidate), coreProps = props(core), contextProps = props(context);
  for (const key of ['documents', 'fields', 'counts']) assert.equal(required(coreProps, key), required(candidateProps, key));
  assert.equal(required(oldProps, 'configuration'), required(candidateProps, 'configuration'));
  assert.equal(required(coreProps, 'participants'), required(oldProps, 'participants'));
  assert.notEqual(required(candidateProps, 'participants'), required(oldProps, 'participants'));
  assert.equal(required(contextProps, 'previous'), old); assert.equal(required(contextProps, 'core'), core);
  for (const key of ['changes', 'records']) assert.equal(required(contextProps, key), key === 'changes' ? required(seeds, key) : required(props(required(seeds, 'request')), key));
  const roots = [...['documents', 'fields', 'participants'].map(k => required(oldProps, k)), ...['documents', 'fields', 'participants'].map(k => required(candidateProps, k)), required(seeds, 'request'), required(seeds, 'changes')];
  const membership = new Uint8Array(count);
  const permitted = (i, e) => e.kind === 'property' ? e.name !== '__proto__' : e.kind === 'element' || e.kind === 'internal' &&
    (['properties', 'elements'].includes(e.name) || type(i) === 'array' && /^(0|[1-9][0-9]*)$/.test(e.name) ||
      ['string', 'concatenated string', 'sliced string'].includes(type(i)) && ['first', 'second', 'parent'].includes(e.name));
  roots.forEach((root, bit) => {
    const visited = new Set(), stack = [root];
    while (stack.length) { const i = stack.pop(); if (visited.has(i)) continue; visited.add(i); membership[i] |= 1 << bit;
      for (const e of entries(i)) if (permitted(i, e)) stack.push(e.target);
    }
  });
  const rows = [];
  for (let i = 0; i < count; i++) if (membership[i]) rows.push([id(i), type(i), size(i), membership[i]]);
  rows.sort((a, b) => a[0] - b[0]);
  const aggregate = predicate => {
    const selected = rows.filter(row => predicate(row[3])), byType = {}; let selfSizeBytes = 0;
    for (const row of selected) { selfSizeBytes += row[2]; assert.ok(integer(selfSizeBytes), 'Unsafe self-size sum');
      const t = byType[row[1]] ??= { nodes: 0, selfSizeBytes: 0 }; t.nodes++; t.selfSizeBytes += row[2]; }
    return { nodes: selected.length, selfSizeBytes, byType };
  };
  const oldMask = 7, candidateMask = 56, dataMask = oldMask | candidateMask;
  const summary = {
    meaning: 'One-snapshot selected-edge reachable node self-sizes. Old-only/candidate-only mean graph membership, never allocation, dominant retention, freed bytes or mutation peak. No cross-snapshot ID comparisons.',
    snapshotNodes: count, snapshotEdges: edges.length / ew,
    lexicalRoots: Object.fromEntries([...seeds].map(([label, i]) => [label, { id: id(i), type: type(i), selfSizeBytes: size(i) }])),
    roleRoots: Object.fromEntries(MUTATION_ROLES.map((label, i) => [label, id(roots[i])])),
    roles: Object.fromEntries(MUTATION_ROLES.map((label, i) => [label, aggregate(mask => mask & 1 << i)])),
    oldData: aggregate(mask => mask & oldMask), candidateData: aggregate(mask => mask & candidateMask),
    oldOnly: aggregate(mask => (mask & oldMask) && !(mask & candidateMask)),
    candidateOnly: aggregate(mask => (mask & candidateMask) && !(mask & oldMask)),
    sharedData: aggregate(mask => (mask & oldMask) && (mask & candidateMask)), dataUnion: aggregate(mask => mask & dataMask),
    requestOutsideData: aggregate(mask => (mask & 64) && !(mask & dataMask)),
    changesOutsideDataAndRequest: aggregate(mask => (mask & 128) && !(mask & (dataMask | 64))),
    allSelectedUnion: aggregate(() => true),
  };
  assert.equal(summary.oldData.selfSizeBytes + summary.candidateOnly.selfSizeBytes, summary.dataUnion.selfSizeBytes);
  assert.equal(summary.oldOnly.selfSizeBytes + summary.candidateOnly.selfSizeBytes + summary.sharedData.selfSizeBytes, summary.dataUnion.selfSizeBytes);
  return { summary, roles: MUTATION_ROLES, columns: ['singleSnapshotNodeId', 'type', 'selfSizeBytes', 'selectedRoleMask'], rows };
}
