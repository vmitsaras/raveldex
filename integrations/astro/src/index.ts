import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import type { Configuration } from '@vmitsaras/raveldex';
import type { PageSectionPage } from '@vmitsaras/raveldex/addons/sections';
import type { NativeSnapshotQualification } from '@vmitsaras/raveldex/adapters/snapshots';
import { buildStaticSearch } from './build.js';
import { cloneOwned, object } from './common.js';
import { StaticSearchError } from './error.js';
import type { StaticEntry } from './types.js';

export interface RaveldexAstroOptions {
  readonly configuration: Configuration;
  readonly getEntries: () => readonly StaticEntry[] | Promise<readonly StaticEntry[]>;
  readonly buildId: string;
  readonly nativeQualification?: NativeSnapshotQualification;
  readonly pageSections?: readonly PageSectionPage[];
}

/** Capture trusted handles without calling application code or initializing a host. */
function options(input: RaveldexAstroOptions): RaveldexAstroOptions {
  const data = object(input, ['configuration', 'getEntries', 'buildId', 'nativeQualification', 'pageSections']);
  if (typeof data.configuration !== 'object' || data.configuration === null || typeof data.getEntries !== 'function' || typeof data.buildId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(data.buildId)) throw new StaticSearchError('INVALID_INPUT');
  const budget = { count: 0, maximum: 1_000_000, functions: true };
  data.configuration = cloneOwned(data.configuration, budget);
  budget.functions = false;
  if (Object.hasOwn(data, 'nativeQualification')) data.nativeQualification = cloneOwned(data.nativeQualification, budget);
  if (Object.hasOwn(data, 'pageSections')) data.pageSections = cloneOwned(data.pageSections, budget);
  return Object.freeze(data) as unknown as RaveldexAstroOptions;
}
function basePath(input: string): string {
  if (typeof input !== 'string' || input.length > 512 || !input.startsWith('/') || /[^A-Za-z0-9._~/-]/.test(input) || input.includes('//')) throw new StaticSearchError('INVALID_INPUT');
  if (input.split('/').some(part => part === '.' || part === '..')) throw new StaticSearchError('INVALID_INPUT');
  return input.endsWith('/') ? input : input + '/';
}

/** Static build integration only. Content discovery and client activation stay explicit. */
export default function raveldexAstro(input: RaveldexAstroOptions): AstroIntegration {
  const captured = options(input);
  let base: string | undefined;
  return {
    name: '@vmitsaras/raveldex-astro',
    hooks: {
      'astro:config:done'({ config, buildOutput }) {
        if (config.output !== 'static' || buildOutput !== 'static' || config.build.format !== 'directory') throw new StaticSearchError('INVALID_INPUT');
        base = basePath(config.base);
      },
      async 'astro:build:done'({ dir, logger }) {
        if (base === undefined || dir.protocol !== 'file:') throw new StaticSearchError('INVALID_INPUT');
        const entries = await captured.getEntries();
        const artifacts = await buildStaticSearch({ configuration: captured.configuration, entries, buildId: captured.buildId, base,
          ...(captured.nativeQualification === undefined ? {} : { nativeQualification: captured.nativeQualification }),
          ...(captured.pageSections === undefined ? {} : { pageSections: captured.pageSections }) });
        const output = await realpath(fileURLToPath(dir));
        const namespace = join(output, 'raveldex');
        // Exclusive ownership: existing directories, files and symlinks all fail.
        try { await mkdir(namespace); } catch { throw new StaticSearchError('INVALID_INPUT'); }
        const names = Object.keys(artifacts.files);
        if (!names.includes('manifest.json') || names.some(name => name !== 'manifest.json' && name !== 'sections-manifest.json' && !/^(source|native|documents|sections)-[a-f0-9]{64}\.json$/.test(name))) throw new StaticSearchError('INVALID_ARTIFACT');
        try {
          for (const name of names.filter(name => name !== 'manifest.json' && name !== 'sections-manifest.json').sort()) await writeFile(join(namespace, name), artifacts.files[name]!, { flag: 'wx' });
          if (names.includes('sections-manifest.json')) await writeFile(join(namespace, 'sections-manifest.json'), artifacts.files['sections-manifest.json']!, { flag: 'wx' });
          await writeFile(join(namespace, 'manifest.json'), artifacts.files['manifest.json']!, { flag: 'wx' });
        } catch { throw new StaticSearchError('INVALID_ARTIFACT'); }
        logger.info(`Prepared Raveldex generation ${captured.buildId}: ${artifacts.manifest.recordCount} records.`);
      },
    },
  };
}
