/** Actual DKE R33 source triage receipt → DIS v0.2 AOT→SDK→KDP read-only Knowledge.
 * Native execution must prove UNKNOWN, zero SAP and zero Effects; not biological truth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {DKE_R33_ORIGIN,makeR33OriginalGoReader} from './dke-r33-go-reader.mjs';
const FN='dke.r33.goDisposition.inspect',DATA='dke-r33-original-triage-receipt',CODE='dke-r33-dis-reader';
const READER_ORIGIN=Object.freeze({repository:'kaicreator-mm/domain-harness',
 commit:'e4da9fcb77c48e494e6a89f58792e9333293f494',
 path:'examples/dis-v020-native-sdk/dke-r33-go-reader.mjs',
 gitBlob:'650a0690774698b30992cddeed7791e6093f3b2d'});
const err=code=>e=>e?.code===code;
const context=(async()=>{
 const [f,receipt,code]=await Promise.all([makeNativeFixture(),
  readFile(new URL('./fixtures/dke-r33-original-full-triage-receipt.json',import.meta.url),'utf8'),
  readFile(new URL('./dke-r33-go-reader.mjs',import.meta.url),'utf8')]);
 assert.equal(sourceGitBlob(receipt),DKE_R33_ORIGIN.gitBlob);
 assert.equal(sourceGitBlob(code),READER_ORIGIN.gitBlob);
 const reader=makeR33OriginalGoReader(receipt);
 const add=[{id:DATA,sourceText:receipt,origin:DKE_R33_ORIGIN},{id:CODE,sourceText:code,origin:READER_ORIGIN}];
 const sources=[...f.sources,...add],origins={...f.expectedSourceOrigins,
  [DATA]:DKE_R33_ORIGIN,[CODE]:READER_ORIGIN};
 const program=structuredClone(f.program);
 program.domains.push({id:'dke.r33.original',description:'Read-only R33 real GO original annotation disposition',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']});
 program.elements.push({id:'dke.r33.source-admission',domainId:'dke.r33.original',
  version:'1.0.0',kind:'knowledge',dependsOn:[],description:'Unreviewed source-scoped GO producer data',
  functions:[{id:FN,description:'Observe source-scoped tier hash/count, never grant SAP or Effect',
   kind:'knowledge',effect:'none',binding:{type:'local',sourceId:CODE},
   sourceDependencies:[DATA],
   contract:{schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{disposition:'string'},additionalProperties:false},
    output:{type:'record',fields:{status:'string',selectedDisposition:'string',
     sourceState:'string',originalAnnotationRows:'number',selectedRows:'number',
     tierCanonicalSha256:'string',sourceGzipSha256:'string',receiptGitBlob:'string',
     independentCritic:'boolean',sapQualified:'boolean',effectDispatched:'boolean'},
     additionalProperties:false},
    outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}}}]});
 const artifact=compileDisV020Aot({built:f.artifact.built,program,sources,expectedSourceOrigins:origins});
 const registry={...f.registry,[FN]:{sourceId:CODE,sha256:sourceSha256(code),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,execute:input=>reader.query(input)}};
 const pinned=Object.fromEntries(add.map(x=>[x.id,{sha256:sourceSha256(x.sourceText),origin:x.origin}]));
 return {reader,receipt,code,artifact,registry,pinned};
})();
const activate=x=>loadDisV020Aot(x.artifact,{expectedDigest:x.artifact.digest,
 registry:x.registry,expectedSourcePins:x.pinned,store:new PlainCasDocStore(),
 tenantId:'tenant:dke-r33-source-scoped-native'});
test('R33 receipt and reader are exact original Git source selected by AOT',async()=>{
 const x=await context,q=qualifyDisV020Artifact(x.artifact),f=q.functions.get(FN);
 assert.equal(f.definition.kind,'knowledge');assert.equal(f.definition.effect,'none');
 assert.equal(f.definition.binding.sourceId,CODE);
 assert.deepEqual(f.definition.sourceDependencies,[DATA]);
 assert.equal(q.pins.get(DATA).origin.gitBlob,DKE_R33_ORIGIN.gitBlob);
 assert.equal(q.pins.get(DATA).origin.commit,DKE_R33_ORIGIN.commit);
 assert.equal(q.pins.get(CODE).origin.gitBlob,READER_ORIGIN.gitBlob);
 assert.ok(q.sourceConsumers.get(DATA).includes(FN));
 const app=await activate(x);
 try{assert.equal(app.state,'READY');}finally{app.stop()}
});
test('R33 full real original source tier consumes into KDP and only yields typed UNKNOWN',async()=>{
 const x=await context,app=await activate(x);
 try{for(const [disposition,count] of Object.entries({
  QUARANTINE_FATAL:233,REVIEW_SOFT:3769,STRUCTURAL_CANDIDATE:906474
 })){
  const out=await app.invoke(FN,{disposition},{expectedContractVersion:'1.0.0'});
  assert.equal(out.kind,'OBSERVATION');assert.equal(out.disposition,'UNKNOWN');
  assert.equal(out.authority,'NONE');assert.equal(out.evidence.attested,false);
  assert.equal(out.value.status,'UNKNOWN');assert.equal(out.value.selectedRows,count);
  assert.equal(out.value.originalAnnotationRows,910476);
  assert.equal(out.value.receiptGitBlob,DKE_R33_ORIGIN.gitBlob);
  assert.equal(out.value.independentCritic,false);
  assert.equal(out.value.sapQualified,false);assert.equal(out.value.effectDispatched,false);
  assert.equal(out.value.tierCanonicalSha256.length,64);
 }}finally{app.stop()}
});
test('R33 original source tamper, wrong tier, forged SAP/Effect fail closed',async()=>{
 const x=await context;
 assert.throws(()=>makeR33OriginalGoReader(x.receipt+' '),err('DKE_R33_RECEIPT_GIT_BLOB_DRIFT'));
 assert.throws(()=>makeR33OriginalGoReader(x.receipt,{...DKE_R33_ORIGIN,commit:'0'.repeat(40)}),
  err('DKE_R33_RECEIPT_GIT_BLOB_DRIFT'));
 for(const input of [{disposition:'ACCEPTED'},{disposition:'STRUCTURAL_CANDIDATE',sap:true},
  {disposition:'REVIEW_SOFT',effect:true},{disposition:'QUARANTINE_FATAL',independentCritic:true}])
  assert.throws(()=>x.reader.query(input),err('DKE_R33_SELECTION_INVALID'));
 const app=await activate(x);
 try{await assert.rejects(app.invoke(FN,{disposition:'STRUCTURAL_CANDIDATE',effect:true}),e=>Boolean(e));}
 finally{app.stop()}
});
