import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import type { CapturedPayload, PayloadContext } from '../../core/capabilities/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { Limits } from '../../core/limits/limits.js';
import { captureMetadataPayload } from '../metadata/payload.js';
import type { InspectorOptions } from './types.js';

export interface CapturedInspectorOptions {
  readonly id: string; readonly sourceFields: readonly string[]; readonly maxFacts: number;
  readonly maxWorkUnits: number; readonly maxOutputEntries: number;
}
export interface OwnedInspectorRequest {
  readonly ids: readonly string[]; readonly maxFacts: number; readonly expectedRevision?: number;
  readonly sourceFields: readonly string[];
}
function fields(input: unknown, admission: Admission, maximum: number, path: string): readonly string[] {
  const seen = new Set<string>();
  return Object.freeze(ownArray(input, maximum, 'INVALID_OPTIONS', path, admission).map(value => {
    const name = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', path);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || name === 'constructor' || name === 'prototype' || seen.has(name)) invalid('INVALID_OPTIONS', path);
    seen.add(name); return name;
  }));
}
function integer(input: unknown, maximum: number, path: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) invalid('INVALID_OPTIONS', path);
  bound(input, maximum, path); return input;
}
export function captureInspectorOptions(input: InspectorOptions): CapturedInspectorOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'inspector.options', admission);
  keysOnly(options, ['id', 'sourceFields', 'maxFacts', 'maxWorkUnits', 'maxOutputEntries'], 'INVALID_OPTIONS', 'inspector.options');
  const id = has(options, 'id') ? stringValue(options.id, 64, 'INVALID_OPTIONS', 'inspector.id') : 'inspector';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'inspector.id');
  return Object.freeze({ id,
    sourceFields: has(options, 'sourceFields') ? fields(options.sourceFields, admission, DEFAULT_LIMITS.maxTextFields, 'inspector.sourceFields') : Object.freeze([]),
    maxFacts: integer(has(options, 'maxFacts') ? options.maxFacts : 4096, 4096, 'inspector.maxFacts'),
    maxWorkUnits: integer(has(options, 'maxWorkUnits') ? options.maxWorkUnits : DEFAULT_LIMITS.maxSearchWorkUnits, DEFAULT_LIMITS.maxSearchWorkUnits, 'inspector.maxWorkUnits'),
    maxOutputEntries: integer(has(options, 'maxOutputEntries') ? options.maxOutputEntries : DEFAULT_LIMITS.maxAdmissionEntries, DEFAULT_LIMITS.maxAdmissionEntries, 'inspector.maxOutputEntries'),
  });
}
export function parseInspectorRequest(input: unknown, limits: Limits, options: CapturedInspectorOptions): OwnedInspectorRequest {
  const admission = new Admission(limits.maxAdmissionEntries);
  const data = ownObject(input, 'INVALID_OPTIONS', 'inspector.request', admission);
  keysOnly(data, ['ids', 'maxFacts', 'expectedRevision', 'sourceFields'], 'INVALID_OPTIONS', 'inspector.request');
  const seen = new Set<string>();
  const ids = Object.freeze(ownArray(data.ids, Math.min(128, limits.maxDocuments), 'INVALID_OPTIONS', 'inspector.ids', admission).map(value => {
    const id = stringValue(value, limits.maxIdCodeUnits, 'INVALID_OPTIONS', 'inspector.ids');
    if (!id.length || seen.has(id)) invalid('INVALID_OPTIONS', 'inspector.ids');
    seen.add(id); return id;
  }));
  const maxFacts = integer(has(data, 'maxFacts') ? data.maxFacts : options.maxFacts, options.maxFacts, 'inspector.maxFacts');
  const revision = data.expectedRevision;
  if (has(data, 'expectedRevision') && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)) invalid('INVALID_OPTIONS', 'inspector.expectedRevision');
  const sourceFields = has(data, 'sourceFields') ? fields(data.sourceFields, admission, limits.maxTextFields, 'inspector.sourceFields') : Object.freeze([]);
  for (const field of sourceFields) if (!options.sourceFields.includes(field)) invalid('MISSING_CAPABILITY', 'inspector.sourceFields');
  return Object.freeze({ ids, maxFacts, ...(typeof revision === 'number' ? { expectedRevision: revision } : {}), sourceFields });
}
export function captureInspectorRequest(input: unknown, context: PayloadContext, options: CapturedInspectorOptions): CapturedPayload {
  const captured = captureMetadataPayload(input, context, 'INVALID_OPTIONS');
  return Object.freeze({ value: parseInspectorRequest(captured.value, context.limits, options), codeUnits: captured.codeUnits });
}
