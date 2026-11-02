import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { command, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

/** Offline test tooling only: pin registry resolution to the checkout lockfile.
 * Registry manifests are reconstructed from locked/installed package metadata,
 * so an ordinary npm ci cache needs only tarballs, never historical packuments.
 * cacache is npm's own bundled tool, not an application/search dependency. */
export async function seedStarterCache(directory, { sourceCache, archivesOnly = false } = {}) {
  await mkdir(directory, { recursive: true });
  const source = sourceCache ?? (await command('npm', ['config', 'get', 'cache', '--logs-max=0'])).stdout.trim();
  const globalRoot = (await command('npm', ['root', '--global', '--cache', directory])).stdout.trim();
  const cache = createRequire(import.meta.url)(join(globalRoot, 'npm/node_modules/cacache'));
  const lock = JSON.parse(await readFile(join(REPO_ROOT, 'package-lock.json'), 'utf8'));
  const manifests = new Map();
  let entries = 0, bytes = 0, verifiedInstalled = 0, optionalMissing = 0;
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || !entry.resolved?.startsWith('https://registry.npmjs.org/') || !entry.integrity) continue;
    const name = path.split('node_modules/').at(-1);
    let metadata;
    try {
      metadata = JSON.parse(await readFile(join(REPO_ROOT, path, 'package.json'), 'utf8'));
      if (metadata.name !== name || metadata.version !== entry.version) throw Error(`Installed tooling differs from lock: ${path}`);
      verifiedInstalled++;
    } catch (error) {
      if (error.code !== 'ENOENT' || !entry.optional) throw error;
      // Platform-specific optional packages need resolution metadata even when
      // npm ci correctly omitted their foreign-OS archive from this host.
      metadata = { ...entry, name }; optionalMissing++;
    }
    const manifest = manifests.get(name) ?? { name, 'dist-tags': {}, versions: {} };
    manifest.versions[entry.version] = { ...metadata, name, version: entry.version,
      dist: { tarball: entry.resolved, integrity: entry.integrity } };
    manifest['dist-tags'].latest ??= entry.version;
    manifests.set(name, manifest);
    try {
      const data = await cache.get.byDigest(join(source, '_cacache'), entry.integrity);
      await cache.put(join(directory, '_cacache'), `inline-starter-locked-tarball:${entry.integrity}`, data);
      entries++; bytes += data.length;
    } catch (error) { if (error.code !== 'ENOENT' || !entry.optional) throw error; }
  }
  for (const [name, manifest] of archivesOnly ? [] : manifests) {
    const url = 'https://registry.npmjs.org/' + name.replace('/', '%2f');
    await cache.put(join(directory, '_cacache'), 'make-fetch-happen:request-cache:' + url, JSON.stringify(manifest), {
      metadata: { time: Date.now(), url, reqHeaders: { accept: 'application/json' },
        resHeaders: { 'cache-control': 'public,max-age=31536000', 'content-type': 'application/json',
          date: new Date().toUTCString() }, options: { compress: true } },
    });
  }
  return { sourceReadOnly: source, writableCache: directory, entries, bytes,
    reconstructedManifests: archivesOnly ? 0 : manifests.size, verifiedInstalled, optionalMissing,
    historicalRegistryManifestsRead: 0,
    scope: 'Locked archive bytes read by integrity; synthesized exact-version resolution metadata from matching installed tooling and foreign-platform optional lock entries. No historical registry manifests, global writes or network.' };
}
