import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateContent } from './content.mjs';
const root=fileURLToPath(new URL('./',import.meta.url)),output=join(root,'dist'),base=process.env.RAVELDEX_CARDS_BASE??'/';
if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))throw new Error('Use / or a slash-terminated local base such as /help/');
const entries=validateContent(JSON.parse(await readFile(join(root,'content.json'),'utf8')));
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
await rm(output,{recursive:true,force:true}); // Only this copied starter's generated output.
await mkdir(output,{recursive:true});
const result=await build({absWorkingDir:root,entryPoints:['main.mjs'],outfile:join(output,'assets/main.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',metafile:true,logLevel:'silent'});
await writeFile(join(root,'build-meta.json'),JSON.stringify(result.metafile,null,2)+'\n');
const links=entries.map(e=>`<li><a href="${escape(base+e.path.slice(1))}">${escape(e.title)}</a></li>`).join('\n');
await writeFile(join(output,'index.html'),(await readFile(join(root,'index.html'),'utf8')).replaceAll('{{BASE}}',base).replace('{{BROWSE_LINKS}}',links));
await copyFile(join(root,'content.json'),join(output,'content.json'));
await mkdir(join(output,'images'),{recursive:true});
for(const path of ['images/map.svg','images/weather.svg']) await copyFile(join(root,path),join(output,path));
for(const entry of entries){const file=join(output,entry.path.slice(1),'index.html');await mkdir(dirname(file),{recursive:true});await writeFile(file,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(entry.title)}</title><link rel="stylesheet" href="${escape(base)}assets/main.css"></head><body><main><a href="${escape(base)}">Back to the rich resource directory</a><p>${escape(entry.format)} · ${escape(entry.topics.join(', '))}</p><h1>${escape(entry.title)}</h1><p>${escape(entry.body)}</p></main></body></html>`);}
console.log(`Built ${entries.length} explicit resources at ${base}.`);
