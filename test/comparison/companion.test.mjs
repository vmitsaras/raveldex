import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCompanionComparator, COMPANION_IDENTITY } from '../../integrations/minisearch/companion-comparator.mjs';
test('foreign comparator requires explicit public implementation and pinned identity; never falls back', async () => {
  for (const input of [{}, { createLocalSearch() {}, identity: { engine: 'MiniSearch' } }, { createLocalSearch: 'native', identity: COMPANION_IDENTITY }])
    await assert.rejects(createCompanionComparator(input, {}, []), TypeError);
});
test('foreign comparator forwards genuine foreign behavior and identity without native numerical facts', async () => {
  const calls = []; const result = { scoreModel: 'minisearch-7.2.0-companion-v1', hits: [] };
  const fakeInjectedPublic = async options => ({
    addAll: async records => calls.push(['addAll', records]), search: async (...arguments_) => { calls.push(['search', ...arguments_]); return result; },
    explain: async () => ({ scoreModel: 'minisearch-7.2.0-companion-v1', scoreDecomposition: { status: 'unavailable', reason: 'upstream-not-exposed' } }), destroy: async () => calls.push(['destroy']),
  });
  const comparator = await createCompanionComparator({ createLocalSearch: fakeInjectedPublic, identity: COMPANION_IDENTITY }, { schema: {} }, [{ id: 'a' }]);
  assert.equal(await comparator.search({ kind: 'all' }), result); assert.equal(comparator.identity.engine, 'MiniSearch');
  assert.equal((await comparator.explain({}, 'a')).scoreDecomposition.status, 'unavailable');
  assert.match(comparator.limitations.cancellation, /not interruptible/); assert.match(comparator.limitations.phrase, /original field value/);
  await comparator.destroy(); assert.equal(calls[0][0], 'addAll'); assert.equal(calls.at(-1)[0], 'destroy');
});
