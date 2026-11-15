/**
 * DIS v0.2 O3 scoped engineering: task-epoch pin, suspension, rollback and
 * fail-closed revocation over the already source-pinned SHADOW candidate.
 * This is NOT a qualified Evolution Slot, installed rule, Effect, or
 * persistent/Host-authenticated activation ABI. Never accepts a caller's
 * QualificationReceipt, oracle boolean, or arbitrary DSL/code.
 */
import { makeO3Shadow } from './o3-shadow-rule.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const bounded=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const outcome=(reason,epoch,more={})=>Object.freeze({
  status:'NEED_MORE_EVIDENCE',scope:'SHADOW_ONLY',authority:'NONE',
  qualified:false,ruleActivated:false,experienceIssued:false,
  effectDispatched:false,reason,taskEpoch:epoch,...more
});

/**
 * Constructor must run within the selected AOT/SDK's local app process.
 * This library cannot authenticate the enclosing Host or authorize Full O3.
 */
export function makeO3ShadowTaskPin({app,candidate,maxWaitMs=1000,maxTasks=16,maxEpochs=32}={}){
  if(!bounded(maxTasks,1,128)||!bounded(maxEpochs,1,128))fail('O3_TASK_BUDGET_INVALID');
  // Reuse the already independently reviewed strict source/DSL candidate gate.
  // This never accepts a qualification receipt or modifies the selected AOT.
  makeO3Shadow({app,candidate,maxWaitMs});
  const d=Object.getOwnPropertyDescriptor(candidate,'digest');
  const candidateDigest=d?.value;
  if(typeof candidateDigest!=='string'||!/^[a-f0-9]{64}$/.test(candidateDigest))
    fail('O3_CANDIDATE_UNQUALIFIED');
  const tasks=new WeakMap(),history=new Map([[0,null]]),revokedEpochs=new Set();
  let currentEpoch=0,seq=0,remaining=maxTasks,closed=false,revokedDigest=false;
  const requireOpen=()=>{if(closed)fail('O3_COORDINATOR_CLOSED')};
  const nextEpoch=digest=>{
    requireOpen();
    if(seq>=maxEpochs)fail('O3_EPOCH_BUDGET_EXHAUSTED');
    if(digest!==null&&revokedDigest)fail('O3_CANDIDATE_REVOKED');
    const epoch=++seq;
    history.set(epoch,digest);
    currentEpoch=epoch;
    return Object.freeze({epoch,scope:'SHADOW_ONLY',qualified:false,ruleActivated:false});
  };
  const isRevoked=(t)=>closed||revokedDigest||revokedEpochs.has(t.epoch);
  return Object.freeze({
    // A new epoch affects only later beginTask calls; old tasks retain pins.
    publishShadowForFutureTasks:()=>nextEpoch(candidateDigest),
    suspendShadowForFutureTasks:()=>nextEpoch(null),
    rollbackShadowTo:(epoch)=>{
      requireOpen();
      if(!bounded(epoch,0,seq)||!history.has(epoch))fail('O3_EPOCH_UNKNOWN');
      if(revokedEpochs.has(epoch))fail('O3_EPOCH_REVOKED');
      return nextEpoch(history.get(epoch));
    },
    beginTask:()=>{
      requireOpen();
      if(remaining===0)fail('O3_TASK_BUDGET_EXHAUSTED');
      remaining--; // reserve before any asynchronous work
      const token=Object.freeze(Object.create(null));
      tasks.set(token,{epoch:currentEpoch,digest:history.get(currentEpoch),used:false});
      return token; // opaque unforgeable in-process; not a persisted credential
    },
    async probeTask(token){
      // WeakMap lookup does not read user-supplied properties, invoke getters,
      // call Proxy traps, or coerce a forged token.
      const t=token!==null&&(typeof token==='object'||typeof token==='function')?
        tasks.get(token):undefined;
      if(!t)return outcome('TASK_PIN_NOT_ISSUED',null);
      if(t.used)return outcome('TASK_PIN_ALREADY_USED',t.epoch);
      t.used=true;
      if(isRevoked(t))return outcome('TASK_PIN_REVOKED',t.epoch);
      if(t.digest===null)return outcome('SHADOW_DISABLED_FOR_TASK',t.epoch);
      let observation;
      try {observation=await makeO3Shadow({app,candidate,maxWaitMs}).probe()}
      catch {return outcome('SHADOW_OBSERVATION_UNKNOWN',t.epoch)}
      // Recheck AFTER async observation so in-flight revocation cannot race
      // into a publishable result; no side effects can be dispatched here.
      if(isRevoked(t))return outcome('TASK_PIN_REVOKED_DURING_OBSERVATION',t.epoch);
      return outcome(observation.reason,t.epoch,{
        shadowMatched:observation.shadowMatched===true,
        candidateDigest:t.digest
      });
    },
    revokeEpoch:(epoch)=>{
      if(!bounded(epoch,0,seq)||!history.has(epoch))fail('O3_EPOCH_UNKNOWN');
      revokedEpochs.add(epoch);
      // Existing task snapshots at that epoch will now fail even in flight.
      if(epoch===currentEpoch&&!closed&&seq<maxEpochs)nextEpoch(null);
      return Object.freeze({revokedEpoch:epoch,ruleActivated:false});
    },
    revokeCandidateDigest:()=>{
      revokedDigest=true;
      // Terminal for this exact candidate, including previously issued tasks.
      return Object.freeze({candidateDigest,revoked:true,ruleActivated:false});
    },
    close:()=>{closed=true},
    state:()=>Object.freeze({currentEpoch,remaining,closed,
      candidateRevoked:revokedDigest,scope:'SHADOW_ONLY',qualified:false,
      ruleActivated:false})
  });
}
