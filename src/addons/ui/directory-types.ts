import type { Raveldex, SearchResult } from '../../core/contracts/types.js';
import type { ErrorCode } from '../../core/errors/error.js';
import type { FacetFieldResult } from '../facets/options.js';

export interface DirectoryGroup {
  readonly field: string;
  readonly values: readonly string[];
  readonly limit?: number;
}
export interface DirectoryOptions {
  readonly engine: Raveldex;
  readonly groups?: readonly DirectoryGroup[];
  readonly pageSize?: number;
  readonly mode?: 'text' | 'prefix';
}
export interface DirectoryState {
  readonly text: string;
  readonly filters: Readonly<Record<string, readonly string[]>>;
  readonly page: number;
}
export interface DirectoryPage {
  readonly revision: number;
  readonly total: number;
  readonly hits: SearchResult['hits'];
  readonly facets: readonly FacetFieldResult[];
  /** null means absent from a truncated projection, not a zero count. */
  readonly selected: Readonly<Record<string, readonly { readonly value: string; readonly count: number | null }[]>>;
}
export type DirectoryChange = 'initial' | 'update' | 'page' | 'restore' | 'refresh' | 'recovery' | 'destroy';
export interface DirectorySnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'error' | 'stale' | 'destroyed';
  readonly state: DirectoryState;
  readonly change: DirectoryChange;
  readonly result?: DirectoryPage;
  readonly error?: ErrorCode;
}
export interface DirectoryHandle {
  readonly getSnapshot: () => DirectorySnapshot;
  readonly subscribe: (listener: (snapshot: DirectorySnapshot) => void) => () => void;
  readonly update: (patch: { readonly text?: string; readonly filters?: DirectoryState['filters'] }) => Promise<void>;
  readonly setPage: (page: number) => Promise<void>;
  readonly restore: (state: DirectoryState) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly destroy: () => void;
}
/** Structural browser interface keeps this optional entry's declarations DOM-free. */
export interface DirectoryURLHost {
  readonly location: { readonly href: string };
  readonly history: {
    readonly state: unknown;
    pushState(data: unknown, unused: string, url: string): void;
    replaceState(data: unknown, unused: string, url: string): void;
  };
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
}
export interface DirectoryURLParameters {
  readonly query: string;
  readonly page: string;
  readonly filters: Readonly<Record<string, string>>;
}
export interface DirectoryURLOptions {
  readonly controller: DirectoryHandle;
  readonly host: DirectoryURLHost;
  readonly parameters: DirectoryURLParameters;
  readonly history?: 'push' | 'replace';
}
export interface DirectoryURLIssue {
  readonly parameter: string;
  readonly reason: 'invalid' | 'unknown' | 'duplicate' | 'limit';
}
export interface DirectoryURLSnapshot {
  readonly status: 'connected' | 'error' | 'destroyed';
  readonly issues: readonly DirectoryURLIssue[];
  readonly error?: 'location-refused' | 'url-limit' | 'write-refused';
}
export interface DirectoryURLBinding {
  readonly getSnapshot: () => DirectoryURLSnapshot;
  readonly read: () => Promise<void>;
  readonly write: () => void;
  readonly destroy: () => void;
}
