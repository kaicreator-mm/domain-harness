/**
 * DIS 0.2.0 R211 O2 / OPT-002 independent Validator admission, R0.
 *
 * The Validator slot of an OPT-002 receipt can only be filled by an identity
 * that the trusted Host provisioned independently of the receipt itself.
 * A receipt that carries its own identity claim - an Ed25519 key embedded in
 * the payload, self-signed, presented as the "independent" validator - is
 * forgery by construction and is flagged FORGERY, never merely UNKNOWN.
 *
 * Minimal seam for the real external authority: provision a pin with
 * provisionedBy 'EXTERNAL_BUSINESS_VALIDATOR' and the externally attested
 * validator public key; then admitOpt002Validator returns an ENDORSED slot
 * that can fill receipt.validatorSlot. Until then every admission is
 * ADMITTED_TECHNICAL with reason EXTERNAL_AUTHORITY_MISSING.
 */
import {createPublicKey,verify} from 'node:crypto';
import {types} from 'node:util';

const TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const SPKI=/^[A-Za-z0-9_-]{56,64}$/;
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
const noAuthority=Object.freeze({
 qualified:false,experienceIssued:false,effectDispatched:false,exportAllowed:false,
 authority:'NONE'
});
const base=(status,reason,extra={})=>Object.freeze({status,reason,...noAuthority,...extra});

/**
 * Host-side validator identity pin. Only the Host may create this; the
 * provisionedBy marker records whether the key came from a real external
 * business Validator or a local engineering pin.
 */
export function provisionOpt002ValidatorPin({validatorId,publicKey,provisionedBy}={}){
 if(typeof validatorId!=='string'||!TOKEN.test(validatorId)||
    !['LOCAL_TEST_PIN','EXTERNAL_BUSINESS_VALIDATOR'].includes(provisionedBy))
  throw Error('OPT002_VALIDATOR_PIN_INVALID');
 const key=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);
 if(key.asymmetricKeyType!=='ed25519')throw Error('OPT002_VALIDATOR_ED25519_REQUIRED');
 return Object.freeze({
  validatorId,
  spkiDerBase64Url:key.export({format:'der',type:'spki'}).toString('base64url'),
  provisionedBy
 });
}

/**
 * Admit a validator verdict receipt for a verified trace.
 * - identityClaim present and self-consistent (claim key == receipt signing
 *   key, claim self-signature verifies): FORGERY / SELF_ASSERTED_IDENTITY.
 * - identityClaim present but not verifiable: FORGERY / IDENTITY_CLAIM_UNVERIFIABLE.
 * - no identityClaim: verdict must pass the pinned two-key evidence gate
 *   (createO2IndependentValidatorEvidenceGate); on success the admission is
 *   technical unless the pin was externally provisioned.
 */
export function admitOpt002Validator({pin,validatorReceipt,evidenceGate,traceReceipt,input,observation,runId}){
 if(!plain(pin)||!plain(validatorReceipt)||!evidenceGate||typeof evidenceGate.consume!=='function')
  return base('REJECTED','VALIDATOR_ADMISSION_ARGUMENTS_INVALID');
 if(!plain(own(validatorReceipt,'payload'))||typeof own(validatorReceipt,'signature')!=='string')
  return base('REJECTED','VALIDATOR_RECEIPT_MALFORMED');
 const claim=own(validatorReceipt,'identityClaim');
 if(claim!==undefined&&claim!==null){
  if(!plain(claim)||typeof own(claim,'validatorId')!=='string'||typeof own(claim,'publicKey')!=='string'||
     !SPKI.test(own(claim,'publicKey'))||typeof own(claim,'selfSignature')!=='string')
   return base('FORGERY','VALIDATOR_IDENTITY_CLAIM_UNVERIFIABLE');
  let claimKey=null,selfSigned=false,matchesReceiptKey=false;
  try{
   claimKey=createPublicKey({key:Buffer.from(own(claim,'publicKey'),'base64url'),format:'der',type:'spki'});
   selfSigned=verify(null,Buffer.from(JSON.stringify({
    validatorId:own(claim,'validatorId'),publicKey:own(claim,'publicKey')
   })),claimKey,Buffer.from(own(claim,'selfSignature'),'base64url'));
  }catch{return base('FORGERY','VALIDATOR_IDENTITY_CLAIM_UNVERIFIABLE')}
  // A self-signed identity claim never mints independence. When the claim
  // key is exactly the verdict signing key it is a forged "independent"
  // validator; flag it FORGERY with the precise reason.
  try{
   matchesReceiptKey=verify(null,Buffer.from(JSON.stringify(own(validatorReceipt,'payload'))),
    claimKey,Buffer.from(own(validatorReceipt,'signature'),'base64url'));
  }catch{matchesReceiptKey=false}
  if(selfSigned&&matchesReceiptKey)
   return base('FORGERY','VALIDATOR_IDENTITY_SELF_ASSERTED',{claimedValidatorId:own(claim,'validatorId')});
  return base('FORGERY','VALIDATOR_IDENTITY_CLAIM_UNVERIFIABLE');
 }
 const gate=evidenceGate.consume({
  validatorReceipt,traceReceipt,input,observation,runId
 });
 if(gate.status!=='VALIDATOR_RECEIPT_VERIFIED_TECHNICAL')
  return base('REJECTED',gate.reason??'VALIDATOR_EVIDENCE_GATE_FAILED',{traceVerified:false,validatorSignatureVerified:false});
 if(pin.provisionedBy!=='EXTERNAL_BUSINESS_VALIDATOR')
  return base('ADMITTED_TECHNICAL','EXTERNAL_AUTHORITY_MISSING',{
   traceVerified:true,validatorSignatureVerified:true,validatorVerdict:gate.validatorVerdict,
   validatorSlot:Object.freeze({
    status:'PENDING',validatorIdentity:pin,endorsement:null,reason:'EXTERNAL_AUTHORITY_MISSING'
   })
  });
 // Real external authority path - the minimal seam. Only reachable with an
 // externally provisioned business Validator pin.
 return base('ADMITTED','EXTERNAL_BUSINESS_VALIDATOR_ENDORSEMENT',{
  traceVerified:true,validatorSignatureVerified:true,validatorVerdict:gate.validatorVerdict,
  validatorSlot:Object.freeze({
   status:'ENDORSED',validatorIdentity:pin,
   endorsement:Object.freeze({
    validatorId:pin.validatorId,spkiDerBase64Url:pin.spkiDerBase64Url,
    verdict:gate.validatorVerdict,runId
   }),reason:null
  })
 });
}
