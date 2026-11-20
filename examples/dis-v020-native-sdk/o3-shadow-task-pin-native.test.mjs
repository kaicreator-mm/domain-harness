/** O3 actual selected xDownload AOT→SDK, task pin is still Shadow-only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {prepareO3ShadowCandidate} from './o3-shadow-rule.mjs';
import {makeO3ShadowTaskPin} from './o3-shadow-task-pin.mjs';

const blob='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
test('O3 real selected xDownload AOT SDK: future task pin, suspend, rollback, revoke; no qualification or Effect',async()=>{
 const f=await makeNativeFixture();
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,
   registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:dis-o3-taskpin-r137'});
 try{
  const candidate=prepareO3ShadowCandidate({schema:'dis.v0.2.o3-shadow-candidate/1',
   functionId:'xdownload.describePolicy',contractVersion:'1.0.0',
   sourceGitBlob:blob,op:'eq',field:'value.domainId',equals:'downloads'});
  const coordinator=makeO3ShadowTaskPin({app,candidate,maxWaitMs:15000,maxTasks:8});
  const prior=coordinator.beginTask();
  const selected=coordinator.publishShadowForFutureTasks();
  const selectedTask=coordinator.beginTask();
  const disabled=await coordinator.probeTask(prior);
  assert.equal(disabled.reason,'SHADOW_DISABLED_FOR_TASK');
  const observed=await coordinator.probeTask(selectedTask);
  assert.equal(observed.shadowMatched,true);
  assert.equal(observed.taskEpoch,selected.epoch);
  coordinator.suspendShadowForFutureTasks();
  const suspended=await coordinator.probeTask(coordinator.beginTask());
  assert.equal(suspended.reason,'SHADOW_DISABLED_FOR_TASK');
  coordinator.rollbackShadowTo(selected.epoch);
  const restored=await coordinator.probeTask(coordinator.beginTask());
  assert.equal(restored.shadowMatched,true);
  coordinator.revokeCandidateDigest();
  const denied=await coordinator.probeTask(coordinator.beginTask());
  assert.equal(denied.reason,'TASK_PIN_REVOKED');
  for(const r of [disabled,observed,suspended,restored,denied]){
   assert.equal(r.status,'NEED_MORE_EVIDENCE');
   assert.equal(r.qualified,false);assert.equal(r.ruleActivated,false);
   assert.equal(r.experienceIssued,false);assert.equal(r.effectDispatched,false);
  }
  assert.equal(typeof app.activateLocalRule,'undefined');
 }finally{app.stop()}
});
