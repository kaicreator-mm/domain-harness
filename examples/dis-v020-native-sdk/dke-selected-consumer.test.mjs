/**
 * R21: Actual selected AOT → native SDK → source-locked DKE ED06 consumer.
 * The projection is a bounded read-only copy of real pinned Tally KG nodes and
 * Textile F012 reference data. It is NOT an independent Domain Oracle or KDP Effect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sourceSha256,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {validateDisV020FunctionValue,classifyDisV020FunctionOutcome} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {CONTRACT,consume as consumeDke} from './dke-consumer-core.mjs';
import {readCrossview,SUPPORTED as CROSSVIEW_SUPPORTED} from './dke-crossview-reader.mjs';

const BINDING_SOURCE=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'35477769acee85059a240bf229e789e8362f46a1',
 path:'examples/dis-v020-native-sdk/dke-consumer-core.mjs',
 gitBlob:'1bfc1358409fa8851fefcdb4696858b6b6a8e360'
});
const DATA_SOURCE=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'f1412d728e4d26eafabfb1c0f5d711fa0de929ea',
 path:'examples/dis-v020-native-sdk/fixtures/dke-ed06-source-projection.json',
 gitBlob:'47cd14bd7ddaeb45c46f445e5f59ff3b5338d23a'
});
const CORE_ID='dke-ed06-consumer',DATA_ID='dke-ed06-projection';
const VARIANTS=['REVIEWER_ROOT','CONTEXT','GLOBAL'];
const sourceIdentity={
 tally:'0f6007315fd7352fe6fd218effcfecf672cb4961',
 textile:'d53125358455057d9315240e05b6bc038f515241',
 dkeCore:'1bfc1358409fa8851fefcdb4696858b6b6a8e360'
};
const gitBlob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const refuse=(code)=>{const e=new Error(code);e.code=code;throw e};
const reject=code=>error=>error?.code===code;
function sourceTexts(){
 const executable=readFileSync(new URL('./dke-consumer-core.mjs',import.meta.url));
 const data=readFileSync(new URL('./fixtures/dke-ed06-source-projection.json',import.meta.url));
 if(gitBlob(executable)!==BINDING_SOURCE.gitBlob||gitBlob(data)!==DATA_SOURCE.gitBlob)refuse('DKE_EXACT_SOURCE_DRIFT');
 const projection=JSON.parse(data.toString('utf8'));
 if(projection.sourcePins.dkeCoreBlob!==sourceIdentity.dkeCore||
    projection.sourcePins.tallyGraphBlob!==sourceIdentity.tally||
    projection.sourcePins.textileFixtureBlob!==sourceIdentity.textile)refuse('DKE_UPSTREAM_SOURCE_DRIFT');
 const graph=new Map(projection.graph['@graph'].map(n=>[n['@id'],n]));
 const rel=graph.get('se:REL-TVV-0020');
 if(rel?.['se:lifecycle_status']!=='PENDING_REVIEW'||
    !['se:subject_ref','se:object_ref'].every(k=>graph.get(rel[k]?.['@id'])?.['@type']==='se:TaxonomyNode')||
    !rel['se:evidence_refs'].every(e=>graph.get(e['@id'])?.['@type']==='se:Evidence')||
    projection.textile.authority!=='REFERENCE')refuse('DKE_UPSTREAM_SOURCE_SEMANTICS_DRIFT');
 return{executable:executable.toString('utf8'),sourceText:data.toString('utf8'),projection};
}
const fixturePromise=makeNativeFixture();
const contractApi={validateDisV020FunctionValue,classifyDisV020FunctionOutcome};
async function makeDkeSelectedFixture(){
 const base=await fixturePromise,{executable,sourceText,projection}=sourceTexts();
 const sources=[
  ...base.sources,
  {id:CORE_ID,sourceText:executable,origin:{...BINDING_SOURCE}},
  {id:DATA_ID,sourceText,origin:{...DATA_SOURCE}}
 ];
 const program=structuredClone(base.program);
 program.domains.push({
  id:'dke-ed06',description:'Bounded source-locked DKE Element CQ consumer research',
  repositories:['kaicreator-mm/domain-harness']
 });
 const registry={...base.registry};
 for(const variant of VARIANTS){
  const suffix=variant.toLowerCase().replace('_','-'),fnId='dke.ed06.'+suffix+'.consume';
  program.elements.push({
   id:'dke.ed06.'+suffix,domainId:'dke-ed06',kind:'knowledge',
   description:'DKE '+variant+' source-pinned evidence consumer: no effect, no semantic attestation',
   dependsOn:[],
   functions:[{
    id:fnId,kind:'knowledge',effect:'none',binding:{type:'local',sourceId:CORE_ID},
    contract:structuredClone(CONTRACT),
    // The original DKE logic reads the second, exact source-pinned projection.
    sourceDependencies:[DATA_ID]
   }]
  });
  registry[fnId]={
   sourceId:CORE_ID,sha256:sourceSha256(executable),gitBlob:BINDING_SOURCE.gitBlob,
   origin:{...BINDING_SOURCE},
   execute:({domain,cqId})=>consumeDke(projection,contractApi,{domain,cqId,variant}).output
  };
 }
 const expectedSourceOrigins={
  ...base.expectedSourceOrigins,
  [CORE_ID]:{...BINDING_SOURCE},
  [DATA_ID]:{...DATA_SOURCE}
 };
 const artifact=compileDisV020Aot({
  built:base.artifact.built,program,sources,expectedSourceOrigins
 });
 const activate=(options={})=>loadDisV020Aot(artifact,{
  expectedDigest:options.expectedDigest??artifact.digest,
  registry:options.registry??registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dke-ed06-native-source-consumer'
 });
 return {artifact,program,sources,expectedSourceOrigins,registry,projection,activate};
}
test('R21 DKE source projections are exact AOT-selected source pins, no unselected function',async()=>{
 const f=await makeDkeSelectedFixture();
 const pins=new Map(f.artifact.sources.map(x=>[x.id,x]));
 assert.equal(pins.get(CORE_ID).origin.gitBlob,BINDING_SOURCE.gitBlob);
 assert.equal(pins.get(DATA_ID).origin.gitBlob,DATA_SOURCE.gitBlob);
 assert.equal(pins.get(DATA_ID).sha256,sourceSha256(sourceTexts().sourceText));
 assert.equal(f.artifact.program.elements.filter(e=>e.domainId==='dke-ed06').length,3);
 assert.equal(f.artifact.program.elements.flatMap(e=>e.functions)
   .filter(fn=>fn.id.startsWith('dke.ed06.')).length,3);
 assert.equal(f.artifact.program.elements.find(e=>e.id==='shared.semantics').functions.length,0);
});
test('R21 selected AOT native SDK consumes 24 DKE CQ Functions with SOURCE status and no authority',async()=>{
 const f=await makeDkeSelectedFixture(),app=await f.activate();
 try{
  assert.equal(app.state,'READY');
  const statuses={tally:{UNKNOWN:0,OBSERVED:0},textile:{UNKNOWN:0,OBSERVED:0}};
  let calls=0;
  for(const variant of VARIANTS){
   const suffix=variant.toLowerCase().replace('_','-');
   for(const domain of ['tally','textile']){
    const cqList=f.projection.cases.sourceData[domain].cq;
    for(const q of cqList){
     const out=await app.invoke('dke.ed06.'+suffix+'.consume',{domain,cqId:q.id},
      {expectedContractVersion:'1.0.0'});
     assert.equal(out.kind,'OBSERVATION');assert.equal(out.authority,'NONE');
     assert.equal(out.contractVersion,'1.0.0');assert.equal(out.evidence.attested,false);
     assert.equal(out.value.domain,domain);assert.equal(out.value.cqId,q.id);
     assert.equal(out.disposition,out.value.status);
     assert.ok(out.evidence.declaredRefs.length>0);
     assert.equal(out.evidence.source.gitBlob,BINDING_SOURCE.gitBlob);
     assert.notEqual(out.disposition,'SUCCEEDED');
     statuses[domain][out.disposition]++;
     calls++;
    }
   }
  }
  assert.equal(calls,24);
  assert.deepEqual(statuses,{tally:{UNKNOWN:12,OBSERVED:0},textile:{UNKNOWN:6,OBSERVED:6}});
 }finally{app.stop()}
});
test('R21 source drift, forged registry, stale Function and missing real Evidence fail closed',async()=>{
 const f=await makeDkeSelectedFixture();
 const changed=structuredClone(f.sources);
 changed.find(s=>s.id===DATA_ID).sourceText+=' ';
 assert.throws(()=>compileDisV020Aot({
  built:f.artifact.built,program:f.program,sources:changed,
  expectedSourceOrigins:f.expectedSourceOrigins
 }),reject('DIS_BUILD_SOURCE_BYTES_DRIFT'));
 const forged={...f.registry};
 const key='dke.ed06.reviewer-root.consume';
 forged[key]={...forged[key],gitBlob:'0'.repeat(40)};
 await assert.rejects(f.activate({registry:forged}),reject('DIS_LOCAL_REGISTRY_MISMATCH'));
 await assert.rejects(f.activate({expectedDigest:'0'.repeat(64)}),
  reject('DIS_INSTALLED_AOT_MISMATCH'));
 const app=await f.activate();
 try{
  await assert.rejects(app.invoke(key,{domain:'tally',cqId:'CQ-T-CROSSCUT',effect:true}),
   reject('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(key,{domain:'tally',cqId:'CQ-T-CROSSCUT'},
    {expectedContractVersion:'0.9.0'}),reject('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
 const bad=structuredClone(f.projection);
 bad.textile.rules.find(x=>x.id==='jacquard').sources=['forged-source'];
 assert.throws(()=>consumeDke(bad,contractApi,{
  domain:'textile',cqId:'CQ-X-STRUCTURE',variant:'REVIEWER_ROOT'
 }),/TEXTILE_REFERENCE_EVIDENCE_MISSING/);
});
test('R21 real DIS typed evidence presence is not domain source qualification or KDP permit',async()=>{
 const f=await makeDkeSelectedFixture(),app=await f.activate();
 try{
  const result=await app.invoke('dke.ed06.reviewer-root.consume',{
   domain:'tally',cqId:'CQ-T-CROSSCUT'
  },{expectedContractVersion:'1.0.0'});
  assert.equal(result.disposition,'UNKNOWN');
  assert.equal(result.value.sourceStatus,'PENDING_REVIEW');
  assert.equal(result.evidence.attested,false);
  assert.equal(result.authority,'NONE');
  assert.notEqual(result.kind,'KDP_RECEIPT');
  assert.equal(result.value.reason,'UNACCEPTED_GRAPH_CLAIM_OR_RELATION');
 }finally{app.stop()}
 const synthetic={status:'SUCCEEDED',evidenceRefs:['fake:reference']};
 const s=classifyDisV020FunctionOutcome(CONTRACT,synthetic);
 assert.equal(s.disposition,'SUCCEEDED');
 // This proves *only* the shape-based classifier behavior; it cannot attest
 // "fake:reference", a valid KnowledgeClaim or an approved DKE SAP.
});


// R22: bounded SOURCE → actual selected Function inverse edge; NOT ECP closure.
test('R22 each AOT-selected DKE Knowledge Function registers its exact data source dependency',async()=>{
 const f=await makeDkeSelectedFixture();
 const q=qualifyDisV020Artifact(f.artifact);
 const expected=VARIANTS.map(v=>'dke.ed06.'+v.toLowerCase().replace('_','-')+'.consume').sort();
 assert.deepEqual(q.sourceConsumers.get(DATA_ID),expected);
 assert.deepEqual(q.sourceConsumers.get(CORE_ID),expected);
 for(const id of expected){
  const definition=q.functions.get(id)?.definition;
  assert.deepEqual(definition.sourceDependencies,[DATA_ID]);
  assert.equal(definition.binding.sourceId,CORE_ID);
  assert.equal(q.pins.get(DATA_ID).origin.gitBlob,DATA_SOURCE.gitBlob);
 }
 // Source-to-Function provenance is registered, but does not invent an ECP.
 assert.equal(f.artifact.program.elements.filter(e=>e.domainId==='dke-ed06')
   .every(e=>e.packageId===undefined),true);
});
test('R22 unknown, duplicate and cross-origin source dependencies are rejected before KDP boot',async()=>{
 const f=await makeDkeSelectedFixture(),orig=structuredClone(f.program);
 const fn=orig.elements.flatMap(e=>e.functions)
  .find(x=>x.id==='dke.ed06.reviewer-root.consume');
 const compile=()=>compileDisV020Aot({
  built:f.artifact.built,program:orig,sources:f.sources,
  expectedSourceOrigins:f.expectedSourceOrigins
 });
 fn.sourceDependencies=['missing-project-source'];
 assert.throws(compile,reject('DIS_FUNCTION_SOURCE_DEPENDENCY_INVALID'));
 fn.sourceDependencies=[DATA_ID,DATA_ID];
 assert.throws(compile,reject('DIS_FUNCTION_SOURCE_DEPENDENCY_INVALID'));
 fn.sourceDependencies=[CORE_ID];
 assert.throws(compile,reject('DIS_FUNCTION_SOURCE_DEPENDENCY_INVALID'));
 fn.sourceDependencies=['tally-business'];
 assert.throws(compile,reject('DIS_SOURCE_DOMAIN_MISMATCH'));
});
test('R22 KDP_INTENT cannot claim a LOCAL source reverse dependency as execution authority',async()=>{
 const f=await makeDkeSelectedFixture(),program=structuredClone(f.program);
 const fn=program.elements.flatMap(e=>e.functions).find(x=>x.id==='orders.approve');
 fn.sourceDependencies=[DATA_ID];
 assert.throws(()=>compileDisV020Aot({
  built:f.artifact.built,program,sources:f.sources,
  expectedSourceOrigins:f.expectedSourceOrigins
 }),reject('DIS_FUNCTION_SOURCE_DEPENDENCY_INVALID'));
});


// R23: second independently implemented and source-locked LOCAL reader.
// Both readers use the same actual sealed data snapshot; this study does NOT
// pretend that the new Function is owned by a second Business Package.
const CROSS_READER_ID='dke-r23-independent-crossview';
const CROSS_FUNCTION_ID='dke.crossview.audit';
const CROSS_READER_ORIGIN=Object.freeze({"repository":"kaicreator-mm/domain-harness","commit":"2c569773d475b425f724b6d6422ab8e100cff19c","path":"examples/dis-v020-native-sdk/dke-crossview-reader.mjs","gitBlob":"d2a057bd7dfb189aa2e7e3a73ba16c926930c2c7"});
const expectedDataReaders=Object.freeze(
 [...VARIANTS.map(v=>'dke.ed06.'+v.toLowerCase().replace('_','-')+'.consume'),CROSS_FUNCTION_ID].sort()
);
function assertRegisteredDualReaders(artifact){
 const qualified=qualifyDisV020Artifact(artifact);
 const registered=qualified.sourceConsumers.get(DATA_ID);
 if(JSON.stringify(registered)!==JSON.stringify(expectedDataReaders))
  refuse('DKE_R23_REVERSE_DEPENDENCY_UNCLOSED');
 // Full source-to-Function closure is only for the declared two reader
 // implementations and the exact bounded data projection, NOT all SAP/ECP.
 return qualified;
}
async function makeR23DualReaderFixture(){
 const prior=await makeDkeSelectedFixture();
 const bytes=readFileSync(new URL('./dke-crossview-reader.mjs',import.meta.url));
 if(gitBlob(bytes)!==CROSS_READER_ORIGIN.gitBlob)refuse('DKE_R23_INDEPENDENT_SOURCE_DRIFT');
 const text=bytes.toString('utf8');
 const sources=[...prior.sources,{
  id:CROSS_READER_ID,sourceText:text,origin:{...CROSS_READER_ORIGIN}
 }];
 const expectedSourceOrigins={
  ...prior.expectedSourceOrigins,[CROSS_READER_ID]:{...CROSS_READER_ORIGIN}
 };
 const program=structuredClone(prior.program);
 program.domains.push({
  id:'dke-crossview-audit',
  description:'Second independent LOCAL source consumer; no Business Package / semantic Oracle',
  repositories:['kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.crossview.audit.element',domainId:'dke-crossview-audit',
  kind:'knowledge',description:'Independent source-backed cross-Element invariant observer',
  dependsOn:[],functions:[{
   id:CROSS_FUNCTION_ID,kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:CROSS_READER_ID},
   contract:structuredClone(CONTRACT),
   sourceDependencies:[DATA_ID]
  }]
 });
 const registry={
  ...prior.registry,
  [CROSS_FUNCTION_ID]:{
   sourceId:CROSS_READER_ID,sha256:sourceSha256(text),
   gitBlob:CROSS_READER_ORIGIN.gitBlob,origin:{...CROSS_READER_ORIGIN},
   execute:input=>readCrossview(prior.projection,input)
  }
 };
 const artifact=compileDisV020Aot({
  built:prior.artifact.built,program,sources,expectedSourceOrigins
 });
 assertRegisteredDualReaders(artifact);
 const activate=(options={})=>loadDisV020Aot(artifact,{
  expectedDigest:options.expectedDigest??artifact.digest,
  registry:options.registry??registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dke-r23-two-selected-source-readers'
 });
 return{...prior,artifact,program,sources,registry,expectedSourceOrigins,activate};
}
test('R23 two distinct AOT-selected LOCAL implementations read the same exact source projection',async()=>{
 const f=await makeR23DualReaderFixture(),q=assertRegisteredDualReaders(f.artifact);
 const original=VARIANTS.map(v=>'dke.ed06.'+v.toLowerCase().replace('_','-')+'.consume').sort();
 assert.deepEqual(q.sourceConsumers.get(DATA_ID),expectedDataReaders);
 assert.deepEqual(q.sourceConsumers.get(CORE_ID),original);
 assert.deepEqual(q.sourceConsumers.get(CROSS_READER_ID),[CROSS_FUNCTION_ID]);
 assert.equal(q.pins.get(CROSS_READER_ID).origin.gitBlob,CROSS_READER_ORIGIN.gitBlob);
 assert.equal(q.functions.get(CROSS_FUNCTION_ID).element.packageId,undefined);
 assert.deepEqual(q.functions.get(CROSS_FUNCTION_ID).definition.sourceDependencies,[DATA_ID]);
 const app=await f.activate();
 try{
  assert.equal(app.state,'READY');
  for(const domain of ['tally','textile']){
   const cqId=CROSSVIEW_SUPPORTED[domain].cqId;
   const a=await app.invoke('dke.ed06.reviewer-root.consume',{domain,cqId},
    {expectedContractVersion:'1.0.0'});
   const b=await app.invoke(CROSS_FUNCTION_ID,{domain,cqId},
    {expectedContractVersion:'1.0.0'});
   for(const result of [a,b]){
    assert.equal(result.kind,'OBSERVATION');
    assert.equal(result.authority,'NONE');
    assert.equal(result.disposition,'UNKNOWN');
    assert.equal(result.value.status,'UNKNOWN');
    assert.equal(result.value.sourceStatus,CROSSVIEW_SUPPORTED[domain].sourceStatus);
    assert.equal(result.evidence.attested,false);
    assert.equal(result.value.cqId,cqId);
    assert.ok(result.evidence.declaredRefs.length>0);
   }
   assert.deepEqual([...a.value.sourceRefs].sort(),[...b.value.sourceRefs].sort());
   assert.deepEqual([...a.value.selectedScopes].sort(),[...b.value.selectedScopes].sort());
   assert.notEqual(a.evidence.source.gitBlob,b.evidence.source.gitBlob);
  }
 }finally{app.stop()}
});
test('R23 reverse dependency omission is detected by independent exact-selected-reader manifest',async()=>{
 const f=await makeR23DualReaderFixture(),program=structuredClone(f.program);
 const fn=program.elements.flatMap(e=>e.functions).find(x=>x.id===CROSS_FUNCTION_ID);
 fn.sourceDependencies=[];
 const bad=compileDisV020Aot({
  built:f.artifact.built,program,sources:f.sources,
  expectedSourceOrigins:f.expectedSourceOrigins
 });
 // Native syntax allows a Function without optional reverse registrations.
 // Research manifest *must* reject this omission before using the impact graph.
 assert.equal(qualifyDisV020Artifact(bad).sourceConsumers.get(DATA_ID).length,3);
 assert.throws(()=>assertRegisteredDualReaders(bad),
  reject('DKE_R23_REVERSE_DEPENDENCY_UNCLOSED'));
});
test('R23 both selected source readers fail closed on stale data and forged second registry',async()=>{
 const f=await makeR23DualReaderFixture();
 const changed=structuredClone(f.sources);
 changed.find(x=>x.id===DATA_ID).sourceText+=' ';
 assert.throws(()=>compileDisV020Aot({
  built:f.artifact.built,program:f.program,sources:changed,
  expectedSourceOrigins:f.expectedSourceOrigins
 }),reject('DIS_BUILD_SOURCE_BYTES_DRIFT'));
 const fake={...f.registry};
 fake[CROSS_FUNCTION_ID]={...fake[CROSS_FUNCTION_ID],gitBlob:'0'.repeat(40)};
 await assert.rejects(f.activate({registry:fake}),
  reject('DIS_LOCAL_REGISTRY_MISMATCH'));
 await assert.rejects(f.activate({expectedDigest:'0'.repeat(64)}),
  reject('DIS_INSTALLED_AOT_MISMATCH'));
 const app=await f.activate();
 try{
  await assert.rejects(app.invoke(CROSS_FUNCTION_ID,{domain:'tally',cqId:'CQ-T-CROSSCUT',
    authority:'APPROVED'}),reject('DIS_FUNCTION_INPUT_INVALID'));
  await assert.rejects(app.invoke(CROSS_FUNCTION_ID,{domain:'tally',cqId:'CQ-T-CROSSCUT'},
    {expectedContractVersion:'0.9.0'}),reject('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
 const broken=structuredClone(f.projection);
 broken.graph['@graph']=broken.graph['@graph'].filter(n=>n['@id']!=='se:NODE-SSDF-RV');
 assert.throws(()=>readCrossview(broken,{domain:'tally',cqId:'CQ-T-CROSSCUT'}),
  reject('DKE_CROSSVIEW_REAL_RELATION_INVALID'));
 const notReference=structuredClone(f.projection);
 notReference.textile.authority='ACCEPTED';
 assert.throws(()=>readCrossview(notReference,{domain:'textile',cqId:'CQ-X-COMPOSE'}),
  reject('DKE_CROSSVIEW_REFERENCE_RELATION_INVALID'));
});
