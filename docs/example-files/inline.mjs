import { createRaveldex } from '@vmitsaras/raveldex';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';

// Import @vmitsaras/raveldex/addons/ui/inline.css separately in your app entry.
// This recipe owns its engine. A mounted UI by itself only borrows an engine.
/** @param {HTMLElement} root */
export async function createInlineSearch(root) {
  const engine = createRaveldex({ schema: { text: { title: { boost: 2 }, body: {} } } });
  try {
    await engine.add({ id: 'updates', text: { title: 'Atomic updates', body: 'Replace a complete record.' } });
    const ui = mountRaveldexInline({ root, engine,
      documents: [{ id: 'updates', title: 'Atomic updates', url: '/guide/updates/' }],
      mode: 'prefix',
      messages: { label: 'Search documentation' },
    });
    return { engine, ui, async dispose() { ui.destroy(); await engine.dispose(); } };
  } catch (error) { await engine.dispose(); throw error; }
}
