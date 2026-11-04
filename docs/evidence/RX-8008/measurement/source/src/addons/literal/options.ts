import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { Limits } from '../../core/limits/limits.js';
import type { CapturedPayload, PayloadContext } from '../../core/capabilities/types.js';
import type { LiteralOptions } from './types.js';

export interface CapturedOptions { readonly fields: readonly string[]; readonly id: string; readonly maxWorkUnits: number; readonly maxRanges: number; readonly maxOutputEntries: number }
export interface OwnedLiteral { readonly text: string; readonly fields: readonly string[] }
export interface OwnedEvidence { readonly ids: readonly string[]; readonly maxRanges: number; readonly maxFacts: number; readonly expectedRevision?: number }
const fieldName = (value: unknown, code: 'INVALID_QUERY' | 'INVALID_OPTIONS', path: string): string => {
  const text = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, code, path);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(text) || text === 'constructor' || text === 'prototype') invalid(code, path);
  return text;
};
function integer(value: unknown, maximum: number, code: 'INVALID_QUERY' | 'INVALID_OPTIONS', path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid(code, path);
  bound(value, maximum, path); return value;
}
export function captureOptions(input: LiteralOptions): CapturedOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries), raw = ownObject(input, 'INVALID_OPTIONS', 'literal.options', admission);
  keysOnly(raw, ['fields','id','maxWorkUnits','maxRanges','maxOutputEntries'], 'INVALID_OPTIONS', 'literal.options');
  const seen = new Set<string>(), fields = ownArray(raw.fields, DEFAULT_LIMITS.maxTextFields, 'INVALID_OPTIONS', 'literal.fields', admission).map(value => {
    const name = fieldName(value, 'INVALID_OPTIONS', 'literal.fields');
    if (seen.has(name)) invalid('INVALID_OPTIONS', 'literal.fields'); seen.add(name); return name;
  });
  if (!fields.length) invalid('INVALID_OPTIONS', 'literal.fields');
  const id = has(raw,'id') ? stringValue(raw.id,64,'INVALID_OPTIONS','literal.id') : 'literal';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS','literal.id');
  return Object.freeze({ id, fields: Object.freeze(fields.sort()),
    maxWorkUnits: integer(has(raw,'maxWorkUnits') ? raw.maxWorkUnits : DEFAULT_LIMITS.maxSearchWorkUnits, DEFAULT_LIMITS.maxSearchWorkUnits, 'INVALID_OPTIONS','literal.maxWorkUnits'),
    maxRanges: integer(has(raw,'maxRanges') ? raw.maxRanges : 256,1024,'INVALID_OPTIONS','literal.maxRanges'),
    maxOutputEntries: integer(has(raw,'maxOutputEntries') ? raw.maxOutputEntries : DEFAULT_LIMITS.maxAdmissionEntries,DEFAULT_LIMITS.maxAdmissionEntries,'INVALID_OPTIONS','literal.maxOutputEntries'),
  });
}
export function parseLiteral(input: unknown, limits: Limits, enabled: readonly string[], admission = new Admission(limits.maxAdmissionEntries)): OwnedLiteral {
  const raw = ownObject(input,'INVALID_QUERY','literal.payload',admission);
  keysOnly(raw,['text','fields'],'INVALID_QUERY','literal.payload');
  const text = stringValue(raw.text,Math.min(2048,limits.maxQueryLexicalCodeUnits),'INVALID_QUERY','literal.text');
  if (!text.length) invalid('INVALID_QUERY','literal.text');
  const seen = new Set<string>();
  const fields = has(raw,'fields') ? ownArray(raw.fields,limits.maxTextFields,'INVALID_QUERY','literal.fields',admission).map(value => {
    const name = fieldName(value,'INVALID_QUERY','literal.fields');
    if (seen.has(name)) invalid('INVALID_QUERY','literal.fields');
    if (!enabled.includes(name)) invalid('MISSING_CAPABILITY','literal.fields'); seen.add(name); return name;
  }).sort() : [...enabled];
  if (!fields.length) invalid('INVALID_QUERY','literal.fields');
  bound(text.length + fields.reduce((sum,field)=>sum+field.length,0),Math.min(2048,limits.maxQueryLexicalCodeUnits),'literal.payload');
  return Object.freeze({ text, fields: Object.freeze(fields) });
}
export function captureLiteral(input: unknown, context: PayloadContext, options: CapturedOptions): CapturedPayload {
  const value = parseLiteral(input,context.limits,options.fields,context.admission), codeUnits = value.text.length + value.fields.reduce((sum,field)=>sum+field.length,0);
  bound(codeUnits,context.maxCodeUnits,'literal.payload'); return Object.freeze({value,codeUnits});
}
export function parseEvidence(input: unknown, limits: Limits, options: CapturedOptions, admission = new Admission(limits.maxAdmissionEntries)): OwnedEvidence {
  const raw = ownObject(input,'INVALID_OPTIONS','literal.evidence',admission);
  keysOnly(raw,['ids','maxRanges','expectedRevision','maxFacts'],'INVALID_OPTIONS','literal.evidence');
  const seen = new Set<string>(), ids = ownArray(raw.ids,Math.min(128,limits.maxDocuments),'INVALID_OPTIONS','literal.evidence.ids',admission).map(value => {
    const id = stringValue(value,limits.maxIdCodeUnits,'INVALID_OPTIONS','literal.evidence.ids');
    if (!id.length || seen.has(id)) invalid('INVALID_OPTIONS','literal.evidence.ids'); seen.add(id); return id;
  });
  const revision = raw.expectedRevision;
  if (has(raw,'expectedRevision') && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)) invalid('INVALID_OPTIONS','literal.evidence.revision');
  return Object.freeze({ids:Object.freeze(ids), maxRanges:integer(has(raw,'maxRanges') ? raw.maxRanges : options.maxRanges,options.maxRanges,'INVALID_OPTIONS','literal.evidence.maxRanges'),
    maxFacts:integer(has(raw,'maxFacts') ? raw.maxFacts : 4096,4096,'INVALID_OPTIONS','literal.evidence.maxFacts'), ...(typeof revision === 'number' ? {expectedRevision:revision} : {})});
}
export function captureEvidence(input: unknown, context: PayloadContext, options: CapturedOptions): CapturedPayload {
  const value = parseEvidence(input,context.limits,options,context.admission), codeUnits = value.ids.reduce((sum,id)=>sum+id.length,0);
  bound(codeUnits,context.maxCodeUnits,'literal.evidence'); return Object.freeze({value,codeUnits});
}
