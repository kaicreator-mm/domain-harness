/** C1 real original DKE R31 source-first Critic as AOT-selected read-only Knowledge.
 * Review recommendation is NOT Product Owner SAP, Effect, or release authority.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {R31_ORIGINS,makeR31CriticReader} from './dke-r31-critic-reader.mjs';
const R_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'4f0b5203cbdd5e98de6bb6e120ea2a2a808b45ba',
 path:'examples/dis-v020-native-sdk/dke-r31-critic-reader.mjs',
 gitBlob:'0e7dcf1fb500cd0df60eefc8a4ad605293f79ed9'
});
const FN='dke.r31.criticReview.inspect',DATA='dke-r31-original-critic-receipt',
 REVIEW='dke-r31-original-critic-report',CODE='dke-r31-critic-reader';
const deny=code=>e=>e?.code===code;
const prepared=(async()=>{
 const [f,receiptText,reviewText,code]=await Promise.all([
  makeNativeFixture(),
  readFile(new URL('./fixtures/dke-r31-source-first-critic-receipt.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r31-source-first-critic-review.md',import.meta.url),'utf8'),
  readFile(new URL('./dke-r31-critic-reader.mjs',import.meta.url),'utf8')
 ]);
 assert.equal(sourceGitBlob(receiptText),R31_ORIGINS.receipt.gitBlob);
 assert.equal(sourceGitBlob(reviewText),R31_ORIGINS.review.gitBlob);
 assert.equal(sourceGitBlob(code),R_ORIGIN.gitBlob);
 const reader=makeR31CriticReader(receiptText,reviewText);
 const add=[
  {id:DATA,sourceText:receiptText,origin:R31_ORIGINS.receipt},
  {id:REVIEW,sourceText:reviewText,origin:R31_ORIGINS.review},
  {id:CODE,sourceText:code,origin:R_ORIGIN}
 ];
 const program=structuredClone(f.program);
 program.domains.push({
  id:'dke.r31.original',description:'Real reviewer findings pending accountable Owner Decision',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
 });
 program.elements.push({id:'dke.r31.source-first-review',domainId:'dke.r31.original',
  version:'1.0.0',kind:'knowledge',dependsOn:[],
  description:'Read source-first Critic findings without promotion to SAP or Effects',
  functions:[{id:FN,kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:CODE},sourceDependencies:[DATA,REVIEW],
   contract:{schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{subject:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',subject:'string',criticVerdict:'string',reviewAuthority:'string',
     ownerReviewDecision:'string',relationSourceAuthority:'string',
     originalGraphGitBlob:'string',criticReceiptGitBlob:'string',criticReportGitBlob:'string',
     sapQualified:'boolean',effectDispatched:'boolean'
    },additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const sources=[...f.sources,...add],origins={...f.expectedSourceOrigins,
  [DATA]:R31_ORIGINS.receipt,[REVIEW]:R31_ORIGINS.review,[CODE]:R_ORIGIN};
 const artifact=compileDisV020Aot({built:f.artifact.built,program,sources,
  expectedSourceOrigins:origins});
 const registry={...f.registry,[FN]:{sourceId:CODE,sha256:sourceSha256(code),
  origin:R_ORIGIN,gitBlob:R_ORIGIN.gitBlob,execute:input=>reader.query(input)}};
 const installed=Object.fromEntries(add.map(x=>[x.id,{
  sha256:sourceSha256(x.sourceText),origin:x.origin
 }]));
 return {reader,receiptText,reviewText,code,artifact,registry,installed};
})();
const activate=x=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:c1-original-r31-review-native'
});
test('C1 source-first R31 real DKE receipt and report are selected exact AOT DATA',async()=>{
 const x=await prepared,q=qualifyDisV020Artifact(x.artifact),f=q.functions.get(FN);
 assert.equal(f.definition.binding.sourceId,CODE);
 assert.equal(f.definition.effect,'none');
 assert.deepEqual(f.definition.sourceDependencies,[DATA,REVIEW]);
 assert.equal(q.pins.get(DATA).origin.gitBlob,R31_ORIGINS.receipt.gitBlob);
 assert.equal(q.pins.get(REVIEW).origin.gitBlob,R31_ORIGINS.review.gitBlob);
 assert.ok(q.sourceConsumers.get(DATA).includes(FN));
 assert.ok(q.sourceConsumers.get(REVIEW).includes(FN));
 const app=await activate(x);try{assert.equal(app.state,'READY')}finally{app.stop()}
});
test('C1 original independent reviewer verdict is native OBSERVATION UNKNOWN, never Owner SAP',async()=>{
 const x=await prepared,app=await activate(x);
 try{
  for(const subject of ['se:CLM-REQ-FUNCTIONAL-DOC-METHODS','se:CLM-TVV-0001','se:REL-TVV-0020']){
   const out=await app.invoke(FN,{subject},{expectedContractVersion:'1.0.0'});
   assert.equal(out.kind,'OBSERVATION');assert.equal(out.disposition,'UNKNOWN');
   assert.equal(out.authority,'NONE');assert.equal(out.evidence.attested,false);
   assert.equal(out.value.status,'UNKNOWN');assert.equal(out.value.subject,subject);
   assert.equal(out.value.reviewAuthority,'SOURCE_FIRST_CRITIC_ONLY');
   assert.equal(out.value.ownerReviewDecision,'NOT_RUN');
   assert.equal(out.value.criticReceiptGitBlob,R31_ORIGINS.receipt.gitBlob);
   assert.equal(out.value.criticReportGitBlob,R31_ORIGINS.review.gitBlob);
   assert.equal(out.value.sapQualified,false);assert.equal(out.value.effectDispatched,false);
   if(subject==='se:REL-TVV-0020'){
    assert.equal(out.value.criticVerdict,'AUTHOR_DERIVED_PENDING_OWNER_REVIEW');
    assert.equal(out.value.relationSourceAuthority,'AUTHOR_DERIVED');
   }else assert.equal(out.value.criticVerdict,'SUPPORTED_WITH_SCOPE');
  }
 }finally{app.stop()}
});
test('C1 forged reviewer/Owner flags and source bytes are denied before authority promotion',async()=>{
 const x=await prepared;
 assert.throws(()=>makeR31CriticReader(x.receiptText+' ',x.reviewText),
  deny('DKE_R31_CRITIC_SOURCE_DRIFT'));
 assert.throws(()=>makeR31CriticReader(x.receiptText,x.reviewText+' '),
  deny('DKE_R31_CRITIC_SOURCE_DRIFT'));
 for(const input of [
  {subject:'se:REL-TVV-0020',ownerDecision:'APPROVED'},
  {subject:'se:CLM-TVV-0001',sap:true},
  {subject:'se:CLM-REQ-FUNCTIONAL-DOC-METHODS',effect:true},
  {subject:'se:UNSELECTED-CROSS-SOURCE-CLAIM'}
 ])assert.throws(()=>x.reader.query(input),deny('DKE_R31_CRITIC_SELECTION_INVALID'));
 const wrong=structuredClone(x.installed);wrong[DATA].origin.gitBlob='0'.repeat(40);
 await assert.rejects(activate({...x,installed:wrong}),deny('DIS_SOURCE_ANCHOR_STALE'));
 // Source anchors intentionally support independently pinned subsets. A
 // missing anchor is not a forbidden admission unless the caller asks for
 // full closure; test a truly unselected extra anchor instead.
 const unselected=structuredClone(x.installed);
 unselected['not-selected-r31-source']={...unselected[DATA]};
 await assert.rejects(activate({...x,installed:unselected}),
  deny('DIS_SOURCE_ANCHOR_NOT_CONSUMED'));
 // C1/R90: the review Markdown is a single exact whitelisted DATA origin,
 // NOT a general docs/ Markdown executable source.
 const forgedCode=structuredClone(x.artifact);
 const fd=forgedCode.program.elements.find(e=>e.id==='dke.r31.source-first-review').functions[0];
 fd.binding.sourceId=REVIEW;
 fd.sourceDependencies=[DATA];
 assert.throws(()=>qualifyDisV020Artifact(forgedCode),
  deny('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
 const arbitraryMarkdown=structuredClone(x.artifact);
 arbitraryMarkdown.sources.find(p=>p.id===REVIEW).origin.path=
  'docs/standards/dke/DKE-0.0.1/demos/UNREVIEWED_REPORT.md';
 assert.throws(()=>qualifyDisV020Artifact(arbitraryMarkdown),
  deny('DIS_SOURCE_ORIGIN_INVALID'));
 const fake={...x.registry,[FN]:{...x.registry[FN],sha256:'0'.repeat(64)}};
 await assert.rejects(activate({...x,registry:fake}),deny('DIS_LOCAL_REGISTRY_MISMATCH'));
 const app=await activate(x);
 try{await assert.rejects(app.invoke(FN,{subject:'se:REL-TVV-0020',approved:true}),e=>Boolean(e))}
 finally{app.stop()}
});
