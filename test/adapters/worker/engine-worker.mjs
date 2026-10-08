import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
import { addonsFor } from './shared-fixture.mjs';
const params = new URL(import.meta.url).searchParams;
if (params.get('startup') === 'crash') throw new Error('Intentional worker startup failure');
const installedHostListeners = new Set();
const trackHost = params.get('fault') === 'duplicate-host';
const scope = trackHost ? {
  postMessage: self.postMessage.bind(self),
  addEventListener(type, listener) { installedHostListeners.add(listener); self.addEventListener(type, listener); },
  removeEventListener(type, listener) { installedHostListeners.delete(listener); self.removeEventListener(type, listener); },
} : params.get('fault') === 'postcommit-loss' ? {
  postMessage(message) { if (message.operation === 'add' && message.kind === 'result') throw new Error('Intentional postcommit send failure'); self.postMessage(message); },
  addEventListener: self.addEventListener.bind(self), removeEventListener: self.removeEventListener.bind(self),
} : self;
const hostOptions = { addons: addonsFor(params.get('strategy') ?? 'source'),
  ...(params.has('cap') ? { maxMessageBytes: Number(params.get('cap')) } : {}),
};
serveRaveldexWorker(scope, hostOptions);
if (trackHost) {
  const before = installedHostListeners.size; let second;
  try { serveRaveldexWorker(scope, hostOptions); second = { accepted: true }; }
  catch (error) { second = { name: error.name, code: error.code }; }
  self.postMessage({ fixture: 'duplicate-host', before, after: installedHostListeners.size, second });
}
