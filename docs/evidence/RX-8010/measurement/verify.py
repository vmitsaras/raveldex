from pathlib import Path
import subprocess,json,time,sys
from guard import snapshot
root=Path('/Users/vasilis/Documents/GitHub/raveldex');out=Path('/tmp/raveldex-rx8010-20261104')
mode=sys.argv[1]
commands={'candidate':['npm','run','candidate:prepare','--','--output',str(out/'verified-candidate')],'docs':['npm','run','docs:check'],'plan':['npm','run','handoff:check'],'next':['npm','run','handoff:next'],'tracking':['npm','run','tracking:preview']}
before=snapshot();start=time.monotonic();env=dict(__import__('os').environ);env['RAVELDEX_RX8010_CONSUMER']=str(out/'consumer')
with (out/(mode+'.txt')).open('wb') as log:r=subprocess.run(commands[mode],cwd=root,stdout=log,stderr=subprocess.STDOUT,env=env)
after=snapshot();report={'command':commands[mode],'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-start,'before':before,'after':after,'inputsUnchanged':before==after}
(out/(mode+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['command','exitCode','elapsedSeconds','inputsUnchanged']}));sys.exit(r.returncode or (0 if before==after else 2))
