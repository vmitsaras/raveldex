import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { DOCS_SCHEMA } from '../core-docs/corpus.mjs';

// Demo-only content selection; the independent qualification corpus is unchanged.
export const USAGE_SOURCES = Object.freeze([
  ['docs/api/GETTING_STARTED.md', 'Getting started'],
  ['docs/api/CORE.md', 'Core'],
  ['docs/api/ADDONS.md', 'Add-ons'],
  ['docs/api/HOSTS.md', 'Integrations'],
  ['docs/api/STATIC_ASTRO.md', 'Integrations'],
].map(([path, category]) => Object.freeze({ path, category })));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

export function buildUsageCorpus(root = fileURLToPath(new URL('../../', import.meta.url))) {
  const sources = [], records = [], sections = [];
  for (const { path, category } of USAGE_SOURCES) {
    const bytes = readFileSync(resolve(root, path)), text = bytes.toString('utf8');
    assert.ok(Buffer.from(text).equals(bytes), `Invalid UTF-8: ${path}`);
    const url = `https://github.com/vmitsaras/raveldex/blob/main/${path}`;
    sources.push({ path, category, url, sha256: hash(bytes), bytes: bytes.length });
    const headings = [], slugger = new GithubSlugger();
    let offset = 0, line = 0, fence;
    for (const match of text.matchAll(/[^\n]*(?:\n|$)/g)) {
      const raw = match[0]; if (!raw) continue;
      line++;
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(raw);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      } else if (marker) fence = marker[1];
      else {
        const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(raw);
        if (heading) headings.push({ title: heading[2], depth: heading[1].length,
          anchor: slugger.slug(heading[2]), start: offset, bodyStart: offset + raw.length, line });
      }
      offset += raw.length;
    }
    assert.ok(!fence, `Unclosed code fence: ${path}`);
    const chosen = headings.filter(heading => heading.depth === 2);
    assert.ok(chosen.length > 0, `No usage sections: ${path}`);
    for (const heading of chosen) {
      const next = headings.find(item => item.start > heading.start && item.depth <= heading.depth);
      const body = text.slice(heading.bodyStart, next?.start ?? text.length);
      assert.ok(body.trim(), `Empty usage section: ${path}#${heading.anchor}`);
      const id = `usage:${path}#${heading.anchor}`;
      const record = { id, text: { title: heading.title, body }, metadata: { sourcePath: path, category } };
      records.push(record);
      sections.push({ id, title: heading.title, sourcePath: path, category, anchor: heading.anchor,
        sourceUrl: `${url}#${heading.anchor}`, startLine: heading.line,
        endLine: next ? next.line - 1 : text.split('\n').length - 1, contentHash: hash(JSON.stringify(record)) });
    }
  }
  const content = { algorithmVersion: 'raveldex-usage-guides-v1', hashAlgorithm: 'sha256',
    schema: DOCS_SCHEMA, records, sections, sources };
  return freeze({ ...content, hash: hash(JSON.stringify(content)) });
}
