import pathlib,json,re,hashlib
out=pathlib.Path(__file__).resolve().parent
p=out/'validation.json';r=json.loads(p.read_text())
prior=out/'validation-before-count-correction.json'
if not prior.exists():prior.write_text(p.read_text())
log=(out/'full-check.txt').read_text()
fields=['tests','pass','fail','cancelled','skipped','todo']
rows={k:list(map(int,re.findall(r'^(?:#|ℹ) '+k+r' (\d+)$',log,re.M))) for k in fields}
assert all(len(v)==6 for v in rows.values()), rows
counts={k:sum(v) for k,v in rows.items()}
assert counts=={'tests':1344,'pass':1336,'fail':0,'cancelled':0,'skipped':8,'todo':0},counts
assert counts['tests']==sum(counts[k] for k in ['pass','fail','cancelled','skipped','todo'])
r['counts']=counts;r['suiteSummaries']=[{k:rows[k][i] for k in fields} for i in range(6)]
r['countExtraction']={'script':'summarize.py','rawLogSha256':hashlib.sha256((out/'full-check.txt').read_bytes()).hexdigest(),'scope':'Six actual Node spec reporter summaries; original wrapper assumed TAP prefixes and returned zero counts despite successful raw run. Preserved initial summary; corrected evidence parser only. Tests were not rerun.','priorSummary':'validation-before-count-correction.json'}
p.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(counts))
