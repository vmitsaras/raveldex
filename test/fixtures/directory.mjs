export const schema = { text: { title: {}, body: {} }, metadata: {
  kind: { type: 'string', nullable: true }, tags: { type: 'string', multi: true, nullable: true },
} };
export const groups = [
  { field: 'kind', values: ['guide', 'manual', 'map', 'absent'] },
  { field: 'tags', values: ['red', 'blue', 'green', '', 'ghost', 'é', 'e\u0301'] },
];
export const records = [
  { id: 'a', text: { title: 'Alpha guide', body: 'shared trail' }, metadata: { kind: 'guide', tags: ['red', 'blue'] } },
  { id: 'b', text: { title: 'Beta manual', body: 'shared route' }, metadata: { kind: 'manual', tags: ['red'] } },
  { id: 'c', text: { title: 'Gamma guide', body: 'shared trail' }, metadata: { kind: 'guide', tags: ['green'] } },
  { id: 'd', text: { title: 'Delta map', body: 'quiet route' }, metadata: { kind: 'map', tags: ['blue', 'blue'] } },
  { id: 'e', text: { title: 'Echo guide', body: 'shared trail' }, metadata: { kind: 'guide', tags: [] } },
  { id: 'f', text: { title: 'Zeta manual', body: 'shared route' }, metadata: { kind: 'manual', tags: [null] } },
  { id: 'g', text: { title: 'Eta', body: 'shared' }, metadata: { tags: [''] } },
  { id: 'h', text: { title: 'Theta', body: 'quiet' }, metadata: { kind: null } },
];
export const cases = [
  { text: '', query: { kind: 'all' } },
  { text: 'shared', query: { kind: 'group', variants: [{ text: 'shared', match: 'prefix' }] } },
  { text: 'shared tra', query: { kind: 'and', children: [{ kind: 'text', text: 'shared' }, { kind: 'group', variants: [{ text: 'tra', match: 'prefix' }] }] } },
  { text: 'quiet', query: { kind: 'group', variants: [{ text: 'quiet', match: 'prefix' }] } },
];
export function generated(seed) {
  let value = seed >>> 0;
  const random = n => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value % n; };
  const words = ['alpha', 'beta', 'gamma', 'trail'], kinds = ['guide', 'manual', 'map', null];
  const tags = ['red', 'blue', 'green', '', 'é', 'e\u0301', null];
  return Array.from({ length: 48 }, (_, index) => ({ id: String(index).padStart(3, '0'),
    text: { title: Array.from({ length: 1 + random(4) }, () => words[random(words.length)]).join(' '),
      body: Array.from({ length: 1 + random(6) }, () => words[random(words.length)]).join(' ') },
    metadata: { ...(random(5) ? { kind: kinds[random(kinds.length)] } : {}),
      ...(random(5) ? { tags: Array.from({ length: random(5) }, () => tags[random(tags.length)]) } : {}) },
  }));
}
