import type { WorkStep } from '../index/directory.js';

export type Charge = (units: number) => WorkStep;

/** Binary UTF-16 comparison, with resumable comparison work. */
export function* compareStrings(a: string, b: string, charge: Charge): Generator<WorkStep, number> {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    yield charge(1);
    const difference = a.charCodeAt(i) - b.charCodeAt(i);
    if (difference) return difference;
  }
  yield charge(1);
  return a.length - b.length;
}

/** Small canonical collections still account for input and comparison work. */
export function* sortedStrings(input: Iterable<string>, charge: Charge): Generator<WorkStep, string[]> {
  const output: string[] = [];
  for (const value of input) {
    yield charge(value.length + 1);
    let i = output.length;
    while (i > 0 && (yield* compareStrings(value, output[i - 1]!, charge)) < 0) {
      yield charge(1); output[i] = output[i - 1]!; i--;
    }
    output[i] = value;
  }
  return output;
}
