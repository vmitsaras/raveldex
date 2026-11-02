// One explicit record per public page. This is an allowlist, not an HTML crawler.
export function prepareGuides(entries) {
  if (!Array.isArray(entries) || entries.length > 1000) throw new Error('Expected up to 1000 explicit guide records');
  const ids = new Set(), paths = new Set();
  let units = 0;
  return entries.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).sort().join(',') !== 'body,category,id,path,title') throw new Error('Invalid guide record');
    for (const [name, maximum] of [['id', 256], ['title', 1024], ['body', 50000], ['category', 120], ['path', 128]]) {
      const value = entry[name];
      if (typeof value !== 'string' || !value.length || value.length > maximum || !value.isWellFormed()) throw new Error('Invalid guide ' + name);
      units += value.length;
    }
    if (units > 4000000 || ids.has(entry.id) || paths.has(entry.path) || !/^\/guides\/[a-z0-9-]+\/$/.test(entry.path))
      throw new Error('Duplicate or invalid guide identity/path');
    ids.add(entry.id); paths.add(entry.path);
    return { id: entry.id, title: entry.title, body: entry.body, category: entry.category, path: entry.path };
  });
}
