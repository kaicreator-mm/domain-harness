/**
 * T004E tests-first matrix — renderer-neutral UX Tool request adapter
 * (issue #907; frozen authority #703 packet @6039795443 + currentness
 * @6041211039; fine-grained DAG #534 T004E).
 *
 * Covers the #703 frozen mandatory test list, adapted from the T004D
 * structural precedent (tests/e4 + tests/agent-tool-projection) to UX
 * provenance:
 *  1. authorized pure route: ux-exposed effect=none operation traverses the
 *     generic T004A -> T004B path exactly once with an OBSERVED-only result;
 *     T004C / Central Admission / journal crossings are exactly zero;
 *  2. authorized mutation/effect route: ux mutation intent is admitted only
 *     as a generic T004A request and crosses the accepted T004C seam +
 *     existing Central Admission exactly once against an already-authoritative
 *     occurrence supplied by trusted host composition; direct T004B/query
 *     fallback = 0;
 *  3. unauthorized/non-exposed rejection: operations without exact current ux
 *     exposure refuse UX_OPERATION_NOT_EXPOSED before admission or dispatch;
 *     all counters remain 0;
 *  4. stale binding/currentness rejection: a UX intent claiming an outdated
 *     exact current Definition graph digest refuses UX_REQUEST_STALE before
 *     admission or dispatch (authoritative digest recomputation; no
 *     latest/default/order/alias fallback);
 *  5. forged authority rejection: occurrence/journal/admission-evidence/
 *     policy material is not representable on the closed-world UX input
 *     (INVALID_UX_REQUEST_INPUT), including accessor-backed hostile fields;
 *     forged exposure material inside the portable input mints nothing;
 *  6. mutation-through-query refusal (UX_MUTATION_REFUSED) and
 *     effectless-through-effectful refusal (UX_EFFECTLESS_OPERATION_REFUSED)
 *     both before any admission or dispatch;
 *  7. outcome directionality: the pure result stays OBSERVED-only and frozen,
 *     the effectful result reflects the existing authoritative T004C/Central
 *     Admission outcome verbatim — UX never rewrites or upgrades either;
 *  8. async/currentness discipline: caller-owned material is snapshotted
 *     synchronously before the first await — mutation after the boundary
 *     cannot swap input;
 *  9. T004D coexistence: the accepted Agent adapter behaves unchanged on the
 *     same dual-audience graph and the ux-only operation stays invisible to
 *     it (and vice versa).
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
import type { JsonValue } from '../../src/contracts/json.js';
import type { EffectfulToolDispatchQuery } from '../../src/contracts/effectful-invocation.js';
import {
  UxToolRequestError,
  invokeUxToolEffectfully,
  queryUxTool,
  type InvokeUxToolEffectfullyInput,
  type QueryUxToolInput,
} from '../../src/adapters/ux-tool-request.js';
import {
  AgentToolProjectionError,
  queryAgentTool,
  projectAgentToolSurface,
  type AgentToolQueryInput,
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
import type { CentralAdmissionRequest } from '../../src/admission/contracts.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const UX_SESSION_ID = 'ux.session-1';
const AGENT_ID = 'agent.coexist-1';

// ---------------------------------------------------------------------------
// Observable counters for the negative authority boundaries (dispatch /
// effect / Central Admission journal crossings).
// ---------------------------------------------------------------------------

interface UxCounters {
  /** T004B non-effectful dispatch crossings. */
  readonly nonEffectfulCalls: unknown[];
  /** T004C effectful dispatch crossings. */
  readonly effectfulCalls: EffectfulToolDispatchQuery[];
  /** Central Admission crossings, observed as durable journal records. */
  readonly journal: VolatileAdmissionEffectJournal;
}

function makeCounters(): UxCounters {
  return {
    nonEffectfulCalls: [],
    effectfulCalls: [],
    journal: new VolatileAdmissionEffectJournal(),
  };
}

function assertNoWork(counters: UxCounters, message: string): void {
  assert.equal(counters.nonEffectfulCalls.length, 0, message);
  assert.equal(counters.effectfulCalls.length, 0, message);
  assert.equal(counters.journal.getRecords().length, 0, message);
}

// ---------------------------------------------------------------------------
// Definition-plane fixtures: one consumer + one Domain Tool provider exposing
// ux-only, dual-audience and hidden operations.
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.t004e',
    kind: { kindId: 'test.t004e-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.t004e', version: '1.0.0' }],
    semanticBody: { note: 't004e consumer' },
  };
}

function toolComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.t004e',
    kind: { kindId: 'test.t004e-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'ux.visible.read',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'none',
          declaredExposure: { audiences: ['ux'] },
        },
        {
          operationId: 'ux.dual.read',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'none',
          declaredExposure: { audiences: ['agent', 'ux'] },
        },
        {
          operationId: 'ux.visible.write',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'non-idempotent',
          declaredExposure: { audiences: ['ux'] },
        },
        // Hidden from the UX plane: no exposure material at all.
        {
          operationId: 'ux.hidden.read',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'none',
        },
        // Hidden from the UX plane: exposed to the Agent plane only.
        {
          operationId: 'ux.hidden.agent-only',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'none',
          declaredExposure: { audiences: ['agent'] },
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.t004e', version: '1.0.0' }],
    },
    ...overrides,
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t004e',
    components: [consumer(), toolComponent()],
    relations: [],
    ...overrides,
  };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'test.t004e-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.t004e-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:t004e-kind-impl',
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
      implementationId: 'impl.t004e.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.t004e.alpha-content',
    },
    supportedOperations: [
      'ux.visible.read',
      'ux.dual.read',
      'ux.visible.write',
      'ux.hidden.read',
      'ux.hidden.agent-only',
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The composite fixture: graph + sealed binding + exact current digest claim.
// ---------------------------------------------------------------------------

export interface UxFixture {
  readonly g: DefinitionGraphEnvelope;
  readonly binding: SealedToolImplementationBinding;
  readonly graphDigest: string;
}

export async function uxFixture(
  overrides: { graph?: DefinitionGraphEnvelope } = {},
): Promise<UxFixture> {
  const g = overrides.graph ?? graph();
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [kindBinding()] },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { capabilityId: 'cap.t004e', version: '1.0.0' },
    'consumer.t004e',
    digest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [candidate({ handle: { kind: 'runtime-handle', id: 'handle.t004e#1' } })],
    sha256: realSha256,
  });
  return { g, binding, graphDigest: digest };
}

export function uxQueryInput(
  fx: UxFixture,
  counters: UxCounters,
  overrides: Partial<QueryUxToolInput> = {},
): QueryUxToolInput {
  return {
    uxSessionId: UX_SESSION_ID,
    toolComponentId: 'tool.t004e',
    operationId: 'ux.visible.read',
    input: { expression: '1+1' },
    expectedDefinitionGraphDigest: fx.graphDigest,
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

export function expectUxError(
  promise: Promise<unknown>,
  code: string,
): Promise<UxToolRequestError> {
  return promise.then(
    () => {
      throw new Error(`expected UxToolRequestError(${code}), but the call resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof UxToolRequestError,
        `expected UxToolRequestError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// #703 frozen test 1: authorized pure route.
// ---------------------------------------------------------------------------

test('T004E authorized pure route: a ux-exposed effect=none operation admits through the generic T004A -> T004B path exactly once with an OBSERVED-only result; T004C/Central Admission/journal crossings are zero', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();

  const result = await queryUxTool(uxQueryInput(fx, counters));

  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.toolComponentId, 'tool.t004e');
  assert.equal(result.operationId, 'ux.visible.read');
  assert.deepEqual(result.output, { answer: 42 });
  // The dispatch ran exactly once, on the VERIFIED exact T003C handle paired
  // by the sealed binding — the adapter performs no implementation selection.
  assert.equal(counters.nonEffectfulCalls.length, 1);
  const query = counters.nonEffectfulCalls[0] as { handle: unknown; operationId: string; input: unknown };
  assert.equal(query.handle, fx.binding.implementationHandle);
  assert.equal(query.operationId, 'ux.visible.read');
  assert.deepEqual(query.input, { expression: '1+1' });
  // OBSERVED ≠ authoritative: no effectful crossing, no Central Admission,
  // no journal record — the pure path gains zero mutation authority.
  assert.equal(counters.effectfulCalls.length, 0);
  assert.equal(counters.journal.getRecords().length, 0);
  // The opaque handle never enters the result; the result is frozen.
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('runtime-handle'), 'the opaque handle must never enter the result');
  assert.ok(Object.isFrozen(result));
});

// ---------------------------------------------------------------------------
// #703 frozen test 3: unauthorized/non-exposed rejection.
// ---------------------------------------------------------------------------

test('T004E unauthorized/non-exposed rejection: operations without exact current ux exposure refuse typed before any admission or dispatch; all counters remain zero', async (t) => {
  await t.test('no exposure material at all', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(uxQueryInput(fx, counters, { operationId: 'ux.hidden.read' })),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'a hidden operation must never reach admission or dispatch');
  });

  await t.test('exposed to the Agent plane only', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(uxQueryInput(fx, counters, { operationId: 'ux.hidden.agent-only' })),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'an agent-only operation must be invisible to the UX plane');
  });

  await t.test('unknown/fabricated operation identity', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(uxQueryInput(fx, counters, { operationId: 'ux.forged.op' })),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'a fabricated operation identity must refuse before any admission');
  });

  await t.test('unknown/fabricated Tool Component identity', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(uxQueryInput(fx, counters, { toolComponentId: 'tool.forged' })),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'an unbound Tool Component must refuse before any admission');
  });

  await t.test('effectful seam refuses non-exposed mutation intent equally', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const host = await effectfulHost(fx, counters);
    await expectUxError(
      invokeUxToolEffectfully(host.input({ operationId: 'ux.hidden.read' })),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'the effectful seam must refuse hidden operations before admission');
  });
});

// ---------------------------------------------------------------------------
// #703 frozen test 6a: mutation through the query seam refuses typed.
// ---------------------------------------------------------------------------

test('T004E query-seam mutation refusal: a mutation-capable operation presented to the query seam refuses UX_MUTATION_REFUSED before any admission or dispatch — never rerouted, never fallen back', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();

  await expectUxError(
    queryUxTool(uxQueryInput(fx, counters, { operationId: 'ux.visible.write', input: { amount: 42 } })),
    'UX_MUTATION_REFUSED',
  );
  assertNoWork(
    counters,
    'mutation through the query seam must refuse before any implementation dispatch and admit no effect authority',
  );
});

// ---------------------------------------------------------------------------
// #703 frozen test 6b: effectless intent through the effectful seam refuses.
// ---------------------------------------------------------------------------

test('T004E effectful-seam effectless refusal: an effect=none operation presented to the effectful seam refuses UX_EFFECTLESS_OPERATION_REFUSED before any admission — no T004B/query fallback from the effectful path either', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();
  const host = await effectfulHost(fx, counters);

  await expectUxError(
    invokeUxToolEffectfully(host.input({ operationId: 'ux.visible.read' })),
    'UX_EFFECTLESS_OPERATION_REFUSED',
  );
  assertNoWork(
    counters,
    'effectless intent on the effectful seam must refuse before any admission or effect',
  );
});

// ---------------------------------------------------------------------------
// #703 frozen test 4: stale binding/currentness rejection.
// ---------------------------------------------------------------------------

test('T004E stale currentness rejection: a UX intent claiming an outdated exact current Definition graph digest refuses UX_REQUEST_STALE before any admission or dispatch', async (t) => {
  await t.test('Definition graph content moved after the UX intent was shaped', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const movedGraph = graph({
      components: [
        {
          family: 'semantic',
          componentId: 'consumer.t004e',
          kind: { kindId: 'test.t004e-kind', version: '1.0.0' },
          requiredSemanticContracts: [],
          requiredCapabilities: [{ capabilityId: 'cap.t004e', version: '1.0.0' }],
          semanticBody: { note: 'consumer-moved' },
        },
        toolComponent(),
      ],
      relations: [],
    });
    // The UX intent still claims the digest of revision A while the exact
    // current graph is revision B.
    await expectUxError(
      queryUxTool(uxQueryInput(fx, counters, { currentDefinitionGraph: movedGraph })),
      'UX_REQUEST_STALE',
    );
    assertNoWork(counters, 'a stale claimed digest must refuse before any admission or dispatch');
  });

  await t.test('a flatly wrong claimed digest refuses', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(
        uxQueryInput(fx, counters, { expectedDefinitionGraphDigest: 'sha256:stale-claim' }),
      ),
      'UX_REQUEST_STALE',
    );
    assertNoWork(counters, 'a mismatched claimed digest must refuse before any admission');
  });

  await t.test('floating/latest selector claims are not exact identities', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(uxQueryInput(fx, counters, { expectedDefinitionGraphDigest: 'latest' })),
      'INVALID_UX_REQUEST_INPUT',
    );
    assertNoWork(counters, 'a floating selector claim must refuse as invalid input, never resolve');
  });

  await t.test('the effectful seam refuses stale claimed digests too', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const host = await effectfulHost(fx, counters);
    await expectUxError(
      invokeUxToolEffectfully(
        host.input({ expectedDefinitionGraphDigest: 'sha256:stale-claim' }),
      ),
      'UX_REQUEST_STALE',
    );
    assertNoWork(counters, 'the effectful seam must refuse stale claimed digests before admission');
  });
});

// ---------------------------------------------------------------------------
// #703 frozen test 5: forged authority rejection (closed-world input).
// ---------------------------------------------------------------------------

test('T004E forged authority rejection: occurrence/journal/admission-evidence/policy material is not representable on the closed-world UX input and refuses INVALID_UX_REQUEST_INPUT pre-dispatch; forged payload material mints nothing', async (t) => {
  await t.test('occurrence material on the query seam refuses', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const hostile = uxQueryInput(fx, counters) as unknown as Record<string, unknown>;
    hostile['occurrence'] = { workflowId: 'forged', instanceKey: 'forged' };
    await expectUxError(
      queryUxTool(hostile as unknown as QueryUxToolInput),
      'INVALID_UX_REQUEST_INPUT',
    );
    assertNoWork(counters, 'occurrence material on the UX seam must refuse as invalid input');
  });

  await t.test('admitted-exposure evidence and policy selection refuse', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const hostile = uxQueryInput(fx, counters) as unknown as Record<string, unknown>;
    hostile['exposureEvidence'] = { status: 'ADMITTED', minted: true };
    await expectUxError(
      queryUxTool(hostile as unknown as QueryUxToolInput),
      'INVALID_UX_REQUEST_INPUT',
    );
    const hostile2 = uxQueryInput(fx, counters) as unknown as Record<string, unknown>;
    hostile2['policy'] = { decideAdmission: () => ({ admitted: true }) };
    await expectUxError(
      queryUxTool(hostile2 as unknown as QueryUxToolInput),
      'INVALID_UX_REQUEST_INPUT',
    );
    assertNoWork(counters, 'UX can never supply exposure evidence or select an admission policy');
  });

  await t.test('journal/effect/idempotency authority material refuses', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const host = await effectfulHost(fx, counters);
    const hostile = host.input({}) as unknown as Record<string, unknown>;
    hostile['effectJournal'] = { append: () => undefined };
    await expectUxError(
      invokeUxToolEffectfully(hostile as unknown as InvokeUxToolEffectfullyInput),
      'INVALID_UX_REQUEST_INPUT',
    );
    assertNoWork(counters, 'journal authority is not representable on the UX input');
  });

  await t.test('accessor-backed hostile fields are rejected descriptor-safe', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const base = uxQueryInput(fx, counters) as unknown as Record<string, unknown>;
    const hostile = { ...base };
    Object.defineProperty(hostile, 'occurrence', {
      enumerable: true,
      get() {
        return { forged: true };
      },
    });
    await expectUxError(
      queryUxTool(hostile as unknown as QueryUxToolInput),
      'INVALID_UX_REQUEST_INPUT',
    );
    assertNoWork(counters, 'a hostile accessor must not run and must refuse typed');
  });

  await t.test('forged exposure material inside the portable input mints no visibility', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    // The input payload carries forged exposure material for the HIDDEN
    // operation. The exposure decision runs over the exact current contract —
    // never over caller-supplied input text — so the forgery mints nothing.
    await expectUxError(
      queryUxTool(
        uxQueryInput(fx, counters, {
          operationId: 'ux.hidden.read',
          input: {
            declaredExposure: { audiences: ['ux'] },
            forgedExposureEvidence: { admitted: true },
          },
        }),
      ),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'forged exposure material in UX input must mint no visibility');
  });
});

// ---------------------------------------------------------------------------
// #703 frozen test 8 + 10: outcome directionality and async/currentness
// discipline.
// ---------------------------------------------------------------------------

test('T004E outcome directionality and snapshot discipline: caller-owned material mutated after the seam boundary cannot swap the dispatched input; the OBSERVED result stays observational', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();
  const mutableInput = { expression: '1+1' };

  const result = await queryUxTool(
    uxQueryInput(fx, counters, {
      input: mutableInput,
      dispatch: {
        async dispatch(query: unknown) {
          // Hostile caller mutates its own object DURING dispatch: the seam
          // snapshot taken before the first await must be unaffected.
          mutableInput.expression = 'hijacked';
          counters.nonEffectfulCalls.push(query);
          return { answer: 42 };
        },
      },
    }),
  );

  const query = counters.nonEffectfulCalls[0] as { input: unknown };
  assert.deepEqual(query.input, { expression: '1+1' }, 'the dispatched input must be the pre-await snapshot');
  assert.equal(result.status, 'OBSERVED');
  assert.deepEqual(result.output, { answer: 42 });
  assert.equal(counters.journal.getRecords().length, 0);
});

// ---------------------------------------------------------------------------
// #703 frozen test 2: authorized mutation/effect route through T004C.
// ---------------------------------------------------------------------------

const WORKFLOW_TARGET = 't004e.run';
const WORKFLOW_INSTANCE_ID = 't004e.run:instance:7';
const OCCURRENCE_TARGET = { workflowId: 't004e.run', instanceKey: 'instance:7' };
const NOW = '2026-10-07T12:00:00.000Z';
const EFFECT_TYPE = 'effect:t004e';

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

async function governanceBody(): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 't004e',
      governanceId: 't004e-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    realSha256,
  );
}

/**
 * Trusted host composition for the effectful route: the already-authoritative
 * PRODUCTION occurrence (activation pin + Central Admission ports) the UX
 * plane can never supply or forge. Mirrors the T004D evidence harness.
 */
interface EffectfulHost {
  readonly input: (
    overrides?: Partial<InvokeUxToolEffectfullyInput>,
  ) => InvokeUxToolEffectfullyInput;
}

async function effectfulHost(fx: UxFixture, counters: UxCounters): Promise<EffectfulHost> {
  const b1 = await governanceBody();
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 't004e',
    packageId: 'pkg-t004e-1',
    domainIntelligenceContentDigest: 'cdi-t004e-1',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, realSha256);
  const pin = await activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 't004e',
      packageId: 'pkg-t004e-1',
      domainIntelligenceContentDigest: 'cdi-t004e-1',
      governanceBaseline: b1.identity,
    },
    assembly: fx.binding.successorAssembly,
    authorityClass: 'PRODUCTION',
    currentDefinitionGraph: fx.g,
  });
  assert.equal(pin.authorityClass, 'PRODUCTION');
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);

  const admissionRequest: CentralAdmissionRequest = {
    target: { ...OCCURRENCE_TARGET },
    turn: { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: { kind: 'event', eventType: 'T004E_DECIDED' },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition: {
      workflowKey: 't004e-run',
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
              trigger: { kind: 'event', eventType: 'T004E_DECIDED' },
              targetState: 'done',
              guardId: 'guard:amount-ok',
              effectIntents: [
                { effectType: EFFECT_TYPE, input: { amount: 42 }, idempotencyKey: 't004e:1' },
              ],
            },
          ],
        },
        { stateKey: 'done', kind: 'final' },
      ],
    },
    currentStateKey: 'review',
    context: {},
    event: { type: 'T004E_DECIDED', payload: { amount: 42 } },
    resolved: {
      source: 'harness-machine',
      structuredDecision: {
        decision: { outcome: 'run', data: { amount: 42 } },
        event: { type: 'T004E_DECIDED', payload: { amount: 42 } },
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
  };

  return {
    input(overrides: Partial<InvokeUxToolEffectfullyInput> = {}): InvokeUxToolEffectfullyInput {
      return {
        uxSessionId: UX_SESSION_ID,
        toolComponentId: 'tool.t004e',
        operationId: 'ux.visible.write',
        input: { amount: 42 },
        expectedDefinitionGraphDigest: fx.graphDigest,
        binding: fx.binding,
        currentDefinitionGraph: fx.g,
        activator,
        admissionRequest,
        admissionPorts: { governance: coordinator, baselines, effectJournal: counters.journal },
        effectType: EFFECT_TYPE,
        dispatch: {
          async dispatch(query: EffectfulToolDispatchQuery) {
            counters.effectfulCalls.push(query);
            return { ran: true };
          },
        },
        sha256: realSha256,
        ...overrides,
      };
    },
  };
}

test('T004E authorized mutation/effect route: ux mutation intent is admitted only as a generic T004A request and crosses the accepted T004C seam + existing Central Admission exactly once against the host-supplied authoritative occurrence; direct T004B/query fallback = 0', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();
  const host = await effectfulHost(fx, counters);

  const result = await invokeUxToolEffectfully(host.input());

  // The effect executed through the existing Central Admission outcome...
  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.effects.length, 1);
  const effect = result.outcome.admitted.effects[0]!;
  assert.equal(effect.disposition, 'executed');
  assert.deepEqual(effect.output, { ran: true });
  // ...exactly once, on the verified handle, under the pinned occurrence.
  assert.equal(counters.effectfulCalls.length, 1);
  assert.equal(counters.effectfulCalls[0]!.handle, fx.binding.implementationHandle);
  assert.equal(counters.nonEffectfulCalls.length, 0, 'no T004B/query fallback on the effectful route');
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.equal(result.invocation.effectSemantics, 'non-idempotent');
  const records = counters.journal.getRecords();
  assert.equal(records.length, 1, 'exactly one durable journal record on the existing journal');
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectType, EFFECT_TYPE);
});

// ---------------------------------------------------------------------------
// #703 frozen test 9: T004D coexistence — the Agent adapter is unchanged.
// ---------------------------------------------------------------------------

test('T004E T004D coexistence: the accepted Agent adapter behaves unchanged on the same dual-audience graph; the ux-only operation stays invisible to it and the agent-only operation stays invisible to UX', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();
  const agentProjection = await projectAgentToolSurface({
    agentId: AGENT_ID,
    currentDefinitionGraph: fx.g,
    sha256: realSha256,
  });

  // The Agent plane still sees exactly its own operations.
  const tools = agentProjection.tools.filter((tool) => tool.toolComponentId === 'tool.t004e');
  assert.equal(tools.length, 1);
  const agentIds = tools[0]!.operations.map((operation) => operation.operationId).sort();
  assert.deepEqual(agentIds, ['ux.dual.read', 'ux.hidden.agent-only']);

  // ...and can still invoke the dual-audience pure operation through the
  // generic T004A -> T004B path.
  const agentResult = await queryAgentTool({
    agentId: AGENT_ID,
    toolComponentId: 'tool.t004e',
    operationId: 'ux.dual.read',
    proposal: { expression: '2+2' },
    projection: agentProjection,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch: {
      async dispatch(query: unknown) {
        counters.nonEffectfulCalls.push(query);
        return { answer: 4 };
      },
    },
    sha256: realSha256,
  } satisfies AgentToolQueryInput);
  assert.equal(agentResult.status, 'OBSERVED');
  assert.deepEqual(agentResult.output, { answer: 4 });

  // The ux-only operation remains invisible to the Agent plane.
  await expectAgentError(
    queryAgentTool({
      agentId: AGENT_ID,
      toolComponentId: 'tool.t004e',
      operationId: 'ux.visible.read',
      proposal: {},
      projection: agentProjection,
      binding: fx.binding,
      currentDefinitionGraph: fx.g,
      dispatch: {
        async dispatch() {
          return {};
        },
      },
      sha256: realSha256,
    } satisfies AgentToolQueryInput),
    'AGENT_OPERATION_NOT_PROJECTED',
  );
  // And UX dispatch crossings remain exactly the one Agent query above: the
  // UX adapter introduced no shared-plane interference.
  assert.equal(counters.nonEffectfulCalls.length, 1);
  assert.equal(counters.journal.getRecords().length, 0);
});

function expectAgentError(
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
