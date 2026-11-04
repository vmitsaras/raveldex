import type { AddonRegistration } from '../../core/capabilities/types.js';
import { buildMatchEvidence } from './builder.js';
import type { MatchEvidenceOptions } from './types.js';

export type { MatchEvidenceOptions, MatchEvidenceRequest, MatchRange, MatchDocument, MatchEvidenceData } from './types.js';

/** Explicit original-token evidence. Retains no source or positional state. */
export function createMatchEvidence(options: MatchEvidenceOptions): AddonRegistration {
  return buildMatchEvidence(options);
}
