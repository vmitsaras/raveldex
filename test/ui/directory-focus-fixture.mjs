import { createRaveldex } from '@vmitsaras/raveldex';
import { createDirectory } from '@vmitsaras/raveldex/addons/ui/directory';
import { mountRaveldexDirectory } from '@vmitsaras/raveldex/addons/ui/directory/view';
import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';
const root = document.getElementById('directory');
const engine = createRaveldex({ schema: { text: { body: {} } } });
const records = ['a', 'b', 'c', 'd'].map(id => ({ id, text: { body: 'shared resource' } }));
await engine.addMany(records);
const documents = records.map(({ id }) => ({ id, title: 'Resource ' + id, url: '/resource/' + id + '/' }));
let held, release, holdNext = false, failNext = false;
const calls = [];
const controller = createDirectory({ engine: { ...engine, async search(query, options) {
  calls.push({ query, offset: options.offset });
  if (failNext) { failNext = false; throw Object.assign(new Error('Injected test refusal'), { code: 'WORK_LIMIT_EXCEEDED' }); }
  if (holdNext) {
    holdNext = false; const { signal, ...rest } = options;
    const result = await engine.search(query, rest); window.directoryHeld = true; await held; return result;
  }
  return engine.search(query, options);
} }, pageSize: 2 });
const mount = new URL(location.href).searchParams.get('surface') === 'cards' ? mountRaveldexDirectoryCards : mountRaveldexDirectory;
const view = mount({ root, controller, documents, groups: [], debounceMs: 0 });
window.directoryFocus = {
  root, controller, view, calls, engine, documents, createDirectory, mountRaveldexDirectoryCards,
  hold() { holdNext = true; window.directoryHeld = false; held = new Promise(resolve => { release = resolve; }); },
  release() { release?.(); }, fail() { failNext = true; },
  async cleanup() { release?.(); view.destroy(); controller.destroy(); await engine.dispose(); },
};
await controller.refresh(); window.directoryFocusReady = true;
