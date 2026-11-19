/**
 * DIS 0.2.0 R211 O2 / OPT-002 privacy-local consent boundary, R0.
 *
 * Trace data stays inside the local boundary. Export is fail-closed: without
 * an explicit consent record for the subject cohort it is denied; with
 * consent it still only becomes a reviewable submission candidate
 * (exportAllowed stays false - consent never causes implicit export).
 * Independent Validator access to a trace is likewise consent-gated: a
 * validator identity, even a technically admitted one, cannot read trace
 * data for a cohort without a recorded consent grant.
 */
const TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const plain=x=>{
 try{return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null)}
 catch{return false}
};
const own=(x,k)=>{
 try{
  const d=Object.getOwnPropertyDescriptor(x,k);
  return d&&Object.hasOwn(d,'value')?d.value:undefined;
 }catch{return undefined}
};
const deny=(reason,extra={})=>Object.freeze({
 status:'DENIED',reason,exportAllowed:false,authority:'NONE',...extra
});
const release=Object.freeze({
 status:'RELEASED_LOCAL_ONLY',reason:'CONSENT_RECORD_PRESENT_LOCAL_RELEASE',
 exportAllowed:false,authority:'NONE'
});

export function createOpt002ConsentLedger(){
 const records=new Map();
 return Object.freeze({
  issue({consentId,subjectCohort,purpose,grantedBy}){
   if(typeof consentId!=='string'||!TOKEN.test(consentId)||
      typeof subjectCohort!=='string'||subjectCohort.length===0||subjectCohort.length>512||
      subjectCohort.trim()!==subjectCohort||subjectCohort.normalize('NFC')!==subjectCohort||
      /[\u0000-\u001f\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(subjectCohort)||
      typeof purpose!=='string'||!TOKEN.test(purpose)||
      typeof grantedBy!=='string'||!TOKEN.test(grantedBy))
    throw Error('OPT002_CONSENT_RECORD_INVALID');
   if(records.has(consentId))throw Error('OPT002_CONSENT_DUPLICATE');
   const record=Object.freeze({consentId,subjectCohort,purpose,grantedBy});
   records.set(consentId,record);
   return record;
  },
  hasConsentFor(subjectCohort){
   if(typeof subjectCohort!=='string')return false;
   for(const record of records.values())
    if(record.subjectCohort===subjectCohort)return true;
   return false;
  },
  get(consentId){return records.get(consentId)??null}
 });
}

/**
 * Consent gate for independent Validator trace access. A missing consent
 * record fails closed even when every engineering check upstream passed.
 */
export function guardOpt002ValidatorAccess({ledger=null,subjectCohort,traceSummary=null}={}){
 if(!ledger||typeof ledger.hasConsentFor!=='function'||typeof subjectCohort!=='string')
  return deny('VALIDATOR_ACCESS_ARGUMENTS_INVALID');
 if(traceSummary!==null&&!plain(traceSummary))
  return deny('VALIDATOR_ACCESS_ARGUMENTS_INVALID');
 if(!ledger.hasConsentFor(subjectCohort))
  return deny('VALIDATOR_ACCESS_DENIED_NO_CONSENT',{subjectCohort});
 return release;
}

/**
 * Export gate. local-only scope is mandatory. Consent + sanitized creates a
 * reviewable submission candidate; anything else is denied. exportAllowed is
 * never set true by this module.
 */
export function guardOpt002Export({ledger=null,subjectCohort,sanitized=false}={}){
 if(!ledger||typeof ledger.hasConsentFor!=='function'||typeof subjectCohort!=='string')
  return deny('EXPORT_ARGUMENTS_INVALID');
 if(!ledger.hasConsentFor(subjectCohort))
  return deny('EXPORT_DENIED_NO_CONSENT',{subjectCohort});
 if(sanitized!==true)return deny('EXPORT_DENIED_UNSANITIZED',{subjectCohort});
 return Object.freeze({
  status:'SUBMISSION_REVIEW_REQUIRED',reason:'CONSENT_RECORD_PRESENT_REVIEW_REQUIRED',
  exportAllowed:false,authority:'NONE'
 });
}
