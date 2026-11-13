/** B23 / DIS R56 — original EV16:D02 scoped R8 cell evidence selected
 * through actual AOT -> SDK/KDP typed Knowledge Functions. Upstream
 * independent ACCEPT_SCOPED=1/53 is an observed, source-linked review;
 * it is NOT formally qualified SAP, Root, ECP, Effect, Release, or 53/53.
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
import {makeVerifiedEV16Reader} from './dke-r23-ev16-reader.mjs';

const R54='https://github.com/kaicreator-mm/domain-intelligence-engineering/issues/2#issuecomment-6843606329';
const UPSTREAM='a528be96018c8283a34ef72af777398dcf741ee4';
const ORIGINS=Object.freeze({
 r8:{repository:'kaicreator-mm/domain-forge',
  commit:'0b2f1ae58b309a5eb9d3e89ac2e13ca915f1b211',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/EV_CROSS_DOMAIN_MATRIX_R8.json',
  gitBlob:'8cab8ead10d90a440c85fec86b01fd408022ae2c'},
 graph:{repository:'kaicreator-mm/tally',
  commit:'3e94685ca57a4b7258988826697af1c1c3a6b3c8',
  path:'docs/versions/v2.1.1/knowledge/generated/graph.jsonld',
  gitBlob:'0f6007315fd7352fe6fd218effcfecf672cb4961'},
 gate:{repository:'kaicreator-mm/domain-forge',
  commit:'0b2f1ae58b309a5eb9d3e89ac2e13ca915f1b211',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r22-ev16-explicit-source-join/FROZEN_CASE_GATE.json',
  gitBlob:'4afea8ce6333a25439f7ec17bf5c396ef3e1b59b'},
 reader:{repository:'kaicreator-mm/domain-forge',
  commit:'1f3b39a2a6716c1e977e726fd3737d9bd590a412',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r23-ev16-bound-reader/verified-reader.mjs',
  gitBlob:'c37b09082a50eeec7e17c17ecd9366a79c4ce8ae'},
 sap:{repository:'kaicreator-mm/domain-forge',commit:UPSTREAM,
  path:'docs/standards/dke/DKE-0.0.1/demos/ev16-d04-source-tier-r0/ev16-d02-original-sap-r0.mjs',
  gitBlob:'81cbe1e7fac1602907034213dfba962686e2204e'}
});
const PATHS=Object.freeze({
 r8:'./fixtures/dke-r23-ev16-r8.json',
 graph:'./fixtures/dke-r23-ev16-tally-full.jsonld',
 gate:'./fixtures/dke-r23-ev16-gate.json',
 reader:'./dke-r23-ev16-reader.mjs',
 sap:'./fixtures/dke-r54-ev16-d02-original-sap.mjs'
});
const KEY=Object.freeze({
 req:{element:'dke.ev16.d02.req',function:'dke.ev16.d02.req.observe',
  owner:'dke:ev16.d02.se-requirements-child',claim:'se:CLM-REQ-FUNCTIONAL-DOC-METHODS'},
 vv:{element:'dke.ev16.d02.vv',function:'dke.ev16.d02.vv.observe',
  owner:'dke:ev16.d02.se-verification-child',claim:'se:CLM-TVV-0001'}
});
const SID=Object.freeze({r8:'r55-dke-original-r8',graph:'r55-dke-original-graph',
 gate:'r55-dke-original-gate',reader:'r55-dke-verified-reader',sap:'r55-dke-original-sap'});
const invalid=code=>e=>e?.code===code;
const prepared=(async()=>{
 const [fixture,...raw]=await Promise.all([makeNativeFixture(),
  ...Object.values(PATHS).map(path=>readFile(new URL(path,import.meta.url),'utf8'))]);
 const original=Object.fromEntries(Object.keys(PATHS).map((k,i)=>[k,raw[i]]));
 for(const [key,origin] of Object.entries(ORIGINS))
  assert.equal(sourceGitBlob(original[key]),origin.gitBlob,
   'original source Git Blob drift: '+key);
 assert.equal(JSON.parse(original.graph)['@graph'].length,807);
 for(const pin of [ORIGINS.graph.gitBlob,
  'c3015c4178467fdcf87e39dfe18fa6a9b317c6b4',
  'd5747c057c92bc357cc68053e43d96b36427e02c',
  'c4ea2cc7c165ae34871f7e4b70c1b1203ffd49a2',
  KEY.req.owner,KEY.vv.owner,'FORGED_ORIGINAL_SOURCE_PROJECTION_BLOCKED'])
  assert.ok(original.sap.includes(pin),'SAP exact source missing '+pin);
 assert.ok(original.sap.includes('qualifiedSap:false'));
 assert.ok(original.sap.includes('qualifiedR8:false'));
 const reader=makeVerifiedEV16Reader(original.r8,original.graph,original.gate);
 const originalRead=reader.query(JSON.parse(original.gate).defaultRequest);
 assert.equal(originalRead.status,'UNKNOWN_NO_ASSERTED_RFC9111_RELATION');
 assert.equal(originalRead.sourceBytesVerified,true);
 const added=Object.entries(ORIGINS).map(([key,origin])=>({
  id:SID[key],sourceText:original[key],origin
 }));
 const program=structuredClone(fixture.program);
 program.domains.push({id:'dke.ev16.r55',
  description:'Scoped EV16:D02 source and independent cell-review observation, not full R8',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/tally','kaicreator-mm/domain-harness']});
 for(const [key,spec] of Object.entries(KEY))
  program.elements.push({
   id:spec.element,domainId:'dke.ev16.r55',version:'1.0.0',kind:'knowledge',
   description:key+' original REQ/V&V child scoped evidence, formally unqualified',
   dependsOn:[],functions:[{
    id:spec.function,kind:'knowledge',effect:'none',
    binding:{type:'local',sourceId:SID.reader},
    sourceDependencies:[SID.r8,SID.graph,SID.gate,SID.sap],
    contract:{
     schema:'dis.v0.2.function-contract/1',version:'1.0.0',
     input:{type:'record',fields:{subject:'string'},additionalProperties:false},
     output:{type:'record',fields:{
      status:'string',subject:'string',ownerElementId:'string',sourceClaimId:'string',
      sourceGraphGitBlob:'string',sapRunnerGitBlob:'string',
      upstreamForgeHead:'string',r54ReviewUrl:'string',
      reviewedScopedCellCount:'number',originalR8CellCount:'number',
      scopedReviewObserved:'string',sourceBytesVerified:'boolean',
      sapQualified:'boolean',fullOriginalR8Qualified:'boolean',
      parentQualified:'boolean',rootQualified:'boolean',effectDispatched:'boolean'
     },additionalProperties:false},
     outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
     evidence:{refField:'evidenceRefs',requiredFor:[]},
     compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
    }
   }]
  });
 // A cross-Element semantic association is not a static Function dependency
 // and cannot grant either child an Effect or make the D02 parent qualified.
 program.relations.push({from:KEY.req.element,to:KEY.vv.element,kind:'cooperates'});
 const sources=[...fixture.sources,...added];
 const origins={...fixture.expectedSourceOrigins,
  ...Object.fromEntries(added.map(x=>[x.id,x.origin]))};
 const compile=(p=program,s=sources,o=origins)=>compileDisV020Aot({
  built:fixture.artifact.built,program:p,sources:s,expectedSourceOrigins:o
 });
 const registry={...fixture.registry};
 for(const spec of Object.values(KEY))registry[spec.function]={
  sourceId:SID.reader,sha256:sourceSha256(original.reader),
  origin:ORIGINS.reader,gitBlob:ORIGINS.reader.gitBlob,
  execute:input=>{
   if(input?.subject!=='EV16:D02'){
    const error=new Error('DKE_R55_UNSELECTED_CELL');
    error.code='DKE_R55_UNSELECTED_CELL';throw error;
   }
   const outcome=reader.query(JSON.parse(original.gate).defaultRequest);
   if(outcome.status!=='UNKNOWN_NO_ASSERTED_RFC9111_RELATION'||
      outcome.sourceBytesVerified!==true)throw Error('DKE_R55_SOURCE_PRECONDITION');
   return {status:'UNKNOWN',subject:'EV16:D02',
    ownerElementId:spec.owner,sourceClaimId:spec.claim,
    sourceGraphGitBlob:ORIGINS.graph.gitBlob,
    sapRunnerGitBlob:ORIGINS.sap.gitBlob,
    upstreamForgeHead:UPSTREAM,r54ReviewUrl:R54,
    reviewedScopedCellCount:1,originalR8CellCount:53,
    scopedReviewObserved:'EXTERNAL_NON_WRITER_ACCEPT_SCOPED',
    sourceBytesVerified:true,sapQualified:false,fullOriginalR8Qualified:false,
    parentQualified:false,rootQualified:false,effectDispatched:false};
  }
 };
 const expectedPins=Object.fromEntries(added.map(s=>[s.id,{
  sha256:sourceSha256(s.sourceText),origin:s.origin
 }]));
 return {original,reader,program,sources,origins,compile,registry,expectedPins,
  artifact:compile()};
})();
const boot=x=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,
 expectedSourcePins:x.expectedPins,
 store:new PlainCasDocStore(),tenantId:'tenant:b23-ev16-d02-scoped'});
test('R55 two source-owned REQ/VV Elements and SAP runner DATA are pinned in real AOT',async()=>{
 const x=await prepared,q=qualifyDisV020Artifact(x.artifact);
 for(const spec of Object.values(KEY)){
  const fn=q.functions.get(spec.function);
  assert.ok(fn);assert.equal(fn.element.id,spec.element);
  assert.equal(fn.definition.effect,'none');
  assert.equal(fn.definition.binding.sourceId,SID.reader);
  assert.deepEqual(fn.definition.sourceDependencies,[SID.r8,SID.graph,SID.gate,SID.sap]);
  assert.deepEqual(q.elements.get(spec.element).dependsOn,[]);
  for(const sid of fn.definition.sourceDependencies)
   assert.ok(q.sourceConsumers.get(sid).includes(spec.function));
 }
 assert.equal(q.pins.get(SID.sap).origin.gitBlob,ORIGINS.sap.gitBlob);
 assert.equal(q.pins.get(SID.sap).origin.commit,UPSTREAM);
 assert.equal(q.pins.get(SID.graph).origin.gitBlob,ORIGINS.graph.gitBlob);
 const app=await boot(x);try{assert.equal(app.state,'READY')}finally{app.stop()}
});
test('R55 real selected SDK/KDP knowledge Functions preserve scoped 1/53 vs formal unqualified',async()=>{
 const x=await prepared,app=await boot(x);
 try{
  for(const spec of Object.values(KEY)){
   const r=await app.invoke(spec.function,{subject:'EV16:D02'},
    {expectedContractVersion:'1.0.0'});
   assert.equal(r.kind,'OBSERVATION');assert.equal(r.disposition,'UNKNOWN');
   assert.equal(r.authority,'NONE');assert.equal(r.evidence.attested,false);
   assert.equal(r.value.status,'UNKNOWN');
   assert.equal(r.value.ownerElementId,spec.owner);
   assert.equal(r.value.sourceClaimId,spec.claim);
   assert.equal(r.value.sourceGraphGitBlob,ORIGINS.graph.gitBlob);
   assert.equal(r.value.sapRunnerGitBlob,ORIGINS.sap.gitBlob);
   assert.equal(r.value.r54ReviewUrl,R54);
   assert.equal(r.value.upstreamForgeHead,UPSTREAM);
   assert.equal(r.value.reviewedScopedCellCount,1);
   assert.equal(r.value.originalR8CellCount,53);
   assert.equal(r.value.scopedReviewObserved,'EXTERNAL_NON_WRITER_ACCEPT_SCOPED');
   assert.equal(r.value.sapQualified,false);
   assert.equal(r.value.fullOriginalR8Qualified,false);
   assert.equal(r.value.parentQualified,false);
   assert.equal(r.value.rootQualified,false);
   assert.equal(r.value.effectDispatched,false);
  }
 }finally{app.stop()}
});
test('R55 modified original SAP/graph bytes and forged provenance or executable DATA fail closed',async()=>{
 const x=await prepared;
 assert.notEqual(sourceGitBlob(x.original.sap+' '),ORIGINS.sap.gitBlob);
 assert.notEqual(sourceGitBlob(x.original.graph+' '),ORIGINS.graph.gitBlob);
 for(const id of [SID.sap,SID.graph]){
  const bad=structuredClone(x.expectedPins);
  bad[id].sha256='f'.repeat(64);
  await assert.rejects(boot({...x,expectedPins:bad}),
   invalid('DIS_SOURCE_ANCHOR_STALE'));
 }
 const wrong=structuredClone(x.origins);
 wrong[SID.sap].gitBlob='0'.repeat(40);
 assert.throws(()=>x.compile(x.program,x.sources,wrong),
  invalid('DIS_SOURCE_ORIGIN_UNTRUSTED'));
 const p=structuredClone(x.program);
 const illicit=p.elements.find(e=>e.id===KEY.req.element).functions[0];
 illicit.binding.sourceId=SID.sap;
 delete illicit.sourceDependencies; // isolate real DATA-as-LOCAL guard, not duplicate dependency rejection
 assert.throws(()=>x.compile(p),invalid('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
});
test('R55 forged parent/SAP/Effect, other cells and ABI version are not accepted',async()=>{
 const x=await prepared,app=await boot(x);
 try{
  for(const spec of Object.values(KEY)){
   await assert.rejects(app.invoke(spec.function,
    {subject:'EV16:D02',sapQualified:true}),
    invalid('DIS_FUNCTION_INPUT_INVALID'));
   await assert.rejects(app.invoke(spec.function,
    {subject:'EV16:D04'}),invalid('DKE_R55_UNSELECTED_CELL'));
   await assert.rejects(app.invoke(spec.function,{subject:'EV16:D02'},
    {expectedContractVersion:'2.0.0'}),invalid('DIS_FUNCTION_VERSION_MISMATCH'));
  }
 }finally{app.stop()}
 const forged={...x.registry,[KEY.req.function]:{
  ...x.registry[KEY.req.function],execute:()=>({
   status:'SUCCEEDED',subject:'EV16:D02',ownerElementId:KEY.req.owner,
   sourceClaimId:KEY.req.claim,sourceGraphGitBlob:ORIGINS.graph.gitBlob,
   sapRunnerGitBlob:ORIGINS.sap.gitBlob,upstreamForgeHead:UPSTREAM,
   r54ReviewUrl:R54,reviewedScopedCellCount:53,originalR8CellCount:53,
   scopedReviewObserved:'FORMAL_FULL_APPROVED',sourceBytesVerified:true,
   sapQualified:true,fullOriginalR8Qualified:true,
   parentQualified:true,rootQualified:true,effectDispatched:true
  })
 }};
 const badApp=await boot({...x,registry:forged});
 try{await assert.rejects(badApp.invoke(KEY.req.function,
  {subject:'EV16:D02'}),invalid('DIS_OUTCOME_UNDECLARED'))}
 finally{badApp.stop()}
});
