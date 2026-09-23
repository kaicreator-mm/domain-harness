// Issue #325 / DAC v0.0.3 V3-002 shared test fixture: builds a GENUINE #306
// stage-3 exact-selection verdict (the mandatory upstream evidence) plus the
// standard v0.0.3 compatibility inputs, so every focused test validates the
// real consumption path instead of mocking it.
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
} from '../../src/dac/index.js';
import {
  validateSelectedComposition,
  type RuntimeCompatibilityEnvironment,
  type SelectedCompositionRequest,
  type SelectedCompositionValidation,
} from '../../src/composition-intake/index.js';
import {
  DAC_V003_BASELINE,
  adoptRuntimeHostBindingRef,
  adoptRuntimeHostBindingRequirementRef,
  adoptRuntimeInteractionContractRef,
} from '../../src/dac-v003/index.js';
import {
  adoptDacV003CapabilityRequirement,
  adoptDacV003CompatibilityTargetRef,
  adoptDacV003PortRequirement,
  adoptDacV003RequirementSatisfactionEvidence,
  adoptDomainUXDefinitionRef,
  type DacV003CapabilityRequirement,
  type DacV003PortRequirement,
  type DacV003RequirementSatisfactionEvidence,
} from '../../src/dac-v003-compatibility/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';
import type {
  DacV003CompatibilityTargetRef,
  DacV003CompatibilityValidationRequest,
  DomainUXDefinitionRef,
} from '../../src/dac-v003-compatibility/index.js';
import type { RuntimeInteractionContractRef } from '../../src/dac-v003/index.js';
import type { RuntimeHostBindingRequirementRef } from '../../src/dac-v003/index.js';

const ENV_CONTRACT_MAJOR = 2;
const ENV_ENGINE_MAJOR = 1;
const ENV_FORMAT = '1';
const ENV_PROFILE = 'node-test';
const ENV_CAPS = ['tool.host-local@1'] as const;
const ENV_IMPLEMENTATION = {
  identity: 'domain-harness-runtime',
  version: '0.3.0',
  build: 'build-9f2c1',
} as const;

export const V003_TARGET_PROFILE = 'domain-harness@v0.0.3-profile/node-1';

export function intakeEnvironment(
  overrides: Partial<RuntimeCompatibilityEnvironment> = {},
): RuntimeCompatibilityEnvironment {
  return {
    formatVersion: ENV_FORMAT,
    runtimeContractMajor: ENV_CONTRACT_MAJOR,
    executionEngineMajor: ENV_ENGINE_MAJOR,
    targetProfileId: ENV_PROFILE,
    hostCapabilities: [...ENV_CAPS],
    implementation: { ...ENV_IMPLEMENTATION },
    sha256: createSha256Fake(),
    ...overrides,
  };
}

/** A genuine #306 stage-3 verdict for the exact compiled package. */
export async function buildIntakeVerdict(): Promise<SelectedCompositionValidation> {
  const compiled = await createCompiledPackage('rev-000042');
  const domainId = compiled.manifest.domainId;
  const revision = compiled.manifest.domainVersion;
  const digest = compiled.manifest.packageId;
  const baseline = { ...DAC_REFERENCE_BASELINE };
  const request: SelectedCompositionRequest = {
    promotionDecision: adoptPromotionDecisionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://governance/promotion',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    applicationSelection: adoptApplicationSelectionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    selectedDomainData: adoptSelectedDomainDataRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    runtimeContract: adoptRuntimeContractRef({
      baseline,
      semanticIdentity: 'domain-harness/runtime-contract',
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: String(ENV_CONTRACT_MAJOR),
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline,
      semanticIdentity: ENV_IMPLEMENTATION.identity,
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: ENV_IMPLEMENTATION.version,
      contentDigest: ENV_IMPLEMENTATION.build,
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline,
      semanticIdentity: `domain-harness/compatibility-target/${ENV_PROFILE}`,
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: ENV_PROFILE,
    }),
    compiledPackage: compiled,
    environment: intakeEnvironment(),
  };
  return validateSelectedComposition(request);
}

export interface V003Refs {
  readonly uxDefinition: DomainUXDefinitionRef;
  readonly interactionContract: RuntimeInteractionContractRef;
  readonly target: DacV003CompatibilityTargetRef;
  readonly hostBindingRequirement: RuntimeHostBindingRequirementRef;
  readonly hostBinding: ReturnType<typeof adoptRuntimeHostBindingRef>;
  readonly capabilityRequirement: DacV003CapabilityRequirement;
  readonly portRequirement: DacV003PortRequirement;
  readonly capabilityEvidence: DacV003RequirementSatisfactionEvidence;
  readonly portEvidence: DacV003RequirementSatisfactionEvidence;
  readonly hostBindingEvidence: DacV003RequirementSatisfactionEvidence;
}

/** The standard v0.0.3 refs, all adopted through the real surfaces. */
export function buildV003Refs(): V003Refs {
  const baseline = { ...DAC_V003_BASELINE };
  const uxDefinition = adoptDomainUXDefinitionRef({
    baseline,
    authorityScope: 'dac://domain-ux/acme',
    primaryIdentity: 'ux-def/tally-ledger-1',
    semanticIdentity: 'tally-ledger-ux',
    revisionIdentity: 'ux-rev-3',
  });
  const interactionContract = adoptRuntimeInteractionContractRef({
    baseline,
    authorityScope: 'domain-harness://runtime/interaction',
    primaryIdentity: 'interaction/tally-semantic-1',
    semanticIdentity: 'tally-semantic-interaction',
    revisionIdentity: 'interaction-rev-2',
  });
  const target = adoptDacV003CompatibilityTargetRef({
    baseline,
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'compat-target/node-v003-1',
    contractProfileIdentity: 'domain-harness',
    revisionIdentity: 'v0.0.3-profile/node-1',
  });
  const hostBindingRequirement = adoptRuntimeHostBindingRequirementRef({
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'hb-req/sqlite-storage-1',
    requiredHostBindingRole: 'runtime-port/sqlite-storage',
  });
  const hostBinding = adoptRuntimeHostBindingRef({
    baseline,
    authorityScope: 'domain-harness://host-bindings',
    primaryIdentity: 'hb/node-sqlite-1',
    semanticIdentity: 'node-sqlite-adapter',
  });
  const capabilityRequirement = adoptDacV003CapabilityRequirement({
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'cap-req/persistence-1',
    semanticIdentity: 'capability/durable-storage',
    strength: 'required',
  });
  const portRequirement = adoptDacV003PortRequirement({
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'port-req/query-port-1',
    semanticIdentity: 'port/domain-query',
    strength: 'required',
    bindingAuthority: 'runtime-binding-authority',
  });
  const provenance = [hostBinding];
  const capabilityEvidence = adoptDacV003RequirementSatisfactionEvidence({
    baseline,
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'evidence/cap-persistence-1',
    satisfies: capabilityRequirement.reference,
    provider: hostBinding,
    validForTargetProfile: V003_TARGET_PROFILE,
    provenance,
  });
  const portEvidence = adoptDacV003RequirementSatisfactionEvidence({
    baseline,
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'evidence/port-query-1',
    satisfies: portRequirement.reference,
    provider: hostBinding,
    validForTargetProfile: V003_TARGET_PROFILE,
    provenance,
  });
  const hostBindingEvidence = adoptDacV003RequirementSatisfactionEvidence({
    baseline,
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'evidence/hb-sqlite-1',
    satisfies: hostBindingRequirement,
    provider: hostBinding,
    validForTargetProfile: V003_TARGET_PROFILE,
    provenance,
  });
  return {
    uxDefinition,
    interactionContract,
    target,
    hostBindingRequirement,
    hostBinding,
    capabilityRequirement,
    portRequirement,
    capabilityEvidence,
    portEvidence,
    hostBindingEvidence,
  };
}

/** A request whose closure is fully satisfied => COMPATIBLE. */
export async function buildCompatibleRequest(
  overrides: {
    [K in keyof DacV003CompatibilityValidationRequest]?:
      | DacV003CompatibilityValidationRequest[K]
      | undefined;
  } = {},
): Promise<DacV003CompatibilityValidationRequest> {
  const verdict = await buildIntakeVerdict();
  const refs = buildV003Refs();
  // The mapped-with-undefined override type lets tests explicitly clear
  // optional fields; the runtime validator treats undefined as absent.
  return {
    selectionValidation: verdict,
    compatibilityTarget: refs.target,
    supportedTargetProfiles: [V003_TARGET_PROFILE],
    domainUxDefinition: refs.uxDefinition,
    runtimeInteractionContract: refs.interactionContract,
    interactionCoverage: ['domain-intent', 'semantic-target', 'ux-view', 'ux-outcome'],
    uxSemanticRoleRequirements: [
      { role: 'domain-intent', required: true },
      { role: 'semantic-target', required: true },
      { role: 'ux-view', required: true },
      { role: 'ux-outcome', required: false },
    ],
    capabilityRequirements: [refs.capabilityRequirement],
    portRequirements: [refs.portRequirement],
    hostBindingRequirements: [refs.hostBindingRequirement],
    satisfactionEvidence: [
      refs.capabilityEvidence,
      refs.portEvidence,
      refs.hostBindingEvidence,
    ],
    sha256: createSha256Fake(),
    ...overrides,
  } as DacV003CompatibilityValidationRequest;
}
