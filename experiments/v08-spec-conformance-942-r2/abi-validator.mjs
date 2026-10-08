// Static ABI validator for test contracts, never an Effect or Runtime dispatcher.
import {SpecError,canonicalJson} from './candidate-validator.mjs';
const fail=(code)=>{throw new SpecError(code);};
function matchesType(value,type){
  if(type==='null')return value===null;
  if(type==='array')return Array.isArray(value);
  if(type==='integer')return typeof value==='number'&&Number.isSafeInteger(value);
  if(type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value);
  return typeof value===type;
}
export function validatePayload(schema,input,which='INPUT'){
  const code=which==='OUTPUT'?'E_OUTPUT_SCHEMA':'E_INPUT_SCHEMA';
  canonicalJson(input);
  if(!schema||typeof schema!=='object'||!['object','array','string','number','integer','boolean','null'].includes(schema.type))fail(code);
  if(!matchesType(input,schema.type))fail(code);
  if(schema.type==='object'){
    if(!Array.isArray(schema.required)||!schema.properties||typeof schema.properties!=='object')fail(code);
    for(const r of schema.required)if(!Object.hasOwn(input,r))fail(code);
    for(const [k,v] of Object.entries(input)){
      if(!Object.hasOwn(schema.properties,k)){if(schema.additionalProperties===false)fail(code);continue;}
      if(!matchesType(v,schema.properties[k].type))fail(code);
    }
  }
  return true;
}
export function validateFailure(op,errorCode){
  if(!Array.isArray(op.failures)||!op.failures.includes(errorCode))fail('E_UNDECLARED_FAILURE');
  return true;
}
export function validateCaller(op,caller,exposure){
  if(!op.callers.includes(caller)||op.exposure!==exposure)fail('E_CALLER_DENIED');
  return true;
}
export function requireAuthority(op,ctx){
  if(op.effect==='none')return true;
  // This is only a fail-closed precondition, NOT a trusted authorization or receipt verifier.
  // Actual provenance/admission/currentness remains owned by v0.7 Runtime.
  if(!ctx||!ctx.trustedHostAdmission||!ctx.occurrenceId||!ctx.assemblyDigest)fail('E_ADMISSION_REQUIRED');
  return true;
}
