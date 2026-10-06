import { invalid } from '../errors/error.js';
import { validateStateCounts } from '../limits/limits.js';
import { WorkBudget } from '../limits/work.js';
import { bucketOf, directoryEntries, directoryGet, DIRECTORY_SLOTS } from './directory.js';
import type { Directory, WorkStep } from './directory.js';
import type { IndexRoot } from './state.js';

function check(value: boolean, path: string): asserts value {
  if (!value) invalid('INTERNAL_ERROR', `index.${path}`);
}
function count(value: number, path: string, positive = false): void {
  check(Number.isSafeInteger(value) && value >= (positive ? 1 : 0), path);
}

/** Diagnostic full traversal, not an uncharged step in every future mutation. */
export function* inspectIndex(root: IndexRoot): Generator<WorkStep, void> {
  const budget = new WorkBudget(root.configuration.limits.maxMutationWorkUnits);
  const charge = (workUnits: number): WorkStep => { budget.charge(workUnits); return { workUnits }; };
  function* directory<T>(data: Directory<T>): Generator<WorkStep, void> {
    count(data.size, 'directory.size');
    check(Object.getPrototypeOf(data.buckets) === null, 'directory.prototype');
    let entries = 0;
    for (const [slot, bucket] of Object.entries(data.buckets)) {
      yield charge(1);
      check(Number.isInteger(Number(slot)) && Number(slot) >= 0 && Number(slot) < DIRECTORY_SLOTS && String(Number(slot)) === slot, 'directory.slot');
      check(Object.getPrototypeOf(bucket) === null && Object.keys(bucket).length > 0, 'directory.bucket');
      for (const key of Object.keys(bucket)) {
        yield charge(key.length + 1);
        check(bucketOf(key) === slot, 'directory.hash');
        entries++;
      }
    }
    check(entries === data.size, 'directory.size');
  }
  check(root.revision === 0, 'revision');
  yield* directory(root.documents);
  const counts = { documents: 0, textCodeUnits: 0, tokens: 0, dictionaryEntries: 0, postingEntries: 0 };
  const statistics: Record<string, { documents: number; length: number }> = Object.create(null) as typeof statistics;
  for (const field of Object.keys(root.configuration.schema.text)) statistics[field] = { documents: 0, length: 0 };
  for (const [id, record] of directoryEntries(root.documents)) {
    yield charge(id.length + 1);
    check(record.id === id, 'documents.id');
    count(record.textCodeUnits, 'documents.textCodeUnits');
    counts.documents++;
    counts.textCodeUnits += record.textCodeUnits;
    for (const [name, field] of Object.entries(record.fields)) {
      yield charge(1);
      check(Object.hasOwn(statistics, name), 'reverse.field');
      count(field.length, 'reverse.length', true);
      let length = 0;
      for (const [term, tf] of Object.entries(field.terms)) {
        yield charge(term.length + id.length + 2);
        count(tf, 'reverse.frequency', true);
        length += tf;
        const entry = root.fields[name] && directoryGet(root.fields[name]!.terms, term);
        check(entry !== undefined && directoryGet(entry.postings, id) === tf, 'reverse.posting');
      }
      check(length === field.length, 'reverse.length');
      statistics[name]!.documents++;
      statistics[name]!.length += length;
      counts.tokens += length;
    }
  }
  check(Object.keys(root.fields).length === Object.keys(statistics).length, 'fields.count');
  for (const [name, field] of Object.entries(root.fields)) {
    yield charge(1);
    const expected = statistics[name];
    check(expected !== undefined, 'fields.name');
    check(field.documents === expected.documents && field.length === expected.length, 'fields.statistics');
    yield* directory(field.terms);
    for (const [term, entry] of directoryEntries(field.terms)) {
      yield charge(term.length + 1);
      count(entry.df, 'terms.df', true);
      count(entry.frequency, 'terms.frequency', true);
      check(entry.df <= field.documents, 'terms.df');
      yield* directory(entry.postings);
      let df = 0, frequency = 0;
      for (const [id, tf] of directoryEntries(entry.postings)) {
        yield charge(id.length + term.length + 2);
        count(tf, 'postings.frequency', true);
        const record = directoryGet(root.documents, id);
        check(record !== undefined && record.fields[name]?.terms[term] === tf, 'postings.reverse');
        df++;
        frequency += tf;
      }
      check(entry.df === df && entry.frequency === frequency, 'terms.statistics');
      counts.dictionaryEntries++;
      counts.postingEntries += df;
    }
  }
  for (const name of Object.keys(counts) as (keyof typeof counts)[]) {
    yield charge(1);
    check(root.counts[name] === counts[name], 'corpus.statistics');
  }
  validateStateCounts(counts, root.configuration.limits);
}
