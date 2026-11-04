import { Admission, ownArray, scanUnicode, stringValue } from '../contracts/data.js';
import { invalid } from '../errors/error.js';
import { WorkBudget } from '../limits/work.js';
import { directoryEntries, directoryGet } from '../index/directory.js';
import type { WorkStep } from '../index/directory.js';
import type { IndexRoot } from '../index/state.js';

/** Internal exact normalized-term primitive; query analysis belongs to RX-1003. */
export function exactIds(root: IndexRoot, input: unknown, selected?: unknown): Generator<WorkStep, readonly string[]> {
  const limits = root.configuration.limits;
  const term = stringValue(input, limits.maxTermCodeUnits, 'INVALID_QUERY', 'query.term');
  const fields = selected === undefined ? Object.keys(root.configuration.schema.text) : ownArray(selected, limits.maxTextFields, 'INVALID_QUERY', 'query.fields', new Admission(limits.maxAdmissionEntries));
  if (!fields.length) invalid('INVALID_QUERY', 'query.fields');
  const seen = new Set<string>();
  for (const field of fields) {
    if (typeof field !== 'string' || !Object.hasOwn(root.configuration.schema.text, field) || seen.has(field)) invalid('INVALID_QUERY', 'query.fields');
    seen.add(field);
  }
  return lookup(root, term, [...seen]);
}

function* lookup(root: IndexRoot, term: string, fields: readonly string[]): Generator<WorkStep, readonly string[]> {
  const budget = new WorkBudget(root.configuration.limits.maxSearchWorkUnits);
  const charge = (workUnits: number): WorkStep => { budget.charge(workUnits); return { workUnits }; };
  for (const step of scanUnicode(term, 'INVALID_QUERY', 'query.term')) yield charge(step.workUnits);
  const ids = new Set<string>();
  for (const name of fields) {
    const field = root.fields[name];
    if (!field) invalid('INTERNAL_ERROR', 'index.fields');
    yield charge(term.length + 1);
    const entry = directoryGet(field.terms, term);
    if (!entry) continue;
    for (const [id, tf] of directoryEntries(entry.postings)) {
      yield charge(id.length + 2);
      if (!Number.isSafeInteger(tf) || tf <= 0 || !directoryGet(root.documents, id)) invalid('INTERNAL_ERROR', 'index.postings');
      ids.add(id);
      yield charge(1);
    }
  }
  // Complete owned membership, with no ranking/page/order promise at this layer.
  const result: string[] = [];
  for (const id of ids) { yield charge(1); result.push(id); }
  return Object.freeze(result);
}
