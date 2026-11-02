import { Admission, keysOnly, ownArray, ownObject, scanUnicode, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { PageSection, PageSectionPage, PageSections } from './types.js';

const PATH = 'sections.map';
export function utf8Bytes(value: string): number { let count=0; for(const char of value){const point=char.codePointAt(0)!;count+=point<=0x7f?1:point<=0x7ff?2:point<=0xffff?3:4;}return count; }
export const SECTION_MAP_BYTES = 4 * 1024 * 1024;
function unicode(value: unknown, maximum: number): string {
  const result = stringValue(value, maximum, 'INVALID_OPTIONS', PATH);
  for (const _ of scanUnicode(result, 'INVALID_OPTIONS', PATH)) { /* synchronous bounded capture */ }
  return result;
}
export function sectionInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid('INVALID_OPTIONS', PATH);
  bound(value, maximum, PATH); return value;
}
export function sectionField(value: unknown): string {
  const result = unicode(value, 64);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(result) || result === 'constructor' || result === 'prototype') invalid('INVALID_OPTIONS', PATH);
  return result;
}
export function compareSections(a: Pick<PageSection, 'field'|'valueIndex'|'start'|'end'>, b: Pick<PageSection, 'field'|'valueIndex'|'start'|'end'>): number {
  return (a.field < b.field ? -1 : a.field > b.field ? 1 : 0) || a.valueIndex - b.valueIndex || a.start - b.start || a.end - b.end;
}
function captureSection(input: unknown, admission: Admission): PageSection {
  const value = ownObject(input, 'INVALID_OPTIONS', PATH, admission);
  keysOnly(value, ['anchor','heading','headingLevel','field','valueIndex','start','end'], 'INVALID_OPTIONS', PATH);
  const anchor = unicode(value.anchor,256), heading = unicode(value.heading,512);
  if (!anchor.length || /[\p{Cc}\t\n\f\r ]/u.test(anchor) || anchor.includes(':~:') || !heading.trim()) invalid('INVALID_OPTIONS', PATH);
  const field = sectionField(value.field), start = sectionInteger(value.start), end = sectionInteger(value.end);
  if (start >= end) invalid('INVALID_OPTIONS', PATH);
  const headingLevel=value.headingLevel;
  if(typeof headingLevel!=='number'||!Number.isInteger(headingLevel)||headingLevel<1||headingLevel>6)invalid('INVALID_OPTIONS',PATH);
  return Object.freeze({ anchor, heading, headingLevel, field,
    valueIndex: sectionInteger(value.valueIndex), start, end });
}
/** Synchronous structural ownership only; originals are validated explicitly later. */
export function captureSectionPages(input: unknown, allowedIds?: ReadonlySet<string>): readonly PageSectionPage[] {
  const admission = new Admission(1_000_000), ids = new Set<string>(); let count = 0;
  const pages = ownArray(input,10_000,'INVALID_OPTIONS',PATH,admission).map(raw => {
    const page = ownObject(raw,'INVALID_OPTIONS',PATH,admission); keysOnly(page,['pageId','sections'],'INVALID_OPTIONS',PATH);
    const pageId = unicode(page.pageId,256);
    if (!pageId.length || ids.has(pageId) || allowedIds && !allowedIds.has(pageId)) invalid('INVALID_OPTIONS',PATH);
    ids.add(pageId);
    const anchors = new Set<string>();
    const sections = ownArray(page.sections,64,'INVALID_OPTIONS',PATH,admission).map(rawSection => {
      const section = captureSection(rawSection,admission);
      if (anchors.has(section.anchor)) invalid('INVALID_OPTIONS',PATH); anchors.add(section.anchor); return section;
    }).sort((a,b) => compareSections(a,b) || (a.anchor < b.anchor ? -1 : a.anchor > b.anchor ? 1 : 0));
    count += sections.length; bound(count,16_384,PATH);
    for (let index=1;index<sections.length;index++) {
      const a=sections[index-1]!, b=sections[index]!;
      if (a.field===b.field && a.valueIndex===b.valueIndex && a.end>b.start) invalid('INVALID_OPTIONS',PATH);
    }
    return Object.freeze({pageId,sections:Object.freeze(sections)});
  }).sort((a,b)=>a.pageId<b.pageId?-1:a.pageId>b.pageId?1:0);
  bound(utf8Bytes(JSON.stringify(pages)),SECTION_MAP_BYTES,PATH);
  return Object.freeze(pages);
}
export function capturePageSections(input: unknown, allowedIds?: ReadonlySet<string>): PageSections {
  const raw=ownObject(input,'INVALID_OPTIONS',PATH,new Admission(1_000_000));
  keysOnly(raw,['kind','version','revision','pages'],'INVALID_OPTIONS',PATH);
  if (raw.kind!=='raveldex-page-sections' || raw.version!==1) invalid('INVALID_OPTIONS',PATH);
  const result=Object.freeze({kind:'raveldex-page-sections' as const,version:1 as const,revision:sectionInteger(raw.revision),pages:captureSectionPages(raw.pages,allowedIds)});
  bound(utf8Bytes(JSON.stringify(result)),SECTION_MAP_BYTES,PATH); return result;
}
