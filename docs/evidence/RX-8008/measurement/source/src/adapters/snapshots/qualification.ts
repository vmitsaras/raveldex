import { Admission, has, keysOnly, ownArray, ownObject, scanUnicode } from '../../core/contracts/data.js';
import { invalid } from '../../core/errors/error.js';
import type { NativeSnapshotQualification, NodeSnapshotEnvironment } from './types.js';
import { fail } from './error.js';

/** Optional lazy host inspection. No Node import, DOM access or host access at
 * module evaluation. Unsupported browser-native qualification is explicit. */
export function currentNodeSnapshotEnvironment(): NodeSnapshotEnvironment {
  const process = (globalThis as unknown as { process?: { versions?: Record<string, unknown>; platform?: unknown; arch?: unknown } }).process;
  const versions = process?.versions;
  if (!versions || ['node', 'v8', 'icu', 'unicode'].some(key => typeof versions[key] !== 'string') ||
      typeof process?.platform !== 'string' || typeof process?.arch !== 'string') fail('UNQUALIFIED_PROFILE', 'snapshot.environment');
  return Object.freeze({ runtime: 'node', version: versions.node as string, v8: versions.v8 as string,
    icu: versions.icu as string, unicode: versions.unicode as string, platform: process.platform, arch: process.arch });
}

/** Foreign source origins validate this same data contract without pretending
 * their runtime matches the receiver; native construction compares live host. */
export function captureQualification(input: unknown, matchCurrent = true): NativeSnapshotQualification {
  const admission = new Admission(256), code = 'INVALID_OPTIONS' as const;
  const data = ownObject(input, code, 'snapshot.qualification', admission);
  keysOnly(data, ['profileId', 'scope', 'environment', 'evidence'], code, 'snapshot.qualification');
  if (typeof data.profileId !== 'string' || !/^[A-Za-z][A-Za-z0-9:._-]{0,127}$/.test(data.profileId) || data.profileId === 'unqualified' || data.scope !== 'exact-node-runtime') invalid(code, 'snapshot.qualification');
  const environment = ownObject(data.environment, code, 'snapshot.environment', admission);
  const keys = ['runtime', 'version', 'v8', 'icu', 'unicode', 'platform', 'arch'] as const;
  keysOnly(environment, keys, code, 'snapshot.environment');
  for (const key of keys) {
    if (!has(environment, key) || typeof environment[key] !== 'string' || !(environment[key] as string).length || (environment[key] as string).length > 128) invalid(code, 'snapshot.environment');
    for (const step of scanUnicode(environment[key] as string, code, 'snapshot.environment')) { void step; }
  }
  if (environment.runtime !== 'node') invalid(code, 'snapshot.environment');
  const ownedEnvironment = Object.freeze(environment) as unknown as NodeSnapshotEnvironment;
  if (matchCurrent) {
    const current = currentNodeSnapshotEnvironment();
    for (const key of keys) if (ownedEnvironment[key] !== current[key]) fail('PROFILE_MISMATCH', 'snapshot.environment');
  }
  const evidence = ownArray(data.evidence, 32, code, 'snapshot.evidence', admission).map(value => {
    if (typeof value !== 'string' || !value.trim().length || value.length > 256) invalid(code, 'snapshot.evidence');
    for (const step of scanUnicode(value, code, 'snapshot.evidence')) { void step; }
    return value;
  });
  if (!evidence.length || new Set(evidence).size !== evidence.length) invalid(code, 'snapshot.evidence');
  return Object.freeze({ profileId: data.profileId, scope: 'exact-node-runtime', environment: ownedEnvironment, evidence: Object.freeze(evidence) });
}
