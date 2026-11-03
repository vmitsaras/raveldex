import { defineConfig } from 'astro/config';
import raveldexAstro from '@vmitsaras/raveldex-astro';
import content from './content.json' with { type: 'json' };
import { configuration } from './configuration.mjs';
import { validateContent } from './content.mjs';
export default defineConfig({ output:'static',base:process.env.RAVELDEX_ASTRO_BASE??'/',trailingSlash:'always',build:{format:'directory'},devToolbar:{enabled:false},
  integrations:[raveldexAstro({configuration:configuration(),buildId:content.buildId,getEntries:()=>validateContent(content.entries).map(entry=>({
    record:{id:entry.id,text:{title:entry.title,body:entry.body},metadata:{format:entry.format,topics:entry.topics}},title:entry.title,path:entry.path,
  }))})],
});
