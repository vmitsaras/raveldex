import type { AddonRegistration, ParticipantContext } from './types.js';
import type { WorkStep } from '../index/directory.js';

/** Private opt-in for actual immutable first-party registrations. Codec names,
 * matching methods and spread/wrapped registrations convey no provenance. */
export interface BulkParticipant {
  add(context: ParticipantContext): Generator<WorkStep, void>;
  finish(revision: number): Generator<WorkStep, unknown>;
}
type Factory = (initial: unknown) => BulkParticipant;
const factories = new WeakMap<object, Factory>();
export function registerBulkParticipant(registration: AddonRegistration, factory: Factory): AddonRegistration {
  factories.set(registration, factory); return registration;
}
/** Called only after ordinary descriptor/role/handle capture succeeds. */
export function captureBulkParticipant(original: object, captured: AddonRegistration): void {
  const factory = factories.get(original);
  if (factory) factories.set(captured, factory);
}
export function bulkParticipant(registration: AddonRegistration, initial: unknown): BulkParticipant | undefined {
  return factories.get(registration)?.(initial);
}
