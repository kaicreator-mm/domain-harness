/**
 * T004D tests-first matrix — Agent Tool projection / mutation refusal
 * (issue #886, fine-grained DAG #534 T004D; authority #589 PACK-C T004D
 * section; readiness #702 VERDICT=READY_AFTER_DEPENDENCIES +
 * JIT_CURRENTNESS=PASS).
 *
 * Covers the PACK-C T004D frozen test list:
 *  - exposed pure query success: an operation whose exact admitted exposure
 *    permits Agent/query use AND whose frozen effect class is `none` executes
 *    through the generic T004A -> T004B path and returns observational output
 *    only;
 *  - hidden operation rejection: an operation absent from the Agent-projected
 *    surface (no agent exposure material) is refused by the adapter plane
 *    before any admission or dispatch;
 *  - mutation through the query seam rejection: a mutation-capable (effectful)
 *    operation is refused by the query-only Agent seam typed and before any
 *    implementation dispatch — never rerouted, never fallen back;
 *  - admitted mutation routed via T004C: mutation-capable Agent intent enters
 *    the generic T004A request and the host routes it through the T004C
 *    authoritative occurrence / Central Admission path — the adapter exposes
 *    no Agent-specific mutation dispatch shortcut;
 *  - stale projection rejection: a projection minted over older exact state
 *    can never authorize current execution — the adapter refuses typed before
 *    any dispatch, and the generic T004A/T004B seams independently re-prove
 *    exact currentness;
 *  - no Agent branches in the Microkernel (source-level proof over the
 *    consumed kernel seams; see agent-tool-projection-microkernel.test.ts for
 *    the adapter-side boundary).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import type { AdmittedToolInvocationRequest } from '../../src/contracts/invocation-request.js';
import {
  invokeEffectfulTool,
  type EffectfulToolDispatchQuery,
} from '../../src/contracts/effectful-invocation.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  AgentToolProjectionError,
  admitAgentMutationIntent,
  projectAgentToolSurface,
  queryAgentTool,
  type AgentToolQueryInput,
  type AgentToolSurfaceProjection,
} from '../../src/adapters/agent-tool-projection.js';
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

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const AGENT_ID = 'agent.session-1';

// ---------------------------------------------------------------------------
// Definition-plane fixtures: one consumer + one Domain Tool provider exposing
// an agent/query operation, a mutation-capable agent-exposed operation and
// two NON-agent-exposed (hidden) operations.
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.t004d-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.t004d-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.query',
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'none',
          declaredExposure: { audiences: ['agent', 'ux'] },
        },
        {
          operationId: 'op.mutate',
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'non-idempotent',
          declaredExposure: { audiences: ['agent'] },
        },
        // Hidden from the Agent plane: no declared exposure material at all.
        { operationId: 'op.internal', inputSchema: {}, outputSchema: {}, effect: 'none' },
        // Hidden from the Agent plane: exposed to UX only.
        {
          operationId: 'op.ux-only',
          inputSchema: {},
          outputSchema: {},
          effect: 'none',
          declaredExposure: { audiences: ['ux'] },
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    },
    ...overrides,
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t004d',
    components: [consumer(), toolComponent()],
    relations: [],
    ...overrides,
  };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'test.t004d-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.t004d-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

function candidate(
  overrides: Partial<ToolImplementationCandidate> = {},
): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId: 'impl.calc.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.calc.alpha-content',
    },
    supportedOperations: ['op.query', 'op.mutate', 'op.internal', 'op.ux-only'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The composite fixture: graph + sealed binding + Agent projection.
// ---------------------------------------------------------------------------

export interface Fixture {
  g: DefinitionGraphEnvelope;
  binding: SealedToolImplementationBinding;
  projection: AgentToolSurfaceProjection;
}

export async function fixture(
  overrides: { graph?: DefinitionGraphEnvelope; agentId?: string } = {},
): Promise<Fixture> {
  const g = overrides.graph ?? graph();
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [kindBinding()] },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { capabilityId: 'cap.calc', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [candidate({ handle: { kind: 'runtime-handle', id: 'handle.calc#1' } })],
    sha256: realSha256,
  });
  const projection = await projectAgentToolSurface({
    agentId: overrides.agentId ?? AGENT_ID,
    currentDefinitionGraph: g,
    sha256: realSha256,
  });
  return { g, binding, projection };
}

export function queryInput(
  fx: Fixture,
  overrides: Partial<AgentToolQueryInput> = {},
): AgentToolQueryInput {
  return {
    agentId: AGENT_ID,
    toolComponentId: 'tool.alpha',
    operationId: 'op.query',
    proposal: { expression: '1+1' },
    projection: fx.projection,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch: recordingDispatch([]),
    sha256: realSha256,
    ...overrides,
  };
}

/** A dispatch port that records its queries and returns a fixed output. */
export function recordingDispatch(
  calls: unknown[],
  output: unknown = { result: 2 },
): { dispatch: (query: unknown) => Promise<unknown> } {
  return {
    async dispatch(query) {
      calls.push(query);
      return output;
    },
  };
}

export function expectProjectionError(
  promise: Promise<unknown>,
  code: string,
): Promise<AgentToolProjectionError> {
  return promise.then(
    () => {
      throw new Error(`expected AgentToolProjectionError(${code}), but the call resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof AgentToolProjectionError,
        `expected AgentToolProjectionError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

/** The Agent-projected operation entry for one operationId (or undefined). */
function projectedOperation(
  projection: AgentToolSurfaceProjection,
  operationId: string,
): { operationId: string; effect: string; inputSchema: JsonValue } | undefined {
  for (const tool of projection.tools) {
    const found = tool.operations.find((operation) => operation.operationId === operationId);
    if (found !== undefined) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// PACK-C T004D: projection content — only exact agent-exposed operations.
// ---------------------------------------------------------------------------

test('PACK-C T004D projection: only operations whose exact admitted exposure permits Agent/query use are projected; the snapshot is frozen and non-aliasing', async () => {
  const fx = await fixture();

  assert.equal(fx.projection.status, 'PROJECTED');
  assert.equal(fx.projection.agentId, AGENT_ID);
  assert.equal(fx.projection.graphId, 'graph.t004d');
  assert.equal(
    fx.projection.definitionGraphDigest,
    await computeDefinitionGraphDigest(fx.g, realSha256),
  );
  assert.ok(Object.isFrozen(fx.projection));

  const tools = fx.projection.tools.filter((tool) => tool.toolComponentId === 'tool.alpha');
  assert.equal(tools.length, 1);
  const projectedIds = tools[0]!.operations.map((operation) => operation.operationId).sort();
  assert.deepEqual(projectedIds, ['op.mutate', 'op.query']);
  assert.equal(projectedOperation(fx.projection, 'op.query')?.effect, 'none');
  assert.equal(projectedOperation(fx.projection, 'op.mutate')?.effect, 'non-idempotent');
  // Hidden operations carry no agent exposure material and are absent.
  assert.equal(projectedOperation(fx.projection, 'op.internal'), undefined);
  assert.equal(projectedOperation(fx.projection, 'op.ux-only'), undefined);
  for (const tool of fx.projection.tools) {
    assert.ok(Object.isFrozen(tool));
    for (const operation of tool.operations) assert.ok(Object.isFrozen(operation));
  }

  // Non-aliasing: mutating the caller-owned graph after projection cannot
  // change the projected schema metadata.
  const mutableTool = fx.g.components.find((component) => component.componentId === 'tool.alpha')!;
  (mutableTool.semanticBody as { operations: Array<{ inputSchema: unknown }> }).operations[0]!.inputSchema =
    { type: 'string' };
  const projectedQuery = projectedOperation(fx.projection, 'op.query')!;
  assert.deepEqual(
    projectedQuery.inputSchema,
    { type: 'object' },
    'the projection must snapshot the exact contract, never alias caller-owned state',
  );
  // The projection itself is immutable: hostile writes fail (strict mode).
  assert.throws(
    () => {
      (fx.projection as { graphId: string }).graphId = 'graph.hijacked';
    },
    /Cannot assign to read only property/,
  );
});

// ---------------------------------------------------------------------------
// PACK-C T004D frozen test 1: exposed pure query success.
// ---------------------------------------------------------------------------

test('PACK-C T004D exposed pure query success: an agent-exposed effect=none operation executes through the generic T004A -> T004B path with observational output only', async () => {
  const calls: unknown[] = [];
  const fx = await fixture();

  const result = await queryAgentTool(
    queryInput(fx, { dispatch: recordingDispatch(calls, { answer: 42 }) }),
  );

  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.toolComponentId, 'tool.alpha');
  assert.equal(result.operationId, 'op.query');
  assert.deepEqual(result.output, { answer: 42 });
  // The dispatch ran exactly once, on the VERIFIED exact T003C handle paired
  // by the sealed binding — the adapter performs no implementation selection.
  assert.equal(calls.length, 1);
  const query = calls[0] as { handle: unknown; operationId: string; input: unknown };
  assert.equal(query.handle, fx.binding.implementationHandle);
  assert.equal(query.operationId, 'op.query');
  assert.deepEqual(query.input, { expression: '1+1' });
  // Model proposal material is provenance only: the result binds identity +
  // observational output, never authority.
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('runtime-handle'), 'the opaque handle must never enter the result');
  assert.ok(Object.isFrozen(result));
});

// ---------------------------------------------------------------------------
// PACK-C T004D frozen test 2: hidden operation rejection.
// ---------------------------------------------------------------------------

test('PACK-C T004D hidden operation rejection: operations absent from the Agent-projected surface refuse typed before any admission or dispatch', async (t) => {
  await t.test('no exposure material at all', async () => {
    const calls: unknown[] = [];
    const fx = await fixture();
    await expectProjectionError(
      queryAgentTool(queryInput(fx, { operationId: 'op.internal', dispatch: recordingDispatch(calls) })),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assert.equal(calls.length, 0, 'a hidden operation must never reach the dispatch port');
  });

  await t.test('exposed to another plane only', async () => {
    const calls: unknown[] = [];
    const fx = await fixture();
    await expectProjectionError(
      queryAgentTool(queryInput(fx, { operationId: 'op.ux-only', dispatch: recordingDispatch(calls) })),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assert.equal(calls.length, 0);
  });

  await t.test('unknown operation identity', async () => {
    const calls: unknown[] = [];
    const fx = await fixture();
    await expectProjectionError(
      queryAgentTool(queryInput(fx, { operationId: 'op.unknown', dispatch: recordingDispatch(calls) })),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assert.equal(calls.length, 0);
  });

  await t.test('a projection minted for a different agent refuses every operation', async () => {
    const calls: unknown[] = [];
    const other = await fixture({ agentId: 'agent.session-2' });
    const fx = await fixture();
    // This agent presents a projection minted for another agent: for THIS
    // agent nothing is projected, even when operation ids would match.
    await expectProjectionError(
      queryAgentTool(
        queryInput(fx, { projection: other.projection, dispatch: recordingDispatch(calls) }),
      ),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// PACK-C T004D frozen test 3: mutation through the query seam rejection.
// ---------------------------------------------------------------------------

test('PACK-C T004D mutation through query seam rejection: a mutation-capable operation is refused typed before any implementation dispatch', async () => {
  const calls: unknown[] = [];
  const fx = await fixture();
  // op.mutate IS agent-exposed and IS projected — but the query-only seam can
  // never dispatch it.
  assert.notEqual(projectedOperation(fx.projection, 'op.mutate'), undefined);

  await expectProjectionError(
    queryAgentTool(queryInput(fx, { operationId: 'op.mutate', dispatch: recordingDispatch(calls) })),
    'AGENT_MUTATION_REFUSED',
  );
  assert.equal(calls.length, 0, 'the mutation must be refused before the dispatch port runs');
});

// ---------------------------------------------------------------------------
// PACK-C T004D frozen test 4: admitted mutation routed via T004C.
// ---------------------------------------------------------------------------

export const WORKFLOW_TARGET = 'calc.run';
export const WORKFLOW_INSTANCE_ID = 'calc.run:instance:7';
export const OCCURRENCE_TARGET = { workflowId: 'calc.run', instanceKey: 'instance:7' };
export const NOW = '2026-10-07T12:00:00.000Z';
export const EFFECT_TYPE = 'effect:calc';

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
      domainId: 'calc',
      governanceId: 'calc-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    realSha256,
  );
}

test('PACK-C T004D admitted mutation routed via T004C: mutation-capable Agent intent enters the generic T004A request and effects only through the authoritative occurrence / Central Admission path — no Agent mutation shortcut', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture();

  // The adapter admits the generic T004A request for the mutation intent. It
  // exposes NO dispatch: the admitted request is handed to the generic T004C
  // seam by the host, with the already-authoritative occurrence material the
  // Agent plane can never supply or forge.
  const admitted: AdmittedToolInvocationRequest = await admitAgentMutationIntent({
    agentId: AGENT_ID,
    toolComponentId: 'tool.alpha',
    operationId: 'op.mutate',
    proposal: { amount: 42 },
    projection: fx.projection,
    assembly: fx.binding.successorAssembly,
    currentDefinitionGraph: fx.g,
    sha256: realSha256,
  });
  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(admitted.toolComponentId, 'tool.alpha');
  assert.equal(admitted.operationId, 'op.mutate');
  assert.deepEqual(admitted.input, { amount: 42 });
  assert.equal(admitted.operationEffect, 'non-idempotent');
  assert.equal(admitted.caller.callerId, AGENT_ID);
  assert.equal(admitted.caller.callerKind, 'agent');

  // The host routes the admitted request through the ONE T004C path against an
  // already-authoritative PRODUCTION occurrence.
  const b1 = await governanceBody();
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'calc',
    packageId: 'pkg-calc-1',
    domainIntelligenceContentDigest: 'cdi-calc-1',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, realSha256);
  const pin = await activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 'calc',
      packageId: 'pkg-calc-1',
      domainIntelligenceContentDigest: 'cdi-calc-1',
      governanceBaseline: b1.identity,
    },
    assembly: fx.binding.successorAssembly,
    authorityClass: 'PRODUCTION',
    currentDefinitionGraph: fx.g,
  });
  assert.equal(pin.authorityClass, 'PRODUCTION');
  const journal = new VolatileAdmissionEffectJournal();
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);

  const result = await invokeEffectfulTool({
    request: admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    activator,
    admissionRequest: {
      target: { ...OCCURRENCE_TARGET },
      turn: { kind: 'message', sourceMessageId: 'msg:1' },
      trigger: { kind: 'event', eventType: 'CALC_DECIDED' },
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      definition: {
        workflowKey: 'calc-run',
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
                transitionKey: 'run',
                trigger: { kind: 'event', eventType: 'CALC_DECIDED' },
                targetState: 'done',
                guardId: 'guard:amount-ok',
                effectIntents: [
                  { effectType: EFFECT_TYPE, input: { amount: 42 }, idempotencyKey: 'calc:1' },
                ],
              },
            ],
          },
          { stateKey: 'done', kind: 'final' },
        ],
      },
      currentStateKey: 'review',
      context: {},
      event: { type: 'CALC_DECIDED', payload: { amount: 42 } },
      resolved: {
        source: 'harness-machine',
        structuredDecision: {
          decision: { outcome: 'run', data: { amount: 42 } },
          event: { type: 'CALC_DECIDED', payload: { amount: 42 } },
        },
        provenance: {},
        freshModelCallCount: 1,
        llmAvoided: false,
        cacheDisposition: { read: 'disabled' },
        telemetry: [],
      },
      decisionSchema: {
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
      },
      now: NOW,
    },
    admissionPorts: { governance: coordinator, baselines, effectJournal: journal },
    effectType: EFFECT_TYPE,
    dispatch: {
      async dispatch(query: EffectfulToolDispatchQuery) {
        calls.push(query);
        return { ran: true };
      },
    },
    sha256: realSha256,
  });

  // The effect executed through the existing Central Admission outcome...
  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.effects.length, 1);
  const effect = result.outcome.admitted.effects[0]!;
  assert.equal(effect.disposition, 'executed');
  assert.deepEqual(effect.output, { ran: true });
  // ...exactly once, on the verified handle, under the pinned occurrence.
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.handle, fx.binding.implementationHandle);
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.equal(result.occurrence.pinBindingDigest, pin.bindingDigest);
  assert.equal(result.invocation.effectSemantics, 'non-idempotent');
  const records = journal.getRecords();
  assert.equal(records.length, 1, 'exactly one durable journal record on the existing journal');
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectType, EFFECT_TYPE);
});

// ---------------------------------------------------------------------------
// PACK-C T004D frozen test 5: stale projection rejection.
// ---------------------------------------------------------------------------

test('PACK-C T004D stale projection rejection: a projection minted over older exact state can never authorize current execution', async (t) => {
  await t.test('Definition graph content moved after projection', async () => {
    const calls: unknown[] = [];
    const fx = await fixture();
    const movedGraph = graph({
      components: [
        {
          family: 'semantic',
          componentId: 'consumer.a',
          kind: { kindId: 'test.t004d-kind', version: '1.0.0' },
          requiredSemanticContracts: [],
          requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
          semanticBody: { note: 'consumer-moved' },
        },
        toolComponent(),
      ],
      relations: [],
    });
    await expectProjectionError(
      queryAgentTool(
        queryInput(fx, { currentDefinitionGraph: movedGraph, dispatch: recordingDispatch(calls) }),
      ),
      'AGENT_PROJECTION_STALE',
    );
    assert.equal(calls.length, 0, 'a stale projection must refuse before any dispatch');
  });

  await t.test('a different graph identity with equal content refuses', async () => {
    const calls: unknown[] = [];
    const fx = await fixture();
    const renamed = graph({ graphId: 'graph.renamed' });
    await expectProjectionError(
      queryAgentTool(
        queryInput(fx, { currentDefinitionGraph: renamed, dispatch: recordingDispatch(calls) }),
      ),
      'AGENT_PROJECTION_STALE',
    );
    assert.equal(calls.length, 0);
  });

  await t.test('the mutation-intent admission seam refuses stale projections too', async () => {
    const fx = await fixture();
    const movedGraph = graph({
      components: [
        {
          family: 'semantic',
          componentId: 'consumer.a',
          kind: { kindId: 'test.t004d-kind', version: '1.0.0' },
          requiredSemanticContracts: [],
          requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
          semanticBody: { note: 'consumer-moved' },
        },
        toolComponent(),
      ],
      relations: [],
    });
    await expectProjectionError(
      admitAgentMutationIntent({
        agentId: AGENT_ID,
        toolComponentId: 'tool.alpha',
        operationId: 'op.mutate',
        proposal: { amount: 42 },
        projection: fx.projection,
        assembly: fx.binding.successorAssembly,
        currentDefinitionGraph: movedGraph,
        sha256: realSha256,
      }),
      'AGENT_PROJECTION_STALE',
    );
  });
});

// ---------------------------------------------------------------------------
// PACK-C T004D frozen test 6: no Agent branches in the Microkernel.
// ---------------------------------------------------------------------------

test('PACK-C T004D no Agent branches in the Microkernel: the consumed kernel seams never branch on the caller plane', () => {
  for (const modulePath of [
    '../../src/contracts/invocation-request.ts',
    '../../src/contracts/non-effectful-invocation.ts',
    '../../src/contracts/effectful-invocation.ts',
  ] as const) {
    const sourcePath = fileURLToPath(new URL(modulePath, import.meta.url));
    const source = readFileSync(sourcePath, 'utf8');
    const bodyWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    assert.doesNotMatch(
      bodyWithoutComments,
      /callerKind\s*===/,
      `${modulePath} must not branch on the caller plane`,
    );
    assert.doesNotMatch(
      bodyWithoutComments,
      /['"]agent['"]|['"]ux['"]/i,
      `concrete caller-plane literals must not appear in ${modulePath} even as branch keys`,
    );
    assert.doesNotMatch(
      bodyWithoutComments,
      /\bif\s*\([^)]*\bagent\b[^)]*\)/i,
      `${modulePath} must not conditionally branch on agent material`,
    );
  }
});
