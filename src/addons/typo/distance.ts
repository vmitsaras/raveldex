import type { WorkStep } from '../../core/index/directory.js';

/** OSA distance <= 1, specialized to one edit. No UTF-16-unit edits. */
export function* oneEdit(a: readonly string[], b: readonly string[]): Generator<WorkStep, boolean> {
  yield { workUnits: 1 };
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < Math.min(a.length, b.length)) {
    yield { workUnits: 1 };
    if (a[i] !== b[i]) break;
    i++;
  }
  if (i === Math.min(a.length, b.length)) return true;
  let left = i, right = i;
  if (a.length === b.length) {
    yield { workUnits: 1 };
    // One substitution, or one swap of neighboring code points.
    if (i + 1 < a.length && a[i] === b[i + 1] && a[i + 1] === b[i]) { left += 2; right += 2; }
    else { left++; right++; }
  } else if (a.length > b.length) left++;
  else right++;
  while (left < a.length && right < b.length) {
    yield { workUnits: 1 };
    if (a[left++] !== b[right++]) return false;
  }
  return left === a.length && right === b.length;
}

export function* codePoints(term: string): Generator<WorkStep, readonly string[]> {
  const points: string[] = [];
  for (const point of term) { yield { workUnits: point.length + 1 }; points.push(point); }
  return points;
}
