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
 commit:'a930237035e466ec9ab15d93e9dfa8f5ceae2d01',
 path:'examples/dis-v020-native-sdk/dke-ev16-r3-reader.mjs',
 gitBlob:'177a36d35955cae02deb2c9bcdb349f0107a447c'
});
const FN='dke.ev16.r3.sourceReview.inspect',CODE='dke-ev16-r3-reader',
 RECEIPT='dke-ev16-r3-original-source-receipt',ROUTE='dke-r31-r7-original-owner-route',
 R1='dke-ev16-r1-reviewed-original-selected-consumer';
const deny=code=>e=>e?.code===code;
const prepared=(async()=>{
 const [f,receiptText,routingText,r1Text,code]=await Promise.all([
  makeNativeFixture(),
  readFile(new URL('./fixtures/dke-ev16-r3-original-source-repair-receipt.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r31-r7-owner-route.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-ev16-r1-selected-consumer-repair-receipt.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-ev16-r3-reader.mjs',import.meta.url),'utf8')
 ]);
 assert.equal(sourceGitBlob(receiptText),EV16_R3_ORIGINS.receipt.gitBlob);
 assert.equal(sourceGitBlob(routingText),EV16_R3_ORIGINS.routing.gitBlob);
 assert.equal(sourceGitBlob(r1Text),EV16_R3_ORIGINS.r1.gitBlob);
 assert.equal(sourceGitBlob(code),READER_ORIGIN.gitBlob);
 const reader=makeEv16R3Reader(receiptText,routingText,r1Text);
 const add=[
  {id:RECEIPT,sourceText:receiptText,origin:EV16_R3_ORIGINS.receipt},
  {id:ROUTE,sourceText:routingText,origin:EV16_R3_ORIGINS.routing},
  {id:R1,sourceText:r1Text,origin:EV16_R3_ORIGINS.r1},
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
   binding:{type:'local',sourceId:CODE},sourceDependencies:[RECEIPT,ROUTE,R1],
   contract:{schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{subject:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',subject:'string',sourceVerdict:'string',
     observationTier:'string',crossPublisherAuthority:'string',
     ownerReviewDecision:'string',formalEv16Cell:'string',
     originalGraphGitBlob:'string',r3ReceiptGitBlob:'string',r7RoutingGitBlob:'string',
     r1IndependentReviewGitBlob:'string',selectedCqChecks:'number',
     selectedQueryCount:'number',selectedConsumerCodeGitBlob:'string',
     sapQualified:'boolean',effectDispatched:'boolean'
    },additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const sources=[...f.sources,...add],expectedSourceOrigins={...f.expectedSourceOrigins,
  [RECEIPT]:EV16_R3_ORIGINS.receipt,[ROUTE]:EV16_R3_ORIGINS.routing,
  [R1]:EV16_R3_ORIGINS.r1,[CODE]:READER_ORIGIN};
 const artifact=compileDisV020Aot({built:f.artifact.built,program,sources,expectedSourceOrigins});
 const registry={...f.registry,[FN]:{sourceId:CODE,sha256:sourceSha256(code),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,execute:input=>reader.query(input)}};
 const installed=Object.fromEntries(add.map(x=>[x.id,{sha256:sourceSha256(x.sourceText),origin:x.origin}]));
 return {reader,receiptText,routingText,r1Text,code,artifact,registry,installed};
})();
const activate=x=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:ev16-original-r3-source-native'
});
test('C1 EV16 R3 two original DKE sources are selected DATA only by real AOT',async()=>{
 const x=await prepared,q=qualifyDisV020Artifact(x.artifact),f=q.functions.get(FN);
 assert.equal(f.definition.binding.sourceId,CODE);
 assert.equal(f.definition.effect,'none');
 assert.deepEqual(f.definition.sourceDependencies,[RECEIPT,ROUTE,R1]);
 assert.equal(q.pins.get(RECEIPT).origin.gitBlob,EV16_R3_ORIGINS.receipt.gitBlob);
 assert.equal(q.pins.get(ROUTE).origin.gitBlob,EV16_R3_ORIGINS.routing.gitBlob);
 assert.ok(q.sourceConsumers.get(RECEIPT).includes(FN));
 assert.ok(q.sourceConsumers.get(ROUTE).includes(FN));
 assert.equal(q.pins.get(R1).origin.gitBlob,EV16_R3_ORIGINS.r1.gitBlob);
 assert.ok(q.sourceConsumers.get(R1).includes(FN));
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
   assert.equal(out.value.r1IndependentReviewGitBlob,EV16_R3_ORIGINS.r1.gitBlob);
   assert.equal(out.value.selectedCqChecks,21);
   assert.equal(out.value.selectedQueryCount,10);
   assert.equal(out.value.selectedConsumerCodeGitBlob,'70005ef7c181260a6aaf041b829927fc4d194bed');
   assert.equal(out.value.sapQualified,false);assert.equal(out.value.effectDispatched,false);
  }
 }finally{app.stop()}
});
test('C1 EV16 R3 provenance forgery or Owner/Effect escalation is rejected at source, AOT or SDK',async()=>{
 const x=await prepared;
 assert.throws(()=>makeEv16R3Reader(x.receiptText+' ',x.routingText,x.r1Text),
  deny('DKE_EV16_R3_ORIGINAL_DATA_DRIFT'));
 assert.throws(()=>makeEv16R3Reader(x.receiptText,x.routingText+' ',x.r1Text),
  deny('DKE_EV16_R3_ORIGINAL_DATA_DRIFT'));
 assert.throws(()=>makeEv16R3Reader(x.receiptText,x.routingText,x.r1Text+' '),
  deny('DKE_EV16_R3_ORIGINAL_DATA_DRIFT'));
 // R1 red→green: a changing getter previously changed the selected subject
 // after the allowlist read and returned UNKNOWN for an unselected claim.
 let getterReads=0;
 const accessor={};
 Object.defineProperty(accessor,'subject',{enumerable:true,get(){
  getterReads++;return getterReads<=2?'EV16:D02+D04':'se:UNSELECTED';
 }});
 assert.throws(()=>x.reader.query(accessor),deny('DKE_EV16_R3_SUBJECT_INVALID'));
 assert.equal(getterReads,0,'the unauthorized getter must never execute');
 const throwing=new Proxy({subject:'EV16:D02+D04'},{
  ownKeys(){throw new Error('hostile query Proxy')}
 });
 assert.throws(()=>x.reader.query(throwing),deny('DKE_EV16_R3_SUBJECT_INVALID'));
 const inherited=Object.create({subject:'EV16:D02+D04'});
 assert.throws(()=>x.reader.query(inherited),deny('DKE_EV16_R3_SUBJECT_INVALID'));
 assert.throws(()=>x.reader.query({subject:'EV16:D02+D04',[Symbol('effect')]:true}),
  deny('DKE_EV16_R3_SUBJECT_INVALID'));
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

test('C1 EV16 R1 public native SDK preflight cannot invoke request getters or leak Proxy traps',async()=>{
 const x=await prepared,app=await activate(x);
 try{
  let getterReads=0;
  const changing={};
  Object.defineProperty(changing,'subject',{enumerable:true,get(){
   getterReads++;
   return getterReads===1?'EV16:D02+D04':'se:UNSELECTED';
  }});
  await assert.rejects(app.invoke(FN,changing,{expectedContractVersion:'1.0.0'}),
   deny('DIS_FUNCTION_INPUT_INVALID'));
  assert.equal(getterReads,0,'native schema guard must not run the caller getter before Reader');
  const trap=new Proxy({subject:'EV16:D02+D04'},{
   getPrototypeOf(){throw Error('hostile pre-reader Proxy trap')}
  });
  await assert.rejects(app.invoke(FN,trap,{expectedContractVersion:'1.0.0'}),
   deny('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(FN,
   {subject:'EV16:D02+D04',[Symbol('injected-privilege')]:true},
   {expectedContractVersion:'1.0.0'}),deny('DIS_FUNCTION_INPUT_INVALID'));
  const valid=await app.invoke(FN,{subject:'EV16:D02+D04'},
   {expectedContractVersion:'1.0.0'});
  assert.equal(valid.disposition,'UNKNOWN');
  assert.equal(valid.authority,'NONE');
  assert.equal(valid.evidence.attested,false);
  assert.equal(valid.value.sapQualified,false);
  assert.equal(valid.value.effectDispatched,false);
  const original=x.reader.query({subject:'EV16:D02+D04'});
  assert.equal(Object.isFrozen(original),true);
  assert.equal(original.status,'UNKNOWN');
  assert.equal(original.ownerReviewDecision,'NOT_RUN');
 }finally{app.stop()}
});
