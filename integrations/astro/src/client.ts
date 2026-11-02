import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createSnapshotRaveldex, createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { buildId, captureManifest, cloneOwned, configurationIdentity, digest, DOCUMENTS_LIMIT, ENTRY_LIMIT, idIdentity, MANIFEST_LIMIT, object, parse, safePath, SNAPSHOT_LIMIT, sourceUrl, string } from './common.js';
import { captureSectionManifest, captureSectionPages, runtimeSections, SECTIONS_LIMIT, validateReceivingSections } from './sections.js';
import { fail, StaticSearchError } from './error.js';
import type { StaticSearchErrorCode } from './error.js';
import type { PageSections } from '@vmitsaras/raveldex/addons/sections';
import type { LoadedStaticSearch, LoadDocumentsOptions, StaticAsset, StaticDocument, StaticLoadOptions } from './types.js';
export { StaticSearchError, STATIC_SEARCH_ERROR_CODES } from './error.js';
export type { StaticSearchErrorCode } from './error.js';
export type { LoadedStaticSearch, LoadDocumentsOptions, StaticLoadOptions, StaticManifest, StaticAsset, StaticDocument } from './types.js';

function timeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 120_000) fail('INVALID_INPUT');
  return value;
}
function signal(value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined;
  const s = value as Partial<AbortSignal> | null;
  if (typeof s !== 'object' || s === null || typeof s.aborted !== 'boolean' || typeof s.addEventListener !== 'function' || typeof s.removeEventListener !== 'function') fail('INVALID_INPUT');
  return s as AbortSignal;
}
function check(external?: AbortSignal, lifetime?: AbortSignal): void {
  if (lifetime?.aborted) fail('DISPOSED');
  if (external?.aborted) fail('CANCELLED');
}
function manifestUrl(value: unknown): URL {
  const raw = string(value, 2048);
  let url: URL;
  try { url = new URL(raw); } catch { return fail('INVALID_INPUT'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/raveldex/manifest.json')) fail('INVALID_INPUT');
  return url;
}
interface ReadOptions { readonly fetch: typeof globalThis.fetch; readonly signal?: AbortSignal; readonly lifetime: AbortSignal; readonly timeoutMs: number }
/** Per-read cancellation races cover fetch and every stream advance even when
 * an injected host ignores AbortSignal. There is no silent retry or redirect. */
async function readText(url: string, maximum: number, options: ReadOptions, expected?: StaticAsset): Promise<string> {
  check(options.signal, options.lifetime);
  const controller = new AbortController(); let reason: StaticSearchErrorCode = 'FETCH_FAILED';
  const abort = (code: StaticSearchErrorCode): void => { reason = code; controller.abort(); };
  const callerStop = (): void => abort('CANCELLED'), disposeStop = (): void => abort('DISPOSED');
  let timer: ReturnType<typeof setTimeout> | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined, received: Response | undefined;
  async function waiting<T>(promise: Promise<T>): Promise<T> {
    if (controller.signal.aborted) {
      // Fetch/read may synchronously abort while returning a rejected promise.
      // Observe it even though the operation's first stop outcome already won.
      void promise.catch(() => {}); fail(reason);
    }
    let stopped!: () => void;
    const stop = new Promise<never>((_, reject) => { stopped = () => reject(new StaticSearchError(reason)); controller.signal.addEventListener('abort', stopped, { once: true }); });
    try { return await Promise.race([promise, stop]); }
    finally { controller.signal.removeEventListener('abort', stopped); }
  }
  try {
    options.signal?.addEventListener('abort', callerStop, { once: true }); options.lifetime.addEventListener('abort', disposeStop, { once: true });
    check(options.signal, options.lifetime);
    timer = setTimeout(() => abort('FETCH_FAILED'), options.timeoutMs);
    const fetcher = options.fetch;
    const incoming = Promise.resolve(fetcher(url, { redirect: 'error', signal: controller.signal })).then(response => {
      if (controller.signal.aborted) {
        // An injected host can ignore AbortSignal and fulfill after the caller
        // has settled. Release that unused body without reviving the operation.
        try { void response.body?.cancel().catch(() => {}); } catch { /* Preserve the first outcome. */ }
        return fail(reason);
      }
      return response;
    });
    const response = await waiting(incoming); received = response;
    if (response.redirected || response.url && response.url !== url) fail('FETCH_FAILED');
    if (response.status === 404) fail('MISSING_ARTIFACT');
    if (!response.ok) fail('FETCH_FAILED');
    // Fetch exposes decoded body bytes but may retain compressed wire headers.
    // Only identity Content-Length describes the bytes hashed by this adapter.
    const encoding = response.headers.get('content-encoding');
    const length = !encoding || encoding.trim().toLowerCase() === 'identity' ? response.headers.get('content-length') : null;
    if (length !== null) {
      if (!/^(0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(Number(length))) fail('INVALID_ARTIFACT');
      if (Number(length) > maximum) fail('ASSET_LIMIT');
      if (expected && Number(length) !== expected.bytes) fail('INTEGRITY_MISMATCH');
    }
    if (!response.body) fail('INVALID_ARTIFACT');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let total = 0, advances = 0;
    for (;;) {
      if (++advances > 1_000_000) fail('ASSET_LIMIT');
      const row = await waiting(reader.read());
      check(options.signal, options.lifetime);
      if (row.done) break;
      if (!(row.value instanceof Uint8Array)) fail('INVALID_ARTIFACT');
      total += row.value.byteLength;
      if (total > maximum) fail('ASSET_LIMIT');
      if (expected && total > expected.bytes) fail('INTEGRITY_MISMATCH');
      if (row.value.length) chunks.push(new Uint8Array(row.value));
    }
    if (length !== null && Number(length) !== total || expected && expected.bytes !== total) fail('INTEGRITY_MISMATCH');
    const all = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
    if (expected && await digest(all) !== expected.sha256) fail('INTEGRITY_MISMATCH');
    check(options.signal, options.lifetime);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(all); } catch { return fail('INVALID_ARTIFACT'); }
  } catch (error) {
    check(options.signal, options.lifetime);
    if (controller.signal.aborted) fail(reason);
    if (error instanceof StaticSearchError) throw error;
    return fail('FETCH_FAILED');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try { options.signal?.removeEventListener('abort', callerStop); } catch { /* Preserve the read outcome. */ }
    try { options.lifetime.removeEventListener('abort', disposeStop); } catch { /* Preserve the read outcome. */ }
    if (reader) { try { void reader.cancel().catch(() => {}); } catch { /* Preserve the read outcome. */ } try { reader.releaseLock(); } catch { /* A host may still have a pending cancelled read. */ } }
    else { try { void received?.body?.cancel().catch(() => {}); } catch { /* Release HTTP error/redirect bodies without replacing their outcome. */ } }
    controller.abort();
  }
}
function sourceIds(encoded: string): readonly string[] {
  const envelope = object(parse(encoded), undefined, 'INVALID_ARTIFACT'), body = object(envelope.body, undefined, 'INVALID_ARTIFACT'), payload = object(body.payload, undefined, 'INVALID_ARTIFACT');
  if (envelope.format !== 'raveldex-source' || !Array.isArray(payload.records) || payload.records.length > ENTRY_LIMIT) fail('INVALID_ARTIFACT');
  const seen = new Set<string>();
  for (const value of payload.records) {
    const record = object(value, undefined, 'INVALID_ARTIFACT'), id = string(record.id, 256, 'INVALID_ARTIFACT');
    if (seen.has(id)) fail('INVALID_ARTIFACT'); seen.add(id);
  }
  return Object.freeze([...seen]);
}

/** An explicit load creates a private candidate. Only a complete compatible
 * restore is returned to the application; existing application owners are untouched. */
export async function loadStaticSearch(input: StaticLoadOptions): Promise<LoadedStaticSearch> {
  let engine: ReturnType<typeof createRaveldex> | undefined, lifetime: AbortController | undefined, published = false;
  try {
    const options = object(input, ['manifestUrl', 'expectedBuildId', 'configuration', 'format', 'nativeQualification', 'fetch', 'signal', 'timeoutMs']);
    const url = manifestUrl(options.manifestUrl), expectedBuild = buildId(options.expectedBuildId), requestTimeout = timeout(Object.hasOwn(options, 'timeoutMs') ? options.timeoutMs : 30_000), callerSignal = signal(options.signal);
    check(callerSignal);
    const format = Object.hasOwn(options, 'format') ? options.format : 'source';
    if (format !== 'source' && format !== 'native') fail('INVALID_INPUT');
    if (format === 'native' && !Object.hasOwn(options, 'nativeQualification')) fail('INCOMPATIBLE_ARTIFACT');
    const configuration = cloneOwned(options.configuration, { count: 0, maximum: 1_000_000, functions: true }) as StaticLoadOptions['configuration'];
    const qualification = Object.hasOwn(options, 'nativeQualification') ? cloneOwned(options.nativeQualification) as NonNullable<StaticLoadOptions['nativeQualification']> : undefined;
    const fetcher = Object.hasOwn(options, 'fetch') ? options.fetch : globalThis.fetch.bind(globalThis);
    if (typeof fetcher !== 'function') fail('INVALID_INPUT');
    const fetchHandle = fetcher as typeof globalThis.fetch;
    lifetime = new AbortController(); const ownedLifetime = lifetime;
    const reading: ReadOptions = { fetch: fetchHandle, timeoutMs: requestTimeout, lifetime: ownedLifetime.signal, ...(callerSignal ? { signal: callerSignal } : {}) };
    const manifest = captureManifest(parse(await readText(url.href, MANIFEST_LIMIT, reading)));
    if (manifest.buildId !== expectedBuild) fail('STALE_BUILD');
    if (url.pathname !== manifest.base + 'raveldex/manifest.json') fail('INCOMPATIBLE_ARTIFACT');
    const descriptor = format === 'native' ? manifest.assets.native : manifest.assets.source;
    if (!descriptor) fail('MISSING_ARTIFACT');
    check(callerSignal, ownedLifetime.signal);
    engine = qualification ? createSnapshotRaveldex(configuration, { nativeQualification: qualification }) : createRaveldex(configuration);
    const owner = engine, snapshots = createSnapshots(owner), mutationOptions = callerSignal ? { signal: callerSignal } : {};
    const empty = await snapshots.exportSource(mutationOptions);
    if (await configurationIdentity(empty) !== manifest.configurationSha256) fail('INCOMPATIBLE_ARTIFACT');
    check(callerSignal, ownedLifetime.signal);
    const encoded = await readText(new URL(descriptor.file, url).href, SNAPSHOT_LIMIT, reading, descriptor);
    const restored = await snapshots.restore(encoded, mutationOptions);
    if (restored.format !== (format === 'source' ? 'raveldex-source' : 'raveldex-native')) fail('INCOMPATIBLE_ARTIFACT');
    // Re-export through the public source protocol to join manifest IDs/count to
    // the actual restored owner without interpreting private native directories.
    const actualIds = sourceIds(await snapshots.exportSource(mutationOptions));
    if (actualIds.length !== manifest.recordCount || await idIdentity(actualIds) !== manifest.documentIdsSha256) fail('INCOMPATIBLE_ARTIFACT');
    check(callerSignal, ownedLifetime.signal);
    let disposed = false, disposal: Promise<void> | undefined;
    const handle: LoadedStaticSearch = Object.freeze({ engine: owner, manifest,
      async loadDocuments(input: LoadDocumentsOptions = {}): Promise<readonly StaticDocument[]> {
        try {
        if (disposed) fail('DISPOSED');
        const data = object(input, ['signal', 'timeoutMs']), external = signal(data.signal), milliseconds = timeout(Object.hasOwn(data, 'timeoutMs') ? data.timeoutMs : requestTimeout);
        const text = await readText(new URL(manifest.assets.documents.file, url).href, DOCUMENTS_LIMIT, { fetch: fetchHandle, timeoutMs: milliseconds, lifetime: ownedLifetime.signal, ...(external ? { signal: external } : {}) }, manifest.assets.documents);
        const envelope = object(parse(text), ['kind', 'version', 'buildId', 'documents'], 'INVALID_ARTIFACT');
        if (envelope.kind !== 'raveldex-static-documents' || envelope.version !== 1 || envelope.buildId !== manifest.buildId || !Array.isArray(envelope.documents) || envelope.documents.length !== manifest.recordCount) fail('INVALID_ARTIFACT');
        const seen = new Set<string>(), documents: StaticDocument[] = [];
        for (const value of envelope.documents) {
          const document = object(value, ['id', 'title', 'url'], 'INVALID_ARTIFACT'), id = string(document.id, 256, 'INVALID_ARTIFACT'), title = string(document.title, 1024, 'INVALID_ARTIFACT'), source = string(document.url, 1024, 'INVALID_ARTIFACT');
          if (seen.has(id) || !title.trim() || !source.startsWith(manifest.base)) fail('INVALID_ARTIFACT');
          const relative = manifest.base === '/' ? source : '/' + source.slice(manifest.base.length);
          if (sourceUrl(manifest.base, safePath(relative, 'INVALID_ARTIFACT')) !== source) fail('INVALID_ARTIFACT');
          seen.add(id); documents.push(Object.freeze({ id, title, url: source }));
        }
        if (await idIdentity([...seen]) !== manifest.documentIdsSha256) fail('INCOMPATIBLE_ARTIFACT');
        check(external, ownedLifetime.signal); return Object.freeze(documents);
        } catch (error) {
          if (error instanceof StaticSearchError || error instanceof RaveldexError) throw error;
          return fail('INVALID_INPUT');
        }
      },
      async loadSections(input: LoadDocumentsOptions = {}): Promise<PageSections> {
        let external: AbortSignal | undefined, stop: (() => void) | undefined;
        try {
          if (disposed) fail('DISPOSED');
          const data = object(input, ['signal', 'timeoutMs']);
          external = signal(data.signal);
          const milliseconds = timeout(Object.hasOwn(data, 'timeoutMs') ? data.timeoutMs : requestTimeout);
          check(external, ownedLifetime.signal);
          if (format !== 'source') fail('INCOMPATIBLE_ARTIFACT');
          // Both queued native work and fetch share this method's explicit
          // lifetime. No source/display cache survives a successful call.
          const controller = new AbortController();
          stop = (): void => controller.abort();
          external?.addEventListener('abort', stop, { once: true });
          ownedLifetime.signal.addEventListener('abort', stop, { once: true });
          check(external, ownedLifetime.signal);
          const mutationOptions = { signal: controller.signal };
          const before = await owner.search({ kind: 'none' }, { limit: 0, ...mutationOptions });
          check(external, ownedLifetime.signal);
          if (before.revision !== restored.revision) fail('INCOMPATIBLE_ARTIFACT');
          const sectionReading: ReadOptions = { fetch: fetchHandle, timeoutMs: milliseconds, lifetime: ownedLifetime.signal, ...(external ? { signal: external } : {}) };
          const companion = captureSectionManifest(parse(await readText(new URL('sections-manifest.json', url).href, MANIFEST_LIMIT, sectionReading)), manifest);
          const text = await readText(new URL(companion.asset.file, url).href, SECTIONS_LIMIT, sectionReading, companion.asset);
          const envelope = object(parse(text), ['kind', 'version', 'buildId', 'pages'], 'INVALID_ARTIFACT');
          if (envelope.kind !== 'raveldex-page-sections' || envelope.version !== 1) fail('INVALID_ARTIFACT');
          if (buildId(envelope.buildId, 'INVALID_ARTIFACT') !== manifest.buildId) fail('STALE_BUILD');
          const pages = captureSectionPages(envelope.pages, undefined, { count: 0, maximum: 1_000_000 }, 'INVALID_ARTIFACT');
          if (pages.length !== manifest.recordCount) fail('INVALID_ARTIFACT');
          // A serialized companion is already canonical; accepting reordered
          // pages/sections would hide a malformed artifact generation.
          const rawPages = envelope.pages as readonly { readonly pageId: unknown; readonly sections: readonly { readonly anchor: unknown }[] }[];
          for (let index = 0; index < pages.length; index++) {
            const page = pages[index]!, raw = rawPages[index]!;
            if (raw.pageId !== page.pageId || raw.sections.some((section, ordinal) => section.anchor !== page.sections[ordinal]!.anchor)) fail('INVALID_ARTIFACT');
          }
          if (await idIdentity(pages.map(page => page.pageId)) !== manifest.documentIdsSha256) fail('INCOMPATIBLE_ARTIFACT');
          check(external, ownedLifetime.signal);
          validateReceivingSections(await snapshots.exportSource(mutationOptions), pages, restored.revision);
          check(external, ownedLifetime.signal);
          const after = await owner.search({ kind: 'none' }, { limit: 0, ...mutationOptions });
          check(external, ownedLifetime.signal);
          if (after.revision !== restored.revision) fail('INCOMPATIBLE_ARTIFACT');
          // No await follows the last revision/cancellation checks. A later
          // queued mutation does not restamp this captured receiving revision.
          return runtimeSections(pages, restored.revision);
        } catch (error) {
          check(external, ownedLifetime.signal);
          if (error instanceof StaticSearchError || error instanceof RaveldexError) throw error;
          return fail('INVALID_INPUT');
        } finally {
          if (stop) {
            try { external?.removeEventListener('abort', stop); } catch { /* Preserve outcome. */ }
            try { ownedLifetime.signal.removeEventListener('abort', stop); } catch { /* Preserve outcome. */ }
          }
        }
      },
      dispose(): Promise<void> {
        if (disposal) return disposal;
        disposed = true; ownedLifetime.abort(); disposal = owner.dispose(); return disposal;
      },
    });
    published = true; return handle;
  } catch (error) {
    if (error instanceof StaticSearchError || error instanceof RaveldexError) throw error;
    return fail('INVALID_INPUT');
  } finally { if (!published) { lifetime?.abort(); await engine?.dispose(); } }
}
