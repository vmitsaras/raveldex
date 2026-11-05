import pathlib,subprocess,json,hashlib,datetime,tarfile,copy,sys
ROOT=pathlib.Path(__file__).resolve().parents[4];OUT=pathlib.Path(__file__).resolve().parent
TEMP=pathlib.Path('/tmp/raveldex-rx9004-20261105').resolve();TEMP.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
original=ROOT/'docs/evidence/RX-9001/identity/artifacts.json';manifest=json.loads(original.read_text())
freeze={ '__name__':'rx9004_freeze_helpers','__file__':str(ROOT/'docs/evidence/RX-9001/identity/freeze.py') }
exec(compile(pathlib.Path(freeze['__file__']).read_text(),freeze['__file__'],'exec'),freeze)
environment=freeze['environment']()
# New environment record reflects actual observations; frozen environment guard separately rejects Node/hardware/OS drift.
manifest['environment']=environment;manifest['capturedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
manifest['rx9004RunIdentity']={'originalManifest':str(original.relative_to(ROOT)),'originalManifestSha256':sha(original),'scope':'Fresh offline installs from original frozen whole archives; no archive relabeling or production rebuild. RX-9003 proves equal current implementation; full-archive documentation differences remain separate.','verifiedCurrentArchive':'docs/evidence/RX-9003/verification/verified-core.tar.gz','verifiedCurrentArchiveSha256':sha(ROOT/'docs/evidence/RX-9003/verification/verified-core.tar.gz')}
for a in manifest['artifacts']:
 archive=pathlib.Path(a['archive']);assert sha(archive)==a['sha256']
 if a['role'] not in ['preN9','acceptedN9','current']:continue
 directory=TEMP/'consumers'/a['role'];directory.mkdir(parents=True)
 (directory/'package.json').write_text(json.dumps({'name':'rx9004-'+a['role'].lower(),'private':True,'type':'module'})+'\n')
 cmd=['npm','install',str(archive),'--offline','--ignore-scripts','--omit=dev','--no-audit','--no-fund','--package-lock=false','--cache',str(TEMP/'npm-cache')]
 r=subprocess.run(cmd,cwd=directory,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);log=OUT/(a['role']+'-install.txt');log.write_text(r.stdout);assert r.returncode==0,r.stdout
 installed=directory/'node_modules/@vmitsaras/raveldex';assert installed.resolve()==installed
 members=[{'path':str(p.relative_to(installed)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(installed.rglob('*')) if p.is_file()]
 assert {x['path']:(x['bytes'],x['sha256']) for x in members}=={x['path']:(x['bytes'],x['sha256']) for x in a['members']}
 a['consumer']=str(directory);a.pop('reusedConsumerVerification',None)
 tree=json.loads(subprocess.check_output(['npm','ls','--offline','--omit=dev','--all','--json'],cwd=directory,text=True));assert set(tree['dependencies'])=={'@vmitsaras/raveldex'};assert not tree['dependencies']['@vmitsaras/raveldex'].get('dependencies')
 a['install']={'command':cmd,'exitCode':r.returncode,'log':str(log.relative_to(ROOT)),'logSha256':sha(log),'dependencyTree':tree,'allMembersMatchOriginalArchive':True}
manifest['source']['rx9004WorktreeScope']='Starting runtime source remains HEAD6100770 with reviewed uncommitted RX-9001 through RX-9003 preserved. This new run manifest updates consumer/environment observations, not the original freeze.'
save(OUT/'artifacts.json',manifest)
print(json.dumps({'manifest':str(OUT/'artifacts.json'),'roles':[{'role':a['role'],'sha256':a['sha256'],'consumer':a.get('consumer')} for a in manifest['artifacts']],'environment':environment['node']['node']},indent=2))
