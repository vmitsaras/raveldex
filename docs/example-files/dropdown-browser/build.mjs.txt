import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepareGuides } from './content.mjs';

const root = fileURLToPath(new URL('./', import.meta.url)), output = join(root, 'dist');
const base = process.env.RAVELDEX_DROPDOWN_BASE ?? '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Base must be / or a slash-terminated local path such as /help/');
const entries = prepareGuides(JSON.parse(await readFile(join(root, 'content.json'), 'utf8')));
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
await rm(output, { recursive: true, force: true }); // Only this starter's generated output.
await mkdir(output, { recursive: true });
const bundle = await build({ absWorkingDir: root, entryPoints: ['main.mjs'], outfile: join(output, 'assets/main.js'),
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
  treeShaking: true, legalComments: 'none', metafile: true, logLevel: 'silent' });
await writeFile(join(root, 'build-meta.json'), JSON.stringify(bundle.metafile, null, 2) + '\n');
const links = entries.map(entry => `<li><a href="${escape(base + entry.path.slice(1))}">${escape(entry.title)}</a></li>`).join('\n');
const template = await readFile(join(root, 'index.html'), 'utf8');
async function page(path, title, content) {
  const file = join(output, path, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, template.replaceAll('{{BASE}}', base).replaceAll('{{TITLE}}', escape(title))
    .replace('{{PAGE_CONTENT}}', content).replace('{{BROWSE_LINKS}}', links));
}
await page('', 'Compact header search', '<div class="page-intro"><h1>Find a guide from the header</h1><p>Try <strong>walking guide</strong> in the search field above. Browse three quick matches, follow a guide directly, or choose See all results to explore all seven pages.</p><p>Use the arrow keys and Enter to follow a quick result. On smaller screens, the full-results link is always available.</p></div>');
await page('search', 'All search results', '<div class="page-intro"><h1>Search all walking guides</h1><p>Find a walking guide, then follow its title to the complete page. Change your search here to narrow the list.</p></div><section id="results" aria-label="Full search results"><div data-full-results-root><p>Search needs JavaScript. Browse the guide links below.</p></div></section>');
for (const entry of entries) await page(entry.path.slice(1), entry.title,
  `<p><a href="${escape(base)}">Back to all walking guides</a></p><h1>${escape(entry.title)}</h1><p class="guide-meta">Category: ${escape(entry.category)}</p><p>${escape(entry.body)}</p>`);
await copyFile(join(root, 'content.json'), join(output, 'content.json'));
console.log(`Built ${entries.length} explicit guides with header and full-results search at ${base}. Serve dist under that same base.`);
