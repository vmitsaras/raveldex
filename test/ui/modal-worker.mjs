import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
import { modalAddons } from './modal-configuration.mjs';

const params = new URL(self.location.href).searchParams;
serveRaveldexWorker(self, { addons: modalAddons(params.get('strategy'), params.get('feature'), params.get('facets') === 'true') });
self.addEventListener('message', event => { if (event.data?.fixtureCrash === true) throw new Error('Intentional modal fixture worker failure'); });
