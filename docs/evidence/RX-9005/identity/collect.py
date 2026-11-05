"""Single serial frozen collection; no build/test/other collector alongside it."""
import pathlib,subprocess,json,hashlib,datetime,gzip
ROOT=pathlib.Path(__file__).resolve().parents[4]
OUT=pathlib.Path(__file__).resolve().parent
RAW=pathlib.Path('/private/tmp/raveldex-rx9005-20261105/full-02')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def snapshot():
 paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'files':{p:sha(ROOT/p) for p in paths if p and (ROOT/p).is_file() and not p.startswith('docs/evidence/RX-9005/')}}
assert not RAW.exists()
before=snapshot();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
command=['node','bench/n10/updates-run.mjs','--artifacts','docs/evidence/RX-9005/identity/artifacts.json','--profile','full','--output',str(RAW),'--budget-revision','owner-approved-150m-20261105']
(OUT/'collection-start.json').write_text(json.dumps({'startedAt':started,'command':command,'source':before},indent=2)+'\n')
with (OUT/'collection-output.txt').open('w') as f:result=subprocess.run(command,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT)
after=snapshot();stable=before==after
with gzip.open(OUT/'collection-worktree-guard.json.gz','wt') as f:json.dump({'before':before,'after':after,'stable':stable},f)
report={'status':'Pass' if result.returncode==0 and stable else 'Fail','command':command,'startedAt':started,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'headAndAllNonTaskEvidenceInputsUnchanged':stable,'rawDirectory':str(RAW),'scope':'Full serial observer-conditioned update cohort. Task evidence outputs excluded from worktree guard; measured harness/test/method/source inputs included. No clean-head, CI, publication, heap, browser or overall-winner claim.'}
(OUT/'collection.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));assert result.returncode==0 and stable
