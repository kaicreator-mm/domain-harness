/**
 * O3 R144 / E07 prerequisite: execute one fully enumerated source-pinned
 * data-only equality rule over the real selected DIS AOT/SDK observation.
 *
 * Deliberately READ_ONLY_SHADOW: not an AOT-selected Evolution Slot,
 * professional QualificationReceipt, runtime activation, Effect, or policy
 * permission. The fixed rule is owned by this source file, not a model or
 * caller-provided rule program. No eval, dynamic import, generated JS, DSL
 * branching, arbitrary property paths or untrusted user-defined operators.
 */
import {types} from 'node:util';
import {prepareO3ShadowCandidate,makeO3Shadow} from './o3-shadow-rule.mjs';

const FUNCTION='xdownload.describePolicy';
const VERSION='1.0.0';
const SOURCE='xdownload-business';
const BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const RULE=Object.freeze({
 schema:'dis.v0.2.o3-shadow-candidate/1',
 functionId:FUNCTION,contractVersion:VERSION,sourceGitBlob:BLOB,
 op:'eq',field:'value.domainId',equals:'downloads'
});
const RULE_PIN=prepareO3ShadowCandidate(RULE);
const HEX=/^[a-f0-9]{64}$/;
const fail=code=>{throw Object.assign(new Error(code),{code})};
const read=(obj,key)=>{
 try{
  if(obj===null||typeof obj!=='object'||Array.isArray(obj)||types.isProxy(obj))return undefined;
  const proto=Object.getPrototypeOf(obj);
  if(proto!==Object.prototype&&proto!==null)return undefined;
  const descriptor=Object.getOwnPropertyDescriptor(obj,key);
  return descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable===true?descriptor.value:undefined;
 }catch{return undefined}
};
const result=(reason,more={})=>Object.freeze({
 status:'NEED_MORE_EVIDENCE',scope:'SHADOW_ONLY',reason,
 authority:'NONE',ruleEvaluated:false,ruleMatched:false,
 qualified:false,ruleActivated:false,experienceIssued:false,
 effectDispatched:false,exportAllowed:false,...more
});
/** Host can compare this static grammar/source digest to a trusted pin. */
export function getO3FixedRuleTechnicalPin(){
 return Object.freeze({
  digest:RULE_PIN.digest,sourceGitBlob:BLOB,
  functionId:FUNCTION,contractVersion:VERSION,
  grammar:'SINGLE_EQ__VALUE_DOMAIN_ID__DOWNLOADS',
  qualified:false,activationAllowed:false
 });
}
function validObserved(value){
 const evidence=read(value,'evidence'),source=read(evidence,'source'),detail=read(value,'value');
 const domainId=read(detail,'domainId');
 return read(value,'kind')==='OBSERVATION' &&
  read(value,'authority')==='NONE' &&
  read(value,'contractVersion')===VERSION &&
  read(value,'disposition')==='OBSERVED' &&
  read(evidence,'attested')===false &&
  read(source,'sourceId')===SOURCE &&
  read(source,'gitBlob')===BLOB &&
  typeof read(source,'sha256')==='string' &&
  HEX.test(read(source,'sha256')) &&
  typeof domainId==='string' && domainId.length<=128 &&
  domainId.normalize('NFC')===domainId &&
  !/[\u0000-\u001f\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(domainId);
}

/**
 * Host-selected immutable AOT and strict candidate digest are required before
 * any observation is consumed; satisfying them does NOT prove that the rule
 * itself is installed in AOT, or that local experience has qualified it.
 */
export function createO3BoundedShadowInterpreter({
 app,candidate,expectedAotDigest,expectedRuleDigest,
 maxEvaluations=1,maxWaitMs=15000
}={}){
 if(typeof expectedAotDigest!=='string'||!HEX.test(expectedAotDigest)||
   app?.aotDigest!==expectedAotDigest)
  fail('O3_AOT_HOST_PIN_MISMATCH');
 if(typeof expectedRuleDigest!=='string'||expectedRuleDigest!==RULE_PIN.digest)
  fail('O3_FIXED_RULE_DIGEST_MISMATCH');
 if(!Number.isSafeInteger(maxEvaluations)||maxEvaluations<1||maxEvaluations>8||
    !Number.isSafeInteger(maxWaitMs)||maxWaitMs<1||maxWaitMs>60000)
  fail('O3_INTERPRETER_BUDGET_INVALID');
 // Source-First strict candidate gate rejects unknown operators, Accessors,
 // Proxy, imported code, forged qualification, new bindings and changed source.
 makeO3Shadow({app,candidate,maxWaitMs:Math.min(maxWaitMs,15000)});
 let remaining=maxEvaluations,closed=false;
 return Object.freeze({
  async evaluateShadowOnly(){
   if(closed)return result('O3_INTERPRETER_CLOSED');
   if(remaining===0)return result('O3_INTERPRETER_BUDGET_EXHAUSTED');
   remaining--; // reserve before async dispatch to prevent concurrent bypass
   let timeoutId;
   try{
    const observation=await Promise.race([
     Promise.resolve().then(()=>app.invoke(FUNCTION,{})),
     new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(Error('O3_DEADLINE')),maxWaitMs)})
    ]);
    if(closed)return result('O3_INTERPRETER_CLOSED_DURING_NATIVE');
    if(!validObserved(observation))return result('O3_NATIVE_SOURCE_OBSERVATION_UNQUALIFIED');
    // The entire data-only grammar is exactly one own-data string comparison.
    // Never read a caller-selected property name or execute a model response.
    const domainId=read(read(observation,'value'),'domainId');
    const matched=domainId==='downloads';
    return result(matched?'O3_RULE_MATCH_SHADOW_NOT_QUALIFIED':'O3_RULE_MISS_SHADOW_NOT_QUALIFIED',{
     ruleEvaluated:true,ruleMatched:matched,ruleDigest:RULE_PIN.digest,
     sourceGitBlob:BLOB,aotDigest:expectedAotDigest
    });
   }catch{return result('O3_NATIVE_UNAVAILABLE_OR_TIMEOUT')}
   finally{if(timeoutId!==undefined)clearTimeout(timeoutId)}
  },
  close:()=>{closed=true},
  state:()=>Object.freeze({
   scope:'SHADOW_ONLY',remaining,closed,qualified:false,
   ruleActivated:false,expectedAotDigest,ruleDigest:RULE_PIN.digest
  })
 });
}
