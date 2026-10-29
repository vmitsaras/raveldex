/** Independent RX-A050 full-source model. No production analyzer, tokenizer,
 * dictionary, query compiler, phrase provider or scorer is imported. Regex
 * source spans and a complete document scan deliberately favor clarity. */
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const normalized = value => value.normalize('NFKC').toLowerCase();
const lower = value => typeof value === 'string' && /^\p{Ll}/u.test(value);
const upper = value => typeof value === 'string' && /^[\p{Lu}\p{Lt}]/u.test(value);
const letter = value => typeof value === 'string' && /^\p{L}/u.test(value);
const number = value => typeof value === 'string' && /^\p{N}/u.test(value);

export function identifierOriginals(value, valueIndex = 0) {
  return [...value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}_]*/gu)].map((match, position) => ({
    term: normalized(match[0]), start: match.index, end: match.index + match[0].length,
    valueIndex, position, kind: 'original', originalStart: match.index, originalEnd: match.index + match[0].length,
  }));
}

/** Components are split before normalizing. Distinct canonical components
 * retain their first source span and co-position with their original. */
export function identifierOccurrences(value, valueIndex = 0) {
  return identifierOriginals(value, valueIndex).flatMap(original => {
    const raw = value.slice(original.start, original.end), spans = [];
    for (const segment of raw.matchAll(/[^_]+/gu)) {
      const clusters = [...segment[0].matchAll(/[\p{L}\p{N}]\p{M}*/gu)];
      let start = 0;
      for (let i = 1; i <= clusters.length; i++) {
        const previous = clusters[i - 1]?.[0], current = clusters[i]?.[0], next = clusters[i + 1]?.[0];
        const boundary = i === clusters.length || lower(previous) && upper(current)
          || upper(previous) && upper(current) && lower(next)
          || letter(previous) && number(current) || number(previous) && letter(current);
        if (!boundary) continue;
        const first = clusters[start], last = clusters[i - 1];
        if (first && last) spans.push([original.start + segment.index + first.index,
          original.start + segment.index + last.index + last[0].length]);
        start = i;
      }
    }
    const seen = new Set([original.term]), tokens = [original];
    for (const [start, end] of spans) {
      const term = normalized(value.slice(start, end));
      if (seen.has(term)) continue;
      seen.add(term); tokens.push({ ...original, term, start, end, kind: 'component' });
    }
    return tokens;
  });
}

export function scanIdentifierCorpus(records, schema) {
  const names = Object.keys(schema.text).sort(ordinal);
  const statistics = new Map(names.map(name => [name, { boost: schema.text[name].boost ?? 1, population: 0, totalLength: 0, documentFrequencies: new Map() }]));
  const documents = records.map(record => {
    const fields = new Map(), originals = new Map();
    for (const name of names) {
      const raw = record.text[name], values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
      const tokens = values.flatMap((value, index) => identifierOccurrences(value, index)), frequencies = new Map();
      originals.set(name, values.map((value, index) => identifierOriginals(value, index)));
      for (const token of tokens) frequencies.set(token.term, (frequencies.get(token.term) ?? 0) + 1);
      fields.set(name, { length: tokens.length, frequencies });
      const field = statistics.get(name);
      if (tokens.length) {
        field.population++; field.totalLength += tokens.length;
        for (const term of frequencies.keys()) field.documentFrequencies.set(term, (field.documentFrequencies.get(term) ?? 0) + 1);
      }
    }
    return { id: record.id, metadata: record.metadata ?? {}, fields, originals };
  });
  return { names, statistics, documents };
}

function group(fields, variants) {
  const alternatives = [...new Map(variants.map(variant => [JSON.stringify([variant.term, variant.match, variant.weight]), variant])).entries()]
    .sort(([a], [b]) => ordinal(a, b)).map(([, variant]) => variant);
  fields = [...fields].sort(ordinal);
  return { fields, alternatives, identity: JSON.stringify([fields, alternatives]) };
}
function compile(raw, names) {
  const query = typeof raw === 'string' ? { kind: 'text', text: raw } : raw;
  switch (query.kind) {
    case 'text': {
      const terms = identifierOriginals(query.text).map(token => token.term);
      return { kind: terms.length ? query.operator ?? 'and' : 'none', children: terms.map(term => ({ kind: 'lexical', group: group(query.fields ?? names, [{ term, match: 'exact', weight: 1 }]) })) };
    }
    case 'group': return { kind: 'lexical', group: group(query.fields ?? names, query.variants.map(variant => {
      const tokens = identifierOriginals(variant.text);
      if (tokens.length !== 1) throw Error('Oracle group variants require one original identifier');
      return { term: tokens[0].term, match: variant.match, weight: variant.weight ?? 1 };
    })) };
    case 'phrase': return { kind: 'phrase', terms: identifierOriginals(query.text).map(token => token.term), fields: query.fields ?? names };
    case 'and': case 'or': return { kind: query.kind, children: query.children.map(child => compile(child, names)) };
    case 'not': return { kind: 'not', child: compile(query.child, names) };
    case 'all': case 'none': case 'eq': return query;
    default: throw Error('Unsupported independent identifier query');
  }
}
function matches(group, document, field) {
  const result = new Map();
  for (const term of document.fields.get(field).frequencies.keys()) for (const alternative of group.alternatives) {
    if (alternative.match === 'exact' ? term === alternative.term : term.startsWith(alternative.term))
      result.set(term, Math.max(result.get(term) ?? 0, alternative.weight));
  }
  return result;
}
function participate(node, document) {
  const outcome = (matched, groups = []) => ({ matched, groups: new Map(groups) });
  switch (node.kind) {
    case 'lexical': return outcome(node.group.fields.some(field => matches(node.group, document, field).size), [[node.group.identity, node.group]]);
    case 'phrase': {
      const matched = node.terms.length > 0 && node.fields.some(field => document.originals.get(field).some(tokens =>
        tokens.some((_, start) => node.terms.every((term, offset) => tokens[start + offset]?.term === term))));
      return outcome(matched, node.terms.map(term => {
        const lexical = group(node.fields, [{ term, match: 'exact', weight: 1 }]); return [lexical.identity, lexical];
      }));
    }
    case 'all': return outcome(true);
    case 'none': return outcome(false);
    case 'eq': return outcome(Object.hasOwn(document.metadata, node.field) &&
      (Array.isArray(document.metadata[node.field]) ? document.metadata[node.field].includes(node.value) : document.metadata[node.field] === node.value));
    case 'not': return outcome(!participate(node.child, document).matched);
    case 'and': case 'or': {
      const outcomes = node.children.map(child => participate(child, document));
      const matched = node.kind === 'and' ? outcomes.every(value => value.matched) : outcomes.some(value => value.matched);
      return outcome(matched, matched ? outcomes.filter(value => value.matched).flatMap(value => [...value.groups]) : []);
    }
  }
}
function score(group, document, statistics) {
  let total = 0;
  for (const name of group.fields) {
    const stats = statistics.get(name), field = document.fields.get(name); let best = 0;
    for (const [term, weight] of matches(group, document, name)) {
      const tf = field.frequencies.get(term), df = stats.documentFrequencies.get(term), average = stats.totalLength / stats.population;
      const idf = Math.log(1 + (stats.population - df + 0.5) / (df + 0.5));
      const normalizer = 1.2 * (0.25 + 0.75 * field.length / average);
      best = Math.max(best, weight * stats.boost * idf * (tf * 2.2) / (tf + normalizer));
    }
    total += best;
  }
  return total;
}
export function sourceIdentifierResult(corpus, raw, options = {}) {
  const query = compile(raw, corpus.names), hits = [];
  for (const document of corpus.documents) {
    const result = participate(query, document);
    if (!result.matched) continue;
    const sum = [...result.groups.entries()].sort(([a], [b]) => ordinal(a, b)).reduce((sum, [, group]) => sum + score(group, document, corpus.statistics), 0);
    hits.push({ id: document.id, score: sum });
  }
  hits.sort((a, b) => b.score - a.score || ordinal(a.id, b.id));
  return { total: hits.length, hits: hits.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 20)) };
}
