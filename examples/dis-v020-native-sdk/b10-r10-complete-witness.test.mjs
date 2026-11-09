/** DIS v0.2 B10-01/R56 — genuinely replay original DKE R10 full
 * conditional SAT witnesses on actual selected native KDP/SDK Knowledge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact}
 from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {R10_UPSTREAM_COMMIT,R10_CERT_BLOB,R10_INPUT_BLOB,R10_ORIGIN,
 makeR10KnowledgeReader,verifyFullR10Certificate} from './dke-r10-certificate-reader.mjs';

const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'636ecafb1566d67f34da1685b09f14550286411c',
 path:'examples/dis-v020-native-sdk/dke-r10-certificate-reader.mjs',
 gitBlob:'2f3927953c2c3ccfa3108213868823c9c25882df'
});
const R9_INPUT_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-forge',
 commit:'7aa5cf4afa625c19e9d9a59667d85b67d5bc1401',
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r9-symbolic-source-scope/FORMAL_INPUT.json',
 gitBlob:R10_INPUT_BLOB
});
const fail=code=>e=>e?.code===code;
const clone=structuredClone;
const fixture=makeNativeFixture();
async function setup(){
 const f=await fixture;
 const [inputText,certText,readerText]=await Promise.all([
  readFile(new URL('./fixtures/dke-r9-formal-input.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r10-complete-certificate.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-r10-certificate-reader.mjs',import.meta.url),'utf8')
 ]);
 assert.equal(sourceGitBlob(inputText),R10_INPUT_BLOB);
 assert.equal(sourceGitBlob(certText),R10_CERT_BLOB);
 assert.equal(sourceGitBlob(readerText),READER_ORIGIN.gitBlob);
 const verified=makeR10KnowledgeReader(inputText,certText);
 const additional=[
  {id:'dke-r10-input',sourceText:inputText,origin:R9_INPUT_ORIGIN},
  {id:'dke-r10-certificate',sourceText:certText,origin:R10_ORIGIN},
  {id:'dke-r10-reader',sourceText:readerText,origin:READER_ORIGIN}
 ];
 const sources=[...f.sources,...additional];
 const origins={...f.expectedSourceOrigins,
  'dke-r10-input':R9_INPUT_ORIGIN,'dke-r10-certificate':R10_ORIGIN,
  'dke-r10-reader':READER_ORIGIN};
 const program=clone(f.program);
 program.domains.push({
  id:'dke.r10.conditional',description:'Full SAT certificate proof-only Knowledge, not independent SAP',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.r10.certificates',domainId:'dke.r10.conditional',kind:'knowledge',
  version:'1.0.0',description:'Replayable eleven-variable countermodels for provisional source truths',
  dependsOn:[],functions:[{
   id:'dke.r10.readProof',kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:'dke-r10-reader'},
   sourceDependencies:['dke-r10-input','dke-r10-certificate'],
   contract:{
    schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{id:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',queryId:'string',verdict:'string',evidenceCompleteness:'string',
     formalInputGitBlob:'string',certificateGitBlob:'string',proofWitnesses:'number',
     logicalSupport:'boolean',qualified:'boolean',independentSemanticOracle:'boolean',
     effectDispatched:'boolean',evidenceRefs:'array'
    },optional:['evidenceRefs'],additionalProperties:false},
    outcomes:{field:'status',classes:{OBSERVED:'OBSERVED',UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:['OBSERVED']},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const registry={...f.registry,'dke.r10.readProof':{
  sourceId:'dke-r10-reader',sha256:sourceSha256(readerText),origin:READER_ORIGIN,
  gitBlob:READER_ORIGIN.gitBlob,execute:req=>verified.query(req)
 }};
 const installed=Object.fromEntries(additional.map(x=>[x.id,{
  sha256:sourceSha256(x.sourceText),origin:x.origin
 }]));
 const compile=(p=program,ss=sources,oo=origins)=>compileDisV020Aot({
  built:f.artifact.built,program:p,sources:ss,expectedSourceOrigins:oo
 });
 return {f,inputText,certText,readerText,verified,program,sources,origins,registry,
  installed,compile,artifact:compile()};
}
const ctxPromise=setup();
const load=(x,options={})=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:dis-r56-native',...options
});
test('R56 original R10 Python certificate and DIS Reader are AOT-selected DATA and local code with exact Git origin',async()=>{
 const x=await ctxPromise,q=qualifyDisV020Artifact(x.artifact);
 const fn=q.functions.get('dke.r10.readProof');
 assert.equal(fn.definition.binding.type,'local');
 assert.deepEqual(fn.definition.sourceDependencies,['dke-r10-input','dke-r10-certificate']);
 assert.equal(q.pins.get('dke-r10-certificate').origin.commit,R10_UPSTREAM_COMMIT);
 assert.equal(q.pins.get('dke-r10-certificate').origin.gitBlob,R10_CERT_BLOB);
 assert.equal(q.pins.get('dke-r10-input').origin.gitBlob,R10_INPUT_BLOB);
 assert.ok(q.sourceConsumers.get('dke-r10-certificate').includes('dke.r10.readProof'));
 const app=await load(x);
 try{assert.equal(app.state,'READY');assert.equal(app.contractVersions['dke.r10.readProof'],'1.0.0')}
 finally{app.stop()}
});
test('R56 native real KDP SDK replays all 2048 valuations and 18 complete witness worlds; seven UNKNOWN remain UNKNOWN',async()=>{
 const x=await ctxPromise,summary=x.verified.summary;
 assert.deepEqual({
  variables:summary.variables,assignments:summary.assignments,
  satisfyingWorlds:summary.satisfyingWorlds,witnesses:summary.witnesses,
  positive:summary.positiveWitnesses,negative:summary.negativeWitnesses,unknown:summary.unknown
 },{variables:11,assignments:2048,satisfyingWorlds:64,witnesses:18,positive:9,negative:9,unknown:7});
 const app=await load(x);
 try{
  const counts={ENTAILED:0,REFUTED:0,UNDERDETERMINED:0};
  for(let i=1;i<=11;i++){
   const id='S'+String(i).padStart(2,'0'),res=await app.invoke('dke.r10.readProof',{id},{expectedContractVersion:'1.0.0'});
   const v=res.value;
   counts[v.verdict]++;
   assert.equal(res.kind,'OBSERVATION');assert.equal(res.authority,'NONE');
   assert.equal(v.evidenceCompleteness,'COMPLETE_REPLAYED_CONDITIONAL');
   assert.equal(v.formalInputGitBlob,R10_INPUT_BLOB);
   assert.equal(v.certificateGitBlob,R10_CERT_BLOB);
   assert.equal(v.qualified,false);assert.equal(v.independentSemanticOracle,false);
   assert.equal(v.effectDispatched,false);assert.equal(res.evidence.attested,false);
   if(v.verdict==='UNDERDETERMINED'){
    assert.equal(res.disposition,'UNKNOWN');assert.equal(v.proofWitnesses,2);
    assert.equal(Object.hasOwn(v,'evidenceRefs'),false);
   }else{
    assert.equal(res.disposition,'OBSERVED');assert.equal(v.proofWitnesses,1);
    assert.equal(v.logicalSupport,v.verdict==='ENTAILED');
    assert.deepEqual(res.evidence.declaredRefs,['dke:r10:conditional-certificate:'+id]);
   }
  }
  assert.deepEqual(counts,{ENTAILED:2,REFUTED:2,UNDERDETERMINED:7});
 }finally{app.stop()}
});
test('R56 complete countermodel verifier rejects missing variable, false source-fact, incorrect polarity and SAP impersonation',async()=>{
 const x=await ctxPromise,input=JSON.parse(x.inputText),cert=JSON.parse(x.certText);
 const bad=clone(cert);delete bad.cases[2].positiveWorld.same_gh_cf_root_cause;
 assert.throws(()=>verifyFullR10Certificate(input,bad),fail('DIS_R10_CERT_WITNESS_INVALID'));
 const falseFact=clone(cert);falseFact.cases[2].positiveWorld.github_auto_retry_failed_delivery=true;
 assert.throws(()=>verifyFullR10Certificate(input,falseFact),fail('DIS_R10_CERT_WITNESS_INVALID'));
 const falsePolarity=clone(cert);falsePolarity.cases[2].positiveWorld.cf_incident_cached_success=false;
 assert.throws(()=>verifyFullR10Certificate(input,falsePolarity),fail('DIS_R10_CERT_WITNESS_INVALID'));
 const falseSap=clone(cert);falseSap.qualification.qualifiedSap=1;
 assert.throws(()=>verifyFullR10Certificate(input,falseSap),fail('DIS_R10_CERT_FALSE_AUTHORITY'));
 assert.throws(()=>makeR10KnowledgeReader(x.inputText,x.certText+' '),fail('DIS_R10_SOURCE_BLOB_DRIFT'));
});
test('R56 stale installer source, JSON-as-code and caller forged owner/Effect fail closed before authority',async()=>{
 const x=await ctxPromise;
 const stale={...x.installed,'dke-r10-certificate':{
  ...x.installed['dke-r10-certificate'],sha256:'f'.repeat(64)
 }};
 await assert.rejects(load(x,{expectedSourcePins:stale,tenantId:'tenant:r56-stale'}),
  fail('DIS_SOURCE_ANCHOR_STALE'));
 const p=clone(x.program),fn=p.elements.find(e=>e.id==='dke.r10.certificates').functions[0];
 fn.binding.sourceId='dke-r10-certificate';delete fn.sourceDependencies;
 assert.throws(()=>x.compile(p),fail('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
 const app=await load(x);
 try{
  await assert.rejects(app.invoke('dke.r10.readProof',{id:'S99'}),fail('DIS_R10_QUERY_UNSELECTED'));
  await assert.rejects(app.invoke('dke.r10.readProof',{id:'S02',qualifiedSap:true}),
   fail('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke('dke.r10.readProof',{id:'S02'},{expectedContractVersion:'2.0.0'}),
   fail('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});
