import type { Raveldex } from '../../core/contracts/types.js';

/** A caller-owned allowlist of current display documents, captured at mount. */
export interface UIDocument {
  readonly id: string;
  readonly title: string;
  readonly url: string;
}
export interface UIFacet {
  readonly field: string;
  readonly label: string;
}
export interface UIOptions {
  readonly root: HTMLElement;
  /** Borrowed. Destroying the UI never disposes this engine. */
  readonly engine: Raveldex;
  readonly documents: readonly UIDocument[];
  /** Up to eight conjunctive string facets, using the installed facets capability. */
  readonly facets?: readonly UIFacet[];
  /** Explicit original-source fields for the installed snippets capability. */
  readonly snippetFields?: readonly string[];
  readonly pageSize?: number;
  readonly debounceMs?: number;
  /** Exact words by default; prefix expands only the final basic word. */
  readonly mode?: 'text' | 'prefix' | 'phrase';
  readonly label?: string;
}
export interface UIHandle {
  /** Flushes pending debounce and submits current controls. Resolves after presentation. */
  readonly search: () => Promise<void>;
  /** Idempotently releases UI resources and restores the original Node objects. */
  readonly destroy: () => void;
}
