import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { command } from '../../../scripts/lib/packed-consumer.mjs';

// Focused correctness diagnostic; no engine/source/fixture mutation or timing claim.
const fixturePath = 'test/consumer/family-qualification-fixture.mjs';
const fixture = await readFile(fixturePath, 'utf8');
const literal = fixture.match(/const rows = \[([\s\S]*?)\n\];/);
assert.ok(literal, 'actual authored row literal exists');
const rows = [...literal[1].matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)].map(m => m.slice(1));
assert.equal(rows.length, 10, 'all actual fixture rows captured');
assert.ok(fixture.includes('text: { body: {} }'), 'fixture indexes body, not title');
const accepted = JSON.parse(await readFile('docs/evidence/RX-9112/primary-family-report.json', 'utf8'));
const code = `
import assert from 'node:assert/strict';
import { createRaveldex } from '@vmitsaras/raveldex';
const rows = JSON.parse(process.argv[1]);
const query = text => ({kind:'group',variants:[{text,match:'prefix'}]});
const results = [];
for (const titlesIndexed of [false,true]) {
  const engine = createRaveldex({schema:{text:{body:{},...(titlesIndexed?{title:{}}:{})},metadata:{kind:{type:'string'}}}});
  try {
    await engine.addMany(rows.map(([id,title,body],i)=>({id,text:{body,...(titlesIndexed?{title}:{})},metadata:{kind:i%2?'manual':'guide'}})));
    const guide = await engine.search(query('guide'));
    const shared = await engine.search(query('shared'));
    assert.equal(guide.total,titlesIndexed?8:0);
    assert.deepEqual(guide.hits.map(h=>h.id),titlesIndexed?['a','b','c','d','e','f','g','unicode']:[]);
    assert.equal(shared.total,7);
    results.push({titlesIndexed,guideTotal:guide.total,guideIDs:guide.hits.map(h=>h.id),sharedTotal:shared.total});
  } finally {await engine.dispose();}
}
console.log(JSON.stringify(results));
`;
const { stdout } = await command(process.execPath, ['--input-type=module', '--eval', code, JSON.stringify(rows)], accepted.consumer.directory);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const result = { kind: 'raveldex-indexed-fields-diagnostic-v1', result: 'Pass', packageSHA256: accepted.package.sha256,
  fixturePath, fixtureSHA256: sha(fixture), probeSHA256: sha(await readFile(new URL(import.meta.url))), childCodeSHA256: sha(code), rows: rows.length,
  observations: JSON.parse(stdout), scope: 'Actual authored fixture rows and public installed native API. Additional title-enabled engine is a temporary diagnostic configuration; product engine, accepted fixture and runtime files are unchanged. No benchmark or performance claim.' };
await writeFile('docs/evidence/RX-9112/indexed-fields-probe.json', JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
