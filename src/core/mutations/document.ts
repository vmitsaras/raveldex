import { analyzeRecord, canonicalMetadata } from '../contracts/record.js';
import type { RecordAnalysisCounts } from '../contracts/record.js';
import type { OwnedRecord } from '../contracts/types.js';
import type { Limits } from '../limits/limits.js';
import type { DocumentEntry, ReverseField } from '../index/state.js';
import type { WorkStep } from '../index/directory.js';
import type { Charge } from '../query/work.js';

export type AnalysisCounts = RecordAnalysisCounts;
/** Only supplied changed records reach this analyzer, never old source. */
export function* prepareDocument(record: OwnedRecord, limits: Limits, charge: Charge, counts?: AnalysisCounts): Generator<WorkStep, DocumentEntry> {
  for (const values of Object.values(record.text)) {
    yield charge(1);
    for (let i = 0; i < values.length; i++) yield charge(1);
  }
  const fields: Record<string, { length: number; terms: Record<string, number> }> = Object.create(null) as typeof fields;
  for (const step of analyzeRecord(record, limits, counts)) {
    yield charge(step.workUnits);
    if (step.token) {
      yield charge(step.token.term.length + 2);
      const field = fields[step.field!] ??= { length: 0, terms: Object.create(null) as Record<string, number> };
      field.length++;
      field.terms[step.token.term] = (field.terms[step.token.term] ?? 0) + 1;
    }
  }
  const frozen: Record<string, ReverseField> = Object.create(null) as typeof frozen;
  for (const [name, field] of Object.entries(fields)) {
    for (const term of Object.keys(field.terms)) yield charge(term.length + 1);
    yield charge(1);
    frozen[name] = Object.freeze({ length: field.length, terms: Object.freeze(field.terms) });
  }
  for (const value of Object.values(record.metadata)) {
    yield charge(1);
    for (const item of Array.isArray(value) ? value : [value]) yield charge(typeof item === 'string' ? item.length + 1 : 1);
  }
  const metadata = canonicalMetadata(record);
  for (const value of Object.values(metadata)) yield charge(Array.isArray(value) ? value.length + 1 : 1);
  return Object.freeze({ id: record.id, textCodeUnits: record.textCodeUnits, metadata, fields: Object.freeze(frozen) });
}
