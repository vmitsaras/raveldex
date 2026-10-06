import { Admission, has, ownObject } from '../contracts/data.js';
import { bound, invalid } from '../errors/error.js';

export const DEFAULT_LIMITS = Object.freeze({
  maxDocuments: 10_000, maxTextFields: 32, maxMetadataFields: 32,
  maxFieldNameCodeUnits: 64, maxIdCodeUnits: 256, maxTextValuesPerField: 64,
  maxMetadataValuesPerField: 128, maxMetadataStringCodeUnits: 1_024,
  maxMetadataCodeUnitsPerRecord: 32_768, maxTextCodeUnitsPerValue: 65_536,
  maxTextCodeUnitsPerRecord: 262_144, maxCorpusTextCodeUnits: 67_108_864,
  maxRawTokenCodeUnits: 256, maxTermCodeUnits: 256, maxTokensPerRecord: 32_768,
  maxCorpusTokens: 4_000_000, maxDictionaryEntries: 250_000,
  maxPostingEntries: 2_000_000, maxMutationBatch: 256, maxAdmissionEntries: 16_384,
  maxQueryNodes: 128, maxQueryDepth: 16, maxQueryLexicalCodeUnits: 2_048,
  maxQueryCodeUnits: 16_384, maxQueryTokens: 64, maxQueryGroups: 64,
  maxVariantsPerGroup: 16, maxExpansionsPerGroup: 256, maxQueryExpansions: 1_024,
  minPrefixCodePoints: 2, maxHits: 100, maxQueuedOperations: 32,
  maxSearchWorkUnits: 10_000_000, maxMutationWorkUnits: 50_000_000,
  checkpointWorkUnits: 2_048, maxDeadlineMs: 60_000,
});
export type Limits = { readonly [K in keyof typeof DEFAULT_LIMITS]: number };
export type LimitOverrides = Partial<Limits>;

export function resolveLimits(input: unknown = {}, admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries)): Limits {
  const data = ownObject(input, 'INVALID_OPTIONS', 'limits', admission);
  const result = { ...DEFAULT_LIMITS } as { -readonly [K in keyof Limits]: number };
  for (const key of Object.keys(data)) {
    if (!has(DEFAULT_LIMITS, key)) invalid('INVALID_OPTIONS', 'limits');
    const name = key as keyof Limits;
    const value = data[key];
    const minimum = name === 'maxMetadataFields' || name === 'maxQueuedOperations' ? 0 : name === 'minPrefixCodePoints' ? 2 : 1;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid('INVALID_OPTIONS', `limits.${name}`);
    if (name !== 'minPrefixCodePoints') bound(value, DEFAULT_LIMITS[name], `limits.${name}`);
    result[name] = value;
  }
  // Reducible child ceilings need not be reduced with their parents: aggregate
  // bounds are enforced independently. Only a checkpoint must fit both budgets.
  if (result.checkpointWorkUnits > Math.min(result.maxSearchWorkUnits, result.maxMutationWorkUnits)) {
    invalid('INVALID_OPTIONS', 'limits.checkpointWorkUnits');
  }
  return Object.freeze(result);
}

export interface StateCounts {
  readonly documents: number;
  readonly textCodeUnits: number;
  readonly tokens: number;
  readonly dictionaryEntries: number;
  readonly postingEntries: number;
}

/** For later index staging: check all proposed totals before publishing a root. */
export function validateStateCounts(counts: StateCounts, limits: Limits): void {
  const pairs = [
    ['documents', 'maxDocuments'], ['textCodeUnits', 'maxCorpusTextCodeUnits'],
    ['tokens', 'maxCorpusTokens'], ['dictionaryEntries', 'maxDictionaryEntries'],
    ['postingEntries', 'maxPostingEntries'],
  ] as const;
  for (const [count, limit] of pairs) {
    if (!Number.isSafeInteger(counts[count]) || counts[count] < 0) invalid('INTERNAL_ERROR', `state.${count}`);
    bound(counts[count], limits[limit], `state.${count}`);
  }
}
