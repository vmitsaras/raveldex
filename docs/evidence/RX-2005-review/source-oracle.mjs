import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createRaveldex } from '../../../dist/index.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createPhrases } from '../../../dist/addons/phrases/mixed.js';

// Expected token terms are literal facts. Source coordinates are accumulated
// while independently assembling source, never via production analysis.
const words = [ ['RED','red'], ['blue','blue'], ['green','green'], ['cafe\u0301','café'], ['ﬁle','file'], ['ＦＯＯ','foo'], ['𐐀𐐁','𐐨𐐩'], ['½','1⁄2'], ['İ','i\u0307'] ];
const separators = [' ', '—', '👩🏽‍💻', '\n', '🇬🇷', '!!!'];
let seed=0x552005;
const random=n=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed%n; };
const records=[], tokens=new Map();
for(let index=0;index<24;index++) {
  const id=`r${String(index).padStart(2,'0')}`, text={}, list=[];
  for(const field of ['body','title']) {
    if(random(7)===0)continue;
    const values=[];
    for(let valueIndex=0;valueIndex<1+random(3);valueIndex++) {
      let source=valueIndex===1?'👩🏽‍💻':'';
      for(let position=0,count=random(7);position<count;position++) {
        if(position)source+=separators[random(separators.length)];
        const [raw,term]=words[random(words.length)],start=source.length;
        source+=raw;
        list.push({field,valueIndex,position,start,end:source.length,term});
      }
      source+=' <img src=x onerror=evil()> &';
      // The unsafe suffix adds unrelated tokens after the known query lexemes.
      values.push(source);
    }
    text[field]=values;
  }
  records.push({id,text,metadata:{active:index%2===0}});tokens.set(id,list);
}
const fieldList=q=>q.fields??['body','title'];
const leaf=(word,fields)=>({kind:'text',text:words[word][0],fields});
const phrase=(a,b,fields)=>({kind:'extension',capability:'phrases',version:1,payload:{text:`${words[a][0]} ${words[b][0]}`,fields}});
const queries=[{kind:'all'},{kind:'none'},{kind:'eq',field:'active',value:true}];
for(let index=0;index<49;index++) {
  const a=random(words.length),b=random(words.length),fields=random(2)?['title']:['body','title'];
  const left=leaf(a,fields),right=phrase(a,b,fields);
  switch(index%7) {
    case 0:queries.push(left);break;
    case 1:queries.push(right);break;
    case 2:queries.push({kind:'or',children:[right,leaf(b,['body'])]});break;
    case 3:queries.push({kind:'or',children:[{kind:'and',children:[left,leaf(b,fields),{kind:'text',text:'absentterm',fields}]},right]});break;
    case 4:queries.push({kind:'and',children:[left,{kind:'not',child:leaf(b,fields)}]});break;
    case 5:queries.push({kind:'not',child:{kind:'not',child:right}});break;
    case 6:queries.push({kind:'group',fields,variants:[{text:words[a][0],match:'exact'},{text:'fi',match:'prefix',weight:0.1}]});break;
  }
}
// Recover terms by exact literal lookup rather than normalization/tokenization.
const termOf=raw=>words.find(([word])=>word===raw)?.[1]??raw;
const key=r=>JSON.stringify([r.field,r.valueIndex,r.position]);
function evaluate(q,record) {
  const all=tokens.get(record.id),selected=fieldList(q);
  if(q.kind==='all')return {matched:true,ranges:[]};
  if(q.kind==='none')return {matched:false,ranges:[]};
  if(q.kind==='eq')return {matched:record.metadata[q.field]===q.value,ranges:[]};
  if(q.kind==='not')return {matched:!evaluate(q.child,record).matched,ranges:[]};
  if(q.kind==='and'||q.kind==='or') {
    const children=q.children.map(child=>evaluate(child,record));
    const matched=q.kind==='and'?children.every(c=>c.matched):children.some(c=>c.matched);
    return {matched,ranges:matched?children.filter(c=>c.matched).flatMap(c=>c.ranges):[]};
  }
  if(q.kind==='extension') {
    const terms=q.payload.text.split(' ').map(termOf),marks=[];
    for(const token of all) {
      if(!(q.payload.fields??['body','title']).includes(token.field))continue;
      const run=terms.map((_,offset)=>all.find(other=>other.field===token.field&&other.valueIndex===token.valueIndex&&other.position===token.position+offset));
      if(run.every((other,offset)=>other?.term===terms[offset]))marks.push(...run);
    }
    return {matched:marks.length>0,ranges:marks};
  }
  const ranges=all.filter(t=>selected.includes(t.field)&&(q.kind==='text'?t.term===termOf(q.text):q.variants.some(v=>v.match==='prefix'?t.term.startsWith(termOf(v.text)):t.term===termOf(v.text))));
  return {matched:ranges.length>0,ranges};
}
const plain=value=>JSON.parse(JSON.stringify(value));
let comparisons=0,sourceSliceChecks=0,snippetChecks=0,omissionChecks=0;
const caps={maxSnippets:2,maxCodeUnits:40,maxHighlights:2};
for(const strategy of ['source','offsets','mixed']) for(const snippets of [false,true]) {
  const fields={body:strategy==='source'?'source':'offsets',title:strategy==='offsets'?'offsets':'source'};
  const source=Object.keys(fields).filter(field=>snippets||fields[field]==='source');
  const offsets=Object.keys(fields).filter(field=>fields[field]==='offsets');
  const phrases=strategy==='source'?createSourcePhrases({fields:['body','title']}):strategy==='offsets'?createPositionPhrases({fields:['body','title']}):createPhrases({fields:{body:'positions',title:'source'}});
  const capability=snippets?'snippets':'match-evidence';
  const addons=[...(source.length?[createSourceProvider({fields:source})]:[]),...(offsets.length?[createPositionProvider({fields:offsets,offsets})]:[]),phrases,snippets?createSnippetEvidence({fields,...caps}):createMatchEvidence({fields})];
  const engine=createRaveldex({schema:{text:{body:{},title:{}},metadata:{active:{type:'boolean'}}},addons});
  await engine.addMany(records);
  for(const query of queries) {
    const result=await engine.search(query,{limit:0,extensions:{[capability]:{ids:['absent',...records.map(r=>r.id)]}}});
    const data=result.extensions[capability];
    let total=0;
    for(const doc of data.documents) {
      const record=records.find(r=>r.id===doc.id);
      if(!record){assert.equal(doc.eligibility,'absent');assert.deepEqual(plain(doc.ranges),[]);continue;}
      const expectation=evaluate(query,record),unique=new Map(expectation.ranges.map(r=>[key(r),r]));
      const expected=[...unique.values()].sort((a,b)=>a.field<b.field?-1:a.field>b.field?1:a.valueIndex-b.valueIndex||a.position-b.position);
      assert.equal(doc.eligibility,expectation.matched?'matched':'excluded',JSON.stringify(query));
      assert.deepEqual(plain(doc.ranges),expected,JSON.stringify({strategy,snippets,query,id:doc.id}));
      if(expectation.matched)total++;
      for(const range of doc.ranges){const source=record.text[range.field][range.valueIndex];assert.equal(source.slice(range.start,range.end).normalize('NFKC').toLowerCase(),range.term);sourceSliceChecks++;}
      if(snippets) {
        assert.ok(doc.snippets.length<=caps.maxSnippets);
        let unshown=0,matchTooLong=0,graphemeTooLong=0;
        for(const range of doc.ranges) {
          const source=record.text[range.field][range.valueIndex];
          const graphemes=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(source)];
          const first=graphemes.find(g=>g.index<=range.start&&g.index+g.segment.length>range.start);
          const last=graphemes.find(g=>g.index<range.end&&g.index+g.segment.length>=range.end);
          const start=first.index,end=last.index+last.segment.length;
          const shown=doc.snippets.some(s=>s.field===range.field&&s.valueIndex===range.valueIndex&&s.highlights.some(h=>s.start+h.start<=start&&s.start+h.end>=end));
          if(!shown){unshown++;if(range.end-range.start>caps.maxCodeUnits)matchTooLong++;else if(end-start>caps.maxCodeUnits)graphemeTooLong++;}
        }
        assert.equal(doc.snippetOmissions.unshownMatches,unshown);assert.equal(doc.snippetOmissions.matchTooLong,matchTooLong);assert.equal(doc.snippetOmissions.graphemeTooLong,graphemeTooLong);omissionChecks++;
        for(const snippet of doc.snippets) {
          const source=record.text[snippet.field][snippet.valueIndex],points=new Set([0,source.length,...[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(source)].map(s=>s.index)]);
          assert.equal(snippet.text,source.slice(snippet.start,snippet.end));assert.ok(snippet.text.length<=caps.maxCodeUnits);assert.ok(points.has(snippet.start)&&points.has(snippet.end));
          assert.equal(snippet.omittedBefore,snippet.start>0);assert.equal(snippet.omittedAfter,snippet.end<source.length);assert.ok(snippet.highlights.length<=caps.maxHighlights);
          for(const highlight of snippet.highlights){assert.ok(highlight.start>=0&&highlight.end>highlight.start&&highlight.end<=snippet.text.length);assert.ok(points.has(snippet.start+highlight.start)&&points.has(snippet.start+highlight.end));}
          snippetChecks++;
        }
      }
    }
    assert.equal(result.total,total);comparisons++;
  }
  await engine.dispose();
}
const report={status:'Pass',node:process.version,platform:process.platform,arch:process.arch,seed:'0x552005',records:records.length,queries:queries.length,completeComparisons:comparisons,selectedDocumentComparisons:comparisons*records.length,sourceSliceChecks,snippetChecks,omissionChecks,expectedBehavior:'Literal raw/normalized lexeme pairs and source construction coordinates; independent boolean/phrase evaluator; no production tokenizer/compiler/evaluator/scorer used as oracle.'};
writeFileSync(new URL('./source-oracle.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
