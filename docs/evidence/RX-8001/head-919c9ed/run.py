from pathlib import Path
import subprocess,time,json,sys
base=Path(__file__).resolve().parent
frozen=json.loads((base/'source.json').read_text());root=Path(frozen['worktree'])
name=sys.argv[1];args=sys.argv[2:];started=time.time()
def state():
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'porcelain':subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True)}
before=state();assert before=={'head':frozen['commit'],'porcelain':''},before
with (base/(name+'.txt')).open('x') as stream:
 stream.write(json.dumps({'command':args,'cwd':str(root),'before':before,'startedAtUnix':started})+'\n');stream.flush()
 result=subprocess.run(args,cwd=root,stdout=stream,stderr=subprocess.STDOUT)
after=state();unchanged=after==before
report={'command':args,'cwd':str(root),'before':before,'after':after,'sourceUnchanged':unchanged,'exitCode':result.returncode,'elapsedSeconds':time.time()-started,'startedAtUnix':started,'endedAtUnix':time.time()}
(base/(name+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));sys.exit(result.returncode if result.returncode else (0 if unchanged else 1))
