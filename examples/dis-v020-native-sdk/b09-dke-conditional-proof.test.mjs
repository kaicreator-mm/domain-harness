/** B09-01/R55 genuine upstream DKE R9 native Python/SymPy proof data
 * consumed by actual DIS v0.2 AOT, SDK and KDP as typed Knowledge.
 * The conditional logic is not independently semantic-owner qualified.
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
import {makeR9ConditionalProofReader,R9_DATA_ORIGINS,R9_INPUT_BLOB,R9_PROOF_BLOB}
 from './dke-r9-proof-reader.mjs';

const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'005bb61307b174467ae0db9c954dbc72c8654362',
 path:'examples/dis-v020-native-sdk/dke-r9-proof-reader.mjs',
 gitBlob:'077a799d7218017a43fde584fee6ea13944c16fa'
});
const fail=code=>e=>e?.code===code;
const clone=structuredClone;
const originalFixture=makeNativeFixture();
async function prepare(){
 const f=await originalFixture;
 const [inputText,proofText,readerText]=await Promise.all([
  readFile(new URL('./fixtures/dke-r9-formal-input.json',import.meta.url),'utf8'),
  readFile(new URL('./fixtures/dke-r9-formal-proof.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-r9-proof-reader.mjs',import.meta.url),'utf8')
 ]);
 assert.equal(sourceGitBlob(inputText),R9_INPUT_BLOB);
 assert.equal(sourceGitBlob(proofText),R9_PROOF_BLOB);
 assert.equal(sourceGitBlob(readerText),READER_ORIGIN.gitBlob);
 const orig=[
  {id:'dke-r9-input',sourceText:inputText,origin:R9_DATA_ORIGINS.input},
  {id:'dke-r9-proof',sourceText:proofText,origin:R9_DATA_ORIGINS.proof},
  {id:'dke-r9-reader',sourceText:readerText,origin:READER_ORIGIN}
 ];
 const sources=[...f.sources,...orig];
 const expectedSourceOrigins={...f.expectedSourceOrigins,
  'dke-r9-input':R9_DATA_ORIGINS.input,
  'dke-r9-proof':R9_DATA_ORIGINS.proof,
  'dke-r9-reader':READER_ORIGIN};
 const program=clone(f.program);
 program.domains.push({
  id:'dke.r9.conditional',
  description:'DKE source-scoped conditional formal proof Knowledge, unqualified SAP',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
 });
 program.elements.push({
  id:'dke.r9.knowledge',domainId:'dke.r9.conditional',version:'1.0.0',kind:'knowledge',
  description:'Read-only original SymPy conditional verdicts and countermodel UNKNOWN, not domain-owner evidence',
  dependsOn:[],functions:[{
   id:'dke.r9.readProof',kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:'dke-r9-reader'},
   sourceDependencies:['dke-r9-input','dke-r9-proof'],
   contract:{
    schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{id:'string'},additionalProperties:false},
    output:{type:'record',fields:{
     status:'string',queryId:'string',verdict:'string',proposition:'string',
     propositionLogicallySupported:'boolean',sourceStatus:'string',
     formalInputGitBlob:'string',formalProofGitBlob:'string',
     sourceRefs:'array',evidenceRefs:'array',
     qualified:'boolean',independentSemanticOracle:'boolean',effectDispatched:'boolean'
    },optional:['evidenceRefs'],additionalProperties:false},
    outcomes:{field:'status',classes:{OBSERVED:'OBSERVED',UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:['OBSERVED']},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const logic=makeR9ConditionalProofReader(inputText,proofText);
 const registry={...f.registry,'dke.r9.readProof':{
  sourceId:'dke-r9-reader',sha256:sourceSha256(readerText),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,
  execute:input=>logic.query(input)
 }};
 const installed=Object.fromEntries(orig.map(s=>[s.id,{
  sha256:sourceSha256(s.sourceText),origin:s.origin
 }]));
 const build=(p=program,s=sources,origins=expectedSourceOrigins)=>
  compileDisV020Aot({built:f.artifact.built,program:p,sources:s,expectedSourceOrigins:origins});
 return {f,inputText,proofText,readerText,program,sources,expectedSourceOrigins,
  registry,installed,build,artifact:build()};
}
const casePromise=prepare();
const activate=(x,options={})=>loadDisV020Aot(x.artifact,{
 expectedDigest:x.artifact.digest,registry:x.registry,expectedSourcePins:x.installed,
 store:new PlainCasDocStore(),tenantId:'tenant:b09-symbolic-native',...options
});

test('B09-01 R55 original source-pinned SymPy proof is a selected DIS Knowledge Function with exact two DATA sources',async()=>{
 const x=await casePromise,q=qualifyDisV020Artifact(x.artifact);
 const fn=q.functions.get('dke.r9.readProof');
 assert.equal(fn.definition.kind,'knowledge');
 assert.equal(fn.definition.binding.type,'local');
 assert.deepEqual(fn.definition.sourceDependencies,['dke-r9-input','dke-r9-proof']);
 for(const id of ['dke-r9-input','dke-r9-proof']){
  assert.ok(q.sourceConsumers.get(id).includes('dke.r9.readProof'));
  assert.equal(q.pins.get(id).origin.repository,'kaicreator-mm/domain-forge');
 }
 assert.equal(q.pins.get('dke-r9-input').origin.gitBlob,R9_INPUT_BLOB);
 assert.equal(q.pins.get('dke-r9-proof').origin.gitBlob,R9_PROOF_BLOB);
 const app=await activate(x);
 try{
  assert.equal(app.contractVersions['dke.r9.readProof'],'1.0.0');
  assert.ok(app.functions.includes('dke.r9.readProof'));
  assert.equal(app.state,'READY');
 }finally{app.stop()}
});

test('B09-01 R55 real selected SDK consumes 2 entailed + 2 refuted + 7 UNKNOWN with no independent SAP claim',async()=>{
 const x=await casePromise,app=await activate(x);
 try{
  const counts={ENTAILED:0,REFUTED:0,UNDERDETERMINED:0};
  for(let i=1;i<=11;i++){
   const id='S'+String(i).padStart(2,'0');
   const out=await app.invoke('dke.r9.readProof',{id},{expectedContractVersion:'1.0.0'});
   const value=out.value;counts[value.verdict]++;
   assert.equal(out.kind,'OBSERVATION');
   assert.equal(out.authority,'NONE');
   assert.equal(out.evidence.attested,false);
   assert.equal(value.qualified,false);
   assert.equal(value.independentSemanticOracle,false);
   assert.equal(value.effectDispatched,false);
   assert.equal(value.formalInputGitBlob,R9_INPUT_BLOB);
   assert.equal(value.formalProofGitBlob,R9_PROOF_BLOB);
   assert.equal(value.sourceRefs.length,4);
   assert.equal(value.propositionLogicallySupported,value.verdict==='ENTAILED');
   if(value.verdict==='UNDERDETERMINED'){
    assert.equal(out.disposition,'UNKNOWN');
    assert.equal(Object.hasOwn(value,'evidenceRefs'),false);
    assert.deepEqual(out.evidence.declaredRefs,[]);
   }else{
    assert.equal(out.disposition,'OBSERVED');
    assert.equal(value.evidenceRefs[0],'dke:r9:conditional-proof:'+id);
    assert.deepEqual(out.evidence.declaredRefs,value.evidenceRefs);
   }
  }
  assert.deepEqual(counts,{ENTAILED:2,REFUTED:2,UNDERDETERMINED:7});
 }finally{app.stop()}
});

test('B09-01 R55 a source-conditional REFUTED proof never means positive domain qualification or Effect permission',async()=>{
 const x=await casePromise,app=await activate(x);
 try{
  for(const id of ['S01','S09']){
   const out=await app.invoke('dke.r9.readProof',{id});
   assert.equal(out.value.verdict,'REFUTED');
   assert.equal(out.value.propositionLogicallySupported,false);
   assert.equal(out.disposition,'OBSERVED'); // observed refutation, not accepted proposition
   assert.equal(out.authority,'NONE');
   assert.equal(out.value.qualified,false);
   assert.equal(out.value.effectDispatched,false);
  }
 }finally{app.stop()}
});

test('B09-01 R55 original DKE formal input/receipt tampering or forged caller approval fail closed',async()=>{
 const x=await casePromise;
 assert.throws(()=>makeR9ConditionalProofReader(x.inputText+' ',x.proofText),
  fail('DKE_R9_SOURCE_GIT_BLOB_DRIFT'));
 assert.throws(()=>makeR9ConditionalProofReader(x.inputText,x.proofText+' '),
  fail('DKE_R9_SOURCE_GIT_BLOB_DRIFT'));
 const app=await activate(x);
 try{
  for(const input of [{id:'S12'},{id:'S02',qualifiedSap:true},{id:'S02',effectAllowed:true},{id:5}]){
   await assert.rejects(app.invoke('dke.r9.readProof',input));
  }
  await assert.rejects(app.invoke('dke.r9.readProof',{id:'S02'},
   {expectedContractVersion:'1.0.1'}),fail('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});

test('B09-01 R55 original DATA path cannot become an executable Function or an unpinned installer source',async()=>{
 const x=await casePromise,p=clone(x.program);
 const fn=p.elements.find(e=>e.id==='dke.r9.knowledge').functions[0];
 fn.binding.sourceId='dke-r9-proof';
 delete fn.sourceDependencies;
 assert.throws(()=>x.build(p),fail('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN'));
 const stale={...x.installed,'dke-r9-proof':{
  ...x.installed['dke-r9-proof'],sha256:'f'.repeat(64)
 }};
 await assert.rejects(activate(x,{expectedSourcePins:stale,tenantId:'tenant:b09-forged'}),
  fail('DIS_SOURCE_ANCHOR_STALE'));
 const changedOrigins=clone(x.expectedSourceOrigins);
 changedOrigins['dke-r9-input'].path='docs/standards/dke/../../escape.json';
 assert.throws(()=>x.build(x.program,x.sources,changedOrigins),
  fail('DIS_SOURCE_ORIGIN_UNTRUSTED'));
});

test('B09-01 R55 forged LOCAL SUCCEEDED or fabricated semantic Oracle cannot pass typed outcome',async()=>{
 const x=await casePromise,registry={...x.registry,'dke.r9.readProof':{
  ...x.registry['dke.r9.readProof'],
  execute:()=>({status:'SUCCEEDED',queryId:'S02',verdict:'ENTAILED',
   proposition:'kv_doc_mode_eventual',propositionLogicallySupported:true,
   sourceStatus:'INDEPENDENT_SAP',formalInputGitBlob:R9_INPUT_BLOB,
   formalProofGitBlob:R9_PROOF_BLOB,sourceRefs:[],
   evidenceRefs:['faked:sap'],qualified:true,independentSemanticOracle:true,effectDispatched:false})
 }};
 const app=await activate(x,{registry,tenantId:'tenant:b09-false-success'});
 try{
  await assert.rejects(app.invoke('dke.r9.readProof',{id:'S02'}),
   fail('DIS_OUTCOME_UNDECLARED'));
 }finally{app.stop()}
});
