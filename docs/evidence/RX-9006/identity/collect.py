"""One parent-owned serial collection; no build/test/other collector alongside."""
import pathlib,subprocess,json,hashlib,datetime,gzip,sys,os
ROOT=pathlib.Path(__file__).resolve().parents[4];OUT=pathlib.Path(__file__).resolve().parent
name=sys.argv[1];command=sys.argv[2:];assert name.replace('-','').isalnum() and command
excluded=os.environ.get('RX9006_PROBE_EXCLUDE','').split(',') if os.environ.get('RX9006_PROBE_EXCLUDE') else []
if excluded:
 assert name.startswith('browser-probe')
 assert set(excluded)=={'bench/n10/host-recovery.mjs','bench/n10/host-recovery-case.mjs','test/comparison/n10-host-recovery-method.test.mjs'}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def snapshot():
 paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'files':{p:sha(ROOT/p) for p in paths if p and (ROOT/p).is_file() and not p.startswith('docs/evidence/RX-9006/') and p not in excluded}}
assert not (OUT/(name+'-start.json')).exists();before=snapshot();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
(OUT/(name+'-start.json')).write_text(json.dumps({'startedAt':started,'command':command,'source':before},indent=2)+'\n')
with (OUT/(name+'-output.txt')).open('w') as f:result=subprocess.run(command,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT)
after=snapshot();stable=before==after
with gzip.open(OUT/(name+'-worktree-guard.json.gz'),'wt') as f:json.dump({'before':before,'after':after,'stable':stable},f)
r={'status':'Pass' if result.returncode==0 and stable else 'Fail','command':command,'startedAt':started,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'headAndAllNonTaskEvidenceInputsUnchanged':stable,'probeOnlyExcludedUnexecutedRecoveryFiles':excluded,'scope':'Serial run; all non-task-evidence source/harness/test/method inputs guarded. A probe is excluded from full acceptance. Pass means process/guard, never independent numerical or performance acceptance.'}
(OUT/(name+'.json')).write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2));assert result.returncode==0 and stable
