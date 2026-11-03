// Complete, explicit source inventories. Never publish a recursive repository copy.
export const STARTERS = [
  { id: 'inline-browser', family: 'inline', title: 'Plain browser', files: [
    'README.md', 'package.json', 'build.mjs', 'preview.mjs', 'index.html',
    'main.mjs', 'controller.mjs', 'load.mjs', 'theme.css', 'content.json',
  ] },
  { id: 'inline-astro', family: 'inline', title: 'Astro', files: [
    'README.md', 'package.json', 'astro.config.mjs', 'configuration.mjs', 'content.json',
    'src/main.mjs', 'src/search.mjs', 'src/style.css', 'src/pages/index.astro',
    'src/pages/guide/[slug].astro',
  ] },
  { id: 'modal-browser', family: 'modal', title: 'Plain browser', files: [
    'README.md', 'package.json', 'build.mjs', 'preview.mjs', 'index.html',
    'main.mjs', 'controller.mjs', 'load.mjs', 'theme.css', 'content.json', 'content.mjs',
  ] },
  { id: 'modal-astro', family: 'modal', title: 'Astro', files: [
    'README.md', 'package.json', 'astro.config.mjs', 'configuration.mjs', 'content.json', 'content.mjs',
    'src/main.mjs', 'src/search.mjs', 'src/style.css', 'src/pages/index.astro',
    'src/pages/guide/[slug].astro',
  ] },
  { id: 'dropdown-browser', family: 'dropdown', title: 'Plain browser header', files: [
    'README.md', 'package.json', 'configuration.mjs', 'content.json', 'content.mjs',
    'build.mjs', 'preview.mjs', 'index.html', 'main.mjs', 'controller.mjs', 'load.mjs', 'theme.css',
  ] },
  { id: 'directory-browser', family: 'directory', title: 'Plain browser resource directory', files: [
    'README.md', 'package.json', 'configuration.mjs', 'content.json', 'content.mjs',
    'build.mjs', 'preview.mjs', 'index.html', 'main.mjs', 'controller.mjs', 'load.mjs', 'theme.css',
  ] },
  { id: 'directory-astro', family: 'directory', title: 'Astro resource directory', files: [
    'README.md', 'package.json', 'astro.config.mjs', 'configuration.mjs', 'content.json', 'content.mjs',
    'src/main.mjs', 'src/search.mjs', 'src/style.css', 'src/pages/index.astro', 'src/pages/resources/[slug].astro',
  ] },
  { id: 'cards-browser', family: 'cards', title: 'Plain browser rich resource results', files: [
    'README.md', 'package.json', 'configuration.mjs', 'content.json', 'content.mjs',
    'build.mjs', 'preview.mjs', 'index.html', 'main.mjs', 'controller.mjs', 'load.mjs', 'theme.css',
    'images/map.svg', 'images/weather.svg',
  ] },
];
export const starterSource = (id, path) => `example-files/${id}/${path.replaceAll('[', 'param-').replaceAll(']', '')}.${path.endsWith('.astro') ? 'html' : 'txt'}`;
export const starterArchive = id => `example-files/${id}.tar.gz`;
