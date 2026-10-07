/**
 * T004E tests-first matrix — renderer-neutral UX Tool request adapter
 * (issue #907 successor repair; frozen authority #703 packet @6039795443 +
 * currentness @6041211039; repair authority #907@6044218852 /
 * #907@6045266317 / #907@6045787985; fine-grained DAG #534 T004E).
 *
 * Two-plane contract (#907@6045787985): every seam call is
 * `queryUxTool(intent, host)` / `invokeUxToolEffectfully(intent, host)` —
 * the portable closed-world UX intent is structurally separate from the
 * trusted host composition, and the host currentness anchors
 * (`currentAssembly` + `currentBinding`) are independently supplied, never
 * derived from UX material.
 *
 * Covers the #703 frozen mandatory test list (rebound to the two-plane
 * surface) plus the pinned P1 successor-repair matrix:
 *  1. authorized pure route: ux-exposed effect=none operation traverses the
 *     generic T004A -> T004B path exactly once with an OBSERVED-only result;
 *     T004C / Central Admission / journal crossings are exactly zero;
 *  2. authorized mutation/effect route: ux mutation intent is admitted only
 *     as a generic T004A request and crosses the accepted T004C seam +
 *     existing Central Admission exactly once against an already-authoritative
 *     occurrence supplied by trusted host composition; direct T004B/query
 *     fallback = 0;
 *  3. unauthorized/non-exposed rejection before admission or dispatch;
 *  4. stale currentness rejection — including N1/N2 (byte-identical
 *     Definition V1 -> V2 implementation/binding/Assembly replacement: the
 *     stale V1 assembly intent refuses UX_REQUEST_STALE even though the
 *     Definition graph digest is unchanged) and N3 (independent
 *     host.currentBinding vs host.currentAssembly relation);
 *  5. forged authority rejection (N4): no authority-bearing host object is
 *     representable on the portable UX intent — table-driven over every
 *     authority lookalike field, accessor-backed ones included (getter never
 *     executes);
 *  6. mutation-through-query refusal (UX_MUTATION_REFUSED) and
 *     effectless-through-effectful refusal (UX_EFFECTLESS_OPERATION_REFUSED)
 *     both before any admission or dispatch;
 *  7. outcome directionality: the pure result stays OBSERVED-only and frozen,
 *     the effectful result reflects the existing authoritative T004C/Central
 *     Admission outcome verbatim;
 *  8. N5 two-plane aliasing/torn-snapshot discipline: caller mutations of the
 *     intent object and top-level host replacements after the seam has
 *     synchronously entered cannot swap captured material;
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
  type SealedRuntimeAssembly,
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
  type EffectfulUxToolHostComposition,
  type QueryUxToolHostComposition,
  type UxToolRequestIntent,
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
// The current Assembly anchor is the binding's successor assembly.
// ---------------------------------------------------------------------------

export interface UxFixture {
  readonly g: DefinitionGraphEnvelope;
  readonly binding: SealedToolImplementationBinding;
  readonly graphDigest: string;
  /** The independently consumable current Assembly anchor (host plane). */
  readonly currentAssembly: SealedRuntimeAssembly;
}

async function sealFixture(
  g: DefinitionGraphEnvelope,
  implementation: ToolImplementationCandidate,
): Promise<UxFixture> {
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
    implementations: [implementation],
    sha256: realSha256,
  });
  return { g, binding, graphDigest: digest, currentAssembly: binding.successorAssembly };
}

export async function uxFixture(
  overrides: { graph?: DefinitionGraphEnvelope } = {},
): Promise<UxFixture> {
  return sealFixture(
    overrides.graph ?? graph(),
    candidate({ handle: { kind: 'runtime-handle', id: 'handle.t004e#1' } }),
  );
}

/**
 * The pinned P1-1 replacement counterexample fixture: GENUINE V1 and V2
 * T003C bindings/Assemblies sealed over the SAME graph object — byte-stable
 * Definition content (identical DefinitionGraphDigest) while the
 * implementation/binding/Assembly evidence differs.
 */
export async function uxReplacementFixture(): Promise<{
  readonly v1: UxFixture;
  readonly v2: UxFixture;
}> {
  const g = graph();
  const v1 = await sealFixture(
    g,
    candidate({ handle: { kind: 'runtime-handle', id: 'handle.t004e#1' } }),
  );
  const v2 = await sealFixture(
    g,
    candidate({
      implementation: {
        implementationId: 'impl.t004e.beta',
        implementationVersion: '2.0.0',
        implementationDigest: 'sha256:impl.t004e.beta-content',
      },
      handle: { kind: 'runtime-handle', id: 'handle.t004e#2' },
    }),
  );
  // The Definition plane is byte-identical across both revisions...
  assert.equal(v1.graphDigest, v2.graphDigest);
  assert.equal(v1.g, v2.g);
  // ...while the implementation/binding/Assembly evidence genuinely differs.
  assert.notEqual(
    v1.currentAssembly.assemblyDigest,
    v2.currentAssembly.assemblyDigest,
    'the replacement fixture must exercise two distinct Assembly digests',
  );
  assert.notEqual(
    v1.binding.evidence.implementation.implementationId,
    v2.binding.evidence.implementation.implementationId,
  );
  assert.notEqual(v1.binding.evidence.bindingDigest, v2.binding.evidence.bindingDigest);
  return { v1, v2 };
}

// ---------------------------------------------------------------------------
// Two-plane seam fixture helpers: portable intent vs trusted host composition.
// ---------------------------------------------------------------------------

export function uxIntent(
  fx: UxFixture,
  overrides: Partial<UxToolRequestIntent> = {},
): UxToolRequestIntent {
  return {
    uxSessionId: UX_SESSION_ID,
    toolComponentId: 'tool.t004e',
    operationId: 'ux.visible.read',
    input: { expression: '1+1' },
    expectedDefinitionGraphDigest: fx.graphDigest,
    expectedAssemblyDigest: fx.currentAssembly.assemblyDigest,
    ...overrides,
  };
}

export function queryHost(
  fx: UxFixture,
  counters: UxCounters,
  overrides: Partial<QueryUxToolHostComposition> = {},
): QueryUxToolHostComposition {
  return {
    currentDefinitionGraph: fx.g,
    currentAssembly: fx.currentAssembly,
    currentBinding: fx.binding,
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

  const result = await queryUxTool(uxIntent(fx), queryHost(fx, counters));

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
      queryUxTool(uxIntent(fx, { operationId: 'ux.hidden.read' }), queryHost(fx, counters)),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'a hidden operation must never reach admission or dispatch');
  });

  await t.test('exposed to the Agent plane only', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(uxIntent(fx, { operationId: 'ux.hidden.agent-only' }), queryHost(fx, counters)),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'an agent-only operation must be invisible to the UX plane');
  });

  await t.test('unknown/fabricated operation identity', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(uxIntent(fx, { operationId: 'ux.forged.op' }), queryHost(fx, counters)),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'a fabricated operation identity must refuse before any admission');
  });

  await t.test('unknown/fabricated Tool Component identity', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(uxIntent(fx, { toolComponentId: 'tool.forged' }), queryHost(fx, counters)),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'an unbound Tool Component must refuse before any admission');
  });

  await t.test('effectful seam refuses non-exposed mutation intent equally', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const host = await effectfulHost(fx, counters);
    await expectUxError(
      invokeUxToolEffectfully(host.intent({ operationId: 'ux.hidden.read' }), host.host()),
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
    queryUxTool(
      uxIntent(fx, { operationId: 'ux.visible.write', input: { amount: 42 } }),
      queryHost(fx, counters),
    ),
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
    invokeUxToolEffectfully(host.intent({ operationId: 'ux.visible.read' }), host.host()),
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
      queryUxTool(uxIntent(fx), queryHost(fx, counters, { currentDefinitionGraph: movedGraph })),
      'UX_REQUEST_STALE',
    );
    assertNoWork(counters, 'a stale claimed digest must refuse before any admission or dispatch');
  });

  await t.test('a flatly wrong claimed digest refuses', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(
        uxIntent(fx, { expectedDefinitionGraphDigest: 'sha256:stale-claim' }),
        queryHost(fx, counters),
      ),
      'UX_REQUEST_STALE',
    );
    assertNoWork(counters, 'a mismatched claimed digest must refuse before any admission');
  });

  await t.test('a flatly wrong claimed assembly digest refuses too', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(
        uxIntent(fx, { expectedAssemblyDigest: 'sha256:stale-assembly-claim' }),
        queryHost(fx, counters),
      ),
      'UX_REQUEST_STALE',
    );
    assertNoWork(counters, 'a mismatched claimed assembly digest must refuse before any admission');
  });

  await t.test('floating/latest selector claims are not exact identities', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    await expectUxError(
      queryUxTool(
        uxIntent(fx, { expectedDefinitionGraphDigest: 'latest' }),
        queryHost(fx, counters),
      ),
      'INVALID_UX_REQUEST_INPUT',
    );
    await expectUxError(
      queryUxTool(uxIntent(fx, { expectedAssemblyDigest: 'latest' }), queryHost(fx, counters)),
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
        host.intent({ expectedDefinitionGraphDigest: 'sha256:stale-claim' }),
        host.host(),
      ),
      'UX_REQUEST_STALE',
    );
    assertNoWork(counters, 'the effectful seam must refuse stale claimed digests before admission');
  });
});

// ---------------------------------------------------------------------------
// P1-1 pinned successor-repair matrix N1/N2/N3: byte-identical Definition
// implementation replacement + independent currentAssembly/currentBinding
// anchor relation, both seams.
// ---------------------------------------------------------------------------

test('T004E N1 byte-identical Definition implementation replacement (query): a stale V1 assembly intent refuses UX_REQUEST_STALE against the current V2 host before T004A/T004B — same Definition digest, different Assembly', async () => {
  const counters = makeCounters();
  const { v1, v2 } = await uxReplacementFixture();

  // Sanity: the Definition plane is byte-stable across V1 -> V2...
  assert.equal(v1.graphDigest, v2.graphDigest);
  // ...while the sealed assemblies genuinely differ.
  assert.notEqual(v1.currentAssembly.assemblyDigest, v2.currentAssembly.assemblyDigest);

  // The intent was shaped against V1 (expects A1) while the host composition
  // is already fully current at V2 (currentAssembly=A2, currentBinding=B2).
  const staleIntent = uxIntent(v1);
  const host = queryHost(v2, counters);

  await expectUxError(queryUxTool(staleIntent, host), 'UX_REQUEST_STALE');
  assertNoWork(
    counters,
    'a byte-identical Definition implementation replacement must refuse the stale V1 intent before any admission or dispatch',
  );
});

test('T004E N2 byte-identical Definition implementation replacement (effectful): a stale V1 assembly intent refuses UX_REQUEST_STALE before T004C/Central Admission — zero dispatch, zero journal', async () => {
  const counters = makeCounters();
  const { v1, v2 } = await uxReplacementFixture();
  const host = await effectfulHost(v2, counters);

  const staleIntent = host.intent({
    expectedAssemblyDigest: v1.currentAssembly.assemblyDigest,
  });

  await expectUxError(invokeUxToolEffectfully(staleIntent, host.host()), 'UX_REQUEST_STALE');
  assertNoWork(
    counters,
    'the effectful seam must refuse the stale V1 intent before T004C/Central Admission — no effect, no journal record',
  );
});

test('T004E N3 stale host binding vs current assembly: when host.currentBinding.successorAssembly no longer names host.currentAssembly, BOTH seams refuse UX_REQUEST_STALE before any dispatch/effect/journal', async (t) => {
  const { v1, v2 } = await uxReplacementFixture();

  await t.test('query seam', async () => {
    const counters = makeCounters();
    const host = queryHost(v2, counters, { currentBinding: v1.binding });
    await expectUxError(queryUxTool(uxIntent(v2), host), 'UX_REQUEST_STALE');
    assertNoWork(counters, 'a torn host composition must refuse before any dispatch');
  });

  await t.test('effectful seam', async () => {
    const counters = makeCounters();
    const host = await effectfulHost(v2, counters, { binding: v1.binding });
    await expectUxError(invokeUxToolEffectfully(host.intent(), host.host()), 'UX_REQUEST_STALE');
    assertNoWork(counters, 'a torn host composition must refuse before any effect or journal');
  });
});

// ---------------------------------------------------------------------------
// P1/P2 positive controls over the replacement fixture: the CURRENT V2
// composition remains fully usable on both seams.
// ---------------------------------------------------------------------------

test('T004E P1 current V2 positive (query): an intent anchored to the current assembly/binding traverses T004A -> T004B exactly once, OBSERVED-only', async () => {
  const counters = makeCounters();
  const { v2 } = await uxReplacementFixture();

  const result = await queryUxTool(uxIntent(v2), queryHost(v2, counters));

  assert.equal(result.status, 'OBSERVED');
  assert.deepEqual(result.output, { answer: 42 });
  assert.equal(counters.nonEffectfulCalls.length, 1);
  const query = counters.nonEffectfulCalls[0] as { handle: unknown; operationId: string; input: unknown };
  assert.equal(query.handle, v2.binding.implementationHandle);
  assert.equal(query.operationId, 'ux.visible.read');
  assert.deepEqual(query.input, { expression: '1+1' });
  assert.equal(counters.effectfulCalls.length, 0);
  assert.equal(counters.journal.getRecords().length, 0);
});

test('T004E P2 current V2 positive (effectful): an intent anchored to the current assembly/binding routes T004A -> T004C exactly once with exactly one Central Admission journal record; T004B = 0', async () => {
  const counters = makeCounters();
  const { v2 } = await uxReplacementFixture();
  const host = await effectfulHost(v2, counters);

  const result = await invokeUxToolEffectfully(host.intent(), host.host());

  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.effects.length, 1);
  assert.equal(result.outcome.admitted.effects[0]!.disposition, 'executed');
  assert.deepEqual(result.outcome.admitted.effects[0]!.output, { ran: true });
  assert.equal(counters.effectfulCalls.length, 1);
  assert.equal(counters.effectfulCalls[0]!.handle, v2.binding.implementationHandle);
  assert.equal(counters.nonEffectfulCalls.length, 0, 'no T004B/query fallback on the effectful route');
  const records = counters.journal.getRecords();
  assert.equal(records.length, 1, 'exactly one durable journal record on the existing journal');
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectType, EFFECT_TYPE);
});

// ---------------------------------------------------------------------------
// #703 frozen test 5 (rebound to the intent plane) + N4 authority-smuggling
// table: no authority-bearing host object is representable on the portable
// UX intent.
// ---------------------------------------------------------------------------

const AUTHORITY_LOOKALIKE_FIELDS: readonly { readonly field: string; readonly value: unknown }[] = [
  { field: 'currentAssembly', value: { forged: 'assembly' } },
  { field: 'assembly', value: { forged: 'assembly' } },
  { field: 'currentBinding', value: { forged: 'binding' } },
  { field: 'binding', value: { forged: 'binding' } },
  { field: 'currentDefinitionGraph', value: { graphId: 'graph.forged' } },
  { field: 'dispatch', value: { async dispatch() { return {}; } } },
  { field: 'resourceProvider', value: { async resolve() { return undefined; } } },
  { field: 'sha256', value: { async digestUtf8() { return 'forged'; } } },
  { field: 'activator', value: { activate: () => ({}) } },
  { field: 'admissionRequest', value: { target: { forged: true } } },
  { field: 'admissionPorts', value: { governance: {}, baselines: {}, effectJournal: {} } },
  { field: 'effectType', value: 'effect:forged' },
  { field: 'occurrence', value: { workflowId: 'forged', instanceKey: 'forged' } },
  { field: 'exposureEvidence', value: { status: 'ADMITTED', minted: true } },
  { field: 'policy', value: { decideAdmission: () => ({ admitted: true }) } },
  { field: 'journal', value: { append: () => undefined } },
  { field: 'effectJournal', value: { append: () => undefined } },
  { field: 'implementationPin', value: { pin: true } },
  { field: 'implementationHandle', value: { kind: 'runtime-handle', id: 'forged#1' } },
  { field: 'handle', value: { kind: 'runtime-handle', id: 'forged#2' } },
  { field: 'idempotencyKey', value: 'forged:1' },
];

test('T004E N4 UX cannot supply host authority: every authority/lookalike field on the portable intent refuses INVALID_UX_REQUEST_INPUT before any admission or dispatch; hostile accessors never execute', async (t) => {
  await t.test('query seam, full authority lookalike table', async () => {
    const fx = await uxFixture();
    for (const { field, value } of AUTHORITY_LOOKALIKE_FIELDS) {
      const counters = makeCounters();
      const hostile = uxIntent(fx) as unknown as Record<string, unknown>;
      hostile[field] = value;
      await expectUxError(
        queryUxTool(hostile as unknown as UxToolRequestIntent, queryHost(fx, counters)),
        'INVALID_UX_REQUEST_INPUT',
      ).catch((error: unknown) => {
        throw new Error(`authority lookalike field "${field}" was not refused: ${String(error)}`);
      });
      assertNoWork(counters, `authority lookalike "${field}" must mint zero work`);
    }
  });

  await t.test('effectful seam spot rows share the same intent gate', async () => {
    for (const field of ['currentAssembly', 'admissionPorts', 'handle'] as const) {
      const counters = makeCounters();
      const fx = await uxFixture();
      const host = await effectfulHost(fx, counters);
      const hostile = host.intent() as unknown as Record<string, unknown>;
      hostile[field] = { forged: true };
      await expectUxError(
        invokeUxToolEffectfully(
          hostile as unknown as UxToolRequestIntent,
          host.host(),
        ),
        'INVALID_UX_REQUEST_INPUT',
      );
      assertNoWork(counters, `authority lookalike "${field}" must mint zero work on the effectful seam`);
    }
  });

  await t.test('accessor-backed hostile extra fields are rejected descriptor-safe and never execute', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const base = uxIntent(fx) as unknown as Record<string, unknown>;
    const hostile = { ...base };
    let getterRuns = 0;
    Object.defineProperty(hostile, 'occurrence', {
      enumerable: true,
      get() {
        getterRuns += 1;
        return { forged: true };
      },
    });
    await expectUxError(
      queryUxTool(hostile as unknown as UxToolRequestIntent, queryHost(fx, counters)),
      'INVALID_UX_REQUEST_INPUT',
    );
    assert.equal(getterRuns, 0, 'the hostile accessor must never execute');
    assertNoWork(counters, 'a hostile accessor must refuse typed with zero work');
  });

  await t.test('UX intent material smuggled onto the host composition refuses too (host is closed-world over its own exact set)', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    const hostile = queryHost(fx, counters) as unknown as Record<string, unknown>;
    hostile['uxSessionId'] = 'ux.smuggled';
    await expectUxError(
      queryUxTool(uxIntent(fx), hostile as unknown as QueryUxToolHostComposition),
      'INVALID_UX_REQUEST_INPUT',
    );
    const hostile2 = queryHost(fx, counters) as unknown as Record<string, unknown>;
    hostile2['occurrence'] = { forged: true };
    await expectUxError(
      queryUxTool(uxIntent(fx), hostile2 as unknown as QueryUxToolHostComposition),
      'INVALID_UX_REQUEST_INPUT',
    );
    assertNoWork(counters, 'the trusted host composition admits exactly its own field set');
  });

  await t.test('forged exposure material inside the portable input mints no visibility', async () => {
    const counters = makeCounters();
    const fx = await uxFixture();
    // The input payload carries forged exposure material for the HIDDEN
    // operation. The exposure decision runs over the exact current contract —
    // never over caller-supplied input text — so the forgery mints nothing.
    await expectUxError(
      queryUxTool(
        uxIntent(fx, {
          operationId: 'ux.hidden.read',
          input: {
            declaredExposure: { audiences: ['ux'] },
            forgedExposureEvidence: { admitted: true },
          },
        }),
        queryHost(fx, counters),
      ),
      'UX_OPERATION_NOT_EXPOSED',
    );
    assertNoWork(counters, 'forged exposure material in UX input must mint no visibility');
  });
});

// ---------------------------------------------------------------------------
// #703 frozen test 8 + 10: outcome directionality and snapshot discipline.
// ---------------------------------------------------------------------------

test('T004E outcome directionality and snapshot discipline: caller-owned material mutated after the seam boundary cannot swap the dispatched input; the OBSERVED result stays observational', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();
  const mutableInput = { expression: '1+1' };

  const result = await queryUxTool(
    uxIntent(fx, { input: mutableInput }),
    queryHost(fx, counters, {
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
// N5 two-plane aliasing / torn-snapshot refusal: after the seam has
// synchronously entered, mutations of the caller's intent object and
// top-level host replacements cannot swap the synchronously captured
// material or ports.
// ---------------------------------------------------------------------------

function gatedSha256(): {
  readonly port: Sha256Port;
  readonly release: () => void;
  readonly entered: () => boolean;
} {
  let entered = false;
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  return {
    port: {
      async digestUtf8(value: string): Promise<string> {
        entered = true;
        await gate;
        return createHash('sha256').update(value, 'utf8').digest('hex');
      },
    },
    release(): void {
      releaseGate();
    },
    entered(): boolean {
      return entered;
    },
  };
}

test('T004E N5 two-plane aliasing (query): mutations after the synchronous capture — intent fields, nested input, top-level host currentAssembly/currentBinding/currentDefinitionGraph/dispatch/sha256 — cannot swap captured material', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();
  const postMutation: unknown[] = [];
  const gate = gatedSha256();

  const intentRecord = uxIntent(fx) as unknown as Record<string, unknown>;
  const mutableInput = { expression: '1+1' };
  intentRecord['input'] = mutableInput;
  const hostRecord = queryHost(fx, counters, { sha256: gate.port }) as unknown as Record<
    string,
    unknown
  >;

  const promise = queryUxTool(
    intentRecord as unknown as UxToolRequestIntent,
    hostRecord as unknown as QueryUxToolHostComposition,
  );
  // Let the seam synchronously enter and reach the awaited digest point.
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(gate.entered(), 'sanity: the seam reached the awaited digest point');

  // Hostile caller mutates its own intent object and replaces top-level host
  // references AFTER the seam has synchronously captured everything.
  intentRecord['uxSessionId'] = 'ux.hijack';
  intentRecord['toolComponentId'] = 'tool.hijack';
  intentRecord['operationId'] = 'ux.hidden.read';
  intentRecord['input'] = { hijacked: true };
  mutableInput.expression = 'hijacked-too';
  intentRecord['expectedDefinitionGraphDigest'] = 'sha256:torn-read';
  intentRecord['expectedAssemblyDigest'] = 'sha256:torn-assembly';
  hostRecord['currentAssembly'] = {
    assemblyDigest: 'sha256:fake-current',
  } as unknown as SealedRuntimeAssembly;
  hostRecord['currentBinding'] = {
    successorAssembly: hostRecord['currentAssembly'],
  } as unknown as SealedToolImplementationBinding;
  hostRecord['currentDefinitionGraph'] = graph({ graphId: 'graph.hijack' });
  hostRecord['dispatch'] = {
    async dispatch(query: unknown) {
      postMutation.push(query);
      return { hijacked: true };
    },
  };
  hostRecord['sha256'] = realSha256;

  gate.release();
  const result = await promise;

  assert.equal(result.status, 'OBSERVED');
  assert.deepEqual(result.output, { answer: 42 });
  assert.equal(counters.nonEffectfulCalls.length, 1, 'the originally captured dispatch port ran');
  const query = counters.nonEffectfulCalls[0] as { handle: unknown; operationId: string; input: unknown };
  assert.equal(query.operationId, 'ux.visible.read', 'the captured intent target is immutable');
  assert.deepEqual(query.input, { expression: '1+1' }, 'the captured intent input snapshot is immutable');
  assert.equal(query.handle, fx.binding.implementationHandle, 'the original binding handle dispatched');
  assert.equal(postMutation.length, 0, 'a replaced top-level dispatch port must never be used');
  assert.equal(counters.effectfulCalls.length, 0);
  assert.equal(counters.journal.getRecords().length, 0);
});

test('T004E N5 two-plane aliasing (effectful): the effectful seam uses only the synchronously captured intent and original host references/ports', async () => {
  const counters = makeCounters();
  const fx = await uxFixture();
  const postMutation: unknown[] = [];
  const gate = gatedSha256();
  const host = await effectfulHost(fx, counters);

  const intentRecord = host.intent() as unknown as Record<string, unknown>;
  const hostRecord = host.host({ sha256: gate.port }) as unknown as Record<string, unknown>;

  const promise = invokeUxToolEffectfully(
    intentRecord as unknown as UxToolRequestIntent,
    hostRecord as unknown as EffectfulUxToolHostComposition,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(gate.entered(), 'sanity: the seam reached the awaited digest point');

  intentRecord['operationId'] = 'ux.hidden.read';
  intentRecord['input'] = { hijacked: true };
  intentRecord['expectedAssemblyDigest'] = 'sha256:torn-assembly';
  hostRecord['currentAssembly'] = {
    assemblyDigest: 'sha256:fake-current',
  } as unknown as SealedRuntimeAssembly;
  hostRecord['currentBinding'] = {
    successorAssembly: hostRecord['currentAssembly'],
  } as unknown as SealedToolImplementationBinding;
  hostRecord['dispatch'] = {
    async dispatch(query: unknown) {
      postMutation.push(query);
      return { hijacked: true };
    },
  };
  hostRecord['admissionPorts'] = { forged: true };
  hostRecord['effectType'] = 'effect:hijacked';

  gate.release();
  const result = await promise;

  assert.equal(result.outcome.status, 'admitted');
  assert.equal(counters.effectfulCalls.length, 1, 'the originally captured effectful dispatch ran');
  const query = counters.effectfulCalls[0]!;
  assert.equal(query.operationId, 'ux.visible.write', 'the captured intent target is immutable');
  assert.deepEqual(query.input, { amount: 42 }, 'the captured intent input snapshot is immutable');
  assert.equal(query.handle, fx.binding.implementationHandle);
  assert.equal(postMutation.length, 0, 'a replaced top-level dispatch port must never be used');
  assert.equal(counters.nonEffectfulCalls.length, 0);
  const records = counters.journal.getRecords();
  assert.equal(records.length, 1, 'exactly one journal record through the originally captured ports');
  assert.equal(records[0]!.effectType, EFFECT_TYPE, 'the captured effect type is immutable');
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
  readonly intent: (overrides?: Partial<UxToolRequestIntent>) => UxToolRequestIntent;
  readonly host: (
    overrides?: Partial<EffectfulUxToolHostComposition>,
  ) => EffectfulUxToolHostComposition;
}

async function effectfulHost(
  fx: UxFixture,
  counters: UxCounters,
  parts: {
    readonly assembly?: SealedRuntimeAssembly;
    readonly binding?: SealedToolImplementationBinding;
  } = {},
): Promise<EffectfulHost> {
  const assembly = parts.assembly ?? fx.currentAssembly;
  const binding = parts.binding ?? fx.binding;
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
    assembly,
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
    intent(overrides: Partial<UxToolRequestIntent> = {}): UxToolRequestIntent {
      return uxIntent(fx, {
        operationId: 'ux.visible.write',
        input: { amount: 42 },
        ...overrides,
      });
    },
    host(
      overrides: Partial<EffectfulUxToolHostComposition> = {},
    ): EffectfulUxToolHostComposition {
      return {
        currentDefinitionGraph: fx.g,
        currentAssembly: assembly,
        currentBinding: binding,
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

  const result = await invokeUxToolEffectfully(host.intent(), host.host());

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
