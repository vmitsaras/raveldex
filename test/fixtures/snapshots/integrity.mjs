/** Independent format fixture helper. Deliberately shares no production codec
 * parser, UTF-8 counter, checksum helper or index validation implementation. */
export function checksum(bodyText) {
  let hash = 2166136261;
  for (let index = 0; index < bodyText.length; index++) {
    hash ^= bodyText.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
export function alter(encoded, mutation, validIntegrity = true) {
  const envelope = JSON.parse(encoded);
  mutation(envelope);
  if (validIntegrity) envelope.integrity = { algorithm: 'fnv1a32-utf16', value: checksum(JSON.stringify(envelope.body)) };
  return JSON.stringify(envelope);
}
/** Locate the exact encoded body in first-party envelopes. Parsing/restringifying
 * would reorder integer-like directory keys and invalidate this observation. */
export function bodyText(encoded) {
  const marker = '"body":', start = encoded.indexOf(marker) + marker.length;
  if (start < marker.length || encoded[start] !== '{') throw Error('fixture envelope has no encoded body');
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < encoded.length; index++) {
    const point = encoded[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (point === '\\') escaped = true;
      else if (point === '"') quoted = false;
    } else if (point === '"') quoted = true;
    else if (point === '{' || point === '[') depth++;
    else if (point === '}' || point === ']') { if (--depth === 0) return encoded.slice(start, index + 1); }
  }
  throw Error('fixture envelope body is truncated');
}
export function directoryEntries(directory) { return Object.values(directory.buckets).flatMap(bucket => Object.entries(bucket)); }
export function firstEntry(directory) { return directoryEntries(directory)[0]; }
export function byId(directory, id) { return directoryEntries(directory).find(([key]) => key === id)?.[1]; }
