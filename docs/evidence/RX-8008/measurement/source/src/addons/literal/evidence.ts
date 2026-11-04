import type { AggregationOutput,EvidenceContext,EvidenceResultContext,PreparedEvidence } from '../../core/capabilities/types.js';
import type { CompiledNode } from '../../core/query/compile.js';
import type { Fact } from '../../core/trace/facts.js';
import { bound,invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { ownInspectorOutput } from '../inspector/output.js';
import { requireSourceRoot } from '../phrases/store.js';
import type { SourceRoot } from '../phrases/store.js';
import { validatePayload } from '../metadata/payload.js';
import { parseEvidence,parseLiteral } from './options.js';
import type { CapturedOptions,OwnedEvidence } from './options.js';
import { literalMatches,literalTable } from './scanner.js';
import { literalValues } from './source.js';
import type { LiteralDocument,LiteralEvidenceData,LiteralLeaf,LiteralRange } from './types.js';

type NodeFact=Extract<Fact,{kind:'node'}>;
type DocumentFact=Extract<Fact,{kind:'document'}>;
interface PreparedLeaf extends LiteralLeaf { readonly table:readonly number[] }
const charge=(workUnits=1):WorkStep=>({workUnits});

function* allLeaves(node:CompiledNode,context:EvidenceContext,options:CapturedOptions,path='query',output:PreparedLeaf[]=[]):Generator<WorkStep,readonly PreparedLeaf[]> {
  yield charge(path.length+1);
  if(node.kind==='predicate'&&node.capability==='literal'){
    const payload=parseLiteral(node.payload,context.limits,options.fields);
    yield charge(payload.text.length+payload.fields.reduce((sum,field)=>sum+field.length,0)+1);
    const table=yield* literalTable(payload.text);
    output.push(Object.freeze({path,text:payload.text,fields:payload.fields,table}));
  }else if(node.kind==='and'||node.kind==='or')for(let index=0;index<node.children.length;index++)yield* allLeaves(node.children[index]!,context,options,`${path}.children[${index}]`,output);
  else if(node.kind==='not')yield* allLeaves(node.child,context,options,`${path}.child`,output);
  return output;
}
function* contributing(node:CompiledNode,nodes:ReadonlyMap<string,NodeFact>,selected:ReadonlyMap<string,PreparedLeaf>,path='query',output:PreparedLeaf[]=[]):Generator<WorkStep,readonly PreparedLeaf[]> {
  yield charge(path.length+1);
  const fact=nodes.get(path);
  if(!fact||fact.node!==node.kind)invalid('INCOMPATIBLE_CAPABILITY','literal.evidence.trace');
  if(!fact.matched||node.kind==='not')return output;
  if(node.kind==='predicate'&&node.capability==='literal'){
    if(fact.capability!=='literal'||!selected.has(path))invalid('INCOMPATIBLE_CAPABILITY','literal.evidence.trace');
    output.push(selected.get(path)!);
  }else if(node.kind==='and'||node.kind==='or')for(let index=0;index<node.children.length;index++)yield* contributing(node.children[index]!,nodes,selected,`${path}.children[${index}]`,output);
  return output;
}
function* finish(context:EvidenceContext,finished:EvidenceResultContext,request:OwnedEvidence,options:CapturedOptions,roots:ReadonlyMap<string,SourceRoot>):Generator<WorkStep,AggregationOutput>{
  if(finished.trace.revision!==context.revision||finished.result.revision!==context.revision||finished.trace.model!==finished.result.model||
    finished.trace.analyzer.id!==context.analyzer.id||finished.trace.analyzer.environmentProfile!==context.analyzer.environmentProfile)invalid('REVISION_MISMATCH','literal.evidence.revision');
  const leaves=yield* allLeaves(finished.query,context,options),selected=new Map(leaves.map(leaf=>[leaf.path,leaf]));
  const facts=new Map<string,DocumentFact>(),nodes=new Map<string,Map<string,NodeFact>>();
  for(const fact of finished.trace.facts){
    yield charge(fact.id.length+1);
    if(fact.kind==='document'){if(facts.has(fact.id))invalid('INCOMPATIBLE_CAPABILITY','literal.evidence.trace');facts.set(fact.id,fact);}
    else if(fact.kind==='node'){
      const byPath=nodes.get(fact.id)??new Map<string,NodeFact>();
      if(byPath.has(fact.path))invalid('INCOMPATIBLE_CAPABILITY','literal.evidence.trace');
      yield charge(fact.path.length+1);byPath.set(fact.path,fact);nodes.set(fact.id,byPath);
    }
  }
  const documents:LiteralDocument[]=[];let rangeCount=0;
  for(const id of request.ids){
    yield charge(id.length+1);const fact=facts.get(id);
    if(!fact)invalid('INCOMPATIBLE_CAPABILITY','literal.evidence.trace');
    const eligibility=!fact.exists?'absent':fact.matched?'matched':'excluded';
    const active=eligibility==='matched'?yield* contributing(finished.query,nodes.get(id)??new Map(),selected):[];
    const ranges:LiteralRange[]=[];
    for(const leaf of active)for(const field of leaf.fields){
      yield charge(field.length+1);const root=roots.get(field);
      if(!root)invalid('MISSING_CAPABILITY','literal.evidence.source');
      const values=yield* literalValues(root,id,field,context.limits);
      for(let valueIndex=0;valueIndex<values.length;valueIndex++)for(const step of literalMatches(values[valueIndex]!,leaf.text,leaf.table)){
        yield charge(step.workUnits);
        if(step.match){bound(++rangeCount,request.maxRanges,'literal.evidence.ranges');ranges.push(Object.freeze({leaf:leaf.path,field,valueIndex,start:step.match.start,end:step.match.end}));}
      }
    }
    documents.push(Object.freeze({id,eligibility,ranges:Object.freeze(ranges)}));
  }
  const data:LiteralEvidenceData={kind:'raveldex-literal-evidence-v1',policy:'raw-substring-v1',revision:context.revision,scope:'successful-positive-literal-occurrences',complete:true,
    leaves:leaves.map(({path,text,fields})=>Object.freeze({path,text,fields})),documents};
  return yield* ownInspectorOutput(data,Math.min(options.maxOutputEntries,context.limits.maxAdmissionEntries));
}
export function* prepareLiteralEvidence(context:EvidenceContext,options:CapturedOptions):Generator<WorkStep,PreparedEvidence>{
  yield* validatePayload(context.payload,'INVALID_OPTIONS');
  const request=parseEvidence(context.payload,context.limits,options),roots=new Map<string,SourceRoot>();
  for(const field of options.fields){yield charge(field.length+1);roots.set(field,requireSourceRoot(context.state(`source:${field}`),field,context.revision,context.analyzer));}
  return Object.freeze({finish:(finished:EvidenceResultContext)=>finish(context,finished,request,options,roots)});
}
