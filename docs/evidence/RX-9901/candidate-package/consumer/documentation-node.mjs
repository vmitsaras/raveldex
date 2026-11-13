
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { currentNodeSnapshotEnvironment } from '@vmitsaras/raveldex/adapters/snapshots';
    import { runCoreExample } from './docs-examples/core.mjs';
    import { runAddonsExample } from './docs-examples/addons.mjs';
    import { runSnapshotsExample } from './docs-examples/snapshots.mjs';
    import { runMigrationExample } from './docs-examples/migration.mjs';
    const logged = [], originalLog = console.log;
    console.log = (...args) => logged.push(args);
    try { await import('./readme-quick-start.mjs'); } finally { console.log = originalLog; }
    assert.equal(logged.length, 1); assert.equal(logged[0][0], 1); assert.equal(logged[0][1], 1);
    assert.deepEqual(logged[0][2].map(hit => hit.id), ['guide:updates']);
    const core = await runCoreExample(); assert.equal(core.revision, 1); assert.equal(core.total, 1);
    assert.deepEqual(core.hits.map(hit => hit.id), ['guide:updates']);
    const addons = await runAddonsExample();
    assert.deepEqual(addons.phrasePage.hits.map(hit => hit.id), ['a']);
    assert.deepEqual(addons.filtered.hits.map(hit => hit.id), ['a']);
    for (const page of addons.strategies) assert.deepEqual(page, addons.phrasePage);
    assert.equal(addons.filtered.extensions.facets.fields[0].buckets[0].count, 1);
    assert.ok(addons.inspected.extensions.inspector); assert.ok(addons.diagnostics);
    assert.ok(addons.ranges.extensions['match-evidence']); assert.ok(addons.snippets.extensions.snippets);
    const declaration = { profileId: 'candidate-local-node-smoke', scope: 'exact-node-runtime',
      environment: currentNodeSnapshotEnvironment(), evidence: ["/Users/vasilis/.codex/worktrees/raveldex-n19-planning/raveldex/docs/evidence/RX-9901/candidate-package/candidate-report.json"] };
    const snapshots = await runSnapshotsExample(declaration);
    assert.equal(snapshots.sourceRestore.format, 'raveldex-source'); assert.equal(snapshots.sourceRestore.reindexed, true);
    assert.equal(snapshots.nativeRestore.format, 'raveldex-native'); assert.equal(snapshots.nativeRestore.reindexed, false);
    assert.deepEqual(snapshots.nativePage, snapshots.sourcePage); assert.equal(snapshots.sourcePage.total, 1);
    const migration = await runMigrationExample(new Uint8Array(await readFile('migration-fixture.json')));
    assert.equal(migration.page.total, 6); assert.equal(migration.page.model, 'raveldex-bm25-v1');
    assert.deepEqual(migration.page.hits.map(hit => hit.id).sort(), ['a','b','c','d','empty','unicode']);
    console.log(JSON.stringify({ status: 'Pass', readme: logged, core, addons, snapshots, nativeDeclaration: declaration, migration }));
  