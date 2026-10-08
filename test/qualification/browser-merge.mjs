import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const [output, ...sources] = process.argv.slice(2);
assert.ok(output && sources.length >= 2, 'usage: browser-merge.mjs output.json chronological-report.json ...');
const records = new Map(), browsers = new Map(), sourceReports = [], launches = [], productionModules = new Map(), recordedVersions = new Map();
let representativePackage, representativeSource;
for (const path of sources) {
  const bytes = await readFile(path), report = JSON.parse(bytes);
  assert.equal(report.kind, 'raveldex-rx4002-browser-qualification-v1');
  const sourceReport = { path, sha256: digest(bytes), startedAt: report.startedAt, finishedAt: report.finishedAt,
    execution: report.execution ?? { status: 'Not captured directly in the first run.' }, environment: report.environment,
    packageSha256: report.package.package.sha256, installedDirectory: report.package.installedDirectory, summary: report.summary };
  sourceReports.push(sourceReport);
  for (const graph of Object.values(report.package.graphs)) for (const input of graph.inputs) {
    if (!input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/')) continue;
    const previous = productionModules.get(input.path);
    assert.ok(previous === undefined || previous === input.sha256, `production module bytes changed between source observations: ${input.path}`);
    productionModules.set(input.path, input.sha256);
  }
  for (const row of report.records) {
    const environment = report.browsers.find(browser => browser.name === row.browser);
    assert.ok(environment?.version, 'behavioral observations require an actual launched browser version');
    assert.ok(recordedVersions.get(row.browser) === undefined || recordedVersions.get(row.browser) === environment.version, 'different actual browser versions cannot silently supersede the same matrix key');
    recordedVersions.set(row.browser, environment.version);
    records.set(`${row.browser}\0${row.name}`, { ...row, browserVersion: environment.version, sourceReport: path });
  }
  if (report.records.length > 0) { representativePackage = report.package; representativeSource = path; }
  for (const row of report.browsers) { launches.push({ ...row, sourceReport: path }); browsers.set(row.name, { ...row, sourceReport: path }); }
}
const rows = [...records.values()];
const accepted = { kind: 'raveldex-rx4002-browser-accepted-observations-v1', createdAt: new Date().toISOString(),
  method: 'Latest observation per exact browser/scenario key from chronological immutable source reports. Full resource/engine/storage rows come from their own executed sources; local UI repair rows supersede failed UI harness attempts. Launch failures remain separate. This is not one synthetic rerun.',
  mergeExecution: { path: 'test/qualification/browser-merge.mjs', sha256: digest(await readFile(new URL('./browser-merge.mjs', import.meta.url))) },
  package: representativePackage, packageSelection: { sourceReport: representativeSource, method: 'Representative latest executed behavioral consumer; each matrix row retains its actual separate source report and consumer.' },
  productionGraphIdentity: { status: 'Pass', method: 'Every directly captured production graph input SHA matches across all source reports; no package-metadata or fixture-byte equality is inferred.',
    modules: [...productionModules].map(([path, sha256]) => ({ path, sha256 })) },
  sourceReports, launches, browsers: [...browsers.values()], records: rows,
  summary: { passed: rows.filter(row => row.status === 'Pass').length, failed: rows.filter(row => row.status === 'Fail').length,
    blockedScenarios: rows.filter(row => row.status === 'Blocked').length, rejectedConfigurations: rows.filter(row => row.status === 'RejectedOutcome').length,
    blockedBrowsers: [...browsers.values()].filter(row => row.status === 'Blocked').length },
  limitations: 'Finite explicit configurations only. Firefox behavioral observations, exact assistive technology, installed Safari, physical presentation/input and all-Unicode portability are not substituted by this merged automated record.' };
await writeFile(output, JSON.stringify(accepted, null, 2) + '\n');
console.log(JSON.stringify(accepted.summary));
