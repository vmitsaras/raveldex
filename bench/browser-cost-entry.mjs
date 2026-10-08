import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { createWorkerSnapshots } from '@vmitsaras/raveldex/adapters/worker/snapshots';
import { createIndexedDBPersistence } from '@vmitsaras/raveldex/adapters/indexeddb';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { METHOD, recordsFor, QUERY_ROWS, updatedRecord, schema, checkPage, observe, notApplicable } from './cost-common.mjs';

const addons = () => [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })];
function checked(value, message) { if (!value) throw Error(message); }
async function owner() {
  const worker = new Worker(new URL('./cost-worker.mjs', import.meta.url), { type: 'module' });
  try { return await createWorkerRaveldex({ worker, configuration: { schema, addons: addons() }, ownership: 'owned', sameHost: true, responseTimeoutMs: 120000 }); }
  catch (error) { worker.terminate(); throw error; }
}
const request = input => new Promise((yes, no) => { input.onsuccess = () => yes(input.result); input.onerror = () => no(input.error); });
async function storeCounts(databaseName) {
  const database = await request(indexedDB.open(databaseName));
  try {
    const transaction = database.transaction([...database.objectStoreNames], 'readonly');
    const done = new Promise((yes, no) => { transaction.oncomplete = yes; transaction.onabort = () => no(transaction.error); });
    const counts = Object.fromEntries(await Promise.all([...database.objectStoreNames].map(async name => [name, await request(transaction.objectStore(name).count())])));
    await done; return counts;
  } finally { database.close(); }
}
window.costHarness = {
  async run(size, repetition, corpusSha256) {
    const records = recordsFor(size), row = { configuration: 'chrome-worker-source-phrase-indexeddb', size, repetition, corpusSha256, samples: [] };
    const progress = operation => console.log('cost-stage ' + JSON.stringify({ size, repetition, operation }));
    let engine, receiver, persistence, receivingStorage;
    const databaseName = `raveldex-rx4001-cost-${size}-${repetition}`, namespace = 'measured';
    try {
      progress('create-owner-worker-handshake');
      const made = await observe(row.samples, 'create-owner-worker-handshake', owner); if (made.error) return row; engine = made.result;
      progress('build-admitted-batches');
      const built = await observe(row.samples, 'build-admitted-batches', async () => { for (let offset = 0; offset < size; offset += METHOD.batchSize) await engine.addMany(records.slice(offset, offset + METHOD.batchSize), { deadlineMs: METHOD.deadlineMs }); });
      if (built.error) return row;
      for (const query of QUERY_ROWS) {
        progress(query.name);
        const cold = await observe(row.samples, query.name, () => engine.search(query.query, { ...METHOD.requestedPage, deadlineMs: METHOD.deadlineMs }), { phase: 'fresh-index-first-call' });
        if (cold.error) continue; cold.sample.result = checkPage(cold.result, records, query);
        for (let warmup = 0; warmup < METHOD.queryWarmups; warmup++) checkPage(await engine.search(query.query, { ...METHOD.requestedPage, deadlineMs: METHOD.deadlineMs }), records, query);
        for (let queryRepetition = 0; queryRepetition < METHOD.queryRepetitions; queryRepetition++) {
          const found = await observe(row.samples, query.name, () => engine.search(query.query, { ...METHOD.requestedPage, deadlineMs: METHOD.deadlineMs }), { phase: 'warm-query', repetition: queryRepetition });
          if (found.result) found.sample.result = checkPage(found.result, records, query);
        }
      }
      progress('replace-one-record');
      const changed = await observe(row.samples, 'replace-one-record', () => engine.replace(updatedRecord, { deadlineMs: METHOD.deadlineMs }));
      if (changed.error) return row; changed.sample.result = changed.result;
      const changedRecords = [updatedRecord, ...records.slice(1)];
      row.updateVerification = checkPage(await engine.search('value7', METHOD.requestedPage), changedRecords, QUERY_ROWS[1]);
      const snapshots = createWorkerSnapshots(engine);
      progress('exportSource');
      const encoded = await observe(row.samples, 'exportSource', () => snapshots.exportSource({ deadlineMs: METHOD.deadlineMs }));
      if (encoded.result) { encoded.sample.encodedBytes = new TextEncoder().encode(encoded.result).length; encoded.sample.encodedCodeUnits = encoded.result.length; }
      else row.samples.push({ operation: 'restoreSource', outcome: 'Not run', reason: 'export rejected' });
      row.samples.push({ operation: 'exportNative', ...notApplicable('browser worker bridge intentionally source-only; native browser profile unqualified') });
      receiver = await owner(); await receiver.add({ id: 'prior', text: { body: 'prior state' } });
      const before = await receiver.search({ kind: 'all' }, { limit: 20 });
      if (encoded.result) {
        progress('restoreSource');
        const restored = await observe(row.samples, 'restoreSource', () => createWorkerSnapshots(receiver).restore(encoded.result, { deadlineMs: METHOD.deadlineMs }));
        if (restored.result) { restored.sample.result = restored.result; for (const query of QUERY_ROWS) checkPage(await receiver.search(query.query, METHOD.requestedPage), changedRecords, query); }
        else { checked(JSON.stringify(await receiver.search({ kind: 'all' }, { limit: 20 })) === JSON.stringify(before), 'failed worker source restore preserves prior owner'); restored.sample.oldStatePreserved = true; }
      }
      persistence = createIndexedDBPersistence(snapshots, { databaseName, namespace, openTimeoutMs: 5000, operationTimeoutMs: 60000 });
      progress('saveSourceIndexedDB-including-export');
      const saved = await observe(row.samples, 'saveSourceIndexedDB-including-export', () => persistence.save({ expectedGeneration: null, deadlineMs: METHOD.deadlineMs }));
      if (saved.result) {
        saved.sample.result = saved.result; row.storeCountsAfterSave = await storeCounts(databaseName);
        checked(row.storeCountsAfterSave.metadata === 1 && row.storeCountsAfterSave.snapshots === 1, 'one namespace occupies both actual stores');
        receivingStorage = createIndexedDBPersistence(createWorkerSnapshots(receiver), { databaseName, namespace, openTimeoutMs: 5000, operationTimeoutMs: 60000 });
        const beforeLoad = await receiver.search({ kind: 'all' }, { limit: 20 });
        progress('loadSourceIndexedDB-including-restore');
        const loaded = await observe(row.samples, 'loadSourceIndexedDB-including-restore', () => receivingStorage.load({ deadlineMs: METHOD.deadlineMs }));
        if (loaded.result) { loaded.sample.result = loaded.result; checked(loaded.result.status === 'restored', 'persisted namespace restored'); for (const query of QUERY_ROWS) checkPage(await receiver.search(query.query, METHOD.requestedPage), changedRecords, query); }
        else { checked(JSON.stringify(await receiver.search({ kind: 'all' }, { limit: 20 })) === JSON.stringify(beforeLoad), 'failed durable load preserves prior owner'); loaded.sample.oldStatePreserved = true; }
        progress('eraseIndexedDB');
        const erased = await observe(row.samples, 'eraseIndexedDB', () => persistence.erase({ expectedGeneration: saved.result.generation, deadlineMs: METHOD.deadlineMs }));
        if (erased.result) { erased.sample.result = erased.result; row.storeCountsAfterErase = await storeCounts(databaseName); checked(Object.values(row.storeCountsAfterErase).every(count => count === 0), 'all namespace rows erased'); }
      } else row.samples.push({ operation: 'loadSourceIndexedDB-including-restore', outcome: 'Not run', reason: 'save rejected' });
      row.workCounters = { outcome: 'Not exposed', reason: 'Public worker facade exposes no execution work counters. Separate Node diagnostic counts describe native generators, not transport/storage work. No generated count stands in for measured browser work.' };
      return row;
    } finally {
      await receivingStorage?.dispose(); await persistence?.dispose(); await receiver?.dispose(); await engine?.dispose();
      await request(indexedDB.deleteDatabase(databaseName));
    }
  },
};
