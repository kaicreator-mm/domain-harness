// Issue #359 / A41-005: deterministic consumer/verifier functions for DAC
// v0.0.4.1 Runtime binding/activation successor semantics (ASSEMBLY_
// LIFECYCLE §§12–13, §14–§17; ASSEMBLY_PROFILES §15; ASSEMBLY_CAPABILITY_
// EXCHANGE §10; CROSS_LAYER_REFERENCES §§3.1/§6/§9; conformance rows
// C100/C107/C108/C113/C128/C142/C148/C149/C154/C155/C157/C169).
//
// CONSUMER ONLY — never an issuer. Every function is pure and total over
// externally recovered facts: malformed or hostile inputs are returned as
// typed FAIL_CLOSED results (never thrown for fact-level failures, never
// guessed, never repaired). No function here issues a RuntimeBindingRef,
// a RuntimeActivationRef, a Runtime/Host Binding result, a designation, a
// promotion, a selection, a Manifest or a compatibility verdict, and none
// reads or writes live Runtime state. The upstream A41-002 designation-
// chain verifier, the A41-003 compatibility view/precedence classifiers
// and the A41-004 composition-intake verifier are CONSUMED as evidence
// gates: their authority is never re-evaluated, re-decided, re-issued or
// absorbed (C107: compatibility PASS != binding != activation).
//
// Portable: no Node built-ins; imports only the A41-001 foundation, the
// A41-002 designation-chain verifier and the A41-003/-004 leaf modules.

import {
  classifyDacV0041CurrentnessUse,
  isCompatibilityValidationRequestRef,
  isDacV0041Reference,
  isRuntimeBindingRequestRef,
  verifyDacV0041RequestResultSeparation,
} from '../guards.js';
import { verifyDacV0041DesignationChain } from '../authority/index.js';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041CompatibilityViewAssociation,
} from '../compatibility/index.js';
import { verifyDacV0041CompositionIntake } from '../composition-intake/index.js';
import type { DacV0041Reference } from '../contracts.js';
import type {
  DacV0041DesignationChainFailureCode,
  DacV0041DesignationChainInput,
  DacV0041IssuancePointEvidence,
  DacV0041TimePoint,
} from '../authority/contracts.js';
import type { DacV0041ReuseCurrentnessFacts } from '../composition-intake/contracts.js';
import {
  DAC_V0041_EXTERNAL_SOR_EVIDENCE_CLASSES,
  DAC_V0041_RUNTIME_ACTIVATION_ISSUER_SEAM_ROLE,
  DAC_V0041_RUNTIME_BINDING_ISSUER_SEAM_ROLE,
  DAC_V0041_RUNTIME_NON_SOR_STATE_CLASSES,
} from './contracts.js';
import type {
  DacV0041ExternalSorEvidenceClass,
  DacV0041RuntimeActivationRequestSubjectFacts,
  DacV0041RuntimeNonSorStateClass,
  DacV0041BusinessSorBoundaryClassification,
  DacV0041BusinessSorTruthSourceFacts,
  DacV0041RuntimeActivationVerification,
  DacV0041RuntimeActivationVerificationInput,
  DacV0041RuntimeBindingVerification,
  DacV0041RuntimeBindingVerificationInput,
  DacV0041RuntimeIssuerFacts,
  DacV0041RuntimeMaterialArtifactFacts,
  DacV0041RuntimeSodFacts,
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

/** Exact element-for-element string-array equality (no order tolerance). */
function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function isRefLike(value: unknown): value is DacV0041Reference {
  return value !== null && typeof value === 'object';
}

function isIssuanceEvidence(value: unknown): value is DacV0041IssuancePointEvidence {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041IssuancePointEvidence>;
  return isTimePoint(candidate.point) && isStringArray(candidate.assertedBy);
}

function isReuseCurrentness(value: unknown): value is DacV0041ReuseCurrentnessFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041ReuseCurrentnessFacts>;
  return (
    isNonEmptyString(candidate.state) &&
    isTimePoint(candidate.establishedAt) &&
    isStringArray(candidate.assertedBy)
  );
}

function isSodFacts(value: unknown): value is DacV0041RuntimeSodFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041RuntimeSodFacts>;
  if (!isStringArray(candidate.subjectContributingIdentities)) return false;
  if (typeof candidate.explicitSodPermissionEstablished !== 'boolean') return false;
  if (typeof candidate.coLocationDisclosed !== 'boolean') return false;
  if (!Array.isArray(candidate.coHostingGroups)) return false;
  for (const group of candidate.coHostingGroups) {
    if (!isStringArray(group)) return false;
  }
  return true;
}

function isIssuerFacts(value: unknown): value is DacV0041RuntimeIssuerFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041RuntimeIssuerFacts>;
  if (!isNonEmptyString(candidate.issuerIdentity)) return false;
  if (!isNonEmptyString(candidate.requiredIssuingRole)) return false;
  const chain = candidate.issuerDesignationChain;
  if (chain === null || typeof chain !== 'object') return false;
  const chainCandidate = chain as Partial<DacV0041DesignationChainInput>;
  return (
    Array.isArray(chainCandidate.links) &&
    isNonEmptyString(chainCandidate.leafLinkIdentity) &&
    Array.isArray(chainCandidate.scopeOwnerAnchors)
  );
}

function isMaterialArtifactFacts(value: unknown): value is DacV0041RuntimeMaterialArtifactFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041RuntimeMaterialArtifactFacts>;
  return (
    isRefLike(candidate.artifactRef) &&
    isTimePoint(candidate.issuancePoint) &&
    isReuseCurrentness(candidate.reuseCurrentness)
  );
}

function isCompatibilityEvidenceLike(value: unknown): value is
  DacV0041RuntimeBindingVerificationInput['compatibility'] {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<
    DacV0041RuntimeBindingVerificationInput['compatibility']
  >;
  return (
    isRefLike(candidate.requestRef) &&
    candidate.validationView !== null &&
    typeof candidate.validationView === 'object' &&
    candidate.resultView !== null &&
    typeof candidate.resultView === 'object' &&
    candidate.precedenceFacts !== null &&
    typeof candidate.precedenceFacts === 'object'
  );
}

/** Structural shape of the complete Runtime binding verification input. */
function isRuntimeBindingInput(
  value: unknown,
): value is DacV0041RuntimeBindingVerificationInput {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041RuntimeBindingVerificationInput>;
  if (!isRefLike(candidate.bindingRequestRef)) return false;
  if (!isRefLike(candidate.bindingResultRef)) return false;
  if (!isNonEmptyString(candidate.boundRequestIdentity)) return false;
  const subject = candidate.subject;
  if (subject === null || typeof subject !== 'object') return false;
  const subjectCandidate = subject as Partial<
    DacV0041RuntimeBindingVerificationInput['subject']
  >;
  if (!isNonEmptyString(subjectCandidate.manifestIdentity)) return false;
  if (!isNonEmptyString(subjectCandidate.manifestContentDigest)) return false;
  if (!isNonEmptyString(subjectCandidate.dacProfileIdentity)) return false;
  if (candidate.compositionIntake === null || typeof candidate.compositionIntake !== 'object') {
    return false;
  }
  if (!isCompatibilityEvidenceLike(candidate.compatibility)) return false;
  if (candidate.implementationEvidence !== undefined) {
    if (!isMaterialArtifactFacts(candidate.implementationEvidence)) return false;
  }
  if (candidate.hostBindingEvidence !== undefined) {
    if (!Array.isArray(candidate.hostBindingEvidence)) return false;
    for (const entry of candidate.hostBindingEvidence) {
      if (!isMaterialArtifactFacts(entry)) return false;
    }
  }
  if (!isIssuerFacts(candidate.bindingIssuer)) return false;
  if (!isIssuanceEvidence(candidate.bindingIssuanceEvidence)) return false;
  if (!isSodFacts(candidate.sod)) return false;
  return isTimePoint(candidate.evaluationPoint);
}

/** Structural shape of the exact §3.1 activation-request subject facts. */
function isActivationRequestSubjectFacts(
  value: unknown,
): value is DacV0041RuntimeActivationRequestSubjectFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041RuntimeActivationRequestSubjectFacts>;
  for (const field of [
    'targetBindingIdentity',
    'targetManifestIdentity',
    'targetManifestContentDigest',
  ] as const) {
    if (!isNonEmptyString(candidate[field])) return false;
  }
  return isReuseCurrentness(candidate.reliedBindingCurrentness);
}

/** Structural shape of the complete Runtime activation verification input. */
function isRuntimeActivationInput(
  value: unknown,
): value is DacV0041RuntimeActivationVerificationInput {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041RuntimeActivationVerificationInput>;
  if (!isRefLike(candidate.activationRequestRef)) return false;
  if (!isRefLike(candidate.activationResultRef)) return false;
  for (const field of [
    'boundRequestIdentity',
    'boundBindingIdentity',
    'boundManifestIdentity',
    'boundManifestContentDigest',
  ] as const) {
    if (!isNonEmptyString(candidate[field])) return false;
  }
  if (!isActivationRequestSubjectFacts(candidate.activationRequestSubject)) return false;
  if (!isRuntimeBindingInput(candidate.binding)) return false;
  if (!isIssuerFacts(candidate.activationIssuer)) return false;
  if (!isIssuanceEvidence(candidate.activationIssuanceEvidence)) return false;
  if (!isReuseCurrentness(candidate.bindingReuseCurrentness)) return false;
  if (!isSodFacts(candidate.sod)) return false;
  return isTimePoint(candidate.evaluationPoint);
}

interface IdentitySlot {
  readonly label: string;
  readonly identity: string;
}

/** Pairwise identity distinctness over labeled slots (fail-closed, first collision wins). */
function distinctIdentities(
  slots: readonly IdentitySlot[],
): { readonly detail: string } | null {
  for (let i = 0; i < slots.length; i += 1) {
    const left = slots[i];
    if (left === undefined) continue;
    for (let j = i + 1; j < slots.length; j += 1) {
      const right = slots[j];
      if (right === undefined) continue;
      if (left.identity === right.identity) {
        return {
          detail: `identity "${left.identity}" is shared by ${left.label} and ${right.label}; every Runtime-seam identity must remain separately recoverable`,
        };
      }
    }
  }
  return null;
}

/** Material-exactness envelope fields compared for full exact reference equality. */
type DacV0041EnvelopeMaterialField =
  | 'role'
  | 'authorityScope'
  | 'primaryIdentity'
  | 'semanticIdentity'
  | 'revisionIdentity'
  | 'contentDigest'
  | 'contractProfileIdentity';

/**
 * Structural material-exactness view shared by minted foundation reference
 * envelopes and A41-003 `materialManifestRefs` fact entries: exactly the
 * slots full-envelope equality compares. Lets the binding verifier bridge
 * the concrete Runtime evidence envelopes to the compatibility-verified
 * material closure without widening either type.
 */
interface DacV0041MaterialExactnessEnvelope {
  readonly role: string;
  readonly authorityScope: string;
  readonly primaryIdentity: string;
  readonly semanticIdentity?: string;
  readonly revisionIdentity?: string;
  readonly contentDigest?: string;
  readonly contractProfileIdentity?: string;
}

/** First material-exactness field in which two reference envelopes diverge. */
function envelopeDivergenceField(
  a: DacV0041MaterialExactnessEnvelope,
  b: DacV0041MaterialExactnessEnvelope,
): DacV0041EnvelopeMaterialField | null {
  for (const field of [
    'role',
    'authorityScope',
    'primaryIdentity',
    'semanticIdentity',
    'revisionIdentity',
    'contentDigest',
    'contractProfileIdentity',
  ] as const) {
    if (a[field] !== b[field]) {
      return field;
    }
  }
  return null;
}

/**
 * C128-family two-party issuance-evidence rule for a Runtime authority act:
 * the evidence must carry at least one independent attestor and MUST NOT
 * be asserted solely by the act's own issuer.
 */
function runtimeActEvidenceEstablished(
  evidence: DacV0041IssuancePointEvidence,
  issuerIdentity: string,
): boolean {
  if (evidence.assertedBy.length === 0) return false;
  return evidence.assertedBy.some((attestor) => attestor !== issuerIdentity);
}

/**
 * F-07 / N-003 SoD classification for one Runtime authority-bearing
 * decision (ASSEMBLY_PROFILES §15; C148/C149/C169). Deterministic:
 * same-identity self-approval fails closed first and can never be cured
 * by permission (§15.2); a co-hosted subject-contributing arrangement then
 * requires BOTH explicit SoD permission and disclosed provenance. An
 * upstream authority-bearing result consumed under its own valid
 * designation is NOT subject-contributing (C169) — the caller expresses
 * that by simply not listing the upstream authority issuer among
 * `subjectContributingIdentities`.
 */
function classifyRuntimeSod(
  issuerIdentity: string,
  sod: DacV0041RuntimeSodFacts,
  label: string,
):
  | {
      readonly code: 'SELF_APPROVAL' | 'SOD_PERMISSION_MISSING' | 'COLOCATION_UNDISCLOSED';
      readonly detail: string;
    }
  | null {
  if (sod.subjectContributingIdentities.indexOf(issuerIdentity) !== -1) {
    return {
      code: 'SELF_APPROVAL',
      detail: `${label} issuer "${issuerIdentity}" is itself a subject-contributing identity for this decision; an authority-bearing decision issuer must differ from every non-authority subject-contributing identity, and no explicit co-hosting permission can cure the same-identity rule (ASSEMBLY_PROFILES §15.2; C148)`,
    };
  }
  const coHostedWithContributor = sod.coHostingGroups.some(
    (group) =>
      group.indexOf(issuerIdentity) !== -1 &&
      sod.subjectContributingIdentities.some(
        (contributor) => group.indexOf(contributor) !== -1,
      ),
  );
  if (!coHostedWithContributor) return null;
  if (!sod.explicitSodPermissionEstablished) {
    return {
      code: 'SOD_PERMISSION_MISSING',
      detail: `${label} issuer "${issuerIdentity}" is co-hosted with a subject-contributing identity without an explicit SoD/co-location permission in its valid designation; authoritative use requires the permission (ASSEMBLY_PROFILES §15.2; C149)`,
    };
  }
  if (!sod.coLocationDisclosed) {
    return {
      code: 'COLOCATION_UNDISCLOSED',
      detail: `${label} issuer "${issuerIdentity}" is co-hosted with a subject-contributing identity but the decision provenance does not disclose the material co-location; authoritative use requires the disclosure (ASSEMBLY_PROFILES §15.2; C149)`,
    };
  }
  return null;
}

/**
 * One issuer designation-chain check at the act's evidenced issuance point
 * (leaf-first A41-002 walk). C100/C113/C154: a Composer-role designator, a
 * non-designated issuer or a leaf that does not carry the exact asserted
 * issuer/role/scope/profile never authorizes the act. Returns a neutral
 * failure descriptor; each seam constructs its own typed terminal result
 * so the binding and activation code vocabularies stay closed.
 */
type RuntimeIssuerChainFailure =
  | {
      readonly severity: 'FAIL';
      readonly detail: string;
      readonly chainCode?: DacV0041DesignationChainFailureCode;
    }
  | { readonly severity: 'STALE'; readonly detail: string };

function checkRuntimeIssuerChain(check: {
  readonly issuer: DacV0041RuntimeIssuerFacts;
  readonly issuancePoint: DacV0041TimePoint;
  readonly scope: string;
  readonly profile: string;
  readonly label: string;
}): RuntimeIssuerChainFailure | null {
  const chainResult = verifyDacV0041DesignationChain({
    ...check.issuer.issuerDesignationChain,
    evaluationPoint: check.issuancePoint,
  });
  if (chainResult.outcome === 'FAIL_CLOSED') {
    return {
      severity: 'FAIL',
      detail: `${check.label}: issuer designation chain failed (${chainResult.code}: ${chainResult.detail})`,
      chainCode: chainResult.code,
    };
  }
  if (chainResult.outcome === 'STALE') {
    return {
      severity: 'STALE',
      detail: `${check.label}: issuer designation chain was not current at the evidenced issuance point (${chainResult.reason} on ${chainResult.lapsedLinkIdentity})`,
    };
  }
  // Exact leaf binding: the A41-002 chain walk is leaf-first, so the LEAF
  // is element 0.
  const leafIdentity = chainResult.chainLinkIdentities[0];
  const leaf = check.issuer.issuerDesignationChain.links.find(
    (link) => link.linkIdentity === leafIdentity,
  );
  if (
    leaf === undefined ||
    leaf.designatedIssuerIdentity !== check.issuer.issuerIdentity ||
    leaf.authorityRole !== check.issuer.requiredIssuingRole ||
    leaf.authorityScope !== check.scope ||
    leaf.dacProfileIdentity !== check.profile
  ) {
    return {
      severity: 'FAIL',
      detail: `${check.label}: presented issuer/role/scope/profile does not match the chain-current leaf designation`,
    };
  }
  return null;
}

/**
 * ASSEMBLY_PROFILES §§8.2–8.3 current authoritative reuse classification
 * for one material Runtime artifact (implementation / Host Binding / the
 * bound RuntimeBindingRef itself). Deterministic precedence mirroring the
 * A41-003/-004 reuse rules: an undecidable state, a determination
 * predating the artifact's own issuance, or an evaluation point predating
 * the artifact's own issuance are malformed facts (FAIL_CLOSED
 * INVALID_FACTS); explicit revocation/void FAIL CLOSED for the new
 * authoritative use; ordinary stale/superseded states and determinations
 * that do not cover the evaluation point are STALE; `current` passes only
 * when established at/after the evaluation point.
 */
function classifyRuntimeReuseCurrentness(
  currentness: DacV0041ReuseCurrentnessFacts,
  artifactIssuancePoint: DacV0041TimePoint,
  evaluationPoint: DacV0041TimePoint,
  label: string,
):
  | {
      readonly severity: 'INVALID' | 'FAIL_CLOSED' | 'STALE';
      readonly detail: string;
    }
  | null {
  const states = [
    'current',
    'stale',
    'superseded',
    'revoked',
    'voided',
  ] as const;
  if ((states as readonly string[]).indexOf(currentness.state) === -1) {
    return {
      severity: 'INVALID',
      detail: `${label} reuse-currentness state "${currentness.state}" is not a decidable Runtime-seam currentness state; undecidable currentness fails closed`,
    };
  }
  if (currentness.establishedAt < artifactIssuancePoint) {
    return {
      severity: 'INVALID',
      detail: `${label} reuse-currentness determination predates the artifact's own issuance point; a determination for a not-yet-issued artifact is malformed provenance`,
    };
  }
  if (evaluationPoint < artifactIssuancePoint) {
    return {
      severity: 'INVALID',
      detail: `${label} intended use/evaluation point ${evaluationPoint} predates the artifact's own issuance point ${artifactIssuancePoint}; the artifact did not exist at the claimed use point, so it can never be current there (ASSEMBLY_PROFILES §8.2)`,
    };
  }
  if (currentness.state === 'revoked' || currentness.state === 'voided') {
    return {
      severity: 'FAIL_CLOSED',
      detail: `${label} is ${currentness.state} for new authoritative use; an explicitly invalidated artifact fails closed even though its historical record stays immutable (ASSEMBLY_PROFILES §8.3)`,
    };
  }
  if (currentness.state === 'stale' || currentness.state === 'superseded') {
    return {
      severity: 'STALE',
      detail: `${label} is ${currentness.state}; non-current artifacts are stale for authoritative Runtime use (ASSEMBLY_PROFILES §8.2)`,
    };
  }
  if (currentness.establishedAt < evaluationPoint) {
    return {
      severity: 'STALE',
      detail: `${label} currentness determination (at ${currentness.establishedAt}) does not cover the intended use/evaluation point ${evaluationPoint}; the determination must be established at or after the evaluation point`,
    };
  }
  return null;
}

/**
 * Deterministic Runtime binding verification (ASSEMBLY_LIFECYCLE §12).
 * Pure, total and fail-closed over externally owned evidence: composes
 * the A41-003 compatibility view-association/precedence gates and the
 * A41-004 composition-intake gate with the A41-002 designation-chain walk
 * and the A41-001 foundation guards — without issuing or re-deciding any
 * upstream authority. The frozen precedence ladder is documented on
 * {@link DacV0041RuntimeBindingVerification}; `BINDING_VERIFIED` implies
 * no activation, no selection, no compatibility authority and no external
 * Business SoR truth (C107; §17).
 */
export function verifyDacV0041RuntimeBinding(
  input: DacV0041RuntimeBindingVerificationInput,
): DacV0041RuntimeBindingVerification {
  // Rung 1: shape.
  if (!isRuntimeBindingInput(input)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'runtime binding verification input is malformed; every fact must be an externally recoverable, structurally valid value',
    };
  }

  const request = input.bindingRequestRef;
  const bindingResult = input.bindingResultRef;
  const compatibilityRequest = input.compatibility.requestRef;
  const hostBindings = input.hostBindingEvidence ?? [];
  const implementation = input.implementationEvidence;
  const implementationRef = implementation === undefined ? undefined : implementation.artifactRef;
  const hostRefs = hostBindings.map((host) => host.artifactRef);
  const mintedHostRefs: DacV0041Reference[] = [];

  // Rung 2: minted carriers (forgery fails closed, never guessed).
  if (!isRuntimeBindingRequestRef(request)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'bindingRequestRef must be a RuntimeBindingRequestRef minted by the DAC v0.0.4.1 foundation core (C108 nominal constructor; foreign/forged carriers fail closed)',
    };
  }
  if (!isDacV0041Reference(bindingResult)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'bindingResultRef must be a reference minted by the DAC v0.0.4.1 adoption core (foreign/forged carriers fail closed)',
    };
  }
  if (!isCompatibilityValidationRequestRef(compatibilityRequest)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'compatibility.requestRef must be a CompatibilityValidationRequestRef minted by the DAC v0.0.4.1 foundation core (C89 nominal constructor; foreign/forged carriers fail closed)',
    };
  }
  if (implementationRef !== undefined && !isDacV0041Reference(implementationRef)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'implementationEvidence.artifactRef must be a reference minted by the DAC v0.0.4.1 adoption core',
    };
  }
  for (const hostRef of hostRefs) {
    if (!isDacV0041Reference(hostRef)) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'FOREIGN_EVIDENCE',
        detail: 'each hostBindingEvidence.artifactRef must be a reference minted by the DAC v0.0.4.1 adoption core',
      };
    }
    mintedHostRefs.push(hostRef);
  }

  // Rung 3: evidence roles (a request or another seam's result can never
  // occupy the binding-result position; §12 RuntimeHostBindingRef !=
  // RuntimeBindingRef).
  if (bindingResult.role !== 'runtime-binding') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'ROLE_MISMATCH',
      detail: `bindingResultRef must carry role "runtime-binding" (got "${String(bindingResult.role)}")`,
    };
  }
  if (implementationRef !== undefined && implementationRef.role !== 'runtime-implementation') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'ROLE_MISMATCH',
      detail: `implementationEvidence.artifactRef must carry role "runtime-implementation" (got "${String(implementationRef.role)}")`,
    };
  }
  for (const hostRef of mintedHostRefs) {
    if (hostRef.role !== 'runtime-host-binding') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'ROLE_MISMATCH',
        detail: `each hostBindingEvidence.artifactRef must carry role "runtime-host-binding" (got "${String(hostRef.role)}")`,
      };
    }
  }

  // Rung 4: C108 request/result anti-alias inside the frozen binding seam
  // chain (request != runtime-binding != runtime-host-binding), consumed
  // from the A41-001 foundation verifier.
  try {
    verifyDacV0041RequestResultSeparation(request, [
      bindingResult,
      ...mintedHostRefs,
    ]);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'REQUEST_RESULT_ALIAS') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'REQUEST_RESULT_ALIAS',
        detail: (error as Error).message,
      };
    }
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `request/result separation could not be established for the binding seam: ${(error as Error).message}`,
    };
  }

  // Rung 5: seam identity anti-alias across every material Runtime-seam
  // identity, including the §3.1 cross-seam rulings (a compatibility
  // request/validation/result identity can never alias the binding seam
  // identities; §12 CompatibilityValidationRef != RuntimeBindingRef).
  const aliasSlots: readonly IdentitySlot[] = [
    { label: 'runtime-binding-request', identity: request.primaryIdentity },
    { label: 'runtime-binding', identity: bindingResult.primaryIdentity },
    ...mintedHostRefs.map((hostRef, index) => ({
      label: `runtime-host-binding[${index}]`,
      identity: hostRef.primaryIdentity,
    })),
    ...(implementationRef === undefined
      ? []
      : [
          {
            label: 'runtime-implementation',
            identity: implementationRef.primaryIdentity,
          },
        ]),
    {
      label: 'compatibility-validation-request',
      identity: compatibilityRequest.primaryIdentity,
    },
    {
      label: 'compatibility-validation',
      identity: input.compatibility.validationView.validationViewIdentity,
    },
    {
      label: 'compatibility-result',
      identity: input.compatibility.resultView.resultViewIdentity,
    },
  ];
  const aliasCollision = distinctIdentities(aliasSlots);
  if (aliasCollision !== null) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SEAM_IDENTITY_ALIAS',
      detail: aliasCollision.detail,
    };
  }

  // Rung 6: exact request association — the binding answers exactly the
  // presented request identity (never a different or implicit request).
  if (input.boundRequestIdentity !== request.primaryIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REQUEST_ASSOCIATION_MISMATCH',
      detail: `the binding binds request identity "${input.boundRequestIdentity}" but the presented RuntimeBindingRequestRef carries "${request.primaryIdentity}"; a binding result must bind exactly its presented request`,
    };
  }

  // Rung 7: C144 two-view association of the relied compatibility evidence
  // (A41-003 consumption; carries the association code on failure).
  const association = verifyDacV0041CompatibilityViewAssociation({
    requestRef: compatibilityRequest,
    validationView: input.compatibility.validationView,
    resultView: input.compatibility.resultView,
  });
  if (association.outcome === 'FAIL_CLOSED') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'COMPATIBILITY_ASSOCIATION_INVALID',
      detail: `the relied compatibility evidence does not verify as one two-view validation authority (${association.code}: ${association.detail})`,
      associationCode: association.code,
    };
  }

  // Rung 8: compatibility precedence (C107): only a COMPATIBLE_VERDICT —
  // itself implying nothing about binding — can back the binding claim.
  const precedence = classifyDacV0041CompatibilityPrecedence(
    input.compatibility.precedenceFacts,
  );
  if (precedence.outcome === 'STALE') {
    return {
      outcome: 'STALE',
      code: 'COMPATIBILITY_STALE',
      detail: `the relied compatibility evidence is not current at binding time (${precedence.detail})`,
    };
  }
  if (precedence.outcome !== 'COMPATIBLE_VERDICT') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'COMPATIBILITY_NOT_ESTABLISHED',
      detail: `a Runtime binding requires a current valid COMPATIBLE_VERDICT for the exact subject (got precedence outcome "${precedence.outcome}"; compatibility PASS is necessary and still not a binding — C107)`,
      precedenceOutcome: precedence.outcome,
    };
  }
  // The presented result view must itself be part of the evidence set that
  // produced the verdict — a binding may not lean on a favorable verdict
  // while presenting a different, unbacked result view.
  const presentedResultBacked = input.compatibility.precedenceFacts.authoritativeResults.some(
    (result) =>
      result.resultViewIdentity === input.compatibility.resultView.resultViewIdentity,
  );
  if (!presentedResultBacked) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'COMPATIBILITY_NOT_ESTABLISHED',
      detail: 'the presented compatibility result view is not part of the authoritative evidence set that produced the COMPATIBLE_VERDICT; a binding cannot rely on an unbacked result view',
      precedenceOutcome: precedence.outcome,
    };
  }

  // Rung 9: composition intake (A41-004 consumption; carries the intake
  // code; the upstream establishment/selection/Manifest evidence stays
  // externally owned and is never re-issued here).
  const intake = verifyDacV0041CompositionIntake(input.compositionIntake);
  if (intake.outcome === 'FAIL_CLOSED') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'COMPOSITION_INTAKE_INVALID',
      detail: `the composition-intake evidence backing the binding did not verify (${intake.code}: ${intake.detail})`,
      intakeCode: intake.code,
    };
  }
  if (intake.outcome === 'STALE') {
    return {
      outcome: 'STALE',
      code: 'COMPOSITION_INTAKE_STALE',
      detail: `the composition-intake evidence backing the binding is not current (${intake.code}: ${intake.detail})`,
    };
  }

  // Rung 10: exact scope/profile/subject matching (exact-token only).
  const intakeScope = input.compositionIntake.applicationIdentityEstablishment.applicationScope;
  const intakeProfile =
    input.compositionIntake.applicationIdentityEstablishment.dacProfileIdentity;
  const intakeManifestIdentity =
    input.compositionIntake.manifest.manifestRef.primaryIdentity;
  const intakeManifestDigest =
    input.compositionIntake.manifest.manifestContentDigestRef.primaryIdentity;
  const compatibilitySubject = input.compatibility.resultView.subject;
  if (input.subject.manifestIdentity !== intakeManifestIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `binding subject Manifest identity "${input.subject.manifestIdentity}" does not equal the intake-verified Manifest identity "${intakeManifestIdentity}"`,
    };
  }
  if (input.subject.manifestContentDigest !== intakeManifestDigest) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `binding subject Manifest content digest "${input.subject.manifestContentDigest}" does not equal the intake-verified Manifest digest "${intakeManifestDigest}"`,
    };
  }
  if (input.subject.manifestIdentity !== compatibilitySubject.manifestIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `binding subject Manifest identity "${input.subject.manifestIdentity}" does not equal the compatibility-validated subject Manifest identity "${compatibilitySubject.manifestIdentity}"`,
    };
  }
  if (input.subject.manifestContentDigest !== compatibilitySubject.manifestContentDigest) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `binding subject Manifest content digest "${input.subject.manifestContentDigest}" does not equal the compatibility-validated subject digest "${compatibilitySubject.manifestContentDigest}"`,
    };
  }
  if (input.subject.dacProfileIdentity !== intakeProfile) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'PROFILE_MISMATCH',
      detail: `binding subject DAC/reference profile "${input.subject.dacProfileIdentity}" does not equal the intake evidence profile "${intakeProfile}"`,
    };
  }
  if (input.subject.dacProfileIdentity !== compatibilitySubject.dacProfileIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'PROFILE_MISMATCH',
      detail: `binding subject DAC/reference profile "${input.subject.dacProfileIdentity}" does not equal the compatibility subject profile "${compatibilitySubject.dacProfileIdentity}"`,
    };
  }
  // §10/§11 implementation-exactness closure: an implementation-specific
  // binding claim must be backed by implementation-specific compatibility
  // evidence binding the SAME exact implementation/Host Binding material —
  // primary identity AND the full material envelope the compatibility
  // authority validated in the subject's §8 materialManifestRefs closure;
  // a later concrete choice never retroactively strengthens an earlier
  // abstract compatibility result, and a same-primary envelope drift never
  // transposes compatibility authority onto unvalidated material.
  const compatibilityImplementation = compatibilitySubject.runtimeImplementationIdentity;
  if (compatibilityImplementation !== undefined) {
    if (implementationRef === undefined) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the compatibility subject is implementation-specific ("${compatibilityImplementation}") but the binding carries no exact Runtime implementation evidence; an implementation-specific claim must bind the concrete exact refs (ASSEMBLY_CAPABILITY_EXCHANGE §10)`,
      };
    }
    if (implementationRef.primaryIdentity !== compatibilityImplementation) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `binding Runtime implementation evidence "${implementationRef.primaryIdentity}" does not equal the compatibility-validated implementation "${compatibilityImplementation}"`,
      };
    }
    // R2 P1 closure (APPLICATION_MANIFEST §8; ASSEMBLY_CAPABILITY_EXCHANGE
    // §10): the implementation exactness the compatibility authority
    // validated is the subject's VERIFIED §8 materialManifestRefs closure
    // entry, and the concrete evidence the binding binds must equal that
    // entry on EVERY material-exactness slot — never primary identity
    // alone. Without this bridge a coherent same-primary envelope A→B
    // substitution (compatibility validates envelope A while the binding
    // request and presented evidence both carry envelope B) would transpose
    // upstream compatibility authority onto material that was never
    // compatibility-validated.
    const subjectImplementationEntries =
      compatibilitySubject.materialManifestRefs.filter(
        (entry) => entry.role === 'runtime-implementation',
      );
    if (subjectImplementationEntries.length !== 1) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the compatibility subject claims implementation "${compatibilityImplementation}" but its verified §8 material closure carries ${subjectImplementationEntries.length} "runtime-implementation" material ref(s); the exact compatibility-validated implementation envelope cannot be established`,
      };
    }
    const subjectImplementationEntry = subjectImplementationEntries[0]!;
    const implementationDivergence = envelopeDivergenceField(
      subjectImplementationEntry,
      implementationRef,
    );
    if (implementationDivergence !== null) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the binding's Runtime implementation evidence ("${implementationRef.primaryIdentity}") diverges from the compatibility-validated material closure on ${implementationDivergence} (binding evidence "${String(implementationRef[implementationDivergence])}" vs compatibility material "${String(subjectImplementationEntry[implementationDivergence])}"); a binding may bind only the EXACT material the compatibility authority validated — a same-primary envelope drift can never transpose upstream compatibility authority onto unvalidated material (APPLICATION_MANIFEST §8; ASSEMBLY_CAPABILITY_EXCHANGE §10)`,
      };
    }
  } else if (implementationRef !== undefined) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the binding presents Runtime implementation evidence ("${implementationRef.primaryIdentity}") on top of an abstract compatibility subject; a later concrete implementation choice must not retroactively strengthen an earlier abstract compatibility result (ASSEMBLY_CAPABILITY_EXCHANGE §10; issue a new implementation-specific validation instead)`,
    };
  }
  const compatibilityHostBinding = compatibilitySubject.runtimeHostBindingIdentity;
  if (compatibilityHostBinding !== undefined) {
    const matchingHost = mintedHostRefs.find(
      (hostRef) => hostRef.primaryIdentity === compatibilityHostBinding,
    );
    if (matchingHost === undefined) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the compatibility subject binds Host Binding "${compatibilityHostBinding}" but the binding carries no matching exact Host Binding evidence`,
      };
    }
    if (mintedHostRefs.length !== 1) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the binding carries ${mintedHostRefs.length} Host Binding artifacts while the compatibility subject binds exactly one ("${compatibilityHostBinding}"); material the compatibility subject did not cover cannot join the bound composition`,
      };
    }
    // R2 P1 closure (same bridge as the implementation slot): the Host
    // Binding material exactness the compatibility authority validated is
    // the subject's VERIFIED §8 materialManifestRefs closure entry; the
    // presented concrete Host Binding evidence must equal that entry on
    // every material-exactness slot, so a coherent same-primary envelope
    // A→B drift fails closed here too.
    const subjectHostEntries = compatibilitySubject.materialManifestRefs.filter(
      (entry) => entry.role === 'runtime-host-binding',
    );
    if (subjectHostEntries.length !== 1) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the compatibility subject binds Host Binding "${compatibilityHostBinding}" but its verified §8 material closure carries ${subjectHostEntries.length} "runtime-host-binding" material ref(s); the exact compatibility-validated Host Binding envelope cannot be established`,
      };
    }
    const subjectHostEntry = subjectHostEntries[0]!;
    const hostDivergence = envelopeDivergenceField(subjectHostEntry, matchingHost);
    if (hostDivergence !== null) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the binding's Host Binding evidence ("${matchingHost.primaryIdentity}") diverges from the compatibility-validated material closure on ${hostDivergence} (binding evidence "${String(matchingHost[hostDivergence])}" vs compatibility material "${String(subjectHostEntry[hostDivergence])}"); a binding may bind only the EXACT material the compatibility authority validated — a same-primary envelope drift can never transpose upstream compatibility authority onto unvalidated material (APPLICATION_MANIFEST §8; ASSEMBLY_CAPABILITY_EXCHANGE §10)`,
      };
    }
  } else if (mintedHostRefs.length > 0) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the binding presents ${hostBindings.length} Host Binding artifact(s) on top of a compatibility subject that binds no Host Binding material; a later concrete Host Binding choice must not retroactively strengthen an earlier abstract compatibility result (ASSEMBLY_CAPABILITY_EXCHANGE §10)`,
    };
  }

  // Rung 10 (closed, §3.1): the presented RuntimeBindingRequestRef itself
  // must close exactly over the bound facts — envelope scope/profile, the
  // §4.1 binding explicit target/profile, and the complete material input
  // set (exact Manifest identity+digest plus the FULL exact Runtime
  // implementation/Host Binding envelopes when material). Primary identity
  // association alone (checked at rung 6) never suffices; a minted request
  // with the expected identity but a foreign scope, target, profile or
  // material set fails closed.
  if (request.authorityScope !== intakeScope) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SCOPE_MISMATCH',
      detail: `the binding request's authority scope "${request.authorityScope}" does not equal the intake-verified application scope "${intakeScope}"; the request must close exactly over the authority scope of the composition it binds (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  if (request.contractProfileIdentity !== input.subject.dacProfileIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'PROFILE_MISMATCH',
      detail: `the binding request's DAC/reference profile "${String(request.contractProfileIdentity)}" does not equal the bound DAC/reference profile "${input.subject.dacProfileIdentity}"; the request must close exactly over the profile of the composition it binds (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  const subjectTarget = compatibilitySubject.targetIdentities[0];
  if (
    request.bindingTargetRef === undefined ||
    request.bindingTargetRef.role !== 'compatibility-target' ||
    request.bindingTargetRef.primaryIdentity !== subjectTarget
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the binding request's §4.1 binding explicit target (${request.bindingTargetRef === undefined ? 'absent' : `"${request.bindingTargetRef.primaryIdentity}"`}) does not equal the exact compatibility target "${String(subjectTarget)}" the subject validated; the request must bind the exact target it binds the composition to, never an advisory hint (ASSEMBLY_CAPABILITY_EXCHANGE §4.1; CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  if (
    request.bindingTargetRef.contractProfileIdentity !==
    compatibilitySubject.requirementsProfileIdentity
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'PROFILE_MISMATCH',
      detail: `the binding request's target requirements/check profile "${String(request.bindingTargetRef.contractProfileIdentity)}" does not equal the compatibility-validated requirements profile "${compatibilitySubject.requirementsProfileIdentity}"; the request must close exactly over the exact target/profile the compatibility evidence established (ASSEMBLY_CAPABILITY_EXCHANGE §4.1)`,
    };
  }
  const materialByRole = (role: string) =>
    request.materialInputRefs.filter((material) => material.role === role);
  const requestManifestInputs = materialByRole('manifest');
  const requestImplementationInputs = materialByRole('runtime-implementation');
  const requestHostInputs = materialByRole('runtime-host-binding');
  if (requestManifestInputs.length !== 1) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the binding request carries ${requestManifestInputs.length} "manifest" material input(s); §3.1 requires exactly the one exact Manifest (identity + content digest) the binding binds`,
    };
  }
  const requestManifest = requestManifestInputs[0]!;
  if (requestManifest.primaryIdentity !== input.subject.manifestIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the binding request's manifest material input "${requestManifest.primaryIdentity}" does not equal the bound Manifest identity "${input.subject.manifestIdentity}"`,
    };
  }
  if (requestManifest.contentDigest !== input.subject.manifestContentDigest) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the binding request's manifest material input carries content digest "${String(requestManifest.contentDigest)}" instead of the bound Manifest content digest "${input.subject.manifestContentDigest}"; the request must bind the exact digest, not the identity alone`,
    };
  }
  const expectedImplementationCount = implementationRef === undefined ? 0 : 1;
  if (requestImplementationInputs.length !== expectedImplementationCount) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the binding request carries ${requestImplementationInputs.length} "runtime-implementation" material input(s) while the binding ${implementationRef === undefined ? 'presents no' : 'presents exactly one'} Runtime implementation artifact; the request material set must close exactly over the bound material (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  if (implementationRef !== undefined) {
    const divergence = envelopeDivergenceField(requestImplementationInputs[0]!, implementationRef);
    if (divergence !== null) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the binding request's runtime-implementation material input diverges from the presented Runtime implementation evidence on ${divergence} (request "${String(requestImplementationInputs[0]![divergence])}" vs evidence "${String(implementationRef[divergence])}"); the exact reference material must be identical on both sides, never primary identity alone (ASSEMBLY_CAPABILITY_EXCHANGE §10)`,
      };
    }
  }
  if (requestHostInputs.length !== mintedHostRefs.length) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the binding request carries ${requestHostInputs.length} "runtime-host-binding" material input(s) while the binding presents ${mintedHostRefs.length} Host Binding artifact(s); the request material set must close exactly over the bound material (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  for (const hostRef of mintedHostRefs) {
    const requestHostInput = requestHostInputs.find(
      (material) => material.primaryIdentity === hostRef.primaryIdentity,
    );
    if (requestHostInput === undefined) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the binding request carries no runtime-host-binding material input for the presented Host Binding evidence "${hostRef.primaryIdentity}"; wrong/missing material reference fails closed (CROSS_LAYER_REFERENCES §3.1)`,
      };
    }
    const divergence = envelopeDivergenceField(requestHostInput, hostRef);
    if (divergence !== null) {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'SUBJECT_MISMATCH',
        detail: `the binding request's runtime-host-binding material input for "${hostRef.primaryIdentity}" diverges from the presented Host Binding evidence on ${divergence} (request "${String(requestHostInput[divergence])}" vs evidence "${String(hostRef[divergence])}"); the exact reference material must be identical on both sides, never primary identity alone (ASSEMBLY_CAPABILITY_EXCHANGE §10)`,
      };
    }
  }
  const expectedMaterialCount =
    1 + expectedImplementationCount + mintedHostRefs.length;
  if (request.materialInputRefs.length !== expectedMaterialCount) {
    const extra = request.materialInputRefs.find((material) => {
      const role = material.role;
      return (
        role !== 'manifest' &&
        role !== 'runtime-implementation' &&
        role !== 'runtime-host-binding'
      );
    });
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: extra === undefined
        ? `the binding request carries ${request.materialInputRefs.length} material input(s) instead of the exact ${expectedMaterialCount} bound material input(s); the material set must close exactly (CROSS_LAYER_REFERENCES §3.1)`
        : `the binding request carries a material input of role "${extra.role}" ("${extra.primaryIdentity}") that is not part of the exact bound material set; material the binding does not cover cannot join the bound composition (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }

  // Rung 11: the binding act's own issuance evidence (C128 family: never
  // asserted solely by the binding issuer) and temporal sanity of the
  // evaluation point.
  if (
    !runtimeActEvidenceEstablished(
      input.bindingIssuanceEvidence,
      input.bindingIssuer.issuerIdentity,
    )
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'EVIDENCE_UNESTABLISHED',
      detail: 'the binding issuance point has no independent attestor; a Runtime binding act must be independently recoverable and never asserted solely by its own issuer',
    };
  }
  if (input.evaluationPoint < input.bindingIssuanceEvidence.point) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `binding evaluation point ${input.evaluationPoint} predates the binding's own evidenced issuance point ${input.bindingIssuanceEvidence.point}; the binding did not exist at the claimed verification point`,
    };
  }

  // Rung 12: binding issuer designation chain at the evidenced issuance
  // point, then the exact leaf issuer/role/scope/profile binding. The
  // issuing role is SEAM-FIXED: the binding seam requires exactly
  // "runtime-binding" independently of (and before) the chain comparison,
  // so a caller-supplied role token — even one coherently matched by the
  // chain-current leaf designation — can never substitute the seam's
  // issuing authority (§§12/§16; C154). The same identity MAY still hold
  // other separately designated roles (C169): only the role occupying the
  // binding-issuer position is fixed.
  if (input.bindingIssuer.requiredIssuingRole !== DAC_V0041_RUNTIME_BINDING_ISSUER_SEAM_ROLE) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'UNAUTHORIZED_BINDING_ISSUER',
      detail: `the Runtime binding seam requires the seam-fixed issuing role "${DAC_V0041_RUNTIME_BINDING_ISSUER_SEAM_ROLE}" (got caller-supplied "${input.bindingIssuer.requiredIssuingRole}"); a caller-controlled role token — even one coherently matched by the chain-current leaf — can never define the binding seam's issuing authority (ASSEMBLY_LIFECYCLE §§12,16; C154)`,
    };
  }
  const chainFailure = checkRuntimeIssuerChain({
    issuer: input.bindingIssuer,
    issuancePoint: input.bindingIssuanceEvidence.point,
    scope: intakeScope,
    profile: input.subject.dacProfileIdentity,
    label: 'runtime-binding',
  });
  if (chainFailure !== null) {
    if (chainFailure.severity === 'FAIL') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'UNAUTHORIZED_BINDING_ISSUER',
        detail: chainFailure.detail,
        ...(chainFailure.chainCode === undefined ? {} : { chainCode: chainFailure.chainCode }),
      };
    }
    return { outcome: 'STALE', code: 'ISSUER_CHAIN_STALE', detail: chainFailure.detail };
  }

  // Rung 13: F-07 SoD for the binding decision (C148/C149/C169).
  const sodFailure = classifyRuntimeSod(
    input.bindingIssuer.issuerIdentity,
    input.sod,
    'runtime-binding',
  );
  if (sodFailure !== null) {
    return {
      outcome: 'FAIL_CLOSED',
      code: sodFailure.code,
      detail: sodFailure.detail,
    };
  }

  // Rung 14: binding-time currentness of every relied material input
  // (§14): the compatibility result view itself plus each material
  // implementation/Host Binding artifact under §8.2 reuse.
  try {
    const currentness = classifyDacV0041CurrentnessUse(
      input.compatibility.resultView.currentness,
    );
    if (currentness.state === 'revoked' || currentness.state === 'voided') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'RELIED_INPUT_INVALIDATED',
        detail: `the relied compatibility result view is ${currentness.state} for new authoritative use; binding-time currentness cannot be skipped (ASSEMBLY_LIFECYCLE §14; C157)`,
      };
    }
    if (currentness.state === 'stale' || currentness.state === 'superseded') {
      return {
        outcome: 'STALE',
        code: 'RELIED_INPUT_NOT_CURRENT',
        detail: `the relied compatibility result view is ${currentness.state} at binding time (ASSEMBLY_LIFECYCLE §14; C157)`,
      };
    }
  } catch (error) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `the relied compatibility result view carries an undecidable currentness state: ${(error as Error).message}`,
    };
  }
  const materialArtifacts: readonly (readonly [string, DacV0041RuntimeMaterialArtifactFacts])[] = [
    ...(implementation === undefined
      ? []
      : [['runtime-implementation', implementation] as const]),
    ...hostBindings.map(
      (host, index) => [`runtime-host-binding[${index}]`, host] as const,
    ),
  ];
  for (const [label, artifact] of materialArtifacts) {
    const reuseFailure = classifyRuntimeReuseCurrentness(
      artifact.reuseCurrentness,
      artifact.issuancePoint,
      input.evaluationPoint,
      label,
    );
    if (reuseFailure === null) continue;
    if (reuseFailure.severity === 'INVALID') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'INVALID_FACTS',
        detail: reuseFailure.detail,
      };
    }
    if (reuseFailure.severity === 'FAIL_CLOSED') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'RELIED_INPUT_INVALIDATED',
        detail: reuseFailure.detail,
      };
    }
    return {
      outcome: 'STALE',
      code: 'RELIED_INPUT_NOT_CURRENT',
      detail: reuseFailure.detail,
    };
  }

  // Rung 15: verified — authorized and current ONLY. No activation, no
  // selection, no compatibility authority, no external Business SoR truth.
  return {
    outcome: 'BINDING_VERIFIED',
    requestIdentity: request.primaryIdentity,
    bindingIdentity: bindingResult.primaryIdentity,
    manifestIdentity: input.subject.manifestIdentity,
    manifestContentDigest: input.subject.manifestContentDigest,
    bindingIssuerIdentity: input.bindingIssuer.issuerIdentity,
    compatibilityResultViewIdentity: input.compatibility.resultView.resultViewIdentity,
    impliesRuntimeActivation: false,
    impliesApplicationSelection: false,
    isExternalBusinessSorTruth: false,
    detail: 'the externally owned Runtime binding evidence verifies as authorized and current for the exact composition/compatibility subject; compatibility PASS remains distinct from binding and binding implies no activation, no selection and no external Business SoR truth (C107; ASSEMBLY_LIFECYCLE §§12, 17)',
  };
}

/**
 * Deterministic Runtime activation verification (ASSEMBLY_LIFECYCLE §13).
 * Pure, total and fail-closed: re-verifies the COMPLETE binding evidence
 * bundle at the activation point, checks the separate technical-admission
 * seam (distinct issuing role; own designation; own independently
 * recoverable issuance evidence) and requires the bound RuntimeBindingRef
 * to be CURRENT at activation. `ACTIVATION_VERIFIED` manufactures no
 * upstream promotion/selection/Manifest/compatibility authority and owns
 * no external Business SoR truth.
 */
export function verifyDacV0041RuntimeActivation(
  input: DacV0041RuntimeActivationVerificationInput,
): DacV0041RuntimeActivationVerification {
  // Rung 1: shape (includes the full binding bundle shape).
  if (!isRuntimeActivationInput(input)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'runtime activation verification input is malformed; every fact must be an externally recoverable, structurally valid value',
    };
  }

  const activationRequest = input.activationRequestRef;
  const activationResult = input.activationResultRef;
  const bindingRequest = input.binding.bindingRequestRef;
  const bindingResult = input.binding.bindingResultRef;

  // Rung 2: minted carriers (the bound binding bundle's own carriers are
  // minted-checked by the binding verifier at rung 7 below).
  if (!isDacV0041Reference(activationRequest)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'activationRequestRef must be a reference minted by the DAC v0.0.4.1 adoption core (foreign/forged carriers fail closed)',
    };
  }
  if (!isDacV0041Reference(activationResult)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'activationResultRef must be a reference minted by the DAC v0.0.4.1 adoption core (foreign/forged carriers fail closed)',
    };
  }
  if (!isRuntimeBindingRequestRef(bindingRequest) || !isDacV0041Reference(bindingResult)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'FOREIGN_EVIDENCE',
      detail: 'the bound binding bundle carries a foreign/forged request or result carrier; only references minted by the DAC v0.0.4.1 core can bind',
    };
  }

  // Rung 3: evidence roles.
  if (activationRequest.role !== 'runtime-activation-request') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'ROLE_MISMATCH',
      detail: `activationRequestRef must carry role "runtime-activation-request" (got "${String(activationRequest.role)}")`,
    };
  }
  if (activationResult.role !== 'runtime-activation') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'ROLE_MISMATCH',
      detail: `activationResultRef must carry role "runtime-activation" (got "${String(activationResult.role)}")`,
    };
  }

  // Rung 4: seam conflation (C142/§16) — the activation issuing role must
  // be the DISTINCT technical-admission seam role, never the binding
  // issuing role token (the same identity MAY hold both designations; the
  // roles themselves never collapse).
  if (input.activationIssuer.requiredIssuingRole === input.binding.bindingIssuer.requiredIssuingRole) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SEAM_CONFLATED',
      detail: `the activation issuer asserts the same issuing role token "${input.activationIssuer.requiredIssuingRole}" as the binding issuer; Runtime binding and Runtime activation are distinct seams with distinct issuer roles even when co-located or held by one identity (ASSEMBLY_LIFECYCLE §16; C142)`,
    };
  }

  // Rung 5: request/result anti-alias (C155) inside the activation chain,
  // then cross-seam identity distinctness (§13 RuntimeBindingRef !=
  // RuntimeActivationRef; binding request != activation request).
  try {
    verifyDacV0041RequestResultSeparation(activationRequest, [activationResult]);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'REQUEST_RESULT_ALIAS') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'REQUEST_RESULT_ALIAS',
        detail: (error as Error).message,
      };
    }
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `request/result separation could not be established for the activation seam: ${(error as Error).message}`,
    };
  }
  const activationAlias = distinctIdentities([
    { label: 'runtime-activation-request', identity: activationRequest.primaryIdentity },
    { label: 'runtime-activation', identity: activationResult.primaryIdentity },
    { label: 'runtime-binding-request', identity: bindingRequest.primaryIdentity },
    { label: 'runtime-binding', identity: bindingResult.primaryIdentity },
  ]);
  if (activationAlias !== null) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SEAM_IDENTITY_ALIAS',
      detail: activationAlias.detail,
    };
  }

  // Rung 6: exact request/binding/composition association.
  if (input.boundRequestIdentity !== activationRequest.primaryIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REQUEST_ASSOCIATION_MISMATCH',
      detail: `the activation binds request identity "${input.boundRequestIdentity}" but the presented activation request carries "${activationRequest.primaryIdentity}"`,
    };
  }
  if (input.boundBindingIdentity !== bindingResult.primaryIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the activation binds RuntimeBindingRef identity "${input.boundBindingIdentity}" but the re-verified binding result carries "${bindingResult.primaryIdentity}"`,
    };
  }
  if (input.boundManifestIdentity !== input.binding.subject.manifestIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the activation binds Manifest identity "${input.boundManifestIdentity}" but the re-verified binding subject carries "${input.binding.subject.manifestIdentity}"`,
    };
  }
  if (input.boundManifestContentDigest !== input.binding.subject.manifestContentDigest) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the activation binds Manifest content digest "${input.boundManifestContentDigest}" but the re-verified binding subject carries "${input.binding.subject.manifestContentDigest}"`,
    };
  }

  // Rung 6 (closed, §3.1): the activation REQUEST itself must carry the
  // frozen §3.1 minimum — exact RuntimeBindingRef + exact composition/
  // Manifest/currentness evidence. The generic registry reference has no
  // structural material slots, so the request's exact subject arrives as
  // the recovered `activationRequestSubject` facts and is closed exactly
  // against the bound bundle (and the request envelope's scope/profile);
  // the request's relied currentness determination must cohere exactly
  // with the one this verifier evaluates. Generic role + primary request
  // association alone never suffices.
  const requestSubject = input.activationRequestSubject;
  if (requestSubject.targetBindingIdentity !== input.boundBindingIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REQUEST_ASSOCIATION_MISMATCH',
      detail: `the activation request targets RuntimeBindingRef "${requestSubject.targetBindingIdentity}" but the activation binds "${input.boundBindingIdentity}"; the request must carry the exact binding subject it asks to activate (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  if (requestSubject.targetManifestIdentity !== input.boundManifestIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the activation request targets Manifest identity "${requestSubject.targetManifestIdentity}" but the activation binds "${input.boundManifestIdentity}"; the request must carry the exact composition/Manifest subject (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  if (requestSubject.targetManifestContentDigest !== input.boundManifestContentDigest) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'SUBJECT_MISMATCH',
      detail: `the activation request targets Manifest content digest "${requestSubject.targetManifestContentDigest}" but the activation binds "${input.boundManifestContentDigest}"; the request must carry the exact composition/Manifest subject (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  if (
    requestSubject.reliedBindingCurrentness.state !== input.bindingReuseCurrentness.state ||
    requestSubject.reliedBindingCurrentness.establishedAt !==
      input.bindingReuseCurrentness.establishedAt ||
    !arraysEqual(
      requestSubject.reliedBindingCurrentness.assertedBy,
      input.bindingReuseCurrentness.assertedBy,
    )
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REQUEST_ASSOCIATION_MISMATCH',
      detail: `the activation request relies on a §8.2 binding-currentness determination (${requestSubject.reliedBindingCurrentness.state} at ${requestSubject.reliedBindingCurrentness.establishedAt}) that differs from the determination the activation evaluates (${input.bindingReuseCurrentness.state} at ${input.bindingReuseCurrentness.establishedAt}); the request must carry the exact currentness evidence relied on (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  const activationIntakeScope =
    input.binding.compositionIntake.applicationIdentityEstablishment.applicationScope;
  if (activationRequest.authorityScope !== activationIntakeScope) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REQUEST_ASSOCIATION_MISMATCH',
      detail: `the activation request's authority scope "${activationRequest.authorityScope}" does not equal the bound binding's intake-verified application scope "${activationIntakeScope}"; the request must close exactly over the authority scope of the binding it asks to activate (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }
  if (activationRequest.contractProfileIdentity !== input.binding.subject.dacProfileIdentity) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'REQUEST_ASSOCIATION_MISMATCH',
      detail: `the activation request's DAC/reference profile "${String(activationRequest.contractProfileIdentity)}" does not equal the bound binding's DAC/reference profile "${input.binding.subject.dacProfileIdentity}"; the request must close exactly over the profile of the binding it asks to activate (CROSS_LAYER_REFERENCES §3.1)`,
    };
  }

  // Rung 7: the bound binding bundle must itself verify at the activation
  // point — activation never manufactures the missing upstream
  // promotion/selection/Manifest/compatibility authority (§13). The
  // COMPLETE bundle is re-verified WITH the activation evaluation point:
  // every currentness-dependent component — including the material Runtime
  // implementation/Host Binding §8.2 reuse determinations — is
  // re-established at the ACTIVATION point, never merely trusted from
  // binding time (§14). The derived verification context re-evaluates the
  // recovered evidence in memory; no upstream evidence is mutated or
  // reissued.
  const binding = verifyDacV0041RuntimeBinding({
    ...input.binding,
    evaluationPoint: input.evaluationPoint,
  });
  if (binding.outcome === 'FAIL_CLOSED') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'BINDING_NOT_ESTABLISHED',
      detail: `the bound Runtime binding evidence did not verify (${binding.code}: ${binding.detail})`,
      bindingCode: binding.code,
    };
  }
  if (binding.outcome === 'STALE') {
    return {
      outcome: 'STALE',
      code: 'BINDING_EVIDENCE_STALE',
      detail: `the bound Runtime binding evidence is not current at the activation point (${binding.code}: ${binding.detail})`,
    };
  }

  // Rung 8: the activation act's own issuance evidence (C128 family) and
  // temporal sanity (the activation cannot precede the binding it binds
  // or its own evaluation point).
  if (
    !runtimeActEvidenceEstablished(
      input.activationIssuanceEvidence,
      input.activationIssuer.issuerIdentity,
    )
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'EVIDENCE_UNESTABLISHED',
      detail: 'the activation issuance point has no independent attestor; a Runtime activation act must be independently recoverable and never asserted solely by its own issuer',
    };
  }
  if (input.activationIssuanceEvidence.point < input.binding.bindingIssuanceEvidence.point) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `activation issuance point ${input.activationIssuanceEvidence.point} predates the bound binding's evidenced issuance point ${input.binding.bindingIssuanceEvidence.point}; an activation cannot bind a binding that did not exist`,
    };
  }
  if (input.evaluationPoint < input.activationIssuanceEvidence.point) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: `activation evaluation point ${input.evaluationPoint} predates the activation's own evidenced issuance point ${input.activationIssuanceEvidence.point}`,
    };
  }

  // Rung 9: activation issuer designation chain at the evidenced issuance
  // point, then the exact leaf issuer/role/scope/profile binding. The
  // issuing role is SEAM-FIXED: the activation seam requires exactly
  // "runtime-activation" independently of (and before) the chain
  // comparison, so a caller-supplied role token — even one coherently
  // matched by the chain-current leaf designation — can never substitute
  // the seam's issuing authority (§13/§16; C142). The same identity MAY
  // still hold the separately designated binding role (C169): only the
  // role occupying the activation-issuer position is fixed.
  if (
    input.activationIssuer.requiredIssuingRole !==
    DAC_V0041_RUNTIME_ACTIVATION_ISSUER_SEAM_ROLE
  ) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'UNAUTHORIZED_ACTIVATION_ISSUER',
      detail: `the Runtime activation seam requires the seam-fixed issuing role "${DAC_V0041_RUNTIME_ACTIVATION_ISSUER_SEAM_ROLE}" (got caller-supplied "${input.activationIssuer.requiredIssuingRole}"); a caller-controlled role token — even one coherently matched by the chain-current leaf — can never define the activation seam's issuing authority (ASSEMBLY_LIFECYCLE §§13,16; C142)`,
    };
  }
  const chainFailure = checkRuntimeIssuerChain({
    issuer: input.activationIssuer,
    issuancePoint: input.activationIssuanceEvidence.point,
    scope: input.binding.compositionIntake.applicationIdentityEstablishment
      .applicationScope,
    profile: input.binding.subject.dacProfileIdentity,
    label: 'runtime-activation',
  });
  if (chainFailure !== null) {
    if (chainFailure.severity === 'FAIL') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'UNAUTHORIZED_ACTIVATION_ISSUER',
        detail: chainFailure.detail,
        ...(chainFailure.chainCode === undefined ? {} : { chainCode: chainFailure.chainCode }),
      };
    }
    return { outcome: 'STALE', code: 'ISSUER_CHAIN_STALE', detail: chainFailure.detail };
  }

  // Rung 10: F-07 SoD for the activation decision.
  const sodFailure = classifyRuntimeSod(
    input.activationIssuer.issuerIdentity,
    input.sod,
    'runtime-activation',
  );
  if (sodFailure !== null) {
    return {
      outcome: 'FAIL_CLOSED',
      code: sodFailure.code,
      detail: sodFailure.detail,
    };
  }

  // Rung 11: the bound RuntimeBindingRef must be CURRENT at the
  // activation point (§13; ASSEMBLY_PROFILES §8.2).
  const bindingReuseFailure = classifyRuntimeReuseCurrentness(
    input.bindingReuseCurrentness,
    input.binding.bindingIssuanceEvidence.point,
    input.evaluationPoint,
    'runtime-binding',
  );
  if (bindingReuseFailure !== null) {
    if (bindingReuseFailure.severity === 'INVALID') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'INVALID_FACTS',
        detail: bindingReuseFailure.detail,
      };
    }
    if (bindingReuseFailure.severity === 'FAIL_CLOSED') {
      return {
        outcome: 'FAIL_CLOSED',
        code: 'BINDING_INVALIDATED',
        detail: bindingReuseFailure.detail,
      };
    }
    return {
      outcome: 'STALE',
      code: 'BINDING_NOT_CURRENT',
      detail: bindingReuseFailure.detail,
    };
  }

  // Rung 12: verified — a separate technical-admission verdict ONLY.
  return {
    outcome: 'ACTIVATION_VERIFIED',
    requestIdentity: activationRequest.primaryIdentity,
    activationIdentity: activationResult.primaryIdentity,
    boundBindingIdentity: bindingResult.primaryIdentity,
    manifestIdentity: input.boundManifestIdentity,
    activationIssuerIdentity: input.activationIssuer.issuerIdentity,
    manufacturesUpstreamAuthority: false,
    isExternalBusinessSorTruth: false,
    detail: 'the externally owned Runtime activation evidence verifies against an exact current binding of the exact composition/Manifest identity; activation manufactures no missing upstream promotion/selection/Manifest/compatibility authority and owns no external Business SoR truth (ASSEMBLY_LIFECYCLE §§13, 17)',
  };
}

/**
 * Deterministic external Business SoR boundary classification
 * (ASSEMBLY_LIFECYCLE §17): Runtime accepted/send-dispatched/provider-
 * acknowledged/execution-success/activation state classes are Runtime
 * mechanics evidence and can NEVER manufacture external authoritative
 * commit truth; external SoR observation/reconciliation material remains
 * externally owned evidence under EXTERNAL_AUTHORITY semantics. Unknown
 * classes fail closed — provenance is never guessed favorable.
 */
export function classifyDacV0041BusinessSorTruthSource(
  facts: DacV0041BusinessSorTruthSourceFacts,
): DacV0041BusinessSorBoundaryClassification {
  if (facts === null || typeof facts !== 'object') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'business-SoR boundary facts must be an object',
    };
  }
  const candidate = facts as Partial<DacV0041BusinessSorTruthSourceFacts>;
  if (!isNonEmptyString(candidate.presentedStateClass)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'presentedStateClass must be a non-empty string',
    };
  }
  const runtimeStates = DAC_V0041_RUNTIME_NON_SOR_STATE_CLASSES;
  if ((runtimeStates as readonly string[]).indexOf(candidate.presentedStateClass) !== -1) {
    return {
      outcome: 'RUNTIME_STATE_NOT_SOR_TRUTH',
      stateClass: candidate.presentedStateClass as DacV0041RuntimeNonSorStateClass,
      canManufactureBusinessSorTruth: false,
      governedByExternalAuthoritySemantics: false,
      detail: `Runtime-side state class "${candidate.presentedStateClass}" is Runtime mechanics evidence only: provider acceptance, Runtime success, send dispatch or activation state does not manufacture external authoritative commit truth (ASSEMBLY_LIFECYCLE §17)`,
    };
  }
  const externalSorClasses = DAC_V0041_EXTERNAL_SOR_EVIDENCE_CLASSES;
  if ((externalSorClasses as readonly string[]).indexOf(candidate.presentedStateClass) !== -1) {
    return {
      outcome: 'EXTERNAL_SOR_EVIDENCE_ONLY',
      stateClass: candidate.presentedStateClass as DacV0041ExternalSorEvidenceClass,
      canManufactureBusinessSorTruth: false,
      governedByExternalAuthoritySemantics: true,
      detail: `external Business SoR material "${candidate.presentedStateClass}" remains externally owned evidence under the frozen DAC external-authority/logical-operation/observation/reconciliation semantics; the Runtime never becomes its authority by binding, activating or executing (EXTERNAL_AUTHORITY; ASSEMBLY_LIFECYCLE §17)`,
    };
  }
  return {
    outcome: 'FAIL_CLOSED',
    code: 'UNKNOWN_STATE_CLASS',
    detail: `presented state class "${candidate.presentedStateClass}" is not in either closed vocabulary; undecidable Business SoR provenance fails closed`,
  };
}
