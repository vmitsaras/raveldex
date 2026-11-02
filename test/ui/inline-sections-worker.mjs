import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createSectionEvidence } from '@vmitsaras/raveldex/addons/sections';
export function sectionAddons(strategy = 'source', feature = 'sections', settings = {}) {
  return [createSourceProvider({ fields: ['title', 'body'] }),
    ...(strategy === 'offsets' ? [createPositionProvider({ fields: ['title', 'body'], offsets: ['title', 'body'] })] : []),
    ...(feature === 'sections' ? [createSectionEvidence({ fields: { title: strategy, body: strategy }, ...settings })] : [])];
}
if (typeof document === 'undefined') {
  const params = new URL(self.location.href).searchParams;
  serveRaveldexWorker(self, { addons: sectionAddons(params.get('strategy'), params.get('feature'), JSON.parse(params.get('settings') ?? '{}')) });
}
