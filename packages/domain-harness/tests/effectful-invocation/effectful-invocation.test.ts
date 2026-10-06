/**
 * T004C tests-first matrix — Effectful Tool invocation anchored to an
 * already-authoritative occurrence through the existing Central Admission
 * (issue #874, fine-grained DAG T004C; authority #589 PACK-C T004C section +
 * #672 readiness VERDICT=READY_CURRENT).
 *
 * Covers the PACK-C T004C test list (main matrix):
 *  - successful production effect under ONE already-authoritative occurrence
 *    and the exact current T003C binding, dispatched only through the existing
 *    Central Admission durable-effect path (no second journal/runtime);
 *  - effect=none operations never enter the effectful path (T004B owns them):
 *    typed fail-closed before any dispatch and before any journal record;
 *  - pre-effect rejection for stale/forged request, Assembly, binding,
 *    occurrence/pin: zero Tool dispatch and zero journal effect;
 *  - SIMULATION -> production durable-effect rejection before side effect;
 *    legacy class-less and missing pins fail closed (T002D semantics
 *    propagated unchanged, never upgraded);
 *  - a replaced implementation binding (new successor Assembly) can never ride
 *    an occurrence pin bound to the previous Assembly (bind-once);
 *  - caller/Agent/UX material cannot supply or forge an occurrence/effect
 *    authority verdict: no verdict field is representable on the closed input
 *    and no caller material can substitute the durable pin gates;
 *  - torn occurrence identity: caller mutation of the admission turn material
 *    mid-flight cannot redirect the effect to a fresh occurrence/effect
 *    namespace (module-owned identity snapshot).
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
  type ToolImplementationIdentity,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../src/contracts/invocation-request.js';
import type { ResourceProvider, ResourceProviderResponse } from '../../src/contracts/resource-resolution.js';
import {
  EffectfulInvocationError,
  invokeEffectfulTool,
  type EffectfulToolDispatchPort,
  type EffectfulToolDispatchQuery,
  type EffectfulToolInvocationResult,
  type InvokeEffectfulToolInput,
} from '../../src/contracts/effectful-invocation.js';
import type { GovernanceBaselineBody } from '../../src/governance/index.js';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  createGovernanceExecutionPin,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/effect-journal.js';
import { deriveDurableControlTurnId } from '../../src/admission/admission.js';
import type {
  CentralAdmissionPorts,
  CentralAdmissionRequest,
} from '../../src/admission/contracts.js';
import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';
import type { DecisionResolverSource, ResolvedDecision } from '../../src/decision-resolver/index.js';
import type { JsonObject, JsonValue } from '../../src/contracts/json.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Definition-plane fixtures: one consumer + one Domain Tool provider.
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

function toolComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
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
        { operationId: 'op.query', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
    },
    ...overrides,
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t004c',
    components: [consumer(), toolComponent()],
    relations: [],
    ...overrides,
  };
}

function kindBinding(overrides: Partial<KindImplementationBindingInput> = {}): KindImplementationBindingInput {
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
    ...overrides,
  };
}

function candidate(overrides: Partial<ToolImplementationCandidate> = {}): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId: 'impl.charge.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.charge.alpha-content',
    },
    supportedOperations: ['op.charge', 'op.query'],
    ...overrides,
  };
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(overrides: Partial<InvocationCallerContext> = {}): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'workflow', ...overrides };
}

// ---------------------------------------------------------------------------
// Governance / occurrence fixtures (T002C/T002D/T005C occurrence pin).
// ---------------------------------------------------------------------------

export const WORKFLOW_TARGET = 'orders.charge';
export const WORKFLOW_INSTANCE_ID = 'orders.charge:instance:9';
export const OCCURRENCE_TARGET: WorkflowAddress = {
  workflowId: 'orders.charge',
  instanceKey: 'instance:9',
};
export const NOW = '2026-10-06T12:00:00.000Z';
export const EFFECT_TYPE = 'effect:charge';

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

export class MemoryDurableExecutionStore implements DurableExecutionStore {
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

// ---------------------------------------------------------------------------
// Workflow admission fixtures (the ONE existing Central Admission path).
// ---------------------------------------------------------------------------

function workflowDefinition(overrides: Partial<DomainWorkflowDefinition> = {}): DomainWorkflowDefinition {
  return {
    workflowKey: 'order-charge',
    initialState: 'review',
    initialContext: {},
    guards: [
      {
        guardId: 'guard:amount-ok',
        predicate: {
          op: 'lte',
          left: { source: 'event', path: ['payload', 'amount'] },
          right: { source: 'literal', value: 1000 },
        },
      },
    ],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'charge',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'charged',
            guardId: 'guard:amount-ok',
            effectIntents: [
              { effectType: EFFECT_TYPE, input: { amount: 42 }, idempotencyKey: 'charge:1' },
            ],
          },
        ],
      },
      { stateKey: 'charged', kind: 'final' },
    ],
    ...overrides,
  };
}

function resolvedFrom(
  source: DecisionResolverSource,
  structuredDecision: JsonValue,
): ResolvedDecision<JsonValue> {
  return {
    source,
    structuredDecision,
    provenance: {},
    freshModelCallCount: source === 'harness-machine' ? 1 : 0,
    llmAvoided: source !== 'harness-machine',
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}

function resolvedDecision(): ResolvedDecision<JsonValue> {
  return resolvedFrom('harness-machine', {
    decision: { outcome: 'charge', data: { amount: 42 } },
    event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
  });
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

// ---------------------------------------------------------------------------
// The composite fixture: binding + admitted request + occurrence + admission.
// ---------------------------------------------------------------------------

export interface Fixture {
  g: DefinitionGraphEnvelope;
  binding: SealedToolImplementationBinding;
  admitted: AdmittedToolInvocationRequest;
  pin: GovernanceExecutionPin;
  activator: AssemblyExecutionActivator;
  baselines: MemoryGovernanceBaselineStore;
  packageCdi: MemoryExactPackageCdiAuthority;
  store: MemoryDurableExecutionStore;
  coordinator: GovernanceExecutionCoordinator;
  journal: VolatileAdmissionEffectJournal;
  admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  admissionRequest: CentralAdmissionRequest;
  definition: DomainWorkflowDefinition;
}

export interface FixtureOverrides {
  operationId?: string;
  effect?: 'none' | 'idempotent' | 'non-idempotent';
  input?: unknown;
  authorityClass?: 'PRODUCTION' | 'SIMULATION';
  /** Skip activation entirely (missing occurrence pin). */
  readonly skipActivation?: boolean;
  sealOverrides?: Partial<SealRuntimeAssemblyInput>;
  definitionOverrides?: Partial<DomainWorkflowDefinition>;
  intentInput?: JsonValue;
  turn?: CentralAdmissionRequest['turn'];
  resourceProvider?: ResourceProvider;
  /** A legacy class-less pin is bound instead of the class-bearing activation. */
  readonly legacyClasslessPin?: boolean;
}

export async function fixture(overrides: FixtureOverrides = {}): Promise<Fixture> {
  const operationId = overrides.operationId ?? 'op.charge';
  const effect = overrides.effect ?? 'non-idempotent';
  // An effect-class override rebuilds the Tool Component so the declared
  // operation effect matches the override (the default fixture declares
  // op.charge as non-idempotent and op.query as effect=none).
  const g =
    effect === 'non-idempotent'
      ? graph()
      : graph({
          components: [
            consumer(),
            toolComponent({
              semanticBody: {
                operations: [
                  { operationId: 'op.charge', inputSchema: { type: 'object' }, outputSchema: {}, effect },
                  { operationId: 'op.query', inputSchema: {}, outputSchema: {}, effect: 'none' },
                ],
                providesCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
              },
            }),
          ],
        });
  const baseAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [kindBinding()],
      ...(overrides.sealOverrides ?? {}),
    },
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
    implementations: [candidate({ handle: { kind: 'runtime-handle', id: 'handle.charge#1' } })],
    sha256: realSha256,
  });
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId,
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
      operationId,
      input: (overrides.input ?? { amount: 42 }) as never,
      caller: caller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: g },
    realSha256,
  );

  // --- occurrence pin (already-authoritative occurrence; consumed, never minted here)
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
  const activationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: b1.identity,
  };
  let pin: GovernanceExecutionPin;
  if (overrides.legacyClasslessPin === true) {
    // A genuine pre-T002D legacy pin: assembly-bearing but class-LESS. The
    // v0.7 activation gate then fails AUTHORITY_CLASS_FORBIDDEN (a legacy
    // class-less pin is historical evidence only, never upgraded).
    const coordinator = new GovernanceExecutionCoordinator(store, realSha256);
    pin = await coordinator.pinExecution({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      binding: activationBinding,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
    });
  } else if (overrides.skipActivation === true) {
    pin = await createGovernanceExecutionPin(
      {
        workflowTarget: WORKFLOW_TARGET,
        workflowInstanceId: WORKFLOW_INSTANCE_ID,
        binding: activationBinding,
      },
      realSha256,
    );
  } else {
    pin = await activator.activate({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      binding: activationBinding,
      assembly: binding.successorAssembly,
      authorityClass: overrides.authorityClass ?? 'PRODUCTION',
      currentDefinitionGraph: g,
    });
  }

  // --- Central Admission ports + request (the ONE public effect-admission path)
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);
  const journal = new VolatileAdmissionEffectJournal();
  const admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'> = {
    governance: coordinator,
    baselines,
    effectJournal: journal,
  };
  const definition = workflowDefinition({
    ...(overrides.definitionOverrides ?? {}),
    ...(overrides.intentInput === undefined
      ? {}
      : {
          states: [
            {
              stateKey: 'review',
              transitions: [
                {
                  transitionKey: 'charge',
                  trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
                  targetState: 'charged',
                  guardId: 'guard:amount-ok',
                  effectIntents: [{ effectType: EFFECT_TYPE, input: overrides.intentInput }],
                },
              ],
            },
            { stateKey: 'charged', kind: 'final' },
          ],
        }),
  });
  const admissionRequest: CentralAdmissionRequest = {
    target: { ...OCCURRENCE_TARGET },
    turn: overrides.turn ?? { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition,
    currentStateKey: 'review',
    context: {},
    event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
    resolved: resolvedDecision(),
    decisionSchema,
    now: NOW,
  };

  return {
    g,
    binding,
    admitted,
    pin,
    activator,
    baselines,
    packageCdi,
    store,
    coordinator,
    journal,
    admissionPorts,
    admissionRequest,
    definition,
  };
}

/** A dispatch port that records its queries and returns a fixed effect output. */
export function recordingDispatch(
  calls: EffectfulToolDispatchQuery[],
  output: unknown = { charged: true },
): EffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return output;
    },
  };
}

export function invocationInput(
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

export function expectInvocationError(
  promise: Promise<unknown>,
  code: string,
): Promise<EffectfulInvocationError> {
  return promise.then(
    () => {
      throw new Error(`expected EffectfulInvocationError(${code}), but invocation resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof EffectfulInvocationError,
        `expected EffectfulInvocationError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// PACK-C T004C: successful production effect under one authoritative occurrence.
// ---------------------------------------------------------------------------

test('PACK-C T004C production success: one already-authoritative PRODUCTION occurrence + exact current binding executes the effect through Central Admission only', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture();

  const result: EffectfulToolInvocationResult = await invokeEffectfulTool(
    invocationInput(fx, { dispatch: recordingDispatch(calls) }),
  );

  // The admitted plan came from the existing Central Admission outcome shape.
  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.transitionKey, 'charge');
  assert.equal(result.outcome.admitted.effects.length, 1);
  const effect = result.outcome.admitted.effects[0]!;
  assert.equal(effect.disposition, 'executed');
  assert.deepEqual(effect.output, { charged: true });

  // The durable effect identity derives from the SAME occurrence turn lineage.
  const turnId = deriveDurableControlTurnId(OCCURRENCE_TARGET, {
    kind: 'message',
    sourceMessageId: 'msg:1',
  });
  assert.equal(effect.effectId, `${turnId}/effect/1`);

  // Exactly one dispatch of the VERIFIED exact T003C handle with the admitted
  // operation/input and the journaled durable-effect context. The dispatched
  // handle is the verifier-paired reference from the sealed binding — never a
  // re-read or a snapshot clone (owner verifier returns the original reference).
  assert.equal(calls.length, 1);
  const query = calls[0]!;
  assert.equal(query.handle, fx.binding.implementationHandle);
  assert.equal(query.operationId, 'op.charge');
  assert.deepEqual(query.input, { amount: 42 });
  assert.equal(query.effectId, effect.effectId);
  assert.equal(query.durableControlTurnId, turnId);
  assert.equal(query.operationOrdinal, 1);
  assert.equal(query.idempotencyKey, 'charge:1');
  assert.equal(query.logicalTime, NOW);
  assert.equal(query.resources.size, 0);

  // Exactly one durable journal record, completed, on the existing journal.
  const records = fx.journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.effectId, effect.effectId);
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectType, EFFECT_TYPE);
  assert.equal(records[0]!.effectSemantics, 'non-idempotent');
  assert.deepEqual(records[0]!.input, { amount: 42 });

  // The result identity is exact and occurrence-bound; no live handle/secret.
  assert.equal(result.occurrence.workflowTarget, WORKFLOW_TARGET);
  assert.equal(result.occurrence.workflowInstanceId, WORKFLOW_INSTANCE_ID);
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.equal(result.occurrence.pinBindingDigest, fx.pin.bindingDigest);
  assert.equal(result.occurrence.assemblyDigest, fx.binding.successorAssembly.assemblyDigest);
  assert.deepEqual(result.invocation.implementation, {
    implementationId: 'impl.charge.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:impl.charge.alpha-content',
  } satisfies ToolImplementationIdentity);
  assert.equal(result.invocation.bindingDigest, fx.binding.evidence.bindingDigest);
  assert.equal(result.invocation.effectSemantics, 'non-idempotent');
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('runtime-handle'), 'the opaque handle must never enter the result');
  assert.ok(Object.isFrozen(result));
});

// ---------------------------------------------------------------------------
// PACK-C T004C: effect=none never enters the effectful path.
// ---------------------------------------------------------------------------

test('PACK-C T004C effectless rejected: an operation classified effect=none fails closed before any dispatch and before any journal record', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture({ operationId: 'op.query', effect: 'none' });
  assert.equal(fx.admitted.operationEffect, 'none');

  await expectInvocationError(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
    'EFFECTLESS_OPERATION_REJECTED',
  );
  assert.equal(calls.length, 0, 'the dispatch port must never run for an effect=none operation');
  assert.equal(fx.journal.getRecords().length, 0, 'no journal effect may be recorded');
});

// ---------------------------------------------------------------------------
// PACK-C T004C: pre-effect rejection matrix — zero dispatch, zero journal.
// ---------------------------------------------------------------------------

test('PACK-C T004C pre-effect rejection matrix: stale/forged request, assembly, binding, occurrence and pin all fail closed with zero dispatch and zero journal effect', async (t) => {
  await t.test('stale request (Definition graph moved after admission) fails at the T004A re-admission', async () => {
    const calls: EffectfulToolDispatchQuery[] = [];
    const fx = await fixture();
    const movedGraph = graph({
      components: [
        {
          family: 'semantic',
          componentId: 'consumer.a',
          kind: { kindId: 'test.t004c-kind', version: '1.0.0' },
          requiredSemanticContracts: [],
          requiredCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
          semanticBody: { note: 'consumer-moved' },
        },
        toolComponent(),
      ],
      relations: [],
    });
    // The T004A owner seam re-proves exact currentness and fails with its OWN
    // typed error (owner failures propagate unchanged — never wrapped by this
    // module), before any dispatch and before any journal record.
    await assert.rejects(
      invokeEffectfulTool(
        invocationInput(fx, { currentDefinitionGraph: movedGraph, dispatch: recordingDispatch(calls) }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'DEFINITION_CURRENTNESS_MISMATCH');
        return true;
      },
    );
    assert.equal(calls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });

  await t.test('forged exposure evidence fails at the T004A seam (FORGED_EXPOSURE_EVIDENCE)', async () => {
    const calls: EffectfulToolDispatchQuery[] = [];
    const fx = await fixture();
    const forgedRequest = {
      ...fx.admitted,
      exposure: {
        ...fx.admitted.exposure,
        assemblyDigest: 'sha256:forged-assembly',
      },
    } as unknown as AdmittedToolInvocationRequest;
    await assert.rejects(
      invokeEffectfulTool(
        invocationInput(fx, { request: forgedRequest, dispatch: recordingDispatch(calls) }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'FORGED_EXPOSURE_EVIDENCE');
        return true;
      },
    );
    assert.equal(calls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });

  await t.test('a hand-built binding lookalike fails at the T003C mint seam (UNMINTED_TOOL_IMPLEMENTATION_BINDING)', async () => {
    const calls: EffectfulToolDispatchQuery[] = [];
    const fx = await fixture();
    const lookalike = {
      evidence: { ...fx.binding.evidence },
      successorAssembly: fx.binding.successorAssembly,
      implementationHandle: fx.binding.implementationHandle,
    } as unknown as SealedToolImplementationBinding;
    await assert.rejects(
      invokeEffectfulTool(
        invocationInput(fx, { binding: lookalike, dispatch: recordingDispatch(calls) }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'UNMINTED_TOOL_IMPLEMENTATION_BINDING');
        return true;
      },
    );
    assert.equal(calls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });

  await t.test('a stale Assembly (digest tampered) fails at the T004A re-admission', async () => {
    const calls: EffectfulToolDispatchQuery[] = [];
    const fx = await fixture();
    const staleAdmitted = {
      ...fx.admitted,
      assemblyDigest: 'sha256:stale-assembly',
    } as unknown as AdmittedToolInvocationRequest;
    await assert.rejects(
      invokeEffectfulTool(
        invocationInput(fx, { request: staleAdmitted, dispatch: recordingDispatch(calls) }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'ASSEMBLY_CURRENTNESS_MISMATCH');
        return true;
      },
    );
    assert.equal(calls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });

  await t.test('a missing occurrence pin fails at the T002C gate (GOVERNANCE_EXECUTION_PIN_MISSING)', async () => {
    const calls: EffectfulToolDispatchQuery[] = [];
    const fx = await fixture({ skipActivation: true });
    await assert.rejects(
      invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'GOVERNANCE_EXECUTION_PIN_MISSING');
        return true;
      },
    );
    assert.equal(calls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });

  await t.test('a legacy class-less occurrence pin can never satisfy production effect authority (AUTHORITY_CLASS_FORBIDDEN)', async () => {
    const calls: EffectfulToolDispatchQuery[] = [];
    const fx = await fixture({ legacyClasslessPin: true });
    await assert.rejects(
      invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'AUTHORITY_CLASS_FORBIDDEN');
        return true;
      },
    );
    assert.equal(calls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });

  await t.test('an unbound effectType fails at the existing admission seam before any journal record (ADMISSION_EFFECT_TOOL_UNBOUND)', async () => {
    const calls: EffectfulToolDispatchQuery[] = [];
    const fx = await fixture();
    await assert.rejects(
      invokeEffectfulTool(
        invocationInput(fx, { effectType: 'effect:unbound', dispatch: recordingDispatch(calls) }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'ADMISSION_EFFECT_TOOL_UNBOUND');
        return true;
      },
    );
    assert.equal(calls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });
});

// ---------------------------------------------------------------------------
// PACK-C T004C: SIMULATION can never mint production durable-effect authority.
// ---------------------------------------------------------------------------

test('PACK-C T004C simulation rejected: a SIMULATION occurrence pin fails AUTHORITY_CLASS_MISMATCH before any side effect', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture({ authorityClass: 'SIMULATION' });
  assert.equal(fx.pin.authorityClass, 'SIMULATION');

  await assert.rejects(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, 'AUTHORITY_CLASS_MISMATCH');
      return true;
    },
  );
  assert.equal(calls.length, 0, 'no Tool dispatch may happen under a SIMULATION pin');
  assert.equal(fx.journal.getRecords().length, 0, 'no journal effect may be recorded');
});

// ---------------------------------------------------------------------------
// PACK-C T004C: a replaced binding never rides a pin bound to the old Assembly.
// ---------------------------------------------------------------------------

test('PACK-C T004C occurrence/assembly match: an occurrence pinned to a replaced (older) Assembly rejects a newer final Assembly before any effect', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  // Activate the occurrence against the CURRENT binding's successor Assembly,
  // then replace the implementation: the replacement reseals into a NEW
  // successor Assembly (Definition identity unchanged). The pin stays bound
  // (bind-once) to the old assemblyDigest, so the NEW final Assembly cannot
  // ride the pinned occurrence.
  const g = graph();
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [kindBinding()] },
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
  const bindingA = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [candidate({ handle: { id: 'handle.a' } })],
    sha256: realSha256,
  });
  const bindingB = await bindToolImplementation({
    assembly: bindingA.successorAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [
      candidate({
        implementation: {
          implementationId: 'impl.charge.bravo',
          implementationVersion: '2.0.0',
          implementationDigest: 'sha256:impl.charge.bravo-content',
        },
        handle: { id: 'handle.b' },
      }),
    ],
    sha256: realSha256,
  });
  assert.notEqual(bindingA.successorAssembly.assemblyDigest, bindingB.successorAssembly.assemblyDigest);

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
  const activationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: b1.identity,
  };
  const pin = await activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: activationBinding,
    assembly: bindingA.successorAssembly,
    authorityClass: 'PRODUCTION',
    currentDefinitionGraph: g,
  });
  const journal = new VolatileAdmissionEffectJournal();
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);

  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.charge',
      caller: caller(),
      assembly: bindingB.successorAssembly,
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
      definitionGraphDigest: bindingB.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: bindingB.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: bindingB.successorAssembly, currentDefinitionGraph: g },
    realSha256,
  );

  await expectInvocationError(
    invokeEffectfulTool({
      request: admitted,
      binding: bindingB,
      currentDefinitionGraph: g,
      activator,
      admissionRequest: {
        target: OCCURRENCE_TARGET,
        turn: { kind: 'message', sourceMessageId: 'msg:1' },
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        workflowInstanceId: WORKFLOW_INSTANCE_ID,
        definition: workflowDefinition(),
        currentStateKey: 'review',
        context: {} as JsonObject,
        event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
        resolved: resolvedDecision(),
        decisionSchema,
        now: NOW,
      },
      admissionPorts: { governance: coordinator, baselines, effectJournal: journal },
      effectType: EFFECT_TYPE,
      dispatch: recordingDispatch(calls),
      sha256: realSha256,
    }),
    'OCCURRENCE_ASSEMBLY_MISMATCH',
  );
  assert.equal(calls.length, 0);
  assert.equal(journal.getRecords().length, 0);
  // Bind-once: the pinned occurrence still resolves to the OLD exact Assembly.
  const durable = await activator.requireActivatedExecution(WORKFLOW_INSTANCE_ID);
  assert.equal(durable.assemblyDigest, pin.assemblyDigest);
  assert.equal(durable.assemblyDigest, bindingA.successorAssembly.assemblyDigest);
});

// ---------------------------------------------------------------------------
// PACK-C T004C: no caller-supplied occurrence/effect-authority verdict.
// ---------------------------------------------------------------------------

test('PACK-C T004C no caller verdict: occurrence/effect authority is only the durable pin gates — no caller material is representable or consulted', async (t) => {
  const fx = await fixture();
  const base = invocationInput(fx);

  await t.test('verdict-shaped extra fields are structurally unrepresentable (closed-world input)', async () => {
    for (const smuggled of [
      { ...base, occurrenceVerdict: { authorityClass: 'PRODUCTION', approved: true } },
      { ...base, effectAuthority: { verdict: 'PRODUCTION' } },
      { ...base, journal: [] },
      { ...base, productionAuthority: 'PRODUCTION' },
      { ...base, callerMintedPin: { authorityClass: 'PRODUCTION', assemblyDigest: 'sha256:x' } },
    ]) {
      await expectInvocationError(
        invokeEffectfulTool(smuggled as unknown as InvokeEffectfulToolInput),
        'INVALID_INVOCATION_INPUT',
      );
    }
    assert.equal(fx.journal.getRecords().length, 0);
  });

  await t.test('no caller material can upgrade a SIMULATION pin, even when a well-formed verdict is present in the caller object graph', async () => {
    const calls: EffectfulToolDispatchQuery[] = [];
    const simFx = await fixture({ authorityClass: 'SIMULATION' });
    const hostile = invocationInput(simFx, { dispatch: recordingDispatch(calls) });
    const hostileRequest = {
      ...hostile.admissionRequest,
      // The caller cannot forge authority through the turn material either:
      // admission evaluates only its own pinned baseline/guards, and the
      // production gate reads the DURABLE pin — never caller verdicts.
      context: { forged: 'PRODUCTION' } as JsonObject,
    };
    await assert.rejects(
      invokeEffectfulTool({ ...hostile, admissionRequest: hostileRequest }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'AUTHORITY_CLASS_MISMATCH');
        return true;
      },
    );
    assert.equal(calls.length, 0);
    assert.equal(simFx.journal.getRecords().length, 0);
  });
});

// ---------------------------------------------------------------------------
// PACK-C T004C: torn occurrence identity cannot mint a fresh effect namespace.
// ---------------------------------------------------------------------------

test('PACK-C T004C torn identity: caller mutation of the admission turn material mid-flight cannot redirect the effect to a fresh occurrence/effect namespace', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  // The optional requirement gives the provider resolve() suspension a
  // mutation window AFTER the module snapshotted the occurrence identity
  // synchronously (phase 1): the caller swaps the turn material, target,
  // workflowInstanceId and clock mid-flight — the effect must still execute
  // on the ORIGINAL occurrence lineage, never on a fresh hijacked namespace.
  const tornFx = await fixture({
    sealOverrides: {
      resourceRequirements: [
        {
          owner: toolComponent(),
          declaration: {
            componentId: 'tool.alpha',
            requirements: [{ resourceKey: 'res.note', required: false }],
          },
        },
      ],
    },
  });
  const provider: ResourceProvider = {
    async resolve() {
      // The caller mutates its OWN admission turn material mid-flight (the
      // request object is readonly-typed; the mutation is a deliberate
      // hostile-caller simulation through a mutable view).
      const mutableRequest = tornFx.admissionRequest as {
        turn: { kind: 'message'; sourceMessageId: string };
        workflowInstanceId: string;
        now: string;
      };
      mutableRequest.turn = { kind: 'message', sourceMessageId: 'msg:HIJACKED' };
      (tornFx.admissionRequest.target as { workflowId: string }).workflowId = 'orders.hijack';
      mutableRequest.workflowInstanceId = 'orders.hijack:instance:66';
      mutableRequest.now = '2027-01-01T00:00:00.000Z';
      return { status: 'absent' } satisfies ResourceProviderResponse;
    },
  };

  const result = await invokeEffectfulTool(
    invocationInput(tornFx, {
      dispatch: recordingDispatch(calls),
      resourceProvider: provider,
    }),
  );

  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  // The expected original identity, computed from literals (the caller-owned
  // admissionRequest.target object was mutated by the provider, and the
  // fixture clones it — the module-owned snapshot is the authority).
  const turnId = deriveDurableControlTurnId(
    { workflowId: 'orders.charge', instanceKey: 'instance:9' },
    { kind: 'message', sourceMessageId: 'msg:1' },
  );
  assert.equal(result.outcome.admitted.effects[0]!.effectId, `${turnId}/effect/1`);
  const records = tornFx.journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.durableControlTurnId, turnId);
  assert.equal(records[0]!.target.workflowId, 'orders.charge');
  assert.equal(result.occurrence.workflowInstanceId, WORKFLOW_INSTANCE_ID);
});
