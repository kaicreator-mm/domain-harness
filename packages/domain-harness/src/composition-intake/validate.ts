// Issue #306 / A2 I-003 core: fail-closed validation of an already-decided
// DAC-aware composition against the concrete compiled package and a declared
// runtime compatibility target. Validation sequence per L2 A2 §6.2 Boundary B:
// reference integrity -> exact selected-ref/package mapping -> compiled
// package integrity -> runtime contract/implementation/target/capability
// compatibility -> verdict. No step resolves an incompatibility by selecting
// another package, and no step manufactures promotion/selection/binding/
// activation evidence.
import type { CapabilityId } from '../v2/contracts/capability.js';
import type { TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import { PackageActivationError } from '../package/errors.js';
import { validateCompiledPackage } from '../package/validation.js';
import {
  adoptCompatibilityTargetRef,
  expectApplicationSelectionRef,
  expectCompatibilityTargetRef,
  expectPromotionDecisionRef,
  expectRuntimeContractRef,
  expectRuntimeImplementationRef,
  expectSelectedDomainDataRef,
} from '../dac/guards.js';
import { DAC_REFERENCE_BASELINE } from '../dac/contracts.js';
import type {
  ApplicationSelectionRef,
  CompatibilityTargetRef,
  PromotionDecisionRef,
  RuntimeContractRef,
  RuntimeImplementationRef,
  SelectedDomainDataRef,
} from '../dac/contracts.js';
import {
  COMPOSITION_INTAKE_ADAPTER_VERSION,
  CompositionIntakeError,
  type RuntimeCompatibilityEnvironment,
  type SelectedCompositionValidation,
  type SelectedCompositionRequest,
} from './contracts.js';

const CAPABILITY_ID_PATTERN = /^.+@\d+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CompositionIntakeError(
      'INVALID_COMPOSITION_INTAKE',
      `environment declaration field "${field}" must be a non-empty string`,
    );
  }
}

function requireMajor(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new CompositionIntakeError(
      'INVALID_COMPOSITION_INTAKE',
      `environment declaration field "${field}" must be a non-negative integer`,
    );
  }
  return value;
}

function requireCapabilities(value: unknown): readonly CapabilityId[] {
  if (!Array.isArray(value)) {
    throw new CompositionIntakeError(
      'INVALID_COMPOSITION_INTAKE',
      'environment declaration field "hostCapabilities" must be an array',
    );
  }
  for (const capability of value) {
    if (typeof capability !== 'string' || !CAPABILITY_ID_PATTERN.test(capability)) {
      throw new CompositionIntakeError(
        'INVALID_COMPOSITION_INTAKE',
        `environment host capability "${String(capability)}" is not a valid name@major capability id`,
      );
    }
  }
  return value as readonly CapabilityId[];
}

/**
 * Validates the concrete environment declaration. Every dimension a C23/N09
 * compatibility claim requires is mandatory: a target declared as only "the
 * current DomainHarness" (no concrete implementation identity/version/build)
 * can never reach package validation.
 */
function validateEnvironment(environment: RuntimeCompatibilityEnvironment): void {
  if (!isRecord(environment)) {
    throw new CompositionIntakeError(
      'INVALID_COMPOSITION_INTAKE',
      'environment declaration must be an object',
    );
  }
  requireNonEmptyString(environment.formatVersion, 'formatVersion');
  requireMajor(environment.runtimeContractMajor, 'runtimeContractMajor');
  requireMajor(environment.executionEngineMajor, 'executionEngineMajor');
  requireNonEmptyString(environment.targetProfileId, 'targetProfileId');
  requireCapabilities(environment.hostCapabilities);

  if (
    !isRecord(environment.implementation) ||
    !isRecord(environment.sha256) ||
    typeof environment.sha256.digestUtf8 !== 'function'
  ) {
    throw new CompositionIntakeError(
      'INVALID_COMPOSITION_INTAKE',
      'environment must declare a concrete runtime implementation and a sha256 port',
    );
  }
  requireNonEmptyString(environment.implementation.identity, 'implementation.identity');
  requireNonEmptyString(environment.implementation.version, 'implementation.version');
  requireNonEmptyString(environment.implementation.build, 'implementation.build');
}

/**
 * Canonical compatibility-target material: the exact dimension set the intake
 * validates against, encoded deterministically (fixed key order, sorted unique
 * capabilities). The digest over this material is the content identity of the
 * emitted CompatibilityTargetRef evidence.
 */
function canonicalCompatibilityTargetMaterial(
  environment: RuntimeCompatibilityEnvironment,
): string {
  return JSON.stringify({
    authority: 'domain-harness/compatibility-target',
    formatVersion: environment.formatVersion,
    runtimeContractMajor: environment.runtimeContractMajor,
    executionEngineMajor: environment.executionEngineMajor,
    targetProfileId: environment.targetProfileId,
    hostCapabilities: [...new Set(environment.hostCapabilities)].sort(),
  });
}

/** Content digest of the exact compatibility target the intake validates against. */
export async function computeCompatibilityTargetDigest(
  environment: RuntimeCompatibilityEnvironment,
): Promise<string> {
  validateEnvironment(environment);
  return environment.sha256.digestUtf8(canonicalCompatibilityTargetMaterial(environment));
}

function provenanceMismatch(detail: string): never {
  throw new CompositionIntakeError(
    'PROVENANCE_CHAIN_MISMATCH',
    `composition provenance contradicts the exact selected identity: ${detail}`,
  );
}

/**
 * Chain consistency between the consumed lifecycle refs (fail closed on any
 * contradiction or missing required identity evidence — PRD A2 §3.1):
 *
 * ```text
 * promotion decision --pins--> exact revision (+ digest when present)
 * application selection --pins--> exact revision + digest
 * selected Domain Data --is--> that exact semantic/revision/digest identity
 * ```
 */
function validateProvenanceChain(
  promotion: PromotionDecisionRef,
  selection: ApplicationSelectionRef,
  selected: SelectedDomainDataRef,
): void {
  if (promotion.semanticIdentity !== selected.semanticIdentity) {
    provenanceMismatch(
      `promotion decision names semantic identity "${promotion.semanticIdentity}" but the selected identity is "${selected.semanticIdentity}"`,
    );
  }
  if (promotion.revisionIdentity === undefined) {
    provenanceMismatch('promotion decision does not pin the exact selected revision');
  } else if (promotion.revisionIdentity !== selected.revisionIdentity) {
    provenanceMismatch(
      `promotion decision pins revision "${promotion.revisionIdentity}" but the selected revision is "${selected.revisionIdentity}"`,
    );
  }
  if (promotion.contentDigest !== undefined && promotion.contentDigest !== selected.contentDigest) {
    provenanceMismatch(
      `promotion decision digest "${promotion.contentDigest}" contradicts the selected digest "${selected.contentDigest}"`,
    );
  }

  if (selection.semanticIdentity !== selected.semanticIdentity) {
    provenanceMismatch(
      `application selection names semantic identity "${selection.semanticIdentity}" but the selected identity is "${selected.semanticIdentity}"`,
    );
  }
  if (selection.revisionIdentity === undefined) {
    provenanceMismatch('application selection does not pin the exact selected revision');
  } else if (selection.revisionIdentity !== selected.revisionIdentity) {
    provenanceMismatch(
      `application selection pins revision "${selection.revisionIdentity}" but the selected revision is "${selected.revisionIdentity}"`,
    );
  }
  if (selection.contentDigest === undefined) {
    provenanceMismatch('application selection does not pin the exact selected digest');
  } else if (selection.contentDigest !== selected.contentDigest) {
    provenanceMismatch(
      `application selection digest "${selection.contentDigest}" contradicts the selected digest "${selected.contentDigest}"`,
    );
  }
}

/** N08: the contract and implementation refs must not share one identity tuple. */
function rejectRoleIdentityCollapse(
  runtimeContract: RuntimeContractRef,
  runtimeImplementation: RuntimeImplementationRef,
): void {
  if (
    runtimeContract.semanticIdentity === runtimeImplementation.semanticIdentity &&
    runtimeContract.authorityScope === runtimeImplementation.authorityScope &&
    runtimeContract.revisionIdentity === runtimeImplementation.revisionIdentity &&
    runtimeContract.contentDigest === runtimeImplementation.contentDigest
  ) {
    throw new CompositionIntakeError(
      'ROLE_IDENTITY_COLLAPSE',
      'runtime contract and runtime implementation references carry the same full identity tuple; ' +
        'RuntimeContractRef != RuntimeImplementationRef must remain separately referrable',
    );
  }
}

/**
 * Exact selected-ref -> concrete compiled package mapping (L2 step 2). The
 * mapping is validated against the declared manifest identity fields; the
 * subsequent package integrity validation proves those declarations authentic
 * by recomputing the content-derived packageId.
 */
function validateSelectedPackageMapping(
  selected: SelectedDomainDataRef,
  compiledPackage: TargetCompiledDomainPackage,
): void {
  const wrapper = compiledPackage as unknown;
  if (!isRecord(wrapper) || !isRecord(wrapper.manifest)) {
    throw new CompositionIntakeError(
      'INVALID_COMPOSITION_PACKAGE',
      'compiled package manifest is missing or malformed; exact selected mapping cannot be validated',
    );
  }
  const declared = wrapper.manifest as Record<'domainId' | 'domainVersion' | 'packageId', string>;
  for (const field of ['domainId', 'domainVersion', 'packageId'] as const) {
    if (typeof declared[field] !== 'string' || declared[field].length === 0) {
      throw new CompositionIntakeError(
        'INVALID_COMPOSITION_PACKAGE',
        `compiled package manifest identity field "${field}" is missing or malformed; exact selected mapping cannot be validated`,
      );
    }
  }

  const mismatches: string[] = [];
  if (selected.semanticIdentity !== declared.domainId) {
    mismatches.push(
      `semanticIdentity: selected "${selected.semanticIdentity}" but compiled package domainId "${declared.domainId}"`,
    );
  }
  if (selected.revisionIdentity !== declared.domainVersion) {
    mismatches.push(
      `revisionIdentity: selected "${selected.revisionIdentity}" but compiled package domainVersion "${declared.domainVersion}"`,
    );
  }
  if (selected.contentDigest !== declared.packageId) {
    mismatches.push(
      `contentDigest: selected "${selected.contentDigest}" but compiled package packageId "${declared.packageId}"`,
    );
  }
  if (mismatches.length > 0) {
    throw new CompositionIntakeError(
      'SELECTED_IDENTITY_MISMATCH',
      'the selected Domain Data identity does not map exactly onto the concrete compiled package',
      mismatches,
    );
  }
}

/**
 * L2 step 3+4: current compiled package integrity plus explicit runtime
 * contract/implementation/target/capability compatibility, delegated to the
 * existing fail-closed compatibility authority.
 */
async function validatePackageAgainstEnvironment(
  request: SelectedCompositionRequest,
): Promise<TargetCompiledDomainPackage> {
  try {
    return await validateCompiledPackage(request.compiledPackage, {
      formatVersion: request.environment.formatVersion,
      runtimeContractMajor: request.environment.runtimeContractMajor,
      executionEngineMajor: request.environment.executionEngineMajor,
      targetProfileId: request.environment.targetProfileId,
      hostCapabilities: request.environment.hostCapabilities,
      sha256: request.environment.sha256,
    });
  } catch (error) {
    if (!(error instanceof PackageActivationError)) throw error;
    if (error.code === 'INCOMPATIBLE_PACKAGE') {
      throw new CompositionIntakeError(
        'INCOMPATIBLE_SELECTED_COMPOSITION',
        'the selected compiled package is incompatible with the declared runtime compatibility ' +
          'target; explicit upstream reselection is required and the runtime never substitutes ' +
          'latest, default or another revision',
        error.details,
      );
    }
    throw new CompositionIntakeError(
      'INVALID_COMPOSITION_PACKAGE',
      `the supplied compiled package failed integrity validation: ${error.message}`,
      [`packageActivationCode=${error.code}`, ...error.details],
    );
  }
}

function validateRuntimeReferenceBindings(
  request: SelectedCompositionRequest,
  targetDigest: string,
): void {
  const { runtimeContract, runtimeImplementation, compatibilityTarget, environment } = request;

  if (
    runtimeContract.revisionIdentity === undefined ||
    runtimeContract.revisionIdentity !== String(environment.runtimeContractMajor)
  ) {
    throw new CompositionIntakeError(
      'RUNTIME_CONTRACT_MISMATCH',
      'the declared runtime contract revision does not match the concrete runtime contract major',
      [
        `declared=${runtimeContract.revisionIdentity ?? '<absent>'}`,
        `concrete=${environment.runtimeContractMajor}`,
      ],
    );
  }

  const implementation = environment.implementation;
  const implementationMismatches: string[] = [];
  if (runtimeImplementation.semanticIdentity !== implementation.identity) {
    implementationMismatches.push(
      `identity: declared "${runtimeImplementation.semanticIdentity}" but concrete "${implementation.identity}"`,
    );
  }
  if (runtimeImplementation.revisionIdentity === undefined) {
    implementationMismatches.push('version: declared implementation ref pins no concrete version');
  } else if (runtimeImplementation.revisionIdentity !== implementation.version) {
    implementationMismatches.push(
      `version: declared "${runtimeImplementation.revisionIdentity}" but concrete "${implementation.version}"`,
    );
  }
  if (runtimeImplementation.contentDigest === undefined) {
    implementationMismatches.push('build: declared implementation ref pins no concrete build');
  } else if (runtimeImplementation.contentDigest !== implementation.build) {
    implementationMismatches.push(
      `build: declared "${runtimeImplementation.contentDigest}" but concrete "${implementation.build}"`,
    );
  }
  if (implementationMismatches.length > 0) {
    throw new CompositionIntakeError(
      'RUNTIME_IMPLEMENTATION_MISMATCH',
      'the declared concrete runtime implementation identity/version/build does not match the environment',
      implementationMismatches,
    );
  }

  const targetMismatches: string[] = [];
  if (
    compatibilityTarget.revisionIdentity === undefined ||
    compatibilityTarget.revisionIdentity !== environment.targetProfileId
  ) {
    targetMismatches.push(
      `targetProfileId: declared "${compatibilityTarget.revisionIdentity ?? '<absent>'}" but concrete "${environment.targetProfileId}"`,
    );
  }
  if (
    compatibilityTarget.contentDigest !== undefined &&
    compatibilityTarget.contentDigest !== targetDigest
  ) {
    targetMismatches.push(
      `contentDigest: declared "${compatibilityTarget.contentDigest}" but canonical target digest "${targetDigest}"`,
    );
  }
  if (targetMismatches.length > 0) {
    throw new CompositionIntakeError(
      'COMPATIBILITY_TARGET_MISMATCH',
      'the declared compatibility target does not match the concrete validated target',
      targetMismatches,
    );
  }
}

function freeze<T extends object>(value: T): T {
  return Object.freeze(value);
}

/**
 * Validates an already-decided DAC-aware composition against the concrete
 * compiled package and runtime compatibility target (fail closed on every
 * mismatch). Returns stage-3 compatibility evidence only — never a selection,
 * never a binding, never an activation.
 */
export async function validateSelectedComposition(
  request: SelectedCompositionRequest,
): Promise<SelectedCompositionValidation> {
  if (!isRecord(request)) {
    throw new CompositionIntakeError(
      'INVALID_COMPOSITION_INTAKE',
      'composition intake request must be an object',
    );
  }
  validateEnvironment(request.environment);

  // Reference integrity: only refs adopted through the #305 adapter core of
  // the exact role pass — forged objects and wrong-role lifecycle refs fail
  // closed here before any mapping is attempted.
  expectPromotionDecisionRef(request.promotionDecision);
  expectApplicationSelectionRef(request.applicationSelection);
  expectSelectedDomainDataRef(request.selectedDomainData);
  expectRuntimeContractRef(request.runtimeContract);
  expectRuntimeImplementationRef(request.runtimeImplementation);
  expectCompatibilityTargetRef(request.compatibilityTarget);

  validateProvenanceChain(
    request.promotionDecision,
    request.applicationSelection,
    request.selectedDomainData,
  );
  rejectRoleIdentityCollapse(request.runtimeContract, request.runtimeImplementation);
  validateSelectedPackageMapping(request.selectedDomainData, request.compiledPackage);

  const validatedPackage = await validatePackageAgainstEnvironment(request);

  const targetDigest = await computeCompatibilityTargetDigest(request.environment);
  validateRuntimeReferenceBindings(request, targetDigest);

  const emittedCompatibilityTarget: CompatibilityTargetRef = adoptCompatibilityTargetRef({
    baseline: { ...DAC_REFERENCE_BASELINE },
    semanticIdentity: `domain-harness/compatibility-target/${request.environment.targetProfileId}`,
    authorityScope: 'domain-harness://runtime/compatibility',
    revisionIdentity: request.environment.targetProfileId,
    contentDigest: targetDigest,
    opaque: {
      formatVersion: request.environment.formatVersion,
      runtimeContractMajor: request.environment.runtimeContractMajor,
      executionEngineMajor: request.environment.executionEngineMajor,
      hostCapabilities: [...new Set(request.environment.hostCapabilities)].sort(),
    },
  });

  return freeze({
    intake: COMPOSITION_INTAKE_ADAPTER_VERSION,
    validatedPackageId: validatedPackage.manifest.packageId,
    validatedPackage,
    selectedDomainData: request.selectedDomainData,
    provenance: freeze({
      promotionDecision: request.promotionDecision,
      applicationSelection: request.applicationSelection,
    }),
    declared: freeze({
      runtimeContract: request.runtimeContract,
      runtimeImplementation: request.runtimeImplementation,
    }),
    compatibilityTarget: emittedCompatibilityTarget,
    compatibility: freeze({
      formatVersion: request.environment.formatVersion,
      runtimeContractMajor: request.environment.runtimeContractMajor,
      executionEngineMajor: request.environment.executionEngineMajor,
      targetProfileId: request.environment.targetProfileId,
      requiredCapabilities: validatedPackage.manifest.requiredCapabilities,
      providedCapabilities: [...new Set(request.environment.hostCapabilities)].sort(),
      runtimeImplementation: freeze({ ...request.environment.implementation }),
    }),
  });
}
