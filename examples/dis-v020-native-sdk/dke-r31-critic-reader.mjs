/** R31 independent source-first review RECEIPT → read-only DIS Knowledge Function.
 * A genuine reviewer recommendation, not authenticated human domain authority, Owner SAP,
 * row-level semantic approval or KDP Effect permission.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';
export const R31_REVIEW_ORIGIN=Object.freeze({
 repository:'kaicreator-mm/domain-forge',
 commit:'4667becfdc9bfb382bbe830150fa7c9af4533ba2',
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r31-d02-firstparty-source-cq/R31_R5_INDEPENDENT_REPAIR_RECEIPT.json',
 gitBlob:'cfda311e2606fcf40dbd914145f5f38d413939a9'
});
const CLAIMS=Object.freeze(['se:CLM-REQ-FUNCTIONAL-DOC-METHODS','se:CLM-TVV-0001']);
const RELATION='se:REL-TVV-0020';
const SUBJECTS=Object.freeze([...CLAIMS,RELATION]);
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function makeR31SourceCriticReader(raw,origin=R31_REVIEW_ORIGIN){
 if(typeof raw!=='string'||!object(origin)||
   Object.entries(R31_REVIEW_ORIGIN).some(([k,v])=>origin[k]!==v)||
   sourceGitBlob(raw)!==R31_REVIEW_ORIGIN.gitBlob)
  fail('DKE_R31_REVIEW_SOURCE_ANCHOR_DRIFT');
 let p;try{p=JSON.parse(raw)}catch{fail('DKE_R31_REVIEW_JSON_INVALID');}
 const s0=p?.stage0,s1=p?.stage1,d=p?.disposition,f=p?.findings;
 if(p?.schema!=='dke.r31.source-first-independent-review-and-repair/1'||
    p?.authority?.masterIssue!==209||p?.authority?.productDraftPR!==208||
    s0?.frozen!==true||s0?.githubCommentId!==6775837182||
    s0?.firstPassURL!=='https://github.com/kaicreator-mm/domain-forge/issues/209#issuecomment-6775837182'||
    s0?.githubCreatedAt!=='2026-11-10T18:32:30Z'||
    s0?.authorReportsReadBeforeFreeze!==false||
    s0?.stage0EntryBlob!=='8b6f61e3f4babab034a3d03f6fd8416f690d481d'||
    s0?.firstPassVerdicts?.[CLAIMS[0]]!=='SUPPORTED_WITH_SCOPE'||
    s0?.firstPassVerdicts?.[CLAIMS[1]]!=='SUPPORTED_WITH_SCOPE'||
    s0?.firstPassVerdicts?.[RELATION]!=='NEEDS_REPAIR_ANALYST_DERIVED_NOT_PUBLISHER_ASSERTED'||
    p?.sources?.producer?.GitBlob!=='0f6007315fd7352fe6fd218effcfecf672cb4961'||
    p?.sources?.producer?.nodes!==807||
    s1?.repairedCheckerBlob!=='f49d03f0875c2a02e04df6093e63847ed342bb2a'||
    s1?.repairedTestBlob!=='7ed3d6207342fb4ca73ddb0e6f72e2d5b39d7063'||
    s1?.tests?.total!==29||s1.tests.totalPassed!==29||
    s1.tests.originalPassed!==24||s1.tests.added!==5||
    s1.tests.status!=='BOUNDED_SOURCE_CHAIN_PASS'||
    f?.p0!==0||f.p1Found!==1||f.p1Repaired!==1||f.p1Open!==0||f.p2Open!==2||
    d?.criticReviewCompleted!==true||d?.ownerReviewDecision!=='NOT_RUN'||
    d?.sapQualified!==0||d?.authorizedEffects!==0||
    d?.d02Qualified!=='0/5'||d?.r8Qualified!=='0/53'||
    d?.twoClaims!=='CRITIC_RECOMMENDS_ACCEPT_WITH_CURRICULUM_SCOPE'||
    d?.relation!=='AUTHOR_DERIVED_TOPIC_ANALOGY_PENDING_INDEPENDENT_OWNER_REVIEW_NOT_PUBLISHER_RULE')
  fail('DKE_R31_REVIEW_SCOPE_INVALID');
 return Object.freeze({query(input){
  if(!object(input)||Object.keys(input).length!==1||!SUBJECTS.includes(input.subject))
   fail('DKE_R31_REVIEW_QUERY_NOT_SELECTED');
  const isClaim=CLAIMS.includes(input.subject);
  return Object.freeze({
   status:'UNKNOWN',
   subject:input.subject,
   criticRecommendation:isClaim?'SUPPORTED_WITH_CURRICULUM_SCOPE':'DERIVED_PENDING_OWNER_REVIEW',
   reviewerContext:'SOURCE_FIRST_CONTEXT_NOT_AUTHENTICATED_HUMAN',
   sourceState:'ORIGINAL_TALLY_PUBLISHER_GRAPH_PENDING_REVIEW',
   reviewerScoped:true,ownerReviewDecision:'NOT_RUN',
   sapQualified:false,effectDispatched:false,
   p2Open:2,receiptGitBlob:R31_REVIEW_ORIGIN.gitBlob
  });
 }});
}
