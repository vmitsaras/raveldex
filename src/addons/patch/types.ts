import type { MutationOptions, MutationResult, RecordInput, Scalar } from '../../core/contracts/types.js';

export interface RecordPatchSet {
  readonly text?: RecordInput['text'];
  readonly metadata?: Readonly<Record<string, Scalar | readonly Scalar[]>>;
}
export interface RecordPatchUnset {
  readonly text?: readonly string[];
  readonly metadata?: readonly string[];
}
export interface RecordPatch {
  readonly id: string;
  readonly expectedRevision: number;
  readonly set?: RecordPatchSet;
  readonly unset?: RecordPatchUnset;
}
export interface Patches {
  readonly patch: (request: RecordPatch, options?: MutationOptions) => Promise<MutationResult>;
}
