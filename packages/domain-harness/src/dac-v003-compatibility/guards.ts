// Issue #325 / DAC v0.0.3 V3-002: adoption and guard functions for the
// compatibility-validation surface. Every nominal reference here is adopted
// through the #323 V3-001 foundation core (baseline binding, alias rejection,
// defensive freezing, private mint registry) — this module only narrows roles
// and enforces the V3-002 role-specific minimums on top. No function converts
// one lifecycle role into another, and no function manufactures selection,
// binding, activation, or satisfaction: adoption records identity only.
import {
  adoptDacV003RegistryReference,
  assertDacV003ExactnessProfile,
  isDacV003Reference,
} from '../dac-v003/guards.js';
import type { DacV003Reference, DacV003ReferenceInput } from '../dac-v003/contracts.js';
import {
  isDomainIntentRef,
  isOutcomeRef,
  isSemanticTargetRef,
  isSnapshotRef,
  isViewRef,
  isWatchRef,
} from '../dac-bridge/guards.js';
import { isRuntimeActivationRef, isRuntimeBindingRef } from '../dac/guards.js';
import type { RuntimeBindingEvidence } from '../runtime-binding/contracts.js';
import {
  DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
  DacV003CompatibilityError,
  type DacV003CapabilityRequirement,
  type DacV003CompatibilityAuthority,
  type DacV003CompatibilityResult,
  type DacV003CompatibilityResultRef,
  type DacV003CompatibilityTargetRef,
  type DacV003CompatibilityValidation,
  type DacV003CompatibilityValidationRef,
  type DacV003PortRequirement,
  type DacV003RequirementSatisfactionEvidence,
  type DacV003UxRoleAnchor,
  type DacV003UxSemanticRole,
  type DomainUXDefinitionRef,
} from './contracts.js';

/** UX-family roles that can never be satisfaction providers (§7.4). */
const UX_FAMILY_ROLES = new Set([
  'domain-ux-definition',
  'runtime-interaction-contract',
  'domain-intent',
  'semantic-target',
  'ux-view',
  'ux-snapshot',
  'ux-watch',
  'ux-outcome',
  'ux-recovery-correlation',
]);

/** Runtime-family roles that are legal satisfaction providers. */
const PROVIDER_ROLES = new Set(['runtime-host-binding', 'runtime-implementation']);

/** Roles a satisfaction evidence can link as its exact requirement. */
const SATISFIABLE_ROLES = new Set([
  'capability-requirement',
  'port-requirement',
  'runtime-host-binding-requirement',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DacV003CompatibilityError(
      'INVALID_COMPATIBILITY_REQUEST',
      `${field} must be a non-empty string`,
    );
  }
}

function requireAdopted(value: unknown, field: string): DacV003Reference {
  if (!isDacV003Reference(value)) {
    throw new DacV003CompatibilityError(
      'INVALID_COMPATIBILITY_REQUEST',
      `${field} must be an adopted DAC v0.0.3 reference; foreign, v0.0.2 or forged objects fail closed`,
    );
  }
  return value;
}

function freeze<T extends object>(value: T): T {
  return Object.freeze(value);
}

/**
 * Private mint registries for the wrapper descriptors and records minted by
 * this module: structurally identical forged objects fail the guards, so a
 * requirement/evidence claim can never be guessed into existence.
 */
const MINTED_CAPABILITY_REQUIREMENTS = new WeakSet<object>();
const MINTED_PORT_REQUIREMENTS = new WeakSet<object>();
const MINTED_SATISFACTION_EVIDENCE = new WeakSet<object>();
const MINTED_COMPATIBILITY_VALIDATIONS = new WeakSet<object>();
const MINTED_COMPATIBILITY_RESULTS = new WeakSet<object>();

// ---------------------------------------------------------------------------
// Nominal reference adoption (V3-002-owned roles, V3-001 core underneath).
// ---------------------------------------------------------------------------

/** Input for adopting the selected Domain UX semantic definition. */
export interface DomainUxDefinitionInput extends DacV003ReferenceInput {
  readonly semanticIdentity: string;
  readonly revisionIdentity: string;
}

/**
 * Adopt the exactly-1 Domain UX semantic definition: an immutable/versioned
 * semantic contract (P1 exactness). Renderer/component/DOM identity has no
 * slot here — it can only ever ride inside non-authoritative locator hints
 * or opaque fields, which this surface never reads for identity.
 */
export function adoptDomainUXDefinitionRef(input: DomainUxDefinitionInput): DomainUXDefinitionRef {
  const reference = adoptDacV003RegistryReference('domain-ux-definition', input);
  assertDacV003ExactnessProfile(reference, 'P1');
  return reference as DomainUXDefinitionRef;
}

/** Input for adopting the explicit v0.0.3 compatibility target. */
export interface DacV003CompatibilityTargetInput extends DacV003ReferenceInput {
  readonly contractProfileIdentity: string;
  readonly revisionIdentity: string;
}

/**
 * Adopt the explicit DAC v0.0.3 runtime compatibility target (P5 exactness:
 * target contract/profile identity + exact version/revision identity — no
 * ambient "current"). The declared profile key used by the validator is
 * `contractProfileIdentity@revisionIdentity`.
 */
export function adoptDacV003CompatibilityTargetRef(
  input: DacV003CompatibilityTargetInput,
): DacV003CompatibilityTargetRef {
  requireNonEmptyString(input.contractProfileIdentity, 'compatibility target contractProfileIdentity');
  requireNonEmptyString(input.revisionIdentity, 'compatibility target revisionIdentity');
  const reference = adoptDacV003RegistryReference('compatibility-target', input);
  assertDacV003ExactnessProfile(reference, 'P5');
  return reference as DacV003CompatibilityTargetRef;
}

/** Exact target profile key of an adopted compatibility target. */
export function dacV003TargetProfileKey(target: DacV003CompatibilityTargetRef): string {
  return `${target.contractProfileIdentity}@${target.revisionIdentity}`;
}

/** Requirement-descriptor fields shared by capability and Port requirements. */
interface RequirementDescriptorInput {
  readonly strength: 'required' | 'optional' | 'conditional';
  /** Present exactly when strength is 'conditional' (auditable descriptor). */
  readonly condition?: string;
  readonly qualifications?: readonly string[];
}

function validateStrength(input: RequirementDescriptorInput): void {
  if (
    input.strength !== 'required' &&
    input.strength !== 'optional' &&
    input.strength !== 'conditional'
  ) {
    throw new DacV003CompatibilityError(
      'INVALID_COMPATIBILITY_REQUEST',
      `requirement strength must be required/optional/conditional, got "${String(input.strength)}"`,
    );
  }
  if (input.strength === 'conditional') {
    requireNonEmptyString(input.condition, 'conditional requirement condition descriptor');
  } else if (input.condition !== undefined) {
    throw new DacV003CompatibilityError(
      'INVALID_COMPATIBILITY_REQUEST',
      'a condition descriptor may only accompany a conditional requirement',
    );
  }
  if (input.qualifications !== undefined) {
    if (!Array.isArray(input.qualifications)) {
      throw new DacV003CompatibilityError(
        'INVALID_COMPATIBILITY_REQUEST',
        'requirement qualifications must be an array',
      );
    }
    for (const qualification of input.qualifications) {
      requireNonEmptyString(qualification, 'requirement qualification');
    }
  }
}

/** Input for adopting a composition-declared Capability requirement. */
export interface DacV003CapabilityRequirementInput
  extends DacV003ReferenceInput, RequirementDescriptorInput {}

/**
 * Adopt a Capability requirement (APPLICATION_MANIFEST §8.1): the envelope is
 * the referrable requirement identity carrying the capability semantic
 * identity (`semanticIdentity`) and, when versioned, the required
 * contract/profile target (`contractProfileIdentity`). A declaration only —
 * never satisfaction evidence.
 */
export function adoptDacV003CapabilityRequirement(
  input: DacV003CapabilityRequirementInput,
): DacV003CapabilityRequirement {
  requireNonEmptyString(input.semanticIdentity, 'capability requirement semanticIdentity');
  validateStrength(input);
  const reference = adoptDacV003RegistryReference('capability-requirement', input);
  const requirement = freeze({
    kind: 'capability' as const,
    reference: reference as DacV003CapabilityRequirement['reference'],
    strength: input.strength,
    ...(input.condition === undefined ? {} : { condition: input.condition }),
    qualifications: freeze((input.qualifications ?? []).slice()),
  });
  MINTED_CAPABILITY_REQUIREMENTS.add(requirement);
  return requirement;
}

/** Input for adopting a composition-declared Port requirement. */
export interface DacV003PortRequirementInput
  extends DacV003ReferenceInput, RequirementDescriptorInput {
  /** Which boundary is allowed to satisfy/bind this Port (exactly 1). */
  readonly bindingAuthority: string;
}

/**
 * Adopt a Port requirement (APPLICATION_MANIFEST §8.2): adds the binding
 * authority/owner role. The binding authority does not transfer external
 * Business SoR authority to Runtime.
 */
export function adoptDacV003PortRequirement(
  input: DacV003PortRequirementInput,
): DacV003PortRequirement {
  requireNonEmptyString(input.semanticIdentity, 'port requirement semanticIdentity');
  requireNonEmptyString(input.bindingAuthority, 'port requirement bindingAuthority');
  validateStrength(input);
  const reference = adoptDacV003RegistryReference('port-requirement', input);
  const requirement = freeze({
    kind: 'port' as const,
    reference: reference as DacV003PortRequirement['reference'],
    strength: input.strength,
    ...(input.condition === undefined ? {} : { condition: input.condition }),
    bindingAuthority: input.bindingAuthority,
    qualifications: freeze((input.qualifications ?? []).slice()),
  });
  MINTED_PORT_REQUIREMENTS.add(requirement);
  return requirement;
}

/** Input for adopting exact satisfaction evidence for one requirement. */
export interface DacV003SatisfactionEvidenceInput extends DacV003ReferenceInput {
  /** The exact requirement reference being satisfied (adoption-checked). */
  readonly satisfies: unknown;
  /** The concrete runtime-family provider reference (adoption-checked). */
  readonly provider: unknown;
  /** Exact target profile the evidence is valid for. */
  readonly validForTargetProfile: string;
  /** Provenance establishing how satisfaction was determined (1..n). */
  readonly provenance: readonly unknown[];
}

/**
 * Adopt exact satisfaction evidence (APPLICATION_MANIFEST §8.3): P6 evidence
 * whose material inputs are exactly the satisfied requirement plus the
 * concrete provider, with provenance and an explicit valid-for target
 * profile. The provider MUST be runtime-family (`runtime-host-binding` /
 * `runtime-implementation`); a UX/presentation-family reference fails closed
 * with `PRESENTATION_ADAPTER_CANNOT_SATISFY` (§7.4: accessing the same host
 * platform never transfers Runtime effect authority to a renderer adapter).
 */
export function adoptDacV003RequirementSatisfactionEvidence(
  input: DacV003SatisfactionEvidenceInput,
): DacV003RequirementSatisfactionEvidence {
  const requirement = requireAdopted(input.satisfies, 'satisfaction evidence requirement link');
  if (!SATISFIABLE_ROLES.has(requirement.role)) {
    throw new DacV003CompatibilityError(
      'INVALID_SATISFACTION_EVIDENCE',
      `satisfaction evidence must link a capability/port/host-binding requirement, but the linked reference has role "${requirement.role}"`,
    );
  }
  const provider = requireAdopted(input.provider, 'satisfaction evidence provider');
  if (UX_FAMILY_ROLES.has(provider.role)) {
    throw new DacV003CompatibilityError(
      'PRESENTATION_ADAPTER_CANNOT_SATISFY',
      `a "${provider.role}" reference is UX/presentation-family and can never satisfy a Runtime capability/Port/Host-Binding requirement; a renderer adapter does not acquire Runtime effect authority by accessing the same host platform`,
    );
  }
  if (!PROVIDER_ROLES.has(provider.role)) {
    throw new DacV003CompatibilityError(
      'INVALID_SATISFACTION_EVIDENCE',
      `satisfaction evidence provider must be a concrete runtime-host-binding or runtime-implementation reference, but has role "${provider.role}"`,
    );
  }
  requireNonEmptyString(input.validForTargetProfile, 'satisfaction evidence validForTargetProfile');
  if (!Array.isArray(input.provenance) || input.provenance.length === 0) {
    throw new DacV003CompatibilityError(
      'INVALID_SATISFACTION_EVIDENCE',
      'satisfaction evidence requires at least one provenance reference establishing how satisfaction was determined (P6)',
    );
  }
  const provenanceRefs = input.provenance.map((entry, index) =>
    requireAdopted(entry, `satisfaction evidence provenance[${index}]`),
  );
  const reference = adoptDacV003RegistryReference('capability-satisfaction-evidence', {
    ...input,
    contractProfileIdentity: input.validForTargetProfile,
    materialInputRefs: [requirement, provider],
    provenanceRefs,
  });
  assertDacV003ExactnessProfile(reference, 'P6');
  const evidence = freeze({
    reference: reference as DacV003RequirementSatisfactionEvidence['reference'],
    requirement: requirement as DacV003RequirementSatisfactionEvidence['requirement'],
    provider: provider as DacV003RequirementSatisfactionEvidence['provider'],
    validForTargetProfile: input.validForTargetProfile,
  });
  MINTED_SATISFACTION_EVIDENCE.add(evidence);
  return evidence;
}

// ---------------------------------------------------------------------------
// Structural guards.
// ---------------------------------------------------------------------------

/** True only for references actually adopted as the Domain UX definition. */
export function isDomainUXDefinitionRefValue(value: unknown): value is DomainUXDefinitionRef {
  return isDacV003Reference(value) && value.role === 'domain-ux-definition';
}

/** True only for references actually adopted as the v0.0.3 compatibility target. */
export function isDacV003CompatibilityTargetRefValue(
  value: unknown,
): value is DacV003CompatibilityTargetRef {
  return isDacV003Reference(value) && value.role === 'compatibility-target';
}

/** True only for capability requirements minted by this module. */
export function isDacV003CapabilityRequirementValue(
  value: unknown,
): value is DacV003CapabilityRequirement {
  return (
    isRecord(value) &&
    MINTED_CAPABILITY_REQUIREMENTS.has(value) &&
    (value as unknown as DacV003CapabilityRequirement).kind === 'capability'
  );
}

/** True only for Port requirements minted by this module. */
export function isDacV003PortRequirementValue(value: unknown): value is DacV003PortRequirement {
  return (
    isRecord(value) &&
    MINTED_PORT_REQUIREMENTS.has(value) &&
    (value as unknown as DacV003PortRequirement).kind === 'port'
  );
}

/** True only for satisfaction evidence minted by this module. */
export function isDacV003RequirementSatisfactionEvidenceValue(
  value: unknown,
): value is DacV003RequirementSatisfactionEvidence {
  return isRecord(value) && MINTED_SATISFACTION_EVIDENCE.has(value);
}

/** True only for the compatibility validation act references this module mints. */
export function isDacV003CompatibilityValidationRefValue(
  value: unknown,
): value is DacV003CompatibilityValidationRef {
  return (
    isDacV003Reference(value) &&
    value.role === 'compatibility-validation' &&
    value.authorityScope === DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE
  );
}

/** True only for the separately-encoded result references this module mints. */
export function isDacV003CompatibilityResultRefValue(
  value: unknown,
): value is DacV003CompatibilityResultRef {
  return (
    isDacV003Reference(value) &&
    value.role === 'compatibility-result' &&
    value.authorityScope === DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE
  );
}

/** True only for validation records actually minted by the validator. */
export function isDacV003CompatibilityValidationValue(
  value: unknown,
): value is DacV003CompatibilityValidation {
  return isRecord(value) && MINTED_COMPATIBILITY_VALIDATIONS.has(value);
}

/** True only for result records actually minted by this module. */
export function isDacV003CompatibilityResultValue(
  value: unknown,
): value is DacV003CompatibilityResult {
  return isRecord(value) && MINTED_COMPATIBILITY_RESULTS.has(value);
}

// ---------------------------------------------------------------------------
// Role-inequality refutation (C56 / APPLICATION_MANIFEST §7.4 / §1).
// ---------------------------------------------------------------------------

function isRuntimeBindingEvidenceValue(value: unknown): value is RuntimeBindingEvidence {
  return (
    isRecord(value) &&
    value.binding === 'runtime-binding/1' &&
    isRuntimeBindingRef((value as unknown as RuntimeBindingEvidence).bindingRef)
  );
}

/**
 * Refutes lifecycle RuntimeBinding/activation objects in the compatibility
 * path (C56: `RuntimeHostBindingRequirementRef != RuntimeHostBindingRef !=
 * RuntimeBindingRef`). Throws `LIFECYCLE_BINDING_INPUT_REJECTED` when any
 * value is a v0.0.2 `RuntimeBindingRef`/`RuntimeActivationRef`, a #307
 * binding evidence record, or a v0.0.3 reference of role
 * `runtime-binding`/`runtime-activation`: the lifecycle binding decision is
 * stage 4 and can never be presented as, or substituted for, a host-binding
 * requirement, a concrete host-binding input, or satisfaction evidence.
 */
export function refuteDacV003LifecycleBindingInput(...values: readonly unknown[]): void {
  for (const value of values) {
    if (isRuntimeBindingRef(value) || isRuntimeActivationRef(value)) {
      throw new DacV003CompatibilityError(
        'LIFECYCLE_BINDING_INPUT_REJECTED',
        'a v0.0.2 lifecycle RuntimeBinding/Activation reference is not a host-binding requirement, concrete host binding, or compatibility-validation input; RuntimeBindingRef is a later lifecycle stage and the roles are never interchangeable',
      );
    }
    if (isRuntimeBindingEvidenceValue(value)) {
      throw new DacV003CompatibilityError(
        'LIFECYCLE_BINDING_INPUT_REJECTED',
        '#307 runtime binding evidence is stage-4 lifecycle evidence and can never be presented into the stage-3 compatibility path',
      );
    }
    if (
      isDacV003Reference(value) &&
      (value.role === 'runtime-binding' || value.role === 'runtime-activation')
    ) {
      throw new DacV003CompatibilityError(
        'LIFECYCLE_BINDING_INPUT_REJECTED',
        `a v0.0.3 "${value.role}" reference is a lifecycle role and can never occupy a host-binding requirement, concrete host binding, or satisfaction-provider position`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// UX semantic-role anchor validation (#308 consumption).
// ---------------------------------------------------------------------------

const UX_ROLE_ANCHOR_GUARDS: Record<
  DacV003UxSemanticRole,
  ((value: unknown) => boolean) | undefined
> = {
  'domain-intent': isDomainIntentRef,
  'semantic-target': isSemanticTargetRef,
  'ux-view': isViewRef,
  'ux-snapshot': isSnapshotRef,
  'ux-watch': isWatchRef,
  'ux-outcome': isOutcomeRef,
  // The #308 bridge exposes no recovery-correlation reference (that role is
  // owned by the external-operation lane), so no anchor exists for it here.
  'ux-recovery-correlation': undefined,
};

/**
 * Validate a UX semantic-role requirement anchor: when present it must be a
 * reference actually minted by the #308 correlation bridge with the matching
 * renderer-independent role. Anchors are correlation evidence only — the
 * bridge's own producer rule already forbids DOM/component identity as
 * semantic identity.
 */
export function expectDacV003UxRoleAnchor(
  role: DacV003UxSemanticRole,
  anchor: DacV003UxRoleAnchor | undefined,
): void {
  if (anchor === undefined) return;
  const guard = UX_ROLE_ANCHOR_GUARDS[role];
  if (guard === undefined) {
    throw new DacV003CompatibilityError(
      'INVALID_COMPATIBILITY_REQUEST',
      'ux-recovery-correlation has no #308 bridge anchor role; recovery correlation evidence is owned by the external-operation lane',
    );
  }
  if (!guard(anchor)) {
    throw new DacV003CompatibilityError(
      'INVALID_COMPATIBILITY_REQUEST',
      `UX semantic-role requirement "${role}" anchor must be a #308 bridge-minted reference of the matching renderer-independent role`,
    );
  }
}

// ---------------------------------------------------------------------------
// Single-authority resolution (§6.3 / §12.2).
// ---------------------------------------------------------------------------

function authorityMismatch(what: string): never {
  throw new DacV003CompatibilityError('AUTHORITY_DIVERGENCE', what);
}

/**
 * Resolve the validation authority of any view of one compatibility
 * validation — the validation act reference, the validation record, the
 * separately-encoded result reference, or the result record. Every view
 * resolves to the same `{ authorityScope, validationIdentity }` tuple; a
 * result that does not link exactly one validation in the single authority
 * scope fails closed.
 */
export function resolveDacV003CompatibilityAuthority(
  value:
    | DacV003CompatibilityValidationRef
    | DacV003CompatibilityValidation
    | DacV003CompatibilityResultRef
    | DacV003CompatibilityResult,
): DacV003CompatibilityAuthority {
  if (isDacV003CompatibilityValidationValue(value)) {
    return {
      authorityScope: value.subject.authorityScope,
      validationIdentity: value.subject.validationIdentity,
    };
  }
  if (isDacV003CompatibilityResultValue(value)) {
    return {
      authorityScope: value.authorityScope,
      validationIdentity: value.validationIdentity,
    };
  }
  if (isDacV003CompatibilityValidationRefValue(value)) {
    return { authorityScope: value.authorityScope, validationIdentity: value.primaryIdentity };
  }
  if (isDacV003CompatibilityResultRefValue(value)) {
    const links = value.materialInputRefs.filter((ref) => ref.role === 'compatibility-validation');
    const link = links.length === 1 ? links[0] : undefined;
    if (link === undefined) {
      authorityMismatch(
        `a compatibility-result reference must link exactly one compatibility-validation reference, found ${links.length}`,
      );
    }
    if (link.authorityScope !== DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE) {
      authorityMismatch(
        'the linked compatibility-validation reference is not in the single DAC v0.0.3 compatibility-validation authority scope',
      );
    }
    return { authorityScope: value.authorityScope, validationIdentity: link.primaryIdentity };
  }
  throw new DacV003CompatibilityError(
    'INVALID_COMPATIBILITY_RESULT',
    'value is not a minted compatibility validation/result view',
  );
}

/**
 * Assert that a separately-encoded result and its validation act resolve to
 * one and the same validation authority (CROSS_LAYER_REFERENCES §6.3):
 * separate representations, never separate authorities.
 */
export function assertSameDacV003CompatibilityAuthority(
  validationView: Parameters<typeof resolveDacV003CompatibilityAuthority>[0],
  resultView: Parameters<typeof resolveDacV003CompatibilityAuthority>[0],
): void {
  const left = resolveDacV003CompatibilityAuthority(validationView);
  const right = resolveDacV003CompatibilityAuthority(resultView);
  if (
    left.authorityScope !== right.authorityScope ||
    left.validationIdentity !== right.validationIdentity
  ) {
    authorityMismatch(
      `compatibility validation and result views resolve to different authorities (${left.authorityScope}|${left.validationIdentity} vs ${right.authorityScope}|${right.validationIdentity}); a second validation authority for the same exact subject/target is forbidden`,
    );
  }
}

/** Registers a validation record minted by the validator (module-internal). */
export function registerMintedCompatibilityValidation(
  validation: DacV003CompatibilityValidation,
): void {
  MINTED_COMPATIBILITY_VALIDATIONS.add(validation);
}

/** Registers a result record minted by this module (module-internal). */
export function registerMintedCompatibilityResult(result: DacV003CompatibilityResult): void {
  MINTED_COMPATIBILITY_RESULTS.add(result);
}
