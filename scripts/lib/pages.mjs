import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { BASE, EXCLUDED, JEKYLL } from '../../site/pages.mjs';

export const MANIFEST = '_pages-manifest.json';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const owned = /^(?:index\.html|404\.html|_config\.yml|(?:guide|reference|examples|contracts|demo|example-files|site-assets)\/[A-Za-z0-9_./-]+)$/;
export function safePath(path) {
  assert.equal(typeof path, 'string');
  assert.ok(owned.test(path) && !path.split('/').some(x => !x || x === '.' || x === '..'), `Unmanaged Pages path: ${path}`);
  return path;
}
export async function regularPath(root, path, missing = false) {
  const physical = await realpath(root);
  assert.equal(physical, resolve(root), 'use a physical output root');
  let current = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let info;
    try { info = await lstat(current); } catch (error) {
      if (missing && error.code === 'ENOENT') return false;
      throw error;
    }
    assert.ok(!info.isSymbolicLink(), `Pages refuses symlink: ${path}`);
    assert.ok(i === parts.length - 1 ? info.isFile() : info.isDirectory(), `Invalid Pages path type: ${path}`);
  }
  return true;
}
export async function walk(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = posix.join(prefix, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Pages refuses symlink: ${path}`);
    if (entry.isDirectory()) result.push(...await walk(root, path));
    else { assert.ok(entry.isFile()); result.push(path); }
  }
  return result.sort();
}
export async function loadManifest(root) {
  if (!await regularPath(root, MANIFEST, true)) return undefined;
  const manifest = JSON.parse(await readFile(join(root, MANIFEST), 'utf8'));
  assert.equal(manifest.format, 'raveldex-pages-v1');
  assert.equal(manifest.base, BASE);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'empty Pages manifest');
  const seen = new Set();
  for (const item of manifest.files) {
    safePath(item.path);
    assert.ok(!seen.has(item.path), `Duplicate managed path: ${item.path}`);
    seen.add(item.path);
    assert.match(item.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(item.bytes) && item.bytes >= 0);
  }
  assert.ok(seen.has('index.html') && seen.has('404.html') && seen.has('_config.yml'));
  return manifest;
}
export async function verifyFiles(root, manifest) {
  for (const item of manifest.files) {
    await regularPath(root, item.path);
    const bytes = await readFile(join(root, item.path));
    assert.equal(bytes.length, item.bytes, `Changed managed file: ${item.path}`);
    assert.equal(sha256(bytes), item.sha256, `Changed managed file: ${item.path}`);
  }
}
export async function auditSurface(root, manifest) {
  assert.equal(await readFile(join(root, '_config.yml'), 'utf8'), JEKYLL, 'Jekyll exclusions must match the reviewed configuration');
  const allowed = new Set(manifest.files.map(x => x.path));
  const exposed = [];
  async function visit(prefix = '') {
    for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
      const path = posix.join(prefix, entry.name);
      if (!prefix && EXCLUDED.includes(entry.name)) {
        assert.ok(entry.isDirectory() && !entry.isSymbolicLink(), `Invalid excluded directory: ${path}`);
        continue;
      }
      assert.ok(!entry.isSymbolicLink(), `Pages refuses symlink: ${path}`);
      assert.notEqual(entry.name, '.nojekyll', '.nojekyll bypasses required exclusions');
      if (entry.isDirectory()) await visit(path);
      else {
        assert.ok(entry.isFile());
        assert.ok(path === MANIFEST || allowed.has(path), `Unknown non-excluded Pages file: ${path}`);
        if (path !== MANIFEST && path !== '_config.yml') exposed.push(path);
      }
    }
  }
  await visit();
  return exposed.sort();
}
export async function publishGenerated(root, stage, inputs = []) {
  const paths = await walk(stage);
  paths.forEach(safePath);
  const previous = await loadManifest(root);
  if (previous) { await verifyFiles(root, previous); await auditSurface(root, previous); }
  else {
    // Bootstrap may coexist only with the established excluded source trees.
    for (const entry of await readdir(root)) assert.ok(EXCLUDED.includes(entry), `Unowned docs entry: ${entry}`);
  }
  const previousPaths = new Set(previous?.files.map(x => x.path));
  for (const path of paths) {
    if (await regularPath(root, path, true)) assert.ok(previousPaths.has(path), `Refusing to overwrite unowned file: ${path}`);
  }
  const files = [];
  for (const path of paths) {
    const bytes = await readFile(join(stage, path));
    files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  // Preflight all paths before changing any managed file. Never remove docs/.
  for (const { path } of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), await readFile(join(stage, path)));
  }
  for (const path of previousPaths) if (!paths.includes(path)) await unlink(join(root, path));
  const manifest = { format: 'raveldex-pages-v1', base: BASE, inputs, files };
  await writeFile(join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  await auditSurface(root, manifest);
  return manifest;
}
export async function verifyInputs(repository, manifest) {
  assert.ok(Array.isArray(manifest.inputs) && manifest.inputs.length > 0, 'missing source identities');
  for (const item of manifest.inputs) {
    assert.ok(typeof item.path === 'string' && !item.path.startsWith('/') && !item.path.split('/').some(x => !x || x === '.' || x === '..'), 'unsafe input path');
    await regularPath(repository, item.path);
    assert.equal(sha256(await readFile(join(repository, item.path))), item.sha256, `Stale Pages output; regenerate after changing ${item.path}`);
  }
}
const entities = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
// Inspect actual opening tags. Escaped fenced HTML can contain href/id text
// with ordinary quotes, but those examples are neither links nor targets.
const openingTags = text => [...text.matchAll(/<[A-Za-z](?:[^"'<>]|"[^"]*"|'[^']*')*>/g)].map(match => match[0]).join('\n');
export async function auditLinks(root, manifest) {
  const files = new Set(manifest.files.map(x => x.path));
  const ids = new Map();
  const html = new Map();
  for (const path of files) if (path.endsWith('.html')) {
    const text = openingTags(await readFile(join(root, path), 'utf8'));
    html.set(path, text);
    ids.set(path, new Set([...text.matchAll(/\bid="([^"]+)"/g)].map(x => entities(x[1]))));
  }
  let count = 0;
  for (const [path, text] of html) {
    for (const match of text.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const link = entities(match[1]);
      if (/^(https?:|mailto:|data:)/.test(link)) continue;
      assert.ok(!link.startsWith('//'), `Unexpected remote URL: ${link}`);
      const url = new URL(link, `https://site.invalid${BASE}${path}`);
      assert.ok(url.pathname.startsWith(BASE), `${path}: URL leaves project base: ${link}`);
      let target = decodeURIComponent(url.pathname.slice(BASE.length));
      if (!target || target.endsWith('/')) target += 'index.html';
      assert.ok(files.has(target), `${path}: missing ${link} (${target})`);
      if (url.hash) assert.ok(ids.get(target)?.has(decodeURIComponent(url.hash.slice(1))), `${path}: missing fragment ${link}`);
      count++;
    }
  }
  return { pages: html.size, links: count };
}
export function routeLink(source, link, routes, recipes) {
  let hash = '';
  let target;
  const split = link.indexOf('#');
  if (split >= 0) { hash = link.slice(split); link = link.slice(0, split); }
  const github = /^https:\/\/github\.com\/vmitsaras\/raveldex\/(?:blob|tree)\/main\/(.*)$/.exec(link);
  if (github) target = decodeURIComponent(github[1]);
  else if (/^(?:https?:|mailto:|\/|$)/.test(link)) return { link: link + hash, private: link.startsWith('https://github.com/vmitsaras/raveldex') };
  else target = posix.normalize(posix.join(posix.dirname(source), decodeURIComponent(link)));
  if (routes.has(target)) return { link: routes.get(target) + hash, private: false };
  if (recipes.has(target)) return { link: recipes.get(target) + hash, private: false };
  return { link: `https://github.com/vmitsaras/raveldex/blob/main/${target}${hash}`, private: true };
}
export function rewriteMarkdown(text, source, routes, recipes) {
  // Process prose links only; executable examples and fenced code stay exact.
  let fence;
  return text.split('\n').map(line => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined; return line; }
    if (fence) return line;
    return line.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_, label, link) => {
      const mapped = routeLink(source, link, routes, recipes);
      return `[${label}${mapped.private && !/repository access/i.test(label) ? ' (repository access)' : ''}](${mapped.link})`;
    });
  }).join('\n');
}
