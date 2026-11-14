import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=process.cwd(),out='docs/evidence/RX-9908';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20e6});
const manifest=JSON.parse(await readFile('docs/_pages-manifest.json','utf8'));
const prior=JSON.parse(git('show','HEAD:docs/_pages-manifest.json'));
for(const i of manifest.inputs)assert.equal(hash(await readFile(i.path)),i.sha256,i.path);
for(const f of manifest.files)assert.equal(hash(await readFile('docs/'+f.path)),f.sha256,f.path);
assert.deepEqual(manifest.files,prior.files,'No public runtime/output changes in qualification slice');
const before=new Map(prior.inputs.map(i=>[i.path,i]));
const changedInputs=manifest.inputs.filter(i=>before.get(i.path)?.sha256!==i.sha256).map(i=>i.path);
assert.ok(changedInputs.every(p=>p==='site/README.md'),JSON.stringify(changedInputs));
const {buildUsageCorpus}=await import(pathToFileURL(resolve('examples/docs-search/usage-corpus.mjs')));
const corpus=buildUsageCorpus();const old=JSON.parse(await readFile('docs/evidence/RX-9907/baseline.json','utf8'));assert.deepEqual(corpus,old.usage);
const tags=html=>[...html.matchAll(/<[A-Za-z](?:[^"'<>]|"[^"]*"|'[^']*')*>/g)].map(m=>m[0]).join('\n');
const ids=html=>[...tags(html).matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const oldManifest=JSON.parse(git('show','35ea42e:docs/_pages-manifest.json'));
const routes=[];let anchors=0;
for(const f of oldManifest.files.filter(f=>f.path.endsWith('.html'))){
 const previous=ids(git('show','35ea42e:docs/'+f.path));const current=ids(await readFile('docs/'+f.path,'utf8'));assert.equal(new Set(current).size,current.length,f.path+' duplicate IDs');
 for(const id of previous)assert.ok(current.includes(id),f.path+'#'+id);anchors+=previous.length;routes.push(f.path);
}
const stableInputs=manifest.inputs.filter(i=>/^(src|dist|examples|docs\/api)\//.test(i.path)||['package.json','package-lock.json'].includes(i.path));
for(const i of stableInputs)assert.equal(i.sha256,before.get(i.path)?.sha256,i.path);
const captures=[];for(const name of (await readdir(join(out,'captures'))).sort()){const b=await readFile(join(out,'captures',name));captures.push({path:'captures/'+name,bytes:b.length,sha256:hash(b)});}
const sourceDiff=git('diff','--name-only','35ea42e..HEAD','--','src','examples','docs/api').trim();assert.equal(sourceDiff,'');
const sourceFiles=git('ls-files','site','scripts','test/pages','test/tooling','src','examples','docs/api','integrations','package.json','package-lock.json').trim().split('\n');
if(!sourceFiles.includes('test/pages/integrated-site.test.mjs'))sourceFiles.push('test/pages/integrated-site.test.mjs');
const sourceIdentities=[];for(const path of sourceFiles.sort())sourceIdentities.push({path,sha256:hash(await readFile(path))});
await writeFile(join(out,'source-inputs.json'),JSON.stringify(sourceIdentities,null,2)+'\n');
const report={sourceBase:git('rev-parse','HEAD').trim(),worktree:'uncommitted RX-9908 qualification only',manifestSHA256:hash(await readFile('docs/_pages-manifest.json')),orderedInputsSHA256:hash(JSON.stringify(manifest.inputs)),verifiedInputs:manifest.inputs.length,verifiedOutputs:manifest.files.length,publicOutputsUnchanged:true,changedInputs,unchangedPackageStarterDocInputs:stableInputs.length,preN19Base:'35ea42e',preservedHTMLRoutes:routes.length,preservedOriginalAnchors:anchors,usageCorpusSHA256:corpus.hash,usageUnchanged:true,coreAndStarterAndMarkdownDiffEmpty:true,sourceInputListSHA256:hash(await readFile(join(out,'source-inputs.json'))),verificationScriptSHA256:hash(await readFile(join(out,'verify-identities.mjs'))),captures};
await writeFile(join(out,'identities.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,captures:captures.length},null,2));
