"""Read bounded collector progress only; never execute an engine."""
import pathlib,json,datetime
p=pathlib.Path('/private/tmp/raveldex-rx9005-20261105/full-02')
q=p/'report.json'
if not q.exists():q=p/'progress.json'
if not q.exists():q=p/'start.json'
r=json.loads(q.read_text());ps=sorted(p.glob('*.progress.json'),key=lambda p:p.stat().st_mtime)
x=json.loads(ps[-1].read_text()) if ps else {}
print(json.dumps({'minutes':round((datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(r['startedAt'].replace('Z','+00:00'))).total_seconds()/60,1),'outcome':r['outcome'],'completed':len(r['runs']),'of':144,'current':{k:x.get(k) for k in ['size','configuration','role','owner','mode','phase','verifiedMeasuredWindows','selectedAttemptedCalls']},'failure':r.get('failure'),'guardFailure':r.get('guardFailure')},separators=(',',':')))
