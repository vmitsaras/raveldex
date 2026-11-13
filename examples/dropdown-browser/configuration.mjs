// Header, full results and optional modal deliberately select the same query mode.
export const configuration = Object.freeze({
  mode: 'prefix',
  maxResults: 3,
  pageSize: 3,
  modalHandoff: false,
});

export function validQuery(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\r\n]/.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

// Read q once. Do not trim/normalize it, rewrite history, or own other parameters.
export function readInitialQuery(search) {
  if (typeof search !== 'string') return { query: undefined, refused: true };
  let query, count = 0;
  for (const field of search.replace(/^\?/, '').split('&')) {
    const split = field.indexOf('='), key = split < 0 ? field : field.slice(0, split);
    let name;
    try { name = decodeURIComponent(key.replaceAll('+', ' ')); } catch { continue; }
    if (name !== 'q') continue;
    if (++count > 1) return { query: undefined, refused: true };
    const encoded = split < 0 ? '' : field.slice(split + 1);
    if (encoded.length > 24576) return { query: undefined, refused: true };
    try { query = decodeURIComponent(encoded.replaceAll('+', ' ')); }
    catch { return { query: undefined, refused: true }; }
    if (!validQuery(query)) return { query: undefined, refused: true };
  }
  return { query, refused: false };
}
