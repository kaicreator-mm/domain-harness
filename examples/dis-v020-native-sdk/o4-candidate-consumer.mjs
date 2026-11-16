/**
 * R155 G6 bounded consumer: verified O4 bytes -> pinned G4 candidate store ->
 * selected xDownload DIS AOT observation. This is NOT qualified Solution replay.
 *
 * preflightResult must be passed directly from the trusted R154 gate in the
 * same Host process; it is not an API for caller/LLM/network-deserialized data.
 * A G4 candidate may be inspected while unchanged, but remains
 * REPLAY_BLOCKED_UNQUALIFIED. This consumer therefore permits only local,
 * effect:none Interaction observations; it never dispatches KDP or an Effect.
 * STALE/INVALIDATED store states propagate before any Domain App invocation.
 */
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {types} from 'node:util';
import {inspectStoredReplay} from './snapshots/formal-tools/packages/runner/js/solution-store.mjs';

const HEX=/^[a-f0-9]{64}$/;
const TOKEN=/^[A-Za-z][A-Za-z0-9._:/-]{0,127}$/;
const PRECHECK_FIELDS=[
 'status','reason','scope','proposalDigest','selectedAotDigest',
 'technicalEnvelopeVerified','traceVerified','validatorSignatureVerified',
 'serverReviewSignatureVerified','candidateContentDigestVerified',
 'candidateBytesBase64','qualified','experienceIssued','governanceApproved',
 'serverPromotionAuthorized','newAotBuilt','newAotActivated','artifactExported',
 'effectDispatched','authority'
];
const CANDIDATE_FIELDS=[
 'schema','scope','runId','selectedAotDigest','sourceSha256','ruleDigest','selectedFunction',
 'continuationFunction','disposition','solutionCandidateSha256','input'
];
const INPUT_FIELDS=['channel','requestId','url','declaredBytes'];
const fail=(status,reason,extra={})=>Object.freeze({
 status,reason,authority:'NONE',effectDispatched:false,qualified:false,
 solutionReplay:'BLOCKED_UNQUALIFIED',replayAllowed:false,...extra
});
function exactDataRecord(value,keys){
 try{
  if(value===null||typeof value!=='object'||Array.isArray(value)||types.isProxy(value)||
     Object.getPrototypeOf(value)!==Object.prototype)return null;
  const names=Reflect.ownKeys(value);
  if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
  const out=Object.create(null);
  for(const key of keys){
   const d=Object.getOwnPropertyDescriptor(value,key);
   if(!d||d.enumerable!==true||!Object.hasOwn(d,'value'))return null;
   out[key]=d.value;
  }
  return out;
 }catch{return null}
}
function decodeCanonicalBase64(value){
 if(typeof value!=='string'||value.length===0||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return null;
 try{
  const bytes=Buffer.from(value,'base64');
  return bytes.toString('base64')===value?bytes:null;
 }catch{return null}
}
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function consumeVerifiedO4Candidate({
 preflightResult,app,expectedScope,expectedRuleDigest,storeDir,currentProvenanceJson
}={}){
 if(!Object.isFrozen(preflightResult))return fail('BLOCKED','O4_PREFLIGHT_RESULT_NOT_DIRECT');
 const pre=exactDataRecord(preflightResult,PRECHECK_FIELDS);
 if(!pre)return fail('BLOCKED','O4_PREFLIGHT_RESULT_UNSAFE');
 if(pre.status!=='CANDIDATE_PREFLIGHT_VERIFIED_TECHNICAL_ONLY'||
    pre.reason!=='INDEPENDENT_DOMAIN_ORACLE_GOVERNANCE_PROMOTION_AND_NEW_AOT_MISSING'||
    pre.scope!=='LOCAL_TECHNICAL_PREFLIGHT_ONLY'||
    pre.technicalEnvelopeVerified!==true||pre.traceVerified!==true||
    pre.validatorSignatureVerified!==true||pre.serverReviewSignatureVerified!==true||
    pre.candidateContentDigestVerified!==true||pre.qualified!==false||
    pre.experienceIssued!==false||pre.governanceApproved!==false||
    pre.serverPromotionAuthorized!==false||pre.newAotBuilt!==false||
    pre.newAotActivated!==false||pre.artifactExported!==false||
    pre.effectDispatched!==false||pre.authority!=='NONE'||
    !HEX.test(pre.proposalDigest)||!HEX.test(pre.selectedAotDigest))
  return fail('BLOCKED','O4_TECHNICAL_ONLY_PRECHECK_REQUIRED');
 if(typeof expectedScope!=='string'||!TOKEN.test(expectedScope)||
    typeof expectedRuleDigest!=='string'||!HEX.test(expectedRuleDigest)||
    typeof storeDir!=='string'||typeof currentProvenanceJson!=='string')
  return fail('BLOCKED','G6_TRUSTED_HOST_CONFIGURATION_REQUIRED');

 const bytes=decodeCanonicalBase64(pre.candidateBytesBase64);
 if(!bytes||sha256(bytes)!==pre.proposalDigest)
  return fail('BLOCKED','O4_VERIFIED_SNAPSHOT_DIGEST_MISMATCH');
 let parsed;
 try{parsed=JSON.parse(bytes.toString('utf8'))}catch{return fail('BLOCKED','O4_SNAPSHOT_JSON_INVALID')}
 const candidate=exactDataRecord(parsed,CANDIDATE_FIELDS);
 if(!candidate)return fail('BLOCKED','O4_SNAPSHOT_SCHEMA_INVALID');
 const input=exactDataRecord(candidate.input,INPUT_FIELDS);
 if(!input)return fail('BLOCKED','O4_SNAPSHOT_INPUT_INVALID');
 if(candidate.schema!=='dis.o4.server-meta-candidate/1'||
    candidate.scope!==expectedScope||!TOKEN.test(candidate.runId)||
    candidate.runId!==input.requestId||
    candidate.selectedAotDigest!==pre.selectedAotDigest||
    !HEX.test(candidate.sourceSha256)||
    candidate.ruleDigest!==expectedRuleDigest||
    candidate.selectedFunction!=='xdownload.interaction.inspect'||
    candidate.continuationFunction!=='xdownload.interaction.confirm'||
    candidate.disposition!=='CANDIDATE_PREFLIGHT_ONLY'||
    !HEX.test(candidate.solutionCandidateSha256)||
    !['chat','form','cli'].includes(input.channel)||
    typeof input.url!=='string'||typeof input.requestId!=='string'||
    !Number.isSafeInteger(input.declaredBytes)||input.declaredBytes<1||input.declaredBytes>1048576)
  return fail('BLOCKED','O4_SNAPSHOT_SCOPE_OR_FUNCTION_MISMATCH');

 // Bind the signed O4 candidate bytes to the current G4 Source and Model pins;
 // the G4 store then decides currentness and durable revocation.
 let provenance;
 try{provenance=JSON.parse(currentProvenanceJson)}catch{return fail('BLOCKED','G4_PROVENANCE_JSON_INVALID')}
 if(provenance?.schema!=='formal-tools/solution-provenance/0.1'||
    provenance.source_sha256!==candidate.sourceSha256||
    provenance.oracle_sha256!==candidate.sourceSha256||
    provenance.model_sha256!==candidate.selectedAotDigest)
  return fail('STALE','G4_SOURCE_OR_MODEL_PROVENANCE_MISMATCH');
 // The exact pinned formal-tools G4 store is the source of truth for drift and
 // revocation. A matching candidate is still explicitly unqualified.
 let replay;
 try{
  replay=await inspectStoredReplay({
   store_dir:storeDir,candidate_sha256:candidate.solutionCandidateSha256,
   current_provenance_json:currentProvenanceJson
  });
 }catch{return fail('UNKNOWN','G4_REPLAY_INSPECTION_FAILED')}
 if(replay.status==='STALE')
  return fail('STALE','G4_PROVENANCE_DRIFT',{changedFields:replay.changed_fields||[]});
 if(replay.status==='INVALIDATED')
  return fail('INVALIDATED','G4_REVOCATION_TOMBSTONE');
 if(replay.status!=='REPLAY_BLOCKED_UNQUALIFIED'||
    replay.fingerprint!==candidate.solutionCandidateSha256)
  return fail('BLOCKED','G4_CANDIDATE_NOT_CURRENT');

 // The app object is a trusted Host dependency. Only the two pinned,
 // effect:none Interaction functions may be called by this consumer.
 if(!app||app.state!=='READY'||app.aotDigest!==candidate.selectedAotDigest||
    app.aotDigest!==pre.selectedAotDigest)
  return fail('STALE','DIS_SELECTED_AOT_DRIFT');
 if(!Array.isArray(app.functions)||
    !app.functions.includes('xdownload.interaction.inspect')||
    !app.functions.includes('xdownload.interaction.confirm')||
    app.contractVersions?.['xdownload.interaction.inspect']!=='1.0.0'||
    app.contractVersions?.['xdownload.interaction.confirm']!=='1.0.0')
  return fail('BLOCKED','DIS_INTERACTION_FUNCTION_NOT_SELECTED');

 try{
  const inspected=await app.invoke('xdownload.interaction.inspect',input);
  if(inspected?.kind!=='OBSERVATION'||inspected.authority!=='NONE'||
     inspected.value?.authority!=='NONE'||inspected.value?.effectDispatched!==false||
     inspected.value?.status!=='AWAITING_CONFIRMATION'||
     inspected.value?.proposal?.channel!==input.channel||
     inspected.value?.proposal?.requestId!==input.requestId||
     inspected.value?.proposal?.url!==input.url||
     inspected.value?.proposal?.declaredBytes!==input.declaredBytes)
   return fail('UNKNOWN','DIS_INTERACTION_INSPECTION_NOT_OBSERVED');
  const confirmed=await app.invoke('xdownload.interaction.confirm',{
   draft:inspected.value,answers:{},confirmed:true
  });
  if(confirmed?.kind!=='OBSERVATION'||confirmed.authority!=='NONE'||
     confirmed.value?.authority!=='NONE'||confirmed.value?.effectDispatched!==false||
     confirmed.value?.status!=='READY_FOR_KDP'||confirmed.value?.permittedEffect!==false||
     confirmed.value?.proposal?.channel!==input.channel||
     confirmed.value?.proposal?.requestId!==input.requestId||
     confirmed.value?.proposal?.url!==input.url||
     confirmed.value?.proposal?.declaredBytes!==input.declaredBytes||
     confirmed.value?.prerequisite!=='A_SEPARATE_SELECTED_KDP_INTENT_CALL_IS_REQUIRED'||
     app.aotDigest!==candidate.selectedAotDigest)
   return fail('UNKNOWN','DIS_INTERACTION_CONFIRMATION_NOT_OBSERVED');
  return Object.freeze({
   status:'CONSUMED_OBSERVATION_ONLY',
   reason:'G4_SOLUTION_REPLAY_REMAINS_BLOCKED_UNQUALIFIED',
   candidateStoreStatus:'REPLAY_BLOCKED_UNQUALIFIED',
   candidateSha256:candidate.solutionCandidateSha256,
   proposalDigest:pre.proposalDigest,selectedAotDigest:pre.selectedAotDigest,
   selectedFunction:'xdownload.interaction.inspect',
   domainOutcome:confirmed.value.status,
   solutionReplay:'BLOCKED_UNQUALIFIED',replayAllowed:false,
   qualified:false,solutionPromotable:false,experienceIssued:false,
   governanceApproved:false,serverPromotionAuthorized:false,
   effectDispatched:false,authority:'NONE'
  });
 }catch{return fail('UNKNOWN','DIS_DOMAIN_APP_INVOCATION_FAILED')}
}
