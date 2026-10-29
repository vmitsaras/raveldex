/** Test-side source model and expression generator; no production parser,
 * tokenizer, compiler, evaluator or scorer is imported. */
import {scanPhraseSourceCorpus,sourcePhraseQueryResult} from './phrases.mjs';
export {scanPhraseSourceCorpus as scanSyntaxSourceCorpus};

function referenceQuery(query){
  if(query.kind==='extension'){
    if(query.capability!=='phrases'||query.version!==1)throw Error('Reference fixture unsupported extension');
    return{kind:'phrase',text:query.payload.text,...(query.payload.fields?{fields:query.payload.fields}:{})};
  }
  if(query.kind==='and'||query.kind==='or')return{...query,children:query.children.map(referenceQuery)};
  if(query.kind==='not')return{kind:'not',child:referenceQuery(query.child)};
  return query;
}
export const sourceSyntaxQueryResult=(corpus,query,options={})=>sourcePhraseQueryResult(corpus,referenceQuery(query),options);

/** Construct an expected native tree first, then render it independently.
 * Every Boolean child is parenthesized, so nested same-kind nodes are retained. */
export function generatedSyntaxCases(seed,count=96){
  let state=seed>>>0;
  const pick=maximum=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%maximum;};
  const words=['red','blue','green','fooBar','café','HTTP','absentword','red-blue'];
  const leaf=()=>{
    const mode=pick(5),field=pick(3)===0?[pick(2)?'title':'body']:undefined;
    const fields=field?{fields:field}:{};
    if(mode===0)return{kind:'extension',capability:'phrases',version:1,payload:{text:pick(2)?'red blue':'foo bar',...fields}};
    if(mode===1)return{kind:'group',variants:[{text:pick(2)?'re':'bl',match:'prefix',weight:1}],...fields};
    return{kind:'text',text:words[pick(words.length)],...fields};
  };
  const node=depth=>{if(!depth||pick(4)===0)return leaf();const kind=pick(3);if(kind===0)return{kind:'not',child:node(depth-1)};return{kind:kind===1?'and':'or',children:[node(depth-1),node(depth-1)]};};
  const escape=value=>value.replace(/[\\\s:"()*]/gu,character=>'\\'+character);
  function render(query){
    if(query.kind==='and'||query.kind==='or')return query.children.map(child=>'('+render(child)+')').join(query.kind==='and'?' AND ':' OR ');
    if(query.kind==='not')return'NOT ('+render(query.child)+')';
    const fields=query.fields??query.payload?.fields,scope=fields?fields[0]+':':'';
    if(query.kind==='text')return scope+escape(query.text);
    if(query.kind==='group')return scope+escape(query.variants[0].text)+'*';
    return scope+'"'+query.payload.text.replace(/[\\"]/gu,character=>'\\'+character)+'"';
  }
  return Array.from({length:count},(_,index)=>{const query=node(3);return{id:`seed-${seed.toString(16)}-${index}`,source:render(query),query};});
}
