import { Admission } from '../contracts/data.js';
import { captureBatch, captureRecord, captureRemoveIds } from '../contracts/record.js';
import { captureOptions } from '../contracts/options.js';
import type { OwnedConfiguration, OwnedOptions, OwnedRecord } from '../contracts/types.js';
import { invalid } from '../errors/error.js';

export type MutationKind = 'add' | 'addMany' | 'replace' | 'remove' | 'clear';
export interface OwnedMutation {
  readonly kind: MutationKind;
  readonly records: readonly OwnedRecord[];
  readonly ids: readonly string[];
  readonly options: OwnedOptions;
}
export function captureMutation(configuration: OwnedConfiguration, kind: MutationKind, input?: unknown, options?: unknown): OwnedMutation {
  const { schema, limits } = configuration, admission = new Admission(limits.maxAdmissionEntries);
  let records: readonly OwnedRecord[] = [], ids: readonly string[] = [];
  switch (kind) {
    case 'add': case 'replace': records = Object.freeze([captureRecord(input, schema, limits, admission)]); break;
    case 'addMany': records = captureBatch(input, schema, limits, admission); break;
    case 'remove': ids = captureRemoveIds(input, limits, admission); break;
    case 'clear': if (input !== undefined) invalid('INVALID_OPTIONS', 'clear'); break;
    default: invalid('INVALID_OPTIONS', 'mutation.kind');
  }
  return Object.freeze({ kind, records: Object.freeze(records), ids: Object.freeze(ids), options: captureOptions(options, limits, false, admission) });
}
