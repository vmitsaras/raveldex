import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { createIndexedDBPersistence } from '@vmitsaras/raveldex/adapters/indexeddb';

export async function runBrowserExample(root) {
  const engine = createRaveldex({
    schema: { text: { title: {} } },
    addons: [createSourceProvider({ fields: ['title'] }), createSnippetEvidence({ fields: { title: 'source' } })],
  });
  const persistence = createIndexedDBPersistence(createSnapshots(engine), {
    databaseName: 'raveldex-candidate-example', namespace: root.id || 'example', format: 'source',
  });
  let ui;
  try {
    await engine.add({ id: 'a', text: { title: 'Atomic updates' } });
    // The first write requires this explicit namespace to be empty.
    const saved = await persistence.save({ expectedGeneration: null });
    await engine.clear();
    const loaded = await persistence.load();
    ui = mountRaveldexUI({ root, engine, documents: [{ id: 'a', title: 'Atomic updates', url: '/guide/updates' }], snippetFields: ['title'] });
    root.querySelector('input[type="search"]').value = 'atomic';
    await ui.search();
    const total = (await engine.search('atomic')).total;
    const rendered = root.textContent.includes('Atomic updates');
    const erased = await persistence.erase({ expectedGeneration: saved.generation });
    return { total, rendered, saved, loaded, erased };
  } finally {
    ui?.destroy();
    await persistence.dispose();
    await engine.dispose();
  }
}
