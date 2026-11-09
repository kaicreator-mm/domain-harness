/** B08-01/R54 — real DKE #209 producer receipt, selected DIS native
 * Knowledge Function, actual source/contract/KDP SDK seam and falsifiers.
 * Structural source acceptance only: SAP/domain semantics never promoted.
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
import {DKE_RECEIPT_ORIGIN,DKE_OLD_GRAPH_BLOB,DKE_NEW_GRAPH_BLOB,makeDkeCandidateKnowledge} from './dke-knowledge-reader.mjs';

const READER_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-harness',
 commit:'269804b8a4be9d262deb61e1764d9030612dc01e',
 path:'examples/dis-v020-native-sdk/dke-knowledge-reader.mjs',
 gitBlob:'ab0cb7d9fed146f419ef7555fcdc8a406f25db10'
});
const receiptPath=new URL('./fixtures/dke-r6-execution-receipt.json',import.meta.url);
const readerPath=new URL('./dke-knowledge-reader.mjs',import.meta.url);
const fPromise=makeNativeFixture();
const error=code=>e=>e?.code===code;
const clone=structuredClone;
async function setup(){
 const f=await fPromise,[dkeText,readerText]=await Promise.all([
  readFile(receiptPath,'utf8'),readFile(readerPath,'utf8')]);
 assert.equal(sourceGitBlob(dkeText),DKE_RECEIPT_ORIGIN.gitBlob);
 assert.equal(sourceGitBlob(readerText),READER_ORIGIN.gitBlob);
 const knowledge=makeDkeCandidateKnowledge(dkeText);
 const inputs=[
  {id:'dke-receipt',origin:DKE_RECEIPT_ORIGIN,sourceText:dkeText},
  {id:'dke-reader',origin:READER_ORIGIN,sourceText:readerText}
 ];
 const sources=[...f.sources,...inputs];
 const expectedSourceOrigins={...f.expectedSourceOrigins,
  'dke-receipt':DKE_RECEIPT_ORIGIN,'dke-reader':READER_ORIGIN};
 const program=clone(f.program);
 program.domains.push({id:'dke.provisional',description:'Read-only DKE #209 provisional knowledge query over real producer receipt',
  repositories:['kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']});
 program.elements.push({
  id:'dke.provisional.knowledge',domainId:'dke.provisional',version:'1.0.0',
  kind:'knowledge',description:'Source-locked producer receipt query, never independently SAP-qualified',
  dependsOn:[],functions:[{
   id:'dke.provisional.query',kind:'knowledge',effect:'none',
   binding:{type:'local',sourceId:'dke-reader'},
   sourceDependencies:['dke-receipt'],
   contract:{
    schema:'dis.v0.2.function-contract/1',version:'1.0.0',
    input:{type:'record',fields:{queryId:'string',sourceVersion:'string'},additionalProperties:false},
    output:{type:'record',fields:{status:'string',reviewState:'string',
     qualified:'boolean',sourceVersion:'string',sourceGraphGitBlob:'string',
     sourceGitBlob:'string',sourcePath:'array',evidenceRefs:'array',effectDispatched:'boolean'},
     optional:['evidenceRefs'],additionalProperties:false},
    outcomes:{field:'status',classes:{SOURCE_TRACE_FOUND:'OBSERVED',SOURCE_TRACE_UNAVAILABLE:'UNKNOWN'}},
    evidence:{refField:'evidenceRefs',requiredFor:[]},
    compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
   }
  }]
 });
 const compile=(p=program,allSources=sources,origins=expectedSourceOrigins)=>
  compileDisV020Aot({built:f.artifact.built,program:p,sources:allSources,expectedSourceOrigins:origins});
 const registry={...f.registry,'dke.provisional.query':{
  sourceId:'dke-reader',sha256:sourceSha256(readerText),
  origin:READER_ORIGIN,gitBlob:READER_ORIGIN.gitBlob,
  execute:input=>knowledge.query(input)
 }};
 const trustedPins=Object.fromEntries(inputs.map(s=>[s.id,{
  sha256:sourceSha256(s.sourceText),origin:s.origin
 }]));
 return {f,dkeText,readerText,knowledge,program,sources,expectedSourceOrigins,compile,
  artifact:compile(),registry,trustedPins};
}
const ctxPromise=setup();
const open=ctx=>loadDisV020Aot(ctx.artifact,{expectedDigest:ctx.artifact.digest,
 registry:ctx.registry,expectedSourcePins:ctx.trustedPins,store:new PlainCasDocStore(),
 tenantId:'tenant:dis-b08-dke-source-consumer'});
const firstChain='CHAIN:se:CASE-09F-CF-KV-DEPENDENCY:se:EVD-09F-CF-REDESIGN';

test('B08-01 R54 original DKE #209 R6 Git receipt is actual selected native DIS Knowledge dependency',async()=>{
 const ctx=await ctxPromise;
 const q=qualifyDisV020Artifact(ctx.artifact);
 const fn=q.functions.get('dke.provisional.query');
 assert.equal(fn.definition.binding.type,'local');
 assert.deepEqual(fn.definition.sourceDependencies,['dke-receipt']);
 assert.equal(q.pins.get('dke-receipt').origin.commit,DKE_RECEIPT_ORIGIN.commit);
 assert.equal(q.pins.get('dke-receipt').origin.gitBlob,DKE_RECEIPT_ORIGIN.gitBlob);
 assert.ok(q.sourceConsumers.get('dke-receipt').includes('dke.provisional.query'));
 const app=await open(ctx);
 try{
  const input={queryId:firstChain,sourceVersion:'new'};
  const out=await app.invoke('dke.provisional.query',input,{expectedContractVersion:'1.0.0'});
  assert.equal(out.kind,'OBSERVATION');assert.equal(out.authority,'NONE');
  assert.equal(out.disposition,'OBSERVED');assert.equal(out.value.status,'SOURCE_TRACE_FOUND');
  assert.equal(out.value.qualified,false);
  assert.equal(out.value.reviewState,'CONTENT_PARTIAL_VERIFIED');
  assert.equal(out.value.sourcePath.length,4);
  assert.equal(out.value.sourceGraphGitBlob,DKE_NEW_GRAPH_BLOB);
  assert.deepEqual(out.evidence.declaredRefs,[firstChain]);
  assert.equal(out.evidence.attested,false);
  assert.equal(out.value.effectDispatched,false);
  assert.equal(out.evidence.source.sourceId,'dke-reader');
 }finally{app.stop()}
});

test('B08-01 R54 two actual Tally source versions distinguish new graph evidence without SAP upgrade',async()=>{
 const ctx=await ctxPromise,app=await open(ctx);
 const dke=JSON.parse(ctx.dkeText);
 try{
  for(const t of dke.sourceTraces){
   const old=await app.invoke('dke.provisional.query',{queryId:t.id,sourceVersion:'old'});
   const newer=await app.invoke('dke.provisional.query',{queryId:t.id,sourceVersion:'new'});
   assert.equal(old.disposition,'UNKNOWN');
   assert.equal(old.value.status,'SOURCE_TRACE_UNAVAILABLE');
   assert.equal(old.value.sourceGraphGitBlob,DKE_OLD_GRAPH_BLOB);
   assert.equal(Object.hasOwn(old.value,'evidenceRefs'),false);
   assert.equal(newer.disposition,'OBSERVED');
   assert.equal(newer.value.qualified,false);
   assert.deepEqual(newer.value.sourcePath,t.linkedSourcePath);
   assert.equal(newer.evidence.attested,false);
  }
  const unknown=await app.invoke('dke.provisional.query',{queryId:'CHAIN:unknown',sourceVersion:'new'});
  assert.equal(unknown.disposition,'UNKNOWN');
  assert.equal(unknown.value.effectDispatched,false);
 }finally{app.stop()}
});

test('B08-01 R54 changed DKE source, false producer approval and source-origin mismatch fail closed',async()=>{
 const ctx=await ctxPromise;
 assert.throws(()=>makeDkeCandidateKnowledge(ctx.dkeText.replace('"sapQualified": 0','"sapQualified": 1')),
  error('DKE_SOURCE_GIT_BLOB_DRIFT'));
 assert.throws(()=>makeDkeCandidateKnowledge(ctx.dkeText,{...DKE_RECEIPT_ORIGIN,commit:'f'.repeat(40)}),
  error('DKE_SOURCE_GIT_BLOB_DRIFT'));
 const wrong=clone(ctx.expectedSourceOrigins);
 wrong['dke-receipt'].gitBlob='0'.repeat(40);
 assert.throws(()=>ctx.compile(ctx.program,ctx.sources,wrong),error('DIS_SOURCE_ORIGIN_UNTRUSTED'));
 const app=await open(ctx);
 try{
  await assert.rejects(app.invoke('dke.provisional.query',{queryId:firstChain,sourceVersion:'future'}),
   error('DKE_QUERY_INVALID'));
  await assert.rejects(app.invoke('dke.provisional.query',{queryId:firstChain,sourceVersion:'old'},
   {expectedContractVersion:'2.0.0'}),error('DIS_FUNCTION_VERSION_MISMATCH'));
 }finally{app.stop()}
});

test('B08-01 R54 independently installer-pinned DKE input, Function schema and forged outcome refuse privilege',async()=>{
 const ctx=await ctxPromise;
 const stale={...ctx.trustedPins,'dke-receipt':{
  ...ctx.trustedPins['dke-receipt'],sha256:'f'.repeat(64)}};
 await assert.rejects(loadDisV020Aot(ctx.artifact,{
  expectedDigest:ctx.artifact.digest,registry:ctx.registry,
  expectedSourcePins:stale,store:new PlainCasDocStore(),tenantId:'tenant:b08-stale-dke'}),
  error('DIS_SOURCE_ANCHOR_STALE'));
 const forged={...ctx.registry,'dke.provisional.query':{
  ...ctx.registry['dke.provisional.query'],
  execute:()=>({status:'SUCCEEDED',reviewState:'APPROVED',qualified:true,sourceVersion:'new',
   sourceGraphGitBlob:DKE_NEW_GRAPH_BLOB,sourceGitBlob:DKE_RECEIPT_ORIGIN.gitBlob,
   sourcePath:[],evidenceRefs:[],effectDispatched:false})}};
 const app=await loadDisV020Aot(ctx.artifact,{
  expectedDigest:ctx.artifact.digest,registry:forged,expectedSourcePins:ctx.trustedPins,
  store:new PlainCasDocStore(),tenantId:'tenant:b08-forged-outcome'});
 try{
  await assert.rejects(app.invoke('dke.provisional.query',{queryId:firstChain,sourceVersion:'new'}),
   error('DIS_OUTCOME_UNDECLARED'));
  await assert.rejects(app.invoke('dke.provisional.query',{queryId:firstChain}),
   error('DIS_FUNCTION_INPUT_INVALID'));
 }finally{app.stop()}
});
