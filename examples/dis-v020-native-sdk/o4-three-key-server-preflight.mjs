/**
 * DIS O4 R147: three independently pinned Ed25519 *technical* evidence keys
 * verifies that exact bounded candidate artifact bytes hash to the
 * third-key-signed proposalDigest, alongside the selected AOT, Rule, execution
 * Trace and independent Validator receipt.
 *
 * This is an in-process SERVER PREFLIGHT verifier; it is NOT an actual deployed
 * Server, professional Domain Oracle, Experience, Governance approval, Forge
 * Promotion, new AOT build/activation or Effect. It does not publish candidate
 * bytes or dispatch an Effect. A configured trusted O2 nonce ledger may persist
 * replay state. The returned Base64 is only a verified input snapshot; this PR
 * has no downstream publisher/installer. A future consumer MUST decode and use
 * only that snapshot, never the caller-owned Buffer. A reviewer SIGNATURE proves
 * key possession, not authority.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {types} from 'node:util';
import {createO2IndependentValidatorEvidenceGate} from './o2-independent-validator-evidence.mjs';

const VERSION='dis.o4.server-candidate-preflight/1';
const HEX=/^[a-f0-9]{64}$/;
const TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const SIG=/^[A-Za-z0-9_-]{86}$/;
const MAX_CANDIDATE_BYTES=1024*1024;
const TYPED_ARRAY_PROTO=Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GET=Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO,'buffer').get;
const TYPED_ARRAY_OFFSET_GET=Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO,'byteOffset').get;
const TYPED_ARRAY_LENGTH_GET=Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTO,'byteLength').get;
const ARRAY_BUFFER_LENGTH_GET=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const UINT8_ARRAY=Uint8Array;
const UINT8_ARRAY_SET=Uint8Array.prototype.set;
const BUFFER_IS_BUFFER=Buffer.isBuffer;
const BUFFER_PROTO=Buffer.prototype;
const GET_OWN_PROPERTY_DESCRIPTOR=Object.getOwnPropertyDescriptor;
const FIELDS=Object.freeze([
 'version','scope','runId','selectedAotDigest','ruleDigest',
 'traceSignature','validatorSignature','observationDigest','proposalDigest',
 'consentScope','disposition','authorizedPromotion'
]);
const deny=reason=>Object.freeze({
 status:'UNKNOWN',reason,technicalEnvelopeVerified:false,
 traceVerified:false,validatorSignatureVerified:false,
 serverReviewSignatureVerified:false,candidateContentDigestVerified:false,qualified:false,
 experienceIssued:false,governanceApproved:false,serverPromotionAuthorized:false,
 newAotBuilt:false,newAotActivated:false,artifactExported:false,
 effectDispatched:false,authority:'NONE'
});
const own=(x,k)=>Object.getOwnPropertyDescriptor(x,k)?.value;
function snapshotCandidateBytes(value){
 try{
  if(types.isProxy(value)||!BUFFER_IS_BUFFER.call(Buffer,value)||
     Object.getPrototypeOf(value)!==BUFFER_PROTO)return null;
  // Reject shadowing descriptors without invoking attacker-controlled getters.
  // Intrinsic slots remain authoritative for the actual backing store and size.
  if(GET_OWN_PROPERTY_DESCRIPTOR(value,'byteLength')!==undefined||
     GET_OWN_PROPERTY_DESCRIPTOR(value,'buffer')!==undefined||
     GET_OWN_PROPERTY_DESCRIPTOR(value,'length')!==undefined)return null;
  // Read the genuine TypedArray internal slots. Never touch caller-visible
  // own byteLength/buffer/length properties on this untrusted Buffer.
  const backingStore=TYPED_ARRAY_BUFFER_GET.call(value);
  const byteOffset=TYPED_ARRAY_OFFSET_GET.call(value);
  const byteLength=TYPED_ARRAY_LENGTH_GET.call(value);
  // The intrinsic ArrayBuffer getter throws for SharedArrayBuffer backing.
  const backingLength=ARRAY_BUFFER_LENGTH_GET.call(backingStore);
  if(!Number.isSafeInteger(byteLength)||byteLength<1||
     byteLength>MAX_CANDIDATE_BYTES||!Number.isSafeInteger(byteOffset)||
     byteOffset<0||byteOffset+byteLength>backingLength)return null;
  // TypedArray#set's typed-array branch reads source internal slots, not
  // attacker-defined own accessors. The destination is a fresh private copy.
  const snapshot=new UINT8_ARRAY(byteLength);
  UINT8_ARRAY_SET.call(snapshot,value);
  return snapshot;
 }catch{return null}
}
function exact(x,keys){
 try{
  if(x===null||typeof x!=='object'||Array.isArray(x)||types.isProxy(x)||
     Object.getPrototypeOf(x)!==Object.prototype)return false;
  const names=Reflect.ownKeys(x);
  if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return false;
  return names.every(k=>{
   const d=Object.getOwnPropertyDescriptor(x,k);
   return d&&d.enumerable===true&&Object.hasOwn(d,'value');
  });
 }catch{return false}
}
function publicEd25519(x){
 const k=x?.type==='public'?x:createPublicKey(x);
 if(k.asymmetricKeyType!=='ed25519'||k.type!=='public')throw Error('O4_ED25519_PUBLIC_KEY_REQUIRED');
 return k;
}
const der=k=>k.export({format:'der',type:'spki'});
export function createO4ThreeKeyServerCandidatePreflight({
 tracePublicKey,validatorPublicKey,serverReviewPublicKey,
 scope,expectedAotDigest,expectedRuleDigest,nonceLedger=null,maxAttempts=4
}={}){
 if(typeof scope!=='string'||!TOKEN.test(scope)||
    typeof expectedAotDigest!=='string'||!HEX.test(expectedAotDigest)||
    typeof expectedRuleDigest!=='string'||!HEX.test(expectedRuleDigest)||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>16)
  throw Error('O4_HOST_CONFIGURATION_INVALID');
 // Key pins are trusted configuration, never read from the submitted proposal.
 const traceKey=publicEd25519(tracePublicKey);
 const validatorKey=publicEd25519(validatorPublicKey);
 const reviewKey=publicEd25519(serverReviewPublicKey);
 if(der(traceKey).equals(der(validatorKey))||
    der(traceKey).equals(der(reviewKey))||
    der(validatorKey).equals(der(reviewKey)))
  throw Error('O4_THREE_SIGNER_KEYS_NOT_INDEPENDENT');
 let validator;
 try{
  validator=createO2IndependentValidatorEvidenceGate({
   tracePublicKey:traceKey,validatorPublicKey:validatorKey,
   scope,expectedAotDigest,expectedRuleDigest,nonceLedger
  });
 }catch(error){
  if(error?.message==='O2_TRACE_NONCE_LEDGER_MISMATCH')
   throw Error('O4_HOST_NONCE_LEDGER_MISMATCH');
  throw error;
 }
 let remaining=maxAttempts;
 return Object.freeze({
  verifyProposal(packet){
   if(remaining===0)return deny('O4_PREFLIGHT_ATTEMPT_BUDGET_EXHAUSTED');
   remaining--; // reserve before any cryptographic or replay-sensitive operation
   if(!exact(packet,['candidateEnvelope','validatorReceipt','traceReceipt','input','observation','runId','candidateBytes']))
    return deny('O4_PROPOSAL_ARGUMENTS_UNSAFE');
   const envelope=own(packet,'candidateEnvelope'),vReceipt=own(packet,'validatorReceipt');
   const tReceipt=own(packet,'traceReceipt'),input=own(packet,'input');
   const observation=own(packet,'observation'),runId=own(packet,'runId');
   const candidateBytes=snapshotCandidateBytes(own(packet,'candidateBytes'));
   if(!candidateBytes)return deny('O4_CANDIDATE_CONTENT_UNSAFE');
   if(!exact(envelope,['payload','signature'])||
      !exact(vReceipt,['payload','signature'])||
      !exact(tReceipt,['payload','signature'])||
      typeof runId!=='string'||!TOKEN.test(runId))return deny('O4_PROPOSAL_RECEIPT_UNSAFE');
   const p=own(envelope,'payload'),signature=own(envelope,'signature');
   const v=own(vReceipt,'payload'),vsig=own(vReceipt,'signature');
   const tr=own(tReceipt,'payload'),tsig=own(tReceipt,'signature');
   if(!exact(p,FIELDS)||typeof signature!=='string'||!SIG.test(signature)||
      typeof vsig!=='string'||!SIG.test(vsig)||
      typeof tsig!=='string'||!SIG.test(tsig)||
      typeof tr!=='object'||tr===null||types.isProxy(tr)||
      typeof v!=='object'||v===null||types.isProxy(v))
    return deny('O4_PROPOSAL_RECEIPT_UNSAFE');
   // Check the explicit two-key Validator verdict BEFORE consuming the Trace.
   // A signed failed/unknown Validator decision cannot be counted as PASS.
   if(p.version!==VERSION||p.scope!==scope||p.runId!==runId||
      p.selectedAotDigest!==expectedAotDigest||p.ruleDigest!==expectedRuleDigest||
      p.validatorSignature!==vsig||p.traceSignature!==tsig||
      typeof p.observationDigest!=='string'||!HEX.test(p.observationDigest)||
      p.observationDigest!==own(tr,'observationDigest')||
      p.proposalDigest===expectedAotDigest||
      typeof p.proposalDigest!=='string'||!HEX.test(p.proposalDigest)||
      p.consentScope!=='local-only'||p.disposition!=='CANDIDATE_PREFLIGHT_ONLY'||
      p.authorizedPromotion!==false||own(v,'verdict')!=='PASS')
    return deny('O4_PROPOSAL_SCOPE_OR_POLICY_MISMATCH');
   let signed=false;
   try{signed=verify(null,Buffer.from(JSON.stringify(p)),reviewKey,Buffer.from(signature,'base64url'))}
   catch{return deny('O4_SERVER_REVIEW_SIGNATURE_INVALID')}
   if(!signed)return deny('O4_SERVER_REVIEW_SIGNATURE_INVALID');
   // Bind the signed digest declaration to the exact candidate bytes supplied
   // by the caller. A mismatch is rejected before O2 can consume the Trace nonce.
   const actualProposalDigest=createHash('sha256').update(candidateBytes).digest('hex');
   if(actualProposalDigest!==p.proposalDigest)
    return deny('O4_CANDIDATE_CONTENT_DIGEST_MISMATCH');
   // Independent verified O2 two-key binding. This call consumes Host nonce
   // only after the third key signature is valid and correct policy is pinned.
   const verified=validator.consume({
    validatorReceipt:vReceipt,traceReceipt:tReceipt,input,observation,runId
   });
   if(verified.status!=='VALIDATOR_RECEIPT_VERIFIED_TECHNICAL'||
      verified.traceVerified!==true||verified.validatorSignatureVerified!==true||
      verified.validatorVerdict!=='PASS'){
    // O2 intentionally exposes one fail-closed Trace failure category here;
    // replay and durable-ledger I/O failure both remain UNKNOWN at this seam.
    return deny('O4_ORIGINAL_TWO_KEY_EVIDENCE_NOT_VERIFIED');
   }
   // Read the private snapshot through captured intrinsics too; do not
   // consult even its mutable realm prototype when serializing the Base64.
   const candidateBytesBase64=Buffer.from(
    TYPED_ARRAY_BUFFER_GET.call(candidateBytes),
    TYPED_ARRAY_OFFSET_GET.call(candidateBytes),
    TYPED_ARRAY_LENGTH_GET.call(candidateBytes)
   ).toString('base64');
   // Deliberately cannot trigger network upload, promote, build/activate AOT
   // or mint authoritative governance, Experience or Effect receipts.
   return Object.freeze({
    status:'CANDIDATE_PREFLIGHT_VERIFIED_TECHNICAL_ONLY',
    reason:'INDEPENDENT_DOMAIN_ORACLE_GOVERNANCE_PROMOTION_AND_NEW_AOT_MISSING',
    scope:'LOCAL_TECHNICAL_PREFLIGHT_ONLY',
    proposalDigest:p.proposalDigest,selectedAotDigest:expectedAotDigest,
    technicalEnvelopeVerified:true,traceVerified:true,
    validatorSignatureVerified:true,serverReviewSignatureVerified:true,
    candidateContentDigestVerified:true,
    // Immutable text snapshot for a downstream consumer to publish/use instead
    // of the caller-owned Buffer that was supplied to this verification call.
    candidateBytesBase64,
    qualified:false,experienceIssued:false,governanceApproved:false,
    serverPromotionAuthorized:false,newAotBuilt:false,newAotActivated:false,
    artifactExported:false,effectDispatched:false,authority:'NONE'
   });
  },
  state:()=>Object.freeze({
   remaining,scope:'LOCAL_TECHNICAL_PREFLIGHT_ONLY',qualified:false,
   governanceApproved:false,serverPromotionAuthorized:false
  })
 });
}
