/** Exact first-party semantic option identity. No digest collision and no host
 * access. Inputs are factory-owned, bounded normalized data. */
export function workerIdentity(family: string, options: unknown): string {
  function canonical(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return `raveldex:${family}:1:${canonical(options)}`;
}
