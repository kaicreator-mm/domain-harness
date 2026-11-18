/** R173: fail-closed O3 selected Task epoch POS/NEG/STALE/UNKNOWN, no Effect. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {prepareO3ShadowCandidate} from './o3-shadow-rule.mjs';
import {getO3FixedRuleTechnicalPin} from './o3-bounded-shadow-interpreter.mjs';
import {createO3SelectedTaskEpochPreflight} from './o3-selected-task-epoch-preflight.mjs';

const SOURCE='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const AOT='a'.repeat(64),RULE=getO3FixedRuleTechnicalPin();
const candidate=()=>prepareO3ShadowCandidate({
 schema:'dis.v0.2.o3-shadow-candidate/1',
 functionId:'xdownload.describePolicy',contractVersion:'1.0.0',
 sourceGitBlob:SOURCE,op:'eq',field:'value.domainId',equals:'downloads'
});
const observation=()=>({kind:'OBSERVATION',disposition:'OBSERVED',
 authority:'NONE',contractVersion:'1.0.0',value:{domainId:'downloads'},
 evidence:{attested:false,source:{sourceId:'xdownload-business',
 gitBlob:SOURCE,sha256:'b'.repeat(64)}}});
const mock=(invoke=async()=>observation())=>({
 aotDigest:AOT,functions:['xdownload.describePolicy'],
 contractVersions:{'xdownload.describePolicy':'1.0.0'},invoke
});
const create=(app=mock(),overrides={})=>
 createO3SelectedTaskEpochPreflight({app,candidate:candidate(),
  expectedAotDigest:app.aotDigest,expectedRuleDigest:RULE.digest,...overrides});
const locked=x=>{
 assert.equal(x.status,'NEED_MORE_EVIDENCE');
 assert.equal(x.schema,'dis.v0.2.o3-selected-task-epoch-preflight/1');
 assert.equal(x.scope,'SHADOW_ONLY');assert.equal(x.authority,'NONE');
 assert.equal(Object.isFrozen(x),true);
 for(const field of ['qualified','activationAllowed','ruleActivated',
  'taskAuthorized','taskPinPersisted','hostAttested','installedRuleAttested',
  'tenantAttested','experienceIssued','effectDispatched','positiveReplayAllowed'])
  assert.equal(x[field],false,field);
};

test('real selected xDownload AOT/SDK supports local shadow epochs but no Rule activation or Effect',async()=>{
 const fixture=await makeNativeFixture();
 const app=await loadDisV020Aot(fixture.artifact,{
  expectedDigest:fixture.artifact.digest,registry:fixture.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:dis-o3-epoch-r173'
 });
 try{
  const p=create(app,{maxWaitMs:15000});
  const old=p.beginTask();
  const published=p.publishShadowForFutureTasks();locked(published);
  const current=p.beginTask();
  const disabled=await p.probeTask(old);locked(disabled);
  assert.equal(disabled.reason,'SHADOW_DISABLED_FOR_TASK');
  const observed=await p.probeTask(current);locked(observed);
  assert.equal(observed.shadowMatched,true);
  assert.equal(observed.taskEpoch,published.taskEpoch);
  assert.equal(observed.aotDigest,fixture.artifact.digest);
  assert.equal(observed.technicalRuleDigest,RULE.digest);
  assert.equal(observed.sourceGitBlob,SOURCE);
  assert.equal(typeof app.activateLocalRule,'undefined');
  const suspended=p.suspendShadowForFutureTasks();locked(suspended);
  const stopped=await p.probeTask(p.beginTask());locked(stopped);
  assert.equal(stopped.reason,'SHADOW_DISABLED_FOR_TASK');
  locked(p.rollbackShadowTo(published.taskEpoch));
  const restored=await p.probeTask(p.beginTask());locked(restored);
  assert.equal(restored.shadowMatched,true);
  locked(p.revokeCandidateDigest());
  const revoked=await p.probeTask(p.beginTask());locked(revoked);
  assert.equal(revoked.reason,'TASK_PIN_REVOKED');
 }finally{app.stop()}
});

test('candidate, source, AOT and fixed technical rule drift fail before native invoke',()=>{
 let calls=0;const app=mock(async()=>{calls++;return observation()});
 const bad=[
  {expectedAotDigest:'c'.repeat(64)},
  {expectedRuleDigest:'d'.repeat(64)},
  {candidate:{...candidate(),digest:'f'.repeat(64)}},
  {candidate:{...candidate(),qualified:true}},
  {maxTasks:0},
  {maxEpochs:-1},
  {hostAttested:true},
  {tenantId:'tenant:forged'},
  {activationAllowed:true}
 ];
 for(const overrides of bad)
  assert.throws(()=>create(app,overrides),e=>e.code?.startsWith('O3_'));
 assert.equal(calls,0);
});

test('config descriptor capture rejects getters and Proxy without running traps',()=>{
 const app=mock();let reads=0;
 const opts={app,candidate:candidate(),expectedAotDigest:AOT,
  expectedRuleDigest:RULE.digest};
 Object.defineProperty(opts,'expectedAotDigest',{enumerable:true,
  get(){reads++;throw Error('UNTRUSTED_GETTER')}});
 assert.throws(()=>createO3SelectedTaskEpochPreflight(opts),
  {code:'O3_PREFLIGHT_OPTIONS_UNTRUSTED'});
 const proxy=new Proxy({}, {ownKeys(){reads++;throw Error('UNTRUSTED_PROXY')},
  getPrototypeOf(){reads++;throw Error('UNTRUSTED_PROXY')}});
 assert.throws(()=>createO3SelectedTaskEpochPreflight(proxy),
  {code:'O3_PREFLIGHT_OPTIONS_UNTRUSTED'});
 assert.equal(reads,0);
});

test('concurrent double consumption and forged/restarted task tokens never authorize',async()=>{
 const a=create();const b=create();locked(a.publishShadowForFutureTasks());
 const token=a.beginTask();
 const [first,second]=await Promise.all([a.probeTask(token),a.probeTask(token)]);
 locked(first);locked(second);
 assert.equal([first.reason,second.reason].includes('TASK_PIN_ALREADY_USED'),true);
 assert.equal((await a.probeTask(token)).reason,'TASK_PIN_ALREADY_USED');
 const stale=await b.probeTask(token);locked(stale);
 assert.equal(stale.reason,'TASK_PIN_NOT_ISSUED');
 const forged=await a.probeTask({});locked(forged);
 assert.equal(forged.reason,'TASK_PIN_NOT_ISSUED');
 const state=a.state();locked(state);assert.equal(state.taskPinPersisted,false);
 a.close();assert.throws(()=>a.beginTask(),{code:'O3_COORDINATOR_CLOSED'});
});

test('revoked in-flight epoch has no publishable Shadow result; rollback blocked',async()=>{
 let enter,release;
 const entered=new Promise(resolve=>{enter=resolve});
 const barrier=new Promise(resolve=>{release=resolve});
 const app=mock(async()=>{enter();await barrier;return observation()});
 const p=create(app,{maxWaitMs:1000});
 const epoch=p.publishShadowForFutureTasks().taskEpoch;
 const pending=p.probeTask(p.beginTask());
 await entered;
 locked(p.revokeEpoch(epoch));
 release();
 const result=await pending;locked(result);
 assert.equal(result.reason,'TASK_PIN_REVOKED_DURING_OBSERVATION');
 assert.throws(()=>p.rollbackShadowTo(epoch),{code:'O3_EPOCH_REVOKED'});
 const suspended=await p.probeTask(p.beginTask());locked(suspended);
 assert.equal(suspended.reason,'SHADOW_DISABLED_FOR_TASK');
});

test('timeout is UNKNOWN, not permit; technical pin alone never attests installed Host/tenant',async()=>{
 const p=create(mock(()=>new Promise(()=>{})),{maxWaitMs:2});
 locked(p.publishShadowForFutureTasks());
 const result=await p.probeTask(p.beginTask());locked(result);
 assert.equal(result.reason,'SHADOW_OBSERVATION_UNKNOWN');
 assert.equal(result.installedRuleAttested,false);
 assert.equal(result.tenantAttested,false);
 assert.equal(result.hostAttested,false);
});


test('nested selected app getter, Proxy and nonselected metadata are rejected before trap execution',()=>{
 const opts=app=>({app,candidate:candidate(),expectedAotDigest:AOT,
   expectedRuleDigest:RULE.digest});
 let reads=0;
 const trap=()=>{reads++;throw Error('UNTRUSTED_NESTED_APP_ACCESS')};
 const reject=app=>assert.throws(()=>createO3SelectedTaskEpochPreflight(opts(app)),
   {code:'O3_PREFLIGHT_SELECTED_APP_UNTRUSTED'});
 for(const key of ['aotDigest','functions','contractVersions','invoke']){
   const app=mock();
   Object.defineProperty(app,key,{enumerable:true,configurable:true,get:trap});
   reject(app);
 }
 reject(new Proxy(mock(),{get:trap,getPrototypeOf:trap,ownKeys:trap}));
 reject({...mock(),functions:new Proxy(['xdownload.describePolicy'],{
   get:trap,getPrototypeOf:trap,ownKeys:trap})});
 reject({...mock(),contractVersions:new Proxy({'xdownload.describePolicy':'1.0.0'},{
   get:trap,getPrototypeOf:trap,ownKeys:trap})});
 const version={};
 Object.defineProperty(version,'xdownload.describePolicy',{enumerable:true,get:trap});
 reject({...mock(),contractVersions:version});
 const selected=['xdownload.describePolicy'];
 Object.defineProperty(selected,'0',{configurable:true,get:trap});
 reject({...mock(),functions:selected});
 reject({...mock(),functions:['some.otherFunction']});
 const sparse=['xdownload.describePolicy'];sparse.length=2;
 reject({...mock(),functions:sparse});
 let applyTraps=0;
 const callableProxy=new Proxy(async()=>observation(),{
   apply(){applyTraps++;throw Error('UNTRUSTED_CALLABLE_PROXY_APPLY')}
 });
 reject({...mock(),invoke:callableProxy});
 const boundCarrier=Function.prototype.bind.call(callableProxy,null);
 assert.equal(typeof boundCarrier,'function');
 assert.equal(applyTraps,0,'binding must not call the proxy');
 reject({...mock(),invoke:boundCarrier});
 Object.defineProperty(boundCarrier,'name',{value:'invoke',configurable:true});
 reject({...mock(),invoke:boundCarrier});
 reject({...mock(),invoke:(async()=>observation()).bind(null)});
 assert.equal(applyTraps,0,'direct/bound/renamed carrier rejected without apply');
 assert.equal(reads,0,'source shape validation must not execute untrusted traps');
});

test('selected app metadata and invoke are pinned before caller-side nested mutation',async()=>{
 let originalCalls=0,hostileCalls=0;
 const app=mock(async()=>{originalCalls++;return observation()});
 const p=create(app);
 locked(p.publishShadowForFutureTasks());
 const token=p.beginTask();
 const trap=()=>{hostileCalls++;throw Error('POST_SELECTION_GETTER')};
 Object.defineProperty(app,'invoke',{configurable:true,enumerable:true,get:trap});
 app.functions=new Proxy(['not-selected'],{get:trap,getPrototypeOf:trap});
 app.contractVersions=new Proxy({}, {get:trap,getPrototypeOf:trap});
 Object.defineProperty(app,'aotDigest',{configurable:true,enumerable:true,get:trap});
 const observed=await p.probeTask(token);locked(observed);
 assert.equal(observed.reason,'SHADOW_OBSERVATION_UNKNOWN');
 assert.equal(observed.shadowMatched,false);
 assert.equal(originalCalls,0,'stale receiver must not invoke pinned method');
 assert.equal(hostileCalls,0);
 assert.equal(observed.authority,'NONE');
 assert.equal(observed.effectDispatched,false);
});

test('selected callable keeps original native receiver identity when metadata remains stable',async()=>{
 let receiver;
 const app=mock(async function selectedNativeInvoke(){
   receiver=this;
   return observation();
 });
 const p=create(app);
 locked(p.publishShadowForFutureTasks());
 const result=await p.probeTask(p.beginTask());locked(result);
 assert.equal(result.shadowMatched,true);
 assert.equal(receiver,app,'original selected native instance receiver preserved');
 assert.equal(result.authority,'NONE');
 assert.equal(result.effectDispatched,false);
});

test('in-place selected metadata drift after snapshot fails closed before invocation',async()=>{
 let invoked=0;
 const app=mock(async()=>{invoked++;return observation()});
 const p=create(app);
 locked(p.publishShadowForFutureTasks());
 const token=p.beginTask();
 app.contractVersions['xdownload.describePolicy']='2.0.0';
 app.functions[0]='nonselected.function';
 const out=await p.probeTask(token);locked(out);
 assert.equal(out.reason,'SHADOW_OBSERVATION_UNKNOWN');
 assert.equal(out.shadowMatched,false);
 assert.equal(invoked,0);
 assert.equal(out.effectDispatched,false);
});
