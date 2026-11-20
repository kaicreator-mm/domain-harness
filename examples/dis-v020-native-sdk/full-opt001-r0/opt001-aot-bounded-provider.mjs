/**
 * DIS 0.2.0 Full Conformance R211 Lane O1 (OPT-001): real AOT-selected
 * bounded LLM Provider on the DeepSeek OpenAI-compatible chat/completions
 * endpoint, replacing the fixture-only R149 transport for live evidence.
 *
 * Contract (all executable, fail-closed):
 * - AOT-selected binding: the Provider is pinned to an exact AOT artifact
 *   digest, target Function, source provenance and pinned endpoint/model at
 *   construction. Runtime hot-swap of the binding or Provider is rejected.
 * - The binding records only a credential REFERENCE (`env:NAME`); the value
 *   is read from the environment at admission time and never enters the
 *   manifest, trace, outcomes or errors. Missing credential is an explicit
 *   NO_CREDENTIAL rejection, never a silent skip.
 * - Bounded invocation: per-request max_tokens + total request budget
 *   (reserved before await, so concurrent calls cannot overspend), per-call
 *   deadline (AbortController) that yields an explicit TIMEOUT outcome,
 *   cooperative cancel that yields CANCELED, and a concurrency cap with a
 *   small FIFO queue; an over-full queue is rejected.
 * - Model output is DATA ONLY: a single-line bounded advisory string with
 *   hardcoded UNKNOWN/NONE authority invariants on every outcome. Directive
 *   markers inside model text (e.g. GRANT_PERMISSION, pseudo receipts) are
 *   recorded as ignored and never mint semantic PASS, permission, Effect,
 *   state facts or qualification.
 *
 * This module never mints qualification/Effect/Release. See README.md for
 * the real vs structural vs fixture-injected evidence split.
 */
import {types} from 'node:util';

const ENDPOINT='https://api.deepseek.com/chat/completions';
const MODEL='deepseek-chat';
const PROVIDER_ID='deepseek-chat-completions-r0';
const BINDING_SCHEMA='dis.v0.2.opt001-provider-binding/1';
const TARGET_FUNCTION='xdownload.describePolicy';
const TARGET_CONTRACT_VERSION='1.0.0';
const OBSERVED_DOMAIN='downloads';
const SOURCE_ID='xdownload-business';
const SOURCE_GIT_BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const MAX_BODY_BYTES=65536;
const SUGGESTION_MAX=160;
const HEX64=/^[a-f0-9]{64}$/u;
const ENV_NAME=/^[A-Z_][A-Z0-9_]{0,63}$/u;
const CREDENTIAL=/^[^\s\u0000-\u001f\u007f]{8,512}$/u;
// Directive markers that must never be interpreted as authority. Detection is
// defense-in-depth only: outcomes are already hardcoded to UNKNOWN/NONE.
const DIRECTIVE=/(GRANT_PERMISSION|PERMISSION_GRANTED|EFFECT_APPROVED|AUTHORITY_GRANT|APPROVE_EFFECT|"status"\s*:\s*"PASS"|effectDispatched"\s*:\s*true|KDP_RECEIPT|PERMIT_GRANTED)/u;
const BUDGET_LIMITS=Object.freeze({
 maxOutputTokens:[16,512],maxRequests:[1,3],maxWaitMs:[1,60000],
 maxConcurrent:[1,4],maxQueued:[1,8]
});
const IMPLEMENTATION_SUMMARY='AOT-pinned single-endpoint DeepSeek chat/completions '+
 'transport; fixed advisory prompt, no tools, no caller-controlled URL; '+
 'bounded budget/deadline/cancel/concurrency; model text consumed as '+
 'non-authoritative DATA with UNKNOWN/NONE invariants.';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const deepFreeze=v=>{
 if(v===null||typeof v!=='object')return v;
 for(const k of Reflect.ownKeys(v))deepFreeze(v[k]);
 return Object.freeze(v);
};
const plainData=v=>{
 if(v===null||typeof v!=='object'||Array.isArray(v)||types.isProxy(v))return false;
 const p=Object.getPrototypeOf(v);
 return p===Object.prototype||p===null;
};
const ownData=(v,key)=>{
 if(!plainData(v))return undefined;
 const d=Object.getOwnPropertyDescriptor(v,key);
 return d&&Object.hasOwn(d,'value')?d.value:undefined;
};
const isPlainFrozen=v=>plainData(v)&&Object.isFrozen(v);
const baseNone=extra=>deepFreeze(Object.assign({
 status:'UNKNOWN',reason:null,httpStatus:null,phase:'NETWORK',
 disposition:'UNKNOWN',authority:'NONE',effectDispatched:false,
 qualified:false,dataOnly:true},extra));
const outcomeError=outcome=>{
 const code='OPT001_'+outcome.status+(outcome.reason?'_'+outcome.reason:'');
 return Object.assign(new Error(code),{code,outcome});
};
/**
 * Build and deep-freeze the AOT-selected Provider binding manifest. Unknown
 * constructor keys are rejected (fail-closed against config drift); the
 * endpoint/model/target triple is pinned by this implementation and cannot
 * be overridden by any caller. The credential is recorded as a reference
 * name only.
 */
export function makeOpt001ProviderBinding({aotDigest,credentialEnv='DEEPSEEK_API_KEY',
 maxOutputTokens=64,maxRequests=2,maxWaitMs=30000,maxConcurrent=2,maxQueued=4}={}){
 if(arguments.length!==1||!plainData(arguments[0]))fail('OPT001_BINDING_INVALID');
 for(const k of Reflect.ownKeys(arguments[0]))
  if(!['aotDigest','credentialEnv','maxOutputTokens','maxRequests',
   'maxWaitMs','maxConcurrent','maxQueued'].includes(k))fail('OPT001_BINDING_INVALID');
 if(typeof aotDigest!=='string'||!HEX64.test(aotDigest))fail('OPT001_BINDING_INVALID');
 if(typeof credentialEnv!=='string'||!ENV_NAME.test(credentialEnv))
  fail('OPT001_BINDING_INVALID');
 const check=(v,[lo,hi])=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
 if(!check(maxOutputTokens,BUDGET_LIMITS.maxOutputTokens)||
   !check(maxRequests,BUDGET_LIMITS.maxRequests)||
   !check(maxWaitMs,BUDGET_LIMITS.maxWaitMs)||
   !check(maxConcurrent,BUDGET_LIMITS.maxConcurrent)||
   !check(maxQueued,BUDGET_LIMITS.maxQueued))fail('OPT001_BINDING_INVALID');
 return deepFreeze({
  schema:BINDING_SCHEMA,providerId:PROVIDER_ID,endpoint:ENDPOINT,model:MODEL,
  aotDigest,
  target:Object.freeze({functionId:TARGET_FUNCTION,
   contractVersion:TARGET_CONTRACT_VERSION,observedDomain:OBSERVED_DOMAIN,
   sourceId:SOURCE_ID,sourceGitBlob:SOURCE_GIT_BLOB}),
  credentialRef:'env:'+credentialEnv,
  budget:Object.freeze({maxOutputTokens,maxRequests,maxWaitMs,
   maxConcurrent,maxQueued}),
  authority:'NONE',modelOutputDisposition:'DATA_ONLY',
  implementationSummary:IMPLEMENTATION_SUMMARY
 });
}
/**
 * Resolve the credential REFERENCE in the binding against the given
 * environment (default process.env, which may be proxy-backed). Absent or
 * empty is an explicit OPT001_NO_CREDENTIAL rejection; present-but-malformed
 * is OPT001_CREDENTIAL_INVALID. The value is returned only to the Provider
 * constructor and never logged, stored or embedded anywhere.
 */
export function resolveOpt001Credential(binding,env=process.env){
 if(!isPlainFrozen(binding)||binding.schema!==BINDING_SCHEMA||
   typeof binding.credentialRef!=='string'||
   !binding.credentialRef.startsWith('env:'))fail('OPT001_BINDING_UNSELECTED');
 const name=binding.credentialRef.slice(4);
 if(!ENV_NAME.test(name))fail('OPT001_BINDING_UNSELECTED');
 const value=Object.getOwnPropertyDescriptor(env,name)?.value;
 if(typeof value!=='string'||value.length===0)fail('OPT001_NO_CREDENTIAL');
 if(!CREDENTIAL.test(value))fail('OPT001_CREDENTIAL_INVALID');
 return value;
}
function validatePinnedBinding(b){
 const target=b?.target;
 if(!isPlainFrozen(b)||!isPlainFrozen(target)||!isPlainFrozen(b.budget)||
   b.schema!==BINDING_SCHEMA||b.providerId!==PROVIDER_ID||
   b.endpoint!==ENDPOINT||b.model!==MODEL||!HEX64.test(b.aotDigest??'')||
   b.authority!=='NONE'||b.modelOutputDisposition!=='DATA_ONLY'||
   target.functionId!==TARGET_FUNCTION||
   target.contractVersion!==TARGET_CONTRACT_VERSION||
   target.observedDomain!==OBSERVED_DOMAIN||
   target.sourceId!==SOURCE_ID||target.sourceGitBlob!==SOURCE_GIT_BLOB||
   typeof b.credentialRef!=='string'||!b.credentialRef.startsWith('env:')||
   !ENV_NAME.test(b.credentialRef.slice(4))||
   typeof b.implementationSummary!=='string')
  fail('OPT001_BINDING_UNSELECTED');
 const check=(v,[lo,hi])=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
 if(!check(b.budget.maxOutputTokens,BUDGET_LIMITS.maxOutputTokens)||
   !check(b.budget.maxRequests,BUDGET_LIMITS.maxRequests)||
   !check(b.budget.maxWaitMs,BUDGET_LIMITS.maxWaitMs)||
   !check(b.budget.maxConcurrent,BUDGET_LIMITS.maxConcurrent)||
   !check(b.budget.maxQueued,BUDGET_LIMITS.maxQueued))
  fail('OPT001_BINDING_UNSELECTED');
}
function validateSelectedRequest(request){
 try{
  if(!plainData(request))return false;
  const names=Reflect.ownKeys(request);
  if(names.length!==3||names.some(k=>typeof k!=='string'||
    !['purpose','sourceFunction','observedDomain'].includes(k)))return false;
  return names.every(k=>{
   const d=Object.getOwnPropertyDescriptor(request,k);
   if(!d||d.enumerable!==true||!Object.hasOwn(d,'value'))return false;
   const v=d.value;
   if(k==='purpose')return v==='advisory';
   if(k==='sourceFunction')return v===TARGET_FUNCTION;
   return v===OBSERVED_DOMAIN;
  });
 }catch{return false}
}
/**
 * Advisory DATA normalization: collapse whitespace runs into single spaces
 * (the bounded consumer only accepts single-line data), hard-cap the text
 * at the consumer bound (explicit truncation, never silent interpretation),
 * then enforce NFC and control-character bounds. Returns null when nothing
 * usable remains; otherwise {text, capped}. Normalization never touches
 * authority semantics: those are hardcoded invariants on every outcome.
 */
function normalizeAdvisoryText(text,cap){
 if(typeof text!=='string')return null;
 const oneLine=text.replace(/\s+/g,' ').trim();
 if(oneLine.length<1)return null;
 const capped=oneLine.length>cap;
 const bounded=(capped?oneLine.slice(0,cap):oneLine).trim();
 if(bounded.length<1)return null;
 const nfc=bounded.normalize('NFC');
 if(nfc!==bounded||/[\u0000-\u001f\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(nfc))
  return null;
 return {text:nfc,capped};
}
async function readLimitedJson(res){
 if(typeof res?.headers?.get!=='function'||
   !res.headers.get('content-type')?.toLowerCase().includes('application/json')||
   typeof res.body?.getReader!=='function')fail('OPT001_HTTP_UNQUALIFIED');
 const reader=res.body.getReader();
 let len=0,chunks=[];
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))fail('OPT001_HTTP_BODY_UNSAFE');
   len+=value.byteLength;
   if(len>MAX_BODY_BYTES)fail('OPT001_HTTP_RESPONSE_OVERSIZE');
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}}
 if(len===0)fail('OPT001_HTTP_EMPTY_RESPONSE');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,len)))}
 catch{fail('OPT001_HTTP_JSON_INVALID')}
}
function parseChatCompletion(body,budget){
 // Decoded HTTP JSON is untrusted DATA. Only a narrow, plain-data chat
 // completion shape yields an advisory string; anything else (tool calls,
 // refusals, choice anomalies) is rejected without interpretation.
 if(!plainData(body)||!Array.isArray(body.choices)||
   body.choices.length<1||body.choices.length>8)fail('OPT001_RESPONSE_UNQUALIFIED');
 const choice=body.choices[0];
 const message=ownData(choice,'message');
 const role=message===undefined?undefined:ownData(message,'role');
 const content=message===undefined?undefined:ownData(message,'content');
 if(!plainData(message)||role!=='assistant'||typeof content!=='string')
  fail('OPT001_RESPONSE_UNQUALIFIED');
 const suggestion=normalizeAdvisoryText(content,SUGGESTION_MAX);
 if(suggestion===null)fail('OPT001_MODEL_OUTPUT_REJECTED');
 const usage=ownData(body,'usage');
 const usageOut=plainData(usage)?deepFreeze({
  promptTokens:typeof ownData(usage,'prompt_tokens')==='number'?ownData(usage,'prompt_tokens'):null,
  completionTokens:typeof ownData(usage,'completion_tokens')==='number'?ownData(usage,'completion_tokens'):null,
  totalTokens:typeof ownData(usage,'total_tokens')==='number'?ownData(usage,'total_tokens'):null}):null;
 const finishReason=ownData(choice,'finish_reason');
 const truncated=suggestion.capped||finishReason==='length'||
  (typeof usageOut?.completionTokens==='number'&&usageOut.completionTokens>=budget.maxOutputTokens);
 const directives=[...new Set((content.match(DIRECTIVE)??[]).map(String))];
 return Object.freeze({suggestion:suggestion.text,truncated,directives:Object.freeze(directives),
  normalizedWhitespace:content!==suggestion,usage:usageOut,
  model:typeof ownData(body,'model')==='string'?ownData(body,'model'):null,
  finishReason:typeof finishReason==='string'?finishReason:null});
}
/**
 * Create the frozen bounded Provider bound to the exact AOT-selected
 * manifest. fetchImpl injection is TEST-ONLY (structural/defense evidence);
 * the default is the real global fetch against the pinned endpoint.
 */
export function createOpt001BoundedProvider({binding,credential,fetchImpl=fetch}={}){
 validatePinnedBinding(binding);
 if(typeof credential!=='string'||credential.length===0)fail('OPT001_NO_CREDENTIAL');
 if(!CREDENTIAL.test(credential))fail('OPT001_CREDENTIAL_INVALID');
 if(typeof fetchImpl!=='function')fail('OPT001_CONFIGURATION_INVALID');
 const budget=binding.budget;
 const counts={ok:0,timeout:0,canceled:0,budgetExhausted:0,
  concurrencyRejected:0,credentialRejected:0,unavailable:0,outputRejected:0};
 const state={admitted:0,seq:0};
 const inFlight=new Map(); // callId -> execution entry
 const queue=[]; // FIFO of {resolve} waiting for a free concurrency slot
 const traceRecords=[];
 const countOut=outcome=>{
  if(outcome.status==='OK')counts.ok++;
  else if(outcome.status==='TIMEOUT')counts.timeout++;
  else if(outcome.status==='CANCELED')counts.canceled++;
  else if(outcome.status==='BUDGET_EXHAUSTED')counts.budgetExhausted++;
  else if(outcome.status==='CONCURRENCY_REJECTED')counts.concurrencyRejected++;
  else if(outcome.status==='REJECTED'&&outcome.reason==='CREDENTIAL_REJECTED')
   counts.credentialRejected++;
  else if(outcome.status==='REJECTED')counts.outputRejected++;
  else if(outcome.status==='UNAVAILABLE')counts.unavailable++;
 };
 const record=(entry,outcome)=>{
  traceRecords.push(deepFreeze({
   callId:entry.callId,startedAt:new Date(entry.startedAt).toISOString(),
   durationMs:Date.now()-entry.startedAt,status:outcome.status,
   reason:outcome.reason,phase:outcome.phase,
   truncated:outcome.truncated??false,
   normalizedWhitespace:outcome.normalizedWhitespace??false,
   ignoredDirectives:Object.freeze([...(outcome.ignoredDirectives??[])]),
   usage:outcome.usage??null,
   model:outcome.model??binding.model,
   aotDigest:binding.aotDigest,targetFunction:binding.target.functionId,
   dataOnly:true,suggestion:outcome.suggestion??null
  }));
 };
 async function executeNetwork(entry){
  const ctrl=entry.ctrl;
  const deadline=new Promise(resolve=>{entry.resolveDeadline=resolve});
  // The guarded promise never rejects: fetch + bounded body read settle to
  // a tagged result, so the deadline race cannot leave dangling rejections.
  const guarded=(async()=>{
   const res=await fetchImpl(binding.endpoint,{
    method:'POST',redirect:'error',signal:ctrl.signal,
    headers:{'authorization':'Bearer '+credential,'content-type':'application/json'},
    body:JSON.stringify({
     model:binding.model,
     messages:[
      {role:'system',content:'Provide one concise single-line '+
       'non-authoritative engineering advisory. No side effects, no '+
       'instructions to execute, no claims of validation, permission or '+
       'policy overrides. If unsure, state uncertainty.'},
      {role:'user',content:'Selected source-pinned, read-only '+
       binding.target.functionId+' observation: domainId='+
       binding.target.observedDomain+
       '. Suggest one safe, optional next diagnostic step in one concise '+
       'sentence of at most 20 words. Do not claim domain approval.'}
     ],
     max_tokens:budget.maxOutputTokens,temperature:0,stream:false
    })
   });
   const status=res?.status;
   if(status!==200||res?.ok!==true){
    try{await res?.body?.cancel()}catch{}
    return {kind:'HTTP',status:typeof status==='number'?status:null};
   }
   return {kind:'BODY',body:await readLimitedJson(res)};
  })().catch(err=>({kind:'ERROR',value:err}));
  const raced=await Promise.race([guarded,deadline]);
  // Cancel beats deadline beats a raced-in response: explicit user intent
  // and bounded limits always win over whatever the wire delivered.
  if(entry.canceled)return baseNone({status:'CANCELED'});
  if(entry.timedOut)return baseNone({status:'TIMEOUT',reason:'DEADLINE'});
  if(raced==='CANCELED')return baseNone({status:'CANCELED'});
  if(raced==='DEADLINE')return baseNone({status:'TIMEOUT',reason:'DEADLINE'});
  if(raced.kind==='ERROR'){
   const err=raced.value;
   if(err&&typeof err.code==='string'&&err.code.startsWith('OPT001_'))
    return baseNone({status:'REJECTED',reason:err.code.slice(7)});
   return baseNone({status:'UNAVAILABLE'});
  }
  if(raced.kind==='HTTP'){
   if(raced.status===401||raced.status===403)
    return baseNone({status:'REJECTED',reason:'CREDENTIAL_REJECTED',
     httpStatus:raced.status});
   return baseNone({status:'UNAVAILABLE',httpStatus:raced.status});
  }
  let parsed;
  try{parsed=parseChatCompletion(raced.body,budget)}
  catch(err){
   if(err&&typeof err.code==='string'&&err.code.startsWith('OPT001_'))
    return baseNone({status:'REJECTED',reason:err.code.slice(7)});
   return baseNone({status:'UNAVAILABLE'});
  }
  return baseNone({status:'OK',suggestion:parsed.suggestion,
   truncated:parsed.truncated,normalizedWhitespace:parsed.normalizedWhitespace,
   ignoredDirectives:parsed.directives,usage:parsed.usage,
   model:parsed.model,finishReason:parsed.finishReason});
 }
 async function execute(request){
  if(!validateSelectedRequest(request))fail('OPT001_UNSELECTED_INPUT');
  // Budget is reserved before any await: concurrent callers cannot overspend.
  if(state.admitted>=budget.maxRequests){
   counts.budgetExhausted++;
   return baseNone({status:'BUDGET_EXHAUSTED',
    budget:Object.freeze({used:state.admitted,limit:budget.maxRequests})});
  }
  state.admitted++;
  const entry={callId:++state.seq,startedAt:Date.now(),
   ctrl:new AbortController(),canceled:false,timedOut:false,
   resolveDeadline:null,resolveQueue:null};
  const timer=setTimeout(()=>{
   entry.timedOut=true;
   try{entry.ctrl.abort()}catch{}
   entry.resolveDeadline?.('DEADLINE');
   entry.resolveQueue?.('DEADLINE');
  },budget.maxWaitMs);
  let outcome;
  // Only a call that actually held a concurrency slot may hand it over in
  // the finally drain; rejected calls and canceled/deadline-queued calls
  // must not dequeue a waiter.
  let occupiedSlot=false;
  try{
   inFlight.set(entry.callId,entry);
   if(inFlight.size>budget.maxConcurrent){
    if(queue.length>=budget.maxQueued){
     state.admitted--;
     counts.concurrencyRejected++;
     return baseNone({status:'CONCURRENCY_REJECTED',
      inFlight:inFlight.size-1,queued:queue.length});
    }
    const slot=await new Promise(resolve=>{entry.resolveQueue=resolve;
     queue.push({resolve})});
    if(entry.canceled)outcome=baseNone({status:'CANCELED',phase:'QUEUED'});
    else if(entry.timedOut)outcome=baseNone({status:'TIMEOUT',
     reason:'DEADLINE_QUEUED',phase:'QUEUED'});
    else if(slot!=='SLOT')outcome=baseNone({status:'CANCELED',phase:'QUEUED'});
    else{
     occupiedSlot=true;
     outcome=await executeNetwork(entry);
    }
   }else{
    occupiedSlot=true;
    outcome=await executeNetwork(entry);
   }
  }finally{
   clearTimeout(timer);
   inFlight.delete(entry.callId);
   if(occupiedSlot){
    const next=queue.shift(); // the slot this call just released
    if(next)next.resolve('SLOT');
   }
  }
  countOut(outcome);
  record(entry,outcome);
  return outcome;
 }
 return Object.freeze({
  id:binding.providerId,
  binding:()=>binding,
  /**
   * Lifecycle seam that exists only to prove fail-closure: runtime
   * replacement of the AOT-selected binding/Provider is always rejected.
   */
  replaceBinding(){fail('OPT001_HOT_SWAP_REJECTED')},
  stats:()=>Object.freeze({admitted:state.admitted,inFlight:inFlight.size,
   queued:queue.length,...counts,maxRequests:budget.maxRequests,
   maxConcurrent:budget.maxConcurrent}),
  trace:()=>deepFreeze([...traceRecords]),
  cancelAll(){
   // Queued entries live in both inFlight and the FIFO; count each pending
   // call exactly once (the inFlight map is the superset).
   const n=inFlight.size;
   for(const entry of inFlight.values()){
    entry.canceled=true;
    try{entry.ctrl.abort()}catch{}
    entry.resolveDeadline?.('CANCELED');
    entry.resolveQueue?.('CANCELED');
   }
   while(queue.length>0)queue.shift().resolve('CANCELED');
   return n;
  },
  async propose(request){
   const outcome=await execute(request);
   if(outcome.status==='OK')return Object.freeze({suggestion:outcome.suggestion});
   throw outcomeError(outcome);
  },
  invokeBounded:request=>execute(request)
 });
}
