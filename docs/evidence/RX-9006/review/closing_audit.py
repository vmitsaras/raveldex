"""Independent closing log/preservation audit; no native calls or parent helper execution."""
import pathlib,json,gzip,hashlib,re,datetime
ROOT=pathlib.Path(__file__).resolve().parents[4]
p=ROOT/'docs/evidence/RX-9006'
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
v=json.loads((p/'verification/validation.json').read_text())
for n,b in v['files'].items():
 f=p/'verification'/n
 assert f.stat().st_size==b['bytes'] and sha(f)==b['sha256'],n
final=json.loads((p/'verification/final-checks.json').read_text())
for r in final['results']:
 f=p/'verification'/r['log']
 assert sha(f)==r['sha256'] and f.stat().st_size==r['bytes'] and r['exitCode']==0,r['name']
log=(p/'verification/full-check.txt').read_text()
counts={k:sum(map(int,re.findall(r'^ℹ '+k+r' (\d+)$',log,re.M))) for k in ['tests','pass','fail','cancelled','skipped','todo']}
assert counts==v['counts'],(counts,v['counts'])
guard=json.loads(gzip.decompress((p/'verification/worktree-guard.json.gz').read_bytes()))
assert guard['stable'] and guard['before']['head']==guard['after']['head'] and guard['before']['files']==guard['after']['files']
# Newly retained reviewer outputs are task evidence, explicitly outside this guard.
status_delta={k:sorted(set(guard[k]['status'])-set(guard['before' if k=='after' else 'after']['status'])) for k in ['before','after']}
assert all(line[3:].startswith('docs/evidence/RX-9006/') for rows in status_delta.values() for line in rows),status_delta
fp=json.loads((p/'verification/final-preservation.json').read_text())
a=guard['after']['files'];b=fp['currentNonTaskFileHashes'];assert set(a)==set(b)
changed=sorted(k for k in a if a[k]!=b[k]);assert changed==fp['afterFullCheckDocumentationChanges'],changed
sync=json.loads((p/'identity/documentation-sync-inputs.json').read_text())
road=json.loads((ROOT/'docs/planning/roadmap.json').read_text());actual={t['id']:t for t in road['tasks']}
assert [t for t in road['tasks'] if t['id']!='RX-9006']==sync['allOtherTasks']
assert road['milestones']==sync['milestones']
for n,h in sync['foreignFiles'].items():assert sha(ROOT/n)==h,n
checked=[]
for n,h in b.items():
 if n.startswith('src/') or n.startswith('bench/n10/') or n.startswith('test/comparison/n10-host-') or n in changed or n in sync['foreignFiles']:
  assert sha(ROOT/n)==h,n
  checked.append(n)
assert actual['RX-9006']['status']=='blocked'
assert 'RX-9006' in actual['RX-9007']['dependsOn'] and 'RX-9007' in actual['RX-9101']['dependsOn']
assert sha(p/'review/recovery_replay.py')=='e871ade94400e8c50a97de834ac328a6ce6fe78cbe246c7ce6486c0e46589084'
result={'kind':'rx9006-independent-closing-audit-v1','status':'Pass for closing log and bounded preservation audit','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'counts':counts,'guardedInputsDuringProjectCheck':len(a),'postCheckDocumentationOnlyChanged':changed,'excludedTaskEvidenceStatusDelta':status_delta,'currentDirectlyRehashedFiles':len(checked),'directlyRehashedPaths':checked,'otherTaskObjectsEqual':len(sync['allOtherTasks']),'milestoneObjectsEqual':len(sync['milestones']),'foreignFilesEqual':len(sync['foreignFiles']),'strictRecoveryVerifierUnchanged':True,'scope':'Recomputed all test summary counts and every validation/final-check log binding; compared full before/after/preservation maps and directly rehashed listed current runtime/harness/test/docs/foreign files. Historical evidence files in those maps are not redundantly rehashed in this closing audit.'}
(p/'review/closing-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='directlyRehashedPaths'},indent=2))
