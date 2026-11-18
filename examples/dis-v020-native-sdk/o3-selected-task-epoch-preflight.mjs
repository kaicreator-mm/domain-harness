/**
 * R173/O3: only a selected-AOT/SDK local, negative-only task-epoch preflight.
 * TECHNICAL SOURCE PIN != installed Rule, authenticated Host, Task permission,
 * professional Oracle, Experience, positive Replay or Effect authority.
 * No change to the actual AOT/SDK/Host, no execution of dynamic Rule code.
 */
import {types} from 'node:util';
import {getO3FixedRuleTechnicalPin} from './o3-bounded-shadow-interpreter.mjs';
import {makeO3ShadowTaskPin} from './o3-shadow-task-pin.mjs';

const HEX=/^[a-f0-9]{64}$/;
const KEYS=new Set(['app','candidate','expectedAotDigest','expectedRuleDigest',
  'maxWaitMs','maxTasks','maxEpochs']);
const fail=code=>{throw Object.assign(new Error(code),{code})};

/** Capture untrusted caller configuration just once; no accessor/Proxy. */
function capture(options){
  try{
    if(!options||typeof options!=='object'||types.isProxy(options)||
       (Object.getPrototypeOf(options)!==Object.prototype &&
        Object.getPrototypeOf(options)!==null))return null;
    const keys=Reflect.ownKeys(options);
    if(keys.some(k=>typeof k!=='string'||!KEYS.has(k)))return null;
    const result=Object.create(null);
    for(const key of keys){
      const descriptor=Object.getOwnPropertyDescriptor(options,key);
      if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
      result[key]=descriptor.value;
    }
    return result;
  }catch{return null}
}

/** A native facade may have data fields on its prototype, but validation
 * must never run a nested getter/Proxy, including functions/contractVersions.
 * Pin the already-selected method and immutable metadata BEFORE Task creation.
 * This is source-shape hardening, not trusted Host/installer attestation. */
const SELECTED_FN='xdownload.describePolicy';
function selectedOwnOrInheritedData(value,key){
  let cursor=value;
  try{
    while(cursor!==null && cursor!==Object.prototype){
      if(types.isProxy(cursor))fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED');
      const d=Object.getOwnPropertyDescriptor(cursor,key);
      if(d){
        if(!Object.hasOwn(d,'value'))fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED');
        return d.value;
      }
      cursor=Object.getPrototypeOf(cursor);
    }
  }catch{fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED')}
  fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED');
}
function captureSelectedApp(app,expectedAotDigest){
  if(!app||typeof app!=='object'||types.isProxy(app))
    fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED');
  const aotDigest=selectedOwnOrInheritedData(app,'aotDigest');
  if(aotDigest!==expectedAotDigest)fail('O3_PREFLIGHT_SELECTED_AOT_MISMATCH');
  const originalFunctions=selectedOwnOrInheritedData(app,'functions');
  const originalVersions=selectedOwnOrInheritedData(app,'contractVersions');
  const originalInvoke=selectedOwnOrInheritedData(app,'invoke');
  if(!Array.isArray(originalFunctions)||types.isProxy(originalFunctions)||
     originalFunctions.length<1||originalFunctions.length>128||
     !originalVersions||typeof originalVersions!=='object'||
     Array.isArray(originalVersions)||types.isProxy(originalVersions)||
     typeof originalInvoke!=='function')
    fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED');
  const names=[];
  try{
    for(let i=0;i<originalFunctions.length;i++){
      const d=Object.getOwnPropertyDescriptor(originalFunctions,String(i));
      if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string')
        fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED');
      names.push(d.value);
    }
  }catch{fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED')}
  const version=selectedOwnOrInheritedData(originalVersions,SELECTED_FN);
  if(!names.includes(SELECTED_FN)||version!=='1.0.0')
    fail('O3_PREFLIGHT_SELECTED_APP_UNTRUSTED');
  const versions=Object.freeze(Object.assign(Object.create(null),{[SELECTED_FN]:version}));
  return Object.freeze({
    aotDigest,functions:Object.freeze(names),contractVersions:versions,
    invoke:(...args)=>Reflect.apply(originalInvoke,app,args)
  });
}

function noAuthority(reason,more={}){
  return Object.freeze({
    schema:'dis.v0.2.o3-selected-task-epoch-preflight/1',
    status:'NEED_MORE_EVIDENCE',scope:'SHADOW_ONLY',authority:'NONE',
    qualified:false,activationAllowed:false,ruleActivated:false,
    taskAuthorized:false,taskPinPersisted:false,hostAttested:false,
    installedRuleAttested:false,tenantAttested:false,
    experienceIssued:false,effectDispatched:false,
    positiveReplayAllowed:false,reason,...more
  });
}

/**
 * expectedAotDigest checks the selected local app identity, not its trust root.
 * expectedRuleDigest is only the fixed source-owned candidate rule digest.
 * An independently installed/attested Rule or Host pin is NOT accepted here.
 */
export function createO3SelectedTaskEpochPreflight(options){
  const x=capture(options);
  if(!x)fail('O3_PREFLIGHT_OPTIONS_UNTRUSTED');
  const {app,candidate,expectedAotDigest,expectedRuleDigest}=x;
  const fixed=getO3FixedRuleTechnicalPin();
  if(typeof expectedAotDigest!=='string'||!HEX.test(expectedAotDigest))
    fail('O3_PREFLIGHT_SELECTED_AOT_MISMATCH');
  const selectedApp=captureSelectedApp(app,expectedAotDigest);
  if(typeof expectedRuleDigest!=='string'||!HEX.test(expectedRuleDigest)||
     expectedRuleDigest!==fixed.digest)
    fail('O3_PREFLIGHT_TECHNICAL_RULE_MISMATCH');
  // Reuses the strict candidate/source validator and opaque WeakMap task pin.
  const coordinator=makeO3ShadowTaskPin({
    app:selectedApp,candidate,maxWaitMs:x.maxWaitMs??15000,
    maxTasks:x.maxTasks??16,maxEpochs:x.maxEpochs??32
  });
  const identity=Object.freeze({aotDigest:expectedAotDigest,
    technicalRuleDigest:fixed.digest,sourceGitBlob:fixed.sourceGitBlob,
    functionId:fixed.functionId});
  const epochOutput=(reason,x)=>noAuthority(reason,{
    ...identity,taskEpoch:x.epoch??null
  });
  return Object.freeze({
    beginTask:()=>coordinator.beginTask(),
    publishShadowForFutureTasks:()=>epochOutput('SHADOW_EPOCH_PUBLISHED',
      coordinator.publishShadowForFutureTasks()),
    suspendShadowForFutureTasks:()=>epochOutput('SHADOW_EPOCH_SUSPENDED',
      coordinator.suspendShadowForFutureTasks()),
    rollbackShadowTo:epoch=>epochOutput('SHADOW_EPOCH_ROLLED_BACK',
      coordinator.rollbackShadowTo(epoch)),
    async probeTask(token){
      try{
        const observed=await coordinator.probeTask(token);
        return noAuthority(
          typeof observed.reason==='string'&&/^[A-Z0-9_]+$/.test(observed.reason)?
            observed.reason:'SHADOW_OBSERVATION_UNKNOWN',
          {...identity,taskEpoch:Number.isSafeInteger(observed.taskEpoch)?
            observed.taskEpoch:null,shadowMatched:observed.shadowMatched===true}
        );
      }catch{return noAuthority('SHADOW_OBSERVATION_UNKNOWN',identity)}
    },
    revokeEpoch(epoch){
      const r=coordinator.revokeEpoch(epoch);
      return noAuthority('EPOCH_REVOKED',{...identity,revokedEpoch:r.revokedEpoch});
    },
    revokeCandidateDigest(){
      coordinator.revokeCandidateDigest();
      return noAuthority('CANDIDATE_REVOKED',identity);
    },
    close:()=>coordinator.close(),
    state:()=>{
      const state=coordinator.state();
      return noAuthority('PREFLIGHT_STATE',{
        ...identity,taskEpoch:state.currentEpoch,closed:state.closed,
        remaining:state.remaining,candidateRevoked:state.candidateRevoked
      });
    }
  });
}
