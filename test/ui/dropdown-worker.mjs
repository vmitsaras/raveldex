import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
serveRaveldexWorker(self);
self.addEventListener('message', event => {
  if (event.data?.fixtureCrash === true) throw new Error('Intentional dropdown fixture worker failure');
});
