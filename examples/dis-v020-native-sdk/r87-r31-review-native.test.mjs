/** R87 DKE R31 genuine source-first Critic receipt → DIS native AOT/SDK/KDP.
 * Source-first Critic ≠ Product Owner ReviewDecision ≠ accepted semantic SAP.
 * The original 807-node Tally graph is referenced by evidence, not republished here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {R31_REVIEW_ORIGIN,makeR31SourceCriticReader} from './dke-r31-critic-reader.mjs';

const FN='dke.r31.critic.reviewScoped',DATA='dke-r31-original-source-first-critic-r5',
 CODE='dke-r31-source-critic-reader';
const READER_ORIGIN=Object.freeze({repository:'kaicreator-mm/domain-harness',
 commit:'9c465336ebc86d446914fdd55c1cbfe47eb2e186',
 path:'examples/dis-v020-native-sdk/dke-r31-critic-reader.mjs',
 gitBlob:'fb76d72e85253bbb535f748d9cfcb09203c55ac1'});
const selected=Object.freeze([
 'se:CLM-REQ-FUNCTIONAL-DOC-METHODS','se:CLM-TVV-0001','se:REL-TVV-0020'
]);
const err=code=>x=>x?.code===code;
const context=(async()=>{
 const [f,raw,code]=await Promise.all([makeNativeFixture(),
  readFile(new URL('./fixtures/dke-r31-original-critic-r5-receipt.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-r31-critic-reader.mjs',import.meta.url),'utf8')]);
 assert.equal(sourceGitBlob(raw),R31_REVIEW_ORIGIN.gitBlob);
 assert.equal(sourceGitBlob(code),READER_ORIGIN.gitBlob);
 const reader=makeR31SourceCriticReader(raw);
 const add=[{id:DATA,sourceText:raw,origin:R31_REVIEW_ORIGIN},
  {id:CODE,sourceText:code,origin:READER_ORIGIN}];
 const p=structuredClone(f.program);
 p.domains.push({id:'dke.r31.review-source',description:'Original source-first scoped Critic receipt, owner not approved',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']});
 p.elements.push({id:'dke.r31.review-admission',domainId:'dke.r31.review-source',
  version:'1.0.0',kind:'knowledge',dependsOn:[],
  description:'Read only three specific reviewer findings, never mint Domain SAP',
  functions:[{id:FN,description:'Independent Critic recommendation is not accepted Owner knowledge',
   kind:'knowledge',effect:'none',binding:{type:'local',sourceId:CODE},
   sourceDependencies:[DATA],
   contract:{schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{subject:'string'},additionalProperties:false},
    output:{type:'record',fields:{status:'string',subject:'string',
     criticRecommendation:'string',reviewerContext:'string',sourceState:'string',
     reviewerScoped:'boolean',ownerReviewDecision:'string',sapQualified:'boolean',
     effectDispatched:'boolean',p2Open:'number',receiptGitBlob:'string'},
     additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}}}]});
 const sources=[...f.sources,...add],origins={...f.expectedSourceOrigins,
  [DATA]:R31_REVIEW_ORIGIN,[CODE]:READER_ORIGIN};
 const artifact=compileDisV020Aot({built:f.artifact.built,program:p,sources,
  expectedSourceOrigins:origins});
 const registry={...f.registry,[FN]:{sourceId:CODE,sha256:sourceSha256(code),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,execute:input=>reader.query(input)}};
 const pinned=Object.fromEntries(add.map(x=>[x.id,{
  sha256:sourceSha256(x.sourceText),origin:x.origin}]));
 return {f,raw,code,reader,artifact,registry,pinned};
})();
const activate=x=>loadDisV020Aot(x.artifact,{expectedDigest:x.artifact.digest,
 expectedSourcePins:x.pinned,registry:x.registry,store:new PlainCasDocStore(),
 tenantId:'tenant:dke-r31-independent-critic-no-owner'});

test('R87 DKE R31 original independent Critic DATA and LOCAL Reader are exact source selected by AOT',async()=>{
 const x=await context,q=qualifyDisV020Artifact(x.artifact),def=q.functions.get(FN);
 assert.equal(def.definition.kind,'knowledge');
 assert.equal(def.definition.effect,'none');
 assert.equal(def.definition.binding.sourceId,CODE);
 assert.deepEqual(def.definition.sourceDependencies,[DATA]);
 assert.equal(q.pins.get(DATA).origin.gitBlob,R31_REVIEW_ORIGIN.gitBlob);
 assert.equal(q.pins.get(CODE).origin.gitBlob,READER_ORIGIN.gitBlob);
 assert.ok(q.sourceConsumers.get(DATA).includes(FN));
 const app=await activate(x);
 try{assert.equal(app.state,'READY');}finally{app.stop()}
});

test('R87 real source-first 2 Claims + derived NIST Relation stay typed UNKNOWN until Owner SAP',async()=>{
 const x=await context,app=await activate(x);
 try{for(const subject of selected){
  const out=await app.invoke(FN,{subject},{expectedContractVersion:'1.0.0'});
  assert.equal(out.kind,'OBSERVATION');
  assert.equal(out.disposition,'UNKNOWN');
  assert.equal(out.authority,'NONE');
  assert.equal(out.evidence.attested,false);
  assert.equal(out.value.status,'UNKNOWN');
  assert.equal(out.value.subject,subject);
  assert.equal(out.value.criticRecommendation,subject.startsWith('se:CLM-')?
   'SUPPORTED_WITH_CURRICULUM_SCOPE':'DERIVED_PENDING_OWNER_REVIEW');
  assert.equal(out.value.reviewerContext,'SOURCE_FIRST_CONTEXT_NOT_AUTHENTICATED_HUMAN');
  assert.equal(out.value.ownerReviewDecision,'NOT_RUN');
  assert.equal(out.value.reviewerScoped,true);
  assert.equal(out.value.sapQualified,false);
  assert.equal(out.value.effectDispatched,false);
  assert.equal(out.value.p2Open,2);
  assert.equal(out.value.receiptGitBlob,R31_REVIEW_ORIGIN.gitBlob);
 }}finally{app.stop()}
});

test('R87 original reviewer receipt, registry and independent installer pins cannot be forged before KDP',async()=>{
 const x=await context;
 const stale=structuredClone(x.pinned);stale[DATA].sha256='0'.repeat(64);
 await assert.rejects(activate({...x,pinned:stale}),err('DIS_SOURCE_ANCHOR_STALE'));
 const wrongOrigin=structuredClone(x.pinned);wrongOrigin[DATA].origin.commit='0'.repeat(40);
 await assert.rejects(activate({...x,pinned:wrongOrigin}),err('DIS_SOURCE_ANCHOR_STALE'));
 const fakeRegistry={...x.registry,[FN]:{...x.registry[FN],sha256:'0'.repeat(64)}};
 await assert.rejects(activate({...x,registry:fakeRegistry}),err('DIS_LOCAL_REGISTRY_MISMATCH'));
 const missing=structuredClone(x.pinned);delete missing[DATA];
 await assert.rejects(activate({...x,pinned:missing}),e=>Boolean(e));
 await assert.rejects(loadDisV020Aot(x.artifact,{
  expectedDigest:'0'.repeat(64),registry:x.registry,expectedSourcePins:x.pinned,
  store:new PlainCasDocStore(),tenantId:'tenant:r31-stale-aot'
 }),err('DIS_INSTALLED_AOT_MISMATCH'));
});

test('R87 forged reviewer, Owner and runtime Effect requests fail closed without SAP',async()=>{
 const x=await context;
 assert.throws(()=>makeR31SourceCriticReader(x.raw+' '),err('DKE_R31_REVIEW_SOURCE_ANCHOR_DRIFT'));
 assert.throws(()=>makeR31SourceCriticReader(x.raw,{...R31_REVIEW_ORIGIN,commit:'0'.repeat(40)}),
  err('DKE_R31_REVIEW_SOURCE_ANCHOR_DRIFT'));
 for(const input of [
  {subject:'se:CLM-TVV-0001',ownerReviewDecision:'ACCEPTED'},
  {subject:'se:REL-TVV-0020',sapQualified:true},
  {subject:'se:CLM-REQ-FUNCTIONAL-DOC-METHODS',effect:true},
  {subject:'se:CLM-TVV-0001',independentHumanOracle:true},
  {subject:'se:DM-REQ-FUNCTIONAL-DOC-METHOD'},
  {subject:'se:REL-TVV-0020',p2Open:0}
 ])assert.throws(()=>x.reader.query(input),err('DKE_R31_REVIEW_QUERY_NOT_SELECTED'));
 const app=await activate(x);
 try{
  await assert.rejects(app.invoke(FN,{subject:'se:REL-TVV-0020',sapQualified:true}),e=>Boolean(e));
  const r=await app.invoke(FN,{subject:'se:REL-TVV-0020'});
  assert.equal(r.authority,'NONE');
  assert.equal(r.value.sapQualified,false);
  assert.equal(r.value.effectDispatched,false);
 }finally{app.stop()}
});
