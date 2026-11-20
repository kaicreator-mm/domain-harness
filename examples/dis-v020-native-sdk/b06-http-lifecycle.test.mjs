/** B06-03 / R49: concurrency isolation and stopped KDP ingress over HTTP. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {createDisV020InteractionHttpServer} from '../dis-v020-interaction/http-transport.mjs';
const fixture=makeNativeFixture();
const start=f=>loadDisV020Aot(f.artifact,{
 expectedDigest:f.artifact.digest,registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:b06-http-lifecycle'
});
const post=(origin,path,body,type)=>fetch(origin+path,{
 method:'POST',headers:{'content-type':type},body
});
test('B06-03 R49 simultaneous independent HTTP Chat/Form sessions cannot mix original selected Business intents',async()=>{
 const f=await fixture,app=await start(f),http=createDisV020InteractionHttpServer(app);
 const origin=await http.listen();
 try{
  const work=[1,2,3,4,5,6].map(i=>{
   const url='https://example.org/file'+i,requestId='R49-'+i;
   return i%2?post(origin,'/interaction/chat',JSON.stringify({
    requestId,initialMessage:'download '+url,followUpMessage:'bytes '+(i*100)+' confirm'
   }),'application/json'):post(origin,'/interaction/form',new URLSearchParams({
    requestId,url,declaredBytes:String(i*100),confirmed:'on'
   }),'application/x-www-form-urlencoded');
  });
  const responses=await Promise.all(work);
  const data=await Promise.all(responses.map(x=>x.json()));
  assert.ok(responses.every(x=>x.status===200));
  for(let i=1;i<=6;i++){
   const x=data[i-1];
   assert.equal(x.requestId,'R49-'+i);
   assert.equal(x.proposal.requestId,'R49-'+i);
   assert.equal(x.proposal.url,'https://example.org/file'+i);
   assert.equal(x.proposal.declaredBytes,i*100);
   assert.equal(x.channel,i%2?'chat':'form');
   assert.equal(x.status,'READY_FOR_KDP');
   assert.equal(x.authority,'NONE');
   assert.equal(x.permittedEffect,false);assert.equal(x.effectDispatched,false);
  }
 }finally{await http.close();app.stop()}
});
test('B06-03 R49 no confirmation stays pending and cannot transform into KDP Effect permission',async()=>{
 const f=await fixture,app=await start(f),http=createDisV020InteractionHttpServer(app);
 const origin=await http.listen();
 try{
  const response=await post(origin,'/interaction/chat',JSON.stringify({
   requestId:'R49-PENDING',initialMessage:'download https://example.org/file',
   followUpMessage:'bytes 512'
  }),'application/json');
  assert.equal(response.status,200);
  const x=await response.json();
  assert.equal(x.status,'AWAITING_CONFIRMATION');
  assert.equal(x.disposition,'NEEDS_CONFIRMATION');
  assert.equal(x.authority,'NONE');assert.equal(x.effectDispatched,false);
  assert.equal(x.permittedEffect,false);
 }finally{await http.close();app.stop()}
});
test('B06-03 R49 actual SDK STOP prevents further HTTP Function ingress without hidden Effect dispatch',async()=>{
 const f=await fixture,app=await start(f),http=createDisV020InteractionHttpServer(app);
 const origin=await http.listen();
 try{
  app.stop();
  const response=await post(origin,'/interaction/chat',JSON.stringify({
   requestId:'R49-STOPPED',initialMessage:'download https://example.org/file',
   followUpMessage:'bytes 512 confirm'
  }),'application/json');
  assert.equal(response.status,503);
  const x=await response.json();assert.equal(x.error,'DIS_APP_NOT_READY');
 }finally{await http.close();app.stop()}
});
