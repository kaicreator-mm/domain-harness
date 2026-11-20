/**
 * DKE V07 R31 (experiment only): consume original source-locked, BUILD-selected
 * read-only Business Function observations without manufacturing SAP/ECP authority.
 *
 * This is a consumer-owned policy check around actual DIS app.invoke, NOT a new
 * normative KDP authorization mechanism, a qualified SAP, or a trusted Oracle.
 */
import {qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';

const fail = code => {const e=new Error(code);e.code=code;throw e};
const requireRule = (v,code) => {if(!v)fail(code)};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ORIGIN='b6dc804d3ccc3aac7ce818533c2948f54b34644a';
const VIEW='3849e4c96aa4abc3a87cd845511b12726e601689';
const READERS=Object.freeze(['dke.r25.crossview.inspect','dke.r25.ed06.inspect']);
const EXPECTED=Object.freeze({
 'CQ-09F-CF':{caseId:'se:CASE-09F-CF-KV-DEPENDENCY',
   element:'tally.resilience.shared-dependency-case',sap:'R26-PROPOSAL-CF'},
 'CQ-09F-GH':{caseId:'se:CASE-09F-GH-DB-FAILOVER',
   element:'tally.consistency.cross-region-failover-case',sap:'R26-PROPOSAL-GH'}
});

export function evaluateR31NoAuthority({
 selectedAot, originalProjection, catalog, review, proposal, r30,
 cqId, functionId, observation
}) {
 requireRule(catalog?.schema==='dke.r26.registered-impact-catalog/1'&&
   catalog.normative===false&&
   catalog.sourcePair?.after?.blob===ORIGIN&&
   catalog.boundedView?.blob===VIEW&&
   catalog.registrations?.length===2,
   'DKE_R31_CATALOG_SOURCE_OR_SCOPE');
 requireRule(originalProjection?.schema==='dke.r25.tally-09f-source-snapshot/1'&&
   originalProjection.source?.gitBlob===ORIGIN&&
   originalProjection.source?.totalGraphNodes===807&&
   originalProjection.sourceQualification==='PENDING_INDEPENDENT_REVIEW'&&
   originalProjection.records?.length===14,
   'DKE_R31_ORIGINAL_SOURCE_DRIFT');
 const q=qualifyDisV020Artifact(selectedAot);
 const source=q.pins.get('dke-r25-tally-change');
 requireRule(source?.origin?.gitBlob===VIEW&&
   source.origin.commit==='c3c178786d0ebb23d749e6ef051036af374f8147'&&
   eq([...(q.sourceConsumers.get('dke-r25-tally-change')??[])].sort(),READERS),
   'DKE_R31_SELECTED_AOT_SOURCE_CLOSURE');
 requireRule(review?.schema==='dke.r27.source-first-sap-ownership-review/1'&&
   review.sourcePins?.blob===ORIGIN&&review.independentHumanOrSecondModel===false&&
   review.globalSAPQualification==='UNRESOLVED'&&review.pendingSourceRepair?.length===1&&
   review.pendingSourceRepair[0].status==='OPEN',
   'DKE_R31_INDEPENDENT_REVIEW_MISSING');
 requireRule(proposal?.schema==='dke.r28.source-locator-repair-candidate/1'&&
   proposal.originalSource?.blob===ORIGIN&&proposal.originalProjection?.blob===VIEW&&
   proposal.authority==='PATCH_PROPOSAL_ONLY'&&
   proposal.canonicalSourceAmended===false&&proposal.sourceQualified===false&&
   proposal.independentOracle===false&&proposal.nativeDeploymentAuthorized===false&&
   proposal.impact?.sapQualified===false,
   'DKE_R31_SOURCE_OWNER_NOT_ACCEPTED');
 requireRule(r30?.schema==='dke.r30.source-first-bounded-semantic-review/1'&&
   r30.inputs?.originalGraphBlob===ORIGIN&&
   r30.inputs?.r27LedgerBlob==='0b7d514cc297a07952b2cd536c2dafd3e47bda45'&&
   r30.inputs?.r28ProposalBlob==='9dc978f5138c561efabe503f254e565aa5f5700a'&&
   r30.inputs?.r26CatalogBlob==='e710997c3b4a1abbe33287f7b79596385c8382d3'&&
   r30.independentHumanOrSecondModel===false&&r30.reviewerAuthority==='NONE'&&
   r30.sourceOwnerDisposition==='NOT_EVIDENCED'&&r30.r28OwnerAccepted===false&&
   r30.knowledgeQualification==='BLOCKED_NOT_QUALIFIED'&&r30.publisherBytesPinned===false&&
   r30.nativeR30==='NOT_RUN',
   'DKE_R31_R30_UNQUALIFIED_SOURCE');
 const expected=EXPECTED[cqId],registration=catalog.registrations.find(x=>x.cqId===cqId);
 const record=originalProjection.records.find(x=>x['@id']===expected?.caseId);
 const r27=review.cases.find(x=>x.cq===cqId),r30case=r30.cases.find(x=>x.cq===cqId);
 requireRule(expected&&registration?.caseId===expected.caseId&&
   registration.sapCandidate?.id===expected.sap&&
   registration.sapCandidate.qualified===false&&
   registration.sapCandidate.oracle==='NOT_VERIFIED'&&
   registration.sapCandidate.sourceAuthority==='NONE'&&
   registration.sapCandidate.status==='PROPOSAL_ONLY'&&
   r27?.owner===expected.element&&r27.proposedSap===expected.sap&&
   r27.sapQualified===false&&r27.oracle==='NOT_VERIFIED'&&
   r30case?.id===expected.caseId&&r30case.owner===expected.element&&
   r30case.sap===expected.sap&&r30case.sapQualified===false&&
   r30case.claimedSemanticOracle===false&&
   record?.['se:lifecycle_status']==='PENDING_REVIEW'&&
   record['se:synthetic']===false&&
   originalProjection.selectedCqs?.[cqId]===expected.caseId,
   'DKE_R31_SAP_NOT_AUTHORIZED');
 const readers=registration.readers.map(x=>x.functionId).sort();
 const selected=q.functions.get(functionId),owner=selected?.element.packageId;
 requireRule(eq(readers,READERS)&&readers.includes(functionId)&&
   registration.readers.some(x=>x.functionId===functionId&&x.packageId===owner)&&
   selected.definition.kind==='knowledge'&&selected.definition.effect==='none'&&
   selected.definition.binding.type==='local'&&
   eq(selected.definition.sourceDependencies,['dke-r25-tally-change'])&&
   q.selected.get(owner)?.role==='business',
   'DKE_R31_UNSELECTED_OR_EFFECTFUL_CONSUMER');
 requireRule(observation?.kind==='OBSERVATION'&&
   observation.authority==='NONE'&&observation.disposition==='OBSERVED'&&
   observation.evidence?.attested===false&&
   observation.value?.sourceStatus==='PENDING_REVIEW'&&
   observation.value?.cqId===cqId&&
   Array.isArray(observation.value.evidenceRefs)&&
   observation.value.evidenceRefs.length>0,
   'DKE_R31_OBSERVATION_CANNOT_GRANT_AUTHORITY');

 // The live reader can OBSERVE unqualified source facts, but NO observed
 // result authorizes an Effect or a positive ECP / SAP outcome.
 return Object.freeze({
   schema:'dke.r31.native-selected-source-sap-decision/1',
   cqId,sourceCase:expected.caseId,element:expected.element,
   selectedBusinessPackage:owner,selectedFunction:functionId,
   proposedSAP:expected.sap,
   observedDisposition:observation.disposition,
   semanticDecision:'UNKNOWN_NOT_QUALIFIED',sourceAuthority:'NONE',
   sapQualified:false,ecpAuthorized:false,effectsAllowed:false,
   originalGraphAccepted:false,proposedOverlayInstalled:false,
   independentOracle:'NOT_VERIFIED',externalConsumerClosure:'UNKNOWN'
 });
}
