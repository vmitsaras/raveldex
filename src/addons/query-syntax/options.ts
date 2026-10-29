import { Admission, has, keysOnly, ownObject } from '../../core/contracts/data.js';
import { captureConfiguration } from '../../core/contracts/schema.js';
import type { OwnedConfiguration } from '../../core/contracts/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { QuerySyntaxOptions } from './types.js';

export interface CapturedSyntaxOptions {
  readonly configuration: OwnedConfiguration;
  readonly maxInputCodeUnits: number; readonly maxTokens: number;
  readonly maxDepth: number; readonly maxWorkUnits: number;
}

/** The ordinary configuration capturer binds handles, never initializes state. */
export function captureSyntaxOptions(input: QuerySyntaxOptions): CapturedSyntaxOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'querySyntax.options', admission);
  keysOnly(options, ['configuration', 'maxInputCodeUnits', 'maxTokens', 'maxDepth', 'maxWorkUnits'], 'INVALID_OPTIONS', 'querySyntax.options');
  const configuration = captureConfiguration(options.configuration);
  function narrowed(name: string, maximum: number): number {
    const value = has(options, name) ? options[name] : maximum;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid('INVALID_OPTIONS', `querySyntax.${name}`);
    bound(value, maximum, `querySyntax.${name}`); return value;
  }
  return Object.freeze({ configuration,
    maxInputCodeUnits: narrowed('maxInputCodeUnits', Math.min(2048, configuration.limits.maxQueryCodeUnits)),
    maxTokens: narrowed('maxTokens', 128), maxDepth: narrowed('maxDepth', Math.min(16, configuration.limits.maxQueryDepth)),
    maxWorkUnits: narrowed('maxWorkUnits', 100_000),
  });
}
