import type { SearchResult } from '../../core/contracts/types.js';
import type { FacetResult } from '../facets/options.js';
import type { SnippetDocument, SnippetEvidenceData } from '../snippets/types.js';
import type { CapturedUIOptions } from './options.js';
import { fail } from './options.js';

export function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, hook: string, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.setAttribute(`data-raveldex-${hook}`, '');
  node.className = `raveldex-ui__${hook}`;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(doc: Document, hook: string, text: string): HTMLButtonElement {
  const node = element(doc, 'button', hook, text); node.type = 'button'; return node;
}
/** aria-disabled keeps stable navigation buttons focusable during asynchronous work. */
export function unavailable(node: HTMLButtonElement, value: boolean): void {
  node.setAttribute('aria-disabled', String(value));
}
export function assertResult(result: SearchResult, captured: CapturedUIOptions): void {
  if (!result || result.completeness !== 'complete' || result.model !== 'raveldex-bm25-v1' ||
      !Number.isSafeInteger(result.revision) || result.revision < 0 || !Number.isSafeInteger(result.total) || result.total < 0 || result.total > 10_000 ||
      !Array.isArray(result.hits) || result.hits.length > captured.pageSize || result.hits.length > result.total) fail('INCOMPATIBLE_CAPABILITY', 'result');
  const seen = new Set<string>();
  for (const hit of result.hits) {
    if (!hit || typeof hit.id !== 'string' || !captured.documents.has(hit.id) || seen.has(hit.id) || typeof hit.score !== 'number' || !Number.isFinite(hit.score)) fail('INCOMPATIBLE_CAPABILITY', 'result.hits');
    seen.add(hit.id);
  }
}
export function snippetDocuments(result: SearchResult, main: SearchResult): ReadonlyMap<string, SnippetDocument> {
  const data = result.extensions?.snippets as SnippetEvidenceData | undefined;
  if (!data || data.kind !== 'raveldex-match-evidence-v1' || data.complete !== true || !Array.isArray(data.documents) || data.documents.length !== main.hits.length) fail('INCOMPATIBLE_CAPABILITY', 'snippets');
  if (result.revision !== main.revision || data.revision !== main.revision) fail('REVISION_MISMATCH', 'snippets');
  if (result.total !== main.total || result.hits.length !== main.hits.length || result.hits.some((h, i) => h.id !== main.hits[i]?.id || h.score !== main.hits[i]?.score)) fail('INCOMPATIBLE_CAPABILITY', 'snippets.result');
  const docs = new Map<string, SnippetDocument>();
  for (const item of data.documents) {
    if (!item || !main.hits.some(hit => hit.id === item.id) || docs.has(item.id) || item.eligibility !== 'matched' || !Array.isArray(item.snippets) || item.snippets.length > 3) fail('INCOMPATIBLE_CAPABILITY', 'snippets.documents');
    docs.set(item.id, item);
  }
  return docs;
}
export function resultNodes(doc: Document, captured: CapturedUIOptions, result: SearchResult, snippets?: ReadonlyMap<string, SnippetDocument>): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const hit of result.hits) {
    const source = captured.documents.get(hit.id)!;
    const item = element(doc, 'li', 'result'); item.setAttribute('data-raveldex-result', hit.id);
    const heading = element(doc, 'h3', 'result-heading');
    const link = element(doc, 'a', 'result-title', source.title); link.href = source.url;
    heading.append(link); item.append(heading, element(doc, 'p', 'score', `Score ${hit.score}`));
    const evidence = snippets?.get(hit.id);
    if (evidence) {
      for (const snippet of evidence.snippets) {
        if (!snippet || typeof snippet.text !== 'string' || snippet.text.length > 240 || !Array.isArray(snippet.highlights) || snippet.highlights.length > 32 ||
            typeof snippet.omittedBefore !== 'boolean' || typeof snippet.omittedAfter !== 'boolean') fail('INCOMPATIBLE_CAPABILITY', 'snippets.window');
        const p = element(doc, 'p', 'snippet');
        if (snippet.omittedBefore) { const ellipsis = doc.createElement('span'); ellipsis.setAttribute('aria-hidden', 'true'); ellipsis.textContent = '…'; p.append(ellipsis); }
        let end = 0;
        for (const h of snippet.highlights) {
          if (!h || !Number.isSafeInteger(h.start) || !Number.isSafeInteger(h.end) || h.start < end || h.end <= h.start || h.end > snippet.text.length) fail('INCOMPATIBLE_CAPABILITY', 'snippets.highlight');
          p.append(doc.createTextNode(snippet.text.slice(end, h.start)), element(doc, 'mark', 'highlight', snippet.text.slice(h.start, h.end)));
          end = h.end;
        }
        p.append(doc.createTextNode(snippet.text.slice(end)));
        if (snippet.omittedAfter) { const ellipsis = doc.createElement('span'); ellipsis.setAttribute('aria-hidden', 'true'); ellipsis.textContent = '…'; p.append(ellipsis); }
        item.append(p);
      }
      const omissions = evidence.snippetOmissions;
      if (!omissions || !Number.isSafeInteger(omissions.unshownMatches) || omissions.unshownMatches < 0 || omissions.unshownMatches > 4_096) fail('INCOMPATIBLE_CAPABILITY', 'snippets.omissions');
      if (omissions.unshownMatches) item.append(element(doc, 'p', 'snippet-omissions', `${omissions.unshownMatches} matching occurrences are outside the displayed highlights.`));
    }
    fragment.append(item);
  }
  return fragment;
}
export interface FacetControl {
  readonly field: string;
  readonly select: HTMLSelectElement;
  readonly summary: HTMLParagraphElement;
  values: Map<string, string>;
}
export function facetUpdates(doc: Document, controls: readonly FacetControl[], result: SearchResult): readonly (() => void)[] {
  if (!controls.length) return [];
  const facets = result.extensions?.facets as FacetResult | undefined;
  if (!facets || !Array.isArray(facets.fields) || facets.fields.length !== controls.length) fail('INCOMPATIBLE_CAPABILITY', 'facets');
  return controls.map((control, i) => {
    const current = control.values.get(control.select.value);
    const field = facets.fields[i];
    if (!field || field.field !== control.field || !Array.isArray(field.buckets) || field.buckets.length > 100 ||
        !Number.isSafeInteger(field.distinctValueTotal) || field.distinctValueTotal < field.buckets.length ||
        !Number.isSafeInteger(field.omittedBucketCount) || field.omittedBucketCount !== field.distinctValueTotal - field.buckets.length) fail('INCOMPATIBLE_CAPABILITY', 'facets.field');
    const nodes = doc.createDocumentFragment(), values = new Map<string, string>();
    const all = doc.createElement('option'); all.value = ''; all.textContent = 'All'; nodes.append(all);
    let selected = '', next = 0;
    const seen = new Set<string>();
    for (const bucket of field.buckets) {
      if (!bucket || !Number.isSafeInteger(bucket.count) || bucket.count < 0 || bucket.count > result.total) fail('INCOMPATIBLE_CAPABILITY', 'facets.bucket');
      const option = doc.createElement('option');
      if (bucket.kind === 'value' && typeof bucket.value === 'string') {
        if (bucket.value.length > 1_024 || seen.has(bucket.value)) fail('INCOMPATIBLE_CAPABILITY', 'facets.bucket');
        seen.add(bucket.value); const key = String(next++); values.set(key, bucket.value); option.value = key;
        option.textContent = `${bucket.value || '(empty string)'} (${bucket.count})`;
        if (current === bucket.value) selected = key;
      } else if (bucket.kind === 'value' && bucket.value === null) {
        option.disabled = true; option.textContent = `Null (${bucket.count})`;
      } else if (bucket.kind === 'missing') {
        option.disabled = true; option.textContent = `Missing (${bucket.count})`;
      } else fail('INCOMPATIBLE_CAPABILITY', 'facets.bucket');
      nodes.append(option);
    }
    if (current !== undefined && !seen.has(current)) {
      selected = String(next); values.set(selected, current);
      const option = doc.createElement('option'); option.value = selected; option.textContent = `${current || '(empty string)'} (not in displayed buckets)`; nodes.append(option);
    }
    return () => {
      control.select.replaceChildren(nodes); control.values = values; control.select.value = selected;
      control.summary.textContent = `${field.distinctValueTotal} distinct values; ${field.omittedBucketCount} buckets omitted. Counts include the current filters.`;
    };
  });
}
