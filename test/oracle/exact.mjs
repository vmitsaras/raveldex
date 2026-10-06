/**
 * Independent source-scan reference for admitted fixture records only.
 * CORE_CONTRACT's normative original-token expression is applied directly;
 * this deliberately does not share the production's resumable scanner.
 * Every original span emits once, even if NFKC introduces separators.
 */
export function sourceTerms(value) {
  return [...value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)]
    .map(([original]) => original.normalize('NFKC').toLowerCase());
}

/**
 * Match a normalized exact term in any selected declared field/value.
 * This is eligibility only: no query analysis, ranking, or pagination.
 * Inputs must already satisfy the fixture's admission contract.
 */
export function sourceExactIds(records, schema, normalizedTerm, fields = Object.keys(schema.text)) {
  const selected = fields.filter((field) => Object.hasOwn(schema.text, field));
  const eligible = [];
  for (const record of records) {
    const matched = selected.some((field) => {
      if (!Object.hasOwn(record.text, field)) return false;
      const raw = record.text[field];
      const values = typeof raw === 'string' ? [raw] : raw;
      return values.some((value) => sourceTerms(value).includes(normalizedTerm));
    });
    if (matched) eligible.push(record.id);
  }
  return eligible;
}
