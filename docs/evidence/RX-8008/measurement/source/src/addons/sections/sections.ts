import type { AddonRegistration, EvidenceContext, PayloadContext } from '../../core/capabilities/types.js';
import { Admission, has, keysOnly, ownArray, ownObject } from '../../core/contracts/data.js';
import { invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { Limits } from '../../core/limits/limits.js';
import { buildMatchEvidence } from '../evidence/builder.js';
import type { EvidencePresentation, PreparedPresentation } from '../evidence/builder.js';
import { parseMatchRequest } from '../evidence/options.js';
import type { CapturedMatchOptions, OwnedMatchRequest } from '../evidence/options.js';
import type { MatchDocument, MatchEvidenceOptions, MatchRange } from '../evidence/types.js';
import { captureMetadataPayload } from '../metadata/payload.js';
import { requireSourceRoot } from '../phrases/store.js';
import type { SourceRoot } from '../phrases/store.js';
import { floor, lower, segmenter, valuesFor } from '../snippets/snippets.js';
import type { ExpandedRange, ValueProjection } from '../snippets/snippets.js';
import type { Snippet, SnippetOmissions } from '../snippets/types.js';
import type { SectionEvidenceOptions, SectionEvidenceRequest, SectionPreview } from './types.js';
import { compareSections, sectionField, sectionInteger } from './validation.js';

const charge=(workUnits=1):WorkStep=>({workUnits});
type Descriptor=SectionEvidenceRequest['sections'][number];
interface Request extends OwnedMatchRequest { readonly sections: readonly Descriptor[]; readonly maxPreviews: number }
interface Caps { readonly codeUnits: number; readonly highlights: number }
function parse(input:unknown, limits:Limits, options:CapturedMatchOptions):Request {
  const admission=new Admission(limits.maxAdmissionEntries), raw=ownObject(input,'INVALID_OPTIONS','sections.request',admission);
  keysOnly(raw,['ids','expectedRevision','sections','maxPreviews','fields','maxFacts','maxRanges'],'INVALID_OPTIONS','sections.request');
  const base:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
  for(const key of ['ids','expectedRevision','fields','maxFacts','maxRanges'])if(has(raw,key))base[key]=raw[key];
  const request=parseMatchRequest(base,limits,options);
  if(request.ids.length!==1 || request.expectedRevision===undefined)invalid('INVALID_OPTIONS','sections.request');
  const sections=ownArray(raw.sections,64,'INVALID_OPTIONS','sections.descriptors',admission).map((input,index)=>{
    const section=ownObject(input,'INVALID_OPTIONS','sections.descriptor',admission);
    keysOnly(section,['sectionIndex','field','valueIndex','start','end'],'INVALID_OPTIONS','sections.descriptor');
    const field=sectionField(section.field), sectionIndex=sectionInteger(section.sectionIndex,63), start=sectionInteger(section.start), end=sectionInteger(section.end);
    if(sectionIndex!==index || !request.fields.includes(field) || start>=end)invalid('INVALID_OPTIONS','sections.descriptor');
    return Object.freeze({sectionIndex,field,valueIndex:sectionInteger(section.valueIndex),start,end});
  });
  for(let index=1;index<sections.length;index++){
    const a=sections[index-1]!, b=sections[index]!;
    if(compareSections(a,b)>=0 || a.field===b.field&&a.valueIndex===b.valueIndex&&a.end>b.start)invalid('INVALID_OPTIONS','sections.descriptors');
  }
  return Object.freeze({...request,sections:Object.freeze(sections),maxPreviews:has(raw,'maxPreviews')?sectionInteger(raw.maxPreviews,3,1):3});
}
function* excerpt(value:ValueProjection, section:Descriptor, ranges:readonly ExpandedRange[], caps:Caps):Generator<WorkStep,{snippet:Snippet|null;snippetOmissions:SnippetOmissions}> {
  let start=section.start,end=section.end, available=false;
  if(end-start<=caps.codeUnits)available=true;
  else {
    for(const range of ranges){
      yield charge();if(range.unavailable)continue;
      start=value.boundaries[yield* lower(value.boundaries,Math.max(section.start,range.start-40))]!;
      end=value.boundaries[yield* floor(value.boundaries,Math.min(section.end,start+caps.codeUnits))]!;
      if(end<range.end){start=value.boundaries[yield* lower(value.boundaries,range.end-caps.codeUnits)]!;end=value.boundaries[yield* floor(value.boundaries,Math.min(section.end,start+caps.codeUnits))]!;}
      if(start<section.start||start>range.start||end<range.end||end>section.end||end-start>caps.codeUnits)invalid('INTERNAL_ERROR','sections.window');
      available=true;break;
    }
  }
  const unions:{start:number;end:number}[]=[];
  if(available)for(const range of ranges){
    yield charge();if(range.unavailable||range.start<start||range.end>end)continue;
    const prior=unions[unions.length-1];if(prior&&range.start<=prior.end)prior.end=Math.max(prior.end,range.end);else unions.push({start:range.start,end:range.end});
  }
  const marks=unions.slice(0,caps.highlights);
  yield charge(marks.length+1);
  let unshownMatches=0,windowLimit=false,highlightLimit=false,matchTooLong=0,graphemeTooLong=0;
  for(const range of ranges){
    yield charge();let shown=false;
    for(const mark of marks){yield charge();if(mark.start<=range.start&&mark.end>=range.end){shown=true;break;}}
    if(shown)continue;unshownMatches++;
    if(range.unavailable==='match-too-long')matchTooLong++;
    else if(range.unavailable==='grapheme-too-long')graphemeTooLong++;
    else if(available&&range.start>=start&&range.end<=end)highlightLimit=true;
    else windowLimit=true;
  }
  windowLimit = unshownMatches > matchTooLong + graphemeTooLong;
  const snippetOmissions={unshownMatches,windowLimit,highlightLimit,matchTooLong,graphemeTooLong};
  if(!available)return {snippet:null,snippetOmissions};
  yield charge(end-start+marks.length+1);
  return {snippet:{field:value.field,valueIndex:value.valueIndex,start,end,text:value.source.slice(start,end),
    highlights:marks.map(mark=>({start:mark.start-start,end:mark.end-start})),omittedBefore:start>section.start,omittedAfter:end<section.end},snippetOmissions};
}
function* project(context:EvidenceContext, roots:ReadonlyMap<string,SourceRoot>, fields:readonly string[], request:Request, id:string, ranges:readonly MatchRange[], eligibility:MatchDocument['eligibility'], host:Intl.Segmenter,caps:Caps):Generator<WorkStep,Readonly<Record<string,unknown>>> {
  const zero={omittedSections:0,unmappedRanges:0,boundaryRanges:0};
  if(eligibility!=='matched'){
    yield charge();if(ranges.length)invalid('INCOMPATIBLE_CAPABILITY','sections.eligibility');return {sectionPreviews:[],sectionOmissions:zero};
  }
  if(!request.sections.length){yield charge();return {sectionPreviews:[],sectionOmissions:zero};}
  const values=yield* valuesFor(context,roots,fields,id,ranges,host,{...caps,windows:1},request.sections);
  const byField=new Map<string,Map<number,ValueProjection>>();
  for(const value of values){yield charge(value.field.length+1);let field=byField.get(value.field);if(!field){field=new Map();byField.set(value.field,field);}field.set(value.valueIndex,value);}
  for(const section of request.sections){
    yield charge(section.field.length+1);
    const value=byField.get(section.field)?.get(section.valueIndex);
    if(!value||section.end>value.source.length)invalid('INVALID_OPTIONS','sections.source');
    const a=yield* lower(value.boundaries,section.start),b=yield* lower(value.boundaries,section.end);
    if(value.boundaries[a]!==section.start||value.boundaries[b]!==section.end)invalid('INVALID_OPTIONS','sections.graphemes');
  }
  const contained:ExpandedRange[][]=request.sections.map(()=>[]);
  yield charge(contained.length+1);let unmappedRanges=0,boundaryRanges=0;
  for(const value of values)for(const range of value.ranges){
    let covered=false,intersects=false;
    for(let index=0;index<request.sections.length;index++){
      const section=request.sections[index]!;yield charge(section.field.length+range.range.field.length+1);
      if(section.field!==value.field||section.valueIndex!==value.valueIndex)continue;
      if(section.start<=range.range.start&&section.end>=range.range.end){contained[index]!.push(range);covered=true;}
      else if(section.start<range.range.end&&section.end>range.range.start)intersects=true;
    }
    if(!covered){if(intersects)boundaryRanges++;else unmappedRanges++;}
  }
  const sectionPreviews:SectionPreview[]=[];let qualifying=0;
  for(let index=0;index<request.sections.length;index++){
    yield charge();if(!contained[index]!.length)continue;qualifying++;
    if(sectionPreviews.length>=request.maxPreviews)continue;
    const section=request.sections[index]!, value=byField.get(section.field)!.get(section.valueIndex)!;
    const preview=yield* excerpt(value,section,contained[index]!,caps);sectionPreviews.push({sectionIndex:section.sectionIndex,...preview});
  }
  return {sectionPreviews,sectionOmissions:{omittedSections:qualifying-sectionPreviews.length,unmappedRanges,boundaryRanges}};
}
function presentation(caps:Caps):EvidencePresentation {
  return Object.freeze({capability:'section-evidence',workerOptions:Object.freeze({...caps}),maxSerializedBytes:262_144,
    parse,
    capture:(input:unknown,context:PayloadContext,options:CapturedMatchOptions)=>{
      const captured=captureMetadataPayload(input,context,'INVALID_OPTIONS');
      return Object.freeze({value:parse(captured.value,context.limits,options),codeUnits:captured.codeUnits});
    },
    prepare:function* (context:EvidenceContext,fields:readonly string[]):Generator<WorkStep,PreparedPresentation>{
      const roots=new Map<string,SourceRoot>();
      for(const field of fields){yield charge(field.length+1);roots.set(field,requireSourceRoot(context.state(`source:${field}`),field,context.revision,context.analyzer));}
      const host=segmenter(), request=context.payload as Request;
      return Object.freeze({project:(id:string,ranges:readonly MatchRange[],eligibility:MatchDocument['eligibility'])=>project(context,roots,fields,request,id,ranges,eligibility,host,caps)});
    },
  });
}
/** Explicit source-backed section presentation; no retained maps or side index. */
export function createSectionEvidence(options:SectionEvidenceOptions):AddonRegistration {
  const data=ownObject(options,'INVALID_OPTIONS','sections.options',new Admission(16_384));
  keysOnly(data,['fields','id','maxFacts','maxRanges','maxWorkUnits','maxOutputEntries','maxCodeUnits','maxHighlights'],'INVALID_OPTIONS','sections.options');
  const caps=Object.freeze({codeUnits:has(data,'maxCodeUnits')?sectionInteger(data.maxCodeUnits,240,1):240,highlights:has(data,'maxHighlights')?sectionInteger(data.maxHighlights,32,1):32});
  const base:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
  for(const key of ['fields','id','maxFacts','maxRanges','maxWorkUnits','maxOutputEntries'])if(has(data,key))base[key]=data[key];
  return buildMatchEvidence(base as unknown as MatchEvidenceOptions,presentation(caps));
}
