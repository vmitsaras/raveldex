import type { Query } from '../../core/contracts/types.js';
import type { UIOptions } from './types.js';

/** Split raw basic word boundaries only; the engine still owns analysis/limits.
 * Keep original slices (including punctuation) so normalization happens once
 * and malformed/oversized input cannot disappear before native validation. */
export function queryFromText(text: string, mode: UIOptions['mode']): Query {
  if (!text) return { kind: 'all' };
  if (mode === 'phrase') return { kind: 'extension', capability: 'phrases', version: 1, payload: { text } };
  if (mode !== 'prefix' || text.length > 2_048) return { kind: 'text', text };
  const words = text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu);
  let last: RegExpExecArray | undefined;
  let count = 0;
  for (const word of words) { last = word; count++; }
  if (!last || [...last[0].normalize('NFKC').toLowerCase()].length < 2) return { kind: 'text', text };
  const ending: Query = { kind: 'group', variants: [{ text: count === 1 ? text : text.slice(last.index), match: 'prefix' }] };
  const earlier = text.slice(0, last.index);
  return count > 1 ? { kind: 'and', children: [{ kind: 'text', text: earlier }, ending] } : ending;
}
