// RX-8008 postconditions only. Call outside timing/memory windows. No imports:
// the factory can be serialized into an actual worker's diagnostic controller.
// Private roots stay in that controller; only canonical strings leave it.
export function createBulkVerifier() {
  const ensure = (condition, message) => { if (!condition) throw Error('Bulk verification: ' + message); };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  function entries(value, path) {
    ensure(value !== null && typeof value === 'object' && !Array.isArray(value), path + ' object');
    const prototype = Object.getPrototypeOf(value);
    ensure(prototype === null || prototype === Object.prototype, path + ' plain data');
    const keys = Object.keys(value);
    ensure(Reflect.ownKeys(value).length === keys.length, path + ' non-enumerable/symbol data');
    return keys.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      ensure(descriptor && 'value' in descriptor, path + '.' + key + ' accessor');
      return [key, descriptor.value];
    });
  }
  function exactKeys(value, expected, path) {
    const actual = entries(value, path).map(([key]) => key).sort();
    ensure(JSON.stringify(actual) === JSON.stringify([...expected].sort()), path + ' keys');
  }
  // Sort maps but preserve array/value order and absent-vs-empty distinctions.
  // -0 is retained in private state; user metadata named "revision" is data.
  function canonical(value) {
    const active = new Set();
    function visit(item, path) {
      if (item === null || typeof item === 'boolean') return String(item);
      if (typeof item === 'string') return JSON.stringify(item);
      if (typeof item === 'number') { ensure(Number.isFinite(item), path + ' finite number'); return Object.is(item, -0) ? '-0' : String(item); }
      ensure(typeof item === 'object' && !active.has(item), path + ' unsupported/cyclic data');
      active.add(item);
      try {
        if (Array.isArray(item)) {
          ensure(Reflect.ownKeys(item).length === item.length + 1, path + ' dense array');
          return '[' + Array.from({ length: item.length }, (_, index) => {
            const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
            ensure(descriptor && 'value' in descriptor, path + '[' + index + '] accessor/hole');
            return visit(descriptor.value, path + '[' + index + ']');
          }).join(',') + ']';
        }
        return '{' + entries(item, path).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
          .map(([key, child]) => JSON.stringify(key) + ':' + visit(child, path + '.' + key)).join(',') + '}';
      } finally { active.delete(item); }
    }
    return visit(value, 'data');
  }
  function checksum(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  function sourceSnapshot(encoded) {
    ensure(typeof encoded === 'string', 'source snapshot text');
    const envelope = JSON.parse(encoded);
    exactKeys(envelope, ['format', 'formatVersion', 'codec', 'body', 'integrity'], 'snapshot');
    ensure(envelope.format === 'raveldex-source' && envelope.formatVersion === 1, 'source snapshot format');
    ensure(canonical(envelope.codec) === canonical({ id: 'raveldex-json-v1', version: 1 }), 'source snapshot codec');
    exactKeys(envelope.body, ['header', 'payload'], 'snapshot.body');
    exactKeys(envelope.body.payload, ['records'], 'snapshot.payload');
    exactKeys(envelope.integrity, ['algorithm', 'value'], 'snapshot.integrity');
    ensure(envelope.integrity.algorithm === 'fnv1a32-utf16' && envelope.integrity.value === checksum(canonical(envelope.body)), 'source snapshot integrity');
    const header = envelope.body.header, records = envelope.body.payload.records;
    ensure(Number.isSafeInteger(header.originRevision) && header.originRevision >= 0, 'source origin revision');
    ensure(Array.isArray(records), 'source records');
    let previous;
    for (const record of records) {
      exactKeys(record, ['id', 'text', 'metadata'], 'source record');
      ensure(typeof record.id === 'string' && (previous === undefined || previous < record.id), 'source record order/duplicate');
      previous = record.id;
    }
    return { canonical: canonical({ ...envelope, body: { ...envelope.body, header: { ...header, originRevision: 0 } }, integrity: { algorithm: envelope.integrity.algorithm } }),
      originRevision: header.originRevision, records: records.length, ids: records.map(record => record.id), payload: records };
  }
  function compareSourceSnapshots(expected, actual) {
    const before = sourceSnapshot(expected), after = sourceSnapshot(actual);
    ensure(before.canonical === after.canonical, 'complete source header/records/metadata differ');
    return { outcome: 'Pass', records: after.records, donorRevision: before.originRevision, receiverRevision: after.originRevision,
      normalized: ['body.header.originRevision', 'integrity.value'], scope: 'Complete public source snapshot, including all raw field arrays and metadata; both checksums verified.' };
  }
  function bucketOf(key) {
    let hash = 2166136261;
    for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
    return String((hash >>> 0) & 255);
  }
  function directory(value, path, map = item => item) {
    exactKeys(value, ['size', 'buckets'], path);
    ensure(Number.isSafeInteger(value.size) && value.size >= 0, path + ' size');
    const result = Object.create(null), order = [];
    for (const [bucket, values] of entries(value.buckets, path + '.buckets')) {
      ensure(/^(0|[1-9][0-9]*)$/.test(bucket) && Number(bucket) < 256, path + ' bucket');
      const contents = entries(values, path + '.bucket.' + bucket);
      ensure(contents.length > 0, path + ' empty bucket');
      for (const [key, item] of contents) {
        ensure(bucketOf(key) === bucket && !own(result, key), path + ' bucket/key placement');
        result[key] = map(item, key); order.push(key);
      }
    }
    ensure(order.length === value.size, path + ' full size');
    return { data: result, order };
  }
  function orderedTerms(root, terms, path) {
    const seen = new Set(), keys = [];
    function visit(node, lower, upper) {
      if (node === null) return 0;
      exactKeys(node, ['key', 'height', 'left', 'right'], path);
      ensure(!seen.has(node), path + ' repeated/cyclic node'); seen.add(node);
      ensure(typeof node.key === 'string' && (lower === undefined || node.key > lower) && (upper === undefined || node.key < upper), path + ' key ordering');
      const left = visit(node.left, lower, node.key); keys.push(node.key);
      const right = visit(node.right, node.key, upper);
      ensure(node.height === 1 + Math.max(left, right) && Math.abs(left - right) <= 1, path + ' height/balance');
      return node.height;
    }
    visit(root, undefined, undefined);
    ensure(canonical(keys) === canonical(Object.keys(terms).sort()), path + ' dictionary membership');
    return keys;
  }
  function rootState(root) {
    exactKeys(root, ['revision', 'configuration', 'documents', 'fields', 'counts', 'participants'], 'root');
    ensure(Number.isSafeInteger(root.revision) && root.revision >= 0, 'root revision');
    const documents = directory(root.documents, 'documents'), traversal = { documents: documents.order, fields: {}, participants: {} };
    const fields = Object.create(null), participants = Object.create(null);
    for (const [name, field] of entries(root.fields, 'fields')) {
      exactKeys(field, ['documents', 'length', 'terms', 'order'], 'field.' + name);
      const postingOrder = Object.create(null);
      const terms = directory(field.terms, 'field.' + name + '.terms', (term, key) => {
        exactKeys(term, ['df', 'frequency', 'postings'], 'term.' + key);
        const postings = directory(term.postings, 'postings.' + key); postingOrder[key] = postings.order;
        return { df: term.df, frequency: term.frequency, postings: postings.data };
      });
      fields[name] = { documents: field.documents, length: field.length, terms: terms.data, order: orderedTerms(field.order, terms.data, 'field.' + name + '.order') };
      traversal.fields[name] = { terms: terms.order, postings: postingOrder };
    }
    for (const [id, participant] of entries(root.participants, 'participants')) {
      ensure(['raveldex-source-v1', 'raveldex-positions-v1', 'raveldex-positions-v2'].includes(participant?.kind), 'unsupported participant ' + id);
      ensure(participant.revision === root.revision, 'participant revision ' + id);
      // Preserve every protocol field/counter and every occurrence/offset. Only
      // the known protocol header revision and directory layout are normalized.
      const data = Object.fromEntries(entries(participant, 'participant.' + id));
      const records = directory(data.records, 'participant.' + id + '.records');
      participants[id] = { ...data, revision: 0, records: records.data };
      traversal.participants[id] = records.order;
    }
    const configuration = root.configuration;
    exactKeys(configuration, own(configuration, 'capabilities') ? ['schema', 'analyzer', 'limits', 'capabilities'] : ['schema', 'analyzer', 'limits'], 'configuration');
    const projection = { configuration: { schema: configuration.schema, analyzer: configuration.analyzer, limits: configuration.limits,
      manifests: (configuration.capabilities?.ordered ?? []).map(entry => entry.manifest) },
      documents: documents.data, fields, counts: root.counts, participants };
    return { canonical: canonical(projection), encounterCanonical: canonical(traversal), revision: root.revision,
      summary: { documents: documents.order.length, fields: Object.keys(fields).length, participants: Object.keys(participants).length, counts: { ...root.counts } },
      scope: 'Complete core/reverse/dictionary/postings/statistics and selected source/position protocol data; AVL membership/heights/balance validated, shape excluded. Known header revisions normalized. No scorer/tokenizer oracle or heap claim.' };
  }
  function compareRootStates(expected, actual, { encounterOrder = false } = {}) {
    const before = rootState(expected), after = rootState(actual);
    ensure(before.canonical === after.canonical, 'complete private core/sidecar state differs');
    if (encounterOrder) ensure(before.encounterCanonical === after.encounterCanonical, 'native encounter order differs');
    return { outcome: 'Pass', ...after.summary, encounterOrderChecked: encounterOrder, scope: after.scope };
  }
  async function enumerateMembership(owner, expectedIds, revision, { pageSize = 100, deadlineMs = 60000 } = {}) {
    ensure(Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 100, 'membership page size');
    const expected = [...expectedIds].sort();
    ensure(new Set(expected).size === expected.length, 'duplicate expected ids');
    const actual = [], seen = new Set(); let pages = 0;
    for (let offset = 0; offset < Math.max(1, expected.length); offset += pageSize) {
      const limit = Math.min(pageSize, Math.max(1, expected.length - offset));
      const result = await owner.search({ kind: 'all' }, { offset, limit, deadlineMs }); pages++;
      ensure(result.revision === revision && result.completeness === 'complete' && result.model === 'raveldex-bm25-v1', 'membership revision/completeness/model');
      ensure(result.total === expected.length && result.hits.length === Math.min(limit, expected.length - offset), 'membership total/full page');
      for (const hit of result.hits) {
        ensure(typeof hit.id === 'string' && hit.score === 0 && !seen.has(hit.id), 'membership invalid/duplicate hit or all-query score');
        seen.add(hit.id); actual.push(hit.id);
      }
    }
    ensure(canonical(actual) === canonical(expected), 'complete membership or ordinal tie order differs');
    return { outcome: 'Pass', records: actual.length, pages, pageSize, ids: actual, scope: 'Every all-query membership page, outside timing; exact total/revision, unique ids, zero scores and ordinal tie order.' };
  }
  return { canonical, sourceSnapshot, compareSourceSnapshots, rootState, compareRootStates, enumerateMembership };
}
