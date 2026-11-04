from pathlib import Path
import subprocess,json,hashlib,time,sys,os,shutil
root=Path('/Users/vasilis/Documents/GitHub/raveldex');out=Path('/tmp/raveldex-rx8011-20261104')
def snapshot():
 files=[]
 for folder in ['src','test','bench','scripts','site','integrations']:
  files.extend(p for p in(root/folder).rglob('*')if p.is_file()and not any(x in p.parts for x in ['node_modules','dist']))
 files.extend(root.glob('*.md'));files.extend(root.glob('tsconfig*.json'))
 files.extend(p for p in(root/'docs').rglob('*.md')if'evidence'not in p.relative_to(root/'docs').parts)
 files.extend(root/p for p in ['package.json','package-lock.json','docs/planning/roadmap.json','docs/_pages-manifest.json'])
 public=json.loads((root/'docs/_pages-manifest.json').read_text())
 files.extend(root/'docs'/row['path'] for row in public['files'])
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'inputs':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(files))}}
commands={'candidate':['npm','run','candidate:prepare','--','--output',str(out/'verified-candidate')],'pages-browser':['node','--test','--test-concurrency=1']+[f'test/pages/{x}.test.mjs'for x in ['browser','cards-starter','directory-starter','dropdown-starter','inline-starter','modal-starter','solutions-qualification','ui-example','workbench']],'focused-lifecycle':['node','--test','test/core/execution-lifecycle.test.mjs','test/core/execution-parity.test.mjs'],'focused-snapshots':['node','--test','test/adapters/snapshots/bulk-source.test.mjs'],'oracle':['node','scripts/evaluate-correctness.mjs',str((out/'verified-candidate/consumer').resolve()),str(out/'independent-results.json')],'docs':['npm','run','docs:check'],'plan':['npm','run','handoff:check'],'next':['npm','run','handoff:next'],'tracking':['npm','run','tracking:preview'],'pages':['npm','run','pages:check']}
name=sys.argv[1];cmd=commands[name];before=snapshot();start=time.monotonic();env=dict(os.environ);env['RAVELDEX_RX8010_CONSUMER']='/tmp/raveldex-rx8010-20261104/consumer'
with(out/(name+'.txt')).open('wb')as log:r=subprocess.run(cmd,cwd=root,stdout=log,stderr=subprocess.STDOUT,env=env)
after=snapshot();report={'command':cmd,'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-start,'before':before,'after':after,'inputsUnchanged':before==after};(out/(name+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['command','exitCode','elapsedSeconds','inputsUnchanged']}));sys.exit(r.returncode or(0 if before==after else 2))
