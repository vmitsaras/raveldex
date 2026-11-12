import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir, release } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium } from 'playwright-core';
import { version as typescriptVersion } from 'typescript';
import { command, digest, parsePackedMetadata, REPO_ROOT } from './lib/packed-consumer.mjs';

const NAME = '@vmitsaras/raveldex';
// This deliberate contract is independent of package.json: adding a public
// entry or runtime export requires a candidate-review decision here too.
export const RUNTIME_EXPORTS = Object.freeze({
  '.': ['ERROR_CODES', 'RaveldexError', 'createRaveldex'],
  './addons/patch': ['createPatch'],
  './addons/phrases': ['createSourcePhrases', 'createSourceProvider'],
  './integrations/languages/english': ['ENGLISH_ANALYZER', 'createEnglishAnalyzer'],
  './addons/query-syntax': ['QUERY_SYNTAX_ERROR_CODES', 'QUERY_SYNTAX_POLICY', 'QuerySyntaxError', 'createQuerySyntax'],
  './addons/proximity': ['PROXIMITY_POLICY', 'createProximity'],
  './addons/literal': ['LITERAL_POLICY', 'createLiteral'],
  './addons/identifiers': ['IDENTIFIER_ANALYZER', 'createIdentifierAnalyzer'],
  './addons/synonyms': ['SYNONYMS_POLICY', 'createSynonyms'],
  './addons/suggestions': ['SUGGESTIONS_POLICY', 'createSuggestions'],
  './addons/typo': ['TYPO_POLICY', 'createTypoTolerance'],
  './addons/phrases/source': ['createSourceProvider'],
  './addons/positions': ['createPositionProvider'],
  './addons/phrases/positions': ['createPositionPhrases'],
  './addons/phrases/mixed': ['createPhrases'],
  './addons/filters': ['createFilters'],
  './addons/facets': ['createFacets'],
  './addons/inspector': ['createInspector', 'exportDiagnostics'],
  './addons/evidence': ['createMatchEvidence'],
  './addons/snippets': ['createSnippetEvidence'],
  './addons/sections': ['createSectionEvidence'],
  './addons/ui': ['mountRaveldexUI'],
  './addons/ui/inline': ['mountRaveldexInline'],
  './addons/ui/modal': ['mountRaveldexModal'],
  './addons/ui/dropdown': ['mountRaveldexDropdown'],
  './addons/ui/directory': ['connectDirectoryURL', 'createDirectory'],
  './addons/ui/directory/view': ['mountRaveldexDirectory'],
  './addons/ui/directory/cards': ['mountRaveldexDirectoryCards'],
  './adapters/worker': ['WORKER_ERROR_CODES', 'WorkerAdapterError', 'createWorkerRaveldex'],
  './adapters/worker/host': ['serveRaveldexWorker'],
  './adapters/snapshots': ['SNAPSHOT_REASONS', 'SnapshotAdapterError', 'createSnapshotRaveldex', 'createSnapshots', 'currentNodeSnapshotEnvironment'],
  './adapters/indexeddb': ['INDEXEDDB_ERROR_CODES', 'IndexedDBAdapterError', 'createIndexedDBPersistence'],
  './adapters/worker/snapshots': ['createWorkerSnapshots'],
  './adapters/worker/snapshots/host': ['serveSnapshotRaveldexWorker'],
  './integrations/localsearch': ['MIGRATION_ERROR_CODES', 'MigrationError', 'convertLocalSearchSnapshot'],
});
const CSS = './addons/ui/styles.css';
const INLINE_CSS = './addons/ui/inline.css';
const MODAL_CSS = './addons/ui/modal.css';
const DROPDOWN_CSS = './addons/ui/dropdown.css';
const DIRECTORY_CSS = './addons/ui/directory.css';
const DIRECTORY_CARDS_CSS = './addons/ui/directory-cards.css';
const CSS_PATHS = [CSS, INLINE_CSS, MODAL_CSS, DROPDOWN_CSS, DIRECTORY_CSS, DIRECTORY_CARDS_CSS];
const PUBLIC_PATHS = [...Object.keys(RUNTIME_EXPORTS), ...CSS_PATHS].sort();
const specifier = path => path === '.' ? NAME : NAME + path.slice(1);
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));

export function validateCandidateManifest(metadata, files) {
  assert.equal(metadata.name, NAME);
  assert.equal(metadata.type, 'module');
  assert.equal(metadata.license, 'MIT');
  assert.equal(metadata.version, '1.0.0', 'explicit stable 1.0.0 release version');
  assert.equal(metadata.private, false, 'release metadata must be publishable');
  assert.deepEqual(metadata.publishConfig, { access: 'public' }, 'explicit public npm access');
  assert.deepEqual(metadata.engines, { node: '>=22' });
  assert.deepEqual(Object.keys(metadata.exports).sort(), PUBLIC_PATHS, 'explicit public entrypoint contract');
  assert.deepEqual(metadata.dependencies ?? {}, {}, 'no runtime dependencies');
  assert.deepEqual(metadata.optionalDependencies ?? {}, {}, 'no optional runtime dependencies');
  assert.deepEqual(metadata.peerDependencies ?? {}, {}, 'no implicit runtime peers');
  assert.deepEqual(metadata.sideEffects, ['**/*.css'], 'CSS alone is side-effectful');
  assert.equal(metadata.types, './dist/index.d.ts');
  const paths = new Set(files.map(file => file.path));
  for (const [path, target] of Object.entries(metadata.exports)) {
    if (CSS_PATHS.includes(path)) {
      assert.equal(target, './dist' + path.slice(1));
      assert.ok(paths.has(target.slice(2)), 'separate published CSS');
      continue;
    }
    assert.deepEqual(Object.keys(target).sort(), ['import', 'types']);
    assert.match(target.import, /^\.\/dist\/.+\.js$/);
    assert.equal(target.types, target.import.replace(/\.js$/, '.d.ts'));
    for (const value of Object.values(target)) assert.ok(paths.has(value.slice(2)), `missing ${value}`);
  }
  for (const path of paths) {
    assert.ok(!path.includes('..') && !path.startsWith('/'), `unsafe tarball member ${path}`);
    assert.ok(['README.md', 'LICENSE', 'CHANGELOG.md', 'package.json'].includes(path)
      || /^dist\/(?:index\.(?:js|d\.ts)|(?:core|addons\/(?:patch|query-syntax|proximity|literal|identifiers|synonyms|suggestions|typo|phrases|positions|filters|facets|metadata|inspector|evidence|snippets|sections|ui)|adapters\/(?:worker|snapshots|indexeddb)|integrations\/(?:localsearch|languages))\/.+\.(?:js|d\.ts|css))$/.test(path)
      || /^docs\/api\/(?:[^/]+\.md|examples\/(?:[^/]+\.mjs|README\.md))$/.test(path)
      || path === 'docs/api/examples/consumer-themes.css'
      || path === 'dist/integrations/localsearch/LICENSE.LocalSearch', `unexpected tarball member ${path}`);
    assert.doesNotMatch(path, /(?:^|\/)(?:node_modules|src|test|bench|\.github|\.env)(?:\/|$)|\.map$/);
  }
  assert.ok(paths.has('README.md') && paths.has('LICENSE'));
  assert.ok(paths.has('dist/integrations/localsearch/LICENSE.LocalSearch'), 'adapted code license included');
  return { status: 'Pass', publicEntrypoints: PUBLIC_PATHS, runtimeDependencies: [], privatePathAccess: 'Blocked by explicit exports map', independentCSS: metadata.exports[CSS] };
}

/** Installed guidance must not require missing source-checkout files. */
export function validateDocumentationLinks(documents, files) {
  const paths = new Set(files.map(file => file.path));
  let checked = 0;
  for (const document of documents) {
    const prose = document.text.replace(/```[\s\S]*?```/g, '');
    for (const match of prose.matchAll(/\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const link = match[1];
      if (/^(?:https?:|mailto:|data:|#)/i.test(link)) continue;
      const target = posix.normalize(posix.join(posix.dirname(document.path), decodeURIComponent(link.split('#')[0])));
      assert.ok(paths.has(target), `Missing packaged documentation target: ${document.path}: ${link}`);
      checked++;
    }
  }
  return checked;
}

async function allFiles(directory, prefix = '') {
  const result = [];
  for (const item of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, item.name);
    if (item.isDirectory()) result.push(...await allFiles(directory, path));
    else { assert.ok(item.isFile(), `unexpected link or special file ${path}`); result.push(path); }
  }
  return result.sort();
}

async function installCandidate(output) {
  const directory = join(output, 'consumer');
  await mkdir(directory, { recursive: true });
  const packed = parsePackedMetadata((await command('npm', ['pack', '--offline', '--json', '--ignore-scripts', '--pack-destination', output, '--cache', join(output, '.npm-cache')])).stdout);
  const tarball = join(output, packed.filename);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'raveldex-candidate-consumer', private: true, type: 'module' }) + '\n');
  await command('npm', ['install', tarball, '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', '--cache', join(output, '.npm-cache')], directory);
  const installed = join(directory, 'node_modules', NAME);
  assert.equal(await realpath(installed), installed, 'real isolated tarball installation, not a symlink');
  const metadata = await readJSON(join(installed, 'package.json'));
  const manifest = validateCandidateManifest(metadata, packed.files);
  const tree = JSON.parse((await command('npm', ['ls', '--offline', '--omit=dev', '--all', '--json'], directory)).stdout);
  assert.deepEqual(Object.keys(tree.dependencies), [NAME]);
  assert.deepEqual(tree.dependencies[NAME].dependencies ?? {}, {});
  assert.deepEqual(await allFiles(installed), packed.files.map(file => file.path).sort(), 'installed members match packed allowlist');
  const documents = await Promise.all(packed.files.filter(file => file.path.endsWith('.md')).map(async file =>
    ({ path: file.path, text: await readFile(join(installed, file.path), 'utf8') })));
  const documentationLinks = validateDocumentationLinks(documents, packed.files);
  const identities = [];
  for (const file of packed.files) {
    const bytes = await readFile(join(installed, file.path));
    assert.equal(bytes.length, file.size);
    assert.deepEqual(bytes, await readFile(join(REPO_ROOT, file.path)), `installed/current identity ${file.path}`);
    identities.push({ path: file.path, bytes: bytes.length, sha256: digest(bytes) });
  }
  return { directory, installed, metadata, report: { ...manifest, name: metadata.name, version: metadata.version, private: metadata.private, publishConfig: metadata.publishConfig,
    tarball, sha256: digest(await readFile(tarball)), integrity: packed.integrity, tarballBytes: packed.size, documentationLinks,
    unpackedBytes: packed.unpackedSize, installedDirectory: installed, exports: metadata.exports, files: identities, npmTree: tree } };
}

async function checkImports(directory) {
  const probe = `
    import assert from 'node:assert/strict';
    const expected = ${JSON.stringify(RUNTIME_EXPORTS)};
    const reads = [], outputs = [];
    for (const name of ['window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','IDBFactory','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask','crypto','TextEncoder','TextDecoder'])
      Object.defineProperty(globalThis, name, { configurable: true, get() { reads.push(name); throw Error('import-time host access: ' + name); } });
    for (const [path, names] of Object.entries(expected)) {
      const specifier = ${JSON.stringify(NAME)} + (path === '.' ? '' : path.slice(1));
      const module = await import(specifier);
      assert.deepEqual(Object.keys(module).sort(), [...names].sort(), specifier);
      outputs.push({ specifier, exports: Object.keys(module).sort() });
    }
    for (const path of ['dist/index.js','dist/core/execution/engine.js','src/index.ts','addons/metadata/payload','addons/positions/store','addons/phrases/verifier','adapters/worker/client','adapters/worker/snapshot-channel','adapters/indexeddb/persistence','integrations/localsearch/legacy','integrations/minisearch'])
      await assert.rejects(import(${JSON.stringify(NAME)} + '/' + path), error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
    assert.deepEqual(reads, []); console.log(JSON.stringify({ status: 'Pass', reads, outputs, privateImportRejections: 11 }));
  `;
  return JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', probe], directory)).stdout);
}

async function checkTypes(directory, metadata) {
  const surface = [];
  for (const [path, target] of Object.entries(metadata.exports)) {
    if (CSS_PATHS.includes(path)) continue;
    const declarations = await readFile(join(directory, 'node_modules', NAME, target.types.slice(2)), 'utf8');
    const names = [];
    // Compiled declarations use only named export lists and named declarations.
    // Reject new syntax instead of silently reporting an incomplete surface.
    const remaining = declarations.replace(/^export\s+(?:type\s+)?\{([^}]+)\}(?:\s+from\s+['"][^'"]+['"])?;/gm, (_match, list) => {
      for (const name of list.split(',').map(item => item.trim()).filter(Boolean)) {
        assert.match(name, /^[A-Za-z_$][\w$]*(?:\s+as\s+[A-Za-z_$][\w$]*)?$/);
        names.push(name.split(/\s+as\s+/).at(-1));
      }
      return '';
    }).replace(/^export\s+(?:declare\s+)?(?:function|class|interface|type|const|let|enum)\s+([A-Za-z_$][\w$]*)/gm, (_match, name) => { names.push(name); return ''; });
    assert.doesNotMatch(remaining, /^export\s/m, `unrecognized declaration export syntax ${path}`);
    assert.ok(names.length > 0);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.every(name => !/ExecutionOwner|MutationOwner|IndexRoot|AdapterControl|serveWorkerWithSnapshots|facadeFromExecutionOwner|requireSourceRoot|requirePositionRoot|captureRequest/.test(name)), `private declaration export ${path}`);
    surface.push({ specifier: specifier(path), declarations: target.types, exports: names.sort() });
  }
  const projects = [
    { name: 'core', libraries: ['ES2022'], files: ['test/consumer/directory-types.ts', 'test/consumer/public-types.ts', 'test/adapters/snapshots/public-types.ts', 'test/migration/public-types.ts'] },
    { name: 'browser', libraries: ['ES2022', 'DOM'], files: ['test/consumer/directory-cards-types.ts', 'test/consumer/directory-view-types.ts', 'test/consumer/directory-browser-types.ts', 'test/consumer/ui-types.ts', 'test/consumer/inline-types.ts', 'test/consumer/sections-types.ts', 'test/consumer/modal-types.ts', 'test/consumer/dropdown-types.ts', 'test/consumer/worker-types.ts', 'test/adapters/indexeddb/public-types.ts'] },
    { name: 'worker', libraries: ['ES2022', 'WebWorker'], files: ['test/consumer/worker-host-types.ts', 'test/adapters/indexeddb/worker-host-types.ts'] },
  ];
  const results = [];
  for (const project of projects) {
    const files = [], fixtures = [];
    for (const [index, source] of project.files.entries()) {
      const file = `types-${project.name}-${index}.ts`;
      const bytes = await readFile(join(REPO_ROOT, source));
      await writeFile(join(directory, file), bytes); files.push(file);
      fixtures.push({ source, sha256: digest(bytes), bytes: bytes.length });
    }
    if (project.name === 'browser') {
      const all = surface.map((item, index) => `import * as entry${index} from '${item.specifier}';\nvoid entry${index};\nimport type { ${item.exports.map((name, n) => `${name} as Export${index}_${n}`).join(', ')} } from '${item.specifier}';`).join('\n');
      await writeFile(join(directory, 'types-all.ts'), all + '\n'); files.push('types-all.ts');
    }
    const config = `types-${project.name}.json`;
    await writeFile(join(directory, config), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      lib: project.libraries, types: [], strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
      verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true }, files }, null, 2) + '\n');
    await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', config], directory);
    results.push({ name: project.name, libraries: project.libraries, ambientTypes: [], fixtures, status: 'Pass' });
  }
  return { status: 'Pass', typescript: typescriptVersion, projects: results, surface,
    method: 'Fail-closed named declaration export scan followed by standalone compiler imports of every discovered name; core/DOM/worker negative contracts compile separately.' };
}

async function graph(directory, entry, source) {
  if (source !== undefined) await writeFile(join(directory, entry), source);
  const built = await build({ absWorkingDir: directory, entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false,
    outfile: join(directory, entry.replace(/\.mjs$/, '-bundle.mjs')), logLevel: 'silent' });
  const inputs = [];
  for (const [path, input] of Object.entries(built.metafile.inputs)) {
    assert.ok(path === entry || path.startsWith('node_modules/@vmitsaras/raveldex/dist/') || path.startsWith('docs-examples/'), `foreign runtime input ${path}`);
    assert.ok(input.imports.every(item => !item.external), `external runtime dependency ${path}`);
    assert.ok(input.imports.every(item => !item.path.endsWith('.css')), `implicit CSS import ${path}`);
    inputs.push({ path, bytes: input.bytes, sha256: digest(await readFile(join(directory, path))) });
  }
  for (const output of Object.values(built.metafile.outputs)) assert.deepEqual(output.imports, []);
  assert.equal(built.outputFiles.length, 1);
  const output = built.outputFiles[0]; await writeFile(output.path, output.contents);
  return { entry, output: output.path, sha256: digest(output.contents), minifiedBytes: output.contents.length,
    gzipBytes: gzipSync(output.contents, { level: 9 }).length, inputs };
}

async function checkGraphs(directory) {
  const result = [];
  for (const [index, path] of Object.keys(RUNTIME_EXPORTS).entries()) {
    const item = await graph(directory, `entry-${index}.mjs`, `export * from '${specifier(path)}';\n`);
    const paths = item.inputs.map(input => input.path);
    if (path === '.') assert.ok(paths.every(value => !/(?:addons|adapters|integrations|construction|invariants|oracle)/.test(value)), 'core imports no optional implementations');
    if (path === './addons/ui' || path === './addons/ui/inline' || path === './addons/ui/modal' || path === './addons/ui/dropdown' || path === './addons/ui/directory' || path === './addons/ui/directory/view' || path === './addons/ui/directory/cards') assert.ok(paths.every(value => value === item.entry || value.includes('/addons/ui/') || value.endsWith('/addons/sections/validation.js') || value.endsWith('/core/contracts/data.js') || value.endsWith('/core/errors/error.js')), 'UI has no engine/evidence implementation');
    if (path !== './addons/ui/directory/cards') assert.ok(paths.every(value => !value.includes('/directory-cards')), 'rich projection and images remain outside earlier runtime graphs');
    if (path === './addons/phrases/source') assert.ok(paths.every(value => !/verifier|positions|adapters|integrations/.test(value)), 'source utility excludes phrase verifier and other providers');
    if (path === './addons/positions') assert.ok(paths.every(value => !/verifier|\/phrases\/|adapters|integrations/.test(value)), 'positions utility excludes phrase verifier and source provider');
    if (path === './adapters/worker') assert.ok(paths.every(value => !/execution\/engine|\/addons\/|\/snapshots\/|indexeddb|integrations/.test(value)), 'ordinary worker client excludes engine/addons/codecs/storage');
    result.push({ specifier: specifier(path), ...item,
      ...(path === '.' ? { planningGzipTargetBytes: 15 * 1024, planningTargetMet: item.gzipBytes <= 15 * 1024 } : {}) });
  }
  const styles = [];
  for (const [index, path] of CSS_PATHS.entries()) {
    const entry = `css-entry-${index}.mjs`;
    await writeFile(join(directory, entry), `import '${specifier(path)}';\n`);
    const cssBuild = await build({ absWorkingDir: directory, entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser',
      metafile: true, write: false, outdir: join(directory, `css-selection-${index}`), logLevel: 'silent' });
    const expectedInputs = [entry, 'node_modules/@vmitsaras/raveldex/dist' + path.slice(1),
      ...(path === MODAL_CSS ? ['node_modules/@vmitsaras/raveldex/dist/addons/ui/inline.css'] : [])];
    assert.deepEqual(Object.keys(cssBuild.metafile.inputs).sort(), expectedInputs.sort());
    const cssOutput = cssBuild.outputFiles.find(file => file.path.endsWith('.css')); assert.ok(cssOutput);
    assert.ok(cssOutput.contents.length > 0);
    styles.push({ status: 'Pass', specifier: specifier(path), inputs: Object.keys(cssBuild.metafile.inputs), bytes: cssOutput.contents.length, sha256: digest(cssOutput.contents) });
  }
  return { status: 'Pass', esbuild: esbuildVersion, entries: result, css: styles[0], inlineCSS: styles[1], modalCSS: styles[2], dropdownCSS: styles[3], directoryCSS: styles[4], directoryCardsCSS: styles[5] };
}

async function checkDocumentation(consumer, reportPath) {
  const { directory, installed } = consumer;
  const exampleDirectory = join(directory, 'docs-examples'); await mkdir(exampleDirectory);
  const sources = [];
  for (const file of ['core', 'addons', 'snapshots', 'browser', 'worker', 'worker-host', 'migration']) {
    const path = `docs/api/examples/${file}.mjs`, bytes = await readFile(join(installed, path));
    await copyFile(join(installed, path), join(exampleDirectory, `${file}.mjs`));
    sources.push({ path, sha256: digest(bytes), bytes: bytes.length });
  }
  const readme = await readFile(join(installed, 'README.md'), 'utf8');
  const match = readme.match(/<!-- candidate-example: quick-start -->\s*```js\n([\s\S]*?)\n```/);
  assert.ok(match, 'README quick start has one executable marker');
  assert.equal([...readme.matchAll(/<!-- candidate-example: quick-start -->/g)].length, 1);
  await writeFile(join(directory, 'readme-quick-start.mjs'), match[1] + '\n');
  const migrationBytes = await readFile(join(REPO_ROOT, 'test/migration/fixtures/representative.json'));
  await writeFile(join(directory, 'migration-fixture.json'), migrationBytes);
  const runner = `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { currentNodeSnapshotEnvironment } from '${NAME}/adapters/snapshots';
    import { runCoreExample } from './docs-examples/core.mjs';
    import { runAddonsExample } from './docs-examples/addons.mjs';
    import { runSnapshotsExample } from './docs-examples/snapshots.mjs';
    import { runMigrationExample } from './docs-examples/migration.mjs';
    const logged = [], originalLog = console.log;
    console.log = (...args) => logged.push(args);
    try { await import('./readme-quick-start.mjs'); } finally { console.log = originalLog; }
    assert.equal(logged.length, 1); assert.equal(logged[0][0], 1); assert.equal(logged[0][1], 1);
    assert.deepEqual(logged[0][2].map(hit => hit.id), ['guide:updates']);
    const core = await runCoreExample(); assert.equal(core.revision, 1); assert.equal(core.total, 1);
    assert.deepEqual(core.hits.map(hit => hit.id), ['guide:updates']);
    const addons = await runAddonsExample();
    assert.deepEqual(addons.phrasePage.hits.map(hit => hit.id), ['a']);
    assert.deepEqual(addons.filtered.hits.map(hit => hit.id), ['a']);
    for (const page of addons.strategies) assert.deepEqual(page, addons.phrasePage);
    assert.equal(addons.filtered.extensions.facets.fields[0].buckets[0].count, 1);
    assert.ok(addons.inspected.extensions.inspector); assert.ok(addons.diagnostics);
    assert.ok(addons.ranges.extensions['match-evidence']); assert.ok(addons.snippets.extensions.snippets);
    const declaration = { profileId: 'candidate-local-node-smoke', scope: 'exact-node-runtime',
      environment: currentNodeSnapshotEnvironment(), evidence: [${JSON.stringify(reportPath)}] };
    const snapshots = await runSnapshotsExample(declaration);
    assert.equal(snapshots.sourceRestore.format, 'raveldex-source'); assert.equal(snapshots.sourceRestore.reindexed, true);
    assert.equal(snapshots.nativeRestore.format, 'raveldex-native'); assert.equal(snapshots.nativeRestore.reindexed, false);
    assert.deepEqual(snapshots.nativePage, snapshots.sourcePage); assert.equal(snapshots.sourcePage.total, 1);
    const migration = await runMigrationExample(new Uint8Array(await readFile('migration-fixture.json')));
    assert.equal(migration.page.total, 6); assert.equal(migration.page.model, 'raveldex-bm25-v1');
    assert.deepEqual(migration.page.hits.map(hit => hit.id).sort(), ['a','b','c','d','empty','unicode']);
    console.log(JSON.stringify({ status: 'Pass', readme: logged, core, addons, snapshots, nativeDeclaration: declaration, migration }));
  `;
  await writeFile(join(directory, 'documentation-node.mjs'), runner);
  const node = JSON.parse((await command(process.execPath, ['documentation-node.mjs'], directory)).stdout);
  const browserEntry = `
    import { runBrowserExample } from './docs-examples/browser.mjs';
    import { runWorkerExample } from './docs-examples/worker.mjs';
    window.runCandidateExamples = async () => ({
      browser: await runBrowserExample(document.querySelector('#example-root')),
      worker: await runWorkerExample(new URL('/worker-host-bundle.mjs', location.href)),
    });
  `;
  const main = await graph(directory, 'browser-docs.mjs', browserEntry);
  const host = await graph(directory, 'docs-examples/worker-host.mjs');
  const resources = new Map([
    ['/', { type: 'text/html', bytes: Buffer.from('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Candidate documentation examples</title><link rel="stylesheet" href="/ui.css"></head><body><main id="example-root"></main><script type="module" src="/browser-docs-bundle.mjs"></script></body></html>') }],
    ['/browser-docs-bundle.mjs', { type: 'text/javascript', bytes: await readFile(main.output) }],
    ['/worker-host-bundle.mjs', { type: 'text/javascript', bytes: await readFile(host.output) }],
    ['/ui.css', { type: 'text/css', bytes: await readFile(join(installed, 'dist/addons/ui/styles.css')) }],
  ]);
  const requests = [], pageErrors = [], server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname, resource = resources.get(path);
    requests.push({ path, found: !!resource });
    if (!resource) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', resource.type);
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'");
    response.end(resource.bytes);
  });
  let browser;
  try {
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const channel = process.env.RAVELDEX_CANDIDATE_BROWSER ?? 'chrome';
    assert.ok(['chrome', 'chromium'].includes(channel), 'RAVELDEX_CANDIDATE_BROWSER is chrome or chromium');
    browser = await chromium.launch({ ...(channel === 'chrome' ? { channel } : {}), headless: true });
    const context = await browser.newContext(), page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const foreignRequests = [];
    page.on('request', request => { if (!request.url().startsWith(origin + '/')) foreignRequests.push(request.url()); });
    await page.goto(origin + '/'); await page.waitForFunction(() => typeof window.runCandidateExamples === 'function');
    const values = await page.evaluate(() => window.runCandidateExamples());
    assert.equal(values.browser.total, 1); assert.equal(values.browser.rendered, true);
    assert.equal(values.browser.saved.durable, true); assert.equal(values.browser.saved.format, 'raveldex-source');
    assert.equal(values.browser.loaded.status, 'restored'); assert.equal(values.browser.loaded.generation, values.browser.saved.generation);
    assert.equal(values.browser.loaded.restore.reindexed, true); assert.equal(values.browser.erased.erased, true);
    assert.equal(values.worker.receipt.status, 'committed'); assert.equal(values.worker.restoreReceipt.status, 'committed');
    assert.equal(values.worker.restoreReceipt.result.reindexed, true); assert.equal(values.worker.page.total, 1);
    assert.deepEqual(values.worker.page.hits.map(hit => hit.id), ['a']);
    assert.equal(await page.locator('#example-root').evaluate(root => root.childElementCount), 0, 'UI example tears down its DOM');
    assert.deepEqual(pageErrors, []); assert.deepEqual(foreignRequests, []);
    assert.ok(requests.some(request => request.path === '/ui.css' && request.found));
    const result = { status: 'Pass', environment: { channel, version: browser.version(), headless: true,
      playwright: (await readJSON(join(REPO_ROOT, 'node_modules/playwright-core/package.json'))).version },
      values, requests, pageErrors, foreignRequests, graphs: { main, host } };
    await context.close();
    return { status: 'Pass', sources, readmeQuickStart: { source: 'README.md', marker: 'quick-start', sha256: digest(Buffer.from(match[1] + '\n')) },
      migrationFixture: { source: 'test/migration/fixtures/representative.json', sha256: digest(migrationBytes), bytes: migrationBytes.length }, node, browser: result,
      nativeQualification: 'Explicit application fixture declaration checks only this local runtime roundtrip; reading a version is not universal native snapshot qualification.' };
  } finally {
    await browser?.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

export async function verifyCandidate(options = {}) {
  let output;
  if (options.output) {
    const requested = resolve(options.output);
    await mkdir(dirname(requested), { recursive: true });
    // Deliberately non-recursive: an existing directory, file or symlink is an
    // error, so a repeated command cannot overwrite frozen evidence.
    await mkdir(requested);
    output = await realpath(requested);
  } else output = await realpath(await mkdtemp(join(tmpdir(), 'raveldex-candidate-')));
  const reportPath = join(output, 'candidate-report.json');
  const report = { kind: 'raveldex-native-candidate-v1', startedAt: new Date().toISOString(), status: 'Running',
    environment: { node: process.version, platform: process.platform, arch: process.arch, release: release(), npm: (await command('npm', ['--version'])).stdout.trim() },
    limits: ['Offline local tarball verification; no registry publication, remote workflow or credential use.', 'Import/bundle checks do not establish native browser behavior or assistive-technology observations.', 'Browser examples are finite headless smoke checks on the recorded installed browser; historical qualification evidence remains separate.'] };
  const save = async () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  try {
    const consumer = await installCandidate(output); report.package = consumer.report; await save();
    report.startup = await checkImports(consumer.directory); await save();
    report.types = await checkTypes(consumer.directory, consumer.metadata); await save();
    report.graphs = await checkGraphs(consumer.directory); await save();
    report.documentation = await checkDocumentation(consumer, reportPath); await save();
    report.status = 'Pass'; report.completedAt = new Date().toISOString(); await save();
    return { output, reportPath, report };
  } catch (error) {
    report.status = 'Fail'; report.failure = { name: error.name, message: error.message, stack: error.stack }; await save();
    error.candidateOutput = output;
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--output'), 'usage: node scripts/candidate-check.mjs [--output DIRECTORY]');
  const result = await verifyCandidate({ ...(args.length ? { output: args[1] } : {}) });
  console.log(JSON.stringify({ status: result.report.status, report: result.reportPath, tarball: result.report.package.tarball, sha256: result.report.package.sha256 }));
}
