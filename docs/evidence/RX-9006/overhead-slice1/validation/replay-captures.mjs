// One-off saved-data validation. No engine, collector, preparation or native API.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createBulkVerifier as oldBulkFactory} from '../v1/bench/n9/bulk-verify.mjs';
import {verifyRecoveryState as oldState} from '../v1/bench/n10/host-recovery-case.mjs';
import {verifyRecoveryState as newState} from '../../../../../bench/n10/host-recovery-case.mjs';
import {createRecoveryVerification,RECOVERY_VERIFICATION_REVISION} from '../../../../../bench/n10/host-recovery-verification.mjs';

const here = fileURLToPath(new URL('.',import.meta.url)), root = resolve(here,'../../../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = [
  'bench/n10/host-recovery-case.mjs','bench/n10/host-recovery-verification.mjs',
  'bench/n9/bulk-verify.mjs',
  'docs/evidence/RX-9006/overhead-slice1/v1/bench/n10/host-recovery-case.mjs',
  'docs/evidence/RX-9006/overhead-slice1/v1/bench/n9/bulk-verify.mjs',
  'docs/evidence/RX-9006/overhead-slice1/validation/replay-captures.mjs',
];
async function pins() { return Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path,sha(await readFile(join(root,path)))]))); }
const before = await pins();
assert.equal(before[sourceFiles[3]],'1f02d60210c5fee17bda471d784760d8d54b1dfb33d3ca436db4d5268f64faea');
assert.equal(before[sourceFiles[2]],'1df3ddfa1a374607128565e3f8c38696b8eca23ae2843b8017939e11dd39f1fd');
assert.equal(before[sourceFiles[4]],before[sourceFiles[2]]);
const inputBytes = await readFile(join(here,'capture-input.json.gz'));
const data = JSON.parse(gunzipSync(inputBytes));
const raw = data.rawDirectory, bulk = oldBulkFactory();
const counts = {contexts:0,sourceCaptures:0,privateCaptures:0,sourceRecordAssertions:0,privateRecordAssertions:0,originalOffsetAssertions:0,normalizedSourcePairComparisons:0};
for (const context of data.contexts) {
  const fixtures = data.fixtures[context.fixtureKey];
  const verifier = createRecoveryVerification({records:fixtures.donor,priorRecord:fixtures.prior[0],variant:context.job.variant});
  const populations = {
    donor:verifier.donorPopulation, prior:verifier.priorPopulation,
    donorAfterWrite:verifier.prepareLaterWrite(verifier.donorPopulation,fixtures.donorAfterWrite[0]),
    priorAfterWrite:verifier.prepareLaterWrite(verifier.priorPopulation,fixtures.priorAfterWrite[0]),
  };
  const firstSources = new Map(), comparedPopulations = new Set();
  try {
    for (const capture of context.captures) {
      const bytes = await readFile(join(raw,capture.file));
      assert.equal(bytes.length,capture.bytes); assert.equal(sha(bytes),capture.sha256);
      const records = fixtures[capture.population];
      if (capture.kind === 'source') {
        const encoded = bytes.toString('utf8'), oldFacts = bulk.sourceSnapshot(encoded), handle = verifier.validateSource(encoded), facts = verifier.sourceFacts(handle,encoded);
        assert.deepEqual(facts,oldFacts,'every freshly validated source fact retains strict v1 parsing/checksum/normalization');
        assert.equal(facts.originRevision,capture.revision);
        assert.deepEqual(verifier.verifySource(handle,encoded,populations[capture.population]),{outcome:'Pass',records:records.length});
        const expected = records.map(record => ({id:record.id,text:{body:Array.isArray(record.text.body) ? record.text.body : [record.text.body]},metadata:record.metadata ?? {}})).sort((a,b) => a.id < b.id ? -1 : 1);
        assert.equal(bulk.canonical(oldFacts.payload),bulk.canonical(expected),'independent authored literal population');
        const first = firstSources.get(capture.population);
        if (!first) firstSources.set(capture.population,{encoded,handle,revision:facts.originRevision});
        else if (first.revision !== facts.originRevision && !comparedPopulations.has(capture.population)) {
          assert.deepEqual(verifier.compareSources(first.handle,first.encoded,handle,encoded),bulk.compareSourceSnapshots(first.encoded,encoded));
          comparedPopulations.add(capture.population); counts.normalizedSourcePairComparisons++;
        }
        counts.sourceCaptures++; counts.sourceRecordAssertions += records.length;
      } else {
        const state = JSON.parse(bytes), oldFacts = oldState(state,records,context.job.variant), facts = newState(state,records,context.job.variant);
        assert.deepEqual(facts,oldFacts,'every complete private-state oracle result retains v1 coverage');
        assert.equal(state.revision,capture.revision);
        counts.privateCaptures++; counts.privateRecordAssertions += facts.records; counts.originalOffsetAssertions += facts.offsets;
      }
    }
    counts.contexts++;
    console.log(JSON.stringify({context:context.job.index,counts}));
  } finally { verifier.release(); }
}
assert.equal(counts.contexts,146); assert.equal(counts.sourceCaptures,1280); assert.equal(counts.privateCaptures,970);
assert.equal(counts.sourceRecordAssertions,1210916); assert.equal(counts.privateRecordAssertions,998692); assert.equal(counts.originalOffsetAssertions,5323456);
assert.deepEqual(await pins(),before,'source files unchanged throughout differential replay');
assert.equal(sha(await readFile(join(raw,'report.json'))),data.reportSha256);
const report = {
  status:'Pass',completedAt:new Date().toISOString(),counts,
  verificationRevision:RECOVERY_VERIFICATION_REVISION,
  captureInputSha256:sha(inputBytes),sourcePins:before,
  originalAttempt:{reportSha256:data.reportSha256,outcome:'Fail',completedContexts:146,fullContexts:204,acceptedPerformanceEvidence:false},
  scope:'Full saved completed-prefix source/root differential plus independent Python-authored literal fixtures. No native engine calls, canaries, probes, collectors, product timings or completion of missing RX-9006 contexts. Parsed data cannot reobserve live staging/frozen-directory/AVL/terminal-ownership witnesses.',
};
await writeFile(join(here,'capture-differential.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
