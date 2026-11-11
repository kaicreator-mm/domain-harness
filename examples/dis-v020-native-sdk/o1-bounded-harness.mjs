/**
 * O1/R94 Demo bridge: real selected DIS AOT/SDK Knowledge first, then an
 * explicitly bounded fixture provider. It is NOT a production Harness ABI,
 * an AOT-pinned provider, a real LLM, or a semantic/Effect authorization.
 */
const fail=code=>{throw Object.assign(new Error(code),{code})};
const SELECTED_POLICY_FUNCTION='xdownload.describePolicy';
const SELECTED_POLICY_SOURCE=Object.freeze({sourceId:'xdownload-business',gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'});
const hasSelectedNativeApp=app=>Array.isArray(app?.functions)&&
 app.functions.includes(SELECTED_POLICY_FUNCTION)&&
 app?.contractVersions?.[SELECTED_POLICY_FUNCTION]==='1.0.0';
function isSelectedPolicyObservation(app,observed){
 const source=observed?.evidence?.source;
 return hasSelectedNativeApp(app)&&
  observed?.kind==='OBSERVATION'&&observed?.disposition==='OBSERVED'&&
  observed?.authority==='NONE'&&observed?.contractVersion==='1.0.0'&&
  observed?.value?.domainId==='downloads'&&observed?.evidence?.attested===false&&
  source?.sourceId===SELECTED_POLICY_SOURCE.sourceId&&
  typeof source.sha256==='string'&&/^[a-f0-9]{64}$/.test(source.sha256)&&
  source.gitBlob===SELECTED_POLICY_SOURCE.gitBlob;
}
const outcome=(reason,suggestion=null)=>Object.freeze({
 kind:'OBSERVATION',disposition:'UNKNOWN',authority:'NONE',
 effectDispatched:false,reason,suggestion,qualified:false
});
function inspectSuggestion(value){
 try{
  if(value===null||typeof value!=='object')return null;
  if(Object.getPrototypeOf(value)!==Object.prototype)return null;
  if(Reflect.ownKeys(value).length!==1)return null;
  const descriptor=Object.getOwnPropertyDescriptor(value,'suggestion');
  const suggestion=descriptor?.value;
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof suggestion!=='string'||
    suggestion.length<1||suggestion.length>160||/[\r\n\x00-\x1f]/.test(suggestion))
   return null;
  return suggestion;
 }catch{return null}
}
export function makeO1BoundedHarness({app,provider=null,selectedProviderId='fixture-o1-provider',maxCalls=1,enabled=true}={}){
 if(typeof app?.invoke!=='function')fail('O1_CONFIGURATION_INVALID');
 if(!hasSelectedNativeApp(app))fail('O1_NATIVE_APP_NOT_SELECTED');
 if(typeof enabled!=='boolean'||
    !Number.isInteger(maxCalls)||maxCalls<0||maxCalls>3||
    typeof selectedProviderId!=='string'||!selectedProviderId)
  fail('O1_CONFIGURATION_INVALID');
 // The selected ID is a fixture-level allowlist, not an AOT source pin.
 if(provider!==null&&(provider?.id!==selectedProviderId||typeof provider?.propose!=='function'))
  fail('O1_PROVIDER_UNSELECTED');
 let remaining=maxCalls;
 return Object.freeze({
  remaining:()=>remaining,
  async run(mode='policy'){
   if(mode!=='policy'&&mode!=='advisory')fail('O1_FUNCTION_NOT_SELECTED');
   let observed;
   try{observed=await app.invoke('xdownload.describePolicy',{})}
   catch{return outcome('NATIVE_OBSERVATION_UNAVAILABLE')}
   if(!isSelectedPolicyObservation(app,observed))
    return outcome('NATIVE_OBSERVATION_UNQUALIFIED');
   if(mode==='policy')return Object.freeze({
    kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
    effectDispatched:false,sourceFunction:SELECTED_POLICY_FUNCTION,
    contractVersion:observed.contractVersion,
    sourceGitBlob:observed.evidence.source.gitBlob,
    observedDomain:observed.value.domainId,qualified:false
   });
   if(!enabled||provider===null)return outcome('PROVIDER_DISABLED');
   if(remaining===0)return outcome('BUDGET_EXHAUSTED');
   remaining--; // reserve before await: concurrent calls cannot overspend
   try{
    // Provider never receives app.invoke, Effect permits or raw input.
    const suggestion=inspectSuggestion(await provider.propose(Object.freeze({
     purpose:'advisory',sourceFunction:'xdownload.describePolicy',observedDomain:'downloads'
    })));
    return suggestion===null?outcome('MODEL_OUTPUT_REJECTED'):
     outcome('MODEL_PROPOSAL_NOT_DOMAIN_TRUTH',suggestion);
   }catch{return outcome('PROVIDER_ERROR')}
  }
 });
}
