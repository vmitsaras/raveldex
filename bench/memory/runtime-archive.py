#!/usr/bin/env python3
"""Offline streaming verification, optionally extraction into a NEW directory.
No runtime/browser launch, attachment, source execution or numerical replay.
"""
import argparse,hashlib,json,pathlib,tarfile
LIMIT=1024*1024*1024

def safe(name):
    path=pathlib.PurePosixPath(name)
    if not name or path.is_absolute() or '\\' in name or '\x00' in name or any(p in ('','..','.') for p in name.split('/')):raise ValueError('Unsafe member path')
    return path

def unique_members(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise ValueError('Duplicate JSON key')
        result[key]=value
    return result

def verify(archive,destination=None):
    expected=None;seen=set();total=0;manifest_hash=None
    with tarfile.open(archive,'r|gz') as tar:
        for item in tar:
            safe(item.name)
            if not item.isfile() or item.name in seen:raise ValueError('Non-file or duplicate member')
            seen.add(item.name)
            if item.size<0 or item.size>128*1024*1024:raise ValueError('Member size bound')
            total+=item.size
            if total>LIMIT:raise ValueError('Archive size bound')
            stream=tar.extractfile(item)
            if item.name=='MANIFEST.json':
                if expected is not None or len(seen)!=1:raise ValueError('Manifest order/duplicate')
                raw=stream.read();manifest_hash=hashlib.sha256(raw).hexdigest();data=json.loads(raw,object_pairs_hook=unique_members)
                if data['schema']!='raveldex-ac03-workload-archive-v1':raise ValueError('Wrong archive schema')
                expected={}
                for member in data['members']:
                    safe(member['name'])
                    if member['name'] in expected or member['name']=='MANIFEST.json':raise ValueError('Duplicate manifest member')
                    expected[member['name']]=member
                continue
            if expected is None or item.name not in expected:raise ValueError('Unlisted member')
            record=expected[item.name]
            if item.size!=record['bytes']:raise ValueError('Length mismatch')
            digest=hashlib.sha256();target=None
            if destination is not None:
                path=destination.joinpath(*safe(item.name).parts);path.parent.mkdir(parents=True,exist_ok=True);target=path.open('xb')
            try:
                for chunk in iter(lambda:stream.read(1024*1024),b''):
                    digest.update(chunk)
                    if target:target.write(chunk)
            finally:
                if target:target.close()
            if digest.hexdigest()!=record['sha256']:raise ValueError('Digest mismatch: '+item.name)
    if expected is None or seen-{'MANIFEST.json'}!=set(expected):raise ValueError('Missing members')
    return {'schema':'raveldex-ac03-archive-verification-v1','members':len(expected),'uncompressedBytes':total,'manifestSha256':manifest_hash,'outcome':'Pass: bytes only; numerical/native scope is separate'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('archive',type=pathlib.Path);p.add_argument('--extract-dir',type=pathlib.Path);a=p.parse_args()
    result=verify(a.archive)
    if a.extract_dir is not None:
        a.extract_dir.mkdir(mode=0o700)
        verify(a.archive,a.extract_dir);result['extractedTo']=str(a.extract_dir.resolve())
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()
