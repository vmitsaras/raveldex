// Staged into an actual installed consumer; public imports resolve there.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPositionPhrases } from '@vmitsaras/raveldex/addons/phrases/positions';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { exerciseRestore } from './n9-restore-case.mjs';
import { createBulkVerifier } from './bulk-verify.mjs';
const [workloadURL, instrumentURL, rawSize, variant, mode, output, rawOwner] = process.argv.slice(2);
if (!['source', 'positions-offsets'].includes(variant) || !['normal', 'diagnostic'].includes(mode)) throw Error('Invalid restore child configuration');
const { workloadFor, verifyFrozen, schema } = await import(workloadURL), { createRestoreDiagnostic } = await import(instrumentURL);
const workload = verifyFrozen(workloadFor('adversarial', Number(rawSize)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const configuration = () => ({ schema, addons: [createSourceProvider({ fields: ['body'] }), ...(variant === 'source'
  ? [createSourcePhrases({ fields: ['body'] })]
  : [createPositionProvider({ fields: ['body'], offsets: ['body'] }), createPositionPhrases({ fields: ['body'] })])] });
const diagnostic = mode === 'diagnostic' ? createRestoreDiagnostic({ memory: () => process.memoryUsage() }) : undefined;
const privateOwner = mode === 'diagnostic' ? (await import('./node_modules/@vmitsaras/raveldex/dist/core/execution/engine.js')).getExecutionOwner : undefined;
const captureRoot = mode === 'diagnostic' ? engine => {
  const state = createBulkVerifier().rootState(privateOwner(engine).root);
  return { sha256: digest(state.canonical), encounterSha256: digest(state.encounterCanonical), revision: state.revision, summary: state.summary, scope: state.scope };
} : undefined;
const report = { kind: 'rx8007-restore-node-child-v1', pid: process.pid, variant, mode, owner: Number(rawOwner), size: workload.size, identity: workload.identity,
  runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv }, configuration: { schema, addons: configuration().addons.map(addon => addon.manifest), defaultLimits: true },
  scope: 'Actual installed Node source restore. process.memoryUsage observations include harness, inputs, donor and receiver; phase samples are not retained/peak/exclusive engine heap.' };
try {
  report.exercise = await exerciseRestore({ create: () => createRaveldex(configuration()), createSnapshots, records: workload.records, queries: workload.queries, mode,
    diagnostic, captureRoot, cpuUsage: previous => previous ? process.cpuUsage(previous) : process.cpuUsage(),
    memory: () => ({ values: process.memoryUsage(), method: 'Unforced process.memoryUsage sample outside timing; not retained/peak/exclusive heap.' }),
    onSnapshot: async encoded => { const path = output.replace(/\.json$/, '.snapshot.json'); await writeFile(path, encoded); return { encodedSha256: digest(encoded), snapshotArtifact: path.split('/').at(-1) }; },
  });
  report.outcome = 'Collected';
} catch (error) {
  report.outcome = 'Fail'; report.failure = { name: error.name, code: error.code ?? null, message: error.message, reason: error.reason ?? null, details: error.details ?? null };
  if (error.restoreReport) report.exercise = error.restoreReport;
  throw error;
} finally {
  report.packageMetadataSha256 = digest(await readFile(new URL('./node_modules/@vmitsaras/raveldex/package.json', import.meta.url)));
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
