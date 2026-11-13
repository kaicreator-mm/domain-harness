/**
 * DIS v0.2.0 / R63 O3 candidate-only fallback, original Product R2 §9.
 * No trusted AOT-selected interpreter, atomic Task epoch pin, revocation API
 * or independently verified LOCAL_QUALIFIED receipt exists in this bounded SDK.
 * No input, including claimed authority, may activate a rule, grant an Effect,
 * mutate a Task pin, upload observations or promote a Function.
 */
import {types as nodeTypes} from 'node:util';
const HEX64=/^[0-9a-f]{64}$/;
const ID=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const canonical=v=>typeof v==='string'&&v.length>0&&v.length<=256&&
 v===v.trim()&&v.normalize('NFC')===v&&
 !/[\u0000-\u001f\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(v);
const object=x=>{
 try{return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  !nodeTypes.isProxy(x)&&Object.getPrototypeOf(x)===Object.prototype}
 catch{return false}
};
const own=(x,k)=>{
 try{if(!object(x))return undefined;const d=Object.getOwnPropertyDescriptor(x,k);
  return d&&Object.hasOwn(d,'value')?d.value:undefined}
 catch{return undefined}
};
const shape=(x,keys)=>object(x)&&Reflect.ownKeys(x).length===keys.length&&
 Reflect.ownKeys(x).every(k=>typeof k==='string'&&keys.includes(k))&&
 keys.every(k=>own(x,k)!==undefined);
const output=(status,reason)=>Object.freeze({
 status,reason,authority:'NONE',qualified:false,activationAllowed:false,
 taskPinChanged:false,oldTaskChanged:false,revokePerformed:false,
 dynamicCodeExecuted:false,physicalEffectDispatched:false,uploadPerformed:false,
 serverPromoted:false,requiresNewAot:true
});
/**
 * Accept a bounded declarative CANDIDATE for shadow planning only.
 * NOT shadow execution, actual E07 activation or a qualification receipt.
 * No callback, I/O, eval, interpreter or mutable state is exposed.
 */
export function classifyLocalEvolutionCandidate(input){
 if(!shape(input,['candidate','task','selected']))return output('REJECTED','INVALID_ENVELOPE');
 const c=own(input,'candidate'),t=own(input,'task'),s=own(input,'selected');
 if(!shape(c,['id','kind','scope','operator','field','literal','functionDigest',
  'knowledgeDigest','requestedBinding','requestedEffect']))return output('REJECTED','INVALID_CANDIDATE');
 if(!shape(t,['scope','taskId','currentEpoch']))return output('REJECTED','INVALID_TASK');
 if(!shape(s,['scope','functionDigest','knowledgeDigest']))return output('REJECTED','INVALID_SELECTION');
 for(const v of [own(c,'id'),own(c,'scope'),own(t,'taskId'),own(t,'scope'),own(s,'scope')])
  if(typeof v!=='string'||!ID.test(v))return output('REJECTED','INVALID_ID');
 const digests=[own(c,'functionDigest'),own(c,'knowledgeDigest'),
  own(s,'functionDigest'),own(s,'knowledgeDigest')];
 if(digests.some(v=>typeof v!=='string'||!HEX64.test(v)))return output('REJECTED','INVALID_DIGEST');
 if(own(c,'scope')!==own(t,'scope')||own(c,'scope')!==own(s,'scope'))
  return output('REJECTED','SCOPE_MISMATCH');
 if(own(c,'functionDigest')!==own(s,'functionDigest')||
    own(c,'knowledgeDigest')!==own(s,'knowledgeDigest'))
  return output('REJECTED','STALE_SELECTED_SOURCE');
 if(own(c,'kind')!=='DECLARATIVE_RULE_DATA'||own(c,'operator')!=='EXACT_EQUALS'||
    own(c,'requestedBinding')!=='UNMODIFIED'||own(c,'requestedEffect')!=='none')
  return output('REJECTED','CODE_DEPENDENCY_OR_AUTHORITY_CHANGE_FORBIDDEN');
 if(!canonical(own(c,'field'))||!canonical(own(c,'literal')))
  return output('REJECTED','INVALID_DECLARATIVE_LITERAL');
 if(!Number.isSafeInteger(own(t,'currentEpoch'))||own(t,'currentEpoch')<0)
  return output('REJECTED','INVALID_TASK_EPOCH');
 // The caller-supplied 'selected' envelope is never an attested AOT selector.
 // Even a well-formed candidate is strictly untrusted; no activation allowed.
 return output('SHADOW_ONLY','MISSING_TRUSTED_INTERPRETER_ATOMIC_PIN_OR_REVOCATION');
}
