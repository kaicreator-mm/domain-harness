import test from 'node:test';
import assert from 'node:assert/strict';
import {buildV10App} from '../../tooling/build/dist/index.js';
import {load} from '../../packages/microkernel/dist/index.js';
import {basicComposition,PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {init as businessInit} from './business-app-init.mjs';
import {makeManifest,compileProjection,createActivation} from './bridge.mjs';
let built;
async function setup(){
 built??=buildV10App(await basicComposition());
 const m=await makeManifest(built),projection=await compileProjection(m,built);
 return {m,projection,activation:createActivation({projection,built,load,store:new PlainCasDocStore(),appInit:businessInit})};
}
const code=c=>e=>e?.code===c;
test('real canonical BUILD emits selected KDP, SDK and Business Package closure',async()=>{
 const {projection}=await setup();
 assert.ok(typeof built.subjectDigest==='string'&&built.subjectDigest.length>=64);
 assert.ok(built.modules.some(x=>x.role==='kernel-primary'));
 assert.ok(built.modules.some(x=>x.role==='standard-primary'));
 assert.ok(built.modules.some(x=>x.role==='business'));
 assert.equal(projection.buildSubject,built.subjectDigest);
});
test('DIS Element.Function projects to actual BUILD-selected intent route',async()=>{
 const {projection}=await setup();
 assert.equal(projection.routes.get('approveQuote').intentType,'submitQuoteDecisionDynamic');
});
test('business ingress is closed before App Init',async()=>{
 const {activation}=await setup();
 await assert.rejects(activation.invoke('approveQuote',{messageId:'msg:early',instanceKey:'instance:early',input:{amount:30,requestId:'R-early'}}),code('APP_NOT_READY'));
 activation.stop();
});
test('real Microkernel load followed by one Business Init opens governed ingress',async()=>{
 const {activation}=await setup();
 try{
  assert.equal((await activation.start()).status,'READY');
  await assert.rejects(activation.start(),code('APP_INIT_REPEATED'));
  const receipt=await activation.invoke('approveQuote',{messageId:'msg:dis-r1',instanceKey:'instance:dis-r1',input:{amount:30,requestId:'DIS-R1'}});
  assert.equal(receipt.status,'admitted',JSON.stringify(receipt).slice(0,1200));
 }finally{activation.stop()}
});
test('real selected KDP denies an incompatible business decision',async()=>{
 const {activation}=await setup();
 try{
  await activation.start();
  let outcome;try{outcome=await activation.invoke('approveQuote',{messageId:'msg:dis-guard',instanceKey:'instance:dis-guard',input:{amount:75,requestId:'DIS-75'}})}catch(e){outcome=e}
  assert.notEqual(outcome?.status,'admitted','guard violation must not yield admitted');
 }finally{activation.stop()}
});
test('failed Business App Init closes real SDK activation and leaves ingress unavailable',async()=>{
 const {projection}=await setup();
 const a=createActivation({projection,built,load,store:new PlainCasDocStore(),appInit:async()=>({status:'BLOCKED'})});
 await assert.rejects(a.start(),code('APP_INIT_BLOCKED'));
 assert.equal(a.state,'FAILED');
 await assert.rejects(a.invoke('approveQuote',{messageId:'msg:bad',instanceKey:'instance:bad',input:{}}),code('APP_NOT_READY'));
 a.stop();
});
test('DEGRADED cannot conceal mandatory ingress',async()=>{
 const {projection}=await setup();
 const a=createActivation({projection,built,load,store:new PlainCasDocStore(),appInit:async()=>({status:'DEGRADED',unavailableOptionalServices:['approveQuote']})});
 await assert.rejects(a.start(),code('APP_INIT_MANDATORY_DEGRADED'));
 a.stop();
});
test('AOT target drift fails closed',async()=>{
 const {m}=await setup();m.target='android';
 await assert.rejects(compileProjection(m,built),code('AOT_TARGET_DRIFT'));
});
test('AOT BUILD identity drift fails closed',async()=>{
 const {m}=await setup();m.subjectDigest='tampered';
 await assert.rejects(compileProjection(m,built),code('AOT_BUILD_IDENTITY_DRIFT'));
});
test('App Init implementation bytes are pinned',async()=>{
 const {m}=await setup();m.init.sourceSha256='tampered';
 await assert.rejects(compileProjection(m,built),code('BUSINESS_INIT_BYTES_DRIFT'));
});
test('undocumented Function cannot become an ingress',async()=>{
 const {m}=await setup();m.ingress=[{id:'unknown',element:'orders.approval',function:'missing'}];
 await assert.rejects(compileProjection(m,built),code('FUNCTION_UNBOUND'));
});
test('unselected Business intent cannot be published as Function',async()=>{
 const {m}=await setup();m.elements[1].functions[0].intentId='notSelected';
 await assert.rejects(compileProjection(m,built),code('FUNCTION_NOT_EXPORTED'));
});
test('Element static dependency cycle fails before load',async()=>{
 const {m}=await setup();m.elements[0].dependencies=['orders.approval'];m.elements[1].dependencies=['orders.app-init'];
 await assert.rejects(compileProjection(m,built),code('ELEMENT_DEP_CYCLE'));
});
test('exactly one Business App Init is required',async()=>{
 const {m}=await setup();m.elements[1].functions.push({id:'otherInit',kind:'init'});
 await assert.rejects(compileProjection(m,built),code('BUSINESS_INIT_NOT_UNIQUE'));
});
test('Element must bind to a selected Business Package',async()=>{
 const {m}=await setup();m.elements[1].packageId='unselected-package';
 await assert.rejects(compileProjection(m,built),code('ELEMENT_PACKAGE_NOT_SELECTED'));
});
test('actual BUILD module bytes are checked, not only declared digest',async()=>{
 const {m}=await setup();const tampered={...built,modules:built.modules.map((p,i)=>i===0?{...p,moduleSource:p.moduleSource+'\n// tampered'}:p)};
 await assert.rejects(compileProjection(m,tampered),code('AOT_MODULE_BYTES_DRIFT'));
});
