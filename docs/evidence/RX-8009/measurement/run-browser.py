from pathlib import Path
import json,subprocess,datetime
root=Path('/Users/vasilis/Documents/GitHub/raveldex');base=Path('/tmp/raveldex-rx8009-20261104');manifest=json.loads((base/'manifest.json').read_text());pairs=[('planning','baseline','planning'),('scheduling','planning','scheduling'),('prefix','scheduling','prefix'),('ranking','prefix','ranking'),('bulk','ranking','combined'),('combined','baseline','combined')];runs=[]
for name,before,after in pairs:
 command=['node','bench/n9/paired-browser.mjs',manifest['variants'][before]['consumer'],manifest['variants'][after]['consumer'],str(base/('browser-'+name))]
 with (base/('browser-'+name+'.txt')).open('wb') as stream:result=subprocess.run(command,cwd=root,stdout=stream,stderr=subprocess.STDOUT)
 runs.append({'intervention':name,'before':before,'after':after,'command':command,'exitCode':result.returncode,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()});(base/'browser-runs.json').write_text(json.dumps(runs,indent=2)+'\n');print(json.dumps(runs[-1]),flush=True)
 if result.returncode:raise SystemExit(result.returncode)
