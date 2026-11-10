/** B04-03 / R43. A *read-only readiness decision*, not an auditor.
 * A model/script cannot self-issue Product/L1, source-owner or SAP authority.
 */
import {inspectCheckedInClosure} from './closure-audit.mjs';
import {auditCheckedInBatches} from './batch-audit.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const GROUPS=Object.freeze({
 C1:'Independent original source owner, Element cohesion and SAP semantic reviewer acceptance',
 C2:'Complete applicable Function ABI/Evidence and Domain-owned state obligations',
 C3:'Approved *applicable* selected Target implementation and UI-neutral Interaction scope (not compulsory every OS or production UI channel)',
 C4:'All applicable Core MUSTs and exact receipt-source coverage fully qualified'
});
export function decideB04Readiness({closure,sourceAudit,claimedApproval=undefined}){
 if(closure?.schema!=='dis.v0.2.c4-closure-inventory/1'||
    !Array.isArray(closure.remaining)||closure.totalCore!==16||
    closure.verifiedCore+closure.partialCore!==16||
    closure.sourceReview?.originalReviewBlob!=='0b7d514cc297a07952b2cd536c2dafd3e47bda45'||
    closure.sourceReview?.originalProposalBlob!=='9dc978f5138c561efabe503f254e565aa5f5700a')
  fail('READINESS_SOURCE_INCOMPLETE');
 if(!sourceAudit||sourceAudit.auditedRounds!==9||
    sourceAudit.recordedCIValid!==9||!Array.isArray(sourceAudit.rows))
  fail('READINESS_ROUND_AUDIT_INCOMPLETE');
 if(claimedApproval!==undefined)fail('READINESS_UNVERIFIED_APPROVAL');
 if(closure.sourceReview.independent!==false||closure.sourceReview.sap!=='UNQUALIFIED'||
    closure.sourceReview.locatorRepair!=='OPEN')
  fail('READINESS_SOURCE_OWNER_UNACCEPTED');
 // A future properly qualified 10/16, 11/16, etc. cannot be
 // rejected merely because the original R42 inventory was 9/16.
 // The source/SAP, unresolved scope blockers and freeze gates still apply.
 if(closure.formalFreezeEligible!==false||
    closure.remaining.length!==closure.partialCore||
    closure.remaining.some(x=>x.status!=='PARTIAL'||!Object.hasOwn(GROUPS,x.group)))
  fail('READINESS_PREMATURE_CLOSURE');
 const blockers=closure.remaining.map(r=>Object.freeze({
  id:r.id,group:r.group,requires:GROUPS[r.group],receiptCount:r.linkedReceipts,
  structuralEvidenceExists:r.positiveCases>0&&r.negativeCases>0,
  status:'BLOCKED_NORMATIVE_SCOPE_OR_INDEPENDENT_EVIDENCE'
 }));
 return Object.freeze({
  schema:'dis.v0.2.c4-readiness/1',status:'BLOCKED',
  verifiedCore:closure.verifiedCore,partialCore:closure.partialCore,
  roundsAudited:sourceAudit.auditedRounds,
  priorTestBlobDriftCount:sourceAudit.currentBlobDrifts.length,
  releaseEligible:false,freezeEligible:false,mergeEligible:false,
  independentSourceOwnerAccepted:false,independentSAP:false,
  unqualifiedHostTarget:closure.remaining.some(x=>x.id==='DIS020-CORE-008'),
  blockers,
  next:[GROUPS.C1,GROUPS.C3,GROUPS.C2,GROUPS.C4,
   'Fresh independent exact-SHA C5 Product/L1/L2 review after C4 full coverage'],
  lesson:'Previously qualified exact-SHA native evidence remains historical; source byte drift and semantic owner authority are separate dimensions.'
 });
}
export async function inspectCheckedInReadiness(){
 const [closure,sourceAudit]=await Promise.all([inspectCheckedInClosure(),auditCheckedInBatches()]);
 return decideB04Readiness({closure,sourceAudit});
}
