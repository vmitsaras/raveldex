// Explicit public content. Everything else under docs/ remains repository-only.
export const BASE = '/raveldex/';
export const EXCLUDED = ['accessibility', 'api', 'architecture', 'decisions', 'evaluation',
  'evidence', 'history', 'migration', 'planning', 'release', 'research', 'specs', 'support'];
export const PAGES = [
  ['site/Home.astro', '', 'Raveldex documentation'],
  ['site/Demo.astro', 'demo', 'Search the usage guides'],
  ['site/404.md', '404', 'Page not found'],
  ['docs/api/GETTING_STARTED.md', 'guide/overview', 'Getting started'],
  ['site/guides.md', 'guide', 'Guides'],
  ['docs/api/COMPATIBILITY.md', 'guide/compatibility', 'Compatibility'],
  ['docs/api/LIMITATIONS.md', 'guide/limitations', 'Practical limits'],
  ['examples/README.md', 'examples', 'Runnable examples'],
  ['site/Inline.astro', 'examples/inline', 'Ready to use inline search'],
  ['examples/inline-browser/README.md', 'examples/inline-browser', 'Browser inline search starter'],
  ['examples/inline-astro/README.md', 'examples/inline-astro', 'Astro inline search starter'],
  ['site/Modal.astro', 'examples/modal', 'Documentation search modal starters'],
  ['examples/modal-browser/README.md', 'examples/modal-browser', 'Browser documentation modal starter'],
  ['examples/modal-astro/README.md', 'examples/modal-astro', 'Astro documentation modal starter'],
  ['site/Dropdown.astro', 'examples/dropdown', 'Compact header search starter'],
  ['examples/dropdown-browser/README.md', 'examples/dropdown-browser', 'Browser dropdown header starter'],
  ['examples/astro/README.md', 'examples/astro', 'Astro setup, build and preview'],
  ['examples/core-docs/README.md', 'examples/core', 'Core terminal example'],
  ['examples/docs-search/README.md', 'examples/browser', 'Browser demo instructions'],
  ['examples/migration/README.md', 'examples/migration', 'Migration terminal example'],
  ['docs/api/examples/README.md', 'examples/api', 'Installed API recipes'],
  ['integrations/astro/README.md', 'reference/astro-package', 'Astro package'],
  ['integrations/languages/english/README.md', 'reference/english-package', 'English package'],
  ...['README', 'CORE', 'ADDONS', 'HOSTS', 'TYPO', 'SUGGESTIONS', 'SYNONYMS', 'ENGLISH',
    'IDENTIFIERS', 'LITERAL', 'PROXIMITY', 'QUERY_SYNTAX', 'RECORD_PATCH', 'STATIC_ASTRO']
    .map(name => [`docs/api/${name}.md`, name === 'README' ? 'reference' : `reference/${name.toLowerCase().replaceAll('_', '-')}`, name === 'README' ? 'API reference' : name.replaceAll('_', ' ')]),
];
export const RECIPES = ['core', 'ui', 'addons', 'snapshots', 'browser', 'worker', 'worker-host', 'migration'];
export const href = route => BASE + (route ? route === '404' ? '404.html' : `${route}/` : '');
export const JEKYLL = `# Required: Jekyll excludes repository-only records before branch publication.\n# Do not add .nojekyll. Do not add includes that override these exclusions.\nurl: https://vmitsaras.github.io\nbaseurl: /raveldex\ntheme: null\nplugins: []\nexclude:\n${EXCLUDED.map(name => `  - ${name}\n`).join('')}`;
