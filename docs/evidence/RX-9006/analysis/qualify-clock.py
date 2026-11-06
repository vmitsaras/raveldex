"""Conservative supplement; preserves every frozen zero-floor/range result."""
import pathlib,json,csv,collections,math,hashlib,sys,datetime
OUT=pathlib.Path(__file__).resolve().parent;raw=pathlib.Path(sys.argv[1]);report=json.loads((raw/'report.json').read_text());assert report['outcome']=='Collected' and report['guards']=='Pass'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();main=[];worker=[]
def clock(c,identity):
 assert c['calls']==32768 and c['adjacentComparisons']==32767
 p=c['positiveDeltas'];n=c['negativeDeltas'];assert len(p)==c['positiveTicks'] and len(p)+len(n)+c['zeroDeltas']==32767
 values=[x['deltaMs'] for x in p];assert values and all(math.isfinite(v) and v>0 for v in values)
 assert all(math.isfinite(x['deltaMs']) and x['deltaMs']<0 for x in n)
 assert len({x['sampleIndex'] for x in p+n})==len(p)+len(n) and all(1<=x['sampleIndex']<32768 for x in p+n)
 assert min(values)==c['minimumObservedPositiveDeltaMs'];assert math.isclose(sum(values)+sum(x['deltaMs'] for x in n),c['lastObservedAt']-c['firstObservedAt'],rel_tol=1e-9,abs_tol=1e-7)
 return {**identity,'minimumObservedPositiveDeltaMs':min(values),'crossOriginIsolated':c['crossOriginIsolated'],'positiveTicks':len(p),'zeroDeltas':c['zeroDeltas'],'negativeDeltas':len(n)}
for entry in report['runs']:
 row=json.loads((raw/entry['output']).read_text());assert row['outcome']=='Collected'
 for cfg in row['configurations']:
  identity={'role':row['role'],'deadline':row['deadline'],'configuration':cfg['configuration']};d=cfg['data']
  for label in ['clockBefore','clockAfter']:main.append(clock(d[label],{**identity,'phase':label}))
  for w in d['workers']:
   for label in ['clockAtStartup','clockAtDump']:worker.append(clock(w['server'][label],{**identity,'owner':w['role'],'phase':label}))
assert len(main)==16 and len(worker)==32;assert all(not x['crossOriginIsolated'] and x['negativeDeltas']==0 for x in main),'Main calibration differs or is nonmonotonic; no automatic qualification'
quantum=max(x['minimumObservedPositiveDeltaMs'] for x in main);tolerance=.000001
with (OUT/'browser-comparisons.csv').open() as f:rows=list(csv.DictReader(f))
qualified=[];changed=[]
for row in rows:
 values=[row[k] for k in ['beforeOwnerMedianMinimum','afterOwnerMedianMinimum']];at=any(v!='' and float(v)<=quantum+tolerance for v in values)
 frozen=row['classification'];decision='Inconclusive: at observed main-clock quantum' if at else frozen
 q={**row,'frozenClassification':frozen,'qualifiedDecision':decision,'observedMainQuantumMs':quantum,'numericalRoundingToleranceMs':tolerance,'clockQualification':'Separate diagnostic observed ticks; no hard precision/error bound or timing correction'};qualified.append(q)
 if decision!=frozen:changed.append(q)
with (OUT/'browser-comparisons-qualified.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(qualified[0]));w.writeheader();w.writerows(qualified)
counts={p:{m:dict(collections.Counter(x['qualifiedDecision'] for x in qualified if x['comparison']==p and x['metric']==m)) for m in ['wallMs','invocationReturnMs','returnSettlementMs']} for p in ['preN9→current','acceptedN9→current']}
r={'status':'Reconstructed conservative qualification; independent review separate','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bindings':{str(raw/'report.json'):sha(raw/'report.json'),'browser-comparisons.csv':sha(OUT/'browser-comparisons.csv'),'clock-qualification-plan.json':sha(OUT.parent/'clock-qualification-plan.json')},'mainClockObservations':main,'workerClockObservations':worker,'conservativeObservedMainQuantumMs':quantum,'numericalToleranceMs':tolerance,'comparisons':len(qualified),'changedLabels':len(changed),'changedLabelTransitions':dict(collections.Counter(x['frozenClassification']+' -> '+x['qualifiedDecision'] for x in changed)),'newlyWithheldFasterClaims':sum(x['frozenClassification']=='Observed faster' for x in changed),'qualifiedClassifications':counts,'changedCells':changed,'scope':'Original frozen classifications, medians, tails, deltas, ratios and adverse CSV stay unchanged. Label changes include already inconclusive zero-floor/overlap labels; only the explicit newlyWithheldFasterClaims count represents additional withheld improvement claims. Qualification applies symmetrically to all artifacts/metrics. Observed ticks in separate matching browser settings are not hard error bounds for each normal call or physical precision; no calibration subtraction or SLA.'}
(OUT/'clock-qualification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k not in ['mainClockObservations','workerClockObservations','changedCells']},indent=2))
