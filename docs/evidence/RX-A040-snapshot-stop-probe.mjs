import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root='/Users/vasilis/Documents/GitHub/raveldex',mod=p=>import(pathToFileURL(root+'/'+p));
const {createEnglishAnalyzer,ENGLISH_ANALYZER}=await mod('dist/integrations/languages/english/index.js');
const {createSourceProvider}=await mod('dist/addons/phrases/index.js');
const {createSnapshotRaveldex,createSnapshots,currentNodeSnapshotEnvironment}=await mod('dist/adapters/snapshots/index.js');
const {createQualifiedSnapshotEngine}=await mod('dist/adapters/snapshots/snapshots.js');
const {getExecutionOwner}=await mod('dist/core/execution/engine.js');const {FakeHost,FakeSignal}=await mod('test/fixtures/execution/host.mjs');
const qualification={profileId:'rx-a040-review-exact-node',scope:'exact-node-runtime',environment:currentNodeSnapshotEnvironment(),evidence:['Independent fault fixture only; no cross-host Unicode claim']};
const base=createEnglishAnalyzer(),source=createSourceProvider({fields:['title']});const schema={text:{title:{}}};
const producer=createSnapshotRaveldex({schema,analyzer:ENGLISH_ANALYZER,addons:[base,source]},{nativeQualification:qualification});
function patch(encoded){const envelope=JSON.parse(encoded);envelope.body.header.capabilities.find(m=>m.id===base.manifest.id).limits.maxWorkUnits=1;let hash=2166136261;for(const c of JSON.stringify(envelope.body)){for(let i=0;i<c.length;i++)hash=Math.imul(hash^c.charCodeAt(i),16777619)}envelope.integrity.value=(hash>>>0).toString(16).padStart(8,'0');return JSON.stringify(envelope);}
try{await producer.add({id:'a',text:{title:'a'}});for(const format of ['Source','Native']){
const encoded=patch(await createSnapshots(producer)['export'+format]());const host=new FakeHost(),signal=new FakeSignal();let closed=0;
const addon={...base,manifest:{...base.manifest,limits:{...base.manifest.limits,maxWorkUnits:1}},analyzer:{...base.analyzer,*transform(term){try{signal.stop(false);yield{workUnits:2};return term;}finally{closed++}}}};
const receiver=createQualifiedSnapshotEngine({schema,analyzer:ENGLISH_ANALYZER,addons:[addon,source]},qualification,host);const owner=getExecutionOwner(receiver),before=owner.root;const request=createSnapshots(receiver).restore(encoded,{signal});host.runReady();let code;try{await request;code='success'}catch(e){code=e.code};console.log(JSON.stringify({format,actual:code,expected:'CANCELLED',cursorClosed:closed,rootPreserved:owner.root===before,revision:owner.root.revision,pending:host.pending,listeners:signal.listenerCount}));await receiver.dispose();
}}finally{await producer.dispose()}
