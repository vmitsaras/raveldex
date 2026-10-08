/** Development-only, explicitly injected foreign public API. Never a Raveldex facade. */
export const COMPANION_IDENTITY = Object.freeze({
  engine: 'MiniSearch', dependency: 'minisearch@7.2.0', companion: '@vmitsaras/localsearch',
  revision: '5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb', scoreModel: 'minisearch-7.2.0-companion-v1',
});
export const COMPARATOR_LIMITATIONS = Object.freeze({
  engine: COMPANION_IDENTITY.engine, scoreModel: COMPANION_IDENTITY.scoreModel,
  analyzer: 'basic-v1 uses NFC-lowercase-NFC; native basic-v1 uses NFKC-lowercase',
  scoring: 'Upstream MiniSearch BM25 policy k=1.2 b=0.7 d=0.5; field lengths and multi-term combination differ from native BM25.',
  numericalExplanation: 'Unavailable: upstream-not-exposed. No native term facts or score decomposition are manufactured.',
  cancellation: 'Companion public signals check before dispatch and between staged work; synchronous upstream MiniSearch retrieval is not interruptible.',
  phrase: 'Companion global tokens/phrase mode verifies adjacency within one original field value; native phrase is an optional query leaf.',
  capacity: 'Companion fixed admission ceilings: 10000 records, 16 text fields, 32 schema fields, 50000 units/text value, 128 values/text array, 100000 array slots, 10000000 source string units, 1000000 indexed tokens; result limit 1..100.',
  persistence: 'Foreign source snapshots require conversion and native rebuild; opaque upstream indexes are unsupported.',
});
export async function createCompanionComparator({ createLocalSearch, identity }, options, records) {
  if (typeof createLocalSearch !== 'function' || !identity || Object.keys(COMPANION_IDENTITY).some(key => identity[key] !== COMPANION_IDENTITY[key]))
    throw new TypeError('An explicit pinned companion public createLocalSearch and matching foreign identity are required.');
  const foreign = await createLocalSearch(options);
  try { if (records.length) await foreign.addAll(records); }
  catch (error) { await foreign.destroy(); throw error; }
  return Object.freeze({
    identity: COMPANION_IDENTITY, limitations: COMPARATOR_LIMITATIONS,
    search(query, controls) { return foreign.search(query, controls); },
    explain(query, id, controls) { return foreign.explain(query, id, controls); },
    destroy() { return foreign.destroy(); },
  });
}
