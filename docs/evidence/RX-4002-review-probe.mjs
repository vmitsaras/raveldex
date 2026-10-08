import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeHeapGraph } from '../../bench/memory/heap-graph.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const groups = [];
const baseline = '2309e16';
function group(name, checks, detail) { groups.push({ name, status: 'Pass', checks, detail }); }

// Independent synthetic graph with known self sizes, sharing, cycles and
// deliberately excluded prototype/hidden edges. No native engine runs here.
const definitions = [
  ['object', 'global', 16, [['property', '__raveldexMemoryMarkers', 1]]],
  ['object', 'markers', 16, [['property', 'indexRoot', 2], ['property', 'reverseDocuments', 3], ['property', 'dictionaryPostingsStatistics', 4], ['property', 'sourceOrPositions', 5]]],
  ['object', 'root', 48, [['property', 'documents', 3], ['property', 'fields', 4], ['property', 'participants', 5], ['property', 'counts', 6], ['property', 'configuration', 7]]],
  ['object', 'documents', 16, [['property', 'record', 8], ['property', '__proto__', 11], ['hidden', 0, 12]]],
  ['object', 'fields', 16, [['property', 'term', 9]]],
  ['object', 'participants', 16, [['property', 'original', 10]]],
  ['object', 'counts', 8, []], ['object', 'configuration', 8, []],
  ['object', 'reverseRecord', 32, [['property', 'term', 13], ['property', 'self', 8]]],
  ['object', 'termRecord', 32, [['property', 'term', 13]]],
  ['string', 'original', 64, []], ['object', 'prototypeExcluded', 2048, []],
  ['object', 'hiddenExcluded', 1024, []], ['string', 'sharedTerm', 24, []],
];
const strings = [], stringIndex = value => {
  let index = strings.indexOf(value); if (index < 0) { index = strings.length; strings.push(value); } return index;
};
const nodes = [], edges = [];
for (const [index, [type, name, bytes, links]] of definitions.entries()) {
  nodes.push(['object', 'string'].indexOf(type), stringIndex(name), 2 * index + 1, bytes, links.length);
  for (const [type, name, target] of links) edges.push(['property', 'internal', 'hidden'].indexOf(type), type === 'hidden' ? name : stringIndex(name), target * 5);
}
const snapshot = { snapshot: { meta: { node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'], node_types: [['object', 'string'], 'string', 'number', 'number', 'number'],
  edge_fields: ['type', 'name_or_index', 'to_node'], edge_types: [['property', 'internal', 'hidden'], 'string_or_number', 'node'] } }, nodes, edges, strings };
const graph = analyzeHeapGraph(snapshot);
assert.equal(graph.unionSelectedDataSelfSizeBytes, 200); assert.equal(graph.sharedSelectedDataSelfSizeBytes, 24);
assert.deepEqual(graph.components.map(row => row.reachableSelfSizeBytes), [72, 72, 80]);
assert.deepEqual(graph.components.map(row => row.disjointAmongSelectedDataGraphsSelfSizeBytes), [48, 48, 80]);
assert.equal(graph.indexRootShapeCandidates.length, 1); assert.equal(graph.indexRootShapeCandidates[0].isMarkedCommittedRoot, true);
group('Independent selected-edge graph arithmetic', 6, { unionBytes: 200, sharedBytes: 24, excludedBytes: 3072, cycleTerminates: true });

const manifest = await read('docs/planning/roadmap.json');
const task = manifest.tasks.find(task => task.id === 'RX-4002');
assert.ok(task); assert.equal(task.acceptanceCriteria.length, 7);
assert.ok(['in_progress', 'blocked'].includes(task.status));
const candidate = manifest.tasks.find(task => task.id === 'RX-4003'); assert.ok(candidate.dependsOn.includes('RX-4002'));
group('Unwaived planner qualification criteria', 4, { taskStatus: task.status, criterionCount: task.acceptanceCriteria.length, dependent: candidate.id });
const baselineManifest = JSON.parse(execFileSync('git', ['show', `${baseline}:docs/planning/roadmap.json`], { cwd: root, encoding: 'utf8' }));
const baselineTask = baselineManifest.tasks.find(task => task.id === 'RX-4002');
assert.deepEqual(task.acceptanceCriteria, baselineTask.acceptanceCriteria);
assert.deepEqual(task.dependsOn, baselineTask.dependsOn);
assert.deepEqual(manifest.tasks.filter(task => task.id !== 'RX-4002'), baselineManifest.tasks.filter(task => task.id !== 'RX-4002'));
group('No criterion waiver, prerequisite change or task reset', 3, { baseline, otherTasksCompared: manifest.tasks.length - 1 });

const packageReport = await read('docs/evidence/RX-4002-package.json');
const runtimeFiles = packageReport.package.files.filter(file => file.path.startsWith('dist/'));
const installed = resolve(packageReport.consumer, 'node_modules/@vmitsaras/raveldex');
let comparedBytes = 0;
for (const file of runtimeFiles) {
  const actual = await readFile(resolve(installed, file.path)), current = await readFile(resolve(root, file.path));
  assert.deepEqual(actual, current); assert.equal(actual.length, file.size); comparedBytes += actual.length;
}
const currentFiles = [];
async function descend(path, prefix) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = resolve(path, entry.name), label = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await descend(target, label); else currentFiles.push(label);
  }
}
await descend(resolve(root, 'dist'), 'dist'); assert.deepEqual(currentFiles.sort(), runtimeFiles.map(file => file.path).sort());
const baselinePackage = JSON.parse(execFileSync('git', ['show', `${baseline}:package.json`], { cwd: root, encoding: 'utf8' }));
const currentPackage = await read('package.json'); assert.deepEqual(currentPackage.exports, baselinePackage.exports);
assert.deepEqual(currentPackage.dependencies, baselinePackage.dependencies);
assert.equal(execFileSync('git', ['diff', baseline, '--', 'src', 'package-lock.json'], { cwd: root, encoding: 'utf8' }), '');
group('Installed/current runtime and unchanged public boundary', runtimeFiles.length + 4, { runtimeFiles: runtimeFiles.length, comparedBytes, consumer: packageReport.consumer,
  measuredTarballSha256: packageReport.package.sha256, note: 'Metadata/docs may later differ. All production file bytes match this installed consumer.' });

const memory = await read('docs/evidence/RX-4002-memory.json');
assert.equal(memory.observations.length, 18); assert.equal(memory.graphObservations.length, 6);
assert.equal(new Set([...memory.observations, ...memory.graphObservations].map(row => row.pid)).size, 24);
for (const mode of ['core-only', 'source-phrase', 'positions-offsets']) for (const size of [1000, 10000]) {
  const rows = memory.observations.filter(row => row.mode === mode && row.size === size);
  assert.deepEqual(rows.map(row => row.repetition).sort(), [0, 1, 2]);
  for (const row of rows) {
    assert.equal(row.childExitCode, 0); assert.equal(row.outcome, 'Pass'); assert.equal(row.kernelObservation.outcome, 'Pass');
    assert.equal(row.kernelLifetimeMaximumResidentSetSizeBytes, Number(row.kernelTimeRaw.match(/(\d+)\s+maximum resident set size/)[1]));
    assert.ok(row.kernelLifetimeMaximumResidentSetSizeBytes >= Math.max(...row.samples.map(sample => sample.bytes.rss)));
    assert.ok(row.cleanup.disposedOwnerRootReleased && row.cleanup.initialRootCollected && row.cleanup.priorMutationRootCollected && row.cleanup.allHarnessGraphMarkersDeleted);
    assert.deepEqual(row.verifications.map(check => check.records), [size, size]);
    assert.deepEqual(row.verifications.map(check => check.revision), [Math.ceil(size / 256), Math.ceil(size / 256) + 1]);
    const expectedSelective = Math.floor((size - 8) / 37) + 1;
    assert.deepEqual(row.verifications.map(check => check.selectiveTotal), [expectedSelective, expectedSelective + 1]);
    if (mode !== 'core-only') {
      const expectedPhrases = Math.floor((size - 1) / 3) + 1;
      assert.deepEqual(row.verifications.map(check => check.phraseTotal), [expectedPhrases, expectedPhrases - 1]);
    }
    const steady = [...new Set(row.samples.filter(sample => sample.phase === 'settled-after-explicit-gc').map(sample => sample.operation))];
    for (const stage of steady) assert.deepEqual(row.samples.filter(sample => sample.operation === stage).map(sample => sample.cycle), [0, 1, 2]);
  }
}
group('Independent primary process/outcome/state reconciliation', 18, { freshSampleProcesses: 18, intrusiveGraphProcesses: 6,
  independentStateChecks: 36, repetitions: 3, sizes: [1000, 10000], kernelQuantity: 'Complete process lifetime RSS maximum; never stage/component peak.' });
for (const file of memory.productionFiles) assert.equal(digest(await readFile(resolve(installed, file.path))), file.sha256);
for (const source of memory.harness.filter(source => source.path !== 'bench/memory/heap-graph.mjs')) assert.equal(digest(await readFile(resolve(root, source.path))), source.sha256);
group('Measured memory runtime/kernel/wrapper provenance', memory.productionFiles.length + 3,
  { productionFiles: memory.productionFiles.length, measuredKernelWrapperAndFixtureCurrent: true,
    originalParser: memory.harness.find(source => source.path === 'bench/memory/heap-graph.mjs'), note: 'The original restricted graph parser is historical; a separate accepted offline analysis must bind corrected graphs.' });

const summary = await read('docs/evidence/RX-4002-memory-summary.json');
assert.equal(summary.raw.sha256, digest(await readFile(resolve(root, summary.raw.path))));
assert.equal(summary.groups.length, 6);
let numericSummaries = 0;
function checkSummary(actual, values) {
  const sorted = [...values].sort((a, b) => a - b);
  assert.deepEqual(actual.samples, values); assert.equal(actual.minimumBytes, sorted[0]);
  assert.equal(actual.maximumBytes, sorted.at(-1)); assert.equal(actual.medianBytes, sorted[1]); numericSummaries++;
}
for (const group of summary.groups) {
  const rows = memory.observations.filter(row => row.mode === group.mode && row.size === group.size);
  for (const stage of group.steady) {
    const chosen = rows.map(row => row.samples.filter(sample => sample.operation === stage.stage && sample.phase === 'settled-after-explicit-gc').at(-1));
    checkSummary(stage.heapUsed, chosen.map(sample => sample.bytes.heapUsed)); checkSummary(stage.rss, chosen.map(sample => sample.bytes.rss));
  }
  for (const operation of group.observedOperationMaxima) {
    checkSummary(operation.heapUsed, rows.map(row => Math.max(...row.samples.filter(sample => sample.operation === operation.operation).map(sample => sample.bytes.heapUsed))));
    checkSummary(operation.rss, rows.map(row => Math.max(...row.samples.filter(sample => sample.operation === operation.operation).map(sample => sample.bytes.rss))));
  }
  checkSummary(group.kernelLifetimeMaximumRSS, rows.map(row => row.kernelLifetimeMaximumResidentSetSizeBytes));
}
group('Independent raw memory derived arithmetic', numericSummaries, { numericSummaries, minimumMedianMaximum: 'Recomputed from original readings, not imported owner summary functions.' });
const correctedGraphs = await read('docs/evidence/RX-4002-memory-graphs.json');
assert.equal(correctedGraphs.rawSource.sha256, digest(await readFile(resolve(root, correctedGraphs.rawSource.path))));
assert.equal(correctedGraphs.acceptedParser.sha256, digest(await readFile(resolve(root, correctedGraphs.acceptedParser.path))));
assert.equal(correctedGraphs.offlineAnalyser.sha256, digest(await readFile(resolve(root, correctedGraphs.offlineAnalyser.path))));
assert.equal(summary.graphAnalysisRevision.sha256, digest(await readFile(resolve(root, summary.graphAnalysisRevision.path))));
const excludedGraphs = await read(correctedGraphs.firstExcludedAnalysis);
assert.equal(excludedGraphs.originalParser.sha256, memory.harness.find(source => source.path === 'bench/memory/heap-graph.mjs').sha256);
let acceptedDumpCount = 0;
for (const row of correctedGraphs.graphObservations) {
  const original = memory.graphObservations.find(original => original.mode === row.mode && original.size === row.size);
  for (const graph of row.graphs) {
    assert.equal(graph.sha256, original.graphs.find(first => first.phase === graph.phase).sha256); acceptedDumpCount++;
    for (const component of graph.components) {
      assert.equal(Object.values(component.byType).reduce((sum, item) => sum + item.selfSizeBytes, 0), component.reachableSelfSizeBytes);
      assert.equal(Object.values(component.byType).reduce((sum, item) => sum + item.nodes, 0), component.reachableNodes);
    }
    assert.equal(graph.components.reduce((sum, component) => sum + component.disjointAmongSelectedDataGraphsSelfSizeBytes, 0),
      graph.unionSelectedDataSelfSizeBytes - graph.sharedSelectedDataSelfSizeBytes);
    assert.equal(graph.indexRootShapeCandidates.filter(root => root.isMarkedCommittedRoot).length, 1);
    assert.equal(graph.indexRootShapeCandidates.length, graph.phase === 'mutation-precommit' ? 3 : 1);
    const derived = summary.graphObservations.find(derived => derived.mode === row.mode && derived.size === row.size).graphs.find(derived => derived.phase === graph.phase);
    assert.equal(derived.snapshotSha256, graph.sha256); assert.deepEqual(derived.components, graph.components);
    assert.equal(derived.unionSelectedDataSelfSizeBytes, graph.unionSelectedDataSelfSizeBytes);
    assert.equal(derived.sharedSelectedDataSelfSizeBytes, graph.sharedSelectedDataSelfSizeBytes);
  }
}
assert.equal(acceptedDumpCount, 16);
group('Corrected offline graph provenance, sharing and derived data', acceptedDumpCount + 6,
  { acceptedDumps: acceptedDumpCount, rawByteIdentity: correctedGraphs.rawSource.sha256, acceptedParser: correctedGraphs.acceptedParser,
    note: 'Original restricted results excluded; hidden edges remain excluded while selected internal properties may reach hidden-type data backing nodes. No dominator/staging-allocation-peak claim.' });
const memoryDoc = await readFile(resolve(root, 'docs/evaluation/RX-4002-memory-method.md'), 'utf8');
const tableRows = memoryDoc.split('\n').filter(line => /^\| (Core|Source phrases|Positions \+ offsets) \/ /.test(line)).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
assert.equal(tableRows.length, 18);
let printedNumericCells = 0;
function numbers(cell, expected) {
  const actual = cell.replace(/ \(empty container\)/, '').replaceAll(',', '').split('/').map(value => Number(value.trim()));
  assert.deepEqual(actual, expected); printedNumericCells += expected.length;
}
for (const group of summary.groups) {
  const label = `${{ 'core-only': 'Core', 'source-phrase': 'Source phrases', 'positions-offsets': 'Positions + offsets' }[group.mode]} / ${group.size.toLocaleString('en-US')}`;
  const rows = tableRows.filter(row => row[0] === label); assert.equal(rows.length, 3);
  const stage = name => group.steady.find(stage => stage.stage === name);
  numbers(rows[0][1], [stage('matched-module-harness-baseline').heapUsed.medianBytes]);
  numbers(rows[0][2], [stage('built-inputs-released').heapUsed.medianBytes]);
  numbers(rows[0][3], [stage('disposed-handles-inputs-released').heapUsed.medianBytes]);
  numbers(rows[0][4], [group.kernelLifetimeMaximumRSS.medianBytes, group.kernelLifetimeMaximumRSS.maximumBytes]);
  for (const [index, name] of ['build-admitted-batches', 'replace-one-record', 'export-native'].entries()) {
    const operation = group.observedOperationMaxima.find(operation => operation.operation === name);
    if (operation) numbers(rows[1][index + 1], [operation.heapUsed.medianBytes, operation.heapUsed.maximumBytes]);
    else assert.equal(rows[1][index + 1], 'Not applicable');
  }
  const built = correctedGraphs.graphObservations.find(row => row.mode === group.mode && row.size === group.size).graphs.find(graph => graph.phase === 'built');
  for (const [index, name] of ['reverseDocuments', 'dictionaryPostingsStatistics', 'sourceOrPositions'].entries())
    numbers(rows[2][index + 1], [built.components.find(component => component.label === name).reachableSelfSizeBytes]);
  numbers(rows[2][4], [built.sharedSelectedDataSelfSizeBytes]); numbers(rows[2][5], [built.unionSelectedDataSelfSizeBytes]);
}
group('Printed memory tables independently reconciled', printedNumericCells, { printedNumericCells, tables: 3, rows: 18, rawSummaryRecomputedBeforeDisplayComparison: true });

// Optional direct audit of two original local heaps. The source/occurrence
// expectations are literal fixture arithmetic; this does not use the owner's
// selected-edge traversal or production analyzer/scorer.
if (process.argv.includes('--heaps')) {
  for (const mode of ['source-phrase', 'positions-offsets']) {
    const row = memory.graphObservations.find(row => row.mode === mode && row.size === 1000);
    const selected = row.graphs.find(graph => graph.phase === 'built');
    const bytes = await readFile(selected.path); assert.equal(bytes.length, selected.fileBytes); assert.equal(digest(bytes), selected.sha256);
    const dump = JSON.parse(bytes), meta = dump.snapshot.meta, width = meta.node_fields.length, edgeWidth = meta.edge_fields.length;
    const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nCount = meta.node_fields.indexOf('edge_count');
    const eType = meta.edge_fields.indexOf('type'), eName = meta.edge_fields.indexOf('name_or_index'), eTarget = meta.edge_fields.indexOf('to_node');
    const types = meta.node_types[nType], edgeTypes = meta.edge_types[eType], offsets = [];
    let edgeAt = 0;
    for (let index = 0; index < dump.nodes.length / width; index++) { offsets[index] = edgeAt; edgeAt += dump.nodes[index * width + nCount] * edgeWidth; }
    assert.equal(edgeAt, dump.edges.length);
    const type = index => types[dump.nodes[index * width + nType]];
    const name = index => dump.strings[dump.nodes[index * width + nName]];
    function links(index) {
      const rows = [];
      for (let offset = offsets[index], end = offset + dump.nodes[index * width + nCount] * edgeWidth; offset < end; offset += edgeWidth) {
        const edgeType = edgeTypes[dump.edges[offset + eType]], rawName = dump.edges[offset + eName];
        rows.push({ type: edgeType, name: ['element', 'hidden'].includes(edgeType) ? rawName : dump.strings[rawName], target: dump.edges[offset + eTarget] / width });
      }
      return rows;
    }
    const own = index => links(index).filter(link => ['property', 'element'].includes(link.type) && link.name !== '__proto__');
    const property = (index, key) => { const found = own(index).find(link => link.name === key); assert.ok(found, `missing ${key}`); return found.target; };
    let marker;
    for (let index = 0; index < dump.nodes.length / width; index++) {
      const found = links(index).find(link => link.type === 'property' && link.name === '__raveldexMemoryMarkers');
      if (found) { assert.equal(marker, undefined); marker = found.target; }
    }
    assert.notEqual(marker, undefined);
    const participant = property(property(marker, 'sourceOrPositions'), mode === 'source-phrase' ? 'source' : 'positions');
    const buckets = property(property(participant, 'records'), 'buckets');
    const records = own(buckets).flatMap(bucket => own(bucket.target)); assert.equal(records.length, 1000);
    function frozenValues(array) {
      assert.equal(type(array), 'object'); assert.equal(name(array), 'Array');
      const elements = links(array).find(link => link.type === 'internal' && link.name === 'elements'); assert.ok(elements);
      assert.equal(type(elements.target), 'array');
      const data = links(elements.target).filter(link => link.type === 'internal' && /^(0|[1-9][0-9]*)$/.test(link.name));
      return data.map(link => link.target);
    }
    function originalString(index) {
      if (type(index) === 'string') return name(index);
      assert.equal(type(index), 'concatenated string');
      const parts = links(index); return originalString(parts.find(link => link.name === 'first').target) + originalString(parts.find(link => link.name === 'second').target);
    }
    let valueArrays = 0, termArrays = 0, occurrences = 0;
    for (const record of records) {
      const index = Number(record.name.slice(5)); assert.equal(record.name, `item:${String(index).padStart(5, '0')}`);
      const expectedText = `${index % 3 === 0 ? 'red blue' : 'red green blue'} echo echo value${index % 37}`;
      if (mode === 'source-phrase') {
        const body = property(property(record.target, 'text'), 'body'), values = frozenValues(body);
        assert.equal(values.length, 1); assert.equal(originalString(values[0]), expectedText); valueArrays++;
      } else {
        const values = frozenValues(property(property(record.target, 'positions'), 'body'));
        assert.equal(values.length, 1); valueArrays++;
        const terms = own(property(values[0], 'terms'));
        const expected = expectedText.split(' '), distinct = [...new Set(expected)].sort();
        assert.deepEqual(terms.map(term => term.name).sort(), distinct);
        for (const term of terms) {
          const found = frozenValues(term.target), count = expected.filter(word => word === term.name).length;
          assert.equal(found.length, count); assert.ok(found.every(index => type(index) === 'object')); termArrays++; occurrences += count;
        }
      }
    }
    assert.equal(valueArrays, 1000);
    if (mode === 'positions-offsets') { assert.equal(termArrays, 4666); assert.equal(occurrences, 5666); }
    group(`Independent actual frozen-array backing audit: ${mode}`, mode === 'source-phrase' ? 1005 : 5673,
      { dumpSha256: selected.sha256, dumpBytes: selected.fileBytes, originalLocalPath: selected.path, ownedRecords: records.length,
        valueArrays, termArrays, occurrences, policy: 'Direct own-data paths and actual internal numeric array links; no dominator/component-byte claim.' });
  }
}

// Independently reconstruct the accepted browser map from immutable reports.
// Do not import the owner's merge utility or fixture expectation array.
const browsers = await read('docs/evidence/RX-4002-browsers-accepted.json');
const latestRecords = new Map(), latestBrowsers = new Map(), productionInputs = new Map();
const sourceReports = [], firstArchive = await read('docs/evidence/RX-4002-browsers-first-sources.json');
let previousEnd = 0, browserInputChecks = 0, bundleChecks = 0;
for (const source of browsers.sourceReports) {
  const sourceBytes = await readFile(resolve(root, source.path)); assert.equal(digest(sourceBytes), source.sha256);
  const raw = JSON.parse(sourceBytes); sourceReports.push(raw);
  assert.ok(Date.parse(raw.startedAt) >= previousEnd); previousEnd = Date.parse(raw.finishedAt);
  assert.deepEqual(source.environment, raw.environment); assert.equal(source.installedDirectory, raw.package.installedDirectory);
  assert.equal(source.packageSha256, raw.package.package.sha256);
  assert.equal(raw.environment.playwright, '1.61.1'); assert.equal(raw.environment.axe, '4.13.0');
  assert.equal(raw.environment.node, 'v24.21.0'); assert.equal(raw.environment.os.arch, 'arm64');
  assert.match(raw.environment.os.product, /27\.0\.1[\s\S]*26A434/);
  for (const [entry, graph] of Object.entries(raw.package.graphs)) {
    assert.equal(digest(await readFile(resolve(raw.package.installedDirectory, graph.settings.outfile))), graph.sha256); bundleChecks++;
    assert.equal(graph.settings.platform, 'browser'); assert.equal(graph.settings.format, 'esm');
    assert.equal(graph.settings.target, 'es2022'); assert.equal(graph.settings.bundle, true);
    for (const input of graph.inputs) {
      assert.ok(input.imports.every(item => !item.external));
      if (input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/')) {
        const path = input.path.slice('node_modules/@vmitsaras/raveldex/'.length);
        const installedBytes = await readFile(resolve(raw.package.installedDirectory, input.path));
        assert.equal(digest(installedBytes), input.sha256); assert.equal(installedBytes.length, input.bytes);
        assert.deepEqual(installedBytes, await readFile(resolve(root, path)));
        if (productionInputs.has(input.path)) assert.equal(input.sha256, productionInputs.get(input.path));
        productionInputs.set(input.path, input.sha256); browserInputChecks++;
      } else {
        // The worker entry is deliberately replaced by its executed bundle.
        // Its original source is unchanged and separately recorded.
        const bytes = await readFile(input.path === 'browser-worker.mjs' ? resolve(root, 'test/qualification/browser-worker.mjs')
          : resolve(raw.package.installedDirectory, input.path));
        assert.equal(digest(bytes), input.sha256); assert.equal(bytes.length, input.bytes);
      }
    }
    if (entry === 'browser-worker.mjs')
      assert.equal(digest(await readFile(resolve(raw.package.installedDirectory, entry))), graph.sha256);
  }
  assert.equal(digest(await readFile(resolve(raw.package.installedDirectory, 'styles.css'))), raw.package.cssSha256);
  assert.equal(raw.package.cssSha256, digest(await readFile(resolve(root, 'dist/addons/ui/styles.css'))));
  for (const fixture of raw.package.sourceFixtures) {
    if (digest(await readFile(resolve(root, fixture.path))) !== fixture.sha256) {
      assert.equal(source.path, 'docs/evidence/RX-4002-browsers-first.json');
      const archived = firstArchive.files.find(file => file.sha256 === fixture.sha256); assert.ok(archived);
      assert.equal(digest(archived.text), fixture.sha256); assert.equal(Buffer.byteLength(archived.text), archived.bytes);
    }
  }
  for (const row of raw.records) {
    const actualHost = raw.browsers.find(host => host.name === row.browser); assert.ok(actualHost?.version);
    latestRecords.set(JSON.stringify([row.browser, row.name]), { ...row, browserVersion: actualHost.version, sourceReport: source.path });
  }
  for (const host of raw.browsers) latestBrowsers.set(host.name, { ...host, sourceReport: source.path });
}
assert.equal(sourceReports.length, 5); assert.equal(firstArchive.directory, browsers.sourceReports[0].installedDirectory);
assert.equal(sourceReports[0].execution, undefined); assert.match(browsers.sourceReports[0].execution.status, /Not captured directly/);
for (const file of firstArchive.files) { assert.equal(digest(file.text), file.sha256); assert.equal(Buffer.byteLength(file.text), file.bytes); }
assert.deepEqual(browsers.records, [...latestRecords.values()]); assert.deepEqual(browsers.browsers, [...latestBrowsers.values()]);
assert.deepEqual(new Map(browsers.productionGraphIdentity.modules.map(row => [row.path, row.sha256])), productionInputs);
assert.equal(browsers.mergeExecution.sha256, digest(await readFile(resolve(root, browsers.mergeExecution.path))));
assert.deepEqual(browsers.summary, { passed: 15, failed: 0, blockedScenarios: 1, rejectedConfigurations: 0, blockedBrowsers: 1 });
assert.equal(browsers.records.filter(row => row.status === 'Pass').length, 15);
assert.equal(browsers.records.filter(row => row.status === 'Blocked').length, 1);
assert.equal(browsers.records.length, 16);
const launchedVersions = Object.fromEntries(browsers.browsers.filter(host => host.version).map(host => [host.name, host.version]));
assert.deepEqual(launchedVersions, { chrome: '154.0.8037.98', webkit: '26.5' });
assert.match(browsers.browsers.find(host => host.name === 'webkit').identity, /not installed Safari/);
const firefox = browsers.browsers.find(host => host.name === 'firefox');
assert.equal(firefox.status, 'Blocked'); assert.equal(firefox.version, undefined); assert.equal(firefox.launchTimeoutMs, 30000);
assert.match(firefox.profileDirectory, /^\/private\/tmp\/raveldex-rx4002-firefox-/);
assert.match(firefox.launchError, /Operation not permitted[\s\S]*RenderCompositorSWGL/);
assert.equal(browsers.records.filter(row => row.browser === 'firefox').length, 0);
const focusedRunner = sourceReports[2].execution;
assert.equal(focusedRunner.runnerSha256, digest(await readFile(resolve(root, focusedRunner.runnerPath))));
assert.equal(focusedRunner.serverSha256, digest(await readFile(resolve(root, focusedRunner.serverPath))));
for (const row of browsers.records) { assert.deepEqual(row.pageErrors, []); if (row.cleanup) assert.deepEqual(row.cleanup, []); }
group('Independent frozen browser assembly, actual versions and graph identity', browserInputChecks + bundleChecks + 25,
  { sourceReports: sourceReports.length, directlyComparedGraphInputs: browserInputChecks, distinctProductionInputs: productionInputs.size,
    bundles: bundleChecks, latestMapIndependentlyRebuilt: true, launchedVersions, acceptedScenarios: browsers.summary,
    limitation: 'First runner identity was not directly captured; no launched Firefox version or Safari qualification inferred.' });

const literalCases = [
  ['file café', ['compat', 'literal']], ['ＣＡＲ', ['compat', 'literal']], ['½', ['compat']], ['1/2', ['literal']],
  ['straße', ['sharp']], ['strasse', ['literal']], ['hello world', ['sharp']], ['can t', ['sharp']],
  ['東京都', ['compat']], ['𐐨', ['compat']], ['😀', []],
  [{ kind: 'not', child: { kind: 'text', text: 'car' } }, ['empty', 'sharp']],
  [{ kind: 'or', children: [{ kind: 'text', text: 'straße' }, { kind: 'text', text: '½' }] }, ['compat', 'sharp']],
  [{ kind: 'and', children: [{ kind: 'text', text: 'car' }, { kind: 'not', child: { kind: 'text', text: '1/2' } }] }, ['compat']],
  [{ kind: 'all' }, ['compat', 'empty', 'literal', 'sharp']], [{ kind: 'none' }, []],
];
const hitIds = result => result.hits.map(hit => hit.id).sort();
let membershipCases = 0, numericalCases = 0;
for (const record of browsers.records.filter(row => row.name.startsWith('independent Unicode'))) {
  const evidence = record.evidence; assert.equal(record.status, 'Pass'); assert.equal(evidence.rows.length, 53);
  assert.equal(record.sourceReport, 'docs/evidence/RX-4002-browsers-second.json');
  for (const strategy of ['core', 'source', 'offsets']) {
    const actualCases = evidence.rows.filter(row => row.strategy === strategy && row.expected);
    assert.equal(actualCases.length, literalCases.length);
    for (const [query, expected] of literalCases) {
      const actual = actualCases.find(row => JSON.stringify(row.query) === JSON.stringify(query)); assert.ok(actual);
      assert.deepEqual(actual.expected, expected); assert.deepEqual(hitIds(actual.direct), expected);
      assert.equal(actual.direct.total, expected.length); assert.equal(actual.direct.completeness, 'complete');
      assert.equal(actual.direct.revision, 1); assert.deepEqual(actual.worker, actual.direct); membershipCases++;
    }
    const malformed = evidence.rows.find(row => row.strategy === strategy && row.malformed);
    assert.equal(malformed.malformed.error.name, 'RaveldexError'); assert.equal(malformed.malformed.error.code, 'INVALID_RECORD');
    if (strategy !== 'core') {
      const phrase = evidence.rows.find(row => row.strategy === strategy && row.originalCoordinateAssertions);
      assert.deepEqual(hitIds(phrase.direct), ['compat', 'literal']); assert.equal(phrase.direct.total, 2);
      assert.deepEqual(phrase.worker, phrase.direct); assert.equal(phrase.direct.extensions.snippets.revision, 1);
      for (const [id, text, ranges] of [['compat', 'ﬁle cafe\u0301 ＣＡＲ ½ 東京都 𐐀', [[0, 3, 'file'], [4, 9, 'café']]],
        ['literal', 'file café car 1/2 strasse', [[0, 4, 'file'], [5, 9, 'café']]]]) {
        const document = phrase.direct.extensions.snippets.documents.find(row => row.id === id);
        assert.deepEqual(document.ranges.map(range => [range.start, range.end, range.term]), ranges);
        assert.equal(document.snippets[0].text, text); assert.equal(document.snippets[0].end, text.length);
        assert.deepEqual(document.snippets[0].highlights.map(range => [range.start, range.end]), ranges.map(range => range.slice(0, 2)));
      }
      membershipCases++;
    }
  }
  // Independent N=3, df=2, avg length=5/3, length=2. Normalizer=1.38.
  // No imported tokenizer, scorer, evaluator, fixture function or expectedScores.
  const idf = Math.log(1.6), wanted = { a: idf * 4.4 / 3.38, b: idf * 2.2 / 2.38 };
  assert.deepEqual(evidence.scores.hits.map(hit => hit.id), ['a', 'b']); assert.equal(evidence.scores.total, 2);
  for (const hit of evidence.scores.hits) { assert.ok(Math.abs(hit.score - wanted[hit.id]) <= 1e-12); numericalCases++; }
  assert.equal(evidence.independentMembershipQueries, 50); assert.equal(evidence.numericalAssertions, 2);
}
group('Independent literal browser membership, phrase originals and hand scores', membershipCases + numericalCases,
  { membershipCases, numericalCases, modes: ['core', 'source', 'offsets'], completeResultParity: true,
    limitation: 'Finite literal expectations; not a new all-Unicode analyzer qualification.' });

let resourceConfigurations = 0;
for (const row of browsers.records.filter(row => /^\d+ admitted/.test(row.name))) {
  const e = row.evidence, size = Number(row.name.split(' ')[0]); resourceConfigurations++;
  assert.equal(row.status, 'Pass'); assert.equal(e.configurationOutcome, 'Pass'); assert.deepEqual(e.operationFailures, []);
  assert.equal(e.requestedRecords, size); assert.equal(e.admittedRecords, size); assert.equal(e.batchSize, 256);
  assert.equal(e.rows.length, Math.ceil(size / 256));
  for (const [index, batch] of e.rows.entries()) {
    const length = Math.min(256, size - index * 256); assert.equal(batch.offset, index * 256); assert.equal(batch.length, length);
    assert.deepEqual(batch.value, { revision: index + 1, changed: true, added: length, replaced: 0, removed: 0 });
  }
  assert.equal(e.all.total, size); assert.equal(e.all.completeness, 'complete'); assert.equal(e.all.revision, Math.ceil(size / 256));
  assert.deepEqual(e.all.hits.map(hit => hit.id), Array.from({ length: 20 }, (_, index) => `record-${String(index).padStart(5, '0')}`));
  assert.ok(e.all.hits.every(hit => hit.score === 0));
  assert.equal(e.common.value.total, size); assert.equal(e.selective.value.total, Math.ceil(size / 1000));
  assert.deepEqual(hitIds(e.selective.value), Array.from({ length: Math.ceil(size / 1000) }, (_, index) => `record-${String(index * 1000).padStart(5, '0')}`));
  if (e.kind === 'worker-source') {
    assert.equal(e.phrase.value.total, size); assert.equal(e.phrase.value.completeness, 'complete');
    const facets = e.phrase.value.extensions.facets.fields; assert.equal(facets.length, 1);
    assert.equal(facets[0].field, 'category'); assert.equal(facets[0].distinctValueTotal, 2); assert.equal(facets[0].omittedBucketCount, 0);
    assert.deepEqual(facets[0].buckets, [{ kind: 'value', value: 'Guide', count: size / 2 }, { kind: 'value', value: 'Reference', count: size / 2 }]);
  }
  assert.deepEqual(e.replacement.value, { revision: e.all.revision + 1, changed: true, added: 0, replaced: 1, removed: 0 });
  assert.equal(e.after.total, 1); assert.equal(e.after.revision, e.all.revision + 1); assert.deepEqual(hitIds(e.after), ['record-00000']);
}
assert.equal(resourceConfigurations, 8);
group('Independent browser admission, batch, facet, exact total and atomic-revision arithmetic', resourceConfigurations,
  { resourceConfigurations, sizes: [1000, 10000], configurations: ['direct-core', 'worker-source'], operationRefusals: 0,
    limitation: 'Untimed recorded operation outcomes; no physical memory, throughput, responsiveness or paint inference.' });

for (const row of browsers.records.filter(row => row.name.startsWith('IndexedDB'))) {
  const e = row.evidence; assert.equal(row.status, 'Pass'); assert.equal(e.saved.format, 'raveldex-source'); assert.equal(e.saved.durable, true);
  assert.equal(e.loaded.status, 'restored'); assert.equal(e.secondLoad.status, 'restored');
  assert.equal(e.saved.generation, e.loaded.generation); assert.equal(e.saved.generation, e.secondLoad.generation);
  assert.equal(e.loaded.restore.receivingAnalyzer.environmentProfile, 'unqualified');
  assert.equal(e.secondLoad.restore.receivingAnalyzer.environmentProfile, 'unqualified');
  assert.deepEqual(hitIds(e.actual), ['alpha', 'gamma']); assert.equal(e.actual.total, 2);
  const { revision: actualRevision, ...actual } = e.actual, { revision: expectedRevision, ...expected } = e.expected;
  assert.equal(actualRevision, 3); assert.equal(expectedRevision, 1); assert.deepEqual(actual, expected);
  assert.deepEqual(e.erased, { erased: true, generation: null, durable: true });
  assert.deepEqual(e.missing, { status: 'missing', generation: null }); assert.equal(e.databaseCleanup, 'deleted');
}
group('Independent same-generation source recovery and namespace erase outcomes', 2,
  { environments: 2, completeResultParityIgnoringLocalRevision: true, limitation: 'Observed transaction completion; no power-loss or eviction durability claim.' });

for (const row of browsers.records.filter(row => row.name.startsWith('native UI'))) {
  const e = row.evidence; assert.equal(e.resultTotal, 7); assert.equal(e.guideTotal, 5); assert.equal(e.retryTotal, 1); assert.equal(e.emptyTotal, 0);
  assert.deepEqual(e.facetOptions, [{ text: 'All', value: '' }, { text: 'Guide (5)', value: '0' }, { text: 'Reference (2)', value: '1' }]);
  assert.equal(e.nativeFacetKeyboard.selection, 'Pass'); assert.equal(e.nativeFacetKeyboard.clear, row.browser === 'chrome' ? 'Pass' : 'Blocked');
  assert.equal(row.status, row.browser === 'chrome' ? 'Pass' : 'Blocked'); assert.equal(e.configurationOutcome, row.status);
  if (row.browser === 'webkit') assert.match(e.functionalFacetSelection, /selectOption.*separately/);
  assert.ok(e.InspectorFacts > 0); assert.equal(e.EscapeRestoredFocus, true); assert.equal(e.authoredNodesRestored, true); assert.equal(e.remount, 'Pass');
  assert.equal(e.visibleFocus.focusVisible, true); assert.equal(e.visibleFocus.outlineStyle, 'solid'); assert.equal(e.visibleFocus.outlineWidth, '3px');
  assert.equal(e.reflow.viewportCSSPixels, 375); assert.equal(e.reflow.rootFontPixels, '32px'); assert.ok(e.reflow.UIScrollWidth <= e.reflow.UIClientWidth + 1);
  assert.equal(e.reducedMotion.mediaMatches, true); assert.ok(e.reducedMotion.controls.every(control => control.animationName === 'none' && control.transitionDuration === '0s'));
  assert.equal(e.forcedColors.outcome, 'Observed'); assert.equal(e.forcedColors.mediaMatches, true); assert.equal(e.forcedColors.focusVisible, true);
  assert.match(e.syntheticComposition, /Real OS IME remains Blocked/);
  assert.equal(e.automatedAxe.length, 2);
  for (const scan of e.automatedAxe) { assert.equal(scan.tool.version, '4.13.0'); assert.deepEqual(scan.violations, []); }
}
for (const row of browsers.records.filter(row => row.name.startsWith('actual module-worker'))) {
  const e = row.evidence; assert.equal(row.status, 'Pass'); assert.equal(e.terminatedActualModuleWorker, true);
  assert.equal(e.actualWorkerError.name, 'WorkerAdapterError'); assert.equal(e.actualWorkerError.code, 'TIMEOUT');
  assert.equal(e.renderedError, 'Search failed (INTERNAL_ERROR). Try again.'); assert.deepEqual(e.recovered, ['beta']);
  assert.equal(e.priorWorkerDisposals.length, 1); assert.equal(e.priorWorkerDisposals[0].error.code, 'TIMEOUT');
  assert.match(e.recovery, /fresh owner.*authoritative.*timeout retained/); assert.deepEqual(e.automatedAxe.violations, []);
  assert.match(e.ATObservation, /Blocked/);
}
group('Automated UI and worker recovery scope with honest native-input and transport limits', 4,
  { UIEnvironments: 2, workerRecoveryEnvironments: 2, WebKitNativeClear: 'Blocked', failedDeadWorkerDisposalAcknowledgementsPreserved: true,
    limitation: 'No screen-reader speech, real OS IME, Safari, browser zoom or physical input evidence.' });

const finalPackage = await read('docs/evidence/RX-4002-package-final.json');
const packageAudit = await read('docs/evidence/RX-4002-package-audit.json');
const referencedConsumers = [...new Set([packageReport.consumer, memory.consumer, finalPackage.consumer,
  ...browsers.sourceReports.map(source => source.installedDirectory)])];
assert.equal(packageAudit.baseline, baseline); assert.equal(packageAudit.distinctInstalledDirectories, 7);
assert.deepEqual(packageAudit.consumers, referencedConsumers); assert.equal(packageAudit.matchedProductionFiles, 208);
assert.equal(packageAudit.consumerRoles.primary, packageAudit.consumerRoles.memory);
let finalProductionComparisons = 0;
for (const file of packageAudit.productionFiles) {
  const actual = await readFile(resolve(root, file.path)); assert.equal(digest(actual), file.sha256); assert.equal(actual.length, file.bytes);
  for (const consumer of referencedConsumers) {
    assert.deepEqual(await readFile(resolve(consumer, 'node_modules/@vmitsaras/raveldex', file.path)), actual); finalProductionComparisons++;
  }
}
const finalInstalled = resolve(finalPackage.consumer, 'node_modules/@vmitsaras/raveldex');
assert.deepEqual(await readFile(resolve(finalInstalled, 'package.json')), await readFile(resolve(root, 'package.json')));
assert.deepEqual(await readFile(resolve(finalInstalled, 'README.md')), await readFile(resolve(root, 'README.md')));
assert.equal(finalPackage.core.sha256, packageReport.core.sha256); assert.equal(finalPackage.core.gzipSha256, packageReport.core.gzipSha256);
assert.equal(finalPackage.core.gzipBytes, 16829); assert.equal(finalPackage.core.targetGzipBytes, 15360); assert.equal(finalPackage.core.targetMet, false);
assert.deepEqual(finalPackage.startup.reads, []); assert.equal(finalPackage.package.private, true); assert.equal(finalPackage.package.version, '0.0.0');
const finalCheckBytes = await readFile(resolve(root, 'docs/evidence/RX-4002-final-check.log'));
const finalCheckLog = finalCheckBytes.toString();
const loggedCount = label => [...finalCheckLog.matchAll(new RegExp(`ℹ ${label} (\\d+)`, 'g'))].map(match => Number(match[1]));
assert.deepEqual(loggedCount('tests'), [475, 15, 24, 26, 1]); assert.deepEqual(loggedCount('pass'), [475, 15, 24, 26, 1]);
for (const label of ['fail', 'cancelled', 'skipped']) assert.deepEqual(loggedCount(label), [0, 0, 0, 0, 0]);
assert.match(finalCheckLog, /Roadmap valid/); assert.match(finalCheckLog, /Generated roadmap and task documents match/);
assert.match(finalCheckLog, /typecheck[\s\S]*tsc -p tsconfig\.json/);
group('Final package across every measured install and supplied full-check log', finalProductionComparisons + 18,
  { baseline, distinctInstalledDirectories: referencedConsumers.length, productionFiles: packageAudit.matchedProductionFiles,
    productionByteComparisons: finalProductionComparisons, finalMetadataAndREADME: 'Exact bytes', unchangedCoreGzipBytes: 16829,
    unchangedTargetMissBytes: 1469, suppliedFullCheck: { tests: 541, pass: 541, fail: 0, cancelled: 0, skipped: 0,
      logSha256: digest(finalCheckBytes), execution: 'Run by parent, final supplied log independently inspected. Not rerun by reviewer.' } });

const report = { kind: 'rx4002-independent-review-probe-v1', recordedAt: new Date().toISOString(),
  scope: 'Independent synthetic graph arithmetic and documentary/raw artifact assertions; no browser, screen reader, physical device or memory workload executed.',
  groups, probeSha256: digest(await readFile(fileURLToPath(import.meta.url))) };
await writeFile(new URL('./RX-4002-review-probe.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ groups: groups.length, checks: groups.reduce((sum, row) => sum + row.checks, 0), status: 'Pass' }));
