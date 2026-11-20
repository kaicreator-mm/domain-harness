import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareO3ShadowCandidate} from './o3-shadow-rule.mjs';
import {makeO3ShadowTaskPin} from './o3-shadow-task-pin.mjs';
const blob='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const candidate=()=>prepareO3ShadowCandidate({schema:'dis.v0.2.o3-shadow-candidate/1',
  functionId:'xdownload.describePolicy',contractVersion:'1.0.0',sourceGitBlob:blob,
  op:'eq',field:'value.domainId',equals:'downloads'});
const observation=()=>({kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
  contractVersion:'1.0.0',value:{domainId:'downloads'},evidence:{attested:false,
    source:{sourceId:'xdownload-business',sha256:'a'.repeat(64),gitBlob:blob}}});
const app=(invoke=async()=>observation())=>({functions:['xdownload.describePolicy'],
  contractVersions:{'xdownload.describePolicy':'1.0.0'},invoke});
const make=(opts={})=>makeO3ShadowTaskPin({app:app(),candidate:candidate(),...opts});
const deny=e=>e?.code?.startsWith('O3_');
const neverActives=x=>{
 assert.equal(x.scope,'SHADOW_ONLY');assert.equal(x.status,'NEED_MORE_EVIDENCE');
 for(const k of ['qualified','ruleActivated','experienceIssued','effectDispatched'])
   assert.equal(x[k],false,`must not promote ${k}`);
};

test('O3 future-only epoch selection does not modify existing task pins',async()=>{
 const m=make();const old=m.beginTask();const e=m.publishShadowForFutureTasks();
 assert.equal(e.epoch,1);assert.equal(e.ruleActivated,false);
 neverActives(await m.probeTask(old));
 assert.equal((await m.probeTask(old)).reason,'TASK_PIN_ALREADY_USED');
 const fresh=await m.probeTask(m.beginTask());
 neverActives(fresh);assert.equal(fresh.shadowMatched,true);
 assert.equal(fresh.taskEpoch,1);
});

test('O3 suspend and rollback keep original task epoch and forbid promotion',async()=>{
 const m=make();const a=m.publishShadowForFutureTasks();
 const prior=m.beginTask();const suspended=m.suspendShadowForFutureTasks();
 assert.equal(suspended.epoch,2);
 const disabled=await m.probeTask(m.beginTask());
 neverActives(disabled);assert.equal(disabled.reason,'SHADOW_DISABLED_FOR_TASK');
 const restored=m.rollbackShadowTo(a.epoch);assert.equal(restored.epoch,3);
 const before=await m.probeTask(prior);const after=await m.probeTask(m.beginTask());
 neverActives(before);neverActives(after);
 assert.equal(before.taskEpoch,1);assert.equal(after.taskEpoch,3);
 assert.equal(after.shadowMatched,true);
 assert.equal((await m.probeTask(m.beginTask())).ruleActivated,false);
});

test('O3 in-flight revocation fails closed after asynchronous observation',async()=>{
 let release;const barrier=new Promise(resolve=>{release=resolve});let started;
 const entered=new Promise(resolve=>{started=resolve});
 const m=makeO3ShadowTaskPin({app:app(async()=>{started();await barrier;return observation()}),
   candidate:candidate()});
 const epoch=m.publishShadowForFutureTasks().epoch;
 const task=m.beginTask();const pending=m.probeTask(task);
 await entered;m.revokeEpoch(epoch);release();
 const got=await pending;neverActives(got);
 assert.equal(got.reason,'TASK_PIN_REVOKED_DURING_OBSERVATION');
 assert.throws(()=>m.rollbackShadowTo(epoch),e=>e.code==='O3_EPOCH_REVOKED');
 assert.equal((await m.probeTask(m.beginTask())).reason,'SHADOW_DISABLED_FOR_TASK');
});

test('O3 revoked candidate digest blocks historic pins and all new selection',async()=>{
 const m=make();m.publishShadowForFutureTasks();const task=m.beginTask();
 m.revokeCandidateDigest();
 assert.equal((await m.probeTask(task)).reason,'TASK_PIN_REVOKED');
 assert.throws(()=>m.publishShadowForFutureTasks(),e=>e.code==='O3_CANDIDATE_REVOKED');
 assert.throws(()=>m.rollbackShadowTo(1),e=>e.code==='O3_CANDIDATE_REVOKED');
});

test('O3 forged/Proxy tokens, replay and wrong types cannot borrow an epoch',async()=>{
 const m=make();m.publishShadowForFutureTasks();const token=m.beginTask();
 let traps=0;const forged=new Proxy({}, {get(){traps++;throw Error('trap')},
   getPrototypeOf(){traps++;throw Error('trap')}});
 const invalid=[{},Object.freeze({...token}),forged,'1',1,null,undefined];
 for(const x of invalid){const r=await m.probeTask(x);neverActives(r);
   assert.equal(r.reason,'TASK_PIN_NOT_ISSUED');}
 assert.equal(traps,0);
 neverActives(await m.probeTask(token));
 assert.equal((await m.probeTask(token)).reason,'TASK_PIN_ALREADY_USED');
 assert.throws(()=>m.rollbackShadowTo('1'),e=>e.code==='O3_EPOCH_UNKNOWN');
});

test('O3 bounded task/epoch budgets and invalid inputs fail before work',async()=>{
 assert.throws(()=>make({maxTasks:0}),deny);
 assert.throws(()=>make({maxEpochs:-1}),deny);
 assert.throws(()=>make({candidate:{...candidate(),qualified:true}}),deny);
 const m=make({maxTasks:1,maxEpochs:2});
 m.publishShadowForFutureTasks();m.beginTask();
 assert.throws(()=>m.beginTask(),e=>e.code==='O3_TASK_BUDGET_EXHAUSTED');
 m.suspendShadowForFutureTasks();
 assert.throws(()=>m.rollbackShadowTo(1),e=>e.code==='O3_EPOCH_BUDGET_EXHAUSTED');
 m.close();assert.throws(()=>m.beginTask(),e=>e.code==='O3_COORDINATOR_CLOSED');
});

test('O3 missing observations and timeout remain UNKNOWN; no Effect',async()=>{
 const m=makeO3ShadowTaskPin({app:app(()=>new Promise(()=>{})),candidate:candidate(),maxWaitMs:1});
 m.publishShadowForFutureTasks();const result=await m.probeTask(m.beginTask());
 neverActives(result);assert.equal(result.reason,'SHADOW_OBSERVATION_UNKNOWN');
});
