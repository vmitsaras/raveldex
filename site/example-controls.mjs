// Site state only. Never touch a preview frame, search engine, query or source HTML.
let dispose;
function mount() {
  dispose?.();
  const controller = new AbortController();
  const { signal } = controller;
  const copyAttempts = new WeakMap();
  const views = [...document.querySelectorAll('[data-view-switch]')];
  const choices = [...document.querySelectorAll('[data-example-choice]')];
  const showView = (root, value) => {
    root.dataset.selectedView = value;
    for (const panel of root.querySelectorAll(':scope > [data-view-panel]')) panel.hidden = panel.dataset.viewPanel !== value;
    for (const button of root.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === value));
  };
  for (const root of views) {
    const controls = root.querySelector('[data-view-controls]');
    controls.hidden = false;
    controls.addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) showView(root, button.dataset.view); }, { signal });
    showView(root, root.dataset.selectedView ?? 'preview');
  }
  for (const root of choices) {
    const select = root.querySelector('[data-choice-select]');
    const show = () => { for (const panel of root.querySelectorAll(':scope > [data-choice-panel]')) panel.hidden = panel.dataset.choicePanel !== select.value; };
    select.addEventListener('change', show, { signal });
    root.querySelector('[data-choice-label]').hidden = false;
    show();
  }
  const revealFragment = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    for (const root of choices) {
      const panel = [...root.querySelectorAll(':scope > [data-choice-panel]')].find(panel => panel.contains(target));
      if (panel) { root.querySelector('[data-choice-select]').value = panel.dataset.choicePanel; for (const other of root.querySelectorAll(':scope > [data-choice-panel]')) other.hidden = other !== panel; }
    }
    requestAnimationFrame(() => { if (!signal.aborted) target.scrollIntoView(); });
  };
  addEventListener('hashchange', revealFragment, { signal });
  revealFragment();
  for (const button of document.querySelectorAll('[data-select-code]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      const panel = button.closest('[data-code-panel]');
      let field = panel.querySelector('[data-manual-source]');
      if (!field) {
        field = document.createElement('textarea'); field.readOnly = true;
        field.dataset.manualSource = ''; field.setAttribute('aria-label', 'Selected source');
        field.rows = 8; field.style.width = '100%'; panel.append(field);
      }
      // Browser range selections omit a final newline; a readonly field preserves it exactly.
      field.value = panel.querySelector('pre code').textContent;
      field.focus(); field.select();
    }, { signal });
  }
  for (const button of document.querySelectorAll('[data-copy-code]')) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const panel = button.closest('[data-code-panel]'), status = panel.querySelector('[data-copy-status]');
      const attempt = (copyAttempts.get(panel) ?? 0) + 1;
      copyAttempts.set(panel, attempt);
      const current = () => !signal.aborted && copyAttempts.get(panel) === attempt;
      status.textContent = '';
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(panel.getAttribute('data-code-text'));
        if (current()) status.textContent = 'Copied source.';
      } catch {
        if (current()) status.textContent = 'Copy unavailable. Use Select source, then copy the selected text manually.';
      }
    }, { signal });
  }
  dispose = () => {
    controller.abort();
    for (const root of views) { root.querySelector('[data-view-controls]').hidden = true; for (const panel of root.querySelectorAll(':scope > [data-view-panel]')) panel.hidden = false; }
    for (const root of choices) { root.querySelector('[data-choice-label]').hidden = true; for (const panel of root.querySelectorAll(':scope > [data-choice-panel]')) panel.hidden = false; }
    for (const button of document.querySelectorAll('[data-copy-code]')) button.hidden = true;
    for (const button of document.querySelectorAll('[data-select-code]')) button.hidden = true;
    for (const field of document.querySelectorAll('[data-manual-source]')) field.remove();
  };
}
mount();
addEventListener('pagehide', () => dispose?.());
addEventListener('pageshow', event => { if (event.persisted) mount(); });
