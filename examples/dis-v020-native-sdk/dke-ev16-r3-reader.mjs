/**
 * DKE #209 R3 + R7 original source receipts -> DIS #1499 read-only Knowledge.
 * This is a *new* downstream EV16 D02+D04 boundary, distinct from C1 R31:
 * original RFC/Tally source-exact replay, cross-publisher UNKNOWN and scoped
 * Source Owner quarantine are selected DATA, never semantic SAP or Effects.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';

export const EV16_R3_ORIGINS=Object.freeze({
 receipt:Object.freeze({
  repository:'kaicreator-mm/domain-forge',
  commit:'5659d8f56a53ef63981fe93a264cad6c453a94ed',
  path:'docs/standards/dke/DKE-0.0.1/demos/ev16-d04-source-tier-r0/EV16_D02_D04_R3_REPAIR_EXECUTION_RECEIPT.json',
  gitBlob:'844a16219e31cc994d4d958e565879cb5e0c6872'
 }),
 r1:Object.freeze({
  repository:'kaicreator-mm/domain-forge',
  commit:'bd15d5e433bd53808910a4069681b43fccff9f79',
  path:'docs/standards/dke/DKE-0.0.1/demos/ev16-d04-source-tier-r0/EXECUTION_RECEIPT_R1_SELECTED_CONSUMER_REPAIR.json',
  gitBlob:'4fe1b2ec9ae359e3b75c775267a7f354641006bd'
 }),
 routing:Object.freeze({
  repository:'kaicreator-mm/domain-forge',
  commit:'5659d8f56a53ef63981fe93a264cad6c453a94ed',
  path:'docs/standards/dke/DKE-0.0.1/demos/R31_SCOPED_OWNER_AUTHORITY_ROUTE_R7.json',
  gitBlob:'6abb5fb59843845e594aedd749f78cbbe0efeea7'
 })
});
const selection=Object.freeze({
 'EV16:D02+D04':'CROSS_SOURCE_F2_UNKNOWN',
 'se:REL-TVV-0020':'ANALYST_DERIVED_HOLD_UNKNOWN',
 'se:DM-REQ-FUNCTIONAL-DOC-METHOD':'ORIGINAL_TALLY_UNSUPPORTED_RULE_QUARANTINED'
});
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const parse=text=>{try{return JSON.parse(text)}catch{return null}};
export function makeEv16R3Reader(receiptText,routingText,r1Text){
 if(typeof receiptText!=='string'||typeof routingText!=='string'||typeof r1Text!=='string'||
    sourceGitBlob(receiptText)!==EV16_R3_ORIGINS.receipt.gitBlob||
    sourceGitBlob(routingText)!==EV16_R3_ORIGINS.routing.gitBlob||
    sourceGitBlob(r1Text)!==EV16_R3_ORIGINS.r1.gitBlob)
  fail('DKE_EV16_R3_ORIGINAL_DATA_DRIFT');
 const r=parse(receiptText),q=parse(routingText),fresh=parse(r1Text);
 if(r?.schema!=='dke.ev16-d02-d04.r3-source-first-repair-replay/1'||
    r.source?.originalTallyNodes!==807||
    r.source?.inputGitBlobs?.graph!=='0f6007315fd7352fe6fd218effcfecf672cb4961'||
    r.source?.inputGitBlobs?.scope!=='d5747c057c92bc357cc68053e43d96b36427e02c'||
    r.source?.inputGitBlobs?.rfc9110!=='19a88abcb4df0744df2d55c6d1af53125b6d9bd2'||
    r.source?.inputGitBlobs?.rfc9111!=='cef95c761dfcbc6f649019efa2cf5f97dc5f9020'||
    r.actualExecution?.after?.passed!==23||
    r.actualExecution.after.total!==23||
    r.actualExecution.after.failed!==0||
    r.actualExecution.after.rawExactGitBlobChecks!==4||
    r.actualExecution.after.exactRawSourcePinsMatched!==true||
    r.actualExecution.after.composition?.status!=='UNKNOWN_NO_CROSS_PUBLISHER_ENTAILMENT'||
    r.actualExecution.after.composition.parentQualified!==false||
    r.actualExecution.nativeNode!=='NOT_RUN'||
    r.qualification?.ownerReviewDecision!=='NOT_RUN'||
    r.qualification?.formalEv16Cell!=='NOT_RUN_OWNER_GATE'||
    r.qualification?.R8!=='0/53'||r.qualification?.SAP!==0||
    r.qualification?.effects!==0)
  fail('DKE_EV16_R3_EVIDENCE_SCOPE_INVALID');
 if(q?.schema!=='dke.r31.source-owner-authority-routing/1'||
    q.authority?.ev16R3ReceiptGitBlob!==EV16_R3_ORIGINS.receipt.gitBlob||
    q.authority?.originalTallyGraphGitBlob!==r.source.inputGitBlobs.graph||
    q.gates?.productScopeApproval!=='CONFIRMED_DO_NOT_REQUEST_AGAIN'||
    q.gates?.sourceOwnerDecisionMayBeSelfSignedByAssistant!==false||
    q.gates?.ev16OfficialFrozenCell!=='NOT_RUN'||
    q.gates?.qualifiedCells!=='0/53'||
    q.gates?.qualifiedSap!==0||q.gates?.authorizedEffects!==0||
    q.gates?.releaseEligible!==false)
  fail('DKE_EV16_R7_OWNER_BOUNDARY_INVALID');
 if(fresh?.schema!=='dke.ev16.selected-consumer-independent-review-repair/1'||
    fresh.exact?.reusedUnchangedR3VerifierGitBlob!=='b4b86af4b9def3db1a3817dd459c05ec0e2ea579'||
    fresh.exact?.repairedConsumerGitBlob!=='70005ef7c181260a6aaf041b829927fc4d194bed'||
    fresh.exact?.inputOriginalGitBlobs?.tallyGraph!==r.source.inputGitBlobs.graph||
    fresh.exact?.inputOriginalGitBlobs?.scopedDecision!==r.source.inputGitBlobs.scope||
    fresh.exact?.inputOriginalGitBlobs?.rfc9110!==r.source.inputGitBlobs.rfc9110||
    fresh.exact?.inputOriginalGitBlobs?.rfc9111!==r.source.inputGitBlobs.rfc9111||
    fresh.execution?.sourceR3?.sourceBlobVerification!=='ACTUAL_UTF8_GIT_BLOB_SHA1_MATCHED_4_OF_4'||
    fresh.execution?.suite?.tests!==21||fresh.execution.suite.passed!==21||
    fresh.execution.suite.failed!==0||
    fresh.execution?.positive?.selectedQueries!==10||
    fresh.execution.positive.root!=='UNKNOWN'||
    fresh.execution?.negative?.additionalInvalidRequestsBlocked!==5||
    fresh.gates?.sourceOwnerDecision!=='NOT_ATTESTED'||
    fresh.gates?.independentOracle!=='NOT_QUALIFIED'||
    fresh.gates?.formalEv16Cell!=='NOT_RUN'||
    fresh.gates?.qualifiedR8Cells!=='0/53'||
    fresh.gates?.qualifiedSap!==0||fresh.gates?.effectsAuthorized!==0)
  fail('DKE_EV16_R1_REVIEW_SCOPE_INVALID');
 const byId=Object.fromEntries((q.decisionRouting??[]).map(x=>[x.id,x]));
 if(q.decisionRouting?.length!==6||
    byId.OD01?.productScope!=='CONFIRMED_ACCEPT_SCOPED'||
    byId.OD02?.productScope!=='CONFIRMED_ACCEPT_SCOPED'||
    byId.OD03?.productScope!=='CONFIRMED_ROOT_OWNED_DERIVED_HOLD_UNKNOWN'||
    byId.OD05?.originalSourceOwner!=='TALLY_PRODUCER_DECISION_PENDING'||
    byId.OD06?.productScope!=='MITIGATION_CONFIRMED_KEEP_OPEN')
  fail('DKE_EV16_R7_DECISION_ROUTE_INVALID');
 return Object.freeze({query(input){
  // Snapshot the ONE declared own data property exactly once. A getter,
  // Proxy trap, inherited key, symbol or post-check value change cannot
  // choose a different source after validation.
  let subject;
  try{
   if(!input||typeof input!=='object'||Array.isArray(input)||
      Object.getPrototypeOf(input)!==Object.prototype)
     fail('DKE_EV16_R3_SUBJECT_INVALID');
   const keys=Reflect.ownKeys(input);
   if(keys.length!==1||keys[0]!=='subject')
     fail('DKE_EV16_R3_SUBJECT_INVALID');
   const own=Object.getOwnPropertyDescriptor(input,'subject');
   if(!own||!Object.hasOwn(own,'value')||
      typeof own.value!=='string'||!Object.hasOwn(selection,own.value))
     fail('DKE_EV16_R3_SUBJECT_INVALID');
   subject=own.value;
  }catch{fail('DKE_EV16_R3_SUBJECT_INVALID')}
  return Object.freeze({
   status:'UNKNOWN',subject,
   sourceVerdict:selection[subject],
   observationTier:'ORIGINAL_TALLY_RFC_SOURCE_PREFLIGHT_ONLY',
   crossPublisherAuthority:'NONE',ownerReviewDecision:'NOT_RUN',
   formalEv16Cell:'NOT_RUN',
   originalGraphGitBlob:r.source.inputGitBlobs.graph,
   r3ReceiptGitBlob:EV16_R3_ORIGINS.receipt.gitBlob,
   r7RoutingGitBlob:EV16_R3_ORIGINS.routing.gitBlob,
   r1IndependentReviewGitBlob:EV16_R3_ORIGINS.r1.gitBlob,
   selectedCqChecks:fresh.execution.suite.passed,
   selectedQueryCount:fresh.execution.positive.selectedQueries,
   selectedConsumerCodeGitBlob:fresh.exact.repairedConsumerGitBlob,
   sapQualified:false,effectDispatched:false
  });
 }});
}
