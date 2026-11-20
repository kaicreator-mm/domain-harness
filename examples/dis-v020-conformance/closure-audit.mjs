/** B04-02 / R42 — C4 normative closure inventory, not an approving Oracle. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditCheckedInBatches} from './batch-audit.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base='docs/standards/domain-intelligence/DIS-0.2.0/conformance';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const sha1=text=>{
 const b=Buffer.from(text,'utf8');
 return createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
};
const ORIGINAL_REVIEW_BLOB='0b7d514cc297a07952b2cd536c2dafd3e47bda45';
const ORIGINAL_PROPOSAL_BLOB='9dc978f5138c561efabe503f254e565aa5f5700a';
const group=(plan,id)=>plan.coreAndGovernance.find(x=>x.requirementIds.includes(id))?.group;
export function inspectClosure({matrix,plan,review,proposal,reviewBlob,proposalBlob,batchAudit}){
 if(matrix?.schema!=='dis.v0.2.conformance-matrix/1'||plan?.schema!=='dis.v0.2.closure-plan/1'||
    matrix.version!=='0.2.0'||plan.version!=='0.2.0')
  fail('CLOSURE_PLAN_SCHEMA_INVALID');
 if(reviewBlob!==ORIGINAL_REVIEW_BLOB||proposalBlob!==ORIGINAL_PROPOSAL_BLOB||
    review?.schema!=='dke.r27.source-first-sap-ownership-review/1'||
    proposal?.schema!=='dke.r28.source-locator-repair-candidate/1')
  fail('CLOSURE_ORIGINAL_SOURCE_BLOB_INVALID');
 if(review.independentHumanOrSecondModel!==false||
    review.globalSAPQualification!=='UNRESOLVED'||
    review.pendingSourceRepair?.length!==1||
    review.pendingSourceRepair[0].status!=='OPEN'||
    proposal.canonicalSourceAmended!==false||proposal.sourceQualified!==false||
    proposal.independentOracle!==false||proposal.authority!=='PATCH_PROPOSAL_ONLY')
  fail('CLOSURE_SAP_OWNER_AUTHORITY_NOT_PROVEN');
 if(batchAudit?.auditedRounds!==9||batchAudit.recordedCIValid!==9)
  fail('CLOSURE_BATCH_AUDIT_INCOMPLETE');
 const core=matrix.requirements.filter(x=>x.profile==='core');
 const optional=matrix.requirements.filter(x=>x.profile==='optional-profile');
 const governance=matrix.requirements.filter(x=>x.profile==='governance');
 if(core.length!==16||optional.length!==4||governance.length!==1)
  fail('CLOSURE_REQUIREMENT_CARDINALITY_DRIFT');
 // The inventory cannot encode yesterday's 9/16 as an invariant:
 // it would reject the next genuinely qualified Core closure forever.
 // Qualification is assessed separately using source evidence + authority.
 if(core.some(x=>!['VERIFIED','PARTIAL'].includes(x.state)))
  fail('CLOSURE_UNEXPECTED_CORE_STATE');
 const unverified=core.filter(x=>x.state!=='VERIFIED'),partial=core.filter(x=>x.state==='PARTIAL');
 const expected=unverified.map(x=>x.id).sort();
 const scheduled=plan.coreAndGovernance.flatMap(x=>x.requirementIds).filter(x=>x.startsWith('DIS020-CORE-')).sort();
 if(JSON.stringify(expected)!==JSON.stringify(scheduled)||new Set(scheduled).size!==scheduled.length)
  fail('CLOSURE_DAG_GAP');
 if(['DIS020-CORE-002','DIS020-CORE-005'].some(id=>core.find(x=>x.id===id).state==='VERIFIED'))
  fail('CLOSURE_UNQUALIFIED_SEMANTIC_PROMOTION');
 // Product #1496 explicitly accepted R86 only for the prior linux/x64/node Demo.
 // Require this exact decision marker and bounded scope for a VERIFIED C3 row.
 const c3=plan.currentC3,target=c3?.appliesTo;
 if(core.find(x=>x.id==='DIS020-CORE-008').state==='VERIFIED'&&
   (c3?.status!=='VERIFIED_PRODUCT_ACCEPTED_LINUX_X64_NODE'||
    c3?.productAcceptanceUrl!=='https://github.com/kaicreator-mm/domain-harness/issues/1496#issuecomment-6782273293'||
    target?.platform!=='linux'||target?.architecture!=='x64'||target?.runtime!=='node'||
    !c3?.freshReviewReceiptId||!core.find(x=>x.id==='DIS020-CORE-008').receiptIds.includes(c3.freshReviewReceiptId)||
    plan.blockers.some(x=>x.blocks?.includes('DIS020-CORE-008'))))
  fail('CLOSURE_UNQUALIFIED_TARGET_PROMOTION');
 if(plan.blockers.some(x=>x.code==='TARGET_APPLICABILITY_NOT_APPROVED')&&
    core.find(x=>x.id==='DIS020-CORE-008').state==='VERIFIED')
  fail('CLOSURE_UNQUALIFIED_TARGET_PROMOTION');
 if(plan.blockers.some(x=>x.code==='INTERACTION_REAL_TRANSPORT_SCOPE_UNDECIDED')&&
    core.find(x=>x.id==='DIS020-CORE-014').state==='VERIFIED')
  fail('CLOSURE_UNQUALIFIED_TRANSPORT_PROMOTION');
 if(core.find(x=>x.id==='DIS020-CORE-016').state==='VERIFIED'&&unverified.length>1)
  fail('CLOSURE_PREMATURE_MATRIX_PROMOTION');
 if(governance[0].state==='VERIFIED')
  fail('CLOSURE_GOVERNANCE_PREMATURE');
 return Object.freeze({
  schema:'dis.v0.2.c4-closure-inventory/1',
  totalCore:core.length,verifiedCore:core.length-partial.length,partialCore:partial.length,
  optionalNotRun:optional.filter(x=>x.state==='NOT_RUN').length,
  governanceNotRun:governance.filter(x=>x.state==='NOT_RUN').length,
  priorRoundReceiptsAudited:batchAudit.auditedRounds,
  evidenceScope:'STORED_CI_ONLY_NOT_INDEPENDENT_SEMANTIC_ORACLE',
  sourceReview:{independent:false,locatorRepair:'OPEN',sap:'UNQUALIFIED',originalReviewBlob:reviewBlob,originalProposalBlob:proposalBlob},
  remaining:partial.map(x=>({id:x.id,title:x.title,group:group(plan,x.id),
   linkedReceipts:x.receiptIds.length,positiveCases:x.positive.length,negativeCases:x.negative.length,
   status:'PARTIAL',needs:'NORMATIVE_OR_EXTERNAL_GATE'})),
  formalFreezeEligible:false
 });
}
export async function inspectCheckedInClosure(){
 const read=async path=>readFile(join(root,path),'utf8');
 const matrix=JSON.parse(await read(base+'/matrix.json'));
 const plan=JSON.parse(await read(base+'/closure-plan-r28.json'));
 const reviewText=await read('examples/dis-v020-native-sdk/fixtures/dke-r29-source-first-review.json');
 const proposalText=await read('examples/dis-v020-native-sdk/fixtures/dke-r29-gh-locator-proposal.json');
 return inspectClosure({matrix,plan,review:JSON.parse(reviewText),proposal:JSON.parse(proposalText),
  reviewBlob:sha1(reviewText),proposalBlob:sha1(proposalText),
  batchAudit:await auditCheckedInBatches()});
}
