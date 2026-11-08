import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Canonical} from '@kaicreator/domain-harness-contracts';
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';

const fixturePromise=makeNativeFixture();
const clone=value=>structuredClone(value);
const reject=code=>e=>e?.code===code;
const compile=(fixture,program=fixture.program,sources=fixture.sources,expectedSourceOrigins=fixture.expectedSourceOrigins)=>
 compileDisV020Aot({built:fixture.artifact.built,program,sources,expectedSourceOrigins});
const activate=(fixture,options={})=>loadDisV020Aot(options.artifact??fixture.artifact,{
 expectedDigest:options.digest??fixture.artifact.digest,
 registry:options.registry??fixture.registry,
 store:options.store??new PlainCasDocStore(),
 tenantId:'tenant:dis-v020-native-r9'
});

test('native Contracts + canonical BUILD select 4 heterogeneous domains and explicit global semantics',async()=>{
 const f=await fixturePromise;
 const q=qualifyDisV020Artifact(f.artifact);
 assert.equal(f.artifact.format,'dis.v0.2.aot/1');
 assert.equal(f.artifact.program.domains.length,5);
 assert.ok(f.artifact.program.elements.some(e=>e.kind==='global'&&e.functions.length===0));
 assert.ok(f.artifact.program.elements.some(e=>e.kind==='stateful'));
 assert.ok(f.artifact.program.elements.some(e=>e.kind==='effect'));
 assert.ok(f.artifact.program.relations.some(x=>x.kind==='cooperates'));
 assert.equal(q.functions.get('xdownload.confirmDownload').definition.binding.type,'kdp-intent');
 assert.equal(q.functions.get('runx.createPresenceObserver').definition.binding.type,'local');
});
test('native public SDK loads actual selected KDP, initializes one Business and executes admitted orders Intent',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  assert.equal(app.state,'READY');
  const result=await app.invoke('orders.approve',{
   messageId:'msg:dis-native-r9',instanceKey:'instance:dis-native-r9',
   input:{amount:30,requestId:'DIS-NATIVE-R9'}});
  assert.equal(result.kind,'KDP_RECEIPT');
  assert.equal(result.authority,'KDP');
  assert.equal(result.receipt.status,'admitted');
 }finally{app.stop()}
});
test('Tally actual Task evidence Function stays OBSERVATION, never mints Task Claim or authorization',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const r=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.kind,'OBSERVATION');assert.equal(r.authority,'NONE');
  assert.equal(r.value.admitted,false);assert.equal(r.value.state,'UNQUALIFIED_INPUT');
 }finally{app.stop()}
});
test('Runx native stateful observer is not reclassified as a Business or execution lease',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const observation=await app.invoke('runx.createPresenceObserver',()=>'2026-11-08T07:00:00Z');
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.authority,'NONE');
  const agent=observation.value;
  agent.observe({agent_id:'agent-x',agent_incarnation_id:'inc-9',capability:{capability_id:'execute'}},
    {agent_id:'agent-x'});
  assert.equal(agent.latest().agent_incarnation_id,'inc-9');
  assert.equal(Object.hasOwn(agent.latest(),'execution_authorized'),false);
 }finally{app.stop()}
});
test('xDownload original policy is exposed as knowledge without providing direct acquisition authority',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  const p=await app.invoke('xdownload.describePolicy');
  assert.equal(p.kind,'OBSERVATION');assert.equal(p.authority,'NONE');
  assert.equal(p.value.domainId,'downloads');
  assert.equal(p.value.effectBindings['effect:acquire'].external.await,'terminal');
  assert.equal(f.artifact.program.elements.find(e=>e.id==='xdownload.acquire').functions[0].effect,'governed');
 }finally{app.stop()}
});
test('native DIS SDK refuses malformed external Effect input before KDP dispatch',async()=>{
 const f=await fixturePromise,app=await activate(f);
 try{
  await assert.rejects(app.invoke('xdownload.confirmDownload',{input:{requestId:'fake'}}),
   reject('DIS_INTENT_INPUT_INVALID'));
 }finally{app.stop()}
});
test('native compiler requires independent trusted repository/commit/path/blob source origins',async()=>{
 const f=await fixturePromise;
 const forged=clone(f.sources);
 forged.find(x=>x.id==='runx-presence').origin.repository='kaicreator-mm/tally';
 assert.throws(()=>compile(f,f.program,forged),reject('DIS_SOURCE_ORIGIN_UNTRUSTED'));
});
test('native compiler rejects locally changed Tally source bytes against exact pinned Git Blob',async()=>{
 const f=await fixturePromise;
 const changed=clone(f.sources);changed.find(x=>x.id==='tally-business').sourceText+='\\n// tampered';
 assert.throws(()=>compile(f,f.program,changed),reject('DIS_BUILD_SOURCE_BYTES_DRIFT'));
});
test('native compiler rejects Effect downgrade from KDP_INTENT to arbitrary LOCAL rule',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 const e=p.elements.find(x=>x.id==='xdownload.acquire').functions[0];
 e.binding={type:'local',sourceId:'xdownload-business'};
 assert.throws(()=>compile(f,p),reject('DIS_LOCAL_NOT_QUALIFIED'));
});
test('native compiler refuses xDownload Function bound to a foreign Tally Business Package',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 p.elements.find(x=>x.id==='xdownload.acquire').packageId='business-tally-task-readiness@v2.0.0';
 assert.throws(()=>compile(f,p),reject('DIS_INTENT_NOT_SELECTED'));
});
test('native compiler rejects inter-Element dependency cycles and duplicate Business App Init',async()=>{
 const f=await fixturePromise,p=clone(f.program);
 p.elements.find(x=>x.id==='tally.tasks').dependsOn=['tally.release'];
 assert.throws(()=>compile(f,p),reject('DIS_DEPENDENCY_CYCLE'));
 const duplicated=clone(f.program);
 duplicated.elements.find(x=>x.id==='tally.tasks').functions.push({
  id:'tally.fakeInit',kind:'init',effect:'none',binding:{type:'local',sourceId:'tally-business'}
 });
 assert.throws(()=>compile(f,duplicated),reject('DIS_INIT_NOT_UNIQUE'));
});
test('native SDK requires a separately provisioned AOT digest, not an artifact self-declaration',async()=>{
 const f=await fixturePromise;
 await assert.rejects(loadDisV020Aot(f.artifact,{registry:f.registry,store:new PlainCasDocStore()}),
  reject('DIS_TRUST_ANCHOR_REQUIRED'));
 await assert.rejects(activate(f,{digest:'0'.repeat(64)}),reject('DIS_INSTALLED_AOT_MISMATCH'));
});
test('installed independent digest catches altered but rehashed and internally valid AOT semantics',async()=>{
 const f=await fixturePromise,modified=clone(f.artifact);
 modified.program.relations.push({from:'tally.tasks',to:'xdownload.policy',kind:'cooperates'});
 modified.digest=sha256Canonical({
  format:modified.format,built:modified.built,program:modified.program,sources:modified.sources
 });
 assert.ok(qualifyDisV020Artifact(modified));
 await assert.rejects(activate(f,{artifact:modified}),reject('DIS_INSTALLED_AOT_MISMATCH'));
});
test('native SDK rejects an installed local implementation whose code/attribution pin drifts',async()=>{
 const f=await fixturePromise,registry={...f.registry};
 registry['runx.createPresenceObserver']={...registry['runx.createPresenceObserver'],gitBlob:'f'.repeat(40)};
 await assert.rejects(activate(f,{registry}),reject('DIS_LOCAL_REGISTRY_MISMATCH'));
});
test('serialized AOT is requalified natively after process-memory identity is lost',async()=>{
 const f=await fixturePromise,restored=JSON.parse(JSON.stringify(f.artifact));
 const app=await activate(f,{artifact:restored});
 try{
  assert.equal(app.state,'READY');
  const r=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.authority,'NONE');
 }finally{app.stop()}
});
test('native SDK stop closes all Function ingress, including stateful LOCAL functions',async()=>{
 const f=await fixturePromise,app=await activate(f);
 app.stop();assert.equal(app.state,'STOPPED');
 await assert.rejects(app.invoke('runx.createPresenceObserver',()=>''),reject('DIS_APP_NOT_READY'));
});
test('native SDK Business App Init refusal blocks every Function without exposing a facade',async()=>{
 const f=await fixturePromise,registry={...f.registry};
 registry['orders.appInit']={...registry['orders.appInit'],execute:()=>({status:'BLOCKED'})};
 await assert.rejects(activate(f,{registry}),reject('DIS_INIT_BLOCKED'));
});

test('native SDK DEGRADED explicitly disables absent optional Tally Function without weakening mandatory KDP',async()=>{
 const f=await fixturePromise,program=clone(f.program);
 program.elements.find(e=>e.id==='tally.release').functions[0].optional=true;
 const artifact=compile(f,program);
 const registry={...f.registry};
 delete registry['tally.projectReleaseReadiness'];
 registry['orders.appInit']={...registry['orders.appInit'],
  execute:()=>({status:'DEGRADED',unavailable:['tally.projectReleaseReadiness']})};
 const app=await loadDisV020Aot(artifact,{
  store:new PlainCasDocStore(),expectedDigest:artifact.digest,registry
 });
 try{
  assert.equal(app.state,'DEGRADED');
  await assert.rejects(app.invoke('tally.projectReleaseReadiness',{}),
   reject('DIS_FUNCTION_UNAVAILABLE'));
  const r=await app.invoke('tally.assessTaskEvidence',{});
  assert.equal(r.authority,'NONE');
  const receipt=await app.invoke('orders.approve',{
   messageId:'msg:dis-optional-native',instanceKey:'instance:dis-optional-native',
   input:{amount:30,requestId:'DIS-R9-OPTIONAL'}});
  assert.equal(receipt.receipt.status,'admitted');
 }finally{app.stop()}
});
test('native SDK refuses silent optional Function omission or optional Business App Init',async()=>{
 const f=await fixturePromise,program=clone(f.program);
 program.elements.find(e=>e.id==='tally.release').functions[0].optional=true;
 const artifact=compile(f,program);
 const registry={...f.registry};
 delete registry['tally.projectReleaseReadiness'];
 await assert.rejects(loadDisV020Aot(artifact,{
  store:new PlainCasDocStore(),expectedDigest:artifact.digest,registry
 }),reject('DIS_INIT_OPTIONAL_UNDECLARED'));
 const invalid=clone(f.program);
 invalid.elements.find(e=>e.id==='orders.init').functions[0].optional=true;
 assert.throws(()=>compile(f,invalid),reject('DIS_INIT_OPTIONAL_FORBIDDEN'));
});
