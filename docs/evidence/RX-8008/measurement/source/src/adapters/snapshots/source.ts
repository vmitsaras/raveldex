import { requireSourceRoot } from '../../addons/phrases/store.js';
import { directoryEntries, directoryGet } from '../../core/index/directory.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { IndexRoot } from '../../core/index/state.js';
import type { RecordInput } from '../../core/contracts/types.js';
import { fail } from './error.js';

/** Complete originals are required even for empty state; omitted fields and
 * explicit empty value arrays retain their distinct original representation. */
export function* sourceRecords(root: IndexRoot): Generator<WorkStep, readonly RecordInput[]> {
  const fields = Object.keys(root.configuration.schema.text);
  const providers = requireCompleteSource(root);
  const records: RecordInput[] = [];
  for (const [id, entry] of directoryEntries(root.documents)) {
    yield { workUnits: id.length + 1 };
    const text: Record<string, readonly string[]> = Object.create(null) as typeof text;
    let textCodeUnits = 0;
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index]!, retained = directoryGet(providers[index]!.records, id);
      yield { workUnits: id.length + field.length + 1 };
      if (!retained) fail('INVALID_NATIVE_STATE');
      if (Object.hasOwn(retained.text, field)) {
        text[field] = retained.text[field]!;
        for (const value of text[field]!) { yield { workUnits: value.length + 1 }; textCodeUnits += value.length; }
      }
    }
    if (textCodeUnits !== entry.textCodeUnits) fail('INVALID_NATIVE_STATE');
    records.push(Object.freeze({ id, text: Object.freeze(text), metadata: entry.metadata }));
  }
  for (const record of records) yield { workUnits: record.id.length + Math.ceil(Math.log2(records.length + 1)) + 1 };
  records.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return Object.freeze(records);
}

export function requireCompleteSource(root: IndexRoot): readonly ReturnType<typeof requireSourceRoot>[] {
  return Object.keys(root.configuration.schema.text).map(field => {
    const registration = root.configuration.capabilities?.providers[`source:${field}`];
    if (!registration?.participant || registration.manifest.codec?.id !== 'raveldex-source-v1' || registration.manifest.codec.version !== 1) fail('SOURCE_UNAVAILABLE');
    return requireSourceRoot(root.participants[registration.manifest.id], field, root.revision, root.configuration.analyzer);
  });
}
