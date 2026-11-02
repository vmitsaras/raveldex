import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { preparePages } from './content.mjs';
const root = fileURLToPath(new URL('./', import.meta.url)), output = join(root, 'dist');
const base = process.env.RAVELDEX_MODAL_BASE ?? '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Base must be / or a slash-terminated local path such as /help/');
const bytes = await readFile(join(root, 'content.json')), pages = preparePages(JSON.parse(bytes));
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
await rm(output, { recursive: true, force: true }); // Only this starter's generated output.
await mkdir(output, { recursive: true });
const bundle = await build({ absWorkingDir: root, entryPoints: ['main.mjs'], outfile: join(output, 'assets/main.js'), bundle: true,
  platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', metafile: true,
  define: { RAVELDEX_CONTENT_SHA256: JSON.stringify(createHash('sha256').update(bytes).digest('hex')) }, logLevel: 'silent' });
await writeFile(join(root, 'build-meta.json'), JSON.stringify(bundle.metafile, null, 2) + '\n');
const links = pages.map(page => `<li><a href="${escape(base + page.path.slice(1))}">${escape(page.title)}</a></li>`).join('\n');
await writeFile(join(output, 'index.html'), (await readFile(join(root, 'index.html'), 'utf8')).replaceAll('{{BASE}}', base).replace('{{BROWSE_LINKS}}', links));
await copyFile(join(root, 'content.json'), join(output, 'content.json'));
for (const page of pages) {
  const file = join(output, page.path.slice(1), 'index.html'); await mkdir(dirname(file), { recursive: true });
  const sections = page.sections.map(section => `<section><h2 id="${escape(section.anchor)}">${escape(section.heading)}</h2><p>${escape(section.body)}</p></section>`).join('\n');
  await writeFile(file, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)}</title><link rel="stylesheet" href="${escape(base)}assets/main.css"></head><body><main><p><a href="${escape(base)}">Search and browse all guides</a></p><p class="eyebrow">${escape(page.category)}</p><h1>${escape(page.title)}</h1>${sections}</main></body></html>`);
}
console.log(`Built ${pages.length} explicit documentation pages at ${base}. Serve dist under that same base.`);
