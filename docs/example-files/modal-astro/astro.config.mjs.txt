import { defineConfig } from 'astro/config';
import raveldexAstro from '@vmitsaras/raveldex-astro';
import content from './content.json' with { type: 'json' };
import { configuration } from './configuration.mjs';
import { pageData } from './content.mjs';

export default defineConfig({
  output: 'static', base: process.env.RAVELDEX_ASTRO_BASE ?? '/', trailingSlash: 'always',
  build: { format: 'directory' }, devToolbar: { enabled: false },
  integrations: [raveldexAstro({ configuration: configuration(), buildId: content.buildId,
    getEntries: () => content.entries.map(entry => ({
      record: { id: entry.slug, text: { title: entry.title, body: pageData(entry).body }, metadata: { category: entry.category } },
      title: entry.title, path: `/guide/${entry.slug}/`,
    })),
    pageSections: content.entries.map(entry => ({ pageId: entry.slug, sections: pageData(entry).sections })),
  })],
});
