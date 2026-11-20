/**
 * DIS 0.2.0 Full R211 / OPT-003 (lane O3): local data-only Evolution Slot
 * activation lifecycle over the selected AOT/SDK — load, ATOMIC task-scoped
 * activation, data-driven execution, revoke, rollback and explicit
 * process-restart invalidation.
 *
 * Honest scope: this is a LOCAL, in-process, data-only slot manager. It is
 * NOT a Host-authenticated activation ABI, not an installed/qualified Rule,
 * not a QualificationReceipt, never issues an Experience or Effect, and
 * never executes caller code. Activation state is PROCESS_LOCAL by design:
 * a new coordinator instance (new process / restart) holds no pins and
 * rejects every foreign or stale activation claim (see OPT003_PIN_NOT_ISSUED
 * / OPT003_STALE_EPOCH).
 *
 * === O4 CONSUMPTION SEAM (stable ABI — do not rename silently) ===
 * Exports:
 *  - prepareOpt003DataSlot(input) -> frozen slot record:
 *      {schema:'dis.v0.2.opt003-slot/1', functionId, contractVersion,
 *       sourceGitBlob, op, field, equals, digest, code:null,
 *       executable:false, disposition:'SLOT_DATA_ONLY'}
 *    Strictly data-only: exact key set, whitelisted op ('eq'), whitelisted
 *    field ('value.domainId'), equals must be a safe lowercase data literal
 *    (/^[a-z0-9][a-z0-9._-]{0,127}$/). Functions, Proxies, accessors, extra
 *    keys (code/run/exec/import/...), or executable-looking literals are
 *    rejected with OPT003_SLOT_NOT_DATA_ONLY / OPT003_SLOT_LITERAL_UNSAFE.
 *    The module contains no eval, no Function(), no dynamic import; injected
 *    code strings are validated as inert data and never executed.
 *  - createOpt003EvolutionSlot({app, slot, expectedAotDigest, ...}) ->
 *    coordinator object with:
 *      loadSlot()                 -> LOADED record; rejects slots whose
 *                                    functionId is outside the selected AOT
 *                                    candidate set (OPT003_SLOT_NOT_AUTHORIZED).
 *      activateForTask()          -> {token, activation}. ATOMIC: slot
 *                                    authorization, epoch publish and task
 *                                    pin complete in one synchronous step;
 *                                    there is no observable intermediate
 *                                    "slot active but unpinned" state.
 *      beginTask()                -> task token WITHOUT activation (control
 *                                    path; executing it yields
 *                                    OPT003_SLOT_NOT_ACTIVE — the contrast
 *                                    that proves data-driven behavior change).
 *      executeTask(token)         -> outcome record (see shape below).
 *      cancelTask(token)          -> late activation/execution rejected with
 *                                    OPT003_TASK_CANCELLED.
 *      revokeSlot()               -> immediate invalidation; current and all
 *                                    outstanding pins at the revoked epoch
 *                                    fail with OPT003_SLOT_REVOKED.
 *      rollbackTo(epoch)          -> re-publish a prior epoch's digest;
 *                                    pins of superseded epochs become stale
 *                                    (OPT003_STALE_EPOCH); revoked epochs
 *                                    refuse rollback (OPT003_EPOCH_REVOKED).
 *      close() / state()          -> lifecycle introspection.
 * Epoch semantics: monotonic in-process counter; history maps epoch -> active
 * slot digest or null (0 = pre-activation). Activation binds (digest, epoch)
 * to exactly one opaque WeakMap token; execution requires token.epoch to be
 * the current epoch both before AND after the awaited native observation, so
 * in-flight revoke/cancel/rollback/expire cannot race into a publishable
 * result. Epochs are NOT durable credentials and are meaningless across
 * process restarts (process-local by design, fail-closed after restart).
 */
import {createHash} from 'node:crypto';
import {types as nodeUtilTypes} from 'node:util';
import {performance} from 'node:perf_hooks';

const FN='xdownload.describePolicy';
const VERSION='1.0.0';
const SOURCE='xdownload-business';
const BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const HEX=/^[a-f0-9]{64}$/;
const SLOT_SCHEMA='dis.v0.2.opt003-slot/1';
const SLOT_KEYS=['schema','functionId','contractVersion','sourceGitBlob','op','field','equals'];
const PREPARED_KEYS=[...SLOT_KEYS,'digest','code','executable','disposition'];
const OP_WHITELIST=new Set(['eq']);
const FIELD_WHITELIST=new Set(['value.domainId']);
const DATA_LITERAL=/^[a-z0-9][a-z0-9._-]{0,127}$/;
const fail=code=>{throw Object.assign(new Error(code),{code})};
const bounded=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const sha256=x=>createHash('sha256').update(x).digest('hex');

/** Exact-own-data capture; never runs getters/Proxy traps, rejects accessors. */
function record(obj,keys){
 try{
  if(nodeUtilTypes.isProxy(obj))return null;
  if(obj===null||typeof obj!=='object'||Array.isArray(obj))return null;
  if(Object.getPrototypeOf(obj)!==Object.prototype&&Object.getPrototypeOf(obj)!==null)return null;
  const names=Reflect.ownKeys(obj);
  if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
  const out=Object.create(null);
  for(const k of keys){
   const d=Object.getOwnPropertyDescriptor(obj,k);
   if(!d||!Object.hasOwn(d,'value')||typeof d.value==='function'||typeof d.value==='symbol')return null;
   out[k]=d.value;
  }
  return out;
 }catch{return null}
}
/** Plain-data read of one own enumerable key; undefined on anything hostile. */
function read(obj,k){
 try{
  if(nodeUtilTypes.isProxy(obj))return undefined;
  if(obj===null||typeof obj!=='object'||Array.isArray(obj))return undefined;
  if(Object.getPrototypeOf(obj)!==Object.prototype&&Object.getPrototypeOf(obj)!==null)return undefined;
  const d=Object.getOwnPropertyDescriptor(obj,k);
  return d&&Object.hasOwn(d,'value')?d.value:undefined;
 }catch{return undefined}
}
const selectedApp=(app,expectedAotDigest)=>{
 try{
  return !!app&&typeof app==='object'&&!nodeUtilTypes.isProxy(app)&&
   app.aotDigest===expectedAotDigest&&
   Array.isArray(app.functions)&&app.functions.includes(FN)&&
   app.contractVersions?.[FN]===VERSION&&typeof app.invoke==='function';
 }catch{return false}
};
/**
 * Depth-bounded structural validation of the native observation. Every
 * nested hop decrements the depth budget before any property is read; a
 * hostile getter/Proxy read is caught and treated as unqualified. This is
 * the bounded interpreter's resource fence: exceeding depth/step budgets is
 * an explicit, fail-closed rejection, never an executed program.
 */
function validateObservation(value,maxDepth,maxSteps,steps){
 let depthLeft=maxDepth;
 const descend=node=>{
  if(steps.count++>maxSteps)return false;
  if(nodeUtilTypes.isProxy(node))return false;
  if(node===null||typeof node!=='object')return true;
  if(Array.isArray(node))return false;
  if(Object.getPrototypeOf(node)!==Object.prototype&&Object.getPrototypeOf(node)!==null)return false;
  if(depthLeft--<=0)return false; // depth budget exhausted -> fail closed
  return true;
 };
 if(!descend(value))return false;
 if(read(value,'kind')!=='OBSERVATION'||read(value,'disposition')!=='OBSERVED'||
    read(value,'authority')!=='NONE'||read(value,'contractVersion')!==VERSION)return false;
 const evidence=read(value,'evidence');
 if(!descend(evidence))return false;
 if(read(evidence,'attested')!==false)return false;
 const source=read(evidence,'source');
 if(!descend(source))return false;
 if(read(source,'sourceId')!==SOURCE||read(source,'gitBlob')!==BLOB)return false;
 const sha=read(source,'sha256');
 if(typeof sha!=='string'||!HEX.test(sha))return false;
 const detail=read(value,'value');
 if(!descend(detail))return false;
 const domainId=read(detail,'domainId');
 if(typeof domainId!=='string'||domainId.length>128||domainId.normalize('NFC')!==domainId||
    /[\u0000-\u001f\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(domainId))return false;
 return true;
}
const outcome=(reason,more={})=>Object.freeze({
 schema:'dis.v0.2.opt003-outcome/1',status:'DENIED',
 scope:'LOCAL_EVOLUTION_SLOT',authority:'NONE',qualified:false,
 hostAttested:false,installedRuleAttested:false,ruleActivated:false,
 ruleEvaluated:false,ruleMatched:false,experienceIssued:false,
 effectDispatched:false,reason,...more
});
/**
 * Strictly data-only slot preparation (AOT-locked candidate grammar).
 * Whitelisted op set: 'eq'. Whitelisted field: 'value.domainId'. `equals`
 * must be a safe lowercase data literal — strings such as
 * '(function(){...})()', 'import("fs")', 'eval(...)' or 'x=>x' are inert
 * data here: rejected by the literal shape check and NEVER executed, because
 * this module contains no evaluator, no dynamic import and no Function()
 * construction of any kind.
 */
export function prepareOpt003DataSlot(input){
 // Accept either the raw 7-key slot input or an already-prepared record
 // (same data keys plus digest/code/executable/disposition metadata whose
 // values must match exactly) — so coordinators can re-validate idempotently.
 const keys=Reflect.ownKeys(input??{});
 const shape=(keys.length===SLOT_KEYS.length)?SLOT_KEYS:
  (keys.length===PREPARED_KEYS.length)?PREPARED_KEYS:null;
 const x=shape?record(input,shape):null;
 if(!x||x.schema!==SLOT_SCHEMA||x.functionId!==FN||
    x.contractVersion!==VERSION||x.sourceGitBlob!==BLOB||
    !OP_WHITELIST.has(x.op)||!FIELD_WHITELIST.has(x.field)||
    typeof x.equals!=='string')
  fail('OPT003_SLOT_NOT_DATA_ONLY');
 if(!DATA_LITERAL.test(x.equals)||x.equals.normalize('NFC')!==x.equals)
  fail('OPT003_SLOT_LITERAL_UNSAFE');
 const normalized=JSON.stringify(Object.fromEntries(SLOT_KEYS.map(k=>[k,x[k]])));
 if(Buffer.byteLength(normalized)>2048)fail('OPT003_SLOT_TOO_LARGE');
 const digest=sha256(normalized);
 if(shape===PREPARED_KEYS&&
    (x.digest!==digest||x.code!==null||x.executable!==false||
     x.disposition!=='SLOT_DATA_ONLY'))
  fail('OPT003_SLOT_NOT_DATA_ONLY');
 return Object.freeze({schema:SLOT_SCHEMA,functionId:FN,contractVersion:VERSION,
  sourceGitBlob:BLOB,op:x.op,field:x.field,equals:x.equals,
  digest:sha256(normalized),code:null,executable:false,
  disposition:'SLOT_DATA_ONLY'});
}
/**
 * Constructor must run inside the selected AOT/SDK's local app process.
 * expectedAotDigest pins the selected app identity; the slot's functionId
 * must be inside the app's selected function set (AOT-locked candidate set).
 */
export function createOpt003EvolutionSlot({app,slot,expectedAotDigest,
 maxWaitMs=15000,maxTasks=16,maxEpochs=32,maxTaskAgeMs=15000,
 maxSteps=16,maxDepth=8}={}){
 if(typeof expectedAotDigest!=='string'||!HEX.test(expectedAotDigest))
  fail('OPT003_AOT_PIN_MISMATCH');
 if(!selectedApp(app,expectedAotDigest))fail('OPT003_SELECTED_APP_UNTRUSTED');
 if(!bounded(maxTasks,1,128)||!bounded(maxEpochs,1,128))fail('OPT003_TASK_BUDGET_INVALID');
 if(!bounded(maxTaskAgeMs,1,60000))fail('OPT003_TASK_TTL_INVALID');
 if(!bounded(maxWaitMs,1,15000)||!bounded(maxSteps,1,64)||!bounded(maxDepth,1,32))
  fail('OPT003_INTERPRETER_BUDGET_INVALID');
 // Re-validate the slot record from scratch (idempotent for prepared
 // records, including digest equality): the caller cannot smuggle a forged
 // slot past this point, and no native call happens here.
 const prepared=prepareOpt003DataSlot(slot);
 if(!app.functions.includes(prepared.functionId))fail('OPT003_SLOT_NOT_AUTHORIZED');
 const tasks=new WeakMap(),history=new Map([[0,null]]),revokedEpochs=new Set();
 let currentEpoch=0,seq=0,remaining=maxTasks,closed=false,slotRevoked=false;
 const activeDigest=()=>history.get(currentEpoch);
 const requireOpen=()=>{if(closed)fail('OPT003_COORDINATOR_CLOSED')};
 const publish=digest=>{
  requireOpen();
  if(seq>=maxEpochs)fail('OPT003_EPOCH_BUDGET_EXHAUSTED');
  if(digest!==null&&slotRevoked)fail('OPT003_SLOT_REVOKED');
  const epoch=++seq;
  history.set(epoch,digest);currentEpoch=epoch;
  return epoch;
 };
 const isCancelled=t=>t.cancelled;
 const isRevoked=t=>closed||slotRevoked||revokedEpochs.has(t.epoch);
 const isExpired=t=>performance.now()-t.issuedAt>=maxTaskAgeMs;
 const isStale=t=>t.epoch!==currentEpoch;
 const lookup=token=>token!==null&&(typeof token==='object'||typeof token==='function')?
  tasks.get(token):undefined;
 // One synchronous, atomic step: authorize -> publish epoch -> pin task.
 // No await between publication and pinning, so no observer can see a slot
 // that is active but not yet pinned to a task (and vice versa).
 const activateLocked=()=>{
  requireOpen();
  if(slotRevoked)fail('OPT003_SLOT_REVOKED');
  if(remaining===0)fail('OPT003_TASK_BUDGET_EXHAUSTED');
  const epoch=publish(prepared.digest); // single-flight: supersedes prior pins
  remaining--; // reserve before the token exists; no async work inside
  const token=Object.freeze(Object.create(null));
  tasks.set(token,{epoch,digest:prepared.digest,used:false,cancelled:false,
   finished:false,issuedAt:performance.now()});
  return {token,epoch};
 };
 const denied=(reason,t,more={})=>outcome(reason,{
  taskEpoch:t&&Number.isSafeInteger(t.epoch)?t.epoch:null,
  slotDigest:prepared.digest,...more});
 return Object.freeze({
  loadSlot:()=>{
   requireOpen();
   if(slotRevoked)fail('OPT003_SLOT_REVOKED');
   // AOT candidate-set membership was enforced at construction; re-check the
   // live app shape so a mutated app cannot widen the set after the pin.
   if(!selectedApp(app,expectedAotDigest))fail('OPT003_SELECTED_APP_STALE');
   return Object.freeze({schema:'dis.v0.2.opt003-load/1',status:'LOADED',
    slotDigest:prepared.digest,epoch:currentEpoch,ruleActivated:activeDigest()!==null,
    sourceGitBlob:BLOB,functionId:FN,scope:'LOCAL_EVOLUTION_SLOT',
    authority:'NONE',qualified:false,hostAttested:false,
    installedRuleAttested:false,experienceIssued:false,effectDispatched:false});
  },
  activateForTask:()=>{
   const {token,epoch}=activateLocked();
   return {token,activation:Object.freeze({schema:'dis.v0.2.opt003-activation/1',
    status:'ACTIVATED_LOCAL',scope:'LOCAL_EVOLUTION_SLOT',authority:'NONE',
    slotDigest:prepared.digest,epoch,ruleActivated:true,taskPinned:true,
    hostAttested:false,installedRuleAttested:false,qualified:false,
    experienceIssued:false,effectDispatched:false})};
  },
  beginTask:()=>{
   requireOpen();
   if(remaining===0)fail('OPT003_TASK_BUDGET_EXHAUSTED');
   remaining--;
   const token=Object.freeze(Object.create(null));
   tasks.set(token,{epoch:currentEpoch,digest:activeDigest(),used:false,
    cancelled:false,finished:false,issuedAt:performance.now()});
   return token;
  },
  cancelTask:token=>{
   const t=lookup(token);
   if(!t)fail('OPT003_PIN_NOT_ISSUED');
   // A pin still awaiting its native observation may be cancelled so the
   // race lands as an explicit denial; a settled pin cannot be re-cancelled.
   if(t.used&&t.finished)fail('OPT003_TASK_PIN_ALREADY_USED');
   t.cancelled=true;
   return Object.freeze({cancelled:true,taskEpoch:t.epoch});
  },
  async executeTask(token){
   const t=lookup(token);
   if(!t)return denied('OPT003_PIN_NOT_ISSUED',null);
   if(t.used)return denied('OPT003_TASK_PIN_ALREADY_USED',t);
   t.used=true;
   try{
    if(isCancelled(t))return denied('OPT003_TASK_CANCELLED',t);
    if(isRevoked(t))return denied('OPT003_SLOT_REVOKED',t);
    if(isExpired(t))return denied('OPT003_TASK_PIN_EXPIRED',t);
    if(isStale(t))return denied('OPT003_STALE_EPOCH',t);
    if(t.digest===null)return denied('OPT003_SLOT_NOT_ACTIVE',t);
    if(t.digest!==prepared.digest)return denied('OPT003_SLOT_DIGEST_MISMATCH',t);
    let timer;
    try{
     const observation=await Promise.race([
      Promise.resolve().then(()=>app.invoke(FN,{})),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OPT003_DEADLINE')),maxWaitMs)})
     ]);
     // Post-await fail-closed recheck: cancel/revoke/expire/rollback that
     // landed while the native call was in flight must not publish a result.
     if(isCancelled(t))return denied('OPT003_TASK_CANCELLED_DURING_EXECUTION',t);
     if(isRevoked(t))return denied('OPT003_SLOT_REVOKED_DURING_EXECUTION',t);
     if(isExpired(t))return denied('OPT003_TASK_PIN_EXPIRED_DURING_EXECUTION',t);
     if(isStale(t))return denied('OPT003_STALE_EPOCH_DURING_EXECUTION',t);
     const steps={count:0};
     if(!validateObservation(observation,maxDepth,maxSteps,steps))
      return denied('OPT003_OBSERVATION_UNQUALIFIED',t);
     // The entire data-only grammar is one own-data string comparison.
     const matched=read(read(observation,'value'),'domainId')===prepared.equals;
     return outcome(matched?'RULE_MATCH':'RULE_MISS',{
      status:'SLOT_EXECUTED',ruleActivated:true,ruleEvaluated:true,
      ruleMatched:matched,slotDigest:prepared.digest,taskEpoch:t.epoch,
      decision:matched?'ALLOW_DATA_ONLY_SHADOW':'DENY_RULE_MISS',
      observedSourceGitBlob:BLOB,
      effectDispatched:false,experienceIssued:false});
    }catch{
     if(isCancelled(t))return denied('OPT003_TASK_CANCELLED_DURING_EXECUTION',t);
     if(isRevoked(t))return denied('OPT003_SLOT_REVOKED_DURING_EXECUTION',t);
     if(isExpired(t))return denied('OPT003_TASK_PIN_EXPIRED_DURING_EXECUTION',t);
     return denied('OPT003_NATIVE_UNAVAILABLE_OR_TIMEOUT',t);
    }finally{if(timer!==undefined)clearTimeout(timer)}
   }finally{t.finished=true}
  },
  revokeSlot:()=>{
   slotRevoked=true;
   revokedEpochs.add(currentEpoch);
   // Advance past the revoked activation so fresh tasks observe a null slot.
   if(!closed&&seq<maxEpochs)publish(null);
   return Object.freeze({revokedSlotDigest:prepared.digest,
    scope:'LOCAL_EVOLUTION_SLOT',ruleActivated:false});
  },
  rollbackTo:epoch=>{
   requireOpen();
   if(!bounded(epoch,0,seq)||!history.has(epoch))fail('OPT003_EPOCH_UNKNOWN');
   if(revokedEpochs.has(epoch)||slotRevoked)fail('OPT003_EPOCH_REVOKED');
   const restored=publish(history.get(epoch));
   return Object.freeze({schema:'dis.v0.2.opt003-rollback/1',
    status:'ROLLED_BACK_LOCAL',scope:'LOCAL_EVOLUTION_SLOT',
    authority:'NONE',restoredEpoch:restored,restoredToEpoch:epoch,
    ruleActivated:history.get(restored)!==null,slotDigest:prepared.digest,
    qualified:false,hostAttested:false,installedRuleAttested:false,
    experienceIssued:false,effectDispatched:false});
  },
  close:()=>{closed=true},
  state:()=>Object.freeze({schema:'dis.v0.2.opt003-state/1',
   scope:'LOCAL_EVOLUTION_SLOT',currentEpoch,slotRevoked,closed,remaining,
   activeDigest:activeDigest()??null,slotDigest:prepared.digest,
   ruleActivated:activeDigest()===prepared.digest,qualified:false,
   hostAttested:false,effectDispatched:false,
   processLocal:true // activation does NOT survive process restart
  })
 });
}
