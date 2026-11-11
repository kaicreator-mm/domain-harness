/** DIS #1497 R7 ← DKE #208 canonical-kg-r0 R4: real Forge KG/DEDS candidate
 * through the real AOT compile and SDK/KDP load seams. Fail-closed negatives:
 * unqualified SAP, wrong Source Owner, stale pin, Effect impersonation.
 * No qualified positive is fabricated — the only positive stays a typed
 * UNKNOWN candidate observation with authority NONE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {CANONICAL_KG_R4_ORIGINS,makeCanonicalKgR4Reader} from './dke-canonical-kg-r4-reader.mjs';

const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'5b7b5b1004fd5e44d34c76fcff923e3cc554d084',
 path:'examples/dis-v020-native-sdk/dke-canonical-kg-r4-reader.mjs',
 gitBlob:'893853b5a9521ed4ab3fd377cb432c1eecc55aef'
});
const FN='dke.ev14.kg.blueprint.inspect',CODE='dke-canonical-kg-r4-reader',
 BP='dke-ev14-blueprint-r1-sap',POL='dke-ev14-impact-edge-scope-policy-r2',
 SUBJECTS=['EV14-ROOT','EV14-GO','EV14-HTTP','EV14-PROVENANCE','EV14-NONENTAILMENT','EV14-QUALIFICATION'];
const deny=code=>e=>e?.code===code;
const prepared=(async()=>{
 const [f,bpText,polText,code]=await Promise.all([
  makeNativeFixture(),
  readFile(new URL('./fixtures/dke-ev14-blueprint-r1-sap.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-ev14-impact-edge-scope-policy-r2.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-canonical-kg-r4-reader.mjs',import.meta.url),'utf8')
 ]);
 assert.equal(sourceGitBlob(bpText),CANONICAL_KG_R4_ORIGINS.blueprint.gitBlob);
 assert.equal(sourceGitBlob(polText),CANONICAL_KG_R4_ORIGINS.policy.gitBlob);
 assert.equal(sourceGitBlob(code),READER_ORIGIN.gitBlob);
 const reader=makeCanonicalKgR4Reader(bpText,polText);
 const add=[
  {id:BP,sourceText:bpText,origin:CANONICAL_KG_R4_ORIGINS.blueprint},
  {id:POL,sourceText:polText,origin:CANONICAL_KG_R4_ORIGINS.policy},
  {id:CODE,sourceText:code,origin:READER_ORIGIN}
 ];
 const program=structuredClone(f.program);
 program.domains.push({
  id:'dke.ev14.kg',description:'DKE #208 canonical-kg R4 bounded KG/DEDS candidate DATA',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.ev14.kg.blueprint',domainId:'dke.ev14.kg',
  version:'1.0.0',kind:'knowledge',dependsOn:[],
  description:'Real Forge Blueprint R1 SAP candidate is observation DATA only; qualification and Effects stay unauthorized',
  functions:[{
   id:FN,kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:CODE},sourceDependencies:[BP,POL],
   contract:{schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{subject:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',subject:'string',elementKind:'string',
     sapProfileId:'string',sapState:'string',
     sapQualified:'boolean',simulatorPromotion:'boolean',disEffectsAuthorized:'boolean',
     root:'string',qualifiedElementSAPs:'number',fullyQualifiedR8:'string',
     qualifiedEffects:'number',blueprintRevision:'string',planDagEdges:'number',
     staticExecutableDagEdges:'number',blueprintGitBlob:'string',policyGitBlob:'string'
    },additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const sources=[...f.sources,...add],expectedSourceOrigins={...f.expectedSourceOrigins,
  [BP]:CANONICAL_KG_R4_ORIGINS.blueprint,[POL]:CANONICAL_KG_R4_ORIGINS.policy,
  [CODE]:READER_ORIGIN};
 const artifact=compileDisV020Aot({built:f.artifact.built,program,sources,expectedSourceOrigins});
 const registry={...f.registry,[FN]:{sourceId:CODE,sha256:sourceSha256(code),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,execute:input=>reader.query(input)}};
 const installed=Object.fromEntries(add.map(x=>[x.id,{sha256:sourceSha256(x.sourceText),origin:x.origin}]));
 return {reader,bpText,polText,code,artifact,registry,installed,program,
  built:f.artifact.built,sources,expectedSourceOrigins};
})();
const activate=x=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:dke-ev14-canonical-kg-r4-native'
});
test('C2 real Forge canonical-kg R4 candidate is selected DATA with candidate-only observation',async()=>{
 const x=await prepared,q=qualifyDisV020Artifact(x.artifact),f=q.functions.get(FN);
 assert.equal(f.definition.binding.sourceId,CODE);
 assert.equal(f.definition.effect,'none');
 assert.deepEqual(f.definition.sourceDependencies,[BP,POL]);
 assert.equal(q.pins.get(BP).origin.gitBlob,CANONICAL_KG_R4_ORIGINS.blueprint.gitBlob);
 assert.equal(q.pins.get(POL).origin.gitBlob,CANONICAL_KG_R4_ORIGINS.policy.gitBlob);
 assert.ok(q.sourceConsumers.get(BP).includes(FN));
 assert.ok(q.sourceConsumers.get(POL).includes(FN));
 const app=await activate(x);
 try{
  assert.equal(app.state,'READY');
  for(const subject of SUBJECTS){
   const out=await app.invoke(FN,{subject},{expectedContractVersion:'1.0.0'});
   assert.equal(out.kind,'OBSERVATION');
   assert.notEqual(out.kind,'KDP_RECEIPT');
   assert.equal(out.authority,'NONE');
   assert.equal(out.disposition,'UNKNOWN');
   assert.equal(out.evidence.attested,false);
   assert.equal(out.value.status,'UNKNOWN');
   assert.equal(out.value.subject,subject);
   assert.equal(out.value.sapState,'CANDIDATE_NOT_QUALIFIED');
   assert.equal(out.value.sapQualified,false);
   assert.equal(out.value.simulatorPromotion,false);
   assert.equal(out.value.disEffectsAuthorized,false);
   assert.equal(out.value.root,'UNKNOWN');
   assert.equal(out.value.qualifiedElementSAPs,0);
   assert.equal(out.value.fullyQualifiedR8,'0/53');
   assert.equal(out.value.qualifiedEffects,0);
   assert.equal(out.value.blueprintRevision,'EV14_BLUEPRINT_R1_ELEMENT_SAP_CANDIDATE');
   assert.equal(out.value.planDagEdges,6);
   assert.equal(out.value.staticExecutableDagEdges,0);
   assert.equal(out.value.blueprintGitBlob,CANONICAL_KG_R4_ORIGINS.blueprint.gitBlob);
   assert.equal(out.value.policyGitBlob,CANONICAL_KG_R4_ORIGINS.policy.gitBlob);
   assert.equal(Object.isFrozen(out),true);
  }
 }finally{app.stop()}
});
test('C2 unqualified SAP cannot gain Element validation authority or reader promotion',async()=>{
 const x=await prepared;
 for(const authority of ['SAP_QUALIFIED','OWNER_ATTESTED','DOMAIN_ORACLE']){
  const forged=structuredClone(x.artifact);
  const e=forged.program.elements.find(e=>e.id==='dke.ev14.kg.blueprint');
  e.validation={schema:'dis.v0.2.element-validation/1',sourceIds:[BP],authority};
  assert.throws(()=>qualifyDisV020Artifact(forged),deny('DIS_ELEMENT_VALIDATION_INVALID'));
 }
 assert.throws(()=>x.reader.query({subject:'EV14-GO',sap:true}),deny('DKE_EV14_KG_R4_SUBJECT_INVALID'));
 assert.throws(()=>x.reader.query({subject:'EV14-GO',qualification:'QUALIFIED'}),deny('DKE_EV14_KG_R4_SUBJECT_INVALID'));
 assert.throws(()=>x.reader.query({subject:'EV14-ROOT',ownerDecision:'APPROVED'}),deny('DKE_EV14_KG_R4_SUBJECT_INVALID'));
 const app=await activate(x);
 try{
  await assert.rejects(app.invoke(FN,{subject:'EV14-GO',sap:true},{expectedContractVersion:'1.0.0'}),
   deny('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(FN,{subject:'EV14-ROOT',qualification:'QUALIFIED'},{expectedContractVersion:'1.0.0'}),
   deny('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
});
test('C2 wrong Source Owner attribution is refused at AOT trust map and domain scope',async()=>{
 const x=await prepared;
 const wrongOwner={...x.expectedSourceOrigins,
  [BP]:{...x.expectedSourceOrigins[BP],repository:'kaicreator-mm/tally'}};
 assert.throws(()=>compileDisV020Aot({built:x.built,program:x.program,sources:x.sources,
  expectedSourceOrigins:wrongOwner}),deny('DIS_SOURCE_ORIGIN_UNTRUSTED'));
 const noForgeDomain=structuredClone(x.program);
 noForgeDomain.domains.find(d=>d.id==='dke.ev14.kg').repositories=['kaicreator-mm/domain-harness'];
 assert.throws(()=>compileDisV020Aot({built:x.built,program:noForgeDomain,sources:x.sources,
  expectedSourceOrigins:x.expectedSourceOrigins}),deny('DIS_SOURCE_DOMAIN_MISMATCH'));
});
test('C2 stale pin is fail-closed at AOT bytes and SDK installer anchor',async()=>{
 const x=await prepared;
 assert.throws(()=>compileDisV020Aot({built:x.built,program:x.program,
  sources:x.sources.map(s=>s.id===BP?{...s,sourceText:x.bpText+' '}:s),
  expectedSourceOrigins:x.expectedSourceOrigins}),deny('DIS_BUILD_SOURCE_BYTES_DRIFT'));
 const staleAnchor=structuredClone(x.installed);
 // The retired R0 Blueprint blob: a real older revision of the same artifact.
 staleAnchor[BP].origin.gitBlob='93f12dea21cf77121ddf2d28bacbd60e88ede91e';
 await assert.rejects(activate({...x,installed:staleAnchor}),deny('DIS_SOURCE_ANCHOR_STALE'));
});
test('C2 Effect impersonation is refused at source, AOT, registry and result shape',async()=>{
 const x=await prepared;
 assert.throws(()=>makeCanonicalKgR4Reader(x.bpText+' ',x.polText),deny('DKE_EV14_KG_R4_ORIGINAL_DATA_DRIFT'));
 assert.throws(()=>makeCanonicalKgR4Reader(x.bpText,x.polText+' '),deny('DKE_EV14_KG_R4_ORIGINAL_DATA_DRIFT'));
 // DKE DATA masquerading as executable local code.
 const asCode=structuredClone(x.artifact);
 const element=asCode.program.elements.find(e=>e.id==='dke.ev14.kg.blueprint');
 element.functions[0].binding={type:'local',sourceId:BP};
 element.functions[0].sourceDependencies=[POL];
 assert.throws(()=>qualifyDisV020Artifact(asCode),deny('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
 // Knowledge observation claiming governed Effect via KDP intent without a
 // selected business route.
 const governed=structuredClone(x.artifact);
 const gfn=governed.program.elements.find(e=>e.id==='dke.ev14.kg.blueprint').functions[0];
 delete gfn.sourceDependencies;delete gfn.contract;
 gfn.effect='governed';gfn.binding={type:'kdp-intent',intentId:'confirmDownload'};
 assert.throws(()=>qualifyDisV020Artifact(governed),deny('DIS_INTENT_INVALID'));
 // Local observation claiming governed Effect.
 const govLocal=structuredClone(x.artifact);
 const lfn=govLocal.program.elements.find(e=>e.id==='dke.ev14.kg.blueprint').functions[0];
 lfn.effect='governed';
 assert.throws(()=>qualifyDisV020Artifact(govLocal),deny('DIS_LOCAL_NOT_QUALIFIED'));
 // Effect-kind Function bound to local observation code.
 const effKind=structuredClone(x.artifact);
 const kfn=effKind.program.elements.find(e=>e.id==='dke.ev14.kg.blueprint').functions[0];
 kfn.kind='effect';
 assert.throws(()=>qualifyDisV020Artifact(effKind),deny('DIS_LOCAL_NOT_QUALIFIED'));
 const fakeRegistry={...x.registry,[FN]:{...x.registry[FN],sha256:'0'.repeat(64)}};
 await assert.rejects(activate({...x,registry:fakeRegistry}),deny('DIS_LOCAL_REGISTRY_MISMATCH'));
 const app=await activate(x);
 try{
  const out=await app.invoke(FN,{subject:'EV14-GO'},{expectedContractVersion:'1.0.0'});
  assert.equal(out.kind,'OBSERVATION');assert.equal(out.authority,'NONE');
  assert.equal(out.evidence.attested,false);
  await assert.rejects(app.invoke(FN,{subject:'EV14-GO',effect:true},{expectedContractVersion:'1.0.0'}),
   deny('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
});
test('C2 hostile query inputs never execute unauthorized getters or proxies',async()=>{
 const x=await prepared;
 let getterReads=0;
 const changing={};
 Object.defineProperty(changing,'subject',{enumerable:true,get(){
  getterReads++;return getterReads===1?'EV14-GO':'EV14-ROOT';
 }});
 assert.throws(()=>x.reader.query(changing),deny('DKE_EV14_KG_R4_SUBJECT_INVALID'));
 assert.equal(getterReads,0,'the unauthorized getter must never execute');
 const throwing=new Proxy({subject:'EV14-GO'},{ownKeys(){throw new Error('hostile query Proxy')}});
 assert.throws(()=>x.reader.query(throwing),deny('DKE_EV14_KG_R4_SUBJECT_INVALID'));
 const inherited=Object.create({subject:'EV14-GO'});
 assert.throws(()=>x.reader.query(inherited),deny('DKE_EV14_KG_R4_SUBJECT_INVALID'));
 assert.throws(()=>x.reader.query({subject:'EV14-GO',[Symbol('effect')]:true}),deny('DKE_EV14_KG_R4_SUBJECT_INVALID'));
 assert.throws(()=>x.reader.query({subject:'EV14-UNSELECTED'}),deny('DKE_EV14_KG_R4_SUBJECT_INVALID'));
 const app=await activate(x);
 try{
  const trap=new Proxy({subject:'EV14-GO'},{getPrototypeOf(){throw Error('hostile pre-reader Proxy trap')}});
  await assert.rejects(app.invoke(FN,trap,{expectedContractVersion:'1.0.0'}),deny('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(FN,{subject:'EV14-GO',[Symbol('injected-privilege')]:true},{expectedContractVersion:'1.0.0'}),
   deny('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
});
