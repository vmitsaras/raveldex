"""Bounded C++ replay companion; validates framing, JSON, scope and arithmetic.

The supplied task-owned executable is built from gc-runtime-replay.cc. This is
offline tooling, not a replacement runtime or a source of measurement events.
"""
import argparse, hashlib, importlib.util, json, pathlib, subprocess
spec=importlib.util.spec_from_file_location('extent_checks',pathlib.Path(__file__).with_name('runtime-audit.py'))
checks=importlib.util.module_from_spec(spec);spec.loader.exec_module(checks)
METRICS=('gross_birth_bytes','mutator_occupied_high_water_bytes','occupied_at_stop_bytes','trimmed_bytes','gc_removed_bytes')
def require(test,why):
    if not test:raise ValueError(why)
def sha(path):
    h=hashlib.sha256()
    with pathlib.Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def audit(path,executable,bound=256):
    require(type(bound) is int and bound in (256,512,2048),'Invalid offline bound')
    require(pathlib.Path(path).stat().st_size<=bound*1048576,'Raw exceeds offline bound')
    p=subprocess.run([str(pathlib.Path(executable).resolve()),str(path),str(bound)],capture_output=True,timeout=600)
    require(p.returncode==0,'Offline replay failed: '+p.stderr.decode(errors='replace')[:1024])
    # Up to 4096 mark summaries fit below this finite bound. The prior 64KiB
    # limit refused the preserved deliberate stream-overflow calibration.
    require(len(p.stdout)<=1048576 and not p.stderr,'Offline output bound or unexpected stderr')
    r=json.loads(p.stdout,object_pairs_hook=checks.unique_object);h=r['header'];s=r['footer']
    require(h['schema']=='raveldex-gc-extents-varint-v1','Schema mismatch')
    require(h['fields']==['kind','address','to','bytes','old_bytes','marker'],'Layout mismatch')
    require(type(h['active_extent_cap_per_map']) is int and 1<=h['active_extent_cap_per_map']<=1000000 and h['map_count_max']==5,'Map scope mismatch')
    require(type(h['stream_byte_cap']) is int and 1048576<=h['stream_byte_cap']<=16384*1048576,'Native cap mismatch')
    require(h['stdio_buffer_bytes']==65536 and h['single_threaded'] is True and h['incremental_marking'] is False,'Recorder mode mismatch')
    for key in ('physical_memory_measured','inline_new','turbo_allocation_folding','collector_overlap_measured','includes_preexisting_objects'):
        require(h[key] is False,'Metric scope mismatch')
    require(r['bytes']==pathlib.Path(path).stat().st_size and r['bytes']<=h['stream_byte_cap'],'Stream size mismatch')
    require(r['footerAt']==s['stream_bytes_before_summary'] and r['events']==s['events'],'Footer offset/event mismatch')
    require(type(s['attempted_events']) is int and type(s['dropped_events']) is int and s['dropped_events']>=0 and s['attempted_events']==s['events']+s['dropped_events'],'Loss count mismatch')
    require(type(s['valid']) is bool,'Validity type mismatch')
    if s['valid']:
        require(not r['failure'] and not r['openGc'],'Native valid with invalid offline replay')
        require(s['errors']==0 and s['dropped_events']==0 and not s['aborted'],'Invalid accepted footer')
        require([s[k] for k in METRICS]==[r[k] for k in ('gross','peak','stop','trimmed','reclaimed')],'Independent metric mismatch')
        require([s[k] for k in ('gc_cycles','gc_moves','census_objects')]==[r[k] for k in ('gcs','moves','census')],'GC counter mismatch')
        require(s['heap_gc_count_stop']-s['heap_gc_count_start']==r['gcs'],'Missing internal GC')
    else:require(s['errors']>0 and all(s[k] is None for k in METRICS),'Invalid footer exposes metrics')
    return dict(path=str(path),bytes=r['bytes'],sha256=sha(path),events=r['events'],valid=s['valid'],
        independentReplay='Pass' if s['valid'] else 'Invalid window retained; numeric prefix unqualified',summary=s,
        marks=r['marks'],maxStreamMiB=bound,prefixFailure=dict(sequence=r['failureSequence'],reason=r['failure']) if r['failure'] else None,
        replayExecutableSha256=sha(executable),replaySourceSha256=sha(pathlib.Path(__file__).with_name('gc-runtime-replay.cc')),
        offlineLimits={'timeoutSeconds':600,'extentsPerMap':1000000,'movesPerGc':1000000,'censusRowsPerGc':4000000,'distinctMarks':4096})
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--executable',required=True,type=pathlib.Path)
    parser.add_argument('--max-stream-mib',type=int,choices=(256,512,2048),default=256);parser.add_argument('paths',nargs='+',type=pathlib.Path);args=parser.parse_args()
    print(json.dumps([audit(p,args.executable,args.max_stream_mib) for p in args.paths],indent=2))
