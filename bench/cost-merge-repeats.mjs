// Replace explicitly excluded small-core timing rows; preserve both source runs.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { digest } from './costs.mjs';
import { summarizeRows } from './cost-common.mjs';

const [initialPath, replacementPath, output] = process.argv.slice(2);
assert.ok(initialPath && replacementPath && output, 'initial complete report, scoped small-core replacement and output required');
const initialBytes = await readFile(initialPath), replacementBytes = await readFile(replacementPath);
const initial = JSON.parse(initialBytes), replacement = JSON.parse(replacementBytes);
assert.equal(initial.observations.length, 27); assert.equal(replacement.observations.length, 6);
assert.equal(initial.method.seed, replacement.method.seed); assert.equal(initial.method.owners, replacement.method.owners);
assert.equal(initial.installedDirectory, replacement.installedDirectory);
assert.deepEqual(replacement.method.selectedModes, ['core-only']); assert.deepEqual(replacement.method.selectedSizes, [100, 1000]);
const source = await readFile(new URL('./cost-node-entry.mjs', import.meta.url), 'utf8');
const declarations = "const selectedModes = (process.env.RAVELDEX_COST_CONFIGURATIONS ?? configurations.map(row => row.id).join(',')).split(',');\nconst selectedSizes = (process.env.RAVELDEX_COST_SIZES ?? METHOD.sizes.join(',')).split(',').map(Number);\nassert.ok(selectedModes.length > 0 && selectedModes.every(mode => configurations.some(row => row.id === mode)));\nassert.ok(selectedSizes.length > 0 && selectedSizes.every(size => METHOD.sizes.includes(size)));\n";
assert.ok(source.includes(declarations));
const normalized = source.replace(declarations, '').replaceAll('configurations.filter(row => selectedModes.includes(row.id))', 'configurations')
  .replaceAll('for (const size of selectedSizes)', 'for (const size of METHOD.sizes)').replace('...METHOD, selectedModes, selectedSizes, timing:', '...METHOD, timing:');
assert.equal(normalized, initial.executedHarnessSources.find(item => item.path === 'bench/cost-node-entry.mjs').sourceCode,
  'first executed entry must differ only in scoped control/report declarations, never the measured kernel');
const key = row => JSON.stringify([row.configuration, row.size, row.repetition]);
const replacements = new Map(replacement.observations.map(row => [key(row), row])); assert.equal(replacements.size, 6);
const accepted = structuredClone(initial);
accepted.method = { ...initial.method, acceptedSourcePasses: 2,
  timing: initial.method.timing.replace('One process, modules imported once before timing;',
    'Each source pass uses one process with modules imported once before timing; the accepted report combines a default pass and an isolated scoped repeat;') };
accepted.observations = initial.observations.map(row => {
  const substitute = replacements.get(key(row));
  if (!substitute) return { ...row, sourcePass: 'initial-default' };
  assert.equal(row.corpusSha256, substitute.corpusSha256);
  return { ...substitute, sourcePass: 'isolated-small-core-repeat' };
});
accepted.diagnostics = initial.diagnostics.map(row => replacement.diagnostics.find(candidate => candidate.configuration === row.configuration && candidate.size === row.size) ?? row);
accepted.summaries = summarizeRows(accepted.observations);
accepted.bundleGraphs = replacement.bundleGraphs;
accepted.harness = replacement.harness;
accepted.sampleProvenance = {
  reason: 'Six initial small-core rows potentially overlapped one brief parent comparison run and are excluded from accepted timings. Current scoped repeat replaces all 3 owners at core100/1000.',
  initial: { path: initialPath, sha256: digest(initialBytes), acceptedOwnerRows: 21, excludedOwnerRows: 6, executedHarness: initial.harness,
    executedHarnessSources: initial.executedHarnessSources },
  replacement: { path: replacementPath, sha256: digest(replacementBytes), acceptedOwnerRows: 6, executedHarness: replacement.harness },
  process: 'Accepted observations combine two warm-module Node processes; fresh engine owners in both. They are not process/module cold samples.',
  sourceDifference: 'Initial node entry predates controls for selecting scoped configuration/size repetitions and recording selectedModes/selectedSizes. Removing those declarations, loop filters and report fields makes the current node entry byte-identical to the staged initial entry; measurement kernels, queries, dataset, snapshot and observer work are unchanged.',
  graphDifference: 'Accepted graph observations come from the current scoped repeat. Core uses fixed direct all-three-runtime-export target entry; the initial namespace wrapper graph remains in the preserved initial report. Optional complete module graphs use unchanged namespace-export method.',
};
await writeFile(output, JSON.stringify(accepted, null, 2) + '\n');
console.log(JSON.stringify({ output, acceptedOwners: accepted.observations.length, acceptedInitialOwners: 21, acceptedReplacementOwners: 6 }));
