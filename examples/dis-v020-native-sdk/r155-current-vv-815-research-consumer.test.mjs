/** R155 / DIE #4 — current 815-node two-leg VV research candidate consumed
 * through the real selected AOT compile and SDK/KDP load seams. The original
 * 807-node frozen B23/R23 evidence is NOT loaded or re-pinned here; this file
 * only reads the frozen 807 fixture bytes as a real stale-graph NEGATIVE.
 * The only positive is a typed read-only OBSERVATION/UNKNOWN research
 * currentness witness with authority NONE — never qualified SAP, Oracle, R8
 * cell, Host, Effect, or Release.
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
import {makeCurrentVv815Reader} from './r155-current-vv-815-research-consumer.mjs';

// The current 815-node graph is consumed at its materialized in-repo
// location (precedent: dke-selected-consumer DATA_SOURCE). The R64 docs/
// exceptions are deliberately NOT expanded; upstream provenance stays
// pinned inside the reader and the Forge producer record, and the Git Blob
// here is byte-identical to the upstream Tally blob.
const GRAPH_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'064740ddecfc257ba4f3e1c50f3025b87660ea81',
 path:'examples/dis-v020-native-sdk/fixtures/r155-c1-v212-graph-815.jsonld',
 gitBlob:'a49ddf58a0c4a5b25ebdd4018c8234f64e6365e0'
});
const UPSTREAM=Object.freeze({
 tallyHead:'580b3ace16b4c28dbb1ff1b0a018d66896a3418d',
 tallyGraphPath:'docs/versions/v2.1.2/knowledge/generated/graph.jsonld',
 forgeHead:'4e7b34075a00426fb9207f33de8115e1e670a934'
});
const FORGE_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-forge',
 commit:'4e7b34075a00426fb9207f33de8115e1e670a934',
 path:'docs/standards/dke/DKE-0.0.1/demos/ev16-d04-source-tier-r0/EV16_D02_VV_SELECTED_CQ_TWO_LEG_SOURCE_REPIN_R143.json',
 gitBlob:'63d671aa270df0eff649cd34a5f6258f4c9cbc21'
});
const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'064740ddecfc257ba4f3e1c50f3025b87660ea81',
 path:'examples/dis-v020-native-sdk/r155-current-vv-815-research-consumer.mjs',
 gitBlob:'234997708b5520d7f9ce5997eb7ad6ff963a5e68'
});
const FROZEN_807_GIT_BLOB='0f6007315fd7352fe6fd218effcfecf672cb4961';
const GRAPH='r155-graph-815',FORGE='r155-forge-selected',CODE='r155-reader';
const FN='dke.ev16.d02.vv.current815.observe',ELEMENT='dke.ev16.d02.vv.current815';
const BINDING='se:SCB-CS2023-VV-R1';
const invalid=code=>e=>e?.code===code;
const fields={
 status:'string',subject:'string',selectedCq:'string',ownerElementId:'string',
 bindingId:'string',sapRef:'string',sourceGraphGitBlob:'string',
 forgeSelectedGitBlob:'string',producerTallyHead:'string',producerForgeHead:'string',
 currentness:'string',bindingScope:'string',professionalOracleStatus:'string',
 publicationPermission:'string',claimReviewStatus:'string',
 outcomeSupportStatus:'string',sectionAnchorType:'string',
 sectionEvidenceId:'string',sectionLocatorId:'string',
 sectionPrintedPage:'number',sectionPdfZeroBasedPage:'number',
 outcomeAnchorType:'string',outcomeSupportRelationId:'string',
 outcomeEvidenceId:'string',outcomeLocatorId:'string',
 outcomePrintedPage:'number',outcomePdfZeroBasedPage:'number',
 siblingCrossCutObserved:'string',sourceBytesVerified:'boolean',
 claimQualified:'boolean',qualifiedSap:'boolean',parentQualified:'boolean',
 rootQualified:'boolean',oracleAttested:'boolean',effectDispatched:'boolean'
};
const prepared=(async()=>{
 const [fixture,graphText,forgeText,code,stale807]=await Promise.all([
  makeNativeFixture(),
  readFile(new URL('./fixtures/r155-c1-v212-graph-815.jsonld',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/r155-ev16-d02-vv-two-leg-source-repin-r143.json',import.meta.url),'utf8'),
  readFile(new URL('./r155-current-vv-815-research-consumer.mjs',import.meta.url),'utf8'),
  // Read-only reuse of the existing frozen 807 fixture as stale NEG bytes.
  readFile(new URL('./fixtures/dke-r23-ev16-tally-full.jsonld',import.meta.url),'utf8')
 ]);
 assert.equal(sourceGitBlob(graphText),GRAPH_ORIGIN.gitBlob);
 assert.equal(sourceGitBlob(forgeText),FORGE_ORIGIN.gitBlob);
 assert.equal(sourceGitBlob(code),READER_ORIGIN.gitBlob);
 assert.equal(JSON.parse(graphText)['@graph'].length,815);
 assert.equal(JSON.parse(stale807)['@graph'].length,807);
 const reader=makeCurrentVv815Reader(graphText,forgeText);
 assert.equal(reader.summary.currentnessVerified,true);
 assert.equal(reader.summary.authority,'NONE');
 const added=[GRAPH,FORGE,CODE].map((id,i)=>({
  id,sourceText:[graphText,forgeText,code][i],
  origin:[GRAPH_ORIGIN,FORGE_ORIGIN,READER_ORIGIN][i]}));
 const program=structuredClone(fixture.program);
 program.domains.push({id:'dke.ev16.r155',
  description:'Current 815-node two-leg VV research candidate, read-only observation',
  repositories:['kaicreator-mm/tally','kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']});
 program.elements.push({
  id:ELEMENT,domainId:'dke.ev16.r155',version:'1.0.0',kind:'knowledge',
  description:'Current-source VV selected CQ binding observation; formally unqualified',
  dependsOn:[],functions:[{
   id:FN,kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:CODE},
   sourceDependencies:[GRAPH,FORGE],
   contract:{
    schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{subject:'string'},additionalProperties:false},
    output:{type:'record',fields,additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const sources=[...fixture.sources,...added];
 const expectedSourceOrigins={...fixture.expectedSourceOrigins,
  [GRAPH]:GRAPH_ORIGIN,[FORGE]:FORGE_ORIGIN,[CODE]:READER_ORIGIN};
 const compile=(p=program,s=sources,o=expectedSourceOrigins)=>compileDisV020Aot({
  built:fixture.artifact.built,program:p,sources:s,expectedSourceOrigins:o});
 const registry={...fixture.registry,[FN]:{
  sourceId:CODE,sha256:sourceSha256(code),origin:READER_ORIGIN,
  gitBlob:READER_ORIGIN.gitBlob,
  execute:input=>{
   if(input?.subject!==BINDING){
    const error=new Error('DKE_R155_UNSELECTED_BINDING');
    error.code='DKE_R155_UNSELECTED_BINDING';throw error;
   }
   const out=reader.query({subject:input.subject});
   if(out.sourceBytesVerified!==true||out.currentness!=='OBSERVED_RESEARCH_ONLY')
    throw Error('DKE_R155_SOURCE_PRECONDITION');
   return out;
  }}};
 const expectedPins=Object.fromEntries(added.map(s=>[s.id,{
  sha256:sourceSha256(s.sourceText),origin:s.origin}]));
 return {fixture,reader,graphText,forgeText,code,stale807,program,sources,
  expectedSourceOrigins,compile,registry,expectedPins,artifact:compile()};
})();
const boot=x=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,
 expectedSourcePins:x.expectedPins,
 store:new PlainCasDocStore(),tenantId:'tenant:r155-current-vv-815-research'});
test('R155 current 815 graph and Forge two-leg repin are pinned in real AOT with effect:none',async()=>{
 const x=await prepared,q=qualifyDisV020Artifact(x.artifact);
 const fn=q.functions.get(FN);
 assert.ok(fn);assert.equal(fn.element.id,ELEMENT);
 assert.equal(fn.definition.effect,'none');
 assert.equal(fn.definition.binding.sourceId,CODE);
 assert.deepEqual(fn.definition.sourceDependencies,[GRAPH,FORGE]);
 assert.deepEqual(q.elements.get(ELEMENT).dependsOn,[]);
 assert.equal(q.pins.get(GRAPH).origin.gitBlob,GRAPH_ORIGIN.gitBlob);
 assert.equal(q.pins.get(GRAPH).origin.commit,GRAPH_ORIGIN.commit);
 assert.equal(q.pins.get(FORGE).origin.gitBlob,FORGE_ORIGIN.gitBlob);
 assert.equal(q.pins.get(CODE).origin.gitBlob,READER_ORIGIN.gitBlob);
 // Upstream provenance is pinned by the reader and cross-checked against
 // the Forge producer record, bridging the in-repo bytes to Tally upstream.
 assert.equal(x.reader.pins.tallyHead,UPSTREAM.tallyHead);
 assert.equal(x.reader.summary.producerTallyHead,UPSTREAM.tallyHead);
 assert.equal(x.reader.summary.producerForgeHead,UPSTREAM.forgeHead);
 assert.ok(q.sourceConsumers.get(GRAPH).includes(FN));
 assert.ok(q.sourceConsumers.get(FORGE).includes(FN));
 const app=await boot(x);try{assert.equal(app.state,'READY')}finally{app.stop()}
});
test('R155 selected SDK knowledge Function observes current research currentness, never qualification',async()=>{
 const x=await prepared,app=await boot(x);
 try{
  const r=await app.invoke(FN,{subject:BINDING},{expectedContractVersion:'1.0.0'});
  assert.equal(r.kind,'OBSERVATION');
  assert.notEqual(r.kind,'KDP_RECEIPT');
  assert.equal(r.disposition,'UNKNOWN');
  assert.equal(r.authority,'NONE');
  assert.equal(r.evidence.attested,false);
  assert.equal(Object.isFrozen(r),true);
  const v=r.value;
  // Precise current-source identity survives source → typed Function → SDK.
  assert.equal(v.status,'UNKNOWN');
  assert.equal(v.subject,BINDING);
  assert.equal(v.selectedCq,'CS2023_VV_TEACHING');
  assert.equal(v.ownerElementId,'dke:ev16.d02.se-verification-child');
  assert.equal(v.sapRef,'dke:sap.cs2023.vv-distinction');
  assert.equal(v.sourceGraphGitBlob,GRAPH_ORIGIN.gitBlob);
  assert.equal(v.forgeSelectedGitBlob,FORGE_ORIGIN.gitBlob);
  assert.equal(v.producerTallyHead,UPSTREAM.tallyHead);
  assert.equal(v.producerForgeHead,UPSTREAM.forgeHead);
  assert.equal(v.currentness,'OBSERVED_RESEARCH_ONLY');
  assert.equal(v.bindingScope,'SELECTED_CQ_RESEARCH_CANDIDATE_ONLY_NOT_FROZEN_R8_CELL');
  // p246 SECTION direct leg vs separate p248 PAGE PENDING support leg.
  assert.equal(v.claimReviewStatus,'PENDING');
  assert.equal(v.outcomeSupportStatus,'PENDING_REVIEW');
  assert.equal(v.sectionAnchorType,'SECTION');
  assert.equal(v.sectionEvidenceId,'se:EVD-TVV-0003');
  assert.equal(v.sectionLocatorId,'se:LOC-CS2023-SE-VALIDATION-KU');
  assert.equal(v.sectionPrintedPage,246);
  assert.equal(v.sectionPdfZeroBasedPage,245);
  assert.equal(v.outcomeAnchorType,'PAGE');
  assert.equal(v.outcomeSupportRelationId,'se:REL-TVV-0024');
  assert.equal(v.outcomeEvidenceId,'se:EVD-TVV-0016');
  assert.equal(v.outcomeLocatorId,'se:LOC-CS2023-SE-VALIDATION-LO2');
  assert.equal(v.outcomePrintedPage,248);
  assert.equal(v.outcomePdfZeroBasedPage,247);
  assert.equal(v.siblingCrossCutObserved,
   'NON_NORMATIVE_PENDING_REVIEW_OUTSIDE_BINDING_CHAIN');
  assert.equal(v.sourceBytesVerified,true);
  // Semantic admission stays fully closed at the current version.
  assert.equal(v.claimQualified,false);
  assert.equal(v.qualifiedSap,false);
  assert.equal(v.parentQualified,false);
  assert.equal(v.rootQualified,false);
  assert.equal(v.oracleAttested,false);
  assert.equal(v.effectDispatched,false);
 }finally{app.stop()}
});
test('R155 stale or drifted source bytes fail closed: real frozen 807 bytes are a NEGATIVE here',async()=>{
 const x=await prepared;
 // The actual frozen 807-node graph bytes are stale in the current scope.
 assert.throws(()=>makeCurrentVv815Reader(x.stale807,x.forgeText),
  invalid('R155_CURRENT_GRAPH_GIT_BLOB_MISMATCH'));
 assert.throws(()=>makeCurrentVv815Reader(x.stale807+' ',x.forgeText),
  invalid('R155_CURRENT_GRAPH_GIT_BLOB_MISMATCH'));
 assert.throws(()=>makeCurrentVv815Reader(x.graphText,x.forgeText+' '),
  invalid('R155_FORGE_SELECTED_GIT_BLOB_MISMATCH'));
 assert.throws(()=>makeCurrentVv815Reader(null,x.forgeText),
  invalid('R155_CURRENT_GRAPH_GIT_BLOB_MISMATCH'));
 const {gitBlobUtf8Text}=await import(
  './r155-current-vv-815-research-consumer.mjs');
 assert.throws(()=>gitBlobUtf8Text(null),invalid('R155_BYTES_REQUIRED'));
 // The frozen 807 blob never satisfies the current pin and vice versa.
 assert.notEqual(GRAPH_ORIGIN.gitBlob,FROZEN_807_GIT_BLOB);
 // Compile-time byte drift and boot-time stale anchors.
 assert.throws(()=>x.compile(x.program,
  x.sources.map(s=>s.id===GRAPH?{...s,sourceText:x.graphText+' '}:s),
  x.expectedSourceOrigins),invalid('DIS_BUILD_SOURCE_BYTES_DRIFT'));
 for(const id of [GRAPH,FORGE]){
  const bad=structuredClone(x.expectedPins);
  bad[id].sha256='f'.repeat(64);
  await assert.rejects(boot({...x,expectedPins:bad}),
   invalid('DIS_SOURCE_ANCHOR_STALE'));
 }
 // The real older frozen 807 blob as a boot anchor: genuine stale revision.
 const staleAnchor=structuredClone(x.expectedPins);
 staleAnchor[GRAPH].origin.gitBlob=FROZEN_807_GIT_BLOB;
 await assert.rejects(boot({...x,expectedPins:staleAnchor}),
  invalid('DIS_SOURCE_ANCHOR_STALE'));
});
test('R155 semantic mutations of the current two-leg structure fail closed',async()=>{
 const x=await prepared;
 // Control: the pinned bytes themselves always pass both structural layers.
 x.reader.validateCurrentGraphStructure();
 x.reader.validateForgeSelectedStructure();
 const g=()=>JSON.parse(x.graphText);
 // Every byte-level mutation is already BLOCKed by the Git Blob pin; the
 // direct validator probes below prove the structural layer also rejects
 // each semantic class on its own, beyond byte identity.
 const {validateCurrentGraphStructure}=await import(
  './r155-current-vv-815-research-consumer.mjs');
 const cases=[
  ['R155_CLAIM_DIRECT_SUPPORT_FORGED',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:CLM-TVV-0001')['se:SUPPORTED_BY']={'@id':'se:EVD-TVV-0016'}}],
  ['R155_CLAIM_DIRECT_SUPPORT_FORGED',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:CLM-TVV-0001')['se:evidence_refs']={'@id':'se:EVD-TVV-0016'}}],
  ['R155_CLAIM_REVIEW_DECISION_OBSERVED',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:CLM-TVV-0001')['se:review_status']='APPROVED'}],
  ['R155_OUTCOME_SUPPORT_EDGE_DRIFT',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:REL-TVV-0024')['se:object_ref']={'@id':'se:EVD-TVV-0003'}}],
  ['R155_OUTCOME_SUPPORT_EDGE_DRIFT',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:REL-TVV-0024')['se:subject_ref']={'@id':'se:CLM-REQ-0001'}}],
  ['R155_OUTCOME_SUPPORT_NOT_PENDING',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:REL-TVV-0024')['se:lifecycle_status']='REVIEWED'}],
  ['R155_OUTCOME_SUPPORT_SYNTHETIC',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:REL-TVV-0024')['se:synthetic']=true}],
  ['R155_OUTCOME_EVIDENCE_INVALID',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:EVD-TVV-0016')['se:source_locator_ref']={'@id':'se:LOC-OTHER'}}],
  ['R155_SIBLING_CROSS_CUT_DRIFT',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:REL-TVV-0020')['se:predicate']={'@id':'se:SUPPORTED_BY'}}],
  ['R155_SIBLING_POISONED_BINDING_CHAIN',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:SCB-CS2023-VV-R1')['se:cross_cut_ref']={'@id':'se:REL-TVV-0020'}}],
  ['R155_CURRENT_GRAPH_ROSTER_815',gr=>{gr['@graph'].splice(0,8)}],
  ['R155_CURRENT_GRAPH_ROSTER_815',gr=>{ // substitute the frozen 807 roster
    const old=JSON.parse(x.stale807);gr['@graph']=old['@graph']}],
  ['R155_GRAPH_DUPLICATE_ID',gr=>{ // same length, one id duplicated
    const clone=structuredClone(gr['@graph'].find(n=>n['@id']==='se:CLM-TVV-0001'));
    gr['@graph'][gr['@graph'].length-1]=clone}],
  ['R155_BINDING_ROSTER_INVALID',gr=>{ // replace an unchecked-type record
    const scb=structuredClone(gr['@graph'].find(n=>n['@id']==='se:SCB-CS2023-VV-R1'));
    scb['@id']='se:SCB-FORGED';
    const i=gr['@graph'].findIndex(n=>!['se:RelationshipAssertion',
     'se:KnowledgeClaim','se:Evidence','se:SelectedCqSourceBinding']
     .includes(n['@type']));
    if(i<0)throw new Error('fixture lost unchecked-type record');
    gr['@graph'][i]=scb}],
  ['R155_LOCATOR_RECORDS_INVALID',gr=>{gr['@graph'].find(
    n=>n['@id']==='se:LOC-CS2023-SE-VALIDATION-KU')['se:record_version']='0.1.0'}],
 ];
 for(const [code,fn] of cases){
  const gr=g();fn(gr);
  assert.throws(()=>validateCurrentGraphStructure(gr),invalid(code),code);
 }
 // Forge-side semantic tampering.
 const forgeCases=[
  ['R155_FORGE_STATE_NOT_UNQUALIFIED',f=>{f.state='QUALIFIED'}],
  ['R155_FORGE_PRODUCER_INVALID',f=>{f.producer.candidateNodes=807}],
  ['R155_FORGE_PRODUCER_INVALID',f=>{f.producer.candidateGraphGitBlob=FROZEN_807_GIT_BLOB}],
  ['R155_FORGE_PRODUCER_INVALID',f=>{f.producer.reviewDecisions=2}],
  ['R155_FORGE_REPIN_SCOPE_INVALID',f=>{f.repinScope.bindingScope='FROZEN_R8_CELL'}],
  ['R155_FORGE_CLAIM_LEG_INVALID',f=>{f.selectedCqSourceBinding.claim.reviewStatus='APPROVED'}],
  ['R155_FORGE_SECTION_LEG_INVALID',f=>{f.selectedCqSourceBinding.sectionLeg.locator.printedPage=245}],
  ['R155_FORGE_OUTCOME_LEG_INVALID',f=>{f.selectedCqSourceBinding.outcomeLeg.evidence.id='se:EVD-TVV-0003'}],
 ];
 const {validateForgeSelectedStructure}=await import(
  './r155-current-vv-815-research-consumer.mjs');
 for(const [code,fn] of forgeCases){
  const f=JSON.parse(x.forgeText);fn(f);
  assert.throws(()=>validateForgeSelectedStructure(f),invalid(code),code);
 }
});
test('R155 forged provenance, wrong owner, DATA-as-executable and stale compile fail closed',async()=>{
 const x=await prepared;
 const wrong=structuredClone(x.expectedSourceOrigins);
 wrong[GRAPH]={...wrong[GRAPH],gitBlob:FROZEN_807_GIT_BLOB};
 assert.throws(()=>x.compile(x.program,x.sources,wrong),
  invalid('DIS_SOURCE_ORIGIN_UNTRUSTED'));
 const wrongOwner={...x.expectedSourceOrigins,
  [GRAPH]:{...x.expectedSourceOrigins[GRAPH],repository:'kaicreator-mm/runx'}};
 assert.throws(()=>x.compile(x.program,x.sources,wrongOwner),
  invalid('DIS_SOURCE_ORIGIN_UNTRUSTED'));
 const noForgeDomain=structuredClone(x.program);
 noForgeDomain.domains.find(d=>d.id==='dke.ev16.r155').repositories=
  ['kaicreator-mm/tally','kaicreator-mm/domain-harness'];
 assert.throws(()=>x.compile(noForgeDomain),
  invalid('DIS_SOURCE_DOMAIN_MISMATCH'));
 // Forge two-leg DATA masquerading as executable local code.
 const asCode=structuredClone(x.program);
 const fn=asCode.elements.find(e=>e.id===ELEMENT).functions[0];
 fn.binding={type:'local',sourceId:FORGE};
 delete fn.sourceDependencies;
 assert.throws(()=>qualifyDisV020Artifact(x.compile(asCode)),
  invalid('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
});
test('R155 untrusted callers, forged qualification values and hostile inputs stay authority NONE',async()=>{
 const x=await prepared,app=await boot(x);
 try{
  await assert.rejects(app.invoke(FN,{subject:BINDING,oracleAttested:true},
   {expectedContractVersion:'1.0.0'}),invalid('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(FN,{subject:'se:CLM-TVV-0001'}),
   invalid('DKE_R155_UNSELECTED_BINDING'));
  await assert.rejects(app.invoke(FN,{subject:'se:REL-TVV-0024'}),
   invalid('DKE_R155_UNSELECTED_BINDING'));
  await assert.rejects(app.invoke(FN,{subject:BINDING},
   {expectedContractVersion:'2.0.0'}),invalid('DIS_FUNCTION_VERSION_MISMATCH'));
  const trap=new Proxy({subject:BINDING},{getPrototypeOf(){
   throw Error('hostile pre-reader Proxy trap')}});
  await assert.rejects(app.invoke(FN,trap),invalid('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(FN,{subject:BINDING,[Symbol('s')]:true}),
   invalid('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
 // Reader-level hostile requests never execute unauthorized getters.
 let getterReads=0;
 const changing={};
 Object.defineProperty(changing,'subject',{enumerable:true,get(){
  getterReads++;return BINDING}});
 assert.throws(()=>x.reader.query(changing),invalid('R155_BINDING_REQUEST_INVALID'));
 assert.equal(getterReads,0,'the unauthorized getter must never execute');
 assert.throws(()=>x.reader.query(new Proxy({subject:BINDING},
  {ownKeys(){throw new Error('hostile query Proxy')}})),
  invalid('R155_BINDING_REQUEST_INVALID'));
 assert.throws(()=>x.reader.query(Object.create({subject:BINDING})),
  invalid('R155_BINDING_REQUEST_INVALID'));
 assert.throws(()=>x.reader.query({subject:BINDING,[Symbol('effect')]:true}),
  invalid('R155_BINDING_REQUEST_INVALID'));
 assert.throws(()=>x.reader.query({subject:BINDING,sapQualified:true}),
  invalid('R155_BINDING_REQUEST_INVALID'));
 assert.throws(()=>x.reader.query({}),
  invalid('R155_BINDING_REQUEST_INVALID'));
 // Forged registry bytes fail the installer anchor.
 const fakeRegistry={...x.registry,[FN]:{...x.registry[FN],sha256:'0'.repeat(64)}};
 await assert.rejects(boot({...x,registry:fakeRegistry}),
  invalid('DIS_LOCAL_REGISTRY_MISMATCH'));
 // R58 lesson: a forged "fully qualified" UNKNOWN value is accepted as data
 // with authority NONE and no execution permit — that is NOT a PASS, not an
 // attestation, and no basis to mark any requirement VERIFIED.
 const forgedValue={...x.reader.value,claimQualified:true,qualifiedSap:true,
  parentQualified:true,rootQualified:true,oracleAttested:true,
  effectDispatched:true,currentness:'FORMALLY_QUALIFIED'};
 const forged={...x.registry,[FN]:{...x.registry[FN],
  execute:()=>forgedValue}};
 const fakeApp=await boot({...x,registry:forged});
 try{
  const out=await fakeApp.invoke(FN,{subject:BINDING});
  assert.equal(out.kind,'OBSERVATION');
  assert.equal(out.authority,'NONE');
  assert.equal(out.evidence.attested,false);
  assert.equal(Object.hasOwn(out,'executionPermit'),false);
  assert.equal(out.value.claimQualified,true);
  assert.equal(out.value.effectDispatched,true);
 }finally{fakeApp.stop()}
 // A declared-outcome violation still fails the generic ABI gate.
 const badTag={...x.registry,[FN]:{...x.registry[FN],
  execute:()=>({...x.reader.value,status:'QUALIFIED'})}};
 const tagApp=await boot({...x,registry:badTag});
 try{
  await assert.rejects(tagApp.invoke(FN,{subject:BINDING}),
   invalid('DIS_OUTCOME_UNDECLARED'));
 }finally{tagApp.stop()}
});
