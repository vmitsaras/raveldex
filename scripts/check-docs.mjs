import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.tmp'].includes(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
}
visit(root);
const failures = [];
for (const path of files) {
  const text = readFileSync(path, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const link = match[1];
    if (/^(https?:|mailto:|#)/i.test(link)) continue;
    const target = resolve(dirname(path), decodeURIComponent(link.split('#')[0]));
    const inside = relative(root, target);
    if (inside === '..' || inside.startsWith(`..${sep}`) || inside.startsWith(sep)) {
      failures.push(`${relative(root, path)}: link leaves repository: ${link}`);
      continue;
    }
    try { statSync(target); } catch { failures.push(`${relative(root, path)}: missing ${link}`); }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Local Markdown link targets checked in ${files.length} files (external URLs and anchors not evaluated).`);
}
