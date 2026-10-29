import { Admission, has, keysOnly, ownArray, ownObject } from '../../core/contracts/data.js';
import { invalid } from '../../core/errors/error.js';
import { directoryGet } from '../../core/index/directory.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { Limits } from '../../core/limits/limits.js';
import type { SourceRoot } from '../phrases/store.js';

/** Authoritative source lookup: a sparse field is a nonmatch; missing record is
 * provider inconsistency. Never retain a source value beyond this operation. */
export function* literalValues(root: SourceRoot,id: string,field: string,limits: Limits): Generator<WorkStep,readonly string[]> {
  yield {workUnits:id.length+field.length+1};
  const record=directoryGet(root.records,id);
  if (!record) invalid('MISSING_CAPABILITY','literal.source.record');
  if (!Object.isFrozen(record)) invalid('INCOMPATIBLE_CAPABILITY','literal.source.record');
  const admission=new Admission(limits.maxAdmissionEntries),data=ownObject(record,'INCOMPATIBLE_CAPABILITY','literal.source.record',admission);
  keysOnly(data,['text','retainedEntries','textCodeUnits'],'INCOMPATIBLE_CAPABILITY','literal.source.record');
  if (!Number.isSafeInteger(data.retainedEntries) || (data.retainedEntries as number)<0 || (data.retainedEntries as number)>root.maxRetainedEntries ||
      !Number.isSafeInteger(data.textCodeUnits) || (data.textCodeUnits as number)<0 || (data.textCodeUnits as number)>limits.maxTextCodeUnitsPerRecord) invalid('INCOMPATIBLE_CAPABILITY','literal.source.counts');
  if (typeof data.text!=='object' || data.text===null || !Object.isFrozen(data.text)) invalid('INCOMPATIBLE_CAPABILITY','literal.source.text');
  const text=ownObject(data.text,'INCOMPATIBLE_CAPABILITY','literal.source.text',admission);
  for (const name of Object.keys(text)) {yield {workUnits:name.length+1};if (!root.fields.includes(name)) invalid('INCOMPATIBLE_CAPABILITY','literal.source.fields');}
  if (!has(text,field)) return Object.freeze([]);
  if (!Object.isFrozen(text[field])) invalid('INCOMPATIBLE_CAPABILITY','literal.source.values');
  const values=ownArray(text[field],limits.maxTextValuesPerField,'INCOMPATIBLE_CAPABILITY','literal.source.values',admission);
  for (const value of values) {yield {workUnits:1};if (typeof value!=='string' || value.length>limits.maxTextCodeUnitsPerValue) invalid('INCOMPATIBLE_CAPABILITY','literal.source.value');}
  return Object.freeze(values as string[]);
}
