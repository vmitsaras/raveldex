import pathlib,json,hashlib,tarfile,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[4];out=pathlib.Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def payload(p):
 with tarfile.open(p,'r:gz') as t:return {x.name.removeprefix('package/'):t.extractfile(x).read() for x in t if x.isfile()}
verified=out/'verified-core.tar.gz';a=payload(verified);frozen=ROOT/'docs/evidence/RX-9001/identity/current-core.tar.gz';b=payload(frozen)
assert set(a)==set(b);impl=[p for p in a if p.startswith('dist/')];assert len(impl)==345
assert all(a[p]==b[p] for p in impl)
changes=[p for p in sorted(a) if a[p]!=b[p]];assert changes==['docs/release/PUBLICATION_STATUS.md']
report=json.loads((out/'candidate-report.json').read_text());installed=pathlib.Path(report['package']['installedDirectory']);assert installed.resolve()==installed
for p,blob in a.items():assert (ROOT/p).read_bytes()==blob and (installed/p).read_bytes()==blob,p
prior=ROOT/'docs/evidence/RX-9005/verification/verified-core.tar.gz';assert sha(verified)==sha(prior)
src=json.loads((ROOT/'docs/evidence/RX-9002/baseline.json').read_text())['runtimeSourceInventory']
for row in src:
 p=row['path'];assert sha(ROOT/p)==row['sha256'];assert hashlib.sha256(subprocess.check_output(['git','show','HEAD:'+p],cwd=ROOT)).hexdigest()==row['sha256']
freeze=json.loads((ROOT/'docs/evidence/RX-9001/method-freeze.json').read_text());assert all(sha(ROOT/p)==h for p,h in freeze['files'].items())
r={'status':'Pass','sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'runtimeSourceMembers':len(src),'runtimeSourceMatchesFrozenAndHead':True,'methodFilesUnchanged':len(freeze['files']),'verifiedArchiveSha256':sha(verified),'archiveEqualsRx9005':True,'wholeCurrentAndInstalledMembersMatch':len(a),'implementationMembersEqualFrozenMeasurementCurrent':len(impl),'nonImplementationDifferencesFromMeasuredCurrent':changes,'installedDirectory':str(installed),'members':[{'path':p,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()} for p,blob in sorted(a.items())],'scope':'Current verified package/source and old frozen measurement archive compared directly; publication-status prose is kept separate, no clean-head or remote CI claim.'}
(out/'identity.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k!='members'},indent=2))
