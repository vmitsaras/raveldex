import { cp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { command } from './lib/packed-consumer.mjs';

const [consumer, companion, output = '/tmp/raveldex-rx4001-comparison.json'] = process.argv.slice(2);
if (!consumer || !companion) throw Error('Usage: node scripts/evaluate-comparison.mjs <installed consumer> <explicit pinned companion checkout> [output.json]');
const target = join(resolve(consumer), 'comparison');
for (const path of ['bench/comparison.mjs', 'bench/comparison-lib.mjs', 'bench/relevance-lib.mjs', 'integrations/minisearch/companion-comparator.mjs', 'test/oracle', 'test/fixtures/relevance']) {
  const destination = join(target, path); await mkdir(join(destination, '..'), { recursive: true });
  await cp(resolve(path), destination, { recursive: true });
}
const result = await command(process.execPath, [join(target, 'bench/comparison.mjs'), resolve(companion), resolve(output)], consumer);
console.log(result.stdout.trim());
