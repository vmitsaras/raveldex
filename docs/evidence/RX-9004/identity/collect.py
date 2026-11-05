import pathlib,subprocess,hashlib,json,datetime
ROOT=pathlib.Path(__file__).resolve().parents[4];OUT=pathlib.Path(__file__).resolve().parent;TEMP=pathlib.Path('/tmp/raveldex-rx9004-20261105').resolve()
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
method=json.loads((ROOT/'docs/evidence/RX-9001/method-freeze.json').read_text());assert all(sha(ROOT/p)==h for p,h in method['files'].items())
base=json.loads((ROOT/'docs/evidence/RX-9002/baseline.json').read_text());assert all(sha(ROOT/p['path'])==p['sha256'] for p in base['runtimeSourceInventory'])
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
inputs={p:sha(ROOT/p) for p in paths if p and (ROOT/p).is_file() and not p.startswith('docs/evidence/RX-9004/')}
manifest=ROOT/'docs/evidence/RX-9004/identity/artifacts.json'
cmd=['node','bench/n10/run.mjs','--artifacts',str(manifest),'--profile','full','--output',str(TEMP/'full-01')]
freeze={'kind':'rx9004-before-full-v1','capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':cmd,'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'inputHashes':inputs,'artifactManifestSha256':sha(manifest),'methodFreezeSha256':sha(ROOT/'docs/evidence/RX-9001/method-freeze.json'),'profile':'full','children':216,'normalQueryCalls':13536,'diagnosticQueryCalls':432,'semanticGate':'Pending separate untimed lane; no performance acceptance inferred from timed collector','concurrency':'Parent owns only running collector; no task-owned tests/builds/engine executions concurrently.'}
(OUT/'collection-freeze.json').write_text(json.dumps(freeze,indent=2)+'\n')
with (TEMP/'full-01-output.txt').open('w') as log:r=subprocess.run(cmd,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
changed=[p for p,h in inputs.items() if not (ROOT/p).is_file() or sha(ROOT/p)!=h]
assert not changed,changed
assert sha(manifest)==freeze['artifactManifestSha256']
record={'command':cmd,'exitCode':r.returncode,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'recordedInputs':len(inputs),'nonTaskInputsUnchanged':not changed,'manifestUnchanged':True,'rawDirectory':str(TEMP/'full-01'),'log':str(TEMP/'full-01-output.txt'),'logSha256':sha(TEMP/'full-01-output.txt')}
(OUT/'collection-result.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record));assert r.returncode==0
