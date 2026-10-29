import { defineConfig } from 'astro/config';
import raveldexAstro from '@vmitsaras/raveldex-astro';
import content from './content.json' with { type: 'json' };
import { configuration } from './configuration.mjs';
import { qualification } from './qualification.mjs';

export default defineConfig({
  output: 'static', base: process.env.RAVELDEX_ASTRO_BASE ?? '/', trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [raveldexAstro({ configuration: configuration(), buildId: content.buildId,
    getEntries: () => content.entries.map(({ record, title, path }) => ({ record, title, path })),
    nativeQualification: qualification() })],
});
