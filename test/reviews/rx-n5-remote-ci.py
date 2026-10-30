#!/usr/bin/env python3
"""Read-only raw N5 CI auditor. Usage: audit-remote.py STAGING_DIR REPO_ROOT [--allow-partial].

Reads accepted package archives independently. Runs only read-only git inspection;
no network, build, install, package execution, or repository mutation. The sole
output is STAGING_DIR/artifact-review.json. All raw reports remain untouched.
"""
import argparse,base64,datetime,hashlib,io,json,pathlib,re,subprocess,tarfile,traceback,zipfile

SOURCE='18e610ef15be2c4fa68aeb0f90ebd1dfb2fe5698'
BASE='a2728daeb95652b0cac6df4ff3b713449c3f2c67'
FIRST_SOURCE='991c556307795ff575f710ea67a1473290a1b63a'
RUN=41007010791
BATCHES=[776,30,24,26,1,3]
CHANGES=sorted(['.github/workflows/ci.yml','.github/workflows/candidate.yml','test/measurements/astro-package.mjs','bench/memory/restore-common.test.mjs'])

def sha(data):return hashlib.sha256(data).hexdigest()
def summaries(data):
    text=data.decode('utf-8')
    return {key:[int(x) for x in re.findall(r'^(?:#|ℹ) '+key+r' (\d+)\s*$',text,re.M)] for key in ['tests','pass','fail','cancelled','skipped','todo']}
def tar_members(data):
    out={}
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
        for entry in archive.getmembers():
            parts=pathlib.PurePosixPath(entry.name).parts
            assert entry.isfile() and parts and parts[0]=='package' and len(parts)>1, ('unsafe tar type/root',entry.name)
            assert not entry.name.startswith('/') and '\\' not in entry.name and '..' not in parts and '.' not in parts,('unsafe tar path',entry.name)
            name='/'.join(parts[1:]);assert name not in out,('duplicate tar member',name)
            value=archive.extractfile(entry).read();assert len(value)==entry.size
            out[name]=value
    return out

def main():
    args=argparse.ArgumentParser(description=__doc__);args.add_argument('staging',type=pathlib.Path);args.add_argument('repo',type=pathlib.Path);args.add_argument('--allow-partial',action='store_true');opt=args.parse_args()
    staging=opt.staging.resolve();repo=opt.repo.resolve();checks=[];raw={};accepted={};results=[];pending=[]
    report={'kind':'raveldex-n5-remote-ci-independent-audit-v1','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'Running','testedSource':SOURCE,'baseImplementation':BASE,'runId':RUN,'checks':checks,'rawBindings':raw,'acceptedPackages':accepted,'nodes':results,'mandatoryFindings':[],'pending':pending,'authorshipBoundary':'Independent read-only review of parent-owned source/workflow fixes and raw CI artifacts. Reviewer authored none of the changed repository files. Auditor reads accepted archives directly; it does not consume local-expected-members.json. No build, install, network, remote mutation or product execution.','limitations':['Provider API JSON and downloaded archives are the remote evidence; reviewer makes no independent browser or AT run.','Same-runtime compression differs from historical gzip; no raw production-byte difference is permitted.','No physical AT/input, heap/allocation or transport-copy peak claim is established by these tests.','Source-tested commit is distinct from any later evidence-only commit.']}
    def read(path):
        path=path if path.is_absolute() else staging/path;b=path.read_bytes()
        key=str(path.relative_to(staging)) if path.is_relative_to(staging) else str(path)
        raw[key]={'bytes':len(b),'sha256':sha(b)};return b
    def js(path):return json.loads(read(path))
    def check(name,detail=None):
        entry={'name':name,'status':'Pass'}
        if detail is not None:entry['detail']=detail
        checks.append(entry)
    def git(*a):return subprocess.check_output(['git',*a],cwd=repo)
    def package_guards(members,name):
        meta=json.loads(members['package.json']);assert meta['name']==name and meta['version']=='0.1.0-rc.0' and meta['private'] is True and meta['type']=='module'
        assert meta.get('dependencies',{})=={} and meta.get('optionalDependencies',{})=={}
        return meta
    try:
        read(pathlib.Path(__file__).resolve())
        assert git('rev-parse',SOURCE).decode().strip()==SOURCE
        assert git('merge-base',BASE,SOURCE).decode().strip()==BASE
        names=sorted(git('diff','--name-only',BASE,SOURCE).decode().splitlines());assert names==CHANGES, names
        actual_diff=git('diff',BASE,SOURCE,'--',*CHANGES)
        assert actual_diff==read(pathlib.Path('final-source-diff.patch'))
        assert git('diff','--name-only',BASE,SOURCE,'--','src','integrations','package.json','package-lock.json')==b''
        bindings=[]
        for name in CHANGES+['package.json','package-lock.json','integrations/astro/package.json','integrations/languages/english/package.json']:
            b=git('show',SOURCE+':'+name);assert b==(repo/name).read_bytes(),('current/source mismatch',name)
            bindings.append({'path':name,'bytes':len(b),'sha256':sha(b)})
        report['sourceBindings']=bindings;report['sourceDiffSha256']=sha(actual_diff)
        check('Exact tested source tree descends from implementation and changes only four workflow/test files; production, metadata and lock unchanged')
        for key,path,count,name in [
            ('core','docs/evidence/RX-A100-core-0.1.0-rc.0.tgz',310,'@vmitsaras/raveldex'),
            ('astro','docs/evidence/RX-A100-astro-0.1.0-rc.0.tgz',15,'@vmitsaras/raveldex-astro'),
            ('english','docs/evidence/RX-A040-english-0.1.0-rc.0.tgz',5,'@vmitsaras/raveldex-english')]:
            data=read(repo/path);members=tar_members(data);assert len(members)==count
            meta=package_guards(members,name);accepted[key]={'path':path,'sha256':sha(data),'bytes':len(data),'members':count,'productionMembers':sum(p.startswith('dist/') for p in members)}
            accepted[key]['identities']=[{'path':p,'bytes':len(b),'sha256':sha(b)} for p,b in sorted(members.items())]
            accepted[key]['_members']=members
        assert accepted['core']['productionMembers']==280
        assert package_guards(accepted['core']['_members'],'@vmitsaras/raveldex').get('peerDependencies',{})=={}
        assert package_guards(accepted['astro']['_members'],'@vmitsaras/raveldex-astro')['peerDependencies']=={'@vmitsaras/raveldex':'0.1.0-rc.0','astro':'7.3.2'}
        assert package_guards(accepted['english']['_members'],'@vmitsaras/raveldex-english')['peerDependencies']=={'@vmitsaras/raveldex':'0.1.0-rc.0'}
        check('Independent accepted archives have exact 310/15/5 safe members and private dependency guards; root has 280 production members')
        repository=js(pathlib.Path('verified-repository.json'));assert repository['repository_full_name']=='vmitsaras/raveldex' and repository['visibility']=='private'
        refs=dict((line.split()[1],line.split()[0]) for line in read(pathlib.Path('verified-remote-refs.txt')).decode().splitlines());assert refs['refs/heads/main']=='1d52c71ba464958d155463d8a22ed62af2b4ea9a' and refs['refs/heads/codex/rx-a100-astro']==SOURCE
        report['recordedRemoteBoundary']={'repository':'vmitsaras/raveldex','visibility':'private','main':refs['refs/heads/main'],'featureBranch':refs['refs/heads/codex/rx-a100-astro'],'scope':'Snapshot supplied by parent after final run; no new remote read or publication action performed by reviewer.'}
        check('Recorded provider repository remains private and remote main unchanged at verified snapshot')
        first_metadata=js(pathlib.Path('first-artifacts.json'))['artifacts']
        first=js(pathlib.Path('first-run.json'));assert first['id']==41005972182 and first['head_sha']==FIRST_SOURCE and first['conclusion']=='failure'
        first_results=[]
        for node in [22,24]:
            zipped=read(pathlib.Path(f'first-node{node}.zip'))
            original_artifact=next(a for a in first_metadata if a['name']==f'raveldex-ci-candidate-node-{node}');assert original_artifact['size_in_bytes']==len(zipped) and original_artifact['digest']=='sha256:'+sha(zipped)
            assert original_artifact['workflow_run']['id']==41005972182 and original_artifact['workflow_run']['head_sha']==FIRST_SOURCE
            with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
                assert archive.testzip() is None
                expected=['raveldex-candidate/preparation.json','raveldex-candidate/verification.log'];assert sorted(archive.namelist())==expected
                for name in expected:assert archive.read(name)==read(pathlib.Path(f'first-node{node}')/name)
                prep=json.loads(archive.read(expected[0]));assert prep['status']=='Fail' and prep['candidatePacked'] is False
                log=archive.read(expected[1]);counts=summaries(log)
            if node==22:
                assert counts['tests']==BATCHES and counts['pass']==BATCHES[:-1]+[0] and counts['fail']==[0,0,0,0,0,3]
                assert b'20351 !== 20304' in log
            else:
                assert counts['tests']==[776] and counts['pass']==[775] and counts['fail']==[1]
                assert b"actual: 'SIGTERM'" in log and b"expected: 'SIGKILL'" in log
            first_results.append({'nodeMajor':node,'counts':counts,'status':'Fail','candidatePacked':False})
        report['retainedFirstAttempt']={'source':FIRST_SOURCE,'runId':first['id'],'conclusion':'failure','nodes':first_results}
        check('Original Node22 gzip setup failure and Node24 watchdog failure retained with exact batch counts and no candidate packed')
        metadata_path=pathlib.Path('second-artifacts.json') if (staging/'second-artifacts.json').exists() else pathlib.Path('second-artifacts-partial.json')
        metadata=js(metadata_path);artifacts=metadata['artifacts'];assert metadata['total_count']==len(artifacts)
        assert len({a['id'] for a in artifacts})==len(artifacts)
        for artifact in artifacts:
            assert artifact['workflow_run']['id']==RUN and artifact['workflow_run']['head_sha']==SOURCE and artifact['workflow_run']['head_branch']=='codex/rx-a100-astro'
        run=None;jobs=None
        if (staging/'second-run.json').exists():
            run=js(pathlib.Path('second-run.json'));assert run['id']==RUN and run['head_sha']==SOURCE and run['head_branch']=='codex/rx-a100-astro'
            assert run['path']=='.github/workflows/ci.yml' and run['event']=='workflow_dispatch'
            assert run['status']=='completed' and run['conclusion']=='success',('final run not successful',run['status'],run['conclusion'])
            report['run']={k:run[k] for k in ['id','head_sha','head_branch','path','event','status','conclusion','html_url']}
        else:pending.append('completed second-run.json')
        if (staging/'second-jobs.json').exists():
            jobs=js(pathlib.Path('second-jobs.json'))['jobs'];assert len(jobs)==2
        else:pending.append('completed second-jobs.json')
        historical=js(repo/'docs/evidence/RX-A090-package.json')
        oldarchive=read(repo/'docs/evidence/RX-A090-candidate-0.1.0-rc.0.tgz');assert sha(oldarchive)==historical['package']['sha256']
        for node in [22,24]:
            zpath=pathlib.Path(f'second-node{node}.zip')
            if not (staging/zpath).exists():pending.append(str(zpath));continue
            artifact=next(a for a in artifacts if a['name']==f'raveldex-ci-candidate-node-{node}')
            data=read(zpath);assert len(data)==artifact['size_in_bytes'] and 'sha256:'+sha(data)==artifact['digest']
            extracted=staging/f'second-node{node}';files={}
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names=archive.namelist();assert len(names)==len(set(names)) and len(names)==11
                assert archive.testzip() is None
                for info in archive.infolist():
                    path=pathlib.PurePosixPath(info.filename);assert not info.is_dir() and not path.is_absolute() and '..' not in path.parts and '\\' not in info.filename
                    assert ((info.external_attr>>16)&0o170000)!=0o120000,'ZIP symlink'
                    b=archive.read(info.filename);assert b==read(extracted/info.filename);files[info.filename]=b
            expected_names={
                'raveldex-candidate/preparation.json','raveldex-candidate/verification.log','raveldex-candidate/candidate-report.json','raveldex-candidate/vmitsaras-raveldex-0.1.0-rc.0.tgz',
                'raveldex-astro/astro-package.json','raveldex-astro/verification.log','raveldex-astro/vmitsaras-raveldex-astro-0.1.0-rc.0.tgz',
                'raveldex-english/english-package.json','raveldex-english/verification.log','raveldex-english/vmitsaras-raveldex-english-0.1.0-rc.0.tgz','raveldex-astro-observations.json'}
            assert set(files)==expected_names
            log=files['raveldex-candidate/verification.log'];counts=summaries(log)
            assert counts['tests']==BATCHES and counts['pass']==BATCHES
            for key in ['fail','cancelled','skipped','todo']:assert counts[key]==[0]*6
            preparation=json.loads(files['raveldex-candidate/preparation.json']);candidate=json.loads(files['raveldex-candidate/candidate-report.json']);astro=json.loads(files['raveldex-astro/astro-package.json']);english=json.loads(files['raveldex-english/english-package.json']);observations=json.loads(files['raveldex-astro-observations.json'])
            assert preparation['status']==candidate['status']==astro['status']==english['status']==observations['status']=='Pass'
            assert preparation['private'] is True and preparation['projectCheck']['exitCode']==0 and preparation['projectCheck']['sha256']==sha(log)
            assert preparation['candidateReport']['sha256']==sha(files['raveldex-candidate/candidate-report.json'])
            assert candidate['environment']['node'].startswith(f'v{node}.') and candidate['environment']['platform']=='linux'
            packages={}
            for key,prefix,obj in [('core','raveldex-candidate',candidate),('astro','raveldex-astro',astro),('english','raveldex-english',english)]:
                pkg=obj['package'];tarname=prefix+'/'+pathlib.PurePosixPath(pkg['tarball']).name;tarbytes=files[tarname]
                assert sha(tarbytes)==pkg['sha256'] and len(tarbytes)==pkg['tarballBytes']
                if 'integrity' in pkg:assert pkg['integrity']=='sha512-'+base64.b64encode(hashlib.sha512(tarbytes).digest()).decode()
                members=tar_members(tarbytes);assert members==accepted[key]['_members'],('accepted package contents differ',node,key)
                meta=package_guards(members,pkg['name']);assert pkg['private'] is True and pkg['runtimeDependencies']==[]
                rows=pkg['files'];assert len(rows)==len(members) and len({i['path'] for i in rows})==len(rows) and {i['path'] for i in rows}==set(members)
                for item in rows:assert len(members[item['path']])==item['bytes'] and sha(members[item['path']])==item['sha256']
                assert sum(map(len,members.values()))==pkg['unpackedBytes']
                if key!='core':
                    packlog=files[prefix+'/verification.log'].decode();commandline,remainder=packlog.split('\n',1);invocation=json.loads(commandline)
                    assert invocation['exitCode']==0 and '--ignore-scripts' in invocation['command'] and '--offline' in invocation['command']
                    parsed,_=json.JSONDecoder().raw_decode(remainder.lstrip());packed=(parsed if isinstance(parsed,list) else list(parsed.values()))[0]
                    assert packed['integrity']=='sha512-'+base64.b64encode(hashlib.sha512(tarbytes).digest()).decode()
                    assert packed['filename']==pathlib.PurePosixPath(tarname).name and packed['size']==len(tarbytes)
                    assert {i['path']:i['size'] for i in packed['files']}=={k:len(v) for k,v in members.items()}
                packages[key]={'sha256':sha(tarbytes),'bytes':len(tarbytes),'members':len(members),'productionMembers':sum(n.startswith('dist/') for n in members),'acceptedContentEquality':True,'acceptedRawArchiveEquality':sha(tarbytes)==accepted[key]['sha256']}
            env=observations['environment'];assert env['node']==candidate['environment']['node'] and env['platform']=='linux' and env['astro']=='7.3.2' and env['browserChannel']=='chromium'
            correct=observations['correctness'];assert correct['status']=='Pass' and correct['builds']==2 and correct['browserComparisons']==42 and correct['nodeSourceNativeComparisons']==84
            assert observations['corePackage']['private'] is True and observations['integrationPackage']['private'] is True
            corepair=observations['corePackage'];actualcore=candidate['package'];assert corepair['sha256']==actualcore['sha256'],('paired/core tar mismatch',node)
            assert {r['path']:r['size'] for r in corepair['files']}=={k:len(v) for k,v in accepted['core']['_members'].items()}
            intpair=observations['integrationPackage'];assert intpair['sha256']==astro['package']['sha256'] and intpair['files']==astro['package']['files']
            baseline=observations['coreUnchanged'];assert baseline['status']=='Pass' and baseline['archiveSha256']==sha(oldarchive)
            assert baseline['historical']=={k:historical['core'][k] for k in ['minifiedBytes','sha256','gzipBytes','gzipSha256']}
            assert baseline['historical']['sha256']==baseline['sameRuntime']['sha256']=='b2985d83d309f0d138af626b21037181c6db750bbb9df9f2029681383dc5ac74'
            assert baseline['historical']['minifiedBytes']==baseline['sameRuntime']['minifiedBytes']==69483
            for key in ['minifiedBytes','sha256','gzipBytes','gzipSha256']:assert observations['core'][key]==baseline['sameRuntime'][key]
            builds=observations['builds'];assert [b['base'] for b in builds]==['/','/docs/']
            for build in builds:
                assert build['status']=='Pass' and '5 page(s) built' in build['buildLog'] and 'Prepared Raveldex generation' in build['buildLog']
                assert len(build['generated'])==10 and len({x['path'] for x in build['generated']})==10
                generated={x['path']:x for x in build['generated']};manifest=build['manifest'];assert manifest['base']==build['base'] and manifest['recordCount']==3
                for asset in manifest['assets'].values():
                    row=generated['raveldex/'+asset['file']];assert row['bytes']==asset['bytes'] and row['sha256']==asset['sha256']
                browser=build['browser'];assert browser['status']=='Pass' and browser['comparisons']==21 and browser['pageErrors']==[] and browser['externalRequests']==[]
                nodeprobe=build['node'];assert nodeprobe['status']=='Pass' and nodeprobe['comparisons']==42 and [f['format'] for f in nodeprobe['formats']]==['source','native'] and len(nodeprobe['failures'])==4
                first,ui,navigation=browser['observations'];assert first['optionalDisplayRequestsBeforeOpen']==0 and first['delayedDisplayUnload']['state']=='unloaded' and first['delayedDisplayUnload']['openDisabled'] is True
                assert first['nativeBrowserRefusal']['reason']=='UNQUALIFIED_PROFILE'
                assert ui['focusRetained'] and ui['inspectorEscapeRestore'] and ui['authoredFallbackRestored'] and ui['axe']['violations']==[]
                assert navigation['excludedDraftRendered'] and navigation['excludedQueryTotal']==0 and navigation['requestsSameDeploymentBase']
                assert '/guide/atomic/' in navigation['destination']
                assert 'not speech' in browser['scope'].lower()
            assert any('physical AT' in s for s in observations['limitations']) and any('not heap/allocation/transport-copy peaks' in s for s in observations['limitations'])
            assert candidate['startup']['status']=='Pass' and candidate['startup']['reads']==[] and candidate['types']['status']=='Pass' and candidate['graphs']['status']=='Pass' and candidate['documentation']['status']=='Pass'
            assert len(candidate['graphs']['entries'])==28
            job=None
            if jobs:
                job=next(j for j in jobs if j['name']==f'Candidate verification (Node {node})')
                assert job['run_id']==RUN and job['head_sha']==SOURCE and job['status']=='completed' and job['conclusion']=='success'
                for stepname in ['Verify and prepare the private candidate','Run npm run tracking:preview','Preserve separate private N5 packages from verified compiler output','Preserve candidate reports and tarball']:
                    step=next(s for s in job['steps'] if s['name']==stepname);assert step['conclusion']=='success'
            joblog=read(pathlib.Path(f'second-node{node}-job.log'));assert candidate['environment']['node'].encode() in joblog
            results.append({'nodeMajor':node,'status':'Pass','testCounts':counts,'totalTests':sum(counts['tests']),'environment':candidate['environment'],'artifact':{'id':artifact['id'],'digest':artifact['digest'],'bytes':len(data),'crc':'Pass','members':len(files)},'packages':packages,'astro':{'environment':env,'comparisons':correct,'baseline':baseline,'actualBuildBases':[b['base'] for b in builds]},'job':None if job is None else {k:job[k] for k in ['id','run_id','head_sha','status','conclusion','html_url']}})
            check(f'Node{node}: provider digest/CRC/safe ZIP; closed 860 tests, three accepted packages, actual Astro pair/builds and source binding')
        if pending:
            assert opt.allow_partial,('required final evidence absent',pending)
            report['status']='Pending'
        else:
            assert len(results)==2 and run is not None and jobs is not None
            assert metadata['total_count']==2
            report['status']='Ready'
    except Exception as error:
        report['status']='Fail';report['mandatoryFindings'].append({'name':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()})
    for item in accepted.values():item.pop('_members',None)
    output=staging/'artifact-review.json';output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'path':str(output),'status':report['status'],'sha256':sha(output.read_bytes()),'checks':len(checks),'nodes':[r['nodeMajor'] for r in results],'mandatoryFindings':report['mandatoryFindings'],'pending':pending}))
    return 0 if report['status'] in ['Ready','Pending'] else 1

if __name__=='__main__':raise SystemExit(main())
