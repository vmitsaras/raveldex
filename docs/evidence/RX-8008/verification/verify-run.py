import pathlib,subprocess,json,hashlib,datetime,sys,time
root=pathlib.Path('/Users/vasilis/Documents/GitHub/raveldex')
out=pathlib.Path('/tmp/raveldex-rx8008-20261104')
def sha(b):return hashlib.sha256(b).hexdigest()
def snapshot():
 paths=[]
 for base in ['src','test','scripts','bench','integrations']:
  paths.extend(p for p in (root/base).rglob('*') if p.is_file() and not any(x in p.parts for x in ['node_modules','dist']))
 paths.extend(root.glob('tsconfig*.json'))
 paths.extend([root/'package.json',root/'package-lock.json',root/'AGENTS.md',root/'docs/planning/roadmap.json'])
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'diffSha256':sha(subprocess.check_output(['git','diff','--binary'],cwd=root)), 'inputs':{str(p.relative_to(root)):sha(p.read_bytes()) for p in sorted(set(paths))}}
name=sys.argv[1];cmd=sys.argv[2:];before=snapshot();start=time.monotonic()
with (out/(name+'.txt')).open('wb') as stream:
 result=subprocess.run(cmd,cwd=root,stdout=stream,stderr=subprocess.STDOUT)
after=snapshot();report={'command':cmd,'startedHead':before['head'],'elapsedSeconds':time.monotonic()-start,'exitCode':result.returncode,'before':before,'after':after,'inputsUnchanged':before==after}
(out/(name+'.json')).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['command','exitCode','elapsedSeconds','inputsUnchanged']}));sys.exit(result.returncode or (0 if before==after else 2))
