import { has } from '../../core/contracts/data.js';
import type { RecordInput, Scalar } from '../../core/contracts/types.js';
import { invalid } from '../../core/errors/error.js';
import { directoryGet } from '../../core/index/directory.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { IndexRoot } from '../../core/index/state.js';
import { requireSourceRoot } from '../phrases/store.js';
import type { SourceRoot } from '../phrases/store.js';
import type { CapturedPatch } from './capture.js';

/** Read only the selected immutable record; never rebuild or retain a corpus. */
export function* composePatch(root: IndexRoot, patch: CapturedPatch, check: (phase?: string) => void): Generator<WorkStep, RecordInput> {
  check('patch.revision');
  if (root.revision !== patch.expectedRevision) invalid('REVISION_MISMATCH', 'patch.expectedRevision');
  const { configuration } = root, fields = Object.keys(configuration.schema.text), providers: SourceRoot[] = [];
  // Complete coverage is required before record lookup, even for metadata-only
  // actions or an absent ID. No untouched field can be silently discarded.
  for (const field of fields) {
    yield { workUnits: field.length + 1 };
    const registration = configuration.capabilities?.providers[`source:${field}`];
    if (!registration?.participant || registration.manifest.codec?.id !== 'raveldex-source-v1' || registration.manifest.codec.version !== 1) invalid('MISSING_CAPABILITY', 'patch.source');
    const provider = requireSourceRoot(root.participants[registration.manifest.id], field, root.revision, configuration.analyzer);
    check('patch.source'); providers.push(provider);
  }
  yield { workUnits: patch.id.length + 1 };
  const previous = directoryGet(root.documents, patch.id);
  if (!previous) invalid('ID_NOT_FOUND', 'patch.id');
  const text: Record<string, readonly string[]> = Object.create(null) as typeof text;
  const metadata: Record<string, Scalar | readonly Scalar[]> = Object.create(null) as typeof metadata;
  let originalCodeUnits = 0;
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!;
    yield { workUnits: patch.id.length + field.length + 1 };
    const retained = directoryGet(providers[index]!.records, patch.id);
    if (!retained) invalid('MISSING_CAPABILITY', 'patch.source.record');
    if (!has(retained.text, field)) continue;
    const values = retained.text[field]!;
    if (!Array.isArray(values) || !Object.isFrozen(values) || values.length > configuration.limits.maxTextValuesPerField) invalid('INCOMPATIBLE_CAPABILITY', 'patch.source.record');
    yield { workUnits: 1 };
    for (const value of values) {
      if (typeof value !== 'string' || value.length > configuration.limits.maxTextCodeUnitsPerValue) invalid('INCOMPATIBLE_CAPABILITY', 'patch.source.record');
      yield { workUnits: value.length + 1 }; originalCodeUnits += value.length;
    }
    text[field] = values;
  }
  if (originalCodeUnits !== previous.textCodeUnits) invalid('INCOMPATIBLE_CAPABILITY', 'patch.source.record');
  for (const [field, value] of Object.entries(previous.metadata)) {
    yield { workUnits: field.length + 1 };
    for (const item of Array.isArray(value) ? value : [value]) yield { workUnits: typeof item === 'string' ? item.length + 1 : 1 };
    metadata[field] = value;
  }
  for (const field of patch.unsetText) { yield { workUnits: field.length + 1 }; delete text[field]; }
  for (const field of patch.unsetMetadata) { yield { workUnits: field.length + 1 }; delete metadata[field]; }
  for (const [field, values] of Object.entries(patch.set.text)) {
    yield { workUnits: field.length + 1 };
    for (const value of values) yield { workUnits: value.length + 1 };
    text[field] = values;
  }
  for (const [field, value] of Object.entries(patch.set.metadata)) {
    yield { workUnits: field.length + 1 };
    for (const item of Array.isArray(value) ? value : [value]) yield { workUnits: typeof item === 'string' ? item.length + 1 : 1 };
    metadata[field] = value;
  }
  return Object.freeze({ id: patch.id, text: Object.freeze(text), metadata: Object.freeze(metadata) });
}
