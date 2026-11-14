import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from '../../packages/microkernel/dist/index.js';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {buildRealCrossProjectSelection} from './selected-build.mjs';
let cache;
const selected=()=>cache??=(buildRealCrossProjectSelection());
test('R8 canonical BUILD selects byte-locked Tally and xDownload real Business packages',async()=>{
 const {built,origins}=await selected();
 assert.equal(built.formatVersion,'dh.v10.build/1');
 const bs=built.modules.filter(m=>m.role==='business');
 assert.equal(bs.length,3,'orders fixture plus source-real Tally and xDownload');
 assert.ok(bs.some(m=>m.packageId==='business-tally-task-readiness@v2.0.0'));
 assert.ok(bs.some(m=>m.packageId==='business-download@0.2.0-t03'));
 assert.equal(origins.length,3);
 for(const o of origins)assert.ok(built.modules.some(m=>m.packageId===o.packageId));
});
test('R8 canonical BUILD pins actual xDownload K-to-C external-effect route',async()=>{
 const {built}=await selected();
 const route=built.routes.find(r=>r.intentId==='confirmDownload');
 assert.equal(route?.capabilityId,'acquisition');
 assert.equal(route?.operationId,'acquisition.acquire');
 const mod=built.modules.find(m=>m.packageId==='capability-acquisition-stub@0.2.0-t03');
 assert.equal(mod?.externalEffect,true);
 assert.ok(mod.handlers.some(h=>h.operationId==='acquisition.acquire'&&h.handler==='acquire'));
});
test('R8 real BUILD selection is deterministic for exact source-qualified inputs',async()=>{
 const a=(await selected()).built,b=(await buildRealCrossProjectSelection()).built;
 assert.equal(a.subjectDigest,b.subjectDigest);
 assert.deepEqual(a.routes,b.routes);
 assert.deepEqual(a.loadOrder,b.loadOrder);
});
test('R8 actual BUILD refuses a changed Tally Business source with stale digest',async()=>{
 await assert.rejects(buildRealCrossProjectSelection({override:{modules(modules){
  const m=modules.find(m=>m.packageId==='business-tally-task-readiness@v2.0.0');
  m.moduleSource+='\\n// altered between source pin and AOT BUILD';
 }}}),e=>e?.code==='V10_DIGEST_MISMATCH');
});
test('R8 actual BUILD refuses an unselected acquisition handler',async()=>{
 await assert.rejects(buildRealCrossProjectSelection({override:{routes(routes){
  const r=routes.find(r=>r.intentId==='confirmDownload');r.handlerId='unselectedHandler';
 }}}),e=>e?.code==='V10_ROUTE_INVALID');
});
test('R8 actual selected Microkernel loads original Business sources without granting effects',async()=>{
 const {built}=await selected();
 const app=await load(built,{store:new PlainCasDocStore(),tenantId:'tenant:dis-r8-three-source'});
 try{
  assert.deepEqual(Object.keys(app).sort(),['query','send','stop','subscribe']);
  const result=await app.send({
   intentType:'submitQuoteDecisionDynamic',instanceKey:'instance:dis-r8-original',
   messageId:'msg:dis-r8-original',input:{amount:30,requestId:'DIS-R8-ORIGINAL'},
  });
  assert.equal(result.status,'admitted',JSON.stringify(result).slice(0,500));
 }finally{app.stop()}
});
test('R8 Tally source is selected but unbound Claim Function cannot mint KDP admission',async()=>{
 const {built}=await selected();
 assert.equal(built.routes.some(r=>r.intentId==='admitClaimedTask'),false);
 const app=await load(built,{store:new PlainCasDocStore(),tenantId:'tenant:dis-r8-unbound'});
 try{
  let response;
  try{response=await app.send({intentType:'admitClaimedTask',
    instanceKey:'instance:dis-r8-unbound',messageId:'msg:dis-r8-unbound',
    input:{issueRef:'https://github.com/kaicreator-mm/tally/issues/331'}})}
  catch(error){response={status:'error',errorCode:error?.code??'UNSPECIFIED'}}
  assert.notEqual(response?.status,'admitted',
   'Selecting source Business bytes must not expose unselected native Claim route');
 }finally{app.stop()}
});
test('R8 xDownload declared external Effect cannot be called directly through DIS consumer adapter',async()=>{
 const {qualified}=await selected();
 await assert.rejects(qualified.invoke('downloads.acquisition.acquire',{requestId:'x'},{}),
  e=>e?.code==='DIS_EXTERNAL_EFFECT_KDP_REQUIRED');
});
test('R8 Runx remains stateful observer Element, not a fabricated selected Business Policy',async()=>{
 const {qualified,built}=await selected();
 assert.equal(built.modules.some(m=>m.packageId==='runx.agent.presence'),false);
 const observer=await qualified.invoke('runx.agent.presence.createPresenceObserver',
  ()=>'2026-11-08T06:00:00Z');
 assert.equal(observer.latest(),null);
 observer.observe({agent_id:'host-a',agent_incarnation_id:'inc-1',capability:{capability_id:'execute'}},{agent_id:'host-a'});
 assert.equal(observer.latest().agent_incarnation_id,'inc-1');
 assert.equal(Object.hasOwn(observer.latest(),'execution_authorized'),false);
});