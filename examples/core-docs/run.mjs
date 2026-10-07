import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

/** Display/source records belong to this application, not the core index. */
export async function runPilot(corpus, judgments, { query, repetitions = 3 } = {}) {
  const engine = createRaveldex({ schema: corpus.schema });
  const display = new Map(corpus.sections.map((section) => [section.id, section]));
  const measurements = [];
  const timed = async (label, action) => {
    const start = performance.now();
    const result = await action();
    measurements.push({ label, milliseconds: performance.now() - start });
    return result;
  };
  try {
    const initial = await engine.search({ kind: 'all' }, { limit: 100 });
    const indexed = await timed('cold-addMany', () => engine.addMany(corpus.records));
    const queries = [];
    for (const judgment of judgments) {
      const samples = [];
      let result;
      for (let n = 0; n < repetitions; n++) {
        const start = performance.now();
        result = await engine.search(judgment.query, { limit: 100 });
        samples.push(performance.now() - start);
      }
      queries.push({ id: judgment.id, query: judgment.query, result, samplesMs: samples,
        medianMs: [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] });
    }
    const navigation = query === undefined ? undefined : await engine.search(query, { limit: 20 });
    const first = corpus.records[0];
    const mutations = [];
    const mutate = async (kind, action, updateDisplay) => {
      const result = await timed(kind, action);
      updateDisplay?.(); // Keep caller display state aligned only after success.
      const searches = [];
      for (const query of [{ kind: 'all' }, 'source', { kind: 'text', text: first.text.title }]) {
        searches.push({ query, result: await engine.search(query, { limit: 100 }) });
      }
      mutations.push({ kind, result, searches });
    };
    await mutate('replace-title-empty', () => engine.replace({ ...first, text: { ...first.text, title: '' } }),
      () => display.set(first.id, { ...display.get(first.id), title: '' }));
    await mutate('replace-original', () => engine.replace(first), () => display.set(first.id, corpus.sections[0]));
    await mutate('remove-one', () => engine.remove(first.id), () => display.delete(first.id));
    await mutate('add-one', () => engine.add(first), () => display.set(first.id, corpus.sections[0]));
    await mutate('clear', () => engine.clear(), () => display.clear());
    await mutate('addMany-original', () => engine.addMany(corpus.records),
      () => corpus.sections.forEach((section) => display.set(section.id, section)));
    await mutate('remove-empty', () => engine.remove([]));
    const errors = [];
    for (const [label, action] of [
      ['duplicate-id', () => engine.add(first)],
      ['unsupported-phrase', () => engine.search({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'original source', fields: ['body'] } })],
      ['invalid-query', () => engine.search({ kind: 'unknown' })],
    ]) {
      try { await action(); throw new Error(`Expected rejection: ${label}`); }
      catch (error) {
        if (!(error instanceof RaveldexError)) throw error;
        errors.push({ label, code: error.code, message: error.message, details: error.details });
      }
    }
    const final = await engine.search({ kind: 'all' }, { limit: 100 });
    return { corpusHash: corpus.hash, initial, indexed, queries, mutations, errors, final, measurements,
      ...(navigation === undefined ? {} : { navigation: { ...navigation, hits: navigation.hits.map((hit) => ({ ...hit,
        title: display.get(hit.id).title, sourceUrl: display.get(hit.id).sourceUrl })) } }) };
  } finally { await engine.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const corpus = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const judgments = JSON.parse(await readFile(process.argv[3], 'utf8'));
    const result = await runPilot(corpus, judgments, { query: process.argv[4] });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof RaveldexError ? `${error.code}: ${error.message}` : error.message);
    process.exitCode = 1;
  }
}
