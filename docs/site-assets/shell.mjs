// One native disclosure serves every viewport; no duplicate navigation/tab stops.
const disclosure = document.querySelector('[data-site-section]');
if (disclosure) {
  const desktop = matchMedia('(min-width: 64rem)');
  const summary = disclosure.querySelector('summary');
  const update = () => {
    if (desktop.matches) {
      disclosure.open = true;
      if (document.activeElement === summary)
        disclosure.querySelector('[aria-current="page"]')?.focus();
    } else if (!disclosure.contains(document.activeElement)) {
      disclosure.open = false;
    }
  };
  const start = () => {
    desktop.addEventListener('change', update);
    update();
    disclosure.setAttribute('data-site-section-enhanced', '');
  };
  start();
  addEventListener('pagehide', () => desktop.removeEventListener('change', update));
  addEventListener('pageshow', event => { if (event.persisted) start(); });
}
