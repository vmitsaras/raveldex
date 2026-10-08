import { createRaveldex } from '@vmitsaras/raveldex';
import { convertLocalSearchSnapshot } from '@vmitsaras/raveldex/integrations/localsearch';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { createIndexedDBPersistence } from '@vmitsaras/raveldex/adapters/indexeddb';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { expectedRecords, sharedQueries } from './records.mjs';
import { rebuildCompanionSource } from './convert-and-rebuild.mjs';
const dbName = 'raveldex-rx3004-native-converted', namespace = 'converted';
const schema = { text: { title: { boost: 2 }, body: { boost: 1 } }, metadata: { category: { type: 'string', multi: false, nullable: false }, price: { type: 'number', multi: false, nullable: false }, active: { type: 'boolean', multi: false, nullable: false } } };
const config = () => ({ schema, addons: [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })] });
const changed = { id: 'b', text: { title: ['green truck'], body: ['red blue'] }, metadata: { category: 'Guide', price: 99, active: true } };
const plain = value => JSON.parse(JSON.stringify(value));
const same = (left, right, label) => { if (JSON.stringify(left) !== JSON.stringify(right)) throw Error(label + ': ' + JSON.stringify(left) + ' != ' + JSON.stringify(right)); };
const resultWithoutRevision = result => ({ ...result, revision: 0 });
let engine, persistence;
async function independentExpected(mutated = false) {
  const reference = createRaveldex(config()); for (const record of expectedRecords) await reference.add(record); if (mutated) await reference.replace(changed); return reference;
}
async function compare(reference, literal) {
  const rows = [];
  for (const row of sharedQueries) {
    const actual = await engine.search(row.native, { limit: 100 }), expected = await reference.search(row.native, { limit: 100 });
    same(resultWithoutRevision(actual), resultWithoutRevision(expected), 'complete independently configured native semantics');
    if (literal) same(actual.hits.map(hit => hit.id).sort(), row.ids, 'literal membership ' + row.label);
    rows.push({ label: row.label, result: actual });
  }
  return rows;
}
function adapter(owner) { return createIndexedDBPersistence(createSnapshots(owner), { databaseName: dbName, namespace }); }
window.migrationHarness = {
  async prepare() {
    const bytes = new Uint8Array(await (await fetch('/representative.json')).arrayBuffer());
    const converted = await convertLocalSearchSnapshot(bytes);
    same(plain(converted.configuration.schema), schema, 'independent literal schema');
    const migration = await rebuildCompanionSource(bytes); engine = migration.engine;
    const reference = await independentExpected();
    try {
      const queries = await compare(reference, true);
      const mutation = await engine.replace(changed); await reference.replace(changed);
      const afterUpdate = await compare(reference, false);
      persistence = adapter(engine); const saved = await persistence.save({ expectedGeneration: null });
      const source = await migration.snapshots.exportSource();
      await persistence.dispose(); persistence = undefined; await engine.dispose(); engine = undefined;
      return { convertedOrigin: migration.origin, sourceRevision: migration.sourceRevision, queries, mutation, afterUpdate, saved,
        nativeSourceFormat: JSON.parse(source).format, nativeSourceBytes: new TextEncoder().encode(source).length };
    } finally { await reference.dispose(); }
  },
  async recover() {
    engine = createRaveldex(config()); persistence = adapter(engine);
    const reference = await independentExpected(true);
    try {
      const loaded = await persistence.load(); const queries = await compare(reference, false);
      const erased = await persistence.erase({ expectedGeneration: loaded.generation }); const missing = await persistence.load();
      const open = indexedDB.open(dbName); const database = await new Promise((yes, no) => { open.onsuccess = () => yes(open.result); open.onerror = () => no(open.error); });
      let stores;
      try {
        const transaction = database.transaction(['snapshots', 'metadata'], 'readonly');
        const counts = await Promise.all(['snapshots', 'metadata'].map(name => new Promise((yes, no) => { const request = transaction.objectStore(name).count(); request.onsuccess = () => yes(request.result); request.onerror = () => no(request.error); })));
        stores = Object.fromEntries(['snapshots', 'metadata'].map((name, index) => [name, counts[index]]));
      } finally { database.close(); }
      same(stores, { snapshots: 0, metadata: 0 }, 'namespace rows fully erased');
      const afterErase = await compare(reference, false);
      return { loaded, queries, erased, missing, stores, afterErase, completeComparisons: queries.length + afterErase.length };
    } finally { await reference.dispose(); }
  },
  async cleanup() { if (persistence) { await persistence.dispose(); persistence = undefined; } if (engine) { await engine.dispose(); engine = undefined; } },
};
