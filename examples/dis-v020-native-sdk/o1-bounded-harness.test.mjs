/** O1/R94: fixture provider fallback on real selected DIS AOT->SDK/KDP Knowledge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeO1BoundedHarness} from './o1-bounded-harness.mjs';

const fixture=makeNativeFixture();
const deny=code=>e=>e?.code===code;
const selectedApp=observation=>({
 functions:Object.freeze(['xdownload.describePolicy']),
 contractVersions:Object.freeze({'xdownload.describePolicy':'1.0.0'}),
 invoke:async()=>observation
});
const selectedObservation=(overrides={})=>({
 kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
 value:{domainId:'downloads'},contractVersion:'1.0.0',
 evidence:{source:{sourceId:'xdownload-business',sha256:'a'.repeat(64),
  gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'},attested:false},
 ...overrides
});
async function withNative(visit){
 const f=await fixture;
 const app=await loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:o1-native-harness-r94'
 });
 try{return await visit(app,f)}finally{app.stop()}
}
test('O1 R94 actual selected xDownload native SDK Knowledge executes before bounded fixture-provider UNKNOWN fallback',async()=>{
 await withNative(async app=>{
  let called=0;
  const provider={id:'fixture-o1-provider',propose:async request=>{
   called++;
   assert.deepEqual(Object.keys(request).sort(),['observedDomain','purpose','sourceFunction']);
   assert.equal(Object.isFrozen(request),true);
   assert.equal(request.sourceFunction,'xdownload.describePolicy');
   return {suggestion:'Use a candidate, not a download authorization'};
  }};
  const harness=makeO1BoundedHarness({app,provider,maxCalls:1});
  const observed=await harness.run('policy');
  assert.equal(observed.disposition,'OBSERVED');
  assert.equal(observed.authority,'NONE');
  assert.equal(observed.observedDomain,'downloads');
  assert.equal(called,0);
  const proposal=await harness.run('advisory');
  assert.equal(proposal.disposition,'UNKNOWN');
  assert.equal(proposal.reason,'MODEL_PROPOSAL_NOT_DOMAIN_TRUTH');
  assert.equal(proposal.qualified,false);
  assert.equal(proposal.effectDispatched,false);
  assert.equal(called,1);
  assert.equal((await harness.run('advisory')).reason,'BUDGET_EXHAUSTED');
  assert.equal(called,1);
 });
});
test('O1 R96 rejects FAILED/UNKNOWN or source-mismatched native observations before Provider fallback',async()=>{
 const cases=[
  ['failed-disposition',selectedObservation({disposition:'FAILED'})],
  ['unknown-disposition',selectedObservation({disposition:'UNKNOWN'})],
  ['wrong-source-id',selectedObservation({evidence:{source:{
   sourceId:'other-source',sha256:'a'.repeat(64),
   gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'
  },attested:false}})],
  ['wrong-source-blob',selectedObservation({evidence:{source:{
   sourceId:'xdownload-business',sha256:'a'.repeat(64),gitBlob:'0'.repeat(40)
  },attested:false}})],
  ['missing-source-witness',selectedObservation({evidence:{attested:false}})]
 ];
 for(const [name,observation] of cases){
  let calls=0;
  const harness=makeO1BoundedHarness({
   app:selectedApp(observation),
   provider:{id:'fixture-o1-provider',propose:async()=>{calls++;return {suggestion:'must not run'}}},
   maxCalls:1
  });
  const result=await harness.run('advisory');
  assert.equal(result.disposition,'UNKNOWN',name);
  assert.equal(result.reason,'NATIVE_OBSERVATION_UNQUALIFIED',name);
  assert.equal(result.authority,'NONE',name);
  assert.equal(result.effectDispatched,false,name);
  assert.equal(harness.remaining(),1,name);
  assert.equal(calls,0,name);
 }
 assert.throws(()=>makeO1BoundedHarness({app:{invoke:async()=>null}}),
  deny('O1_NATIVE_APP_NOT_SELECTED'));
});
test('O1 R94 provider-disabled and zero-budget paths preserve real SDK observation without model calls',async()=>{
 await withNative(async app=>{
  let called=0;
  const provider={id:'fixture-o1-provider',propose:async()=>{called++;return {suggestion:'fake'}}};
  for(const opt of [{enabled:false,maxCalls:2},{enabled:true,maxCalls:0}]){
   const harness=makeO1BoundedHarness({app,provider,...opt});
   const policy=await harness.run('policy');
   assert.equal(policy.disposition,'OBSERVED');
   const missing=await harness.run('advisory');
   assert.equal(missing.disposition,'UNKNOWN');
   assert.equal(missing.authority,'NONE');
   assert.equal(missing.effectDispatched,false);
  }
  assert.equal(called,0);
 });
});
test('O1 R94 unselected provider and forbidden Function/Effect entry fail closed before model fallback',async()=>{
 await withNative(async app=>{
  const rogue={id:'unselected-provider',propose:async()=>({suggestion:'execute effect'})};
  assert.throws(()=>makeO1BoundedHarness({app,provider:rogue}),deny('O1_PROVIDER_UNSELECTED'));
  assert.throws(()=>makeO1BoundedHarness({app,maxCalls:-1}),deny('O1_CONFIGURATION_INVALID'));
  assert.throws(()=>makeO1BoundedHarness({app,maxCalls:100}),deny('O1_CONFIGURATION_INVALID'));
  const harness=makeO1BoundedHarness({app,provider:{
   id:'fixture-o1-provider',propose:async()=>{throw Error('should not run')}
  }});
  await assert.rejects(harness.run('xdownload.confirmDownload'),deny('O1_FUNCTION_NOT_SELECTED'));
  assert.equal(harness.remaining(),1);
 });
});
test('O1 R94 fake model PASS, Effect claims, oversized output, failures and concurrency never certify semantic truth',async()=>{
 await withNative(async app=>{
  for(const payload of [
   {suggestion:'PASS',effectDispatched:true},
   {suggestion:'PASS',authority:'KDP'},
   {suggestion:'X'.repeat(161)},
   {suggestion:'bad\nline'}
  ]){
   const harness=makeO1BoundedHarness({app,provider:{
    id:'fixture-o1-provider',propose:async()=>payload
   }});
   const result=await harness.run('advisory');
   assert.equal(result.reason,'MODEL_OUTPUT_REJECTED');
   assert.equal(result.qualified,false);
   assert.equal(result.effectDispatched,false);
  }
  const broken=makeO1BoundedHarness({app,provider:{
   id:'fixture-o1-provider',propose:async()=>{throw Error('provider failed')}
  }});
  assert.equal((await broken.run('advisory')).reason,'PROVIDER_ERROR');
  // No synchronous resolve() before the selected SDK's asynchronous
  // invoke reaches provider.propose: reserve budget before the await.
  let calls=0;
  const concurrent=makeO1BoundedHarness({app,provider:{
   id:'fixture-o1-provider',propose:async()=>{
    calls++;
    await Promise.resolve();
    return {suggestion:'candidate only'};
   }
  },maxCalls:1});
  const results=await Promise.all([
   concurrent.run('advisory'),concurrent.run('advisory')
  ]);
  assert.equal(calls,1);
  assert.deepEqual(results.map(x=>x.reason).sort(),
   ['BUDGET_EXHAUSTED','MODEL_PROPOSAL_NOT_DOMAIN_TRUTH'].sort());
  assert.equal(results.every(x=>x.authority==='NONE'&&!x.effectDispatched),true);
 });
});
