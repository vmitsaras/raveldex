import { readFile } from 'node:fs/promises';
import { rebuildCompanionSource } from './convert-and-rebuild.mjs';
const path = process.argv[2];
if (!path) throw new Error('Usage: node examples/migration/run.mjs <companion-source-snapshot.json> [query]');
const migration = await rebuildCompanionSource(new Uint8Array(await readFile(path)));
try {
  const result = await migration.engine.search(process.argv[3] ?? { kind: 'all' }, { limit: 100 });
  console.log(JSON.stringify({ origin: migration.origin, sourceRevision: migration.sourceRevision,
    legacyReturnFields: migration.legacyReturnFields, differences: migration.differences, result,
    nativeSourceFormat: JSON.parse(migration.source).format }, null, 2));
} finally { await migration.engine.dispose(); }
