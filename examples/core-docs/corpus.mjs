import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This application owns source text. The engine receives only declared fields.
// Every entry names an existing complete section, never a synthetic summary.
export const CORPUS_ALGORITHM_VERSION = 'raveldex-doc-sections-v1';
export const CORPUS_HASH_ALGORITHM = 'sha256';
const REPOSITORY_URL = 'https://github.com/vmitsaras/raveldex';
const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const DOCS_SCHEMA = freeze({
  text: { title: { boost: 2 }, body: { boost: 1 } },
  metadata: {
    sourcePath: { type: 'string', multi: false, nullable: false },
    category: { type: 'string', multi: false, nullable: false },
  },
});

export const SOURCE_ALLOWLIST = freeze([
  {
    path: 'docs/specs/CORE_CONTRACT.md', category: 'spec',
    headings: [
      'Public API contract',
      'Schema',
      'Record',
      'Ownership and retention',
      'Normative algorithm',
      'Examples and intentional limits',
      'Source mapping',
      'Environment compatibility',
      'Core nodes',
      'Boolean groups and repeated terms',
      'Exact and prefix terms',
      'Scalar equality',
      'Results and errors',
      'Finite initial limits',
    ],
  },
  {
    path: 'docs/specs/RANKING.md', category: 'spec',
    headings: [
      'Statistics from one revision',
      'Term contribution',
      'Original groups and alternatives',
      'Boolean qualification and score participation',
      'Deterministic accumulation and ordering',
      'Explanation facts',
    ],
  },
  {
    path: 'docs/specs/MUTATIONS_AND_EXECUTION.md', category: 'spec',
    headings: [
      'Admission and concurrent calls',
      'Mutation behavior',
      'Incremental staging',
      'Revisions and the commit boundary',
      'State transitions and cancellation',
      'Work, deadline, and yield accounting',
      'Disposal',
    ],
  },
  {
    path: 'docs/architecture/NATIVE_ARCHITECTURE.md', category: 'architecture',
    headings: [
      'Product boundary',
      'State model',
      'Query execution pipeline',
      'Analyzer/environment boundary',
    ],
  },
  {
    path: 'docs/architecture/ADDONS_AND_ADAPTERS.md', category: 'architecture',
    headings: [
      'Registration and effect contracts',
      'Strict phrase capability',
      'Snapshots and IndexedDB',
    ],
  },
]);

function sha256(value) {
  return createHash(CORPUS_HASH_ALGORITHM).update(value).digest('hex');
}

// Selected titles use the ordinary GitHub generated-heading alphabet. Refuse a
// new unsupported title instead of silently inventing a wrong source anchor.
function anchorFor(title) {
  if (!/^[A-Za-z0-9 ,/\-]+$/.test(title)) {
    throw new Error(`Unsupported documentation heading: ${title}`);
  }
  return title.toLowerCase().replace(/[,/]/g, '').replace(/ /g, '-');
}

function headingsIn(source) {
  const headings = [];
  let offset = 0;
  let line = 0;
  let fence;
  for (const match of source.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!match[0].length) continue;
    line += 1;
    const rawLine = match[0];
    const text = rawLine.replace(/\r?\n$/, '');
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
    } else {
      const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/.exec(text);
      if (heading) headings.push({ title: heading[2], depth: heading[1].length, start: offset, bodyStart: offset + rawLine.length, line });
    }
    offset += rawLine.length;
  }
  if (fence) throw new Error('Documentation contains an unclosed fenced code block');
  return headings;
}

function validateAllowlist() {
  const paths = new Set();
  for (const source of SOURCE_ALLOWLIST) {
    if (!/^docs\/(specs|architecture)\/[A-Z_]+\.md$/.test(source.path)
      || source.path.split('/')[1] !== (source.category === 'spec' ? 'specs' : 'architecture')
      || !['spec', 'architecture'].includes(source.category)
      || paths.has(source.path)) {
      throw new Error(`Unexpected or duplicate allowlist path: ${source.path}`);
    }
    paths.add(source.path);
    if (!source.headings.length || new Set(source.headings).size !== source.headings.length) {
      throw new Error(`Duplicate or empty section allowlist: ${source.path}`);
    }
  }
}

/**
 * Read current allowlisted source bytes and return records plus application-owned
 * source descriptors. A section ends at the next heading at the same/shallower
 * depth; nested content, code fences, whitespace, and Markdown remain unedited.
 * Source SHA-256 covers the entire file. Content SHA-256 covers each exact record.
 * Corpus SHA-256 covers version/schema/records/descriptors and all source hashes.
 */
export function buildCorpus(repoRoot = DEFAULT_ROOT) {
  validateAllowlist();
  const sources = [];
  const records = [];
  const sections = [];
  const ids = new Set();
  for (const allowed of SOURCE_ALLOWLIST) {
    const bytes = readFileSync(resolve(repoRoot, allowed.path));
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) throw new Error(`Invalid UTF-8 documentation: ${allowed.path}`);
    const headings = headingsIn(source);
    const pathUrl = `${REPOSITORY_URL}/blob/main/${allowed.path}`;
    sources.push({ path: allowed.path, category: allowed.category, url: pathUrl, sha256: sha256(bytes), bytes: bytes.length });
    for (const title of allowed.headings) {
      const candidates = headings.filter((heading) => heading.title === title);
      if (candidates.length !== 1) throw new Error(`Expected exactly one heading ${JSON.stringify(title)} in ${allowed.path}; found ${candidates.length}`);
      const heading = candidates[0];
      const anchor = anchorFor(title);
      // All selected titles are plain text, so an identical generated anchor
      // elsewhere in the source would make the selected link ambiguous.
      const collisions = headings.filter((entry) => /^[A-Za-z0-9 ,/\-]+$/.test(entry.title) && anchorFor(entry.title) === anchor);
      if (collisions.length !== 1) throw new Error(`Ambiguous documentation anchor: ${allowed.path}#${anchor}`);
      const following = headings.find((entry) => entry.start > heading.start && entry.depth <= heading.depth);
      const end = following?.start ?? source.length;
      const body = source.slice(heading.bodyStart, end);
      if (!body.trim()) throw new Error(`Empty documentation section: ${allowed.path}#${anchor}`);
      const id = `doc:${allowed.path}#${anchor}`;
      if (ids.has(id)) throw new Error(`Duplicate documentation record: ${id}`);
      ids.add(id);
      const record = { id, text: { title, body }, metadata: { sourcePath: allowed.path, category: allowed.category } };
      records.push(record);
      sections.push({
        id, title, sourcePath: allowed.path, category: allowed.category, anchor,
        sourceUrl: `${pathUrl}#${anchor}`, startLine: heading.line,
        endLine: following ? following.line - 1 : source.split('\n').length - (source.endsWith('\n') ? 1 : 0),
        contentHash: sha256(JSON.stringify(record)),
      });
    }
  }
  const content = { algorithmVersion: CORPUS_ALGORITHM_VERSION, hashAlgorithm: CORPUS_HASH_ALGORITHM, schema: DOCS_SCHEMA, records, sections, sources };
  return freeze({ ...content, hash: sha256(JSON.stringify(content)) });
}
