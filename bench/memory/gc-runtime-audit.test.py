import importlib.util,json,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('gc_audit',pathlib.Path(__file__).with_name('gc-runtime-audit.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
HEADER={'schema':'raveldex-gc-extents-varint-v1','fields':['kind','address','to','bytes','old_bytes','marker'],'single_threaded':True,'incremental_marking':False,'inline_new':False,'turbo_allocation_folding':False,'collector_overlap_measured':False,'includes_preexisting_objects':False,'physical_memory_measured':False,'active_extent_cap_per_map':64,'map_count_max':5,'stream_byte_cap':1048576,'stdio_buffer_bytes':65536}
SHRINK_HEADER={**HEADER,'schema':'raveldex-gc-extents-varint-v2','gc_tracked_shrink_mode':'pre-move-full-coverage-right-trim-v1'}
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
 def test_explicit_audit_bounds_and_marker_cardinality(self):
  fields=dict(zip(m.METRICS,[8,8,8,0,0]),gc_cycles=0,gc_moves=0,census_objects=0,heap_gc_count_start=0,heap_gc_count_stop=0)
  rows=[(5,0,0,0,0,100),(1,100,0,8,0,0),(5,0,0,8,8,101)]
  raw=literal(rows,fields)
  with tempfile.TemporaryDirectory() as directory:
   p=pathlib.Path(directory)/'literal.rdxgc';p.write_bytes(raw)
   for bound in (256,512,2048,4096,8192):
    r=m.audit(p,bound);self.assertEqual(r['maxStreamMiB'],bound)
    self.assertEqual(r['marks'][100],dict(count=1,firstSequence=1,lastSequence=1))
    self.assertEqual(r['marks'][101]['lastSequence'],3)
   for bound in (0,True,255,16384):
    with self.assertRaises(ValueError):m.audit(p,bound)
 def test_split_overwritten_range_preserves_unmoved_fragments(self):
  rows=[(1,100,0,40,0,0),(8,0,0,40,0,0),(2,300,110,8,0,0),
   (10,100,0,10,0,0),(10,110,0,8,0,0),(10,118,0,22,0,0),(9,0,0,32,40,0),
   (5,0,0,32,40,101)]
  r=self.run_bytes(literal(rows,dict(zip(m.METRICS,[40,40,32,0,8]),gc_cycles=1,gc_moves=1,census_objects=3,heap_gc_count_start=0,heap_gc_count_stop=1)))
  self.assertEqual(r['summary']['occupied_at_stop_bytes'],32)
 def test_forged_overflow_metrics_and_bad_varints_are_rejected(self):
  fields=dict(zip(m.METRICS,[8,8,8,0,0]),gc_cycles=0,gc_moves=0,census_objects=0,heap_gc_count_start=0,heap_gc_count_stop=0)
  raw=literal([(1,2**64-3,0,8,0,0)],fields)
  with self.assertRaises(ValueError):self.run_bytes(raw)
  raw=literal([(1,1,0,2**64-2,0,0),(8,0,0,2**64-2,0,0),(9,0,0,0,2**64-2,0),(1,1,0,8,0,0)],
   dict(zip(m.METRICS,[2**64+6,2**64-2,8,0,2**64-2]),gc_cycles=1,gc_moves=0,census_objects=0,heap_gc_count_start=0,heap_gc_count_stop=1))
  with self.assertRaises(ValueError):self.run_bytes(raw)
  header=json.dumps(HEADER).encode()+b'\n'
  for bad in (b'\x81\0',b'\xff'*10,b'\x81'):
   with self.assertRaises(ValueError):self.run_bytes(header+bad)
 def test_versioned_gc_trim_tail_reuse_frozen_sources_peak_and_census(self):
  # Literal arithmetic: 32 born; trim 12 =>20; moves reuse both released tails.
  # Next 20 born =>40 peak; trim8 =>32; census drops8 =>24; new8 =>32.
  rows=[(1,100,0,16,0,0),(1,200,0,8,0,0),(1,300,0,8,0,0),(8,0,0,32,0,1),
   (3,100,0,8,16,0),(4,100,0,8,0,0),(3,200,0,4,8,0),(4,200,0,4,0,0),
   (5,0,0,20,32,7),(2,300,108,8,0,0),(2,100,400,8,0,0),(2,200,204,4,0,0),
   (10,108,0,8,0,0),(10,400,0,8,0,0),(10,204,0,4,0,0),(9,0,0,20,20,1),
   (6,108,0,8,0,8),(6,204,0,4,0,9),(1,116,0,4,0,0),(1,600,0,16,0,0),
   (8,0,0,40,0,0),(3,600,0,8,16,0),(4,600,0,8,0,0),(2,108,700,8,0,0),
   (10,700,0,8,0,0),(10,400,0,8,0,0),(10,204,0,4,0,0),(10,116,0,4,0,0),
   (9,0,0,24,32,0),(1,108,0,8,0,0),(5,0,0,32,40,101)]
  fields=dict(zip(m.METRICS,[60,40,32,20,8]),gc_cycles=2,gc_moves=4,gc_pre_move_shrinks=3,census_objects=7,heap_gc_count_start=2,heap_gc_count_stop=4)
  result=self.run_bytes(literal(rows,fields,SHRINK_HEADER))
  self.assertEqual([x['monitoredBytes'] for x in result['inspections']],[8,4])
  self.assertEqual(result['summary']['gc_removed_bytes'],8)
 def test_new_gc_trim_requires_explicit_schema_and_exact_method(self):
  rows=[(1,100,0,8,0,0),(8,0,0,8,0,1),(3,100,0,4,8,0),(4,100,0,4,0,0),
   (10,100,0,4,0,0),(9,0,0,4,4,1)]
  fields=dict(zip(m.METRICS,[8,8,4,4,0]),gc_cycles=1,gc_moves=0,gc_pre_move_shrinks=1,census_objects=1,heap_gc_count_start=0,heap_gc_count_stop=1)
  self.assertTrue(self.run_bytes(literal(rows,fields,SHRINK_HEADER))['valid'])
  for count in (0,2,True,None):
   with self.subTest(count=count):
    with self.assertRaises(ValueError):self.run_bytes(literal(rows,{**fields,'gc_pre_move_shrinks':count},SHRINK_HEADER))
  # Original unsupported recording stays invalid and every metric stays null.
  result=self.run_bytes(literal(rows,{**dict.fromkeys(m.METRICS,None),'valid':False,'errors':1}))
  self.assertEqual(result['prefixFailure']['reason'],'Tracked GC shrink')
  with self.assertRaises(ValueError):self.run_bytes(literal(rows,fields))
  for header in ({**HEADER,'gc_tracked_shrink_mode':m.SHRINK_MODE},
                 {**SHRINK_HEADER,'gc_tracked_shrink_mode':'other'},
                 {key:value for key,value in SHRINK_HEADER.items() if key!='gc_tracked_shrink_mode'},
                 {**SHRINK_HEADER,'schema':'raveldex-gc-extents-varint-v3'}):
   with self.subTest(header=header):
    with self.assertRaises(ValueError):self.run_bytes(literal(rows,fields,header))
 def test_new_gc_trim_removed_tail_is_not_a_frozen_monitored_source(self):
  rows=[(1,100,0,16,0,0),(1,200,0,8,0,0),(8,0,0,24,0,1),
   (3,100,0,8,16,0),(4,100,0,8,0,0),(2,108,300,8,0,0),(2,200,108,8,0,0),(2,100,200,8,0,0),
   (10,108,0,8,0,0),(10,200,0,8,0,0),(10,300,0,8,0,0),(9,0,0,16,16,1),
   (6,300,0,8,0,1),(6,108,0,8,0,2),(6,200,0,8,0,3)]
  fields=dict(zip(m.METRICS,[24,24,16,8,0]),gc_cycles=1,gc_moves=3,gc_pre_move_shrinks=1,
   census_objects=3,heap_gc_count_start=0,heap_gc_count_stop=1)
  result=self.run_bytes(literal(rows,fields,SHRINK_HEADER))
  self.assertEqual([x['monitoredBytes'] for x in result['inspections']],[0,8,8])
 def test_new_gc_trim_rejects_partial_malformed_and_overflow(self):
  for address,new,old in ((96,4,12),(104,4,8),(100,8,8),(100,9,8),(100,0,8),(2**64-4,2,8)):
   rows=[(1,100,0,8,0,0),(8,0,0,8,0,1),(3,address,0,new,old,0)]
   with self.subTest(change=(address,new,old)):
    result=self.run_bytes(literal(rows,{**dict.fromkeys(m.METRICS,None),'valid':False,'errors':1},SHRINK_HEADER))
    self.assertIsNotNone(result['prefixFailure'])
    with self.assertRaises(ValueError):self.run_bytes(literal(rows,dict(zip(m.METRICS,[8,8,4,4,0])),SHRINK_HEADER))
 def test_new_gc_trim_phase_is_global_even_for_disjoint_move_census_and_change(self):
  for prior in ((2,500,600,8,0,0),(10,500,0,8,0,0)):
   for address in (100,900):
    rows=[(1,100,0,8,0,0),(8,0,0,8,0,1),prior,(3,address,0,4,8,0)]
    result=self.run_bytes(literal(rows,{**dict.fromkeys(m.METRICS,None),'valid':False,'errors':1},SHRINK_HEADER))
    self.assertIn('after move/census',result['prefixFailure']['reason'])
 def test_new_gc_trim_requires_immediate_matching_update_and_refuses_update_only(self):
  for next_row in ((4,101,0,4,0,0),(4,100,0,3,0,0),(4,100,0,4,8,0),(4,100,1,4,0,0),
                   (4,100,0,4,0,1),(5,0,0,4,8,7),(9,0,0,4,4,1)):
   rows=[(1,100,0,8,0,0),(8,0,0,8,0,1),(3,100,0,4,8,0),next_row]
   result=self.run_bytes(literal(rows,{**dict.fromkeys(m.METRICS,None),'valid':False,'errors':1},SHRINK_HEADER))
   self.assertIn('matching GC size update',result['prefixFailure']['reason'])
  for moved in (False,True):
   rows=[(1,100,0,8,0,0),(8,0,0,8,0,1)]
   if moved:rows.append((2,100,200,8,0,0))
   rows.append((4,200 if moved else 100,0,4,0,0))
   result=self.run_bytes(literal(rows,{**dict.fromkeys(m.METRICS,None),'valid':False,'errors':1},SHRINK_HEADER))
   self.assertIn('GC size update',result['prefixFailure']['reason'])
 def test_new_gc_trim_old_checkpoint_and_census_cannot_double_count_trim(self):
  rows=[(1,100,0,8,0,0),(8,0,0,8,0,1),(3,100,0,4,8,0),(4,100,0,4,0,0),
   (10,100,0,4,0,0),(9,0,0,4,8,1)]
  result=self.run_bytes(literal(rows,{**dict.fromkeys(m.METRICS,None),'valid':False,'errors':1},SHRINK_HEADER))
  self.assertEqual(result['prefixFailure']['reason'],'Invalid GC end')
  rows[-1]=(9,0,0,4,4,1)
  fields=dict(zip(m.METRICS,[8,8,4,4,4]),gc_cycles=1,gc_moves=0,census_objects=1,heap_gc_count_start=0,heap_gc_count_stop=1)
  with self.assertRaises(ValueError):self.run_bytes(literal(rows,fields,SHRINK_HEADER))
 def test_schema_specific_explicit_two_million_extent_cap(self):
  fields=dict(zip(m.METRICS,[8,8,8,0,0]),gc_cycles=0,gc_moves=0,gc_pre_move_shrinks=0,census_objects=0,
   heap_gc_count_start=0,heap_gc_count_stop=0)
  rows=[(1,100,0,8,0,0)]
  self.assertTrue(self.run_bytes(literal(rows,fields,{**SHRINK_HEADER,'active_extent_cap_per_map':2000000}))['valid'])
  self.assertTrue(self.run_bytes(literal(rows,fields,{**HEADER,'active_extent_cap_per_map':1000000}))['valid'])
  for header in ({**SHRINK_HEADER,'active_extent_cap_per_map':2000001},
                 {**SHRINK_HEADER,'active_extent_cap_per_map':3000000},
                 {**HEADER,'active_extent_cap_per_map':1000001},
                 {**HEADER,'active_extent_cap_per_map':2000000},
                 {**SHRINK_HEADER,'active_extent_cap_per_map':True}):
   with self.subTest(header=header):
    with self.assertRaises(ValueError):self.run_bytes(literal(rows,fields,header))
if __name__=='__main__':unittest.main()
