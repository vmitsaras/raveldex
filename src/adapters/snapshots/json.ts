import { scanUnicode } from '../../core/contracts/data.js';
import type { WorkStep } from '../../core/index/directory.js';
import { fail } from './error.js';

export const MAX_ENCODED_BYTES = 64 * 1024 * 1024;
const MAX_DEPTH = 64, MAX_NODES = 8_000_000, MAX_STRING = 262_144;
const HEX = /^[0-9a-f]{8}$/;

/** Count actual JSON UTF-8 bytes without retaining an extra byte buffer. */
export function* utf8Bytes(text: string, maximum: number): Generator<WorkStep, number> {
  let bytes = 0, units = 0;
  for (let i = 0; i < text.length; i++) {
    const point = text.charCodeAt(i);
    if (point < 0x80) bytes++; else if (point < 0x800) bytes += 2;
    else if (point >= 0xd800 && point <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('MALFORMED_SNAPSHOT');
      bytes += 4;
    } else { if (point >= 0xdc00 && point <= 0xdfff) fail('MALFORMED_SNAPSHOT'); bytes += 3; }
    if (bytes > maximum) fail('ENCODED_LIMIT_EXCEEDED');
    if (++units === 256) { yield { workUnits: units }; units = 0; }
  }
  if (units) yield { workUnits: units };
  return bytes;
}

/** Noncryptographic accidental-damage checksum; structural validation remains
 * mandatory even after this value matches. No security/authenticity promise. */
export function* checksum(text: string): Generator<WorkStep, string> {
  let hash = 2166136261, units = 0;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    if (++units === 256) { yield { workUnits: units }; units = 0; }
  }
  if (units) yield { workUnits: units };
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Bounded JSON encoding is optional. It accepts only trusted owned plain data;
 * no toJSON/getter callbacks, cycles or nonfinite values can cross the codec. */
export function* encodeJson(value: unknown, maximum: number): Generator<WorkStep, string> {
  const chunks: string[] = [], active = new Set<object>(); let bytes = 0, nodes = 0;
  function* append(text: string): Generator<WorkStep, void> {
    bytes += yield* utf8Bytes(text, maximum - bytes);
    chunks.push(text);
  }
  function* visit(value: unknown, depth: number): Generator<WorkStep, void> {
    yield { workUnits: 1 };
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('ENCODED_LIMIT_EXCEEDED');
    if (value === null || typeof value === 'boolean') { yield* append(String(value)); return; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('INVALID_NATIVE_STATE'); yield* append(JSON.stringify(value)); return; }
    if (typeof value === 'string') {
      if (value.length > MAX_STRING) fail('ENCODED_LIMIT_EXCEEDED');
      for (const step of scanUnicode(value, 'INCOMPATIBLE_CAPABILITY', 'snapshot.string')) yield step;
      yield* append(JSON.stringify(value)); return;
    }
    if (typeof value !== 'object' || active.has(value)) fail('INVALID_NATIVE_STATE');
    active.add(value);
    try {
      if (Array.isArray(value)) {
        if (value.length > MAX_NODES) fail('ENCODED_LIMIT_EXCEEDED');
        if (!Object.isFrozen(value) || Reflect.ownKeys(value).length !== value.length + 1) fail('INVALID_NATIVE_STATE');
        yield* append('[');
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (!descriptor || !('value' in descriptor)) fail('INVALID_NATIVE_STATE');
          if (i) yield* append(','); yield* visit(descriptor.value, depth + 1);
        }
        yield* append(']');
      } else {
        const prototype: unknown = Object.getPrototypeOf(value);
        if (prototype !== null && prototype !== Object.prototype || !Object.isFrozen(value)) fail('INVALID_NATIVE_STATE');
        const keys = Object.keys(value);
        if (Reflect.ownKeys(value).length !== keys.length) fail('INVALID_NATIVE_STATE');
        // Meter the bounded native key sort separately from string encoding.
        for (const key of keys) yield { workUnits: key.length + Math.ceil(Math.log2(keys.length + 1)) + 1 };
        keys.sort(); yield* append('{');
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]!, descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || !('value' in descriptor)) fail('INVALID_NATIVE_STATE');
          if (i) yield* append(','); yield* visit(key, depth + 1); yield* append(':'); yield* visit(descriptor.value, depth + 1);
        }
        yield* append('}');
      }
    } finally { active.delete(value); }
  }
  yield* visit(value, 0);
  // Joining a capped set of primitive chunks is one bounded host primitive.
  yield { workUnits: 1 };
  return chunks.join('');
}

export interface DecodedJson { readonly value: unknown; readonly bodyText: string }
/** Resumable decoder owns every object/array and rejects duplicate keys. Native
 * JSON.parse would perform uninterruptible whole-envelope parsing. */
export function* decodeJson(text: string, maximum: number): Generator<WorkStep, DecodedJson> {
  yield* utf8Bytes(text, maximum);
  let position = 0, nodes = 0, bodyStart = -1, bodyEnd = -1, uncharged = 0;
  function* step(): Generator<WorkStep, void> { if (++uncharged >= 128) { yield { workUnits: uncharged }; uncharged = 0; } }
  function* whitespace(): Generator<WorkStep, void> { while (position < text.length && /[\x20\t\r\n]/.test(text[position]!)) { position++; yield* step(); } }
  function* string(): Generator<WorkStep, string> {
    if (text[position++] !== '"') fail('MALFORMED_SNAPSHOT');
    let value = '', pieces: string[] = [];
    for (;;) {
      if (position >= text.length) fail('MALFORMED_SNAPSHOT');
      const character = text[position++]!; yield* step();
      if (character === '"') break;
      if (character.charCodeAt(0) < 32) fail('MALFORMED_SNAPSHOT');
      if (character === '\\') {
        const escaped = text[position++]!; yield* step();
        const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (Object.hasOwn(simple, escaped)) value += simple[escaped]!;
        else if (escaped === 'u') {
          const digits = text.slice(position, position + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail('MALFORMED_SNAPSHOT');
          value += String.fromCharCode(parseInt(digits, 16)); position += 4; uncharged += 4;
        } else fail('MALFORMED_SNAPSHOT');
      } else value += character;
      if (value.length >= 1024) { pieces.push(value); value = ''; }
      if (pieces.length * 1024 + value.length > MAX_STRING) fail('ENCODED_LIMIT_EXCEEDED');
    }
    pieces.push(value); value = pieces.join(''); pieces = [];
    if (value.length > MAX_STRING) fail('ENCODED_LIMIT_EXCEEDED');
    for (const item of scanUnicode(value, 'INCOMPATIBLE_CAPABILITY', 'snapshot.string')) yield item;
    return value;
  }
  function* visit(depth: number): Generator<WorkStep, unknown> {
    yield { workUnits: 1 };
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('ENCODED_LIMIT_EXCEEDED');
    yield* whitespace();
    const next = text[position];
    if (next === '"') return yield* string();
    if (next === '{') {
      position++; yield* step();
      const result: Record<string, unknown> = Object.create(null) as typeof result;
      yield* whitespace();
      if (text[position] === '}') { position++; return Object.freeze(result); }
      for (;;) {
        yield* whitespace(); const key = yield* string();
        if (Object.hasOwn(result, key)) fail('MALFORMED_SNAPSHOT');
        yield* whitespace(); if (text[position++] !== ':') fail('MALFORMED_SNAPSHOT');
        yield* whitespace(); const start = position;
        result[key] = yield* visit(depth + 1);
        if (depth === 0 && key === 'body') { bodyStart = start; bodyEnd = position; }
        yield* whitespace(); const delimiter = text[position++];
        if (delimiter === '}') break;
        if (delimiter !== ',') fail('MALFORMED_SNAPSHOT');
      }
      return Object.freeze(result);
    }
    if (next === '[') {
      position++; yield* step(); const result: unknown[] = [];
      yield* whitespace(); if (text[position] === ']') { position++; return Object.freeze(result); }
      for (;;) {
        result.push(yield* visit(depth + 1));
        yield* whitespace(); const delimiter = text[position++];
        if (delimiter === ']') break;
        if (delimiter !== ',') fail('MALFORMED_SNAPSHOT');
      }
      return Object.freeze(result);
    }
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.slice(position, position + literal.length) === literal) { position += literal.length; uncharged += literal.length; return value; }
    }
    const start = position;
    while (position < text.length && /[0-9eE+.\-]/.test(text[position]!)) { position++; if (position - start > 128) fail('MALFORMED_SNAPSHOT'); yield* step(); }
    const token = text.slice(start, position);
    if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(token)) fail('MALFORMED_SNAPSHOT');
    const number = Number(token); if (!Number.isFinite(number)) fail('MALFORMED_SNAPSHOT'); return number;
  }
  const value = yield* visit(0); yield* whitespace();
  if (position !== text.length || bodyStart < 0) fail('MALFORMED_SNAPSHOT');
  if (uncharged) yield { workUnits: uncharged };
  return Object.freeze({ value, bodyText: text.slice(bodyStart, bodyEnd) });
}

export function object(value: unknown, keys: readonly string[], reason: Parameters<typeof fail>[0] = 'MALFORMED_SNAPSHOT'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(reason);
  const result = value as Record<string, unknown>;
  const prototype: unknown = Object.getPrototypeOf(result);
  if (prototype !== null && prototype !== Object.prototype || !Object.isFrozen(result) || Reflect.ownKeys(result).length !== keys.length || keys.some(key => {
    const descriptor = Object.getOwnPropertyDescriptor(result, key); return !descriptor || !('value' in descriptor) || !descriptor.enumerable;
  })) fail(reason);
  return result;
}
export function count(value: unknown, maximum: number, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail('INVALID_NATIVE_STATE'); return value;
}
export function isChecksum(value: unknown): value is string { return typeof value === 'string' && HEX.test(value); }

/** Equality of bounded header data; key insertion order carries no semantics. */
export function equalData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equalData(value, right[index]));
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>, keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equalData(a[key], b[key]));
}
