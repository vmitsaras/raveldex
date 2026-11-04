import { captureConfiguration } from '../contracts/schema.js';
import { analyzeRecord, canonicalMetadata, captureBatch } from '../contracts/record.js';
import type { OwnedConfiguration, OwnedRecord } from '../contracts/types.js';
import { invalid } from '../errors/error.js';
import { validateStateCounts } from '../limits/limits.js';
import { WorkBudget } from '../limits/work.js';
import { updateTermOrder } from './term-order.js';
import type { TermOrder } from './term-order.js';
import { DirectoryBuilder } from './directory.js';
import type { Directory, WorkStep } from './directory.js';
import type { DocumentEntry, FieldIndex, IndexRoot, ReverseField, TermEntry } from './state.js';

interface MutableTerm { df: number; frequency: number; postings: DirectoryBuilder<number> }
interface MutableField { documents: number; length: number; terms: DirectoryBuilder<MutableTerm>; keys: Set<string> }

/**
 * Internal initial-construction primitive, not an engine/addMany API. Each append
 * captures one admitted batch immediately. No searchable root escapes before
 * finish is exhausted. Failure/abandonment invalidates and releases all staging.
 */
export class IndexConstruction {
  private readonly configuration: OwnedConfiguration;
  private documents = new DirectoryBuilder<DocumentEntry>();
  private fields: Record<string, MutableField> = Object.create(null) as typeof this.fields;
  private counts = { documents: 0, textCodeUnits: 0, tokens: 0, dictionaryEntries: 0, postingEntries: 0 };
  private status: 'open' | 'active' | 'failed' | 'finished' = 'open';
  private totalWork = 0;
  get workUnits(): number { return this.totalWork; }
  constructor(configuration: unknown) {
    this.configuration = captureConfiguration(configuration);
    if (this.configuration.capabilities) invalid('INCOMPATIBLE_CAPABILITY', 'index.construction.addons');
    for (const name of Object.keys(this.configuration.schema.text)) {
      this.fields[name] = { documents: 0, length: 0, terms: new DirectoryBuilder(), keys: new Set() };
    }
  }
  private requireOpen(): void {
    if (this.status !== 'open') invalid('INTERNAL_ERROR', 'index.construction.state');
  }
  private discard(): void {
    this.status = 'failed';
    this.documents = new DirectoryBuilder();
    this.fields = Object.create(null) as typeof this.fields;
  }
  private *charged(steps: Generator<WorkStep, void>, budget: WorkBudget): Generator<WorkStep, void> {
    for (const step of steps) {
      budget.charge(step.workUnits);
      this.totalWork += step.workUnits;
      yield step;
    }
  }
  append(input: unknown): Generator<WorkStep, void> {
    this.requireOpen();
    let records: readonly OwnedRecord[];
    try { records = captureBatch(input, this.configuration.schema, this.configuration.limits); }
    catch (error) { this.discard(); throw error; }
    this.status = 'active';
    const iterator = this.consume(records);
    // Closing an unstarted generator does not execute its finally block. The
    // wrapper makes abandonment terminal even before the first .next().
    return this.guarded(iterator);
  }
  private guarded<T>(iterator: Generator<WorkStep, T>): Generator<WorkStep, T> {
    const owner = this;
    return {
      next(value?: unknown) { return iterator.next(value); },
      return(value: T) { owner.discard(); return iterator.return(value); },
      throw(error: unknown) { owner.discard(); return iterator.throw(error); },
      [Symbol.iterator]() { return this; },
    };
  }
  private *consume(records: readonly OwnedRecord[]): Generator<WorkStep, void> {
    const budget = new WorkBudget(this.configuration.limits.maxMutationWorkUnits);
    let completed = false;
    try {
      yield* this.charged(this.stage(records), budget);
      this.status = 'open';
      completed = true;
    } finally { if (!completed) this.discard(); }
  }
  private *stage(records: readonly OwnedRecord[]): Generator<WorkStep, void> {
    const limits = this.configuration.limits;
    for (const record of records) {
      yield { workUnits: record.id.length + 1 };
      if (this.documents.get(record.id)) invalid('ID_EXISTS', 'record.id');
      this.counts.documents++;
      this.counts.textCodeUnits += record.textCodeUnits;
      validateStateCounts(this.counts, limits);
      const reverse: Record<string, { length: number; terms: Record<string, number> }> = Object.create(null) as typeof reverse;
      for (const step of analyzeRecord(record, limits)) {
        yield { workUnits: step.workUnits };
        if (step.token) {
          const field = reverse[step.field!] ??= { length: 0, terms: Object.create(null) as Record<string, number> };
          field.length++;
          field.terms[step.token.term] = (field.terms[step.token.term] ?? 0) + 1;
          this.counts.tokens++;
          validateStateCounts(this.counts, limits);
          yield { workUnits: step.token.term.length + 2 };
        }
      }
      const frozenReverse: Record<string, ReverseField> = Object.create(null) as typeof frozenReverse;
      for (const [name, field] of Object.entries(reverse)) {
        const index = this.fields[name]!;
        index.documents++;
        index.length += field.length;
        yield { workUnits: 2 };
        for (const [term, tf] of Object.entries(field.terms)) {
          yield { workUnits: term.length + 1 };
          let entry = index.terms.get(term);
          if (!entry) {
            entry = { df: 0, frequency: 0, postings: new DirectoryBuilder() };
            index.terms.set(term, entry);
            index.keys.add(term);
            this.counts.dictionaryEntries++;
            yield { workUnits: term.length + 2 };
          }
          entry.df++;
          entry.frequency += tf;
          entry.postings.set(record.id, tf);
          this.counts.postingEntries++;
          validateStateCounts(this.counts, limits);
          yield { workUnits: record.id.length + 4 };
        }
        frozenReverse[name] = Object.freeze({ length: field.length, terms: Object.freeze(field.terms) });
      }
      // Canonicalization visits original values, including duplicates. Charge
      // the Set input before deduplication, then its owned output separately.
      for (const value of Object.values(record.metadata)) {
        yield { workUnits: 1 };
        for (const item of Array.isArray(value) ? value : [value]) {
          yield { workUnits: typeof item === 'string' ? item.length + 1 : 1 };
        }
      }
      const metadata = canonicalMetadata(record);
      for (const value of Object.values(metadata)) yield { workUnits: Array.isArray(value) ? value.length + 1 : 1 };
      this.documents.set(record.id, Object.freeze({ id: record.id, metadata, textCodeUnits: record.textCodeUnits, fields: Object.freeze(frozenReverse) }));
      yield { workUnits: record.id.length + 1 };
    }
  }
  finish(): Generator<WorkStep, IndexRoot> {
    this.requireOpen();
    this.status = 'active';
    return this.guarded(this.finalize());
  }
  private *finalize(): Generator<WorkStep, IndexRoot> {
    const budget = new WorkBudget(this.configuration.limits.maxMutationWorkUnits);
    const charge = (step: WorkStep): WorkStep => {
      budget.charge(step.workUnits);
      this.totalWork += step.workUnits;
      return step;
    };
    function* seal<T>(builder: DirectoryBuilder<T>): Generator<WorkStep, Directory<T>> {
      const iterator = builder.seal();
      while (true) {
        const step = iterator.next();
        if (step.done) return step.value;
        yield charge(step.value);
      }
    }
    let completed = false;
    try {
      const fields: Record<string, FieldIndex> = Object.create(null) as typeof fields;
      for (const [name, field] of Object.entries(this.fields)) {
        const terms = new DirectoryBuilder<TermEntry>();
        let order: TermOrder | null = null;
        for (const key of field.keys) {
          yield charge({ workUnits: key.length + 1 });
          const term = field.terms.get(key)!;
          order = yield* updateTermOrder(order, key, true, units => charge({ workUnits: units }));
          const postings = yield* seal(term.postings);
          terms.set(key, Object.freeze({ df: term.df, frequency: term.frequency, postings }));
          yield charge({ workUnits: key.length + 1 });
        }
        fields[name] = Object.freeze({ documents: field.documents, length: field.length, terms: yield* seal(terms), order });
        yield charge({ workUnits: 1 });
      }
      const documents = yield* seal(this.documents);
      validateStateCounts(this.counts, this.configuration.limits);
      const root: IndexRoot = Object.freeze({ revision: 0, configuration: this.configuration, documents, fields: Object.freeze(fields), counts: Object.freeze({ ...this.counts }), participants: Object.freeze(Object.create(null)) as Readonly<Record<string, unknown>> });
      this.fields = Object.create(null) as typeof this.fields;
      this.status = 'finished';
      completed = true;
      return root;
    } finally { if (!completed) this.discard(); }
  }
}
