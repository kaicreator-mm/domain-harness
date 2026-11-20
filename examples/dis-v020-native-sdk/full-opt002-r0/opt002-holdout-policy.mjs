/**
 * DIS 0.2.0 R211 O2 / OPT-002 executable holdout + reuse policy, R0.
 *
 * A holdout registry makes source-vs-holdout disjointness and the
 * no-second-use rule executable across calls: a cohort (or any case/run
 * linked to it) registered once — in any role — can never be claimed again,
 * and a holdout cohort can never be claimed as source. The METHOD/RESULT
 * reuse policy consumes this registry: METHOD reuse can only ever request
 * re-execution and revalidation; RESULT reuse additionally requires a
 * holdout verification record bound to the holdout cohort and input digest.
 *
 * Honesty boundary: a structurally verified holdout record is engineering
 * evidence only (signed by a pinned key that is NOT an independent business
 * Validator). RESULT reuse therefore stays blocked with
 * EXTERNAL_AUTHORITY_MISSING even when the structural check passes; the two
 * block reasons are distinct so both policy paths are executable.
 */
import {createPublicKey,verify} from 'node:crypto';
import {types} from 'node:util';

const HOLDOUT_VERSION='dis.opt002.holdout-verification/1';
const HEX=/^[a-f0-9]{64}$/,TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const SIG=/^[A-Za-z0-9_-]{86}$/;
const ROLES=Object.freeze(['synthesis','holdout','negative']);
const VERSION_KEYS=Object.freeze(['contractDigest','targetProfile','scope','privacyScope']);
const blocked=(decision,extra={})=>Object.freeze({
 decision,reusable:false,effectReplay:false,exportAllowed:false,
 authority:'NONE',structuralHoldoutVerified:false,...extra
});
const plain=x=>{
 try{
  if(!x||typeof x!=='object'||Array.isArray(x)||types.isProxy(x)||
     Object.getPrototypeOf(x)!==Object.prototype)return false;
  return Reflect.ownKeys(x).every(k=>{
   const d=Object.getOwnPropertyDescriptor(x,k);
   return typeof k==='string'&&d?.enumerable===true&&Object.hasOwn(d,'value');
  });
 }catch{return false}
};
const own=(x,k)=>Object.getOwnPropertyDescriptor(x,k)?.value;
const validText=x=>typeof x==='string'&&x.length>0&&x.length<=512&&!/[\u0000-\u001f]/.test(x);
const validLineageId=x=>validText(x)&&x.trim()===x&&
 x.normalize('NFC')===x&&!/[\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(x);

export function createOpt002HoldoutRegistry(){
 const owners=new Map(),cases=new Map(),runs=new Map(),used=new Map();
 const leak=reason=>Object.freeze({status:'LEAKED',disjoint:false,reason});
 const refuse=reason=>Object.freeze({status:'REFUSED',reason});
 const checkRow=(row,role)=>{
  if(!plain(row)||!validLineageId(own(row,'sourceCohort')))
   return Object.freeze({status:'UNKNOWN',disjoint:false,reason:'SOURCE_COHORT_MISSING'});
  const cohort=own(row,'sourceCohort');
  if(owners.has(cohort)&&owners.get(cohort)!==role)return leak('SOURCE_COHORT_CROSSES_SETS');
  owners.set(cohort,role);
  for(const [field,seen] of [['independentCaseKey',cases],['runId',runs]]){
   const key=own(row,field);
   if(key===undefined)continue;
   if(!validLineageId(key))return Object.freeze({status:'UNKNOWN',disjoint:false,reason:'LINEAGE_ID_INVALID'});
   if(seen.has(key)&&seen.get(key)!==role)return leak('CASE_OR_RUN_CROSSES_SETS');
   seen.set(key,role);
  }
  return null;
 };
 return Object.freeze({
  registerPartition({synthesis=[],holdout=[],negative=[]}={}){
   const groups={synthesis,holdout,negative};
   for(const role of ROLES){
    if(!Array.isArray(groups[role]))
     return Object.freeze({status:'UNKNOWN',disjoint:false,reason:'PARTITION_SET_INVALID'});
    for(const row of groups[role]){const bad=checkRow(row,role);if(bad)return bad}
   }
   // Partition declaration records role ownership only; actual usage is
   // claimed through claimUsage, which enforces the no-second-use rule.
   return Object.freeze({status:'DISJOINT',disjoint:true,reason:'DECLARED_COHORTS_DISJOINT_UNATTESTED'});
  },
  claimUsage({sourceCohort,role}){
   if(!validLineageId(sourceCohort)||!ROLES.includes(role))
    return refuse('USAGE_CLAIM_INVALID');
   const heldRole=owners.get(sourceCohort);
   if(heldRole!==undefined&&heldRole!==role)
    return refuse(heldRole==='holdout'&&role==='synthesis'
     ?'HOLDOUT_DATA_USE_AS_SOURCE_REFUSED'
     :'SOURCE_COHORT_ROLE_CONFLICT');
   if(used.has(sourceCohort))return refuse('SOURCE_DATA_SECOND_USE_REFUSED');
   used.set(sourceCohort,Object.freeze({role,at:'claim'}));
   return Object.freeze({status:'REGISTERED',sourceCohort,role});
  },
  isHeldOut(sourceCohort){return owners.get(sourceCohort)==='holdout'},
  usageOf(sourceCohort){return used.get(sourceCohort)??null}
 });
}

/**
 * METHOD/RESULT reuse policy. `current` and `candidate` must carry the exact
 * version keys plus reuseKind; `candidate.inputDigest` (RESULT) or
 * `candidate.methodSignature` (METHOD) binds the reuse request.
 * `holdoutVerification`, when present, is {payload,signature} over
 * HOLDOUT_VERSION fields signed by the pinned `validatorPublicKey`.
 */
export function evaluateOpt002Reuse({registry=null,candidate,current,holdoutVerification=null,validatorPublicKey=null}={}){
 if(!plain(candidate)||!plain(current))return blocked('REUSE_RECORDS_INVALID');
 for(const key of VERSION_KEYS){
  if(!validText(own(candidate,key))||!validText(own(current,key))||own(candidate,key)!==own(current,key))
   return blocked('INVALIDATED_VERSION_OR_SCOPE',{detail:key});
 }
 if(own(candidate,'privacyScope')!=='local-only'||own(current,'privacyScope')!=='local-only')
  return blocked('INVALIDATED_VERSION_OR_SCOPE',{detail:'privacyScope'});
 const kind=own(candidate,'reuseKind');
 if(kind==='METHOD_REUSE'){
  if(!validText(own(candidate,'methodSignature'))||
     own(candidate,'methodSignature')!==own(current,'methodSignature'))
   return blocked('METHOD_SIGNATURE_MISMATCH');
  return blocked('METHOD_REUSE_REEXECUTE_AND_REVALIDATE',{mustReexecute:true,mustRevalidate:true});
 }
 if(kind!=='RESULT_REUSE')return blocked('REUSE_KIND_UNSUPPORTED');
 if(typeof own(candidate,'inputDigest')!=='string'||!HEX.test(own(candidate,'inputDigest'))||
    own(candidate,'inputDigest')!==own(current,'inputDigest'))
  return blocked('RESULT_INPUT_MISMATCH');
 if(own(current,'externalFact')===true||own(candidate,'immutable')!==true||
    own(current,'currentness')!=='CURRENT')
  return blocked('RESULT_REQUIRES_FRESH_READ');
 if(holdoutVerification===null)return blocked('RESULT_REUSE_BLOCKED_HOLDOUT_UNVERIFIED');
 if(!plain(holdoutVerification)||!plain(own(holdoutVerification,'payload'))||
    typeof own(holdoutVerification,'signature')!=='string'||!SIG.test(own(holdoutVerification,'signature')))
  return blocked('HOLDOUT_VERIFICATION_MALFORMED');
 const p=own(holdoutVerification,'payload');
 if(!plain(p)||p.version!==HOLDOUT_VERSION||typeof p.scope!=='string'||!TOKEN.test(p.scope)||
    !validLineageId(p.holdoutCohort)||typeof p.inputDigest!=='string'||!HEX.test(p.inputDigest)||
    p.inputDigest!==own(candidate,'inputDigest')||typeof p.ruleDigest!=='string'||!HEX.test(p.ruleDigest)||
    !['PASS','FAIL','UNKNOWN'].includes(p.verdict)||p.authority!=='TECHNICAL_VALIDATION_ONLY'||
    p.experienceIssued!==false||p.effectDispatched!==false)
  return blocked('HOLDOUT_VERIFICATION_SCHEMA_INVALID');
 if(registry!==null&&typeof registry.isHeldOut==='function'&&!registry.isHeldOut(p.holdoutCohort))
  return blocked('HOLDOUT_COHORT_NOT_REGISTERED');
 let key=null;
 try{key=validatorPublicKey?.type==='public'?validatorPublicKey:createPublicKey(validatorPublicKey)}catch{}
 if(!key||key.asymmetricKeyType!=='ed25519')
  return blocked('HOLDOUT_VERIFICATION_KEY_NOT_PINNED');
 let signed=false;
 try{
  signed=verify(null,Buffer.from(JSON.stringify(p)),key,Buffer.from(own(holdoutVerification,'signature'),'base64url'));
 }catch{return blocked('HOLDOUT_VERIFICATION_SIGNATURE_INVALID')}
 if(!signed)return blocked('HOLDOUT_VERIFICATION_SIGNATURE_INVALID');
 if(p.verdict!=='PASS')return blocked('HOLDOUT_VERDICT_NOT_PASS');
 // Structural holdout verification passed — but the pinned key is not an
 // independent business Validator. RESULT reuse remains blocked, precisely.
 return blocked('RESULT_REUSE_BLOCKED_INDEPENDENT_BUSINESS_VALIDATION_MISSING',{
  reason:'EXTERNAL_AUTHORITY_MISSING',structuralHoldoutVerified:true,holdoutCohort:p.holdoutCohort
 });
}

export const OPT002_HOLDOUT_VERSION=HOLDOUT_VERSION;
