import { createRaveldex } from '@vmitsaras/raveldex';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createDirectory } from '@vmitsaras/raveldex/addons/ui/directory';
import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';

/** @param {import('@vmitsaras/raveldex/addons/ui/directory').DirectoryHandle} controller */
function ready(controller) {
  const snapshot = controller.getSnapshot();
  if (snapshot.status !== 'ready' || !snapshot.result) throw new Error(snapshot.error ?? snapshot.status);
  return { state: snapshot.state, revision: snapshot.result.revision, total: snapshot.result.total, ids: snapshot.result.hits.map(hit => hit.id) };
}

// Finite, opt-in focus/update walkthrough, not a CMS synchronization service.
// Use a dedicated connected root and stable external button; import CSS separately.
// No competing owner writes, commands or host replacement during this walkthrough.
/** @param {HTMLElement} root @param {HTMLButtonElement} focusAnchor */
export async function runCMSRefreshExample(root, focusAnchor) {
  const doc = root.ownerDocument;
  if (!root.isConnected || !focusAnchor.isConnected || focusAnchor.ownerDocument !== doc || root.contains(focusAnchor) || focusAnchor.disabled || root.getRootNode() !== doc || focusAnchor.getRootNode() !== doc)
    throw new Error('Supply a dedicated document-tree root and an enabled external document-tree focus button.');
  const engine = createRaveldex({ schema: { text: { body: {} }, metadata: { kind: { type: 'string' } } },
    addons: [createFilters({ fields: ['kind'] }), createFacets({ fields: ['kind'] })] });
  /** @type {import('@vmitsaras/raveldex/addons/ui/directory').DirectoryHandle | undefined} */
  let controller;
  /** @type {import('@vmitsaras/raveldex/addons/ui/directory/cards').DirectoryCardsHandle | undefined} */
  let view;
  try {
    await engine.addMany([
      { id: 'a', text: { body: 'shared alpha' }, metadata: { kind: 'guide' } },
      { id: 'b', text: { body: 'shared bravo' }, metadata: { kind: 'guide' } },
      { id: 'c', text: { body: 'shared charlie' }, metadata: { kind: 'manual' } },
    ]);
    controller = createDirectory({ engine, groups: [{ field: 'kind', values: ['guide', 'manual'] }], pageSize: 1 });
    const groups = [{ field: 'kind', label: 'Type' }];
    const documents = ['a', 'b', 'c'].map(id => ({ id, title: 'Original ' + id, url: '/resource/' + id + '/', excerpt: 'Original description ' + id }));
    await controller.update({ text: 'shared', filters: { kind: ['guide'] } });
    ready(controller);
    await controller.setPage(2);
    const before = ready(controller);
    view = mountRaveldexDirectoryCards({ root, controller, groups, documents, presentation: { layout: 'grid', density: 'compact' } });
    // This walkthrough deliberately focuses its input before demonstrating handoff.
    root.querySelector('input')?.focus();
    const ownedFocus = root.contains(doc.activeElement);
    if (ownedFocus) focusAnchor.focus({ preventScroll: true });
    const handedOff = ownedFocus && doc.activeElement === focusAnchor;
    const presentation = view.getPresentation();
    view.destroy(); view = undefined;

    // The old display map is unmounted before any changed IDs could be returned.
    // This one replace is atomic; multiple CMS writes are not one transaction.
    await engine.replace({ id: 'a', text: { body: 'shared revised' }, metadata: { kind: 'manual' } });
    await controller.refresh(); // Explicit new revision, same text/filters, page one.
    const after = ready(controller); // A fulfilled operation Promise alone is not success.
    const currentDocuments = documents.map(d => ({ ...d, title: 'Current ' + d.id, excerpt: 'Current description ' + d.id }));
    view = mountRaveldexDirectoryCards({ root, controller, groups, documents: currentDocuments, presentation });
    // Restore only our focus handoff; a user who moved elsewhere keeps their focus.
    if (handedOff && doc.activeElement === focusAnchor) root.querySelector('input')?.focus({ preventScroll: true });
    const focusRestored = root.contains(doc.activeElement);
    const repeated = mountRaveldexDirectoryCards({ root, controller, groups, documents, presentation });
    const renderedTitles = [...root.querySelectorAll('a')].map(link => link.textContent);
    const renderedDescriptions = [...root.querySelectorAll('.raveldex-directory-cards__excerpt')].map(node => node.textContent);
    return { before, after, duplicateKeptHandle: repeated === view, renderedTitles, renderedDescriptions, presentation: view.getPresentation(), focusRestored };
  } finally {
    if (root.contains(doc.activeElement)) focusAnchor.focus({ preventScroll: true });
    view?.destroy();
    // If configured, destroy the URL binding here, before its controller.
    controller?.destroy();
    await engine.dispose(); // This example created the owner; borrowed views never do this.
  }
}
