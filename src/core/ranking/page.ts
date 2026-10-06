import type { WorkStep } from '../index/directory.js';
import { compareStrings } from '../query/work.js';
import type { Charge } from '../query/work.js';

export interface Hit { readonly id: string; readonly score: number }

/** Worst-first bounded heap. Offset + limit, never membership, bounds storage. */
export class PageSelection {
  private readonly heap: Hit[] = [];
  constructor(private readonly capacity: number, private readonly charge: Charge) {}
  private *compare(a: Hit, b: Hit): Generator<WorkStep, number> {
    yield this.charge(1);
    return a.score === b.score ? yield* compareStrings(a.id, b.id, this.charge) : b.score - a.score;
  }
  *add(hit: Hit): Generator<WorkStep> {
    if (!this.capacity) return;
    if (this.heap.length === this.capacity) {
      if ((yield* this.compare(hit, this.heap[0]!)) >= 0) return;
      this.heap[0] = hit;
      yield* this.down();
    } else {
      let i = this.heap.length;
      this.heap.push(hit); yield this.charge(1);
      while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if ((yield* this.compare(this.heap[i]!, this.heap[parent]!)) <= 0) break;
        yield this.charge(1); [this.heap[parent], this.heap[i]] = [this.heap[i]!, this.heap[parent]!]; i = parent;
      }
    }
  }
  private *down(): Generator<WorkStep> {
    let i = 0;
    while (i * 2 + 1 < this.heap.length) {
      let child = i * 2 + 1;
      if (child + 1 < this.heap.length && (yield* this.compare(this.heap[child + 1]!, this.heap[child]!)) > 0) child++;
      if ((yield* this.compare(this.heap[i]!, this.heap[child]!)) >= 0) break;
      yield this.charge(1); [this.heap[i], this.heap[child]] = [this.heap[child]!, this.heap[i]!]; i = child;
    }
  }
  *finish(offset: number, limit: number): Generator<WorkStep, readonly Hit[]> {
    const reversed: Hit[] = [];
    while (this.heap.length) {
      const rank = this.heap.length - 1;
      const hit = this.heap[0]!;
      const last = this.heap.pop()!;
      yield this.charge(1);
      if (this.heap.length) { this.heap[0] = last; yield* this.down(); }
      if (rank >= offset && rank < offset + limit) { yield this.charge(1); reversed.push(Object.freeze(hit)); }
    }
    // Returned hits have the small explicit maxHits bound; reversal copies no
    // candidate directory and does not hide sorting/comparison work.
    return Object.freeze(reversed.reverse());
  }
}
