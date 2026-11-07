// Type-only validation of the public entries/options described in the guide.
// This function is never executed and is not runtime/browser qualification.
import { createRaveldex } from '@vmitsaras/raveldex';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import { mountRaveldexDropdown } from '@vmitsaras/raveldex/addons/ui/dropdown';
import { createDirectory, connectDirectoryURL } from '@vmitsaras/raveldex/addons/ui/directory';
import { mountRaveldexDirectory } from '@vmitsaras/raveldex/addons/ui/directory/view';
import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';

export async function checkDocumentedOptions(root: HTMLElement, trigger: HTMLButtonElement) {
  const engine = createRaveldex({ schema: { text: { title: { boost: 2 }, body: {} } } });
  const documents = [{ id: 'updates', title: 'Atomic updates', url: '/guide/updates/' }];
  const inline = mountRaveldexInline({ root, engine, documents, mode: 'prefix' });
  const modal = mountRaveldexModal({ root, engine, documents, trigger, mode: 'prefix', resetOnClose: false });
  const dropdown = mountRaveldexDropdown({ root, engine, documents, mode: 'prefix', fullResults: { url: '/search/' } });
  const controller = createDirectory({ engine, groups: [], mode: 'prefix' });
  const view = mountRaveldexDirectory({ root, controller, documents, groups: [] });
  const cards = mountRaveldexDirectoryCards({ root, controller, documents: [{ ...documents[0]!, excerpt: 'Replace a complete record.' }],
    groups: [], presentation: { layout: 'grid', density: 'comfortable', images: false } });
  const bindingFactory: typeof connectDirectoryURL = connectDirectoryURL;
  void bindingFactory;
  inline.destroy(); modal.destroy(); dropdown.destroy(); view.destroy(); cards.destroy();
  controller.destroy();
  await engine.dispose();
}
