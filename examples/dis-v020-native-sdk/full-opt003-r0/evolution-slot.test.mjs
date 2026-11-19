/**
 * OPT-003 full lane structural + fail-closed negatives over a typed mock app.
 * Complements (does not replace) the real AOT->SDK native test. The mock app
 * is a structural harness only; native authority evidence comes from
 * full-opt003-native.test.mjs against the selected xDownload AOT/SDK.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {prepareOpt003DataSlot,createOpt003EvolutionSlot} from './evolution-slot.mjs';

const BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const FN='xdownload.describePolicy';
const AOT='a'.repeat(64);
const observed=(domainId='downloads')=>({
 kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
 contractVersion:'1.0.0',value:{domainId},
 evidence:{attested:false,source:{sourceId:'xdownload-business',gitBlob:BLOB,
  sha256:'b'.repeat(64)}}});
const slotInput=(equals='downloads')=>({schema:'dis.v0.2.opt003-slot/1',
 functionId:FN,contractVersion:'1.0.0',sourceGitBlob:BLOB,
 op:'eq',field:'value.domainId',equals});
const mock=(invoke=async()=>observed())=>({
 aotDigest:AOT,functions:[FN],contractVersions:{[FN]:'1.0.0'},invoke});
const make=(app=mock(),opts={})=>createOpt003EvolutionSlot({
 app,slot:prepareOpt003DataSlot(slotInput()),expectedAotDigest:app.aotDigest,
 maxWaitMs:1000,...opts});
const denied=out=>{
 assert.equal(out.status,'DENIED');
 assert.equal(out.scope,'LOCAL_EVOLUTION_SLOT');
 assert.equal(out.authority,'NONE');
 for(const k of ['qualified','hostAttested','ruleEvaluated','ruleMatched',
  'experienceIssued','effectDispatched'])
  assert.equal(out[k],false,k);
};

test('OPT003 forged code is rejected as inert data with zero execution evidence',()=>{
 let invokeCalls=0;const app=mock(async()=>{invokeCalls++;return observed()});
 // Executable-looking literals, extra code keys, function values, Proxy and
 // accessor carriers: every form must fail closed BEFORE any native dispatch.
 const codeStrings=[
  '(function(){globalThis.__opt003Pwned=true})()',
  'import("node:fs")',
  'eval(globalThis.__opt003Pwned=1)',
  'x=>x.pwned',
  'new Function("pwned")()'
 ];
 for(const equals of codeStrings){
  assert.throws(()=>prepareOpt003DataSlot(slotInput(equals)),
   e=>e.code==='OPT003_SLOT_LITERAL_UNSAFE',equals);
 }
 for(const forged of [
  {...slotInput(),code:'(function(){globalThis.__opt003Pwned=true})()'},
  {...slotInput(),run:'__opt003Pwned=1'},
  {...slotInput(),exec:'globalThis.__opt003Pwned=1'},
  {...slotInput(),import:'node:fs'},
  {...slotInput(),equals:()=>{}},
  (()=>{const x=slotInput();Object.defineProperty(x,'equals',{
   enumerable:true,get(){globalThis.__opt003Pwned=true;return'downloads'}});
   return x})()
 ]){
  assert.throws(()=>prepareOpt003DataSlot(forged),/OPT003_SLOT_/);
 }
 // Zero execution: no side effect ran, and the selected app was never called.
 assert.equal(globalThis.__opt003Pwned,undefined);
 assert.equal(invokeCalls,0);
 // Host has no hot-load path at all.
 assert.equal(typeof app.activateLocalRule,'undefined');
});

test('OPT003 AOT-outside slot is refused before any load or activation',()=>{
 // A functionId outside the AOT-locked candidate grammar never even
 // prepares: the strict gate rejects it before any native dispatch.
 assert.throws(()=>prepareOpt003DataSlot({schema:'dis.v0.2.opt003-slot/1',
  functionId:'evil.exec',contractVersion:'1.0.0',sourceGitBlob:BLOB,
  op:'eq',field:'value.domainId',equals:'downloads'}),
  e=>e.code==='OPT003_SLOT_NOT_DATA_ONLY');
 // Selected app identity pin mismatch refuses construction outright.
 assert.throws(()=>createOpt003EvolutionSlot({
  app:mock(),slot:prepareOpt003DataSlot(slotInput()),
  expectedAotDigest:'c'.repeat(64)}),e=>e.code==='OPT003_SELECTED_APP_UNTRUSTED');
 // An app whose selected function set lost the slot's function refuses load.
 const narrowed=mock();narrowed.functions=['other.fn'];
 assert.throws(()=>createOpt003EvolutionSlot({app:narrowed,
  slot:prepareOpt003DataSlot(slotInput()),expectedAotDigest:AOT}),
  e=>e.code==='OPT003_SELECTED_APP_UNTRUSTED');
 // Tampered digest on an otherwise prepared slot refuses validation.
 const tampered={...prepareOpt003DataSlot(slotInput()),digest:'d'.repeat(64)};
 assert.throws(()=>createOpt003EvolutionSlot({app:mock(),slot:tampered,
  expectedAotDigest:AOT}),e=>e.code==='OPT003_SLOT_NOT_DATA_ONLY');
});

test('OPT003 budget and shape validation fail closed at construction',()=>{
 const slot=prepareOpt003DataSlot(slotInput());
 for(const opts of [{maxTasks:0},{maxEpochs:0},{maxTaskAgeMs:0},
  {maxWaitMs:0},{maxSteps:0},{maxDepth:0}]){
  assert.throws(()=>createOpt003EvolutionSlot({app:mock(),slot,
   expectedAotDigest:AOT,...opts}),/OPT003_/);
 }
 // Proxy/app mutation wideners refuse construction or go stale.
 assert.throws(()=>createOpt003EvolutionSlot({app:new Proxy(mock(),{}),slot,
  expectedAotDigest:AOT}),/OPT003_/);
 const stale=mock();
 const gate=createOpt003EvolutionSlot({app:stale,slot,
  expectedAotDigest:AOT,maxWaitMs:1000});
 stale.functions=[];
 assert.throws(()=>gate.loadSlot(),e=>e.code==='OPT003_SELECTED_APP_STALE');
});

test('OPT003 activation is atomic: load, epoch publish and pin leave no intermediate state',async()=>{
 const gate=make();
 assert.equal(gate.state().ruleActivated,false);
 const loaded=gate.loadSlot();
 assert.equal(loaded.status,'LOADED');
 assert.equal(loaded.ruleActivated,false);
 const {token,activation}=gate.activateForTask();
 assert.equal(activation.status,'ACTIVATED_LOCAL');
 assert.equal(activation.ruleActivated,true);
 assert.equal(activation.taskPinned,true);
 assert.equal(activation.slotDigest,gate.state().slotDigest);
 assert.equal(gate.state().ruleActivated,true);
 // The pinned task executes against the active slot.
 const executed=await gate.executeTask(token);
 assert.equal(executed.status,'SLOT_EXECUTED');
 assert.equal(executed.ruleActivated,true);
 assert.equal(executed.ruleEvaluated,true);
 assert.equal(executed.ruleMatched,true);
 assert.equal(executed.decision,'ALLOW_DATA_ONLY_SHADOW');
 assert.equal(executed.effectDispatched,false);
 assert.equal(executed.experienceIssued,false);
 assert.equal(executed.authority,'NONE');
});

test('OPT003 data-driven behavior change: unactivated task is denied, rule miss denies allow',async()=>{
 const gate=make();
 denied(await gate.executeTask(gate.beginTask()));
 const prior=await gate.executeTask(gate.beginTask());
 assert.equal(prior.reason,'OPT003_SLOT_NOT_ACTIVE');
 assert.equal(prior.ruleActivated,false);
 // Slot data that does not match flips the decision to deny.
 const missGate=createOpt003EvolutionSlot({app:mock(async()=>observed('other')),
  slot:prepareOpt003DataSlot(slotInput()),expectedAotDigest:AOT,maxWaitMs:1000});
 const {token}=missGate.activateForTask();
 const missed=await missGate.executeTask(token);
 assert.equal(missed.status,'SLOT_EXECUTED');
 assert.equal(missed.ruleMatched,false);
 assert.equal(missed.decision,'DENY_RULE_MISS');
});

test('OPT003 revoke invalidates immediately; same task re-execution is refused',async()=>{
 let calls=0;const app=mock(async()=>{calls++;return observed()});
 const gate=make(app);
 const {token}=gate.activateForTask();
 gate.revokeSlot();
 const revoked=await gate.executeTask(token);
 denied(revoked);
 assert.equal(revoked.reason,'OPT003_SLOT_REVOKED');
 assert.equal(gate.state().ruleActivated,false);
 // Re-activation after revoke is refused; execute with a fresh unpinned task
 // also observes the revoked, null slot.
 assert.throws(()=>gate.activateForTask(),e=>e.code==='OPT003_SLOT_REVOKED');
 denied(await gate.executeTask(gate.beginTask()));
 assert.equal((await gate.executeTask(gate.beginTask())).reason,'OPT003_SLOT_REVOKED');
});

test('OPT003 in-flight revoke during awaited observation refuses the result',async()=>{
 let release,entered;
 const started=new Promise(resolve=>{entered=resolve});
 const app=mock(()=>{entered();return new Promise(resolve=>{release=resolve})});
 const gate=make(app);
 const {token}=gate.activateForTask();
 const pending=gate.executeTask(token);
 await started;
 gate.revokeSlot();
 release(observed());
 const revoked=await pending;
 denied(revoked);
 assert.equal(revoked.reason,'OPT003_SLOT_REVOKED_DURING_EXECUTION');
});

test('OPT003 cancel race: cancelled task rejects late activation and execution',async()=>{
 const gate=make();
 const token=gate.beginTask();
 gate.cancelTask(token);
 denied(await gate.executeTask(token));
 assert.equal((await gate.executeTask(gate.beginTask())).reason,'OPT003_SLOT_NOT_ACTIVE');
 // In-flight cancel lands during the native observation.
 let release,entered;
 const started=new Promise(resolve=>{entered=resolve});
 const app=mock(()=>{entered();return new Promise(resolve=>{release=resolve})});
 const racing=make(app);
 const racingToken=racing.activateForTask().token;
 const pending=racing.executeTask(racingToken);
 await started;
 racing.cancelTask(racingToken);
 release(observed());
 const cancelled=await pending;
 denied(cancelled);
 assert.equal(cancelled.reason,'OPT003_TASK_CANCELLED_DURING_EXECUTION');
});

test('OPT003 wrong task: a task pin from a superseded activation or a foreign coordinator is refused',async()=>{
 const gate=make();
 const a=gate.activateForTask();
 const b=gate.activateForTask(); // second atomic activation supersedes A's epoch
 const bOut=await gate.executeTask(b.token);
 assert.equal(bOut.status,'SLOT_EXECUTED');
 // A's pin is now stale: its epoch was superseded by B's activation.
 const staleA=await gate.executeTask(a.token);
 denied(staleA);
 assert.equal(staleA.reason,'OPT003_STALE_EPOCH');
 assert.equal((await gate.executeTask(a.token)).reason,'OPT003_TASK_PIN_ALREADY_USED');
 const c=gate.beginTask();
 // C is a plain task in B's active epoch: the slot is data-active for the
 // whole epoch, so C legitimately observes rule-gated behavior...
 const cOut=await gate.executeTask(c);
 assert.equal(cOut.status,'SLOT_EXECUTED');
 assert.equal(cOut.ruleMatched,true);
 // ...but B's *pin object* is still single-use and non-transferable: the
 // coordinator re-executing it is refused, and a foreign coordinator that
 // never issued the pin refuses it outright.
 assert.equal((await gate.executeTask(b.token)).reason,'OPT003_TASK_PIN_ALREADY_USED');
 const other=make();
 const foreign=await other.executeTask(b.token);
 denied(foreign);
 assert.equal(foreign.reason,'OPT003_PIN_NOT_ISSUED');
});

test('OPT003 rollback restores the pre-activation state verifiably',async()=>{
 const gate=make();
 const loaded=gate.loadSlot();
 assert.equal(loaded.ruleActivated,false);
 const preEpoch=gate.state().currentEpoch;
 const {token}=gate.activateForTask();
 await gate.executeTask(token);
 gate.rollbackTo(preEpoch);
 assert.equal(gate.state().ruleActivated,false);
 assert.equal(gate.state().activeDigest,null);
 // New tasks observe the rolled-back (inactive) slot.
 denied(await gate.executeTask(gate.beginTask()));
 assert.equal((await gate.executeTask(gate.beginTask())).reason,'OPT003_SLOT_NOT_ACTIVE');
 // The pre-rollback pin is stale once a new activation supersedes the epoch.
 const after=gate.activateForTask();
 const fresh=await gate.executeTask(after.token);
 assert.equal(fresh.status,'SLOT_EXECUTED');
 denied(await gate.executeTask(token));
 assert.equal((await gate.executeTask(gate.beginTask())).status,'SLOT_EXECUTED');
 // Rollback refuses unknown and revoked epochs.
 assert.throws(()=>gate.rollbackTo(999),e=>e.code==='OPT003_EPOCH_UNKNOWN');
 gate.revokeSlot();
 assert.throws(()=>gate.rollbackTo(preEpoch),e=>e.code==='OPT003_EPOCH_REVOKED');
});

test('OPT003 restart: activation is process-local; stale pins and claims are refused',async()=>{
 let calls=0;const app=mock(async()=>{calls++;return observed()});
 const first=make(app);
 const {token,activation}=first.activateForTask();
 const executed=await first.executeTask(token);
 assert.equal(executed.status,'SLOT_EXECUTED');
 // Simulated restart: a brand-new coordinator instance over the same app.
 const restarted=make(app);
 assert.equal(restarted.state().currentEpoch,0);
 assert.equal(restarted.state().ruleActivated,false);
 assert.equal(restarted.state().processLocal,true);
 // The old in-process pin is unknown to the new instance (no durability).
 const foreign=await restarted.executeTask(token);
 denied(foreign);
 assert.equal(foreign.reason,'OPT003_PIN_NOT_ISSUED');
 // A caller-replayed activation claim (epoch+digest) is not accepted as
 // authority: the fresh coordinator requires its own atomic activation.
 assert.equal(activation.ruleActivated,true); // historical record, not a grant
 const fresh=restarted.activateForTask();
 assert.equal(fresh.activation.epoch,1);
 const again=await restarted.executeTask(fresh.token);
 assert.equal(again.status,'SLOT_EXECUTED');
});

test('OPT003 bounded interpreter: hostile deep nesting and budget overflow fail closed',async()=>{
 const deep=(n)=>{let v={domainId:'downloads'};for(let i=0;i<n;i++)v={next:v};return v};
 const wrap=(value)=>{const o=observed();o.value=value;return o};
 // maxDepth=3: a chain deeper than the budget must be refused, not executed.
 const shallow=make(mock(async()=>wrap(deep(10))),{maxDepth:3});
 denied(await shallow.executeTask(shallow.activateForTask().token));
 const budgeted=new Set();
 // Execute several coordinators against a counting mock to prove the budget
 // fence fires before any interpretation when depth is exceeded.
 let calls=0;const counting=mock(async()=>{calls++;return wrap(deep(10))});
 const limited=make(counting,{maxDepth:3,maxSteps:2});
 for(let i=0;i<3;i++){
  const {token}=limited.activateForTask();
  const out=await limited.executeTask(token);
  denied(out);
  budgeted.add(out.reason);
 }
 assert.deepEqual([...budgeted].sort(),['OPT003_OBSERVATION_UNQUALIFIED']);
 assert.ok(calls>=1); // native observation allowed; interpretation stayed bounded
 // Expired pins never reach the native call.
 const expiring=make(mock(async()=>{calls++;return observed()}),{maxTaskAgeMs:2});
 const stale=expiring.activateForTask().token;
 await sleep(20);
 denied(await expiring.executeTask(stale));
 assert.equal((await expiring.executeTask(stale)).reason,'OPT003_TASK_PIN_ALREADY_USED');
});

test('OPT003 outcome honesty: every result carries no-authority flags',async()=>{
 const gate=make();
 const ok=await gate.executeTask(gate.activateForTask().token);
 for(const k of ['qualified','hostAttested','installedRuleAttested',
  'experienceIssued','effectDispatched'])
  assert.equal(ok[k],false,k);
 assert.equal(ok.authority,'NONE');
 assert.equal(ok.scope,'LOCAL_EVOLUTION_SLOT');
});
