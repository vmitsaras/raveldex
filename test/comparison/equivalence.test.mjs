import test from 'node:test';
import assert from 'node:assert/strict';
import { companionQuery, foreignMembership } from '../../bench/comparison-lib.mjs';

test('comparison translates complete supported semantics and refuses predicate loss', () => {
  assert.equal(companionQuery('😀 !!!'), null);
  assert.equal(companionQuery({ kind: 'and', children: [{ kind: 'text', text: '😀' }, { kind: 'eq', field: 'group', value: 'a' }] }), null);
  assert.deepEqual(companionQuery({ kind: 'and', children: [{ kind: 'text', text: 'red' }, { kind: 'eq', field: 'group', value: 'a' }] }),
    { kind: 'text', value: 'red', combine: 'all', mode: 'tokens', limit: 100, where: { group: { eq: 'a' } } });
  for (const query of [{ kind: 'not', child: { kind: 'all' } }, { kind: 'eq', field: 'group', value: null },
    { kind: 'and', children: [{ kind: 'eq', field: 'group', value: 'a' }, { kind: 'eq', field: 'group', value: 'b' }] },
    { kind: 'or', children: [{ kind: 'text', text: 'red' }, { kind: 'text', text: 'blue' }] }]) assert.equal(companionQuery(query), null);
});

test('independent foreign eligibility preserves repetition, value boundaries and historical normalization', () => {
  const records = [{ id: 'a', text: { body: ['red', 'blue', 'echo echo'] }, metadata: { group: 'a' } },
    { id: 'b', text: { body: 'red blue echo ＣＡＲ' }, metadata: { group: 'b' } }];
  const ids = text => foreignMembership(records, ['body'], companionQuery({ kind: 'phrase', text }));
  assert.deepEqual(ids('red blue'), ['b']); assert.deepEqual(ids('echo echo'), ['a']);
  assert.deepEqual(foreignMembership(records, ['body'], companionQuery('car')), []);
  assert.deepEqual(foreignMembership(records, ['body'], companionQuery('ＣＡＲ')), ['b']);
});
