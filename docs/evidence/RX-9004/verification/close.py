import pathlib,json,subprocess,hashlib,datetime
root=pathlib.Path(__file__).resolve().parents[4];out=root/'docs/evidence/RX-9004/verification'
base=json.loads((root/'docs/evidence/RX-9004/baseline.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
changed=[p for p,h in base['files'].items() if not (root/p).is_file() or sha(root/p)!=h]
allowed={'CODEX_HANDOFF.md','PROJECT_CONTEXT.md','docs/specs/N10_HARDENING_PERFORMANCE_REVIEW.md','docs/planning/roadmap.json','ROADMAP.md','IMPLEMENTATION_TASKS.md'}
assert set(changed)<=allowed,changed
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert head==base['head']
for p in ['review/final.md','review/final.json']:
 assert (root/'docs/evidence/RX-9004'/p).is_file(),p
checks=[]
for cmd in [['npm','run','handoff:check'],['npm','run','docs:check'],['npm','run','pages:check'],['npm','run','handoff:next'],['npm','run','tracking:preview'],['git','diff','--check']]:
 r=subprocess.run(cmd,cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);name=cmd[-1].replace(':','-')+'.txt';(out/name).write_text(r.stdout);checks.append({'command':cmd,'exitCode':r.returncode,'log':name,'sha256':sha(out/name)});assert r.returncode==0,r.stdout
candidate=json.loads((out/'candidate-report.json').read_text())
for row in candidate['package']['files']:assert sha(root/row['path'])==row['sha256'],row['path']
evidence=sorted([str(p.relative_to(root)) for p in (root/'docs/evidence/RX-9004').rglob('*') if p.is_file()]+['docs/evidence/RX-9004.md','docs/evaluation/RX-9004.md'])
ignored=subprocess.run(['git','check-ignore','--stdin'],cwd=root,text=True,input='\n'.join(evidence)+'\n',stdout=subprocess.PIPE,stderr=subprocess.PIPE);assert ignored.returncode==1 and not ignored.stdout,ignored.stdout
roadmap=json.loads((root/'docs/planning/roadmap.json').read_text());task=next(t for t in roadmap['tasks'] if t['id']=='RX-9004');assert task['status']=='done'
assert all((root/p).is_file() for p in task['evidence'])
current=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0'))-{''}
new=current-set(base['files']);unexpected=[p for p in new if not p.startswith('docs/evidence/RX-9004/') and p not in ['docs/evidence/RX-9004.md','docs/evaluation/RX-9004.md']];assert not unexpected,unexpected
full=json.loads((out/'validation.json').read_text());assert full['status']=='Pass' and full['counts']['pass']==1336 and full['counts']['fail']==0
review=root/'docs/evidence/RX-9004/review/final.json'
assert str(json.loads(review.read_text())['status']).startswith('Pass')
assert json.loads((out/'identity.json').read_text())['status']=='Pass'
assert json.loads((root/'docs/evidence/RX-9004/semantic-report.json').read_text())['outcome']=='Pass'
assert json.loads((root/'docs/evidence/RX-9004/review/semantic-replay.json').read_text())['status']=='Pass'
report={'status':'Pass','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'uncommitted':True,'task':'RX-9004','taskState':task['status'],'next':'RX-9005','alsoDependencyReady':['RX-9006'],'collectors':'RX-9004 complete216timed+27untimed semantic; RX-9005/6 remain unrun and serial','fullVerification':full['counts'],'fullCheckInputScope':full['recordedInputs'],'preservedPreexistingFiles':len(base['files'])-len(changed),'allowedClosingDocumentationChanges':changed,'currentPackagedMembersStillMatchVerifiedCandidate':len(candidate['package']['files']),'archiveSha256':sha(out/'verified-core.tar.gz'),'independentReview':{'path':str(review.relative_to(root)),'sha256':sha(review)},'evidenceFileCountAtAudit':len(evidence),'ignoredEvidenceFiles':[],'checks':checks,'scope':'Full check precedes closing planning/prose synchronization; final checks above verify those later documentation bytes. No claim of full test rerun on final prose or exact committed head.','measurementChildren':216,'ordinaryQueryCalls':13536,'diagnosticQueryCalls':432,'untimedWarmups':576,'semanticChildren':27,'allTimedQueryCapturesLinked':13968,'ordinaryWallMatchedSuccessFasterCells':272,'ordinaryCpuTotalSlowerCells':6,'sameRuntimeVariationIsNotAnotherOptimization':True,'productionRepairs':[],'runtimeTestMethodDependencyChanges':False,'remoteMutations':False,'commitPushPublication':False,'toolingAttempts':'attempts.json'}
acceptance={'kind':'rx9004-scoped-performance-acceptance-v1','status':'Pass','rawCollectorAcceptedFlag':'Preserved false in original report; this separate record binds actual independent acceptance gates.','scope':'Frozen native Node direct source+source-phrases matrix only; no weighted overall winner, new same-runtime optimization or future cohort result.','bindings':{p:sha(root/p) for p in ['docs/evaluation/RX-9001-method.json','docs/evidence/RX-9004/identity/artifacts.json','docs/evidence/RX-9004/timed-report.json','docs/evidence/RX-9004/semantic-report.json','docs/evidence/RX-9004/analysis/results.json','docs/evidence/RX-9004/review/results.json','docs/evidence/RX-9004/review/semantic-replay.json','docs/evidence/RX-9004/review/final.json','docs/evidence/RX-9004/verification/validation.json','docs/evidence/RX-9004/verification/identity.json']},'actualChildren':216,'semanticChildren':27,'timedCapturesLinked':13968,'fullProjectCheck':full['counts'],'runtimeSourceAndFrozenMethodUnchanged':True,'allAdverseAndRefusedOutcomesRetained':True}
(out/'acceptance.json').write_text(json.dumps(acceptance,indent=2)+'\n')
report['scopedAcceptance']={'path':'acceptance.json','sha256':sha(out/'acceptance.json')}
report['evidenceFileCountAtAudit']=len([p for p in (root/'docs/evidence/RX-9004').rglob('*') if p.is_file()])+2
assert subprocess.run(['git','check-ignore','--quiet',str(out/'acceptance.json')],cwd=root).returncode==1
(out/'final-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
