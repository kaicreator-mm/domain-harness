// Issue #356 / A41-002: deterministic consumer/verifier functions for DAC
// v0.0.4.1 F-01 designation/delegation/currentness (AUTHORITY_DESIGNATION_
// DELEGATION.md §§2–11, tightening CROSS_LAYER_REFERENCES §2.2–§2.4) and
// F-06 AuthorityAdoption semantics (LIFECYCLE_REFERENCE_REPAIRS.md §6).
//
// CONSUMER ONLY — never an issuer. Every function is pure and total over
// externally recovered facts: malformed or hostile inputs are returned as
// typed FAIL_CLOSED results (never thrown, never guessed, never repaired).
// No function here mints a designation, adoption or any authority-bearing
// artifact, produces a COMPATIBLE disposition, or evaluates compatibility.
//
// Frozen deterministic pass order for designation chains (first failure
// wins; mirroring the structural-dominates-temporal precedence of
// C152/C171):
//   1. input/shape validation            (INVALID_FACTS family)
//   2. chain walk: leaf -> root          (CHAIN_UNRECOVERABLE, cycles)
//   3. per-link shape/identity checks    (leaf -> root)
//   4. identity continuity + parent role (leaf -> root; C118)
//   5. repeated designated issuer        (C129)
//   6. directed attenuation              (leaf -> root; C119-C124/C159-162)
//   7. root scope-owner anchor           (C130/C168)
//   8. end-act authorization             (C127/C166/C167/C172; rejected
//                                         acts have NO effect)
//   9. retroactive-void cascade          (C126)
//  10. ancestor chain-current at every child issuance (C125)
//  11. chain-currentness at the evaluation point (STALE family / CHAIN_VOIDED
//      / CHAIN_CURRENT)
//
// Portable: no Node built-ins; imports only the A41-001 foundation guard
// for minted-reference identity (forged carriers fail closed).

import { isDacV0041Reference } from '../guards.js';
import {
  DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES,
  DAC_V0041_ADOPTION_REEVALUATION_REQUIREMENTS,
  DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
  DAC_V0041_END_ACT_KINDS,
  DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES,
  type DacV0041AdoptionFailureCode,
  type DacV0041AuthorityAdoptionFacts,
  type DacV0041AuthorityAdoptionVerification,
  type DacV0041DelegationEnvelopeFacts,
  type DacV0041DesignationChainFailureCode,
  type DacV0041DesignationChainInput,
  type DacV0041DesignationChainVerification,
  type DacV0041DesignationLinkFacts,
  type DacV0041EndActFacts,
  type DacV0041EndActKind,
  type DacV0041HistoricArtifactUseClassification,
  type DacV0041HistoricArtifactUseFacts,
  type DacV0041IssuancePointEvidence,
  type DacV0041RejectedEndAct,
  type DacV0041ScopeOwnerAnchorFacts,
  type DacV0041TimePoint,
} from './contracts.js';

/**
 * Mutable alias tokens, mirroring the A41-001 foundation's private set
 * (CROSS_LAYER_REFERENCES §8 carried forward). An exact authority identity
 * that IS one of these whole tokens can never substitute an exact identity.
 * Duplicated locally because the foundation file is frozen by the #355
 * write set; the values MUST stay identical.
 */
const MUTABLE_ALIAS_TOKENS = new Set([
  'latest',
  'current',
  'head',
  'main',
  'master',
  'default',
  'stable',
  'tip',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMutableAliasToken(value: string): boolean {
  return MUTABLE_ALIAS_TOKENS.has(value.trim().toLowerCase());
}

function isTimePoint(value: unknown): value is DacV0041TimePoint {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Exact-token containment: every member of `sub` appears in `sup`. */
function containsAll(sup: readonly string[], sub: readonly string[]): boolean {
  return sub.every((token) => sup.indexOf(token) !== -1);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => isNonEmptyString(entry))
  );
}

/**
 * Precise anchor-array guard. `Array.isArray` alone would narrow a readonly
 * anchor array to `any[]` (a known TypeScript quirk); this guard keeps the
 * exact readonly element type and validates every anchor's shape.
 */
function isScopeOwnerAnchorArray(
  value: unknown,
): value is readonly DacV0041ScopeOwnerAnchorFacts[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (anchor) =>
      anchor !== null &&
      typeof anchor === 'object' &&
      isNonEmptyString(
        (anchor as Partial<DacV0041ScopeOwnerAnchorFacts>).ownerIdentity,
      ) &&
      isStringArray(
        (anchor as Partial<DacV0041ScopeOwnerAnchorFacts>).provedScopes,
      ),
  );
}

interface ChainFailure {
  readonly code: DacV0041DesignationChainFailureCode;
  readonly linkIdentity?: string;
  readonly detail: string;
}

function chainFail(
  failure: ChainFailure,
  rejectedEndActs: readonly DacV0041RejectedEndAct[],
): DacV0041DesignationChainVerification {
  return {
    outcome: 'FAIL_CLOSED',
    code: failure.code,
    ...(failure.linkIdentity === undefined
      ? {}
      : { linkIdentity: failure.linkIdentity }),
    detail: failure.detail,
    rejectedEndActs,
  };
}

function isIssuanceEvidence(value: unknown): value is DacV0041IssuancePointEvidence {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041IssuancePointEvidence>;
  return (
    isTimePoint(candidate.point) && isStringArray(candidate.assertedBy)
  );
}

/**
 * Evidence asserted solely by one forbidden party fails closed. For links
 * the forbidden sole parties are the designator and the designated issuer
 * (F-01 §1 two-party rule; C128); for acts it is the act's own issuer
 * (CROSS_LAYER_REFERENCES §2.4; C128). An empty attestor set never passes.
 */
function evidenceNotSolelyAssertedBy(
  evidence: DacV0041IssuancePointEvidence,
  forbiddenSoleParties: readonly string[],
): boolean {
  if (evidence.assertedBy.length === 0) return false;
  return forbiddenSoleParties.every((party) =>
    evidence.assertedBy.some((attestor) => attestor !== party),
  );
}

function envelopeShapeFailure(envelope: unknown): string | null {
  if (envelope === null || typeof envelope !== 'object') {
    return 'delegation envelope must be an object';
  }
  const candidate = envelope as Partial<DacV0041DelegationEnvelopeFacts>;
  if (!isStringArray(candidate.delegableRoles)) {
    return 'envelope delegableRoles must be a list of non-empty strings';
  }
  if (candidate.delegableRoles.length === 0) {
    return 'envelope delegableRoles must contain at least one role (1..n)';
  }
  if (!isStringArray(candidate.delegableScopes)) {
    return 'envelope delegableScopes must be a list of non-empty strings';
  }
  if (candidate.delegableScopes.length === 0) {
    return 'envelope delegableScopes must contain at least one scope (1..n)';
  }
  if (!isStringArray(candidate.mandatoryConstraints)) {
    return 'envelope mandatoryConstraints must be a list of non-empty strings';
  }
  if (!isStringArray(candidate.permittedDacProfiles)) {
    return 'envelope permittedDacProfiles must be a list of non-empty strings';
  }
  if (candidate.permittedDacProfiles.length === 0) {
    return 'envelope permittedDacProfiles must contain at least one profile (1..n)';
  }
  if (!isStringArray(candidate.delegableSodPermissions)) {
    return 'envelope delegableSodPermissions must be a list of non-empty strings';
  }
  if (
    typeof candidate.redelegationDepth !== 'number' ||
    !Number.isInteger(candidate.redelegationDepth) ||
    candidate.redelegationDepth < 0
  ) {
    return 'envelope redelegationDepth must be a non-negative integer';
  }
  return null;
}

/**
 * Pass 3: per-link shape and identity checks in fixed order. Returns the
 * first failure or null.
 */
function linkShapeFailure(
  link: unknown,
  composerRoleIdentities: ReadonlySet<string>,
): ChainFailure | null {
  if (link === null || typeof link !== 'object') {
    return { code: 'INVALID_FACTS', detail: 'designation link must be an object' };
  }
  const candidate = link as Partial<DacV0041DesignationLinkFacts>;
  for (const field of [
    'linkIdentity',
    'designatorIdentity',
    'designatedIssuerIdentity',
    'authorityRole',
    'authorityScope',
    'dacProfileIdentity',
  ] as const) {
    if (!isNonEmptyString(candidate[field])) {
      return {
        code: 'INVALID_FACTS',
        detail: `designation link field ${field} must be a non-empty string`,
      };
    }
  }
  if (!isStringArray(candidate.holderConstraints)) {
    return { code: 'INVALID_FACTS', detail: 'holderConstraints must be a list of non-empty strings' };
  }
  if (!isStringArray(candidate.sodPermissions)) {
    return { code: 'INVALID_FACTS', detail: 'sodPermissions must be a list of non-empty strings' };
  }
  if (!isTimePoint(candidate.effectiveFrom)) {
    return { code: 'INVALID_FACTS', detail: 'effectiveFrom must be a finite time point' };
  }
  if (
    candidate.declaredEffectiveEnd !== undefined &&
    !isTimePoint(candidate.declaredEffectiveEnd)
  ) {
    return { code: 'INVALID_FACTS', detail: 'declaredEffectiveEnd must be a finite time point' };
  }
  if (!isIssuanceEvidence(candidate.issuanceEvidence)) {
    return {
      code: 'INVALID_FACTS',
      detail: 'issuanceEvidence must carry a finite point and a non-empty list of non-empty attestor identities',
    };
  }
  if (
    candidate.parentLinkIdentity !== undefined &&
    !isNonEmptyString(candidate.parentLinkIdentity)
  ) {
    return { code: 'INVALID_FACTS', detail: 'parentLinkIdentity must be a non-empty string when present' };
  }
  if (
    candidate.declaredEffectiveEnd !== undefined &&
    candidate.declaredEffectiveEnd <= candidate.effectiveFrom
  ) {
    return {
      code: 'INVALID_FACTS',
      detail: 'declaredEffectiveEnd must be later than effectiveFrom (non-empty validity interval)',
    };
  }
  const linkIdentity = candidate.linkIdentity as string;
  for (const field of [
    'linkIdentity',
    'designatorIdentity',
    'designatedIssuerIdentity',
    'authorityRole',
    'authorityScope',
    'dacProfileIdentity',
  ] as const) {
    if (isMutableAliasToken(candidate[field] as string)) {
      return {
        code: 'MUTABLE_ALIAS_IDENTITY',
        linkIdentity,
        detail: `designation link field ${field} is a mutable alias token and can never substitute an exact identity`,
      };
    }
  }
  const designator = candidate.designatorIdentity as string;
  const designatedIssuer = candidate.designatedIssuerIdentity as string;
  if (designator === designatedIssuer) {
    return {
      code: 'SELF_DESIGNATION',
      linkIdentity,
      detail: 'designator identity and designated issuer identity must differ at every link (self-designation fails closed)',
    };
  }
  if (composerRoleIdentities.has(designator)) {
    return {
      code: 'COMPOSER_DESIGNATOR',
      linkIdentity,
      detail: 'a Composer-role identity MUST NOT issue AuthorityDesignationRef (co-location never creates designation authority)',
    };
  }
  const role = candidate.authorityRole as string;
  if (role === DAC_V0041_DESIGNATION_ISSUANCE_ROLE) {
    if (composerRoleIdentities.has(designatedIssuer)) {
      return {
        code: 'COMPOSER_DESIGNATOR',
        linkIdentity,
        detail: 'a Composer-role identity MUST NOT hold designation-issuance',
      };
    }
    if (candidate.delegationEnvelope === undefined) {
      return {
        code: 'INVALID_FACTS',
        linkIdentity,
        detail: 'a designation-issuance link MUST carry its delegation envelope',
      };
    }
    const envelopeFailure = envelopeShapeFailure(candidate.delegationEnvelope);
    if (envelopeFailure !== null) {
      return { code: 'INVALID_FACTS', linkIdentity, detail: envelopeFailure };
    }
  }
  if (candidate.effectiveFrom < candidate.issuanceEvidence.point) {
    return {
      code: 'BACKDATED_EFFECTIVE_FROM',
      linkIdentity,
      detail: 'declared effective-from precedes the link\'s own evidenced issuance point (no designation authorizes issuance before it existed)',
    };
  }
  if (
    !evidenceNotSolelyAssertedBy(candidate.issuanceEvidence, [
      designator,
      designatedIssuer,
    ])
  ) {
    return {
      code: 'ISSUANCE_EVIDENCE_UNESTABLISHED',
      linkIdentity,
      detail: 'issuance-point evidence must not be asserted solely by the designator nor solely by the designated issuer, and must have at least one attestor',
    };
  }
  return null;
}

/** Computed validity interval of one link after end-act resolution. */
interface LinkInterval {
  readonly start: DacV0041TimePoint;
  readonly end: DacV0041TimePoint | null;
  readonly endKind?: DacV0041EndActKind | 'declared-expiry';
}

function isVoidKind(kind: DacV0041EndActKind): boolean {
  return kind === 'retroactive-void';
}

/** Map an end-act kind to the ordinary lapse reason it produces. */
function lapseReasonForEndKind(
  kind: DacV0041EndActKind | 'declared-expiry',
): 'expired' | 'superseded' | 'revoked' | 'relinquished' {
  switch (kind) {
    case 'ordinary-expiry':
    case 'declared-expiry':
      return 'expired';
    case 'supersession':
      return 'superseded';
    case 'prospective-revocation':
      return 'revoked';
    case 'relinquishment':
      return 'relinquished';
    case 'retroactive-void':
      return 'revoked';
  }
}

/**
 * Deterministic designation-chain verifier (F-01 §§2–8; C118–C132,
 * C159–C162, C166–C168, C172). Pure, total, fail-closed; see the module
 * header for the frozen pass order and the result type for the outcome
 * precedence. The verifier never repairs, truncates or normalizes an
 * over-broad grant, never merges partial owner anchors, never re-parents
 * superseded descendants, and never lets a rejected end act rewrite
 * `end(L)`.
 */
export function verifyDacV0041DesignationChain(
  input: DacV0041DesignationChainInput,
): DacV0041DesignationChainVerification {
  const rejectedEndActs: DacV0041RejectedEndAct[] = [];
  // Pass 1: input shape.
  if (input === null || typeof input !== 'object') {
    return chainFail(
      { code: 'INVALID_FACTS', detail: 'designation chain input must be an object' },
      rejectedEndActs,
    );
  }
  const candidateInput = input as Partial<DacV0041DesignationChainInput>;
  if (!Array.isArray(candidateInput.links) || candidateInput.links.length === 0) {
    return chainFail(
      { code: 'INVALID_FACTS', detail: 'links must be a non-empty array of designation link facts' },
      rejectedEndActs,
    );
  }
  if (!isNonEmptyString(candidateInput.leafLinkIdentity)) {
    return chainFail(
      { code: 'INVALID_FACTS', detail: 'leafLinkIdentity must be a non-empty string' },
      rejectedEndActs,
    );
  }
  if (!isTimePoint(candidateInput.evaluationPoint)) {
    return chainFail(
      { code: 'INVALID_FACTS', detail: 'evaluationPoint must be a finite time point' },
      rejectedEndActs,
    );
  }
  if (!isScopeOwnerAnchorArray(candidateInput.scopeOwnerAnchors)) {
    return chainFail(
      { code: 'INVALID_FACTS', detail: 'each scope owner anchor must carry an owner identity and proved scopes' },
      rejectedEndActs,
    );
  }
  if (
    candidateInput.composerRoleIdentities !== undefined &&
    !isStringArray(candidateInput.composerRoleIdentities)
  ) {
    return chainFail(
      { code: 'INVALID_FACTS', detail: 'composerRoleIdentities must be a list of non-empty strings' },
      rejectedEndActs,
    );
  }
  const composerRoleIdentities = new Set<string>(
    candidateInput.composerRoleIdentities ?? [],
  );
  const evaluationPoint = candidateInput.evaluationPoint;

  // Pass 2: chain walk leaf -> root over exact cited parents.
  const linksByIdentity = new Map<string, DacV0041DesignationLinkFacts>();
  for (const link of candidateInput.links) {
    if (link === null || typeof link !== 'object') {
      return chainFail(
        { code: 'INVALID_FACTS', detail: 'every designation link must be an object' },
        rejectedEndActs,
      );
    }
    const identity = (link as Partial<DacV0041DesignationLinkFacts>).linkIdentity;
    if (typeof identity !== 'string') {
      return chainFail(
        { code: 'INVALID_FACTS', detail: 'every designation link must carry a linkIdentity string' },
        rejectedEndActs,
      );
    }
    if (linksByIdentity.has(identity)) {
      return chainFail(
        {
          code: 'CHAIN_UNRECOVERABLE',
          linkIdentity: identity,
          detail: `duplicate designation link identity "${identity}"`,
        },
        rejectedEndActs,
      );
    }
    linksByIdentity.set(identity, link as DacV0041DesignationLinkFacts);
  }
  const leaf = linksByIdentity.get(candidateInput.leafLinkIdentity);
  if (leaf === undefined) {
    return chainFail(
      {
        code: 'CHAIN_UNRECOVERABLE',
        detail: `leaf designation link "${candidateInput.leafLinkIdentity}" was not supplied`,
      },
      rejectedEndActs,
    );
  }
  const chain: DacV0041DesignationLinkFacts[] = [];
  const visited = new Set<string>();
  let cursor: DacV0041DesignationLinkFacts | undefined = leaf;
  while (cursor !== undefined) {
    if (visited.has(cursor.linkIdentity)) {
      return chainFail(
        {
          code: 'REPEATED_DESIGNATED_ISSUER',
          linkIdentity: cursor.linkIdentity,
          detail: 'the parent chain revisits a link (designation cycle)',
        },
        rejectedEndActs,
      );
    }
    visited.add(cursor.linkIdentity);
    chain.push(cursor);
    if (cursor.parentLinkIdentity === undefined) {
      cursor = undefined;
    } else {
      const parent = linksByIdentity.get(cursor.parentLinkIdentity);
      if (parent === undefined) {
        return chainFail(
          {
            code: 'CHAIN_UNRECOVERABLE',
            linkIdentity: cursor.linkIdentity,
            detail: `cited parent designation "${cursor.parentLinkIdentity}" was not supplied`,
          },
          rejectedEndActs,
        );
      }
      cursor = parent;
    }
  }

  // Pass 3: per-link shape/identity checks (leaf -> root).
  for (const link of chain) {
    const failure = linkShapeFailure(link, composerRoleIdentities);
    if (failure !== null) {
      return chainFail(failure, rejectedEndActs);
    }
  }

  // Pass 4: identity continuity + exact parent role (leaf -> root; C118).
  for (let index = 0; index + 1 < chain.length; index += 1) {
    const child = chain[index] as DacV0041DesignationLinkFacts;
    const parent = chain[index + 1] as DacV0041DesignationLinkFacts;
    if (child.designatorIdentity !== parent.designatedIssuerIdentity) {
      return chainFail(
        {
          code: 'IDENTITY_DISCONTINUITY',
          linkIdentity: child.linkIdentity,
          detail: `child link designator "${child.designatorIdentity}" is not the designated issuer of the cited parent link "${parent.linkIdentity}"`,
        },
        rejectedEndActs,
      );
    }
    if (parent.authorityRole !== DAC_V0041_DESIGNATION_ISSUANCE_ROLE) {
      return chainFail(
        {
          code: 'PARENT_ROLE_NOT_DESIGNATION_ISSUANCE',
          linkIdentity: child.linkIdentity,
          detail: `cited parent designation "${parent.linkIdentity}" carries authority role "${parent.authorityRole}", not designation-issuance (no other authority role implies designation authority)`,
        },
        rejectedEndActs,
      );
    }
  }

  // Pass 5: repeated designated issuer in one chain (C129).
  const seenIssuers = new Set<string>();
  for (const link of chain) {
    if (seenIssuers.has(link.designatedIssuerIdentity)) {
      return chainFail(
        {
          code: 'REPEATED_DESIGNATED_ISSUER',
          linkIdentity: link.linkIdentity,
          detail: `identity "${link.designatedIssuerIdentity}" appears more than once as designated issuer in one chain (cycle/self-derivation)`,
        },
        rejectedEndActs,
      );
    }
    seenIssuers.add(link.designatedIssuerIdentity);
  }

  // Pass 6: directed attenuation (leaf -> root; C119-C124/C159-C162).
  for (let index = 0; index + 1 < chain.length; index += 1) {
    const child = chain[index] as DacV0041DesignationLinkFacts;
    const parent = chain[index + 1] as DacV0041DesignationLinkFacts;
    const envelope = parent.delegationEnvelope as DacV0041DelegationEnvelopeFacts;
    // Re-delegation permission is denied by default (§5) and is the more
    // specific verdict for a designation-issuance child than the generic
    // out-of-envelope role check, so it is decided first.
    if (
      child.authorityRole === DAC_V0041_DESIGNATION_ISSUANCE_ROLE &&
      envelope.delegableRoles.indexOf(DAC_V0041_DESIGNATION_ISSUANCE_ROLE) === -1
    ) {
      return chainFail(
        {
          code: 'REDELEGATION_NOT_PERMITTED',
          linkIdentity: child.linkIdentity,
          detail: 'parent envelope does not permit delegating designation-issuance (re-delegation is denied by default)',
        },
        rejectedEndActs,
      );
    }
    if (envelope.delegableRoles.indexOf(child.authorityRole) === -1) {
      return chainFail(
        {
          code: 'ROLE_NOT_ENVELOPED',
          linkIdentity: child.linkIdentity,
          detail: `delegated authority role "${child.authorityRole}" is not within the delegable roles of parent designation "${parent.linkIdentity}"`,
        },
        rejectedEndActs,
      );
    }
    if (envelope.delegableScopes.indexOf(child.authorityScope) === -1) {
      return chainFail(
        {
          code: 'SCOPE_NOT_ENVELOPED',
          linkIdentity: child.linkIdentity,
          detail: `delegated authority scope "${child.authorityScope}" is not within the delegable scopes of parent designation "${parent.linkIdentity}"`,
        },
        rejectedEndActs,
      );
    }
    if (envelope.permittedDacProfiles.indexOf(child.dacProfileIdentity) === -1) {
      return chainFail(
        {
          code: 'PROFILE_NOT_PERMITTED',
          linkIdentity: child.linkIdentity,
          detail: `delegated DAC/reference profile "${child.dacProfileIdentity}" is not permitted by parent designation "${parent.linkIdentity}"`,
        },
        rejectedEndActs,
      );
    }
    const inheritedConstraints = [
      ...parent.holderConstraints,
      ...envelope.mandatoryConstraints,
    ];
    if (!containsAll(child.holderConstraints, inheritedConstraints)) {
      return chainFail(
        {
          code: 'CONSTRAINT_NOT_INHERITED',
          linkIdentity: child.linkIdentity,
          detail: `child link does not carry every parent holder constraint and parent-envelope mandatory constraint by identical token (undecidable or widening constraint comparisons fail closed)`,
        },
        rejectedEndActs,
      );
    }
    if (!containsAll(envelope.delegableSodPermissions, child.sodPermissions)) {
      return chainFail(
        {
          code: 'SOD_PERMISSION_NOT_PERMITTED',
          linkIdentity: child.linkIdentity,
          detail: `child link carries a SoD/co-location permission excluded by parent designation "${parent.linkIdentity}" (a descendant cannot widen SoD permission)`,
        },
        rejectedEndActs,
      );
    }
    if (
      parent.declaredEffectiveEnd !== undefined &&
      (child.declaredEffectiveEnd === undefined ||
        child.declaredEffectiveEnd > parent.declaredEffectiveEnd)
    ) {
      return chainFail(
        {
          code: 'WINDOW_NOT_ATTENUATED',
          linkIdentity: child.linkIdentity,
          detail: 'child declared effective-end is later than parent effective-end, or a bounded parent granted an unbounded child',
        },
        rejectedEndActs,
      );
    }
    if (child.authorityRole === DAC_V0041_DESIGNATION_ISSUANCE_ROLE) {
      const childEnvelope = child.delegationEnvelope as DacV0041DelegationEnvelopeFacts;
      if (
        childEnvelope.redelegationDepth >
        envelope.redelegationDepth - 1
      ) {
        return chainFail(
          {
            code: 'REDELEGATION_NOT_PERMITTED',
            linkIdentity: child.linkIdentity,
            detail: `child re-delegation depth ${childEnvelope.redelegationDepth} exceeds parent depth minus one (${envelope.redelegationDepth - 1})`,
          },
          rejectedEndActs,
        );
      }
      if (!containsAll(envelope.delegableRoles, childEnvelope.delegableRoles)) {
        return chainFail(
          {
            code: 'ENVELOPE_WIDENING',
            linkIdentity: child.linkIdentity,
            detail: 'child delegation envelope delegable roles widen beyond the parent envelope',
          },
          rejectedEndActs,
        );
      }
      if (!containsAll(envelope.delegableScopes, childEnvelope.delegableScopes)) {
        return chainFail(
          {
            code: 'ENVELOPE_WIDENING',
            linkIdentity: child.linkIdentity,
            detail: 'child delegation envelope delegable scopes widen beyond the parent envelope',
          },
          rejectedEndActs,
        );
      }
      if (
        !containsAll(
          envelope.permittedDacProfiles,
          childEnvelope.permittedDacProfiles,
        )
      ) {
        return chainFail(
          {
            code: 'ENVELOPE_WIDENING',
            linkIdentity: child.linkIdentity,
            detail: 'child delegation envelope permitted profiles widen beyond the parent envelope',
          },
          rejectedEndActs,
        );
      }
      if (
        !containsAll(
          envelope.delegableSodPermissions,
          childEnvelope.delegableSodPermissions,
        )
      ) {
        return chainFail(
          {
            code: 'ENVELOPE_WIDENING',
            linkIdentity: child.linkIdentity,
            detail: 'child delegation envelope delegable SoD permissions widen beyond the parent envelope',
          },
          rejectedEndActs,
        );
      }
      if (
        !containsAll(childEnvelope.mandatoryConstraints, [
          ...envelope.mandatoryConstraints,
          ...parent.holderConstraints,
        ])
      ) {
        return chainFail(
          {
            code: 'CONSTRAINT_NOT_INHERITED',
            linkIdentity: child.linkIdentity,
            detail: 'child delegation envelope does not carry every parent-envelope mandatory constraint and parent holder constraint (ancestor constraints remain conjunctive; no silent truncation)',
          },
          rejectedEndActs,
        );
      }
    }
  }

  // Pass 7: root scope-owner anchor (C130/C168). A single anchor record must
  // prove the chain scope AND every root-envelope delegable scope; partial
  // anchors are never merged into coverage.
  const root = chain[chain.length - 1] as DacV0041DesignationLinkFacts;
  const rootAnchor = candidateInput.scopeOwnerAnchors.find(
    (anchor) =>
      anchor.ownerIdentity ===
      root.designatorIdentity,
  );
  const rootEnvelopeScopes =
    root.authorityRole === DAC_V0041_DESIGNATION_ISSUANCE_ROLE
      ? (root.delegationEnvelope as DacV0041DelegationEnvelopeFacts)
          .delegableScopes
      : [];
  const requiredOwnedScopes = [root.authorityScope, ...rootEnvelopeScopes];
  if (
    rootAnchor === undefined ||
    !containsAll(
      rootAnchor.provedScopes,
      requiredOwnedScopes,
    )
  ) {
    return chainFail(
      {
        code: 'ROOT_ANCHOR_UNESTABLISHED',
        linkIdentity: root.linkIdentity,
        detail: `no single scope-owner anchor of "${root.designatorIdentity}" independently proves ownership of every required scope (${requiredOwnedScopes
          .map((scope) => `"${scope}"`)
          .join(', ')})`,
      },
      rejectedEndActs,
    );
  }

  // Pass 8: end-act resolution in fixed order — ANCESTOR links (toward the
  // root) before descendant links, then each link's act array order — so an
  // act's covering-ancestor authorization always sees the complete ancestor
  // end set: a designator whose own chain already lapsed cannot authorize a
  // descendant end act. Intervals start from declared ends ONLY; previously
  // resolved VALID acts tighten them; rejected acts have NO effect.
  const intervals = new Map<string, LinkInterval>();
  const voids = new Map<string, { readonly link: DacV0041DesignationLinkFacts; readonly voidPoint: DacV0041TimePoint }>();
  const resolveInterval = (
    link: DacV0041DesignationLinkFacts,
  ): LinkInterval => {
    const cached = intervals.get(link.linkIdentity);
    if (cached !== undefined) return cached;
    const interval: LinkInterval = {
      start: link.effectiveFrom,
      end: link.declaredEffectiveEnd ?? null,
      ...(link.declaredEffectiveEnd === undefined
        ? {}
        : { endKind: 'declared-expiry' as const }),
    };
    intervals.set(link.linkIdentity, interval);
    return interval;
  };
  const chainCurrentAt = (
    fromIndex: number,
    point: DacV0041TimePoint,
  ): boolean => {
    for (let index = fromIndex; index < chain.length; index += 1) {
      const link = chain[index] as DacV0041DesignationLinkFacts;
      const interval = resolveInterval(link);
      if (point < interval.start) return false;
      if (interval.end !== null && point >= interval.end) return false;
    }
    return true;
  };
  const rejectAct = (
    act: DacV0041EndActFacts,
    reason: DacV0041RejectedEndAct['reason'],
  ): void => {
    rejectedEndActs.push({ actIdentity: act.actIdentity, kind: act.kind, reason });
  };
  const issuerIsEntitledCoveringAncestor = (
    targetIndex: number,
    act: DacV0041EndActFacts,
  ): boolean => {
    // Scope-owner branch: the root designator, with the target scope among
    // the anchor-proved scopes.
    if (
      act.issuerIdentity === root.designatorIdentity &&
      rootAnchor.provedScopes.indexOf(
        (chain[targetIndex] as DacV0041DesignationLinkFacts).authorityScope,
      ) !== -1
    ) {
      return true;
    }
    // Covering-ancestor branch: the issuer is a designator of some link in
    // the chain from the target upward. Every such designator appears in
    // the target's ancestor chain as the designated issuer of the next link
    // toward the root (identity continuity), so its entitlement is that
    // holder link: it must be a designation-issuance link whose envelope
    // covers the target role and scope, with its holder chain current at
    // the act's issuance point. The root designator holds no such link and
    // is entitled only through the scope-owner branch above.
    for (let k = targetIndex; k + 1 < chain.length; k += 1) {
      const ancestorLink = chain[k] as DacV0041DesignationLinkFacts;
      if (ancestorLink.designatorIdentity !== act.issuerIdentity) continue;
      const issuerHolderLink = chain[k + 1] as DacV0041DesignationLinkFacts;
      if (issuerHolderLink.authorityRole !== DAC_V0041_DESIGNATION_ISSUANCE_ROLE) {
        continue;
      }
      const issuerEnvelope = issuerHolderLink.delegationEnvelope as DacV0041DelegationEnvelopeFacts;
      const target = chain[targetIndex] as DacV0041DesignationLinkFacts;
      if (
        issuerEnvelope.delegableRoles.indexOf(target.authorityRole) !== -1 &&
        issuerEnvelope.delegableScopes.indexOf(target.authorityScope) !== -1 &&
        chainCurrentAt(k + 1, act.issuanceEvidence.point)
      ) {
        return true;
      }
    }
    return false;
  };
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const link = chain[index] as DacV0041DesignationLinkFacts;
    for (const act of link.endActs ?? []) {
      // Shape gate: an unestablishable act is rejected with no effect.
      if (
        !isNonEmptyString(act?.actIdentity) ||
        !isNonEmptyString(act?.issuerIdentity) ||
        (DAC_V0041_END_ACT_KINDS as readonly string[]).indexOf(act?.kind) === -1 ||
        !isIssuanceEvidence(act?.issuanceEvidence) ||
        !isTimePoint(act?.effectivePoint) ||
        (act?.replacementLinkIdentity !== undefined &&
          !isNonEmptyString(act?.replacementLinkIdentity))
      ) {
        rejectAct(
          {
            actIdentity: String(act?.actIdentity),
            kind: act?.kind,
            issuerIdentity: String(act?.issuerIdentity),
            issuanceEvidence: act?.issuanceEvidence,
            effectivePoint: act?.effectivePoint,
          },
          'evidence-unestablished',
        );
        continue;
      }
      if (
        !evidenceNotSolelyAssertedBy(act.issuanceEvidence, [
          act.issuerIdentity,
        ])
      ) {
        rejectAct(act, 'evidence-unestablished');
        continue;
      }
      if (act.kind === 'retroactive-void') {
        // §8: the void point T_v is RETROACTIVE by definition — it MUST NOT
        // be backdate-checked like a prospective act; its own bounded
        // interval is [issuance point of G, issuance point of the void act].
        if (!issuerIsEntitledCoveringAncestor(index, act)) {
          rejectAct(act, 'unauthorized-issuer');
          continue;
        }
        if (
          act.effectivePoint < link.issuanceEvidence.point ||
          act.effectivePoint > act.issuanceEvidence.point
        ) {
          rejectAct(act, 'void-point-outside-interval');
          continue;
        }
      } else {
        // §7 ordinary ends (and relinquishment) are prospective only: the
        // claimed effective point MUST NOT precede the act's own evidenced
        // issuance point (C172 no backdated prospective effect).
        if (act.effectivePoint < act.issuanceEvidence.point) {
          rejectAct(act, 'backdated');
          continue;
        }
        if (act.kind === 'relinquishment') {
          if (act.issuerIdentity !== link.designatedIssuerIdentity) {
            rejectAct(act, 'issuer-not-holder');
            continue;
          }
        } else if (!issuerIsEntitledCoveringAncestor(index, act)) {
          rejectAct(act, 'unauthorized-issuer');
          continue;
        }
      }
      // Valid act: fold its effect into the link interval (and, for void,
      // record the void point for the cascade).
      const interval = resolveInterval(link);
      if (
        interval.end === null ||
        act.effectivePoint < interval.end
      ) {
        intervals.set(link.linkIdentity, {
          start: interval.start,
          end: act.effectivePoint,
          endKind: act.kind,
        });
      }
      if (isVoidKind(act.kind)) {
        voids.set(link.linkIdentity, {
          link,
          voidPoint: act.effectivePoint,
        });
      }
    }
  }

  // Pass 9: retroactive-void cascade (C126). A descendant issued at or after
  // an ancestor's void point is not validly issued.
  for (let index = 0; index < chain.length; index += 1) {
    const link = chain[index] as DacV0041DesignationLinkFacts;
    for (let ancestor = index + 1; ancestor < chain.length; ancestor += 1) {
      const voidRecord = voids.get(
        (chain[ancestor] as DacV0041DesignationLinkFacts).linkIdentity,
      );
      if (
        voidRecord !== undefined &&
        link.issuanceEvidence.point >= voidRecord.voidPoint
      ) {
        return chainFail(
          {
            code: 'VOID_INVALIDATES_DESCENDANT',
            linkIdentity: link.linkIdentity,
            detail: `link "${link.linkIdentity}" was issued at or after ancestor void point ${voidRecord.voidPoint} of "${voidRecord.link.linkIdentity}" and is not validly issued`,
          },
          rejectedEndActs,
        );
      }
    }
  }

  // Pass 10: every non-root child was issued while its full ancestor chain
  // was chain-current (C125; no new issuance under a lapsed ancestor).
  for (let index = 0; index + 1 < chain.length; index += 1) {
    const child = chain[index] as DacV0041DesignationLinkFacts;
    if (!chainCurrentAt(index + 1, child.issuanceEvidence.point)) {
      return chainFail(
        {
          code: 'ANCESTOR_NOT_CURRENT_AT_ISSUANCE',
          linkIdentity: child.linkIdentity,
          detail: `link "${child.linkIdentity}" was issued while its ancestor chain was not chain-current (a lapsed ancestor does not permit inheritance of new issuance authority)`,
        },
        rejectedEndActs,
      );
    }
  }

  // Pass 11: chain-currentness at the evaluation point. A retroactive void
  // applying at the point dominates every ordinary lapse.
  for (const link of chain) {
    const voidRecord = voids.get(link.linkIdentity);
    if (voidRecord !== undefined && evaluationPoint >= voidRecord.voidPoint) {
      return chainFail(
        {
          code: 'CHAIN_VOIDED',
          linkIdentity: link.linkIdentity,
          detail: `chain link "${link.linkIdentity}" is retroactively voided at ${voidRecord.voidPoint}; the chain is unusable for authoritative use at or after that point`,
        },
        rejectedEndActs,
      );
    }
  }
  for (const link of chain) {
    const interval = resolveInterval(link);
    if (evaluationPoint < interval.start) {
      return {
        outcome: 'STALE',
        reason: 'not-yet-effective',
        lapsedLinkIdentity: link.linkIdentity,
        detail: `chain link "${link.linkIdentity}" is not yet effective at the evaluation point`,
        rejectedEndActs,
      };
    }
    if (interval.end !== null && evaluationPoint >= interval.end) {
      const kind = interval.endKind ?? 'declared-expiry';
      return {
        outcome: 'STALE',
        reason: lapseReasonForEndKind(kind),
        lapsedLinkIdentity: link.linkIdentity,
        ...(kind === 'declared-expiry' ? {} : { endKind: kind }),
        detail: `chain link "${link.linkIdentity}" ended at ${interval.end} (${kind}); ordinary ends are prospective and never rewrite history`,
        rejectedEndActs,
      };
    }
  }
  return {
    outcome: 'CHAIN_CURRENT',
    rootLinkIdentity: root.linkIdentity,
    chainLinkIdentities: chain.map((link) => link.linkIdentity),
    detail: `designation chain to root "${root.linkIdentity}" is structurally valid and chain-current at the evaluation point`,
    rejectedEndActs,
  };
}

function adoptionFail(
  code: DacV0041AdoptionFailureCode,
  detail: string,
  chainCode?: DacV0041DesignationChainFailureCode,
): DacV0041AuthorityAdoptionVerification {
  return {
    outcome: 'FAIL_CLOSED',
    code,
    detail,
    ...(chainCode === undefined ? {} : { chainCode }),
  };
}

type DacV0041AdoptionReEvaluationFlagKey =
  (typeof DAC_V0041_ADOPTION_REEVALUATION_REQUIREMENTS)[number];

/**
 * Deterministic AuthorityAdoption verifier (F-06 §6; C145–C147, C163–C165).
 * Consumer-only: it never creates adoption authority — it decides whether a
 * PRESENTED adoption act is valid, with the frozen precedence ladder
 * documented on the result type. The issuer designation chain is evaluated
 * chain-current at the adoption act's evidenced issuance point regardless of
 * the chain input's own evaluation point (§6.2 element 1: "at the adoption
 * point"). New authority becomes effective only from the adoption point;
 * adoption never repairs a malformed source chain, manufactures provenance,
 * widens authority or backdates effect.
 */
export function verifyDacV0041AuthorityAdoption(
  facts: DacV0041AuthorityAdoptionFacts,
): DacV0041AuthorityAdoptionVerification {
  // Ladder step 1: malformed facts.
  if (facts === null || typeof facts !== 'object') {
    return adoptionFail('INVALID_FACTS', 'adoption facts must be an object');
  }
  const candidate = facts as Partial<DacV0041AuthorityAdoptionFacts>;
  for (const [field, label] of [
    ['adoptionActIdentity', 'adoptionActIdentity'],
    ['adoptedArtifactClass', 'adoptedArtifactClass'],
    ['originDacProfileIdentity', 'originDacProfileIdentity'],
    ['requiredIssuingRole', 'requiredIssuingRole'],
    ['adoptionDacProfileIdentity', 'adoptionDacProfileIdentity'],
  ] as const) {
    if (!isNonEmptyString(candidate[field])) {
      return adoptionFail('INVALID_FACTS', `${label} must be a non-empty string`);
    }
  }
  if (!isNonEmptyString(candidate.adoptionIssuerIdentity)) {
    return adoptionFail('INVALID_FACTS', 'adoptionIssuerIdentity must be a non-empty string');
  }
  if (isMutableAliasToken(candidate.adoptionIssuerIdentity)) {
    return adoptionFail(
      'INVALID_FACTS',
      'adoptionIssuerIdentity is a mutable alias token and can never substitute an exact identity',
    );
  }
  if (!isIssuanceEvidence(candidate.issuanceEvidence)) {
    return adoptionFail(
      'INVALID_FACTS',
      'issuanceEvidence must carry a finite point and a non-empty list of non-empty attestor identities',
    );
  }
  if (
    candidate.effectivePoint !== undefined &&
    !isTimePoint(candidate.effectivePoint)
  ) {
    return adoptionFail('INVALID_FACTS', 'effectivePoint must be a finite time point when present');
  }
  const reEvaluation = candidate.reEvaluation;
  if (reEvaluation === null || typeof reEvaluation !== 'object') {
    return adoptionFail('INVALID_FACTS', 'reEvaluation must be an object');
  }
  for (const requirement of DAC_V0041_ADOPTION_REEVALUATION_REQUIREMENTS) {
    const flagMap: Record<DacV0041AdoptionReEvaluationFlagKey, unknown> = {
      'source-authenticity': reEvaluation.sourceAuthenticityEstablished,
      'source-provenance': reEvaluation.sourceProvenanceRecoverable,
      'subject-exactness': reEvaluation.subjectExactnessEstablished,
      'source-currentness': reEvaluation.sourceCurrentnessEstablished,
      'evidence-closure': reEvaluation.evidenceClosureRecoverable,
      'class-specific-obligations': reEvaluation.classSpecificObligationsSatisfied,
    };
    if (typeof flagMap[requirement] !== 'boolean') {
      return adoptionFail(
        'INVALID_FACTS',
        `re-evaluation requirement "${requirement}" must be an explicit boolean fact`,
      );
    }
  }
  if (!isStringArray(candidate.subjectConstraintTokens)) {
    return adoptionFail('INVALID_FACTS', 'subjectConstraintTokens must be a list of non-empty strings');
  }
  if (
    candidate.sodReliedPermissions !== undefined &&
    !isStringArray(candidate.sodReliedPermissions)
  ) {
    return adoptionFail('INVALID_FACTS', 'sodReliedPermissions must be a list of non-empty strings when present');
  }
  if (
    candidate.classPreconditions === null ||
    typeof candidate.classPreconditions !== 'object'
  ) {
    return adoptionFail('INVALID_FACTS', 'classPreconditions must be an object');
  }
  for (const flag of [
    'notADesignationSpecialization',
    'selectionIdentityEstablishmentValid',
    'adoptedViaNewEstablishmentRecord',
  ] as const) {
    const value = (
      candidate.classPreconditions as Partial<
        Record<typeof flag, unknown>
      >
    )[flag];
    if (value !== undefined && typeof value !== 'boolean') {
      return adoptionFail(
        'INVALID_FACTS',
        `classPreconditions.${flag} must be a boolean when present`,
      );
    }
  }
  if (candidate.issuerDesignationChain === null || typeof candidate.issuerDesignationChain !== 'object') {
    return adoptionFail('INVALID_FACTS', 'issuerDesignationChain must be a designation chain input object');
  }

  const adoptedClass = candidate.adoptedArtifactClass as string;

  // Ladder step 2: non-adoptable or unknown class (C163/C147; §6.4).
  if (
    (DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES as readonly string[]).indexOf(
      adoptedClass,
    ) !== -1
  ) {
    return adoptionFail(
      'NON_ADOPTABLE_CLASS',
      `artifact class "${adoptedClass}" requires fresh v0.0.4.1 issuance and MUST NOT be made current by adoption (designation and attestation classes require the owner-rooted designation-issuance path)`,
    );
  }
  if (
    (DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES as readonly string[]).indexOf(
      adoptedClass,
    ) === -1
  ) {
    return adoptionFail(
      'NON_ADOPTABLE_CLASS',
      `artifact class "${adoptedClass}" is not an adoptable class token (closed §6.3 vocabulary)`,
    );
  }

  // Ladder step 3: class-specific preconditions (§6.3 conditional classes).
  const preconditions = candidate.classPreconditions;
  if (adoptedClass === 'external-authority' && preconditions.notADesignationSpecialization !== true) {
    return adoptionFail(
      'NON_ADOPTABLE_CLASS',
      'external-authority adoption is allowed only for declarations that are not AuthorityDesignationRef or any specialization of designation',
    );
  }
  if (adoptedClass === 'application-selection' && preconditions.selectionIdentityEstablishmentValid !== true) {
    return adoptionFail(
      'CLASS_PRECONDITION_UNSATISFIED',
      'application-selection adoption requires a valid ApplicationIdentityEstablishmentRef for the selected application identity',
    );
  }
  if (adoptedClass === 'application-semantic' && preconditions.adoptedViaNewEstablishmentRecord !== true) {
    return adoptionFail(
      'CLASS_PRECONDITION_UNSATISFIED',
      'a pre-existing ApplicationSemanticIdentity value is adoptable only via a new valid ApplicationIdentityEstablishmentRef',
    );
  }

  // Ladder step 4: exact historic-source binding (C145/C147). The adopted
  // artifact must be a foundation-minted reference carrying the exact frozen
  // predecessor-origin evidence AND its exact closed origin contract-profile
  // identity equal to the claimed origin profile — a consumer wrapper, a
  // forged carrier, a successor-native artifact presented for adoption, or a
  // claimed origin profile not recoverable from the exact historic artifact
  // (predecessor profile relabeling) all fail closed.
  if (!isDacV0041Reference(candidate.adoptedArtifactRef)) {
    return adoptionFail(
      'MALFORMED_SOURCE',
      'adopted artifact must be a reference minted by the DAC v0.0.4.1 adoption core (consumer wrappers and forged carriers fail closed)',
    );
  }
  if (candidate.adoptedArtifactRef.role !== adoptedClass) {
    return adoptionFail(
      'MALFORMED_SOURCE',
      `adopted artifact role "${String(candidate.adoptedArtifactRef.role)}" does not match the claimed adoptable class "${adoptedClass}" (a class/relabel mismatch is a consumer wrapper, not an adoption)`,
    );
  }
  if (candidate.adoptedArtifactRef.predecessorOrigin === undefined) {
    return adoptionFail(
      'MALFORMED_SOURCE',
      'adopted artifact carries no predecessor-origin evidence; a successor-native artifact needs no adoption and an older-baseline artifact must be bound through its exact frozen predecessor origin',
    );
  }
  const closedOriginProfile = candidate.adoptedArtifactRef.contractProfileIdentity;
  if (closedOriginProfile === undefined) {
    return adoptionFail(
      'MALFORMED_SOURCE',
      'adopted artifact closes over no exact origin contract-profile identity, so the claimed origin DAC/reference profile cannot be bound to this exact historic artifact (an unbound origin profile is a relabeled source, not an adoption)',
    );
  }
  if (closedOriginProfile !== candidate.originDacProfileIdentity) {
    return adoptionFail(
      'MALFORMED_SOURCE',
      `claimed origin DAC/reference profile "${candidate.originDacProfileIdentity}" is not the exact origin contract-profile identity closed over by the adopted historic artifact ("${closedOriginProfile}"); predecessor profile relabeling fails closed`,
    );
  }

  // Ladder step 5: complete re-evaluation evidence (C146 §6.2 element 5).
  // Reuse the shape-guard-narrowed local (a fresh property read would lose
  // the narrowing under exactOptionalPropertyTypes).
  const reEvaluationFlags = reEvaluation;
  if (
    !reEvaluationFlags.sourceAuthenticityEstablished ||
    !reEvaluationFlags.sourceProvenanceRecoverable ||
    !reEvaluationFlags.subjectExactnessEstablished ||
    !reEvaluationFlags.sourceCurrentnessEstablished ||
    !reEvaluationFlags.evidenceClosureRecoverable ||
    !reEvaluationFlags.classSpecificObligationsSatisfied
  ) {
    return adoptionFail(
      'REEVALUATION_INCOMPLETE',
      'adoption must bind re-evaluation evidence covering source authenticity, provenance, subject exactness, source currentness, evidence closure and all class-specific v0.0.4.1 obligations',
    );
  }

  // Ladder steps 6–7: the issuer's designation chain, evaluated chain-current
  // at the adoption point (never at the chain input's own point).
  const adoptionPoint = candidate.issuanceEvidence.point;
  const chainVerification = verifyDacV0041DesignationChain({
    ...(candidate.issuerDesignationChain),
    evaluationPoint: adoptionPoint,
  });
  if (chainVerification.outcome === 'FAIL_CLOSED') {
    return adoptionFail(
      'ADOPTION_ISSUER_CHAIN_INVALID',
      `the adoption issuer's designation chain is invalid: ${chainVerification.detail}`,
      chainVerification.code,
    );
  }
  if (chainVerification.outcome === 'STALE') {
    return adoptionFail(
      'ADOPTION_ISSUER_CHAIN_NOT_CURRENT',
      `the adoption issuer's designation chain is not chain-current at the adoption point: ${chainVerification.detail}`,
    );
  }
  const issuerChain = candidate.issuerDesignationChain;
  const issuerLeaf = issuerChain.links.find(
    (link) => link.linkIdentity === issuerChain.leafLinkIdentity,
  );
  if (issuerLeaf === undefined) {
    return adoptionFail(
      'ADOPTION_ISSUER_CHAIN_INVALID',
      'the adoption issuer chain leaf link could not be recovered',
      'CHAIN_UNRECOVERABLE',
    );
  }

  // Ladder step 8: exact issuer / role / scope coverage (C118/C147).
  if (issuerLeaf.designatedIssuerIdentity !== candidate.adoptionIssuerIdentity) {
    return adoptionFail(
      'ADOPTION_ISSUER_MISMATCH',
      'the chain-current designated issuer of the presented chain is not the adoption act issuer',
    );
  }
  if (issuerLeaf.authorityRole !== candidate.requiredIssuingRole) {
    return adoptionFail(
      'WRONG_ROLE_ISSUER',
      `adoption requires the exact class-issuing authority role "${candidate.requiredIssuingRole}" (chain leaf carries "${issuerLeaf.authorityRole}"); source ownership, payload role labels or scope ownership alone do not substitute`,
    );
  }
  if (issuerLeaf.authorityScope !== candidate.adoptedArtifactRef.authorityScope) {
    return adoptionFail(
      'SCOPE_NOT_COVERED',
      `the adoption issuer's exact authority scope "${issuerLeaf.authorityScope}" does not cover the adopted subject scope "${candidate.adoptedArtifactRef.authorityScope}"`,
    );
  }

  // Ladder step 9: constraint / profile / SoD coverage (C164).
  if (!containsAll(candidate.subjectConstraintTokens, issuerLeaf.holderConstraints)) {
    return adoptionFail(
      'CONSTRAINT_NOT_COVERED',
      'the adopted subject does not satisfy every holder/ancestor constraint of the issuer chain leaf by identical token (no normalization or narrowing)',
    );
  }
  if (issuerLeaf.dacProfileIdentity !== candidate.adoptionDacProfileIdentity) {
    return adoptionFail(
      'PROFILE_NOT_COVERED',
      `the issuer designation's DAC/reference profile "${issuerLeaf.dacProfileIdentity}" is not the exact profile the adoption is issued under ("${candidate.adoptionDacProfileIdentity}")`,
    );
  }
  const sodRelied = candidate.sodReliedPermissions ?? [];
  if (!containsAll(issuerLeaf.sodPermissions, sodRelied)) {
    return adoptionFail(
      'SOD_PERMISSION_NOT_PERMITTED',
      'the adoption act relies on a SoD/co-location permission the issuer designation does not carry',
    );
  }

  // Ladder step 10: the adoption act's own independent issuance evidence
  // (C128; F-06 §6.2 element 6).
  if (
    !evidenceNotSolelyAssertedBy(candidate.issuanceEvidence, [
      candidate.adoptionIssuerIdentity,
    ])
  ) {
    return adoptionFail(
      'ISSUANCE_EVIDENCE_UNESTABLISHED',
      'the adoption act needs issuance-point evidence not asserted solely by its own issuer',
    );
  }

  // Ladder step 11: no backdated effect (C147/C164).
  const effectivePoint = candidate.effectivePoint ?? adoptionPoint;
  if (effectivePoint < adoptionPoint) {
    return adoptionFail(
      'BACKDATED_ADOPTION',
      'adoption never creates effect before the adoption point (the older artifact\'s bytes, identity and historical provenance stay immutable)',
    );
  }

  return {
    outcome: 'ADOPTED_PROSPECTIVE',
    effectiveFrom: effectivePoint,
    newAuthoritativeIssuancePoint: adoptionPoint,
    detail: `valid prospective adoption of class "${adoptedClass}"; for new v0.0.4.1 authoritative use the adopted artifact is evaluated as if issued by the adoption issuer, effective only from ${effectivePoint}`,
  };
}

/**
 * Deterministic classifier for presenting a historic (older-baseline)
 * authority-bearing artifact for DIRECT v0.0.4.1 authoritative use
 * (F-06 §6.1; C145). A genuinely historic artifact without v0.0.4.1-valid
 * issuance-time designation evidence is `ADOPTION_REQUIRED` — the only
 * positive paths are fresh issuance or a valid AuthorityAdoptionRef; a
 * predecessor artifact is never consumer-wrapped into successor authority.
 */
export function classifyDacV0041HistoricAuthorityArtifactUse(
  facts: DacV0041HistoricArtifactUseFacts,
): DacV0041HistoricArtifactUseClassification {
  if (facts === null || typeof facts !== 'object') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'historic artifact use facts must be an object',
    };
  }
  if (typeof (facts as Partial<DacV0041HistoricArtifactUseFacts>).historicChainSatisfiesV0041 !== 'boolean') {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'INVALID_FACTS',
      detail: 'historicChainSatisfiesV0041 must be an explicit boolean fact',
    };
  }
    if (!isDacV0041Reference(facts.artifactRef)) {
    return {
      outcome: 'FAIL_CLOSED',
      code: 'MALFORMED_SOURCE',
      detail: 'artifact must be a reference minted by the DAC v0.0.4.1 adoption core (forged carriers fail closed)',
    };
  }
  if (facts.artifactRef.predecessorOrigin === undefined) {
    // Successor-native artifact: this classifier is not its gate.
    return { outcome: 'NOT_HISTORIC' };
  }
  if (facts.historicChainSatisfiesV0041) {
    return { outcome: 'NO_ADOPTION_REQUIRED' };
  }
  return { outcome: 'ADOPTION_REQUIRED' };
}
