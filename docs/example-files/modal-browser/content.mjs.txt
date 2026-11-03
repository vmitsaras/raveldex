// This explicit allowlist is also the source used to render real anchor targets.
export function preparePages(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 1000) throw new Error('Expected 1–1000 explicit pages');
  const ids = new Set(), paths = new Set();
  return entries.map(entry => {
    if (!entry || !['id', 'title', 'category', 'path'].every(key => typeof entry[key] === 'string' && entry[key])
      || !entry.title.trim() || entry.title.length > 1024 || !entry.title.isWellFormed()
      || entry.id.length > 256 || ids.has(entry.id) || paths.has(entry.path)
      || !/^\/guide\/[a-z0-9-]+\/$/.test(entry.path) || !Array.isArray(entry.sections)
      || !entry.sections.length || entry.sections.length > 64) throw new Error('Invalid or duplicate page');
    ids.add(entry.id); paths.add(entry.path);
    let body = ''; const anchors = new Set(), sections = [];
    for (const section of entry.sections) {
      if (!section || !['anchor', 'heading', 'body'].every(key => typeof section[key] === 'string' && section[key])
        || !section.heading.trim() || !section.anchor.isWellFormed() || !section.heading.isWellFormed() || !section.body.isWellFormed()
        || section.anchor.length > 256 || section.heading.length > 512 || /[\p{Cc}\s]/u.test(section.anchor)
        || section.anchor.includes(':~:') || anchors.has(section.anchor)) throw new Error('Invalid or duplicate section');
      anchors.add(section.anchor);
      if (body) body += '\n\n';
      const start = body.length; body += section.heading + '\n' + section.body;
      sections.push({ anchor: section.anchor, heading: section.heading, headingLevel: 2,
        field: 'body', valueIndex: 0, start, end: body.length });
    }
    return { ...entry, body, maps: sections };
  });
}
