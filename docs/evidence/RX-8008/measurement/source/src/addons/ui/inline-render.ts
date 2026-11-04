import type { SearchResult } from '../../core/contracts/types.js';
import type { SnippetDocument } from '../snippets/types.js';
import type { FacetResult } from '../facets/options.js';
import type { CapturedUIOptions } from './options.js';
import { fail } from './options.js';
import type { InlineUIMessages } from './inline.js';
import type { InlineSectionContext } from './inline-sections.js';
import type { FacetControl } from './render.js';

export type InlineNode = <K extends keyof HTMLElementTagNameMap>(tag: K, part: string, text?: string) => HTMLElementTagNameMap[K];
export function message(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (token, key: string) => Object.hasOwn(values, key) ? String(values[key]) : token);
}
const integer = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

export function inlineResults(doc: Document, node: InlineNode, captured: CapturedUIOptions, result: SearchResult,
  snippets: ReadonlyMap<string, SnippetDocument> | undefined, messages: Required<InlineUIMessages>, sections?: ReadonlyMap<string, InlineSectionContext>): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  for (const hit of result.hits) {
    const source = captured.documents.get(hit.id)!;
    const item = node('li', 'result'); item.setAttribute('data-raveldex-inline-result', hit.id);
    const title = node('h3', 'result-heading'), link = node('a', 'result-title', source.title);
    link.href = source.url; title.append(link); item.append(title);
    const evidence = snippets?.get(hit.id);
    if (evidence) {
      for (const snippet of evidence.snippets) {
        if (!snippet || typeof snippet.text !== 'string' || snippet.text.length > 240 || !Array.isArray(snippet.highlights) || snippet.highlights.length > 32 ||
          !captured.snippetFields.includes(snippet.field) || !integer(snippet.valueIndex) || !integer(snippet.start) || !integer(snippet.end) ||
          snippet.end - snippet.start !== snippet.text.length || typeof snippet.omittedBefore !== 'boolean' || typeof snippet.omittedAfter !== 'boolean') fail('INCOMPATIBLE_CAPABILITY', 'inline.snippet');
        const p = node('p', 'snippet');
        if (snippet.omittedBefore) { const ellipsis = doc.createElement('span'); ellipsis.setAttribute('aria-hidden', 'true'); ellipsis.textContent = '…'; p.append(ellipsis); }
        let end = 0;
        for (const h of snippet.highlights) {
          if (!h || !integer(h.start) || !integer(h.end) || h.start < end || h.end <= h.start || h.end > snippet.text.length) fail('INCOMPATIBLE_CAPABILITY', 'inline.highlight');
          p.append(doc.createTextNode(snippet.text.slice(end, h.start)), node('mark', 'highlight', snippet.text.slice(h.start, h.end))); end = h.end;
        }
        p.append(doc.createTextNode(snippet.text.slice(end)));
        if (snippet.omittedAfter) { const ellipsis = doc.createElement('span'); ellipsis.setAttribute('aria-hidden', 'true'); ellipsis.textContent = '…'; p.append(ellipsis); }
        item.append(p);
      }
      const omitted = evidence.snippetOmissions;
      if (!omitted || !integer(omitted.unshownMatches) || omitted.unshownMatches > 4096 || !integer(omitted.matchTooLong) || !integer(omitted.graphemeTooLong) ||
        typeof omitted.windowLimit !== 'boolean' || typeof omitted.highlightLimit !== 'boolean') fail('INCOMPATIBLE_CAPABILITY', 'inline.omissions');
      if (omitted.unshownMatches) item.append(node('p', 'snippet-omissions', message(messages.snippetOmissions, { count: omitted.unshownMatches })));
      if (omitted.windowLimit || omitted.highlightLimit || omitted.matchTooLong || omitted.graphemeTooLong) item.append(node('p', 'snippet-omissions', messages.snippetLimits));
    }
    const context = sections?.get(hit.id);
    if (context) {
      item.setAttribute('data-raveldex-inline-section-state', context.state);
      if (context.state === 'stale-map' || context.state === 'unavailable') {
        item.append(node('p', 'section-unavailable', context.state === 'stale-map' ? messages.sectionStale : messages.sectionUnavailable));
      } else if (context.page && context.evidence) {
        const evidence = context.evidence;
        if (evidence.sectionPreviews.length) {
          item.append(node('p', 'section-caption', messages.sectionCaption));
          const children = node('ul', 'sections');
          for (const preview of evidence.sectionPreviews) {
            const metadata = context.page.sections[preview.sectionIndex]!;
            const child = node('li', 'section');
            child.setAttribute('data-raveldex-inline-section', metadata.anchor);
            const name = node('a', 'section-title', metadata.heading);
            name.href = context.page.urls[preview.sectionIndex]!;
            child.append(name);
            const snippet = preview.snippet;
            if (snippet) {
              const p = node('p', 'snippet');
              if (snippet.omittedBefore) { const ellipsis = doc.createElement('span'); ellipsis.setAttribute('aria-hidden', 'true'); ellipsis.textContent = '…'; p.append(ellipsis); }
              let end = 0;
              for (const h of snippet.highlights) {
                p.append(doc.createTextNode(snippet.text.slice(end, h.start)), node('mark', 'highlight', snippet.text.slice(h.start, h.end))); end = h.end;
              }
              p.append(doc.createTextNode(snippet.text.slice(end)));
              if (snippet.omittedAfter) { const ellipsis = doc.createElement('span'); ellipsis.setAttribute('aria-hidden', 'true'); ellipsis.textContent = '…'; p.append(ellipsis); }
              child.append(p);
            }
            children.append(child);
          }
          item.append(children);
        }
        const omitted = evidence.sectionOmissions;
        if (omitted.omittedSections || omitted.unmappedRanges || omitted.boundaryRanges || evidence.sectionPreviews.some(p =>
          p.snippetOmissions.unshownMatches || p.snippetOmissions.windowLimit || p.snippetOmissions.highlightLimit || p.snippetOmissions.matchTooLong || p.snippetOmissions.graphemeTooLong)) {
          item.append(node('p', 'section-omissions', messages.sectionOmissions));
        }
      }
    }
    fragment.append(item);
  }
  return fragment;
}

/** Build all option fragments before committing any facet/result presentation. */
export function inlineFacets(doc: Document, controls: readonly FacetControl[], result: SearchResult, messages: Required<InlineUIMessages>): readonly (() => void)[] {
  if (!controls.length) return [];
  const data = result.extensions?.facets as FacetResult | undefined;
  if (!data || !Array.isArray(data.fields) || data.fields.length !== controls.length) fail('INCOMPATIBLE_CAPABILITY', 'inline.facets');
  return controls.map((control, index) => {
    const selected = control.values.get(control.select.value), field = data.fields[index];
    if (!field || field.field !== control.field || !Array.isArray(field.buckets) || field.buckets.length > 100 ||
      !integer(field.distinctValueTotal) || !integer(field.omittedBucketCount) || field.distinctValueTotal < field.buckets.length ||
      field.omittedBucketCount !== field.distinctValueTotal - field.buckets.length) fail('INCOMPATIBLE_CAPABILITY', 'inline.facets.field');
    const fragment = doc.createDocumentFragment(), values = new Map<string, string>(), seen = new Set<string>();
    const all = doc.createElement('option'); all.value = ''; all.textContent = messages.all; fragment.append(all);
    let current = '', next = 0;
    for (const bucket of field.buckets) {
      if (!bucket || !integer(bucket.count) || bucket.count > result.total) fail('INCOMPATIBLE_CAPABILITY', 'inline.facets.bucket');
      const option = doc.createElement('option');
      if (bucket.kind === 'value' && typeof bucket.value === 'string') {
        if (bucket.value.length > 1024 || seen.has(bucket.value)) fail('INCOMPATIBLE_CAPABILITY', 'inline.facets.bucket');
        seen.add(bucket.value); option.value = String(next++); values.set(option.value, bucket.value);
        option.textContent = `${bucket.value || messages.emptyValue} (${bucket.count})`;
        if (selected === bucket.value) current = option.value;
      } else if (bucket.kind === 'value' && bucket.value === null) {
        option.disabled = true; option.textContent = `${messages.nullValue} (${bucket.count})`;
      } else if (bucket.kind === 'missing') {
        option.disabled = true; option.textContent = `${messages.missingValue} (${bucket.count})`;
      } else fail('INCOMPATIBLE_CAPABILITY', 'inline.facets.bucket');
      fragment.append(option);
    }
    if (selected !== undefined && !seen.has(selected)) {
      current = String(next); values.set(current, selected); const option = doc.createElement('option'); option.value = current;
      option.textContent = message(messages.unlistedValue, { value: selected || messages.emptyValue }); fragment.append(option);
    }
    return () => {
      control.select.replaceChildren(fragment); control.values = values; control.select.value = current;
      control.summary.textContent = message(messages.facetSummary, { total: field.distinctValueTotal, omitted: field.omittedBucketCount });
    };
  });
}

/** Invalidate old counts while preserving the active string selection. */
export function resetInlineFacets(doc: Document, controls: readonly FacetControl[], messages: Required<InlineUIMessages>): void {
  for (const control of controls) {
    const selected = control.values.get(control.select.value), all = doc.createElement('option');
    all.value = ''; all.textContent = messages.all; control.select.replaceChildren(all); control.values = new Map();
    if (selected !== undefined) {
      const option = doc.createElement('option'); option.value = '0'; option.textContent = message(messages.unlistedValue, { value: selected || messages.emptyValue });
      control.select.append(option); control.values.set('0', selected); control.select.value = '0';
    }
    control.summary.textContent = '';
  }
}
