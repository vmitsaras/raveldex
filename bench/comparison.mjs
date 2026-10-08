import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createCompanionComparator, COMPANION_IDENTITY } from '../integrations/minisearch/companion-comparator.mjs';
import { companionQuery, foreignMembership, EQUIVALENCE } from './comparison-lib.mjs';
import { calculateMetrics } from './relevance-lib.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../test/oracle/phrases.mjs';
import { RELEVANCE_JUDGMENTS, CORPUS_HASH, JUDGMENT_CONTEXT } from '../test/fixtures/relevance/judgments.mjs';

const companion = process.argv[2];
if (!companion) throw Error('Usage: node bench/comparison.mjs <explicit pinned companion checkout> [output.json]');
const root = resolve(companion), output = resolve(process.argv[3] ?? '/tmp/raveldex-rx4001-comparison.json');
const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(git(['rev-parse', 'HEAD']), COMPANION_IDENTITY.revision); assert.equal(git(['status', '--porcelain']), '');
const tracked = git(['ls-files']).split('\n');
async function identity() {
  return digest(JSON.stringify(await Promise.all(tracked.map(async path => [path, digest(await readFile(join(root, path)))]))));
}
const before = await identity();
const installedForeign = JSON.parse(await readFile(join(root, 'node_modules/minisearch/package.json')));
assert.equal(installedForeign.version, '7.2.0');
const { createLocalSearch } = await import(pathToFileURL(join(root, 'dist/index.js')).href);
const corpus = JSON.parse(await readFile(new URL('../test/fixtures/relevance/corpus.json', import.meta.url)));
assert.equal(corpus.hash, CORPUS_HASH);
const fields = Object.keys(corpus.schema.text);
const options = { schema: Object.fromEntries([...Object.entries(corpus.schema.text).map(([name, value]) => [name, { type: 'text', boost: value.boost ?? 1 }]),
  ...Object.keys(corpus.schema.metadata).map(name => [name, { type: 'keyword' }])]), returnFields: [] };
const foreignRecords = corpus.records.map(record => ({ id: record.id, ...record.text, ...record.metadata }));
const foreign = await createCompanionComparator({ createLocalSearch, identity: COMPANION_IDENTITY }, options, foreignRecords);
const native = createRaveldex({ schema: corpus.schema, addons: [createSourceProvider({ fields }), createSourcePhrases({ fields })] });
const reference = scanPhraseSourceCorpus(corpus.records, corpus.schema);
const nativeQuery = node => typeof node === 'string' ? node : node.kind === 'phrase'
  ? { kind: 'extension', capability: 'phrases', version: 1, payload: { text: node.text, ...(node.fields ? { fields: node.fields } : {}) } }
  : node.kind === 'and' || node.kind === 'or' ? { ...node, children: node.children.map(nativeQuery) }
    : node.kind === 'not' ? { ...node, child: nativeQuery(node.child) } : node;
const report = { version: 'rx4001-foreign-comparison-v1', corpusHash: corpus.hash, judgmentContext: JUDGMENT_CONTEXT,
  environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode },
  consumer: process.cwd(), nativeIdentity: { package: '@vmitsaras/raveldex', version: '0.0.0', model: 'raveldex-bm25-v1', analyzer: 'basic-v1/unqualified', runtimeDependencies: [] },
  foreignIdentity: { ...COMPANION_IDENTITY, companionEntrySha256: digest(await readFile(join(root, 'dist/index.js'))),
    minisearchEntrySha256: digest(await readFile(join(root, 'node_modules/minisearch/dist/es/index.js'))) },
  equivalence: EQUIVALENCE, foreignOptions: options, limitations: foreign.limitations, rows: [],
  method: 'Sequential public installed native and explicitly injected pinned companion APIs. Independent source scans check each complete membership separately. Scores/ranks are observations of different models. No timed race, tuning or overall winner.' };
try {
  await native.addMany(corpus.records);
  for (const judgment of RELEVANCE_JUDGMENTS) {
    const translated = companionQuery(judgment.query);
    if (!translated) { report.rows.push({ id: judgment.id, query: judgment.query, status: 'Not comparable', reason: 'No semantics-preserving companion public query representation; no dropped clauses or invented native score equivalence.' }); continue; }
    const actual = await native.search(nativeQuery(judgment.query), { limit: 100 });
    const expected = sourcePhraseQueryResult(reference, judgment.query, { limit: 100 });
    assert.equal(actual.total, expected.total); assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
    actual.hits.forEach((hit, i) => assert.ok(Math.abs(hit.score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12)));
    const legacy = await foreign.search(translated);
    const foreignExpected = foreignMembership(corpus.records, fields, translated);
    assert.equal(legacy.total.relation, 'exact'); assert.equal(legacy.total.value, foreignExpected.length);
    assert.deepEqual(legacy.hits.map(hit => hit.id).sort(), foreignExpected);
    const nativeIds = actual.hits.map(hit => hit.id).sort();
    const sameMembers = JSON.stringify(nativeIds) === JSON.stringify(foreignExpected);
    report.rows.push({ id: judgment.id, query: judgment.query, foreignQuery: translated,
      status: sameMembers ? 'Comparable eligibility; different ranking models and output work' : 'Not comparable Unicode memberships',
      semanticDifference: sameMembers ? null : 'Native NFKC/letter-or-number-start versus foreign NFC/leading-mark runs; each separately checked against its independent declared analyzer reference.',
      nativeExpectedMembers: nativeIds, foreignExpectedMembers: foreignExpected, sameMembers, native: actual, foreign: legacy,
      rankOnlyChanged: sameMembers && JSON.stringify(actual.hits.map(hit => hit.id)) !== JSON.stringify(legacy.hits.map(hit => hit.id)) });
  }
} finally { await native.dispose(); await foreign.destroy(); }
const after = await identity(); assert.equal(after, before);
assert.equal(git(['rev-parse', 'HEAD']), COMPANION_IDENTITY.revision); assert.equal(git(['status', '--porcelain']), '');
report.provenance = { trackedFiles: tracked.length, beforeSha256: before, afterSha256: after, clean: true, historicalClaims: 'No imported passes or modified companion files.' };
report.summary = { queries: report.rows.length, translated: report.rows.filter(row => row.foreign).length,
  eligibilityComparable: report.rows.filter(row => row.sameMembers).length, rankOnlyChanged: report.rows.filter(row => row.rankOnlyChanged).length,
  analyzerDifferences: report.rows.filter(row => row.foreign && !row.sameMembers).length,
  unsupported: report.rows.filter(row => !row.foreign).map(row => row.id) };
const eligible = report.rows.filter(row => row.sameMembers);
const selected = RELEVANCE_JUDGMENTS.filter(judgment => eligible.some(row => row.id === judgment.id));
report.relevanceOnEqualMembershipSubset = {
  scope: 'Same original labels on eligibility-equivalent translated subset only; excludes unsupported trees and observed analyzer membership differences. Models/output work still differ; no overall winner.',
  queryIds: selected.map(row => row.id),
  native: calculateMetrics(selected, eligible.map(row => ({ id: row.id, total: row.native.total, hits: row.native.hits }))),
  foreign: calculateMetrics(selected, eligible.map(row => ({ id: row.id, total: row.foreign.total.value, hits: row.foreign.hits }))),
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, summary: report.summary }));
