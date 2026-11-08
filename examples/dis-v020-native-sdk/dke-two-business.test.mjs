/**
 * R24 DKE: two independently authored, canonical BUILD-selected,
 * read-only Business packages each consume the SAME pinned source projection.
 * No automatic source acceptance, qualified SAP, ECP or Effect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 sourceSha256,qualifyDisV020Artifact,
 validateDisV020FunctionValue,classifyDisV020FunctionOutcome
} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {buildRealCrossProjectSelection} from '../dis-v020-cross-project/selected-build.mjs';
import {makeNativeFixture} from './native-fixture.mjs';
import {
 CONTRACT,consume as consumeEd06,getPolicy as firstPolicy
} from './dke-business-ed06.mjs';
import {
 readCrossview,getPolicy as secondPolicy,SUPPORTED
} from './dke-business-crossview.mjs';

const DECLARED=Object.freeze([
 {id:'dke-r24-business-ed06',packageId:'business-dke-ed06-observation@0.0.1-demo',
  functionId:'dke.r24.ed06.consume',
  path:'examples/dis-v020-native-sdk/dke-business-ed06.mjs',
  blob:'953c19d5ef21ccdc5610f89935b93e6fdc5240a4'},
 {id:'dke-r24-business-crossview',packageId:'business-dke-crossview-observation@0.0.1-demo',
  functionId:'dke.r24.crossview.consume',
  path:'examples/dis-v020-native-sdk/dke-business-crossview.mjs',
  blob:'d89fa7395551cef1ecf255a7b444b82580d754ce'}
]);
const PACKAGE_SOURCE_COMMIT='ecf844db625a3e89e989b65c546ead058ce43c18';
const DATA_ID='dke-r24-projection';
const DATA_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'f1412d728e4d26eafabfb1c0f5d711fa0de929ea',
 path:'examples/dis-v020-native-sdk/fixtures/dke-ed06-source-projection.json',
 gitBlob:'47cd14bd7ddaeb45c46f445e5f59ff3b5338d23a'
});
const gitBlob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const reject=code=>error=>error?.code===code;
const check=flag=>{if(!flag){const e=new Error('DKE_R24_CLOSED_SOURCE_CONSUMER_SET_MISMATCH');e.code=e.message;throw e}};
const expectedReaders=DECLARED.map(x=>x.functionId).sort();
const contractAPI={validateDisV020FunctionValue,classifyDisV020FunctionOutcome};
const materialized=DECLARED.map(x=>{
 const bytes=readFileSync(new URL('./'+x.path.split('/').at(-1),import.meta.url));
 assert.equal(gitBlob(bytes),x.blob,'new Business module must exactly match Git source blob');
 return {...x,text:bytes.toString('utf8'),origin:{
  repository:'kaicreator-mm/domain-harness',commit:PACKAGE_SOURCE_COMMIT,
  path:x.path,gitBlob:x.blob
 }};
});
const sourceData=readFileSync(new URL('./fixtures/dke-ed06-source-projection.json',import.meta.url));
assert.equal(gitBlob(sourceData),DATA_ORIGIN.gitBlob);
const projection=JSON.parse(sourceData.toString('utf8'));
function dualPackageQualified(artifact){
 const q=qualifyDisV020Artifact(artifact);
 const readers=q.sourceConsumers.get(DATA_ID);
 check(JSON.stringify(readers)===JSON.stringify(expectedReaders));
 for(const r of materialized){
  const module=artifact.built.modules.find(m=>m.packageId===r.packageId);
  check(module?.role==='business'&&module.moduleSha256===sourceSha256(r.text)&&
    module.moduleSource===r.text);
  const fn=q.functions.get(r.functionId);
  check(fn?.element.packageId===r.packageId &&
    fn.definition.binding.sourceId===r.id &&
    JSON.stringify(fn.definition.sourceDependencies)==='["'+DATA_ID+'"]');
 }
 return q;
}
async function fixture(){
 const base=await makeNativeFixture();
 // The canonical v0.10 BUILD owns this REAL selected Business roster.
 // We do NOT assign an unrelated or non-selected packageId after compilation.
 const {built}=await buildRealCrossProjectSelection({
  override:{modules:modules=>{
   for(const r of materialized){
    modules.push({
     packageId:r.packageId,role:'business',
     abiVersion:'v08-business-abi/1',endpoint:'business-policy',
     moduleSource:r.text,moduleSha256:sourceSha256(r.text),
     dependencies:[],requires:[],
     provides:['business:dke-readonly-'+r.id+'/1']
    });
   }
  }}
 });
 assert.equal(built.appId,base.artifact.built.appId);
 const program=structuredClone(base.program);
 const sources=[...base.sources,
  {id:DATA_ID,sourceText:sourceData.toString('utf8'),origin:{...DATA_ORIGIN}},
  ...materialized.map(r=>({id:r.id,sourceText:r.text,origin:{...r.origin}}))
 ];
 const expectedSourceOrigins={...base.expectedSourceOrigins,
  [DATA_ID]:{...DATA_ORIGIN},
  ...Object.fromEntries(materialized.map(r=>[r.id,{...r.origin}]))
 };
 const registry={...base.registry};
 for(const r of materialized){
  const domain='dke-r24-'+r.id.split('-').at(-1);
  program.domains.push({
   id:domain,description:'Independent actual selected Business Domain: '+r.packageId,
   repositories:['kaicreator-mm/domain-harness']
  });
  program.elements.push({
   id:'dke.r24.'+r.id,domainId:domain,kind:'knowledge',
   description:'Own source code, actual BUILD-selected Business; read-only Knowledge Function',
   packageId:r.packageId,dependsOn:[],
   functions:[{
    id:r.functionId,kind:'knowledge',effect:'none',
    binding:{type:'local',sourceId:r.id},
    contract:structuredClone(CONTRACT),
    sourceDependencies:[DATA_ID]
   }]
  });
  registry[r.functionId]={
   sourceId:r.id,sha256:sourceSha256(r.text),gitBlob:r.blob,
   origin:{...r.origin},
   execute:input=>r.id.endsWith('ed06')
    ? consumeEd06(projection,contractAPI,{...input,variant:'REVIEWER_ROOT'}).output
    : readCrossview(projection,input)
  };
 }
 const artifact=compileDisV020Aot({built,program,sources,expectedSourceOrigins});
 dualPackageQualified(artifact);
 const activate=(opts={})=>loadDisV020Aot(artifact,{
  expectedDigest:opts.expectedDigest??artifact.digest,
  registry:opts.registry??registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dke-two-native-business-packages-r24'
 });
 return{built,program,sources,registry,expectedSourceOrigins,artifact,activate};
}

test('R24 canonical BUILD actually seals two distinct DKE Business Packages',async()=>{
 const f=await fixture(),q=dualPackageQualified(f.artifact);
 assert.deepEqual(q.sourceConsumers.get(DATA_ID),expectedReaders);
 assert.equal(f.artifact.sources.find(x=>x.id===DATA_ID).origin.gitBlob,DATA_ORIGIN.gitBlob);
 assert.notEqual(f.artifact.built.subjectDigest,undefined);
 assert.equal(firstPolicy().packageId,materialized[0].packageId);
 assert.equal(secondPolicy().packageId,materialized[1].packageId);
 assert.ok(f.built.modules.filter(x=>DECLARED.some(y=>y.packageId===x.packageId)).length===2);
});
test('R24 KDP/SDK boots both selected Business module sources and invokes both LOCAL Functions',async()=>{
 const f=await fixture(),app=await f.activate();
 try{
  assert.equal(app.state,'READY');
  let calls=0;
  for(const domain of ['tally','textile']){
   const cqId=SUPPORTED[domain].cqId,outputs=[];
   for(const r of materialized){
    const value=await app.invoke(r.functionId,{domain,cqId},
     {expectedContractVersion:'1.0.0'});
    assert.equal(value.kind,'OBSERVATION');
    assert.equal(value.authority,'NONE');
    assert.equal(value.disposition,'UNKNOWN');
    assert.equal(value.value.sourceStatus,SUPPORTED[domain].sourceStatus);
    assert.equal(value.evidence.attested,false);
    assert.equal(value.evidence.source.gitBlob,r.blob);
    assert.deepEqual(value.value.sourceRefs,projection.cases.sourceData[domain].cq.find(x=>x.id===cqId).refs);
    outputs.push(value.value);calls++;
   }
   assert.deepEqual([...outputs[0].selectedScopes].sort(),[...outputs[1].selectedScopes].sort());
  }
  assert.equal(calls,4);
 }finally{app.stop()}
});
test('R24 source-currentness and reverse dependencies fail closed across both selected Business packages',async()=>{
 const f=await fixture();
 const missing=structuredClone(f.program);
 const second=missing.elements.flatMap(x=>x.functions).find(x=>x.id===materialized[1].functionId);
 delete second.sourceDependencies;
 const omitted=compileDisV020Aot({
  built:f.built,program:missing,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins
 });
 assert.equal(qualifyDisV020Artifact(omitted).sourceConsumers.get(DATA_ID).length,1);
 assert.throws(()=>dualPackageQualified(omitted),reject('DKE_R24_CLOSED_SOURCE_CONSUMER_SET_MISMATCH'));
 const altered=structuredClone(f.sources);
 altered.find(x=>x.id===DATA_ID).sourceText+=' ';
 assert.throws(()=>compileDisV020Aot({
  built:f.built,program:f.program,sources:altered,expectedSourceOrigins:f.expectedSourceOrigins
 }),reject('DIS_BUILD_SOURCE_BYTES_DRIFT'));
 const noPackage=structuredClone(f.program);
 noPackage.elements.find(x=>x.packageId===materialized[1].packageId).packageId='business-dke-not-selected@0.0.1-demo';
 assert.throws(()=>compileDisV020Aot({
  built:f.built,program:noPackage,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins
 }),reject('DIS_ELEMENT_PACKAGE_UNSELECTED'));
 const fake={...f.registry,[materialized[1].functionId]:{
  ...f.registry[materialized[1].functionId],gitBlob:'0'.repeat(40)
 }};
 await assert.rejects(f.activate({registry:fake}),reject('DIS_LOCAL_REGISTRY_MISMATCH'));
 await assert.rejects(f.activate({expectedDigest:'0'.repeat(64)}),reject('DIS_INSTALLED_AOT_MISMATCH'));
});


// R25: upstream Tally graph has a REAL 793→807 source evolution (14 records).
// This bounded input retains only the changed records, NOT the full 807-node KG.
// Independent selected Business readers have source-pinned R25 Function implementations.
import {inspectR25 as inspectEd06R25} from './dke-r25-ed06-reader.mjs';
import {inspectR25 as inspectCrossviewR25} from './dke-r25-crossview-reader.mjs';

const R25_SNAPSHOT_ID='dke-r25-tally-change';
const R25_SRC_COMMIT='c3c178786d0ebb23d749e6ef051036af374f8147';
const R25_VERSIONS=Object.freeze({
 before:Object.freeze({
  filename:'dke-r25-tally-793.json',
  blob:'617e494118c31bebeafab0300d5bd8469e44e6b2',
  tallyBlob:'2d4498dfa5f90bcf57cc81e9c155fb9ede31bf00',
  tallyCommit:'ab5c8231e871fb3df18df05176943d2a97c997f5',count:793
 }),
 after:Object.freeze({
  filename:'dke-r25-tally-807.json',
  blob:'3849e4c96aa4abc3a87cd845511b12726e601689',
  tallyBlob:'b6dc804d3ccc3aac7ce818533c2948f54b34644a',
  tallyCommit:'a8f4986b099aba27cd86ce6a78e1c19159d1de55',count:807
 })
});
const R25_READERS=Object.freeze([
 Object.freeze({
  packageId:'business-dke-ed06-observation@0.0.1-demo',
  id:'dke-r25-ed06-source',functionId:'dke.r25.ed06.inspect',
  file:'dke-r25-ed06-reader.mjs',
  blob:'ad50f202209f2312b22d8e46697274d5537318c0',
  execute:inspectEd06R25
 }),
 Object.freeze({
  packageId:'business-dke-crossview-observation@0.0.1-demo',
  id:'dke-r25-crossview-source',functionId:'dke.r25.crossview.inspect',
  file:'dke-r25-crossview-reader.mjs',
  blob:'81a991f4dc404d4d31ddbfb643dbd209a7036278',
  execute:inspectCrossviewR25
 })
]);
const R25_CONTRACT={
 schema:'dis.v0.2.function-contract/1',version:'1.0.0',
 input:{type:'record',fields:{cqId:'string'},additionalProperties:false},
 output:{type:'record',fields:{
  status:'string',cqId:'string',sourceStatus:'string',sourceRefs:'array',
  evidenceRefs:'array',reason:'string',consumerId:'string'
 },optional:['evidenceRefs'],additionalProperties:false},
 outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN',OBSERVED:'OBSERVED'}},
 evidence:{refField:'evidenceRefs',requiredFor:['OBSERVED']},
 compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
};
const R25_READER_IDS=R25_READERS.map(r=>r.functionId).sort();
const r25Origin=(filename)=>({
 repository:'kaicreator-mm/domain-harness',commit:R25_SRC_COMMIT,
 path:'examples/dis-v020-native-sdk/'+filename
});
function readR25Version(version){
 const d=R25_VERSIONS[version];
 if(!d)throw Error('R25_UNKNOWN_VERSION');
 const bytes=readFileSync(new URL('./fixtures/'+d.filename,import.meta.url));
 assert.equal(gitBlob(bytes),d.blob);
 const data=JSON.parse(bytes.toString('utf8'));
 assert.equal(data.source.repository,'kaicreator-mm/tally');
 assert.equal(data.source.path,'docs/versions/v2.1.1/knowledge/generated/graph.jsonld');
 assert.equal(data.source.commit,d.tallyCommit);
 assert.equal(data.source.gitBlob,d.tallyBlob);
 assert.equal(data.source.totalGraphNodes,d.count);
 assert.equal(data.sourceQualification,'PENDING_INDEPENDENT_REVIEW');
 assert.equal(data.records.length,version==='before'?0:14);
 assert.equal(data.stableOriginalProjection.gitBlob,'47cd14bd7ddaeb45c46f445e5f59ff3b5338d23a');
 assert.equal(data.stableOriginalProjection.existingIds.length,19);
 return{data,sourceText:bytes.toString('utf8'),source:{
  ...r25Origin('fixtures/'+d.filename),gitBlob:d.blob
 }};
}
function assertR25SelectedConsumers(artifact){
 const q=qualifyDisV020Artifact(artifact);
 const names=q.sourceConsumers.get(R25_SNAPSHOT_ID);
 if(JSON.stringify(names)!==JSON.stringify(R25_READER_IDS)){
  const error=new Error('DKE_R25_SOURCE_CONSUMER_CLOSURE_MISSING');
  error.code=error.message;
  throw error;
 }
 for(const r of R25_READERS){
  assert.equal(q.functions.get(r.functionId)?.element.packageId,r.packageId);
  assert.deepEqual(q.functions.get(r.functionId)?.definition.sourceDependencies,[R25_SNAPSHOT_ID]);
 }
 return q;
}
async function fixtureR25(version){
 const baseline=await fixture(),selected=readR25Version(version);
 const program=structuredClone(baseline.program);
 const sources=[...baseline.sources,{
  id:R25_SNAPSHOT_ID,sourceText:selected.sourceText,origin:selected.source
 }];
 const expectedSourceOrigins={...baseline.expectedSourceOrigins,
  [R25_SNAPSHOT_ID]:selected.source
 };
 const registry={...baseline.registry};
 for(const reader of R25_READERS){
  const bytes=readFileSync(new URL('./'+reader.file,import.meta.url));
  assert.equal(gitBlob(bytes),reader.blob);
  const code=bytes.toString('utf8');
  const origin={...r25Origin(reader.file),gitBlob:reader.blob};
  sources.push({id:reader.id,sourceText:code,origin});
  expectedSourceOrigins[reader.id]=origin;
  const element=program.elements.find(e=>e.packageId===reader.packageId&&e.kind==='knowledge');
  assert.ok(element,'R25 must attach only to an ACTUALLY selected Business package');
  element.functions.push({
   id:reader.functionId,kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:reader.id},
   contract:structuredClone(R25_CONTRACT),
   sourceDependencies:[R25_SNAPSHOT_ID]
  });
  registry[reader.functionId]={
   sourceId:reader.id,sha256:sourceSha256(code),
   gitBlob:reader.blob,origin,
   execute:input=>reader.execute(selected.data,input)
  };
 }
 const artifact=compileDisV020Aot({
  built:baseline.built,program,sources,expectedSourceOrigins
 });
 assertR25SelectedConsumers(artifact);
 const activate=(options={})=>loadDisV020Aot(artifact,{
  expectedDigest:options.expectedDigest??artifact.digest,
  registry:options.registry??registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dke-r25-versioned-two-business'
 });
 return{...baseline,version,sourceData:selected.data,sources,expectedSourceOrigins,
  registry,program,artifact,activate};
}
function demandCurrentRevision(artifact,currentFixture){
 // Consumer-application / installer-owned trust anchor, not a dynamic LLM
 // authority. Generic DIS SDK already needs expectedDigest from installer.
 const actual=qualifyDisV020Artifact(artifact).pins.get(R25_SNAPSHOT_ID);
 const expected=qualifyDisV020Artifact(currentFixture.artifact).pins.get(R25_SNAPSHOT_ID);
 if(!actual||!expected||actual.sha256!==expected.sha256||
    actual.origin.gitBlob!==expected.origin.gitBlob||
    actual.origin.commit!==expected.origin.commit){
  const e=new Error('DKE_R25_SOURCE_REVISION_STALE');e.code=e.message;throw e;
 }
 return true;
}

test('R25 authentic Tally 793→807 Git corpus content difference is 14 original PENDING_REVIEW nodes',()=>{
 const before=readR25Version('before').data,after=readR25Version('after').data;
 assert.equal(before.records.length,0);
 assert.equal(after.records.length,14);
 assert.notEqual(before.source.gitBlob,after.source.gitBlob);
 const oldSelected=new Set(before.records.map(n=>n['@id']));
 assert.equal(after.records.filter(n=>!oldSelected.has(n['@id'])).length,14);
 assert.equal(after.records.filter(n=>n['@type']==='se:Case').length,2);
 assert.equal(after.records.filter(n=>n['@type']==='se:Evidence').length,5);
 const byId=new Map(after.records.map(n=>[n['@id'],n]));
 for(const [cqId,caseId] of Object.entries(after.selectedCqs)){
  assert.equal(before.selectedCqs[cqId],caseId);
  assert.equal(byId.get(caseId)['se:lifecycle_status'],'PENDING_REVIEW');
  assert.equal(byId.get(caseId)['se:synthetic'],false);
 }
 assert.equal(before.stableOriginalProjection.existingIds.join(','),
  after.stableOriginalProjection.existingIds.join(','));
});
test('R25 old and new selected AOT actually replay both Business readers, changing only source-bound incident CQs',async()=>{
 const old=await fixtureR25('before'),fresh=await fixtureR25('after');
 assert.notEqual(old.artifact.digest,fresh.artifact.digest);
 assert.equal(old.artifact.built.subjectDigest,fresh.artifact.built.subjectDigest);
 assert.deepEqual(assertR25SelectedConsumers(old.artifact).sourceConsumers.get(R25_SNAPSHOT_ID),R25_READER_IDS);
 assert.deepEqual(assertR25SelectedConsumers(fresh.artifact).sourceConsumers.get(R25_SNAPSHOT_ID),R25_READER_IDS);
 const outcomes=[];
 for(const [version,f] of [['before',old],['after',fresh]]){
  const app=await f.activate();
  try{
   assert.equal(app.state,'READY');
   for(const cqId of ['CQ-09F-CF','CQ-09F-GH']){
    for(const reader of R25_READERS){
     const x=await app.invoke(reader.functionId,{cqId},{expectedContractVersion:'1.0.0'});
     assert.equal(x.kind,'OBSERVATION');
     assert.equal(x.authority,'NONE');assert.equal(x.evidence.attested,false);
     assert.equal(x.disposition,version==='before'?'UNKNOWN':'OBSERVED');
     assert.equal(x.value.sourceStatus,version==='before'?'ABSENT':'PENDING_REVIEW');
     assert.equal((x.value.evidenceRefs?.length??0)>0,version==='after');
     assert.equal(x.evidence.source.gitBlob,reader.blob);
     outcomes.push({version,cqId,reader:reader.functionId,status:x.disposition});
    }
   }
   // The original 19-node projection + R24 crossview CQ did NOT change.
   for(const pkg of materialized){
    const x=await app.invoke(pkg.functionId,
     {domain:'tally',cqId:'CQ-T-CROSSCUT'},{expectedContractVersion:'1.0.0'});
    assert.equal(x.disposition,'UNKNOWN');
    assert.equal(x.value.sourceStatus,'PENDING_REVIEW');
    assert.equal(x.evidence.attested,false);
   }
  }finally{app.stop()}
 }
 assert.equal(outcomes.length,8);
 assert.equal(outcomes.filter(x=>x.status==='OBSERVED').length,4);
 assert.equal(outcomes.filter(x=>x.status==='UNKNOWN').length,4);
});
test('R25 installer refuses stale old AOT after real source selection changes, but builds fresh selected AOT',async()=>{
 const old=await fixtureR25('before'),fresh=await fixtureR25('after');
 assert.throws(()=>demandCurrentRevision(old.artifact,fresh),
  reject('DKE_R25_SOURCE_REVISION_STALE'));
 assert.equal(demandCurrentRevision(fresh.artifact,fresh),true);
 await assert.rejects(old.activate({expectedDigest:fresh.artifact.digest}),
  reject('DIS_INSTALLED_AOT_MISMATCH'));
 const now=await fresh.activate();
 try{
  const r=await now.invoke(R25_READERS[0].functionId,{cqId:'CQ-09F-CF'});
  assert.equal(r.disposition,'OBSERVED');
  assert.equal(r.evidence.attested,false);
 }finally{now.stop()}
});
test('R25 source selection, real evidence closure and independent reverse registration reject invalid updates',async()=>{
 const f=await fixtureR25('after');
 const omitted=structuredClone(f.program);
 const second=omitted.elements.flatMap(e=>e.functions)
  .find(x=>x.id===R25_READERS[1].functionId);
 delete second.sourceDependencies; // valid omission but incomplete impact closure
 const drift=compileDisV020Aot({
  built:f.built,program:omitted,sources:f.sources,expectedSourceOrigins:f.expectedSourceOrigins
 });
 assert.equal(qualifyDisV020Artifact(drift).sourceConsumers.get(R25_SNAPSHOT_ID).length,1);
 assert.throws(()=>assertR25SelectedConsumers(drift),
  reject('DKE_R25_SOURCE_CONSUMER_CLOSURE_MISSING'));
 const tampered=structuredClone(f.sources);
 tampered.find(x=>x.id===R25_SNAPSHOT_ID).sourceText+=' ';
 assert.throws(()=>compileDisV020Aot({
  built:f.built,program:f.program,sources:tampered,expectedSourceOrigins:f.expectedSourceOrigins
 }),reject('DIS_BUILD_SOURCE_BYTES_DRIFT'));
 const missing=structuredClone(f.sourceData);
 missing.records=missing.records.filter(n=>n['@id']!=='se:EVD-09F-CF-SHARED-DEPENDENCY');
 for(const reader of R25_READERS){
  assert.throws(()=>reader.execute(missing,{cqId:'CQ-09F-CF'}),
   reject('DKE_R25_EVIDENCE_CLOSURE_INVALID'));
 }
 const unreviewed=structuredClone(f.sourceData);
 unreviewed.records.find(n=>n['@id']==='se:CASE-09F-CF-KV-DEPENDENCY')['se:lifecycle_status']='ACCEPTED';
 for(const reader of R25_READERS){
  assert.throws(()=>reader.execute(unreviewed,{cqId:'CQ-09F-CF'}),
   reject('DKE_R25_CASE_INVALID'));
 }
});



// R27: consume the DKE R26 Git-authored impact catalog with exactly the
// R25 selected native BUILD/Package/Function registry, never a generic
// mock or implicitly qualified SAP.
import {qualifyR27Impact} from './dke-r27-impact.mjs';
const R27_CATALOG_BLOB='e710997c3b4a1abbe33287f7b79596385c8382d3';
function r27Catalog(){
 const bytes=readFileSync(new URL('./fixtures/dke-r27-impact-catalog.json',import.meta.url));
 assert.equal(gitBlob(bytes),R27_CATALOG_BLOB);
 return JSON.parse(bytes.toString('utf8'));
}
const r27Impact=(catalog,old,fresh)=>qualifyR27Impact({
 catalog,before:old.sourceData,after:fresh.sourceData,
 oldAot:old.artifact,newAot:fresh.artifact
});
test('R27 actual Tally 14-record source delta maps into two CQs, two unqualified SAP proposals and two selected Business packages',async()=>{
 const old=await fixtureR25('before'),fresh=await fixtureR25('after');
 const summary=r27Impact(r27Catalog(),old,fresh);
 assert.equal(summary.schema,'dis.r27.bounded-selected-impact/1');
 assert.deepEqual(summary.changedSourceIds,[R25_SNAPSHOT_ID]);
 assert.equal(summary.addedRecordIds.length,14);
 assert.deepEqual(summary.impacts.map(x=>x.cqId),['CQ-09F-CF','CQ-09F-GH']);
 assert.deepEqual(summary.impacts.map(x=>x.sapProposal),['R26-PROPOSAL-CF','R26-PROPOSAL-GH']);
 assert.deepEqual(summary.staleFunctions,R25_READER_IDS);
 assert.deepEqual(summary.affectedPackages,R25_READERS.map(x=>x.packageId).sort());
 assert.deepEqual(summary.stableCqIds,['CQ-T-CROSSCUT']);
 assert.equal(summary.registeredSelectedClosure,'BOUNDED_ONLY');
 assert.equal(summary.globalAotReselectionRequired,true);
 assert.notEqual(summary.previousAotDigest,summary.candidateAotDigest);
 assert.deepEqual(summary.qualifiedSAPs,[]);
 assert.equal(summary.independentOracle,'NOT_VERIFIED');
 assert.equal(summary.authority,'NONE');
 assert.equal(summary.effectsAllowed,false);
 assert.equal(summary.activeProcessRevoked,false);
 for(const c of summary.impacts){
  assert.equal(c.affectedFunctions.length,2);
  assert.equal(c.affectedPackages.length,2);
  assert.equal(c.sapQualified,false);
  assert.equal(c.semanticAuthority,'NONE');
  assert.equal(c.effectAuthority,'NONE');
 }
});
test('R27 R26 native loader enforces new external original-source checkpoint against old AOT despite valid old digest',async()=>{
 const old=await fixtureR25('before'),fresh=await fixtureR25('after');
 const current=qualifyDisV020Artifact(fresh.artifact).pins.get(R25_SNAPSHOT_ID);
 assert.ok(current);
 const expectedSourcePins={
  [R25_SNAPSHOT_ID]:{sha256:current.sha256,origin:{...current.origin}}
 };
 await assert.rejects(loadDisV020Aot(old.artifact,{
  expectedDigest:old.artifact.digest,expectedSourcePins,
  registry:old.registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dis-r27-upstream-source-currentness'
 }),reject('DIS_SOURCE_ANCHOR_STALE'));
 const app=await loadDisV020Aot(fresh.artifact,{
  expectedDigest:fresh.artifact.digest,expectedSourcePins,
  registry:fresh.registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dis-r27-upstream-source-currentness'
 });
 try{
  const response=await app.invoke(R25_READERS[0].functionId,
   {cqId:'CQ-09F-CF'},{expectedContractVersion:'1.0.0'});
  assert.equal(response.kind,'OBSERVATION');
  assert.equal(response.disposition,'OBSERVED');
  assert.equal(response.value.sourceStatus,'PENDING_REVIEW');
  assert.equal(response.authority,'NONE');
  assert.equal(response.evidence.attested,false);
 }finally{app.stop()}
});
test('R27 false SAP approval, unknown selected package, omitted reader, forged source and stable-CQ claims fail closed',async()=>{
 const old=await fixtureR25('before'),fresh=await fixtureR25('after');
 const mutate=change=>{
  const c=structuredClone(r27Catalog());change(c);
  return()=>r27Impact(c,old,fresh);
 };
 assert.throws(mutate(c=>{c.registrations[0].readers.pop()}),
  reject('DKE_R27_SELECTED_CONSUMERS_INCOMPLETE'));
 assert.throws(mutate(c=>{c.registrations[0].readers[0].packageId='business-forged@0.0.1'}),
  reject('DKE_R27_SELECTED_CONSUMERS_INCOMPLETE'));
 assert.throws(mutate(c=>{c.registrations[0].sapCandidate.qualified=true}),
  reject('DKE_R27_SAP_UNQUALIFIED'));
 assert.throws(mutate(c=>{c.registrations[0].sapCandidate.oracle='ACCEPTED'}),
  reject('DKE_R27_SAP_UNQUALIFIED'));
 assert.throws(mutate(c=>{c.sourcePair.after.blob='0'.repeat(40)}),
  reject('DKE_R27_SOURCE_VERSION_DRIFT'));
 assert.throws(mutate(c=>{c.stableObservation.qualified=true}),
  reject('DKE_R27_STABLE_CQ_CLOSURE_INVALID'));
});
test('R27 missing Evidence, orphan selected record, duplicated source identity and invented old presence fail closed',async()=>{
 const old=await fixtureR25('before'),fresh=await fixtureR25('after');
 const change=(key,fn,code)=>{
  const f={...fresh,sourceData:structuredClone(fresh.sourceData)};
  const b={...old,sourceData:structuredClone(old.sourceData)};
  fn(key==='before'?b.sourceData:f.sourceData);
  assert.throws(()=>r27Impact(r27Catalog(),b,f),reject(code));
 };
 change('after',d=>{d.records=d.records.filter(n=>
  n['@id']!=='se:EVD-09F-GH-REPLICATION');
  d.records.push({'@id':'se:FORGED-ORPHAN','@type':'se:Source'});
 },'DKE_R27_EVIDENCE_CLOSURE_MISSING');
 change('after',d=>{d.records[13]={...d.records[12]}},
  'DKE_R27_DUPLICATE_SOURCE_RECORD');
 change('before',d=>{d.records.push({...fresh.sourceData.records[0]})},
  'DKE_R27_SOURCE_DELTA_INVALID');
 change('after',d=>{
  d.records[0]['se:lifecycle_status']='ACCEPTED';
 },'DKE_R27_CASE_SOURCE_INVALID');
});


// R29 C1: replay DKE's immutable original source-first reviewer ledger
// against real AOT-selected Business Functions without granting SAP authority.
import {evaluateR29C1} from './dke-r29-source-first.mjs';
const R29_REVIEW_BLOB='0b7d514cc297a07952b2cd536c2dafd3e47bda45';
const R29_PROPOSAL_BLOB='9dc978f5138c561efabe503f254e565aa5f5700a';
function r29Source(name,blob){
 const bytes=readFileSync(new URL('./fixtures/'+name,import.meta.url));
 assert.equal(gitBlob(bytes),blob,'source-first review must preserve original Git Blob');
 return JSON.parse(bytes.toString('utf8'));
}
function r29Eval(f,review,proposal){
 return evaluateR29C1({
  review:review??r29Source('dke-r29-source-first-review.json',R29_REVIEW_BLOB),
  proposal:proposal??r29Source('dke-r29-gh-locator-proposal.json',R29_PROPOSAL_BLOB),
  originalProjection:f.sourceData,selectedAot:f.artifact
 });
}
test('R29 original source-first ledger identifies two Case-owned Elements and two selected Business readers, but never accepts unreviewed SAP',async()=>{
 const f=await fixtureR25('after');
 const verdict=r29Eval(f);
 assert.equal(verdict.schema,'dis.r29.c1.source-first-element-qualification/1');
 assert.deepEqual(verdict.comparedStrategies,['SEPARATE_CASE_ELEMENTS','SINGLE_GENERIC_INCIDENT_ELEMENT']);
 assert.equal(verdict.preferredDecomposition,'SEPARATE_CASE_ELEMENTS');
 assert.deepEqual(verdict.proposedElements.map(x=>x.proposedElement),[
  'tally.resilience.shared-dependency-case',
  'tally.consistency.cross-region-failover-case'
 ]);
 assert.deepEqual(verdict.proposedElements.map(x=>x.cq),['CQ-09F-CF','CQ-09F-GH']);
 assert.deepEqual(verdict.selectedBusinessFunctions,R25_READER_IDS);
 assert.deepEqual(verdict.selectedBusinessPackages,R25_READERS.map(x=>x.packageId).sort());
 assert.equal(verdict.stableCQ,'CQ-T-CROSSCUT');
 assert.equal(verdict.GHSourceGap,'OPEN');
 assert.equal(verdict.candidatePatchImpact,'CQ-09F-GH');
 assert.equal(verdict.independentQualified,false);
 assert.equal(verdict.canonicalTallyGraphChanged,false);
 assert.equal(verdict.nativeAotWithCandidateOverlayBuilt,false);
 assert.equal(verdict.SAPAuthority,'NONE');
 assert.equal(verdict.effectAuthority,'NONE');
 assert.equal(verdict.wholeAppConsumerCompleteness,'UNKNOWN');
 const app=await f.activate();
 try{
  for(const cqId of ['CQ-09F-CF','CQ-09F-GH']){
   for(const reader of R25_READERS){
    const observation=await app.invoke(reader.functionId,{cqId},{expectedContractVersion:'1.0.0'});
    assert.equal(observation.kind,'OBSERVATION');
    assert.equal(observation.authority,'NONE');
    assert.equal(observation.disposition,'OBSERVED');
    assert.equal(observation.value.sourceStatus,'PENDING_REVIEW');
    assert.equal(observation.evidence.attested,false);
   }
  }
 }finally{app.stop()}
});
test('R29 original reviewer/source gap and proposed decomposition cannot mint independent domain authority',async()=>{
 const f=await fixtureR25('after');
 const ledger=()=>r29Source('dke-r29-source-first-review.json',R29_REVIEW_BLOB);
 const proposal=()=>r29Source('dke-r29-gh-locator-proposal.json',R29_PROPOSAL_BLOB);
 const mutateReview=(change,code)=>{
  const x=ledger();change(x);
  assert.throws(()=>r29Eval(f,x,proposal()),reject(code));
 };
 const mutatePatch=(change,code)=>{
  const x=proposal();change(x);
  assert.throws(()=>r29Eval(f,ledger(),x),reject(code));
 };
 mutateReview(x=>{x.independentHumanOrSecondModel=true},'DKE_R29_REVIEW_AUTHORITY_FORGED');
 mutateReview(x=>{x.globalSAPQualification='ACCEPTED'},'DKE_R29_REVIEW_AUTHORITY_FORGED');
 mutateReview(x=>{x.cases[0].sapQualified=true},'DKE_R29_SAP_OWNER_UNQUALIFIED');
 mutateReview(x=>{x.cases[1].readiness='READY'},'DKE_R29_SAP_OWNER_UNQUALIFIED');
 mutateReview(x=>{x.cases[1].owner=x.cases[0].owner},'DKE_R29_SAP_OWNER_UNQUALIFIED');
 mutateReview(x=>{x.pendingSourceRepair[0].status='CLOSED'},'DKE_R29_GH_LOCATOR_GAP_DENIED');
 mutateReview(x=>{x.strategies[0].ownerAmbiguity='LOW_WITH_INDEPENDENT_AUTHORITY'},'DKE_R29_DECOMPOSITION_STRATEGY_INVALID');
 mutateReview(x=>{x.strategies[1].independentQualified=true},'DKE_R29_DECOMPOSITION_STRATEGY_INVALID');
 mutatePatch(x=>{x.canonicalSourceAmended=true},'DKE_R29_UNAPPROVED_SOURCE_PATCH');
 mutatePatch(x=>{x.independentOracle=true},'DKE_R29_UNAPPROVED_SOURCE_PATCH');
 mutatePatch(x=>{x.added[0]['se:synthetic']=false},'DKE_R29_UNAPPROVED_SOURCE_PATCH');
 mutatePatch(x=>{x.publisher.allWebhooksDelivered=true},'DKE_R29_UNAPPROVED_SOURCE_PATCH');
 mutatePatch(x=>{x.impact.affectedCQs=['CQ-09F-CF']},'DKE_R29_UNAPPROVED_SOURCE_PATCH');
});
test('R29 missing original Evidence chain and forged canonical source fail closed instead of widening generic Element ownership',async()=>{
 const f=await fixtureR25('after');
 const ledger=r29Source('dke-r29-source-first-review.json',R29_REVIEW_BLOB);
 const patch=r29Source('dke-r29-gh-locator-proposal.json',R29_PROPOSAL_BLOB);
 const f1={...f,sourceData:structuredClone(f.sourceData)};
 f1.sourceData.records=f1.sourceData.records.filter(x=>x['@id']!=='se:EVD-09F-GH-REPLICATION');
 assert.throws(()=>r29Eval(f1,ledger,patch),reject('DKE_R29_SOURCE_RECORDS_INVALID'));
 const f2={...f,sourceData:structuredClone(f.sourceData)};
 f2.sourceData.records.find(x=>x['@id']==='se:CASE-09F-GH-DB-FAILOVER')['se:evidence_refs'].push({'@id':'se:FAKE-UNSELECTED'});
 assert.throws(()=>r29Eval(f2,ledger,patch),reject('DKE_R29_EVIDENCE_CLOSURE_MISSING'));
 const f3={...f,sourceData:structuredClone(f.sourceData)};
 f3.sourceData.source.gitBlob='0'.repeat(40);
 assert.throws(()=>r29Eval(f3,ledger,patch),reject('DKE_R29_ORIGINAL_SOURCE_DRIFT'));
});
