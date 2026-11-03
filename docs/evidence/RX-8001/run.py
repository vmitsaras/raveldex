import subprocess,time,json,os,sys
from pathlib import Path
base=Path(__file__).parent
name=sys.argv[1]; args=sys.argv[2:]; start=time.time(); work=Path(os.environ.get('RAVELDEX_RX8001_ROOT',str(base/'source')))
with (base/(name+'.log')).open('w') as f:
 f.write(json.dumps({'command':args,'cwd':str(work),'startedAtUnix':start})+'\n'); f.flush()
 result=subprocess.run(args,cwd=work,stdout=f,stderr=subprocess.STDOUT)
record={'command':args,'cwd':str(work),'exitCode':result.returncode,'elapsedSeconds':time.time()-start,'startedAtUnix':start,'endedAtUnix':time.time()}
(base/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n'); print(json.dumps(record));sys.exit(result.returncode)
