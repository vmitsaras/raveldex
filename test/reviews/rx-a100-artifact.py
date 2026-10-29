#!/usr/bin/env python3
"""Audit frozen local RX-A100 packages/sites against actual files and reviews."""
import hashlib,io,json,pathlib,subprocess,tarfile,datetime
ROOT=pathlib.Path(__file__).resolve().parents[2]
sha=lambda data:hashlib.sha256(data).hexdigest()
checks=[]
def passed(name,condition,**details):
 assert condition,name
 checks.append({'name':name,'status':'Pass',**details})
def read_tar(path,prefix='package/'):
 raw=path.read_bytes();out={}
 with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
  for member in archive.getmembers():
   assert member.isfile() and member.name.startswith(prefix) and '..' not in pathlib.PurePosixPath(member.name).parts
   name=member.name.removeprefix(prefix);assert name not in out;out[name]=archive.extractfile(member).read()
 return raw,out
candidate=json.loads((ROOT/'docs/evidence/RX-A100-candidate.json').read_text());feature=json.loads((ROOT/'docs/evidence/RX-A100-package.json').read_text());astro=json.loads((ROOT/'docs/evidence/RX-A100-astro-final-package.json').read_text())
core_raw,core=read_tar(ROOT/'docs/evidence/RX-A100-core-0.1.0-rc.0.tgz');astro_raw,integration=read_tar(ROOT/'docs/evidence/RX-A100-astro-0.1.0-rc.0.tgz')
passed('Closed core and Astro artifacts match the actual paired consumer',candidate['status']=='Pass' and astro['status']=='Pass' and sha(core_raw)==candidate['package']['sha256']==feature['corePackage']['sha256'] and sha(astro_raw)==astro['package']['sha256']==feature['integrationPackage']['sha256'])
passed('Every core member remains byte current',len(core)==310 and all(data==(ROOT/name).read_bytes() for name,data in core.items()),members=len(core))
astro_source=ROOT/'integrations/astro'
prepared=pathlib.Path(astro['package']['tarball']).parent/'package'
passed('Every integration member matches final prepared bytes and current source',len(integration)==15 and all(data==(prepared/name).read_bytes() for name,data in integration.items()) and all(data==(ROOT/'LICENSE' if name=='LICENSE' else astro_source/name).read_bytes() for name,data in integration.items() if name!='package.json') and json.loads(integration['package.json'])==json.loads((astro_source/'package.json').read_text()),members=len(integration),metadata='Packager intentionally serializes package.json with two-space JSON formatting; semantic source equality and exact prepared/installed byte equality checked separately.')
old_raw,old=read_tar(ROOT/'docs/evidence/RX-A090-candidate-0.1.0-rc.0.tgz');production={k:v for k,v in old.items() if k.startswith('dist/')}
passed('All previous production files and their exact set are unchanged',production=={k:v for k,v in core.items() if k.startswith('dist/')},files=len(production))
rootmeta=json.loads(core['package.json']);meta=json.loads(integration['package.json'])
passed('Both packages remain private with no runtime dependencies',all(m['private'] and not m.get('dependencies') and not m.get('optionalDependencies') for m in [rootmeta,meta]))
passed('Framework is only an optional exact peer of the separate package',meta['peerDependencies']=={'@vmitsaras/raveldex':'0.1.0-rc.0','astro':'7.3.2'} and meta['peerDependenciesMeta']=={'astro':{'optional':True}} and set(meta['exports'])=={'.','./build','./client'} and len(rootmeta['exports'])==29)
consumer=pathlib.Path(feature['consumerDirectory'])
for name,files in [('@vmitsaras/raveldex',core),('@vmitsaras/raveldex-astro',integration)]:
 installed=consumer/'node_modules'/name
 passed('Actual installed package is a real tarball tree: '+name,not installed.is_symlink() and installed.resolve()==installed and all(data==(installed/path).read_bytes() for path,data in files.items()),files=len(files))
old_lock=json.loads(subprocess.check_output(['git','show','205c70a:package-lock.json'],cwd=ROOT))['packages'];new_lock=json.loads((ROOT/'package-lock.json').read_text())['packages']
passed('All prior locked package identities remain unchanged',all(new_lock.get(k,{}).get('version')==v.get('version') and new_lock.get(k,{}).get('integrity')==v.get('integrity') for k,v in old_lock.items() if k),priorIdentities=len(old_lock)-1)
passed('Core graph preserves all four accepted RX-A090 identities',all(feature['core'][key]==json.loads((ROOT/'docs/evidence/RX-A090-package.json').read_text())['core'][key] for key in ['minifiedBytes','gzipBytes','sha256','gzipSha256']))
review_rows=[]
for role in ['runtime','verification']:
 path=ROOT/f'docs/evidence/RX-A100-{role}-review.json';r=json.loads(path.read_text())
 passed('Independent '+role+' review has no mandatory findings',r['verdict']=='Ready with follow-ups' and not r['mandatoryFindings'])
 passed('Every '+role+' review source binding remains current',all(sha((ROOT/x['path']).read_bytes())==x['sha256'] for x in r['sourceBindings']),bindings=len(r['sourceBindings']))
 review_rows.append({'path':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes()),'bindings':len(r['sourceBindings'])})
archive=ROOT/'docs/evidence/RX-A100-built-sites.tgz';sites_raw,sites=read_tar(archive,'');record=json.loads((ROOT/'docs/evidence/RX-A100-built-sites.json').read_text())
passed('Accepted real generated sites and original observations are frozen exactly',sha(sites_raw)==record['sha256'] and len(sites)==len(record['members']) and all(len(sites[row['path']])==row['bytes'] and sha(sites[row['path']])==row['sha256'] for row in record['members']),members=len(sites))
for site in feature['builds']:
 directory=pathlib.Path(site['directory']);label=directory.parent.name
 passed('Actual generated files remain equal to frozen '+site['base']+' build',all(sites[label+'/'+p.relative_to(directory).as_posix()]==p.read_bytes() for p in directory.rglob('*') if p.is_file()))
passed('Both genuine static builds and Node/browser oracle observations passed',feature['status']=='Pass' and feature['correctness']['builds']==2 and feature['correctness']['browserComparisons']==42 and feature['correctness']['nodeSourceNativeComparisons']==84 and all(x['status']=='Pass' and not x['browser']['pageErrors'] and not x['browser']['externalRequests'] for x in feature['builds']))
report={'kind':'raveldex-rx-a100-artifact-audit-v1','status':'Pass','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorship':'Parent audit of closed raw artifacts and installed/generated bytes; independent runtime/verification verdicts separately scoped. No new native/browser test or self-review claim.','checks':checks,'packages':{'core':{'sha256':sha(core_raw),'bytes':len(core_raw),'members':len(core)},'astro':{'sha256':sha(astro_raw),'bytes':len(astro_raw),'members':len(integration)},'sites':{'sha256':sha(sites_raw),'bytes':len(sites_raw),'members':len(sites)}},'unchangedPriorProductionFiles':len(production),'reviews':review_rows,'limitations':['No publication, remote CI or remote write.','Bundle/work/data bytes are not physical allocation/copy peaks or latency.','Actual browser observations are finite automation, not new physical input/AT or universal native portability qualification.']}
(ROOT/'docs/evidence/RX-A100-artifact-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':'Pass','checks':len(checks),'packages':report['packages'],'unchangedPriorProductionFiles':len(production)}))
