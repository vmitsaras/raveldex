import { Admission, has, keysOnly, ownArray, ownObject } from './data.js';
import { bound, invalid } from '../errors/error.js';
import { BASIC_ANALYZER } from '../analyzer/basic.js';
import { DEFAULT_LIMITS, resolveLimits } from '../limits/limits.js';
import type { Limits } from '../limits/limits.js';
import type { MetadataType, OwnedConfiguration, OwnedSchema } from './types.js';

export function captureSchema(input: unknown, limits: Limits, admission = new Admission(limits.maxAdmissionEntries)): OwnedSchema {
  const schema = ownObject(input, 'INVALID_SCHEMA', 'schema', admission);
  keysOnly(schema, ['text', 'metadata'], 'INVALID_SCHEMA', 'schema');
  const text = ownObject(schema.text, 'INVALID_SCHEMA', 'schema.text', admission);
  const metadata = has(schema, 'metadata') ? ownObject(schema.metadata, 'INVALID_SCHEMA', 'schema.metadata', admission) : Object.create(null) as Record<string, unknown>;
  const textNames = Object.keys(text);
  const metadataNames = Object.keys(metadata);
  if (textNames.length === 0) invalid('INVALID_SCHEMA', 'schema.text');
  bound(textNames.length, limits.maxTextFields, 'schema.text');
  bound(metadataNames.length, limits.maxMetadataFields, 'schema.metadata');
  const ownedText: Record<string, { readonly boost: number }> = Object.create(null) as Record<string, { readonly boost: number }>;
  const ownedMetadata: Record<string, { readonly type: MetadataType; readonly multi: boolean; readonly nullable: boolean }> = Object.create(null) as typeof ownedMetadata;
  for (const [group, names] of [[text, textNames], [metadata, metadataNames]] as const) {
    for (const name of names) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || name === 'constructor' || name === 'prototype') invalid('INVALID_SCHEMA', 'schema.fields');
      bound(name.length, limits.maxFieldNameCodeUnits, 'schema.fields');
      if (has(text, name) && has(metadata, name)) invalid('INVALID_SCHEMA', 'schema.fields');
      const path = `schema.${group === text ? 'text' : 'metadata'}.${name}`;
      const field = ownObject(group[name], 'INVALID_SCHEMA', path, admission);
      if (group === text) {
        keysOnly(field, ['boost'], 'INVALID_SCHEMA', path);
        const boost = has(field, 'boost') ? field.boost : 1;
        if (typeof boost !== 'number' || !Number.isFinite(boost) || boost <= 0 || boost > 16) invalid('INVALID_SCHEMA', `${path}.boost`);
        ownedText[name] = Object.freeze({ boost });
      } else {
        keysOnly(field, ['type', 'multi', 'nullable'], 'INVALID_SCHEMA', path);
        if (field.type !== 'string' && field.type !== 'number' && field.type !== 'boolean') invalid('INVALID_SCHEMA', `${path}.type`);
        const multi = has(field, 'multi') ? field.multi : false;
        const nullable = has(field, 'nullable') ? field.nullable : false;
        if (typeof multi !== 'boolean' || typeof nullable !== 'boolean') invalid('INVALID_SCHEMA', path);
        ownedMetadata[name] = Object.freeze({ type: field.type, multi, nullable });
      }
    }
  }
  return Object.freeze({ text: Object.freeze(ownedText), metadata: Object.freeze(ownedMetadata) });
}

export function captureConfiguration(input: unknown): OwnedConfiguration {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const config = ownObject(input, 'INVALID_OPTIONS', 'config', admission);
  keysOnly(config, ['schema', 'limits', 'analyzer', 'addons'], 'INVALID_OPTIONS', 'config');
  if (has(config, 'limits') && config.limits === undefined) invalid('INVALID_OPTIONS', 'config.limits');
  const limits = has(config, 'limits') ? resolveLimits(config.limits, admission) : DEFAULT_LIMITS;
  // The configured admission ceiling applies to the whole configuration too.
  const schema = captureSchema(config.schema, limits, admission);
  if (has(config, 'analyzer')) {
    const analyzer = ownObject(config.analyzer, 'INVALID_OPTIONS', 'config.analyzer', admission);
    keysOnly(analyzer, ['id', 'environmentProfile'], 'INVALID_OPTIONS', 'config.analyzer');
    if (typeof analyzer.id !== 'string' || typeof analyzer.environmentProfile !== 'string') invalid('INVALID_OPTIONS', 'config.analyzer');
    if (analyzer.id !== BASIC_ANALYZER.id) invalid('MISSING_CAPABILITY', 'config.analyzer');
    if (analyzer.environmentProfile !== BASIC_ANALYZER.environmentProfile) invalid('INCOMPATIBLE_CAPABILITY', 'config.analyzer');
  }
  if (has(config, 'addons')) {
    // Registration/transaction machinery arrives in N2; fail explicitly today.
    const addons = ownArray(config.addons, limits.maxAdmissionEntries, 'INVALID_OPTIONS', 'config.addons', admission);
    if (addons.length) invalid('MISSING_CAPABILITY', 'config.addons');
  }
  bound(admission.count, limits.maxAdmissionEntries, 'config');
  return Object.freeze({ schema, limits, analyzer: BASIC_ANALYZER });
}
