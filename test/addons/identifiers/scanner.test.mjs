import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIdentifiers } from '../../../dist/addons/identifiers/scanner.js';
import { createIdentifierAnalyzer, IDENTIFIER_ANALYZER } from '../../../dist/addons/identifiers/index.js';
import { DEFAULT_LIMITS } from '../../../dist/core/limits/limits.js';

function run(value, mode = 'index', limits = DEFAULT_LIMITS, valueIndex = 0) {
  const tokens = []; let workUnits = 0, steps = 0;
  for (const step of analyzeIdentifiers(value, valueIndex, limits, 'INVALID_RECORD', mode)) {
    assert.ok(Number.isSafeInteger(step.workUnits) && step.workUnits > 0);
    workUnits += step.workUnits; steps++;
    if (step.token) {
      assert.ok(Object.isFrozen(step.token));
      if (step.token.original) assert.ok(Object.isFrozen(step.token.original));
      tokens.push(step.token);
    }
  }
  return { tokens, workUnits, steps };
}
function expected(raw, whole, components, valueIndex = 0, position = 0, start = 0) {
  return [{ term: whole, valueIndex, position, start, end: start + raw.length, kind: 'original' },
    ...components.map(([term, from, to]) => ({ term, valueIndex, position, start: start + from, end: start + to,
      kind: 'component', original: { term: whole, start, end: start + raw.length } }))];
}

// Literal canonical terms and original coordinates are deliberately authored
// without calling production segmentation or normalization for expected data.
const basics = [
  ['createRaveldex','createraveldex',[['create',0,6],['raveldex',6,14]]],
  ['XMLHttpRequest','xmlhttprequest',[['xml',0,3],['http',3,7],['request',7,14]]],
  ['HTTPServer','httpserver',[['http',0,4],['server',4,10]]],
  ['HTTP2Response','http2response',[['http',0,4],['2',4,5],['response',5,13]]],
  ['sha256Digest','sha256digest',[['sha',0,3],['256',3,6],['digest',6,12]]],
  ['getURL2','geturl2',[['get',0,3],['url',3,6],['2',6,7]]],
  ['WORK_LIMIT_EXCEEDED','work_limit_exceeded',[['work',0,4],['limit',5,10],['exceeded',11,19]]],
  ['foo__Bar_','foo__bar_',[['foo',0,3],['bar',5,8]]],
  ['fooFoo','foofoo',[['foo',0,3]]],
  ['Ⅳ_IV','iv_iv',[['iv',0,1]]],
  ['plain','plain',[]],
];

test('identifier scanner preserves originals and exact camel/acronym/number/underscore component spans', () => {
  for (const [raw, whole, components] of basics) assert.deepEqual(run(raw).tokens, expected(raw, whole, components), raw);
});

test('Unicode boundaries precede per-span normalization and preserve original UTF-16 provenance', () => {
  const cases = [
    ['getΔοκιμή','getδοκιμή',[['get',0,3],['δοκιμή',3,9]]],
    ['caféParser','caféparser',[['café',0,4],['parser',4,10]]],
    ['cafe\u0301Parser','caféparser',[['café',0,5],['parser',5,11]]],
    ['ＡpiClient','apiclient',[['api',0,3],['client',3,9]]],
    ['𐐨Code','𐐨code',[['𐐨',0,2],['code',2,6]]],
    ['ﬁleName','filename',[['file',0,3],['name',3,7]]],
    ['fooⅣBar','fooivbar',[['foo',0,3],['iv',3,4],['bar',4,7]]],
    ['a½B','a1⁄2b',[['a',0,1],['1⁄2',1,2],['b',2,3]]],
    ['x_\u0301Y','x_\u0301y',[['x',0,1],['y',3,4]]],
  ];
  for (const [raw, whole, components] of cases) assert.deepEqual(run(raw).tokens, expected(raw, whole, components), raw);
  const emoji = run('😀fooBar').tokens;
  assert.deepEqual(emoji, expected('fooBar','foobar',[['foo',0,3],['bar',3,6]],0,0,2));
  assert.equal('😀fooBar'.slice(emoji[2].start, emoji[2].end), 'Bar');
});

test('path/punctuation boundaries and value-local positions preserve the chosen nonliteral policy', () => {
  const raw = '$fooBar/src_core\\HTTP2.ts--next';
  const tokens = run(raw, 'index', DEFAULT_LIMITS, 7).tokens;
  assert.deepEqual(tokens, [
    ...expected('fooBar','foobar',[['foo',0,3],['bar',3,6]],7,0,1),
    ...expected('src_core','src_core',[['src',0,3],['core',4,8]],7,1,8),
    ...expected('HTTP2','http2',[['http',0,4],['2',4,5]],7,2,17),
    ...expected('ts','ts',[],7,3,23),
    ...expected('next','next',[],7,4,27),
  ]);
  assert.deepEqual(run('___ 😀 \u0301').tokens, []);
  assert.deepEqual(run('fooBar', 'index', DEFAULT_LIMITS, 8).tokens, expected('fooBar','foobar',[['foo',0,3],['bar',3,6]],8));
});

test('query and strict-phrase modes emit only whole names and never flatten components into adjacency', () => {
  for (const [raw, whole] of basics) for (const mode of ['query', 'phrase']) {
    assert.deepEqual(run(raw, mode).tokens, expected(raw, whole, []), `${mode}: ${raw}`);
  }
  const raw = 'fooBar next', names = [
    ...expected('fooBar','foobar',[],0,0,0),
    ...expected('next','next',[],0,1,7),
  ];
  assert.deepEqual(run(raw, 'phrase').tokens, names);
  assert.deepEqual(run(raw, 'query').tokens, names);
  const plain = run('foo bar', 'phrase').tokens;
  assert.deepEqual(plain.map(token => [token.term, token.position]), [['foo',0],['bar',1]]);
  assert.deepEqual(run('fooBar').tokens.map(token => [token.term, token.position]), [['foobar',0],['foo',0],['bar',0]]);
});

test('identifier scanner rejects malformed UTF-16 and exact raw/normalized/value ceilings without truncation', () => {
  for (const value of ['\ud800','\udc00','ok\ud800bad']) assert.throws(() => run(value), error => error.code === 'INVALID_RECORD');
  const rawLimit = { ...DEFAULT_LIMITS, maxRawTokenCodeUnits: 6 };
  assert.equal(run('fooBar', 'index', rawLimit).tokens.length, 3);
  assert.throws(() => run('fooBar_', 'index', rawLimit), error => error.code === 'LIMIT_EXCEEDED' && error.details.limit === 6);
  const termLimit = { ...DEFAULT_LIMITS, maxTermCodeUnits: 2 };
  assert.equal(run('ab','index',termLimit).tokens[0].term,'ab');
  assert.throws(() => run('ﬁle', 'index', termLimit), error => error.code === 'LIMIT_EXCEEDED' && error.details.limit === 2);
  assert.throws(() => run('abcd','index',{...DEFAULT_LIMITS,maxTextCodeUnitsPerValue:3}), error => error.code === 'LIMIT_EXCEEDED' && error.details.limit === 3);
  assert.equal(run('a'.repeat(256)).tokens.length, 1);
  assert.throws(() => run('a'.repeat(257)), error => error.code === 'LIMIT_EXCEEDED' && error.details.limit === 256);
});

test('identifier cursor work is finite/deterministic, exposes derivation costs and releases on return', () => {
  const value = 'HTTP2Response fooFoo cafe\u0301Parser', first = run(value), second = run(value);
  assert.deepEqual(first, second);
  assert.ok(first.workUnits > value.length && first.steps > value.length);
  assert.ok(run(value,'index').workUnits > run(value,'query').workUnits);
  assert.equal(run('fooFoo').tokens.filter(token => token.term === 'foo').length, 1);
  const cursor = analyzeIdentifiers(value); assert.equal(cursor.next().done, false);
  assert.deepEqual(cursor.return(), { value: undefined, done: true });
  assert.equal(cursor.next().done, true);
});

test('identifier registration is immutable, independently versioned and contains no corpus participant', () => {
  const registration = createIdentifierAnalyzer();
  assert.ok(Object.isFrozen(registration) && Object.isFrozen(registration.analyzer) && Object.isFrozen(registration.manifest));
  assert.deepEqual(IDENTIFIER_ANALYZER, { id:'code-identifiers-v1', environmentProfile:'unqualified' });
  assert.deepEqual(registration.manifest.roles,['analyzer']);
  assert.deepEqual(registration.manifest.provides,[{id:'analyzer:code-identifiers-v1',contractVersion:1}]);
  assert.equal(registration.analyzer.kind,'identifier-tokenizer');
  assert.equal(registration.analyzer.analyze,analyzeIdentifiers);
  assert.equal(registration.manifest.version,'0.1.0');
  assert.equal(registration.manifest.indexEffect,'analysis');
  assert.equal(registration.manifest.limits.maxRetainedEntries,0);
  assert.equal(registration.manifest.limits.maxWorkUnits,50_000_000);
  assert.equal(registration.participant,undefined);
  assert.match(registration.manifest.execution.workerRegistration,/whole-plus-components-v1/);
});
