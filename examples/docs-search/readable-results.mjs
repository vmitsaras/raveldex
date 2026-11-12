// Application-owned display overviews. Never rewrite native source snippets or
// scores: retain their hooks and show exact copies inside the existing Inspector.
// No engine calls, innerHTML, query parsing or source-offset remapping here.
export function mountReadableResults(root, sections) {
  const doc = root.ownerDocument;
  const results = root.querySelector('[data-raveldex-results]');
  const inspector = root.querySelector('[data-raveldex-inspector]');
  const overviews = new Map(sections.filter(section => typeof section.overview === 'string')
    .map(section => [section.id, section.overview]));
  if (!results || !inspector || overviews.size === 0) return;
  const originals = doc.createElement('section'); originals.dataset.pilotOriginalResults = '';
  inspector.insertBefore(originals, inspector.querySelector('[data-raveldex-inspector-data]'));
  const render = () => {
    originals.replaceChildren();
    const heading = doc.createElement('h3'); heading.textContent = 'Original matches and scores'; originals.append(heading);
    for (const item of results.children) {
      const text = overviews.get(item.dataset.raveldexResult);
      if (text === undefined) continue;
      const title = doc.createElement('h4'); title.textContent = item.querySelector('[data-raveldex-result-title]')?.textContent;
      originals.append(title);
      for (const node of item.querySelectorAll('[data-raveldex-score], [data-raveldex-snippet], [data-raveldex-snippet-omissions]')) {
        const copy = node.cloneNode(true); copy.hidden = false;
        for (const element of [copy, ...copy.querySelectorAll('*')]) {
          for (const name of element.getAttributeNames()) if (name.startsWith('data-raveldex-')) element.removeAttribute(name);
        }
        copy.dataset.pilotOriginalExcerpt = ''; originals.append(copy); node.hidden = true;
      }
      const paragraph = doc.createElement('p'); paragraph.dataset.pilotOverview = '';
      paragraph.className = 'search-workbench__overview'; paragraph.textContent = text;
      item.append(paragraph);
    }
  };
  const observer = new doc.defaultView.MutationObserver(render);
  observer.observe(results, { childList: true }); render();
  return { destroy() { observer.disconnect(); overviews.clear(); originals.remove(); } };
}
