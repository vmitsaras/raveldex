import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRaveldex } from '@vmitsaras/raveldex';
import { convertLocalSearchSnapshot } from '@vmitsaras/raveldex/integrations/localsearch';
import { createCompanionComparator, COMPANION_IDENTITY } from '../../integrations/minisearch/companion-comparator.mjs';
import { companionOptions, companionRecords, sharedQueries, rankOptions, rankRecords } from '../migration/fixtures/records.mjs';
import { migrationConfiguration, addConvertedRecords } from '../migration/native-configuration.mjs';
const repository = process.argv[2]; if (!repository) throw Error('Usage: node test/comparison/run-companion.mjs <explicit companion repository> [report.json]');
const root = resolve(repository), reportPath = resolve(process.argv[3] ?? '/tmp/raveldex-rx3004-comparison.json');
const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
assert.equal(git(['rev-parse', 'HEAD']), COMPANION_IDENTITY.revision); assert.equal(git(['status', '--porcelain']), '');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const companionMetadata = JSON.parse(await readFile(join(root, 'package.json'))); assert.equal(companionMetadata.dependencies.minisearch, '7.2.0');
const minisearchMetadata = JSON.parse(await readFile(join(root, 'node_modules/minisearch/package.json'))); assert.equal(minisearchMetadata.version, '7.2.0');
const { createLocalSearch } = await import(pathToFileURL(join(root, 'dist/index.js')).href);
const injection = { createLocalSearch, identity: COMPANION_IDENTITY };
const fixture = name => readFile(new URL('../migration/fixtures/' + name + '.json', import.meta.url)).then(bytes => new Uint8Array(bytes));
const provenance = JSON.parse(await readFile(new URL('../migration/fixtures/provenance.json', import.meta.url)));
const report = { kind: 'raveldex-foreign-companion-comparison-v1', command: 'node test/comparison/run-companion.mjs <explicit companion repository> [report.json]',
  environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode },
  producer: { repository: provenance.producer.repository, revision: git(['rev-parse', 'HEAD']), clean: true, package: companionMetadata.name, dependency: minisearchMetadata.name + '@' + minisearchMetadata.version,
    distEntrySha256: sha256(await readFile(join(root, 'dist/index.js'))), minisearchEntrySha256: sha256(await readFile(join(root, 'node_modules/minisearch/dist/es/index.js'))) },
  shared: [], expectedSemanticChanges: [], ranks: [], historicalPreservation: {}, statuses: [] };
for (const [fixtureName, options, records] of [['representative', companionOptions, companionRecords], ['ranking', rankOptions, rankRecords]]) {
  const plan = await convertLocalSearchSnapshot(await fixture(fixtureName));
  const native = createRaveldex(migrationConfiguration(plan)); await addConvertedRecords(native, plan.records);
  const foreign = await createCompanionComparator(injection, options, records); report.limitations = foreign.limitations;
  try {
    if (fixtureName === 'representative') {
      for (const row of sharedQueries) {
        const legacy = await foreign.search({ ...row.legacy, limit: 100 }), current = await native.search(row.native, { limit: 100 });
        assert.deepEqual(legacy.hits.map(hit => hit.id).sort(), row.ids, `independent companion membership ${row.label}`);
        assert.deepEqual(current.hits.map(hit => hit.id).sort(), row.ids, `independent native membership ${row.label}`);
        assert.equal(legacy.total.value, row.ids.length); assert.equal(current.total, row.ids.length);
        report.shared.push({ label: row.label, independentlyExpectedIds: row.ids, legacy, native: current, membership: 'Pass', ranking: 'Compared as different models; no cross-model equality requirement.' });
      }
      const legacy = await foreign.search({ kind: 'text', value: 'file car', limit: 100 }), current = await native.search('file car', { limit: 100 });
      assert.deepEqual(legacy.hits.map(hit => hit.id), []); assert.deepEqual(current.hits.map(hit => hit.id), ['unicode']);
      report.expectedSemanticChanges.push({ branch: 'Native NFKC folds fullwidth CAR and fi ligature; companion NFC retains those compatibility forms.', legacy, native: current, status: 'Pass' });
      const explanation = await foreign.explain({ kind: 'text', value: 'red' }, 'a');
      assert.deepEqual(explanation.scoreDecomposition, { status: 'unavailable', reason: 'upstream-not-exposed' }); assert.equal(explanation.scoreModel, COMPANION_IDENTITY.scoreModel);
      report.foreignExplanation = explanation;
      const control = new AbortController(); control.abort();
      await assert.rejects(foreign.search({ kind: 'all' }, { signal: control.signal }), { code: 'LS_CANCELLED' });
      report.foreignCancellation = { preAbortedPublicSignal: 'Pass', synchronousMiniSearchInterruption: 'Unsupported; not tested as native cooperative behavior' };
    }
    for (const text of ['red', 'red blue', 'car']) {
      const legacy = await foreign.search({ kind: 'text', value: text, combine: 'any', limit: 100 }), current = await native.search({ kind: 'text', text, operator: 'or' }, { limit: 100 });
      // Membership parity is checked independently above. These are actual model observations, not a relevance oracle.
      const expectedMembers = fixtureName === 'representative' ? ({ red: { foreign: ['a', 'b', 'd'], native: ['a', 'b', 'd'] }, 'red blue': { foreign: ['a', 'b', 'c', 'd'], native: ['a', 'b', 'c', 'd'] }, car: { foreign: ['a', 'b', 'd'], native: ['a', 'b', 'd', 'unicode'] } })[text] : ({ red: { foreign: ['four', 'one', 'three', 'two'], native: ['four', 'one', 'three', 'two'] }, 'red blue': { foreign: ['four', 'one', 'three', 'two'], native: ['four', 'one', 'three', 'two'] }, car: { foreign: ['four'], native: ['four'] } })[text];
      assert.deepEqual(legacy.hits.map(hit => hit.id).sort(), expectedMembers.foreign, 'literal foreign rank-case membership');
      assert.deepEqual(current.hits.map(hit => hit.id).sort(), expectedMembers.native, 'literal native rank-case membership');
      const memberSetEqual = legacy.hits.map(hit => hit.id).sort().join(',') === current.hits.map(hit => hit.id).sort().join(',');
      const changedOrder = legacy.hits.map(hit => hit.id).join(',') !== current.hits.map(hit => hit.id).join(',');
      report.ranks.push({ fixture: fixtureName, text, independentlyExpectedMembers: expectedMembers, memberSetEqual, classification: memberSetEqual ? 'ranking-only different models' : 'explicit representative/car native unicode member from NFKC', foreignModel: legacy.scoreModel, nativeModel: current.model,
        foreign: legacy.hits.map(({ id, score }) => ({ id, score })), native: current.hits, changedOrder, rankingOnlyChange: memberSetEqual && changedOrder });
    }
  } finally { await Promise.all([native.dispose(), foreign.destroy()]); }
}
assert.ok(report.ranks.some(row => row.rankingOnlyChange), 'corpus must expose an actual expected ranking difference');
const preservation = [];
for (const row of provenance.historicalEvidence) { const actual = sha256(await readFile(join(root, row.path))); assert.equal(actual, row.sha256); preservation.push({ path: row.path, sha256: actual }); }
assert.equal(git(['status', '--porcelain']), ''); assert.equal(git(['rev-parse', 'HEAD']), COMPANION_IDENTITY.revision);
report.historicalPreservation = { status: 'Pass', comparison: 'Byte SHA256 for every fixture-generation baseline tracked docs/verification file before/after; foreign repository clean and commit unchanged.', files: preservation };
report.statuses = [{ name: 'shared independently literal memberships', status: 'Pass', count: report.shared.length }, { name: 'expected native normalization changes', status: 'Pass', count: report.expectedSemanticChanges.length },
  { name: 'foreign rank model separation', status: 'Pass', rankingOnlyChangedOrders: report.ranks.filter(row => row.rankingOnlyChange).length, expectedMembershipChanges: report.ranks.filter(row => !row.memberSetEqual).length }, { name: 'foreign numerical explanation honesty', status: 'Pass' }, { name: 'historical evidence preservation', status: 'Pass', files: preservation.length }];
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ reportPath, statuses: report.statuses, ranks: report.ranks }));
