// Explicit public content. Everything else under docs/ remains repository-only.
export const BASE = '/raveldex/';
export const EXCLUDED = ['accessibility', 'api', 'architecture', 'decisions', 'evaluation',
  'evidence', 'history', 'migration', 'planning', 'release', 'research', 'specs', 'support'];
export const PAGES = [
  ['site/Home.astro', '', 'Raveldex documentation', { section: null, parent: null, label: 'Home', outline: false }],
  ['site/Demo.astro', 'demo', 'Search the usage guides', { section: 'documentation', group: 'guide', parent: 'guide', label: 'Developer Workbench', outline: false }],
  ['site/404.md', '404', 'Page not found', { section: null, parent: '', label: 'Page not found', outline: false }],
  ['docs/api/GETTING_STARTED.md', 'guide/overview', 'Getting started', { section: 'get-started', group: 'guide', parent: 'guide', label: 'Get started' }],
  ['docs/api/PAGEFIND_MIGRATION.md', 'guide/pagefind-migration', 'Optional Pagefind migration', { section: 'documentation', group: 'guide', parent: 'guide', label: 'Pagefind migration' }],
  ['site/guides.md', 'guide', 'Guides', { section: 'documentation', group: 'guide', parent: '', label: 'Documentation' }],
  ['docs/api/COMPATIBILITY.md', 'guide/compatibility', 'Compatibility', { section: 'documentation', group: 'guide', parent: 'guide', label: 'Compatibility' }],
  ['docs/api/LIMITATIONS.md', 'guide/limitations', 'Practical limits', { section: 'documentation', group: 'guide', parent: 'guide', label: 'Practical limits' }],
  ['examples/README.md', 'examples', 'Runnable examples', { section: 'examples', group: 'examples', parent: '', label: 'Examples' }],
  ['site/Inline.astro', 'examples/inline', 'Ready to use inline search', { section: 'examples', group: 'examples', parent: 'examples', label: 'Inline search', outline: false }],
  ['examples/inline-browser/README.md', 'examples/inline-browser', 'Browser inline search starter', { section: 'examples', group: 'examples', parent: 'examples/inline', label: 'Browser inline starter' }],
  ['examples/inline-astro/README.md', 'examples/inline-astro', 'Astro inline search starter', { section: 'examples', group: 'examples', parent: 'examples/inline', label: 'Astro inline starter' }],
  ['site/Modal.astro', 'examples/modal', 'Documentation search modal starters', { section: 'examples', group: 'examples', parent: 'examples', label: 'Documentation modal', outline: false }],
  ['examples/modal-browser/README.md', 'examples/modal-browser', 'Browser documentation modal starter', { section: 'examples', group: 'examples', parent: 'examples/modal', label: 'Browser modal starter' }],
  ['examples/modal-astro/README.md', 'examples/modal-astro', 'Astro documentation modal starter', { section: 'examples', group: 'examples', parent: 'examples/modal', label: 'Astro modal starter' }],
  ['site/Dropdown.astro', 'examples/dropdown', 'Compact header search starter', { section: 'examples', group: 'examples', parent: 'examples', label: 'Header dropdown', outline: false }],
  ['examples/dropdown-browser/README.md', 'examples/dropdown-browser', 'Browser dropdown header starter', { section: 'examples', group: 'examples', parent: 'examples/dropdown', label: 'Browser dropdown starter' }],
  ['site/Directory.astro', 'examples/directory', 'Faceted resource directory starters', { section: 'examples', group: 'examples', parent: 'examples', label: 'Resource directory', outline: false }],
  ['examples/directory-browser/README.md', 'examples/directory-browser', 'Browser resource directory starter', { section: 'examples', group: 'examples', parent: 'examples/directory', label: 'Browser directory starter' }],
  ['examples/directory-astro/README.md', 'examples/directory-astro', 'Astro resource directory starter', { section: 'examples', group: 'examples', parent: 'examples/directory', label: 'Astro directory starter' }],
  ['site/Cards.astro', 'examples/cards', 'Rich resource result cards', { section: 'examples', group: 'examples', parent: 'examples', label: 'Rich result cards', outline: false }],
  ['examples/cards-browser/README.md', 'examples/cards-browser', 'Browser rich-results starter', { section: 'examples', group: 'examples', parent: 'examples/cards', label: 'Browser cards starter' }],
  ['examples/astro/README.md', 'examples/astro', 'Astro setup, build and preview', { section: 'examples', group: 'examples', parent: 'examples', label: 'Astro setup fixture' }],
  ['examples/core-docs/README.md', 'examples/core', 'Core terminal example', { section: 'examples', group: 'examples', parent: 'examples', label: 'Core terminal example' }],
  ['examples/docs-search/README.md', 'examples/browser', 'Browser demo instructions', { section: 'examples', group: 'examples', parent: 'examples', label: 'Workbench instructions' }],
  ['examples/migration/README.md', 'examples/migration', 'Migration terminal example', { section: 'examples', group: 'examples', parent: 'examples', label: 'Migration terminal example' }],
  ['docs/api/examples/README.md', 'examples/api', 'Installed API recipes', { section: 'examples', group: 'examples', parent: 'examples', label: 'API recipes' }],
  ['integrations/astro/README.md', 'reference/astro-package', 'Astro package', { section: 'reference', group: 'reference', parent: 'reference', label: 'Astro package' }],
  ['integrations/languages/english/README.md', 'reference/english-package', 'English package', { section: 'reference', group: 'reference', parent: 'reference', label: 'English package' }],
  ...['README', 'CORE', 'ADDONS', 'HOSTS', 'TYPO', 'SUGGESTIONS', 'SYNONYMS', 'ENGLISH',
    'IDENTIFIERS', 'LITERAL', 'PROXIMITY', 'QUERY_SYNTAX', 'RECORD_PATCH', 'STATIC_ASTRO',
    'LOCALIZATION', 'RESULT_CONTENT', 'CMS_REFRESH']
    .map(name => [`docs/api/${name}.md`, name === 'README' ? 'reference' : `reference/${name.toLowerCase().replaceAll('_', '-')}`, name === 'README' ? 'API reference' : name.replaceAll('_', ' '),
      { section: 'reference', group: 'reference', parent: name === 'README' ? '' : 'reference',
        label: ({ README: 'API reference', CORE: 'Core API', HOSTS: 'Hosts and UI', ADDONS: 'Addons' })[name]
          ?? name.toLowerCase().replaceAll('_', ' ').replace(/^./, first => first.toUpperCase()) }]),
];
export const RECIPES = ['core', 'inline', 'ui', 'addons', 'snapshots', 'browser', 'worker', 'worker-host', 'migration', 'cms-refresh', 'consumer-messages.de'];
export const href = route => BASE + (route ? route === '404' ? '404.html' : `${route}/` : '');
export const JEKYLL = `# Required: Jekyll excludes repository-only records before branch publication.\n# Do not add .nojekyll. Do not add includes that override these exclusions.\nurl: https://vmitsaras.github.io\nbaseurl: /raveldex\ntheme: null\nplugins: []\nexclude:\n${EXCLUDED.map(name => `  - ${name}\n`).join('')}`;
