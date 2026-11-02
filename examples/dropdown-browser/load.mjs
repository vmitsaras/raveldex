import { createRaveldex } from '@vmitsaras/raveldex';
import { prepareGuides } from './content.mjs';

export async function loadGuides(contentURL, signal) {
  const response = await fetch(contentURL, { signal, cache: 'no-cache' });
  if (!response.ok || !response.body) throw new Error('Guide data is unavailable');
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4194304) throw new Error('Guide data exceeds the 4MiB example limit');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  signal.throwIfAborted();
  const joined = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) { joined.set(chunk, at); at += chunk.length; }
  const entries = prepareGuides(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)));
  signal.throwIfAborted();
  const engine = createRaveldex({ schema: { text: { title: { boost: 2 }, body: {} } } });
  try {
    for (let offset = 0; offset < entries.length; offset += 100) {
      await engine.addMany(entries.slice(offset, offset + 100).map(entry => ({ id: entry.id,
        text: { title: entry.title, body: entry.body } })), { signal });
    }
    signal.throwIfAborted();
    const base = new URL('./', contentURL);
    return { engine, documents: entries.map(entry => ({ id: entry.id, title: entry.title,
      url: new URL(entry.path.slice(1), base).href })), dispose: () => engine.dispose() };
  } catch (error) { await engine.dispose(); throw error; }
}
