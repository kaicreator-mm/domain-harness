/** R80 O1 async-liveness repair: standalone native Node regression (no fixture credentials). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeO1BoundedHarness} from './o1-bounded-harness.mjs';
const source={sourceId:'xdownload-business',sha256:'a'.repeat(64),gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'};
const observation=()=>({kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',contractVersion:'1.0.0',value:{domainId:'downloads'},evidence:{source,attested:false}});
const app=invoke=>({functions:['xdownload.describePolicy'],contractVersions:{'xdownload.describePolicy':'1.0.0'},invoke});
const never=()=>new Promise(()=>{});
const watchdog=async (work)=> {
 let timer;
 try{return await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve('EXTERNAL_WATCHDOG_EXPIRED'),550)})]);}
 finally{clearTimeout(timer);}
};
const provider=(propose)=>({id:'fixture-o1-provider',propose});
const assertUnknown=(r,reason)=>{
 assert.notEqual(r,'EXTERNAL_WATCHDOG_EXPIRED','O1 run must not hang');
 assert.equal(r.reason,reason);
 assert.equal(r.disposition,'UNKNOWN');assert.equal(r.authority,'NONE');
 assert.equal(r.qualified,false);assert.equal(r.effectDispatched,false);
};
test('R80 selected native observation Promise without settlement ends UNKNOWN on deadline',async()=>{
 const h=makeO1BoundedHarness({app:app(never),maxWaitMs:35});
 assertUnknown(await watchdog(h.run('policy')),'NATIVE_OBSERVATION_TIMEOUT');
 assert.equal(h.remaining(),1);
});
test('R80 selected provider Promise without settlement ends UNKNOWN, burns one reserved call',async()=>{
 let calls=0;
 const h=makeO1BoundedHarness({app:app(async()=>observation()),provider:provider(()=>{calls++;return never();}),maxWaitMs:35});
 assertUnknown(await watchdog(h.run('advisory')),'PROVIDER_TIMEOUT');
 assert.equal(h.remaining(),0);assert.equal(calls,1);
 assertUnknown(await watchdog(h.run('advisory')),'BUDGET_EXHAUSTED');
 assert.equal(calls,1);
});
test('R80 concurrent advisory never double spends and fast native path still works',async()=>{
 let calls=0;
 const h=makeO1BoundedHarness({app:app(async()=>observation()),provider:provider(()=>{calls++;return never();}),maxCalls:1,maxWaitMs:35});
 const r=await watchdog(Promise.all([h.run('advisory'),h.run('advisory')]));
 assert.notEqual(r,'EXTERNAL_WATCHDOG_EXPIRED');
 assert.deepEqual(r.map(x=>x.reason).sort(),['BUDGET_EXHAUSTED','PROVIDER_TIMEOUT']);
 assert.equal(calls,1);assert.equal(h.remaining(),0);
 const fast=makeO1BoundedHarness({app:app(async()=>observation()),provider:provider(async()=>({suggestion:'candidate only'})),maxWaitMs:35});
 const p=await fast.run('policy');assert.equal(p.disposition,'OBSERVED');assert.equal(p.qualified,false);
 assertUnknown(await fast.run('advisory'),'MODEL_PROPOSAL_NOT_DOMAIN_TRUTH');
});
test('R80 exceptions remain UNKNOWN; invalid and unbounded deadlines fail configuration',async()=>{
 const fail=makeO1BoundedHarness({app:app(async()=>{throw Error('offline')}),maxWaitMs:35});
 assertUnknown(await fail.run('policy'),'NATIVE_OBSERVATION_UNAVAILABLE');
 const broken=makeO1BoundedHarness({app:app(async()=>observation()),provider:provider(async()=>{throw Error('broken')}),maxWaitMs:35});
 assertUnknown(await broken.run('advisory'),'PROVIDER_ERROR');
 for(const bad of [0,-1,1.5,NaN,60001,Infinity,'35',null]){
  assert.throws(()=>makeO1BoundedHarness({app:app(async()=>observation()),maxWaitMs:bad}),e=>e?.code==='O1_CONFIGURATION_INVALID');
 }
});
test('R80 late provider resolution is never returned as authorized outcome',async()=>{
 let resolveLate;
 const h=makeO1BoundedHarness({app:app(async()=>observation()),provider:provider(()=>new Promise(resolve=>{resolveLate=resolve;})),maxWaitMs:35});
 assertUnknown(await watchdog(h.run('advisory')),'PROVIDER_TIMEOUT');
 resolveLate({suggestion:'PASS',effectDispatched:true,authority:'KDP'});
 await Promise.resolve();
 assert.equal(h.remaining(),0);
});
