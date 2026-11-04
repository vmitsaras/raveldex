import test from 'node:test';
import assert from 'node:assert/strict';
import { updateTermOrder, prefixTerms } from '../../dist/core/index/term-order.js';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { validateNative } from '../../dist/adapters/snapshots/native.js';
const charge = workUnits => ({ workUnits });
function drain(iterator) { let work=0; for (;;) { const next=iterator.next(); if(next.done)return next.value; assert.ok(next.value.workUnits>0);work+=next.value.workUnits;assert.ok(work<50_000_000); } }
function verify(root, expected) {
  const keys=[], seen=new Set();
  function walk(node) { if(!node)return 0;assert.ok(Object.isFrozen(node));assert.ok(!seen.has(node));seen.add(node);const l=walk(node.left);keys.push(node.key);const r=walk(node.right);assert.equal(node.height,1+Math.max(l,r));assert.ok(Math.abs(l-r)<=1);return node.height; }
  const height=walk(root);assert.deepEqual(keys,[...expected].sort());assert.ok(height<=2*Math.log2(expected.size+1));
}
test('ordered term updates balance sorted/reverse/random input and preserve old roots through all deletions',()=>{
  const keys=Array.from({length:600},(_,i)=>`key${i.toString().padStart(4,'0')}`);
  for(const order of [keys,[...keys].reverse(),[...keys].sort((a,b)=>((Number(a.slice(3))*151)%601)-((Number(b.slice(3))*151)%601))]){
    let root=null;const expected=new Set();
    for(const key of order){const old=root;root=drain(updateTermOrder(root,key,true,charge));expected.add(key);verify(root,expected);if(old)assert.ok(Object.isFrozen(old));}
    const published=root;assert.equal(drain(updateTermOrder(root,'key0050',true,charge)),root);assert.equal(drain(updateTermOrder(root,'missing',false,charge)),root);
    for(const key of order.filter((_,i)=>i%2).concat(order.filter((_,i)=>i%2===0))){root=drain(updateTermOrder(root,key,false,charge));expected.delete(key);verify(root,expected);}
    assert.equal(root,null);verify(published,new Set(keys));
  }
});
test('prefix lower bound visits bounded nodes, includes exact/UTF16 endpoints and never scans the full vocabulary',()=>{
  const keys=[...Array.from({length:8192},(_,i)=>`vocab${i.toString().padStart(5,'0')}`),'pre','prea','pre\uffff','pre\ufffftail','pre𐐨','prf','𐐨','𐐨𐐩'];
  let root=null;for(const key of keys)root=drain(updateTermOrder(root,key,true,charge));
  for(const prefix of ['pre','pre\uffff','𐐨','vocab001','vocab099','aaa','zzz']){
    let visits=0;const actual=drain(prefixTerms(root,prefix,256,charge,()=>visits++));assert.deepEqual(actual.keys,keys.filter(key=>key.startsWith(prefix)).sort());assert.equal(actual.overflow,false);assert.ok(visits<=2*actual.keys.length+2*root.height+2,`${prefix}: ${visits}`);
  }
  const limited=drain(prefixTerms(root,'vocab',3,charge));assert.deepEqual(limited,{keys:['vocab00000','vocab00001','vocab00002','vocab00003'],overflow:true});
  assert.deepEqual(drain(prefixTerms(null,'pre',0,charge)),{keys:[],overflow:false});
});
test('full index diagnostics and native export validation reject stale, cyclic and malformed live order roots',()=>{
  const build=new IndexConstruction({schema:{text:{body:{}}}});drain(build.append([{id:'a',text:{body:'prea preb'}}]));const root=drain(build.finish());drain(inspectIndex(root));
  const order=root.fields.body.order;
  const cycle={...order};cycle.left=cycle;Object.freeze(cycle);
  for(const broken of [null,Object.freeze({...order,height:999}),Object.freeze({...order,key:'absent'}),cycle]){
    const fields=Object.freeze({...root.fields,body:Object.freeze({...root.fields.body,order:broken})});const bad=Object.freeze({...root,fields});assert.throws(()=>drain(inspectIndex(bad)),{code:'INTERNAL_ERROR'});
    const payload={documents:root.documents,counts:root.counts,participants:root.participants,fields:Object.assign(Object.create(null),{body:Object.freeze({documents:root.fields.body.documents,length:root.fields.body.length,terms:root.fields.body.terms})})};Object.freeze(payload.fields);Object.freeze(payload);
    assert.throws(()=>drain(validateNative(payload,root.configuration,0,undefined,fields)),{code:'INTERNAL_ERROR'});
  }
});
