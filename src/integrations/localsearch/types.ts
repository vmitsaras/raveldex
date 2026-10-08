import type { Configuration, RecordInput } from '../../core/contracts/types.js';
import type { SnapshotRef } from './legacy.js';

export interface LocalSearchMigrationIdentity {
  readonly format: 1;
  readonly contract: 'companion-v1';
  readonly dependency: 'minisearch@7.2.0';
  readonly analyzerId: 'basic-v1';
  readonly analyzerNormalization: 'NFC-lowercase-NFC';
  readonly scoreModel: 'minisearch-7.2.0-companion-v1';
  readonly nativeAnalyzerNormalization: 'NFKC-lowercase';
  readonly nativeScoreModel: 'raveldex-bm25-v1';
}
/** Validated source/configuration for an explicit rebuild; no live engine state. */
export interface LocalSearchMigration {
  readonly configuration: Configuration;
  readonly records: readonly RecordInput[];
  readonly origin: SnapshotRef;
  readonly sourceRevision: string | null;
  /** Legacy display projection. Retaining native originals requires explicit addons. */
  readonly returnFields: readonly string[];
  readonly identity: LocalSearchMigrationIdentity;
  readonly differences: readonly string[];
}
export type LocalSearchMigrationOrigin = SnapshotRef;
