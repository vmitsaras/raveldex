// Replay after npm run build. argv[2] may override the repository root.
// When saved under docs/evidence/, the repository root is inferred.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repository = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const outputPath = fileURLToPath(new URL(import.meta.url.replace(/\.mjs$/, '.json')));
const moduleFromRepo = path => import(pathToFileURL(resolve(repository, path)).href);
const { createRaveldex, RaveldexError } = await moduleFromRepo('dist/index.js');
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const schema = { text: { body: {} } };
function refinement(version = '1.0.0', prepare) {
 return { manifest: { id: 'review', version, contractVersion: 1, roles: ['leaf-refinement'], provides: [{ id: 'review', contractVersion: 1 }], requires: [], dataRequirements: { fields: ['body'], source: false, positions: false, offsets: false, metadata: false }, indexEffect: 'none', rebuildPolicy: 'new-index', execution: { direct: true, worker: false }, limits: { maxPayloadCodeUnits: 2048, maxWorkUnits: 1, maxRetainedEntries: 0, maxOutputEntries: 0 }, costs: { importedCode: 'probe', retainedRepresentation: 'none', transientWork: 'probe', externalResources: 'none' } }, refinement: { kind: 'exact-token-sequence', maxTokens: 32, prepare: prepare ?? function* () { return { *test() { return true; } }; } } };
}
const out = { versions: [], stopPrecedence: [], manifests: [] };
for (const version of ['1.0.0-01', '1.0.0-..', '1.0.0-a..b', '1.0.0+..']) {
 try { const engine = createRaveldex({schema, addons:[refinement(version)]}); out.versions.push({version, accepted: true}); await engine.dispose(); }
 catch(error) { out.versions.push({version, accepted:false, code:error.code}); }
}
for (const moment of ['prepare', 'test']) {
 const abort = new AbortController();
 const engine = createRaveldex({schema, addons:[refinement('1.0.0', function* () { if (moment === 'prepare') { abort.abort(); yield {workUnits:2}; } return { *test() { abort.abort(); yield {workUnits:2}; return true; } }; })]});
 await engine.add({ id:'a', text:{body:'red'} });
 try { await engine.search({kind:'extension', capability:'review', version:1, payload:{text:'red'}}, {signal:abort.signal}); out.stopPrecedence.push({moment, success:true}); }
 catch(error) { out.stopPrecedence.push({moment, success:false, code:error.code}); }
 await engine.dispose();
}
for (const version of out.versions) { assert.equal(version.accepted, false); assert.equal(version.code, 'INCOMPATIBLE_CAPABILITY'); }
for (const stop of out.stopPrecedence) assert.equal(stop.code, 'CANCELLED');
const base = refinement();
const patch = (registration, manifest) => ({...registration, manifest:{...registration.manifest,...manifest}});
const a = patch(base,{id:'a',provides:[{id:'a',contractVersion:1}],requires:[{id:'b',contractVersion:1}]});
const b = patch(base,{id:'b',provides:[{id:'b',contractVersion:1}],requires:[{id:'a',contractVersion:1}]});
for (const [name, registrations, expected] of [
 ['duplicate IDs',[base,base],'INCOMPATIBLE_CAPABILITY'],
 ['conflicting provider',[base,patch(base,{id:'other'})],'INCOMPATIBLE_CAPABILITY'],
 ['missing dependency',[patch(base,{requires:[{id:'absent',contractVersion:1}]})],'MISSING_CAPABILITY'],
 ['cycles',[a,b],'INCOMPATIBLE_CAPABILITY'],
 ['protocol version',[patch(base,{contractVersion:2})],'INCOMPATIBLE_CAPABILITY'],
 ['worker execution',[patch(base,{execution:{direct:true,worker:true}})],'INCOMPATIBLE_CAPABILITY'],
 ['infinite work',[patch(base,{limits:{...base.manifest.limits,maxWorkUnits:Infinity}})],'INCOMPATIBLE_CAPABILITY'],
]) { try { createRaveldex({schema,addons:registrations}); assert.fail(name); } catch(error){assert.equal(error.code,expected,name);out.manifests.push({name,code:error.code});} }
const aggregateRegistration=refinement('1.0.0',function* () {yield{workUnits:1};return{*test(){yield{workUnits:1};return true;}};});
const aggregate=createRaveldex({schema,addons:[patch(aggregateRegistration,{limits:{...aggregateRegistration.manifest.limits,maxWorkUnits:3}})]});
await aggregate.add({id:'a',text:{body:'red'}});
const q={kind:'extension',capability:'review',version:1,payload:{text:'red'}};
assert.equal((await aggregate.search(q)).total,1);
await assert.rejects(aggregate.search({kind:'or',children:[q,q]}),{code:'WORK_LIMIT_EXCEEDED'});
out.manifests.push({name:'aggregate leaves work cap',code:'WORK_LIMIT_EXCEEDED'});await aggregate.dispose();

const { refinement: ignoredRefinement, ...participantBase } = patch(base, { roles:['transaction-participant'], indexEffect:'transactional' });
const badInitializer = { ...participantBase, participant:{ initialize() { throw new Error('private initializer detail'); }, *prepare() { return Object.freeze({}); } } };
assert.throws(() => createRaveldex({schema,addons:[badInitializer]}), error => error instanceof RaveldexError && error.code === 'INTERNAL_ERROR' && error.message === 'Raveldex: INTERNAL_ERROR');
out.manifests.push({name:'unknown initializer failure sanitation',code:'INTERNAL_ERROR'});

const unicodeDescription = patch(base,{costs:{...base.manifest.costs,importedCode:'Description 😀 with a valid astral code point'}});
const unicodeEngine = createRaveldex({schema,addons:[unicodeDescription]});
await unicodeEngine.dispose();
out.manifests.push({name:'valid astral description',accepted:true});
for (const description of ['bad\uD800','bad\uDC00']) {
 const invalidDescription=patch(base,{costs:{...base.manifest.costs,importedCode:description}});
 assert.throws(() => createRaveldex({schema,addons:[invalidDescription]}),{code:'INCOMPATIBLE_CAPABILITY'});
 out.manifests.push({name:'malformed UTF-16 description',code:'INCOMPATIBLE_CAPABILITY'});
}
writeFileSync(outputPath, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
