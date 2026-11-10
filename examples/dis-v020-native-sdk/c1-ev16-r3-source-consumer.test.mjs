/** DIS #1499 ← DKE #209: original EV16-D02+D04 R3/R7 Git source receipts.
 * One selected AOT→SDK/KDP Knowledge Function, read-only typed UNKNOWN.
 * No semantic Source Owner approval or SAP/Effect authorization follows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {EV16_R3_ORIGINS,makeEv16R3Reader} from './dke-ev16-r3-reader.mjs';

const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'e02848d2d7a95d269a3ec46e6c39e76f9e80aa13',
 path:'examples/dis-v020-native-sdk/dke-ev16-r3-reader.mjs',
 gitBlob:'43ea2bc2b2bee887d03af9167b5356cd89f9ce78'
});
const FN='dke.ev16.r3.sourceReview.inspect',CODE='dke-ev16-r3-reader',
 RECEIPT='dke-ev16-r3-original-source-receipt',ROUTE='dke-r31-r7-original-owner-route';
const deny=code=>e=>e?.code===code;
const prepared=(async()=>{
 const [f,receiptText,routingText,code]=await Promise.all([
  makeNativeFixture(),
  readFile(new URL('./fixtures/dke-ev16-r3-original-source-repair-receipt.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r31-r7-owner-route.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-ev16-r3-reader.mjs',import.meta.url),'utf8')
 ]);
 assert.equal(sourceGitBlob(receiptText),EV16_R3_ORIGINS.receipt.gitBlob);
 assert.equal(sourceGitBlob(routingText),EV16_R3_ORIGINS.routing.gitBlob);
 assert.equal(sourceGitBlob(code),READER_ORIGIN.gitBlob);
 const reader=makeEv16R3Reader(receiptText,routingText);
 const add=[
  {id:RECEIPT,sourceText:receiptText,origin:EV16_R3_ORIGINS.receipt},
  {id:ROUTE,sourceText:routingText,origin:EV16_R3_ORIGINS.routing},
  {id:CODE,sourceText:code,origin:READER_ORIGIN}
 ];
 const program=structuredClone(f.program);
 program.domains.push({
  id:'dke.ev16.r3',description:'R3 real-source EV16 unknown proof and R7 limited Owner route',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.ev16.r3.review',domainId:'dke.ev16.r3',
  version:'1.0.0',kind:'knowledge',dependsOn:[],
  description:'Original D02+D04 source replay can be observed, never approved by inference',
  functions:[{
   id:FN,kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:CODE},sourceDependencies:[RECEIPT,ROUTE],
   contract:{schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{subject:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',subject:'string',sourceVerdict:'string',
     observationTier:'string',crossPublisherAuthority:'string',
     ownerReviewDecision:'string',formalEv16Cell:'string',
     originalGraphGitBlob:'string',r3ReceiptGitBlob:'string',r7RoutingGitBlob:'string',
     sapQualified:'boolean',effectDispatched:'boolean'
    },additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const sources=[...f.sources,...add],expectedSourceOrigins={...f.expectedSourceOrigins,
  [RECEIPT]:EV16_R3_ORIGINS.receipt,[ROUTE]:EV16_R3_ORIGINS.routing,[CODE]:READER_ORIGIN};
 const artifact=compileDisV020Aot({built:f.artifact.built,program,sources,expectedSourceOrigins});
 const registry={...f.registry,[FN]:{sourceId:CODE,sha256:sourceSha256(code),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,execute:input=>reader.query(input)}};
 const installed=Object.fromEntries(add.map(x=>[x.id,{sha256:sourceSha256(x.sourceText),origin:x.origin}]));
 return {reader,receiptText,routingText,code,artifact,registry,installed};
})();
const activate=x=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:ev16-original-r3-source-native'
});
test('C1 EV16 R3 two original DKE sources are selected DATA only by real AOT',async()=>{
 const x=await prepared,q=qualifyDisV020Artifact(x.artifact),f=q.functions.get(FN);
 assert.equal(f.definition.binding.sourceId,CODE);
 assert.equal(f.definition.effect,'none');
 assert.deepEqual(f.definition.sourceDependencies,[RECEIPT,ROUTE]);
 assert.equal(q.pins.get(RECEIPT).origin.gitBlob,EV16_R3_ORIGINS.receipt.gitBlob);
 assert.equal(q.pins.get(ROUTE).origin.gitBlob,EV16_R3_ORIGINS.routing.gitBlob);
 assert.ok(q.sourceConsumers.get(RECEIPT).includes(FN));
 assert.ok(q.sourceConsumers.get(ROUTE).includes(FN));
 const app=await activate(x);try{assert.equal(app.state,'READY')}finally{app.stop()}
});
test('C1 EV16 R3 actual KDP Function produces typed UNKNOWN and never source SAP',async()=>{
 const x=await prepared,app=await activate(x);
 try{
  for(const subject of ['EV16:D02+D04','se:REL-TVV-0020','se:DM-REQ-FUNCTIONAL-DOC-METHOD']){
   const out=await app.invoke(FN,{subject},{expectedContractVersion:'1.0.0'});
   assert.equal(out.kind,'OBSERVATION');
   assert.equal(out.disposition,'UNKNOWN');assert.equal(out.authority,'NONE');
   assert.equal(out.evidence.attested,false);
   assert.equal(out.value.status,'UNKNOWN');assert.equal(out.value.subject,subject);
   assert.equal(out.value.ownerReviewDecision,'NOT_RUN');
   assert.equal(out.value.formalEv16Cell,'NOT_RUN');
   assert.equal(out.value.crossPublisherAuthority,'NONE');
   assert.equal(out.value.originalGraphGitBlob,'0f6007315fd7352fe6fd218effcfecf672cb4961');
   assert.equal(out.value.r3ReceiptGitBlob,EV16_R3_ORIGINS.receipt.gitBlob);
   assert.equal(out.value.r7RoutingGitBlob,EV16_R3_ORIGINS.routing.gitBlob);
   assert.equal(out.value.sapQualified,false);assert.equal(out.value.effectDispatched,false);
  }
 }finally{app.stop()}
});
test('C1 EV16 R3 provenance forgery or Owner/Effect escalation is rejected at source, AOT or SDK',async()=>{
 const x=await prepared;
 assert.throws(()=>makeEv16R3Reader(x.receiptText+' ',x.routingText),
  deny('DKE_EV16_R3_ORIGINAL_DATA_DRIFT'));
 assert.throws(()=>makeEv16R3Reader(x.receiptText,x.routingText+' '),
  deny('DKE_EV16_R3_ORIGINAL_DATA_DRIFT'));
 for(const input of [
  {subject:'EV16:D02+D04',ownerDecision:'APPROVED'},
  {subject:'EV16:D02+D04',effect:true},
  {subject:'EV16:D02+D04',sap:true},
  {subject:'se:NOT_SELECTED'}
 ])assert.throws(()=>x.reader.query(input),deny('DKE_EV16_R3_SUBJECT_INVALID'));
 const wrong=structuredClone(x.installed);wrong[RECEIPT].origin.gitBlob='0'.repeat(40);
 await assert.rejects(activate({...x,installed:wrong}),deny('DIS_SOURCE_ANCHOR_STALE'));
 const forged=structuredClone(x.artifact);
 const f=forged.program.elements.find(e=>e.id==='dke.ev16.r3.review').functions[0];
 f.binding.sourceId=RECEIPT;f.sourceDependencies=[ROUTE];
 assert.throws(()=>qualifyDisV020Artifact(forged),deny('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
 const fakeRegistry={...x.registry,[FN]:{...x.registry[FN],sha256:'0'.repeat(64)}};
 await assert.rejects(activate({...x,registry:fakeRegistry}),deny('DIS_LOCAL_REGISTRY_MISMATCH'));
 const app=await activate(x);
 try{await assert.rejects(app.invoke(FN,{subject:'EV16:D02+D04',approved:true}),e=>Boolean(e))}
 finally{app.stop()}
});
