/**
 * R29 C1: DKE source-first Element ownership compared against actually
 * selected DIS Knowledge Functions and original Tally 807-node projection.
 *
 * DKE reviewer ledger and the GH locator proposal are research-owned,
 * explicitly unqualified. This checker cannot mint SAP / source authority.
 */
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const yes=(v,code)=>{if(!v)fail(code)};
const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
const sorted=xs=>[...xs].sort();
const SOURCE_ID='dke-r25-tally-change';
const READERS=['dke.r25.crossview.inspect','dke.r25.ed06.inspect'];
const EXPECTED=[
 ['CQ-09F-CF','se:CASE-09F-CF-KV-DEPENDENCY','tally.resilience.shared-dependency-case','R26-PROPOSAL-CF'],
 ['CQ-09F-GH','se:CASE-09F-GH-DB-FAILOVER','tally.consistency.cross-region-failover-case','R26-PROPOSAL-GH']
];

export function evaluateR29C1({review,proposal,originalProjection,selectedAot}){
 yes(review?.schema==='dke.r27.source-first-sap-ownership-review/1'&&
   review.normative===false&&
   review.reviewerRole==='ONE_MODEL_SEPARATE_SOURCE_FIRST_REVIEW_AND_SCRIPT_CHECK'&&
   review.independentHumanOrSecondModel===false&&
   review.globalSAPQualification==='UNRESOLVED'&&
   review.crossCaseCausality==='NOT_ATTESTED'&&
   review.externalSourceReads?.htmlContentHash===null,
   'DKE_R29_REVIEW_AUTHORITY_FORGED');
 const p=review.sourcePins;
 yes(p?.repository==='kaicreator-mm/tally'&&
   p.commit==='a8f4986b099aba27cd86ce6a78e1c19159d1de55'&&
   p.blob==='b6dc804d3ccc3aac7ce818533c2948f54b34644a'&&
   p.fullNodeCount===807&&p.projectionBlob==='3849e4c96aa4abc3a87cd845511b12726e601689'&&
   p.projectionCount===14&&
   originalProjection?.source?.gitBlob===p.blob&&
   originalProjection.source.totalGraphNodes===807&&
   originalProjection.sourceQualification==='PENDING_INDEPENDENT_REVIEW'&&
   originalProjection.records?.length===14,
   'DKE_R29_ORIGINAL_SOURCE_DRIFT');
 const q=qualifyDisV020Artifact(selectedAot);
 yes(q.pins.get(SOURCE_ID)?.origin.gitBlob===p.projectionBlob&&
   same(sorted(q.sourceConsumers.get(SOURCE_ID)??[]),READERS),
   'DKE_R29_SELECTED_CONSUMERS_INCOMPLETE');
 for(const id of READERS){
  const f=q.functions.get(id),owner=f?.element?.packageId;
  yes(f?.definition.kind==='knowledge'&&f.definition.effect==='none'&&
   f.definition.binding.type==='local'&&f.definition.sourceDependencies?.includes(SOURCE_ID)&&
   q.selected.get(owner)?.role==='business'&&f.definition.contract,
   'DKE_R29_SELECTED_CONSUMERS_INCOMPLETE');
 }
 const gap=review.pendingSourceRepair?.find(x=>x.id==='R27-P1-GH-LOCATOR-TIMESPAN');
 yes(review.pendingSourceRepair?.length===1&&gap?.status==='OPEN'&&
   gap.sourceLocator==='se:LOC-09F-GH-REPLICATION'&&
   gap.currentCoverageEnd==='2018-10-22 16:24 UTC'&&
   gap.sourceNarrativeContinuesThrough==='2018-10-22 23:03 UTC',
   'DKE_R29_GH_LOCATOR_GAP_DENIED');
 yes(Array.isArray(review.cases)&&review.cases.length===2&&
   Array.isArray(review.evidence)&&review.evidence.length===5,
   'DKE_R29_REVIEW_INCOMPLETE');
 const records=new Map(originalProjection.records.map(x=>[x['@id'],x]));
 yes(records.size===14,'DKE_R29_SOURCE_RECORDS_INVALID');
 const elements=[];
 for(const [cq,caseId,elementId,sap] of EXPECTED){
  const c=review.cases.find(x=>x.cq===cq);
  yes(c&&c.id===caseId&&c.owner===elementId&&c.proposedSap===sap&&
   c.sapQualified===false&&c.oracle==='NOT_VERIFIED'&&
   c.acceptance==='PENDING_REVIEW'&&
   c.readiness===(
     cq==='CQ-09F-GH'
       ?'REQUIRES_GH_LOCATOR_REPAIR_AND_INDEPENDENT_REVIEW'
       :'REQUIRES_INDEPENDENT_DOMAIN_REVIEW'),
   'DKE_R29_SAP_OWNER_UNQUALIFIED');
  const n=records.get(caseId);
  yes(n?.['@type']==='se:Case'&&n['se:lifecycle_status']==='PENDING_REVIEW'&&
   n['se:synthetic']===false&&
   same(originalProjection.selectedCqs[cq],caseId)&&
   Array.isArray(n['se:evidence_refs'])&&n['se:evidence_refs'].length>0,
   'DKE_R29_CASE_SOURCE_INVALID');
  const refs=n['se:evidence_refs'].map(x=>x['@id']);
  for(const evId of refs){
   const evidence=records.get(evId);
   const loc=records.get(evidence?.['se:source_locator_ref']?.['@id']);
   const source=records.get(loc?.['se:source_ref']?.['@id']);
   yes(evidence?.['@type']==='se:Evidence'&&evidence['se:lifecycle_status']==='PENDING_REVIEW'&&
    loc?.['@type']==='se:SourceLocator'&&source?.['@type']==='se:Source',
    'DKE_R29_EVIDENCE_CLOSURE_MISSING');
  }
  elements.push({cq,sourceCase:caseId,proposedElement:elementId,
   sourceRefs:refs,proposedSap:sap,semanticQualification:'NOT_VERIFIED'});
 }
 const split=review.strategies?.find(x=>x.id==='SEPARATE_CASE_ELEMENTS');
 const generic=review.strategies?.find(x=>x.id==='SINGLE_GENERIC_INCIDENT_ELEMENT');
 yes(review.strategies?.length===2&&split?.elements?.length===2&&
   same(sorted(split.elements),sorted(elements.map(x=>x.proposedElement)))&&
   split.ownerAmbiguity==='LOW'&&split.independentQualified===false&&
   split.verdict==='PREFERRED_BOUNDED_PROPOSAL'&&
   generic?.elements?.length===1&&
   generic.elements[0]==='tally.generic.incident-case'&&
   generic.ownerAmbiguity==='HIGH'&&generic.independentQualified===false&&
   generic.verdict==='FALLBACK_NEEDS_OWNER_JUSTIFICATION',
   'DKE_R29_DECOMPOSITION_STRATEGY_INVALID');
 // A later DKE-only proposed overlay is not an installed Tally source.
 yes(proposal?.schema==='dke.r28.source-locator-repair-candidate/1'&&
  proposal.originalSource?.blob===p.blob&&proposal.originalSource.nodes===807&&
  proposal.originalProjection?.blob===p.projectionBlob&&
  proposal.r27Review?.blob==='0b7d514cc297a07952b2cd536c2dafd3e47bda45'&&
  proposal.canonicalSourceAmended===false&&proposal.sourceQualified===false&&
  proposal.independentOracle===false&&proposal.nativeDeploymentAuthorized===false&&
  proposal.publisher?.htmlSha256===null&&proposal.publisher.allWebhooksDelivered===false&&
  proposal.authority==='PATCH_PROPOSAL_ONLY'&&
  proposal.added?.length===2&&proposal.added.every(x=>x['se:synthetic']===true&&
   x['se:lifecycle_status']==='PENDING_REVIEW')&&
  proposal.caseEvidencePatch?.caseId===EXPECTED[1][1]&&
  proposal.caseEvidencePatch.append==='dke-r28:EVD-GH-BACKLOG'&&
  same(proposal.caseEvidencePatch.exactOriginalRefs,
   records.get(EXPECTED[1][1])['se:evidence_refs'].map(x=>x['@id']))&&
  same(proposal.impact?.affectedCQs,['CQ-09F-GH'])&&
  same(sorted(proposal.impact?.unaffectedCQs??[]),sorted(['CQ-09F-CF','CQ-T-CROSSCUT']))&&
  proposal.impact.sapQualified===false,
  'DKE_R29_UNAPPROVED_SOURCE_PATCH');
 return Object.freeze({
  schema:'dis.r29.c1.source-first-element-qualification/1',
  comparedStrategies:['SEPARATE_CASE_ELEMENTS','SINGLE_GENERIC_INCIDENT_ELEMENT'],
  preferredDecomposition:'SEPARATE_CASE_ELEMENTS',
  proposedElements:elements,
  selectedBusinessFunctions:Object.freeze(READERS),
  selectedBusinessPackages:Object.freeze(sorted(READERS.map(id=>q.functions.get(id).element.packageId))),
  stableCQ:'CQ-T-CROSSCUT',
  candidatePatchImpact:'CQ-09F-GH',
  canonicalTallyGraphChanged:false,
  nativeAotWithCandidateOverlayBuilt:false,
  GHSourceGap:'OPEN',
  independentQualified:false,
  sourceAuthority:'NONE',
  SAPAuthority:'NONE',
  effectAuthority:'NONE',
  wholeAppConsumerCompleteness:'UNKNOWN'
 });
}
