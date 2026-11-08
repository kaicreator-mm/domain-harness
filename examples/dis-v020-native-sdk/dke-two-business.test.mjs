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
