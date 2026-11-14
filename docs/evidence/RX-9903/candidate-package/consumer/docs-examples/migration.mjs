import { createRaveldex } from '@vmitsaras/raveldex';
import { convertLocalSearchSnapshot } from '@vmitsaras/raveldex/integrations/localsearch';

export async function runMigrationExample(bytes) {
  const plan = await convertLocalSearchSnapshot(bytes);
  const candidate = createRaveldex(plan.configuration);
  try {
    // Each small batch is atomic; the complete rebuild uses a separate owner.
    for (let offset = 0; offset < plan.records.length; offset += 32) {
      await candidate.addMany(plan.records.slice(offset, offset + 32));
    }
    return { identity: plan.identity, differences: plan.differences, page: await candidate.search({ kind: 'all' }) };
  } finally { await candidate.dispose(); }
}
