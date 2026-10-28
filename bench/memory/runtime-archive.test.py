import hashlib,importlib.util,io,json,pathlib,tarfile,tempfile,unittest
spec=importlib.util.spec_from_file_location('archive',pathlib.Path(__file__).with_name('runtime-archive.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Archive(unittest.TestCase):
 def archive(self,p,compression,name='raw/literal.bin',data=b'\0\x81\x01raw\xff'):
  row={'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
  manifest=json.dumps({'schema':'raveldex-ac03-workload-archive-v1','members':[row]}).encode()
  with tarfile.open(p,'w:'+compression) as tar:
   for name,value in [('MANIFEST.json',manifest),(name,data)]:
    info=tarfile.TarInfo(name);info.size=len(value);tar.addfile(info,io.BytesIO(value))
 def test_both_containers_preserve_exact_stream_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   for compression in ('gz','xz'):
    p=pathlib.Path(d)/('raw.tar.'+compression);self.archive(p,compression)
    result=m.verify(p);self.assertEqual(result['members'],1)
    target=pathlib.Path(d)/compression;target.mkdir();m.verify(p,target)
    self.assertEqual((target/'raw/literal.bin').read_bytes(),b'\0\x81\x01raw\xff')
 def test_traversal_is_rejected_in_both_containers(self):
  with tempfile.TemporaryDirectory() as d:
   for compression in ('gz','xz'):
    p=pathlib.Path(d)/('bad.tar.'+compression);self.archive(p,compression,'../escape')
    with self.assertRaises(ValueError):m.verify(p)
 def test_declared_oversize_is_rejected_before_body_read(self):
  with tempfile.TemporaryDirectory() as d:
   for compression in ('gz','xz'):
    p=pathlib.Path(d)/('huge.tar.'+compression)
    with tarfile.open(p,'w:'+compression) as tar:
     info=tarfile.TarInfo('MANIFEST.json');info.size=9*1024*1024;tar.addfile(info)
    with self.assertRaisesRegex(ValueError,'Manifest size bound'):m.verify(p)
if __name__=='__main__':unittest.main()
