from pathlib import Path
import subprocess,json,time,sys,os
from guard import snapshot
root=Path('/Users/vasilis/Documents/GitHub/raveldex');out=Path('/tmp/raveldex-rx8010-20261104');mode=sys.argv[1]
commands={'pages-browser':['node','--test','--test-concurrency=1']+[f'test/pages/{name}.test.mjs'for name in ['browser','cards-starter','directory-starter','dropdown-starter','inline-starter','modal-starter','solutions-qualification','ui-example','workbench']],'focused-lifecycle':['node','--test','test/core/execution-lifecycle.test.mjs','test/core/execution-parity.test.mjs'],'independent-correctness':['node','scripts/evaluate-correctness.mjs',str((out/'verified-candidate/consumer').resolve()),str(out/'independent-results.json')],'pages-check':['npm','run','pages:check']}
before=snapshot();start=time.monotonic()
with(out/(mode+'.txt')).open('wb')as log:r=subprocess.run(commands[mode],cwd=root,stdout=log,stderr=subprocess.STDOUT,env=dict(os.environ,RAVELDEX_RX8010_CONSUMER=str(out/'consumer')))
after=snapshot();report={'command':commands[mode],'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-start,'before':before,'after':after,'inputsUnchanged':before==after};(out/(mode+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['command','exitCode','elapsedSeconds','inputsUnchanged']}));sys.exit(r.returncode or(0 if before==after else 2))
