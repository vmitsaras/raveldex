import { captureConfiguration } from '../../core/contracts/schema.js';
import { analyzeRecord, captureRecord } from '../../core/contracts/record.js';
import { DEFAULT_LIMITS, validateStateCounts } from '../../core/limits/limits.js';
import { RaveldexError } from '../../core/errors/error.js';
import type { MetadataField, RecordInput, Scalar, TextField } from '../../core/contracts/types.js';
import { decodeLegacySource } from './codec.js';
import { MigrationError } from './error.js';
import type { LocalSearchMigration, LocalSearchMigrationIdentity } from './types.js';

const IDENTITY: LocalSearchMigrationIdentity = Object.freeze({
  format: 1, contract: 'companion-v1', dependency: 'minisearch@7.2.0',
  analyzerId: 'basic-v1', analyzerNormalization: 'NFC-lowercase-NFC',
  scoreModel: 'minisearch-7.2.0-companion-v1',
  nativeAnalyzerNormalization: 'NFKC-lowercase', nativeScoreModel: 'raveldex-bm25-v1',
});
const DIFFERENCES = Object.freeze([
  'Explicit native rebuild; legacy origin is provenance, not native revision.',
  'Native basic-v1 uses NFKC then lowercase; legacy basic-v1 uses NFC, lowercase, NFC.',
  'Native raw token runs start with a letter or number; legacy runs may include leading marks.',
  'Native raveldex-bm25-v1 scores and ranks are independently computed.',
  'Legacy returnFields is a display projection; native originals and phrases require explicit addons.',
  'Legacy queries, worker handles, persisted namespaces and opaque MiniSearch state are not converted.',
]);

/** Offline bounded conversion only. Copies input before awaiting SHA-256 and
 * returns owned immutable data. No engine/storage/network initialization occurs.
 * Parsing, canonicalization and native validation are synchronous bounded work;
 * this tooling API has no cancellation/nonblocking execution guarantee.
 */
export async function convertLocalSearchSnapshot(bytes: Uint8Array): Promise<LocalSearchMigration> {
  const decoded = await decodeLegacySource(bytes);
  try {
    const text: Record<string, TextField> = Object.create(null) as typeof text;
    const metadata: Record<string, MetadataField> = Object.create(null) as typeof metadata;
    for (const [name, definition] of Object.entries(decoded.options.schema)) {
      if (definition.type === 'text' || definition.type === 'text[]') text[name] = Object.freeze({ boost: definition.boost });
      else metadata[name] = Object.freeze({ type: definition.type === 'keyword' ? 'string' : definition.type, multi: false, nullable: false });
    }
    const captured = captureConfiguration({ schema: { text, metadata } });
    const configuration = Object.freeze({ schema: captured.schema, analyzer: captured.analyzer });
    const records: RecordInput[] = [], dictionary = new Set<string>();
    let tokens = 0, textCodeUnits = 0, postingEntries = 0;
    for (const legacy of decoded.records) {
      const recordText: Record<string, string | readonly string[]> = Object.create(null) as typeof recordText;
      const recordMetadata: Record<string, Scalar> = Object.create(null) as typeof recordMetadata;
      for (const [name, definition] of Object.entries(decoded.options.schema)) {
        if (!Object.hasOwn(legacy, name)) continue;
        const value = legacy[name]!;
        if (definition.type === 'text' || definition.type === 'text[]') recordText[name] = value as string | readonly string[];
        else recordMetadata[name] = value as Scalar;
      }
      const owned = captureRecord({ id: legacy.id, text: recordText, metadata: recordMetadata }, captured.schema, DEFAULT_LIMITS);
      const recordTerms = new Set<string>();
      for (const step of analyzeRecord(owned, DEFAULT_LIMITS)) {
        if (step.token) {
          tokens++;
          const key = `${step.field!}\u0000${step.token.term}`;
          recordTerms.add(key); dictionary.add(key);
        }
      }
      textCodeUnits += owned.textCodeUnits; postingEntries += recordTerms.size;
      validateStateCounts({ documents: records.length + 1, textCodeUnits, tokens,
        dictionaryEntries: dictionary.size, postingEntries }, DEFAULT_LIMITS);
      records.push(Object.freeze({ id: owned.id, text: owned.text, metadata: owned.metadata }));
    }
    return Object.freeze({ configuration, records: Object.freeze(records),
      origin: decoded.origin, sourceRevision: decoded.sourceRevision,
      returnFields: decoded.options.returnFields, identity: IDENTITY, differences: DIFFERENCES });
  } catch (error: unknown) {
    if (error instanceof RaveldexError) throw new MigrationError('NATIVE_INCOMPATIBLE', 'native', error.code);
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('NATIVE_INCOMPATIBLE', 'native');
  }
}
