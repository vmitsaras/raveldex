import type { OwnedConfiguration, OwnedRecord } from '../contracts/types.js';
import type { StateCounts } from '../limits/limits.js';
import type { Directory } from './directory.js';

export interface ReverseField {
  readonly length: number;
  readonly terms: Readonly<Record<string, number>>;
}
export interface DocumentEntry {
  readonly id: string;
  readonly textCodeUnits: number;
  readonly metadata: OwnedRecord['metadata'];
  readonly fields: Readonly<Record<string, ReverseField>>;
}
export interface TermEntry {
  readonly df: number;
  readonly frequency: number;
  readonly postings: Directory<number>;
}
export interface FieldIndex {
  readonly documents: number;
  readonly length: number;
  readonly terms: Directory<TermEntry>;
}
/** Internal frequency-only root. No original text, occurrences, or providers. */
export interface IndexRoot {
  readonly revision: 0;
  readonly configuration: OwnedConfiguration;
  readonly documents: Directory<DocumentEntry>;
  readonly fields: Readonly<Record<string, FieldIndex>>;
  readonly counts: StateCounts;
}
