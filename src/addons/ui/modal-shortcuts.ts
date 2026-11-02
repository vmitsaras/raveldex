/** Document-local coordination; importing this module installs no bindings. */
export interface ModalShortcut {
  readonly eligible: () => boolean;
  readonly isOpen: () => boolean;
  readonly open: () => boolean;
}
interface Coordinator { readonly registrations: ModalShortcut[]; readonly listener: (event: KeyboardEvent) => void }
const coordinators = new WeakMap<Document, Coordinator>();

function editable(event: KeyboardEvent): boolean {
  return event.composedPath().some(target => {
    const element = target as HTMLElement;
    return element?.nodeType === 1 && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
  });
}
export function registerModalShortcut(doc: Document, registration: ModalShortcut): () => void {
  let coordinator = coordinators.get(doc);
  if (!coordinator) {
    const registrations: ModalShortcut[] = [];
    const listener = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey ||
        event.ctrlKey === event.metaKey || event.key.toLowerCase() !== 'k' || editable(event)) return;
      const opened = registrations.find(entry => entry.isOpen());
      const target = opened ? (opened.eligible() ? opened : undefined) : registrations.find(entry => entry.eligible());
      if (target?.open()) event.preventDefault();
    };
    coordinator = { registrations, listener }; coordinators.set(doc, coordinator);
    doc.addEventListener('keydown', listener);
  }
  const owned = coordinator;
  owned.registrations.push(registration);
  return () => {
    const index = owned.registrations.indexOf(registration);
    if (index !== -1) owned.registrations.splice(index, 1);
    if (!owned.registrations.length && coordinators.get(doc) === owned) {
      doc.removeEventListener('keydown', owned.listener); coordinators.delete(doc);
    }
  };
}
