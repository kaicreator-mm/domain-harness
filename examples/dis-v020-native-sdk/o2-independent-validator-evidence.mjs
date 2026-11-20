/**
 * DIS 0.2 O2: two-key proof-of-binding for a Host-controlled execution Trace
 * and a separately signed Validator *assertion*. This is an engineering
 * verifier, NOT a Domain Oracle, independent human assessment or Experience
 * issuer. Only a trusted Host can provision both key pins and the selected AOT.
 * The caller can supply arbitrary receipt bytes but cannot select trusted keys.
 */
import {createPublicKey,verify} from 'node:crypto';
import {types} from 'node:util';
import {createControlledTraceVerifier} from './o2-controlled-execution-trace.mjs';

const VERSION='dis.o2.independent-validator/1';
const AUTHORITY='TECHNICAL_VALIDATION_ONLY';
const HEX=/^[a-f0-9]{64}$/;
const TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const SIG=/^[A-Za-z0-9_-]{86}$/;
const FIELDS=Object.freeze([
 'version','scope','runId','aotDigest','ruleDigest','traceSignature',
 'observationDigest','verdict','authority','experienceIssued','effectDispatched'
]);
const deny=reason=>Object.freeze({
 status:'UNKNOWN',reason,traceVerified:false,validatorSignatureVerified:false,
 qualified:false,experienceIssued:false,effectDispatched:false,exportAllowed:false,
 authority:'NONE'
});
function plain(x,keys){
 try{
  if(!x||typeof x!=='object'||Array.isArray(x)||types.isProxy(x)||
     Object.getPrototypeOf(x)!==Object.prototype)return false;
  const names=Reflect.ownKeys(x);
  if(names.some(k=>typeof k!=='string'))return false;
  if(keys&&(names.length!==keys.length||names.some(k=>!keys.includes(k))))return false;
  return names.every(k=>{
   const d=Object.getOwnPropertyDescriptor(x,k);
   return d?.enumerable===true&&Object.hasOwn(d,'value');
  });
 }catch{return false}
}
const own=(x,key)=>Object.getOwnPropertyDescriptor(x,key)?.value;
const keyDer=key=>key.export({format:'der',type:'spki'});
function publicKey(input){
 const result=input?.type==='public'?input:createPublicKey(input);
 if(result.asymmetricKeyType!=='ed25519')throw Error('O2_VALIDATOR_ED25519_KEY_REQUIRED');
 return result;
}
export function createO2IndependentValidatorEvidenceGate({
 tracePublicKey,validatorPublicKey,scope,expectedAotDigest,expectedRuleDigest,
 nonceLedger=null
}={}){
 if(typeof scope!=='string'||!TOKEN.test(scope)||
    typeof expectedAotDigest!=='string'||!HEX.test(expectedAotDigest)||
    typeof expectedRuleDigest!=='string'||!HEX.test(expectedRuleDigest))
  throw Error('O2_VALIDATOR_HOST_PIN_INVALID');
 const traceKey=publicKey(tracePublicKey);
 const validatorKey=publicKey(validatorPublicKey);
 if(keyDer(traceKey).equals(keyDer(validatorKey)))
  throw Error('O2_VALIDATOR_AND_TRACE_KEYS_MUST_DIFFER');
 const traceVerifier=createControlledTraceVerifier({
  publicKey:traceKey,scope,expectedAotDigest,nonceLedger
 });
 return Object.freeze({
  consume(input){
   if(!plain(input,['validatorReceipt','traceReceipt','input','observation','runId']))
    return deny('O2_VALIDATOR_ARGUMENTS_UNSAFE');
   const validatorReceipt=own(input,'validatorReceipt'),traceReceipt=own(input,'traceReceipt');
   const selectedInput=own(input,'input'),observation=own(input,'observation'),runId=own(input,'runId');
   if(typeof runId!=='string'||!TOKEN.test(runId)||
      !plain(validatorReceipt,['payload','signature'])||
      !plain(traceReceipt,['payload','signature']))
    return deny('O2_VALIDATOR_RECEIPT_UNSAFE');
   const p=own(validatorReceipt,'payload'),signature=own(validatorReceipt,'signature');
   const tp=own(traceReceipt,'payload'),ts=own(traceReceipt,'signature');
   if(!plain(p,FIELDS)||!plain(tp)||typeof signature!=='string'||!SIG.test(signature)||
      typeof ts!=='string'||!SIG.test(ts))return deny('O2_VALIDATOR_RECEIPT_UNSAFE');
   // Type-check every field before equality/serialization: no object coercion.
   if(p.version!==VERSION||p.scope!==scope||p.runId!==runId||
      p.aotDigest!==expectedAotDigest||p.ruleDigest!==expectedRuleDigest||
      p.traceSignature!==ts||p.observationDigest!==own(tp,'observationDigest')||
      typeof p.observationDigest!=='string'||!HEX.test(p.observationDigest)||
      !['PASS','FAIL','UNKNOWN'].includes(p.verdict)||p.authority!==AUTHORITY||
      p.experienceIssued!==false||p.effectDispatched!==false)
    return deny('O2_VALIDATOR_SCOPE_OR_SCHEMA_MISMATCH');
   let signed=false;
   try{
    signed=verify(null,Buffer.from(JSON.stringify(p)),validatorKey,Buffer.from(signature,'base64url'));
   }catch{return deny('O2_VALIDATOR_SIGNATURE_INVALID')}
   if(!signed)return deny('O2_VALIDATOR_SIGNATURE_INVALID');
   // Deliberately consume a verified Trace only AFTER Validator signature
   // verification, so an attacker cannot burn a valid Trace with a fake receipt.
   const trace=traceVerifier.consume({
    receipt:traceReceipt,input:selectedInput,observation,runId
   });
   if(trace.status!=='VERIFIED_TRACE_ONLY'||trace.traceVerified!==true)
    return deny('O2_VALIDATOR_ORIGINAL_TRACE_NOT_VERIFIED');
   return Object.freeze({
    status:'VALIDATOR_RECEIPT_VERIFIED_TECHNICAL',reason:'PROFESSIONAL_ORACLE_AND_EXPERIENCE_GATE_MISSING',
    traceVerified:true,validatorSignatureVerified:true,validatorVerdict:p.verdict,
    authority:'NONE',qualified:false,experienceIssued:false,
    effectDispatched:false,exportAllowed:false
   });
  }
 });
}
