import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../test/oracle/phrases.mjs';
import {
  calculateMetrics, classifyOutcome, containsPhrase, loadFrozenFixture,
  publicQuery, RELEVANCE_CUTOFF, sha256,
} from './relevance-lib.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Executed by an ESM child in the isolated installed consumer directory. Every
// native symbol is obtained through public exports, with no workspace alias.
function childSource(corpus, judgments) {
  return `
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';
const corpus = ${JSON.stringify(corpus)};
const judgments = ${JSON.stringify(judgments.map(j => ({id:j.id,query:publicQuery(j.query),requiresPhrase:containsPhrase(j.query)})))};
const configurations = [
  {id:'core', source:[], positions:[], offsets:[], phraseStrategies:null},
  {id:'source', source:['title','body'], positions:[], offsets:[], phraseStrategies:{title:'source',body:'source'}},
  {id:'positions-offsets', source:[], positions:['title','body'], offsets:['title','body'], phraseStrategies:{title:'positions',body:'positions'}},
  {id:'mixed', source:['body'], positions:['title'], offsets:['title'], phraseStrategies:{title:'positions',body:'source'}},
];
const runs=[];
for(const configuration of configurations){
  const addons=[];
  if(configuration.source.length) addons.push(createSourceProvider({fields:configuration.source}));
  if(configuration.positions.length) addons.push(createPositionProvider({fields:configuration.positions,offsets:configuration.offsets}));
  if(configuration.phraseStrategies) addons.push(createPhrases({fields:configuration.phraseStrategies}));
  const engine=createRaveldex({schema:corpus.schema,addons});
  try{
    const mutation=await engine.addMany(corpus.records);
    const queries=[];
    for(const judgment of judgments){
      if(judgment.requiresPhrase&&!configuration.phraseStrategies){
        queries.push({id:judgment.id,status:'not-comparable',reason:'Strict phrase capability deliberately omitted from core configuration.'});
        continue;
      }
      try{
        queries.push({id:judgment.id,status:'success',query:judgment.query,...await engine.search(judgment.query,{limit:${RELEVANCE_CUTOFF},offset:0})});
      }catch(error){queries.push({id:judgment.id,status:'error',error:{name:error.name,code:error.code,message:error.message,details:error.details}});}
    }
    runs.push({configuration,mutation,queries});
  }finally{await engine.dispose();}
}
console.log(JSON.stringify({environment:{node:process.version,v8:process.versions.v8,icu:process.versions.icu,unicode:process.versions.unicode,platform:process.platform,architecture:process.arch},runs}));
`;
}

function compareExpected(actual, expected) {
  assert.equal(actual.completeness, 'complete');
  assert.equal(actual.model, 'raveldex-bm25-v1');
  assert.equal(actual.revision, 1);
  assert.equal(actual.total, expected.total);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
  for (let index = 0; index < expected.hits.length; index += 1) {
    const wanted = expected.hits[index].score;
    assert.ok(Number.isFinite(actual.hits[index].score));
    assert.ok(Math.abs(actual.hits[index].score - wanted) <= Math.max(1e-12, Math.abs(wanted) * 1e-12), `Independent score differs for ${actual.hits[index].id}`);
  }
}

export async function evaluateRelevance({ consumerDirectory, output }) {
  assert.ok(consumerDirectory, 'An explicit installed packed consumer directory is required');
  const fixture = await loadFrozenFixture();
  const packageBytes = await readFile(join(consumerDirectory, 'node_modules/@vmitsaras/raveldex/package.json'));
  const pkg = JSON.parse(packageBytes);
  assert.equal(pkg.name, '@vmitsaras/raveldex');
  const child = spawnSync(process.execPath, ['--input-type=module', '-'], {
    cwd: resolve(consumerDirectory), input: childSource(fixture.corpus, fixture.judgments),
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message || 'Native relevance child failed');
  const native = JSON.parse(child.stdout);
  const oracle = scanPhraseSourceCorpus(fixture.corpus.records, fixture.corpus.schema);
  const expected = fixture.judgments.map(judgment => {
    const result = sourcePhraseQueryResult(oracle, judgment.query, { limit: RELEVANCE_CUTOFF });
    return { id: judgment.id, total: result.total, hits: result.hits };
  });
  const comparisons = [];
  for (const run of native.runs) {
    const comparable = run.queries.filter(query => query.status !== 'not-comparable');
    const errors = comparable.filter(query => query.status !== 'success');
    const correctnessFailures = [];
    for (const actual of comparable.filter(query => query.status === 'success')) {
      const index = fixture.judgments.findIndex(judgment => judgment.id === actual.id);
      try { compareExpected(actual, expected[index]); }
      catch (error) { correctnessFailures.push({ id: actual.id, category: 'contract-or-evaluation-failure', message: error.message }); }
    }
    const successfulIds = new Set(comparable.filter(query => query.status === 'success').map(query => query.id));
    const selectedJudgments = fixture.judgments.filter(judgment => successfulIds.has(judgment.id));
    const successfulResults = comparable.filter(query => query.status === 'success');
    const metrics = calculateMetrics(selectedJudgments, successfulResults);
    const classifications = selectedJudgments.map((judgment, index) => {
      const failure = correctnessFailures.find(row => row.id === judgment.id);
      return failure ?? classifyOutcome(
        judgment, successfulResults[index], expected[fixture.judgments.findIndex(row => row.id === judgment.id)], metrics.rows[index],
      );
    }).filter(Boolean);
    comparisons.push({
      configuration: run.configuration,
      featureEquivalence: {
        schema: fixture.corpus.schema, analyzer: { id: 'basic-v1', environmentProfile: 'unqualified' }, model: 'raveldex-bm25-v1',
        exactCount: true, limit: RELEVANCE_CUTOFF, offset: 0,
        phraseMeaning: run.configuration.phraseStrategies ? 'Strict exact original-token adjacency within one field/value; no phrase bonus.' : 'Unavailable: strict phrase cases not comparable.',
        filters: 'Core strict scalar equality/Boolean leaves, no optional range/set filters.',
        retainedSource: run.configuration.source, positions: run.configuration.positions, originalOffsets: run.configuration.offsets,
        ui: 'none', worker: 'none', storage: 'none', evidence: 'none',
      },
      mutation: run.mutation, queries: run.queries,
      independentCorrectness: { method: 'Independent original-source full scan and separately coded BM25/Boolean participation, no production tokenizer/evaluator/scorer imports.', completeComparisons: successfulResults.length, failures: correctnessFailures, errors },
      metrics: { ...metrics, operationalErrorCount: errors.length, unsupportedNotComparable: run.queries.filter(query => query.status === 'not-comparable').length },
      classifications,
    });
  }
  const source = comparisons.find(row => row.configuration.id === 'source');
  const phraseParity = [];
  for (const other of comparisons.filter(row => ['positions-offsets', 'mixed'].includes(row.configuration.id))) {
    const failures = [];
    for (let index = 0; index < source.queries.length; index += 1) {
      const left = source.queries[index], right = other.queries[index];
      if (left.status !== 'success' || right.status !== 'success') { failures.push({ id: left.id, reason: 'A strategy did not complete.' }); continue; }
      try { assert.deepEqual({ total: left.total, hits: left.hits }, { total: right.total, hits: right.hits }); }
      catch { failures.push({ id: left.id, reason: 'Full membership/order/unrounded-score parity differs.' }); }
    }
    phraseParity.push({ left: 'source', right: other.configuration.id, completeComparisons: source.queries.length, failures });
  }
  const report = {
    version: 'rx4001-relevance-evaluation-v1', recordedDate: '2026-10-08',
    command: ['node', 'bench/relevance.mjs', '--consumer', resolve(consumerDirectory), '--output', resolve(output)],
    repositoryRoot: ROOT, consumerDirectory: resolve(consumerDirectory),
    package: { name: pkg.name, version: pkg.version, private: pkg.private, packageJsonSha256: sha256(packageBytes), runtimeDependencies: pkg.dependencies ?? {} },
    environment: native.environment,
    fixture: { freeze: fixture.freeze, context: fixture.context, schema: fixture.corpus.schema, sources: fixture.corpus.sources, corpusHash: fixture.corpus.hash, recordCount: fixture.corpus.records.length, judgmentCount: fixture.judgments.length },
    judgments: fixture.judgments, independentExpectedRankings: expected,
    comparisons, phraseParity,
    limitations: [
      fixture.context.limitations,
      'Source sections are the frozen evaluation snapshot; later documentation edits do not silently alter this corpus.',
      'Judged relevant labels are incomplete; unlabelled hits are unknown rather than automatically irrelevant. Known-irrelevant IDs are explicitly authored.',
      'MRR cutoff100 covers the complete34-record collection. Recall10 is macro-averaged over each known relevant set; micro diagnostic is reported separately.',
      'These relevance runs are correctness/representation observations, not timings, memory, browser UI/navigation, AT or host qualification.',
      'No semantic questions, synonyms, stemming, implicit prefixes, typo correction or query-language parsing are added to native basic-v1.',
      'Core excludes strict phrase judgments as unsupported/not comparable; its relevance denominators therefore differ from the three phrase-enabled configurations.',
      'No foreign ranking agreement is used as correctness truth and no overall winner is declared.',
    ],
  };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const output = option('--output') ?? '/tmp/raveldex-rx4001-relevance.json';
  const report = await evaluateRelevance({ consumerDirectory: option('--consumer'), output });
  console.log(JSON.stringify({ output, corpusHash: report.fixture.corpusHash, judgments: report.fixture.judgmentCount, configurations: report.comparisons.map(row => ({ id: row.configuration.id, completeComparisons: row.independentCorrectness.completeComparisons, failures: row.independentCorrectness.failures.length, errors: row.independentCorrectness.errors.length, metrics: { top1: row.metrics.top1, top3: row.metrics.top3, mrr: row.metrics.mrr, recall10Macro: row.metrics.recall10Macro, correctIntendedEmpty: row.metrics.correctIntendedEmpty, unintendedEmpty: row.metrics.unintendedEmpty, unsupportedNotComparable: row.metrics.unsupportedNotComparable } })), phraseParity: report.phraseParity }, null, 2));
  if (report.comparisons.some(row => row.independentCorrectness.failures.length || row.independentCorrectness.errors.length) || report.phraseParity.some(row => row.failures.length)) process.exitCode = 1;
}
