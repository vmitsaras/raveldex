import importlib.util,json,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('gc_audit',pathlib.Path(__file__).with_name('gc-runtime-audit.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
HEADER={'schema':'raveldex-gc-extents-varint-v1','fields':['kind','address','to','bytes','old_bytes','marker'],'single_threaded':True,'incremental_marking':False,'inline_new':False,'turbo_allocation_folding':False,'collector_overlap_measured':False,'includes_preexisting_objects':False,'physical_memory_measured':False,'active_extent_cap_per_map':64,'map_count_max':5,'stream_byte_cap':1048576,'stdio_buffer_bytes':65536}
def u(n):
 b=bytearray()
 while n>=128:b.append((n&127)|128);n>>=7
 b.append(n); return bytes(b)
def literal(rows,summary,header=None):
 raw=json.dumps(header or HEADER).encode()+b'\n'
 for row in rows:raw+=b''.join(u(x) for x in row)
 footer={'events':len(rows),'attempted_events':len(rows),'dropped_events':0,'stream_bytes_before_summary':len(raw),'valid':True,'errors':0,'aborted':False,**summary}
 last=json.dumps(footer).encode();return raw+b'\0'+u(len(last))+last
class Replay(unittest.TestCase):
 def run_bytes(self,raw):
  with tempfile.TemporaryDirectory() as directory:
   p=pathlib.Path(directory)/'literal.rdxgc';p.write_bytes(raw);return m.audit(p)
 def test_frozen_sources_overwritten_destinations_death_and_shrink(self):
  rows=[(1,100,0,8,0,0),(1,200,0,4,0,0),(8,0,0,12,0,0),
   (2,100,200,8,0,0),(2,300,100,4,0,0),(10,100,0,4,0,0),(10,200,0,8,0,0),(9,0,0,8,12,0),
   (6,100,0,4,0,10),(3,200,0,4,8,0),(5,0,0,4,12,1),
   (8,0,0,4,0,1),(2,200,400,4,0,0),(10,400,0,4,0,0),(9,0,0,4,4,1),
   (6,400,0,4,0,20),(8,0,0,4,0,0),(9,0,0,0,4,0)]
  r=self.run_bytes(literal(rows,dict(zip(m.METRICS,[12,12,0,4,8]),gc_cycles=3,gc_moves=3,census_objects=3,heap_gc_count_start=2,heap_gc_count_stop=5)))
  self.assertEqual([i['monitoredBytes'] for i in r['inspections']],[0,4]);self.assertEqual(r['independentReplay'],'Pass')
 def test_loss_or_scope_tampering_is_rejected(self):
  fields=dict(zip(m.METRICS,[8,8,8,0,0]),gc_cycles=0,gc_moves=0,census_objects=0,heap_gc_count_start=0,heap_gc_count_stop=0)
  for change in [{'attempted_events':2},{'mutator_occupied_high_water_bytes':9}]:
   with self.subTest(change=change):
    with self.assertRaises(ValueError):self.run_bytes(literal([(1,100,0,8,0,0)],{**fields,**change}))
  for change in [{'physical_memory_measured':True},{'fields':[]},{'map_count_max':9}]:
   with self.subTest(change=change):
    with self.assertRaises(ValueError):self.run_bytes(literal([],{}, {**HEADER,**change}))
 def test_invalid_tracked_gc_shrink_has_no_qualified_prefix(self):
  rows=[(1,100,0,8,0,0),(8,0,0,8,0,0),(2,100,200,8,0,0),(3,200,0,4,8,0)]
  result=self.run_bytes(literal(rows,{**dict.fromkeys(m.METRICS,None),'valid':False,'errors':1}))
  self.assertFalse(result['valid']);self.assertEqual(result['prefixFailure']['reason'],'Moved tracked GC shrink')
 def test_census_overlap_and_truncation_reject_valid_claim(self):
  fields=dict(zip(m.METRICS,[8,8,8,0,0]),gc_cycles=1,gc_moves=0,census_objects=2,heap_gc_count_start=0,heap_gc_count_stop=1)
  rows=[(1,100,0,8,0,0),(8,0,0,8,0,0),(10,100,0,8,0,0),(10,104,0,8,0,0),(9,0,0,8,8,0)]
  raw=literal(rows,fields)
  with self.assertRaises(ValueError):self.run_bytes(raw)
  with self.assertRaises(ValueError):self.run_bytes(raw[:-1])
if __name__=='__main__':unittest.main()
