"""Preserve actual completed/failed collector trees with complete file identities."""
import pathlib,json,hashlib,tarfile,sys,datetime
out=pathlib.Path(__file__).resolve().parent.parent
source=pathlib.Path(sys.argv[1]).resolve();name=sys.argv[2]
assert source.is_dir() and name.replace('-','').isalnum()
archive=out/(name+'-raw.tar.gz');assert not archive.exists()
rows=[]
with tarfile.open(archive,'w:gz',compresslevel=6) as tar:
 for p in sorted(source.rglob('*')):
  if p.is_dir():continue
  assert p.is_file() and not p.is_symlink(),str(p)
  rel=str(p.relative_to(source));blob=p.read_bytes();rows.append({'path':rel,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()});tar.add(p,arcname=rel,recursive=False)
index={'kind':'rx9005-retained-actual-files-v1','capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'originalDirectory':str(source),'archive':archive.name,'archiveBytes':archive.stat().st_size,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':rows,'fileCount':len(rows),'uncompressedBytes':sum(r['bytes'] for r in rows),'scope':'Actual collector outputs and staged consumers/harness, including all failure/refusal/not-run records. Whole predecessor archives remain at their original pins.'}
(out/(name+'-inventory.json')).write_text(json.dumps(index,indent=2)+'\n');print(json.dumps({k:v for k,v in index.items() if k!='files'},indent=2))
