import assert from 'node:assert/strict';

export const COLLECTION_ROLES = ['reverseDocuments', 'dictionaryPostingsStatistics', 'sourceOrPositions'];
export const COLLECTION_BRANCHES = ['noop', 'side', 'reverse', 'fields', 'joint'];

// Read a selected-edge cohort. Cross-snapshot ID presence is a literal graph
// fact, not proof of object identity or collection: real dumps reused IDs.
export function collectionGraph(snapshot) {
  const meta = snapshot?.snapshot?.meta, { nodes, edges, strings } = snapshot ?? {};
  assert.ok(meta && Array.isArray(nodes) && Array.isArray(edges) && Array.isArray(strings));
  const nf = meta.node_fields, ef = meta.edge_fields;
  assert.ok(Array.isArray(nf) && Array.isArray(ef));
  assert.equal(new Set(nf).size, nf.length); assert.equal(new Set(ef).size, ef.length);
  const n = key => { const at = nf.indexOf(key); assert.ok(at >= 0, `Missing node ${key}`); return at; };
  const e = key => { const at = ef.indexOf(key); assert.ok(at >= 0, `Missing edge ${key}`); return at; };
  const nt = n('type'), ni = n('id'), ns = n('self_size'), nn = n('name'), nc = n('edge_count');
  const et = e('type'), en = e('name_or_index'), to = e('to_node'), nw = nf.length, ew = ef.length;
  const nodeTypes = meta.node_types[nt], edgeTypes = meta.edge_types[et];
  assert.ok(Array.isArray(nodeTypes) && Array.isArray(edgeTypes));
  for (const [field, at] of [['id', ni], ['self_size', ns], ['edge_count', nc]]) assert.equal(meta.node_types[at], 'number', `Contradictory ${field}`);
  assert.equal(meta.node_types[nn], 'string'); assert.equal(meta.edge_types[en], 'string_or_number'); assert.equal(meta.edge_types[to], 'node');
  assert.equal(nodes.length % nw, 0); assert.equal(edges.length % ew, 0);
  const count = nodes.length / nw, offsets = new Float64Array(count + 1), byId = new Map();
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  for (let index = 0; index < count; index++) {
    const base = index * nw, id = nodes[base + ni], size = nodes[base + ns], name = strings[nodes[base + nn]], type = nodeTypes[nodes[base + nt]], children = nodes[base + nc];
    assert.ok(integer(id) && integer(size) && integer(children) && !byId.has(id) && typeof name === 'string' && typeof type === 'string', 'Invalid heap node');
    byId.set(id, { id, size, type, name, index }); offsets[index + 1] = offsets[index] + children * ew;
    assert.ok(Number.isSafeInteger(offsets[index + 1]) && offsets[index + 1] <= edges.length, 'Invalid edge-count offset');
  }
  assert.equal(offsets[count], edges.length);
  const nodeType = index => nodeTypes[nodes[index * nw + nt]];
  function entries(index) {
    const result = [];
    for (let at = offsets[index]; at < offsets[index + 1]; at += ew) {
      const type = edgeTypes[edges[at + et]], target = edges[at + to] / nw, value = edges[at + en];
      const name = type === 'element' || type === 'hidden' ? value : strings[value];
      assert.ok(typeof type === 'string' && Number.isInteger(target) && target >= 0 && target < count && (typeof name === 'string' || integer(name)), 'Invalid heap edge');
      result.push({ type, name, target });
    }
    return result;
  }
  function globalTarget(label) {
    let target;
    for (let index = 0; index < count; index++) for (const edge of entries(index)) if (edge.type === 'property' && edge.name === label) {
      assert.equal(target, undefined, `Duplicate ${label}`); target = edge.target;
    }
    assert.ok(target !== undefined, `Missing ${label}`); return target;
  }
  const marker = globalTarget('__raveldexCollectionHolders'), external = globalTarget('__raveldexCollectionExternal');
  const props = index => new Map(entries(index).filter(edge => edge.type === 'property' && edge.name !== '__proto__').map(edge => [edge.name, edge.target]));
  const groups = props(marker); assert.ok(groups.has('data') && groups.has('controls'));
  const data = props(groups.get('data')), controls = props(groups.get('controls'));
  const ids = properties => Object.fromEntries([...properties].map(([name, index]) => [name, nodes[index * nw + ni]]));
  const permitted = (index, edge) => edge.type === 'property' ? edge.name !== '__proto__' : edge.type === 'element' || edge.type === 'internal' &&
    (['properties', 'elements'].includes(edge.name) || nodeType(index) === 'array' && /^(0|[1-9][0-9]*)$/.test(edge.name) ||
      ['string', 'concatenated string', 'sliced string'].includes(nodeType(index)) && ['first', 'second', 'parent'].includes(edge.name));
  const membership = new Map();
  for (const [roleIndex, role] of COLLECTION_ROLES.entries()) {
    if (!data.has(role)) continue;
    const visited = new Set(), stack = [data.get(role)];
    while (stack.length) {
      const index = stack.pop(); if (visited.has(index)) continue; visited.add(index);
      const id = nodes[index * nw + ni]; membership.set(id, (membership.get(id) ?? 0) | 1 << roleIndex);
      for (const edge of entries(index)) if (permitted(index, edge)) stack.push(edge.target);
    }
  }
  return { byId, membership, roots: ids(data), controls: ids(controls), externalId: nodes[external * nw + ni], nodeCount: count };
}

export function compareCollectionCohort(baseline, noop, final) {
  const rows = [...baseline.membership].map(([id, membership]) => {
    const first = baseline.byId.get(id), second = noop.byId.get(id), third = final.byId.get(id);
    return [id, first.type, first.size, membership, 1 | (second ? 2 : 0) | (third ? 4 : 0), second?.size ?? null, third?.size ?? null];
  }).sort((a, b) => a[0] - b[0]);
  const total = selected => {
    const baselineSelfSizeBytes = selected.reduce((sum, row) => sum + row[2], 0);
    assert.ok(Number.isSafeInteger(baselineSelfSizeBytes), 'Unsafe selected-size sum');
    return { nodes: selected.length, baselineSelfSizeBytes };
  };
  const noOpMissing = rows.filter(row => !(row[4] & 2)), finalMissing = rows.filter(row => !(row[4] & 4));
  const intervalMissing = rows.filter(row => row[4] & 2 && !(row[4] & 4));
  return { columns: ['snapshotNodeId', 'baselineType', 'baselineSelfSizeBytes', 'selectedRoleMask', 'snapshotPresenceMask', 'noopSameIdSelfSizeBytes', 'finalSameIdSelfSizeBytes'], rows,
    summary: { attributionStatus: 'Blocked', identity: auditCollectionIdentity(baseline, noop, final),
      baseline: total(rows), baselineToNoopMissing: total(noOpMissing), baselineToFinalMissing: total(finalMissing), noopToFinalMissing: total(intervalMissing),
      reappearedIds: rows.filter(row => !(row[4] & 2) && row[4] & 4).map(row => row[0]),
      sameIdRecordedSizeDifferences: rows.filter(row => row[4] & 4 && row[6] !== row[2]).map(row => ({ id: row[0], baseline: row[2], final: row[6] })),
      finalMissingBySelectedRoleMask: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(mask => [mask, total(finalMissing.filter(row => row[3] === mask))])),
      meaning: 'Raw node-ID presence and recorded baseline-size arithmetic only. ID absence/presence is not accepted as original-object collection/survival or retained/freed-byte attribution. Descriptor conflicts prove ambiguity; matching descriptors cannot exclude same-type/name reuse. Direct WeakRef root evidence is separate.' } };
}

export function auditCollectionIdentity(baseline, noop, final) {
  const conflicts = [];
  for (const id of baseline.membership.keys()) {
    const first = baseline.byId.get(id);
    for (const [stage, graph] of [['noop', noop], ['final', final]]) {
      const later = graph.byId.get(id); if (!later) continue;
      if (later.type !== first.type || later.name !== first.name) conflicts.push({ id, stage,
        baseline: { type: first.type, name: first.name, size: first.size },
        later: { type: later.type, name: later.name, size: later.size } });
    }
  }
  return { attributionStatus: 'Blocked', observedDescriptorConflicts: conflicts, sameDescriptorDoesNotProveIdentity: true,
    meaning: 'Type/name conflicts reject the original-object interpretation. Zero detected conflicts is not a positive identity guarantee, including for same-type/name address or ID reuse.' };
}
