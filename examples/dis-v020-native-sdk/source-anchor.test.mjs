/**
 * R26 selected real-source installer currentness checks, native KDP loading.
 * Owner-supplied source anchors are independent installer inputs: never
 * trust AOT-declared pins themselves to grant source currentness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceSha256,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';

const reject=code=>e=>e?.code===code;
const ORIGINAL=Object.freeze({
 'tally-business':Object.freeze({
  repository:'kaicreator-mm/tally',
  commit:'e988321439f65b55936a691c02250b6d62a29409',
  path:'packages/tally-engineering-business/src/index.mjs',
  gitBlob:'54015fb63ffb13b4f4e562f660d2172098b5f7f4'
 }),
 'tally-release':Object.freeze({
  repository:'kaicreator-mm/tally',
  commit:'e988321439f65b55936a691c02250b6d62a29409',
  path:'packages/tally-engineering-business/src/release-readiness.mjs',
  gitBlob:'2d4d6e7462156e4466192a0ed3207ac76fd288e1'
 })
});
function independentAnchor(f,id){
 // This is explicitly trusted by the test installer, not an accepted
 // Knowledge Claim. Original provenance identity is checked independently
 // against the pinned original repository's commit/blob declarations.
 const source=f.sources.find(x=>x.id===id);
 assert.ok(source,id);
 assert.deepEqual(source.origin,ORIGINAL[id]);
 return {sha256:sourceSha256(source.sourceText),origin:{...ORIGINAL[id]}};
}
async function install(f,anchors){
 return loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,expectedSourcePins:anchors,
  registry:f.registry,store:new PlainCasDocStore(),
  tenantId:'tenant:dis-r26-selected-source-anchor'
 });
}
test('R26 original Tally selected Business provenance can be installer-anchored at native load',async()=>{
 const f=await makeNativeFixture();
 const q=qualifyDisV020Artifact(f.artifact);
 for(const id of Object.keys(ORIGINAL)){
  assert.equal(q.sourceConsumers.get(id)?.length,1);
  assert.equal(q.pins.get(id).origin.gitBlob,ORIGINAL[id].gitBlob);
 }
 const anchors=Object.fromEntries(Object.keys(ORIGINAL).map(id=>
  [id,independentAnchor(f,id)]));
 const app=await install(f,anchors);
 try{
  assert.equal(app.state,'READY');
  // The selected native Function is still an observation, not knowledge
  // acceptance, an installer-created KDP permit or an Effect.
  const x=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(x.kind,'OBSERVATION');assert.equal(x.authority,'NONE');
  assert.equal(x.evidence.attested,false);
 }finally{app.stop()}
});
test('R26 a changed source-owner checkpoint denies old AOT even when old digest is valid',async()=>{
 const f=await makeNativeFixture();
 const anchored=independentAnchor(f,'tally-business');
 const stale={...anchored,origin:{
  ...anchored.origin,commit:'f'.repeat(40)
 }};
 await assert.rejects(install(f,{'tally-business':stale}),
  reject('DIS_SOURCE_ANCHOR_STALE'));
 await assert.rejects(install(f,{'tally-business':{
  ...anchored,sha256:'0'.repeat(64)
 }}),reject('DIS_SOURCE_ANCHOR_STALE'));
 // Selecting a single source is an explicit subset; the other original
 // Function is not claimed to be independently current.
 const app=await install(f,{'tally-release':independentAnchor(f,'tally-release')});
 try{assert.equal(app.state,'READY')}finally{app.stop()}
});
test('R26 unknown, unconsumed, malformed or self-authorizing source anchors fail closed before KDP load',async()=>{
 const f=await makeNativeFixture(),known=independentAnchor(f,'tally-business');
 await assert.rejects(install(f,{}),reject('DIS_SOURCE_ANCHORS_INVALID'));
 await assert.rejects(install(f,{'not-selected':known}),reject('DIS_SOURCE_ANCHOR_NOT_CONSUMED'));
 await assert.rejects(install(f,{'tally-business':{
  ...known,authority:'ACCEPTED'
 }}),reject('DIS_SOURCE_ANCHORS_INVALID'));
 await assert.rejects(install(f,{'tally-business':{
  ...known,origin:{...known.origin,gitBlob:'non-hex'}
 }}),reject('DIS_SOURCE_ANCHORS_INVALID'));
 // An unselected source ID is rejected; all original source IDs in this
 // actual closed selected fixture are already consumed.
 // The supplied external trust pin can be read only at load time: this API
 // does NOT implement dynamic revocation of an already-running app.
});
