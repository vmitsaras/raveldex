import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
import { makeAddons } from './configuration.mjs';

// The application's explicit module entry selects trusted local capabilities.
// No executable handles or source strings are received from the page.
const strategy = new URL(self.location.href).searchParams.get('representation');
if (strategy !== 'source' && strategy !== 'offsets') throw new Error('Unsupported worker representation');
serveRaveldexWorker(self, { addons: makeAddons(strategy) });
