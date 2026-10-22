/**
 * v0.10.1 C02: Pure Standard Feature, candidate evaluation evidence comparison.
 * Does not run a verifier, trust an unqualified scorer, issue PASS or promote
 * candidates. A "comparable" claim is always provisional/ADVISORY ONLY.
 */
export const MODULE_ID = 'sfeature-candidate-evaluation@v0101.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:candidate-evaluation/1';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const STATES = new Set(['PASS','FAIL','UNKNOWN','ABORTED','NOT_RUN']);
const KEY_BAD = new Set(['__proto__','constructor','prototype','permit','effectPermit',
  'kernelState','effectJournal','admissionFence','resources','hostPorts','write',
  'activate','promote','selfApprove']);
export class EvaluationEvidenceError extends Error {
  constructor(code) { super(code); this.name='EvaluationEvidenceError'; this.code=code; }
}
function err(code) { throw new EvaluationEvidenceError(code); }
function obj(x) {
  if (!x || typeof x!=='object' || Array.isArray(x)) err('EVAL_RECORD_INVALID');
  const p=Object.getPrototypeOf(x);
  if (p!==null && p!==Object.prototype) err('EVAL_RECORD_INVALID');
  const keys=Reflect.ownKeys(x);
  if (keys.length>24 || keys.some(k=>typeof k!=='string'||KEY_BAD.has(k))) err('EVAL_RECORD_INVALID');
  for (const k of keys) {
    const d=Object.getOwnPropertyDescriptor(x,k);
    if (!d || !Object.hasOwn(d,'value')) err('EVAL_RECORD_INVALID');
  }
  return x;
}
function field(o,k) {
  const d=Object.getOwnPropertyDescriptor(o,k);
  return d && Object.hasOwn(d,'value') ? d.value : undefined;
}
function id(v) {
  if (typeof v!=='string' || v.length<1 || v.length>256 ||
    /[\u0000-\u001f]/.test(v) || /^(?:head|latest|\*)$/i.test(v)) err('EVAL_ID_INVALID');
  return v;
}
function sha(v) { if (typeof v!=='string' || !SHA.test(v)) err('EVAL_SHA_INVALID'); return v; }
function arr(a,max=128) {
  if (!Array.isArray(a) || a.length>max || Reflect.ownKeys(a).length!==a.length+1)
    err('EVAL_LIST_INVALID');
  for(let i=0;i<a.length;i++){
    const d=Object.getOwnPropertyDescriptor(a,String(i));
    if(!d || !Object.hasOwn(d,'value')) err('EVAL_LIST_INVALID');
  }
  return a;
}
export function init(context) {
  obj(context);
  return Object.freeze({ok:true,appId:id(field(context,'appId')),featureKey:FEATURE_KEY});
}
function cohort(raw, expectedSha) {
  arr(raw);
  const map=new Map();
  for(const entry of raw){
    obj(entry);
    const caseId=id(field(entry,'caseId'));
    if(map.has(caseId)) err('EVAL_CASE_DUPLICATE');
    const s=sha(field(entry,'subjectSha'));
    const status=field(entry,'status');
    const coverage=field(entry,'coverage');
    if(!STATES.has(status)||!['COMPLETE','PARTIAL','UNKNOWN'].includes(coverage))
      err('EVAL_OUTCOME_INVALID');
    map.set(caseId,Object.freeze({
      caseId, status, coverage, exactSubject:s===expectedSha,
      sourceRef:id(field(entry,'sourceRef')),
      verifierRef:id(field(entry,'verifierRef')),
    }));
  }
  return map;
}
/**
 * The caller supplies evidence, not privileged attestation:
 * {
 * baselineSha, candidateSha, verifierRevision, holdoutVisibility,
 * oracleChecks: [{kind:'POSITIVE'|'NEGATIVE'|'INDEPENDENT',
 *                status:'PASS'|'FAIL'|'NOT_RUN', sourceRef}],
 * baseline:[{caseId,sourceRef,subjectSha,verifierRef,status,coverage}],
 * candidate:[same...]
 * }
 */
export function evaluateCandidateEvidence(input) {
  obj(input);
  const baselineSha=sha(field(input,'baselineSha'));
  const candidateSha=sha(field(input,'candidateSha'));
  const verifierRevision=id(field(input,'verifierRevision'));
  const holdoutVisibility=field(input,'holdoutVisibility');
  if (!['ISOLATED','LEAKED','UNKNOWN'].includes(holdoutVisibility))
    err('EVAL_HOLDOUT_INVALID');
  const oracles=arr(field(input,'oracleChecks'),8);
  const checked=new Map();
  for (const entry of oracles) {
    obj(entry);
    const kind=field(entry,'kind'), status=field(entry,'status');
    if(!['POSITIVE','NEGATIVE','INDEPENDENT'].includes(kind)
      || !['PASS','FAIL','NOT_RUN'].includes(status)) err('EVAL_ORACLE_INVALID');
    if(checked.has(kind)) err('EVAL_ORACLE_DUPLICATE');
    checked.set(kind,{status,sourceRef:id(field(entry,'sourceRef'))});
  }
  const base=cohort(field(input,'baseline'),baselineSha);
  const cand=cohort(field(input,'candidate'),candidateSha);
  const keys=[...new Set([...base.keys(),...cand.keys()])].sort();
  const differences=[], incomplete=[];
  const totals={baselinePass:0,candidatePass:0,baselineFail:0,candidateFail:0,matched:0};
  for (const caseId of keys) {
    const a=base.get(caseId), b=cand.get(caseId);
    if(!a||!b){incomplete.push(caseId);continue;}
    totals.matched++;
    if(!a.exactSubject || !b.exactSubject || a.verifierRef!==b.verifierRef ||
      a.coverage!=='COMPLETE'||b.coverage!=='COMPLETE' ||
      !['PASS','FAIL'].includes(a.status)||!['PASS','FAIL'].includes(b.status)){
      incomplete.push(caseId);continue;
    }
    if(a.status==='PASS') totals.baselinePass++;
    else totals.baselineFail++;
    if(b.status==='PASS') totals.candidatePass++;
    else totals.candidateFail++;
    if(a.status!==b.status) differences.push(Object.freeze({caseId,from:a.status,to:b.status}));
  }
  const reasons=[];
  if(holdoutVisibility==='LEAKED') reasons.push('HIDDEN_ORACLE_EXPOSED');
  if(holdoutVisibility==='UNKNOWN') reasons.push('HIDDEN_ORACLE_VISIBILITY_UNKNOWN');
  for(const kind of ['POSITIVE','NEGATIVE','INDEPENDENT']){
    const item=checked.get(kind);
    if(!item||item.status!=='PASS') reasons.push('ORACLE_'+kind+'_NOT_CONFIRMED');
  }
  if(!keys.length) reasons.push('EMPTY_COHORT');
  if(incomplete.length) reasons.push('COHORT_NOT_COMPARABLE');
  const disposition=reasons.includes('HIDDEN_ORACLE_EXPOSED')
    || [...checked.values()].some(value => value.status==='FAIL')
    ? 'INVALID_EVALUATION'
    : reasons.length ? 'INCONCLUSIVE' : 'PROVISIONALLY_COMPARABLE';
  // Deliberately suppress numerical "wins" if comparability fails.
  return Object.freeze({
    schema:'dh.v0101.candidate-evaluation/1',featureKey:FEATURE_KEY,
    baselineSha,candidateSha,verifierRevision,holdoutVisibility,
    oracleEvidence:Object.freeze([...checked.entries()].map(([kind,value]) => Object.freeze({
      kind,status:value.status,sourceRef:value.sourceRef,
    }))),
    authority:'ADVISORY_ONLY', taskGateVerdict:'NOT_DETERMINED',
    disposition, cohortSize:keys.length,
    comparedCaseCount:reasons.length?0:totals.matched,
    observedDifference:reasons.length?null:Object.freeze({
      baselinePass:totals.baselinePass,candidatePass:totals.candidatePass,
      passDifference:totals.candidatePass-totals.baselinePass,
      changes:Object.freeze(differences),
    }),
    incompleteCaseIds:Object.freeze(incomplete),
    reasons:Object.freeze(reasons),
  });
}
