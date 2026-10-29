/** Independent raw-substring source oracle for RX-A060. The matcher uses simple
 * complete source slicing at code-point boundaries, never production matching,
 * analysis, dictionary/candidate generation, query compilation or scoring. Native
 * lexical/phrase truth comes only from the earlier independent source oracle. */
import {scanPhraseSourceCorpus,sourcePhraseQueryResult} from './phrases.mjs';

const ordinal=(a,b)=>a<b?-1:a>b?1:0;
function wellFormed(text){
  if(typeof text!=='string')throw new TypeError('Reference text must be a string');
  for(let i=0;i<text.length;i++){
    const code=text.charCodeAt(i);
    if(code>=0xd800&&code<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw new RangeError('Malformed reference UTF-16');}
    else if(code>=0xdc00&&code<=0xdfff)throw new RangeError('Malformed reference UTF-16');
  }
}
/** Empty needles are invalid, including in failed/negative branches. Matching is
 * raw, case-sensitive and overlapping; a code point need not be a grapheme. */
export function literalSourceRanges(value,text){
  wellFormed(value);wellFormed(text);if(!text.length)throw new RangeError('Empty reference literal');
  const ranges=[];
  for(let start=0;start+text.length<=value.length;){
    if(value.slice(start,start+text.length)===text)ranges.push({start,end:start+text.length});
    start+=value.codePointAt(start)>0xffff?2:1;
  }
  return ranges;
}
export function scanLiteralSourceCorpus(records,schema){
  const model=scanPhraseSourceCorpus(records,schema),rawValues=new Map();
  for(const record of records){const fields=new Map();for(const field of model.names){const raw=record.text[field];fields.set(field,raw===undefined?[]:typeof raw==='string'?[raw]:raw);for(const value of fields.get(field))wellFormed(value);}rawValues.set(record.id,fields);}
  return{...model,rawValues};
}
const names=(model,fields)=>[...(fields??model.names)].sort(ordinal);
function literalMatches(model,id,node){return names(model,node.fields).some(field=>model.rawValues.get(id).get(field).some(value=>literalSourceRanges(value,node.text).length>0));}
function prepare(raw,model){
  if(typeof raw==='string')return raw;
  if(raw.kind==='literal'){wellFormed(raw.text);if(!raw.text.length)throw new RangeError('Empty reference literal');for(const field of names(model,raw.fields))if(!model.names.includes(field))throw new RangeError('Undeclared reference field');return raw;}
  if(raw.kind==='and'||raw.kind==='or')return{...raw,children:raw.children.map(child=>prepare(child,model))};
  if(raw.kind==='not')return{...raw,child:prepare(raw.child,model)};
  return raw;
}
function lower(model,query,id){
  if(typeof query==='string')return query;
  if(query.kind==='literal')return{kind:literalMatches(model,id,query)?'all':'none'};
  if(query.kind==='and'||query.kind==='or')return{...query,children:query.children.map(child=>lower(model,child,id))};
  if(query.kind==='not')return{...query,child:lower(model,query.child,id)};
  return query;
}
/** A successful literal is a zero-score all leaf for that document. Statistics
 * remain full-corpus, so successful native lexical groups keep their own BM25. */
export function sourceLiteralQueryResult(model,rawQuery,options={}){
  const query=prepare(rawQuery,model),hits=[],participation=new Map();
  for(const document of model.documents){const actual=sourcePhraseQueryResult({...model,documents:[document]},lower(model,query,document.id),{limit:1});if(!actual.total)continue;hits.push(actual.hits[0]);participation.set(document.id,actual.participation.get(document.id));}
  hits.sort((a,b)=>b.score-a.score||ordinal(a.id,b.id));const offset=options.offset??0,limit=options.limit??20;
  return{total:hits.length,hits:hits.slice(offset,offset+limit),participation};
}
function descriptors(model,query,path='query',out=[]){
  if(typeof query==='string')return out;
  if(query.kind==='literal')out.push({path,text:query.text,fields:names(model,query.fields)});
  else if(query.kind==='and'||query.kind==='or')query.children.forEach((child,index)=>descriptors(model,child,`${path}.children[${index}]`,out));
  else if(query.kind==='not')descriptors(model,query.child,`${path}.child`,out);
  return out;
}
function positive(model,query,document,path='query'){
  if(typeof query==='object'&&query.kind==='literal'){const matched=literalMatches(model,document.id,query);return{matched,leaves:matched?[{path,text:query.text,fields:names(model,query.fields)}]:[]};}
  if(typeof query==='object'&&query.kind==='not')return{matched:!positive(model,query.child,document,`${path}.child`).matched,leaves:[]};
  if(typeof query==='object'&&(query.kind==='and'||query.kind==='or')){
    const children=query.children.map((child,index)=>positive(model,child,document,`${path}.children[${index}]`));
    const matched=query.kind==='and'?children.every(child=>child.matched):children.some(child=>child.matched);
    return{matched,leaves:matched?children.flatMap(child=>child.matched?child.leaves:[]):[]};
  }
  return{matched:sourcePhraseQueryResult({...model,documents:[document]},query,{limit:1}).total>0,leaves:[]};
}
/** Stable descriptors include every literal path; ranges include only positive
 * literal leaves surviving matched parents, never negative or failed branches. */
export function sourceLiteralEvidence(model,rawQuery,ids,revision=1){
  const query=prepare(rawQuery,model),leaves=descriptors(model,query),documents=[];
  for(const id of ids){const document=model.documents.find(row=>row.id===id);if(!document){documents.push({id,eligibility:'absent',ranges:[]});continue;}
    const result=positive(model,query,document),ranges=[];
    for(const leaf of result.leaves)for(const field of leaf.fields)model.rawValues.get(id).get(field).forEach((value,valueIndex)=>{for(const span of literalSourceRanges(value,leaf.text))ranges.push({leaf:leaf.path,field,valueIndex,...span});});
    documents.push({id,eligibility:result.matched?'matched':'excluded',ranges});
  }
  return{kind:'raveldex-literal-evidence-v1',policy:'raw-substring-v1',revision,scope:'successful-positive-literal-occurrences',complete:true,leaves,documents};
}
