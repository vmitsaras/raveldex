import type { AddonRegistration,PreparedSourcePredicate,SourcePredicateContext } from '../../core/capabilities/types.js';
import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { WorkStep } from '../../core/index/directory.js';
import { invalid } from '../../core/errors/error.js';
import { requireSourceRoot } from '../phrases/store.js';
import { validatePayload } from '../metadata/payload.js';
import { captureOptions,captureLiteral,captureEvidence,parseLiteral } from './options.js';
import type { CapturedOptions,OwnedEvidence } from './options.js';
import { literalMatches,literalTable } from './scanner.js';
import { literalValues } from './source.js';
import { prepareLiteralEvidence } from './evidence.js';
import type { LiteralOptions } from './types.js';

export type { LiteralOptions,LiteralPayload,LiteralEvidenceRequest,LiteralEvidenceData,LiteralRange,LiteralLeaf,LiteralDocument } from './types.js';
export const LITERAL_POLICY='raw-substring-v1' as const;
function* prepare(context:SourcePredicateContext,options:CapturedOptions):Generator<WorkStep,PreparedSourcePredicate>{
  if(context.capability!=='literal')invalid('INCOMPATIBLE_CAPABILITY','literal.capability');
  yield* validatePayload(context.payload,'INVALID_QUERY');
  const payload=parseLiteral(context.payload,context.limits,options.fields),roots=new Map(payload.fields.map(field=>[field,requireSourceRoot(context.state(`source:${field}`),field,context.revision,context.analyzer)]));
  yield {workUnits:payload.fields.reduce((sum,field)=>sum+field.length,0)+1};
  const table=yield* literalTable(payload.text);
  return Object.freeze({
    *test(id:string):Generator<WorkStep,boolean>{
      for(const field of payload.fields){
        const values=yield* literalValues(roots.get(field)!,id,field,context.limits);
        for(const value of values)for(const step of literalMatches(value,payload.text,table)){yield {workUnits:step.workUnits};if(step.match)return true;}
      }
      return false;
    },
  });
}
/** Explicit complete raw substring qualification and optional factual ranges. */
export function createLiteral(input:LiteralOptions):AddonRegistration{
  const options=captureOptions(input);
  return Object.freeze({
    manifest:Object.freeze({id:options.id,version:'0.1.0',contractVersion:1,roles:Object.freeze(['leaf-refinement','evidence'] as const),provides:Object.freeze([Object.freeze({id:'literal',contractVersion:1})]),
      requires:Object.freeze(options.fields.map(field=>Object.freeze({id:`source:${field}`,contractVersion:1}))),dataRequirements:Object.freeze({fields:options.fields,source:true,positions:false,offsets:false,metadata:false}),
      indexEffect:'none',rebuildPolicy:'new-index',execution:Object.freeze({direct:true,worker:true,workerRegistration:workerIdentity('literal',{...options,policy:LITERAL_POLICY,normalization:'none',case:'sensitive',overlaps:true,ranking:'zero-lexical-groups'})}),
      limits:Object.freeze({maxPayloadCodeUnits:DEFAULT_LIMITS.maxQueryCodeUnits,maxWorkUnits:options.maxWorkUnits,maxRetainedEntries:0,maxOutputEntries:options.maxOutputEntries}),
      costs:Object.freeze({importedCode:'Native bounded KMP over explicitly retained original source; no tokenizer, regex engine, infix accelerator or scoring model.',retainedRepresentation:'Immutable options/worker identity only; no corpus side index or cache. Explicit source provider retains its separately declared original fields.',transientWork:'One bounded needle prefix table per leaf; operation-scoped source cursors and optional selected original ranges under the shared module/search/output budgets.',externalResources:'none'})}),
    sourcePredicate:Object.freeze({kind:'source-substring' as const,capture:(value:unknown,context:import('../../core/capabilities/types.js').PayloadContext)=>captureLiteral(value,context,options),prepare:(context:SourcePredicateContext)=>prepare(context,options)}),
    evidence:Object.freeze({capture:(value:unknown,context:import('../../core/capabilities/types.js').PayloadContext)=>captureEvidence(value,context,options),
      select:(value:unknown)=>{const request=value as OwnedEvidence;return Object.freeze({ids:request.ids,maxFacts:request.maxFacts,...(request.expectedRevision!==undefined?{expectedRevision:request.expectedRevision}:{})});},
      prepare:(context:import('../../core/capabilities/types.js').EvidenceContext)=>prepareLiteralEvidence(context,options)}),
  });
}
