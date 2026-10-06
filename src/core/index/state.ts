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
/** Internal root. Mandatory data is frequency-only; side roots are explicit. */
export interface IndexRoot {
  readonly revision: number;
  readonly configuration: OwnedConfiguration;
  readonly documents: Directory<DocumentEntry>;
  readonly fields: Readonly<Record<string, FieldIndex>>;
  readonly counts: StateCounts;
  /** Installed private transaction roots, selected by the same publication. */
  readonly participants: Readonly<Record<string, unknown>>;
}
