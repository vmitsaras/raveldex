/** Native core only. Importing this entry performs no host initialization. */
export { createRaveldex } from './core/execution/engine.js';
export { RaveldexError, ERROR_CODES } from './core/errors/error.js';
export type { ErrorCode, ErrorDetails } from './core/errors/error.js';
export type {
  AnalyzerDescriptor, CancellationSignal, Configuration, MetadataField,
  MetadataType, MutationOptions, MutationResult, Query, Raveldex, RecordInput,
  Scalar, Schema, SearchOptions, SearchResult, TextField, Variant,
} from './core/contracts/types.js';
export type { Limits, LimitOverrides } from './core/limits/limits.js';
