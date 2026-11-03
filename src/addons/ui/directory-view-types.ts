import type { DirectoryHandle } from './directory-types.js';
import type { UIDocument } from './types.js';

export interface DirectoryViewGroup {
  readonly field: string;
  readonly label: string;
  /** Optional labels for allowed values; unspecified values keep their raw text. */
  readonly values?: readonly { readonly value: string; readonly label: string }[];
}
export interface DirectoryViewMessages {
  readonly label: string;
  readonly placeholder: string;
  readonly submit: string;
  readonly clear: string;
  readonly filters: string;
  readonly closeFilters: string;
  readonly countHint: string;
  readonly selectedFilters: string;
  readonly remove: string;
  readonly unknownCount: string;
  readonly emptyValue: string;
  readonly omittedCounts: string;
  readonly resultsLabel: string;
  readonly idle: string;
  readonly waiting: string;
  readonly composing: string;
  readonly searching: string;
  readonly noResults: string;
  readonly resultOne: string;
  readonly results: string;
  readonly previous: string;
  readonly next: string;
  readonly page: string;
  readonly error: string;
  readonly stale: string;
  readonly retry: string;
  readonly invalid: string;
}
export interface DirectoryViewOptions {
  readonly root: HTMLElement;
  /** Borrowed; destroy this view before separately destroying its controller. */
  readonly controller: DirectoryHandle;
  readonly documents: readonly UIDocument[];
  /** Exactly one label for each configured controller group. */
  readonly groups: readonly DirectoryViewGroup[];
  readonly debounceMs?: number;
  /** Native disclosure; defaults closed at every width, with no resize toggling. */
  readonly filtersOpen?: boolean;
  readonly messages?: Partial<DirectoryViewMessages>;
}
export interface DirectoryViewHandle {
  readonly search: (text?: string) => Promise<void>;
  readonly clear: () => Promise<void>;
  readonly destroy: () => void;
}
