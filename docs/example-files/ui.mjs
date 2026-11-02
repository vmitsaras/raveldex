import { createRaveldex } from '@vmitsaras/raveldex';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';

export async function createSearchUI(root) {
  const engine = createRaveldex({ schema: { text: { title: {}, body: {} } } });
  try {
    await engine.add({ id: 'updates', text: { title: 'Atomic updates', body: 'Replace a complete record.' } });
    const ui = mountRaveldexUI({ root, engine,
      documents: [{ id: 'updates', title: 'Atomic updates', url: '/guide/updates/' }] });
    return { engine, ui, async dispose() { ui.destroy(); await engine.dispose(); } };
  } catch (error) { await engine.dispose(); throw error; }
}
