"""Preserve an actual raw collector as bounded archives with exact file hashes."""
import pathlib,json,hashlib,tarfile,sys,datetime,gzip
out=pathlib.Path(__file__).resolve().parent.parent
source=pathlib.Path(sys.argv[1]).resolve();name=sys.argv[2]
assert source.is_dir() and name.replace('-','').isalnum()
assert not (out/(name+'-inventory.json.gz')).exists()
limit=40*1024*1024;parts=[];rows=[];tar=None;size=0;part=None
for p in sorted(source.rglob('*')):
 if p.is_dir():continue
 assert p.is_file() and not p.is_symlink(),str(p)
 n=p.stat().st_size
 if tar is None or size+n>limit:
  if tar:tar.close()
  part=out/(name+'-raw-'+str(len(parts)+1).zfill(3)+'.tar.gz');assert not part.exists()
  tar=tarfile.open(part,'w:gz',compresslevel=9);parts.append(part);size=0
 rel=str(p.relative_to(source));blob=p.read_bytes()
 rows.append({'path':rel,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'archive':part.name})
 tar.add(p,arcname=rel,recursive=False);size+=n
if tar:tar.close()
index={'kind':'rx9006-retained-actual-shards-v1','capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'originalDirectory':str(source),'archives':[{'path':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in parts],'files':rows,'fileCount':len(rows),'uncompressedBytes':sum(r['bytes'] for r in rows),'scope':'Exact actual collector files, no omission of failure/refusal/not-run data; tar members retain paths. Extract every listed shard into one directory to reconstruct the original tree.'}
with gzip.open(out/(name+'-inventory.json.gz'),'wt') as f:json.dump(index,f,indent=2)
summary={k:v for k,v in index.items() if k!='files'}
(out/(name+'-retention.json')).write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
