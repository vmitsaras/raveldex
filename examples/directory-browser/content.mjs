import { groups } from './configuration.mjs';
export function validateContent(entries) {
  if (!Array.isArray(entries) || entries.length > 1000) throw new Error('Expected up to 1000 explicit public resources');
  const ids = new Set(), paths = new Set(); let units = 0;
  const string = (value, limit) => typeof value === 'string' && value.length <= limit && value.isWellFormed();
  for (const entry of entries) {
    if (!entry || Object.keys(entry).sort().join(',') !== 'body,format,id,path,title,topics'
      || !string(entry.id,256) || !entry.id || ids.has(entry.id) || !string(entry.title,1024) || !entry.title.trim()
      || !string(entry.body,50000) || !string(entry.path,128) || !/^\/resources\/[a-z0-9-]+\/$/.test(entry.path) || paths.has(entry.path)
      || !groups[0].values.includes(entry.format) || !Array.isArray(entry.topics) || entry.topics.length > 8
      || new Set(entry.topics).size !== entry.topics.length || !entry.topics.every(value => groups[1].values.includes(value))) throw new Error('Invalid or duplicate resource record');
    ids.add(entry.id); paths.add(entry.path); units += entry.id.length + entry.title.length + entry.body.length + entry.path.length + entry.format.length + entry.topics.join('').length;
    if (units > 4000000) throw new Error('Resource text exceeds the example limit');
  }
  return entries;
}
