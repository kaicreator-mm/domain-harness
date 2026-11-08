/**
 * DIS v0.2.0 real-seam demo. Imports committed KDP + Microkernel SDK.
 * The selected K readAuthorityView is a fixture here. The existing C01
 * assembly regression exercises the REAL selected-K authority.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MODULE_ID,PACKAGE_KIND,ABI_VERSION,ENDPOINTS,createOccurrenceRuntime}
  from '../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs';
import {load} from '../../packages/microkernel/dist/index.js';
import {dispatchThroughExternalEffectGate,normalizeExternalEffectEnvelope}
  from '../../packages/microkernel/dist/internal/external-effect.js';

const keys={permit:'p',journal:'j',fence:'f',dispatchClaim:'d'};
const attest=()=>({effectPermit:{effectId:'effect-1',durableControlTurnId:'turn-1',businessPackageId:'business-1',keys}});
const authorized={ok:true,effectId:'effect-1',durableControlTurnId:'turn-1',attempt:1,awaitPolicy:'terminal'};
const deps=(view,more={})=>({
  docs:{get:more.get??(async()=>({value:{},revision:1}))},
  readAuthorityView:view,nowIso:()=>new Date('2026-11-08T00:00:00Z').toISOString(),
  onRefusal:more.onRefusal??(()=>{}),onDispatch:more.onDispatch??(()=>{})
});
const request=(invoke,claim=attest())=>({
  capabilityId:'media.extract',operationId:'artifact.write',
  payload:{demoOnly:true},attest:claim,invoke
});
const code=expected=>e=>e?.code===expected;
const okEnvelope={phase:'terminal',externalRef:'demo-ref',outcome:{ok:true,output:'ok'}};

test('real KDP selected ABI is present',()=>{
  assert.equal(PACKAGE_KIND,'kernel');
  assert.equal(ABI_VERSION,'v08-kernel-abi/1');
  assert.equal(typeof MODULE_ID,'string');
  assert.equal(ENDPOINTS.some(x=>x.kind==='occurrence-runtime'),true);
  assert.equal(typeof createOccurrenceRuntime,'function');
});
test('real Microkernel public SDK facade is exported',()=>{
  assert.equal(typeof load,'function');
});
test('real gate validates phase envelopes',()=>{
  assert.equal(normalizeExternalEffectEnvelope(okEnvelope).phase,'terminal');
  assert.throws(()=>normalizeExternalEffectEnvelope({phase:'accepted',externalRef:'x',outcome:{ok:true}}),code('V10_EXTERNAL_ENVELOPE_INVALID'));
});
test('missing K permit means zero native file effects',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dis-denied-'));const path=join(dir,'effect');
  let calls=0;const claim={};
  try{
    await assert.rejects(dispatchThroughExternalEffectGate(
      deps(async()=>authorized),
      request(async()=>{calls++;await writeFile(path,'not allowed');return okEnvelope},claim)
    ),code('V10_EFFECT_PERMIT_REQUIRED'));
    assert.equal(calls,0);
    assert.equal(claim.preHandlerRefusal,'V10_EFFECT_PERMIT_REQUIRED');
    await assert.rejects(stat(path),e=>e.code==='ENOENT');
  }finally{await rm(dir,{recursive:true,force:true})}
});
test('selected K has no authority view => zero adapter dispatch',async()=>{
  let calls=0;
  await assert.rejects(dispatchThroughExternalEffectGate(
    deps(undefined),request(async()=>{calls++;return okEnvelope})
  ),code('V10_EFFECT_PERMIT_REQUIRED'));
  assert.equal(calls,0);
});
test('K revocation denies even a syntactically valid model proposal',async()=>{
  let calls=0;const denied=[];
  await assert.rejects(dispatchThroughExternalEffectGate(
    deps(async()=>({ok:false,code:'K_EFFECT_REVOKED',message:'no current K permit'}),{onRefusal:c=>denied.push(c)}),
    request(async()=>{calls++;return okEnvelope})
  ),code('K_EFFECT_REVOKED'));
  assert.equal(calls,0);assert.deepEqual(denied,['K_EFFECT_REVOKED']);
});
test('real gate passes exact business namespace to selected K',async()=>{
  let dispatched=0;const seen=[];
  const d=deps(async({get,attest:claim,operationId})=>{
    assert.equal(claim.effectPermit.businessPackageId,'business-1');
    assert.equal(operationId,'artifact.write');
    const receipt=await get('p');assert.equal(receipt.revision,7);
    return authorized;
  },{get:async(biz,key)=>{seen.push([biz,key]);return {value:{},revision:7}}});
  const result=await dispatchThroughExternalEffectGate(d,request(async()=>{dispatched++;return okEnvelope}));
  assert.equal(result.phase,'terminal');
  assert.equal(dispatched,1);
  assert.deepEqual(seen,[['business-1','p']]);
});
test('trusted K view allows a real bounded temporary-file effect',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dis-allowed-'));const path=join(dir,'effect');
  let calls=0;
  try{
    const result=await dispatchThroughExternalEffectGate(
      deps(async()=>authorized),
      request(async()=>{calls++;await writeFile(path,'test-only');return okEnvelope})
    );
    assert.equal(result.outcome.ok,true);
    assert.equal(calls,1);
    assert.equal(await readFile(path,'utf8'),'test-only');
  }finally{await rm(dir,{recursive:true,force:true})}
});
test('accepted is NOT a terminal success; no false zero-effect proof',async()=>{
  const claim=attest();let calls=0;
  await assert.rejects(dispatchThroughExternalEffectGate(
    deps(async()=>authorized),
    request(async()=>{calls++;return {phase:'accepted',externalRef:'still-running'}},claim)
  ),code('V10_EXTERNAL_PENDING'));
  assert.equal(calls,1);
  assert.equal(claim.preHandlerRefusal,undefined);
});
test('after dispatch error is UNKNOWN, not pre-handler refusal',async()=>{
  const claim=attest();let calls=0;
  await assert.rejects(dispatchThroughExternalEffectGate(
    deps(async()=>authorized),
    request(async()=>{calls++;throw new Error('uncertain dispatch')},claim)
  ),/uncertain dispatch/);
  assert.equal(calls,1);assert.equal(claim.preHandlerRefusal,undefined);
});
test('malformed permit address is refused before any K read or effect',async()=>{
  const claim=attest();claim.effectPermit.keys={...keys,journal:''};
  let read=0;let calls=0;
  await assert.rejects(dispatchThroughExternalEffectGate(
    deps(async()=>{read++;return authorized}),
    request(async()=>{calls++;return okEnvelope},claim)
  ),code('V10_EFFECT_PERMIT_REQUIRED'));
  assert.equal(read,0);assert.equal(calls,0);
});
