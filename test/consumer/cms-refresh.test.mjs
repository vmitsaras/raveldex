import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { release } from 'node:os';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { prepareConsumer, REPO_ROOT, command, digest } from '../../scripts/lib/packed-consumer.mjs';
import { validateCandidateManifest } from '../../scripts/candidate-check.mjs';

let consumer, browser, server, origin;
const report = { kind: 'raveldex-installed-cms-refresh-v1', environment: { node: process.version, platform: process.platform, arch: process.arch, release: release() }, observations: [],
  scope: 'Exact copied packaged finite CMS recipe, real native engine writes/queries and scripted focus. No performance, human AT, physical-input, actual zoom or platform-matrix claim.' };
const record = (name, details) => report.observations.push({ name, result: 'Pass', details });
async function withPage(work) {
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {await page.goto(origin+'/cms/?unrelated=a%20b#keep');await page.waitForFunction(()=>window.cmsReady);await work(page);assert.deepEqual(errors,[]);}
  finally {await page.close();}
}
before(async()=>{
  consumer=await prepareConsumer([],[]);
  const module='docs/api/examples/cms-refresh.mjs';await copyFile(join(consumer.installed,module),join(consumer.directory,'cms-refresh.mjs'));
  const fixture="import { runCMSRefreshExample } from './cms-refresh.mjs';\nwindow.cms = { run: runCMSRefreshExample, root: document.getElementById('root'), anchor: document.getElementById('anchor'), outside: document.getElementById('outside') };\nwindow.cms.original = window.cms.root.firstChild; window.cmsReady = true;\n";
  await writeFile(join(consumer.directory,'fixture-entry.mjs'),fixture);
  const built=await build({absWorkingDir:consumer.directory,entryPoints:['fixture-entry.mjs'],outfile:'fixture.mjs',bundle:true,platform:'browser',format:'esm',target:'es2022',metafile:true,logLevel:'silent'});
  report.package=consumer.package;report.consumer={directory:consumer.directory,installed:consumer.installed};report.inputs=Object.keys(built.metafile.inputs);report.fixtureSHA256=digest(Buffer.from(fixture));
  assert.ok(report.inputs.every(p=>['fixture-entry.mjs','cms-refresh.mjs'].includes(p)||p.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
  report.inventory=validateCandidateManifest(JSON.parse(await readFile(join(consumer.installed,'package.json'),'utf8')),consumer.package.files);
  report.sourceSHA256=Object.fromEntries(await Promise.all(['test/consumer/cms-refresh.test.mjs',module].map(async p=>[p,digest(await readFile(join(REPO_ROOT,p)))])));
  server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname,name=path.split('/').at(-1);
    if(path==='/fixture.mjs'){res.setHeader('content-type','text/javascript');res.end(await readFile(join(consumer.directory,'fixture.mjs')));}
    else if(['directory.css','directory-cards.css'].includes(name)){res.setHeader('content-type','text/css');res.end(await readFile(join(consumer.installed,'dist/addons/ui',name)));}
    else res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMS refresh</title><link rel="stylesheet" href="/directory-cards.css"><main><h1>CMS content update</h1><button type="button" id="anchor">Update example</button><button type="button" id="outside">Other action</button><section id="root" aria-label="Resource search"><p>Authored browse fallback</p></section></main><script type="module" src="/fixture.mjs"></script></html>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});report.environment.browser=browser.version();
},{timeout:120000});
after(async()=>{
  await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  if(process.env.RAVELDEX_CMS_REFRESH_REPORT){const p=resolve(process.env.RAVELDEX_CMS_REFRESH_REPORT);await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(report,null,2)+'\n');}
});

test('copied CMS recipe compiles against strict installed public declarations and exact inventory',async()=>{
  await writeFile(join(consumer.directory,'tsconfig-cms.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022','DOM'],types:[],allowJs:true,checkJs:true,strict:true,noEmit:true,skipLibCheck:false},include:['cms-refresh.mjs']}));
  await command(join(REPO_ROOT,'node_modules/.bin/tsc'),['-p','tsconfig-cms.json'],consumer.directory);
  assert.equal(report.inventory.status,'Pass');record('strict copied code and exact inventory',{types:'NodeNext ES2022 DOM checked JS',publicImportsOnly:true});
});

test('actual CMS content/metadata write refreshes preserved filters at page one with a new captured map and cleanup',async()=>withPage(async page=>{
  const url=page.url();
  for(let run=0;run<2;run++){
    const result=await page.evaluate(()=>window.cms.run(window.cms.root,window.cms.anchor));
    assert.deepEqual(result.before,{state:{text:'shared',filters:{kind:['guide']},page:2},revision:1,total:2,ids:['b']});
    assert.deepEqual(result.after,{state:{text:'shared',filters:{kind:['guide']},page:1},revision:2,total:1,ids:['b']});
    assert.equal(result.duplicateKeptHandle,true);assert.deepEqual(result.renderedTitles,['Current b']);assert.deepEqual(result.renderedDescriptions,['Current description b']);
    assert.deepEqual(result.presentation,{layout:'grid',density:'compact',images:false});assert.equal(result.focusRestored,true);
    assert.equal(await page.evaluate(()=>window.cms.root.firstChild===window.cms.original&&window.cms.root.childNodes.length===1),true);
    assert.equal(await page.locator('.raveldex-directory').count(),0);assert.equal(await page.evaluate(()=>document.activeElement===window.cms.anchor),true);assert.equal(page.url(),url);
    record('finite native update/remount/dispose run '+(run+1),result);
  }
}));

test('application focus handoff does not steal focus after an authored handler moves elsewhere',async()=>withPage(async page=>{
  await page.evaluate(()=>window.cms.anchor.addEventListener('focus',()=>window.cms.outside.focus(),{once:true}));
  const result=await page.evaluate(()=>window.cms.run(window.cms.root,window.cms.anchor));
  assert.equal(result.focusRestored,false);assert.equal(await page.evaluate(()=>document.activeElement===window.cms.outside),true);
  assert.equal(await page.evaluate(()=>window.cms.root.firstChild===window.cms.original),true);record('conditional focus ownership',{focusRetained:'Other action',updatedTotal:result.after.total});
}));

test('finite recipe refuses unsupported shadow hosts or disabled anchors before replacing authored nodes',async()=>withPage(async page=>{
  const results=await page.evaluate(async()=>{
    const host=document.createElement('div');document.body.append(host);const shadow=host.attachShadow({mode:'open'}),root=document.createElement('section'),fallback=document.createElement('p'),button=document.createElement('button');fallback.textContent='Keep shadow fallback';root.append(fallback);shadow.append(root,button);const outcomes=[];
    for(const [target,anchor] of [[root,window.cms.anchor],[window.cms.root,button]]){try{await window.cms.run(target,anchor);outcomes.push(false);}catch(e){outcomes.push(e.message.includes('document-tree')&&root.firstChild===fallback&&window.cms.root.firstChild===window.cms.original);}}
    window.cms.anchor.disabled=true;try{await window.cms.run(window.cms.root,window.cms.anchor);outcomes.push(false);}catch{outcomes.push(window.cms.root.firstChild===window.cms.original);}host.remove();return outcomes;
  });assert.deepEqual(results,[true,true,true]);record('bounded host preconditions',{shadowOrDisabledRefusals:3,authoredNodesPreserved:true});
}));
