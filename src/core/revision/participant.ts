import type { AnalysisRunner } from '../analyzer/selected.js';
import type { OwnedRecord } from '../contracts/types.js';
import type { IndexRoot } from '../index/state.js';
import type { WorkStep } from '../index/directory.js';
import type { DocumentDelta } from '../mutations/delta.js';
import type { MutationKind } from '../mutations/capture.js';

export interface TransactionContext {
  readonly analyze?: AnalysisRunner;
  readonly kind: MutationKind;
  readonly previous: IndexRoot;
  readonly core: IndexRoot;
  readonly changes: readonly DocumentDelta[];
  readonly records: readonly OwnedRecord[];
}
/** Private trusted seam. No publication callback or public registration yet.
 * Every yielded unit joins the mutation budget. Implementations own immutable
 * side roots and must not mutate the previous root or hide uncharged work.
 */
export interface TransactionParticipant {
  readonly id: string;
  readonly maxWorkUnits?: number;
  prepare(previous: unknown, context: TransactionContext): Generator<WorkStep, unknown>;
}
