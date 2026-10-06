import { bound, invalid } from '../errors/error.js';
import type { Limits } from './limits.js';

/** Pure accounting only. The FIFO scheduler/clock/checkpoints arrive in RX-1005. */
export class WorkBudget {
  readonly policy = 'work-v1';
  private used = 0;
  constructor(private readonly maximum: number) {}
  get consumed(): number { return this.used; }
  charge(units: number): void {
    if (!Number.isSafeInteger(units) || units < 0) invalid('INTERNAL_ERROR', 'work.units');
    this.used += units;
    if (!Number.isSafeInteger(this.used) || this.used > this.maximum) invalid('WORK_LIMIT_EXCEEDED', 'work');
  }
}

/** Later retrieval supplies counts; this slice does not enumerate a dictionary. */
export function validateExpansionCounts(perGroup: number, wholeQuery: number, limits: Limits): void {
  for (const count of [perGroup, wholeQuery]) if (!Number.isSafeInteger(count) || count < 0) invalid('INTERNAL_ERROR', 'expansions');
  bound(perGroup, limits.maxExpansionsPerGroup, 'expansions.group');
  bound(wholeQuery, limits.maxQueryExpansions, 'expansions.query');
}
