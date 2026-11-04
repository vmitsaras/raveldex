import {runPagefindTrack} from '/Users/vasilis/Documents/GitHub/raveldex/bench/n9/alternatives-pagefind.mjs';
import {workloadFor,verifyFrozen} from '/Users/vasilis/Documents/GitHub/raveldex/bench/n9/workloads.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const root='/tmp/raveldex-rx8010-20261104/pagefind';await mkdir(root);const rows=[];
for(const family of ['real-docs','high-cardinality','adversarial'])for(const size of [100,1000,10000]){
 const output=`${root}/${family}-${size}`;const report=await runPagefindTrack({consumer:'/tmp/raveldex-rx8010-20261104/consumer',output,workload:verifyFrozen(workloadFor(family,size)),samples:10,warmups:2,channel:'chrome'});
 rows.push({family,size,output,status:report.status,buildWallMs:report.build.wallMs,generatedFiles:report.files.length,queries:report.queries.filter(q=>q.status==='Collected').length});await writeFile(root+'/runs.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows.at(-1)));
}
