// N10-local verification support. Historical N9 verification stays unchanged.
import { createBulkVerifier } from '../n9/bulk-verify.mjs';

export const RECOVERY_VERIFICATION_REVISION = Object.freeze({
  id: 'rx9006-recovery-verification-2026-11-06-slice2',
  date: '2026-11-06',
  changes: Object.freeze([
    'source-only-unused-position-expectations',
    'per-exercise-authenticated-source-validation',
    'owned-literal-snapshots-with-lazy-source-expectations',
    'diagnostic-only-inclusive-verification-phase-profiling',
  ]),
});

const ensure = (condition, message) => {
  if (!condition) throw Error('Recovery verification: ' + message);
};

// Copy only strict literal data, without invoking authored accessors or losing
// own __proto__/constructor keys, -0, array order or legitimate shared objects.
// This ownership copy precedes native calls. Sorting/canonical expectation work
// remains lazy; its allocation/warming differs from the historical harness.
function ownLiteral(value) {
  const active = new Set(), copies = new Map();
  function copy(item) {
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return item;
    if (typeof item === 'number') {
      ensure(Number.isFinite(item), 'literal finite number');
      return item;
    }
    ensure(item !== null && typeof item === 'object', 'literal supported data');
    ensure(!active.has(item), 'literal cycle');
    if (copies.has(item)) return copies.get(item);
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    ensure(array || prototype === null || prototype === Object.prototype, 'literal plain object');
    const keys = Object.keys(item);
    ensure(Reflect.ownKeys(item).length === keys.length + Number(array), 'literal enumerable data');
    if (array) ensure(keys.length === item.length, 'literal dense array');
    const result = array ? new Array(item.length) : Object.create(prototype);
    copies.set(item, result); active.add(item);
    try {
      for (let index = 0; index < keys.length; index++) {
        const key = array ? String(index) : keys[index];
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        ensure(descriptor && descriptor.enumerable && 'value' in descriptor, 'literal data descriptor');
        Object.defineProperty(result, key, {
          value: copy(descriptor.value), enumerable: true, writable: false, configurable: false,
        });
      }
      return Object.freeze(result);
    } finally { active.delete(item); }
  }
  return copy(value);
}

function freezeParsed(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if ('value' in descriptor) freezeParsed(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
}

export function createRecoveryVerification({ records, priorRecord, variant, profile }) {
  ensure(Array.isArray(records), 'literal records array');
  ensure(variant === 'source' || variant === 'positions-offsets', 'variant');
  const verifier = createBulkVerifier(), expectations = new Map();
  let closed = false, sources = new WeakMap(), populations = new WeakMap();
  const open = () => ensure(!closed, 'exercise released');
  const mintPopulation = data => {
    const token = Object.freeze({}); populations.set(token, data); return token;
  };
  const donorPopulation = mintPopulation({ kind: 'donor', records: profile ? profile.sync('expected.literal-ownership','donor',()=>ownLiteral(records)) : ownLiteral(records) });
  const priorPopulation = mintPopulation({ kind: 'prior', records: profile ? profile.sync('expected.literal-ownership','prior',()=>ownLiteral([priorRecord])) : ownLiteral([priorRecord]) });
  function populationData(population) {
    open(); const data = populations.get(population);
    ensure(data, 'authentic literal population'); return data;
  }
  function expectedRecords(population) {
    const data = populationData(population);
    if (!data.records) {
      const base = populationData(data.basePopulation).records;
      data.records = Object.freeze(base.map(record => record.id === data.replacement.id ? data.replacement : record));
    }
    return data.records;
  }
  function expected(population) {
    return profile ? profile.sync('expected.source-and-ids',populationData(population).kind,()=>expectedValue(population)) : expectedValue(population);
  }
  function expectedValue(population) {
    const data = populationData(population);
    // A label/hash/ID is not authority. Base tokens own full immutable literal
    // data; later populations also compare the complete owned replacement.
    const replacementCanonical = data.replacement ? verifier.canonical(data.replacement) : null;
    const cached = expectations.get(data.kind);
    if (cached && (data.replacement
      ? cached.basePopulation === data.basePopulation && cached.replacementCanonical === replacementCanonical
      : cached.population === population)) return cached;
    const literal = expectedRecords(population);
    const payload = literal.map(record => Object.freeze({
      id: record.id,
      text: Object.freeze({ body: Object.freeze(Array.isArray(record.text.body) ? [...record.text.body] : [record.text.body]) }),
      metadata: record.metadata ?? Object.freeze({}),
    })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    Object.freeze(payload);
    const value = Object.freeze({
      population, basePopulation: data.basePopulation, replacementCanonical,
      ids: Object.freeze(literal.map(record => record.id).sort()),
      sourceCanonical: verifier.canonical(payload),
    });
    expectations.set(data.kind, value); return value;
  }
  function prepareLaterWrite(basePopulation, record) {
    const base = populationData(basePopulation);
    ensure(base.kind === 'donor' || base.kind === 'prior', 'later-write base population');
    return mintPopulation({ kind: 'postwrite-' + base.kind, basePopulation, replacement: ownLiteral(record) });
  }
  function validateSource(encoded,label='') {
    open();
    // Every invocation validates a newly captured value, even when its bytes
    // happen to equal a previous capture. There is no encoded-string cache.
    const facts = profile ? profile.sync('source.parse-checksum-canonicalization',label,()=>freezeParsed(verifier.sourceSnapshot(encoded))) : freezeParsed(verifier.sourceSnapshot(encoded));
    const handle = Object.freeze({}); sources.set(handle, { encoded, facts }); return handle;
  }
  function sourceFacts(handle, encoded) {
    open(); const value = sources.get(handle);
    ensure(value, 'authentic validated source handle');
    ensure(value.encoded === encoded, 'exact encoded source binding');
    return value.facts;
  }
  function verifySource(handle, encoded, population,label='') {
    const facts = sourceFacts(handle, encoded), literal = expected(population);
    const compare=()=>ensure(verifier.canonical(facts.payload) === literal.sourceCanonical, 'complete literal source/metadata');
    if(profile)profile.sync('source.actual-literal-comparison',label,compare);else compare();
    return Object.freeze({ outcome: 'Pass', records: facts.records });
  }
  function compareSources(beforeHandle, beforeEncoded, afterHandle, afterEncoded,label='') {
    const before = sourceFacts(beforeHandle, beforeEncoded), after = sourceFacts(afterHandle, afterEncoded);
    const compare=()=>ensure(before.canonical === after.canonical, 'complete source header/records/metadata differ');
    if(profile)profile.sync('source.validated-parity',label,compare);else compare();
    return Object.freeze({
      outcome: 'Pass', records: after.records,
      donorRevision: before.originRevision, receiverRevision: after.originRevision,
      normalized: Object.freeze(['body.header.originRevision', 'integrity.value']),
      scope: 'Complete public source snapshot, including all raw field arrays and metadata; both checksums verified.',
    });
  }
  function release() {
    closed = true; expectations.clear(); sources = new WeakMap(); populations = new WeakMap();
  }
  return Object.freeze({
    donorPopulation, priorPopulation, prepareLaterWrite, expectedRecords,
    expectedIds: population => expected(population).ids,
    validateSource, sourceFacts, verifySource, compareSources, release,
  });
}
