/**
 * DIS 0.2.0 R211 O2 / OPT-002 full-conformance engineering layer, R0.
 *
 * Authentic execution Trace -> tamper-evident chain -> full OPT-002 receipt
 * envelope whose Validator slot is explicitly PENDING. The Host-owned
 * Ed25519 trace issuer/verifier chain (o2-controlled-execution-trace.mjs) is
 * reused unchanged on the real selected AOT/SDK; this module only adds the
 * requirement-specific receipt structure and the honest authority record.
 *
 * This is engineering evidence, NOT business validation. The validator slot
 * can never be filled by this module: it stays PENDING with reason
 * EXTERNAL_AUTHORITY_MISSING until a genuinely independent, externally
 * provisioned business Validator endorsement is admitted through
 * opt002-validator-admission.mjs.
 *
 * No Experience, PASS, Effect, export, reuse authorization or qualification
 * is minted here. privacyScope is local-only and immutable.
 */
import {assessExperience} from '../o2-experience-gate.mjs';

const VERSION='dis.opt002.full-receipt/1';
const PENDING=Object.freeze({
 status:'PENDING',validatorIdentity:null,endorsement:null,
 reason:'EXTERNAL_AUTHORITY_MISSING'
});
const deny=reason=>Object.freeze({
 status:'UNKNOWN',reason,traceVerified:false,receiptVerified:false,
 validatorSlot:PENDING,authority:'NONE',experienceIssued:false,
 effectDispatched:false,exportAllowed:false
});
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
const HEX=/^[a-f0-9]{64}$/,TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;

/**
 * Build the OPT-002 full receipt envelope from an already-issued Host trace
 * receipt. The envelope is a derived, frozen view: every content digest is
 * copied out of the signed trace payload, never supplied by the caller.
 */
export function buildOpt002Receipt(traceReceipt){
 if(!plain(traceReceipt)||!plain(own(traceReceipt,'payload'))||
    typeof own(traceReceipt,'signature')!=='string')
  throw Error('OPT002_RECEIPT_INPUT_INVALID');
 const p=own(traceReceipt,'payload');
 if(typeof p.runId!=='string'||!TOKEN.test(p.runId)||
    typeof p.functionId!=='string'||typeof p.sourceId!=='string'||
    typeof p.sourceGitBlob!=='string'||!HEX.test(p.aotDigest)||
    !HEX.test(p.inputDigest)||!HEX.test(p.observationDigest)||
    typeof p.disposition!=='string'||typeof p.contractVersion!=='string'||
    p.privacyScope!=='local-only')
  throw Error('OPT002_RECEIPT_TRACE_PAYLOAD_INVALID');
 const content=Object.freeze({
  functionId:p.functionId,sourceId:p.sourceId,sourceGitBlob:p.sourceGitBlob,
  aotDigest:p.aotDigest,contractVersion:p.contractVersion,
  inputDigest:p.inputDigest,observationDigest:p.observationDigest,
  disposition:p.disposition
 });
 return Object.freeze({
  version:VERSION,traceId:p.runId,content,
  provenance:Object.freeze({aotDigest:p.aotDigest,sourceId:p.sourceId,sourceGitBlob:p.sourceGitBlob}),
  privacyScope:'local-only',validatorSlot:PENDING,
  authority:'NONE',experienceIssued:false,effectDispatched:false,exportAllowed:false
 });
}

/**
 * Capture an authentic trace on the real selected AOT/SDK and wrap it in the
 * full receipt envelope. `issuer` is a configured Host-owned
 * createControlledTraceIssuer; failure surfaces its exact deny reason.
 */
export async function captureOpt002Trace({issuer,input,runId}){
 if(!issuer||typeof issuer.capture!=='function'||!plain(input)||typeof runId!=='string')
  return deny('OPT002_CAPTURE_ARGUMENTS_INVALID');
 let captured;
 try{captured=await issuer.capture({input,runId})}catch{return deny('OPT002_CAPTURE_UNAVAILABLE')}
 if(!captured||captured.status!=='ISSUED_TRACE_ONLY')return deny(captured?.reason??'OPT002_TRACE_NOT_ISSUED');
 let envelope;
 try{envelope=buildOpt002Receipt(captured.receipt)}catch(e){return deny(e?.message??'OPT002_RECEIPT_BUILD_FAILED')}
 return Object.freeze({
  status:'TRACE_CAPTURED',traceId:runId,receipt:envelope,
  traceReceipt:captured.receipt,observation:captured.observation,
  input,runId,traceVerified:true,receiptVerified:false,
  validatorSlot:PENDING,authority:'NONE',experienceIssued:false,
  effectDispatched:false,exportAllowed:false
 });
}

/**
 * Verify the full receipt against the pinned Host trace verifier. The trace
 * chain (payload digest binding, Ed25519 signature, replay) is re-consumed
 * exactly once; the envelope must agree with the signed payload on every
 * content field. A caller envelope claiming a VALIDATED validator slot is
 * rejected: endorsement can only enter through validator admission, never
 * through this receipt path.
 */
export function verifyOpt002Trace({verifier,envelope,traceReceipt,input,observation,runId}){
 if(!verifier||typeof verifier.consume!=='function'||!plain(envelope)||!plain(traceReceipt))
  return deny('OPT002_VERIFY_ARGUMENTS_INVALID');
 const slot=own(envelope,'validatorSlot');
 if(!plain(slot)||own(slot,'status')!=='PENDING'||own(slot,'endorsement')!==null)
  return deny('OPT002_VALIDATOR_SLOT_CLAIMS_AUTHORITY');
 const v=verifier.consume({receipt:traceReceipt,input,observation,runId});
 if(v.status!=='VERIFIED_TRACE_ONLY'||v.traceVerified!==true)return deny(v.reason??'OPT002_TRACE_NOT_VERIFIED');
 let rebuilt;
 try{rebuilt=buildOpt002Receipt(traceReceipt)}catch(e){return deny(e?.message??'OPT002_RECEIPT_BUILD_FAILED')}
 const a=own(envelope,'content'),b=rebuilt.content;
 if(envelope.version!==VERSION||envelope.traceId!==runId||envelope.privacyScope!=='local-only'||
    envelope.authority!=='NONE'||envelope.experienceIssued!==false||
    envelope.effectDispatched!==false||envelope.exportAllowed!==false||
    envelope.provenance?.aotDigest!==b.aotDigest||a?.functionId!==b.functionId||
    a?.inputDigest!==b.inputDigest||a?.observationDigest!==b.observationDigest||
    a?.disposition!==b.disposition||a?.sourceGitBlob!==b.sourceGitBlob)
  return deny('OPT002_RECEIPT_ENVELOPE_MISMATCH');
 return Object.freeze({
  status:'RECEIPT_VERIFIED_STRUCTURAL',reason:'EXTERNAL_AUTHORITY_MISSING',
  traceId:runId,traceVerified:true,receiptVerified:true,
  validatorSlot:PENDING,authority:'NONE',experienceIssued:false,
  effectDispatched:false,exportAllowed:false
 });
}

/**
 * Experience eligibility wiring: the unchanged bounded gate stays the sole
 * consumer. Whatever its NEED_MORE_EVIDENCE reason, eligibility is reported
 * explicitly as NOT_ELIGIBLE here; no caller flag can convert structural
 * receipt verification into Experience.
 */
export function evaluateOpt002Experience({observation,traceReceipt,validatorReceipt,context}){
 const gate=assessExperience({observation,traceReceipt,validatorReceipt,context});
 return Object.freeze({
  status:'NOT_ELIGIBLE',gateStatus:gate.status,reason:gate.reason,
  experienceIssued:false,observedDisposition:gate.observedDisposition,
  privacyScope:gate.privacyScope,exportAllowed:false,authority:'NONE'
 });
}
