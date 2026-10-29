/** Independent pre-repair protocol reproductions. No evaluator/oracle imports. */
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const {createRaveldex}=await import(new URL('dist/index.js',root));
const {getExecutionOwner}=await import(new URL('dist/core/execution/engine.js',root));
const {createIdentifierAnalyzer,IDENTIFIER_ANALYZER}=await import(new URL('dist/addons/identifiers/index.js',root));
const bindings=[];
for(const path of ['src/core/analyzer/identifier.ts','src/core/capabilities/registration.ts','dist/core/analyzer/identifier.js','dist/core/capabilities/registration.js']){
 const bytes=await readFile(new URL(path,root)),info=await stat(new URL(path,root));bindings.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),modifiedAt:info.mtime.toISOString()});
}
const rows=[];
const {createPositionProvider}=await import(new URL('dist/addons/positions/index.js',root));
for(const positions of [false,true]){
 const standard=createIdentifierAnalyzer(),id='my-identifiers-v1',addon={...standard,manifest:{...standard.manifest,provides:[{id:'analyzer:'+id,contractVersion:1}]},analyzer:{...standard.analyzer,id}};
 let engine;try{engine=createRaveldex({schema:{text:{code:{}}},analyzer:{id,environmentProfile:'unqualified'},addons:[addon,...positions?[createPositionProvider({fields:['code'],offsets:['code']})]:[]]});
 rows.push({finding:'R1',positions,result:await engine.add({id:'a',text:{code:'fooBar'}})});
 }catch(error){rows.push({finding:'R1',positions,error:error.code,message:error.message});}finally{await engine?.dispose();}
}
for(const flipAfter of [7,8,Infinity]){
 let reads=0;
 const token=Object.freeze({get term(){return ++reads<=flipAfter?'foobar':'forged'},valueIndex:0,position:0,start:0,end:6,kind:'original'});
 const standard=createIdentifierAnalyzer(),addon={...standard,analyzer:{...standard.analyzer,*analyze(){yield{workUnits:1,token}}}};
 const engine=createRaveldex({schema:{text:{code:{}}},analyzer:IDENTIFIER_ANALYZER,addons:[addon]});
 try{const result=await engine.add({id:'a',text:{code:'fooBar'}});rows.push({finding:'R2',flipAfter:String(flipAfter),reads,result,documents:getExecutionOwner(engine).root.documents});}
 catch(error){rows.push({finding:'R2',flipAfter:String(flipAfter),reads,error:error.code});}finally{await engine.dispose();}
}
const report={kind:'raveldex-rx-a050-independent-runtime-initial-v1',recordedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},bindings,rows,
 scope:'Pre-repair built runtime, independent targeted output ownership/protocol probes. Source and compiled hashes are separate because the parent may already be editing repairs. No own evaluation/oracle calls, builds, Git or remote actions.',
 findings:[{id:'R1',severity:'mandatory',summary:'Arbitrary raw analyzer IDs can index core but selecting positions chooses v1 and fails at runtime with INTERNAL_ERROR. Reserve the bounded protocol to its supported exact analyzer ID.'},
 {id:'R2',severity:'mandatory',summary:'A frozen accessor token can change term after normalized-source validation and commit a forged reverse frequency. Reject accessor/symbol output and capture owned immutable token data before use.'}]};
await writeFile(new URL('RX-A050-runtime-review-initial.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({bindings,rows}));
