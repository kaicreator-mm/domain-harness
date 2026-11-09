/** B06-02 / R48: real loopback HTTP input and unauthorized action defenses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {createDisV020InteractionHttpServer} from '../dis-v020-interaction/http-transport.mjs';
const fixture=makeNativeFixture();
const start=f=>loadDisV020Aot(f.artifact,{
 expectedDigest:f.artifact.digest,registry:f.registry,store:new PlainCasDocStore(),tenantId:'tenant:b06-http-negative'
});
const post=(origin,path,body,mime,headers={})=>fetch(origin+path,{
 method:'POST',headers:{'content-type':mime,...headers},body
});
test('B06-02 R48 HTTP rejects forged Effect route, non-POST and unsupported mime before native KDP ingress',async()=>{
 const f=await fixture,app=await start(f),http=createDisV020InteractionHttpServer(app);
 const origin=await http.listen();
 try{
  const get=await fetch(origin+'/interaction/chat');
  assert.equal(get.status,405);
  assert.equal((await get.json()).error,'DIS_HTTP_METHOD');
  const effect=await post(origin,'/interaction/effect','{}','application/json');
  assert.equal(effect.status,404);
  assert.equal((await effect.json()).error,'DIS_HTTP_ROUTE');
  const content=await post(origin,'/interaction/chat','{}','text/plain');
  assert.equal(content.status,400);
  assert.equal((await content.json()).error,'DIS_HTTP_CONTENT_TYPE');
  const credentials=await post(origin,'/interaction/chat','{}','application/json',{authorization:'Bearer forged'});
  assert.equal(credentials.status,400);
  assert.equal((await credentials.json()).error,'DIS_HTTP_CREDENTIALS');
 }finally{await http.close();app.stop()}
});
test('B06-02 R48 duplicate Form values and forged Chat authorization cannot reach selected Interaction',async()=>{
 const f=await fixture,app=await start(f),http=createDisV020InteractionHttpServer(app);
 const origin=await http.listen();
 try{
  const duplicated=new URLSearchParams({requestId:'R48',url:'https://example.org/file',
   declaredBytes:'512',confirmed:'on'});
  duplicated.append('declaredBytes','1024');
  const dup=await post(origin,'/interaction/form',duplicated,'application/x-www-form-urlencoded');
  assert.equal(dup.status,400);assert.equal((await dup.json()).error,'DIS_HTTP_INVALID');
  const forged=await post(origin,'/interaction/chat',JSON.stringify({
   requestId:'R48',initialMessage:'download https://example.org/file',
   followUpMessage:'bytes 512 confirm',grantEffect:true
  }),'application/json');
  assert.equal(forged.status,400);assert.equal((await forged.json()).error,'DIS_HTTP_INVALID');
  const bad=await post(origin,'/interaction/chat','{not json','application/json');
  assert.equal(bad.status,400);assert.equal((await bad.json()).error,'DIS_HTTP_INVALID');
 }finally{await http.close();app.stop()}
});
test('B06-02 R48 oversized body and credential-bearing URL fail closed over real network',async()=>{
 const f=await fixture,app=await start(f),http=createDisV020InteractionHttpServer(app);
 const origin=await http.listen();
 try{
  const huge=await post(origin,'/interaction/chat','x'.repeat(4200),'application/json');
  assert.equal(huge.status,413);
  assert.equal((await huge.json()).error,'DIS_HTTP_TOO_LARGE');
  const denied=await post(origin,'/interaction/form',new URLSearchParams({
   requestId:'R48-BLOCKED',url:'https://example.org/file?token=secret',
   declaredBytes:'512',confirmed:'on'
  }),'application/x-www-form-urlencoded');
  assert.equal(denied.status,200);
  const body=await denied.json();
  assert.equal(body.status,'REJECTED');assert.equal(body.authority,'NONE');
  assert.equal(body.effectDispatched,false);assert.equal(body.permittedEffect,false);
 }finally{await http.close();app.stop()}
});
