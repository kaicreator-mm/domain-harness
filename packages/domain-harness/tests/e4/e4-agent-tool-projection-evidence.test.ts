/**
 * E4 executable reference — Agent Tool projection / mutation rejection
 * evidence suite (issue #896; frozen authority #589@5980528597 PACK-D E4;
 * readiness #717 packet @6038529441; exercised surface T004D PR #890 merge
 * c6e178544e78df95e98701481a6c26a1369b505f).
 *
 * TESTS-ONLY reference evidence. SOURCE_MUTATION=NONE. This suite does not
 * repair, widen or bypass production code; it binds the exact current
 * accepted adapter plus the shared generic T004A/T004B/T004C runtime paths.
 *
 * Frozen fixture (test-local operation labels, not public API identity):
 *  - `e4.visible.read`     agent-visible, effect=none, deterministic;
 *  - `e4.hidden.read`      effect=none, NO exposure material (plus a second
 *                          hidden variant exposed to the `ux` plane only);
 *  - `e4.mutation.write`   mutation/write class, agent-exposed (projected)
 *                          but query-seam refused before dispatch;
 *  - `e4.visible.effect`   agent-visible mutation-capable operation for the
 *                          CONDITIONAL effectful branch: the accepted T004D
 *                          contract DOES expose mutation-capable Agent intent
 *                          (admitAgentMutationIntent), so this lane is
 *                          exercised and must cross the generic T004C /
 *                          Central Admission path EXACTLY ONCE with no
 *                          direct T004B/query-only bypass.
 *
 * Counters prove the negative authority boundaries: every refusal happens
 * with executor=0 and admission=0; the pure path never crosses Central
 * Admission; the effectful path never crosses the T004B non-effectful port.
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

const AGENT_ID = 'agent.e4-session-1';

// ---------------------------------------------------------------------------
// Observable counters for the negative matrix (executor / admission).
// ---------------------------------------------------------------------------

interface E4Counters {
  /** T004B non-effectful dispatch crossings. */
  readonly nonEffectfulCalls: unknown[];
  /** T004C effectful dispatch crossings. */
  readonly effectfulCalls: EffectfulToolDispatchQuery[];
  /** Central Admission crossings, observed as durable journal records. */
  readonly journal: VolatileAdmissionEffectJournal;
}

function makeCounters(): E4Counters {
  return {
    nonEffectfulCalls: [],
    effectfulCalls: [],
    journal: new VolatileAdmissionEffectJournal(),
  };
}

// ---------------------------------------------------------------------------
// Definition-plane fixture: one consumer + one neutral Domain Tool provider.
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.e4',
    kind: { kindId: 'test.e4-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.e4', version: '1.0.0' }],
    semanticBody: { note: 'e4 consumer' },
  };
}

function toolComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.e4',
    kind: { kindId: 'test.e4-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'e4.visible.read',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'none',
          declaredExposure: { audiences: ['agent'] },
        },
        {
          operationId: 'e4.visible.effect',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'non-idempotent',
          declaredExposure: { audiences: ['agent'] },
        },
        {
          operationId: 'e4.mutation.write',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'non-idempotent',
          declaredExposure: { audiences: ['agent'] },
        },
        // Hidden from the Agent plane: no exposure material at all.
        {
          operationId: 'e4.hidden.read',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'none',
        },
        // Hidden from the Agent plane: exposed to the UX plane only.
        {
          operationId: 'e4.hidden.ux-only',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'none',
          declaredExposure: { audiences: ['ux'] },
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.e4', version: '1.0.0' }],
    },
    ...overrides,
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e4',
    components: [consumer(), toolComponent()],
    relations: [],
    ...overrides,
  };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'test.e4-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.e4-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:e4-kind-impl',
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
      implementationId: 'impl.e4.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.e4.alpha-content',
    },
    supportedOperations: [
      'e4.visible.read',
      'e4.visible.effect',
      'e4.mutation.write',
      'e4.hidden.read',
      'e4.hidden.ux-only',
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Composite fixture: exact current graph + sealed binding + projection.
// ---------------------------------------------------------------------------

export interface E4Fixture {
  readonly g: DefinitionGraphEnvelope;
  readonly binding: SealedToolImplementationBinding;
  readonly projection: AgentToolSurfaceProjection;
}

export async function e4Fixture(
  overrides: { graph?: DefinitionGraphEnvelope; agentId?: string } = {},
): Promise<E4Fixture> {
  const g = overrides.graph ?? graph();
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [kindBinding()] },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { capabilityId: 'cap.e4', version: '1.0.0' },
    'consumer.e4',
    digest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [candidate({ handle: { kind: 'runtime-handle', id: 'handle.e4#1' } })],
    sha256: realSha256,
  });
  const projection = await projectAgentToolSurface({
    agentId: overrides.agentId ?? AGENT_ID,
    currentDefinitionGraph: g,
    sha256: realSha256,
  });
  return { g, binding, projection };
}

export function e4QueryInput(
  fx: E4Fixture,
  counters: E4Counters,
  overrides: Partial<AgentToolQueryInput> = {},
): AgentToolQueryInput {
  return {
    agentId: AGENT_ID,
    toolComponentId: 'tool.e4',
    operationId: 'e4.visible.read',
    proposal: { expression: '1+1' },
    projection: fx.projection,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch: {
      async dispatch(query: unknown) {
        counters.nonEffectfulCalls.push(query);
        return { answer: 42 };
      },
    },
    sha256: realSha256,
    ...overrides,
  };
}

export function expectAgentError(
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

function projectedOperation(
  projection: AgentToolSurfaceProjection,
  operationId: string,
): { readonly operationId: string; readonly effect: string } | undefined {
  for (const tool of projection.tools) {
    const found = tool.operations.find((operation) => operation.operationId === operationId);
    if (found !== undefined) return found;
  }
  return undefined;
}

function assertNoWork(counters: E4Counters, message: string): void {
  assert.equal(counters.nonEffectfulCalls.length, 0, message);
  assert.equal(counters.effectfulCalls.length, 0, message);
  assert.equal(counters.journal.getRecords().length, 0, message);
}

// ---------------------------------------------------------------------------
// E4 probe 1 (V02/V03/V04): the declared Agent-visible effect=none operation
// is projected exactly once and invoked ONLY through the generic T004A ->
// T004B path; Central Admission count = 0; the effectful path is never
// crossed; every successful invocation is observable on the canonical shared
// runtime dispatch port (no Agent-local executor).
// ---------------------------------------------------------------------------

test('E4.1 visible effect=none: projected exactly once; invocation traverses canonical T004A -> T004B exactly once; Central Admission = 0; no effectful-path crossing', async () => {
  const counters = makeCounters();
  const fx = await e4Fixture();

  // V02: the visible pure operation appears exactly once in the projection.
  const tools = fx.projection.tools.filter((tool) => tool.toolComponentId === 'tool.e4');
  assert.equal(tools.length, 1);
  const matches = tools[0]!.operations.filter(
    (operation) => operation.operationId === 'e4.visible.read',
  );
  assert.equal(matches.length, 1, 'e4.visible.read must be projected exactly once');
  assert.equal(matches[0]!.effect, 'none');

  const result = await queryAgentTool(e4QueryInput(fx, counters));

  // V03: canonical T004B dispatch ran exactly once, on the exact verified
  // T003C handle, with the proposal material as frozen input — the Agent
  // plane performs no implementation selection and owns no executor.
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.toolComponentId, 'tool.e4');
  assert.equal(result.operationId, 'e4.visible.read');
  assert.deepEqual(result.output, { answer: 42 });
  assert.equal(counters.nonEffectfulCalls.length, 1);
  const query = counters.nonEffectfulCalls[0] as {
    handle: unknown;
    operationId: string;
    input: unknown;
  };
  assert.equal(query.handle, fx.binding.implementationHandle);
  assert.equal(query.operationId, 'e4.visible.read');
  assert.deepEqual(query.input, { expression: '1+1' });

  // V04 + negative matrix: the pure operation must not cross the effectful
  // path; Central Admission count = 0 (no occurrence material, no journal
  // record, no durable effect, and the result is OBSERVED — never an
  // authoritative Domain outcome).
  assert.equal(counters.effectfulCalls.length, 0);
  assert.equal(counters.journal.getRecords().length, 0);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('runtime-handle'), 'the opaque handle must never enter the result');
  assert.equal(result.status, 'OBSERVED', 'a query result is observational, never an occurrence');
});

// ---------------------------------------------------------------------------
// E4 probe 2 (V05/V06/V17): hidden operations are ABSENT from the projection;
// fabricated/direct invocation through the Agent query seam refuses typed
// BEFORE dispatch; executor/admission counters stay 0.
// ---------------------------------------------------------------------------

test('E4.2 hidden operation: absent from projection; fabricated direct Agent invocation rejected pre-dispatch with executor/admission = 0', async (t) => {
  await t.test('no exposure material at all', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    assert.equal(projectedOperation(fx.projection, 'e4.hidden.read'), undefined);

    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { operationId: 'e4.hidden.read' }),
      ),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assertNoWork(counters, 'a hidden operation must refuse before any admission or dispatch');
  });

  await t.test('exposed to the UX plane only', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    assert.equal(projectedOperation(fx.projection, 'e4.hidden.ux-only'), undefined);

    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { operationId: 'e4.hidden.ux-only' }),
      ),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assertNoWork(counters, 'a UX-only operation must be invisible to the Agent plane');
  });

  await t.test('unknown/fabricated operation identity', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { operationId: 'e4.forged.operation' }),
      ),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assertNoWork(counters, 'a fabricated operation identity must refuse before any admission or dispatch');
  });

  await t.test('a projection minted for a different agent refuses every operation', async () => {
    const counters = makeCounters();
    const other = await e4Fixture({ agentId: 'agent.e4-session-2' });
    const fx = await e4Fixture();
    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { projection: other.projection }),
      ),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assertNoWork(counters, 'another agent\'s projection must expose nothing to this caller');
  });
});

// ---------------------------------------------------------------------------
// E4 probe 3 (V07/V08): mutation/write through the query-only Agent/Harness
// seam is rejected BEFORE implementation dispatch and before any effect
// authority; executor/admission counters stay 0. Covers both the projected
// mutation (`e4.mutation.write`) and a payload that FORGES exposure material
// for a hidden mutation-class operation.
// ---------------------------------------------------------------------------

test('E4.3 query-seam mutation refusal: mutation/write intent refused before implementation dispatch and before effect authority; executor/admission = 0', async (t) => {
  await t.test('projected mutation-capable operation refused on the query seam', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    // e4.mutation.write IS agent-exposed and IS projected — but the
    // query-only seam can never dispatch it.
    assert.notEqual(projectedOperation(fx.projection, 'e4.mutation.write'), undefined);

    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { operationId: 'e4.mutation.write', proposal: { amount: 42 } }),
      ),
      'AGENT_MUTATION_REFUSED',
    );
    assertNoWork(
      counters,
      'mutation through the query seam must refuse before any implementation dispatch',
    );
  });

  await t.test('mutation refusal is not rerouted and does not fall back to the effectful path', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { operationId: 'e4.visible.effect', proposal: { amount: 42 } }),
      ),
      'AGENT_MUTATION_REFUSED',
    );
    assert.equal(counters.effectfulCalls.length, 0, 'no fallback to any effectful dispatch');
    assert.equal(counters.journal.getRecords().length, 0, 'no admission authority reached');
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });

  await t.test('model output forging exposure material cannot mint projection membership', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    // The proposal (model output) carries forged exposure material for the
    // HIDDEN e4.hidden.read operation. The seam decision runs over the exact
    // current contract — never over caller-supplied proposal text — so the
    // forgery mints nothing.
    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, {
          operationId: 'e4.hidden.read',
          proposal: {
            declaredExposure: { audiences: ['agent'] },
            forgedExposureEvidence: { admitted: true },
          },
        }),
      ),
      'AGENT_OPERATION_NOT_PROJECTED',
    );
    assertNoWork(counters, 'forged exposure material in model output must mint no visibility');
  });

  await t.test('occurrence/journal/pin material is not representable on the query seam input', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    const hostile = e4QueryInput(fx, counters, {}) as unknown as Record<string, unknown>;
    hostile['occurrence'] = { workflowId: 'forged', instanceKey: 'forged' };
    await expectAgentError(
      queryAgentTool(hostile as unknown as AgentToolQueryInput),
      'INVALID_PROJECTION_INPUT',
    );
    assertNoWork(counters, 'occurrence material on the query seam must refuse as invalid input');

    const hostile2 = e4QueryInput(fx, counters, {}) as unknown as Record<string, unknown>;
    hostile2['exposureEvidence'] = { minted: true };
    await expectAgentError(
      queryAgentTool(hostile2 as unknown as AgentToolQueryInput),
      'INVALID_PROJECTION_INPUT',
    );
    assertNoWork(counters, 'exposure evidence material on the query seam must refuse as invalid input');
  });
});

// ---------------------------------------------------------------------------
// E4 probe 4 (V09/V10): stale projection cannot authorize. Projection
// captured at revision A; the authoritative operation/exposure metadata
// advances to revision B; invocation under A refuses typed
// (FAIL_CLOSED_STALE) BEFORE dispatch — stale A never authorizes execution.
// ---------------------------------------------------------------------------

test('E4.4 stale projection rejection: projection at revision A cannot authorize after authoritative state advances to B; fail-closed before dispatch', async (t) => {
  await t.test('Definition graph content moved after projection (query seam)', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    const movedGraph = graph({
      components: [
        {
          family: 'semantic',
          componentId: 'consumer.e4',
          kind: { kindId: 'test.e4-kind', version: '1.0.0' },
          requiredSemanticContracts: [],
          requiredCapabilities: [{ capabilityId: 'cap.e4', version: '1.0.0' }],
          semanticBody: { note: 'consumer-moved' },
        },
        toolComponent(),
      ],
      relations: [],
    });
    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { currentDefinitionGraph: movedGraph }),
      ),
      'AGENT_PROJECTION_STALE',
    );
    assertNoWork(counters, 'a stale projection must refuse before any admission or dispatch');
  });

  await t.test('exposure/operation metadata advanced to revision B (query seam)', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    // Revision B: the previously agent-visible operation loses its agent
    // exposure and its schema changes — the projection minted at A no longer
    // describes current state.
    const advancedTool = toolComponent();
    const operations = (advancedTool.semanticBody as { operations: Array<Record<string, unknown>> })
      .operations;
    const visible = operations.find((operation) => operation['operationId'] === 'e4.visible.read')!;
    delete visible['declaredExposure'];
    visible['inputSchema'] = { type: 'string' };
    const advancedGraph = graph({ components: [consumer(), advancedTool] });

    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { currentDefinitionGraph: advancedGraph }),
      ),
      'AGENT_PROJECTION_STALE',
    );
    assertNoWork(
      counters,
      'advanced exposure/operation metadata must fail closed — stale A never authorizes B',
    );
  });

  await t.test('a different graph identity with equal content refuses', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    const renamed = graph({ graphId: 'graph.e4.renamed' });
    await expectAgentError(
      queryAgentTool(
        e4QueryInput(fx, counters, { currentDefinitionGraph: renamed }),
      ),
      'AGENT_PROJECTION_STALE',
    );
    assertNoWork(counters, 'graph identity drift must refuse before any admission or dispatch');
  });

  await t.test('the mutation-intent admission seam refuses stale projections too', async () => {
    const counters = makeCounters();
    const fx = await e4Fixture();
    const movedGraph = graph({
      components: [
        {
          family: 'semantic',
          componentId: 'consumer.e4',
          kind: { kindId: 'test.e4-kind', version: '1.0.0' },
          requiredSemanticContracts: [],
          requiredCapabilities: [{ capabilityId: 'cap.e4', version: '1.0.0' }],
          semanticBody: { note: 'consumer-moved' },
        },
        toolComponent(),
      ],
      relations: [],
    });
    await expectAgentError(
      admitAgentMutationIntent({
        agentId: AGENT_ID,
        toolComponentId: 'tool.e4',
        operationId: 'e4.mutation.write',
        proposal: { amount: 42 },
        projection: fx.projection,
        assembly: fx.binding.successorAssembly,
        currentDefinitionGraph: movedGraph,
        sha256: realSha256,
      }),
      'AGENT_PROJECTION_STALE',
    );
    assertNoWork(counters, 'the mutation-intent seam must refuse stale projections before any admission');
  });
});

// ---------------------------------------------------------------------------
// E4 probe 5 (V14/V15/V16): CONDITIONAL effectful branch — SUPPORTED because
// the accepted T004D contract exposes mutation-capable Agent intent. The
// admitted intent is routed by the HOST through the generic T004C seam
// against an already-authoritative occurrence / Central Admission EXACTLY
// ONCE; the direct T004B / query-only bypass count is 0.
// ---------------------------------------------------------------------------

const WORKFLOW_TARGET = 'e4.run';
const WORKFLOW_INSTANCE_ID = 'e4.run:instance:7';
const OCCURRENCE_TARGET = { workflowId: 'e4.run', instanceKey: 'instance:7' };
const NOW = '2026-10-07T12:00:00.000Z';
const EFFECT_TYPE = 'effect:e4';

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

  async putGovernanceBoundSnapshot(snapshot: {
    readonly workflowInstanceId: string;
  }): Promise<void> {
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

async function governanceBody(): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 'e4',
      governanceId: 'e4-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    realSha256,
  );
}

test('E4.5 effectful Agent route: admitted mutation intent crosses the generic T004C / Central Admission path exactly once; no direct T004B bypass; the Agent plane forges no occurrence', async () => {
  const counters = makeCounters();
  const fx = await e4Fixture();

  // The adapter admits the generic T004A request for the Agent's
  // mutation-capable intent. It exposes NO dispatch, NO occurrence material,
  // NO journal access: the admitted request is returned for the HOST to
  // route through T004C.
  const admitted: AdmittedToolInvocationRequest = await admitAgentMutationIntent({
    agentId: AGENT_ID,
    toolComponentId: 'tool.e4',
    operationId: 'e4.visible.effect',
    proposal: { amount: 42 },
    projection: fx.projection,
    assembly: fx.binding.successorAssembly,
    currentDefinitionGraph: fx.g,
    sha256: realSha256,
  });
  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(admitted.operationId, 'e4.visible.effect');
  assert.equal(admitted.operationEffect, 'non-idempotent');
  assert.equal(admitted.caller.callerId, AGENT_ID);
  assert.equal(admitted.caller.callerKind, 'agent');
  // The admitted request carries dispatch intent only — no occurrence, pin,
  // verdict or journal material is representable on it.
  const admittedKeys = Object.keys(admitted).sort();
  for (const forbidden of ['occurrence', 'pin', 'verdict', 'journal', 'effect']) {
    assert.ok(
      !admittedKeys.includes(forbidden),
      `the admitted Agent request must not carry ${forbidden} authority material`,
    );
  }
  // Admitting intent crossed no admission/effect authority yet.
  assert.equal(counters.journal.getRecords().length, 0);
  assert.equal(counters.effectfulCalls.length, 0);

  // The host composes the ONE generic T004C path against an
  // already-authoritative PRODUCTION occurrence the Agent plane can never
  // supply or forge.
  const b1 = await governanceBody();
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'e4',
    packageId: 'pkg-e4-1',
    domainIntelligenceContentDigest: 'cdi-e4-1',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, realSha256);
  const pin = await activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 'e4',
      packageId: 'pkg-e4-1',
      domainIntelligenceContentDigest: 'cdi-e4-1',
      governanceBaseline: b1.identity,
    },
    assembly: fx.binding.successorAssembly,
    authorityClass: 'PRODUCTION',
    currentDefinitionGraph: fx.g,
  });
  assert.equal(pin.authorityClass, 'PRODUCTION');
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);

  const result = await invokeEffectfulTool({
    request: admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    activator,
    admissionRequest: {
      target: { ...OCCURRENCE_TARGET },
      turn: { kind: 'message', sourceMessageId: 'msg:1' },
      trigger: { kind: 'event', eventType: 'E4_DECIDED' },
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      definition: {
        workflowKey: 'e4-run',
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
                trigger: { kind: 'event', eventType: 'E4_DECIDED' },
                targetState: 'done',
                guardId: 'guard:amount-ok',
                effectIntents: [
                  { effectType: EFFECT_TYPE, input: { amount: 42 }, idempotencyKey: 'e4:1' },
                ],
              },
            ],
          },
          { stateKey: 'done', kind: 'final' },
        ],
      },
      currentStateKey: 'review',
      context: {},
      event: { type: 'E4_DECIDED', payload: { amount: 42 } },
      resolved: {
        source: 'harness-machine',
        structuredDecision: {
          decision: { outcome: 'run', data: { amount: 42 } },
          event: { type: 'E4_DECIDED', payload: { amount: 42 } },
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
    admissionPorts: { governance: coordinator, baselines, effectJournal: counters.journal },
    effectType: EFFECT_TYPE,
    dispatch: {
      async dispatch(query: EffectfulToolDispatchQuery) {
        counters.effectfulCalls.push(query);
        return { ran: true };
      },
    },
    sha256: realSha256,
  });

  // V15: Central Admission exactly once — exactly one durable journal record,
  // exactly one executed effect, on the verified handle, under the pinned
  // occurrence.
  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.effects.length, 1);
  const effect = result.outcome.admitted.effects[0]!;
  assert.equal(effect.disposition, 'executed');
  assert.deepEqual(effect.output, { ran: true });
  assert.equal(counters.effectfulCalls.length, 1);
  assert.equal(counters.effectfulCalls[0]!.handle, fx.binding.implementationHandle);
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.equal(result.occurrence.pinBindingDigest, pin.bindingDigest);
  assert.equal(result.invocation.effectSemantics, 'non-idempotent');
  const records = counters.journal.getRecords();
  assert.equal(records.length, 1, 'exactly one Central Admission journal record');
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectType, EFFECT_TYPE);

  // V16: no direct T004B / query-only bypass — the non-effectful dispatch
  // count stays 0 for the effectful route.
  assert.equal(
    counters.nonEffectfulCalls.length,
    0,
    'the effectful route must never cross the T004B non-effectful dispatch',
  );
});

// ---------------------------------------------------------------------------
// E4 negative matrix sweep: re-run the pure-positive path last to prove the
// fixture itself is sound (positive control) — the exact current
// Definition/Assembly/exposure binding admits the visible pure operation.
// ---------------------------------------------------------------------------

test('E4.6 positive control: exact current Definition + sealed Assembly + exposure binding authorizes the visible pure operation (V18)', async () => {
  const counters = makeCounters();
  const fx = await e4Fixture();
  const result = await queryAgentTool(e4QueryInput(fx, counters));
  assert.equal(result.status, 'OBSERVED');
  assert.equal(counters.nonEffectfulCalls.length, 1);
  assert.equal(counters.journal.getRecords().length, 0);
  // The observational result binds exact identity material for audit.
  assert.equal(
    result.definitionGraphDigest,
    await computeDefinitionGraphDigest(fx.g, realSha256),
  );
  assert.equal(typeof result.assemblyDigest, 'string');
  assert.equal(typeof result.bindingDigest, 'string');
});
