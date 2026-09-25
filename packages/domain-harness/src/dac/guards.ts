// Issue #305 / A2 I-002: adoption, verification and role-guard functions for
// the DAC cross-layer reference adapter. See contracts.ts for the frozen
// authority invariants. No function in this module converts one lifecycle role
// into another — that absence is the enforcement mechanism for the mandatory
// role inequalities (promotion != selection, selection != binding,
// binding != activation, contract != implementation, target != selection).
import {
  DAC_REFERENCE_ADAPTER_VERSION,
  DAC_REFERENCE_BASELINE,
  DAC_REFERENCE_ROLES,
  DacReferenceError,
  type ApplicationSelectionRef,
  type CompatibilityTargetRef,
  type DacReference,
  type DacReferenceAdoptionInput,
  type DacReferenceBaselineInput,
  type DacReferenceIdentityExpectation,
  type DacReferenceRole,
  type PromotionDecisionRef,
  type RuntimeActivationRef,
  type RuntimeBindingRef,
  type RuntimeContractRef,
  type RuntimeImplementationRef,
  type SelectedDomainDataRef,
} from './contracts.js';

/**
 * Mutable alias tokens that can never stand in for an exact selected
 * revision identity (A2 N01 / DAC C02). Matched on the trimmed, lower-cased
 * whole token — an exact revision id that merely *contains* one of these
 * words is not rejected (no heuristic guessing).
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

function isMutableAliasToken(value: string): boolean {
  return MUTABLE_ALIAS_TOKENS.has(value.trim().toLowerCase());
}

function baselineMatches(input: DacReferenceBaselineInput): boolean {
  return (
    input.contract === DAC_REFERENCE_BASELINE.contract &&
    input.version === DAC_REFERENCE_BASELINE.version &&
    input.baselineCommit === DAC_REFERENCE_BASELINE.baselineCommit
  );
}

function requireNonEmptyString(
  value: unknown,
  field: string,
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DacReferenceError(
      'INVALID_REFERENCE',
      `${field} must be a non-empty string`,
    );
  }
}

function freezeAdopted<T extends object>(value: T): T {
  return Object.freeze(value);
}

/**
 * Private adoption registry. Only references actually minted by an `adopt*Ref`
 * constructor pass the `is*`/`expect*` guards — a structurally identical
 * forged object is rejected, so a role/authority claim can never be guessed
 * into existence by a foreign carrier (fail closed, never interpreted).
 */
const ADOPTED_REFERENCES = new WeakSet<object>();

/** Shared adoption core: validates, nominalizes and freezes one reference. */
function adoptDacReference<R extends DacReferenceRole>(
  role: R,
  input: DacReferenceAdoptionInput,
): DacReference & { readonly role: R } {
  if (input === null || typeof input !== 'object') {
    throw new DacReferenceError('INVALID_REFERENCE', 'adoption input must be an object');
  }
  const { baseline } = input;
  if (
    baseline === null ||
    typeof baseline !== 'object' ||
    !baselineMatches(baseline)
  ) {
    throw new DacReferenceError(
      'UNSUPPORTED_DAC_BASELINE',
      `reference baseline must be exactly ${DAC_REFERENCE_BASELINE.contract}@${DAC_REFERENCE_BASELINE.version} commit ${DAC_REFERENCE_BASELINE.baselineCommit}`,
    );
  }
  requireNonEmptyString(input.semanticIdentity, 'semanticIdentity');
  requireNonEmptyString(input.authorityScope, 'authorityScope');
  if (input.revisionIdentity !== undefined) {
    requireNonEmptyString(input.revisionIdentity, 'revisionIdentity');
    if (isMutableAliasToken(input.revisionIdentity)) {
      throw new DacReferenceError(
        'MUTABLE_ALIAS_REJECTED',
        `revisionIdentity "${input.revisionIdentity}" is a mutable alias (latest/current/head-style) and can never substitute an exact selected revision identity`,
      );
    }
  }
  if (input.contentDigest !== undefined) {
    requireNonEmptyString(input.contentDigest, 'contentDigest');
  }
  if (
    input.opaque !== undefined &&
    (input.opaque === null || typeof input.opaque !== 'object' || Array.isArray(input.opaque))
  ) {
    throw new DacReferenceError(
      'INVALID_REFERENCE',
      'opaque must be an object of unknown/provisional source fields',
    );
  }
  if (role === 'selected-domain-data') {
    // Exact selected Domain Data identity requires the exact immutable
    // revision AND the exact content digest (A2 N01: reject until exact
    // selected revision + digest + selection exist).
    if (input.revisionIdentity === undefined || input.contentDigest === undefined) {
      throw new DacReferenceError(
        'INVALID_REFERENCE',
        'selected-domain-data requires exact revisionIdentity and contentDigest',
      );
    }
  }
  const adopted: DacReference & { readonly role: R } = freezeAdopted({
    adapter: DAC_REFERENCE_ADAPTER_VERSION,
    baseline: DAC_REFERENCE_BASELINE,
    role,
    semanticIdentity: input.semanticIdentity,
    authorityScope: input.authorityScope,
    ...(input.revisionIdentity === undefined ? {} : { revisionIdentity: input.revisionIdentity }),
    ...(input.contentDigest === undefined ? {} : { contentDigest: input.contentDigest }),
    opaque: freezeAdopted({ ...(input.opaque ?? {}) }),
  }) as DacReference & { readonly role: R };
  ADOPTED_REFERENCES.add(adopted);
  return adopted;
}

/** Adopt upstream governance promotion-decision provenance. */
export function adoptPromotionDecisionRef(
  input: DacReferenceAdoptionInput,
): PromotionDecisionRef {
  return adoptDacReference('promotion-decision', input);
}

/** Adopt application/composition-layer selection provenance. */
export function adoptApplicationSelectionRef(
  input: DacReferenceAdoptionInput,
): ApplicationSelectionRef {
  return adoptDacReference('application-selection', input);
}

/** Adopt the exact selected Domain Data identity (revision + digest required). */
export function adoptSelectedDomainDataRef(
  input: DacReferenceAdoptionInput,
): SelectedDomainDataRef {
  return adoptDacReference('selected-domain-data', input);
}

/** Adopt a Runtime contract identity reference. */
export function adoptRuntimeContractRef(
  input: DacReferenceAdoptionInput,
): RuntimeContractRef {
  return adoptDacReference('runtime-contract', input);
}

/** Adopt a concrete Runtime implementation identity reference. */
export function adoptRuntimeImplementationRef(
  input: DacReferenceAdoptionInput,
): RuntimeImplementationRef {
  return adoptDacReference('runtime-implementation', input);
}

/** Adopt an explicit compatibility-target reference. */
export function adoptCompatibilityTargetRef(
  input: DacReferenceAdoptionInput,
): CompatibilityTargetRef {
  return adoptDacReference('compatibility-target', input);
}

/** Adopt Runtime binding evidence (never selection, never activation). */
export function adoptRuntimeBindingRef(
  input: DacReferenceAdoptionInput,
): RuntimeBindingRef {
  return adoptDacReference('runtime-binding', input);
}

/** Adopt Runtime activation evidence (never selection, never binding). */
export function adoptRuntimeActivationRef(
  input: DacReferenceAdoptionInput,
): RuntimeActivationRef {
  return adoptDacReference('runtime-activation', input);
}

function structurallyValidAdoptedReference(value: unknown): value is DacReference {
  if (value === null || typeof value !== 'object') return false;
  if (!ADOPTED_REFERENCES.has(value)) return false;
  const candidate = value as Partial<DacReference> & { role?: unknown };
  return (
    candidate.adapter === DAC_REFERENCE_ADAPTER_VERSION &&
    typeof candidate.role === 'string' &&
    (DAC_REFERENCE_ROLES as readonly string[]).indexOf(candidate.role) !== -1 &&
    typeof candidate.semanticIdentity === 'string' &&
    candidate.semanticIdentity.length > 0 &&
    typeof candidate.authorityScope === 'string' &&
    candidate.authorityScope.length > 0 &&
    (candidate.revisionIdentity === undefined || typeof candidate.revisionIdentity === 'string') &&
    (candidate.contentDigest === undefined || typeof candidate.contentDigest === 'string')
  );
}

/** Structural guard for any adopted DAC reference (unknown-safe). */
export function isDacReference(value: unknown): value is DacReference {
  return structurallyValidAdoptedReference(value);
}

/** Exact role of an adopted reference; `undefined` for non-references. */
export function getDacReferenceRole(value: unknown): DacReferenceRole | undefined {
  return structurallyValidAdoptedReference(value) ? value.role : undefined;
}

function roleGuard<R extends DacReferenceRole>(role: R, value: unknown): boolean {
  return structurallyValidAdoptedReference(value) && value.role === role;
}

function expectRole<R extends DacReferenceRole>(
  role: R,
  value: unknown,
  description: string,
): void {
  if (!roleGuard(role, value)) {
    const actual =
      structurallyValidAdoptedReference(value) ? `"${value.role}"` : 'not an adopted DAC reference';
    throw new DacReferenceError(
      'ROLE_MISMATCH',
      `expected a ${description} reference, but received ${actual}; DAC lifecycle roles are never interchangeable`,
    );
  }
}

export function isPromotionDecisionRef(v: unknown): v is PromotionDecisionRef {
  return roleGuard('promotion-decision', v);
}
export function isApplicationSelectionRef(v: unknown): v is ApplicationSelectionRef {
  return roleGuard('application-selection', v);
}
export function isSelectedDomainDataRef(v: unknown): v is SelectedDomainDataRef {
  return roleGuard('selected-domain-data', v);
}
export function isRuntimeContractRef(v: unknown): v is RuntimeContractRef {
  return roleGuard('runtime-contract', v);
}
export function isRuntimeImplementationRef(v: unknown): v is RuntimeImplementationRef {
  return roleGuard('runtime-implementation', v);
}
export function isCompatibilityTargetRef(v: unknown): v is CompatibilityTargetRef {
  return roleGuard('compatibility-target', v);
}
export function isRuntimeBindingRef(v: unknown): v is RuntimeBindingRef {
  return roleGuard('runtime-binding', v);
}
export function isRuntimeActivationRef(v: unknown): v is RuntimeActivationRef {
  return roleGuard('runtime-activation', v);
}

export function expectPromotionDecisionRef(v: unknown): asserts v is PromotionDecisionRef {
  expectRole('promotion-decision', v, 'promotion-decision');
}
export function expectApplicationSelectionRef(v: unknown): asserts v is ApplicationSelectionRef {
  expectRole('application-selection', v, 'application-selection');
}
export function expectSelectedDomainDataRef(v: unknown): asserts v is SelectedDomainDataRef {
  expectRole('selected-domain-data', v, 'selected-domain-data');
}
export function expectRuntimeContractRef(v: unknown): asserts v is RuntimeContractRef {
  expectRole('runtime-contract', v, 'runtime-contract');
}
export function expectRuntimeImplementationRef(v: unknown): asserts v is RuntimeImplementationRef {
  expectRole('runtime-implementation', v, 'runtime-implementation');
}
export function expectCompatibilityTargetRef(v: unknown): asserts v is CompatibilityTargetRef {
  expectRole('compatibility-target', v, 'compatibility-target');
}
export function expectRuntimeBindingRef(v: unknown): asserts v is RuntimeBindingRef {
  expectRole('runtime-binding', v, 'runtime-binding');
}
export function expectRuntimeActivationRef(v: unknown): asserts v is RuntimeActivationRef {
  expectRole('runtime-activation', v, 'runtime-activation');
}

/**
 * Fail-closed exact-identity verification. Every supplied expectation must
 * equal the adopted reference's field exactly (including expectation of a
 * field the reference does not carry). Nothing is normalized, resolved or
 * defaulted; any mismatch throws `IDENTITY_MISMATCH`.
 */
export function verifyDacReferenceIdentity(
  reference: DacReference,
  expectation: DacReferenceIdentityExpectation,
): void {
  const mismatches: string[] = [];
  if (expectation.semanticIdentity !== undefined) {
    if (reference.semanticIdentity !== expectation.semanticIdentity) {
      mismatches.push(
        `semanticIdentity: expected "${expectation.semanticIdentity}", got "${reference.semanticIdentity ?? '<absent>'}"`,
      );
    }
  }
  if (expectation.authorityScope !== undefined) {
    if (reference.authorityScope !== expectation.authorityScope) {
      mismatches.push(
        `authorityScope: expected "${expectation.authorityScope}", got "${reference.authorityScope ?? '<absent>'}"`,
      );
    }
  }
  if (expectation.revisionIdentity !== undefined) {
    if (reference.revisionIdentity !== expectation.revisionIdentity) {
      mismatches.push(
        `revisionIdentity: expected "${expectation.revisionIdentity}", got "${reference.revisionIdentity ?? '<absent>'}"`,
      );
    }
  }
  if (expectation.contentDigest !== undefined) {
    if (reference.contentDigest !== expectation.contentDigest) {
      mismatches.push(
        `contentDigest: expected "${expectation.contentDigest}", got "${reference.contentDigest ?? '<absent>'}"`,
      );
    }
  }
  if (mismatches.length > 0) {
    throw new DacReferenceError(
      'IDENTITY_MISMATCH',
      `exact identity mismatch on "${reference.role}" reference: ${mismatches.join('; ')}`,
    );
  }
}

/**
 * Fail-closed classification guard: no adapter-adopted reference — in
 * particular no `RuntimeImplementationRef` — can ever be presented as an
 * external Business System-of-Record/Truth identity. Throws
 * `EXTERNAL_IDENTITY_FORBIDDEN` for any adopted DAC reference; this adapter
 * deliberately exposes no external-authority adoption surface at all.
 */
export function refuteExternalBusinessSoRIdentity(value: unknown): void {
  if (structurallyValidAdoptedReference(value)) {
    throw new DacReferenceError(
      'EXTERNAL_IDENTITY_FORBIDDEN',
      `a "${value.role}" DAC reference is ${value.role === 'runtime-implementation' || value.role === 'runtime-contract' || value.role === 'compatibility-target' || value.role === 'runtime-binding' || value.role === 'runtime-activation' ? 'Runtime-technical' : 'DAC lifecycle'} identity and can never substitute external Business SoR identity`,
    );
  }
}
