import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root='/Users/vasilis/Documents/GitHub/raveldex';const mod=p=>import(pathToFileURL(root+'/'+p));
const {captureConfiguration}=await mod('dist/core/contracts/schema.js');const {initializeParticipants}=await mod('dist/core/capabilities/participants.js');const {emptyRoot,ExecutionOwner}=await mod('dist/core/execution/engine.js');const {FakeHost,FakeSignal}=await mod('test/fixtures/execution/host.mjs');const {createEnglishAnalyzer}=await mod('dist/integrations/languages/english/index.js');
const base=createEnglishAnalyzer();const host=new FakeHost(),signal=new FakeSignal();let closed=0;
const addon={...base,manifest:{...base.manifest,limits:{...base.manifest.limits,maxWorkUnits:1}},analyzer:{...base.analyzer,*transform(term){try{signal.stop(false);yield{workUnits:2};return term;}finally{closed++}}}};
const config=captureConfiguration({schema:{text:{title:{}}},analyzer:{id:base.analyzer.id,environmentProfile:'unqualified'},addons:[addon]});const installed=initializeParticipants(config);const owner=new ExecutionOwner(emptyRoot(config,installed.states),host,installed.participants);
const request=owner.add({id:'a',text:{title:'a'}},{signal});host.runReady();let code;try{await request;code='success'}catch(error){code=error.code}
console.log(JSON.stringify({actual:code,expectedStopPrecedence:'CANCELLED',closed,revision:owner.root.revision,listeners:signal.listenerCount,pending:host.pending}));
await owner.dispose();
