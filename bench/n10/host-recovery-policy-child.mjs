// Dedicated IPC entry. Direct invocation cannot start collection.
import {childControllerHandshake,finishController} from './host-recovery-supervisor.mjs';
import {runNamedRecoveryController} from './host-recovery.mjs';
try{
 const supervision=await childControllerHandshake();
 if(process.argv.length!==3)throw Error('Exact named controller configuration required');
 await runNamedRecoveryController(JSON.parse(process.argv[2]),supervision);
}catch(error){process.stderr.write(JSON.stringify({name:error.name,message:error.message})+'\n');process.exitCode=1;}
finally{finishController();}
