/** DIS v0.2 B01-02 / R33: actual selected Runx Stateful domain owner,
 * Tally Rule and xDownload Knowledge. Presence is not a KDP lease.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';

const fixture=makeNativeFixture(),reject=code=>e=>e?.code===code;
const open=f=>loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
 registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:dis-b01-state-owned'});
const observer=(app,t)=>app.invoke('runx.createPresenceObserver',()=>t,{expectedContractVersion:'1.0.0'});
const request=(agent_id,agent_incarnation_id)=>({agent_id,agent_incarnation_id,capability:{capability_id:'execute'}});

test('B01-02 R33 real Runx Stateful handles isolate each invocation, source and process-local ownership',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact),app=await open(f);
 try{
  const entry=q.functions.get('runx.createPresenceObserver');
  assert.equal(entry.element.kind,'stateful');
  assert.equal(entry.definition.handleContract.lifetime,'PROCESS_LOCAL');
  assert.equal(entry.definition.binding.sourceId,'runx-presence');
  assert.equal(q.pins.get('runx-presence').origin.repository,'kaicreator-mm/runx');
  const a=await observer(app,'2026-11-09T00:00:01Z');
  const b=await observer(app,'2026-11-09T00:00:02Z');
  assert.notEqual(a.value,b.value);
  for(const r of [a,b]){
   assert.equal(r.kind,'OBSERVATION');assert.equal(r.authority,'NONE');
   assert.equal(r.handle.lifetime,'PROCESS_LOCAL');
   assert.equal(r.evidence.attested,false);
   assert.deepEqual(r.handle.methods,['observe','list','latest']);
  }
  a.value.observe(request('agent-a','inc-1'),{agent_id:'agent-a'});
  assert.equal(a.value.latest().agent_incarnation_id,'inc-1');
  assert.equal(b.value.latest(),null);
  b.value.observe(request('agent-b','inc-2'),{agent_id:'agent-b'});
  assert.equal(a.value.list().length,1);
  assert.equal(b.value.latest().agent_incarnation_id,'inc-2');
  assert.equal(Object.hasOwn(a.value.latest(),'execution_authorized'),false);
 }finally{app.stop()}
});
test('B01-02 R33 source-real Runx token mismatch cannot create presence or grant lease',async()=>{
 const f=await fixture,app=await open(f);
 try{
  const a=(await observer(app,'2026-11-09T00:00:01Z')).value;
  a.observe(request('agent-a','inc-forged'),{agent_id:'agent-b'});
  assert.equal(a.latest(),null);
  assert.deepEqual(a.list(),[]);
  a.observe(request('agent-a','inc-true'),{agent_id:'agent-a'});
  assert.equal(a.latest().agent_incarnation_id,'inc-true');
  assert.equal(Object.hasOwn(a.latest(),'execution_authorized'),false);
  assert.equal(Object.hasOwn(a.latest(),'leaseId'),false);
 }finally{app.stop()}
});
test('B01-02 R33 Domain-owned Stateful presence does not mutate Tally Rule or xDownload Knowledge outputs',async()=>{
 const f=await fixture,app=await open(f);
 try{
  const beforeRule=await app.invoke('tally.assessTaskEvidence',{});
  const beforeKnowledge=await app.invoke('xdownload.describePolicy',{});
  const a=(await observer(app,'2026-11-09T00:00:01Z')).value;
  a.observe(request('agent-c','inc-state'),{agent_id:'agent-c'});
  const afterRule=await app.invoke('tally.assessTaskEvidence',{});
  const afterKnowledge=await app.invoke('xdownload.describePolicy',{});
  assert.deepEqual(beforeRule.value,afterRule.value);
  // The original xDownload getPolicy() returns fresh callback functions on
  // every call (decisionSchema.isValid / effectBindings.handler). They are
  // identity-distinct even when business policy is semantically unchanged.
  // Compare stable source-owned policy data, not ephemeral function identity.
  for(const field of ['packageId','policyId','domainId','workflowDefinition','intentBindings'])
   assert.deepEqual(beforeKnowledge.value[field],afterKnowledge.value[field]);
  assert.equal(beforeKnowledge.value.effectBindings['effect:acquire'].semantics,
   afterKnowledge.value.effectBindings['effect:acquire'].semantics);
  for(const r of [afterRule,afterKnowledge]){
   assert.equal(r.kind,'OBSERVATION');assert.equal(r.authority,'NONE');
   assert.equal(r.evidence.attested,false);
  }
  assert.equal(afterRule.disposition,'UNKNOWN');
  assert.equal(afterKnowledge.disposition,'OBSERVED');
 }finally{app.stop()}
});
test('B01-02 R33 SDK stop denies new Stateful and Effect ingress, but existing in-process handles are not remotely revoked',async()=>{
 const f=await fixture,app=await open(f);
 const before=await observer(app,'2026-11-09T00:00:01Z');
 app.stop();
 assert.equal(app.state,'STOPPED');
 await assert.rejects(observer(app,'2026-11-09T00:00:01Z'),reject('DIS_APP_NOT_READY'));
 await assert.rejects(app.invoke('xdownload.confirmDownload',{}),reject('DIS_APP_NOT_READY'));
 // A function-returned PROCESS_LOCAL handle still exists in the caller's
 // process; stopping ingress is NOT universal handle revocation.
 before.value.observe(request('local-agent','inc-local'),{agent_id:'local-agent'});
 assert.equal(before.value.latest().agent_incarnation_id,'inc-local');
 assert.equal(before.authority,'NONE');
});
