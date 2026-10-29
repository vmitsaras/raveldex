import test from 'node:test';
import assert from 'node:assert/strict';
import { stemEnglish } from '../../../dist/integrations/languages/english/stem.js';

function run(term) {
  const cursor = stemEnglish(term); let units = 0, steps = 0;
  for (;;) {
    const next = cursor.next();
    if (next.done) return { term: next.value, units, steps };
    assert.ok(Number.isSafeInteger(next.value.workUnits) && next.value.workUnits > 0);
    units += next.value.workUnits; steps++;
  }
}

// Final stems calculated from the original paper's complete sequence, rather
// than its intermediate per-step examples; truth never calls another matcher.
const finalExamples = [
  ['caresses','caress'],['ponies','poni'],['ties','ti'],['caress','caress'],['cats','cat'],
  ['feed','feed'],['agreed','agre'],['plastered','plaster'],['bled','bled'],['motoring','motor'],['sing','sing'],
  ['conflated','conflat'],['troubled','troubl'],['sized','size'],['hopping','hop'],['tanned','tan'],
  ['falling','fall'],['hissing','hiss'],['fizzed','fizz'],['failing','fail'],['filing','file'],['happy','happi'],['sky','sky'],
  ['relational','relat'],['conditional','condit'],['rational','ration'],['valenci','valenc'],['hesitanci','hesit'],
  ['digitizer','digit'],['conformabli','conform'],['radicalli','radic'],['differentli','differ'],['vileli','vile'],
  ['analogousli','analog'],['vietnamization','vietnam'],['predication','predic'],['operator','oper'],['feudalism','feudal'],
  ['decisiveness','decis'],['hopefulness','hope'],['callousness','callous'],['formaliti','formal'],['sensitiviti','sensit'],
  ['sensibiliti','sensibl'],['triplicate','triplic'],['formative','form'],['formalize','formal'],['electriciti','electr'],
  ['electrical','electr'],['hopeful','hope'],['goodness','good'],['revival','reviv'],['allowance','allow'],['inference','infer'],
  ['airliner','airlin'],['gyroscopic','gyroscop'],['adjustable','adjust'],['defensible','defens'],['irritant','irrit'],
  ['replacement','replac'],['adjustment','adjust'],['dependent','depend'],['adoption','adopt'],['homologou','homolog'],
  ['communism','commun'],['activate','activ'],['angulariti','angular'],['homologous','homolog'],['effective','effect'],
  ['bowdlerize','bowdler'],['probate','probat'],['rate','rate'],['cease','ceas'],['controll','control'],['roll','roll'],
];

test('native original-1980 English stemming follows complete literal suffix and measure examples', () => {
  for (const [original, expected] of finalExamples) assert.equal(run(original).term, expected, original);
});

test('English stemming preserves non-ASCII/digit terms and explicitly selected short-word behavior', () => {
  for (const term of ['', 'a', 'as', 'is', 'by', 'y', 'yy', 'café', 'cafe\u0301', 'δοκιμή', 'Straße', 'UPPER', 'h2o', '123', '1⁄2', '𐐨test']) assert.equal(run(term).term, term);
  for (const [original, expected] of [['youthful','youth'],['toy','toi'],['boy','boi'],['syzygy','syzygi'],['yelling','yell'],['filing','file'],['feed','feed'],['gas','ga'],['news','new'],['possibly','possibli'],['analogies','analogi'],['accing','ac']]) assert.equal(run(original).term, expected, original);
});

test('bounded stem cursors expose actual work and close without retaining per-word state', () => {
  const word = 'a'.repeat(256), first = run(word), second = run(word);
  assert.deepEqual(second, first); assert.equal(first.term, word); assert.ok(first.units > 256 && first.steps > 256);
  assert.throws(() => run('a'.repeat(257)), error => error.code === 'LIMIT_EXCEEDED' && error.details.limit === 256);
  const cursor = stemEnglish('relational'); assert.equal(cursor.next().done, false); assert.deepEqual(cursor.return('closed'), { value:'closed', done:true }); assert.equal(cursor.next().done, true);
  for (const word of ['documents','indexing','atomic','source','queries','storage']) assert.ok(run(word).units > word.length);
});
