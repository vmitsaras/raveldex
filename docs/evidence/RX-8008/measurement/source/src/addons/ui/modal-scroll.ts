interface Value { readonly value: string; readonly priority: string }
interface Lock { readonly element: HTMLElement; readonly values: Map<string, Value>; readonly owners: Set<object> }
const locks = new WeakMap<Document, Lock>();

/** A queued native close may overlap another instance's open in the same task. */
export function acquireModalScroll(doc: Document): () => void {
  let lock = locks.get(doc);
  if (!lock || lock.element !== doc.documentElement) {
    lock = { element: doc.documentElement, values: new Map(), owners: new Set() }; locks.set(doc, lock);
  }
  const owned = lock, token = {};
  owned.owners.add(token);
  for (const property of ['overflow-x', 'overflow-y']) {
    const value = owned.element.style.getPropertyValue(property), priority = owned.element.style.getPropertyPriority(property);
    if (value === 'hidden') continue;
    // Preserve a distinguishable intervening application write on the next acquisition.
    owned.values.set(property, { value, priority }); owned.element.style.setProperty(property, 'hidden');
  }
  return () => {
    if (!owned.owners.delete(token) || owned.owners.size) return;
    if (locks.get(doc) === owned) locks.delete(doc);
    for (const [property, { value, priority }] of owned.values) {
      if (owned.element.style.getPropertyValue(property) !== 'hidden' || owned.element.style.getPropertyPriority(property) !== '') continue;
      if (value) owned.element.style.setProperty(property, value, priority); else owned.element.style.removeProperty(property);
    }
  };
}
