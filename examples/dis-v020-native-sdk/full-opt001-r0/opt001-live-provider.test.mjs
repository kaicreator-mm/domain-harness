/**
 * OPT-001 R211 LIVE suite: real AOT-selected bounded Provider against the
 * real DeepSeek endpoint (https://api.deepseek.com, OpenAI-compatible
 * chat/completions) using the DEEPSEEK_API_KEY environment credential.
 *
 * Honesty rules enforced here:
 * - Missing credential is a LOUD red failure (explicit console.error +
 *   exit 1), never a silent skip. In CI the repo secret must be injected.
 * - Every network call is bounded (per-call deadline via AbortController,
 *   total request budget, retries only on transient unavailability).
 * - Model output is consumed as DATA ONLY. The assertions below check the
 *   bounded-invocation CONTRACT (response received, budget/trace fields,
 *   UNKNOWN/NONE invariants), never what the model "said": no semantic
 *   PASS, permission, Effect, state fact or qualification is minted from
 *   any model output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from '../native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../../tests/assembly/helpers-v010.ts';
import {makeO1BoundedHarness} from '../o1-bounded-harness.mjs';
import {makeOpt001ProviderBinding,resolveOpt001Credential,
 createOpt001BoundedProvider} from './opt001-aot-bounded-provider.mjs';

if(typeof process.env.DEEPSEEK_API_KEY!=='string'||
  process.env.DEEPSEEK_API_KEY.length===0){
 console.error('OPT001_LIVE_PROVIDER_RED: DEEPSEEK_API_KEY is not set. '+
  'Live OPT-001 evidence cannot run: the credential (Woodpecker repo '+
  'secret in CI, shell env locally) is missing. Failing loudly instead of '+
  'silently skipping.');
 process.exit(1);
}

const CREDENTIAL=process.env.DEEPSEEK_API_KEY;
const fixture=makeNativeFixture();
const selectedRequest=()=>Object.freeze({purpose:'advisory',
 sourceFunction:'xdownload.describePolicy',observedDomain:'downloads'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(pred,ms=8000)=>{
 const t0=Date.now();
 while(!pred()){
  if(Date.now()-t0>ms)throw new Error('waitFor budget exceeded');
  await sleep(20);
 }
};
const watchdog=async(work,ms=60000)=>{
 let timer;
 try{return await Promise.race([work,
  new Promise(resolve=>{timer=setTimeout(()=>resolve('WATCHDOG_EXPIRED'),ms)})]);}
 finally{clearTimeout(timer);}
};
const liveBinding=async extra=>{
 const f=await fixture;
 return makeOpt001ProviderBinding({aotDigest:f.artifact.digest,...extra});
};
async function withNative(visit){
 const f=await fixture;
 const app=await loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:opt001-live-r211'});
 try{return await visit(app,f)}finally{app.stop()}
}
/**
 * Live retry policy: at most 3 attempts total, and only for transient
 * "no usable data this attempt" outcomes (UNAVAILABLE transport, unusable
 * model text). These retries never touch authority semantics and each
 * attempt uses a fresh provider (bounded budget per attempt).
 */
async function attemptLiveAdvisory(app,digest){
 const binding=await liveBinding({maxRequests:2,maxOutputTokens:48,
  maxWaitMs:20000});
 const credential=resolveOpt001Credential(binding);
 assert.equal(binding.credentialRef,'env:DEEPSEEK_API_KEY');
 const provider=createOpt001BoundedProvider({binding,credential});
 const harness=makeO1BoundedHarness({app,provider,
  selectedProviderId:binding.providerId,maxCalls:1,maxWaitMs:30000,enabled:true});
 const policy=await harness.run('policy');
 assert.equal(policy.disposition,'OBSERVED');
 assert.equal(policy.authority,'NONE');
 const proposal=await harness.run('advisory');
 return {binding,provider,proposal,transient:proposal.reason==='PROVIDER_ERROR'};
}
const OK_KEYS=['authority','dataOnly','disposition','effectDispatched',
 'finishReason','httpStatus','ignoredDirectives','model',
 'normalizedWhitespace','phase','qualified','reason','status','suggestion',
 'truncated','usage'];

test('OPT001 live: real DeepSeek bounded advisory through the real AOT harness',async()=>{
 await withNative(async app=>{
  const f=await fixture;
  let last=null;
  for(let attempt=1;attempt<=3;attempt++){
   last=await watchdog(attemptLiveAdvisory(app,f.artifact.digest),45000);
   assert.notEqual(last,'WATCHDOG_EXPIRED','live attempt must stay bounded');
   if(!last.transient)break;
   if(attempt<3)await sleep(1500);
  }
  const {binding,provider,proposal}=last;
  assert.equal(proposal.reason,'MODEL_PROPOSAL_NOT_DOMAIN_TRUTH');
  assert.equal(proposal.disposition,'UNKNOWN');
  assert.equal(proposal.authority,'NONE');
  assert.equal(proposal.effectDispatched,false);
  assert.equal(proposal.qualified,false);
  assert.equal(typeof proposal.suggestion,'string');
  assert.ok(proposal.suggestion.length>=1&&proposal.suggestion.length<=160,
   'suggestion is bounded single-line data');
  const trace=provider.trace();
  assert.equal(trace.length,1);
  assert.equal(trace[0].status,'OK');
  assert.equal(trace[0].aotDigest,f.artifact.digest);
  assert.equal(trace[0].targetFunction,'xdownload.describePolicy');
  assert.equal(trace[0].dataOnly,true);
  // The binding pins the REQUESTED model (deepseek-chat); the response
  // `model` field is provider-side data about what actually served it
  // (DeepSeek may route to a current backing model) and is never authority.
  assert.ok(trace[0].model.startsWith('deepseek-'),
   'serving model data comes from the pinned DeepSeek endpoint');
  assert.equal(typeof trace[0].durationMs,'number');
  assert.ok(trace[0].durationMs>0,'real latency recorded');
  assert.ok(trace[0].usage!==null&&trace[0].usage.totalTokens>0,
   'real token usage recorded');
  const direct=await watchdog(provider.invokeBounded(selectedRequest()));
  assert.notEqual(direct,'WATCHDOG_EXPIRED');
  assert.equal(direct.status,'OK');
  assert.deepEqual(Object.keys(direct).sort(),OK_KEYS);
  assertDataOnly(direct);
  assert.ok(direct.model.startsWith('deepseek-'),
   'serving model data comes from the pinned DeepSeek endpoint');
  assert.ok(direct.usage!==null&&direct.usage.totalTokens>0);
  const exhausted=await provider.invokeBounded(selectedRequest());
  assert.equal(exhausted.status,'BUDGET_EXHAUSTED');
  assert.deepEqual(exhausted.budget,{used:2,limit:2});
  assert.equal(provider.stats().admitted,2);
  const serialized=JSON.stringify({proposal,trace,direct,exhausted,
   binding,stats:provider.stats()});
  assert.equal(serialized.includes(CREDENTIAL),false,
   'credential must never leak into outcomes, trace or manifest');
  function assertDataOnly(x){
   assert.equal(x.authority,'NONE');
   assert.equal(x.effectDispatched,false);
   assert.equal(x.qualified,false);
   assert.equal(x.dataOnly,true);
   assert.equal(x.disposition,'UNKNOWN');
  }
 });
});

test('OPT001 live: invalid credential is an explicit real 401 rejection',async()=>{
 const binding=await liveBinding({maxRequests:1,maxWaitMs:20000});
 const wrong='sk-lane-o1-opt001-invalid-credential-negative-0001';
 assert.notEqual(wrong,CREDENTIAL);
 const p=createOpt001BoundedProvider({binding,credential:wrong});
 const t0=Date.now();
 const outcome=await watchdog(p.invokeBounded(selectedRequest()));
 assert.notEqual(outcome,'WATCHDOG_EXPIRED');
 assert.equal(outcome.status,'REJECTED');
 assert.equal(outcome.reason,'CREDENTIAL_REJECTED');
 assert.equal(outcome.httpStatus,401);
 assert.equal(outcome.authority,'NONE');
 assert.equal(outcome.effectDispatched,false);
 assert.equal(outcome.qualified,false);
 assert.equal(outcome.dataOnly,true);
 assert.ok(Date.now()-t0<25000,'401 rejection must be bounded');
 assert.equal(p.stats().credentialRejected,1);
 assert.equal(p.trace()[0].reason,'CREDENTIAL_REJECTED');
 const serialized=JSON.stringify({outcome,trace:p.trace(),stats:p.stats()});
 assert.equal(serialized.includes(CREDENTIAL),false);
});

test('OPT001 live: 1ms deadline aborts a real request into explicit TIMEOUT',async()=>{
 const binding=await liveBinding({maxRequests:1,maxWaitMs:1});
 const credential=resolveOpt001Credential(binding);
 const p=createOpt001BoundedProvider({binding,credential});
 const t0=Date.now();
 const outcome=await watchdog(p.invokeBounded(selectedRequest()));
 assert.notEqual(outcome,'WATCHDOG_EXPIRED');
 assert.equal(outcome.status,'TIMEOUT');
 assert.equal(outcome.reason,'DEADLINE');
 assert.equal(outcome.authority,'NONE');
 assert.equal(outcome.effectDispatched,false);
 assert.equal(outcome.qualified,false);
 assert.equal(outcome.dataOnly,true);
 assert.ok(Date.now()-t0<5000,'deadline outcome must be immediate');
 assert.equal(p.stats().timeout,1);
 assert.equal(p.trace()[0].status,'TIMEOUT');
});

test('OPT001 live: cancelAll aborts a real in-flight request into clean CANCELED',async()=>{
 const binding=await liveBinding({maxRequests:1,maxWaitMs:30000});
 const credential=resolveOpt001Credential(binding);
 const p=createOpt001BoundedProvider({binding,credential});
 const pending=p.invokeBounded(selectedRequest());
 await waitFor(()=>p.stats().inFlight===1);
 const t0=Date.now();
 assert.equal(p.cancelAll(),1);
 const outcome=await watchdog(pending,15000);
 assert.notEqual(outcome,'WATCHDOG_EXPIRED');
 assert.equal(outcome.status,'CANCELED');
 assert.equal(outcome.authority,'NONE');
 assert.equal(outcome.effectDispatched,false);
 assert.equal(outcome.qualified,false);
 assert.equal(outcome.dataOnly,true);
 assert.ok(Date.now()-t0<10000,'cancel must be bounded');
 assert.equal(p.stats().canceled,1);
 assert.equal(p.trace()[0].status,'CANCELED');
});

test('OPT001 live: absent credential env is an explicit NO_CREDENTIAL rejection',async()=>{
 const binding=await liveBinding();
 assert.throws(()=>resolveOpt001Credential(binding,{}),
  e=>e?.code==='OPT001_NO_CREDENTIAL');
 assert.throws(()=>resolveOpt001Credential(binding,{DEEPSEEK_API_KEY:''}),
  e=>e?.code==='OPT001_NO_CREDENTIAL');
});
