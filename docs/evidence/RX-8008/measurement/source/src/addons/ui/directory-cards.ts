import { captureCardPresentation, captureDirectoryCards } from './directory-cards-options.js';
import { mountDirectoryView } from './directory-view-mount.js';
import type { DirectoryViewExtension } from './directory-view-mount.js';
import type { DirectoryCardDocument, DirectoryCardsHandle, DirectoryCardsOptions } from './directory-cards-types.js';
export type { DirectoryCardDocument, DirectoryCardPresentation, DirectoryCardsOptions, DirectoryCardsHandle } from './directory-cards-types.js';

interface RenderedCard {
  readonly item: HTMLLIElement;
  readonly display: DirectoryCardDocument;
  image?: { readonly frame: HTMLElement; readonly dispose: () => void };
}

/** Declared safe display projection over the same borrowed directory owner. */
export function mountRaveldexDirectoryCards(options: DirectoryCardsOptions): DirectoryCardsHandle {
  const captured = captureDirectoryCards(options), doc = captured.view.root.ownerDocument;
  let presentation = captured.presentation, shell: HTMLElement | undefined, live = (): boolean => false;
  const rendered: RenderedCard[] = [];
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, suffix: string, text?: string): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag); element.className = `raveldex-directory-cards__${suffix}`;
    element.setAttribute(`data-raveldex-directory-card-${suffix}`, '');
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const removeImage = (card: RenderedCard): void => { card.image?.dispose(); card.image?.frame.remove(); delete card.image; };
  function addImage(card: RenderedCard): void {
    const data = card.display.image;
    if (!data || card.image || !presentation.images) return;
    const frame = node('div', 'image-frame'), image = node('img', 'image');
    frame.style.aspectRatio = `${data.width} / ${data.height}`;
    image.alt = data.alt; image.width = data.width; image.height = data.height;
    image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    if (!data.alt) frame.setAttribute('aria-hidden', 'true');
    const failed = (): void => {
      if (!live() || card.image?.frame !== frame || frame.parentNode !== card.item) return;
      image.removeEventListener('error', failed); image.removeAttribute('src'); image.remove();
      if (data.alt) {
        frame.style.removeProperty('aspect-ratio'); frame.classList.add('is-unavailable');
        frame.append(node('span', 'image-unavailable', `${captured.imageUnavailable}: ${data.alt}`));
      }
      else frame.remove();
    };
    image.addEventListener('error', failed);
    card.image = { frame, dispose: (): void => { image.removeEventListener('error', failed); image.removeAttribute('src'); } };
    frame.append(image); card.item.prepend(frame); image.src = data.src;
  }
  const applyPresentation = (): void => {
    if (!shell) return;
    shell.dataset.layout = presentation.layout; shell.dataset.density = presentation.density; shell.dataset.images = String(presentation.images);
  };
  const clear = (): void => { for (const card of rendered) removeImage(card); rendered.length = 0; };
  const extension: DirectoryViewExtension = {
    kind: 'directory-cards',
    initialize: (element, isLive): void => { shell = element; live = isLive; shell.classList.add('raveldex-directory-cards'); applyPresentation(); },
    render: (item, link, basic): void => {
      const display = captured.documents.get(basic.id)!, card: RenderedCard = { item, display };
      const title = node('h3', 'title'); title.append(link); item.append(title);
      if (display.category) item.append(node('p', 'category', display.category));
      if (display.breadcrumb?.length) item.append(node('p', 'breadcrumb', display.breadcrumb.join(' › ')));
      if (display.excerpt) item.append(node('p', 'excerpt', display.excerpt));
      if (display.date) item.append(node('p', 'date', display.date));
      if (display.fields?.length) {
        const fields = node('dl', 'fields');
        for (const field of display.fields) { const row = node('div', 'field'); row.append(node('dt', 'field-name', field.name), node('dd', 'field-value', field.value)); fields.append(row); }
        item.append(fields);
      }
      rendered.push(card); addImage(card);
    },
    clear,
    destroy: (): void => { clear(); shell = undefined; live = (): boolean => false; },
    extend: base => Object.freeze({ ...base,
      getPresentation: () => presentation,
      setPresentation: (input: Parameters<DirectoryCardsHandle['setPresentation']>[0]): void => {
        if (!live()) return;
        const previous = presentation, next = captureCardPresentation(input, previous);
        if (!live() || presentation !== previous) return;
        const imagesChanged = next.images !== previous.images;
        presentation = next; applyPresentation();
        if (imagesChanged) for (const card of rendered) if (presentation.images) addImage(card); else removeImage(card);
      },
    }),
  };
  return mountDirectoryView(captured.view, extension) as DirectoryCardsHandle;
}
