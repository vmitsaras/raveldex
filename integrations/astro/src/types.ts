import type { Configuration, Raveldex, RecordInput } from '@vmitsaras/raveldex';
import type { PageSectionPage, PageSections } from '@vmitsaras/raveldex/addons/sections';
import type { NativeSnapshotQualification } from '@vmitsaras/raveldex/adapters/snapshots';

export interface StaticEntry { readonly record: RecordInput; readonly title: string; readonly path: string }
export interface StaticBuildOptions {
  readonly configuration: Configuration;
  readonly entries: readonly StaticEntry[];
  readonly buildId: string;
  readonly base?: string;
  readonly nativeQualification?: NativeSnapshotQualification;
  readonly pageSections?: readonly PageSectionPage[];
}
export interface StaticAsset { readonly file: string; readonly bytes: number; readonly sha256: string }
export interface StaticManifest {
  readonly kind: 'raveldex-static-search'; readonly version: 1;
  readonly buildId: string; readonly base: string; readonly recordCount: number;
  readonly configurationSha256: string; readonly documentIdsSha256: string;
  readonly assets: { readonly source: StaticAsset; readonly documents: StaticAsset; readonly native?: StaticAsset };
}
export interface StaticArtifacts { readonly manifest: StaticManifest; readonly files: Readonly<Record<string, string>> }
export interface StaticDocument { readonly id: string; readonly title: string; readonly url: string }
export interface StaticLoadOptions {
  readonly manifestUrl: string; readonly expectedBuildId: string; readonly configuration: Configuration;
  readonly format?: 'source' | 'native'; readonly nativeQualification?: NativeSnapshotQualification;
  readonly fetch?: typeof globalThis.fetch; readonly signal?: AbortSignal; readonly timeoutMs?: number;
}
export interface LoadDocumentsOptions { readonly signal?: AbortSignal; readonly timeoutMs?: number }
export interface LoadedStaticSearch {
  readonly engine: Raveldex; readonly manifest: StaticManifest;
  readonly loadDocuments: (options?: LoadDocumentsOptions) => Promise<readonly StaticDocument[]>;
  readonly loadSections?: (options?: LoadDocumentsOptions) => Promise<PageSections>;
  readonly dispose: () => Promise<void>;
}
