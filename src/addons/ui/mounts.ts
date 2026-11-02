import type { UIHandle } from './types.js';

// Local ownership only: importing a UI never discovers or initializes a host.
export const mounted = new WeakMap<HTMLElement, {
  readonly kind: 'legacy' | 'inline' | 'modal' | 'dropdown';
  readonly handle: UIHandle;
}>();
