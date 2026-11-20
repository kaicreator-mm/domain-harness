/** B06-01 / R47: real loopback HTTP Chat / Form native consumption. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {createDisV020InteractionHttpServer} from '../dis-v020-interaction/http-transport.mjs';
const fixture=makeNativeFixture();
const start=f=>loadDisV020Aot(f.artifact,{
 expectedDigest:f.artifact.digest,registry:f.registry,store:new PlainCasDocStore(),
 tenantId:'tenant:b06-http-native'
});
const post=(base,path,data,type)=>fetch(base+path,{
 method:'POST',headers:{'content-type':type},body:data
});
test('B06-01 R47 actual loopback HTTP Form POST uses selected xDownload Interaction and remains unauthorized for Effects',async()=>{
 const f=await fixture,app=await start(f),http=createDisV020InteractionHttpServer(app);
 const origin=await http.listen();
 try{
  const data=new URLSearchParams({requestId:'B06-FORM',url:'https://example.org/file',
   declaredBytes:'512',confirmed:'on'});
  const r=await post(origin,'/interaction/form',data,'application/x-www-form-urlencoded');
  assert.equal(r.status,200);
  const v=await r.json();
  assert.equal(v.kind,'OBSERVATION');assert.equal(v.channel,'form');assert.equal(v.requestId,'B06-FORM');
  assert.equal(v.status,'READY_FOR_KDP');
  assert.equal(v.disposition,'PENDING_AUTHORIZATION');
  assert.equal(v.proposal.url,'https://example.org/file');
  assert.equal(v.proposal.declaredBytes,512);
  assert.equal(v.authority,'NONE');assert.equal(v.permittedEffect,false);
  assert.equal(v.effectDispatched,false);assert.equal(v.evidenceAttested,false);
 }finally{await http.close();app.stop()}
});
test('B06-01 R47 actual loopback Chat JSON POST and Form produce equivalent source-selected structured Intent',async()=>{
 const f=await fixture,app=await start(f),http=createDisV020InteractionHttpServer(app);
 const origin=await http.listen();
 try{
  const a=await post(origin,'/interaction/chat',JSON.stringify({
   requestId:'B06-CHAT',initialMessage:'download https://example.org/file',
   followUpMessage:'bytes 1024 confirm'
  }),'application/json');
  const b=await post(origin,'/interaction/form',new URLSearchParams({
   requestId:'B06-FORM',url:'https://example.org/file',
   declaredBytes:'1024',confirmed:'on'
  }),'application/x-www-form-urlencoded');
  assert.equal(a.status,200);assert.equal(b.status,200);
  const x=await a.json(),y=await b.json();
  assert.equal(x.status,'READY_FOR_KDP');assert.equal(y.status,'READY_FOR_KDP');
  assert.equal(x.proposal.url,y.proposal.url);
  assert.equal(x.proposal.declaredBytes,y.proposal.declaredBytes);
  assert.equal(x.proposal.channel,'chat');assert.equal(y.proposal.channel,'form');
  assert.equal(x.permittedEffect,false);assert.equal(y.permittedEffect,false);
  assert.equal(x.effectDispatched,false);assert.equal(y.effectDispatched,false);
 }finally{await http.close();app.stop()}
});
