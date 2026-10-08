import { mkdir, cp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { command } from './lib/packed-consumer.mjs';

const consumer = process.argv[2], output = resolve(process.argv[3] ?? '/tmp/raveldex-rx4001-correctness.json');
if (!consumer) throw Error('Usage: node scripts/evaluate-correctness.mjs <installed consumer directory> [output.json]');
const target = join(resolve(consumer), 'qualification');
for (const path of ['bench/correctness.mjs', 'test/oracle', 'test/fixtures/ranking', 'test/fixtures/mutations', 'test/fixtures/phrases']) {
  const destination = join(target, path); await mkdir(join(destination, '..'), { recursive: true });
  await cp(resolve(path), destination, { recursive: true });
}
const result = JSON.parse((await command(process.execPath, [join(target, 'bench/correctness.mjs'), output], consumer)).stdout);
await writeFile(output, JSON.stringify({ ...result, packageScope: 'Installed local tarball; public export specifiers only. Test-only source oracles/fixtures copied separately.', consumer: resolve(consumer) }, null, 2) + '\n');
console.log(JSON.stringify(result));
