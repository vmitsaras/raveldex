import { createRaveldex } from '@vmitsaras/raveldex';
import { convertLocalSearchSnapshot } from '@vmitsaras/raveldex/integrations/localsearch';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';

/** Caller-owned bytes and explicit rebuild; no automatic storage or foreign runtime. */
export async function rebuildCompanionSource(bytes) {
  const plan = await convertLocalSearchSnapshot(bytes);
  const fields = Object.keys(plan.configuration.schema.text);
  const engine = createRaveldex({ ...plan.configuration, addons: [createSourceProvider({ fields }), createSourcePhrases({ fields })] });
  try {
    for (const record of plan.records) await engine.add(record);
    const snapshots = createSnapshots(engine);
    const source = await snapshots.exportSource();
    return Object.freeze({ engine, snapshots, source, origin: plan.origin, sourceRevision: plan.sourceRevision,
      legacyReturnFields: plan.returnFields, differences: plan.differences });
  } catch (error) { await engine.dispose(); throw error; }
}
