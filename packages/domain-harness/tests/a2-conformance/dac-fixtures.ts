// Issue #311 / A2 I-008 (incremental slice over the landed I-002/#305 base):
// shared fixtures for the A2 conformance + negative suite.
//
// VOLATILE test infrastructure: this module owns no product semantics. It
// exists so the C-series adversarial cases below stay compact and so the
// I-003..I-007 increments can extend the journey/matrix in one place instead
// of forking fixtures per file.
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeActivationRef,
  adoptRuntimeBindingRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
  expectApplicationSelectionRef,
  expectCompatibilityTargetRef,
  expectPromotionDecisionRef,
  expectRuntimeActivationRef,
  expectRuntimeBindingRef,
  expectRuntimeContractRef,
  expectRuntimeImplementationRef,
  expectSelectedDomainDataRef,
  isApplicationSelectionRef,
  isCompatibilityTargetRef,
  isPromotionDecisionRef,
  isRuntimeActivationRef,
  isRuntimeBindingRef,
  isRuntimeContractRef,
  isRuntimeImplementationRef,
  isSelectedDomainDataRef,
  type ApplicationSelectionRef,
  type CompatibilityTargetRef,
  type DacReferenceAdoptionInput,
  type PromotionDecisionRef,
  type RuntimeActivationRef,
  type RuntimeBindingRef,
  type RuntimeContractRef,
  type RuntimeImplementationRef,
  type SelectedDomainDataRef,
} from '../../src/dac/index.js';

export const baseline = { ...DAC_REFERENCE_BASELINE };

/**
 * One coherent DAC composition identity story (A2 positive journey §11):
 * upstream governance promoted revision rev-000042 of the invoice-rules
 * semantic identity; the application composition layer selected exactly it.
 */
export const JOURNEY = {
  semanticIdentity: 'domain:billing:invoice-rules',
  authorityScope: 'dac://app-composition/acme',
  revisionIdentity: 'rev-000042',
  contentDigest: 'sha256:9f2c-exact-body-digest',
  runtimeContractSemanticIdentity: 'contract:domain-harness/runtime@2',
  runtimeImplementationSemanticIdentity: 'impl:domain-harness-runtime/0.3.0+build.6ff6c10',
} as const;

export function dacInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseline,
    semanticIdentity: JOURNEY.semanticIdentity,
    authorityScope: JOURNEY.authorityScope,
    revisionIdentity: JOURNEY.revisionIdentity,
    contentDigest: JOURNEY.contentDigest,
    ...overrides,
  };
}

/** All eight lifecycle roles adopted from one coherent identity story. */
export interface DacJourneyRefs {
  readonly promotion: PromotionDecisionRef;
  readonly selection: ApplicationSelectionRef;
  readonly selected: SelectedDomainDataRef;
  readonly contract: RuntimeContractRef;
  readonly implementation: RuntimeImplementationRef;
  readonly target: CompatibilityTargetRef;
  readonly binding: RuntimeBindingRef;
  readonly activation: RuntimeActivationRef;
}

export function adoptJourneyRefs(): DacJourneyRefs {
  return {
    promotion: adoptPromotionDecisionRef(dacInput() as never),
    selection: adoptApplicationSelectionRef(dacInput() as never),
    selected: adoptSelectedDomainDataRef(dacInput() as never),
    contract: adoptRuntimeContractRef(
      dacInput({ semanticIdentity: JOURNEY.runtimeContractSemanticIdentity }) as never,
    ),
    implementation: adoptRuntimeImplementationRef(
      dacInput({ semanticIdentity: JOURNEY.runtimeImplementationSemanticIdentity }) as never,
    ),
    target: adoptCompatibilityTargetRef(dacInput() as never),
    binding: adoptRuntimeBindingRef(dacInput() as never),
    activation: adoptRuntimeActivationRef(dacInput() as never),
  };
}

/** One row per lifecycle role: adopt/is-guard/expect-guard, keyed by role id. */
export interface RoleRow {
  readonly role: string;
  readonly adopt: (input: DacReferenceAdoptionInput) => unknown;
  readonly isGuard: (value: unknown) => boolean;
  readonly expectGuard: (value: unknown) => void;
}

export const ROLE_TABLE: readonly RoleRow[] = [
  {
    role: 'promotion-decision',
    adopt: (input) => adoptPromotionDecisionRef(input),
    isGuard: (value) => isPromotionDecisionRef(value),
    expectGuard: (value) => expectPromotionDecisionRef(value),
  },
  {
    role: 'application-selection',
    adopt: (input) => adoptApplicationSelectionRef(input),
    isGuard: (value) => isApplicationSelectionRef(value),
    expectGuard: (value) => expectApplicationSelectionRef(value),
  },
  {
    role: 'selected-domain-data',
    adopt: (input) => adoptSelectedDomainDataRef(input),
    isGuard: (value) => isSelectedDomainDataRef(value),
    expectGuard: (value) => expectSelectedDomainDataRef(value),
  },
  {
    role: 'runtime-contract',
    adopt: (input) => adoptRuntimeContractRef(input),
    isGuard: (value) => isRuntimeContractRef(value),
    expectGuard: (value) => expectRuntimeContractRef(value),
  },
  {
    role: 'runtime-implementation',
    adopt: (input) => adoptRuntimeImplementationRef(input),
    isGuard: (value) => isRuntimeImplementationRef(value),
    expectGuard: (value) => expectRuntimeImplementationRef(value),
  },
  {
    role: 'compatibility-target',
    adopt: (input) => adoptCompatibilityTargetRef(input),
    isGuard: (value) => isCompatibilityTargetRef(value),
    expectGuard: (value) => expectCompatibilityTargetRef(value),
  },
  {
    role: 'runtime-binding',
    adopt: (input) => adoptRuntimeBindingRef(input),
    isGuard: (value) => isRuntimeBindingRef(value),
    expectGuard: (value) => expectRuntimeBindingRef(value),
  },
  {
    role: 'runtime-activation',
    adopt: (input) => adoptRuntimeActivationRef(input),
    isGuard: (value) => isRuntimeActivationRef(value),
    expectGuard: (value) => expectRuntimeActivationRef(value),
  },
];
