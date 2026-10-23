/**
 * v0.10.1 C03 — reusable experience applicability projection.
 * Pure Standard Feature, no Memory/Graph database and no provenance authority.
 * Only source-qualified candidates are offered for human/app policy review.
 */
export const MODULE_ID='sfeature-experience-reuse@v0101.0.0';
export const PACKAGE_KIND='standard-feature';
export const FEATURE_ABI='dh.v10.standard-feature/1';
export const FEATURE_KEY='standard:experience-reuse/1';
class ExperienceInputError extends Error {
  constructor(code){super(code);this.name='ExperienceInputError';this.code=code;}
}
const BAD=new Set(['__proto__','constructor','prototype','permit','effectPermit','kernelState',
  'effectJournal','admissionFence','hostPorts','resources','write','activate','promote']);
const SHA=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
function fail(code){throw new ExperienceInputError(code);}
function obj(value){
  if(!value || typeof value!=='object'||Array.isArray(value))fail('EXP_RECORD_INVALID');
  const p=Object.getPrototypeOf(value);
  if(p!==null&&p!==Object.prototype)fail('EXP_RECORD_INVALID');
  const keys=Reflect.ownKeys(value);
  if(keys.length>24||keys.some(x=>typeof x!=='string'||BAD.has(x)))fail('EXP_RECORD_INVALID');
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d||!Object.hasOwn(d,'value'))fail('EXP_RECORD_INVALID');}
  return value;
}
function get(o,key){const d=Object.getOwnPropertyDescriptor(o,key);return d?.value;}
function str(x){if(typeof x!=='string'||!x||x.length>256||
  // eslint-disable-next-line no-control-regex -- intentional C0 control-character rejection
  /[\u0000-\u001f]/.test(x)||/^(?:head|latest|\*)$/i.test(x))fail('EXP_ID_INVALID');return x;}
function sha(x){if(typeof x!=='string'||!SHA.test(x))fail('EXP_SHA_INVALID');return x;}
function arr(a,max=64){
  if(!Array.isArray(a)||a.length>max||Reflect.ownKeys(a).length!==a.length+1)fail('EXP_LIST_INVALID');
  for(let i=0;i<a.length;i++){const d=Object.getOwnPropertyDescriptor(a,String(i));
    if(!d||!Object.hasOwn(d,'value'))fail('EXP_LIST_INVALID');}
  return a;
}
export function init(context){obj(context);return Object.freeze({ok:true,featureKey:FEATURE_KEY,observedContext:Object.freeze({appId:str(get(context,'appId'))})});}
/**
 * Projection only. A candidate's reported verifier fact is not a Kernel or
 * ADS authoritative PASS; current Source/Rule identity must be checked by
 * the consuming Business before adoption.
 */
export function assessExperienceApplicability(input){
  obj(input);
  const current=obj(get(input,'current'));
  const projectId=str(get(current,'projectId'));
  const taskClass=str(get(current,'taskClass'));
  const currentSha=sha(get(current,'subjectSha'));
  const ruleRevision=str(get(current,'ruleRevision'));
  const raw=arr(get(input,'candidates'));
  const candidates=[];
  for(const item of raw){
    obj(item);
    const candidateId=str(get(item,'candidateId'));
    const candidateSha=sha(get(item,'candidateSha'));
    const evidence=get(item,'evidence');
    if(!['INDEPENDENT_PASS','CLAIMED','FAIL','UNKNOWN'].includes(evidence))fail('EXP_EVIDENCE_INVALID');
    const counterexampleRefs=arr(get(item,'counterexampleRefs')??[],16).map(str);
    const compatibilityRef=get(item,'compatibilityRef');
    candidates.push({
      candidateId,candidateSha,sourceRef:str(get(item,'sourceRef')),
      projectId:str(get(item,'projectId')),taskClass:str(get(item,'taskClass')),
      ruleRevision:str(get(item,'ruleRevision')),evidence,
      counterexampleRefs,compatibilityRef:compatibilityRef===undefined?null:str(compatibilityRef),
    });
  }
  const counts=new Map();
  for(const c of candidates)counts.set(c.candidateId,(counts.get(c.candidateId)||0)+1);
  const reviewCandidates=[],notApplicable=[],uncertain=[];
  for(const c of candidates){
    const reasons=[];
    if(counts.get(c.candidateId)!==1)reasons.push('DUPLICATE_CANDIDATE_IDENTITY');
    if(c.projectId!==projectId)reasons.push('PROJECT_SCOPE_MISMATCH');
    if(c.taskClass!==taskClass)reasons.push('TASK_CLASS_MISMATCH');
    if(c.ruleRevision!==ruleRevision)reasons.push('CURRENT_RULE_CONFLICT');
    if(c.counterexampleRefs.length)reasons.push('NEGATIVE_EVIDENCE_PRESENT');
    if(c.evidence==='FAIL')reasons.push('KNOWN_FAILED_CANDIDATE');
    const uncertainReasons=[];
    if(c.evidence!=='INDEPENDENT_PASS')uncertainReasons.push('VERIFICATION_NOT_ESTABLISHED');
    // A caller-supplied compatibilityRef is only a reference, not an
    // independently attested current->candidate equivalence proof.
    // Until a trusted verifier receipt is explicitly contracted, fail closed
    // for every cross-SHA candidate (even when a ref string is supplied).
    if(c.candidateSha!==currentSha)
      uncertainReasons.push('SOURCE_COMPATIBILITY_UNKNOWN');
    const result=Object.freeze({
      candidateId:c.candidateId,candidateSha:c.candidateSha,
      sourceRef:c.sourceRef,compatibilityRef:c.compatibilityRef,
      reasons:Object.freeze([...reasons,...uncertainReasons]),
    });
    if(reasons.length)notApplicable.push(result);
    else if(uncertainReasons.length)uncertain.push(result);
    else reviewCandidates.push(Object.freeze({
      candidateId:c.candidateId,candidateSha:c.candidateSha,
      sourceRef:c.sourceRef,compatibilityRef:c.compatibilityRef,
      classification:'REVIEW_CANDIDATE_ONLY',
    }));
  }
  return Object.freeze({
    schema:'dh.v0101.experience-reuse/1',featureKey:FEATURE_KEY,
    authority:'ADVISORY_ONLY',adoptionVerdict:'NOT_DETERMINED',
    currentSubjectSha:currentSha,
    reviewCandidates:Object.freeze(reviewCandidates),
    uncertain:Object.freeze(uncertain),
    notApplicable:Object.freeze(notApplicable),
  });
}
