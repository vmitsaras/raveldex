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
result=unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(tests.Replay))
if args.report:
    with args.report.open('x') as f:json.dump(dict(testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),cases=records),f,indent=2);f.write('\n')
raise SystemExit(not result.wasSuccessful())
