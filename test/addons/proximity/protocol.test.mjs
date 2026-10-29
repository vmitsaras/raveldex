import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaveldex} from '../../../dist/index.js';
import {createPositionProvider} from '../../../dist/addons/positions/index.js';
import {createSourceProvider} from '../../../dist/addons/phrases/source.js';
import {createProximity} from '../../../dist/addons/proximity/index.js';
import {createMatchEvidence} from '../../../dist/addons/evidence/index.js';
import {createSnippetEvidence} from '../../../dist/addons/snippets/index.js';
import {createInspector} from '../../../dist/addons/inspector/index.js';

const schema={text:{body:{},title:{}}},fields=['body'];
const query=(groups=[['red'],['blue']],maxGap=1)=>({kind:'extension',capability:'proximity',version:1,payload:{groups,maxGap}});
test('ordered refinement protocol captures handles, exact position requirements and owned canonical group contexts',async()=>{
  const addon=createProximity({fields}),position=createPositionProvider({fields});
  for(const edited of [
    {...addon,refinement:{...addon.refinement,kind:'unordered'}},
    {...addon,manifest:{...addon.manifest,dataRequirements:{...addon.manifest.dataRequirements,source:true}}},
    {...addon,manifest:{...addon.manifest,requires:[]}},
    {...addon,manifest:{...addon.manifest,requires:[...addon.manifest.requires,{id:'source:body',contractVersion:1}]}},
  ])assert.throws(()=>createRaveldex({schema,addons:[position,createSourceProvider({fields}),edited]}),e=>['MISSING_CAPABILITY','INCOMPATIBLE_CAPABILITY'].includes(e.code));
  let reads=0;const bad={kind:'ordered-token-groups',maxTokens:64};Object.defineProperty(bad,'prepare',{enumerable:true,get(){reads++;return addon.refinement.prepare;}});
  assert.throws(()=>createRaveldex({schema,addons:[position,{...addon,refinement:bad}]}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(reads,0);
  const seen=[],owned={...addon.refinement,*prepare(context){seen.push(context);return yield* addon.refinement.prepare(context);}};
  const engine=createRaveldex({schema,addons:[position,{...addon,refinement:owned}]});
  owned.prepare=function*(){throw Error('mutated callback');};
  try{
    await engine.add({id:'a',text:{body:'red gap blue'}});
    assert.equal((await engine.search(query([['RED','red'],['BLUE']]))).total,1);
    assert.deepEqual(seen[0].groups,[['red'],['blue']]);assert.equal(seen[0].maxGap,1);
    assert.deepEqual(seen[0].fields,['body']);assert.ok(Object.isFrozen(seen[0])&&Object.isFrozen(seen[0].groups)&&Object.isFrozen(seen[0].groups[0]));
    assert.throws(()=>seen[0].state('source:body'),{code:'MISSING_CAPABILITY'});
  }finally{await engine.dispose();}
});

test('ordered admission rejects malformed data without getters, shared lexical/token caps include duplicates and unreachable branches',async()=>{
  const engine=createRaveldex({schema,addons:[createPositionProvider({fields}),createProximity({fields})]});
  try{
    let reads=0;const payload={maxGap:1};Object.defineProperty(payload,'groups',{enumerable:true,get(){reads++;return [['red']];}});
    for(const value of [
      {...query(),payload},query([],0),query([[]],0),query([['']],0),query([['red blue']],0),query([['\ud800']],0),
      query([['red']],-1),query([['red']],1.5),query([['red']],33),{...query(),version:2},
      {...query(),payload:{...query().payload,extra:true}},
    ])await assert.rejects(engine.search({kind:'or',children:[{kind:'all'},value]}),e=>['INVALID_QUERY','LIMIT_EXCEEDED','INCOMPATIBLE_CAPABILITY'].includes(e.code));
    assert.equal(reads,0);
    await assert.rejects(engine.search(query(Array.from({length:5},()=>Array(16).fill('red')),0)),{code:'LIMIT_EXCEEDED'});
    await assert.rejects(engine.search(query([['r'.repeat(1025)],['b'.repeat(1024)]],0)),{code:'LIMIT_EXCEEDED'});
    await assert.rejects(engine.search({...query(),payload:{...query().payload,fields:['title']}}),{code:'MISSING_CAPABILITY'});
    assert.equal((await engine.search('red')).total,0);
  }finally{await engine.dispose();}
});

test('Inspector retains numerical facts while unsupported proximity range and snippet requests fail completely',async()=>{
  const engine=createRaveldex({schema,addons:[createPositionProvider({fields}),createSourceProvider({fields}),createProximity({fields}),createInspector(),createMatchEvidence({fields:{body:'source'}}),createSnippetEvidence({fields:{body:'source'}})]});
  try{
    await engine.add({id:'a',text:{body:'red gap blue'}});
    const result=await engine.search(query(),{extensions:{inspector:{ids:['a']}}});
    assert.equal(result.total,1);assert.equal(result.extensions.inspector.documents[0].eligibility,'matched');
    for(const capability of ['match-evidence','snippets'])for(const ids of [[],['a']])for(const node of [query(),{kind:'or',children:[{kind:'all'},{kind:'not',child:query()}]}])
      await assert.rejects(engine.search(node,{extensions:{[capability]:{ids}}}),{code:'MISSING_CAPABILITY'});
    assert.equal((await engine.search('red',{extensions:{'match-evidence':{ids:['a']}}})).total,1);
  }finally{await engine.dispose();}
});
