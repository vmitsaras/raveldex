import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { captureOptions } from '../../core/contracts/options.js';
import { captureId, captureRecord } from '../../core/contracts/record.js';
import type { MutationOptions, OwnedConfiguration, OwnedOptions, OwnedRecord } from '../../core/contracts/types.js';
import { invalid } from '../../core/errors/error.js';
import type { RecordPatch } from './types.js';

export interface CapturedPatch {
  readonly id: string;
  readonly expectedRevision: number;
  readonly set: OwnedRecord;
  readonly unsetText: readonly string[];
  readonly unsetMetadata: readonly string[];
  readonly options: OwnedOptions;
}

export function capturePatch(input: RecordPatch, options: MutationOptions | undefined, configuration: OwnedConfiguration): CapturedPatch {
  const { schema, limits } = configuration, admission = new Admission(limits.maxAdmissionEntries);
  const capturedOptions = captureOptions(options, limits, false, admission);
  if (capturedOptions.signal?.aborted) invalid('CANCELLED', 'options.signal');
  const data = ownObject(input, 'INVALID_RECORD', 'patch', admission);
  keysOnly(data, ['id', 'expectedRevision', 'set', 'unset'], 'INVALID_RECORD', 'patch');
  const id = captureId(data.id, limits, 'INVALID_RECORD', 'patch.id');
  const expectedRevision = data.expectedRevision;
  if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) invalid('INVALID_RECORD', 'patch.expectedRevision');
  const set = has(data, 'set') ? ownObject(data.set, 'INVALID_RECORD', 'patch.set', admission) : Object.create(null) as Record<string, unknown>;
  keysOnly(set, ['text', 'metadata'], 'INVALID_RECORD', 'patch.set');
  const assigned = captureRecord({ id, text: has(set, 'text') ? set.text : {}, metadata: has(set, 'metadata') ? set.metadata : {} }, schema, limits, admission, 'patch.set');
  const unset = has(data, 'unset') ? ownObject(data.unset, 'INVALID_RECORD', 'patch.unset', admission) : Object.create(null) as Record<string, unknown>;
  keysOnly(unset, ['text', 'metadata'], 'INVALID_RECORD', 'patch.unset');
  function fields(namespace: 'text' | 'metadata'): readonly string[] {
    if (!has(unset, namespace)) return Object.freeze([]);
    const values = ownArray(unset[namespace], namespace === 'text' ? limits.maxTextFields : limits.maxMetadataFields, 'INVALID_RECORD', `patch.unset.${namespace}`, admission);
    const seen = new Set<string>();
    return Object.freeze(values.map(value => {
      const name = stringValue(value, limits.maxFieldNameCodeUnits, 'INVALID_RECORD', `patch.unset.${namespace}`);
      if (!has(schema[namespace], name) || seen.has(name) || has(assigned[namespace], name)) invalid('INVALID_RECORD', `patch.unset.${namespace}`);
      seen.add(name); return name;
    }));
  }
  const unsetText = fields('text'), unsetMetadata = fields('metadata');
  if (Object.keys(assigned.text).length + Object.keys(assigned.metadata).length + unsetText.length + unsetMetadata.length === 0) invalid('INVALID_RECORD', 'patch.actions');
  return Object.freeze({ id, expectedRevision, set: assigned, unsetText, unsetMetadata, options: capturedOptions });
}
