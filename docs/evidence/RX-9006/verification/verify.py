import pathlib,subprocess,hashlib,json,gzip,os,datetime,shutil,re,platform
ROOT=pathlib.Path(__file__).resolve().parents[4]
OUT=pathlib.Path('/tmp/raveldex-rx9006-20261105/verification')
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def snapshot():
 paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'status':subprocess.check_output(['git','status','--short','-uall'],cwd=ROOT,text=True).splitlines(),'files':{p:sha(ROOT/p) for p in paths if p and (ROOT/p).is_file() and not p.startswith('docs/evidence/RX-9006/')}}
env=os.environ.copy();env['npm_config_offline']='true';env['npm_config_cache']='/tmp/raveldex-rx9006-20261105/npm-cache'
for k in ['RAVELDEX_UI_BROWSER','RAVELDEX_WORKER_BROWSER','RAVELDEX_INDEXEDDB_BROWSER','RAVELDEX_CANDIDATE_BROWSER']:env[k]='chromium'
env['RAVELDEX_RX9002_BULK_REPORT']=str(OUT/'browser-proof.json');env.pop('RAVELDEX_RX8010_CONSUMER',None)
before=snapshot();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
command=['npm','run','candidate:prepare','--','--output',str(OUT/'candidate')]
with (OUT/'process.txt').open('w') as f:result=subprocess.run(command,cwd=ROOT,env=env,stdout=f,stderr=subprocess.STDOUT)
after=snapshot()
# New RX-9006 evidence is permitted; every pre-existing non-task file, HEAD and status line remains exact.
status=lambda s:[x for x in s['status'] if 'docs/evidence/RX-9006/' not in x]
stable=before['head']==after['head'] and status(before)==status(after) and before['files']==after['files']
with gzip.open(OUT/'worktree-guard.json.gz','wt') as f:json.dump({'before':before,'after':after,'stable':stable},f,indent=2)
checklog=OUT/'candidate/verification.log';s=checklog.read_text() if checklog.exists() else ''
counts={k:sum(map(int,re.findall(r'^(?:#|ℹ) '+k+r' (\d+)$',s,re.M))) for k in ['tests','pass','fail','cancelled','skipped','todo']}
report={'status':'Pass' if result.returncode==0 and stable else 'Fail','command':command,'startedAt':started,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'counts':counts,'recordedInputs':len(before['files']),'headAndNonTaskInputsAndStatusUnchanged':stable,'scope':'Uncommitted RX-9006 closing project/private-candidate check, separate from measured frozen artifacts. Task evidence outputs excluded from input stability guard; no clean-head or remote-CI claim.','environment':{'node':subprocess.check_output(['node','--version'],text=True).strip(),'npm':subprocess.check_output(['npm','--version'],text=True).strip(),'platform':platform.platform(),'browserVariables':{k:v for k,v in env.items() if k.startswith('RAVELDEX_')},'npmCache':env['npm_config_cache']},'files':{}}
for src,dst in [('candidate/verification.log','full-check.txt'),('candidate/candidate-report.json','candidate-report.json'),('candidate/preparation.json','preparation.json'),('browser-proof.json','full-browser-proof.json'),('cache-seed.json','cache-seed.json'),('worktree-guard.json.gz','worktree-guard.json.gz'),('process.txt','process.txt')]:
 p=OUT/src
 if p.exists():shutil.copyfile(p,ROOT/'docs/evidence/RX-9006/verification'/dst);report['files'][dst]={'sha256':sha(p),'bytes':p.stat().st_size}
if result.returncode==0:
 candidate=json.loads((OUT/'candidate/candidate-report.json').read_text());p=pathlib.Path(candidate['package']['tarball']);dest=ROOT/'docs/evidence/RX-9006/verification/verified-core.tar.gz';shutil.copyfile(p,dest);report['archiveSha256']=sha(dest);report['wholeArchiveEqualsRx9005']=sha(dest)==sha(ROOT/'docs/evidence/RX-9005/verification/verified-core.tar.gz')
(ROOT/'docs/evidence/RX-9006/verification/validation.json').write_text(json.dumps(report,indent=2)+'\n')
assert counts['tests']>=1373 and counts['pass']+counts['skipped']==counts['tests'] and counts['skipped']==8 and counts['fail']==counts['cancelled']==counts['todo']==0,counts
print(json.dumps({k:v for k,v in report.items() if k!='environment'},indent=2));assert result.returncode==0 and stable
