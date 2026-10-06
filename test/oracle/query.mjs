/**
 * Independent full-source reference for admitted query fixtures.
 * No production analyzer, compiler, dictionary, evaluator, or scorer is used.
 * This intentionally trades efficiency for a straightforward corpus scan.
 */
export function originalSourceTokens(value) {
  return [...value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)].map((match) => ({
    term: match[0].normalize('NFKC').toLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const terms = (value) => originalSourceTokens(value).map(({ term }) => term);

export function scanSourceCorpus(records, schema) {
  const names = Object.keys(schema.text).sort(compare);
  const statistics = new Map(names.map((name) => [name, {
    boost: schema.text[name].boost ?? 1,
    population: 0,
    totalLength: 0,
    documentFrequencies: new Map(),
  }]));
  const documents = records.map((record) => {
    const fields = new Map();
    for (const name of names) {
      const value = record.text[name];
      const values = value === undefined ? [] : typeof value === 'string' ? [value] : value;
      const occurrences = values.flatMap(terms);
      const frequencies = new Map();
      for (const term of occurrences) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      fields.set(name, { length: occurrences.length, frequencies });
      const field = statistics.get(name);
      if (occurrences.length > 0) {
        field.population += 1;
        field.totalLength += occurrences.length;
        for (const term of frequencies.keys()) {
          field.documentFrequencies.set(term, (field.documentFrequencies.get(term) ?? 0) + 1);
        }
      }
    }
    return { id: record.id, metadata: record.metadata ?? {}, fields };
  });
  return { names, statistics, documents };
}

/** Own reference identity; deliberately never reads a production key. */
function referenceGroup(fields, alternatives) {
  const names = [...fields].sort(compare);
  const unique = new Map();
  for (const alternative of alternatives) {
    const signature = JSON.stringify([alternative.term, alternative.match, alternative.weight]);
    unique.set(signature, alternative);
  }
  const signatures = [...unique.keys()].sort(compare);
  return {
    identity: JSON.stringify({ fields: names, alternatives: signatures }),
    fields: names,
    alternatives: signatures.map((signature) => unique.get(signature)),
  };
}

function referenceQuery(rawQuery, names) {
  const node = typeof rawQuery === 'string' ? { kind: 'text', text: rawQuery } : rawQuery;
  switch (node.kind) {
    case 'text': {
      const children = terms(node.text).map((term) => ({
        kind: 'lexical',
        group: referenceGroup(node.fields ?? names, [{ term, match: 'exact', weight: 1 }]),
      }));
      return children.length === 0 ? { kind: 'none' } : { kind: node.operator ?? 'and', children };
    }
    case 'group': return {
      kind: 'lexical',
      group: referenceGroup(node.fields ?? names, node.variants.map((variant) => {
        const analyzed = terms(variant.text);
        if (analyzed.length !== 1) throw new Error('Reference fixtures require admitted single-token variants');
        return { term: analyzed[0], match: variant.match, weight: variant.weight ?? 1 };
      })),
    };
    case 'and': case 'or': return { kind: node.kind, children: node.children.map((child) => referenceQuery(child, names)) };
    case 'not': return { kind: 'not', child: referenceQuery(node.child, names) };
    case 'eq': case 'all': case 'none': return node;
    default: throw new Error('Reference fixtures contain an unsupported node');
  }
}

function matchingTerms(group, document, field) {
  const matches = new Map();
  for (const term of document.fields.get(field).frequencies.keys()) {
    for (const variant of group.alternatives) {
      if (variant.match === 'exact' ? term === variant.term : term.startsWith(variant.term)) {
        matches.set(term, Math.max(matches.get(term) ?? 0, variant.weight));
      }
    }
  }
  return matches;
}

function participate(node, document) {
  switch (node.kind) {
    case 'lexical': {
      const matches = node.group.fields.some((field) => matchingTerms(node.group, document, field).size > 0);
      return { matches, groups: new Map(matches ? [[node.group.identity, node.group]] : []) };
    }
    case 'all': return { matches: true, groups: new Map() };
    case 'none': return { matches: false, groups: new Map() };
    case 'eq': {
      const present = Object.hasOwn(document.metadata, node.field);
      const value = document.metadata[node.field];
      const matches = present && (Array.isArray(value) ? value.some((item) => item === node.value) : value === node.value);
      return { matches, groups: new Map() };
    }
    case 'not': return { matches: !participate(node.child, document).matches, groups: new Map() };
    case 'and': case 'or': {
      const children = node.children.map((child) => participate(child, document));
      const matches = node.kind === 'and' ? children.every((child) => child.matches) : children.some((child) => child.matches);
      const groups = new Map();
      if (matches) {
        for (const child of children) {
          if (child.matches) for (const [identity, group] of child.groups) groups.set(identity, group);
        }
      }
      return { matches, groups };
    }
  }
}

function independentGroupScore(group, document, statistics) {
  let sum = 0;
  for (const name of group.fields) {
    const field = statistics.get(name);
    const reverse = document.fields.get(name);
    let best = 0;
    for (const [term, weight] of matchingTerms(group, document, name)) {
      const tf = reverse.frequencies.get(term);
      const df = field.documentFrequencies.get(term);
      const average = field.totalLength / field.population;
      const idf = Math.log(1 + (field.population - df + 0.5) / (df + 0.5));
      const normalizer = 1.2 * (1 - 0.75 + 0.75 * reverse.length / average);
      const tfPart = (tf * (1.2 + 1)) / (tf + normalizer);
      const base = field.boost * idf * tfPart;
      best = Math.max(best, weight * base);
    }
    sum += best;
  }
  return sum;
}

/** Complete membership, source-derived Boolean participation, and BM25. */
export function sourceQueryResult(corpus, rawQuery, options = {}) {
  const query = referenceQuery(rawQuery, corpus.names);
  const hits = [];
  const participation = new Map();
  for (const document of corpus.documents) {
    const outcome = participate(query, document);
    if (!outcome.matches) continue;
    const groups = [...outcome.groups].sort(([left], [right]) => compare(left, right));
    let score = 0;
    for (const [, group] of groups) score += independentGroupScore(group, document, corpus.statistics);
    hits.push({ id: document.id, score });
    participation.set(document.id, groups.map(([identity]) => identity));
  }
  hits.sort((left, right) => right.score - left.score || compare(left.id, right.id));
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 20;
  return { total: hits.length, hits: hits.slice(offset, offset + limit), participation };
}
