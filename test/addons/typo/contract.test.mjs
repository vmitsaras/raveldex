import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createTypoTolerance, TYPO_POLICY } from '../../../dist/addons/typo/index.js';
import { oneEdit } from '../../../dist/addons/typo/distance.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { drain, setup, typo, search } from './helpers.mjs';

const ids = result => result.hits.map(hit => hit.id);
const almost = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12, `${a} != ${b}`);

test('one-edit OSA semantics use code points including adjacent swaps, never multiple edits', () => {
  for (const [a, b, expected] of [['source','source',true],['sorce','source',true],['sourcce','source',true],['sourxe','source',true],['sourec','source',true],['form','from',true],['source','sauce',false],['abcd','badc',false],['café','cafe',true],['𐐨abc','𐐩abc',true],['𐐨abc','abc',true],['ab','ba',true],['abc','bca',false],['','a',true],['','ab',false]]) {
    assert.equal(drain(oneEdit([...a], [...b])).value, expected, `${a}/${b}`);
  }
});

test('factory owns bounded data, declares no retained side index and rejects malformed configuration', () => {
  const fields = ['body', 'title']; const registration = createTypoTolerance({ fields }); fields.pop();
  assert.deepEqual(registration.manifest.dataRequirements.fields, ['body', 'title']);
  assert.ok(Object.isFrozen(registration) && Object.isFrozen(registration.manifest));
  assert.equal(registration.expansion.policy, TYPO_POLICY);
  assert.equal(registration.manifest.limits.maxRetainedEntries, 0);
  for (const options of [null, {}, { fields: [] }, { fields: ['title','title'] }, { fields: ['__proto__'] }, { fields: ['title'], maxAlternatives: 0 }, { fields: ['title'], maxAlternatives: 32 }, { fields: ['title'], maxWorkUnits: NaN }, { fields: ['title'], extra: true }]) {
    assert.throws(() => createTypoTolerance(options), error => ['INVALID_OPTIONS','LIMIT_EXCEEDED'].includes(error.code));
  }
  assert.throws(() => createRaveldex({ schema: { text: { title: {} } }, addons: [registration] }), { code: 'INCOMPATIBLE_CAPABILITY' });
  const unknown = createTypoTolerance({ fields: ['title'] });
  assert.throws(() => createRaveldex({ schema: { text: { title: {} } }, addons: [{ ...unknown, expansion: { ...unknown.expansion, kind: 'unbounded' } }] }), { code: 'INCOMPATIBLE_CAPABILITY' });
});

test('explicit requests own query input; missing, incompatible and unauthorized field requests fail', async () => {
  const pending = setup({limits:{checkpointWorkUnits:1}}); await pending.call('add', { id:'a',text:{title:'source'} });
  const input = typo('sorce'); const captured = pending.engine.search(input); input.payload.text='missing'; input.payload.fields[0]='body'; pending.host.runReady();
  assert.deepEqual(ids(await captured), ['a']);
  const fixture = setup({ addons: [createTypoTolerance({ fields: ['title'] })] });
  for (const q of [typo('sorce',['body']), typo('', ['body']), { ...typo('sorce'),version:2 }]) await assert.rejects(fixture.call('search',q), error => ['MISSING_CAPABILITY','INCOMPATIBLE_CAPABILITY'].includes(error.code));
  const plain=setup({addons:[]}); await assert.rejects(plain.call('search',typo('sorce')), {code:'MISSING_CAPABILITY'});
  await assert.rejects(fixture.call('search',{...typo('sorce'),payload:{text:'sorce',fields:['title'],maxDistance:2}}), {code:'INVALID_QUERY'});
});

test('exact-first, query minimum and complete alternatives are explicit and deterministic', async () => {
  const { call, engine } = setup();
  await call('addMany', [
    {id:'a',text:{title:'source'}}, {id:'b',text:{title:'sauce'}}, {id:'c',text:{title:'sorce'}},
    {id:'d',text:{title:'cat'}}, {id:'e',text:{title:'coat'}}, {id:'f',text:{title:'café ½'}},
  ]);
  const exact=await call('search',typo('source')); assert.deepEqual(ids(exact),['a']);
  assert.equal(exact.extensions.typo.groups[0].dictionaryEntriesVisited,0);
  await call('remove',['c']);
  const corrected=await call('search',typo('sorce')); assert.deepEqual(ids(corrected),['a']);
  assert.deepEqual(corrected.extensions.typo.groups[0].alternatives,[{term:'source',match:'exact',weight:0.5}]);
  assert.equal((await call('search',typo('cot'))).total,0);
  assert.deepEqual(ids(await call('search',typo('cart'))),['d']);
  assert.deepEqual(ids(await call('search',typo('cafe\u0301'))),['f']);
  assert.deepEqual(ids(await call('search',typo('½'))),['f']);
  assert.equal((await call('search',typo('!!!'))).total,0);
  assert.deepEqual((await call('search',typo('!!!'))).extensions.typo.groups,[]);
  const first=search(engine.root,typo('sourxe')).value;
  assert.ok(Object.isFrozen(first.extensions.typo.groups[0].alternatives));
});

test('original AND groups, repeats and successful OR/NOT branches preserve native score facts', async () => {
  const fixture=setup(); await fixture.call('addMany',[{id:'a',text:{title:'source atomic'}},{id:'b',text:{title:'source'}},{id:'c',text:{title:'atomic'}},{id:'d',text:{title:'other'}}]);
  const one=search(fixture.engine.root,typo('sorce'),undefined,{ids:['a','b','c']}).value;
  const many=search(fixture.engine.root,typo('sorce atmoic')).value; assert.deepEqual(ids(many),['a']);
  const twice=search(fixture.engine.root,typo('sorce sorce')).value; assert.deepEqual(twice.hits,one.hits);
  const twoDistinct=search(fixture.engine.root,typo('sorce sourxe')).value;
  for(let i=0;i<one.hits.length;i++)almost(twoDistinct.hits[i].score,2*one.hits[i].score);
  const or=search(fixture.engine.root,{kind:'or',children:[{kind:'and',children:[typo('sorce'),{kind:'text',text:'missing'}]},{kind:'text',text:'atomic'}]}).value;
  assert.deepEqual(or.hits,search(fixture.engine.root,'atomic').value.hits);
  const not=search(fixture.engine.root,{kind:'not',child:typo('sorce')}).value; assert.deepEqual(ids(not),['c','d']);assert.ok(not.hits.every(hit=>hit.score===0));
  const field=one.trace.facts.find(fact=>fact.kind==='field');
  almost(field.selected,0.5*field.boost*Math.log(1+(field.N-field.df+0.5)/(field.df+0.5))*(field.tf*2.2)/(field.tf+1.2*(0.25+0.75*field.length/(field.totalLength/field.N))));
  const compiled=JSON.parse(one.trace.query); assert.equal(compiled.kind,'and');
  assert.ok(compiled.children[0].group.variants.some(v=>v.term==='sorce'&&v.weight===1));
  assert.ok(compiled.children[0].group.variants.some(v=>v.term==='source'&&v.weight===0.5));
});

test('ordinary exact/prefix/strict phrases remain strict; typo output merges with facets and Inspector', async () => {
  const addons=[createTypoTolerance({fields:['title','body']}),createSourceProvider({fields:['title','body']}),createSourcePhrases({fields:['title','body']}),createFacets({fields:['category']}),createInspector()];
  const fixture=setup({addons}); await fixture.call('addMany',[{id:'a',text:{title:'source atomic'},metadata:{category:'guide'}},{id:'b',text:{title:'atomic source'},metadata:{category:'api'}}]);
  assert.equal((await fixture.call('search','sorce')).total,0);
  assert.equal((await fixture.call('search',{kind:'group',fields:['title'],variants:[{text:'sor',match:'prefix'}]})).total,0);
  assert.equal((await fixture.call('search',{kind:'extension',capability:'phrases',version:1,payload:{text:'sorce atomic',fields:['title']}})).total,0);
  assert.equal((await fixture.call('search',{kind:'extension',capability:'phrases',version:1,payload:{text:'source atomic',fields:['title']}})).total,1);
  const result=await fixture.call('search',typo('sorce'),{extensions:{facets:{fields:[{field:'category'}]}}});
  assert.ok(result.extensions.typo && result.extensions.facets);
  const inspected=await fixture.call('search',typo('sorce'),{extensions:{inspector:{ids:['a']}}});
  assert.ok(inspected.extensions.typo && inspected.extensions.inspector);
  assert.ok(inspected.extensions.inspector.trace.facts.some(fact=>fact.kind==='field'&&fact.term==='source'&&fact.weight===0.5));
  const match=setup({addons:[createTypoTolerance({fields:['title']}),createSourceProvider({fields:['title']}),createMatchEvidence({fields:{title:'source'}})]});
  await match.call('add',{id:'a',text:{title:'SOURCE atomic source'}});
  const ranges=await match.call('search',typo('sorce'),{extensions:{'match-evidence':{ids:['a'],fields:['title']}}});
  assert.ok(ranges.extensions.typo);
  assert.deepEqual(ranges.extensions['match-evidence'].documents[0].ranges.map(({start,end,term})=>({start,end,term})),[{start:0,end:6,term:'source'},{start:14,end:20,term:'source'}]);
});
