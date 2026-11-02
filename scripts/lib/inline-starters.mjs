import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { STARTERS, starterSource, starterArchive } from '../../site/starters.mjs';
import { BASE } from '../../site/pages.mjs';
import { command, prepareConsumer, REPO_ROOT } from './packed-consumer.mjs';
import { walk } from './pages.mjs';

const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** Build public downloads from exact allowlists and preview a real installed consumer. */
export async function prepareInlineStarters(output, work) {
  const sourceInputs = [];
  for (const starter of STARTERS) {
    const staged = join(work, 'starter-sources', starter.id);
    const archives = join(work, 'starter-archives', starter.id);
    await mkdir(archives, { recursive: true });
    for (const path of starter.files) {
      const source = `examples/${starter.id}/${path}`;
      const bytes = await readFile(join(REPO_ROOT, source));
      sourceInputs.push(source);
      await mkdir(dirname(join(staged, path)), { recursive: true });
      await writeFile(join(staged, path), bytes);
      const publicSource = join(output, starterSource(starter.id, path));
      await mkdir(dirname(publicSource), { recursive: true });
      if (path.endsWith('.astro')) {
        // Jekyll recognizes Astro's --- header as YAML even in a .txt file.
        // A static escaped view preserves the source text; the archive retains
        // the exact original file and path for copying into an application.
        const family = starter.family;
        const label = { modal: 'Documentation modal starters', inline: 'Inline search starters', dropdown: 'Compact header search starter' }[family];
        await writeFile(publicSource, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(starter.id + '/' + path)}</title></head><body><main><h1>${escape(starter.id + '/' + path)}</h1><p><a href="${BASE}examples/${family}/">${label}</a> · <a href="${BASE + starterArchive(starter.id)}">Download complete original source</a></p><pre tabindex="0" style="overflow:auto"><code>${escape(bytes.toString('utf8'))}</code></pre></main></body></html>`);
      } else {
        assert.ok(!/^---\r?\n/.test(bytes.toString('utf8')), 'raw public source must not become Jekyll frontmatter');
        await writeFile(publicSource, bytes);
      }
    }
    const packed = JSON.parse((await command('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', archives,
      '--cache', join(archives, '.npm-cache')], staged)).stdout);
    const [metadata] = Array.isArray(packed) ? packed : Object.values(packed);
    assert.deepEqual(metadata.files.map(item => item.path).sort(), [...starter.files].sort(), 'complete starter archive matches explicit public inventory');
    await copyFile(join(archives, metadata.filename), join(output, starterArchive(starter.id)));
  }

  const packages = [];
  for (const family of ['inline', 'modal', 'dropdown']) {
    const consumer = await prepareConsumer({ records: [], schema: { text: { body: {} } } }, []);
    const browser = STARTERS.find(item => item.id === `${family}-browser`);
    for (const path of browser.files) {
      await mkdir(dirname(join(consumer.directory, path)), { recursive: true });
      await copyFile(join(REPO_ROOT, 'examples', browser.id, path), join(consumer.directory, path));
    }
    // Reuse only the pinned build tool. Every runtime import resolves to the actual
    // freshly installed package tarball; the starter source is unchanged.
    await symlink(join(REPO_ROOT, 'node_modules/esbuild'), join(consumer.directory, 'node_modules/esbuild'), 'dir');
    await command('env', [`RAVELDEX_${family.toUpperCase()}_BASE=${BASE}examples/${family}-preview/`, process.execPath, 'build.mjs'], consumer.directory);
    const built = join(consumer.directory, 'dist');
    for (const path of await walk(built)) {
      const destination = join(output, `examples/${family}-preview`, path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(built, path), destination);
    }
    packages.push(consumer.package);
  }
  return { sourceInputs, packages };
}
