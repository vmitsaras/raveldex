import {createWorkerRaveldex} from '@vmitsaras/raveldex/adapters/worker';
import {createWorkerSnapshots} from '@vmitsaras/raveldex/adapters/worker/snapshots';
import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
import {recordsFor,updatedRecord,schema,QUERY_ROWS,checkPage} from './cost-fixture.mjs';
import {observeTransport} from './transport-observer.mjs';
let worker,engine,snapshots,observer,records,encoded,size;
const deadlineMs=60000,mark=(op,edge)=>performance.mark(`rx:operation:${op}:${edge}`);
window.transportHarness={
  async start(){worker=new Worker(new URL('./transport-worker.mjs',import.meta.url),{type:'module'});observer=observeTransport(worker,'main');
    engine=await createWorkerRaveldex({worker:observer.endpoint,ownership:'external',sameHost:true,responseTimeoutMs:120000,
      configuration:{schema,addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]}});snapshots=createWorkerSnapshots(engine);},
  async build(count){size=count;records=recordsFor(size);for(let i=0;i<size;i+=256)await engine.addMany(records.slice(i,i+256),{deadlineMs});records=undefined;await engine.replace(updatedRecord,{deadlineMs});},
  async exportSource(){mark('exportSource','begin');try{encoded=await snapshots.exportSource({deadlineMs});return{codeUnits:encoded.length};}finally{mark('exportSource','end');}},
  async priorReceiver(){await engine.clear({deadlineMs});await engine.add({id:'prior',text:{body:'prior state'}},{deadlineMs});},
  async restoreSource(){mark('restoreSource','begin');try{return{outcome:'Pass',result:await snapshots.restore(encoded,{deadlineMs})};}
    catch(error){return{outcome:'Rejected',error:{name:error.name,code:error.code??null,reason:error.reason??null}};}finally{mark('restoreSource','end');}},
  async verify(prior=false){if(prior){const r=await engine.search({kind:'all'},{limit:20,deadlineMs});if(r.total!==1||r.hits.length!==1||r.hits[0].id!=='prior'||r.completeness!=='complete')throw Error('Prior state lost');return[{total:r.total,revision:r.revision,ids:['prior']}];}
    const expected=recordsFor(size);expected[0]=updatedRecord;return Promise.all(QUERY_ROWS.map(async row=>checkPage(await engine.search(row.query,{limit:20,deadlineMs}),expected,row)));},
  observation(){return observer.snapshot();},
  async dispose(){await engine.dispose();engine=snapshots=encoded=records=undefined;},
};
