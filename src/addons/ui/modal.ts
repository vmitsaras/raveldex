import { mountRaveldexInline } from './inline.js';
import type { InlineUIHandle, InlineUIOptions } from './inline.js';
import { prepareInlineHost } from './inline-lifecycle.js';
import type { InlinePresentation } from './inline-lifecycle.js';
import { mounted } from './mounts.js';
import { displayName, fail, record } from './options.js';
import { registerModalShortcut } from './modal-shortcuts.js';
import { acquireModalScroll } from './modal-scroll.js';

export interface ModalUIMessages {
  readonly title: string;
  readonly close: string;
  readonly escapeHint: string;
  readonly shortcutHint: string;
}
export interface ModalUIOptions extends InlineUIOptions {
  readonly trigger: HTMLButtonElement;
  readonly resetOnClose?: boolean;
  readonly shortcut?: boolean;
  readonly keyboardHints?: boolean;
  readonly modalMessages?: Partial<ModalUIMessages>;
}
export interface ModalUIHandle extends InlineUIHandle {
  readonly open: () => void;
  readonly close: () => void;
}

const defaults: ModalUIMessages = Object.freeze({ title: 'Search documentation', close: 'Close search',
  escapeHint: 'Esc to close', shortcutHint: 'Ctrl/⌘ K' });
const triggers = new WeakMap<HTMLButtonElement, ModalUIHandle>();
const activeDialogs = new WeakMap<Document, HTMLDialogElement>();
let mountNumber = 0;

function focused(doc: Document, knownRoots: readonly ShadowRoot[] = []): Element | null {
  let element = doc.activeElement;
  while (element) {
    const root = element.shadowRoot ?? knownRoots.find(value => value.host === element);
    if (!root?.activeElement) break;
    element = root.activeElement;
  }
  return element;
}
function otherModal(doc: Document, dialog: HTMLDialogElement, knownRoots: readonly ShadowRoot[]): boolean {
  const owned = activeDialogs.get(doc);
  if (owned && owned !== dialog && owned.open && owned.isConnected && owned.ownerDocument === doc) return true;
  if (Array.from(doc.querySelectorAll('dialog:modal')).some(value => value !== dialog)) return true;
  // Focus can be inside an open shadow tree, which document selectors do not cross.
  let element = focused(doc, knownRoots);
  // Closed trees cannot be inspected. Refuse unknown focused shadow-capable hosts
  // rather than stacking over a native modal concealed behind that boundary.
  // Known root/trigger trees remain inspectable through their captured references.
  // BODY is also the platform's ordinary no-focus fallback, so an unknown
  // closed tree attached directly to BODY cannot be distinguished here.
  if (element && !element.shadowRoot && !knownRoots.some(value => value.host === element) &&
    (element.localName.includes('-') || ['article', 'aside', 'blockquote', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'header', 'main', 'nav', 'p', 'section', 'span'].includes(element.localName))) return true;
  while (element) {
    if (element !== dialog && element.matches('dialog:modal')) return true;
    element = element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null;
  }
  return false;
}
function opener(doc: Document, candidate: Element | null, fallback: HTMLButtonElement): HTMLElement {
  if (candidate && candidate !== doc.body && candidate !== doc.documentElement && candidate.isConnected && candidate.ownerDocument === doc &&
    typeof (candidate as HTMLElement).focus === 'function') return candidate as HTMLElement;
  return fallback;
}
interface Attribute { readonly original: string | null; last: string }
interface Session { readonly generation: number; readonly opener: HTMLElement; readonly nativeOpener: Element | null }
interface Gesture { readonly generation: number; readonly pointer: number; ready: boolean }

/** Explicit native documentation dialog. Its application-owned engine is always borrowed. */
export function mountRaveldexModal(options: ModalUIOptions): ModalUIHandle {
  const descriptor = options && typeof options === 'object' ? Object.getOwnPropertyDescriptor(options, 'root') : undefined;
  if (!descriptor || !('value' in descriptor)) fail('INVALID_OPTIONS', 'root');
  const existing = mounted.get(descriptor.value as HTMLElement);
  if (existing) {
    if (existing.kind !== 'modal') fail('INVALID_OPTIONS', 'root');
    return existing.handle as ModalUIHandle;
  }
  const o = record(options, ['root', 'engine', 'documents', 'pageSize', 'debounceMs', 'mode', 'messages', 'facets', 'snippetFields',
    'maxRenderedResults', 'pageSections', 'maxSectionPreviews', 'trigger', 'resetOnClose', 'shortcut', 'keyboardHints', 'modalMessages'], 'modal.options');
  const root = o.root as HTMLElement;
  if (!root || root.nodeType !== 1 || !root.ownerDocument || !root.isConnected || typeof root.replaceChildren !== 'function') fail('INVALID_OPTIONS', 'root');
  const doc = root.ownerDocument, win = doc.defaultView, trigger = o.trigger as HTMLButtonElement;
  if (!win || !trigger || !(trigger instanceof win.HTMLButtonElement) || trigger.ownerDocument !== doc || !trigger.isConnected || root.contains(trigger)) fail('INVALID_OPTIONS', 'modal.trigger');
  if (triggers.has(trigger)) fail('INVALID_OPTIONS', 'modal.trigger');
  const knownRoots: ShadowRoot[] = [];
  for (const element of [root, trigger]) {
    let tree = element.getRootNode();
    while (tree instanceof win.ShadowRoot) {
      if (!knownRoots.includes(tree)) knownRoots.push(tree);
      tree = tree.host.getRootNode();
    }
  }
  for (const name of ['resetOnClose', 'shortcut', 'keyboardHints']) {
    if (o[name] !== undefined && typeof o[name] !== 'boolean') fail('INVALID_OPTIONS', `modal.${name}`);
  }
  const reset = o.resetOnClose === true, shortcut = o.shortcut === true, hints = o.keyboardHints !== false;
  const suppliedMessages = record(o.modalMessages ?? {}, Object.keys(defaults), 'modal.messages');
  const messages = { ...defaults };
  for (const name of Object.keys(suppliedMessages) as (keyof ModalUIMessages)[]) {
    Object.defineProperty(messages, name, { value: displayName(suppliedMessages[name], 512, `modal.messages.${name}`), enumerable: true });
  }
  Object.freeze(messages);
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, part: string, text?: string): HTMLElementTagNameMap[K] => {
    const value = doc.createElement(tag); value.className = `raveldex-modal__${part}`;
    value.setAttribute(`data-raveldex-modal-${part}`, '');
    if (text !== undefined) value.textContent = text;
    return value;
  };
  const dialog = node('dialog', 'dialog');
  if (typeof dialog.showModal !== 'function' || typeof dialog.close !== 'function') fail('UNSUPPORTED_ENVIRONMENT', 'modal.dialog');
  dialog.className = 'raveldex-modal'; dialog.id = `raveldex-modal-${++mountNumber}`;
  dialog.setAttribute('closedby', 'closerequest');
  const header = node('header', 'header'), title = node('h2', 'title', messages.title), closeButton = node('button', 'close', messages.close);
  title.id = `${dialog.id}-title`; dialog.setAttribute('aria-labelledby', title.id); closeButton.type = 'button';
  header.append(title, closeButton);
  const inlineRoot = doc.createElement('div');
  const inlineOptions: Record<string, unknown> = { ...o, root: inlineRoot };
  for (const name of ['trigger', 'resetOnClose', 'shortcut', 'keyboardHints', 'modalMessages']) delete inlineOptions[name];
  let presentation!: InlinePresentation;
  let presentationActive = (): boolean => false;
  const releaseHost = prepareInlineHost(inlineRoot, {
    active: () => presentationActive(),
    layout: parts => {
      const search = node('div', 'search'), body = node('div', 'body');
      parts.input.autofocus = true; search.append(parts.form); body.append(parts.facets, ...parts.feedback); parts.shell.replaceChildren(search, body);
    },
    connect: value => { presentation = value; },
  });
  let inline: InlineUIHandle;
  try { inline = mountRaveldexInline(inlineOptions as unknown as InlineUIOptions); }
  finally { releaseHost(); }
  // Keep the existing inline component as the theme scope, without an extra layout wrapper.
  dialog.append(header, ...Array.from(inlineRoot.childNodes));
  if (hints) {
    const footer = node('footer', 'footer'); footer.append(node('span', 'hint', messages.escapeHint));
    if (shortcut) footer.append(node('span', 'hint', messages.shortcutHint));
    dialog.append(footer);
  }
  const originalNodes = Array.from(root.childNodes), attributes = new Map<string, Attribute>(), listeners: (() => void)[] = [];
  let destroyed = false, closing = false, generation = 0, session: Session | undefined, gesture: Gesture | undefined;
  let unlockScroll: (() => void) | undefined;
  const listen = (target: EventTarget, name: string, listener: EventListener): void => {
    target.addEventListener(name, listener); listeners.push(() => target.removeEventListener(name, listener));
  };
  const usable = (): boolean => !destroyed && root.isConnected && root.ownerDocument === doc && dialog.isConnected && dialog.ownerDocument === doc && root.contains(dialog);
  presentationActive = (): boolean => !!session && usable() && dialog.open && dialog.matches(':modal');
  const eligible = (): boolean => {
    // Known closed root/trigger trees can expose editing focus even when the
    // document's composed key path stops at their otherwise opaque host.
    const active = focused(doc, knownRoots) as HTMLElement | null;
    return usable() && trigger.isConnected && trigger.ownerDocument === doc && !trigger.matches(':disabled') &&
      !active?.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName ?? '') && !otherModal(doc, dialog, knownRoots);
  };
  const current = (ticket: number): boolean => !destroyed && session?.generation === ticket && generation === ticket;
  const ownAttribute = (name: string, value: string): void => {
    const prior = attributes.get(name);
    if (prior) prior.last = value; else attributes.set(name, { original: trigger.getAttribute(name), last: value });
    trigger.setAttribute(name, value);
  };
  const releaseScroll = (): void => {
    const release = unlockScroll; unlockScroll = undefined; release?.();
  };
  const finish = (nativeClosed = false): void => {
    const previous = session;
    if (destroyed || !previous) return;
    const active = focused(doc, knownRoots), hadFocus = !!active && (dialog.contains(active) || active === dialog || nativeClosed &&
      (active === previous.opener || active === previous.nativeOpener || active === doc.body));
    const ticket = ++generation; session = undefined; gesture = undefined; closing = true;
    presentation.suspend(reset);
    if (destroyed || generation !== ticket) return;
    ownAttribute('aria-expanded', 'false');
    if (destroyed || generation !== ticket) return;
    releaseScroll(); if (activeDialogs.get(doc) === dialog) activeDialogs.delete(doc);
    if (dialog.open) dialog.close();
    if (destroyed || generation !== ticket) return;
    closing = false;
    const now = focused(doc, knownRoots), related = !now || now === doc.body || now === previous.opener || now === previous.nativeOpener || dialog.contains(now);
    if (hadFocus && related && previous.opener.isConnected && previous.opener.ownerDocument === doc && !otherModal(doc, dialog, knownRoots)) {
      previous.opener.focus({ preventScroll: true });
    }
  };
  const open = (fromTrigger = false): boolean => {
    if (destroyed || closing) return false;
    if (session) {
      if (usable() && dialog.open && dialog.matches(':modal')) return !otherModal(doc, dialog, knownRoots);
      // Native close is queued, and removal can leave an open attribute without modality.
      finish(!dialog.open);
      if (destroyed || closing || session) return false;
    }
    if (!usable() || otherModal(doc, dialog, knownRoots)) return false;
    if (dialog.open) return false;
    const nativeOpener = focused(doc, knownRoots), ticket = ++generation;
    session = { generation: ticket, opener: fromTrigger ? trigger : opener(doc, nativeOpener, trigger), nativeOpener };
    activeDialogs.set(doc, dialog); ownAttribute('aria-expanded', 'true');
    if (!current(ticket)) return false;
    if (!usable() || otherModal(doc, dialog, knownRoots)) { finish(); return false; }
    unlockScroll = acquireModalScroll(doc);
    try { dialog.showModal(); }
    catch (reason) { if (current(ticket)) finish(); throw reason; }
    if (!current(ticket) || !dialog.open || otherModal(doc, dialog, knownRoots)) { if (current(ticket)) finish(!dialog.open); return false; }
    presentation.resume();
    if (current(ticket) && dialog.open && !otherModal(doc, dialog, knownRoots)) presentation.focus();
    return current(ticket) && dialog.open;
  };
  const outside = (event: MouseEvent): boolean => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom;
  };
  const reconcilePresentation = (): void => {
    // Native close queues its event, and removal can retain the open attribute.
    // Public controls must pause the old presentation before either event arrives.
    if (session && (!usable() || !dialog.open || !dialog.matches(':modal'))) finish(!dialog.open);
  };
  const handle: ModalUIHandle = Object.freeze({
    search: (text?: string): Promise<void> => {
      if (destroyed) return Promise.resolve();
      reconcilePresentation();
      return destroyed ? Promise.resolve() : inline.search(text);
    },
    clear: (): void => { if (!destroyed) { reconcilePresentation(); if (!destroyed) inline.clear(); } },
    open: (): void => { open(); },
    close: (): void => { finish(); },
    destroy: (): void => {
      if (destroyed) return;
      const previous = session, active = focused(doc, knownRoots), hadFocus = !!active && (active === dialog || dialog.contains(active));
      destroyed = true; generation++; closing = true; session = undefined; gesture = undefined;
      for (const remove of listeners) remove();
      presentation.suspend(false); releaseScroll();
      if (activeDialogs.get(doc) === dialog) activeDialogs.delete(doc);
      if (dialog.open) dialog.close();
      inline.destroy();
      if (triggers.get(trigger) === handle) {
        for (const [name, owned] of attributes) {
          if (triggers.get(trigger) !== handle || trigger.getAttribute(name) !== owned.last) continue;
          if (owned.original === null) trigger.removeAttribute(name); else trigger.setAttribute(name, owned.original);
        }
        if (triggers.get(trigger) === handle) triggers.delete(trigger);
      }
      if (mounted.get(root)?.handle !== handle) return;
      mounted.delete(root); root.replaceChildren(...originalNodes);
      const now = focused(doc, knownRoots), related = !now || now === doc.body || now === previous?.opener || now === previous?.nativeOpener || dialog.contains(now);
      if (previous && hadFocus && related && !mounted.has(root) && previous.opener.isConnected && previous.opener.ownerDocument === doc && !otherModal(doc, dialog, knownRoots)) {
        previous.opener.focus({ preventScroll: true });
      }
    },
  });
  // Claim both surfaces before authored disconnection or attribute callbacks can reenter.
  mounted.set(root, { kind: 'modal', handle }); triggers.set(trigger, handle);
  try {
    listen(trigger, 'click', () => { open(true); });
    listen(closeButton, 'click', () => { finish(); });
    listen(dialog, 'cancel', event => { if (session) { event.preventDefault(); finish(); } });
    listen(dialog, 'close', () => { if (!dialog.open) finish(true); });
    listen(dialog, 'pointerdown', event => {
      const pointer = event as PointerEvent; gesture = undefined;
      if (session && pointer.button === 0 && pointer.isPrimary && outside(pointer)) gesture = { generation, pointer: pointer.pointerId, ready: false };
    });
    listen(dialog, 'pointerup', event => {
      const pointer = event as PointerEvent;
      if (!gesture || !session || gesture.generation !== generation || gesture.pointer !== pointer.pointerId || pointer.button !== 0 || !pointer.isPrimary || !outside(pointer)) { gesture = undefined; return; }
      gesture.ready = true;
    });
    listen(dialog, 'pointercancel', () => { gesture = undefined; });
    listen(dialog, 'click', event => {
      const pointer = event as PointerEvent, prior = gesture; gesture = undefined;
      if (prior?.ready && session && prior.generation === generation && pointer.pointerId === prior.pointer && pointer.button === 0 && outside(pointer)) finish();
    });
    if (shortcut) listeners.push(registerModalShortcut(doc, { eligible, isOpen: () => presentationActive(), open: () => open() }));
    const triggerAttributes: [string, string][] = [['type', 'button'], ['aria-haspopup', 'dialog'], ['aria-controls', dialog.id], ['aria-expanded', 'false']];
    if (shortcut) triggerAttributes.push(['aria-keyshortcuts', 'Control+K Meta+K']);
    for (const [name, value] of triggerAttributes) {
      if (destroyed || mounted.get(root)?.handle !== handle) break;
      ownAttribute(name, value);
    }
    if (!destroyed && mounted.get(root)?.handle === handle) root.replaceChildren(dialog);
  } catch (reason) {
    if (mounted.get(root)?.handle === handle) { try { handle.destroy(); } catch { /* Preserve the original host failure. */ } }
    throw reason;
  }
  return handle;
}
