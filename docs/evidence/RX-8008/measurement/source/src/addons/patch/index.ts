import type { MutationOptions, MutationResult, Raveldex } from '../../core/contracts/types.js';
import { invalid } from '../../core/errors/error.js';
import { getExecutionOwner } from '../../core/execution/engine.js';
import { capturePatch } from './capture.js';
import { composePatch } from './compose.js';
import type { Patches, RecordPatch } from './types.js';

export type { Patches, RecordPatch, RecordPatchSet, RecordPatchUnset } from './types.js';

/** Optional borrowed direct-owner convenience; no source or participant setup. */
export function createPatch(engine: Raveldex): Patches {
  const owner = getExecutionOwner(engine);
  if (!owner) invalid('MISSING_CAPABILITY', 'patch.engine');
  return Object.freeze({ patch(request: RecordPatch, options?: MutationOptions): Promise<MutationResult> {
    return owner.adapterReplace(configuration => {
      const captured = capturePatch(request, options, configuration);
      return { options: captured.options, start: (root, check) => composePatch(root, captured, check) };
    });
  } });
}
