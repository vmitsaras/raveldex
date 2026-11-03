import type { DirectoryViewHandle, DirectoryViewOptions } from './directory-view-types.js';
import type { UIDocument } from './types.js';

/** Explicit display data, independent of native index fields and query state. */
export interface DirectoryCardDocument extends UIDocument {
  readonly excerpt?: string;
  readonly category?: string;
  readonly breadcrumb?: readonly string[];
  /** Already localized display text; no implicit parsing or formatting. */
  readonly date?: string;
  readonly fields?: readonly { readonly name: string; readonly value: string }[];
  readonly image?: {
    readonly src: string;
    /** An explicitly empty alternative declares a decorative image. */
    readonly alt: string;
    readonly width: number;
    readonly height: number;
  };
}
export interface DirectoryCardPresentation {
  readonly layout: 'list' | 'cards' | 'grid';
  readonly density: 'compact' | 'comfortable';
  readonly images: boolean;
}
export interface DirectoryCardsOptions extends Omit<DirectoryViewOptions, 'documents'> {
  readonly documents: readonly DirectoryCardDocument[];
  /** Defaults to list, comfortable density, and no image requests. */
  readonly presentation?: Partial<DirectoryCardPresentation>;
  /** Plain localized text used with the authored alternative after image failure. */
  readonly imageUnavailable?: string;
}
export interface DirectoryCardsHandle extends DirectoryViewHandle {
  /** Changes only display: no search, URL write, filter or page change. */
  readonly setPresentation: (presentation: Partial<DirectoryCardPresentation>) => void;
  readonly getPresentation: () => DirectoryCardPresentation;
}
