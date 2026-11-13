import { BASE, PAGES, href } from './pages.mjs';

// Route identity and parentage come only from PAGES, never prefix guessing.
export const DESTINATIONS = [
  { id: 'get-started', label: 'Get started', route: 'guide/overview' },
  { id: 'examples', label: 'Examples', route: 'examples' },
  { id: 'documentation', label: 'Documentation', route: 'guide' },
  { id: 'reference', label: 'API reference', route: 'reference' },
];
const entries = new Map(PAGES.map(([, route, title, metadata]) => [route, { route, title, ...metadata }]));
const link = page => ({ label: page.label, href: href(page.route), route: page.route });

export function navigationFor(pathname) {
  const page = [...entries.values()].find(page => href(page.route) === pathname);
  if (!page) throw new Error(`Unregistered site route: ${pathname}`);
  const destination = DESTINATIONS.find(item => item.id === page.section);
  const ancestors = [];
  const seen = new Set([page.route]);
  let parent = page.parent;
  while (parent !== null && parent !== undefined) {
    if (seen.has(parent) || !entries.has(parent)) throw new Error(`Invalid site parent: ${page.route}`);
    seen.add(parent);
    const ancestor = entries.get(parent);
    ancestors.unshift(link(ancestor));
    parent = ancestor.parent;
  }
  const root = page.group === 'guide' ? 'guide' : page.group;
  // Show sibling families plus the selected family's real starter children.
  const sidebar = page.group ? [...entries.values()]
    .filter(item => item.group === page.group && (item.route === root || item.parent === root
      || item.route === page.route || item.parent === page.route || item.parent === page.parent))
    .map(item => ({ ...link(item), nested: item.parent !== root && item.route !== root })) : [];
  return { page, destination, breadcrumbs: ancestors, sidebar,
    sectionLabel: page.group === 'guide' ? 'Documentation' : destination?.label,
    home: BASE };
}

export function pageOutline(page, headings) {
  const sections = headings.filter(heading => heading.depth === 2);
  return page.outline !== false && sections.length >= 4 ? sections : [];
}
