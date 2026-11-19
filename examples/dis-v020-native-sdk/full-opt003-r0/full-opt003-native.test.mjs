/**
 * OPT-003 Full R211 native evidence: the complete local data-only Evolution
 * Slot activation lifecycle against the REAL selected xDownload AOT -> public
 * DIS v0.2 SDK (loadDisV020Aot over the canonical cross-project BUILD with
 * original Tally/Runx/xDownload source bytes). Complements the structural
 * mock-app tests in evolution-slot.test.mjs.
 *
 * Honest scope: activation here is LOCAL, in-process and data-only. Nothing
 * in this lane is a Host-authenticated activation, installed/qualified Rule,
 * Experience or Effect; every outcome carries authority 'NONE' and the
 * selected SDK still exposes no hot-load entry point.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from '../native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../../tests/assembly/helpers-v010.ts';
import {prepareOpt003DataSlot,createOpt003EvolutionSlot} from './evolution-slot.mjs';

const BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const FN='xdownload.describePolicy';
const slot=()=>prepareOpt003DataSlot({schema:'dis.v0.2.opt003-slot/1',
 functionId:FN,contractVersion:'1.0.0',sourceGitBlob:BLOB,
 op:'eq',field:'value.domainId',equals:'downloads'});
const selected=async tenantId=>{
 const fixture=await makeNativeFixture();
 const app=await loadDisV020Aot(fixture.artifact,{
  expectedDigest:fixture.artifact.digest,registry:fixture.registry,
  store:new PlainCasDocStore(),tenantId});
 assert.equal(app.aotDigest,fixture.artifact.digest);
 assert.equal(app.functions.includes(FN),true);
 assert.equal(app.contractVersions[FN],'1.0.0');
 // The selected SDK must not offer any code hot-load path at all.
 assert.equal(typeof app.activateLocalRule,'undefined');
 return app;
};
const make=(app,opts={})=>createOpt003EvolutionSlot({app,slot:slot(),
 expectedAotDigest:app.aotDigest,maxWaitMs:15000,...opts});
const noAuthority=out=>{
 assert.equal(out.scope,'LOCAL_EVOLUTION_SLOT');
 assert.equal(out.authority,'NONE');
 for(const k of ['qualified','hostAttested','installedRuleAttested',
  'experienceIssued','effectDispatched'])
  assert.equal(out[k],false,k);
};

test('OPT003 native full lifecycle: load -> atomic activate+pin -> data-driven execute -> revoke -> rollback -> restart invalidation',async()=>{
 const app=await selected('tenant:dis-opt003-full-lifecycle-r211-o3');
 try{
  const slotDigest=slot().digest;
  const gate=make(app);
  // 1. Load: the data-only slot is inside the AOT-locked candidate set.
  const loaded=gate.loadSlot();
  assert.equal(loaded.status,'LOADED');
  assert.equal(loaded.slotDigest,slotDigest);
  assert.equal(loaded.functionId,FN);
  assert.equal(loaded.sourceGitBlob,BLOB);
  assert.equal(loaded.ruleActivated,false);
  noAuthority(loaded);
  // Behavior BEFORE activation: the same real SDK observation is denied.
  const before=await gate.executeTask(gate.beginTask());
  assert.equal(before.status,'DENIED');
  assert.equal(before.reason,'OPT003_SLOT_NOT_ACTIVE');
  assert.equal(before.ruleActivated,false);
  assert.equal(before.ruleEvaluated,false);
  noAuthority(before);
  // 2. Atomic activation: slot authorization, epoch publish and task pin
  //    complete in one synchronous step (no intermediate visible state).
  const {token,activation}=gate.activateForTask();
  assert.equal(activation.status,'ACTIVATED_LOCAL');
  assert.equal(activation.ruleActivated,true);
  assert.equal(activation.taskPinned,true);
  assert.equal(activation.slotDigest,slotDigest);
  assert.equal(activation.epoch,gate.state().currentEpoch);
  noAuthority(activation);
  assert.equal(gate.state().ruleActivated,true);
  // 3. Post-activation execution over the real selected SDK: the rule data
  //    drives the observed decision (behavior change vs the pre-activation
  //    denial above), bounded to one own-data string comparison.
  const executed=await gate.executeTask(token);
  assert.equal(executed.status,'SLOT_EXECUTED');
  assert.equal(executed.reason,'RULE_MATCH');
  assert.equal(executed.ruleActivated,true);
  assert.equal(executed.ruleEvaluated,true);
  assert.equal(executed.ruleMatched,true);
  assert.equal(executed.decision,'ALLOW_DATA_ONLY_SHADOW');
  assert.equal(executed.slotDigest,slotDigest);
  assert.equal(executed.observedSourceGitBlob,BLOB);
  assert.equal(typeof executed.taskEpoch,'number');
  noAuthority(executed);
  // Single-use pin: a second execution of the same task is refused.
  const replay=await gate.executeTask(token);
  assert.equal(replay.status,'DENIED');
  assert.equal(replay.reason,'OPT003_TASK_PIN_ALREADY_USED');
  noAuthority(replay);
  // 4. Rollback to the pre-activation epoch: state verifiably restored.
  const preEpoch=0;
  gate.rollbackTo(preEpoch);
  assert.equal(gate.state().ruleActivated,false);
  assert.equal(gate.state().activeDigest,null);
  const afterRollback=await gate.executeTask(gate.beginTask());
  assert.equal(afterRollback.status,'DENIED');
  assert.equal(afterRollback.reason,'OPT003_SLOT_NOT_ACTIVE');
  noAuthority(afterRollback);
  // 5. Re-activation after rollback works, then revoke invalidates
  //    immediately: the same task-shaped flow now hits the refusal path.
  const {token:second}=gate.activateForTask();
  const reExecuted=await gate.executeTask(second);
  assert.equal(reExecuted.status,'SLOT_EXECUTED');
  assert.equal(reExecuted.ruleMatched,true);
  gate.revokeSlot();
  assert.equal(gate.state().ruleActivated,false);
  assert.equal(gate.state().slotRevoked,true);
  // Revoked: fresh activation is refused and execution observes the revoked slot.
  assert.throws(()=>gate.activateForTask(),e=>e.code==='OPT003_SLOT_REVOKED');
  const revoked=await gate.executeTask(gate.beginTask());
  assert.equal(revoked.status,'DENIED');
  assert.equal(revoked.reason,'OPT003_SLOT_REVOKED');
  noAuthority(revoked);
  // 6. Restart semantics (locked by test): activation is PROCESS_LOCAL and
  //    explicitly invalid after restart. A brand-new coordinator instance
  //    over the same loaded SDK holds no activation and refuses the old pin.
  const restarted=make(app);
  assert.equal(restarted.state().currentEpoch,0);
  assert.equal(restarted.state().ruleActivated,false);
  assert.equal(restarted.state().processLocal,true);
  const stale=await restarted.executeTask(token);
  assert.equal(stale.status,'DENIED');
  assert.equal(stale.reason,'OPT003_PIN_NOT_ISSUED');
  noAuthority(stale);
  // A fresh activation on the restarted instance works end to end.
  const {token:fresh}=restarted.activateForTask();
  const freshOut=await restarted.executeTask(fresh);
  assert.equal(freshOut.status,'SLOT_EXECUTED');
  assert.equal(freshOut.ruleMatched,true);
  assert.equal(typeof app.activateLocalRule,'undefined');
 }finally{app.stop()}
});

test('OPT003 native negatives: forged code zero-execution, wrong-task pin, cancel race, stale epoch, AOT-outside slot',async()=>{
 const app=await selected('tenant:dis-opt003-full-negatives-r211-o3');
 try{
  const gate=make(app);
  // Forged code: executable strings are rejected as non-data literals with
  // zero execution evidence on the real selected SDK instance.
  let invokes=0;
  const counting={
   aotDigest:app.aotDigest,functions:app.functions,
   contractVersions:app.contractVersions,
   invoke:(...args)=>{invokes++;return app.invoke(...args)}
  };
  globalThis.__opt003NativePwned=undefined;
  for(const equals of [
   '(function(){globalThis.__opt003NativePwned=true})()',
   'import("node:fs").then(m=>m.rm("/"))',
   'eval(globalThis.__opt003NativePwned=1)',
   'x=>globalThis.__opt003NativePwned=1'
  ]){
   assert.throws(()=>prepareOpt003DataSlot({schema:'dis.v0.2.opt003-slot/1',
    functionId:FN,contractVersion:'1.0.0',sourceGitBlob:BLOB,
    op:'eq',field:'value.domainId',equals}),
    e=>e.code==='OPT003_SLOT_LITERAL_UNSAFE',equals);
  }
  assert.throws(()=>prepareOpt003DataSlot({schema:'dis.v0.2.opt003-slot/1',
   functionId:FN,contractVersion:'1.0.0',sourceGitBlob:BLOB,
   op:'eq',field:'value.domainId',equals:'downloads',
   code:'(function(){globalThis.__opt003NativePwned=true})()'}),
   e=>e.code==='OPT003_SLOT_NOT_DATA_ONLY');
  assert.equal(globalThis.__opt003NativePwned,undefined);
  assert.equal(invokes,0);
  // Wrong task: a pin issued under one activation is refused after a later
  // activation supersedes its epoch, and a foreign coordinator refuses it.
  const a=gate.activateForTask();
  const b=gate.activateForTask();
  const bOut=await gate.executeTask(b.token);
  assert.equal(bOut.status,'SLOT_EXECUTED');
  const staleA=await gate.executeTask(a.token);
  assert.equal(staleA.status,'DENIED');
  assert.equal(staleA.reason,'OPT003_STALE_EPOCH');
  noAuthority(staleA);
  const other=make(app);
  const foreign=await other.executeTask(b.token);
  assert.equal(foreign.status,'DENIED');
  assert.equal(foreign.reason,'OPT003_PIN_NOT_ISSUED');
  // Cancel race: cancel before execution and cancel during the in-flight
  // native observation both end as explicit denials.
  const cancelled=gate.beginTask();
  gate.cancelTask(cancelled);
  const late=await gate.executeTask(cancelled);
  assert.equal(late.status,'DENIED');
  assert.equal(late.reason,'OPT003_TASK_CANCELLED');
  noAuthority(late);
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve});
  const delayed={
   aotDigest:app.aotDigest,functions:app.functions,
   contractVersions:app.contractVersions,
   invoke:(...args)=>{entered();return new Promise(resolve=>{release=resolve})}
  };
  const racing=createOpt003EvolutionSlot({app:delayed,slot:slot(),
   expectedAotDigest:app.aotDigest,maxWaitMs:15000});
  const racingToken=racing.activateForTask().token;
  const pending=racing.executeTask(racingToken);
  await started;
  racing.cancelTask(racingToken);
  release({
   kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
   contractVersion:'1.0.0',value:{domainId:'downloads'},
   evidence:{attested:false,source:{sourceId:'xdownload-business',
    gitBlob:BLOB,sha256:'b'.repeat(64)}}});
  const inFlight=await pending;
  assert.equal(inFlight.status,'DENIED');
  assert.equal(inFlight.reason,'OPT003_TASK_CANCELLED_DURING_EXECUTION');
  noAuthority(inFlight);
  // Stale epoch: rollback past an activation epoch makes its pins stale.
  const gate2=make(counting);
  const epochBefore=gate2.state().currentEpoch;
  const pinned=gate2.activateForTask();
  const rolled=gate2.rollbackTo(epochBefore);
  assert.equal(rolled.status,'ROLLED_BACK_LOCAL');
  assert.equal(gate2.state().ruleActivated,false);
  const stale=await gate2.executeTask(pinned.token);
  assert.equal(stale.status,'DENIED');
  assert.equal(stale.reason,'OPT003_STALE_EPOCH');
  noAuthority(stale);
  assert.throws(()=>gate2.rollbackTo(999),e=>e.code==='OPT003_EPOCH_UNKNOWN');
  // AOT-outside slot: never loads, zero native calls for the attempt.
  const callsBefore=invokes;
  assert.throws(()=>prepareOpt003DataSlot({schema:'dis.v0.2.opt003-slot/1',
   functionId:'evil.exec',contractVersion:'1.0.0',sourceGitBlob:BLOB,
   op:'eq',field:'value.domainId',equals:'downloads'}),
   e=>e.code==='OPT003_SLOT_NOT_DATA_ONLY');
  assert.equal(invokes,callsBefore);
  assert.equal(typeof app.activateLocalRule,'undefined');
 }finally{app.stop()}
});
