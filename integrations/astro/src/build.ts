import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import type { RecordInput } from '@vmitsaras/raveldex';
import { createSnapshotRaveldex, createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { asset, batchSize, buildId, cloneOwned, configurationIdentity, DOCUMENTS_LIMIT, MANIFEST_LIMIT, ENTRY_LIMIT, idIdentity, object, safePath, sourceUrl, string, bytes } from './common.js';
import type { OwnershipBudget } from './common.js';
import { fail, StaticSearchError } from './error.js';
import type { StaticArtifacts, StaticBuildOptions, StaticDocument, StaticManifest } from './types.js';
export { StaticSearchError, STATIC_SEARCH_ERROR_CODES } from './error.js';
export type { StaticSearchErrorCode } from './error.js';
export type { StaticArtifacts, StaticAsset, StaticBuildOptions, StaticEntry, StaticManifest, StaticDocument } from './types.js';

/** Explicit complete reconstruction from an owned allowlist; no framework,
 * parser, filesystem, fetch or worker access occurs in this entry. */
export async function buildStaticSearch(input: StaticBuildOptions): Promise<StaticArtifacts> {
  let engine: ReturnType<typeof createRaveldex> | undefined;
  try {
    const options = object(input, ['configuration', 'entries', 'buildId', 'base', 'nativeQualification']);
    const generation = buildId(options.buildId), base = safePath(Object.hasOwn(options, 'base') ? options.base : '/');
    if (!Array.isArray(options.entries) || options.entries.length > ENTRY_LIMIT) fail('INVALID_INPUT');
    const budget: OwnershipBudget = { count: 0, maximum: 1_000_000 };
    // No await precedes complete record/display capture. Strings are immutable;
    // array/object aliases are replaced using data descriptors only.
    const entries = cloneOwned(options.entries, budget) as readonly unknown[];
    const ids = new Set<string>(), records: RecordInput[] = [], documents: StaticDocument[] = [];
    for (const raw of entries) {
      const entry = object(raw, ['record', 'title', 'path']);
      const record = object(entry.record, ['id', 'text', 'metadata']);
      const id = string(record.id, 256), title = string(entry.title, 1024), path = safePath(entry.path);
      if (!title.trim() || ids.has(id)) fail('INVALID_INPUT');
      ids.add(id); records.push(record as unknown as RecordInput);
      documents.push(Object.freeze({ id, title, url: sourceUrl(base, path) }));
    }
    const documentsText = JSON.stringify({ kind: 'raveldex-static-documents', version: 1, buildId: generation, documents });
    bytes(documentsText, DOCUMENTS_LIMIT);
    // Native factories synchronously capture schema, limits and trusted handles.
    engine = Object.hasOwn(options, 'nativeQualification')
      ? createSnapshotRaveldex(options.configuration as StaticBuildOptions['configuration'], { nativeQualification: options.nativeQualification as NonNullable<StaticBuildOptions['nativeQualification']> })
      : createRaveldex(options.configuration as StaticBuildOptions['configuration']);
    const snapshots = createSnapshots(engine), empty = await snapshots.exportSource();
    const configurationSha256 = await configurationIdentity(empty), maximumBatch = batchSize(empty);
    for (let index = 0; index < records.length; index += maximumBatch) await engine.addMany(records.slice(index, index + maximumBatch));
    const sourceText = await snapshots.exportSource(), source = await asset('source', sourceText), display = await asset('documents', documentsText);
    const nativeText = Object.hasOwn(options, 'nativeQualification') ? await snapshots.exportNative() : undefined;
    const native = nativeText === undefined ? undefined : await asset('native', nativeText);
    const manifest: StaticManifest = Object.freeze({ kind: 'raveldex-static-search', version: 1, buildId: generation, base, recordCount: records.length,
      configurationSha256, documentIdsSha256: await idIdentity([...ids]),
      assets: Object.freeze({ source, documents: display, ...(native ? { native } : {}) }) });
    const files: Record<string, string> = Object.create(null) as Record<string, string>;
    files[source.file] = sourceText; files[display.file] = documentsText;
    if (native && nativeText !== undefined) files[native.file] = nativeText;
    files['manifest.json'] = JSON.stringify(manifest); bytes(files['manifest.json'], MANIFEST_LIMIT);
    return Object.freeze({ manifest, files: Object.freeze(files) });
  } catch (error) {
    if (error instanceof StaticSearchError || error instanceof RaveldexError) throw error;
    return fail('INVALID_INPUT');
  } finally { await engine?.dispose(); }
}
