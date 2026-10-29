export interface TypoAlternative { readonly term: string; readonly match: 'exact'; readonly weight: number }
export interface TypoGroup {
  readonly term: string; readonly fields: readonly string[];
  readonly alternatives: readonly TypoAlternative[];
  /** Actual field dictionary entries visited, including repeated terms in fields. */
  readonly dictionaryEntriesVisited: number;
  /** Add-on yielded work-v1 units; excludes core capture/retrieval/output work. */
  readonly workUnits: number;
}
export interface TypoResult {
  readonly policy: 'unicode-osa1-exact-first-v1';
  readonly groups: readonly TypoGroup[];
}
