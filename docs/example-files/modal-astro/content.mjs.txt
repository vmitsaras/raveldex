// Explicit authored data, shared by indexing, maps and actual page rendering.
// Offsets are original UTF-16 coordinates in the exact joined body string.
export function pageData(entry) {
  let body = '';
  const sections = entry.sections.map((section, index) => {
    if (index) body += '\n\n';
    const start = body.length;
    body += section.text;
    return { anchor: section.anchor, heading: section.heading, headingLevel: 2,
      field: 'body', valueIndex: 0, start, end: body.length };
  });
  return { body, sections };
}
