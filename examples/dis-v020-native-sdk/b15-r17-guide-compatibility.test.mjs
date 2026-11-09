/** B15/R61 — original source-located DKE R17 cross-version step
 * mismatch, selected as UNKNOWN in real DIS AOT/SDK/KDP Knowledge.
 * Source publisher 203/79 original HTML/PDF raw bytes are unpinned.
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
import {R17_ORIGINS,makeR17KnowledgeReader,gateR17,verifyR17SourceScope}
 from './dke-r17-guide-reader.mjs';
const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'11a8ef0ffffdbc5945a93bdf3ad2856e302b85cb',
 path:'examples/dis-v020-native-sdk/dke-r17-guide-reader.mjs',
 gitBlob:'5e402d7194ad9cdb17c7599a8b693ade3b1f20d1'
});
const fail=code=>e=>e?.code===code;
const clone=structuredClone;
const parent=makeNativeFixture();
async function setup(){
 const f=await parent;
 const [obsText,casesText,receiptText,readerText]=await Promise.all([
  readFile(new URL('./fixtures/dke-r17-observations.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r17-cases.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r17-receipt.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-r17-guide-reader.mjs',import.meta.url),'utf8')
 ]);
 const data=[
  {id:'dke-r17-observation',sourceText:obsText,origin:R17_ORIGINS.observation},
  {id:'dke-r17-cases',sourceText:casesText,origin:R17_ORIGINS.cases},
  {id:'dke-r17-receipt',sourceText:receiptText,origin:R17_ORIGINS.receipt},
  {id:'dke-r17-reader',sourceText:readerText,origin:READER_ORIGIN}
 ];
 for(const source of data)assert.equal(sourceGitBlob(source.sourceText),source.origin.gitBlob);
 const sourceReader=makeR17KnowledgeReader(obsText,casesText,receiptText);
 const sources=[...f.sources,...data];
 const origins={...f.expectedSourceOrigins};
 for(const row of data)origins[row.id]=row.origin;
 const program=clone(f.program);
 program.domains.push({
  id:'dke.r17.version',description:'Original Framework guide cross-version source conflict, read-only and unqualified',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.r17.versioned-guides',domainId:'dke.r17.version',version:'1.0.0',
  kind:'knowledge',description:'Bounded dependency invalidation with unpinned publisher full HTML',
  dependsOn:[],functions:[{
   id:'dke.r17.checkStepDependencies',kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:'dke-r17-reader'},
   sourceDependencies:['dke-r17-observation','dke-r17-cases','dke-r17-receipt'],
   contract:{
    schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{caseId:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',caseId:'string',compatibility:'string',
     mismatchesCount:'number',affectedIds:'array',unaffectedIds:'array',
     sourceAnchor:'string',guide203RawPinned:'boolean',
     guide79RawPinned:'boolean',independentSemanticOracle:'boolean',
     methodQualified:'boolean',sapQualified:'boolean',effectDispatched:'boolean'
    },additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const registry={...f.registry,'dke.r17.checkStepDependencies':{
  sourceId:'dke-r17-reader',sha256:sourceSha256(readerText),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,
  execute:req=>sourceReader.query(req)
 }};
 const installed=Object.fromEntries(data.map(x=>[x.id,{
  sha256:sourceSha256(x.sourceText),origin:x.origin
 }]));
 const build=(p=program,s=sources,o=origins)=>compileDisV020Aot({
  built:f.artifact.built,program:p,sources:s,expectedSourceOrigins:o
 });
 return {f,sourceReader,obsText,casesText,receiptText,readerText,program,sources,origins,installed,registry,
  build,artifact:build()};
}
const ctxPromise=setup();
const activate=(x,options={})=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:dis-r61-guide',...options
});
test('R61 original DKE R17 publisher observations/cases/V8 receipt are three exact AOT DATA pins, Reader is a separate selected Knowledge LOCAL',async()=>{
 const x=await ctxPromise,q=qualifyDisV020Artifact(x.artifact);
 const fn=q.functions.get('dke.r17.checkStepDependencies');
 assert.equal(fn.definition.kind,'knowledge');assert.equal(fn.definition.effect,'none');
 assert.deepEqual(fn.definition.sourceDependencies,
  ['dke-r17-observation','dke-r17-cases','dke-r17-receipt']);
 for(const row of ['observation','cases','receipt']){
  const id='dke-r17-'+row;
  assert.equal(q.pins.get(id).origin.gitBlob,R17_ORIGINS[row].gitBlob);
  assert.equal(q.pins.get(id).origin.commit,R17_ORIGINS[row].commit);
  assert.ok(q.sourceConsumers.get(id).includes('dke.r17.checkStepDependencies'));
 }
 const app=await activate(x);
 try{assert.equal(app.state,'READY');assert.equal(app.contractVersions['dke.r17.checkStepDependencies'],'1.0.0')}
 finally{app.stop()}
});
test('R61 actual native SDK replays all original DKE 20 cases, holds two real stale-step conflicts as typed UNKNOWN without physical KDP Effect',async()=>{
 const x=await ctxPromise,original=JSON.parse(x.receiptText);
 assert.deepEqual(x.sourceReader.summary,{casesReplayed:20,observedConflicts:2,
  htmlPdfFullyPinned:false,independentSemanticOracle:false,methodQualified:false,sapQualified:false});
 const app=await activate(x);
 try{
  for(const row of original.caseResults){
   const got=await app.invoke('dke.r17.checkStepDependencies',{caseId:row.case},{expectedContractVersion:'1.0.0'});
   const v=got.value;
   assert.equal(got.kind,'OBSERVATION');assert.equal(got.disposition,'UNKNOWN');
   assert.equal(got.authority,'NONE');assert.equal(got.evidence.attested,false);
   assert.deepEqual(got.evidence.declaredRefs,[]);
   assert.equal(v.compatibility,row.expected);assert.equal(v.status,'UNKNOWN');
   assert.equal(v.guide203RawPinned,false);assert.equal(v.guide79RawPinned,false);
   assert.equal(v.independentSemanticOracle,false);assert.equal(v.sapQualified,false);
   assert.equal(v.methodQualified,false);assert.equal(v.effectDispatched,false);
   assert.equal(v.sourceAnchor,'ORIGINAL_UPSTREAM_PUBLISHER_WEB_LINES_UNPINNED_FULL_BYTES');
  }
  const conflict=await app.invoke('dke.r17.checkStepDependencies',
   {caseId:'real_cross_guide_two_conflicts'});
  assert.equal(conflict.value.compatibility,'INVALIDATED_STALE_STEP_REF');
  assert.equal(conflict.value.mismatchesCount,2);
  assert.deepEqual(conflict.value.affectedIds,['R16_METHOD_STEP4','D05_METHOD_CANDIDATE']);
  assert.deepEqual(conflict.value.unaffectedIds,['R15_RTC_CONDITIONAL_SOURCE_FACT']);
 }finally{app.stop()}
});
test('R61 original two step-reference conflicts do not permit silent 16→26/17→28 remap even in a hypothetical fixed-looking target',async()=>{
 const x=await ctxPromise,obs=JSON.parse(x.obsText),c=JSON.parse(x.casesText);
 const a=gateR17(c.baseline,obs);
 assert.equal(a.status,'INVALIDATED_STALE_STEP_REF');assert.equal(a.mismatches.length,2);
 const partial=clone(obs);
 partial.targetGuide79.webStepObservations.find(x=>x.step===16).role='REMOVE_MAINBOARD';
 const res=gateR17(c.baseline,partial);
 assert.equal(res.status,'INVALIDATED_STALE_STEP_REF');assert.equal(res.mismatches.length,1);
 const hypothetical=clone(partial);
 hypothetical.targetGuide79.webStepObservations.find(x=>x.step===17).role='REASSEMBLE_MAINBOARD';
 assert.equal(gateR17(c.baseline,hypothetical).status,'BLOCKED_UNPINNED_GUIDE_BYTES');
 const forged=clone(c.baseline);forged.dependencies[0].toStep=26;forged.dependencies[1].toStep=28;
 assert.equal(gateR17(forged,obs).status,'REJECTED_SOURCE_REFERENCE_MUTATION');
});
test('R61 forged full publisher pin, source semantic approval, missing case and broken DKE V8 receipt fail closed',async()=>{
 const x=await ctxPromise,obs=JSON.parse(x.obsText),cases=JSON.parse(x.casesText),rcpt=JSON.parse(x.receiptText);
 const fake=clone(obs);fake.guide203FullOriginalBytesSHA256='f'.repeat(64);
 assert.throws(()=>verifyR17SourceScope(fake,cases,rcpt),fail('DIS_R17_UNTRUSTED_SOURCE_OR_AUTHORITY'));
 const owner=clone(rcpt);owner.sap=1;
 assert.throws(()=>verifyR17SourceScope(obs,cases,owner),fail('DIS_R17_UNTRUSTED_SOURCE_OR_AUTHORITY'));
 const absent=clone(cases);absent.caseRoster=[];
 assert.throws(()=>verifyR17SourceScope(obs,absent,rcpt),fail('DIS_R17_SOURCE_CASE_INCONSISTENT'));
 assert.throws(()=>makeR17KnowledgeReader(x.obsText,x.casesText,x.receiptText+' '),
  fail('DIS_R17_SOURCE_BLOB_DRIFT'));
});
test('R61 wrong installer DATA pin, JSON-as-code, unselected case and forged Function input/effect all rejected',async()=>{
 const x=await ctxPromise;
 const bad={...x.installed,'dke-r17-observation':{
  ...x.installed['dke-r17-observation'],sha256:'f'.repeat(64)
 }};
 await assert.rejects(activate(x,{expectedSourcePins:bad,tenantId:'tenant:r61-stale'}),
  fail('DIS_SOURCE_ANCHOR_STALE'));
 const changed=clone(x.program),fn=changed.elements.find(e=>e.id==='dke.r17.versioned-guides').functions[0];
 fn.binding.sourceId='dke-r17-receipt';delete fn.sourceDependencies;
 assert.throws(()=>x.build(changed),fail('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
 const app=await activate(x);
 try{
  for(const req of [
   {caseId:'not-a-case'},{caseId:'real_cross_guide_two_conflicts',effect:true},
   {caseId:'real_cross_guide_two_conflicts',ownerApproved:true}
  ])await assert.rejects(app.invoke('dke.r17.checkStepDependencies',req));
  await assert.rejects(app.invoke('dke.r17.checkStepDependencies',
   {caseId:'real_cross_guide_two_conflicts'},{expectedContractVersion:'2.0.0'}),
   fail('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});
