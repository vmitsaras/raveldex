"""Differential literal tests; supply a separately compiled offline executable."""
import argparse,importlib.util,json,pathlib,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--executable',type=pathlib.Path,required=True);parser.add_argument('--report',type=pathlib.Path);args=parser.parse_args()
fast=load('fast',ROOT/'gc-runtime-fast-audit.py');tests=load('literals',ROOT/'gc-runtime-audit.test.py');records=[]
def both(self,raw):
    with tempfile.TemporaryDirectory() as directory:
        p=pathlib.Path(directory)/'literal.rdxgc';p.write_bytes(raw)
        try:reference=tests.m.audit(p)
        except ValueError:
            with self.assertRaises(ValueError):fast.audit(p,args.executable)
            records.append(dict(bytes=len(raw),bothReject=True));raise
        actual=fast.audit(p,args.executable)
        for key in ('bytes','sha256','events','valid','independentReplay','summary','maxStreamMiB'):
            self.assertEqual(actual[key],reference[key],key)
        if reference['valid']:self.assertEqual(actual['marks'],{str(k):v for k,v in reference['marks'].items()})
        else:self.assertEqual(actual['prefixFailure']['sequence'],reference['prefixFailure']['sequence'])
        records.append(dict(bytes=len(raw),bothAgree=True,valid=reference['valid']));return reference
tests.Replay.run_bytes=both
class IndependentCppLiterals(unittest.TestCase):
    """Separate hand-authored rows/expected values; no Python extent replay."""
    def test_cpp_literal_trim_then_tail_overwrite_and_death(self):
        header={'schema':'raveldex-gc-extents-varint-v2','gc_tracked_shrink_mode':'pre-move-full-coverage-right-trim-v1',
            'fields':['kind','address','to','bytes','old_bytes','marker'],'single_threaded':True,'incremental_marking':False,
            'inline_new':False,'turbo_allocation_folding':False,'collector_overlap_measured':False,
            'includes_preexisting_objects':False,'physical_memory_measured':False,'active_extent_cap_per_map':64,
            'map_count_max':5,'stream_byte_cap':1048576,'stdio_buffer_bytes':65536}
        rows=[(1,1000,0,24,0,0),(1,2000,0,8,0,0),(1,3000,0,8,0,0),(8,0,0,40,0,1),
            (3,1000,0,8,24,0),(4,1000,0,8,0,0),(2,2000,1008,8,0,0),(2,1000,4000,8,0,0),
            (10,1008,0,8,0,0),(10,4000,0,8,0,0),(9,0,0,16,24,1),(1,1016,0,24,0,0),
            (5,0,0,40,40,101)]
        def encode(value):
            out=[]
            while True:
                out.append((value&127)|(128 if value>=128 else 0));value>>=7
                if not value:return bytes(out)
        raw=json.dumps(header,separators=(',',':')).encode()+b'\n'
        for row in rows:raw+=b''.join(encode(value) for value in row)
        footer={'events':13,'attempted_events':13,'dropped_events':0,'stream_bytes_before_summary':len(raw),
            'valid':True,'errors':0,'aborted':False,'gross_birth_bytes':64,'mutator_occupied_high_water_bytes':40,
            'occupied_at_stop_bytes':40,'trimmed_bytes':16,'gc_removed_bytes':8,
            'gc_cycles':1,'gc_moves':2,'gc_pre_move_shrinks':1,'census_objects':2,'heap_gc_count_start':5,'heap_gc_count_stop':6}
        body=json.dumps(footer).encode();raw+=b'\0'+encode(len(body))+body
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'cpp-independent.rdxgc';path.write_bytes(raw)
            for bound in (256,512,2048,4096,8192):
                result=fast.audit(path,args.executable,bound)
                self.assertTrue(result['valid']);self.assertEqual(result['summary'],footer)
            for bound in (True,0,255,16384):
                with self.assertRaises(ValueError):fast.audit(path,args.executable,bound)
            records.append(dict(independentCppLiteral=True,bytes=len(raw),summary=footer))
suite=unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromTestCase(tests.Replay),
    unittest.defaultTestLoader.loadTestsFromTestCase(IndependentCppLiterals)])
result=unittest.TextTestRunner().run(suite)
if args.report:
    with args.report.open('x') as f:json.dump(dict(testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),cases=records),f,indent=2);f.write('\n')
raise SystemExit(not result.wasSuccessful())
