/**
 * B02-02 / R36 native transport adapter parity, bounded to UI-neutral
 * Chat text / HTML form fields / CLI argv; no real web UI is claimed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {
 chatInitial,chatFollowUp,formInitial,formFollowUp,cliInitial,cliFollowUp,
 consumeDownloadSession
} from '../dis-v020-interaction/channel-adapters.mjs';
const fixture=makeNativeFixture(),reject=code=>e=>e?.code===code;
const open=f=>loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,registry:f.registry,
 store:new PlainCasDocStore(),tenantId:'tenant:b02-interaction-transport'});
const channels=(url,bytes,confirmation,id)=>[
 {name:'chat',initial:chatInitial('download '+url,id),next:chatFollowUp('bytes '+bytes+(confirmation?' confirm':''))},
 {name:'form',initial:formInitial(new URLSearchParams({url}),id),next:formFollowUp(new URLSearchParams({declaredBytes:String(bytes),...(confirmation?{confirmed:'on'}:{})}))},
 {name:'cli',initial:cliInitial(['download',url],id),next:cliFollowUp(['--bytes',String(bytes),...(confirmation?['--confirm']:[])])}
];
test('B02-02 R36 Chat Form and CLI real native consumers converge on the same authorized-by-none structured Intent',async()=>{
 const f=await fixture,app=await open(f);
 try{
  for(const bytes of [512,1048576]){
   for(const ch of channels('https://example.org/media.mp4',bytes,true,'B02-R36')){
    const result=await consumeDownloadSession(app,{initial:ch.initial,followUp:ch.next});
    assert.equal(result.inspected.kind,'OBSERVATION');
    assert.equal(result.inspected.disposition,'NEEDS_INPUT');
    assert.equal(result.final.kind,'OBSERVATION');
    assert.equal(result.final.disposition,'PENDING_AUTHORIZATION');
    assert.equal(result.final.value.status,'READY_FOR_KDP');
    assert.equal(result.final.value.prerequisite,'A_SEPARATE_SELECTED_KDP_INTENT_CALL_IS_REQUIRED');
    assert.equal(result.final.value.proposal.channel,ch.name);
    assert.equal(result.final.value.proposal.requestId,'B02-R36');
    assert.equal(result.final.value.proposal.url,'https://example.org/media.mp4');
    assert.equal(result.final.value.proposal.declaredBytes,bytes);
    assert.equal(result.final.authority,'NONE');
    assert.equal(result.final.value.permittedEffect,false);
    assert.equal(result.final.value.effectDispatched,false);
    assert.equal(result.final.evidence.attested,false);
   }
  }
 }finally{app.stop()}
});
test('B02-02 R36 no confirmation in any channel remains pending and never starts a KDP Effect',async()=>{
 const f=await fixture,app=await open(f);
 try{
  for(const ch of channels('https://example.org/media.mp4',1024,false,'B02-NO-CONFIRM')){
   const {final}=await consumeDownloadSession(app,{initial:ch.initial,followUp:ch.next});
   assert.equal(final.value.status,'AWAITING_CONFIRMATION');
   assert.equal(final.disposition,'NEEDS_CONFIRMATION');
   assert.equal(final.authority,'NONE');
   assert.equal(final.value.effectDispatched,false);
  }
 }finally{app.stop()}
});
test('B02-02 R36 all adapters refuse invented execution or ambiguous repeated Form fields before native dispatch',()=>{
 assert.throws(()=>chatInitial('execute https://example.org/media.mp4','R36'),reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>chatFollowUp('bytes 0 confirm'),reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>formInitial(new URLSearchParams('url=https%3A%2F%2Fexample.org%2Fa&url=https%3A%2F%2Fexample.org%2Fb'),'R36'),reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>formFollowUp(new URLSearchParams('declaredBytes=512&declaredBytes=1024&confirmed=on')),reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>cliInitial(['download','https://example.org/a','--effect'],'R36'),reject('DIS_ADAPTER_INVALID'));
 assert.throws(()=>cliFollowUp(['--bytes','512','--execute']),reject('DIS_ADAPTER_INVALID'));
});
