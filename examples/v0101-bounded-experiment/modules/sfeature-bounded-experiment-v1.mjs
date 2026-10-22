/**
 * DomainHarness v0.10.1 C04 — bounded experiment proposal, not execution.
 * Pure S feature inspired by Harness² and AutoSaddler. The Host/Business
 * scheduler must independently obtain K admission for any authorized Tool
 * invocation; this module NEVER acquires permissions, opens a sandbox, writes
 * State/Journal or asserts a verifier PASS.
 */
export const MODULE_ID='sfeature-bounded-experiment@v0101.0.0';
export const PACKAGE_KIND='standard-feature';
export const FEATURE_ABI='dh.v10.standard-feature/1';
export const FEATURE_KEY='standard:bounded-experiment/1';
export class ExperimentPlanError extends Error {
  constructor(code){super(code);this.name='ExperimentPlanError';this.code=code;}
}
const BAD=new Set(['__proto__','constructor','prototype','permit','effectPermit',
  'effectIntents','effectJournal','kernelState','hostPorts','resources','write','activate','promote']);
const SHA=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
function fail(code){throw new ExperimentPlanError(code);}
function obj(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('EXPERIMENT_RECORD_INVALID');
  const p=Object.getPrototypeOf(value);
  if(p!==null&&p!==Object.prototype)fail('EXPERIMENT_RECORD_INVALID');
  const keys=Reflect.ownKeys(value);
  if(keys.length>24||keys.some(x=>typeof x!=='string'||BAD.has(x)))fail('EXPERIMENT_RECORD_INVALID');
  for(const key of keys){
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d||!Object.hasOwn(d,'value'))fail('EXPERIMENT_RECORD_INVALID');
  }
  return value;
}
function get(o,k){return Object.getOwnPropertyDescriptor(o,k)?.value;}
function id(v){if(typeof v!=='string'||!v||v.length>256||
  /[\u0000-\u001f]/.test(v)||/^(?:latest|head|\*)$/i.test(v))fail('EXPERIMENT_ID_INVALID');return v;}
function sha(v){if(typeof v!=='string'||!SHA.test(v))fail('EXPERIMENT_SHA_INVALID');return v;}
function boundedInt(v,min,max){
  if(!Number.isSafeInteger(v)||v<min||v>max)fail('EXPERIMENT_BUDGET_INVALID');return v;
}
function arr(a,max=32){
  if(!Array.isArray(a)||a.length>max||Reflect.ownKeys(a).length!==a.length+1)
    fail('EXPERIMENT_LIST_INVALID');
  for(let i=0;i<a.length;i++){const d=Object.getOwnPropertyDescriptor(a,String(i));
    if(!d||!Object.hasOwn(d,'value'))fail('EXPERIMENT_LIST_INVALID');}
  return a;
}
export function init(context){obj(context);return Object.freeze({ok:true,featureKey:FEATURE_KEY,observedContext:Object.freeze({appId:id(get(context,'appId'))})});}
/**
 * plan schema:
 * proposalId, subjectSha, baselineRef, candidateRef, hypothesisRef,
 * environment:'SHADOW'|'ISOLATED_TEST'|'PRODUCTION',
 * risk:'LOW'|'HIGH', isolationEvidenceRef?,
 * maxProbeCalls, maxWallMs, maxCostMicro, verifierRefs:[string],
 * effectPolicy:'DENY_EXTERNAL_EFFECTS'.
 *
 * This is only a static proposal: runtime isolation remains independently
 * provable and a declared isolationRef is not a valid Host attestation.
 */
export function planBoundedExperiment(input){
  obj(input);
  const proposalId=id(get(input,'proposalId'));
  const subjectSha=sha(get(input,'subjectSha'));
  const baselineRef=id(get(input,'baselineRef'));
  const candidateRef=id(get(input,'candidateRef'));
  const hypothesisRef=id(get(input,'hypothesisRef'));
  if(baselineRef===candidateRef)fail('EXPERIMENT_NO_CONTRAST');
  const environment=get(input,'environment'),risk=get(input,'risk');
  if(!['SHADOW','ISOLATED_TEST','PRODUCTION'].includes(environment)
    ||!['LOW','HIGH'].includes(risk))fail('EXPERIMENT_SCOPE_INVALID');
  const effectPolicy=get(input,'effectPolicy');
  if(effectPolicy!=='DENY_EXTERNAL_EFFECTS')fail('EXPERIMENT_EFFECT_POLICY_INVALID');
  const maxProbeCalls=boundedInt(get(input,'maxProbeCalls'),1,32);
  const maxWallMs=boundedInt(get(input,'maxWallMs'),1,3600000);
  const maxCostMicro=boundedInt(get(input,'maxCostMicro'),0,100000000);
  const verifierRefs=arr(get(input,'verifierRefs')).map(id);
  if(new Set(verifierRefs).size!==verifierRefs.length)fail('EXPERIMENT_VERIFIER_DUPLICATE');
  const isolationEvidenceRef=get(input,'isolationEvidenceRef')===undefined
    ? null:id(get(input,'isolationEvidenceRef'));
  const blockers=[];
  if(environment==='PRODUCTION')blockers.push('PRODUCTION_PROBE_FORBIDDEN');
  if(!isolationEvidenceRef)blockers.push('ISOLATION_NOT_ESTABLISHED');
  if(verifierRefs.length===0)blockers.push('NO_VERIFIER_PLAN');
  if(risk==='HIGH'&&environment==='SHADOW'&&!isolationEvidenceRef)
    blockers.push('HIGH_RISK_PROBE_WITHOUT_SHADOW_PROOF');
  return Object.freeze({
    schema:'dh.v0101.bounded-experiment/1',featureKey:FEATURE_KEY,
    proposalId,subjectSha,baselineRef,candidateRef,hypothesisRef,
    authority:'ADVISORY_ONLY',taskGateVerdict:'NOT_DETERMINED',
    disposition:blockers.length?'NOT_ADMISSIBLE_AS_WRITTEN':'READY_FOR_SEPARATE_ADMISSION',
    constraints:Object.freeze({
      environment, risk, effectPolicy:'DENY_EXTERNAL_EFFECTS',
      allowedEffectCount:0,maxProbeCalls,maxWallMs,maxCostMicro,
      verifierRefs:Object.freeze([...verifierRefs]),
      isolationEvidenceRef,
    }),
    blockers:Object.freeze(blockers),
    // This is never physical evidence of zero writes or isolation.
    physicalIsolationVerified:false,
    executionOccurred:false,
  });
}
