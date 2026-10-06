import { invalid } from '../errors/error.js';
import { validateStateCounts } from '../limits/limits.js';
import { directoryGet } from '../index/directory.js';
import type { WorkStep } from '../index/directory.js';
import { DirectoryStage, emptyDirectory } from '../index/staging.js';
import type { CopyCounts } from '../index/staging.js';
import type { DocumentEntry, FieldIndex, IndexRoot, TermEntry } from '../index/state.js';
import type { Charge } from '../query/work.js';

export interface DocumentDelta {
  readonly previous?: DocumentEntry;
  readonly next?: DocumentEntry;
}
export interface StagingCounts {
  readonly documents: CopyCounts; readonly dictionary: CopyCounts; readonly postings: CopyCounts;
  fieldUpdates: number; termUpdates: number;
}
interface StagedTerm { readonly original?: TermEntry; df: number; frequency: number; postings: DirectoryStage<number> }
interface StagedField { documents: number; length: number; terms: DirectoryStage<TermEntry>; cache: Map<string, StagedTerm> }
function nonnegative(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) invalid('INTERNAL_ERROR', path);
}

/** Delta-only maintenance; old reverse records supply subtraction, no source. */
export class CoreDelta {
  private readonly documents: DirectoryStage<DocumentEntry>;
  private readonly fields = new Map<string, StagedField>();
  private readonly counts;
  constructor(private readonly old: IndexRoot, private readonly charge: Charge, private readonly diagnostics?: StagingCounts) {
    validateStateCounts(old.counts, old.configuration.limits);
    if (old.documents.size !== old.counts.documents) invalid('INTERNAL_ERROR', 'state.documents');
    this.counts = { ...old.counts };
    this.documents = new DirectoryStage(old.documents, charge, diagnostics?.documents);
  }
  private field(name: string): StagedField {
    let field = this.fields.get(name);
    if (!field) {
      const original = this.old.fields[name];
      if (!original) invalid('INTERNAL_ERROR', 'reverse.field');
      nonnegative(original.documents, 'field.documents'); nonnegative(original.length, 'field.length');
      if (original.documents > this.old.documents.size || original.length < original.documents) invalid('INTERNAL_ERROR', 'field.statistics');
      field = { documents: original.documents, length: original.length, terms: new DirectoryStage(original.terms, this.charge, this.diagnostics?.dictionary), cache: new Map() };
      this.fields.set(name, field);
    }
    return field;
  }
  private term(field: StagedField, term: string): StagedTerm {
    let staged = field.cache.get(term);
    if (!staged) {
      const original = field.terms.get(term);
      if (original) {
        nonnegative(original.df, 'term.df'); nonnegative(original.frequency, 'term.frequency');
        if (!original.df || original.df !== original.postings.size || original.frequency < original.df) invalid('INTERNAL_ERROR', 'term.statistics');
      }
      staged = { ...(original ? { original } : {}), df: original?.df ?? 0, frequency: original?.frequency ?? 0, postings: new DirectoryStage(original?.postings ?? emptyDirectory<number>(), this.charge, this.diagnostics?.postings) };
      field.cache.set(term, staged);
    }
    return staged;
  }
  private *contribute(document: DocumentEntry, sign: 1 | -1): Generator<WorkStep, void> {
    nonnegative(document.textCodeUnits, 'reverse.textCodeUnits');
    this.counts.textCodeUnits += sign * document.textCodeUnits;
    for (const [name, reverse] of Object.entries(document.fields)) {
      yield this.charge(name.length + 2);
      const field = this.field(name);
      nonnegative(reverse.length, 'reverse.length');
      if (!reverse.length) invalid('INTERNAL_ERROR', 'reverse.length');
      field.documents += sign; field.length += sign * reverse.length;
      this.counts.tokens += sign * reverse.length;
      if (this.diagnostics) this.diagnostics.fieldUpdates++;
      let length = 0;
      for (const [key, tf] of Object.entries(reverse.terms)) {
        yield this.charge(key.length + document.id.length + 4);
        nonnegative(tf, 'reverse.tf');
        if (!tf) invalid('INTERNAL_ERROR', 'reverse.tf');
        length += tf;
        const term = this.term(field, key), current = term.postings.get(document.id);
        if (sign < 0) {
          if (current !== tf) invalid('INTERNAL_ERROR', 'reverse.posting');
          yield* term.postings.delete(document.id);
        } else {
          if (current !== undefined) invalid('INTERNAL_ERROR', 'posting.duplicate');
          yield* term.postings.set(document.id, tf);
        }
        term.df += sign; term.frequency += sign * tf;
        this.counts.postingEntries += sign;
        if (this.diagnostics) this.diagnostics.termUpdates++;
      }
      if (length !== reverse.length) invalid('INTERNAL_ERROR', 'reverse.length');
    }
  }
  *apply(delta: DocumentDelta): Generator<WorkStep, void> {
    if (delta.previous) { yield* this.contribute(delta.previous, -1); yield* this.documents.delete(delta.previous.id); this.counts.documents--; }
    if (delta.next) { yield* this.contribute(delta.next, 1); yield* this.documents.set(delta.next.id, delta.next); this.counts.documents++; }
  }
  *finish(): Generator<WorkStep, Pick<IndexRoot, 'documents' | 'fields' | 'counts'>> {
    const fields: Record<string, FieldIndex> = Object.create(null) as typeof fields;
    for (const name of Object.keys(this.old.fields)) {
      yield this.charge(1);
      const field = this.fields.get(name);
      if (!field) { fields[name] = this.old.fields[name]!; continue; }
      for (const [key, term] of field.cache) {
        yield this.charge(key.length + 3);
        nonnegative(term.df, 'term.df'); nonnegative(term.frequency, 'term.frequency');
        if (term.df !== term.postings.size || term.df > field.documents || term.frequency < term.df || term.frequency > field.length || (!term.df && term.frequency !== 0)) invalid('INTERNAL_ERROR', 'term.statistics');
        if (!term.df) {
          if (term.original) { yield* field.terms.delete(key); this.counts.dictionaryEntries--; }
        } else {
          const postings = yield* term.postings.finish();
          yield* field.terms.set(key, Object.freeze({ df: term.df, frequency: term.frequency, postings }));
          if (!term.original) this.counts.dictionaryEntries++;
        }
      }
      nonnegative(field.documents, 'field.documents'); nonnegative(field.length, 'field.length');
      if (field.documents > this.counts.documents || field.length < field.documents || (!field.documents && field.length !== 0)) invalid('INTERNAL_ERROR', 'field.statistics');
      const terms = yield* field.terms.finish();
      if ((field.documents === 0) !== (terms.size === 0)) invalid('INTERNAL_ERROR', 'field.terms');
      fields[name] = Object.freeze({ documents: field.documents, length: field.length, terms });
    }
    const documents = yield* this.documents.finish();
    yield this.charge(5);
    validateStateCounts(this.counts, this.old.configuration.limits);
    if (documents.size !== this.counts.documents) invalid('INTERNAL_ERROR', 'state.documents');
    return { documents, fields: Object.freeze(fields), counts: Object.freeze(this.counts) };
  }
}

/** Clear drops roots without traversing old postings or manufacturing callbacks. */
export function* clearedCore(old: IndexRoot, charge: Charge): Generator<WorkStep, Pick<IndexRoot, 'documents' | 'fields' | 'counts'>> {
  const fields: Record<string, FieldIndex> = Object.create(null) as typeof fields;
  for (const name of Object.keys(old.fields)) {
    yield charge(1);
    fields[name] = Object.freeze({ documents: 0, length: 0, terms: emptyDirectory<TermEntry>() });
  }
  yield charge(5);
  return { documents: emptyDirectory<DocumentEntry>(), fields: Object.freeze(fields), counts: Object.freeze({ documents: 0, textCodeUnits: 0, tokens: 0, dictionaryEntries: 0, postingEntries: 0 }) };
}
