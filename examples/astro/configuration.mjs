import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';

export function configuration() {
  return { schema: { text: { title: { boost: 2 }, body: {} } },
    addons: [createSourceProvider({ fields: ['title', 'body'] }), createInspector()] };
}
