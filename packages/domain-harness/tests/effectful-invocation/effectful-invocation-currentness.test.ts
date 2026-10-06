/**
 * T004C tests-first matrix — resource resolution/currentness composition
 * (issue #874; authority #589 PACK-C T004C section + #672 readiness
 * RESOURCE_CURRENTNESS/DUPLICATE_EFFECT_SAFETY posture).
 *
 * Covers the PACK-C T004C resource/currentness test list:
 *  - required resources resolve ONLY through the accepted T005B seam before
 *    dispatch and reach the effect dispatch with their resolved entries;
 *  - T005C exact resource-currentness evidence is consumed on the SAME
 *    occurrence pin: fresh T005B currentness pins must exactly equal the
 *    evidence durably pinned for the occurrence;
 *  - a stale/replaced resource revision or provider fails closed BEFORE any
 *    side effect (RESOURCE_CURRENTNESS_MISMATCH propagated unchanged);
 *  - sealed-Assembly requirements without an injected provider fail closed
 *    before dispatch; a provider failure is terminal and redacted;
 *  - zero dispatch and zero journal effect for every resource rejection.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealRuntimeAssemblyInput,
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../src/contracts/invocation-request.js';
import {
  ResourceResolutionError,
  type ResourceCurrentnessEvidence,
  type ResourceProvider,
  type ResourceProviderResponse,
} from '../../src/contracts/resource-resolution.js';
import {
  invokeEffectfulTool,
  type EffectfulToolDispatchPort,
  type EffectfulToolDispatchQuery,
  type InvokeEffectfulToolInput,
} from '../../src/contracts/effectful-invocation.js';
import type { GovernanceBaselineBody } from '../../src/governance/index.js';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/effect-journal.js';
import type {
  CentralAdmissionPorts,
  CentralAdmissionRequest,
} from '../../src/admission/contracts.js';
import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';
import type { DecisionResolverSource, ResolvedDecision } from '../../src/decision-resolver/index.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Definition-plane fixtures.
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.t004c-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.t004c-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.charge',
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'non-idempotent',
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.t004c', components: [consumer(), toolComponent()], relations: [] };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'test.t004c-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.t004c-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

function candidate(): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId: 'impl.charge.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.charge.alpha-content',
    },
    supportedOperations: ['op.charge'],
    handle: { kind: 'runtime-handle', id: 'handle.charge#1' },
  };
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'workflow' };
}

const WORKFLOW_TARGET = 'orders.charge';
const WORKFLOW_INSTANCE_ID = 'orders.charge:instance:9';
const OCCURRENCE_TARGET: WorkflowAddress = { workflowId: 'orders.charge', instanceKey: 'instance:9' };
const NOW = '2026-10-06T12:00:00.000Z';
const EFFECT_TYPE = 'effect:charge';
const LEDGER_PIN_V1: ResourceCurrentnessEvidence = {
  componentId: 'tool.alpha',
  providerId: 'provider.ledger',
  resourceKey: 'res.ledger',
  revisionDigest: 'sha256:ledger-revision-1',
};
const LEDGER_PIN_V2: ResourceCurrentnessEvidence = {
  componentId: 'tool.alpha',
  providerId: 'provider.ledger',
  resourceKey: 'res.ledger',
  revisionDigest: 'sha256:ledger-revision-2',
};

class MemoryExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #records = new Map<string, GovernancePackageCdiBinding>();

  add(binding: GovernancePackageCdiBinding): void {
    this.#records.set(this.#key(binding), { ...binding });
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    const record = this.#records.get(this.#key(binding));
    return record === undefined ? undefined : { ...record };
  }

  #key(binding: GovernancePackageCdiBinding): string {
    return `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`;
  }
}

class MemoryDurableExecutionStore implements DurableExecutionStore {
  readonly #pins = new Map<string, unknown>();
  readonly #snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(id: string): Promise<unknown> {
    return this.#pins.get(id);
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<'inserted' | 'existing' | 'conflict'> {
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    return JSON.stringify(existing) === JSON.stringify(pin) ? 'existing' : 'conflict';
  }

  async getGovernanceBoundSnapshot(id: string): Promise<unknown> {
    return this.#snapshots.get(id);
  }

  async putGovernanceBoundSnapshot(snapshot: { readonly workflowInstanceId: string }): Promise<void> {
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

function resourceSealOverrides(): Partial<SealRuntimeAssemblyInput> {
  return {
    resourceRequirements: [
      {
        owner: toolComponent(),
        declaration: {
          componentId: 'tool.alpha',
          requirements: [
            {
              resourceKey: 'res.ledger',
              required: true,
              contract: { contractId: 'res.contract.ledger', version: '1.0.0' },
            },
          ],
        },
      },
    ],
  };
}

function workflowDefinition(): DomainWorkflowDefinition {
  return {
    workflowKey: 'order-charge',
    initialState: 'review',
    initialContext: {},
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'charge',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'charged',
            effectIntents: [{ effectType: EFFECT_TYPE, input: { amount: 42 } }],
          },
        ],
      },
      { stateKey: 'charged', kind: 'final' },
    ],
  };
}

function resolvedDecision(): ResolvedDecision<JsonValue> {
  const source: DecisionResolverSource = 'harness-machine';
  return {
    source,
    structuredDecision: {
      decision: { outcome: 'charge', data: { amount: 42 } },
      event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
    },
    provenance: {},
    freshModelCallCount: 1,
    llmAvoided: false,
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}

const decisionSchema = {
  isValid(value: JsonValue): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record['decision'] === 'object' &&
      record['decision'] !== null &&
      typeof record['event'] === 'object' &&
      record['event'] !== null
    );
  },
};

interface Fixture {
  g: DefinitionGraphEnvelope;
  binding: SealedToolImplementationBinding;
  admitted: AdmittedToolInvocationRequest;
  pin: GovernanceExecutionPin;
  activator: AssemblyExecutionActivator;
  journal: VolatileAdmissionEffectJournal;
  admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  admissionRequest: CentralAdmissionRequest;
}

async function governanceBody(): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    realSha256,
  );
}

async function fixture(pinnedEvidence: readonly ResourceCurrentnessEvidence[] = [LEDGER_PIN_V1]): Promise<Fixture> {
  const g = graph();
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [kindBinding()], ...resourceSealOverrides() },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { capabilityId: 'cap.charge', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [candidate()],
    sha256: realSha256,
  });
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.charge',
      caller: caller(),
      assembly: binding.successorAssembly,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.charge',
      input: { amount: 42 },
      caller: caller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: g },
    realSha256,
  );

  const b1 = await governanceBody();
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, realSha256);
  const pin = await activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
      governanceBaseline: b1.identity,
    },
    assembly: binding.successorAssembly,
    authorityClass: 'PRODUCTION',
    resourceCurrentness: pinnedEvidence,
    currentDefinitionGraph: g,
  });
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);
  const journal = new VolatileAdmissionEffectJournal();
  const admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'> = {
    governance: coordinator,
    baselines,
    effectJournal: journal,
  };
  const admissionRequest: CentralAdmissionRequest = {
    target: OCCURRENCE_TARGET,
    turn: { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition: workflowDefinition(),
    currentStateKey: 'review',
    context: {},
    event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
    resolved: resolvedDecision(),
    decisionSchema,
    now: NOW,
  };
  return { g, binding, admitted, pin, activator, journal, admissionPorts, admissionRequest };
}

/** A T005B provider whose resolved responses carry the given currentness pins. */
function ledgerProvider(
  pins: Readonly<Record<string, string>>,
  requests: string[] = [],
  failure?: () => never,
): ResourceProvider {
  return {
    async resolve(request) {
      requests.push(request.resourceKey);
      if (failure !== undefined) failure();
      const revisionDigest = pins[request.resourceKey];
      if (revisionDigest === undefined) {
        return { status: 'absent' } satisfies ResourceProviderResponse;
      }
      return {
        status: 'resolved',
        handle: { id: `handle.${request.resourceKey}` },
        // exactOptionalPropertyTypes: an absent contract must be OMITTED, not
        // explicitly undefined.
        ...(request.contract === undefined ? {} : { contract: request.contract }),
        currentnessPin: {
          providerId: 'provider.ledger',
          resourceKey: request.resourceKey,
          revisionDigest,
        },
      } satisfies ResourceProviderResponse;
    },
  };
}

function recordingDispatch(calls: EffectfulToolDispatchQuery[]): EffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return { charged: true };
    },
  };
}

function invocationInput(
  fx: Fixture,
  overrides: Partial<InvokeEffectfulToolInput> = {},
): InvokeEffectfulToolInput {
  return {
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    effectType: EFFECT_TYPE,
    dispatch: recordingDispatch([]),
    sha256: realSha256,
    ...overrides,
  } as InvokeEffectfulToolInput;
}

// ---------------------------------------------------------------------------
// Current currentness: fresh T005B pins equal the pinned occurrence evidence.
// ---------------------------------------------------------------------------

test('PACK-C T004C resources: required resources resolve through T005B, their exact currentness pins re-prove the pinned occurrence evidence, and the effect executes', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const providerRequests: string[] = [];
  const fx = await fixture([LEDGER_PIN_V1]);
  const provider = ledgerProvider({ 'res.ledger': LEDGER_PIN_V1.revisionDigest }, providerRequests);

  const result = await invokeEffectfulTool(
    invocationInput(fx, { dispatch: recordingDispatch(calls), resourceProvider: provider }),
  );

  assert.equal(result.outcome.status, 'admitted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.resources.size, 1);
  const entry = calls[0]!.resources.get('res.ledger');
  assert.equal(entry?.status, 'resolved');
  assert.deepEqual(entry?.status === 'resolved' ? entry.currentnessPin : undefined, {
    providerId: 'provider.ledger',
    resourceKey: 'res.ledger',
    revisionDigest: LEDGER_PIN_V1.revisionDigest,
  });
  // Exactly one provider call per applicable requirement, before dispatch.
  assert.deepEqual(providerRequests, ['res.ledger']);
  // Exactly one completed journal record.
  const records = fx.journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.status, 'completed');
});

// ---------------------------------------------------------------------------
// Stale/replaced revision: fails BEFORE any side effect.
// ---------------------------------------------------------------------------

test('PACK-C T004C resource currentness: a replaced resource revision fails RESOURCE_CURRENTNESS_MISMATCH before the effect — zero dispatch, zero journal', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture([LEDGER_PIN_V1]);
  // The provider now attests revision 2: the occurrence pin carries revision 1.
  const provider = ledgerProvider({ 'res.ledger': LEDGER_PIN_V2.revisionDigest });

  await assert.rejects(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls), resourceProvider: provider })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, 'RESOURCE_CURRENTNESS_MISMATCH');
      return true;
    },
  );
  assert.equal(calls.length, 0, 'no Tool dispatch may happen on stale resource currentness');
  assert.equal(fx.journal.getRecords().length, 0, 'no journal effect may be recorded');
});

test('PACK-C T004C resource currentness: a provider that stops attesting the pinned revision (resolved without a pin) fails closed before the effect', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture([LEDGER_PIN_V1]);
  // The resource still resolves, but the provider no longer supplies the
  // exact currentness pin — the pinned occurrence currentness cannot be
  // re-proven and the invocation fails closed before any side effect.
  const provider: ResourceProvider = {
    async resolve(request) {
      return {
        status: 'resolved',
        handle: { id: `handle.${request.resourceKey}` },
        // exactOptionalPropertyTypes: an absent contract must be OMITTED, not
        // explicitly undefined.
        ...(request.contract === undefined ? {} : { contract: request.contract }),
      } satisfies ResourceProviderResponse;
    },
  };

  await assert.rejects(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls), resourceProvider: provider })),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'RESOURCE_CURRENTNESS_MISMATCH');
      return true;
    },
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.journal.getRecords().length, 0);
});

// ---------------------------------------------------------------------------
// Missing provider / provider failure: terminal, before dispatch.
// ---------------------------------------------------------------------------

test('PACK-C T004C resources: sealed-Assembly requirements without an injected provider fail MISSING_RESOURCE_PROVIDER before dispatch', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture([LEDGER_PIN_V1]);

  await assert.rejects(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
    (error: unknown) => {
      assert.ok(error instanceof ResourceResolutionError === false);
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, 'MISSING_RESOURCE_PROVIDER');
      return true;
    },
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.journal.getRecords().length, 0);
});

test('PACK-C T004C resources: a throwing provider surfaces as typed RESOURCE_PROVIDER_FAILURE without leaking provider text, before any effect', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture([LEDGER_PIN_V1]);
  const provider: ResourceProvider = {
    async resolve() {
      throw new Error('ledger connection secret 5ecret-token');
    },
  };

  await assert.rejects(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls), resourceProvider: provider })),
    (error: unknown) => {
      assert.ok(error instanceof ResourceResolutionError);
      assert.equal(error.code, 'RESOURCE_PROVIDER_FAILURE');
      assert.doesNotMatch(error.message, /5ecret-token/);
      return true;
    },
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.journal.getRecords().length, 0);
});

test('PACK-C T004C resources: a missing REQUIRED resource fails MISSING_REQUIRED_RESOURCE before dispatch and never retries', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture([LEDGER_PIN_V1]);
  const providerRequests: string[] = [];
  const provider = ledgerProvider({}, providerRequests);

  await assert.rejects(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls), resourceProvider: provider })),
    (error: unknown) => {
      assert.ok(error instanceof ResourceResolutionError);
      assert.equal(error.code, 'MISSING_REQUIRED_RESOURCE');
      return true;
    },
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.journal.getRecords().length, 0);
  // Terminal: exactly one provider call, never a retry.
  assert.deepEqual(providerRequests, ['res.ledger']);
});
