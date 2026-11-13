import assert from 'node:assert/strict';
import { mkdir, rm, copyFile, readFile, writeFile, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { BASE, PAGES, SOURCE_ALIASES, RECIPES, JEKYLL, href } from '../site/pages.mjs';
import { prepareUsageDemo } from './lib/ui-consumer.mjs';
import { command } from './lib/packed-consumer.mjs';
import { publishGenerated, rewriteMarkdown, auditLinks, sha256 } from './lib/pages.mjs';
import { prepareInlineStarters } from './lib/inline-starters.mjs';
import { STARTERS, starterSource } from '../site/starters.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const work = join(root, '.tmp/pages');
const source = join(work, 'source');
const output = join(work, 'output');
await rm(work, { recursive: true, force: true }); // Only this script's scratch tree.
await mkdir(join(source, 'src/pages'), { recursive: true });
await copyFile(join(root, 'site/Layout.astro'), join(source, 'src/Layout.astro'));
for (const name of ['Home.astro', 'Demo.astro', 'Examples.astro', 'SolutionCard.astro', 'solutions.mjs', 'SearchWorkbench.astro', 'SolutionChooser.astro', 'StarterSetup.astro', 'ExampleShowcase.astro', 'Inline.astro', 'Modal.astro', 'Dropdown.astro', 'Directory.astro', 'Cards.astro', 'starters.mjs', 'pages.mjs', 'navigation.mjs', 'styles.css']) {
  await copyFile(join(root, 'site', name), join(source, 'src', name));
}
await writeFile(join(source, 'package.json'), '{"private":true,"type":"module"}\n');
await writeFile(join(source, 'astro.config.mjs'), `import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
const keyboardScrollRegions = { name: 'site-keyboard-scroll-regions',
  element: { filter: ['pre', 'table'], visit(node, context) { context.setProperty(node, 'tabIndex', 0); } } };
export default defineConfig({ output: 'static', site: 'https://vmitsaras.github.io', base: ${JSON.stringify(BASE)},
  trailingSlash: 'always', outDir: ${JSON.stringify(output)}, build: { format: 'directory', assets: 'site-assets' },
  vite: { plugins: [tailwindcss()] },
  markdown: { syntaxHighlight: false, processor: satteri({ hastPlugins: [keyboardScrollRegions] }) }, devToolbar: { enabled: false } });\n`);
const routes = new Map(PAGES.map(([path, route]) => [path, href(route)]));
const recipes = new Map(RECIPES.map(name => [`docs/api/examples/${name}.mjs`, `${BASE}example-files/${name}.mjs`]));
const themeSource = 'docs/api/examples/consumer-themes.css';
recipes.set(themeSource, `${BASE}example-files/consumer-themes.css`);
for (const starter of STARTERS) for (const path of starter.files) {
  recipes.set(`examples/${starter.id}/${path}`, BASE + starterSource(starter.id, path));
}
assert.equal(routes.size, PAGES.length, 'unique source allowlist');
assert.equal(new Set(routes.values()).size, PAGES.length, 'unique public routes');
for (const [path, route] of SOURCE_ALIASES) {
  assert.ok(!routes.has(path), 'source aliases cannot replace registered sources');
  assert.ok([...routes.values()].includes(href(route)), 'source aliases require a real public destination');
  routes.set(path, href(route));
}
routes.set('examples/docs-search/index.html', BASE + 'demo/');
routes.set('README.md', href('guide/overview'));
for (const [path, route, title] of PAGES) {
  if (path === 'site/Examples.astro') {
    await mkdir(join(source, 'src/pages/examples'), { recursive: true });
    await writeFile(join(source, 'src/pages/examples/index.astro'), "---\nimport Examples from '../../Examples.astro';\n---\n<Examples />\n");
    continue;
  }
  if (['site/Inline.astro', 'site/Modal.astro', 'site/Dropdown.astro', 'site/Directory.astro', 'site/Cards.astro'].includes(path)) {
    const component = path.slice('site/'.length, -'.astro'.length);
    const route = component.toLowerCase();
    await mkdir(join(source, 'src/pages/examples', route), { recursive: true });
    await writeFile(join(source, 'src/pages/examples', route, 'index.astro'), `---\nimport ${component} from '../../../${component}.astro';\n---\n<${component} />\n`);
    continue;
  }
  if (path === 'site/Demo.astro') {
    await mkdir(join(source, 'src/pages/demo'), { recursive: true });
    await writeFile(join(source, 'src/pages/demo/index.astro'), "---\nimport Demo from '../../Demo.astro';\n---\n<Demo />\n");
    continue;
  }
  if (path === 'site/Home.astro') {
    const example = /<!-- candidate-example: quick-start -->\n```js\n([\s\S]*?)\n```/.exec(await readFile(join(root, 'README.md'), 'utf8'));
    assert.ok(example, 'executable core example');
    await writeFile(join(source, 'src/pages/index.astro'), `---\nimport Home from '../Home.astro';\n---\n<Home example={${JSON.stringify(example[1])}} />\n`);
    continue;
  }
  assert.ok(!path.endsWith('.astro'), 'Astro pages require explicit compiled component handling');
  const destination = join(source, 'src/pages', route ? route + '.md' : 'index.md');
  await mkdir(dirname(destination), { recursive: true });
  const layout = relative(dirname(destination), join(source, 'src/Layout.astro')).replaceAll('\\', '/');
  const text = await readFile(join(root, path), 'utf8');
  const markdown = rewriteMarkdown(text, path, routes, recipes);
  await writeFile(destination, `---\nlayout: ${JSON.stringify(layout.startsWith('.') ? layout : './' + layout)}\ntitle: ${JSON.stringify(title)}\nroute: ${JSON.stringify(route)}\n---\n${markdown}`);
}
const built = await command(process.execPath, [join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', source]);
process.stdout.write(built.stdout);
process.stderr.write(built.stderr);
await mkdir(join(output, 'site-assets'), { recursive: true });
const thumbnails = ['inline', 'modal', 'dropdown', 'directory', 'cards'].map(id => `site/images/examples/${id}.png`);
await mkdir(join(output, 'site-assets/examples'), { recursive: true });
for (const path of thumbnails) await copyFile(join(root, path), join(output, 'site-assets/examples', path.split('/').at(-1)));
await copyFile(join(root, 'site/shell.mjs'), join(output, 'site-assets/shell.mjs'));
await copyFile(join(root, 'site/workbench.css'), join(output, 'site-assets/workbench.css'));
await copyFile(join(root, 'site/search.css'), join(output, 'site-assets/search.css'));
await copyFile(join(root, 'LICENSE'), join(output, 'site-assets/LICENSE.txt'));
await mkdir(join(output, 'example-files'), { recursive: true });
for (const name of RECIPES) await copyFile(join(root, `docs/api/examples/${name}.mjs`), join(output, `example-files/${name}.mjs`));
await copyFile(join(root, themeSource), join(output, 'example-files/consumer-themes.css'));
const starters = await prepareInlineStarters(output, work);

// The ordinary demo indexes usage guides; the qualification pilot stays separate.
const pilot = await prepareUsageDemo();
const entryPath = join(pilot.directory, 'pilot-entry.mjs');
const entry = await readFile(entryPath, 'utf8');
const original = 'url: section.sourceUrl';
assert.equal(entry.split(original).length, 2, 'exact deployment adapter seam');
const destinations = Object.fromEntries(pilot.corpus.sources.map(item => {
  assert.ok(routes.has(item.path));
  return [item.path, routes.get(item.path)];
}));
// The shared header is a real installed consumer of the public modal export.
const searchOutput = join(output, 'site-assets/search');
await mkdir(searchOutput, { recursive: true });
const searchContent = JSON.stringify({ schema: pilot.corpus.schema, records: pilot.corpus.records,
  sections: pilot.corpus.sections.map(({ id, title, category, overview, sourcePath, anchor }) =>
    ({ id, title, category, overview, url: destinations[sourcePath] + '#' + anchor })) });
await writeFile(join(searchOutput, 'content.json'), searchContent);
await copyFile(join(root, 'site/search.mjs'), join(pilot.directory, 'site-search-entry.mjs'));
await copyFile(join(root, 'site/search-controller.mjs'), join(pilot.directory, 'search-controller.mjs'));
await bundle({ absWorkingDir: pilot.directory, entryPoints: ['site-search-entry.mjs'], outfile: join(searchOutput, 'main.mjs'),
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
  treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false,
  define: { SITE_SEARCH_SHA256: JSON.stringify(sha256(searchContent)) } });
for (const name of ['modal.css', 'inline.css']) await copyFile(join(pilot.installed, 'dist/addons/ui', name), join(searchOutput, name));
await writeFile(entryPath, entry.replace(original, `url: ${JSON.stringify(destinations)}[section.sourcePath] + '#' + section.anchor`));
await bundle({ absWorkingDir: pilot.directory, entryPoints: ['pilot-entry.mjs'], outfile: 'main.mjs',
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
  treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false });
await mkdir(join(output, 'demo'), { recursive: true });
for (const name of ['main.mjs', 'engine-worker.mjs', 'ui.css', 'corpus.json']) {
  await copyFile(join(pilot.directory, name), join(output, 'demo', name));
}
assert.equal(sha256(await readFile(join(output, 'demo/corpus.json'))), sha256(await readFile(join(pilot.directory, 'corpus.json'))));
await writeFile(join(output, '_config.yml'), JEKYLL);
// Validate before touching branch-published files.
const { walk } = await import('./lib/pages.mjs');
const staged = { files: (await walk(output)).map(path => ({ path })) };
const links = await auditLinks(output, staged);
const inputPaths = new Set([...PAGES.map(x => x[0]), ...RECIPES.map(name => `docs/api/examples/${name}.mjs`),
  ...SOURCE_ALIASES.map(([path]) => path), ...thumbnails, 'site/SolutionCard.astro', 'site/solutions.mjs',
  themeSource,
  'site/Layout.astro', 'site/SearchWorkbench.astro', 'site/SolutionChooser.astro', 'site/StarterSetup.astro', 'site/ExampleShowcase.astro', 'site/styles.css', 'site/workbench.css', 'site/pages.mjs', 'site/navigation.mjs', 'site/shell.mjs', 'site/search.mjs', 'site/search-controller.mjs', 'site/search.css', 'scripts/build-pages.mjs', 'scripts/lib/pages.mjs',
  'scripts/lib/ui-consumer.mjs', 'scripts/lib/packed-consumer.mjs', 'examples/core-docs/corpus.mjs',
  'scripts/lib/inline-starters.mjs', 'site/starters.mjs', ...starters.sourceInputs,
  'README.md', 'package.json', 'package-lock.json', 'LICENSE',
  ...['index.html', 'main.mjs', 'readable-results.mjs', 'engine-worker.mjs', 'configuration.mjs', 'usage-corpus.mjs'].map(name => `examples/docs-search/${name}`),
  ...pilot.package.files.filter(file => file.path.startsWith('dist/')).map(file => file.path)]);
const inputs = await Promise.all([...inputPaths].sort().map(async path => ({ path, sha256: sha256(await readFile(join(root, path))) })));
const manifest = await publishGenerated(join(root, 'docs'), output, inputs);
console.log(JSON.stringify({ status: 'Pass', ...links, files: manifest.files.length,
  bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
  corpusSha256: pilot.corpus.hash, packageSha256: pilot.package.sha256, packagePrivate: pilot.report.package.private }));
