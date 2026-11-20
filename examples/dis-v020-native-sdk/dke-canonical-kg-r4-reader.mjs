/**
 * DKE #208 canonical-kg-r0 R4 bounded KG/DEDS candidate -> DIS #1497 R7
 * read-only Knowledge. Real original Forge Blueprint R1 per-Element SAP
 * candidate and R2 source-scoped impact edge policy are selected DATA:
 * every SAP stays CANDIDATE_NOT_QUALIFIED, Root stays UNKNOWN, the static
 * executable Function DAG stays empty and no Effect authority is minted.
 * Fail-closed: byte drift, wrong evidence scope or injected authority.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';

export const CANONICAL_KG_R4_ORIGINS=Object.freeze({
 blueprint:Object.freeze({
  repository:'kaicreator-mm/domain-forge',
  commit:'a5ebbc4a6779cbf8b3c076b1296ae658ec25d67a',
  path:'docs/standards/dke/DKE-0.0.1/demos/ev14-domain-blueprint-r0/BLUEPRINT_CANDIDATE_R1_SAP.json',
  gitBlob:'52722c7317285552bda8892bf0c4dd76904cbcb9'
 }),
 policy:Object.freeze({
  repository:'kaicreator-mm/domain-forge',
  commit:'a5ebbc4a6779cbf8b3c076b1296ae658ec25d67a',
  path:'docs/standards/dke/DKE-0.0.1/demos/ev14-domain-blueprint-r0/IMPACT_EDGE_SCOPE_POLICY_R2.json',
  gitBlob:'ad0cf8a40f1f13303ba7ffb1ce268fc489dee5cf'
 })
});
const KINDS=Object.freeze({
 'EV14-ROOT':'ROOT','EV14-GO':'CHILD','EV14-HTTP':'CHILD',
 'EV14-PROVENANCE':'GLOBAL_SEMANTIC','EV14-NONENTAILMENT':'GLOBAL_SEMANTIC',
 'EV14-QUALIFICATION':'GLOBAL_SEMANTIC'
});
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const parse=text=>{try{return JSON.parse(text)}catch{return null}};
export function makeCanonicalKgR4Reader(blueprintText,policyText){
 if(typeof blueprintText!=='string'||typeof policyText!=='string'||
    sourceGitBlob(blueprintText)!==CANONICAL_KG_R4_ORIGINS.blueprint.gitBlob||
    sourceGitBlob(policyText)!==CANONICAL_KG_R4_ORIGINS.policy.gitBlob)
  fail('DKE_EV14_KG_R4_ORIGINAL_DATA_DRIFT');
 const bp=parse(blueprintText),pol=parse(policyText);
 if(bp?.schema!=='dke.ev14.domain-blueprint-deds-semantic-assurance/2'||
    bp.revision!=='EV14_BLUEPRINT_R1_ELEMENT_SAP_CANDIDATE'||
    bp.root!=='EV14-ROOT'||
    !Array.isArray(bp.elements)||bp.elements.length!==6||
    bp.elements.some(e=>KINDS[e?.id]!==e?.kind)||
    new Set(bp.elements.map(e=>e.id)).size!==6||
    !Array.isArray(bp.hierarchy?.edges)||bp.hierarchy.edges.length!==5||
    bp.hierarchy.edges.some(x=>x?.parent!=='EV14-ROOT'||!Object.hasOwn(KINDS,x?.child)))
  fail('DKE_EV14_KG_R4_BLUEPRINT_SCOPE_INVALID');
 for(const e of bp.elements){
  const q=e.semanticAssuranceProfile?.qualification;
  if(e.semanticAssuranceProfile?.schema!=='dke.semantic-assurance-profile/0.1'||
     q?.state!=='CANDIDATE_NOT_QUALIFIED'||q?.qualified!==false||
     q?.simulatorPromotion!==false||q?.disEffectsAuthorized!==false)
   fail('DKE_EV14_KG_R4_SAP_CANDIDATE_ONLY');
 }
 if(!Array.isArray(bp.staticExecutableFunctionDag?.edges)||
    bp.staticExecutableFunctionDag.edges.length!==0||
    !Array.isArray(bp.verificationPlanDag?.edges)||
    bp.verificationPlanDag.edges.length!==6||
    !Array.isArray(bp.globalInvariants)||bp.globalInvariants.length!==5)
  fail('DKE_EV14_KG_R4_GRAPH_SHAPE_INVALID');
 const a=bp.admission;
 if(a?.productL1!=='CANDIDATE_NOT_L2_FROZEN'||a?.independentBlueprintReview!=='NOT_RUN'||
    a?.originalPublisherOwner!=='NOT_ATTESTED'||a?.qualifiedGoBiocurator!=='NOT_ATTESTED'||
    a?.formalR8Ev14!=='NOT_RUN'||a?.fullyQualifiedR8!=='0/53'||
    a?.SAP!==0||a?.Effects!==0||a?.root!=='UNKNOWN'||
    a?.freeze!==false||a?.merge!==false||a?.release!==false||
    a?.perElementSemanticAssurance!=='CANDIDATE_DEFINED_NOT_QUALIFIED'||
    a?.qualifiedElementSAPs!==0)
  fail('DKE_EV14_KG_R4_ADMISSION_SCOPE_INVALID');
 if(pol?.schema!=='dke.ev14.blueprint-sourced-impact-edge-scope/2'||
    pol.status!=='BOUNDED_EXPLICIT_EDGE_SOURCE_CONTEXT_CANDIDATE_NOT_PRODUCT_L2'||
    pol.gate?.reviewStatus!=='NOT_INDEPENDENTLY_REVIEWED'||
    pol.gate?.sourceOwner!=='NOT_ATTESTED'||
    !Array.isArray(pol.edgeScopes)||pol.edgeScopes.length!==6||
    pol.edgeScopes.some(x=>!Array.isArray(x?.scopes)||x.scopes.length<1||
      x.scopes.some(s=>!['GO_EVIDENCE','HTTP_EVIDENCE'].includes(s))))
  fail('DKE_EV14_KG_R4_EDGE_SCOPE_INVALID');
 const byId=Object.fromEntries(bp.elements.map(e=>[e.id,e]));
 return Object.freeze({query(input){
  // Snapshot the ONE declared own data property exactly once. A getter,
  // Proxy trap, inherited key, symbol or injected authority field cannot
  // select a different scope after validation or mint qualification.
  let subject;
  try{
   if(!input||typeof input!=='object'||Array.isArray(input)||
      Object.getPrototypeOf(input)!==Object.prototype)
    fail('DKE_EV14_KG_R4_SUBJECT_INVALID');
   const keys=Reflect.ownKeys(input);
   if(keys.length!==1||keys[0]!=='subject')
    fail('DKE_EV14_KG_R4_SUBJECT_INVALID');
   const own=Object.getOwnPropertyDescriptor(input,'subject');
   if(!own||!Object.hasOwn(own,'value')||
      typeof own.value!=='string'||!Object.hasOwn(KINDS,own.value))
    fail('DKE_EV14_KG_R4_SUBJECT_INVALID');
   subject=own.value;
  }catch{fail('DKE_EV14_KG_R4_SUBJECT_INVALID')}
  const e=byId[subject];
  return Object.freeze({
   status:'UNKNOWN',subject,elementKind:e.kind,
   sapProfileId:e.semanticAssuranceProfile.profileId,
   sapState:e.semanticAssuranceProfile.qualification.state,
   sapQualified:false,simulatorPromotion:false,disEffectsAuthorized:false,
   root:'UNKNOWN',qualifiedElementSAPs:0,fullyQualifiedR8:'0/53',
   qualifiedEffects:0,blueprintRevision:bp.revision,
   planDagEdges:bp.verificationPlanDag.edges.length,
   staticExecutableDagEdges:bp.staticExecutableFunctionDag.edges.length,
   blueprintGitBlob:CANONICAL_KG_R4_ORIGINS.blueprint.gitBlob,
   policyGitBlob:CANONICAL_KG_R4_ORIGINS.policy.gitBlob
  });
 }});
}
