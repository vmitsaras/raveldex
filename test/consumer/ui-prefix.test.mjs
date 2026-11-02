import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../dist/index.js';
import { queryFromText } from '../../dist/addons/ui/query.js';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';

const schema = { text: { body: {} } };
const records = [
  { id: 'provider', text: { body: 'source provider' } },
  { id: 'providers', text: { body: 'source providers' } },
  { id: 'provide', text: { body: 'source provide' } },
  { id: 'sources', text: { body: 'sources provider' } },
  { id: 'unicode', text: { body: 'source café 東京案内' } },
  { id: 'letter', text: { body: 'source p' } },
];
const prefix = text => ({ kind: 'group', variants: [{ text, match: 'prefix' }] });
const afterSource = text => ({ kind: 'and', children: [{ kind: 'text', text: 'source' }, prefix(text)] });

test('UI prefix queries preserve exact earlier words, raw Unicode and native query limits', async () => {
  const engine = createRaveldex({ schema });
  const scan = scanSourceCorpus(records, schema);
  try {
    await engine.addMany(records);
    for (const [input, expected] of [
      ['source provide', afterSource('provide')],
      ['source prov', afterSource('prov')],
      ['sour provide', { kind: 'none' }],
      ['"provide"', prefix('provide')],
      ['source, provide!!!', afterSource('provide')],
      ['source provide   ', afterSource('provide')],
      ['ＳＯＵＲＣＥ ｐｒｏｖ', afterSource('prov')],
      ['source CAFE\u0301', afterSource('café')],
      ['source 東京', afterSource('東京')],
      ['source p', { kind: 'text', text: 'source p' }],
      ['!!!', { kind: 'none' }],
      ['', { kind: 'all' }],
    ]) {
      const actual = await engine.search(queryFromText(input, 'prefix'));
      const reference = sourceQueryResult(scan, expected);
      assert.equal(actual.total, reference.total, input);
      assert.deepEqual(actual.hits.map(hit => hit.id), reference.hits.map(hit => hit.id), input);
    }
    assert.equal((await engine.search(queryFromText('source prov', 'text'))).total, 0);
    for (const input of ['\ud800provide', 'provide\ud800', 'source\ud800 provide', 'x'.repeat(2049)]) {
      await assert.rejects(engine.search(queryFromText(input, 'prefix')), error => ['INVALID_QUERY', 'LIMIT_EXCEEDED'].includes(error.code), input);
    }
  } finally { await engine.dispose(); }
});

test('UI prefix searches retain native expansion refusals', async () => {
  const engine = createRaveldex({ schema, limits: { maxExpansionsPerGroup: 1 } });
  try {
    await engine.addMany(records);
    await assert.rejects(engine.search(queryFromText('source provide', 'prefix')), { code: 'LIMIT_EXCEEDED' });
  } finally { await engine.dispose(); }
});
