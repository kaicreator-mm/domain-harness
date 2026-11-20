/** B14/R60 — actual DKE R16 four full-source authenticity receipt
 * selected via native DIS Knowledge Function, but never promoted to SAP.
 * The original third-party full docs were verified upstream, NOT in DIS.
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
import {makeR16SourceReader,qualifyR16Receipt,R16_ORIGIN,R16_RECEIPT_BLOB}
 from './dke-r16-source-reader.mjs';

const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'ab088e08c8b9cbb3f0950aeee709062c5e79b09e',
 path:'examples/dis-v020-native-sdk/dke-r16-source-reader.mjs',
 gitBlob:'9393ab929a7689e0aad1a435f96ae11d229e720b'
});
const fail=code=>e=>e?.code===code;
const clone=structuredClone;
const fPromise=makeNativeFixture();
async function setup(){
 const f=await fPromise;
 const [receiptText,readerText]=await Promise.all([
  readFile(new URL('./fixtures/dke-r16-original-source-receipt.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-r16-source-reader.mjs',import.meta.url),'utf8')
 ]);
 assert.equal(sourceGitBlob(receiptText),R16_RECEIPT_BLOB);
 assert.equal(sourceGitBlob(readerText),READER_ORIGIN.gitBlob);
 const reader=makeR16SourceReader(receiptText);
 const additional=[
  {id:'dke-r16-receipt',sourceText:receiptText,origin:R16_ORIGIN},
  {id:'dke-r16-reader',sourceText:readerText,origin:READER_ORIGIN}
 ];
 const sources=[...f.sources,...additional];
 const expectedSourceOrigins={...f.expectedSourceOrigins,
  'dke-r16-receipt':R16_ORIGIN,
  'dke-r16-reader':READER_ORIGIN};
 const program=clone(f.program);
 program.domains.push({
  id:'dke.r16.source',description:'Immutable original publisher source authenticity evidence, SAP unqualified',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.r16.authenticity',domainId:'dke.r16.source',version:'1.0.0',
  kind:'knowledge',description:'Read-only original R16 source scope vs semantic qualification',
  dependsOn:[],functions:[{
   id:'dke.r16.readSourceScope',kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:'dke-r16-reader'},
   sourceDependencies:['dke-r16-receipt'],
   contract:{
    schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{id:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',queryId:'string',scopeClass:'string',
     sourceAuthenticity:'string',originalPublisherFiles:'number',
     anchorCount:'number',rejectedMutants:'number',receiptGitBlob:'string',
     semanticQualification:'string',sourceOwnerApproved:'boolean',
     independentSemanticOracle:'boolean',sapQualified:'boolean',
     templateRendered:'boolean',effectDispatched:'boolean',evidenceRefs:'array'
    },optional:['evidenceRefs'],additionalProperties:false},
    outcomes:{field:'status',classes:{OBSERVED:'OBSERVED',UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:['OBSERVED']},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const registry={...f.registry,'dke.r16.readSourceScope':{
  sourceId:'dke-r16-reader',sha256:sourceSha256(readerText),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,
  execute:input=>reader.query(input)
 }};
 const installed=Object.fromEntries(additional.map(x=>[x.id,{
  sha256:sourceSha256(x.sourceText),origin:x.origin
 }]));
 const build=(p=program,s=sources,o=expectedSourceOrigins)=>compileDisV020Aot({
  built:f.artifact.built,program:p,sources:s,expectedSourceOrigins:o
 });
 return {f,receiptText,readerText,reader,sources,program,
  expectedSourceOrigins,registry,installed,build,artifact:build()};
}
const ctxPromise=setup();
const activate=(x,options={})=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:dis-r60-native',...options
});
test('R60 original DKE R16 full-original-publisher receipt is selected AOT Knowledge DATA, not executable or SAP',async()=>{
 const x=await ctxPromise,q=qualifyDisV020Artifact(x.artifact);
 const fn=q.functions.get('dke.r16.readSourceScope');
 assert.equal(fn.definition.kind,'knowledge');
 assert.equal(fn.definition.effect,'none');
 assert.equal(fn.definition.binding.sourceId,'dke-r16-reader');
 assert.deepEqual(fn.definition.sourceDependencies,['dke-r16-receipt']);
 assert.equal(q.pins.get('dke-r16-receipt').origin.gitBlob,R16_RECEIPT_BLOB);
 assert.equal(q.pins.get('dke-r16-receipt').origin.commit,R16_ORIGIN.commit);
 assert.ok(q.sourceConsumers.get('dke-r16-receipt').includes('dke.r16.readSourceScope'));
 const app=await activate(x);
 try{assert.equal(app.state,'READY');assert.equal(app.contractVersions['dke.r16.readSourceScope'],'1.0.0')}
 finally{app.stop()}
});
test('R60 original publisher byte-authenticity and all 11 source-scope questions are typed OBSERVED vs UNKNOWN, never qualified semantics',async()=>{
 const x=await ctxPromise,app=await activate(x);
 try{
  const known=new Map([
   ['S01','VENDOR_MODE_CLASSIFICATION_CONDITIONAL'],
   ['S02','PRODUCT_GUIDE_LITERAL'],
   ['S09','PUBLISHER_TEMPLATE_UNRENDERED_NEGATIVE'],
   ['S10','PRODUCT_GUIDE_LITERAL']
  ]);
  let observed=0,unknown=0;
  for(let i=1;i<=11;i++){
   const id='S'+String(i).padStart(2,'0');
   const out=await app.invoke('dke.r16.readSourceScope',{id},{expectedContractVersion:'1.0.0'});
   const v=out.value;
   assert.equal(out.kind,'OBSERVATION');assert.equal(out.authority,'NONE');
   assert.equal(out.evidence.attested,false);
   assert.equal(v.originalPublisherFiles,4);assert.equal(v.anchorCount,14);
   assert.equal(v.rejectedMutants,25);assert.equal(v.receiptGitBlob,R16_RECEIPT_BLOB);
   assert.equal(v.sourceAuthenticity,'UPSTREAM_NATIVE_FULL_BYTES_RECEIPT_VERIFIED');
   assert.equal(v.semanticQualification,'NOT_REVIEWED');
   assert.equal(v.sourceOwnerApproved,false);
   assert.equal(v.independentSemanticOracle,false);assert.equal(v.sapQualified,false);
   assert.equal(v.templateRendered,false);assert.equal(v.effectDispatched,false);
   if(known.has(id)){
    observed++;assert.equal(v.scopeClass,known.get(id));
    assert.equal(out.disposition,'OBSERVED');
    assert.deepEqual(out.evidence.declaredRefs,['dke:r16:source-authenticity:'+id]);
   }else{
    unknown++;assert.equal(v.scopeClass,'SOURCE_SCOPE_INSUFFICIENT');
    assert.equal(out.disposition,'UNKNOWN');
    assert.equal(Object.hasOwn(v,'evidenceRefs'),false);
    assert.deepEqual(out.evidence.declaredRefs,[]);
   }
  }
  assert.deepEqual({observed,unknown},{observed:4,unknown:7});
 }finally{app.stop()}
});
test('R60 explicit empty caller source, selection and semantic reviewer maps cannot fallback to trusted receipt',async()=>{
 const x=await ctxPromise,receipt=JSON.parse(x.receiptText);
 assert.throws(()=>qualifyR16Receipt(receipt,{sources:{}}),fail('DIS_R16_SOURCE_ROSTER_INVALID'));
 assert.throws(()=>qualifyR16Receipt(receipt,{selection:{}}),fail('DIS_R16_QUERY_SOURCE_SCOPE_INVALID'));
 assert.throws(()=>qualifyR16Receipt(receipt,{metadata:{}}),fail('DIS_R16_FALSE_AUTHORITY'));
 assert.equal(qualifyR16Receipt(receipt).insufficientQueries,7);
 const changed=clone(receipt);changed.sources.GH_WEBHOOK.gitBlob='0'.repeat(40);
 assert.throws(()=>qualifyR16Receipt(changed),fail('DIS_R16_SOURCE_DRIFT'));
 const owner=clone(receipt);owner.independentSemanticOracle=true;
 assert.throws(()=>qualifyR16Receipt(owner),fail('DIS_R16_RECEIPT_UNQUALIFIED'));
 const fake=clone(receipt);fake.githubTemplateRendered=true;
 assert.throws(()=>qualifyR16Receipt(fake),fail('DIS_R16_RECEIPT_UNQUALIFIED'));
});
test('R60 counterfeit source or JSON-as-code and caller SAP/Effect/Function-version forged requests fail closed',async()=>{
 const x=await ctxPromise;
 assert.throws(()=>makeR16SourceReader(x.receiptText+' '),fail('DIS_R16_RECEIPT_GIT_BLOB_DRIFT'));
 const changed=clone(x.program),fn=changed.elements.find(e=>e.id==='dke.r16.authenticity').functions[0];
 fn.binding.sourceId='dke-r16-receipt';delete fn.sourceDependencies;
 assert.throws(()=>x.build(changed),fail('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
 const badInstalled={...x.installed,'dke-r16-receipt':{
  ...x.installed['dke-r16-receipt'],sha256:'f'.repeat(64)
 }};
 await assert.rejects(activate(x,{expectedSourcePins:badInstalled,tenantId:'tenant:r60-stale'}),
  fail('DIS_SOURCE_ANCHOR_STALE'));
 const app=await activate(x);
 try{
  for(const req of [{id:'S12'},{id:'S01',sapQualified:true},{id:'S01',effectAllowed:true}])
   await assert.rejects(app.invoke('dke.r16.readSourceScope',req));
  await assert.rejects(app.invoke('dke.r16.readSourceScope',{id:'S01'},
   {expectedContractVersion:'1.1.0'}),fail('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});
test('R60 forged LOCAL semantic owner approval cannot become typed SDK success even with pinned source',async()=>{
 const x=await ctxPromise,registry={...x.registry,
  'dke.r16.readSourceScope':{
   ...x.registry['dke.r16.readSourceScope'],
   execute:()=>({status:'SUCCEEDED',queryId:'S03',
    scopeClass:'OWNER_APPROVED',sourceAuthenticity:'SAP_ACCEPTED',
    originalPublisherFiles:4,anchorCount:14,rejectedMutants:25,
    receiptGitBlob:R16_RECEIPT_BLOB,semanticQualification:'APPROVED',
    sourceOwnerApproved:true,independentSemanticOracle:true,
    sapQualified:true,templateRendered:true,effectDispatched:true,
    evidenceRefs:['fake:owner']})
  }
 };
 const app=await activate(x,{registry,tenantId:'tenant:r60-fake'});
 try{
  await assert.rejects(app.invoke('dke.r16.readSourceScope',{id:'S03'}),
   fail('DIS_OUTCOME_UNDECLARED'));
 }finally{app.stop()}
});
