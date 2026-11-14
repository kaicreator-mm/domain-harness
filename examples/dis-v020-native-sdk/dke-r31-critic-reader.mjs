/** DKE R31 distinct source-first Critic → DIS read-only Knowledge, NOT SAP authority. */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';
export const R31_ORIGINS=Object.freeze({
 receipt: Object.freeze({"repository":"kaicreator-mm/domain-forge","commit":"4667becfdc9bfb382bbe830150fa7c9af4533ba2","path":"docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r31-d02-firstparty-source-cq/R31_R5_INDEPENDENT_REPAIR_RECEIPT.json","gitBlob":"cfda311e2606fcf40dbd914145f5f38d413939a9"}),
 review: Object.freeze({"repository":"kaicreator-mm/domain-forge","commit":"4667becfdc9bfb382bbe830150fa7c9af4533ba2","path":"docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r31-d02-firstparty-source-cq/INDEPENDENT_SOURCE_FIRST_R31_REVIEW.md","gitBlob":"10cc8aeade4b9019105490c08995aa7496e093f4"})
});
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const verdicts=Object.freeze({
 'se:CLM-REQ-FUNCTIONAL-DOC-METHODS':'SUPPORTED_WITH_SCOPE',
 'se:CLM-TVV-0001':'SUPPORTED_WITH_SCOPE',
 'se:REL-TVV-0020':'AUTHOR_DERIVED_PENDING_OWNER_REVIEW'
});
export function makeR31CriticReader(receiptText,reviewText){
 if(typeof receiptText!=='string'||typeof reviewText!=='string'||
  sourceGitBlob(receiptText)!==R31_ORIGINS.receipt.gitBlob||
  sourceGitBlob(reviewText)!==R31_ORIGINS.review.gitBlob)
  fail('DKE_R31_CRITIC_SOURCE_DRIFT');
 let p;try{p=JSON.parse(receiptText)}catch{fail('DKE_R31_CRITIC_RECEIPT_INVALID')}
 if(p?.schema!=='dke.r31.source-first-independent-review-and-repair/1'||
  p?.stage0?.frozen!==true||p.stage0.authorReportsReadBeforeFreeze!==false||
  p?.stage0?.firstPassURL!=='https://github.com/kaicreator-mm/domain-forge/issues/209#issuecomment-6775837182'||
  p?.stage1?.tests?.status!=='BOUNDED_SOURCE_CHAIN_PASS'||
  p.stage1.tests.totalPassed!==29||p.stage1.tests.total!==29||
  p.stage1.tests.nativeNode!=='NOT_RUN'||
  p?.findings?.p1Repaired!==1||p.findings.p1Open!==0||
  p?.disposition?.twoClaims!=='CRITIC_RECOMMENDS_ACCEPT_WITH_CURRICULUM_SCOPE'||
  p.disposition.relation!=='AUTHOR_DERIVED_TOPIC_ANALOGY_PENDING_INDEPENDENT_OWNER_REVIEW_NOT_PUBLISHER_RULE'||
  p.disposition.ownerReviewDecision!=='NOT_RUN'||p.disposition.sapQualified!==0||
  p.disposition.authorizedEffects!==0||p.disposition.r8Qualified!=='0/53'||
  p.disposition.releaseEligible!==false||
  p?.sources?.producer?.GitBlob!=='0f6007315fd7352fe6fd218effcfecf672cb4961')
  fail('DKE_R31_CRITIC_AUTHORITY_INVALID');
 return Object.freeze({query(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).length!==1||
     !Object.hasOwn(verdicts,input.subject))
    fail('DKE_R31_CRITIC_SELECTION_INVALID');
  return Object.freeze({
   status:'UNKNOWN',subject:input.subject,criticVerdict:verdicts[input.subject],
   reviewAuthority:'SOURCE_FIRST_CRITIC_ONLY',
   ownerReviewDecision:'NOT_RUN',
   relationSourceAuthority:input.subject==='se:REL-TVV-0020'?'AUTHOR_DERIVED':'CURRICULUM_SCOPE_ONLY',
   originalGraphGitBlob:p.sources.producer.GitBlob,
   criticReceiptGitBlob:R31_ORIGINS.receipt.gitBlob,
   criticReportGitBlob:R31_ORIGINS.review.gitBlob,
   sapQualified:false,effectDispatched:false
  });
 }});
}
