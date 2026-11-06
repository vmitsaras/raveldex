import pathlib,json,hashlib,subprocess,datetime
ROOT=pathlib.Path(__file__).resolve().parents[4];OUT=pathlib.Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((OUT/'artifacts.json').read_text());original=json.loads((ROOT/'docs/evidence/RX-9001/identity/artifacts.json').read_text())
for row in m['source']['runtimeSourceInventory']:
 assert sha(ROOT/row['path'])==row['sha256'],row['path']
 assert hashlib.sha256(subprocess.check_output(['git','show','HEAD:'+row['path']],cwd=ROOT)).hexdigest()==row['sha256']
freeze=json.loads((ROOT/'docs/evidence/RX-9001/method-freeze.json').read_text())
for p,h in freeze['files'].items():assert sha(ROOT/p)==h,p
for role in ['preN9','acceptedN9','current']:
 a=next(x for x in m['artifacts'] if x['role']==role);assert sha(pathlib.Path(a['archive']))==a['sha256']
 package=pathlib.Path(a['consumer'])/'node_modules/@vmitsaras/raveldex'
 assert all(sha(package/x['path'])==x['sha256'] for x in a['members'])
 assert sorted(str(p.relative_to(package)) for p in package.rglob('*') if p.is_file())==[x['path'] for x in a['members']]
for key in ['node','execPath','versions','platform','arch','hardware','executable']:assert m['environment']['node'][key]==original['environment']['node'][key],key
for key in ['npm','os','uname']:assert m['environment'][key]==original['environment'][key],key
assert m['environment']['browsers']['chromium']==original['environment']['browsers']['chromium']
r={'status':'Pass','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checkoutHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'runtimeSources':len(m['source']['runtimeSourceInventory']),'methodFiles':len(freeze['files']),'consumerMembers':{x['role']:len(x['members']) for x in m['artifacts'] if x.get('consumer')},'environmentMatchesFreeze':True,'scope':'Fresh bytewise runtime/package/source/frozen method/environment guard; no benchmark, fresh build, or remote CI claim.'}
(OUT/'guard.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
