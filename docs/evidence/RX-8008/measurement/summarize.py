from pathlib import Path
import json,statistics,hashlib
base=Path('/tmp/raveldex-rx8008-20261104')
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_text())
def node_rows(side):
 report=load(base/(side+'-node')/'report.json')
 assert report['outcome']=='Collected' and report['normalPackageUnchanged'] and report['diagnosticPackageUnchanged']
 return report,[(r,load(base/(side+'-node')/r['output'])) for r in report['runs']]
def browser_rows(side):
 report=load(base/(side+'-browser')/'report.json')
 assert report['outcome']=='Collected' and report['originalPackageUnchanged']
 return report,[(r,load(base/(side+'-browser')/r['output'])) for r in report['runs']]
def observation(row,operation='restoreSource'):
 e=row.get('exercise',row.get('case'))
 return next(x for x in (e['samples'] or e['observations']) if x['operation']==operation)
def mem(row,op):
 d=op['counters']['restore'];samples=[m['value'] for m in d['memorySamples']]
 samples += [m['values'] for m in row['exercise']['memory'] if m['operation']=='restoreSource']
 return {'samples':len(samples),'maximumSample':{key:max(m[key] for m in samples) for key in ['rss','heapTotal','heapUsed','external','arrayBuffers']},'scope':'Unforced process samples; harness/input/donor/receiver coexist. Not continuous peak, retained or engine-exclusive heap.'}
report={'kind':'rx8008-paired-source-restore-v1','matrix':[],'browser':[],'diagnostics':[],'inputs':[],'donors':[],'outcomes':{},'limitations':['Sequential before/after collection; two normal Node owners and one ordinary Chrome case per cell are descriptive, not p95/population speed estimates.','Before10k restores refuse before completing; after10k complete. Do not compute an equal-work speedup.','Browser CPU/heap Not measured; Node sampled memory is not retained/peak/exclusive heap.','phaseEvents is a capped128-event prefix. phaseWork owns complete totals.','Forced1ms deadlines are distinct from natural60s work errors.','No remote CI/publication/physical-input/paint/manual-AT claims.']}
for side in ['before','after']:
 nr,nodes=node_rows(side);br,browsers=browser_rows(side)
 for host,rows in [('node',nodes),('browser',browsers)]:
  counts={}
  for run,row in rows:
   op=observation(row);counts[op['outcome']]=counts.get(op['outcome'],0)+1
   e=row.get('exercise',row.get('case')); report['donors'].append({'side':side,'host':host,'size':row['size'],'variant':row['variant'],'queries':e['donorResults'],'state':e.get('fullStateDonor')})
   exported=observation(row,'exportSource');assert exported['outcome']=='Pass'
   report['inputs'].append({'side':side,'host':host,'size':row['size'],'variant':row['variant'],'sha256':exported['result']['encodedSha256'],'bytes':exported['result']['encodedBytes']})
   if op['outcome']=='Pass':
    assert op['completeSource']['records']==row['size'] and op['completeMembership']['records']==row['size']
    if row['mode']=='diagnostic':assert op['completeState']['donor']['sha256']==op['completeState']['receiver']['sha256']
   else:assert op['error']['code']=='WORK_LIMIT_EXCEEDED' and op['oldQueriesPreserved'] and op['oldSourceBytesPreserved']
   for name in ['deadlineRestore','abortedRestore']:
    stop=observation(row,name);assert stop['error']['code']==('DEADLINE_EXCEEDED' if name=='deadlineRestore' else 'CANCELLED');assert stop['oldQueriesPreserved'] and stop['oldSourceBytesPreserved']
   if row['mode']=='diagnostic':
    d=op['counters']['restore']; assert not d['observerErrors'];assert sum(x['workUnits'] for x in d['phaseWork'].values())==op['counters']['emittedWorkUnits'];assert d['authoritativeUnchangedDuringStaging']
    report['diagnostics'].append({'side':side,'host':host,'execution':row.get('execution','direct'),'size':row['size'],'variant':row['variant'],'outcome':op['outcome'],'emittedWorkUnits':op['counters']['emittedWorkUnits'],'recordsCompleted':d['recordsCompleted'],'phaseWork':d['phaseWork'],'copy':d['copy'],'analysisCalls':d['analysisCalls'],'tokens':d['tokens'],'participantWork':d['participantWork'],'budgetRefusals':d['budgetRefusals'],'lastUnsealedStage':d.get('lastUnsealedStage'),'lastStagedRoot':d.get('lastStagedRoot'),'oldRoot':d['oldRoot'],'finalAuthoritativeRoot':d['finalAuthoritativeRoot'],'finalAuthoritativeSame':d['finalAuthoritativeSame'],'completeState':op.get('completeState'),'memory':mem(row,op) if host=='node' else 'Not measured'})
  report['outcomes'][side+'-'+host]=counts
 for size in [1000,10000]:
  for variant in ['source','positions-offsets']:
   selected=[observation(row) for _,row in nodes if row['mode']=='normal' and row['size']==size and row['variant']==variant]
   report['matrix'].append({'side':side,'size':size,'variant':variant,'outcomes':[x['outcome'] for x in selected],**{name:statistics.median(x[name] for x in selected) for name in ['wallMs','cpuUserMs','cpuSystemMs']}})
 for _,row in browsers:
  if row['mode']=='normal':
   op=observation(row);report['browser'].append({'side':side,'size':row['size'],'variant':row['variant'],'execution':row['execution'],'outcome':op['outcome'],'wallMs':op['wallMs']})
for size in [1000,10000]:
 for variant in ['source','positions-offsets']:
  ids=[(x['sha256'],x['bytes']) for x in report['inputs'] if x['size']==size and x['variant']==variant]
  assert len(set(ids))==1,(size,variant,ids)
  donors=[x for x in report['donors'] if x['size']==size and x['variant']==variant]
  assert len({json.dumps(x['queries'],sort_keys=True) for x in donors})==1, 'before/after/host numerical donor drift'
  assert len({x['state']['sha256'] for x in donors if x['state']})==1, 'before/after/host complete donor state drift'
report['exactInputsAcrossHostsAndVersions']=True
(base/'paired-summary.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'outcomes':report['outcomes'],'matrix':report['matrix']},indent=2))
