// Issue #358 / A41-004: deterministic consumer/verifier functions for DAC
// v0.0.4.1 F-04 composition-intake semantics (LIFECYCLE_REFERENCE_REPAIRS
// §4; APPLICATION_MANIFEST §§1–4 successor precedence; DOMAIN_DATA_IR §2).
//
// CONSUMER ONLY — never an issuer. Every function is pure and total over
// externally recovered facts: malformed or hostile inputs are returned as
// typed FAIL_CLOSED results (never thrown, never guessed, never repaired).
// No function here establishes an application identity, issues a selection,
// refuses, promotes, drafts or publishes a Manifest, or reads/writes any
// live Runtime state — Manifest successor evidence is verified as immutable
// external evidence and never collapsed into runtime state truth.
//
// Frozen deterministic pass order (first failure wins; structural and
// authority violations dominate temporal states per C152/C171):
//   1. input/shape validation        (INVALID_FACTS; exactly one initiation
//                                      seam — request OR requestless record)
//   2. minted-carrier check          (FOREIGN_EVIDENCE)
//   3. evidence-role check           (ROLE_MISMATCH)
//   4. predecessor-wrap check        (PREDECESSOR_WRAPPED, C145)
//   5. F-04 identity anti-alias      (IDENTITY_ALIAS, C141)
//   6. issuance-evidence check       (EVIDENCE_UNESTABLISHED; incl. the
//                                      requestless initiation provenance +
//                                      issuer recoverability closure)
//   7. issuer designation chains     (UNAUTHORIZED_ISSUER / STALE)
//   8. identity-precedence ordering  (ESTABLISHMENT_ORDER_VIOLATED, C140;
//                                      initiation -> establishment ->
//                                      selection -> Manifest)
//   9. exact scope/profile/subject   (SCOPE_/PROFILE_/SUBJECT_MISMATCH;
//                                      incl. exact selection/Manifest
//                                      selected-subject correspondence as
//                                      FULL exact selected tuples — scope +
//                                      semantic/revision identity + content
//                                      digest — never primary identity
//                                      alone)
// 10. coverage totals + currentness  (COVERAGE_*; selection/Manifest §8.2
//                                      reuse currentness — an intended-use
//                                      point predating the artifact's own
//                                      issuance is INVALID_FACTS,
//                                      SELECTION_/MANIFEST_INVALIDATED fail
//                                      closed, *_NOT_CURRENT stale — then
//                                      promotion currentness; total per
//                                      C80/C81)
//  11. material refusal evidence     (F-04 §4.2 codes)
//  12. otherwise                     => INTAKE_VERIFIED
//
// Portable: no Node built-ins; imports only the A41-001 foundation guard
// and the A41-002 designation-chain verifier.

import { isDacV0041Reference } from '../guards.js';
import { verifyDacV0041DesignationChain } from '../authority/index.js';
import type { DacV0041Reference } from '../contracts.js';
import type {
  DacV0041IssuancePointEvidence,
  DacV0041TimePoint,
} from '../authority/contracts.js';
import {
  DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS,
  DAC_V0041_MANIFEST_REUSE_CURRENTNESS_STATES,
  DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES,
  DAC_V0041_SELECTION_REUSE_CURRENTNESS_STATES,
  type DacV0041CompositionIntakeFailureCode,
  type DacV0041ApplicationSelectionFacts,
  type DacV0041AuthorityRefusalEvidenceVerification,
  type DacV0041AuthorityRefusalFacts,
  type DacV0041AuthorityRefusalSeamKind,
  type DacV0041CompositionIntakeInput,
  type DacV0041CompositionIntakeVerification,
  type DacV0041IdentityEstablishmentFacts,
  type DacV0041ManifestEvidenceFacts,
  type DacV0041SelectedDomainDataFacts,
} from './contracts.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimePoint(value: unknown): value is DacV0041TimePoint {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

/** Structural reference-like check: minted-carrier verification is a later pass. */
function isRefLike(value: unknown): value is DacV0041Reference {
  return value !== null && typeof value === 'object';
}

function isIssuanceEvidence(value: unknown): value is DacV0041IssuancePointEvidence {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041IssuancePointEvidence>;
  return isTimePoint(candidate.point) && isStringArray(candidate.assertedBy);
}

/** Structural shape of F-04 §4.1 requestless initiation evidence. */
function isRequestlessInitiation(value: unknown): value is DacV0041IdentityEstablishmentFacts['requestlessInitiation'] {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as {
    initiationRef?: unknown;
    initiatedBy?: unknown;
    initiationIssuerIdentity?: unknown;
    initiationProvenance?: unknown;
  };
  return (
    isRefLike(candidate.initiationRef) &&
    isNonEmptyString(candidate.initiatedBy) &&
    isNonEmptyString(candidate.initiationIssuerIdentity) &&
    isIssuanceEvidence(candidate.initiationProvenance)
  );
}

/** Structural shape of a §8.2 current-authoritative-reuse determination. */
function isReuseCurrentness(value: unknown): value is
  DacV0041ApplicationSelectionFacts['reuseCurrentness'] {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { state?: unknown; establishedAt?: unknown; assertedBy?: unknown };
  return (
    isNonEmptyString(candidate.state) &&
    isTimePoint(candidate.establishedAt) &&
    Array.isArray(candidate.assertedBy) &&
    candidate.assertedBy.length > 0 &&
    candidate.assertedBy.every((entry) => isNonEmptyString(entry))
  );
}

/** Evidence is established only with at least one independent attestor. */
function evidenceEstablished(evidence: DacV0041IssuancePointEvidence): boolean {
  return evidence.assertedBy.length > 0;
}

interface Ref {
  readonly value: DacV0041Reference;
  readonly label: string;
  readonly expectedRole: string;
}

/** Collect every evidence reference of the intake input, with its slot label. */
function collectRefs(input: DacV0041CompositionIntakeInput): readonly Ref[] {
  const refs: Ref[] = [
    {
      value: input.applicationIdentityEstablishment.establishmentRef,
      label: 'applicationIdentityEstablishment.establishmentRef',
      expectedRole: 'application-identity-establishment',
    },
    {
      value: input.applicationIdentityEstablishment.applicationSemanticIdentityRef,
      label: 'applicationIdentityEstablishment.applicationSemanticIdentityRef',
      expectedRole: 'application-semantic',
    },
    {
      value: input.applicationSelection.selectionRef,
      label: 'applicationSelection.selectionRef',
      expectedRole: 'application-selection',
    },
    {
      value: input.applicationSelection.applicationSemanticIdentityRef,
      label: 'applicationSelection.applicationSemanticIdentityRef',
      expectedRole: 'application-semantic',
    },
    {
      value: input.manifest.manifestRef,
      label: 'manifest.manifestRef',
      expectedRole: 'manifest',
    },
    {
      value: input.manifest.manifestContentDigestRef,
      label: 'manifest.manifestContentDigestRef',
      expectedRole: 'manifest-content-digest',
    },
    {
      value: input.manifest.applicationRevisionRef,
      label: 'manifest.applicationRevisionRef',
      expectedRole: 'application-revision',
    },
    {
      value: input.manifest.applicationSemanticIdentityRef,
      label: 'manifest.applicationSemanticIdentityRef',
      expectedRole: 'application-semantic',
    },
  ];
  const optionalRequest = input.applicationIdentityEstablishment.establishmentRequestRef;
  if (optionalRequest !== undefined) {
    refs.push({
      value: optionalRequest,
      label: 'applicationIdentityEstablishment.establishmentRequestRef',
      expectedRole: 'application-identity-establishment-request',
    });
  }
  const optionalRequestless = input.applicationIdentityEstablishment.requestlessInitiation;
  if (optionalRequestless !== undefined) {
    refs.push({
      value: optionalRequestless.initiationRef,
      label: 'applicationIdentityEstablishment.requestlessInitiation.initiationRef',
      expectedRole: 'evidence',
    });
  }
  for (const [index, subject] of input.applicationSelection.selectedDomainDataRefs.entries()) {
    refs.push({
      value: subject,
      label: `applicationSelection.selectedDomainDataRefs[${index}]`,
      expectedRole: 'selected-domain-data',
    });
  }
  for (const [index, subject] of input.manifest.selectedDomainDataRefs.entries()) {
    refs.push({
      value: subject,
      label: `manifest.selectedDomainDataRefs[${index}]`,
      expectedRole: 'selected-domain-data',
    });
  }
  for (const [index, refusal] of input.materialRefusals.entries()) {
    refs.push({
      value: refusal.refusalRef,
      label: `materialRefusals[${index}].refusalRef`,
      expectedRole: 'authority-refusal',
    });
    refs.push({
      value: refusal.exactRequestRef,
      label: `materialRefusals[${index}].exactRequestRef`,
      expectedRole: DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES[
        refusal.seamKind as DacV0041AuthorityRefusalSeamKind
      ] ?? 'authority-refusal',
    });
  }
  for (const [index, coverage] of input.selectedDomainData.entries()) {
    refs.push({
      value: coverage.subjectRef,
      label: `selectedDomainData[${index}].subjectRef`,
      expectedRole: 'selected-domain-data',
    });
    refs.push({
      value: coverage.promotionCoverageRef,
      label: `selectedDomainData[${index}].promotionCoverageRef`,
      expectedRole: 'promotion-decision',
    });
    refs.push({
      value: coverage.selectionCoverageRef,
      label: `selectedDomainData[${index}].selectionCoverageRef`,
      expectedRole: 'application-selection',
    });
  }
  return refs;
}

/**
 * Structural reference-array guard: entries only need to be non-null
 * objects here, so a foreign/forged carrier survives the shape pass and is
 * deterministically rejected as FOREIGN_EVIDENCE in the carrier pass
 * (never silently re-shaped).
 */
function isReferenceArray(value: unknown): value is readonly DacV0041Reference[] {
  return Array.isArray(value) && value.every((entry) => entry !== null && typeof entry === 'object');
}

function isRefusalArray(value: unknown): value is readonly DacV0041AuthorityRefusalFacts[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof (entry as Partial<DacV0041AuthorityRefusalFacts>).seamKind === 'string' &&
      isNonEmptyString((entry as Partial<DacV0041AuthorityRefusalFacts>).refusingIssuerIdentity),
  );
}

function isCoverageArray(value: unknown): value is readonly DacV0041SelectedDomainDataFacts[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      isNonEmptyString(
        (entry as Partial<DacV0041SelectedDomainDataFacts>).promotionCurrentness,
      ),
  );
}

function isEstablishmentFacts(
  value: unknown,
): value is DacV0041IdentityEstablishmentFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041IdentityEstablishmentFacts>;
  return (
    isRefLike(candidate.establishmentRef) &&
    (candidate.establishmentRequestRef === undefined ||
      isRefLike(candidate.establishmentRequestRef)) &&
    (candidate.requestlessInitiation === undefined ||
      isRequestlessInitiation(candidate.requestlessInitiation)) &&
    isRefLike(candidate.applicationSemanticIdentityRef) &&
    isNonEmptyString(candidate.issuerIdentity) &&
    candidate.issuerDesignationChain !== null &&
    typeof candidate.issuerDesignationChain === 'object' &&
    isNonEmptyString(candidate.requiredIssuingRole) &&
    isNonEmptyString(candidate.applicationScope) &&
    isNonEmptyString(candidate.dacProfileIdentity) &&
    isIssuanceEvidence(candidate.issuanceEvidence)
  );
}

function isSelectionFacts(value: unknown): value is DacV0041ApplicationSelectionFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041ApplicationSelectionFacts>;
  return (
    isRefLike(candidate.selectionRef) &&
    isRefLike(candidate.applicationSemanticIdentityRef) &&
    isReferenceArray(candidate.selectedDomainDataRefs) &&
    candidate.selectedDomainDataRefs !== undefined &&
    candidate.selectedDomainDataRefs.length > 0 &&
    isNonEmptyString(candidate.issuerIdentity) &&
    candidate.issuerDesignationChain !== null &&
    typeof candidate.issuerDesignationChain === 'object' &&
    isNonEmptyString(candidate.requiredIssuingRole) &&
    isNonEmptyString(candidate.applicationScope) &&
    isNonEmptyString(candidate.dacProfileIdentity) &&
    isIssuanceEvidence(candidate.issuanceEvidence) &&
    isReuseCurrentness(candidate.reuseCurrentness)
  );
}

function isManifestFacts(value: unknown): value is DacV0041ManifestEvidenceFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041ManifestEvidenceFacts>;
  return (
    isRefLike(candidate.manifestRef) &&
    isRefLike(candidate.manifestContentDigestRef) &&
    isRefLike(candidate.applicationRevisionRef) &&
    isRefLike(candidate.applicationSemanticIdentityRef) &&
    isReferenceArray(candidate.selectedDomainDataRefs) &&
    candidate.selectedDomainDataRefs !== undefined &&
    candidate.selectedDomainDataRefs.length > 0 &&
    isNonEmptyString(candidate.issuerIdentity) &&
    candidate.issuerDesignationChain !== null &&
    typeof candidate.issuerDesignationChain === 'object' &&
    isNonEmptyString(candidate.requiredIssuingRole) &&
    isNonEmptyString(candidate.applicationScope) &&
    isNonEmptyString(candidate.dacProfileIdentity) &&
    isIssuanceEvidence(candidate.issuanceEvidence) &&
    isReuseCurrentness(candidate.reuseCurrentness)
  );
}

function isCompositionIntakeInput(value: unknown): value is DacV0041CompositionIntakeInput {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041CompositionIntakeInput>;
  return (
    isEstablishmentFacts(candidate.applicationIdentityEstablishment) &&
    isSelectionFacts(candidate.applicationSelection) &&
    isManifestFacts(candidate.manifest) &&
    isRefusalArray(candidate.materialRefusals) &&
    isCoverageArray(candidate.selectedDomainData) &&
    candidate.selectedDomainData !== undefined &&
    candidate.selectedDomainData.length > 0 &&
    typeof candidate.refusalDisclosureComplete === 'boolean' &&
    isTimePoint(candidate.evaluationPoint)
  );
}

interface Fail {
  readonly outcome: 'FAIL_CLOSED';
  readonly code: string;
  readonly detail: string;
}

/** Pass 2–4 over every presented reference: carrier, role, predecessor wrap. */
function checkRefs(refs: readonly Ref[]): Fail | null {
  for (const ref of refs) {
    if (!isDacV0041Reference(ref.value)) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'FOREIGN_EVIDENCE',
        detail: `${ref.label} is not a reference minted by the DAC v0.0.4.1 adoption core; foreign/forged carriers fail closed`,
      };
    }
    if (ref.value.role !== ref.expectedRole) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'ROLE_MISMATCH',
        detail: `${ref.label} must carry role "${ref.expectedRole}" (got "${String(ref.value.role)}"); a request, draft or other-role identity can never occupy this evidence position`,
      };
    }
    if (ref.value.predecessorOrigin !== undefined) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'PREDECESSOR_WRAPPED',
        detail: `${ref.label} carries a predecessor origin (v0.0.3-or-earlier evidence presented as successor evidence); an older authority artifact cannot be consumer-wrapped into v0.0.4.1 intake (C145)`,
      };
    }
  }
  return null;
}

/** Pass 5: pairwise identity distinctness across the F-04 alias chain. */
function distinctIdentities(
  pairs: readonly { readonly label: string; readonly identity: string }[],
): Fail | null {
  for (let i = 0; i < pairs.length; i += 1) {
    const left = pairs[i];
    if (left === undefined) continue;
    for (let j = i + 1; j < pairs.length; j += 1) {
      const right = pairs[j];
      if (right === undefined) continue;
      if (left.identity === right.identity) {
        return {
          outcome: 'FAIL_CLOSED',
          code: 'IDENTITY_ALIAS',
          detail: `${left.label} and ${right.label} alias the same identity "${left.identity}"; request/result/record/semantic identities must remain pairwise distinct (C141 / CROSS_LAYER_REFERENCES §6)`,
        };
      }
    }
  }
  return null;
}

/**
 * The frozen exact selected-Domain-Data tuple key (DOMAIN_DATA_IR §2;
 * A41-004R2 / #381 P1-2): authoritative selected-subject correspondence
 * binds the FULL exact tuple — authority scope, primary/semantic/revision
 * identity and content digest — never primary identity alone. JSON array
 * encoding is injective over arbitrary identity strings (control
 * characters are escaped), so two distinct exact tuples can never collide
 * on one key.
 */
function selectedSubjectTuple(ref: DacV0041Reference): string {
  return JSON.stringify([
    ref.authorityScope,
    ref.primaryIdentity,
    ref.semanticIdentity ?? null,
    ref.revisionIdentity ?? null,
    ref.contentDigest ?? null,
  ]);
}

interface ChainChecks {
  readonly issuerIdentity: string;
  readonly requiredIssuingRole: string;
  readonly scope: string;
  readonly profile: string;
  readonly chain: unknown;
  readonly issuancePoint: DacV0041TimePoint;
  readonly label: string;
}

/**
 * ASSEMBLY_PROFILES §§8.2–8.3 current authoritative reuse classification for
 * one externally owned artifact (A41-004R1 / #377 P1-3; A41-004R2 / #381
 * P1-3). Deterministic precedence: an undecidable state, a determination
 * predating the artifact's own issuance, or an intended-use/evaluation
 * point predating the artifact's own issuance are malformed facts
 * (FAIL_CLOSED INVALID_FACTS — the artifact did not exist at the claimed
 * use point, so no currentness determination can make it current there);
 * explicit revocation/void FAIL CLOSED for the new authoritative use even
 * though the historical record stays immutable; ordinary
 * stale/superseded/reselected states and determinations that do not cover
 * the evaluation point are STALE; `current` passes only when established
 * at/after the evaluation point. Structural and authority violations
 * dominate these temporal states (C152/C171).
 */
function classifyReuseCurrentness(
  currentness: DacV0041ApplicationSelectionFacts['reuseCurrentness'],
  vocabulary: readonly string[],
  artifactIssuancePoint: DacV0041TimePoint,
  evaluationPoint: DacV0041TimePoint,
  label: string,
  invalidatedCode: 'SELECTION_INVALIDATED' | 'MANIFEST_INVALIDATED',
  notCurrentCode: 'SELECTION_NOT_CURRENT' | 'MANIFEST_NOT_CURRENT',
): DacV0041CompositionIntakeVerification | null {
  if (vocabulary.indexOf(currentness.state) === -1) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `${label} reuse-currentness state "${currentness.state}" is not a decidable currentness state; undecidable currentness fails closed`,
    };
  }
  if (currentness.establishedAt < artifactIssuancePoint) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `${label} reuse-currentness determination predates the artifact's own issuance point; a determination for a not-yet-issued artifact is malformed provenance`,
    };
  }
  if (evaluationPoint < artifactIssuancePoint) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `${label} intended use/evaluation point ${evaluationPoint} predates the artifact's own issuance point ${artifactIssuancePoint}; the artifact did not exist at the claimed use point, so it can never be current there (ASSEMBLY_PROFILES §8.2 / APPLICATION_MANIFEST §7)`,
    };
  }
  if (currentness.state === 'revoked' || currentness.state === 'voided') {
    return {
      outcome: 'FAIL_CLOSED',
      code: invalidatedCode,
      detail: `${label} is ${currentness.state} for new authoritative use; an explicitly invalidated artifact fails closed even though its historical record stays immutable (ASSEMBLY_PROFILES §8.3)`,
    };
  }
  if (
    currentness.state === 'stale' ||
    currentness.state === 'superseded' ||
    currentness.state === 'reselected'
  ) {
    return {
      outcome: 'STALE',
      code: notCurrentCode,
      detail: `${label} is ${currentness.state}; non-current artifacts are stale for authoritative intake (ASSEMBLY_PROFILES §8.2: current authoritative reuse re-checks later invalidation/supersession)`,
    };
  }
  if (currentness.establishedAt < evaluationPoint) {
    return {
      outcome: 'STALE',
      code: notCurrentCode,
      detail: `${label} currentness determination (at ${currentness.establishedAt}) does not cover the intended use/evaluation point ${evaluationPoint}; the determination must be established at or after the evaluation point`,
    };
  }
  return null;
}

/** Slot metadata for one issuer designation-chain check (pass 7). */

/**
 * Verify one seam-typed `AuthorityRefusalRef` presented as evidence
 * (F-04 §4.2; C142). Pure and total: never throws, never repairs, never
 * re-types a refusal into an invocation failure or vice versa, and never
 * creates refusal authority — the refusal was issued by its owning seam;
 * this only verifies the presented evidence.
 */
export function verifyDacV0041AuthorityRefusalEvidence(
  facts: DacV0041AuthorityRefusalFacts,
): DacV0041AuthorityRefusalEvidenceVerification {
  // Pass 1 is STRUCTURAL SHAPE ONLY (#377 P2-1): reference slots need only
  // be ref-like objects, so a structurally shaped but forged carrier
  // survives shape and is deterministically typed FOREIGN_EVIDENCE in pass
  // 2 — never swallowed by INVALID_FACTS.
  if (
    facts === null ||
    typeof facts !== 'object' ||
    !isRefLike(facts.refusalRef) ||
    !isNonEmptyString(facts.seamKind) ||
    !isRefLike(facts.exactRequestRef) ||
    !isNonEmptyString(facts.refusingIssuerIdentity) ||
    !isNonEmptyString(facts.requiredIssuingRole) ||
    !isNonEmptyString(facts.subjectScope) ||
    !isNonEmptyString(facts.dacProfileIdentity) ||
    !isIssuanceEvidence(facts.issuanceEvidence) ||
    !isNonEmptyString(facts.presentedOutcomeClass)
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'authority-refusal facts are malformed; every required fact must be an externally recoverable non-empty value',
    };
  }
  // Pass 2: minted-carrier validation, distinct from structural shape.
  if (!isDacV0041Reference(facts.refusalRef)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'refusalRef is not a reference minted by the DAC v0.0.4.1 adoption core; foreign/forged carriers fail closed',
    };
  }
  if (!isDacV0041Reference(facts.exactRequestRef)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'exactRequestRef is not a reference minted by the DAC v0.0.4.1 adoption core; foreign/forged carriers fail closed',
    };
  }
  if (facts.refusalRef.role !== 'authority-refusal') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'ROLE_MISMATCH',
      detail: `refusalRef must carry role "authority-refusal" (got "${String(facts.refusalRef.role)}")`,
    };
  }
  if (facts.refusalRef.predecessorOrigin !== undefined) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'PREDECESSOR_WRAPPED',
      detail: 'refusalRef carries a predecessor origin; older-baseline refusal evidence cannot be consumer-wrapped into v0.0.4.1 intake (C145)',
    };
  }
  if (facts.refusalRef.primaryIdentity === facts.exactRequestRef.primaryIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REQUEST_REFUSAL_ALIAS',
      detail: `refusal identity "${facts.refusalRef.primaryIdentity}" aliases its bound request identity; a produced refusal is distinct from the request it refuses (C141 family)`,
    };
  }
  const seam = facts.seamKind as DacV0041AuthorityRefusalSeamKind;
  if ((DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS as readonly string[]).indexOf(facts.seamKind) === -1) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REFUSAL_SEAM_UNKNOWN',
      detail: `refusal seam kind "${facts.seamKind}" is not in the closed F-04 §4.2 vocabulary; unknown seams fail closed`,
    };
  }
  const expectedRequestRole = DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES[seam];
  if (facts.exactRequestRef.role !== expectedRequestRole) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REFUSAL_SEAM_CONFLATED',
      detail: `a ${seam} refusal must bind the exact "${expectedRequestRole}" of its own seam (got "${String(facts.exactRequestRef.role)}"); binding refusal is never conflated with activation refusal and no seam re-typing occurs (C142)`,
    };
  }
  if (facts.presentedOutcomeClass !== 'produced-result') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REFUSAL_RECLASSIFIED',
      detail: `a substantive AuthorityRefusalRef is a produced-result; presenting it as "${facts.presentedOutcomeClass}" (an invocation transport/input outcome) is the forbidden reclassification (C142)`,
    };
  }
  if (!evidenceEstablished(facts.issuanceEvidence)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'EVIDENCE_UNESTABLISHED',
      detail: 'refusal issuance point has no independent attestor; issuance-point evidence must be independently recoverable',
    };
  }
  const chainResult = verifyDacV0041DesignationChain(facts.issuerDesignationChain);
  if (chainResult.outcome === 'FAIL_CLOSED') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'UNAUTHORIZED_REFUSER',
      detail: `refusing issuer designation chain failed (${chainResult.code}: ${chainResult.detail})`,
    };
  }
  if (chainResult.outcome === 'STALE') {
    return {
      outcome: 'STALE',
      code: 'REFUSER_CHAIN_STALE',
      detail: `refusing issuer designation chain was not current at the refusal issuance point (${chainResult.reason} on ${chainResult.lapsedLinkIdentity})`,
    };
  }
  // The A41-002 chain walk is leaf-first, so the LEAF is element 0.
  const leafIdentity = chainResult.chainLinkIdentities[0];
  const leaf = (facts.issuerDesignationChain.links as readonly {
    linkIdentity: string;
    designatedIssuerIdentity: string;
    authorityRole: string;
    authorityScope: string;
    dacProfileIdentity: string;
  }[]).find((link) => link.linkIdentity === leafIdentity);
  if (
    leaf === undefined ||
    leaf.designatedIssuerIdentity !== facts.refusingIssuerIdentity ||
    leaf.authorityRole !== facts.requiredIssuingRole ||
    leaf.authorityScope !== facts.subjectScope ||
    leaf.dacProfileIdentity !== facts.dacProfileIdentity
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'UNAUTHORIZED_REFUSER',
      detail: `refusing issuer/role/scope/profile does not match the chain-current leaf designation for ${seam}`,
    };
  }
  return {
    outcome: 'REFUSAL_VERIFIED',
    seamKind: seam,
    refusalIdentity: facts.refusalRef.primaryIdentity,
    detail: `seam-typed ${seam} refusal verified as material produced-result evidence; consuming it creates no selection, promotion, binding or Manifest authority`,
  };
}

/**
 * Deterministic composition-intake verification (F-04; C140–C143). Pure,
 * total and fail-closed over externally owned evidence: verifies the exact
 * application-identity establishment, the application selection that binds
 * promotion-covered subjects to that established identity, the successor
 * Manifest evidence, the total selected-Domain-Data coverage and the
 * seam-typed material refusal evidence — without issuing, selecting,
 * refusing, promoting, drafting or absorbing anything, and without any
 * live-state read or write.
 */
export function verifyDacV0041CompositionIntake(
  input: DacV0041CompositionIntakeInput,
): DacV0041CompositionIntakeVerification {
  // Pass 1: shape.
  if (!isCompositionIntakeInput(input)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'composition-intake input is malformed; every fact must be an externally recoverable, structurally valid value',
    };
  }
  const establishment = input.applicationIdentityEstablishment;
  const selection = input.applicationSelection;
  const manifest = input.manifest;
  const requestless = establishment.requestlessInitiation;

  // F-04 §4.1 initiation minimum, exactly one of the two frozen seams: a
  // request seam OR an explicitly evidenced (externally recoverable)
  // requestless initiation. Neither present is absent initiation evidence;
  // both present is an ambiguous seam; a boolean claim alone is not
  // evidence (A41-004R1 / #377 P1-1).
  if (establishment.establishmentRequestRef !== undefined && requestless !== undefined) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'application-identity establishment cannot carry both an establishment request and a requestless initiation; exactly one initiation seam must be evidenced',
    };
  }
  if (establishment.establishmentRequestRef === undefined && requestless === undefined) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'application-identity establishment must carry exactly 1 establishment request or an explicitly evidenced requestless initiation record; absent initiation evidence fails closed',
    };
  }

  // Passes 2–4 over every presented reference.
  const refs = collectRefs(input);
  const refFailure = checkRefs(refs);
  if (refFailure !== null) {
    return refFailure as DacV0041CompositionIntakeVerification;
  }

  // Pass 5: F-04 identity anti-alias (C141; CROSS_LAYER_REFERENCES §6).
  const aliasCheck = distinctIdentities([
    { label: 'establishment:record', identity: establishment.establishmentRef.primaryIdentity },
    ...(establishment.establishmentRequestRef === undefined
      ? []
      : [
          {
            label: 'establishment:request',
            identity: establishment.establishmentRequestRef.primaryIdentity,
          },
        ]),
    ...(requestless === undefined
      ? []
      : [
          {
            label: 'establishment:requestless-initiation',
            identity: requestless.initiationRef.primaryIdentity,
          },
        ]),
    {
      label: 'establishment:semantic',
      identity: establishment.applicationSemanticIdentityRef.primaryIdentity,
    },
    { label: 'selection:record', identity: selection.selectionRef.primaryIdentity },
    { label: 'manifest:record', identity: manifest.manifestRef.primaryIdentity },
    { label: 'manifest:digest', identity: manifest.manifestContentDigestRef.primaryIdentity },
    { label: 'manifest:revision', identity: manifest.applicationRevisionRef.primaryIdentity },
  ]);
  if (aliasCheck !== null) {
    return aliasCheck as DacV0041CompositionIntakeVerification;
  }

  // Pass 6: independently recoverable issuance-point evidence (C128 family).
  for (const [label, evidence] of [
    ['applicationIdentityEstablishment', establishment.issuanceEvidence],
    ['applicationSelection', selection.issuanceEvidence],
    ['manifest', manifest.issuanceEvidence],
  ] as const) {
    if (!evidenceEstablished(evidence)) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'EVIDENCE_UNESTABLISHED',
        detail: `${label} issuance point has no independent attestor; issuance evidence must be independently recoverable`,
      };
    }
  }
  if (requestless !== undefined) {
    if (!evidenceEstablished(requestless.initiationProvenance)) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'EVIDENCE_UNESTABLISHED',
        detail: 'requestless initiation provenance has no independent attestor; the initiation record must be independently recoverable (a caller boolean claim is not initiation evidence)',
      };
    }
    if (!requestless.initiationProvenance.assertedBy.includes(requestless.initiationIssuerIdentity)) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'EVIDENCE_UNESTABLISHED',
        detail: `requestless initiation issuer "${requestless.initiationIssuerIdentity}" is not covered by the independently recoverable initiation provenance; the issuer claim must be backed by the provenance attestors`,
      };
    }
  }

  // Pass 7: issuer designation chains at each evidenced issuance point.
  const issuerChecks: readonly ChainChecks[] = [
    {
      issuerIdentity: establishment.issuerIdentity,
      requiredIssuingRole: establishment.requiredIssuingRole,
      scope: establishment.applicationScope,
      profile: establishment.dacProfileIdentity,
      chain: { ...establishment.issuerDesignationChain, evaluationPoint: establishment.issuanceEvidence.point },
      issuancePoint: establishment.issuanceEvidence.point,
      label: 'applicationIdentityEstablishment',
    },
    {
      issuerIdentity: selection.issuerIdentity,
      requiredIssuingRole: selection.requiredIssuingRole,
      scope: selection.applicationScope,
      profile: selection.dacProfileIdentity,
      chain: { ...selection.issuerDesignationChain, evaluationPoint: selection.issuanceEvidence.point },
      issuancePoint: selection.issuanceEvidence.point,
      label: 'applicationSelection',
    },
    {
      issuerIdentity: manifest.issuerIdentity,
      requiredIssuingRole: manifest.requiredIssuingRole,
      scope: manifest.applicationScope,
      profile: manifest.dacProfileIdentity,
      chain: { ...manifest.issuerDesignationChain, evaluationPoint: manifest.issuanceEvidence.point },
      issuancePoint: manifest.issuanceEvidence.point,
      label: 'manifest',
    },
  ];
  for (const check of issuerChecks) {
    const chainResult = verifyDacV0041DesignationChain(
      check.chain as Parameters<typeof verifyDacV0041DesignationChain>[0],
    );
    if (chainResult.outcome === 'FAIL_CLOSED') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'UNAUTHORIZED_ISSUER',
        detail: `${check.label}: issuer designation chain failed (${chainResult.code}: ${chainResult.detail})`,
      };
    }
    if (chainResult.outcome === 'STALE') {
      return {
        outcome: 'STALE',
        code: 'ISSUER_CHAIN_STALE',
        detail: `${check.label}: issuer designation chain was not current at the evidenced issuance point (${chainResult.reason} on ${chainResult.lapsedLinkIdentity})`,
      };
    }
    // Exact leaf binding: issuer identity, role, scope and profile. The
    // A41-002 chain walk is leaf-first, so the LEAF is element 0.
    const leafIdentity = chainResult.chainLinkIdentities[0];
    const leaf = (check.chain as DacV0041CompositionIntakeInput['applicationSelection']['issuerDesignationChain'])
      .links.find((link) => link.linkIdentity === leafIdentity);
    if (
      leaf === undefined ||
      leaf.designatedIssuerIdentity !== check.issuerIdentity ||
      leaf.authorityRole !== check.requiredIssuingRole ||
      leaf.authorityScope !== check.scope ||
      leaf.dacProfileIdentity !== check.profile
    ) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'UNAUTHORIZED_ISSUER',
        detail: `${check.label}: presented issuer/role/scope/profile does not match the chain-current leaf designation`,
      };
    }
  }

  // Pass 8: identity precedence (C140; APPLICATION_MANIFEST §2).
  if (
    requestless !== undefined &&
    !(requestless.initiationProvenance.point < establishment.issuanceEvidence.point)
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'ESTABLISHMENT_ORDER_VIOLATED',
      detail: 'requestless initiation provenance must strictly precede the establishment issuance point; an establishment record never responds to a later initiation',
    };
  }
  if (!(establishment.issuanceEvidence.point < selection.issuanceEvidence.point)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'ESTABLISHMENT_ORDER_VIOLATED',
      detail: 'application-identity establishment issuance point must strictly precede the selection issuance point relied upon (C140: identity precedes selection)',
    };
  }
  if (!(selection.issuanceEvidence.point < manifest.issuanceEvidence.point)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'ESTABLISHMENT_ORDER_VIOLATED',
      detail: 'application-selection issuance point must strictly precede Manifest issuance (APPLICATION_MANIFEST §2: selection before Manifest; Manifest never retroactively manufactures selection)',
    };
  }

  // Pass 9: exact scope/profile/subject matching (exact-token only).
  const scopes = [establishment.applicationScope, selection.applicationScope, manifest.applicationScope];
  if (!scopes.every((scope) => scope === scopes[0])) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SCOPE_MISMATCH',
      detail: `application scope must match across establishment/selection/Manifest evidence (got ${scopes.join(' vs ')})`,
    };
  }
  const profiles = [
    establishment.dacProfileIdentity,
    selection.dacProfileIdentity,
    manifest.dacProfileIdentity,
  ];
  if (!profiles.every((profile) => profile === profiles[0])) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'PROFILE_MISMATCH',
      detail: `DAC/reference profile must match across establishment/selection/Manifest evidence (got ${profiles.join(' vs ')})`,
    };
  }
  const semanticIdentities = [
    establishment.applicationSemanticIdentityRef.primaryIdentity,
    selection.applicationSemanticIdentityRef.primaryIdentity,
    manifest.applicationSemanticIdentityRef.primaryIdentity,
  ];
  if (!semanticIdentities.every((identity) => identity === semanticIdentities[0])) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the established application semantic identity must match across establishment/selection/Manifest evidence (got ${semanticIdentities.join(' vs ')})`,
    };
  }
  for (const [index, reference] of [
    establishment.applicationSemanticIdentityRef,
    selection.applicationSemanticIdentityRef,
    manifest.applicationSemanticIdentityRef,
  ].entries()) {
    if (reference.authorityScope !== scopes[0]) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SCOPE_MISMATCH',
        detail: `application semantic identity reference ${index} does not carry the exact application scope`,
      };
    }
  }
  if (
    requestless !== undefined &&
    requestless.initiationRef.authorityScope !== scopes[0]
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SCOPE_MISMATCH',
      detail: 'requestless initiation reference does not carry the exact application scope of the establishment it initiates (subject/scope closure)',
    };
  }

  // Pass 10: total selected Domain Data coverage (C80/C81; Manifest §3).
  // 10a. EXACT selected-subject correspondence between the presented
  // ApplicationSelectionRef and the Manifest over the FULL frozen exact
  // selected tuple — authority scope + primary/semantic/revision identity
  // + content digest (DOMAIN_DATA_IR §2; A41-004R2 / #381 P1-2).
  // Primary-identity correspondence alone cannot close selection closure:
  // a Manifest revision/digest the presented selection never selected (or
  // a different authority scope under the same primary identity) would
  // otherwise be admitted, silently changing material composition
  // identity (APPLICATION_MANIFEST §6). Duplicate subject identities fail
  // closed; a Manifest-only exact tuple fails closed even when a
  // syntactically complete forged coverage row naming the presented
  // selection identity exists, because a Manifest must not retroactively
  // manufacture selection authority (APPLICATION_MANIFEST §2 — Manifest
  // issuance records the exact selected composition, it never widens it).
  for (const [label, refs] of [
    ['applicationSelection.selectedDomainDataRefs', selection.selectedDomainDataRefs],
    ['manifest.selectedDomainDataRefs', manifest.selectedDomainDataRefs],
  ] as const) {
    const identities = refs.map((subject) => subject.primaryIdentity);
    if (new Set(identities).size !== identities.length) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'INVALID_FACTS',
        detail: `${label} repeats a selected subject identity; the exact selected subject set must be duplicate-free`,
      };
    }
  }
  const selectionTupleSet = new Set(
    selection.selectedDomainDataRefs.map((subject) => selectedSubjectTuple(subject)),
  );
  const manifestTupleSet = new Set(
    manifest.selectedDomainDataRefs.map((subject) => selectedSubjectTuple(subject)),
  );
  for (const subject of manifest.selectedDomainDataRefs) {
    if (!selectionTupleSet.has(selectedSubjectTuple(subject))) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `Manifest claims selected Domain Data subject "${subject.primaryIdentity}" as an exact tuple (scope/semantic/revision/digest) that the presented ApplicationSelectionRef did not select; the exact selected tuple — not the primary identity alone — must correspond (DOMAIN_DATA_IR §2), and a Manifest cannot retroactively manufacture selection authority (APPLICATION_MANIFEST §2)`,
      };
    }
  }
  for (const subject of selection.selectedDomainDataRefs) {
    if (!manifestTupleSet.has(selectedSubjectTuple(subject))) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `selected Domain Data subject "${subject.primaryIdentity}" (exact scope/semantic/revision/digest tuple) is absent from the Manifest composition; the Manifest must record the exact selected subject set as full exact tuples (DOMAIN_DATA_IR §2)`,
      };
    }
  }
  // 10b. Coverage-row reconciliation over the exactly corresponding set,
  // keyed by the same full exact selected tuple: a coverage row naming the
  // primary identity of a selected subject under a DIFFERENT exact tuple
  // is a subject mismatch, never accepted coverage (A41-004R2 / #381 P1-2).
  const requiredSubjects = new Map<string, string>();
  for (const subject of selection.selectedDomainDataRefs) {
    requiredSubjects.set(selectedSubjectTuple(subject), subject.primaryIdentity);
  }
  const coveredSubjects = new Map<string, DacV0041SelectedDomainDataFacts>();
  for (const coverage of input.selectedDomainData) {
    const tuple = selectedSubjectTuple(coverage.subjectRef);
    if (requiredSubjects.has(tuple)) {
      if (coveredSubjects.has(tuple)) {
        return {
          outcome: 'FAIL_CLOSED',
          code: 'COVERAGE_INCOMPLETE',
          detail: `duplicate coverage records for selected subject "${coverage.subjectRef.primaryIdentity}"`,
        };
      }
      coveredSubjects.set(tuple, coverage);
    } else {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `coverage record for "${coverage.subjectRef.primaryIdentity}" does not correspond to the exact selected Domain Data tuple (scope/semantic/revision/digest) of the selection/Manifest evidence; primary-identity coincidence is not selection coverage (DOMAIN_DATA_IR §2)`,
      };
    }
  }
  for (const [tuple, subject] of requiredSubjects) {
    const coverage = coveredSubjects.get(tuple);
    if (coverage === undefined) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'COVERAGE_INCOMPLETE',
        detail: `selected Domain Data subject "${subject}" has no effective promotion + selection coverage; coverage is total wherever Runtime consequence depends on it (C80/C81)`,
      };
    }
    if (coverage.selectionCoverageRef.primaryIdentity !== selection.selectionRef.primaryIdentity) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `selection coverage for "${subject}" must be the exact presented ApplicationSelectionRef (got "${coverage.selectionCoverageRef.primaryIdentity}")`,
      };
    }
  }
  // 10c. Current authoritative reuse of the selection and the Manifest
  // (ASSEMBLY_PROFILES §§8.2–8.3; A41-004R1 / #377 P1-3), evaluated at the
  // intended use/evaluation point. Explicit invalidation fails closed
  // BEFORE per-subject promotion currentness is even consulted — structural
  // and authority violations dominate temporal states (C152/C171).
  const selectionCurrentnessFailure = classifyReuseCurrentness(
    selection.reuseCurrentness,
    DAC_V0041_SELECTION_REUSE_CURRENTNESS_STATES,
    selection.issuanceEvidence.point,
    input.evaluationPoint,
    'applicationSelection',
    'SELECTION_INVALIDATED',
    'SELECTION_NOT_CURRENT',
  );
  if (selectionCurrentnessFailure !== null) {
    return selectionCurrentnessFailure;
  }
  const manifestCurrentnessFailure = classifyReuseCurrentness(
    manifest.reuseCurrentness,
    DAC_V0041_MANIFEST_REUSE_CURRENTNESS_STATES,
    manifest.issuanceEvidence.point,
    input.evaluationPoint,
    'manifest',
    'MANIFEST_INVALIDATED',
    'MANIFEST_NOT_CURRENT',
  );
  if (manifestCurrentnessFailure !== null) {
    return manifestCurrentnessFailure;
  }
  // 10d. Promotion coverage currentness per selected subject (C81/C157),
  // reconciled over the same full exact selected tuples.
  for (const [tuple, subject] of requiredSubjects) {
    const coverage = coveredSubjects.get(tuple);
    if (coverage === undefined) {
      continue;
    }
    if (coverage.promotionCurrentness === 'revoked' || coverage.promotionCurrentness === 'voided') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'COVERAGE_INVALIDATED',
        detail: `promotion coverage for "${subject}" is ${coverage.promotionCurrentness}; invalidated promotion coverage can never support Runtime consequence`,
      };
    }
    if (coverage.promotionCurrentness === 'stale' || coverage.promotionCurrentness === 'superseded') {
      return {
        outcome: 'STALE',
        code: 'COVERAGE_NOT_CURRENT',
        detail: `promotion coverage for "${subject}" is ${coverage.promotionCurrentness}; non-current promotion coverage is stale for authoritative intake`,
      };
    }
    if (coverage.promotionCurrentness !== 'current') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'INVALID_FACTS',
        detail: `promotion currentness "${coverage.promotionCurrentness}" for "${subject}" is not a decidable currentness state; undecidable currentness fails closed`,
      };
    }
  }

  // Pass 11: material refusal evidence (C142/C143; F-04 §4.2).
  if (!input.refusalDisclosureComplete) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'MATERIAL_REFUSAL_OMITTED',
      detail: 'material refusal disclosure is incomplete; a material refusal MUST NOT be omitted from claim closure merely because a later favorable result exists (C143/C97)',
    };
  }
  for (const refusal of input.materialRefusals) {
    const refusalResult = verifyDacV0041AuthorityRefusalEvidence(refusal);
    if (refusalResult.outcome === 'STALE') {
      return {
        outcome: 'STALE',
        code: 'ISSUER_CHAIN_STALE',
        detail: `material refusal evidence stale: ${refusalResult.detail}`,
      };
    }
    if (refusalResult.outcome === 'FAIL_CLOSED') {
      const refusalCode: DacV0041CompositionIntakeFailureCode = refusalResult.code;
      return {
        outcome: 'FAIL_CLOSED',
        code: refusalCode,
        detail: `material refusal evidence rejected: ${refusalResult.detail}`,
      };
    }
  }

  // Pass 12: verified-and-accepted — evidence only, no authority absorbed.
  return {
    outcome: 'INTAKE_VERIFIED',
    establishmentIdentity: establishment.establishmentRef.primaryIdentity,
    selectionIdentity: selection.selectionRef.primaryIdentity,
    manifestIdentity: manifest.manifestRef.primaryIdentity,
    coveredSubjectIdentities: Object.freeze([...requiredSubjects.values()].sort()),
    detail: 'externally owned identity/selection/Manifest/refusal evidence verified at intake; no Composer, selection, promotion or Manifest authority created and no live Runtime state absorbed',
  };
}
