from pathlib import Path
import subprocess,json,hashlib,time,sys
base=Path(__file__).resolve().parent
root=Path(json.loads((base/'source.json').read_text())['worktree'])
def identity():
 untracked=[]
 for p in subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z'],cwd=root).split(b'\0'):
  if p:
   path=p.decode();data=(root/path).read_bytes();untracked.append({'path':path,'sha256':hashlib.sha256(data).hexdigest()})
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'trackedDiffSha256':hashlib.sha256(subprocess.check_output(['git','diff','--binary'],cwd=root)).hexdigest(),'untracked':untracked}
name=sys.argv[1];args=sys.argv[2:];before=identity();start=time.time()
with (base/(name+'.txt')).open('x') as stream:
 stream.write(json.dumps({'command':args,'cwd':str(root),'startedAtUnix':start,'scope':'Documentation/evidence/roadmap completion worktree based on verified 919c9ed; not a new committed-head qualification'})+'\n');stream.flush();result=subprocess.run(args,cwd=root,stdout=stream,stderr=subprocess.STDOUT)
after=identity();r={'command':args,'exitCode':result.returncode,'elapsedSeconds':time.time()-start,'before':before,'after':after,'inputSnapshotUnchanged':before==after,'scope':'Completion worktree verification, separate from the clean committed baseline'};(base/(name+'.json')).write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k not in ['before','after']}));sys.exit(result.returncode if result.returncode else (0 if before==after else 1))
