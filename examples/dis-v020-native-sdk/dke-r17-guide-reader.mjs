/** B15/R61 genuine DKE R17 cross-version dependent method invalidation.
 * The original Guide 203/79 HTML/PDF bytes were NOT pinned upstream;
 * this reader validates precommitted DKE DATA and replays 20 bounded cases
 * in an actual DIS native SDK/KDP Knowledge Function. No physical repair.
 */
import {sourceGitBlob} from '@kaicreator/domain-harness-contracts/dis-v020';
export const R17_HEAD='e74521dff040c78a83014b69f0b36e190bce80e3';
export const R17_ORIGINS=Object.freeze({
 observation:Object.freeze({repository:'kaicreator-mm/domain-forge',commit:R17_HEAD,
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r17-cross-guide-compat/PUBLISHER_OBSERVATIONS.json',
 gitBlob:'608c336f472b3f6eb979ae4ef13dcf3d133c86c5'}),
 cases:Object.freeze({repository:'kaicreator-mm/domain-forge',commit:R17_HEAD,
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r17-cross-guide-compat/CASES.json',
 gitBlob:'1816b799c064d4793e055892c42b1c0fd0d77855'}),
 receipt:Object.freeze({repository:'kaicreator-mm/domain-forge',commit:R17_HEAD,
 path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r17-cross-guide-compat/RUN_RECEIPT_V8.json',
 gitBlob:'659eb8d9ab209bbcbf9d966ae3ee3fc16e6b7d18'})
});
const fail=code=>{const e=new Error(code);e.code=code;throw e};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const conflicts=Object.freeze([
 {source:'203:step1',linkedStep:16,needed:'REMOVE_MAINBOARD',found:'REMOVE_SSD',webLine:438},
 {source:'203:conclusion',linkedStep:17,needed:'REASSEMBLE_MAINBOARD',found:'DISCONNECT_SPEAKER',webLine:462}
]);
const affected=['R16_METHOD_STEP4','D05_METHOD_CANDIDATE'];
const unaffected=['R15_RTC_CONDITIONAL_SOURCE_FACT'];
/** Bounded, read-only reproduction of DKE original R17 pure gate. */
export function gateR17(m,o){
 const deny=status=>({status});
 if(!m||!o||!o.sourceGuide203||!o.targetGuide79)return deny('REJECTED_MISSING_EVIDENCE');
 if(m.model!=='FRAMEWORK_11_GEN_INTEL')return deny('REJECTED_MODEL_SCOPE');
 if(m.purpose!=='READ_ONLY_CANDIDATE')return deny('REJECTED_NO_PHYSICAL_AUTHORIZATION');
 if(m.assertOwner||m.assertSAP||m.assertEffects)return deny('REJECTED_FALSE_AUTHORITY');
 if(m.claimPhysicalRepair)return deny('REJECTED_FALSE_OUTCOME');
 if(m.autoRemap)return deny('REJECTED_AUTO_RENUMBER');
 if(m.claimRawPinned)return deny('REJECTED_FALSE_SOURCE_PIN');
 if(m.sourceGuide!=='203'||m.targetGuide!=='79')return deny('REJECTED_SOURCE_ID');
 if(m.sourceGuideRevision!=='2023-11-12'||m.targetRevision!=='2026-07-02')
  return deny('REJECTED_UNRECOGNIZED_RELEASE');
 if(!Array.isArray(m.dependencies)||m.dependencies.length!==2)return deny('REJECTED_DEPENDENCY_SHAPE');
 if(new Set(m.dependencies.map(x=>x?.source)).size!==2)return deny('REJECTED_DEPENDENCY_SHAPE');
 const expected=o.sourceGuide203.expectedRoles;
 const allowed=[
  {source:'203:step1',toStep:expected.removeThrough.step,role:expected.removeThrough.requiresRole},
  {source:'203:conclusion',toStep:expected.reassembleFrom.step,role:expected.reassembleFrom.requiresRole}
 ];
 for(let i=0;i<allowed.length;i++)
  if(JSON.stringify(m.dependencies[i])!==JSON.stringify(allowed[i]))
   return deny('REJECTED_SOURCE_REFERENCE_MUTATION');
 const observations=o.targetGuide79.webStepObservations;
 if(!Array.isArray(observations))return deny('REJECTED_MISSING_TARGET_OBSERVATION');
 const mismatches=[];
 for(const d of m.dependencies){
  const observed=observations.find(x=>x.step===d.toStep);
  if(!observed)return deny('REJECTED_UNKNOWN_TARGET_STEP');
  if(observed.role!==d.role)
   mismatches.push({source:d.source,linkedStep:d.toStep,needed:d.role,
    found:observed.role,webLine:observed.webLine});
 }
 if(mismatches.length)return {status:'INVALIDATED_STALE_STEP_REF',mismatches,
  affected:[...affected],unaffected:[...unaffected]};
 if(!o.guide203FullOriginalBytesSHA256||!o.guide79FullOriginalBytesSHA256)
  return deny('BLOCKED_UNPINNED_GUIDE_BYTES');
 return deny('REVIEW_REQUIRED_INDEPENDENT_CRITIC');
}
export function verifyR17SourceScope(obs,cases,receipt){
 if(!object(obs)||!object(cases)||!object(receipt)||
    obs.schema!=='dke.r17.cross-guide-observation/v1'||
    obs.status!=='WEB_PUBLISHED_HTML_OBSERVATIONS_NO_RAW_HTTP_BYTE_DIGEST'||
    obs.originalParent?.readmeBlob!=='dbdfc6ba1556689864d733401f7c8f824d965cdf'||
    obs.guide203FullOriginalBytesSHA256!==null||
    obs.guide79FullOriginalBytesSHA256!==null||
    obs.liveSourceCannotBeCalledGitPinned!==true||
    obs.pdfBytePinStatus!=='NOT_RUN'||
    obs.sourceGuide203?.publicationDate!=='2023-11-12'||
    obs.targetGuide79?.revisionDate!=='2026-07-02'||
    cases.schema!=='dke.r17.adversarial-cases/v1'||
    receipt.schema!=='dke.r17.hosted-V8-bounded-receipt/v1'||
    receipt.status!=='PASS_BOUNDED_V8_NOT_NATIVE_NODE_NOT_SAP'||
    receipt.evidenceBlob!==R17_ORIGINS.observation.gitBlob||
    receipt.casesBlob!==R17_ORIGINS.cases.gitBlob||
    receipt.runnerBlob!=='c334b15c0a20b32000bc8d87674df7d32e567318'||
    receipt.originalREADMEBlob!==obs.originalParent.readmeBlob||
    receipt.fullHtmlOrPdfPinned!==false||
    receipt.nativeNodeCli!=='NOT_RUN'||receipt.sap!==0||receipt.effects!==0||
    receipt.independentSemanticCritic!=='NOT_RUN'||
    receipt.physicalRepair!=='NOT_RUN'||receipt.closedD05Cases!==0||
    receipt.closedFullR8EV!==0||receipt.closedAutonomousEV!==0||
    receipt.tests!==20||receipt.expectedCasesPassed!==20||receipt.testFailures!==0)
  fail('DIS_R17_UNTRUSTED_SOURCE_OR_AUTHORITY');
 if(!eq(receipt.realSourceMismatches,conflicts)||
    !eq(receipt.affected,affected)||!eq(receipt.unaffected,unaffected)||
    receipt.syntheticMatchedRolesButUnpinned!=='BLOCKED_UNPINNED_GUIDE_BYTES'||
    !Array.isArray(cases.caseRoster)||cases.caseRoster.length!==20||
    !Array.isArray(receipt.caseResults)||receipt.caseResults.length!==20||
    !eq(cases.baseline.dependencies,[
     {source:'203:step1',toStep:16,role:'REMOVE_MAINBOARD'},
     {source:'203:conclusion',toStep:17,role:'REASSEMBLE_MAINBOARD'}
    ]))
  fail('DIS_R17_SOURCE_CASE_INCONSISTENT');
 const table=new Map();
 for(let i=0;i<20;i++){
  const c=cases.caseRoster[i],previous=receipt.caseResults[i];
  if(!object(c)||typeof c.id!=='string'||table.has(c.id)||
     !object(c.overrides)||!object(previous)||previous.case!==c.id||
     previous.expected!==c.expected)
   fail('DIS_R17_CASE_SHAPE_INVALID');
  const input={...structuredClone(cases.baseline),...structuredClone(c.overrides)};
  const got=gateR17(input,obs);
  if(got.status!==c.expected||!eq(got,previous.actual))
   fail('DIS_R17_CASE_REPLAY_MISMATCH');
  table.set(c.id,got);
 }
 const baseline=table.get('real_cross_guide_two_conflicts');
 if(!baseline||baseline.status!=='INVALIDATED_STALE_STEP_REF'||
    !eq(baseline.mismatches,conflicts))
  fail('DIS_R17_REAL_CONFLICT_MISSING');
 return Object.freeze({casesReplayed:20,observedConflicts:2,
  htmlPdfFullyPinned:false,independentSemanticOracle:false,
  methodQualified:false,sapQualified:false,table});
}
export function makeR17KnowledgeReader(observationText,casesText,receiptText){
 const raw=[observationText,casesText,receiptText],ids=[
  R17_ORIGINS.observation.gitBlob,R17_ORIGINS.cases.gitBlob,R17_ORIGINS.receipt.gitBlob
 ];
 if(raw.some((x,i)=>typeof x!=='string'||sourceGitBlob(x)!==ids[i]))
  fail('DIS_R17_SOURCE_BLOB_DRIFT');
 let obs,cases,receipt;
 try{obs=JSON.parse(observationText);cases=JSON.parse(casesText);receipt=JSON.parse(receiptText)}
 catch{fail('DIS_R17_JSON_INVALID')}
 const validated=verifyR17SourceScope(obs,cases,receipt);
 return Object.freeze({
  summary:Object.freeze({casesReplayed:20,observedConflicts:2,
   htmlPdfFullyPinned:false,independentSemanticOracle:false,methodQualified:false,sapQualified:false}),
  query(request){
   if(!object(request)||Object.keys(request).length!==1||
      typeof request.caseId!=='string'||!validated.table.has(request.caseId))
    fail('DIS_R17_UNSELECTED_CASE');
   const c=validated.table.get(request.caseId);
   return Object.freeze({
    status:'UNKNOWN',caseId:request.caseId,compatibility:c.status,
    mismatchesCount:c.mismatches?.length??0,
    affectedIds:c.affected??[],unaffectedIds:c.unaffected??[],
    sourceAnchor:'ORIGINAL_UPSTREAM_PUBLISHER_WEB_LINES_UNPINNED_FULL_BYTES',
    guide203RawPinned:false,guide79RawPinned:false,
    independentSemanticOracle:false,methodQualified:false,
    sapQualified:false,effectDispatched:false
   });
  }
 });
}
