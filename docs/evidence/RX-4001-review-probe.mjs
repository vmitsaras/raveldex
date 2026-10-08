/** Independent reviewer calculations. Does not import benchmark metric/cost helpers. */
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEVANCE_JUDGMENTS, JUDGMENT_CONTEXT } from '../../test/fixtures/relevance/judgments.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const acceptedBaseline = '6e714a3';
const args = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12, `${a} versus ${b}`);
const report = { kind: 'rx4001-independent-review-v1', date: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch }, checks: [] };
const check = async (name, run) => { const result = await run(); report.checks.push({ name, status: 'Pass', ...result }); };

await check('frozen corpus and judgment identity', async () => {
  const fixture = join(root, 'test/fixtures/relevance');
  const freeze = await readJSON(join(fixture, 'freeze.json'));
  const corpusBytes = await readFile(join(fixture, 'corpus.json'));
  const judgmentBytes = await readFile(join(fixture, 'judgments.mjs'));
  assert.equal(digest(corpusBytes), freeze.files['corpus.json']);
  assert.equal(digest(judgmentBytes), freeze.files['judgments.mjs']);
  const corpus = JSON.parse(corpusBytes), { hash, ...content } = corpus;
  assert.equal(digest(JSON.stringify(content)), hash);
  assert.equal(hash, JUDGMENT_CONTEXT.corpusHash);
  assert.equal(corpus.records.length, 34); assert.equal(RELEVANCE_JUDGMENTS.length, 76);
  const knownIds = new Set(corpus.records.map(row => row.id));
  assert.equal(new Set(RELEVANCE_JUDGMENTS.map(row => JSON.stringify(row.query))).size, 76);
  for (const judgment of RELEVANCE_JUDGMENTS) {
    for (const id of [...judgment.mustFindIds, ...judgment.acceptableIds, ...judgment.knownIrrelevantIds]) assert.ok(knownIds.has(id));
    for (const id of judgment.mustFindIds) assert.ok(judgment.acceptableIds.includes(id));
    for (const id of judgment.knownIrrelevantIds) assert.ok(!judgment.acceptableIds.includes(id));
  }
  const sources = await Promise.all(corpus.sources.map(async row => ({ path: row.path, frozenSha256: row.sha256, currentSha256: digest(await readFile(join(root, row.path))) })));
  return { corpusHash: hash, corpusBytesSha256: digest(corpusBytes), judgmentBytesSha256: digest(judgmentBytes), distinctQueries: 76,
    knownRelevant: RELEVANCE_JUDGMENTS.filter(row => row.expectation === 'known-relevant').length,
    intendedEmpty: RELEVANCE_JUDGMENTS.filter(row => row.expectation === 'intended-empty').length, sources,
    limit: 'Freeze hashes prove captured identity. Authorship/order is recorded provenance; it is not cryptographically authenticated. Later source-document edits may differ from the deliberately frozen snapshot.' };
});

function independentMetrics(judgments, results) {
  const byId = new Map(results.map(row => [row.id, row]));
  let top1 = 0, top3 = 0, rr = 0, recall = 0, retrieved = 0, relevant = 0, intended = 0, correctEmpty = 0, unintended = 0, ranked = 0;
  for (const judgment of judgments) {
    const result = byId.get(judgment.id); assert.ok(result);
    const ids = result.hits.map(hit => hit.id); assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, result.total, 'cutoff100 covers the complete34-record corpus');
    if (judgment.expectation === 'intended-empty') { intended++; correctEmpty += Number(result.total === 0); continue; }
    ranked++; unintended += Number(result.total === 0);
    const acceptable = new Set(judgment.acceptableIds), first = ids.findIndex(id => acceptable.has(id));
    top1 += Number(first === 0); top3 += Number(first >= 0 && first < 3); rr += first < 0 ? 0 : 1 / (first + 1);
    const found = ids.slice(0, 10).filter(id => acceptable.has(id)).length;
    recall += found / acceptable.size; retrieved += found; relevant += acceptable.size;
  }
  return { queries: judgments.length, ranked, top1, top3, reciprocalRankSum: rr, mrr: rr / ranked, recallSum: recall,
    recall10Macro: recall / ranked, recall10Retrieved: retrieved, recall10KnownRelevant: relevant, intended, correctEmpty, unintended };
}
function validateMetricNumbers(actual, expected) {
  assert.equal(expected.queryCount, actual.queries); assert.equal(expected.rankingDenominator, actual.ranked);
  for (const key of ['top1', 'top3']) { assert.equal(expected[key].numerator, actual[key]); assert.equal(expected[key].denominator, actual.ranked); close(expected[key].value, actual[key] / actual.ranked); }
  close(expected.mrr.reciprocalRankSum, actual.reciprocalRankSum); close(expected.mrr.value, actual.mrr); assert.equal(expected.mrr.denominator, actual.ranked);
  close(expected.recall10Macro.recallSum, actual.recallSum); close(expected.recall10Macro.value, actual.recall10Macro); assert.equal(expected.recall10Macro.denominator, actual.ranked);
  assert.equal(expected.recall10Micro.numerator, actual.recall10Retrieved); assert.equal(expected.recall10Micro.denominator, actual.recall10KnownRelevant);
  close(expected.recall10Micro.value, actual.recall10Retrieved / actual.recall10KnownRelevant);
  assert.equal(expected.correctIntendedEmpty.numerator, actual.correctEmpty); assert.equal(expected.correctIntendedEmpty.denominator, actual.intended);
  close(expected.correctIntendedEmpty.value, actual.correctEmpty / actual.intended);
  assert.equal(expected.unintendedEmpty.numerator, actual.unintended); assert.equal(expected.unintendedEmpty.denominator, actual.ranked);
  close(expected.unintendedEmpty.value, actual.unintended / actual.ranked);
}
if (option('--relevance')) await check('independent primary relevance metric recalculation', async () => {
  const raw = await readJSON(option('--relevance')), summaries = [];
  for (const run of raw.comparisons) {
    const successful = run.queries.filter(row => row.status === 'success');
    const selected = RELEVANCE_JUDGMENTS.filter(row => successful.some(result => result.id === row.id));
    const recomputed = independentMetrics(selected, successful); validateMetricNumbers(recomputed, run.metrics);
    assert.equal(run.metrics.operationalErrorCount, 0);
    summaries.push({ configuration: run.configuration.id, ...recomputed, unsupported: run.queries.filter(row => row.status === 'not-comparable').length });
  }
  return { summaries, method: 'Original frozen acceptable labels and raw complete ranked IDs; separate reviewer aggregation without production scorer, oracle, calculateMetrics, or judgeRanking imports.' };
});
if (option('--comparison')) await check('independent comparator subset and metrics', async () => {
  const raw = await readJSON(option('--comparison')), eligible = [], unsupported = [], changed = [];
  assert.equal(raw.foreignIdentity.dependency, 'minisearch@7.2.0'); assert.equal(raw.foreignIdentity.revision, '5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb');
  for (const row of raw.rows) {
    if (!row.foreign) { unsupported.push(row.id); continue; }
    const native = row.native.hits.map(hit => hit.id), foreign = row.foreign.hits.map(hit => hit.id);
    assert.equal(native.length, row.native.total); assert.equal(foreign.length, row.foreign.total.value); assert.equal(row.foreign.total.relation, 'exact');
    const same = JSON.stringify([...native].sort()) === JSON.stringify([...foreign].sort()); assert.equal(row.sameMembers, same);
    if (same) { eligible.push(row); if (JSON.stringify(native) !== JSON.stringify(foreign)) changed.push(row.id); }
  }
  assert.equal(raw.summary.eligibilityComparable, eligible.length); assert.equal(raw.summary.rankOnlyChanged, changed.length); assert.deepEqual(raw.summary.unsupported, unsupported);
  const selected = RELEVANCE_JUDGMENTS.filter(row => eligible.some(result => result.id === row.id));
  const native = independentMetrics(selected, eligible.map(row => ({ id: row.id, ...row.native })));
  const foreign = independentMetrics(selected, eligible.map(row => ({ id: row.id, total: row.foreign.total.value, hits: row.foreign.hits })));
  validateMetricNumbers(native, raw.relevanceOnEqualMembershipSubset.native); validateMetricNumbers(foreign, raw.relevanceOnEqualMembershipSubset.foreign);
  return { eligibilityEquivalent: eligible.length, unsupported, changedOrder: changed, native, foreign,
    limit: 'Recalculates membership equivalence and relevance metrics from raw IDs; foreign/runtime source correctness remains separately declared and independently inspected. Models and mandatory output work differ.' };
});
if (option('--companion') && option('--comparison')) await check('live pinned foreign source identity', async () => {
  const foreignRoot = resolve(option('--companion')), raw = await readJSON(option('--comparison'));
  const git = arguments_ => execFileSync('git', ['-C', foreignRoot, ...arguments_], { encoding: 'utf8' }).trim();
  assert.equal(git(['rev-parse', 'HEAD']), raw.foreignIdentity.revision); assert.equal(git(['status', '--porcelain']), '');
  const dependency = await readJSON(join(foreignRoot, 'node_modules/minisearch/package.json'));
  assert.equal(dependency.version, '7.2.0');
  assert.equal(digest(await readFile(join(foreignRoot, 'dist/index.js'))), raw.foreignIdentity.companionEntrySha256);
  assert.equal(digest(await readFile(join(foreignRoot, 'node_modules/minisearch/dist/es/index.js'))), raw.foreignIdentity.minisearchEntrySha256);
  const files = git(['ls-files']).split('\n');
  const trackedSha256 = digest(JSON.stringify(await Promise.all(files.map(async path => [path, digest(await readFile(join(foreignRoot, path)))]))));
  assert.equal(trackedSha256, raw.provenance.beforeSha256); assert.equal(trackedSha256, raw.provenance.afterSha256);
  return { root: foreignRoot, revision: git(['rev-parse', 'HEAD']), dependency: dependency.name + '@' + dependency.version, trackedFiles: files.length, trackedSha256,
    method: 'Read-only current Git identity, installed version, actual two entrypoint hashes and independently recomputed complete tracked-file aggregate; no foreign execution or write.' };
});
if (option('--relevance')) await check('literal failure eligibility scan', async () => {
  const corpus = await readJSON(join(root, 'test/fixtures/relevance/corpus.json')), raw = await readJSON(option('--relevance'));
  const source = raw.comparisons.find(run => run.configuration.id === 'source');
  const tokens = value => [...value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)].map(match => match[0].normalize('NFKC').toLowerCase());
  const selected = RELEVANCE_JUDGMENTS.filter(row => row.category === 'natural-question' || ['analyzer-normalization', 'ranking-trace', 'execution-batch', 'execution-incremental'].includes(row.id));
  const observations = selected.map(judgment => {
    assert.equal(typeof judgment.query, 'string');
    const required = tokens(judgment.query);
    const ids = corpus.records.filter(record => required.every(term => ['title', 'body'].some(field => tokens(record.text[field]).includes(term)))).map(record => record.id).sort();
    const result = source.queries.find(row => row.id === judgment.id);
    assert.deepEqual(result.hits.map(hit => hit.id).sort(), ids); assert.equal(result.total, ids.length);
    return { id: judgment.id, rawTotal: result.total, acceptableEligible: judgment.acceptableIds.filter(id => ids.includes(id)), missingQueryTermsInMustFind: judgment.mustFindIds.map(id => {
      const record = corpus.records.find(row => row.id === id), present = new Set([...tokens(record.text.title), ...tokens(record.text.body)]);
      return { id, absent: required.filter(term => !present.has(term)) };
    }) };
  });
  return { cases: observations.length, observations, method: 'Separate simple original-source token/full-record scan for twelve visible failure queries; no production tokenizer/scorer or test oracle import. This checks eligibility and the literal vocabulary mismatch, not relevance-label completeness or score arithmetic.' };
});

await check('hand arithmetic fixture constants', async () => {
  const { handScores, multiFieldHandScores } = await import('../../test/fixtures/ranking/query.mjs');
  const idf = Math.log(8 / 5), red = idf * 88 / 73, car = idf * 44 / 53, body = Math.log(2);
  const single = { red: { a: red, b: idf }, car: { a: car, b: idf }, and: { a: red + car, b: 2 * idf }, alternatives: { a: red, b: idf } };
  const multiple = { red: { a: 2 * red, b: 2 * idf + body * 11 / 8 }, car: { a: 2 * car + body, b: 2 * idf },
    and: { a: 2 * (red + car) + body, b: 4 * idf + body * 11 / 8 }, alternatives: { a: 2 * red + body, b: 2 * idf + body * 11 / 8 } };
  let compared = 0, maxAbsoluteError = 0;
  for (const [actual, expected] of [[single, handScores], [multiple, multiFieldHandScores]]) for (const query of Object.keys(expected)) for (const id of Object.keys(expected[query])) {
    close(actual[query][id], expected[query][id]); compared++; maxAbsoluteError = Math.max(maxAbsoluteError, Math.abs(actual[query][id] - expected[query][id]));
  }
  return { compared, maxAbsoluteError, factors: ['ln(8/5)', '88/73', '44/53', 'ln(2)', '11/8'], limit: 'Independent rational reconstruction validates authored constants; it is separate from live native runtime correctness.' };
});
if (option('--correctness')) await check('captured public correctness replay and hand arithmetic', async () => {
  const raw = await readJSON(option('--correctness')); assert.equal(raw.status, 'Pass'); assert.equal(raw.seed, 1592606721);
  const expectedCounts = { queryComparisons: 345, mutationOperations: 75, mutationStates: 77, mutationComparisons: 1155, commits: 43, noops: 17, rejections: 15, phraseComparisons: 438, phraseParityComparisons: 288, handScoreAssertions: 10 };
  for (const [key, value] of Object.entries(expectedCounts)) assert.equal(raw[key], value);
  assert.equal(raw.commits + raw.noops + raw.rejections, raw.mutationOperations);
  close(raw.handArithmetic.initial.red.a, Math.log(8 / 5) * 88 / 73);
  close(raw.handArithmetic.initial.car.a, Math.log(8 / 5) * 44 / 53);
  close(raw.handArithmetic.postDelete.a, Math.log(6 / 5) * 220 / 169);
  close(raw.handArithmetic.postDelete.b, Math.log(6 / 5) * 110 / 101);
  return { consumer: raw.consumer, status: raw.status, ...expectedCounts, method: 'Captured producer replay outcome and loop accounting inspected; four printed scores independently recalculated. This is not a new independent replay of every producer comparison; reviewer literal runtime probes are separate.' };
});

await check('comparison preserves unsupported tokenless conjunction', async () => {
  const { companionQuery } = await import('../../bench/comparison-lib.mjs');
  assert.equal(companionQuery({ kind: 'and', children: [{ kind: 'text', text: '😀' }, { kind: 'eq', field: 'category', value: 'spec' }] }), null);
  assert.equal(companionQuery({ kind: 'and', children: [{ kind: 'phrase', text: '!!!' }, { kind: 'eq', field: 'category', value: 'spec' }] }), null);
  return { cases: 2, finding: 'Initial review reproduced dropped lexical child through object spread of null; current guard rejects unsupported complete conjunction.' };
});

if (option('--consumer')) await check('independent installed-public literal and rational runtime probes', async () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-'], { cwd: resolve(option('--consumer')), encoding: 'utf8', input: `
import assert from 'node:assert/strict';
import {createRaveldex} from '@vmitsaras/raveldex';
import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';
import {createPhrases} from '@vmitsaras/raveldex/addons/phrases/mixed';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12);
let numericAssertions=0,literalQueries=0;
const core=createRaveldex({schema:{text:{body:{}},metadata:{kind:{type:'string'}}}});
try{
  await core.addMany([{id:'a',text:{body:'red red car'},metadata:{kind:'guide'}},{id:'b',text:{body:'red car'},metadata:{kind:'news'}},{id:'c',text:{body:'blue'},metadata:{kind:'guide'}},{id:'empty',text:{body:''}}]);
  const result=await core.search('red car',{limit:100});assert.equal(result.total,2);assert.deepEqual(result.hits.map(h=>h.id),['a','b']);
  close(result.hits[0].score,Math.log(8/5)*(88/73+44/53));close(result.hits[1].score,2*Math.log(8/5));numericAssertions+=2;literalQueries++;
  const filtered=await core.search({kind:'and',children:[{kind:'text',text:'red car'},{kind:'eq',field:'kind',value:'guide'}]});assert.deepEqual(filtered.hits.map(h=>h.id),['a']);close(filtered.hits[0].score,result.hits[0].score);numericAssertions++;literalQueries++;
  await core.remove('c');const deleted=await core.search('red');const byId=Object.fromEntries(deleted.hits.map(h=>[h.id,h.score]));close(byId.a,Math.log(6/5)*220/169);close(byId.b,Math.log(6/5)*110/101);numericAssertions+=2;literalQueries++;
  await core.replace({id:'a',text:{body:'blue'}});const replaced=await core.search('red');assert.deepEqual(replaced.hits.map(h=>h.id),['b']);close(replaced.hits[0].score,Math.log(2)*22/25);numericAssertions++;literalQueries++;
  await core.replace({id:'a',text:{body:'😀!'}});const tokenless=await core.search('red');close(tokenless.hits[0].score,Math.log(4/3));numericAssertions++;literalQueries++;
  const before=await core.search({kind:'all'},{limit:100});await assert.rejects(core.addMany([{id:'fresh',text:{body:'green'}},{id:'b',text:{body:'duplicate'}}]),{code:'ID_EXISTS'});assert.deepEqual(await core.search({kind:'all'},{limit:100}),before);literalQueries++;
  await core.clear();assert.equal((await core.search({kind:'all'},{limit:0})).total,0);literalQueries++;
}finally{await core.dispose();}
const records=[{id:'adjacent',text:{title:'red blue',body:'echo echo'}},{id:'gap',text:{title:'red green blue',body:'echo x echo'}},{id:'split-value',text:{title:['red','blue'],body:'echo'}},{id:'split-field',text:{title:'red',body:'blue'}},{id:'normalization',text:{title:'café ﬁle',body:'½ 1/2'}},{id:'tokenless',text:{title:'😀!'}}];
const fields=['title','body'],configurations={source:[createSourceProvider({fields}),createSourcePhrases({fields})],positions:[createPositionProvider({fields,offsets:fields}),createPositionPhrases({fields})],mixed:[createSourceProvider({fields:['title']}),createPositionProvider({fields:['body'],offsets:['body']}),createPhrases({fields:{title:'source',body:'positions'}})]};
const phrase=text=>({kind:'extension',capability:'phrases',version:1,payload:{text}});let first;
for(const [name,addons] of Object.entries(configurations)){
  const engine=createRaveldex({schema:{text:{title:{boost:2},body:{}}},addons});
  try{
    await engine.addMany(records);const outcomes=[];
    for(const [text,wanted] of [['red blue',['adjacent']],['echo echo',['adjacent']],['café file',['normalization']],['½',['normalization']]]){const result=await engine.search(phrase(text),{limit:100});assert.deepEqual(result.hits.map(h=>h.id),wanted);assert.equal(result.total,wanted.length);outcomes.push(result);literalQueries++;}
    const zero=await engine.search(phrase('red blue'),{limit:0});assert.equal(zero.total,1);assert.deepEqual(zero.hits,[]);literalQueries++;
    const beyond=await engine.search(phrase('red blue'),{limit:1,offset:1});assert.equal(beyond.total,1);assert.deepEqual(beyond.hits,[]);literalQueries++;
    const ordinary=await engine.search('red blue',{limit:100});assert.deepEqual(ordinary.hits.map(h=>h.id).sort(),['adjacent','gap','split-field','split-value']);close(outcomes[0].hits[0].score,ordinary.hits.find(h=>h.id==='adjacent').score);numericAssertions++;literalQueries++;
    if(first)assert.deepEqual(outcomes,first);else first=outcomes;
  }finally{await engine.dispose();}
}
console.log(JSON.stringify({numericAssertions,literalQueries,phraseStrategies:Object.keys(configurations),method:'New reviewer literal records and expected IDs, rational hand arithmetic, public package imports only; no benchmark helpers or test oracle.'}));
` });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  return { consumer: resolve(option('--consumer')), ...JSON.parse(child.stdout) };
});

function literalCostRecords(size) {
  return Array.from({ length: size }, (_, index) => ({ id: 'item:' + String(index).padStart(5, '0'),
    text: { body: (index % 3 === 0 ? 'red blue' : 'red green blue') + ' echo echo value' + index % 37 }, metadata: { group: 'group' + index % 5 } }));
}
function verifyCostSamples(raw) {
  const groups = new Map(), rejections = [], uncertainOutcomes = [];
  for (const row of raw.observations) {
    assert.ok([100, 1000, 10000].includes(row.size)); assert.ok([0, 1, 2].includes(row.repetition));
    const records = literalCostRecords(row.size); assert.equal(digest(JSON.stringify(records)), row.corpusSha256);
    const totals = { 'common-exact-total-top20': row.size, 'selective-exact-total-top20': Math.floor((row.size - 8) / 37) + 1, 'strict-phrase-total-top20': Math.ceil(row.size / 3) };
    for (const sample of row.samples) {
      assert.ok(['Pass', 'Rejected', 'Not Applicable', 'Not run'].includes(sample.outcome));
      if (sample.outcome === 'Pass' || sample.outcome === 'Rejected') assert.ok(Number.isSafeInteger(sample.elapsedMs) && sample.elapsedMs >= 0);
      if (sample.outcome === 'Rejected') {
        if (sample.error.code === 'OUTCOME_UNKNOWN') {
          assert.equal(row.configuration, 'chrome-worker-source-phrase-indexeddb');
          assert.equal(sample.operation, 'loadSourceIndexedDB-including-restore');
          assert.equal(sample.error.name, 'IndexedDBAdapterError'); assert.equal(sample.error.details.phase, 'restore');
          assert.ok(sample.error.details.selectedGeneration); assert.ok(sample.error.details.operationId);
          assert.equal(sample.error.details.selectedGeneration, row.samples.find(candidate => candidate.operation === 'saveSourceIndexedDB-including-export').result.generation);
          uncertainOutcomes.push({ size: row.size, repetition: row.repetition, operation: sample.operation, details: sample.error.details,
            subsequentPriorStateObserved: sample.oldStatePreserved, limit: 'An uncertain restore boundary result. Subsequent complete prior result/revision was observed; this does not retrospectively make the original load a confirmed rejection or successful restore.' });
        } else assert.ok(['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED'].includes(sample.error.code), JSON.stringify(sample.error));
        if (sample.operation.startsWith('restore') || sample.operation.startsWith('load')) assert.equal(sample.oldStatePreserved, true);
        rejections.push({ configuration: row.configuration, size: row.size, repetition: row.repetition, operation: sample.operation, code: sample.error.code, oldStatePreserved: sample.oldStatePreserved });
      }
      if (sample.outcome === 'Pass' && Object.hasOwn(totals, sample.operation)) {
        assert.equal(sample.result.total, totals[sample.operation]); assert.equal(sample.result.returned, Math.min(20, totals[sample.operation]));
        assert.equal(sample.result.revision, Math.ceil(row.size / 256)); assert.equal(new Set(sample.result.ids).size, sample.result.returned);
        for (const id of sample.result.ids) {
          const index = Number(id.slice(5)); assert.ok(index >= 0 && index < row.size); assert.equal(id, 'item:' + String(index).padStart(5, '0'));
          if (sample.operation === 'selective-exact-total-top20') assert.equal(index % 37, 7);
          if (sample.operation === 'strict-phrase-total-top20') assert.equal(index % 3, 0);
        }
      }
      const key = JSON.stringify([row.configuration, row.size, sample.operation, sample.phase ?? null]);
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(sample);
    }
    if (row.updateVerification) { assert.equal(row.updateVerification.total, totals['selective-exact-total-top20'] + 1); assert.equal(row.updateVerification.revision, Math.ceil(row.size / 256) + 1); }
    if (row.storeCountsAfterSave) assert.deepEqual(row.storeCountsAfterSave, { snapshots: 1, metadata: 1 });
    if (row.storeCountsAfterErase) assert.ok(Object.values(row.storeCountsAfterErase).every(count => count === 0));
  }
  assert.equal(groups.size, raw.summaries.length);
  for (const summary of raw.summaries) {
    const samples = groups.get(JSON.stringify([summary.configuration, summary.size, summary.operation, summary.phase ?? null])); assert.ok(samples);
    const elapsed = samples.filter(sample => sample.outcome === 'Pass').map(sample => sample.elapsedMs).sort((a, b) => a - b);
    assert.equal(summary.attempts, samples.length); assert.equal(summary.successes, elapsed.length);
    for (const [status, key] of [['Rejected', 'rejections'], ['Not Applicable', 'notApplicable'], ['Not run', 'notRun']]) assert.equal(summary[key], samples.filter(sample => sample.outcome === status).length);
    const middle = Math.floor(elapsed.length / 2), median = elapsed.length ? Math.ceil(elapsed.length % 2 ? elapsed[middle] : (elapsed[middle - 1] + elapsed[middle]) / 2) : null;
    assert.equal(summary.medianMs, median); assert.equal(summary.observedMaximumMs, elapsed.length ? elapsed.at(-1) : null);
  }
  return { ownerRows: raw.observations.length, summarizedGroups: groups.size, rejections, uncertainOutcomes };
}
if (option('--costs')) await check('independent Node cost sample and work review', async () => {
  const raw = await readJSON(option('--costs')), samples = verifyCostSamples(raw);
  assert.equal(raw.observations.length, 27); assert.equal(raw.diagnostics.length, 9);
  for (const row of raw.harness) assert.equal(digest(await readFile(join(root, row.path))), row.sha256, 'Current accepted scoped-repeat harness identity');
  let provenance;
  if (raw.sampleProvenance) {
    assert.equal(raw.method.acceptedSourcePasses, 2);
    const initialPath = option('--initial-costs') ?? raw.sampleProvenance.initial.path;
    const repeatedPath = option('--repeat-costs') ?? raw.sampleProvenance.replacement.path;
    const initialBytes = await readFile(initialPath), repeatedBytes = await readFile(repeatedPath);
    assert.equal(digest(initialBytes), raw.sampleProvenance.initial.sha256); assert.equal(digest(repeatedBytes), raw.sampleProvenance.replacement.sha256);
    const initial = JSON.parse(initialBytes), repeated = JSON.parse(repeatedBytes);
    if (option('--unrepaired-costs')) {
      const original = await readJSON(option('--unrepaired-costs'));
      for (const key of ['observations', 'diagnostics', 'summaries', 'bundleGraphs', 'method', 'environment', 'configurations']) assert.deepEqual(initial[key], original[key]);
    }
    let initialRows = 0, repeatedRows = 0;
    for (const row of raw.observations) {
      const { sourcePass, ...actual } = row;
      const smallCore = row.configuration === 'core-only' && [100, 1000].includes(row.size);
      const input = smallCore ? repeated : initial;
      const expected = input.observations.find(candidate => candidate.configuration === row.configuration && candidate.size === row.size && candidate.repetition === row.repetition);
      assert.deepEqual(actual, expected);
      assert.equal(sourcePass, smallCore ? 'isolated-small-core-repeat' : 'initial-default');
      smallCore ? repeatedRows++ : initialRows++;
    }
    assert.equal(initialRows, 21); assert.equal(repeatedRows, 6);
    assert.deepEqual(raw.bundleGraphs, repeated.bundleGraphs);
    for (const row of raw.diagnostics) {
      const input = row.configuration === 'core-only' && [100, 1000].includes(row.size) ? repeated : initial;
      assert.deepEqual(row, input.diagnostics.find(candidate => candidate.configuration === row.configuration && candidate.size === row.size));
    }
    provenance = { initialPath, initialSha256: digest(initialBytes), repeatedPath, repeatedSha256: digest(repeatedBytes), acceptedInitialOwners: initialRows, acceptedRepeatedOwners: repeatedRows,
      initialExcludedOwners: initial.observations.length - initialRows, graphs: 'Current scoped repeat; directly verified complete graph object identity.' };
  }
  for (const row of raw.diagnostics) {
    const records = literalCostRecords(row.size), originalCodeUnits = records.reduce((sum, record) => sum + record.text.body.length, 0);
    const tokens = 6 * row.size - Math.ceil(row.size / 3), postings = 5 * row.size - Math.ceil(row.size / 3);
    assert.equal(row.retainedLogicalCounts.documents, row.size);
    assert.equal(row.retainedLogicalCounts.textCodeUnits, originalCodeUnits);
    assert.equal(row.retainedLogicalCounts.tokens, tokens);
    assert.equal(row.retainedLogicalCounts.postingEntries, postings);
    assert.equal(row.retainedLogicalCounts.dictionaryEntries, 41);
    if (row.configuration === 'core-only') assert.deepEqual(row.retainedLogicalCounts.participants, {});
    if (row.configuration === 'source-phrase') {
      const source = row.retainedLogicalCounts.participants.source;
      assert.equal(source.retainedEntries, 3 * row.size); assert.equal(source.textCodeUnits, originalCodeUnits);
    }
    if (row.configuration === 'positions-offsets') {
      const position = row.retainedLogicalCounts.participants.positions;
      assert.equal(position.occurrenceCount, tokens); assert.equal(position.offsetCount, tokens); assert.equal(position.termEntries, postings);
      assert.equal(position.retainedEntries, 3 * row.size + postings + 3 * tokens);
      assert.equal(position.termCodeUnits, records.reduce((sum, record) => sum + [...new Set(record.text.body.split(' '))].reduce((count, term) => count + term.length, 0), 0));
    }
    for (const operation of row.operations) {
      assert.ok(Number.isSafeInteger(operation.emittedWorkUnits) && operation.emittedWorkUnits > 0);
      assert.ok(Number.isSafeInteger(operation.emittedSteps) && operation.emittedSteps > 0);
      assert.ok(operation.maxEmittedStepWorkUnits <= operation.emittedWorkUnits);
      if (operation.outcome === 'Rejected') { assert.ok(['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED'].includes(operation.error.code)); assert.equal(operation.oldRootPreserved, true); }
    }
  }
  const graphs = [];
  for (const [name, graph] of Object.entries(raw.bundleGraphs.graphs)) {
    if (!graph.inputs) continue;
    for (const input of graph.inputs) {
      if (input.path.startsWith('node_modules/')) assert.equal(digest(await readFile(join(raw.installedDirectory, input.path))), input.sha256);
      if (name === 'core') assert.ok(!/\/addons\/|\/adapters\/|\/integrations\//.test(input.path));
    }
    graphs.push({ name, selectedPublicImports: graph.selectedPublicImports, minifiedBytes: graph.minifiedBytes, gzipBytes: graph.gzipBytes, inputs: graph.inputs.length });
  }
  return { ...samples, diagnosticRows: raw.diagnostics.length, graphs, provenance, method: 'Independent ASCII workload identities and algebraic totals/counts, raw grouping/whole-ms median/max recalculation, typed refusal and prior-state checks. Composite source artifacts and every accepted raw row/diagnostic/graph provenance compared directly. Every installed graph module hash is re-read; namespace generation and recorded bundler/gzip method are statically reviewed. Emitted generator counters are observed instrumentation inspected separately, not independently reproduced work-v1 arithmetic or memory bytes.' };
});
function documentTables(markdown) {
  const groups = []; let active;
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) { active = undefined; continue; }
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (!active) { active = { header: cells, rows: [] }; groups.push(active); }
    else if (!cells.every(cell => /^:?-+:?$/.test(cell))) active.rows.push(cells);
  }
  return groups;
}
if (option('--costs')) await check('published Node cost tables match accepted raw evidence', async () => {
  const path = option('--evaluation-doc') ?? join(root, 'docs/evaluation/RX-4001.md');
  const text = await readFile(path, 'utf8'), tables = documentTables(text), raw = await readJSON(option('--costs'));
  const configuration = { Core: 'core-only', 'Source phrase': 'source-phrase', 'Positions and offsets': 'positions-offsets' };
  const number = cell => Number(cell.replaceAll(',', ''));
  let checkedCells = 0;
  const timingCell = (cell, id, size, operation, phase = null) => {
    const summary = raw.summaries.find(row => row.configuration === id && row.size === size && row.operation === operation && row.phase === phase);
    if (cell === 'Omitted') assert.ok(!summary || summary.notApplicable === summary.attempts);
    else if (cell.endsWith(' refused')) {
      const [rejections, attempts] = cell.split(' ')[0].split('/').map(Number);
      assert.equal(summary.rejections, rejections); assert.equal(summary.attempts, attempts); assert.equal(summary.successes, 0);
    } else {
      assert.ok(summary); const [median, maximum] = cell.split('/').map(number);
      assert.equal(median, summary.medianMs); assert.equal(maximum, summary.observedMaximumMs);
    }
    checkedCells++;
  };
  const timing = tables.find(table => table.header[2] === 'Batched build'); assert.equal(timing.rows.length, 9);
  for (const [label, count, ...cells] of timing.rows) {
    const id = configuration[label], size = number(count); assert.ok(id);
    for (const [index, operation, phase] of [[0, 'build-admitted-batches', null], [1, 'common-exact-total-top20', 'warm-query'], [2, 'selective-exact-total-top20', 'warm-query'], [3, 'strict-phrase-total-top20', id === 'core-only' ? null : 'warm-query'], [4, 'replace-one-record', null]]) timingCell(cells[index], id, size, operation, phase);
  }
  const snapshots = tables.find(table => table.header[2] === 'Native export'); assert.equal(snapshots.rows.length, 6);
  for (const [label, count, ...cells] of snapshots.rows) for (const [index, operation] of ['exportNative', 'restoreNative', 'exportSource', 'restoreSource'].entries()) timingCell(cells[index], configuration[label], number(count), operation);
  const work = tables.find(table => table.header[0] === 'Untimed emitted work at 10,000 records'); assert.equal(work.rows.length, 5);
  const operations = ['build-admitted-batches', 'common-exact-total-top20', 'selective-exact-total-top20', 'strict-phrase-total-top20', 'replace-one-record'];
  for (const [index, row] of work.rows.entries()) for (const [column, id] of ['core-only', 'source-phrase', 'positions-offsets'].entries()) {
    const operation = raw.diagnostics.find(diagnostic => diagnostic.configuration === id && diagnostic.size === 10000).operations.find(operation => operation.operation === operations[index]);
    if (row[column + 1] === 'Omitted') assert.equal(operation, undefined); else assert.equal(number(row[column + 1]), operation.emittedWorkUnits);
    checkedCells++;
  }
  const graphNames = ['core', 'sourcePhrase', 'positionsOffsets', 'sourceSnapshots', 'positionSnapshots', 'ui', 'uiCSS', 'workerClient', 'workerHost', 'storage', 'workerStorageClient', 'workerStorageHost'];
  const graphs = tables.find(table => table.header[0] === 'Selected graph'); assert.equal(graphs.rows.length, 12);
  for (const [index, row] of graphs.rows.entries()) {
    const graph = raw.bundleGraphs.graphs[graphNames[index]];
    assert.equal(number(row[1]), graph.minifiedBytes ?? graph.rawBytes); assert.equal(number(row[2]), graph.gzipBytes); checkedCells += 2;
  }
  assert.ok(graphs.rows[8][0].includes('core included'));
  assert.ok(graphs.rows[10][0].includes('IndexedDB/source phrase registration'));
  return { path, tables: 4, checkedCells, method: 'Printed whole-ms medians/tails, omissions/refusals, emitted counters and all twelve selected graph byte pairs compared directly with accepted raw evidence. Labels checked against selected import scope; no benchmark formatter imported.' };
});
if (option('--browser-costs')) await check('independent browser cost sample and graph review', async () => {
  const raw = await readJSON(option('--browser-costs')), samples = verifyCostSamples(raw);
  assert.equal(raw.observations.length, 9); assert.ok(raw.finishedAt);
  const graphs = [];
  for (const [name, graph] of Object.entries(raw.graphs.measurements)) {
    const bytes = await readFile(join(raw.installedDirectory, name)); assert.equal(bytes.length, graph.minifiedBytes); assert.equal(digest(bytes), graph.sha256);
    assert.equal(gzipSync(bytes, { level: 9, windowBits: 15, memLevel: 8, strategy: 0 }).length, graph.gzipBytes);
    for (const input of graph.inputs) assert.equal(digest(await readFile(join(raw.installedDirectory, input.path))), input.sha256);
    graphs.push({ name, minifiedBytes: bytes.length, gzipBytes: graph.gzipBytes, sha256: digest(bytes) });
  }
  return { ...samples, browser: raw.environment.browser, graphs,
    method: 'Raw captured public browser calls recalculated without rerunning browser producer; independent stored application bundle byte/hash/gzip and all graph input identities identify actual staged execution kernels. The current outer browser wrapper identity is separately captured as a candidate file, without a claim of contemporaneous launch capture. Browser work counters and physical memory are explicitly unmeasured.' };
});
if (option('--browser-costs')) await check('published browser tables match completed raw evidence', async () => {
  const path = option('--evaluation-doc') ?? join(root, 'docs/evaluation/RX-4001.md');
  const tables = documentTables(await readFile(path, 'utf8')), raw = await readJSON(option('--browser-costs'));
  const number = cell => Number(cell.replaceAll(',', '')); let checkedCells = 0;
  const first = tables.find(table => table.header[0] === 'Records' && table.header[1] === 'Batched build');
  const second = tables.find(table => table.header[0] === 'Records' && table.header[1] === 'Source export');
  for (const [table, operations] of [[first, ['build-admitted-batches', 'common-exact-total-top20', 'selective-exact-total-top20', 'strict-phrase-total-top20', 'replace-one-record']],
    [second, ['exportSource', 'restoreSource', 'saveSourceIndexedDB-including-export', 'loadSourceIndexedDB-including-restore', 'eraseIndexedDB']]]) {
    assert.equal(table.rows.length, 3);
    for (const [count, ...cells] of table.rows) for (const [index, operation] of operations.entries()) {
      const size = number(count), phase = operation.includes('top20') ? 'warm-query' : null;
      const summary = raw.summaries.find(row => row.size === size && row.operation === operation && row.phase === phase); assert.ok(summary);
      if (cells[index] === '3/3 deadline refusals') {
        assert.equal(summary.rejections, 3); assert.equal(summary.successes, 0);
        assert.ok(raw.observations.filter(row => row.size === size).every(row => row.samples.find(sample => sample.operation === operation).error.code === 'DEADLINE_EXCEEDED'));
      } else if (cells[index] === '2 deadlines, 1 unknown') {
        assert.equal(summary.rejections, 3); assert.equal(summary.successes, 0);
        const codes = raw.observations.filter(row => row.size === size).map(row => row.samples.find(sample => sample.operation === operation).error.code).sort();
        assert.deepEqual(codes, ['DEADLINE_EXCEEDED', 'DEADLINE_EXCEEDED', 'OUTCOME_UNKNOWN']);
      } else {
        const [median, maximum] = cells[index].split('/').map(number);
        assert.equal(median, summary.medianMs); assert.equal(maximum, summary.observedMaximumMs);
      }
      checkedCells++;
    }
  }
  return { path, tables: 2, checkedCells, method: 'Every printed browser timing/refusal/uncertainty cell directly compared with completed captured samples and independently recalculated summaries.' };
});
if (option('--package') && option('--consumer')) await check('runtime/public contract and installed package coherence', async () => {
  const current = await readJSON(join(root, 'package.json'));
  const baseline = JSON.parse(execFileSync('git', ['show', acceptedBaseline + ':package.json'], { cwd: root, encoding: 'utf8' }));
  const installed = await readJSON(join(resolve(option('--consumer')), 'node_modules/@vmitsaras/raveldex/package.json'));
  assert.deepEqual(current.exports, baseline.exports); assert.deepEqual(installed.exports, current.exports);
  assert.deepEqual(current.dependencies ?? {}, {}); assert.deepEqual(installed.dependencies ?? {}, {});
  assert.deepEqual(current.devDependencies, baseline.devDependencies);
  const raw = await readJSON(option('--package'));
  assert.equal(raw.package.name, installed.name); assert.equal(raw.package.version, installed.version);
  assert.equal(raw.core.targetGzipBytes, 15360); assert.equal(raw.core.gzipBytes, 16829); assert.equal(raw.core.targetMet, false);
  assert.equal(raw.core.method.esbuild, '0.28.2');
  assert.ok(raw.core.inputs.every(input => !/\/addons\/|\/adapters\/|\/integrations\//.test(input.path)));
  assert.deepEqual(raw.startup.reads, []);
  const tarballs = (await readdir(resolve(option('--consumer')))).filter(path => path.endsWith('.tgz')); assert.equal(tarballs.length, 1);
  const tarball = await readFile(join(resolve(option('--consumer')), tarballs[0]));
  assert.equal(digest(tarball), raw.package.sha256); assert.equal(tarball.length, raw.package.tarballBytes);
  assert.equal('sha512-' + createHash('sha512').update(tarball).digest('base64'), raw.package.npmIntegrity);
  const bundle = await readFile(join(resolve(option('--consumer')), 'core-bundle.mjs'));
  const compressed = gzipSync(bundle, { level: 9, windowBits: 15, memLevel: 8, strategy: 0 });
  assert.equal(bundle.length, raw.core.minifiedBytes); assert.equal(digest(bundle), raw.core.sha256);
  assert.equal(compressed.length, raw.core.gzipBytes); assert.equal(digest(compressed), raw.core.gzipSha256);
  return { packageName: installed.name, version: installed.version, runtimeDependencies: {}, exportsUnchanged: true, devPinsUnchanged: true,
    nativeTarballSha256: raw.package.sha256, minifiedBytes: raw.core.minifiedBytes, gzipBytes: raw.core.gzipBytes, targetGzipBytes: 15360,
    targetMissBytes: raw.core.gzipBytes - 15360, method: 'Current/baseline/installed package public maps and zero runtime dependencies compared directly; installed graph/startup capture and unchanged target miss inspected, without inferring memory or physical startup guarantees.' };
});
if (option('--package-final') && option('--consumer')) await check('independent complete fresh/current/measured runtime identity', async () => {
  const final = await readJSON(option('--package-final')), primary = await readJSON(option('--package'));
  const old = join(resolve(option('--consumer')), 'node_modules/@vmitsaras/raveldex'), fresh = join(final.consumer, 'node_modules/@vmitsaras/raveldex');
  async function inventory(directory, prefix = '') {
    const entries = await readdir(join(directory, prefix), { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? inventory(directory, join(prefix, entry.name)) : [join(prefix, entry.name)]))).flat().sort();
  }
  const paths = await inventory(join(root, 'dist')); assert.equal(paths.length, 208);
  assert.deepEqual(await inventory(join(old, 'dist')), paths); assert.deepEqual(await inventory(join(fresh, 'dist')), paths);
  const identities = await Promise.all(paths.map(async path => {
    const current = await readFile(join(root, 'dist', path));
    assert.deepEqual(await readFile(join(old, 'dist', path)), current); assert.deepEqual(await readFile(join(fresh, 'dist', path)), current);
    return { path: 'dist/' + path, bytes: current.length, sha256: digest(current) };
  }));
  assert.deepEqual(await readJSON(join(fresh, 'package.json')), await readJSON(join(root, 'package.json')));
  for (const path of ['README.md', 'LICENSE']) assert.deepEqual(await readFile(join(fresh, path)), await readFile(join(root, path)));
  assert.equal(final.core.sha256, primary.core.sha256); assert.equal(final.core.gzipSha256, primary.core.gzipSha256); assert.deepEqual(final.startup.reads, []);
  const tarballName = (await readdir(final.consumer)).find(path => path.endsWith('.tgz'));
  const tarball = await readFile(join(final.consumer, tarballName)); assert.equal(tarball.length, final.package.tarballBytes); assert.equal(digest(tarball), final.package.sha256);
  return { matchedRuntimeFiles: paths.length, primaryConsumer: resolve(option('--consumer')), freshConsumer: final.consumer,
    finalTarballSha256: digest(tarball), runtimeIdentities: identities,
    method: 'Separate reviewer directory inventory, byte equality and SHA-256 across every current/measured/fresh production JS/declaration/CSS/notice file, fresh metadata/README/LICENSE and tarball identity; no package-audit helper imported. Audited producer identity script was also rerun separately. No new timing or cross-host claim.' };
});
if (option('--final-check')) await check('captured complete project gate', async () => {
  const log = await readFile(option('--final-check'), 'utf8');
  const counts = label => [...log.matchAll(new RegExp('^ℹ ' + label + ' (\\d+)$', 'gm'))].map(match => Number(match[1]));
  assert.deepEqual(counts('tests'), [472, 15, 24, 26, 1]); assert.deepEqual(counts('pass'), counts('tests'));
  for (const label of ['fail', 'cancelled', 'skipped']) assert.deepEqual(counts(label), [0, 0, 0, 0, 0]);
  return { path: option('--final-check'), tests: 538, failed: 0, cancelled: 0, skipped: 0,
    method: 'Captured final npm run check log independently inspected and all five suite accounting blocks checked. Parent execution exited0; reviewer did not rerun the complete gate or classify source inspection as runtime tests.' };
});
if ((option('--first-cost-entry') && option('--first-cost-common')) || option('--initial-costs')) await check('initial staged versus current measurement kernels', async () => {
  let initialEntry, initialCommon, initialSource;
  if (option('--first-cost-entry') && option('--first-cost-common')) {
    initialEntry = await readFile(option('--first-cost-entry'), 'utf8'); initialCommon = await readFile(option('--first-cost-common'));
    initialSource = 'Actual saved contemporaneously staged files read directly.';
  } else {
    const initial = await readJSON(option('--initial-costs'));
    const entry = initial.executedHarnessSources.find(row => row.path === 'bench/cost-node-entry.mjs');
    const common = initial.executedHarnessSources.find(row => row.path === 'bench/cost-common.mjs');
    initialEntry = entry.sourceCode; initialCommon = Buffer.from(common.sourceCode);
    assert.equal(digest(initialEntry), entry.sha256); assert.equal(digest(initialCommon), common.sha256);
    initialSource = 'Preserved exact staged-kernel source bytes in durable initial raw artifact. Their identities were also directly checked against the contemporaneous staged files during review.';
  }
  const currentEntry = await readFile(join(root, 'bench/cost-node-entry.mjs'), 'utf8'), currentCommon = await readFile(join(root, 'bench/cost-common.mjs'));
  assert.equal(digest(initialCommon), digest(currentCommon));
  let normalized = currentEntry
    .replace(/^const selectedModes = .*\nconst selectedSizes = .*\nassert\.ok\(selectedModes.*\nassert\.ok\(selectedSizes.*\n/m, '')
    .replaceAll('configurations.filter(row => selectedModes.includes(row.id))) for (const size of selectedSizes)', 'configurations) for (const size of METHOD.sizes)')
    .replace('method: { ...METHOD, selectedModes, selectedSizes, timing:', 'method: { ...METHOD, timing:');
  assert.equal(normalized, initialEntry);
  return { actualInitialStagedEntrySha256: digest(initialEntry), actualInitialStagedCommonSha256: digest(initialCommon), currentEntrySha256: digest(currentEntry),
    initialSource, kernelsUnchanged: true, delta: 'Four scoped selection-control declarations, two selected loops and selectedModes/selectedSizes report metadata only.',
    limit: 'Confirms saved staged-byte identities and current kernel equivalence. An initial wrapper reconstructed after launch remains reconstruction evidence, not a contemporaneous launch-time file hash. The final composite must disclose which observations came from the initial versus scoped repeat runs.' };
});

async function filesUnder(directory) { const rows = await readdir(join(root, directory), { withFileTypes: true }); return (await Promise.all(rows.map(row => row.isDirectory() ? filesUnder(join(directory, row.name)) : [join(directory, row.name)]))).flat(); }
report.git = { acceptedBaseline: execFileSync('git', ['rev-parse', acceptedBaseline], { cwd: root, encoding: 'utf8' }).trim(),
  inspectedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() };
const candidatePaths = [...await filesUnder('bench'), ...await filesUnder('test/comparison'), ...await filesUnder('test/fixtures/relevance'), ...await filesUnder('docs/evaluation'),
  'scripts/evaluation-consumer.mjs', 'scripts/evaluate-correctness.mjs', 'scripts/evaluate-comparison.mjs', 'package.json', 'README.md', 'CHANGELOG.md', 'docs/evidence/RX-4001-review-probe.mjs',
  'docs/evidence/RX-4001-package-audit.mjs', 'docs/evidence/RX-4001-package-audit.json'];
for (const name of ['correctness', 'relevance', 'comparison', 'costs', 'browser-costs', 'package', 'package-final', 'final-check', 'first-cost-entry', 'first-cost-common', 'initial-costs', 'repeat-costs', 'unrepaired-costs']) if (option('--' + name)) candidatePaths.push(resolve(option('--' + name)));
report.candidateFiles = await Promise.all(candidatePaths.map(async path => ({ path, sha256: digest(await readFile(resolve(root, path))) })));
report.productionChanges = execFileSync('git', ['diff', acceptedBaseline, '--name-only', '--', 'src', 'package-lock.json'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
assert.deepEqual(report.productionChanges, []);
const output = option('--output') ?? join(root, 'docs/evidence/RX-4001-review-probe.json');
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, checks: report.checks.map(row => [row.name, row.status]), productionChanges: report.productionChanges }));
