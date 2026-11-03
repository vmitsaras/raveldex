import { createRaveldex } from '@vmitsaras/raveldex';
import { configuration } from './configuration.mjs';
import { validateContent } from './content.mjs';
export async function loadResources(contentUrl, signal) {
  const response = await fetch(contentUrl, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('Resource data is unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 4 * 1024 * 1024) throw new Error('Resource data exceeds the example limit');
  const entries = validateContent(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  signal.throwIfAborted();
  const engine = createRaveldex(configuration());
  try {
    for (let offset=0; offset<entries.length; offset+=100) await engine.addMany(entries.slice(offset,offset+100).map(entry => ({ id:entry.id,
      text:{title:entry.title,body:entry.body},metadata:{format:entry.format,topics:entry.topics} })), { signal });
    signal.throwIfAborted();
    const base = new URL('./', contentUrl);
    return { engine, documents: entries.map(entry => ({ id:entry.id,title:entry.title,url:new URL(entry.path.slice(1),base).href })), dispose:()=>engine.dispose() };
  } catch(error) { await engine.dispose(); throw error; }
}
