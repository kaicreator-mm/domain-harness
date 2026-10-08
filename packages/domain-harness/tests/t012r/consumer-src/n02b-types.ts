/**
 * T12R-N02 type-surface proof: the clean consumer typechecks against the
 * PACKED .d.ts declarations of every declared public subpath
 * (skipLibCheck:false, strict, module nodenext — the same posture as the
 * accepted T008C public-consumer precedent).
 */
import type {
  DefinitionGraphEnvelope,
  ComponentEnvelope,
  ContentDigest,
  Sha256Port,
} from '@kaicreator/domain-harness/v7';
import {
  computeDefinitionGraphDigest,
  validateToolComponent,
  admitComponent,
  type ComponentAdmissionResult,
} from '@kaicreator/domain-harness/v7';
import {
  admitCentralDecision,
  createGovernanceExecutionPin,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  normalizeResourceCurrentnessEvidence,
  sameResourceCurrentnessEvidence,
  VolatileAdmissionEffectJournal,
  type CentralAdmissionOutcome,
  type CentralAdmissionRequest,
  type CentralAdmissionPorts,
  type GovernanceExecutionPin,
} from '@kaicreator/domain-harness/v3';
import {
  createDomainRuntimeV3,
  type DomainRuntimeV3,
} from '@kaicreator/domain-harness/v3';
import { DOMAIN_HARNESS_VERSION } from '@kaicreator/domain-harness';
import { createDomainRuntime, StaticPackageRegistry } from '@kaicreator/domain-harness/v2';
// T012R extension: the repaired candidate's new declared subpath
// ./v7/execution (T012-D1 bounded repair) — full value + type surface must
// typecheck from the packed .d.ts under strict NodeNext, skipLibCheck:false.
import {
  sealRuntimeAssembly,
  resolveCurrentCapabilityProvider,
  bindToolImplementation,
  verifyToolImplementationBinding,
  admitToolExposure,
  admitToolInvocationRequest,
  invokeNonEffectfulTool,
  invokeEffectfulTool,
  resolveToolResources,
  queryUxTool,
  invokeUxToolEffectfully,
  RuntimeAssemblyError,
  ToolImplementationBindingError,
  InvocationRequestError,
  NonEffectfulInvocationError,
  EffectfulInvocationError,
  ResourceResolutionError,
  UxToolRequestError,
  type SealRuntimeAssemblyInput,
  type SealedRuntimeAssembly,
  type CurrentCapabilityProviderSelection,
  type ToolImplementationCandidate,
  type SealedToolImplementationBinding,
  type VerifiedToolImplementationBinding,
  type AdmittedToolExposure,
  type AdmittedToolInvocationRequest,
  type NonEffectfulToolInvocationResult,
  type EffectfulToolInvocationResult,
  type ResolvedToolResources,
  type ResourceProvider,
  type JsonValue,
} from '@kaicreator/domain-harness/v7/execution';
import type {
  NodeSqliteRuntimeStoreOptions,
  NodeSqliteAuthorityStores,
  NodeSqliteAdmissionEffectJournal,
} from '@kaicreator/domain-harness-node';
import { openNodeSqliteAuthorityStores } from '@kaicreator/domain-harness-node';

export async function typeSurface(
  graph: DefinitionGraphEnvelope,
  sha256: Sha256Port,
  tool: ComponentEnvelope,
): Promise<{
  digest: ContentDigest;
  admission: ComponentAdmissionResult;
  outcome: CentralAdmissionOutcome;
}> {
  const digest: ContentDigest = await computeDefinitionGraphDigest(graph, sha256);
  validateToolComponent(tool);
  const admission = admitComponent(tool, [
    {
      kind: tool.kind,
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: (envelope) => {
        validateToolComponent(envelope);
      },
    },
  ]);

  const baselineStore = new MemoryGovernanceBaselineStore();
  const store = {
    async getGovernanceExecutionPin(_id: string): Promise<unknown> {
      return undefined;
    },
    async bindGovernanceExecutionPin(_pin: GovernanceExecutionPin): Promise<'inserted'> {
      return 'inserted';
    },
    async getGovernanceBoundSnapshot(_id: string): Promise<unknown> {
      return undefined;
    },
    async putGovernanceBoundSnapshot(_snapshot: { readonly workflowInstanceId: string }): Promise<void> {},
  };
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  const journal = new VolatileAdmissionEffectJournal();
  const ports: CentralAdmissionPorts = {
    governance: coordinator,
    baselines: baselineStore,
    sha256,
    effectJournal: journal,
    effectTools: {
      resolve: (effectType: string) =>
        effectType === 'effect:x' ? { effectType, effectSemantics: 'idempotent' as const } : undefined,
      execute: async (request) => ({ ok: request.binding.effectType }),
    },
  };
  const request = {} as CentralAdmissionRequest;
  const outcome = await admitCentralDecision(request, ports);

  const currentness = normalizeResourceCurrentnessEvidence(
    [{ providerId: 'p', resourceKey: 'k', revisionDigest: 'sha256:r', componentId: 'c' }],
    'probe',
  );
  if (currentness !== undefined) sameResourceCurrentnessEvidence(currentness, currentness);
  await createGovernanceExecutionPin(
    {
      workflowTarget: 'wf',
      workflowInstanceId: 'wf:1',
      binding: {
        domainId: 'd',
        packageId: 'p',
        domainIntelligenceContentDigest: 'cdi',
        governanceBaseline: { domainId: 'd', governanceId: 'g', schemaVersion: '1', contentDigest: 'sha256:b' },
      },
    },
    sha256,
  );

  const authorityOptions: NodeSqliteRuntimeStoreOptions = { path: 'x.db' };
  void authorityOptions;
  const authority: NodeSqliteAuthorityStores = openNodeSqliteAuthorityStores({ path: 'y.db' });
  const effectJournal: NodeSqliteAdmissionEffectJournal = authority.admissionEffectJournal;
  void effectJournal;
  authority.close();

  const v3Runtime: Promise<DomainRuntimeV3> = createDomainRuntimeV3({} as never);
  void v3Runtime;
  const registry = new StaticPackageRegistry([], 'pkg');
  void registry;
  const runtime = createDomainRuntime({} as never);
  void runtime;
  void (DOMAIN_HARNESS_VERSION satisfies '0.2.0');

  return { digest, admission, outcome };
}
// ---------------------------------------------------------------------------
// T012R extension: the ./v7/execution packed type surface resolves under
// strict NodeNext with skipLibCheck:false. Type-level assignments only (the
// runtime journeys execute in t010-journeys.mjs).
// ---------------------------------------------------------------------------
export async function executionTypeSurface(
  sealInput: SealRuntimeAssemblyInput,
  selection: CurrentCapabilityProviderSelection,
  candidate: ToolImplementationCandidate,
  binding: SealedToolImplementationBinding,
  exposure: AdmittedToolExposure,
  admitted: AdmittedToolInvocationRequest,
  provider: ResourceProvider,
  input: JsonValue,
): Promise<{
  assembly: SealedRuntimeAssembly;
  verified: VerifiedToolImplementationBinding;
  pure: NonEffectfulToolInvocationResult;
  effectful: EffectfulToolInvocationResult;
  resources: ResolvedToolResources;
}> {
  void selection;
  const assembly: SealedRuntimeAssembly = await sealRuntimeAssembly(sealInput, sha256Probe);
  void assembly;
  const providerSelection: CurrentCapabilityProviderSelection =
    await resolveCurrentCapabilityProvider({} as never, {} as never, '' as never, '' as never, sha256Probe);
  void providerSelection;
  const bound: SealedToolImplementationBinding = await bindToolImplementation({ sha256: sha256Probe } as never);
  void bound;
  void candidate;
  const verified: VerifiedToolImplementationBinding = await verifyToolImplementationBinding({
    binding,
    finalAssembly: {} as never,
    expectedImplementationPin: {} as never,
    sha256: sha256Probe,
  });
  const admittedExposure: AdmittedToolExposure = await admitToolExposure({} as never, sha256Probe);
  void admittedExposure;
  void exposure;
  const admittedRequest: AdmittedToolInvocationRequest = await admitToolInvocationRequest(
    {} as never,
    {} as never,
    sha256Probe,
  );
  void admittedRequest;
  const pure: NonEffectfulToolInvocationResult = await invokeNonEffectfulTool({ sha256: sha256Probe } as never);
  const effectful: EffectfulToolInvocationResult = await invokeEffectfulTool({ sha256: sha256Probe } as never);
  const resources: ResolvedToolResources = await resolveToolResources({ sha256: sha256Probe } as never);
  void admitToolInvocationRequest;
  void queryUxTool;
  void invokeUxToolEffectfully;
  void provider;
  void input;
  void admitted;
  void RuntimeAssemblyError;
  void ToolImplementationBindingError;
  void InvocationRequestError;
  void NonEffectfulInvocationError;
  void EffectfulInvocationError;
  void ResourceResolutionError;
  void UxToolRequestError;
  return { assembly, verified, pure, effectful, resources };
}

const sha256Probe: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return value;
  },
};
