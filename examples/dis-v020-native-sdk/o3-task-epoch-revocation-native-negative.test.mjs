/**
 * O3 R1 negative-only proof: real selected xDownload AOT -> public SDK,
 * then in-process Shadow Task epoch binding, concurrent reservations,
 * monotonic pin expiration, and revoke-after-await rejection.
 * A task pin is NOT a durable Host credential, Evolution Slot, Effect permit,
 * qualified Rule, or evidence of production activation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {prepareO3ShadowCandidate} from './o3-shadow-rule.mjs';
import {makeO3ShadowTaskPin} from './o3-shadow-task-pin.mjs';

const SOURCE_BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const candidate=()=>prepareO3ShadowCandidate({
  schema:'dis.v0.2.o3-shadow-candidate/1',
  functionId:'xdownload.describePolicy',
  contractVersion:'1.0.0',sourceGitBlob:SOURCE_BLOB,
  op:'eq',field:'value.domainId',equals:'downloads'
});
const denied=out=>{
  assert.equal(out.status,'NEED_MORE_EVIDENCE');
  assert.equal(out.scope,'SHADOW_ONLY');
  assert.equal(out.authority,'NONE');
  for(const name of ['qualified','ruleActivated','experienceIssued','effectDispatched'])
    assert.equal(out[name],false,name);
  assert.notEqual(out.reason,undefined);
};
const selected=async tenantId=>{
  const fixture=await makeNativeFixture();
  const app=await loadDisV020Aot(fixture.artifact,{
    expectedDigest:fixture.artifact.digest,registry:fixture.registry,
    store:new PlainCasDocStore(),tenantId
  });
  assert.equal(app.aotDigest,fixture.artifact.digest);
  assert.equal(app.functions.includes('xdownload.describePolicy'),true);
  assert.equal(app.contractVersions['xdownload.describePolicy'],'1.0.0');
  assert.equal(typeof app.activateLocalRule,'undefined');
  return app;
};
function delayedSelectedApp(app){
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve});
  const barrier=new Promise(resolve=>{release=resolve});
  const wrapped=Object.freeze({
    aotDigest:app.aotDigest,functions:app.functions,
    contractVersions:app.contractVersions,
    async invoke(functionId,input){
      entered();
      await barrier;
      return app.invoke(functionId,input);
    }
  });
  return {wrapped,started,release};
}

test('O3 native selected AOT and SDK: distinct task snapshots, concurrent probes, cross-coordinator replay refusal',async()=>{
  const app=await selected('tenant:dis-o3-task-epoch-negative-r1-a');
  try{
    const one=makeO3ShadowTaskPin({app,candidate: candidate(),maxTasks:6,maxWaitMs:15000});
    const before=one.beginTask();
    const published=one.publishShadowForFutureTasks();
    const a=one.beginTask(),b=one.beginTask();
    const other=makeO3ShadowTaskPin({app,candidate:candidate(),maxTasks:2,maxWaitMs:15000});
    other.publishShadowForFutureTasks();
    const foreign=await other.probeTask(a);
    denied(foreign);
    assert.equal(foreign.reason,'TASK_PIN_NOT_ISSUED');
    const [older,x,y]=await Promise.all([
      one.probeTask(before),one.probeTask(a),one.probeTask(b)
    ]);
    for(const out of [older,x,y])denied(out);
    assert.equal(older.reason,'SHADOW_DISABLED_FOR_TASK');
    for(const out of [x,y]){
      assert.equal(out.taskEpoch,published.epoch);
      assert.equal(out.shadowMatched,true);
      assert.equal(out.candidateDigest,candidate().digest);
    }
    const replay=await one.probeTask(a);
    denied(replay);
    assert.equal(replay.reason,'TASK_PIN_ALREADY_USED');
  }finally{app.stop()}
});

test('O3 in-process issued task token expires before any selected native SDK call',async()=>{
  const app=await selected('tenant:dis-o3-task-epoch-negative-r1-b');
  try{
    let invokes=0;
    const wrapped=Object.freeze({
      functions:app.functions,contractVersions:app.contractVersions,
      invoke:(...args)=>{invokes++;return app.invoke(...args)}
    });
    const gate=makeO3ShadowTaskPin({app:wrapped,candidate:candidate(),
      maxTaskAgeMs:2,maxWaitMs:15000});
    gate.publishShadowForFutureTasks();
    const token=gate.beginTask();
    await sleep(20);
    const expired=await gate.probeTask(token);
    denied(expired);
    assert.equal(expired.reason,'TASK_PIN_EXPIRED');
    assert.equal(invokes,0);
    assert.equal((await gate.probeTask(token)).reason,'TASK_PIN_ALREADY_USED');
    assert.throws(()=>makeO3ShadowTaskPin({app:wrapped,candidate:candidate(),maxTaskAgeMs:0}),
      e=>e.code==='O3_TASK_TTL_INVALID');
    assert.throws(()=>makeO3ShadowTaskPin({app:wrapped,candidate:candidate(),maxTaskAgeMs:60001}),
      e=>e.code==='O3_TASK_TTL_INVALID');
  }finally{app.stop()}
});

test('O3 task TTL expiring during actual selected SDK observation refuses result after await',async()=>{
  const app=await selected('tenant:dis-o3-task-epoch-negative-r1-c');
  try{
    const {wrapped,started,release}=delayedSelectedApp(app);
    const gate=makeO3ShadowTaskPin({app:wrapped,candidate:candidate(),
      maxTaskAgeMs:25,maxWaitMs:15000});
    gate.publishShadowForFutureTasks();
    const token=gate.beginTask();
    const pending=gate.probeTask(token);
    await started;
    await sleep(50);
    release();
    const expired=await pending;
    denied(expired);
    assert.equal(expired.reason,'TASK_PIN_EXPIRED_DURING_OBSERVATION');
    assert.equal(expired.shadowMatched,undefined);
    assert.equal((await gate.probeTask(token)).reason,'TASK_PIN_ALREADY_USED');
  }finally{app.stop()}
});

test('O3 concurrent in-flight epoch revocation refuses selected SDK observation, forbids rollback',async()=>{
  const app=await selected('tenant:dis-o3-task-epoch-negative-r1-d');
  try{
    const {wrapped,started,release}=delayedSelectedApp(app);
    const gate=makeO3ShadowTaskPin({app:wrapped,candidate:candidate(),
      maxTaskAgeMs:15000,maxWaitMs:15000});
    const epoch=gate.publishShadowForFutureTasks().epoch;
    const token=gate.beginTask();
    const pending=gate.probeTask(token);
    await started;
    gate.revokeEpoch(epoch);
    release();
    const revoked=await pending;
    denied(revoked);
    assert.equal(revoked.reason,'TASK_PIN_REVOKED_DURING_OBSERVATION');
    assert.equal(revoked.shadowMatched,undefined);
    assert.throws(()=>gate.rollbackShadowTo(epoch),e=>e.code==='O3_EPOCH_REVOKED');
    const subsequent=await gate.probeTask(gate.beginTask());
    denied(subsequent);
    assert.equal(subsequent.reason,'SHADOW_DISABLED_FOR_TASK');
  }finally{app.stop()}
});

test('O3 candidate-wide revocation rejects historical selected pin and all future publication',async()=>{
  const app=await selected('tenant:dis-o3-task-epoch-negative-r1-e');
  try{
    const gate=makeO3ShadowTaskPin({app,candidate:candidate(),maxTaskAgeMs:15000});
    const epoch=gate.publishShadowForFutureTasks().epoch;
    const token=gate.beginTask();
    gate.revokeCandidateDigest();
    const revoked=await gate.probeTask(token);
    denied(revoked);
    assert.equal(revoked.reason,'TASK_PIN_REVOKED');
    assert.throws(()=>gate.publishShadowForFutureTasks(),e=>e.code==='O3_CANDIDATE_REVOKED');
    assert.throws(()=>gate.rollbackShadowTo(epoch),e=>e.code==='O3_CANDIDATE_REVOKED');
    const after=await gate.probeTask(gate.beginTask());
    denied(after);
    assert.equal(after.reason,'TASK_PIN_REVOKED');
    assert.equal(typeof app.activateLocalRule,'undefined');
  }finally{app.stop()}
});
