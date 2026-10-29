/** Independent full-source English reference. No production analyzer, stemmer,
 * query compiler, dictionary or scorer is imported. Morphology follows the
 * original 1980 rule tables at https://snowballstem.org/algorithms/porter/stemmer.html
 * using regex measures, rather than the production resumable scanner. */
import { originalSourceTokens, sourceQueryResult } from './query.mjs';

const vowel = /[aeiouy]/;
const measure = value => (value.match(/[aeiouy][^aeiouy]/g) ?? []).length;
const short = value => /[^aeiouy][aeiouy][^aeiouywxY]$/.test(value);
const double = value => /([^aeiouy])\1$/.test(value);
const step2 = { ational:'ate',tional:'tion',enci:'ence',anci:'ance',izer:'ize',abli:'able',alli:'al',entli:'ent',eli:'e',ousli:'ous',ization:'ize',ation:'ate',ator:'ate',alism:'al',iveness:'ive',fulness:'ful',ousness:'ous',aliti:'al',iviti:'ive',biliti:'ble' };
const step3 = { icate:'ic',ative:'',alize:'al',iciti:'ic',ical:'ic',ful:'',ness:'' };
const step4 = ['al','ance','ence','er','ic','able','ible','ant','ement','ment','ent','ion','ou','ism','ate','iti','ous','ive','ize'];
const longest = (word, suffixes) => [...suffixes].sort((a,b)=>b.length-a.length || (a<b?-1:1)).find(suffix=>word.endsWith(suffix));
export function sourceEnglishStem(term) {
  if (!/^[a-z]+$/.test(term) || term.length <= 2) return term;
  let word = term[0] === 'y' ? 'Y'+term.slice(1) : term;
  for (let i=1; i<word.length; i++) if (word[i]==='y' && vowel.test(word[i-1])) word=word.slice(0,i)+'Y'+word.slice(i+1);
  const plural=longest(word,['sses','ies','ss','s']);
  if (plural==='sses') word=word.slice(0,-2);
  else if (plural==='ies') word=word.slice(0,-2);
  else if (plural==='s') word=word.slice(0,-1);
  const participle=longest(word,['eed','ed','ing']);
  if (participle==='eed') { if (measure(word.slice(0,-3))>0) word=word.slice(0,-1); }
  else if (participle && vowel.test(word.slice(0,-participle.length))) {
    word=word.slice(0,-participle.length);
    if (/(at|bl|iz)$/.test(word)) word+='e';
    else if (double(word) && !/[lsz]$/.test(word)) word=word.slice(0,-1);
    else if (measure(word)===1 && short(word)) word+='e';
  }
  if (/[yY]$/.test(word) && vowel.test(word.slice(0,-1))) word=word.slice(0,-1)+'i';
  for (const table of [step2,step3]) {
    const suffix=longest(word,Object.keys(table));
    if (suffix && measure(word.slice(0,-suffix.length))>0) word=word.slice(0,-suffix.length)+table[suffix];
  }
  const suffix=longest(word,step4);
  if (suffix && measure(word.slice(0,-suffix.length))>1 && (suffix!=='ion'||/[st]$/.test(word.slice(0,-suffix.length)))) word=word.slice(0,-suffix.length);
  if (word.endsWith('e')) {
    const base=word.slice(0,-1), m=measure(base);
    if (m>1 || m===1 && !short(base)) word=base;
  }
  if (measure(word)>1 && /ll$/.test(word)) word=word.slice(0,-1);
  return word.replaceAll('Y','y');
}

export function englishSourceTokens(value, valueIndex=0) {
  return originalSourceTokens(value).map((token,position)=>({ ...token, term:sourceEnglishStem(token.term),valueIndex,position }));
}
/** Source frequencies/statistics built directly, never by re-analyzing stems. */
export function scanEnglishSourceCorpus(records,schema) {
  const names=Object.keys(schema.text).sort(), statistics=new Map(names.map(name=>[name,{boost:schema.text[name].boost??1,population:0,totalLength:0,documentFrequencies:new Map()}]));
  const sourceValues=new Map();
  const documents=records.map(record=>{
    const fields=new Map(), sources=new Map();
    for(const name of names){
      const raw=record.text[name],values=raw===undefined?[]:typeof raw==='string'?[raw]:raw;
      const perValue=values.map((value,index)=>englishSourceTokens(value,index));sources.set(name,perValue);
      const tokens=perValue.flat(), frequencies=new Map();
      for(const token of tokens) frequencies.set(token.term,(frequencies.get(token.term)??0)+1);
      fields.set(name,{length:tokens.length,frequencies});
      const field=statistics.get(name);
      if(tokens.length){field.population++;field.totalLength+=tokens.length;for(const term of frequencies.keys())field.documentFrequencies.set(term,(field.documentFrequencies.get(term)??0)+1);}
    }
    sourceValues.set(record.id,sources);
    return {id:record.id,metadata:record.metadata??{},fields};
  });
  return {names,statistics,documents,sourceValues};
}
// The existing source Boolean/BM25 oracle receives raw spellings for passthrough
// compatibility terms and ASCII stems for transformed words; it never stems.
function lexical(value) {
  return originalSourceTokens(value).map(token=>/^[a-z]+$/.test(token.term)?sourceEnglishStem(token.term):value.slice(token.start,token.end)).join(' ');
}
export function sourceEnglishQuery(query) {
  if(typeof query==='string')return lexical(query);
  switch(query.kind){
    case 'text':return {...query,text:lexical(query.text)};
    case 'group':return {...query,variants:query.variants.map(variant=>({...variant,text:lexical(variant.text)}))};
    case 'and':case 'or':return {...query,children:query.children.map(sourceEnglishQuery)};
    case 'not':return {...query,child:sourceEnglishQuery(query.child)};
    case 'all':case 'none':case 'eq':return query;
    default:throw Error('Unsupported English oracle query');
  }
}
const containsPhrase=query=>typeof query==='object' && (query.kind==='phrase'||query.children?.some(containsPhrase)||query.child&&containsPhrase(query.child));
function lowerPhraseForDocument(query,corpus,id) {
  if(typeof query==='string')return query;
  if(query.kind==='phrase'){
    const wanted=englishSourceTokens(query.text).map(token=>token.term),fields=query.fields??corpus.names;
    const matches=wanted.length>0&&fields.some(field=>corpus.sourceValues.get(id).get(field).some(tokens=>tokens.some((_,start)=>wanted.every((term,offset)=>tokens[start+offset]?.term===term))));
    return matches?{kind:'text',text:query.text,fields}:{kind:'none'};
  }
  if(query.children)return {...query,children:query.children.map(child=>lowerPhraseForDocument(child,corpus,id))};
  if(query.child)return {...query,child:lowerPhraseForDocument(query.child,corpus,id)};
  return query;
}
export function sourceEnglishResult(corpus,query,options={}) {
  if(!containsPhrase(query))return sourceQueryResult(corpus,sourceEnglishQuery(query),options);
  const hits=[];
  // Whole corpus statistics stay fixed. Each source-qualified phrase branch is
  // lowered for one document before independent Boolean/scoring participation.
  for(const document of corpus.documents){
    const lowered=sourceEnglishQuery(lowerPhraseForDocument(query,corpus,document.id));
    const result=sourceQueryResult(corpus,lowered,{limit:corpus.documents.length});
    const selected=result.hits.find(hit=>hit.id===document.id);if(selected)hits.push(selected);
  }
  hits.sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0));
  return {total:hits.length,hits:hits.slice(options.offset??0,(options.offset??0)+(options.limit??20))};
}
