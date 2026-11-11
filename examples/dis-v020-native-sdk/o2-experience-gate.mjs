/**
 * DIS v0.2.0 O2/D06 bounded Experience gate, R0.
 *
 * This is deliberately a fail-closed readiness consumer, not an Experience
 * issuer. The current DIS SDK returns source-pinned LOCAL observations with
 * attested:false and exposes no trusted invocation Trace or receipt verifier.
 * Until those authorities exist, all inputs remain LearningObservation /
 * NEED_MORE_EVIDENCE. No cache, KDP permit, Effect, export or promotion occurs.
 */
export const CONTRACT=Object.freeze({
 schema:'dis.v0.2.function-contract/1',version:'1.0.0',
 input:{type:'record',fields:{observation:'record',traceReceipt:'record',validatorReceipt:'record',context:'record'},optional:['traceReceipt','validatorReceipt','context'],additionalProperties:false},
 output:{type:'record',fields:{
  status:'string',reason:'string',experienceIssued:'boolean',
  observedDisposition:'string',sourceId:'string',sourceGitBlob:'string',
  contractVersion:'string',traceLinked:'boolean',validatorLinked:'boolean',
  privacyScope:'string',exportAllowed:'boolean',evidenceRefs:'array'
 },optional:[],additionalProperties:false},
 outcomes:{field:'status',classes:{NEED_MORE_EVIDENCE:'UNKNOWN'}},
 evidence:{refField:'evidenceRefs',requiredFor:[]},
 compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
});
const plain=x=>{
 try{return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null)}
 catch{return false}
};
const read=(x,k)=>{
 try{
  if(!plain(x))return undefined;
  const d=Object.getOwnPropertyDescriptor(x,k);
  return d&&Object.hasOwn(d,'value')?d.value:undefined;
 }catch{return undefined}
};
const safeArray=value=>{
 try{
  if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)return null;
  const result=[];
  for(let i=0;i<value.length;i++){
   const d=Object.getOwnPropertyDescriptor(value,String(i));
   if(!d||!Object.hasOwn(d,'value'))return null;
   result.push(d.value);
  }
  return result;
 }catch{return null}
};
const validText=x=>typeof x==='string'&&x.length>0&&x.length<=512&&!/[\u0000-\u001f]/.test(x);
const validGit=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const VERSION_KEYS=Object.freeze([
 'contractDigest','implementationDigest','knowledgeDigest','packageDigest',
 'targetProfile','contextEpoch','validatorDigest','featureProfileDigest',
 'scope','privacyScope'
]);
/**
 * Native DIS currently supplies provenance, not a trusted run receipt or
 * independent business-attestation API. Never upgrade its observation to
 * VERIFIED_EXPERIENCE based on caller-provided JSON flags.
 */
export function assessExperience(input){
 const observation=read(input,'observation');
 const traceReceipt=read(input,'traceReceipt');
 const validatorReceipt=read(input,'validatorReceipt');
 const context=read(input,'context');
 let reason='NATIVE_OBSERVATION_INVALID';
 let disposition='UNKNOWN',sourceId='',sourceGitBlob='',contractVersion='';
 const evidence=read(observation,'evidence');
 const source=read(evidence,'source');
 const isObservation=plain(observation)&&
  read(observation,'kind')==='OBSERVATION'&&read(observation,'authority')==='NONE';
 if(isObservation){
  disposition=validText(read(observation,'disposition'))?read(observation,'disposition'):'UNKNOWN';
  sourceId=validText(read(source,'sourceId'))?read(source,'sourceId'):'';
  sourceGitBlob=validGit(read(source,'gitBlob'))?read(source,'gitBlob'):'';
  contractVersion=validText(read(observation,'contractVersion'))?read(observation,'contractVersion'):'';
  if(read(evidence,'attested')!==true)reason='SOURCE_PROVENANCE_IS_NOT_BUSINESS_ATTESTATION';
  else if(!plain(traceReceipt))reason='TRUSTED_EXECUTION_TRACE_RECEIPT_MISSING';
  else if(!plain(validatorReceipt))reason='INDEPENDENT_VALIDATOR_RECEIPT_MISSING';
  else reason='TRUSTED_RECEIPT_VERIFIER_NOT_IMPLEMENTED';
 }
 const traceLinked=plain(traceReceipt);
 const validatorLinked=plain(validatorReceipt);
 const refs=sourceId&&sourceGitBlob?[sourceId+':'+sourceGitBlob]:[];
 // A caller-supplied "PASS", "attested", or signature-shaped field is not
 // accepted: no issuer key/verifier is currently selected in the DIS SDK.
 if(plain(context)&&read(context,'privacyScope')!=='local-only')
  reason='EXPERIENCE_SCOPE_NOT_LOCAL_ONLY';
 return Object.freeze({
  status:'NEED_MORE_EVIDENCE',reason,experienceIssued:false,
  observedDisposition:disposition,sourceId,sourceGitBlob,contractVersion,
  traceLinked,validatorLinked,privacyScope:'local-only',
  exportAllowed:false,evidenceRefs:Object.freeze(refs)
 });
}
/**
 * Count at most one contribution per connected source-cohort / case / run.
 * Cache hits and retries are never independent cases. Missing lineage is
 * excluded rather than guessed independent.
 */
export function dedupeIndependentCases(rows){
 const values=safeArray(rows);
 if(!values)throw new TypeError('O2_CASE_LIST_INVALID');
 const parent=new Map(),find=x=>{
  if(!parent.has(x))parent.set(x,x);
  const p=parent.get(x);if(p!==x)parent.set(x,find(p));return parent.get(x);
 };
 const union=(a,b)=>{const x=find(a),y=find(b);if(x!==y)parent.set(x<y?y:x,x<y?x:y)};
 const cohortByCase=new Map(),cohortByRun=new Map(),excluded=[],eligible=[];
 for(const row of values){
  if(!plain(row))throw new TypeError('O2_CASE_INVALID');
  const cacheHit=read(row,'cacheHit'),retryFlag=read(row,'retry');
  const replay=cacheHit===true||retryFlag===true;
  const replayFlagInvalid=(cacheHit!==undefined&&typeof cacheHit!=='boolean')||
   (retryFlag!==undefined&&typeof retryFlag!=='boolean');
  const cohort=read(row,'sourceCohort'),caseKey=read(row,'independentCaseKey'),runId=read(row,'runId');
  if(!validText(cohort)||!validText(caseKey)||!validText(runId)){
   excluded.push(Object.freeze({reason:replay?'CACHE_OR_RETRY_NOT_INDEPENDENT':'SOURCE_LINEAGE_INCOMPLETE'}));continue;
  }
  find(cohort);
  if(cohortByCase.has(caseKey))union(cohort,cohortByCase.get(caseKey));
  else cohortByCase.set(caseKey,cohort);
  if(cohortByRun.has(runId))union(cohort,cohortByRun.get(runId));
  else cohortByRun.set(runId,cohort);
  // Replays join the same lineage graph but never earn independent credit.
  if(replayFlagInvalid)excluded.push(Object.freeze({reason:'REPLAY_FLAG_INVALID'}));
  else if(replay)excluded.push(Object.freeze({reason:'CACHE_OR_RETRY_NOT_INDEPENDENT'}));
  else eligible.push(cohort);
 }
 const roots=new Set(eligible.map(find));
 return Object.freeze({
  independentCohortCount:roots.size,
  cohorts:Object.freeze([...roots].sort()),
  excluded:Object.freeze(excluded)
 });
}
/** Synthesis/Holdout/Negative must be disjoint by source cohort, not row ID. */
export function validateCohortPartition(partitions){
 if(!plain(partitions))throw new TypeError('O2_PARTITION_INVALID');
 const names=['synthesis','holdout','negative'],owners=new Map(),cases=new Map(),runs=new Map(),groups=Object.create(null);
 for(const name of names){
  const rows=safeArray(read(partitions,name));
  if(!rows)return Object.freeze({status:'UNKNOWN',disjoint:false,reason:'PARTITION_MISSING_OR_INVALID'});
  groups[name]=rows;
  for(const row of rows){
   const cohort=plain(row)?read(row,'sourceCohort'):undefined;
   if(!validText(cohort))return Object.freeze({status:'UNKNOWN',disjoint:false,reason:'SOURCE_COHORT_MISSING'});
   if(owners.has(cohort)&&owners.get(cohort)!==name)
    return Object.freeze({status:'LEAKED',disjoint:false,reason:'SOURCE_COHORT_CROSSES_PARTITIONS'});
   owners.set(cohort,name);
   // Declared cohort aliases cannot mask overlapping case/run lineage.
   // This is a structural check, not an authenticated independent holdout.
   for(const [field,seen] of [['independentCaseKey',cases],['runId',runs]]){
    const key=read(row,field);
    if(key===undefined)continue;
    if(!validText(key))return Object.freeze({status:'UNKNOWN',disjoint:false,reason:'PARTITION_LINEAGE_INVALID'});
    if(seen.has(key)&&seen.get(key)!==name)
     return Object.freeze({status:'LEAKED',disjoint:false,reason:'CASE_OR_RUN_CROSSES_PARTITIONS'});
    seen.set(key,name);
   }
  }
 }
 if(!groups.synthesis.length||!groups.holdout.length||!groups.negative.length)
  return Object.freeze({status:'NEED_MORE_EVIDENCE',disjoint:true,reason:'PARTITION_EMPTY'});
 return Object.freeze({status:'DISJOINT',disjoint:true,reason:'DECLARED_COHORTS_DISJOINT_UNATTESTED'});
}
/**
 * Compatibility classification only. It never authorizes reuse because
 * there is no trusted Experience/validator receipt verifier in this profile.
 */
export function classifyReuse(candidate,current){
 if(!plain(candidate)||!plain(current))return Object.freeze({decision:'UNKNOWN',reusable:false});
 for(const key of VERSION_KEYS){
  if(!validText(read(candidate,key))||!validText(read(current,key))||
     read(candidate,key)!==read(current,key))
   return Object.freeze({decision:'INVALIDATED_VERSION_OR_SCOPE',reusable:false});
 }
 if(read(candidate,'reuseKind')==='RESULT_REUSE'){
  if(read(candidate,'inputDigest')!==read(current,'inputDigest'))
   return Object.freeze({decision:'RESULT_INPUT_MISMATCH',reusable:false});
  if(read(current,'externalFact')===true||read(candidate,'immutable')!==true||
     read(current,'currentness')!=='CURRENT')
   return Object.freeze({decision:'RESULT_REQUIRES_FRESH_READ',reusable:false});
  return Object.freeze({decision:'RESULT_REUSE_BLOCKED_UNVERIFIED_EXPERIENCE',reusable:false});
 }
 if(read(candidate,'reuseKind')==='METHOD_REUSE'){
  if(!validText(read(candidate,'methodSignature'))||
     read(candidate,'methodSignature')!==read(current,'methodSignature'))
   return Object.freeze({decision:'METHOD_SIGNATURE_MISMATCH',reusable:false});
  return Object.freeze({
   decision:'METHOD_REUSE_REEXECUTE_AND_REVALIDATE',reusable:false,
   mustReexecute:true,mustRevalidate:true,effectReplay:false
  });
 }
 return Object.freeze({decision:'REUSE_KIND_UNSUPPORTED',reusable:false});
}
/** Default local-only. Consent only creates a reviewable submission candidate. */
export function classifyExport(input={}){
 const consent=read(input,'consent')===true;
 const sanitized=read(input,'sanitized')===true;
 const scope=read(input,'scope')??'local-only';
 if(scope!=='local-only'||!consent||!sanitized)
  return Object.freeze({decision:'LOCAL_ONLY',exportAllowed:false});
 return Object.freeze({decision:'SUBMISSION_REVIEW_REQUIRED',exportAllowed:false});
}
