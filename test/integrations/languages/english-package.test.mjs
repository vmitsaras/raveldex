import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {measurePackedEnglish} from '../../measurements/english-package.mjs';
import {packEnglish} from '../../../scripts/pack-english.mjs';
let report;
before(async()=>{report=await measurePackedEnglish();});
test('installed/minified English consumers preserve literal Boolean/score results, mutations and unselected pack behavior',()=>{
  assert.equal(report.correctness.status,'Pass');assert.equal(report.correctness.authoredQueries,10);assert.equal(report.correctness.fullPageComparisonsPerRun,30);assert.equal(report.correctness.bundledParity,'Pass');assert.equal(report.correctness.unselectedPack,'Pass');assert.equal(report.package.private,false);
});
test('source/position evidence and both source/native snapshots preserve selected English semantics with explicit compatibility refusal',()=>{
  assert.equal(report.snapshots.status,'Pass');assert.equal(report.snapshots.comparisons,48);assert.equal(report.snapshots.mismatchRefusals,8);assert.equal(report.snapshots.rows.length,4);assert.equal(report.documentation.status,'Pass');assert.match(report.snapshots.qualificationScope,/no all-Unicode or cross-host/);
});
test('real Node worker English and source restore validate actual analyzer identities without accepting foreign replies',()=>{
  assert.equal(report.worker.status,'Pass');assert.equal(report.worker.comparisons,15);assert.equal(report.worker.mismatchRefusals.length,4);assert.equal(report.worker.restoreReceipt.status,'committed');assert.equal(report.worker.restoreReceipt.result.receivingAnalyzer.id,'english-porter1980-v1');assert.equal(report.worker.foreignAnalyzerReceipt,'INVALID_TRANSPORT');assert.equal(report.worker.foreignAnalyzerRestore,'OUTCOME_UNKNOWN');assert.match(report.worker.scope,/not browser/);
});
test('optional English code stays outside core graph and all selected public imports remain inert and isolated',()=>{
  assert.ok(report.core.inputs.every(({path})=>!path.includes('/integrations/languages/')));assert.ok(report.englishOnly.inputs.some(({path})=>path.endsWith('/english/stem.js')));assert.ok(report.englishOnly.inputs.every(({path})=>!path.includes('/execution/engine.js')));assert.ok(report.startup.every(row=>row.reads.length===0));assert.equal(report.logicalState.extraRetainedIndexEntries,0);assert.match(report.logicalState.basis,/not heap/);assert.match(report.declarations,/no DOM\/Node ambient types/);
});
test('the English pack installs independently with an exact public type peer and no runtime core import',()=>{
  assert.equal(report.standalone.status,'Pass');assert.equal(report.correctness.separatelyInstalledPack,'Pass');assert.equal(report.standalone.fullPageComparisons,30);assert.equal(report.standalone.preparation.package.name,'@vmitsaras/raveldex-english');assert.equal(report.standalone.preparation.package.private,false);assert.deepEqual(report.standalone.preparation.package.runtimeDependencies,[]);assert.deepEqual(report.standalone.preparation.package.peerDependencies,{'@vmitsaras/raveldex':'1.0.0'});assert.equal(report.standalone.installedFiles.length,5);assert.deepEqual(report.standalone.preparation.graph.runtimeImports,[]);assert.ok(report.standalone.graph.inputs.every(({path})=>path==='english-standalone-only.mjs'||path==='node_modules/@vmitsaras/raveldex-english/dist/index.js'));assert.equal(report.standalone.startup.reads.length,0);assert.match(report.standalone.declarations,/compiler-emitted public-peer/);assert.match(report.standalone.factoryParity,/Pass/);
  assert.equal(report.standalone.typedFailures.status,'Pass');assert.equal(report.standalone.typedFailures.count,4);assert.equal(report.standalone.typedFailures.revisionAfterRefusal,0);assert.ok(report.standalone.typedFailures.rows.every(row=>row.publicCoreError));
});
test('standalone preparation refuses existing directories and symlinks without changing their contents',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'raveldex-english-output-refusal-')),link=directory+'-link';
  try{const sentinel=join(directory,'sentinel');await writeFile(sentinel,'preserve authored evidence\n');await symlink(directory,link);for(const output of [directory,link])await assert.rejects(packEnglish({output}),{code:'EEXIST'});assert.equal(await readFile(sentinel,'utf8'),'preserve authored evidence\n');}finally{await rm(link,{force:true});await rm(directory,{recursive:true,force:true});}
});
