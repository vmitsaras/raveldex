/** Adapted from vmitsaras/LocalSearch src/storage/codec.ts at
 * 5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb.
 * Copyright (c) 2026 Vasileios Mitsaras. MIT license: ./LICENSE.LocalSearch.
 * Only bounded source decoding/canonicalization is adapted; no engine code.
 */
import { DEFAULTS, LIMITS, captureOptions, captureRecords } from './legacy.js';
import { fail, MigrationError } from './error.js';
import type { MigrationReason } from './error.js';
import type { CapturedOptions, SearchRecord, SnapshotRef, SourceUsage } from './legacy.js';

const MAX_BYTES = 33_554_432;
const MAX_NODES = 500_000;
const MAX_DEPTH = 6;
const DOMAIN = 'localsearch-source-v1\n';
const CONTRACT = 'companion-v1';
const DEPENDENCY = 'minisearch@7.2.0';
const SCORE_MODEL = 'minisearch-7.2.0-companion-v1';

type Decoder = { decode(input: Uint8Array): string };
type Encoder = { encode(input: string): Uint8Array };
type DecoderConstructor = new (label: string, options: { fatal: boolean }) => Decoder;
type EncoderConstructor = new () => Encoder;

function invalid(reason: MigrationReason = 'value'): never {
  return fail('INVALID_SNAPSHOT', reason);
}

function incompatible(): never { return fail('INCOMPATIBLE_SNAPSHOT', 'unsupported'); }

function textCodec(): Readonly<{ encoder: Encoder; decoder: Decoder }> {
  try {
    const host = globalThis as unknown as { TextEncoder?: EncoderConstructor; TextDecoder?: DecoderConstructor };
    if (typeof host.TextEncoder !== 'function' || typeof host.TextDecoder !== 'function') fail('CAPABILITY_REQUIRED', 'unsupported');
    return { encoder: new host.TextEncoder(), decoder: new host.TextDecoder('utf-8', { fatal: true }) };
  }
  catch { fail('CAPABILITY_REQUIRED', 'unsupported'); }
}

function digestSource(payload: Uint8Array, encoder: Encoder): Promise<string> {
  let subtle: { digest(name: string, data: Uint8Array): Promise<ArrayBuffer> } | undefined;
  try { subtle = (globalThis as unknown as { crypto?: { subtle?: typeof subtle } }).crypto?.subtle; }
  catch { fail('CAPABILITY_REQUIRED', 'unsupported'); }
  if (!subtle || typeof subtle.digest !== 'function') fail('CAPABILITY_REQUIRED', 'unsupported');
  const domain = encoder.encode(DOMAIN);
  const input = new Uint8Array(domain.length + payload.length);
  input.set(domain);
  input.set(payload, domain.length);
  try {
    return subtle.digest('SHA-256', input).then(
      bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''),
      () => { throw new MigrationError('CAPABILITY_REQUIRED', 'unsupported'); },
    );
  } catch { fail('CAPABILITY_REQUIRED', 'unsupported'); }
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid('shape');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) invalid('keys');
  return value as Record<string, unknown>;
}

function safeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid('value');
  return value;
}

function sourceRevisionValue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') invalid('type');
  if (value.length > 256) invalid('limit');
  return value;
}

function originValue(value: unknown): SnapshotRef {
  const data = exactObject(value, ['sessionId', 'generation']);
  if (typeof data['sessionId'] !== 'string' || !data['sessionId'].length || data['sessionId'].length > 256) invalid('value');
  return Object.freeze({ sessionId: data['sessionId'], generation: safeInteger(data['generation']) });
}

function ordinaryBytes(value: unknown): Uint8Array {
  try {
    if (Object.getPrototypeOf(value) !== Uint8Array.prototype) fail('INVALID_BYTES', 'shape');
    const bytes = value as Uint8Array;
    const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
    const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
    const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')?.get;
    if (!bufferGetter || !lengthGetter) invalid('shape');
    const buffer = bufferGetter.call(bytes) as ArrayBuffer;
    if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype) fail('INVALID_BYTES', 'shape');
    const length = lengthGetter.call(bytes) as number;
    if (length === 0 || length > MAX_BYTES) fail('INVALID_BYTES', 'limit');
    const copy = new Uint8Array(length);
    Uint8Array.prototype.set.call(copy, bytes);
    return copy;
  } catch (error: unknown) {
    if (error instanceof MigrationError) throw error;
    return fail('INVALID_BYTES', 'shape');
  }
}

/** Iterative JSON lexical guard. It never constructs the payload object graph. */
function preflight(source: string): void {
  type Frame = { kind: 'array'; state: 'firstOrEnd' | 'value' | 'commaOrEnd'; count: number }
    | { kind: 'object'; state: 'firstKeyOrEnd' | 'key' | 'colon' | 'value' | 'commaOrEnd'; count: number; keys: Set<string> };
  const frames: Frame[] = [];
  let index = 0;
  let nodes = 0;
  const space = (): void => {
    while (index < source.length) {
      const unit = source.charCodeAt(index);
      if (unit !== 0x20 && unit !== 0x09 && unit !== 0x0a && unit !== 0x0d) break;
      index++;
    }
  };
  const string = (retain: boolean): string => {
    if (source[index++] !== '"') invalid('shape');
    let units = 0;
    let decoded = '';
    while (index < source.length) {
      const unit = source.charCodeAt(index++);
      if (unit === 0x22) return decoded;
      let value: string;
      if (unit === 0x5c) {
        if (index >= source.length) invalid('shape');
        const escaped = source[index++]!;
        if (escaped === 'u') {
          if (index + 4 > source.length) invalid('shape');
          const hex = source.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) invalid('shape');
          value = String.fromCharCode(Number.parseInt(hex, 16));
          index += 4;
        } else {
          const replacements: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
          if (!Object.hasOwn(replacements, escaped)) invalid('shape');
          value = replacements[escaped]!;
        }
      } else {
        if (unit < 0x20) invalid('shape');
        value = String.fromCharCode(unit);
      }
      units += value.length;
      if (units > 50_000) invalid('limit');
      if (retain) decoded += value;
    }
    return invalid('shape');
  };
  const number = (): void => {
    const start = index;
    if (source[index] === '-') index++;
    if (source[index] === '0') index++;
    else {
      if (!/[1-9]/.test(source[index] ?? '')) invalid('shape');
      while (/[0-9]/.test(source[index] ?? '')) { index++; if (index - start > 32) invalid('limit'); }
    }
    if (source[index] === '.') {
      index++;
      if (!/[0-9]/.test(source[index] ?? '')) invalid('shape');
      while (/[0-9]/.test(source[index] ?? '')) { index++; if (index - start > 32) invalid('limit'); }
    }
    if (source[index] === 'e' || source[index] === 'E') {
      index++;
      if (source[index] === '+' || source[index] === '-') index++;
      if (!/[0-9]/.test(source[index] ?? '')) invalid('shape');
      while (/[0-9]/.test(source[index] ?? '')) { index++; if (index - start > 32) invalid('limit'); }
    }
    if (index - start > 32) invalid('limit');
    if (!Number.isFinite(Number(source.slice(start, index)))) invalid('value');
  };
  const value = (): void => {
    nodes++;
    if (nodes > MAX_NODES) invalid('limit');
    const token = source[index];
    if (token === '{' || token === '[') {
      if (frames.length + 1 > MAX_DEPTH) invalid('limit');
      index++;
      if (token === '{') frames.push({ kind: 'object', state: 'firstKeyOrEnd', count: 0, keys: new Set<string>() });
      else frames.push({ kind: 'array', state: 'firstOrEnd', count: 0 });
    } else if (token === '"') string(false);
    else if (token === 't' && source.slice(index, index + 4) === 'true') index += 4;
    else if (token === 'f' && source.slice(index, index + 5) === 'false') index += 5;
    else if (token === 'n' && source.slice(index, index + 4) === 'null') index += 4;
    else if (token === '-' || /[0-9]/.test(token ?? '')) number();
    else invalid('shape');
  };
  space();
  value();
  while (frames.length) {
    space();
    const frame = frames[frames.length - 1]!;
    const token = source[index];
    if (frame.kind === 'object') {
      if (frame.state === 'firstKeyOrEnd' || frame.state === 'key') {
        if (token === '}' && frame.state === 'firstKeyOrEnd') { index++; frames.pop(); continue; }
        if (token !== '"') invalid('shape');
        const key = string(true);
        if (key.length > 64) invalid('limit');
        if (frame.keys.has(key)) invalid('duplicate');
        frame.keys.add(key);
        frame.count++;
        if (frame.count > 33) invalid('limit');
        frame.state = 'colon';
      } else if (frame.state === 'colon') {
        if (token !== ':') invalid('shape');
        index++; frame.state = 'value';
      } else if (frame.state === 'value') {
        frame.state = 'commaOrEnd'; value();
      } else if (token === ',') { index++; frame.state = 'key'; }
      else if (token === '}') { index++; frames.pop(); }
      else invalid('shape');
    } else if (frame.state === 'firstOrEnd' || frame.state === 'value') {
      if (token === ']' && frame.state === 'firstOrEnd') { index++; frames.pop(); continue; }
      frame.count++;
      if (frame.count > 10_000) invalid('limit');
      frame.state = 'commaOrEnd'; value();
    } else if (token === ',') { index++; frame.state = 'value'; }
    else if (token === ']') { index++; frames.pop(); }
    else invalid('shape');
  }
  space();
  if (index !== source.length) invalid('shape');
}

function stringToken(value: string): string { return JSON.stringify(value); }
function numberToken(value: number): string { return Object.is(value, -0) ? '-0' : JSON.stringify(value); }

class Writer {
  readonly #encoder: Encoder;
  readonly #chunks: string[] = [];
  #bytes = 0;
  constructor(encoder: Encoder) { this.#encoder = encoder; }
  add(fragment: string): void {
    this.#bytes += this.#encoder.encode(fragment).length;
    if (this.#bytes > MAX_BYTES) invalid('limit');
    this.#chunks.push(fragment);
  }
  string(value: string): void { this.add(stringToken(value)); }
  number(value: number): void { this.add(numberToken(value)); }
  finish(): string { return this.#chunks.join(''); }
}

function payloadText(options: CapturedOptions, records: readonly SearchRecord[], origin: SnapshotRef,
  sourceRevision: string | null, usage: SourceUsage, encoder: Encoder): string {
  const writer = new Writer(encoder);
  writer.add('{"contract":"'); writer.add(CONTRACT);
  writer.add('","dependency":"'); writer.add(DEPENDENCY);
  writer.add('","analyzerId":"'); writer.add(DEFAULTS.analyzerId);
  writer.add('","scoreModel":"'); writer.add(SCORE_MODEL);
  writer.add('","config":{"schema":[');
  let first = true;
  for (const [name, definition] of Object.entries(options.schema)) {
    if (!first) writer.add(','); first = false;
    writer.add('{"name":'); writer.string(name);
    writer.add(',"type":'); writer.string(definition.type);
    if (definition.type === 'text' || definition.type === 'text[]') { writer.add(',"boost":'); writer.number(definition.boost); }
    writer.add('}');
  }
  writer.add('],"returnFields":[');
  options.returnFields.forEach((field, index) => { if (index) writer.add(','); writer.string(field); });
  writer.add(']},"records":[');
  for (let index = 0; index < records.length; index++) {
    if (index) writer.add(',');
    const record = records[index]!;
    writer.add('{"id":'); writer.string(record.id);
    for (const name of Object.keys(options.schema)) {
      if (!Object.hasOwn(record, name)) continue;
      const value = record[name]!;
      writer.add(','); writer.string(name); writer.add(':');
      if (Array.isArray(value)) {
        writer.add('[');
        value.forEach((item, itemIndex) => { if (itemIndex) writer.add(','); writer.string(item); });
        writer.add(']');
      } else if (typeof value === 'string') writer.string(value);
      else if (typeof value === 'number') writer.number(value);
      else writer.add(value ? 'true' : 'false');
    }
    writer.add('}');
  }
  writer.add('],"counts":{"recordCount":'); writer.number(usage.recordCount);
  writer.add(',"sourceStringUnits":'); writer.number(usage.sourceStringUnits);
  writer.add(',"arraySlots":'); writer.number(usage.arraySlots);
  writer.add(',"indexedTokens":'); writer.number(usage.indexedTokens);
  writer.add('},"origin":{"sessionId":'); writer.string(origin.sessionId);
  writer.add(',"generation":'); writer.number(origin.generation);
  writer.add('},"sourceRevision":');
  if (sourceRevision === null) writer.add('null'); else writer.string(sourceRevision);
  writer.add('}');
  return writer.finish();
}

/** Validate before parse, then reconstruct the canonical bytes and a fresh owned source. */
export async function decodeLegacySource(bytes: Uint8Array): Promise<{
  options: CapturedOptions; records: readonly SearchRecord[]; origin: SnapshotRef; sourceRevision: string | null;
}> {
  const owned = ordinaryBytes(bytes);
  if (owned[0] === 0xef && owned[1] === 0xbb && owned[2] === 0xbf) invalid('shape');
  const { encoder, decoder } = textCodec();
  let source: string;
  try { source = decoder.decode(owned); } catch { invalid('shape'); }
  preflight(source);
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { invalid('shape'); }
  const envelope = exactObject(parsed, ['format', 'payload', 'checksum']);
  if (envelope['format'] !== 1) incompatible();
  const payload = exactObject(envelope['payload'], ['contract', 'dependency', 'analyzerId', 'scoreModel', 'config', 'records', 'counts', 'origin', 'sourceRevision']);
  if (payload['contract'] !== CONTRACT || payload['dependency'] !== DEPENDENCY || payload['analyzerId'] !== DEFAULTS.analyzerId || payload['scoreModel'] !== SCORE_MODEL) incompatible();
  const config = exactObject(payload['config'], ['schema', 'returnFields']);
  if (!Array.isArray(config['schema']) || config['schema'].length > LIMITS.schemaFields) invalid('shape');
  const schema: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const raw of config['schema']) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) invalid('shape');
    const candidate = raw as Record<string, unknown>;
    const isText = candidate['type'] === 'text' || candidate['type'] === 'text[]';
    const definition = exactObject(raw, isText ? ['name', 'type', 'boost'] : ['name', 'type']);
    const name = definition['name'];
    if (typeof name !== 'string') invalid('type');
    if (Object.hasOwn(schema, name)) invalid('duplicate');
    schema[name] = isText ? { type: definition['type'], boost: definition['boost'] } : { type: definition['type'] };
  }
  let options: CapturedOptions;
  try { options = captureOptions({ schema, analyzerId: DEFAULTS.analyzerId, returnFields: config['returnFields'] }); }
  catch { invalid('value'); }
  if (!Array.isArray(payload['records'])) invalid('shape');
  let captured: ReturnType<typeof captureRecords>;
  try { captured = captureRecords(payload['records'], options); }
  catch { invalid('value'); }
  const counts = exactObject(payload['counts'], ['recordCount', 'sourceStringUnits', 'arraySlots', 'indexedTokens']);
  for (const key of ['recordCount', 'sourceStringUnits', 'arraySlots', 'indexedTokens'] as const) {
    if (safeInteger(counts[key]) !== captured.usage[key]) invalid('value');
  }
  const origin = originValue(payload['origin']);
  const sourceRevision = sourceRevisionValue(payload['sourceRevision']);
  const checksum = exactObject(envelope['checksum'], ['algorithm', 'value']);
  if (checksum['algorithm'] !== 'SHA-256' || typeof checksum['value'] !== 'string' || !/^[0-9a-f]{64}$/.test(checksum['value'])) invalid('value');
  const ordered = [...captured.records].sort((a, b) => a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
  const canonicalPayload = payloadText(options, ordered, origin, sourceRevision, captured.usage, encoder);
  const canonical = encoder.encode(`{"format":1,"payload":${canonicalPayload},"checksum":{"algorithm":"SHA-256","value":"${checksum['value']}"}}`);
  if (canonical.length !== owned.length || canonical.some((byte, index) => byte !== owned[index])) fail('NONCANONICAL_SNAPSHOT', 'canonical');
  const digest = await digestSource(encoder.encode(canonicalPayload), encoder);
  if (digest !== checksum['value']) fail('CHECKSUM_MISMATCH', 'checksum');
  return { options, records: Object.freeze(ordered), origin, sourceRevision };
}
