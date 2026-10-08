import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
export function migrationConfiguration(plan) {
  const fields = Object.keys(plan.configuration.schema.text);
  return { ...plan.configuration, addons: [createSourceProvider({ fields }), createSourcePhrases({ fields })] };
}
export async function addConvertedRecords(engine, records) {
  // Each record is a bounded admission step; a large batch may exceed native admission limits.
  for (const record of records) await engine.add(record);
}
export const withoutRevision = result => ({ ...result, revision: 0 });
