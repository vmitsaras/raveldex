import { writeFile, mkdir, copyFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cpus, platform, release, arch } from 'node:os';
import { buildCorpus } from '../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS, JUDGMENT_VERSION, JUDGMENT_CONTEXT } from '../test/fixtures/docs/judgments.mjs';
import { prepareConsumer, bundleConsumer, executePilot, checkStartup, command } from './lib/packed-consumer.mjs';
import { verifyPilot, judgeResults } from '../test/consumer/verify.mjs';

const args = process.argv.slice(2);
let output;
const position = args.indexOf('--output');
if (position !== -1) {
  if (!args[position + 1]) throw new Error('--output requires a directory');
  output = resolve(args[position + 1]); args.splice(position, 2);
}
const corpus = await buildCorpus();
const consumer = await prepareConsumer(corpus, DOCS_JUDGMENTS);
const bundle = await bundleConsumer(consumer.directory);
const startup = [];
for (const specifier of ['@vmitsaras/raveldex', './core-bundle.mjs']) startup.push(await checkStartup(consumer.directory, specifier));
const pilot = await executePilot(consumer.directory, 'run.mjs', args[0]);
const correctness = verifyPilot(corpus, DOCS_JUDGMENTS, pilot);
const bundled = await executePilot(consumer.directory, 'run-bundle.mjs');
verifyPilot(corpus, DOCS_JUDGMENTS, bundled);
const arithmetic = JSON.parse((await command(process.execPath, ['arithmetic.mjs'], consumer.directory)).stdout);
const sourceCommit = (await command('git', ['rev-parse', 'HEAD'])).stdout.trim();
const status = (await command('git', ['status', '--short'])).stdout;
const report = { task: 'RX-1006', sourceCommit, workingTree: status.trim().split('\n').filter(Boolean),
  environment: { node: process.version, npm: (await command('npm', ['--version'])).stdout.trim(),
    typescript: JSON.parse(await readFile(new URL('../node_modules/typescript/package.json', import.meta.url), 'utf8')).version,
    v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode,
    platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
  corpus: { algorithmVersion: corpus.algorithmVersion, hash: corpus.hash, records: corpus.records.length,
    sources: corpus.sources, schema: corpus.schema, judgmentVersion: JUDGMENT_VERSION },
  package: consumer.package, bundle, startup, correctness, arithmetic,
  judgmentContext: JUDGMENT_CONTEXT, relevance: judgeResults(DOCS_JUDGMENTS, pilot), pilot,
  bundledParity: 'Pass',
  timingMethod: 'performance.now around awaited direct operations; one cold initial addMany and three sequential query calls per judgment in one populated owner; raw samples/median, no throughput or device guarantee' };
const destination = output ?? consumer.directory;
await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'RX-1006-pilot.json'), JSON.stringify(report, null, 2) + '\n');
for (const [source, name] of [['corpus.json', 'RX-1006-corpus.json'], ['metafile.json', 'RX-1006-metafile.json']]) {
  await copyFile(join(consumer.directory, source), join(destination, name));
}
console.log(JSON.stringify({ consumerDirectory: consumer.directory, evidenceDirectory: destination,
  corpusHash: corpus.hash, records: corpus.records.length, correctness, relevance: report.relevance.metrics,
  bundle: { minifiedBytes: bundle.minifiedBytes, gzipBytes: bundle.gzipBytes, targetMet: bundle.targetMet },
  navigation: pilot.navigation }, null, 2));
