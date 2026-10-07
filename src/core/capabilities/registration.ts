import { has, keysOnly, ownArray, ownObject, scanUnicode, stringValue } from '../contracts/data.js';
import { invalid } from '../errors/error.js';
import type { CapabilityManifest, CapabilityReference, CapabilitySet, CapturedRegistration, RegistrationContext } from './types.js';
import { DEFAULT_LIMITS } from '../limits/limits.js';

/** Capture trusted implementation handles separately from bounded plain manifests. */
export function captureRegistrations(input: unknown, context: RegistrationContext): CapabilitySet {
  const { schema, limits, admission } = context, code = 'INCOMPATIBLE_CAPABILITY' as const;
  const entries = ownArray(input, 32, code, 'addons', admission);
  const registrations = new Map<string, CapturedRegistration>();
  const providers: Record<string, CapturedRegistration> = Object.create(null) as typeof providers;
  const object = (value: unknown, path: string, keys: readonly string[]) => {
    const data = ownObject(value, code, path, admission); keysOnly(data, keys, code, path); return data;
  };
  const string = (value: unknown, path: string, maximum = 128): string => {
    const result = stringValue(value, maximum, code, path);
    if (!result.length) invalid(code, path);
    for (const step of scanUnicode(result, code, path)) { void step; }
    return result;
  };
  const id = (value: unknown, path: string): string => {
    const result = string(value, path); if (!/^[A-Za-z][A-Za-z0-9:._-]*$/.test(result)) invalid(code, path); return result;
  };
  const integer = (value: unknown, path: string, minimum = 0): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid(code, path); return value;
  };
  const flag = (value: unknown, path: string): boolean => { if (typeof value !== 'boolean') invalid(code, path); return value; };
  const references = (value: unknown, path: string): readonly CapabilityReference[] => {
    const seen = new Set<string>();
    return Object.freeze(ownArray(value, 64, code, path, admission).map(value => {
      const ref = object(value, path, ['id', 'contractVersion']), name = id(ref.id, path);
      if (ref.contractVersion !== 1 || seen.has(name)) invalid(code, path);
      seen.add(name); return Object.freeze({ id: name, contractVersion: 1 });
    }));
  };
  for (const entry of entries) {
    const data = object(entry, 'addons.registration', ['manifest', 'participant', 'refinement', 'predicate', 'aggregation', 'evidence']);
    const raw = object(data.manifest, 'addons.manifest', ['id', 'version', 'contractVersion', 'roles', 'provides', 'requires', 'dataRequirements', 'indexEffect', 'rebuildPolicy', 'execution', 'limits', 'costs', 'codec']);
    const name = id(raw.id, 'addons.id'), version = string(raw.version, 'addons.version');
    const semanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
    if (!semanticVersion.test(version) || raw.contractVersion !== 1 || registrations.has(name)) invalid(code, 'addons.identity');
    const roles = ownArray(raw.roles, 4, code, 'addons.roles', admission);
    if (!roles.length || new Set(roles).size !== roles.length || roles.some(role => role !== 'leaf-refinement' && role !== 'transaction-participant' && role !== 'aggregation' && role !== 'evidence')) invalid(code, 'addons.roles');
    const requirements = object(raw.dataRequirements, 'addons.dataRequirements', ['fields', 'source', 'positions', 'offsets', 'metadata']);
    const metadata = flag(requirements.metadata, 'addons.metadata');
    const fields = ownArray(requirements.fields, metadata ? limits.maxMetadataFields : limits.maxTextFields, code, 'addons.fields', admission).map(field => {
      const name = id(field, 'addons.fields'); if (!has(metadata ? schema.metadata : schema.text, name)) invalid(code, 'addons.fields'); return name;
    });
    if (new Set(fields).size !== fields.length) invalid(code, 'addons.fields');
    const execution = object(raw.execution, 'addons.execution', ['direct', 'worker', 'workerRegistration']);
    // Only the qualified direct protocol is implemented in this slice.
    if (execution.direct !== true || execution.worker !== false || has(execution, 'workerRegistration')) invalid(code, 'addons.execution');
    const caps = object(raw.limits, 'addons.limits', ['maxPayloadCodeUnits', 'maxWorkUnits', 'maxRetainedEntries', 'maxOutputEntries']);
    const ownedLimits = Object.freeze({ maxPayloadCodeUnits: integer(caps.maxPayloadCodeUnits, 'addons.limits', 1), maxWorkUnits: integer(caps.maxWorkUnits, 'addons.limits', 1), maxRetainedEntries: integer(caps.maxRetainedEntries, 'addons.limits'), maxOutputEntries: integer(caps.maxOutputEntries, 'addons.limits') });
    if (ownedLimits.maxPayloadCodeUnits > DEFAULT_LIMITS.maxQueryCodeUnits || ownedLimits.maxWorkUnits > Math.max(DEFAULT_LIMITS.maxSearchWorkUnits, DEFAULT_LIMITS.maxMutationWorkUnits)) invalid(code, 'addons.limits');
    const costs = object(raw.costs, 'addons.costs', ['importedCode', 'retainedRepresentation', 'transientWork', 'externalResources']);
    if (costs.externalResources !== 'none' || raw.rebuildPolicy !== 'new-index') invalid(code, 'addons.costs');
    const participantRole = roles.includes('transaction-participant'), refinementRole = roles.includes('leaf-refinement'), aggregationRole = roles.includes('aggregation'), evidenceRole = roles.includes('evidence');
    if (participantRole !== has(data, 'participant') || refinementRole !== (has(data, 'refinement') || has(data, 'predicate')) || has(data, 'refinement') && has(data, 'predicate') || aggregationRole !== has(data, 'aggregation') || evidenceRole !== has(data, 'evidence') || raw.indexEffect !== (participantRole ? 'transactional' : 'none')) invalid(code, 'addons.roles');
    if ((has(data, 'predicate') || aggregationRole) && (!metadata || participantRole || requirements.source !== false || requirements.positions !== false || requirements.offsets !== false)) invalid(code, 'addons.dataRequirements');
    if (evidenceRole && (participantRole || metadata || requirements.offsets === true && requirements.positions !== true)) invalid(code, 'addons.dataRequirements');
    // All handles use the same descriptor capture/type/binding rules.
    const implementations: Record<string, unknown> = {};
    for (const key of ['participant', 'refinement', 'predicate', 'aggregation', 'evidence'] as const) {
      if (!has(data, key)) continue;
      const methods = key === 'participant' ? ['initialize', 'prepare'] : key === 'refinement' ? ['prepare'] : key === 'evidence' ? ['capture', 'select', 'prepare'] : ['capture', 'prepare'];
      const attributes = key === 'refinement' ? ['kind', 'maxTokens'] : key === 'aggregation' ? ['fieldType'] : [];
      const handles = object(data[key], `addons.${key}`, [...methods, ...attributes]);
      for (const method of methods) {
        const callback = handles[method];
        if (typeof callback !== 'function') invalid(code, `addons.${key}`);
        handles[method] = callback.bind(data[key]);
      }
      if (key === 'refinement' && (handles.kind !== 'exact-token-sequence' || integer(handles.maxTokens, 'addons.maxTokens', 1) > DEFAULT_LIMITS.maxQueryTokens)) invalid(code, 'addons.refinement');
      if (key === 'aggregation' && (handles.fieldType !== 'string' || fields.some(field => schema.metadata[field]?.type !== handles.fieldType))) invalid(code, 'addons.aggregation');
      implementations[key] = Object.freeze(handles);
    }
    let codec: CapabilityManifest['codec'];
    if (has(raw, 'codec')) { const value = object(raw.codec, 'addons.codec', ['id', 'version']); codec = Object.freeze({ id: id(value.id, 'addons.codec'), version: integer(value.version, 'addons.codec', 1) }); }
    const manifest: CapabilityManifest = Object.freeze({ id: name, version, contractVersion: 1,
      roles: Object.freeze(roles as CapabilityManifest['roles'][number][]), provides: references(raw.provides, 'addons.provides'), requires: references(raw.requires, 'addons.requires'),
      dataRequirements: Object.freeze({ fields: Object.freeze(fields.sort()), source: flag(requirements.source, 'addons.source'), positions: flag(requirements.positions, 'addons.positions'), offsets: flag(requirements.offsets, 'addons.offsets'), metadata }),
      indexEffect: participantRole ? 'transactional' : 'none', rebuildPolicy: 'new-index', execution: Object.freeze({ direct: true, worker: false }), limits: ownedLimits,
      costs: Object.freeze({ importedCode: string(costs.importedCode, 'addons.costs', 1024), retainedRepresentation: string(costs.retainedRepresentation, 'addons.costs', 1024), transientWork: string(costs.transientWork, 'addons.costs', 1024), externalResources: 'none' }), ...(codec ? { codec } : {}) });
    const captured: CapturedRegistration = Object.freeze({ manifest, ...implementations });
    registrations.set(name, captured);
    if (!manifest.provides.length) invalid(code, 'addons.provides');
    for (const provided of manifest.provides) { if (has(providers, provided.id)) invalid(code, 'addons.providers'); providers[provided.id] = captured; }
  }
  const ordered: CapturedRegistration[] = [], visited = new Set<string>(), active = new Set<string>();
  function visit(registration: CapturedRegistration): void {
    const { manifest } = registration;
    if (visited.has(manifest.id)) return;
    if (active.has(manifest.id)) invalid(code, 'addons.cycle');
    active.add(manifest.id);
    for (const requirement of [...manifest.requires].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
      const provider = providers[requirement.id]; if (!provider) invalid('MISSING_CAPABILITY', 'addons.requires');
      visit(provider);
    }
    // Declared source/position consumers require an explicit provider per field.
    const data = manifest.dataRequirements;
    if ((data.source || data.positions) && registration.refinement) for (const field of data.fields) {
      const present = (kind: string): boolean => manifest.requires.some(ref => ref.id === `${kind}:${field}`) && !!providers[`${kind}:${field}`]?.participant;
      if (!(data.source && present('source') || data.positions && present('positions'))) invalid('MISSING_CAPABILITY', 'addons.data');
    }
    if (registration.evidence && (data.source || data.positions || data.offsets)) for (const field of data.fields) {
      const present = (kind: string): boolean => manifest.requires.some(ref => ref.id === `${kind}:${field}`) && !!providers[`${kind}:${field}`]?.participant;
      if (!(data.source && present('source') || data.offsets && present('offsets') || data.positions && !data.offsets && present('positions'))) invalid('MISSING_CAPABILITY', 'addons.data');
    }
    active.delete(manifest.id); visited.add(manifest.id); ordered.push(registration);
  }
  for (const name of [...registrations.keys()].sort()) visit(registrations.get(name)!);
  return Object.freeze({ ordered: Object.freeze(ordered), providers: Object.freeze(providers) });
}
