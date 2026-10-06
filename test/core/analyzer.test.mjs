import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeValue, BASIC_ANALYZER } from '../../dist/core/analyzer/basic.js';
import { RaveldexError } from '../../dist/core/errors/error.js';
import { DEFAULT_LIMITS, resolveLimits } from '../../dist/core/limits/limits.js';
import { basicV1Fixtures, malformedUtf16Fixtures } from '../fixtures/analysis/basic-v1.mjs';

function analyze(value, valueIndex = 0, limits = DEFAULT_LIMITS, code = 'INVALID_RECORD') {
  const tokens = [];
  for (const step of analyzeValue(value, valueIndex, limits, code)) {
    assert.equal(Number.isSafeInteger(step.workUnits), true);
    assert.equal(step.workUnits > 0, true);
    if (step.token !== undefined) tokens.push(step.token);
  }
  return tokens;
}

function isError(code, details) {
  return (error) => {
    assert.ok(error instanceof RaveldexError);
    assert.equal(error.code, code);
    assert.deepEqual(error.details, details);
    return true;
  };
}

test('basic-v1 identity is a versioned unqualified descriptor', () => {
  assert.deepEqual(BASIC_ANALYZER, { id: 'basic-v1', environmentProfile: 'unqualified' });
  assert.equal(Object.isFrozen(BASIC_ANALYZER), true);
});

for (const fixture of basicV1Fixtures) {
  test(`basic-v1: ${fixture.name}`, () => {
    const tokens = analyze(fixture.input);
    assert.deepEqual(tokens, fixture.tokens);
    for (const token of tokens) {
      assert.equal(Object.isFrozen(token), true);
      assert.ok(token.end > token.start);
      assert.ok(token.start >= 0 && token.end <= fixture.input.length);
    }
  });
}

test('value indices preserve empty array entries while positions and offsets reset', () => {
  const values = ['', 'Echo echo', '', 'ﬁle', '😀', 'A'];
  const tokens = values.flatMap((value, index) => analyze(value, index));
  assert.deepEqual(tokens, [
    { term: 'echo', valueIndex: 1, position: 0, start: 0, end: 4 },
    { term: 'echo', valueIndex: 1, position: 1, start: 5, end: 9 },
    { term: 'file', valueIndex: 3, position: 0, start: 0, end: 3 },
    { term: 'a', valueIndex: 5, position: 0, start: 0, end: 1 },
  ]);
});

test('the same analyzer produces identical indexing and query terms with explicit query errors', () => {
  for (const fixture of basicV1Fixtures) {
    assert.deepEqual(analyze(fixture.input, 0, DEFAULT_LIMITS, 'INVALID_QUERY'), fixture.tokens);
  }
});

for (const [name, value] of malformedUtf16Fixtures) {
  test(`invalid UTF-16: ${name}`, () => {
    assert.throws(() => analyze(value), isError('INVALID_RECORD', { path: 'analysis.value' }));
    assert.throws(() => analyze(value, 0, DEFAULT_LIMITS, 'INVALID_QUERY'),
      isError('INVALID_QUERY', { path: 'analysis.value' }));
  });
}

test('well-formed supplementary delimiters at the input limit are accepted', () => {
  const limits = resolveLimits({ maxTextCodeUnitsPerValue: 4 });
  assert.deepEqual(analyze('😀😀', 0, limits), []);
  assert.throws(() => analyze('😀😀 ', 0, limits),
    isError('LIMIT_EXCEEDED', { path: 'analysis.value', limit: 4, actual: 5 }));
});

test('the default original-value cap counts all delimiters and cannot be evaded by empty analysis', () => {
  assert.deepEqual(analyze(' '.repeat(65_536)), []);
  assert.throws(() => analyze(' '.repeat(65_537)),
    isError('LIMIT_EXCEEDED', { path: 'analysis.value', limit: 65_536, actual: 65_537 }));
});

test('raw tokens are accepted exactly at the cap and rejected rather than split above it', () => {
  const value = 'a'.repeat(256);
  assert.deepEqual(analyze(value), [
    { term: value, valueIndex: 0, position: 0, start: 0, end: 256 },
  ]);
  assert.throws(() => analyze(value + 'a'),
    isError('LIMIT_EXCEEDED', { path: 'analysis.rawToken', limit: 256, actual: 257 }));
});

test('raw UTF-16 limits count supplementary letters as two units', () => {
  const limits = resolveLimits({ maxRawTokenCodeUnits: 2 });
  assert.deepEqual(analyze('𐐀', 0, limits), [
    { term: '𐐨', valueIndex: 0, position: 0, start: 0, end: 2 },
  ]);
  assert.throws(() => analyze('𐐀a', 0, limits),
    isError('LIMIT_EXCEEDED', { path: 'analysis.rawToken', limit: 2, actual: 3 }));
});

test('normalization contraction does not bypass the raw-token cap', () => {
  const limits = resolveLimits({ maxRawTokenCodeUnits: 2 });
  assert.deepEqual(analyze('a\u0301', 0, limits), [
    { term: 'á', valueIndex: 0, position: 0, start: 0, end: 2 },
  ]);
  assert.throws(() => analyze('a\u0301\u0301', 0, limits),
    isError('LIMIT_EXCEEDED', { path: 'analysis.rawToken', limit: 2, actual: 3 }));
});

test('NFKC expansion is bounded after normalization with no truncation', () => {
  const limits = resolveLimits({ maxTermCodeUnits: 2 });
  assert.deepEqual(analyze('ﬁ', 0, limits), [
    { term: 'fi', valueIndex: 0, position: 0, start: 0, end: 1 },
  ]);
  assert.throws(() => analyze('ﬃ', 0, limits),
    isError('LIMIT_EXCEEDED', { path: 'analysis.term', limit: 2, actual: 3 }));
});

test('the normalized cap applies after lowercasing expands dotted capital I', () => {
  const limits = resolveLimits({ maxTermCodeUnits: 1 });
  assert.deepEqual(analyze('I', 0, limits), [
    { term: 'i', valueIndex: 0, position: 0, start: 0, end: 1 },
  ]);
  assert.throws(() => analyze('İ', 0, limits),
    isError('LIMIT_EXCEEDED', { path: 'analysis.term', limit: 1, actual: 2 }));
});

test('default normalized cap rejects a raw token whose compatibility expansion exceeds 256 units', () => {
  const atCap = 'ﬁ'.repeat(128);
  assert.deepEqual(analyze(atCap), [
    { term: 'fi'.repeat(128), valueIndex: 0, position: 0, start: 0, end: 128 },
  ]);
  assert.throws(() => analyze(atCap + 'ﬁ'),
    isError('LIMIT_EXCEEDED', { path: 'analysis.term', limit: 256, actual: 258 }));
});

test('validation executes through the generator rather than scanning on creation', () => {
  const malformed = analyzeValue('\uD800');
  assert.throws(() => malformed.next(), isError('INVALID_RECORD', { path: 'analysis.value' }));
  const oversized = analyzeValue(' '.repeat(65_537));
  assert.throws(() => oversized.next(),
    isError('LIMIT_EXCEEDED', { path: 'analysis.value', limit: 65_536, actual: 65_537 }));
});

test('work steps count original code points and bounded normalization inputs/outputs', () => {
  // Five original code points: emoji, space, A, space, ligature.
  // Normalization primitives have two raw units and three output units.
  const steps = [...analyzeValue('😀 A ﬁ')];
  assert.equal(steps.reduce((sum, step) => sum + step.workUnits, 0), 10);
  assert.deepEqual(steps.filter((step) => step.token !== undefined).map((step) => step.token), [
    { term: 'a', valueIndex: 0, position: 0, start: 3, end: 4 },
    { term: 'fi', valueIndex: 0, position: 1, start: 5, end: 6 },
  ]);
});

test('delimiter scanning offers resumable steps and resumes without skipping the final token', () => {
  const iterator = analyzeValue(' '.repeat(8_192) + 'A');
  const first = iterator.next();
  assert.equal(first.done, false);
  assert.deepEqual(first.value, { workUnits: 1 });
  const rest = [...iterator];
  assert.equal(rest.filter((step) => step.token === undefined).length, 8_192);
  assert.deepEqual(rest.filter((step) => step.token !== undefined).map((step) => step.token), [
    { term: 'a', valueIndex: 0, position: 0, start: 8_192, end: 8_193 },
  ]);
});

test('bounded failure details omit raw source content', () => {
  const source = 'SecretPayload\uD800';
  assert.throws(() => analyze(source), (error) => {
    assert.ok(error instanceof RaveldexError);
    assert.equal(error.message.includes('SecretPayload'), false);
    assert.equal(JSON.stringify(error.details).includes('SecretPayload'), false);
    assert.equal(Object.isFrozen(error.details), true);
    return true;
  });
});
