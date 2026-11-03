import { groups } from './configuration.mjs';
const imagePaths = new Set(['images/map.svg', 'images/weather.svg', 'images/unavailable.svg']);
export function validateContent(entries) {
  if (!Array.isArray(entries) || entries.length > 1000) throw new Error('Expected up to 1000 explicit public resources');
  const ids = new Set(), paths = new Set(); let units = 0;
  const string = (value, limit) => typeof value === 'string' && value.length <= limit && value.isWellFormed();
  const readable = (value,limit,empty=false) => string(value,limit) && (empty&&value==='' || !/^[\s\p{C}]*$/u.test(value));
  const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key=>allowed.includes(key));
  for (const entry of entries) {
    if (!keys(entry,['id','title','body','format','topics','path','excerpt','category','breadcrumb','date','fields','image'])
      || !string(entry.id,256) || !entry.id || ids.has(entry.id) || !readable(entry.title,1024)
      || !string(entry.body,50000) || !string(entry.path,128) || !/^\/resources\/[a-z0-9-]+\/$/.test(entry.path) || paths.has(entry.path)
      || !groups[0].values.includes(entry.format) || !Array.isArray(entry.topics) || entry.topics.length > 8
      || new Set(entry.topics).size !== entry.topics.length || !entry.topics.every(value => groups[1].values.includes(value))
      || ['excerpt','category','date'].some(key=>entry[key]!==undefined&&!readable(entry[key],key==='excerpt'?2048:256,true))
      || entry.breadcrumb!==undefined&&(!Array.isArray(entry.breadcrumb)||entry.breadcrumb.length>8||!entry.breadcrumb.every(value=>readable(value,256)))
      || entry.fields!==undefined&&(!Array.isArray(entry.fields)||entry.fields.length>4||new Set(entry.fields.map(field=>field?.name)).size!==entry.fields.length||!entry.fields.every(field=>keys(field,['name','value'])&&readable(field.name,128)&&readable(field.value,512)))
      || entry.image!==undefined&&(!keys(entry.image,['src','alt','width','height'])||!imagePaths.has(entry.image.src)||!readable(entry.image.alt,1024,true)||entry.image.width!==640||entry.image.height!==360)) throw new Error('Invalid or duplicate resource record');
    ids.add(entry.id); paths.add(entry.path); units += JSON.stringify(entry).length;
    if (units > 4000000) throw new Error('Resource text exceeds the example limit');
  }
  return entries;
}
