/** B02-03 / R37: source-selected interaction negative contract, no effect. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {chatInitial,chatFollowUp,formInitial,formFollowUp,
 cliInitial,cliFollowUp,consumeDownloadSession} from '../dis-v020-interaction/channel-adapters.mjs';
const fixture=makeNativeFixture(),reject=code=>e=>e?.code===code;
const open=f=>loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,registry:f.registry,
 store:new PlainCasDocStore(),tenantId:'tenant:b02-native-channel-security'});

test('B02-03 R37 selected Interaction and its governed Effect bind to distinct native Function authorities',async()=>{
 const f=await fixture,q=qualifyDisV020Artifact(f.artifact),app=await open(f);
 try{
  for(const id of ['xdownload.interaction.inspect','xdownload.interaction.confirm']){
   const x=q.functions.get(id);
   assert.equal(x.element.id,'xdownload.interaction');
   assert.equal(x.definition.effect,'none');
   assert.equal(x.definition.binding.type,'local');
   assert.equal(x.definition.binding.sourceId,'xdownload-interaction');
  }
  const effect=q.functions.get('xdownload.confirmDownload');
  assert.equal(effect.element.id,'xdownload.acquire');
  assert.equal(effect.definition.binding.type,'kdp-intent');
  assert.equal(effect.definition.effect,'governed');
  const {final}=await consumeDownloadSession(app,{
   initial:chatInitial('download https://example.org/file','B02-R37'),
   followUp:chatFollowUp('bytes 1048576 confirm')
  });
  assert.equal(final.disposition,'PENDING_AUTHORIZATION');
  assert.equal(final.authority,'NONE');
  assert.equal(final.value.permittedEffect,false);
  assert.equal(final.value.effectDispatched,false);
 }finally{app.stop()}
});
test('B02-03 R37 private token URL is rejected through all three native channels without Effect ingress',async()=>{
 const f=await fixture,app=await open(f);
 const url='https://example.org/file?token=secret';
 const rows=[
  {initial:chatInitial('download '+url,'R37-CHAT'),followUp:chatFollowUp('bytes 512 confirm')},
  {initial:formInitial(new URLSearchParams({url}),'R37-FORM'),followUp:formFollowUp(new URLSearchParams({declaredBytes:'512',confirmed:'on'}))},
  {initial:cliInitial(['download',url],'R37-CLI'),followUp:cliFollowUp(['--bytes','512','--confirm'])}
 ];
 try{
  for(const x of rows){
   const {inspected,final}=await consumeDownloadSession(app,x);
   assert.equal(inspected.value.status,'REJECTED');
   assert.equal(inspected.authority,'NONE');
   assert.equal(inspected.value.effectDispatched,false);
   assert.equal(final,null);
  }
 }finally{app.stop()}
});
test('B02-03 R37 oversized confirmed intent and invented authorization are rejected before KDP',async()=>{
 const f=await fixture,app=await open(f);
 try{
  const {final}=await consumeDownloadSession(app,{
   initial:cliInitial(['download','https://example.org/file'],'R37-BYTES'),
   followUp:cliFollowUp(['--bytes','1048577','--confirm'])
  });
  assert.equal(final.value.status,'REJECTED');
  assert.equal(final.disposition,'FAILED');
  assert.equal(final.authority,'NONE');
  const forged=await app.invoke('xdownload.interaction.confirm',{
   draft:{proposal:{channel:'cli',requestId:'R37-FORGED',url:'https://example.org/file'},status:'READY',authority:'KDP'},
   answers:{declaredBytes:512,grantEffect:true},confirmed:true
  });
  assert.equal(forged.value.status,'REJECTED');
  assert.equal(forged.authority,'NONE');
  assert.equal(forged.value.effectDispatched,false);
 }finally{app.stop()}
});
test('B02-03 R37 native SDK stop rejects further interaction with no hidden auto-resume',async()=>{
 const f=await fixture,app=await open(f);
 app.stop();
 await assert.rejects(consumeDownloadSession(app,{
  initial:chatInitial('download https://example.org/file','R37-STOP'),
  followUp:chatFollowUp('bytes 512 confirm')
 }),reject('DIS_APP_NOT_READY'));
 await assert.rejects(app.invoke('xdownload.confirmDownload',{}),reject('DIS_APP_NOT_READY'));
});
