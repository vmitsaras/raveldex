import { currentNodeSnapshotEnvironment } from '@vmitsaras/raveldex/adapters/snapshots';

export function qualification() {
  return { profileId: 'rx-a100-fixture-node-v1', scope: 'exact-node-runtime',
    environment: currentNodeSnapshotEnvironment(),
    evidence: ['test/integrations/astro/browser.test.mjs: finite matching local Node build/restore; no browser-native portability qualification'] };
}
