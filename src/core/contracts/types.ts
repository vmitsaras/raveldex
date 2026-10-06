import type { ErrorCode } from '../errors/error.js';
import type { LimitOverrides, Limits } from '../limits/limits.js';

export type Scalar = string | number | boolean | null;
export type MetadataType = 'string' | 'number' | 'boolean';
export interface TextField { readonly boost?: number }
export interface MetadataField { readonly type: MetadataType; readonly multi?: boolean; readonly nullable?: boolean }
export interface Schema {
  readonly text: Readonly<Record<string, TextField>>;
  readonly metadata?: Readonly<Record<string, MetadataField>>;
}
export interface OwnedSchema {
  readonly text: Readonly<Record<string, { readonly boost: number }>>;
  readonly metadata: Readonly<Record<string, { readonly type: MetadataType; readonly multi: boolean; readonly nullable: boolean }>>;
}
export interface RecordInput {
  readonly id: string;
  readonly text: Readonly<Record<string, string | readonly string[]>>;
  readonly metadata?: Readonly<Record<string, Scalar | readonly Scalar[]>>;
}
export interface OwnedRecord {
  readonly id: string;
  readonly text: Readonly<Record<string, readonly string[]>>;
  readonly metadata: Readonly<Record<string, Scalar | readonly Scalar[]>>;
  readonly textCodeUnits: number;
}
export interface AnalyzerDescriptor { readonly id: string; readonly environmentProfile: string }
export interface Configuration {
  readonly schema: Schema;
  readonly limits?: LimitOverrides;
  readonly analyzer?: AnalyzerDescriptor;
  readonly addons?: readonly unknown[];
}
export interface OwnedConfiguration {
  readonly schema: OwnedSchema;
  readonly limits: Limits;
  readonly analyzer: AnalyzerDescriptor;
}
export interface Variant { readonly text: string; readonly match: 'exact' | 'prefix'; readonly weight?: number }
export type Query =
  | { readonly kind: 'text'; readonly text: string; readonly operator?: 'and' | 'or'; readonly fields?: readonly string[] }
  | { readonly kind: 'group'; readonly variants: readonly Variant[]; readonly fields?: readonly string[] }
  | { readonly kind: 'and' | 'or'; readonly children: readonly Query[] }
  | { readonly kind: 'not'; readonly child: Query }
  | { readonly kind: 'eq'; readonly field: string; readonly value: Scalar }
  | { readonly kind: 'all' | 'none' }
  | { readonly kind: 'extension'; readonly capability: string; readonly version: number; readonly payload: unknown };

/** Structural host signal; the core compiler needs no DOM or Node type library. */
export interface CancellationSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { readonly once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}
export interface MutationOptions { readonly signal?: CancellationSignal; readonly deadlineMs?: number }
export interface SearchOptions extends MutationOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly extensions?: Readonly<Record<string, unknown>>;
}
export interface OwnedOptions extends MutationOptions { readonly deadlineMs: number }
export interface OwnedSearchOptions extends OwnedOptions { readonly limit: number; readonly offset: number }
export interface MutationResult {
  readonly revision: number; readonly changed: boolean;
  readonly added: number; readonly replaced: number; readonly removed: number;
}
export interface SearchResult {
  readonly revision: number; readonly model: 'raveldex-bm25-v1'; readonly completeness: 'complete';
  readonly total: number; readonly hits: readonly { readonly id: string; readonly score: number }[];
  readonly extensions?: Readonly<Record<string, unknown>>;
}
// Implemented by the execution owner; package entry qualification is RX-1006.
export interface Raveldex {
  search(query: string | Query, options?: SearchOptions): Promise<SearchResult>;
  add(record: RecordInput, options?: MutationOptions): Promise<MutationResult>;
  addMany(records: readonly RecordInput[], options?: MutationOptions): Promise<MutationResult>;
  replace(record: RecordInput, options?: MutationOptions): Promise<MutationResult>;
  remove(ids: string | readonly string[], options?: MutationOptions): Promise<MutationResult>;
  clear(options?: MutationOptions): Promise<MutationResult>;
  dispose(): Promise<void>;
}
export type ValidationCode = Extract<ErrorCode, 'INVALID_SCHEMA' | 'INVALID_RECORD' | 'INVALID_QUERY' | 'INVALID_OPTIONS'>;
