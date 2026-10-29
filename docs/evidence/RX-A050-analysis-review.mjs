/** Independent scanner/evaluation review probes. The reviewer authored provider
 * integration, which is deliberately excluded from this review's verdict. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.argv[2]??join(root,'docs/evidence/RX-A050-analysis-review.json');
const candidateReportPath=process.argv[3],packageReportPath=process.argv[4];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[
  'package.json',
  'src/addons/identifiers/index.ts','src/addons/identifiers/scanner.ts','src/core/analyzer/identifier.ts','src/core/analyzer/selected.ts',
  'src/core/capabilities/registration.ts','src/core/capabilities/types.ts','src/core/contracts/query.ts',
  'dist/addons/identifiers/index.js','dist/addons/identifiers/scanner.js','dist/core/analyzer/identifier.js',
  'test/oracle/identifiers.mjs','test/fixtures/relevance/identifiers-v1.json','test/addons/identifiers/scanner.test.mjs',
  'test/addons/identifiers/evaluation.test.mjs','test/addons/identifiers/lifecycle.test.mjs',
  'test/addons/identifiers/package.test.mjs','test/measurements/identifier-package.mjs','docs/api/IDENTIFIERS.md','docs/specs/IDENTIFIER_ANALYSIS.md',
];
async function identities(){return Promise.all(files.map(async path=>{const bytes=await readFile(join(root,path));return{path,bytes:bytes.length,sha256:digest(bytes)}}));}
const report={kind:'raveldex-rx-a050-independent-analysis-review-v1',reviewer:'/root/identifier_seam_review',date:'2026-10-29',
  status:'In progress',scope:'Independent review of other authors\' scanner, raw core protocol, oracle, frozen developer labels, evaluation, package measurement/tests and identifier API/spec. Provider/native/evidence/snippet implementation authored by this reviewer is excluded from the independent verdict.',
  commands:['node docs/evidence/RX-A050-analysis-review.mjs'],environment:{node:process.version,platform:process.platform,arch:process.arch},probes:[],mandatoryFindings:[],followUps:[],limitations:[
    'One AI reviewer, not native-human linguistic review or a user study.',
    'Seeded generated Unicode-category cases and exact local Node do not establish all-Unicode, cross-runtime or browser equivalence.',
    'The reference model is reviewer-authored and imports no production analysis/scoring; its rules still reflect the same adopted specification.',
    'Package suite/source are reviewed here; independently executing a retained candidate is recorded separately only if a candidate path was explicitly supplied.',
  ]};
try{
  report.inputs=await identities();
  let runtimeRoot=root;
  if(candidateReportPath){
    const reportBytes=await readFile(resolve(candidateReportPath)),candidate=JSON.parse(reportBytes);
    assert.equal(candidate.status,'Pass');assert.equal(candidate.package.private,true);assert.equal(candidate.package.version,'0.1.0-rc.0');
    const tarball=await readFile(candidate.package.tarball);assert.equal(digest(tarball),candidate.package.sha256);assert.equal(tarball.length,candidate.package.tarballBytes);
    runtimeRoot=await realpath(candidate.package.installedDirectory);assert.equal(runtimeRoot,candidate.package.installedDirectory);
    const members=[];
    for(const row of candidate.package.files){
      assert.ok(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));
      const bytes=await readFile(join(runtimeRoot,row.path)),current=await readFile(join(root,row.path));
      assert.equal(bytes.length,row.bytes);assert.equal(digest(bytes),row.sha256);assert.deepEqual(bytes,current);
      members.push({path:row.path,bytes:bytes.length,sha256:digest(bytes)});
    }
    const document=await readFile(join(runtimeRoot,'docs/api/IDENTIFIERS.md'),'utf8'),example=/```js\n([\s\S]*?)\n```/.exec(document)?.[1];assert.ok(example);
    const stdout=execFileSync(process.execPath,['--input-type=module','--eval',example],{cwd:resolve(runtimeRoot,'../../..'),encoding:'utf8'}).trim();assert.equal(stdout,'1 1');
    report.candidateBinding={status:'Pass',report:{path:resolve(candidateReportPath),sha256:digest(reportBytes)},tarball:{path:candidate.package.tarball,bytes:tarball.length,sha256:digest(tarball)},installedDirectory:runtimeRoot,byteCurrentMembers:members.length,members,publicDocumentationExample:{sha256:digest(example),stdout},
      scope:'Independent byte identity replay of all installed members against the candidate report and current workspace, plus actual installed-public API example. Manual/fuzz/numerical probes below import the retained candidate compiled modules. This does not repeat the complete candidate/browser suite or independently qualify reviewer-authored provider semantics.'};
    report.commands.push('node docs/evidence/RX-A050-analysis-review.mjs '+resolve(out)+' '+resolve(candidateReportPath)+(packageReportPath?' '+resolve(packageReportPath):''));
    if(packageReportPath){const bytes=await readFile(resolve(packageReportPath)),measurement=JSON.parse(bytes);assert.equal(measurement.package.sha256,candidate.package.sha256);assert.equal(measurement.correctness.status,'Pass');
      report.candidateBinding.packageMeasurement={path:resolve(packageReportPath),sha256:digest(bytes),tarballSha256:measurement.package.sha256,core:{minified:measurement.core.minifiedBytes,gzip:measurement.core.gzipBytes,targetMet:measurement.core.targetMet},identifierOnly:{minified:measurement.identifierOnly.minifiedBytes,gzip:measurement.identifierOnly.gzipBytes},combined:{minified:measurement.combined.minifiedBytes,gzip:measurement.combined.gzipBytes},scope:'Closed same-tar parent-executed package measurement. This review inspects its source/arithmetic and identities; it does not count those full measurement checks as independent reruns.'};
    }
    report.resolvedDocumentationFinding={id:'D1',finding:'Earlier wording described all frozen symbols as public identifiers, but the corpus also contains implementation helpers.',resolution:'Adopted contract now says actual Raveldex API and implementation identifiers. Frozen records and judgments are unchanged.'};
    assert.match(await readFile(join(root,'docs/specs/IDENTIFIER_ANALYSIS.md'),'utf8'),/actual Raveldex API and implementation identifiers/);
  }
  const {analyzeIdentifiers}=await import(pathToFileURL(join(runtimeRoot,'dist/addons/identifiers/scanner.js')));
  const {createIdentifierAnalyzer,IDENTIFIER_ANALYZER}=await import(pathToFileURL(join(runtimeRoot,'dist/addons/identifiers/index.js')));
  const {DEFAULT_LIMITS}=await import(pathToFileURL(join(runtimeRoot,'dist/core/limits/limits.js')));
  const {identifierOccurrences,identifierOriginals}=await import(pathToFileURL(join(root,'test/oracle/identifiers.mjs')));
  const {createRaveldex}=await import(pathToFileURL(join(runtimeRoot,'dist/index.js')));
  function actual(raw,mode='index',valueIndex=0){const tokens=[];let work=0;for(const step of analyzeIdentifiers(raw,valueIndex,DEFAULT_LIMITS,'INVALID_RECORD',mode)){assert.ok(Number.isSafeInteger(step.workUnits)&&step.workUnits>0);work+=step.workUnits;if(step.token)tokens.push(step.token)}return{tokens,work}}
  function one(raw,whole,components){return[{term:whole,start:0,end:raw.length,position:0,valueIndex:0,kind:'original'},...components.map(([term,start,end])=>({term,start,end,position:0,valueIndex:0,kind:'component',original:{term:whole,start:0,end:raw.length}}))]}
  const manual=[
    ['myURL4Codec','myurl4codec',[['my',0,2],['url',2,5],['4',5,6],['codec',6,11]]],
    ['ABc','abc',[['a',0,1],['bc',1,3]]],
    ['JSON2XML','json2xml',[['json',0,4],['2',4,5],['xml',5,8]]],
    ['A__A','a__a',[['a',0,1]]],['aB','ab',[['a',0,1],['b',1,2]]],
    ['éX','éx',[['é',0,1],['x',1,2]]],['e\u0301X','éx',[['é',0,2],['x',2,3]]],
    ['fooǅelta','foodželta',[['foo',0,3],['dželta',3,8]]],
    ['πHTTP2文','πhttp2文',[['π',0,1],['http',1,5],['2',5,6],['文',6,7]]],
    ['文Ab','文ab',[]],['½A','1⁄2a',[['1⁄2',0,1],['a',1,2]]],
    ['ⅠI','ii',[['i',0,1]]],['İValue','i\u0307value',[['i\u0307',0,1],['value',1,6]]],
    ['σΣ','σς',[['σ',0,1]]],['ΟΣa','οσa',[['ο',0,1],['σa',1,3]]],
    ['foo_\u0301Bar','foo_\u0301bar',[['foo',0,3],['bar',5,8]]],
    ['foo___','foo___',[['foo',0,3]]],['ﬁle_X','file_x',[['file',0,3],['x',4,5]]],
  ];
  for(const [raw,whole,components] of manual)for(const mode of ['index','query','phrase'])assert.deepEqual(actual(raw,mode).tokens,one(raw,whole,mode==='index'?components:[]),JSON.stringify({raw,mode}));
  report.probes.push({name:'Independent hand-literal original/component Unicode and contextual-case spans',status:'Pass',fixtures:manual.length,comparisons:manual.length*3,cases:manual.map(([raw,whole,components])=>({raw,whole,components}))});

  // Separate complete-regex/codepoint reference: no production or test-oracle
  // calls supply truth, and expectations preserve raw contextual normalization.
  function reference(value,mode='index',valueIndex=0){
    const tokens=[];let position=0;
    for(const match of value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}_]*/gu)){
      const start=match.index,end=start+match[0].length,term=match[0].normalize('NFKC').toLowerCase();
      tokens.push({term,start,end,valueIndex,position,kind:'original'});
      if(mode==='index'){
        const seen=new Set([term]);
        for(const chunk of match[0].matchAll(/[^_]+/gu)){
          const letters=[...chunk[0].matchAll(/[\p{L}\p{N}]\p{M}*/gu)];
          const classOf=i=>{const first=letters[i]?.[0];if(first===undefined)return'end';if(/^\p{N}/u.test(first))return'number';if(/^[\p{Lu}\p{Lt}]/u.test(first))return'upper';if(/^\p{Ll}/u.test(first))return'lower';return'letter'};
          const cuts=[0];
          for(let at=1;at<letters.length;at++)if(classOf(at-1)==='lower'&&classOf(at)==='upper'||classOf(at-1)==='upper'&&classOf(at)==='upper'&&classOf(at+1)==='lower'||(classOf(at-1)==='number')!==(classOf(at)==='number'))cuts.push(at);
          cuts.push(letters.length);
          for(let n=1;n<cuts.length;n++){
            const first=letters[cuts[n-1]],last=letters[cuts[n]-1];if(!first||!last)continue;
            const from=start+chunk.index+first.index,to=start+chunk.index+last.index+last[0].length;
            const part=value.slice(from,to).normalize('NFKC').toLowerCase();if(seen.has(part))continue;seen.add(part);
            tokens.push({term:part,start:from,end:to,valueIndex,position,kind:'component',original:{term,start,end}});
          }
        }
      }
      position++;
    }
    return tokens;
  }
  function oracleTokens(value,mode,valueIndex){return(mode==='index'?identifierOccurrences(value,valueIndex):identifierOriginals(value,valueIndex)).map(({term,start,end,valueIndex,position,kind,originalStart,originalEnd})=>({term,start,end,valueIndex,position,kind,...(kind==='component'?{original:{term:value.slice(originalStart,originalEnd).normalize('NFKC').toLowerCase(),start:originalStart,end:originalEnd}}:{})}))}
  let seed=0x5a050a40;const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0};
  const alphabet=['a','b','A','B','Z','0','9','_','\u0301','\u0327','Α','β','Ж','д','ǅ','文','½','Ⅳ','𝟜','𐐀','𐐨','İ','σ','Σ','ﬁ','é','.', '/', '\\','-','$',' ','😀','\u200d'];
  let comparisons=0,work=0;
  for(let n=0;n<2000;n++){
    let raw='';const size=next()%25;for(let i=0;i<size;i++)raw+=alphabet[next()%alphabet.length];
    for(const mode of ['index','query','phrase']){
      const valueIndex=n%7,expected=reference(raw,mode,valueIndex),observed=actual(raw,mode,valueIndex);work+=observed.work;
      assert.deepEqual(observed.tokens,expected,JSON.stringify({n,raw,mode,subject:'production'}));comparisons++;
      assert.deepEqual(oracleTokens(raw,mode,valueIndex),expected,JSON.stringify({n,raw,mode,subject:'test oracle'}));comparisons++;
      for(const token of observed.tokens){assert.equal(raw.slice(token.start,token.end).normalize('NFKC').toLowerCase(),token.term);if(token.original)assert.equal(raw.slice(token.original.start,token.original.end).normalize('NFKC').toLowerCase(),token.original.term)}
    }
  }
  report.probes.push({name:'Seeded complete-regex/codepoint differential against compiled scanner and independently authored repository oracle',status:'Pass',seed:'0x5a050a40',values:2000,modes:3,comparisons,observedLogicalWorkUnits:work,scope:'Logical cursor units only, not time or heap',alphabet});

  const oracleSource=await readFile(join(root,'test/oracle/identifiers.mjs'),'utf8');
  assert.equal(/^\s*import\s/m.test(oracleSource),false);assert.equal(/^\s*export\s.*\sfrom\s/m.test(oracleSource),false);
  const fixtureBytes=await readFile(join(root,'test/fixtures/relevance/identifiers-v1.json')),fixture=JSON.parse(fixtureBytes);
  assert.equal(digest(fixtureBytes),'6be2f54f1046cace5c4163ed0f181d9ac3681953b18f0c6c02c3138aeca5bb6d');
  const referenceDocuments=fixture.records.map(record=>({id:record.id,terms:new Set(reference(record.text.code).map(token=>token.term))}));
  for(const judgment of fixture.judgments){const terms=reference(judgment.text,'query').map(token=>token.term);const expected=terms.length?referenceDocuments.filter(doc=>terms.every(term=>doc.terms.has(term))).map(doc=>doc.id).sort():[];assert.deepEqual([...judgment.expectedIds].sort(),expected,judgment.id)}
  const provenance=[];
  for(const row of fixture.provenance){const source=await readFile(join(root,row.path));assert.ok(source.toString().split('\n').includes(row.sourceLine),row.symbol+': literal source excerpt must still exist');provenance.push({symbol:row.symbol,path:row.path,frozenSourceSha256:row.sourceSha256,currentSourceSha256:digest(source),sameWholeFileAtReview:digest(source)===row.sourceSha256,exactFrozenExcerptStillPresent:true})}
  report.probes.push({name:'Frozen exhaustive literal-symbol labels and source provenance audit',status:'Pass',fixtureSha256:digest(fixtureBytes),records:fixture.records.length,judgments:fixture.judgments.length,acceptance:fixture.acceptance,provenance,scope:'All exact source excerpts remain present. Hash-different whole files describe a frozen earlier inspection snapshot; no retroactive source-hash equivalence or independent timestamp-order proof claimed.'});

  // Different, hand-described numerical fixture: aB has whole ab + a + b.
  // Membership/scoring use no production/test-oracle tokenizer or scorer.
  const config={schema:{text:{code:{}}},analyzer:IDENTIFIER_ANALYZER,addons:[createIdentifierAnalyzer()]};
  const engine=createRaveldex(config);let numericalComparisons=0;
  try{
    await engine.addMany([{id:'a',text:{code:'aB'}},{id:'b',text:{code:'a'}},{id:'c',text:{code:'b'}}]);
    for(const [query,expected] of [
      ['a',[{id:'b',score:Math.log(1.6)*2.2/1.84},{id:'a',score:Math.log(1.6)*2.2/2.92}]],
      ['aB',[{id:'a',score:Math.log(1+2.5/1.5)*2.2/2.92}]],
      ['a b',[{id:'a',score:2*Math.log(1.6)*2.2/2.92}]],
      ['a a',[{id:'b',score:Math.log(1.6)*2.2/1.84},{id:'a',score:Math.log(1.6)*2.2/2.92}]],
    ])for(const options of [{limit:100},{limit:0},{offset:1,limit:1}]){
      const result=await engine.search(query,options),wanted=expected.slice(options.offset??0,(options.offset??0)+options.limit);assert.equal(result.total,expected.length);assert.deepEqual(result.hits.map(hit=>hit.id),wanted.map(hit=>hit.id));for(let i=0;i<wanted.length;i++)assert.ok(Math.abs(result.hits[i].score-wanted[i].score)<1e-12);numericalComparisons++;
    }
  }finally{await engine.dispose()}
  report.probes.push({name:'Independent short-identifier TF/DF/field-length/native-BM25 arithmetic and duplicate query groups',status:'Pass',literalDocuments:[['a','aB',['ab','a','b']],['b','a',['a']],['c','b',['b']]],fieldLength:5,population:3,averageLength:5/3,comparisons:numericalComparisons});
  const packageJson=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  assert.equal(packageJson.private,true);assert.equal(packageJson.version,'0.1.0-rc.0');
  assert.deepEqual(packageJson.exports['./addons/identifiers'],{types:'./dist/addons/identifiers/index.d.ts',import:'./dist/addons/identifiers/index.js'});
  assert.equal(Object.keys(packageJson.exports).some(key=>key.startsWith('./addons/identifiers/')),false);
  assert.equal(Object.keys(packageJson.dependencies??{}).length,0);
  const packageSymbols=[['a','fooBar next'],['b','foo bar'],['c','foo_bar next'],['d',['foo','bar']],['e','unrelated'],['f','HTTP2Server'],['g','cafe\u0301Parser'],['h','fooFoo'],['i','src/core/search.ts']];
  const counts=packageSymbols.map(([id,values])=>{values=Array.isArray(values)?values:[values];return{id,originals:values.flatMap(value=>reference(value,'query')).length,retained:values.flatMap(value=>reference(value)).length,terms:values.flatMap(value=>reference(value).map(token=>token.term))}});
  assert.equal(counts.reduce((n,row)=>n+row.originals,0),16);assert.equal(counts.reduce((n,row)=>n+row.retained,0),26);
  report.probes.push({name:'Package/API/source review and independently replayed literal package fixture',status:'Pass',runtimeDependencies:[],private:true,publicEntry:'./addons/identifiers',deepIdentifierExports:[],fixture:counts,
    sourceReview:[
      'Package expectations use a hand-literal term-frequency table, native BM25 arithmetic and explicit exhaustive membership; production analyzer/scorer supply no expected values.',
      'The prefix fixture takes the maximum selected alternative contribution per field, consistent with the approved native group contract, rather than summing prefix expansions.',
      'Installed/minified, original-only phrase, source/native, real Node worker, spoofed receipt and public declaration checks are separate actual measurement/test paths; this source review alone is not an independent rerun of those paths.',
      'The exact installed first JavaScript API example is extracted and executed by the package measurement.',
      'Identifier-only and core graphs are measured separately; graph exclusion and logical cardinalities do not establish heap/allocation/transport-copy peaks.',
      'API/spec describe implicit component membership, whole-only raw queries, native equal weights, earliest canonical component spans, Unicode N/Lu/Lt/Ll classes, global explicit selection and significant accents. These agree with the independently exercised scanner policy.',
    ]});
  const current=await identities();assert.deepEqual(current,report.inputs,'Reviewed source/dist must not change during probes');
  report.status='Pass';report.recommendation='Ready with follow-ups';
  report.followUps.push({id:'F1',severity:'non-blocking',finding:'The finite corpus is 21 literal Raveldex symbols with AI-authored navigation labels; preserve its stated limits and report separate selected-prose regressions. It is not evidence of broad developer-search relevance or human usability.'});
  report.followUps.push({id:'F2',severity:'non-blocking',finding:'Existing generic core bridge code cost and the unchanged 15KiB gzip planning target must remain disclosed in final package measurements; logical counters are not allocation peaks.'});
}catch(error){report.status='Fail';report.recommendation='Changes required';report.mandatoryFindings.push({message:error.message,stack:error.stack});}
await writeFile(resolve(out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,recommendation:report.recommendation,probes:report.probes.map(({name,status,comparisons})=>({name,status,comparisons})),mandatoryFindings:report.mandatoryFindings,out:resolve(out)}));
if(report.status!=='Pass')process.exitCode=1;
