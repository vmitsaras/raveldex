/** Explicit original-token ordered matching. Fields must have position providers. */
export interface ProximityOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxWorkUnits?: number;
}

/** Each alternative analyzes to one token. maxGap counts skipped original tokens
 * per adjacent group; zero is strict adjacency. */
export interface ProximityPayload {
  readonly groups: readonly (readonly string[])[];
  readonly maxGap: number;
  readonly fields?: readonly string[];
}
