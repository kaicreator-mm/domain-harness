/** DKE #2 / DIE #155 F-D (R213): owner-tier original-path evidence bridge.
 *
 * Binds the selected original research path of Function
 * dke.ev16.d02.vv.r188.observe to its content-addressed evidence identities
 * and verifies the committed fixtures byte-exactly before any attestation is
 * built. This module adds NO new semantic source and performs NO network
 * access; it reuses the same accepted evidence R198/R199/R202 already
 * verified (discipline: accepted receipts are reused, never re-derived).
 *
 * Honesty scope (R213 owner grant, DIE #155 comment 7016171014): the tier
 * produced here is OWNER_ATTESTED_ORIGINAL_RESEARCH_ADMISSION — an
 * owner-held attestation of research-grade facts. It is NOT and must never
 * render as ORIGINAL_PROFESSIONAL_QUALIFICATION, PUBLISHER_LICENSED rights,
 * a formal SAP/ECP qualification, or any DIS Full-21 promotion. Everything
 * the owner cannot attest is carried verbatim in NOT_ATTESTED.
 */
import {sourceGitBlob,sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';

export const R213_PIN=Object.freeze({
  // Same three committed fixtures the accepted R188/R209 chain pins.
  graph:'a49ddf58a0c4a5b25ebdd4018c8234f64e6365e0',
  forgeRepin:'63d671aa270df0eff649cd34a5f6258f4c9cbc21',
  reader:'234997708b5520d7f9ce5997eb7ad6ff963a5e68',
  // DKE-side content-addressed identities (owner-run mirror verification;
  // bound by identity here, byte-verified in evidence/owner-run-r213).
  tallyAiLedger:'f93190035f33516afd374b756897e0ce01fa29cb',
  dieR151:'96e9f42cf30e0ba41938f0450bcbbedc3abb9320',
  forgeR123:'bb25c02952b39637aeac6f25d4d030dfb6fae28b',
  r199DurableReceiptBlob:'801cec8b28524958429be1e47091271ec6c764fc',
  r199DurableReceiptCommit:'00f7612d6a468d8968f4e4b87f3c9ae421cecdaa'
});
export const R213_GRANT=Object.freeze({
  issue:'kaicreator-mm/domain-intelligence-engineering#155',
  commentId:7016171014,
  recordedAtIso:'2026-11-19T17:04:36Z',
  grantScopeSha256:
    'c814f4246f9b4163cb5ef34107666669c2ea9af4ae591f9ee2435a21cf5943f2'
});
export const R213_TIER=Object.freeze({
  name:'OWNER_ATTESTED_ORIGINAL_RESEARCH_ADMISSION',
  honesty:'BELOW_AND_DISTINCT_FROM_PROFESSIONAL_OR_PUBLISHER_OR_FORMAL_QUALIFICATION',
  forbiddenTokens:['PROFESSIONAL_QUALIFICATION','PUBLISHER_LICENSED',
    'ORIGINAL_SAP_QUALIFIED','FORMAL_ORIGINAL_E2E_VERIFIED']
});
export const R213_IDS=Object.freeze({
  registryId:'owner-original-admission-registry-r213',
  issuerId:'owner-issuer-r213',
  hostId:'owner-admission-host-r213',
  tenantId:'tenant:owner-original-admission-r213',
  scope:'scope:r213-owner-original-path-admission',
  deploymentId:'deployment:dis-v020-owner-original-admission-r213',
  functionId:'dke.ev16.d02.vv.r188.observe',
  bindingSubject:'se:SCB-CS2023-VV-R1'
});

const expect=(condition,code)=>{if(condition!==true)throw Error('R213_EVIDENCE_'+code)};

/**
 * Verify the committed original evidence fixtures byte-exactly and derive the
 * research-grade facts the owner tier may attest. Fail-closed on ANY drift:
 * blob pin mismatch, node-count drift, claim lifecycle change, leg/invariant
 * drift, or qualification-boolean inflation.
 */
export function verifyOwnerOriginalEvidence({graphText,forgeRepinText,readerCode}){
  for(const [key,raw] of Object.entries({graph:graphText,
    forgeRepin:forgeRepinText,reader:readerCode}))
    expect(typeof raw==='string'&&raw.length>0,'INPUT_MISSING_'+key.toUpperCase());
  expect(sourceGitBlob(graphText)===R213_PIN.graph,'GRAPH_BLOB_DRIFT');
  expect(sourceGitBlob(forgeRepinText)===R213_PIN.forgeRepin,'FORGE_REPIN_BLOB_DRIFT');
  expect(sourceGitBlob(readerCode)===R213_PIN.reader,'READER_BLOB_DRIFT');

  const graph=JSON.parse(graphText);
  const nodes=graph['@graph'];
  expect(Array.isArray(nodes)&&nodes.length===815,'GRAPH_NODE_COUNT_DRIFT');
  let claims=0,claimsPending=0,reviewDecisions=0;
  const selectedClaim=nodes.find(n=>n['@id']==='se:CLM-TVV-0001');
  for(const n of nodes){
    if(n['@type']==='se:KnowledgeClaim'){
      claims++;
      if(n['se:lifecycle_status']==='PENDING_REVIEW')claimsPending++;
    }else if(n['@type']==='se:ReviewDecision')reviewDecisions++;
  }
  expect(claims===106&&claimsPending===106,'CLAIM_LIFECYCLE_DRIFT');
  expect(reviewDecisions===0,'REVIEW_DECISION_PRESENT');
  expect(selectedClaim&&selectedClaim['se:lifecycle_status']==='PENDING_REVIEW',
    'SELECTED_CLAIM_NOT_PENDING');

  const repin=JSON.parse(forgeRepinText);
  expect(repin.schema==='dke.ev16.d02.vv-selected-cq.two-leg-source-repin/1',
    'REPIN_SCHEMA_DRIFT');
  expect(repin.state==='PREPARED_UNQUALIFIED','REPIN_STATE_DRIFT');
  expect(repin.evidenceTier==='PUBLIC_SOURCE_BACKED_CANDIDATE_NOT_PROFESSIONAL_ORACLE',
    'REPIN_TIER_DRIFT');
  expect(repin.producer.candidateGraphGitBlob===R213_PIN.graph,'REPIN_GRAPH_PIN_MISMATCH');
  expect(repin.producer.candidateNodes===815,'REPIN_NODE_COUNT_MISMATCH');
  expect(repin.repinScope.retainedBase.gitBlob===R213_PIN.forgeR123,
    'REPIN_RETAINED_BASE_PIN_MISMATCH');
  const binding=repin.selectedCqSourceBinding;
  expect(binding&&binding.claim.id==='se:CLM-TVV-0001'&&
    binding.claim.reviewStatus==='PENDING','SELECTED_CLAIM_BINDING_DRIFT');
  expect(binding.sectionLeg.locator.id==='se:LOC-CS2023-SE-VALIDATION-KU'&&
    binding.sectionLeg.locator.printedPage===246,'SECTION_LEG_DRIFT');
  expect(binding.outcomeLeg.locator.id==='se:LOC-CS2023-SE-VALIDATION-LO2'&&
    binding.outcomeLeg.locator.printedPage===248&&
    binding.outcomeLeg.evidence.lifecycle==='PENDING_REVIEW'&&
    binding.outcomeLeg.claimSupport.lifecycle==='PENDING_REVIEW','OUTCOME_LEG_DRIFT');
  expect(binding.twoLegInvariants.distinctLocators===true&&
    binding.twoLegInvariants.distinctPdfPages===true&&
    binding.twoLegInvariants.claimLifecycleEffect===
      'NONE_ORIGINAL_AND_CANDIDATE_CLAIM_REMAIN_PENDING','TWO_LEG_INVARIANT_DRIFT');
  const q=repin.qualification,a=repin.admission;
  expect(q.professionalOracle==='NOT_ATTESTED'&&q.qualifiedSap===false&&
    q.qualifiedR8===false&&q.effectAuthorized===false,'QUALIFICATION_BOOLEAN_DRIFT');
  expect(a.originalSapQualified===false&&a.rootQualified===false&&
    a.frozenR8Qualified===0&&a.effectAuthorized===false&&
    a.releaseAuthorized===false,'ADMISSION_BOOLEAN_DRIFT');

  return Object.freeze({
    verifiedAtKind:'COMMITTED_FIXTURE_BYTE_EXACT',
    graph:{gitBlob:R213_PIN.graph,sha256:sourceSha256(graphText),nodes:815,
      knowledgeClaims:106,claimsPendingReview:106,reviewDecisions:0},
    selectedClaim:{id:'se:CLM-TVV-0001',lifecycle:'PENDING_REVIEW',
      supportedBy:'se:EVD-TVV-0003'},
    twoLegBinding:{bindingId:'se:SCB-CS2023-VV-R1',
      sectionLeg:{locator:'se:LOC-CS2023-SE-VALIDATION-KU',printedPage:246,
        evidence:'se:EVD-TVV-0003'},
      outcomeLeg:{locator:'se:LOC-CS2023-SE-VALIDATION-LO2',printedPage:248,
        evidence:'se:EVD-TVV-0016',claimSupport:'se:REL-TVV-0024',
        lifecycle:'PENDING_REVIEW'},
      invariants:{distinctLocators:true,distinctPdfPages:true,
        claimLifecycleEffect:'NONE_ORIGINAL_AND_CANDIDATE_CLAIM_REMAIN_PENDING'}},
    forgeRepin:{gitBlob:R213_PIN.forgeRepin,sha256:sourceSha256(forgeRepinText),
      state:'PREPARED_UNQUALIFIED',
      evidenceTier:'PUBLIC_SOURCE_BACKED_CANDIDATE_NOT_PROFESSIONAL_ORACLE',
      retainedBaseGitBlob:R213_PIN.forgeR123},
    reader:{gitBlob:R213_PIN.reader,sha256:sourceSha256(readerCode)}
  });
}

/** Tier-confusion guard: no label may impersonate a professional, publisher
 * or formal qualification state. Exported so tests can exercise refusals. */
export function checkOwnerTierLabel(label){
  expect(typeof label==='string'&&label.length>0,'TIER_LABEL_INVALID');
  const upper=label.toUpperCase();
  for(const token of R213_TIER.forbiddenTokens)
    expect(!upper.includes(token),'TIER_LABEL_CONFUSION_REJECTED');
  return true;
}

/**
 * Build the versioned owner-tier attestation record. The tier label is
 * fixed and guarded; any label that could impersonate a professional,
 * publisher or formal qualification state is rejected.
 */
export function buildOwnerTierAttestation({evidence,extraEvidencePins=[],nowMs}){
  expect(evidence instanceof Object&&evidence.graph instanceof Object&&
    evidence.twoLegBinding instanceof Object,'ATTESTATION_INPUT_MISSING');
  for(const pin of extraEvidencePins){
    expect(pin&&typeof pin.gitBlob==='string'&&/^[0-9a-f]{40}$/.test(pin.gitBlob)&&
      typeof pin.description==='string','ATTESTATION_EXTRA_PIN_INVALID');
  }
  const tier=R213_TIER.name;
  checkOwnerTierLabel(tier);
  return Object.freeze({
    schema:'dis.v0.2.owner-original-admission.attestation/1',
    tier,
    tierHonesty:R213_TIER.honesty,
    generatedAtMs:Number.isSafeInteger(nowMs)?nowMs:null,
    grant:{issue:R213_GRANT.issue,commentId:R213_GRANT.commentId,
      grantScopeSha256:R213_GRANT.grantScopeSha256,
      scope:'OWNER_TIER_ORIGINAL_RESEARCH_PATH_ADMISSION_ONLY'},
    selectedFunction:R213_IDS.functionId,
    attestedByOwner:Object.freeze([
      'COMMITTED_EVIDENCE_FIXTURES_BYTE_EXACT_AT_PINNED_BLOBS',
      'SELECTED_CLAIM_TWO_LEG_BINDING_FACTS_AT_RESEARCH_GRADE',
      'ORIGINAL_CLAIM_LIFECYCLE_UNCHANGED_ALL_106_PENDING_REVIEW',
      'R198_NATIVE_63_OF_63_AND_R199_DURABLE_RECEIPT_REUSED_NOT_RERUN',
      'R209_OWNER_ATTESTED_SIGNED_HOST_SAME_CALL_REUSED_NOT_RERUN'
    ]),
    evidence:Object.freeze({
      committed:evidence,
      identityBoundOwnerRun:Object.freeze(extraEvidencePins)
    }),
    notAttested:Object.freeze([
      'THIRD_PARTY_PUBLISHER_RIGHTS_OVER_CS2023_DERIVED_CONTENT_NOT_ATTESTED',
      'INDEPENDENT_PROFESSIONAL_OR_BUSINESS_SEMANTIC_ORACLE_NOT_ATTESTED',
      'ORIGINAL_FORMAL_SAP_ECP_QUALIFICATION_NOT_ATTESTED_SAP_0_OF_6',
      'FORMAL_ORIGINAL_E2E_PROFESSIONAL_TIER_REMAINS_0_OF_1',
      'FROZEN_R8_0_OF_53_GLOBAL_0_OF_5_PARENT_ROOT_UNKNOWN_UNCHANGED',
      'DIS_FULL_21_REMAINS_13_OF_21_NO_PROMOTION',
      'NO_EFFECT_NO_L2_NO_RELEASE_NO_MAIN_MERGE'
    ]),
    formalOriginalE2e:'0_OF_1_UNCHANGED'
  });
}

/**
 * The installed-rule record for the r213 owner-tier deployment pin. Shared
 * by the owner provisioning run and the tests so both bind the exact same
 * record shape; callers serialize + hash the bytes (installedBytesDigest).
 */
export function installedRuleRecord({attestation,ruleDigest,aotDigest,sdkDigest}){
  expect(attestation&&attestation.schema===
    'dis.v0.2.owner-original-admission.attestation/1','INSTALLED_RULE_ATTESTATION_INVALID');
  for(const [field,value] of Object.entries({ruleDigest,aotDigest,sdkDigest}))
    expect(typeof value==='string'&&/^[0-9a-f]{64}$/.test(value),
      'INSTALLED_RULE_'+field.toUpperCase()+'_INVALID');
  return Object.freeze({
    schema:'dis.v0.2.full-host-admission.installed-rule/1',
    functionId:R213_IDS.functionId,sourceId:'r188-reader',
    sourceGitBlob:R213_PIN.reader,ruleDigest,aotDigest,sdkDigest,
    issuerId:R213_IDS.issuerId,deploymentId:R213_IDS.deploymentId,
    tenantId:R213_IDS.tenantId,scope:R213_IDS.scope,
    admissionTier:R213_TIER.name,ownerTierAttestation:attestation,
    custodyNote:
      'Immutable installed-rule record provisioned by the project+Host owner '+
      '(DIE #155 R213 owner grant, comment '+R213_GRANT.commentId+', '+
      'single-owner ecosystem). Private keys stay outside the repository; '+
      'only digests and public keys are committed. This record is an '+
      'OWNER-TIER original research path admission — NOT a professional, '+
      'publisher or formal SAP/ECP qualification.'
  });
}
