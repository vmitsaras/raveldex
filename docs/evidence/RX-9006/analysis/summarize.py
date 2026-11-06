"""Actual full raw reconstruction. No engine/helper calls or live timing."""
import pathlib,json,math,statistics,collections,csv,hashlib,sys,datetime
OUT=pathlib.Path(__file__).resolve().parent
B=pathlib.Path(sys.argv[1]);R=pathlib.Path(sys.argv[2]);browser_only=str(R)=='-'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def q(v,p=.5):return sorted(v)[math.ceil(len(v)*p)-1] if v else None
def metric(samples,key):
 v=[s[key] for s in samples if s['outcome']=='Pass' and key in s]
 assert all(math.isfinite(x) and x>=0 for x in v)
 return {'successSamples':len(v),'p50':q(v),'p95':q(v,.95) if len(v)>=100 else None,'maximum':max(v) if v else None}
def dump(name,value):(OUT/name).write_text(json.dumps(value,indent=2)+'\n')
def table(name,rows):
 with (OUT/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
reports={'browser':read(B/'report.json')}
if not browser_only:reports['recovery']=read(R/'report.json')
assert all(r['outcome']=='Collected' and r['guards']=='Pass' and r['profile']=='full' for r in reports.values())
brows=[read(B/x['output']) for x in reports['browser']['runs']]
rrows=[] if browser_only else [read(R/x['file']) for x in reports['recovery']['runs']]
assert len(brows)==96 and (browser_only or len(rrows)==204)
bmetrics=['wallMs','invocationReturnMs','returnSettlementMs']
bgroups=collections.defaultdict(list)
for row in brows:
 if row['mode']!='normal':continue
 for s in row['case']['samples']:
  key=(row['role'],row['size'],row['channel'],row['deadline'],s['query'],s['phase'])
  bgroups[key].append({**s,'owner':row['owner']})
bcells=[];bc={}
for key,samples in sorted(bgroups.items()):
 identity=dict(zip(['role','size','channel','deadline','query','phase'],key));owners=sorted({s['owner'] for s in samples});assert owners==[0,1,2]
 c={**identity,'attempts':len(samples),'outcomes':dict(collections.Counter(s['outcome'] for s in samples)),'metrics':{m:metric(samples,m) for m in bmetrics},'owners':[{ 'owner':o,'metrics':{m:metric([s for s in samples if s['owner']==o],m) for m in bmetrics}} for o in owners]};bcells.append(c);bc[key]=c
bcompare=[]
for before in ['preN9','acceptedN9']:
 for key,after in sorted(bc.items()):
  if key[0]!='current':continue
  old=bc[(before,*key[1:])]
  for m in bmetrics:
   a=old['metrics'][m];b=after['metrics'][m];x=[o['metrics'][m]['p50'] for o in old['owners']];y=[o['metrics'][m]['p50'] for o in after['owners']]
   if old['outcomes']!={'Pass':old['attempts']} or after['outcomes']!={'Pass':after['attempts']}:relation='Outcome transition / no matched-success latency classification'
   elif any(v is None or v<=0 for v in x+y):relation='Inconclusive: timer floor'
   elif max(y)<min(x):relation='Observed faster'
   elif min(y)>max(x):relation='Observed slower'
   else:relation='Overlapping / inconclusive'
   av=a['p50'];bv=b['p50'];bcompare.append({'comparison':before+'→current','size':key[1],'channel':key[2],'deadline':key[3],'query':key[4],'phase':key[5],'metric':m,'beforeAttempts':old['attempts'],'afterAttempts':after['attempts'],'beforeSuccesses':a['successSamples'],'afterSuccesses':b['successSamples'],'beforeP50':av,'afterP50':bv,'absoluteChange':None if av is None or bv is None else bv-av,'percentChange':None if not av or bv is None else 100*(bv/av-1),'beforeOwnerMedianMinimum':min(x) if all(v is not None for v in x) else None,'beforeOwnerMedianMaximum':max(x) if all(v is not None for v in x) else None,'afterOwnerMedianMinimum':min(y) if all(v is not None for v in y) else None,'afterOwnerMedianMaximum':max(y) if all(v is not None for v in y) else None,'classification':relation,'scope':'Equal-runtime method control; no new optimization' if before=='acceptedN9' else 'Observed three-owner ranges; not a confidence interval/population guarantee'})
rmetrics=['wallMs','invocationToReturnMs','returnToSettlementMs','cpuUserMs','cpuSystemMs','cpuTotalMs']
rgroups=collections.defaultdict(list);rdiag=[]
for row in rrows:
 job=row['job'];ops=row['exercise']['samples'] if job['mode']=='normal' else row['exercise']['observations']
 for o in ops:
  op=dict(o)
  if 'cpuUserMs' in op:op['cpuTotalMs']=op['cpuUserMs']+op['cpuSystemMs']
  identity={k:job[k] for k in ['role','family','size','host','variant','deadline']}
  if job['mode']=='diagnostic':rdiag.append({**identity,'operation':o['operation'],'outcome':o['outcome'],'attempts':o['attempts'],'counters':o.get('counters'),'processSamples':o.get('processSamples')});continue
  key=tuple(identity.values())+(o['operation'],);rgroups[key].append({**op,'owner':job['owner']})
rcells=[];rc={}
for key,ops in sorted(rgroups.items()):
 owners=sorted({o['owner'] for o in ops});assert owners==[0,1]
 c={**dict(zip(['role','family','size','host','variant','deadline','operation'],key)),'rows':len(ops),'attempts':sum(o['attempts'] for o in ops),'outcomes':dict(collections.Counter(o['outcome'] for o in ops)),'metrics':{m:metric(ops,m) for m in rmetrics if any(m in o for o in ops)},'owners':[{ 'owner':o,'observation':next(v for v in ops if v['owner']==o)} for o in owners]};rcells.append(c);rc[key]=c
rcompare=[]
for before in ['preN9','acceptedN9']:
 for key,after in sorted(rc.items()):
  if key[0]!='current' or (before,*key[1:]) not in rc:continue
  old=rc[(before,*key[1:])]
  for m in rmetrics:
   if m.startswith('cpu') and key[3]!='Node-direct':continue
   av=old['metrics'].get(m,{}).get('p50');bv=after['metrics'].get(m,{}).get('p50');relation='Descriptive / inconclusive: two ordinary owners'
   if old['outcomes']!=after['outcomes']:relation='Capacity/outcome transition; no equal-work speed ratio'
   elif old['outcomes']=={'Not run':2}:relation='Both Not run: zero attempts; no duration'
   elif old['outcomes']!={'Pass':2}:relation='Non-success outcome; no successful latency ratio'
   rcompare.append({'comparison':before+'→current','family':key[1],'size':key[2],'host':key[3],'variant':key[4],'deadline':key[5],'operation':key[6],'metric':m,'beforeOutcomes':json.dumps(old['outcomes'],sort_keys=True),'afterOutcomes':json.dumps(after['outcomes'],sort_keys=True),'beforeP50':av,'afterP50':bv,'absoluteChange':None if av is None or bv is None else bv-av,'percentChangeDescriptive':None if not av or bv is None or relation!='Descriptive / inconclusive: two ordinary owners' else 100*(bv/av-1),'classification':relation})
counts={'browser':{'contexts':len(brows),'normalContexts':sum(r['mode']=='normal' for r in brows),'normalCalls':sum(len(r['case']['samples']) for r in brows),'diagnosticCalls':sum(len(r['case']['observations']) for r in brows),'excludedWarmups':sum(len(r['case']['warmups']) for r in brows),'cells':len(bcells),'comparisons':len(bcompare),'p95EligibleWallCells':sum(c['metrics']['wallMs']['p95'] is not None for c in bcells)},'recovery':{'contexts':len(rrows),'normalContexts':sum(r['job']['mode']=='normal' for r in rrows),'operations':sum(len(r['exercise']['samples']+r['exercise']['observations']) for r in rrows),'normalCells':len(rcells),'comparisons':len(rcompare),'normalOutcomeRows':dict(collections.Counter(o['outcome'] for r in rrows for o in r['exercise']['samples'])),'diagnosticOutcomeRows':dict(collections.Counter(o['outcome'] for r in rrows for o in r['exercise']['observations']))}}
assert counts['browser']['normalCalls']==6048 and counts['browser']['diagnosticCalls']==96 and counts['browser']['excludedWarmups']==288
if not browser_only:assert counts['recovery']['operations']==1020
else:counts['recovery']={'status':'Not collected in this browser-only analysis invocation; no recovery acceptance'}
classifications={p:{m:dict(collections.Counter(c['classification'] for c in bcompare if c['comparison']==p and c['metric']==m)) for m in bmetrics} for p in ['preN9→current','acceptedN9→current']}
summary={'status':'Reconstructed; independent semantic/review acceptance separate','capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rawDirectories':{'browser':str(B),'recovery':str(R)},'rawReports':{k:{'sha256':sha(p/'report.json'),'elapsedMs':reports[k]['elapsedMs']} for k,p in [('browser',B),('recovery',R)] if k in reports},'counts':counts,'browserClassifications':classifications,'scope':'Only full fresh ordinary samples are compared; diagnostics and all probes excluded. Browser phase and deadline/host/configuration cells stay separate. Recovery two-owner summaries are descriptive/inconclusive with no p95 or faster/slower classification. Build return boundary is the async sequential build wrapper/firstbatch invocation, not total admission or one atomic build. Return-to-settlement is not isolated queue/transport. Raw arithmetic ratios remain where the before pooled median is positive; floor-limited ratios are uninterpretable and never establish speed. All positive pooled changes and overlapping control variation remain explicit.'}
dump('summary-browser-only.json' if browser_only else 'summary.json',summary);dump('browser-cells.json',bcells)
table('browser-comparisons.csv',bcompare)
if not browser_only:
 dump('recovery-cells.json',rcells);dump('recovery-diagnostics.json',rdiag);table('recovery-comparisons.csv',rcompare)
adverse=[c for c in bcompare if c['classification']=='Observed slower'];
if adverse:table('browser-adverse.csv',adverse)
positive=[c for c in bcompare if c['absoluteChange'] is not None and c['absoluteChange']>0]
if positive:table('browser-positive-median-changes.csv',positive)
print(json.dumps(summary,indent=2))
