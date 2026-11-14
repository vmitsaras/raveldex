import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPositionPhrases } from '@vmitsaras/raveldex/addons/phrases/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createInspector, exportDiagnostics } from '@vmitsaras/raveldex/addons/inspector';
import { createMatchEvidence } from '@vmitsaras/raveldex/addons/evidence';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';

const schema = {
  text: { title: { boost: 2 }, body: {} },
  metadata: { kind: { type: 'string' }, year: { type: 'number' } },
};
const records = [
  { id: 'a', text: { title: 'Red car', body: 'A red car guide.' }, metadata: { kind: 'guide', year: 2026 } },
  { id: 'b', text: { title: 'Blue car', body: 'A blue car note.' }, metadata: { kind: 'note', year: 2024 } },
];
const phrase = { kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red car', fields: ['title', 'body'] } };

export async function runAddonsExample() {
  const fields = ['title', 'body'];
  const engine = createRaveldex({ schema, addons: [
    createSourceProvider({ fields }), createSourcePhrases({ fields }),
    createFilters({ fields: ['kind', 'year'] }), createFacets({ fields: ['kind'] }),
    createInspector({ sourceFields: ['title'] }),
    createMatchEvidence({ fields: { title: 'source', body: 'source' } }),
    createSnippetEvidence({ fields: { title: 'source', body: 'source' } }),
  ] });
  try {
    await engine.addMany(records);
    const phrasePage = await engine.search(phrase);
    const filtered = await engine.search({ kind: 'and', children: [
      { kind: 'text', text: 'car' },
      { kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'year', gte: 2025 } },
      { kind: 'extension', capability: 'set-membership', version: 1, payload: { field: 'kind', values: ['guide'] } },
    ] }, { extensions: { facets: { fields: [{ field: 'kind', missing: true }] } } });
    // Evidence requests are separate: one evidence extension per search.
    const inspected = await engine.search('car', { extensions: {
      inspector: { ids: ['a', 'missing'], expectedRevision: filtered.revision, sourceFields: ['title'] },
    } });
    const diagnostics = exportDiagnostics(inspected.extensions.inspector);
    const ranges = await engine.search('red', { extensions: { 'match-evidence': { ids: ['a'] } } });
    const snippets = await engine.search('red', { extensions: { snippets: { ids: ['a'] } } });
    const strategies = [];
    for (const addons of [
      [createPositionProvider({ fields, offsets: ['title'] }), createPositionPhrases({ fields })],
      [createSourceProvider({ fields: ['body'] }), createPositionProvider({ fields: ['title'], offsets: ['title'] }), createPhrases({ fields: { title: 'positions', body: 'source' } })],
    ]) {
      const alternate = createRaveldex({ schema, addons });
      try { await alternate.addMany(records); strategies.push(await alternate.search(phrase)); }
      finally { await alternate.dispose(); }
    }
    return { phrasePage, filtered, inspected, diagnostics, ranges, snippets, strategies };
  } finally { await engine.dispose(); }
}
