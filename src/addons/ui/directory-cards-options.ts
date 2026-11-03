import { Admission, ownArray } from '../../core/contracts/data.js';
import { directoryConfigurations, failDirectory, integer, object, text } from './directory-state.js';
import { captureDirectoryView } from './directory-view-options.js';
import type { CapturedDirectoryView } from './directory-view-options.js';
import type { DirectoryCardDocument, DirectoryCardPresentation, DirectoryCardsOptions } from './directory-cards-types.js';
import type { DirectoryViewOptions } from './directory-view-types.js';

const defaults: DirectoryCardPresentation = Object.freeze({ layout: 'list', density: 'comfortable', images: false });
export function captureCardPresentation(input: unknown, previous: DirectoryCardPresentation = defaults): DirectoryCardPresentation {
  const value = object(input, ['layout', 'density', 'images'], 'cards.presentation');
  const layout = Object.hasOwn(value, 'layout') ? value.layout : previous.layout;
  const density = Object.hasOwn(value, 'density') ? value.density : previous.density;
  const images = Object.hasOwn(value, 'images') ? value.images : previous.images;
  if (layout !== 'list' && layout !== 'cards' && layout !== 'grid') failDirectory('cards.layout');
  if (density !== 'compact' && density !== 'comfortable') failDirectory('cards.density');
  if (typeof images !== 'boolean') failDirectory('cards.images');
  return Object.freeze({ layout, density, images });
}
export interface CapturedDirectoryCards {
  readonly view: CapturedDirectoryView;
  readonly documents: ReadonlyMap<string, DirectoryCardDocument>;
  readonly presentation: DirectoryCardPresentation;
  readonly imageUnavailable: string;
}
export function captureDirectoryCards(input: DirectoryCardsOptions): CapturedDirectoryCards {
  const budget = new Admission(300_000);
  const value = object(input, ['root', 'controller', 'documents', 'groups', 'debounceMs', 'filtersOpen', 'messages', 'presentation', 'imageUnavailable'], 'cards', budget);
  let units = 0;
  const label = (raw: unknown, maximum: number, path: string, empty = false): string => {
    const captured = text(raw, maximum, path);
    if ((!empty || captured.length > 0) && /^[\s\p{C}]*$/u.test(captured)) failDirectory(path);
    units += captured.length;
    if (units > 4_000_000) failDirectory('cards.documents', 'LIMIT_EXCEEDED');
    return captured;
  };
  const documents = new Map<string, DirectoryCardDocument>();
  const basic: { id: string; title: string; url: string }[] = [];
  for (const raw of ownArray(value.documents, 10_000, 'INVALID_OPTIONS', 'ui.directory.cards.documents', budget)) {
    const item = object(raw, ['id', 'title', 'url', 'excerpt', 'category', 'breadcrumb', 'date', 'fields', 'image'], 'cards.document', budget);
    const id = text(item.id, 256, 'cards.id'), title = text(item.title, 1_024, 'cards.title'), url = text(item.url, 2_048, 'cards.url');
    units += id.length + title.length + url.length;
    if (units > 4_000_000) failDirectory('cards.documents', 'LIMIT_EXCEEDED');
    const optional = (key: 'excerpt' | 'category' | 'date', maximum: number): string | undefined => {
      if (!Object.hasOwn(item, key)) return undefined;
      return label(item[key], maximum, 'cards.' + key, true) || undefined;
    };
    const excerpt = optional('excerpt', 4_096), category = optional('category', 256), date = optional('date', 256);
    const breadcrumb = item.breadcrumb === undefined ? undefined : Object.freeze(ownArray(item.breadcrumb, 8, 'INVALID_OPTIONS', 'ui.directory.cards.breadcrumb', budget)
      .map(part => label(part, 256, 'cards.breadcrumb')));
    const names = new Set<string>();
    const fields = item.fields === undefined ? undefined : Object.freeze(ownArray(item.fields, 4, 'INVALID_OPTIONS', 'ui.directory.cards.fields', budget).map(rawField => {
      const field = object(rawField, ['name', 'value'], 'cards.field', budget), name = label(field.name, 128, 'cards.field.name'), content = label(field.value, 1_024, 'cards.field.value');
      if (names.has(name)) failDirectory('cards.field.name'); names.add(name);
      return Object.freeze({ name, value: content });
    }));
    let image: DirectoryCardDocument['image'];
    if (item.image !== undefined) {
      const rawImage = object(item.image, ['src', 'alt', 'width', 'height'], 'cards.image', budget);
      const src = label(rawImage.src, 2_048, 'cards.image.src'), alt = label(rawImage.alt, 1_024, 'cards.image.alt', true);
      image = Object.freeze({ src, alt, width: integer(rawImage.width, 1, 4_096, 'cards.image.width'), height: integer(rawImage.height, 1, 4_096, 'cards.image.height') });
    }
    basic.push(Object.freeze({ id, title, url }));
    documents.set(id, Object.freeze({ id, title, url, ...(excerpt === undefined ? {} : { excerpt }), ...(category === undefined ? {} : { category }),
      ...(date === undefined ? {} : { date }), ...(breadcrumb === undefined ? {} : { breadcrumb }), ...(fields === undefined ? {} : { fields }), ...(image === undefined ? {} : { image }) }));
  }
  const base: Record<string, unknown> = { root: value.root, controller: value.controller, documents: basic, groups: value.groups };
  for (const key of ['debounceMs', 'filtersOpen', 'messages']) if (Object.hasOwn(value, key)) base[key] = value[key];
  const view = captureDirectoryView(base as unknown as DirectoryViewOptions);
  for (const [id, item] of documents) {
    const original = view.documents.get(id)!;
    let image = item.image;
    if (image) {
      let resolved: URL;
      try { resolved = new URL(image.src, view.root.ownerDocument.baseURI); } catch { failDirectory('cards.image.src'); }
      if (!['http:', 'https:'].includes(resolved.protocol) || resolved.username || resolved.password) failDirectory('cards.image.src');
      image = Object.freeze({ ...image, src: resolved.href });
    }
    documents.set(id, Object.freeze({ ...item, ...original, ...(image ? { image } : {}) }));
  }
  const imageUnavailable = value.imageUnavailable === undefined ? 'Image unavailable' : label(value.imageUnavailable, 512, 'cards.imageUnavailable');
  const presentation = captureCardPresentation(value.presentation === undefined ? {} : value.presentation);
  // Admission traps may end the borrowed controller after base-view capture.
  if (directoryConfigurations.get(view.controller) !== view.config) failDirectory('view.controller');
  return Object.freeze({ view, documents, presentation, imageUnavailable });
}
