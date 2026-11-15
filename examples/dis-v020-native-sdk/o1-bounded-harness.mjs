/**
 * O1/R94 Demo bridge: real selected DIS AOT/SDK Knowledge first, then an
 * explicitly bounded fixture provider. It is NOT a production Harness ABI,
 * an AOT-pinned provider, a real LLM, or a semantic/Effect authorization.
 */
import {types} from 'node:util';
const fail=code=>{throw Object.assign(new Error(code),{code})};
// Limits awaiting untrusted asynchronous work, NOT uncooperative synchronous CPU
// or remote side effects. A timeout never upgrades an observation/authorization.
const TIMEOUT=Symbol('O1_ASYNC_WAIT_TIMEOUT');
const withDeadline=(run,maxWaitMs)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(TIMEOUT),maxWaitMs);
 Promise.resolve().then(run).then(
  value=>{clearTimeout(timer);resolve(value)},
  error=>{clearTimeout(timer);reject(error)}
 );
});
const SELECTED_POLICY_FUNCTION='xdownload.describePolicy';
const SELECTED_POLICY_SOURCE=Object.freeze({sourceId:'xdownload-business',gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'});
const hasSelectedNativeApp=app=>Array.isArray(app?.functions)&&
 app.functions.includes(SELECTED_POLICY_FUNCTION)&&
 app?.contractVersions?.[SELECTED_POLICY_FUNCTION]==='1.0.0';
// O1/R138: observation is untrusted DATA. Do not execute getters/traps, and
// snapshot checked primitives once; validation and public output use same bytes.
const plainData=v=>{
 if(v===null||typeof v!=='object'||Array.isArray(v)||types.isProxy(v))return false;
 const p=Object.getPrototypeOf(v);
 return p===Object.prototype||p===null;
};
const ownData=(v,key)=>{
 if(!plainData(v))return undefined;
 const d=Object.getOwnPropertyDescriptor(v,key);
 return d&&Object.hasOwn(d,'value')?d.value:undefined;
};
function selectedPolicySnapshot(app,observed){
 try{
  if(!hasSelectedNativeApp(app)||!plainData(observed))return null;
  const evidence=ownData(observed,'evidence');
  const source=ownData(evidence,'source');
  const value=ownData(observed,'value');
  const contractVersion=ownData(observed,'contractVersion');
  const sourceGitBlob=ownData(source,'gitBlob');
  const observedDomain=ownData(value,'domainId');
  return ownData(observed,'kind')==='OBSERVATION'&&
   ownData(observed,'disposition')==='OBSERVED'&&
   ownData(observed,'authority')==='NONE'&&contractVersion==='1.0.0'&&
   observedDomain==='downloads'&&ownData(evidence,'attested')===false&&
   ownData(source,'sourceId')===SELECTED_POLICY_SOURCE.sourceId&&
   typeof ownData(source,'sha256')==='string'&&
   /^[a-f0-9]{64}$/.test(ownData(source,'sha256'))&&
   sourceGitBlob===SELECTED_POLICY_SOURCE.gitBlob
    ?Object.freeze({contractVersion,sourceGitBlob,observedDomain}):null;
 }catch{return null}
}
const outcome=(reason,suggestion=null)=>Object.freeze({
 kind:'OBSERVATION',disposition:'UNKNOWN',authority:'NONE',
 effectDispatched:false,reason,suggestion,qualified:false
});
function inspectSuggestion(value){
 try{
  if(!plainData(value)||Object.getPrototypeOf(value)!==Object.prototype)return null;
  if(Reflect.ownKeys(value).length!==1)return null;
  const descriptor=Object.getOwnPropertyDescriptor(value,'suggestion');
  const suggestion=descriptor?.value;
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof suggestion!=='string'||
    suggestion.length<1||suggestion.length>160||/[\r\n\x00-\x1f]/.test(suggestion))
   return null;
  return suggestion;
 }catch{return null}
}
export function makeO1BoundedHarness({app,provider=null,selectedProviderId='fixture-o1-provider',maxCalls=1,maxWaitMs=15000,enabled=true}={}){
 if(typeof app?.invoke!=='function')fail('O1_CONFIGURATION_INVALID');
 if(!hasSelectedNativeApp(app))fail('O1_NATIVE_APP_NOT_SELECTED');
 if(typeof enabled!=='boolean'||
    !Number.isInteger(maxCalls)||maxCalls<0||maxCalls>3||
    !Number.isSafeInteger(maxWaitMs)||maxWaitMs<1||maxWaitMs>60000||
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
   try{observed=await withDeadline(()=>app.invoke('xdownload.describePolicy',{}),maxWaitMs)}
   catch(err){return outcome(err===TIMEOUT?'NATIVE_OBSERVATION_TIMEOUT':'NATIVE_OBSERVATION_UNAVAILABLE')}
   const selected=selectedPolicySnapshot(app,observed);
   if(selected===null)return outcome('NATIVE_OBSERVATION_UNQUALIFIED');
   if(mode==='policy')return Object.freeze({
    kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',
    effectDispatched:false,sourceFunction:SELECTED_POLICY_FUNCTION,
    contractVersion:selected.contractVersion,
    sourceGitBlob:selected.sourceGitBlob,
    observedDomain:selected.observedDomain,qualified:false
   });
   if(!enabled||provider===null)return outcome('PROVIDER_DISABLED');
   if(remaining===0)return outcome('BUDGET_EXHAUSTED');
   remaining--; // reserve before await: concurrent calls cannot overspend
   try{
    // Provider never receives app.invoke, Effect permits or raw input.
    const suggestion=inspectSuggestion(await withDeadline(()=>provider.propose(Object.freeze({
     purpose:'advisory',sourceFunction:'xdownload.describePolicy',observedDomain:'downloads'
    })),maxWaitMs));
    return suggestion===null?outcome('MODEL_OUTPUT_REJECTED'):
     outcome('MODEL_PROPOSAL_NOT_DOMAIN_TRUTH',suggestion);
   }catch(err){return outcome(err===TIMEOUT?'PROVIDER_TIMEOUT':'PROVIDER_ERROR')}
  }
 });
}
