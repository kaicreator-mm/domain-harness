/* eslint-disable -- T012R evidence-only clean-room consumer source; lint posture is not the evidence subject. */
/**
 * T012R EXTENSION — the accepted T010 Tool-plane journey builders, driven
 * EXCLUSIVELY through the packed PUBLIC seam namespaces injected by the
 * caller: EX = `@kaicreator/domain-harness/v7/execution` (T002B/T003B/T003C/
 * T004A/T004B/T004C/T005C/T004E seams) and V3 = `…/v3` (governance /
 * occurrence / Central Admission plane). This module imports nothing beyond
 * ./fixture.mjs and node builtins — identical posture to the prior T012
 * transcription. Every builder is a port of the in-tree accepted journey
 * material (tests/fixtures/t010a-neutral-definition.ts and the T010C
 * helpers) with byte-identical input material.
 */
import {
  T010A_CAPABILITY,
  T010A_NOW,
  T010A_OCCURRENCE_TARGET,
  T010A_OP_RECORD,
  T010A_RESOURCE_CURRENTNESS,
  T010A_RESOURCE_KEY,
  T010A_TOOL_COMPONENT_ID,
  T010A_WORKFLOW_COMPONENT_ID,
  T010A_WORKFLOW_INSTANCE_ID,
  T010A_WORKFLOW_TARGET,
  T010A_IDEMPOTENCY_KEY,
  T010A_DECISION_SCHEMA,
  T010aMemoryDurableExecutionStore,
  T010aMemoryExactPackageCdiAuthority,
  t010aDefinitionGraph,
  t010aGovernanceBody,
  t010aKindImplementationBinding,
  t010aResolvedDecision,
  t010aSha256,
  t010aToolCandidate,
  t010aToolComponent,
  t010aWorkflowDefinition,
} from './fixture.mjs';

/**
 * Seal the Runtime Assembly over the neutral Definition graph through the
 * public T002B port (packed ./v7/execution). The logical resource
 * requirement participates in Assembly identity; no implementation handle
 * enters any identity material. Port of buildT010aAssembly.
 */
const fixtureSha256 = t010aSha256;

export async function buildT010aAssembly(EX, graph = t010aDefinitionGraph(), sha256 = fixtureSha256) {
  const assembly = await EX.sealRuntimeAssembly(
    {
      definitionGraph: graph,
      kindImplementations: [t010aKindImplementationBinding()],
      resourceRequirements: [
        {
          owner: t010aToolComponent(),
          declaration: {
            componentId: T010A_TOOL_COMPONENT_ID,
            requirements: [
              {
                resourceKey: T010A_RESOURCE_KEY,
                contract: { contractId: 'test.t010a-audit-log', version: '1.0.0' },
                operationId: T010A_OP_RECORD,
                required: true,
              },
            ],
          },
        },
      ],
    },
    sha256,
  );
  return { graph, assembly, definitionGraphDigest: assembly.record.definitionGraphDigest };
}

/**
 * T003B/T003C capability binding (exact and currentness-bound): the
 * Workflow's exact required capability is resolved to its current Domain
 * Tool provider through the public T003B port, and the exact Tool
 * implementation is bound through the public T003C port (packed
 * ./v7/execution). Port of bindT010aTool.
 */
export async function bindT010aTool(EX, bundle, executor, sha256 = fixtureSha256) {
  const selection = await EX.resolveCurrentCapabilityProvider(
    bundle.graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    bundle.definitionGraphDigest,
    sha256,
  );
  return EX.bindToolImplementation({
    assembly: bundle.assembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: bundle.graph,
    implementations: [t010aToolCandidate(executor)],
    sha256,
  });
}

/** Exact exposure admission policy of the frozen journey (fixture-owned). */
export const T010A_ADMIT_ALL = { decideAdmission: () => ({ admitted: true }) };

export function t010aCaller(overrides = {}) {
  return { callerId: 'caller.t010a-session-1', callerKind: 'workflow', ...overrides };
}

/**
 * Admit one Tool operation invocation through the public T004A seam
 * (packed ./v7/execution: admitToolExposure + admitToolInvocationRequest)
 * against the exact current sealed successor Assembly. Port of
 * admitT010aOperation.
 */
export async function admitT010aOperation(EX, binding, bundle, operationId, input, sha256 = fixtureSha256) {
  const exposure = await EX.admitToolExposure(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId,
      caller: t010aCaller(),
      assembly: binding.successorAssembly,
      currentDefinitionGraph: bundle.graph,
      policy: T010A_ADMIT_ALL,
    },
    sha256,
  );
  return EX.admitToolInvocationRequest(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId,
      input,
      caller: t010aCaller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: bundle.graph },
    sha256,
  );
}

/**
 * Build ONE already-authoritative PRODUCTION occurrence for the fixture
 * Workflow (accepted T002C/T002D activation through packed ./v3; Central
 * Admission request shape; the ONE host-supplied durable effect journal).
 * Port of buildT010aOccurrenceContext. `effectInput` must equal the later
 * T004C invocation input (intent closure).
 */
export async function buildT010aOccurrenceContext(V3, binding, bundle, options = {}, sha256 = fixtureSha256) {
  const effectInput = options.effectInput ?? { note: 't010a-note' };
  const b1 = await t010aGovernanceBody(sha256, V3.createGovernanceBaselineBody);
  const baselines = new V3.MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const packageCdi = new T010aMemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 't010a',
    packageId: 'pkg-t010a-1',
    domainIntelligenceContentDigest: 'cdi-t010a-1',
  });
  const store = new T010aMemoryDurableExecutionStore();
  const activator = new V3.AssemblyExecutionActivator(store, packageCdi, baselines, sha256);
  const activationBinding = {
    domainId: 't010a',
    packageId: 'pkg-t010a-1',
    domainIntelligenceContentDigest: 'cdi-t010a-1',
    governanceBaseline: b1.identity,
  };
  const pin =
    options.skipActivation === true
      ? await V3.createGovernanceExecutionPin(
          {
            workflowTarget: T010A_WORKFLOW_TARGET,
            workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
            binding: activationBinding,
          },
          sha256,
        )
      : await activator.activate({
          workflowTarget: T010A_WORKFLOW_TARGET,
          workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
          binding: activationBinding,
          assembly: binding.successorAssembly,
          authorityClass: options.authorityClass ?? 'PRODUCTION',
          resourceCurrentness: options.resourceCurrentness ?? [T010A_RESOURCE_CURRENTNESS],
          currentDefinitionGraph: bundle.graph,
        });
  const coordinator = new V3.GovernanceExecutionCoordinator(store, sha256);
  const journal = new V3.VolatileAdmissionEffectJournal();
  const definition = t010aWorkflowDefinition(effectInput);
  const admissionRequest = {
    target: { ...T010A_OCCURRENCE_TARGET },
    turn: { kind: 'message', sourceMessageId: 'msg:t010a:1' },
    trigger: { kind: 'event', eventType: 'T010A_COMPLETE_REQUESTED' },
    workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
    definition,
    currentStateKey: 'READY',
    context: {},
    event: { type: 'T010A_COMPLETE_REQUESTED', payload: { note: 't010a-note' } },
    resolved: t010aResolvedDecision('harness-machine', {
      decision: { outcome: 'complete', data: { note: 't010a-note' } },
      event: { type: 'T010A_COMPLETE_REQUESTED', payload: { note: 't010a-note' } },
    }),
    decisionSchema: T010A_DECISION_SCHEMA,
    now: T010A_NOW,
  };
  return {
    binding,
    bundle,
    baselines,
    packageCdi,
    store,
    activator,
    pin,
    coordinator,
    journal,
    admissionPorts: { governance: coordinator, baselines, effectJournal: journal },
    admissionRequest,
    definition,
  };
}

/**
 * Self-contained SIMULATION / legacy-class-less activation substrate over
 * the SAME public ports (packed ./v3), for the T010C R5 authority-class
 * rows. Port of the T010C simulationOccurrence helper.
 */
export async function simulationOccurrence(V3, binding, bundle, authorityClass, sha256 = fixtureSha256) {
  const store = new T010aMemoryDurableExecutionStore();
  const baselines = new V3.MemoryGovernanceBaselineStore();
  const body = await V3.createGovernanceBaselineBody(
    {
      domainId: 't010a',
      governanceId: 't010c-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    sha256,
  );
  await baselines.putBody(body);
  const packageCdi = new T010aMemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 't010a',
    packageId: 'pkg-t010a-1',
    domainIntelligenceContentDigest: 'cdi-t010a-1',
  });
  const activator = new V3.AssemblyExecutionActivator(store, packageCdi, baselines, sha256);
  const governanceBaseline = body.identity;
  if (authorityClass === undefined) {
    const legacyPin = await V3.createGovernanceExecutionPin(
      {
        workflowTarget: T010A_WORKFLOW_TARGET,
        workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
        binding: {
          domainId: 't010a',
          packageId: 'pkg-t010a-1',
          domainIntelligenceContentDigest: 'cdi-t010a-1',
          governanceBaseline,
        },
        assemblyDigest: binding.successorAssembly.assemblyDigest,
      },
      sha256,
    );
    await store.bindGovernanceExecutionPin(legacyPin);
    return { activator, store, baselines };
  }
  await activator.activate({
    workflowTarget: T010A_WORKFLOW_TARGET,
    workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 't010a',
      packageId: 'pkg-t010a-1',
      domainIntelligenceContentDigest: 'cdi-t010a-1',
      governanceBaseline,
    },
    assembly: binding.successorAssembly,
    authorityClass,
    resourceCurrentness: [T010A_RESOURCE_CURRENTNESS],
    currentDefinitionGraph: bundle.graph,
  });
  return { activator, store, baselines };
}

/**
 * DERIVED exposure-material variant graph (T010C R4/R5 gate isolation ONLY —
 * never the frozen fixture; its digest necessarily differs). Same
 * components/relations/capability as the frozen graph, with
 * `declaredExposure.audiences` added to both operations. Port of the T010C
 * exposedVariantGraph helper (validation of the envelope stays the caller's
 * T004A/T003A seam duty).
 */
export function exposedVariantGraph(audiences) {
  const graph = JSON.parse(JSON.stringify(t010aDefinitionGraph()));
  const tool = graph.components.find((c) => c.componentId === T010A_TOOL_COMPONENT_ID);
  for (const operation of tool.semanticBody.operations) {
    operation.declaredExposure = { audiences: [...audiences] };
  }
  return graph;
}

export { T010A_IDEMPOTENCY_KEY };
