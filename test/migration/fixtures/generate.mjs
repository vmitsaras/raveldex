import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { companionOptions, companionRecords, rankOptions, rankRecords } from './records.mjs';
if (!process.argv[2]) throw new Error('Usage: node test/migration/fixtures/generate.mjs <explicit companion repository>');
const repository = resolve(process.argv[2]);
const revision = '5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb';
const git = args => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
assert.equal(git(['rev-parse', 'HEAD']), revision); assert.equal(git(['status', '--porcelain']), '');
const metadata = JSON.parse(await readFile(join(repository, 'package.json')));
assert.equal(metadata.name, '@vmitsaras/localsearch'); assert.equal(metadata.dependencies.minisearch, '7.2.0'); assert.equal(metadata.license, 'MIT');
const { createLocalSearch } = await import(pathToFileURL(join(repository, 'dist/index.js')).href);
const directory = fileURLToPath(new URL('./', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const generated = [];
for (const [name, options, records, sourceRevision] of [
  ['representative', companionOptions, companionRecords, 'rx-3004-owned-source'],
  ['empty', companionOptions, [], undefined],
  ['ranking', rankOptions, rankRecords, 'ranking-input'],
]) {
  const engine = await createLocalSearch(options);
  try {
    if (records.length) await engine.addAll(records);
    const bytes = await engine.exportSnapshot(sourceRevision === undefined ? undefined : { sourceRevision });
    await writeFile(join(directory, name + '.json'), bytes);
    const envelope = JSON.parse(new TextDecoder().decode(bytes));
    generated.push({ name, path: 'test/migration/fixtures/' + name + '.json', bytes: bytes.length, sha256: digest(bytes), origin: envelope.payload.origin,
      sourceRevision: envelope.payload.sourceRevision, counts: envelope.payload.counts, payloadChecksum: envelope.checksum });
  } finally { await engine.destroy(); }
}
const inspected = ['LICENSE', 'package.json', 'src/storage/codec.ts', 'src/contracts/input.ts', 'src/contracts/defaults.ts', 'src/analysis/basic.ts', 'src/companion/engine.ts', 'dist/index.js'];
const identities = await Promise.all(inspected.map(async path => ({ path, sha256: digest(await readFile(join(repository, path))) })));
const historicalPaths = git(['ls-files', 'docs/verification']).split('\n').filter(Boolean);
const historicalEvidence = await Promise.all(historicalPaths.map(async path => ({ path, sha256: digest(await readFile(join(repository, path))) })));
const report = { kind: 'localsearch-public-source-export-provenance-v1', command: 'node test/migration/fixtures/generate.mjs <explicit-companion-repository>',
  producer: { repository: 'https://github.com/vmitsaras/LocalSearch', revision, clean: true, license: 'MIT', copyright: '2026 Vasileios Mitsaras',
    package: metadata.name, version: metadata.version, dependency: metadata.dependencies },
  method: 'Call actual companion public createLocalSearch/addAll/exportSnapshot; no private codec import and no companion edits. Fixture source is independently authored records.mjs.',
  environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode },
  inputs: { path: 'test/migration/fixtures/records.mjs', sha256: digest(await readFile(join(directory, 'records.mjs'))) }, generated, inspected: identities, historicalEvidence,
};
await writeFile(join(directory, 'provenance.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ generated, preservedHistoricalEvidenceFiles: historicalEvidence.length }));
