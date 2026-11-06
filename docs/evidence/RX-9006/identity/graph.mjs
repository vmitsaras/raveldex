// Separate preparation-time fixed graph measurement; no timing/heap claim.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {build,version} from 'esbuild';
const root=process.cwd(), out=join(root,'docs/evidence/RX-9006/identity');
const m=JSON.parse(await readFile(join(out,'artifacts.json')));
const rows=[];
for(const role of ['preN9','acceptedN9','current']) {
 const a=m.artifacts.find(x=>x.role===role), directory=a.consumer;
 const options={stdin:{contents:"export * from '@vmitsaras/raveldex';",resolveDir:directory,sourcefile:'core-entry.mjs'},absWorkingDir:directory,bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',write:false,metafile:true,logLevel:'silent'};
 const r=await build(options), bytes=r.outputFiles[0].contents, compressed=gzipSync(bytes);
 for(const [p,input] of Object.entries(r.metafile.inputs)) {assert.ok(p==='core-entry.mjs'||p.startsWith('node_modules/@vmitsaras/raveldex/dist/'));assert.ok(input.imports.every(x=>!x.external));}
 await writeFile(join(out,role+'-core.mjs'),bytes);await writeFile(join(out,role+'-core.mjs.gz'),compressed);
 rows.push({role,archiveSha256:a.sha256,bytes:bytes.length,gzipBytes:compressed.length,sha256:createHash('sha256').update(bytes).digest('hex'),gzipSha256:createHash('sha256').update(compressed).digest('hex'),inputs:r.metafile.inputs});
}
assert.equal(rows[1].sha256,rows[2].sha256);assert.equal(rows[1].gzipBytes,rows[2].gzipBytes);
const report={status:'Pass',capturedAt:new Date().toISOString(),node:process.version,esbuild:version,method:{entry:"export * from '@vmitsaras/raveldex';",platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',gzip:'Node gzipSync default settings, identical recipe for every role'},rows,scope:'All retained public core exports under this exact build recipe. Includes optional code reachable from core; no application-specific tree-shaking, network transfer, retained/peak heap or platform responsiveness inference.'};
await writeFile(join(out,'core-graphs.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rows:rows.map(({inputs,...rest})=>rest)}));
