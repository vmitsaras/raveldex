"""Close only after independent measurement, state, numerical and diff acceptance."""
import pathlib,json,subprocess,hashlib,datetime,gzip
root=pathlib.Path(__file__).resolve().parents[4];out=pathlib.Path(__file__).resolve().parent;taskdir=out.parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads((root/p).read_text())
base=read('docs/evidence/RX-9005/baseline.json')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert head==base['head']
changed=[p for p,h in base['files'].items() if not (root/p).is_file() or sha(root/p)!=h]
allowed={'CODEX_HANDOFF.md','PROJECT_CONTEXT.md','docs/specs/N10_HARDENING_PERFORMANCE_REVIEW.md','docs/planning/roadmap.json','ROADMAP.md','IMPLEMENTATION_TASKS.md'}
assert set(changed)<=allowed,changed
current=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0'))-{''}
new=current-set(base['files']);extra={'docs/evidence/RX-9005.md','docs/evaluation/RX-9005.md','bench/n10/updates-run.mjs','bench/n10/updates-child.mjs','bench/n10/updates-contract.mjs','bench/n10/updates-verify.mjs','test/comparison/n10-updates-method.test.mjs'}
assert all(p.startswith('docs/evidence/RX-9005/') or p in extra for p in new),sorted(new-extra)
prefix='docs/evidence/RX-9005/'
full=read(prefix+'verification/validation.json');assert full['status']=='Pass' and full['counts']=={'tests':1373,'pass':1365,'fail':0,'cancelled':0,'skipped':8,'todo':0}
identity=read(prefix+'verification/identity.json');assert identity['status']=='Pass' and identity['archiveEqualsRx9004'] and identity['runtimeSourceMembers']==194 and identity['methodFilesUnchanged']==9
review=read(prefix+'review/final.json');assert str(review['status']).startswith('Pass')
state=read(prefix+'review/state-replay.json');assert state['status']=='Pass' and state['fullMatrixReplay'] and state['counts']['children']==144 and state['counts']['queryRefusals']==0
numeric=read(prefix+'review/parent-analysis.json');assert numeric['status']=='Pass' and numeric['cells']==1380 and numeric['comparisons']==920 and numeric['parentResultsSha256']==sha(taskdir/'analysis/results.json')
raw=read(prefix+'timed-report.json');assert raw['outcome']=='Collected' and raw['guards']=='Pass' and raw['elapsedMs']<=9000000 and raw['budgetMs']==9000000
assert raw['totals']=={'children':144,'normalWindows':5544,'diagnosticWindows':696,'warmups':72,'publicCalls':107544,'normalPublicCalls':92376,'diagnosticPublicCalls':15168,'notApplicableCaseRows':240}
assert state['sourceReportSha256']==sha(taskdir/'timed-report.json')
assert read(prefix+'review/reconstruction.json')['sourceReportSha256']==sha(taskdir/'timed-report.json')
for p in raw['harness']:assert sha(root/p['path'])==p['sha256'],'post-collection harness drift: '+p['path']
retention=read(prefix+'verification/retention-audit.json');assert retention['status']=='Pass' and retention['archives']==78 and retention['memberFiles']==182234
archives=[]
for index in sorted(taskdir.glob('*-inventory.json*')):
 if index.suffix=='.gz':
  with gzip.open(index,'rt') as f:r=json.load(f)
 else:r=json.loads(index.read_text())
 descriptors=r.get('archives') or [{'path':r['archive'],'bytes':r['archiveBytes'],'sha256':r['archiveSha256']}]
 for a in descriptors:assert (taskdir/a['path']).stat().st_size==a['bytes'] and sha(taskdir/a['path'])==a['sha256'];archives.append(a)
assert len(archives)==78
candidate=read(prefix+'verification/candidate-report.json')
for p in candidate['package']['files']:assert sha(root/p['path'])==p['sha256']
roadmap=read('docs/planning/roadmap.json');tasks={t['id']:t for t in roadmap['tasks']};task=tasks['RX-9005'];assert task['status']=='done' and task['evidence']
assert all((root/p).is_file() for p in task['evidence'])
for id in ['RX-9006','RX-9007']:assert tasks[id]['status']=='planned' and tasks[id]['evidence']==[]
for name in ['acceptance.json','final-audit.json']:
 (out/name).write_text(json.dumps({'status':'Running','phase':'Final evidence/link/planner checks pending','task':'RX-9005'},indent=2)+'\n')
checks=[]
for cmd in [['npm','run','handoff:check'],['npm','run','docs:check'],['npm','run','pages:check'],['npm','run','handoff:next'],['npm','run','tracking:preview'],['git','diff','--check']]:
 r=subprocess.run(cmd,cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);file=out/(cmd[-1].replace(':','-')+'.txt');file.write_text(r.stdout);checks.append({'command':cmd,'exitCode':r.returncode,'log':file.name,'sha256':sha(file)});assert r.returncode==0,r.stdout
assert 'RX-9006' in (out/'handoff-next.txt').read_text()
evidence=[str(p.relative_to(root)) for p in taskdir.rglob('*') if p.is_file()]+['docs/evidence/RX-9005.md','docs/evaluation/RX-9005.md']
ignored=subprocess.run(['git','check-ignore','--stdin'],cwd=root,text=True,input='\n'.join(evidence)+'\n',stdout=subprocess.PIPE,stderr=subprocess.PIPE);assert ignored.returncode==1 and not ignored.stdout
bindings=['docs/evaluation/RX-9001-method.json',prefix+'collection-budget-revision.json',prefix+'identity/artifacts.json',prefix+'timed-report.json',prefix+'analysis/results.json',prefix+'review/reconstruction.json',prefix+'review/parent-analysis.json',prefix+'review/state-replay.json',prefix+'review/final.json',prefix+'verification/validation.json',prefix+'verification/identity.json',prefix+'verification/retention-audit.json',prefix+'full-inventory.json.gz','docs/evaluation/RX-9005.md','docs/evidence/RX-9005.md']
acceptance={'kind':'rx9005-scoped-update-acceptance-v1','status':'Pass','scope':'Complete approved fresh Node update cohort only, observer-conditioned public mutation windows; no isolated queue/admission, bare-mutation, heap, browser or overall-winner claim.','rawAcceptedFlag':'Original raw acceptedPerformanceEvidence:false preserved; this separate record binds independent acceptance.','bindings':{p:sha(root/p) for p in bindings},'actualChildren':144,'ordinaryWindows':5544,'diagnosticWindows':696,'selectedPublicCalls':107544,'warmups':72,'notApplicableRows':240,'independentStateCounts':state['counts'],'fullProjectCheck':full['counts'],'wallComparisons':{'faster':403,'slower':4,'inconclusive':53},'cpuTotalComparisons':{'faster':196,'slower':17,'inconclusive':247},'sameRuntimeVariationIsNotAnOptimization':True,'allAdverseAndIncompleteAttemptsRetained':True,'runtimeAndOriginalMethodUnchanged':True,'next':'RX-9006'}
(out/'acceptance.json').write_text(json.dumps(acceptance,indent=2)+'\n')
report={'status':'Pass','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'task':'RX-9005','taskState':'done','uncommitted':True,'next':'RX-9006','fullProjectCheck':full['counts'],'fullCheckRecordedInputs':full['recordedInputs'],'preservedPriorFiles':len(base['files'])-len(changed),'allowedPriorDocumentationChanges':changed,'currentPackagedMembersStillMatchCandidate':len(candidate['package']['files']),'retainedArchivesRehashed':len(archives),'runtimeRepairs':[],'remoteMutations':False,'commitPushPublication':False,'scopedAcceptance':{'path':'acceptance.json','sha256':sha(out/'acceptance.json')},'checks':checks,'ignoredEvidence':[],'scope':'Full project/private-candidate check precedes final documentation/planner synchronization; closing checks verify later prose/links/planning. No full-test rerun on final prose, exact committed-head, new remote CI, publication or future-cohort claim.'}
(out/'final-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
