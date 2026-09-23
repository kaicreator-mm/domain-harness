// Issue #323 / DAC v0.0.3 V3-001: adoption, guard, exactness-profile and
// disposition functions for the v0.0.3 reference foundation. See contracts.ts
// for the frozen authority invariants and the explicit non-goals (no
// compatibility decision, no Manifest cardinality, no external-operation
// semantics, no promotion/selection, no Runtime binding/activation/transition
// authority).
//
// No function in this module converts one lifecycle role into another — that
// absence, plus the nominal role discriminant set exclusively by the adoption
// core, is the enforcement mechanism for the mandatory role inequalities
// (requirement != concrete host binding != lifecycle binding, and the §6
// unsafe-alias groups). Nothing here evaluates, decides or manufactures the
// referenced authority: adoption records identity only.
import {
  DAC_V003_BASELINE,
  DAC_V003_DISPOSITION_NAMESPACE,
  DAC_V003_PROFILE_REQUIREMENTS,
  DAC_V003_REFERENCE_DISPOSITIONS,
  DAC_V003_REFERENCE_ADAPTER_VERSION,
  DAC_V003_ROLE_REGISTRY,
  DacV003ReferenceError,
  type DacV003BaselineInput,
  type DacV003ExactnessProfile,
  type DacV003IdentityExpectation,
  type DacV003Reference,
  type DacV003ReferenceDisposition,
  type DacV003ReferenceDispositionValue,
  type DacV003ReferenceInput,
  type DacV003RegistryRole,
  type DacV003RequiredTargetState,
  type RuntimeHostBindingRef,
  type RuntimeHostBindingRequirementRef,
  type RuntimeInteractionContractRef,
} from './contracts.js';

/**
 * Mutable alias tokens that can never stand in for an exact identity
 * (CROSS_LAYER_REFERENCES §8 / conformance C39; carried from the v0.0.2
 * adapter unchanged). Matched on the trimmed, lower-cased whole token — an
 * exact identity that merely *contains* one of these words is not rejected
 * (no heuristic guessing).
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

function baselineMatches(input: DacV003BaselineInput): boolean {
  return (
    input.contract === DAC_V003_BASELINE.contract &&
    input.version === DAC_V003_BASELINE.version &&
    input.semanticFreezeCommit === DAC_V003_BASELINE.semanticFreezeCommit &&
    input.semanticFreezeTree === DAC_V003_BASELINE.semanticFreezeTree
  );
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DacV003ReferenceError(
      'INVALID_REFERENCE',
      `${field} must be a non-empty string`,
    );
  }
}

function requireExactIdentityString(value: string, field: string): void {
  requireNonEmptyString(value, field);
  if (isMutableAliasToken(value)) {
    throw new DacV003ReferenceError(
      'MUTABLE_ALIAS_REJECTED',
      `${field} "${value}" is a mutable alias (latest/current/head-style) and can never substitute an exact identity`,
    );
  }
}

function freezeAdopted<T extends object>(value: T): T {
  return Object.freeze(value);
}

/** Defensive copy of an optional string collection (never aliases the caller). */
function copyStrings(value: readonly string[] | undefined): readonly string[] {
  return value === undefined ? [] : value.slice();
}

/** Defensive copy of an optional adopted-reference collection. */
function copyRefs(
  value: readonly DacV003Reference[] | undefined,
): readonly DacV003Reference[] {
  return value === undefined ? [] : value.slice();
}

/**
 * Private adoption registry. Only references actually minted by the adoption
 * core pass the `is*`/`expect*` guards — a structurally identical forged
 * object is rejected, so a role/authority claim can never be guessed into
 * existence by a foreign carrier (fail closed, never interpreted). This
 * registry is intentionally separate from the v0.0.2 adapter's: a v0.0.2
 * adopted reference is never a v0.0.3 reference and vice versa.
 */
const ADOPTED_V003_REFERENCES = new WeakSet<object>();

function structurallyValidAdoptedReference(value: unknown): value is DacV003Reference {
  if (value === null || typeof value !== 'object') return false;
  if (!ADOPTED_V003_REFERENCES.has(value)) return false;
  const candidate = value as Partial<DacV003Reference>;
  return (
    candidate.adapter === DAC_V003_REFERENCE_ADAPTER_VERSION &&
    typeof candidate.role === 'string' &&
    (DAC_V003_ROLE_REGISTRY as readonly string[]).indexOf(candidate.role) !== -1 &&
    typeof candidate.authorityScope === 'string' &&
    candidate.authorityScope.length > 0 &&
    typeof candidate.primaryIdentity === 'string' &&
    candidate.primaryIdentity.length > 0
  );
}

function requireAdoptedRefArray(
  value: readonly DacV003Reference[] | undefined,
  field: string,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new DacV003ReferenceError('INVALID_REFERENCE', `${field} must be an array`);
  }
  for (const entry of value) {
    if (!structurallyValidAdoptedReference(entry)) {
      throw new DacV003ReferenceError(
        'INVALID_REFERENCE',
        `${field} must contain only adopted DAC v0.0.3 references; foreign, v0.0.2 or forged objects fail closed`,
      );
    }
  }
}

/** Shared adoption core: validates, nominalizes and freezes one reference. */
function adoptDacV003Reference<R extends DacV003RegistryRole>(
  role: R,
  input: DacV003ReferenceInput,
): DacV003Reference & { readonly role: R } {
  if (input === null || typeof input !== 'object') {
    throw new DacV003ReferenceError('INVALID_REFERENCE', 'adoption input must be an object');
  }
  // Runtime registry check: only canonical DAC v0.0.3 registry roles can ever
  // be minted (the type system prevents most misuse; untyped carriers must
  // still fail closed instead of smuggling a foreign role discriminant).
  if ((DAC_V003_ROLE_REGISTRY as readonly string[]).indexOf(role) === -1) {
    throw new DacV003ReferenceError(
      'INVALID_REFERENCE',
      `"${String(role)}" is not a canonical DAC v0.0.3 registry role`,
    );
  }
  const { baseline } = input;
  if (
    baseline === null ||
    typeof baseline !== 'object' ||
    !baselineMatches(baseline)
  ) {
    throw new DacV003ReferenceError(
      'UNSUPPORTED_DAC_BASELINE',
      `reference baseline must be exactly ${DAC_V003_BASELINE.contract}@${DAC_V003_BASELINE.version} semantic freeze commit ${DAC_V003_BASELINE.semanticFreezeCommit} tree ${DAC_V003_BASELINE.semanticFreezeTree}`,
    );
  }
  requireExactIdentityString(input.primaryIdentity, 'primaryIdentity');
  requireExactIdentityString(input.authorityScope, 'authorityScope');
  if (input.semanticIdentity !== undefined) {
    requireExactIdentityString(input.semanticIdentity, 'semanticIdentity');
  }
  if (input.revisionIdentity !== undefined) {
    requireExactIdentityString(input.revisionIdentity, 'revisionIdentity');
  }
  if (input.contentDigest !== undefined) {
    requireNonEmptyString(input.contentDigest, 'contentDigest');
  }
  if (input.contractProfileIdentity !== undefined) {
    requireExactIdentityString(input.contractProfileIdentity, 'contractProfileIdentity');
  }
  if (input.logicalOperationIdentity !== undefined) {
    requireExactIdentityString(input.logicalOperationIdentity, 'logicalOperationIdentity');
  }
  if (input.locatorHints !== undefined) {
    if (!Array.isArray(input.locatorHints)) {
      throw new DacV003ReferenceError(
        'INVALID_REFERENCE',
        'locatorHints must be an array of non-authoritative discovery hints',
      );
    }
    for (const hint of input.locatorHints) {
      requireNonEmptyString(hint, 'locatorHints entry');
    }
  }
  if (input.derivationOperationRef !== undefined) {
    if (!structurallyValidAdoptedReference(input.derivationOperationRef)) {
      throw new DacV003ReferenceError(
        'INVALID_REFERENCE',
        'derivationOperationRef must be an adopted DAC v0.0.3 reference',
      );
    }
  }
  requireAdoptedRefArray(input.lifecycleAuthorityRefs, 'lifecycleAuthorityRefs');
  requireAdoptedRefArray(input.parentRefs, 'parentRefs');
  requireAdoptedRefArray(input.provenanceRefs, 'provenanceRefs');
  requireAdoptedRefArray(input.evidenceRefs, 'evidenceRefs');
  requireAdoptedRefArray(input.materialInputRefs, 'materialInputRefs');
  if (input.opaque !== undefined &&
    (input.opaque === null || typeof input.opaque !== 'object' || Array.isArray(input.opaque))
  ) {
    throw new DacV003ReferenceError(
      'INVALID_REFERENCE',
      'opaque must be an object of unknown/provisional source fields',
    );
  }
  // Role-specific minimums from the frozen registry (applies to BOTH the
  // dedicated constructors and the generic registry path, so the two entry
  // styles can never diverge):
  if (role === 'runtime-host-binding-requirement') {
    if (input.requiredHostBindingRole === undefined) {
      throw new DacV003ReferenceError(
        'INVALID_REFERENCE',
        'runtime-host-binding-requirement must declare requiredHostBindingRole (what host-binding semantic role is required)',
      );
    }
    requireNonEmptyString(input.requiredHostBindingRole, 'requiredHostBindingRole');
  }
  if (role === 'runtime-host-binding') {
    if (input.semanticIdentity === undefined) {
      throw new DacV003ReferenceError(
        'INVALID_REFERENCE',
        'runtime-host-binding requires semanticIdentity naming the concrete adapter/binding implementation',
      );
    }
  }
  if (role === 'runtime-interaction-contract') {
    if (input.semanticIdentity === undefined || input.revisionIdentity === undefined) {
      throw new DacV003ReferenceError(
        'INVALID_REFERENCE',
        'runtime-interaction-contract requires semanticIdentity and exact revisionIdentity (immutable/versioned semantic contract; no floating current target)',
      );
    }
  }
  // Defensive copies with explicit annotations: every adopted reference is
  // deep-frozen and can never alias a caller-mutable array/object afterwards.
  const locatorHints: readonly string[] = copyStrings(input.locatorHints);
  const lifecycleAuthorityRefs: readonly DacV003Reference[] = copyRefs(input.lifecycleAuthorityRefs);
  const parentRefs: readonly DacV003Reference[] = copyRefs(input.parentRefs);
  const provenanceRefs: readonly DacV003Reference[] = copyRefs(input.provenanceRefs);
  const evidenceRefs: readonly DacV003Reference[] = copyRefs(input.evidenceRefs);
  const materialInputRefs: readonly DacV003Reference[] = copyRefs(input.materialInputRefs);
  const adopted = freezeAdopted({
    adapter: DAC_V003_REFERENCE_ADAPTER_VERSION,
    baseline: DAC_V003_BASELINE,
    role,
    authorityScope: input.authorityScope,
    primaryIdentity: input.primaryIdentity,
    ...(input.semanticIdentity === undefined ? {} : { semanticIdentity: input.semanticIdentity }),
    ...(input.revisionIdentity === undefined ? {} : { revisionIdentity: input.revisionIdentity }),
    ...(input.contentDigest === undefined ? {} : { contentDigest: input.contentDigest }),
    ...(input.contractProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: input.contractProfileIdentity }),
    ...(input.logicalOperationIdentity === undefined
      ? {}
      : { logicalOperationIdentity: input.logicalOperationIdentity }),
    locatorHints: freezeAdopted(locatorHints),
    lifecycleAuthorityRefs: freezeAdopted(lifecycleAuthorityRefs),
    parentRefs: freezeAdopted(parentRefs),
    ...(input.derivationOperationRef === undefined
      ? {}
      : { derivationOperationRef: input.derivationOperationRef }),
    provenanceRefs: freezeAdopted(provenanceRefs),
    evidenceRefs: freezeAdopted(evidenceRefs),
    materialInputRefs: freezeAdopted(materialInputRefs),
    ...(role === 'runtime-host-binding-requirement' && input.requiredHostBindingRole !== undefined
      ? { requiredHostBindingRole: input.requiredHostBindingRole }
      : {}),
    opaque: freezeAdopted({ ...(input.opaque ?? {}) }),
  }) as DacV003Reference & { readonly role: R };
  ADOPTED_V003_REFERENCES.add(adopted);
  return adopted;
}

/**
 * Generic registry-role adoption: the shared exact-reference primitive later
 * V3 tasks build their nominal roles on. Accepts any canonical registry role;
 * enforces the same Base Reference Obligations, alias rejection and (for the
 * three foundation roles) role-specific minimums as the dedicated
 * constructors. Minting a reference never creates the referenced decision,
 * evidence or authority, and this module deliberately provides no
 * compatibility/promotion/selection/external-operation decision semantics.
 */
export function adoptDacV003RegistryReference(
  role: DacV003RegistryRole,
  input: DacV003ReferenceInput,
): DacV003Reference {
  return adoptDacV003Reference(role, input);
}

/**
 * Adopt a composition-declared Runtime Host Binding REQUIREMENT. A
 * declaration only: never concrete binding evidence, never the lifecycle
 * `RuntimeBindingRef` (C56).
 */
export function adoptRuntimeHostBindingRequirementRef(
  input: DacV003ReferenceInput,
): RuntimeHostBindingRequirementRef {
  // The adoption core enforces this role's minimums (requiredHostBindingRole)
  // before minting, so the nominal narrowing is exact by construction.
  return adoptDacV003Reference(
    'runtime-host-binding-requirement',
    input,
  ) as RuntimeHostBindingRequirementRef;
}

/**
 * Adopt one CONCRETE host-binding adapter/implementation reference (a
 * conditional compatibility-validation input; not a requirement declaration,
 * not the lifecycle `RuntimeBindingRef`).
 */
export function adoptRuntimeHostBindingRef(
  input: DacV003ReferenceInput,
): RuntimeHostBindingRef {
  // Role minimums (semanticIdentity) enforced by the core before minting.
  return adoptDacV003Reference('runtime-host-binding', input) as RuntimeHostBindingRef;
}

/**
 * Adopt the UX↔Runtime semantic interaction contract reference (exactly 1 in
 * the supported composition; semantic compatibility target, not a renderer
 * contract; requires exact semantic + revision identity).
 */
export function adoptRuntimeInteractionContractRef(
  input: DacV003ReferenceInput,
): RuntimeInteractionContractRef {
  // Role minimums (semanticIdentity + exact revisionIdentity) enforced by the
  // core before minting.
  return adoptDacV003Reference(
    'runtime-interaction-contract',
    input,
  ) as RuntimeInteractionContractRef;
}

/** Structural guard for any adopted DAC v0.0.3 reference (unknown-safe). */
export function isDacV003Reference(value: unknown): value is DacV003Reference {
  return structurallyValidAdoptedReference(value);
}

/** Exact registry role of an adopted reference; `undefined` for non-references. */
export function getDacV003ReferenceRole(
  value: unknown,
): DacV003RegistryRole | undefined {
  return structurallyValidAdoptedReference(value) ? value.role : undefined;
}

function roleGuard<R extends DacV003RegistryRole>(role: R, value: unknown): boolean {
  return structurallyValidAdoptedReference(value) && value.role === role;
}

function expectRole<R extends DacV003RegistryRole>(
  role: R,
  value: unknown,
  description: string,
): void {
  if (!roleGuard(role, value)) {
    const actual = structurallyValidAdoptedReference(value)
      ? `"${value.role}"`
      : 'not an adopted DAC v0.0.3 reference';
    throw new DacV003ReferenceError(
      'ROLE_MISMATCH',
      `expected a ${description} reference, but received ${actual}; DAC v0.0.3 roles are never interchangeable`,
    );
  }
}

export function isRuntimeHostBindingRequirementRef(
  v: unknown,
): v is RuntimeHostBindingRequirementRef {
  return roleGuard('runtime-host-binding-requirement', v);
}
export function isRuntimeHostBindingRef(v: unknown): v is RuntimeHostBindingRef {
  return roleGuard('runtime-host-binding', v);
}
export function isRuntimeInteractionContractRef(
  v: unknown,
): v is RuntimeInteractionContractRef {
  return roleGuard('runtime-interaction-contract', v);
}

export function expectRuntimeHostBindingRequirementRef(
  v: unknown,
): asserts v is RuntimeHostBindingRequirementRef {
  expectRole('runtime-host-binding-requirement', v, 'runtime-host-binding-requirement');
}
export function expectRuntimeHostBindingRef(v: unknown): asserts v is RuntimeHostBindingRef {
  expectRole('runtime-host-binding', v, 'runtime-host-binding');
}
export function expectRuntimeInteractionContractRef(
  v: unknown,
): asserts v is RuntimeInteractionContractRef {
  expectRole('runtime-interaction-contract', v, 'runtime-interaction-contract');
}

/**
 * Fail-closed exact-identity verification. Every supplied expectation must
 * equal the adopted reference's field exactly (including expectation of a
 * field the reference does not carry). Nothing is normalized, resolved or
 * defaulted; locator hints and opaque fields are never consulted; any
 * mismatch throws `IDENTITY_MISMATCH`.
 */
export function verifyDacV003ReferenceIdentity(
  reference: DacV003Reference,
  expectation: DacV003IdentityExpectation,
): void {
  const mismatches: string[] = [];
  const fields: ReadonlyArray<readonly [string, string | undefined, string | undefined]> = [
    ['authorityScope', reference.authorityScope, expectation.authorityScope],
    ['primaryIdentity', reference.primaryIdentity, expectation.primaryIdentity],
    ['semanticIdentity', reference.semanticIdentity, expectation.semanticIdentity],
    ['revisionIdentity', reference.revisionIdentity, expectation.revisionIdentity],
    ['contentDigest', reference.contentDigest, expectation.contentDigest],
    [
      'contractProfileIdentity',
      reference.contractProfileIdentity,
      expectation.contractProfileIdentity,
    ],
    [
      'logicalOperationIdentity',
      reference.logicalOperationIdentity,
      expectation.logicalOperationIdentity,
    ],
  ];
  for (const [field, actual, expectedValue] of fields) {
    if (expectedValue !== undefined && actual !== expectedValue) {
      mismatches.push(`${field}: expected "${expectedValue}", got "${actual ?? '<absent>'}"`);
    }
  }
  if (mismatches.length > 0) {
    throw new DacV003ReferenceError(
      'IDENTITY_MISMATCH',
      `exact identity mismatch on "${reference.role}" reference: ${mismatches.join('; ')}`,
    );
  }
}

function slotValue(reference: DacV003Reference, slot: string): unknown {
  return (reference as unknown as Record<string, unknown>)[slot];
}

/**
 * Fail-closed composable exactness-profile validation (P0–P7). Checks that
 * the adopted reference carries every semantic slot the claimed profile
 * requires (transitively through `requires`), plus the P3 role rule for
 * selected Domain Data (promotion + selection lifecycle authority coverage).
 * Missing/empty slots throw `PROFILE_REQUIREMENT_UNMET` naming every gap; a
 * reference can never claim a stronger exactness class than it carries.
 * Slot PRESENCE only — semantic validity of the referenced content belongs
 * to the owning later-V3 concern, not to this foundation.
 */
export function assertDacV003ExactnessProfile(
  reference: DacV003Reference,
  profile: DacV003ExactnessProfile,
): void {
  const missing: string[] = [];
  const collect = (p: DacV003ExactnessProfile): void => {
    const requirements = DAC_V003_PROFILE_REQUIREMENTS[p];
    for (const slot of requirements.requiredSlots) {
      const value = slotValue(reference, slot);
      if (value === undefined || (Array.isArray(value) && value.length === 0)) {
        missing.push(`${p}:${slot}`);
      }
    }
    if (
      requirements.selectedDomainDataLifecycleAuthorities &&
      reference.role === 'selected-domain-data'
    ) {
      const authorities = reference.lifecycleAuthorityRefs;
      const hasPromotion = authorities.some((r) => r.role === 'promotion-decision');
      const hasSelection = authorities.some((r) => r.role === 'application-selection');
      if (!hasPromotion) missing.push('P3:lifecycleAuthorityRefs:promotion-decision');
      if (!hasSelection) missing.push('P3:lifecycleAuthorityRefs:application-selection');
    }
    for (const dep of requirements.requires) {
      collect(dep);
    }
  };
  collect(profile);
  if (missing.length > 0) {
    throw new DacV003ReferenceError(
      'PROFILE_REQUIREMENT_UNMET',
      `reference "${reference.role}" does not carry the required slots for exactness profile ${profile}: ${missing.join(', ')}`,
    );
  }
}

/**
 * Fail-closed revision/digest consistency guard (conformance C40): within one
 * authority scope, the same immutable revision identity with different
 * authoritative content digests is an identity/integrity contradiction with
 * no identity-preserving reconciliation. The same revision identity under a
 * different authority scope is a different object, not a contradiction
 * (digest equality never merges authority — C41).
 */
export function assertDacV003RevisionDigestConsistency(
  references: readonly DacV003Reference[],
): void {
  const seen = new Map<string, { scope: string; digest: string }>();
  for (const reference of references) {
    if (reference.revisionIdentity === undefined || reference.contentDigest === undefined) {
      continue;
    }
    const key = JSON.stringify([reference.authorityScope, reference.revisionIdentity]);
    const prior = seen.get(key);
    if (prior === undefined) {
      seen.set(key, { scope: reference.authorityScope, digest: reference.contentDigest });
    } else if (prior.digest !== reference.contentDigest) {
      throw new DacV003ReferenceError(
        'REVISION_DIGEST_CONTRADICTION',
        `revision "${reference.revisionIdentity}" in scope "${reference.authorityScope}" carries contradictory authoritative digests "${prior.digest}" and "${reference.contentDigest}"; no identity-preserving reconciliation exists`,
      );
    }
  }
}

/**
 * Fail-closed classification guard (conformance C60): no DAC v0.0.3
 * reference — in particular no Runtime implementation/contract/host-binding
 * reference — can ever be presented as an external Business
 * System-of-Record/Truth identity. Throws `EXTERNAL_IDENTITY_FORBIDDEN` for
 * any adopted v0.0.3 reference; this foundation deliberately exposes no
 * external-authority adoption surface at all (that lane is V3-003's).
 */
export function refuteDacV003ExternalBusinessSoRIdentity(value: unknown): void {
  if (structurallyValidAdoptedReference(value)) {
    throw new DacV003ReferenceError(
      'EXTERNAL_IDENTITY_FORBIDDEN',
      `a "${value.role}" DAC v0.0.3 reference is Harness-side composition/Runtime identity and can never substitute external Business SoR identity`,
    );
  }
}

/** Construct a namespaced reference/compatibility disposition value. */
export function dacV003ReferenceDisposition(
  value: DacV003ReferenceDispositionValue,
): DacV003ReferenceDisposition {
  if ((DAC_V003_REFERENCE_DISPOSITIONS as readonly string[]).indexOf(value) === -1) {
    throw new DacV003ReferenceError(
      'INVALID_DISPOSITION',
      `"${String(value)}" is not a dac-v003 reference/compatibility disposition; External Operation Outcomes and Authoring/Capability Exchange Outcomes are separate namespaces and must never be conflated`,
    );
  }
  return Object.freeze({ namespace: DAC_V003_DISPOSITION_NAMESPACE, value });
}

/**
 * Namespace guard: only values of the reference/compatibility disposition
 * namespace pass. Foreign outcome values (external-operation outcomes such as
 * `UNKNOWN`/`AUTHORITATIVE_COMMITTED`, authoring exchange outcomes such as
 * `accepted-for-evaluation`) are rejected by construction — anti-conflation
 * is normative, token spelling stays PROVISIONAL.
 */
export function isDacV003ReferenceDisposition(
  value: unknown,
): value is DacV003ReferenceDisposition {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV003ReferenceDisposition>;
  return (
    candidate.namespace === DAC_V003_DISPOSITION_NAMESPACE &&
    typeof candidate.value === 'string' &&
    (DAC_V003_REFERENCE_DISPOSITIONS as readonly string[]).indexOf(candidate.value) !== -1
  );
}

/**
 * The repaired required-target disposition rule (CROSS_LAYER_REFERENCES §8;
 * conformance C43/C44), as pure vocabulary — no compatibility evaluation
 * happens here:
 *
 * ```text
 * presence 'missing'                                => FAIL_CLOSED
 * presence 'explicit' + declaredSupport 'unsupported' => INCOMPATIBLE
 * ```
 *
 * The input type cannot express "explicit + supported": deciding support of
 * an explicit target is compatibility-evaluation authority owned by V3-002,
 * and this function can never emit `COMPATIBLE`. The withdrawn #34-base
 * missing-target/unknown hybrid disposition is neither representable nor
 * producible.
 */
export function classifyDacV003RequiredTargetState(
  state: DacV003RequiredTargetState,
): DacV003ReferenceDisposition {
  if (state.presence === 'missing') {
    return dacV003ReferenceDisposition('FAIL_CLOSED');
  }
  return dacV003ReferenceDisposition('INCOMPATIBLE');
}
