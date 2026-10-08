import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildCorpus } from '../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS } from '../test/fixtures/docs/judgments.mjs';
import { prepareConsumer, bundleConsumer, checkStartup } from './lib/packed-consumer.mjs';

const consumer = await prepareConsumer(buildCorpus(), DOCS_JUDGMENTS);
const core = await bundleConsumer(consumer.directory);
const startup = await checkStartup(consumer.directory, '@vmitsaras/raveldex');
const output = resolve(process.argv[2] ?? '/tmp/raveldex-rx4001-package.json');
await writeFile(output, JSON.stringify({ consumer: consumer.directory, package: consumer.package, core, startup }, null, 2) + '\n');
console.log(JSON.stringify({ consumer: consumer.directory, output }));
