// RX-8009 semantic postconditions only; no imports or production scorer/tokenizer.
// The self-contained factory can run in actual Node, browser or worker realms.
export function createPairedVerifier() {
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const ensure = (condition, message) => { if (!condition) throw Error('Paired verification: ' + message); };
  const resourceCodes = ['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'];
  function canonical(value) {
    const seen = new Set();
    function visit(item) {
      if (item === null || typeof item === 'boolean') return String(item);
      if (typeof item === 'string') return JSON.stringify(item);
      if (typeof item === 'number') { ensure(Number.isFinite(item), 'nonfinite data'); return Object.is(item, -0) ? '-0' : String(item); }
      ensure(item && typeof item === 'object' && !seen.has(item), 'unsupported or cyclic data');
      seen.add(item);
      try {
        if (Array.isArray(item)) {
          ensure(Reflect.ownKeys(item).length === item.length + 1, 'sparse or decorated array');
          return '[' + Array.from({ length: item.length }, (_, index) => {
            const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
            ensure(descriptor && 'value' in descriptor, 'array accessor/hole'); return visit(descriptor.value);
          }).join(',') + ']';
        }
        ensure(Object.getPrototypeOf(item) === null || Object.getPrototypeOf(item) === Object.prototype, 'nonplain data');
        const keys = Object.keys(item); ensure(Reflect.ownKeys(item).length === keys.length, 'hidden data');
        return '{' + keys.sort().map(key => {
          const descriptor = Object.getOwnPropertyDescriptor(item, key); ensure(descriptor && 'value' in descriptor, 'accessor data');
          return JSON.stringify(key) + ':' + visit(descriptor.value);
        }).join(',') + '}';
      } finally { seen.delete(item); }
    }
    return visit(value);
  }
  function copy(value) {
    if (value === null || typeof value !== 'object') return value;
    return Array.isArray(value) ? value.map(copy) : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]));
  }
  function equal(a, b, message) { ensure(canonical(a) === canonical(b), message); }
  function errorData(error) {
    return { name: error?.name ?? 'Error', code: error?.code ?? null, reason: error?.reason ?? null, details: error?.details ?? null, message: String(error?.message ?? error) };
  }
  function classify(error) {
    if (!error) return 'Pass';
    if (/UNKNOWN/.test(error.code ?? '') || error.name === 'WorkerAdapterError' && ['TIMEOUT', 'TERMINATED', 'WORKER_UNAVAILABLE'].includes(error.code)) return 'Unknown';
    if (error.code === 'CANCELLED') return 'Cancelled';
    if (resourceCodes.includes(error.code)) return 'Refused';
    return 'Rejected';
  }
  function validateObservation(row) {
    ensure(row && typeof row === 'object', 'observation object');
    ensure(['Pass', 'Refused', 'Rejected', 'Unknown', 'Cancelled', 'Not run'].includes(row.outcome), 'unrecognized outcome');
    if (row.outcome === 'Not run') { ensure(!own(row, 'result') && !own(row, 'error') && typeof row.reason === 'string' && row.reason.length, 'unavailable observation'); return; }
    if (row.outcome === 'Pass') { ensure(own(row, 'result') && row.result !== undefined && !own(row, 'error'), 'success missing result or contains error'); canonical(row.result); return; }
    ensure(!own(row, 'result') && row.error?.code && typeof row.error.message === 'string', 'failure missing typed error or contains result');
    ensure(classify(row.error) === row.outcome, 'error/outcome mismatch'); canonical(row.error);
  }
  function revisionHeaders(result) {
    const revision = result.revision;
    ensure(Number.isSafeInteger(revision) && revision >= 0, 'result revision');
    if (result.extensions?.inspector) {
      const inspector = result.extensions.inspector;
      ensure(inspector.revision === revision && inspector.trace?.revision === revision, 'Inspector revision drift');
    }
    for (const id of ['facets', 'match-evidence', 'snippets']) {
      const extension = result.extensions?.[id];
      if (extension && own(extension, 'revision')) ensure(extension.revision === revision, id + ' revision drift');
    }
    return revision;
  }
  function normalized(result, { allowRevisionChange = false, allowInspectorWorkChange = false } = {}) {
    canonical(result); revisionHeaders(result);
    const data = copy(result), work = data.extensions?.inspector?.resources?.searchWorkUnits;
    if (allowRevisionChange) {
      data.revision = 0;
      if (data.extensions?.inspector) { data.extensions.inspector.revision = 0; data.extensions.inspector.trace.revision = 0; }
      for (const id of ['facets', 'match-evidence', 'snippets']) if (data.extensions?.[id] && own(data.extensions[id], 'revision')) data.extensions[id].revision = 0;
    }
    if (allowInspectorWorkChange && data.extensions?.inspector) {
      ensure(Number.isSafeInteger(work) && work >= 0 && work <= data.extensions.inspector.resources.maxSearchWorkUnits, 'Inspector work budget');
      data.extensions.inspector.resources.searchWorkUnits = 0;
    }
    return { data, work: work ?? null };
  }
  function compareResults(before, after, options = {}) {
    const a = normalized(before, options), b = normalized(after, options);
    equal(a.data, b.data, 'complete native result/trace/facets/evidence/order differs');
    return { status: 'Pass', kind: 'equal-result', normalized: [
      ...(options.allowRevisionChange ? ['known result/extension revision headers'] : []),
      ...(options.allowInspectorWorkChange ? ['inspector.resources.searchWorkUnits'] : []),
    ], inspectorWork: { before: a.work, after: b.work }, stateParityVerified: true };
  }
  function compareOutcomes(before, after, options = {}) {
    validateObservation(before); validateObservation(after);
    if (before.outcome === 'Unknown' || after.outcome === 'Unknown' || before.outcome === 'Not run' || after.outcome === 'Not run') {
      return { status: 'Finding', kind: 'unproven-outcome', before: before.outcome, after: after.outcome, stateParityVerified: false };
    }
    if (before.outcome !== after.outcome) {
      ensure(options.allowCapacityTransition === true && [before.outcome, after.outcome].includes('Pass') && [before.outcome, after.outcome].includes('Refused'), 'undeclared outcome/capacity transition');
      return { status: 'Finding', kind: before.outcome === 'Pass' ? 'capacity-regression' : 'capacity-improvement', before: before.outcome, after: after.outcome, stateParityVerified: false };
    }
    if (before.outcome === 'Pass') return compareResults(before.result, after.result, options);
    equal(before.error, after.error, 'typed error code/reason/details/message drift');
    return { status: 'Pass', kind: 'equal-error', outcome: before.outcome, stateParityVerified: false };
  }
  function replayInspector(result) {
    const inspector = result.extensions?.inspector; ensure(inspector?.kind === 'raveldex-inspector-v1', 'Inspector required'); revisionHeaders(result);
    ensure(inspector.model === result.model && inspector.trace.model === result.model, 'Inspector model');
    ensure(inspector.result.total === result.total && inspector.result.returned === result.hits.length, 'Inspector result counts');
    const resources = inspector.resources;
    ensure(resources?.unit === 'work-v1' && resources.outcome === 'complete' && Number.isSafeInteger(resources.searchWorkUnits) && resources.searchWorkUnits >= 0 && resources.searchWorkUnits <= resources.maxSearchWorkUnits, 'Inspector resource bounds');
    const close = (actual, expected) => ensure(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), 'independent Inspector arithmetic');
    const facts = inspector.trace.facts; ensure(Array.isArray(facts), 'Inspector facts');
    const fields = facts.filter(fact => fact.kind === 'field'); let assertions = 0;
    for (const fact of fields) {
      ensure(fact.k1 === 1.2 && fact.b === .75 && fact.N >= fact.df && fact.df > 0 && fact.N > 0 && fact.tf > 0 && fact.length > 0 && fact.totalLength >= fact.N, 'Inspector statistics/model constants');
      close(fact.avgLength, fact.totalLength / fact.N); close(fact.idf, Math.log(1 + (fact.N - fact.df + .5) / (fact.df + .5)));
      close(fact.normalizer, 1.2 * (.25 + .75 * fact.length / fact.avgLength)); close(fact.tfPart, fact.tf * 2.2 / (fact.tf + fact.normalizer));
      close(fact.base, fact.boost * fact.idf * fact.tfPart); close(fact.selected, fact.weight * fact.base); assertions += 8;
    }
    for (const fact of facts.filter(fact => fact.kind === 'group')) {
      close(fact.score, fields.filter(field => field.id === fact.id && field.group === fact.group).sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : 0).reduce((sum, field) => sum + field.selected, 0)); assertions++;
    }
    for (const fact of facts.filter(fact => fact.kind === 'document')) {
      close(fact.score, facts.filter(group => group.kind === 'group' && group.id === fact.id).sort((a, b) => a.group < b.group ? -1 : a.group > b.group ? 1 : 0).reduce((sum, group) => sum + group.score, 0)); assertions++;
      const hit = result.hits.find(hit => hit.id === fact.id); if (hit) { ensure(hit.score === fact.score, 'Inspector score versus hit'); assertions++; }
    }
    return { status: 'Pass', arithmeticAssertions: assertions, fields: fields.length, scope: 'Independent formula replay over all selected numeric facts; no production scorer/tokenizer call.' };
  }
  async function capturePages(owner, query, { expectedIds, revision, options = {}, pageSize = 100, deadlineMs = 60000, expectedError } = {}) {
    ensure(Array.isArray(expectedIds) && new Set(expectedIds).size === expectedIds.length && expectedIds.every(id => typeof id === 'string'), 'independent expected IDs');
    ensure(Number.isSafeInteger(revision) && revision >= 0, 'expected revision');
    ensure(Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 100, 'page size');
    const eligible = new Set(expectedIds), pages = [], hits = [], seen = new Set(); let previous;
    for (let offset = 0; offset < Math.max(1, eligible.size); offset += pageSize) {
      const limit = Math.min(pageSize, Math.max(1, eligible.size - offset)); let result;
      try { result = await owner.search(query, { ...options, offset, limit, deadlineMs }); }
      catch (error) {
        const data = errorData(error);
        if (expectedError) ensure(data.code === expectedError.code && (!expectedError.path || data.details?.path === expectedError.path), 'expected typed refusal differs');
        return { outcome: classify(data), error: data, complete: false, revision, total: eligible.size, pages, hits, failedOffset: offset };
      }
      ensure(!expectedError, 'declared expected refusal unexpectedly succeeded');
      canonical(result); ensure(result.revision === revision && result.model === 'raveldex-bm25-v1' && result.completeness === 'complete', 'page revision/model/completeness');
      revisionHeaders(result); ensure(result.total === eligible.size && result.hits.length === Math.min(limit, eligible.size - offset), 'exact total/page length');
      if (result.extensions?.inspector) replayInspector(result);
      for (const hit of result.hits) {
        ensure(hit && typeof hit.id === 'string' && eligible.has(hit.id) && !seen.has(hit.id) && Number.isFinite(hit.score), 'ineligible/duplicate/nonfinite hit');
        if (previous) ensure(previous.score > hit.score || previous.score === hit.score && previous.id < hit.id, 'global score/order drift');
        previous = hit; seen.add(hit.id); hits.push(copy(hit));
      }
      pages.push(copy(result));
    }
    ensure(seen.size === eligible.size && expectedIds.every(id => seen.has(id)), 'complete membership differs');
    return { outcome: 'Pass', complete: true, revision, total: eligible.size, hits, pages, pageSize,
      scope: 'Every public result page and exact full membership; numeric scores/order/extensions retained, outside timing.' };
  }
  function compareCaptures(before, after, options = {}) {
    ensure(before && after && typeof before.complete === 'boolean' && typeof after.complete === 'boolean', 'complete capture status required');
    ensure(Array.isArray(before.pages) && Array.isArray(after.pages) && Array.isArray(before.hits) && Array.isArray(after.hits), 'capture pages/hits required');
    ensure((before.outcome === 'Pass') === before.complete && (after.outcome === 'Pass') === after.complete, 'capture outcome/completion mismatch');
    if (!before.complete || !after.complete) {
      const row = capture => capture.outcome === 'Pass' ? { outcome: 'Pass', result: capture.pages[0] } : capture.outcome === 'Not run' ? { outcome: 'Not run', reason: capture.reason } : { outcome: capture.outcome, error: capture.error };
      const compared = compareOutcomes(row(before), row(after), options);
      const shared = Math.min(before.pages.length, after.pages.length);
      const comparisons = Array.from({ length: shared }, (_, index) => compareResults(before.pages[index], after.pages[index], options));
      if (!before.complete && !after.complete && compared.status === 'Pass' && (before.pages.length !== after.pages.length || before.failedOffset !== after.failedOffset)) {
        return { status: 'Finding', kind: 'partial-coverage-transition', completeMembershipVerified: false, beforePages: before.pages.length, afterPages: after.pages.length, beforeFailedOffset: before.failedOffset, afterFailedOffset: after.failedOffset, comparisons };
      }
      if (!before.complete && !after.complete && compared.status === 'Pass') equal(before.hits, after.hits, 'partial ordered scores/membership differs');
      return { ...compared, completeMembershipVerified: false, beforePages: before.pages.length, afterPages: after.pages.length, comparisons };
    }
    ensure(before.outcome === 'Pass' && after.outcome === 'Pass', 'complete capture outcome');
    ensure(before.total === after.total && before.pages.length === after.pages.length && before.pageSize === after.pageSize, 'complete capture coverage differs');
    if (!options.allowRevisionChange) ensure(before.revision === after.revision, 'capture revision differs');
    equal(before.hits, after.hits, 'complete ordered scores/membership differs');
    const comparisons = before.pages.map((page, index) => compareResults(page, after.pages[index], options));
    return { status: 'Pass', kind: 'complete-result-parity', completeMembershipVerified: true, pages: comparisons.length, records: before.total, comparisons };
  }
  function canonicalCore(root, { normalizeRevision = false } = {}) {
    function keys(value, expected, path) {
      ensure(value && typeof value === 'object' && !Array.isArray(value), path + ' object');
      equal(Object.keys(value).sort(), [...expected].sort(), path + ' keys');
      ensure(Object.getPrototypeOf(value) === null || Object.getPrototypeOf(value) === Object.prototype, path + ' plain data');
      ensure(Reflect.ownKeys(value).length === expected.length && expected.every(key => 'value' in Object.getOwnPropertyDescriptor(value, key)), path + ' accessor/hidden data');
    }
    function bucketOf(key) {
      let hash = 2166136261;
      for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
      return String((hash >>> 0) & 255);
    }
    function directory(value, path, transform = item => item) {
      keys(value, ['size', 'buckets'], path);
      ensure(Number.isSafeInteger(value.size) && value.size >= 0, path + ' size');
      const data = Object.create(null), order = [];
      for (const [bucket, entries] of Object.entries(value.buckets)) {
        ensure(/^(0|[1-9][0-9]*)$/.test(bucket) && Number(bucket) < 256 && Object.keys(entries).length > 0, path + ' bucket');
        for (const [key, value] of Object.entries(entries)) {
          ensure(bucketOf(key) === bucket && !own(data, key), path + ' key placement');
          data[key] = transform(value, key); order.push(key);
        }
      }
      ensure(order.length === value.size, path + ' complete directory size');
      return { data, order };
    }
    function validateOrder(node, terms, path) {
      const seen = new Set(), ordered = [];
      function visit(value, lower, upper) {
        if (value === null) return 0;
        keys(value, ['key', 'height', 'left', 'right'], path);
        ensure(!seen.has(value), path + ' repeated node'); seen.add(value);
        ensure(typeof value.key === 'string' && (lower === undefined || value.key > lower) && (upper === undefined || value.key < upper), path + ' ordering');
        const left = visit(value.left, lower, value.key); ordered.push(value.key);
        const right = visit(value.right, value.key, upper);
        ensure(value.height === 1 + Math.max(left, right) && Math.abs(left - right) <= 1, path + ' height/balance');
        return value.height;
      }
      visit(node, undefined, undefined); equal(ordered, Object.keys(terms).sort(), path + ' dictionary membership');
      return { status: 'validated', keys: ordered.length };
    }
    keys(root, ['revision', 'configuration', 'documents', 'fields', 'counts', 'participants'], 'root');
    ensure(Number.isSafeInteger(root.revision) && root.revision >= 0, 'root revision');
    const documents = directory(root.documents, 'documents'), fields = {}, participants = {}, traversal = { documents: documents.order, fields: {}, participants: {} }, derivedOrder = {};
    for (const [name, field] of Object.entries(root.fields)) {
      keys(field, own(field, 'order') ? ['documents', 'length', 'terms', 'order'] : ['documents', 'length', 'terms'], 'field.' + name);
      const postingOrder = {};
      const terms = directory(field.terms, 'field.' + name + '.terms', (term, key) => {
        keys(term, ['df', 'frequency', 'postings'], 'term.' + key);
        const postings = directory(term.postings, 'postings.' + key); postingOrder[key] = postings.order;
        ensure(Number.isSafeInteger(term.df) && term.df === postings.order.length && term.df > 0 && Number.isSafeInteger(term.frequency) && term.frequency >= term.df && Object.values(postings.data).every(tf => Number.isSafeInteger(tf) && tf > 0) && Object.values(postings.data).reduce((sum, tf) => sum + tf, 0) === term.frequency, 'term counts');
        return { df: term.df, frequency: term.frequency, postings: postings.data };
      });
      derivedOrder[name] = own(field, 'order') ? validateOrder(field.order, terms.data, 'field.' + name + '.order') : { status: 'not-present-in-baseline', keys: null };
      fields[name] = { documents: field.documents, length: field.length, terms: terms.data };
      traversal.fields[name] = { terms: terms.order, postings: postingOrder };
    }
    for (const [id, value] of Object.entries(root.participants)) {
      ensure(['raveldex-source-v1', 'raveldex-positions-v1', 'raveldex-positions-v2'].includes(value?.kind), 'unsupported participant ' + id);
      ensure(value.revision === root.revision, 'participant revision ' + id);
      const records = directory(value.records, 'participant.' + id + '.records');
      participants[id] = { ...value, revision: normalizeRevision ? 0 : value.revision, records: records.data };
      traversal.participants[id] = records.order;
    }
    // Reconstruct frequency relations from reverse entries, never from the
    // production tokenizer/scorer or from another root's computed output.
    const expectedFields = Object.fromEntries(Object.keys(fields).map(name => [name, { documents: 0, length: 0, terms: Object.create(null) }]));
    const counts = { documents: documents.order.length, textCodeUnits: 0, tokens: 0, dictionaryEntries: 0, postingEntries: 0 };
    for (const [id, document] of Object.entries(documents.data)) {
      keys(document, ['id', 'textCodeUnits', 'metadata', 'fields'], 'reverse.' + id);
      ensure(document.id === id && Number.isSafeInteger(document.textCodeUnits) && document.textCodeUnits >= 0, 'reverse identity/text count');
      counts.textCodeUnits += document.textCodeUnits;
      for (const [name, reverse] of Object.entries(document.fields)) {
        ensure(own(expectedFields, name), 'unknown reverse field'); keys(reverse, ['length', 'terms'], 'reverse field');
        const field = expectedFields[name]; field.documents++; field.length += reverse.length;
        ensure(Number.isSafeInteger(reverse.length) && reverse.length > 0 && Object.values(reverse.terms).every(tf => Number.isSafeInteger(tf) && tf > 0) && Object.values(reverse.terms).reduce((sum, tf) => sum + tf, 0) === reverse.length, 'reverse frequency/length');
        for (const [term, tf] of Object.entries(reverse.terms)) (field.terms[term] ??= Object.create(null))[id] = tf;
      }
    }
    for (const [name, field] of Object.entries(fields)) {
      const expected = expectedFields[name];
      ensure(field.documents === expected.documents && field.length === expected.length, 'field population/length');
      counts.tokens += field.length; counts.dictionaryEntries += Object.keys(field.terms).length;
      equal(Object.keys(field.terms).sort(), Object.keys(expected.terms).sort(), 'reverse dictionary membership');
      for (const [term, entry] of Object.entries(field.terms)) { equal(entry.postings, expected.terms[term], 'reverse posting frequencies'); counts.postingEntries += entry.df; }
    }
    equal(root.counts, counts, 'complete core counts');
    const configuration = root.configuration;
    keys(configuration, own(configuration, 'capabilities') ? ['schema', 'analyzer', 'limits', 'capabilities'] : ['schema', 'analyzer', 'limits'], 'configuration');
    const data = { revision: normalizeRevision ? 0 : root.revision,
      configuration: { schema: configuration.schema, analyzer: configuration.analyzer, limits: configuration.limits, manifests: (configuration.capabilities?.ordered ?? []).map(entry => entry.manifest) },
      documents: documents.data, fields, counts: root.counts, participants };
    return { canonical: canonical(data), encounterCanonical: canonical(traversal), revision: root.revision,
      summary: { documents: documents.order.length, fields: Object.keys(fields).length, participants: Object.keys(participants).length, counts: copy(root.counts) }, derivedOrder,
      scope: 'Complete core/reverse/postings/statistics/source/position protocol data. Legacy absence of derived order is explicit; present AVL membership/heights/balance validated, derived shape excluded. No fabricated baseline tree.' };
  }
  return { canonical, errorData, classify, compareResults, compareOutcomes, replayInspector, capturePages, compareCaptures, canonicalCore };
}
