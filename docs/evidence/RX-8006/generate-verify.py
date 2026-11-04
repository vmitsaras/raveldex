from pathlib import Path
import subprocess,json,hashlib,time
root=Path('/Users/vasilis/Documents/GitHub/raveldex');out=Path('/tmp/raveldex-rx8006-20261104')
def digest(b):return hashlib.sha256(b).hexdigest()
def snapshot():
 names=subprocess.check_output(['git','ls-files','-z','src','scripts','site','integrations','package.json','package-lock.json'],cwd=root).decode().split('\0')
 paths={root/n for n in names if n};paths.update(root.glob('*.md'));paths.update((root/'docs').rglob('*.md'))
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'inputs':{str(p.relative_to(root)):digest(p.read_bytes()) for p in sorted(paths) if p.is_file()},'trackedDiffSha256':digest(subprocess.check_output(['git','diff','--binary'],cwd=root))}
before=snapshot();start=time.monotonic()
with (out/'pages-generate.txt').open('wb') as stream:result=subprocess.run(['npm','run','pages:generate'],cwd=root,stdout=stream,stderr=subprocess.STDOUT)
after=snapshot();stable=before['head']==after['head'] and before['inputs']==after['inputs'];report={'command':['npm','run','pages:generate'],'exitCode':result.returncode,'elapsedSeconds':time.monotonic()-start,'before':before,'after':after,'inputsUnchanged':stable,'trackedDiffUnchanged':before['trackedDiffSha256']==after['trackedDiffSha256'],'scope':'Generation intentionally replaces tracked site artifacts; current source/config/site/Markdown inputs and HEAD must stay unchanged. Tracked output diff is recorded separately.'};(out/'pages-generate.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['exitCode','elapsedSeconds','inputsUnchanged','trackedDiffUnchanged']}));raise SystemExit(result.returncode or (0 if stable else 2))
