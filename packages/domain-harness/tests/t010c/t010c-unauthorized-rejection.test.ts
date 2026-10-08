/**
 * T010C — unauthorized renderer-neutral UX rejection journey evidence
 * (issue #915 gate; frozen #723 readiness contract CLOSED=approved; frozen
 * authority #589@issuecomment-5980528597 T010A section; #589 PACK-D T010C /
 * #534 E11 negative journey; controller #537 LOCAL_FIRST_MAX_SAFE_PARALLELISM
 * #537@6042127032).
 *
 * THE NEGATIVE JOURNEY, against the EXACT SAME frozen T010A fixture as T010B:
 * `tests/fixtures/t010a-neutral-definition.ts` + the literal freeze record
 * `tests/fixtures/t010a-neutral-definition.freeze.ts` (accepted at 407b9ae4
 * via PR #910). Non-exposed/unauthorized mutation and stale/mismatched
 * binding variants are submitted and PROVEN to refuse TYPED before any
 * unauthorized transition, Tool call, side effect, journal mutation or
 * Runtime-state change. The same-fixture identity is NOT assumed: the freeze
 * record is recomputed through the accepted public APIs at the top of this
 * suite and deep-compared (never auto-refreshed) — identity drift fails the
 * suite closed.
 *
 * Required negative matrix (frozen #723), row → evidence:
 *  R1 non-exposed/unauthorized Tool operation:
 *     - the frozen fixture Tool declares NO `declaredExposure` material, so
 *       the UX plane refuses UX_OPERATION_NOT_EXPOSED on BOTH the query and
 *       the effectful seam before any admission or dispatch; the Agent
 *       projection over the frozen graph projects ZERO operations, so the
 *       Agent plane refuses AGENT_OPERATION_NOT_PROJECTED; a forged unknown
 *       operation id refuses UX_OPERATION_NOT_EXPOSED at the kernel T004A
 *       exposure admission (TOOL_COMPONENT_NOT_BOUND for a forged tool id);
 *  R2 stale/mismatched Definition/Assembly/exposure/currentness:
 *     - a UX intent claiming a wrong exact current Definition graph digest
 *       refuses UX_REQUEST_STALE (authoritative recomputation; the claim is
 *       never trusted); an Agent projection bound to another digest refuses
 *       AGENT_PROJECTION_STALE; a stale Assembly anchor refuses
 *       DEFINITION_CURRENTNESS_MISMATCH at the generic T004A exposure
 *       admission (both UX and Agent seams); a moved current graph refuses
 *       DEFINITION_CURRENTNESS_MISMATCH at the kernel T004B/T004C
 *       re-admission on the frozen fixture;
 *  R3 forged occurrence/activation/implementation-binding/resource authority:
 *     - closed-world seam inputs refuse ANY occurrence/journal/admission-
 *       evidence field typed (INVALID_UX_REQUEST_INPUT /
 *       INVALID_PROJECTION_INPUT), including accessor-backed hostile fields
 *       whose getter is never executed; a forged projection carrying
 *       authority material refuses INVALID_PROJECTION_INPUT; a caller-built
 *       binding lookalike refuses UNMINTED_TOOL_IMPLEMENTATION_BINDING at the
 *       T003C mint seam; a missing authoritative occurrence refuses
 *       GOVERNANCE_EXECUTION_PIN_MISSING; a forged resource-currentness
 *       revision refuses RESOURCE_CURRENTNESS_MISMATCH at the T005C re-proof
 *       (resource authority is re-proven against the pinned occurrence, never
 *       trusted from the provider claim alone);
 *  R4 mutation attempted through query-only/observational seams:
 *     - a mutation-capable operation presented to the UX query seam refuses
 *       UX_MUTATION_REFUSED, and to the Agent query seam refuses
 *       AGENT_MUTATION_REFUSED, both BEFORE any admission or dispatch; the
 *       generic T004B kernel seam refuses an effectful operation
 *       (EFFECTFUL_OPERATION_REJECTED) and the T004C seam refuses an
 *       effectless one (EFFECTLESS_OPERATION_REJECTED) on the frozen fixture.
 *       DERIVED-GRAPH NOTE: the frozen fixture operations carry no exposure
 *       material, so on the frozen fixture the same intent refuses one gate
 *       EARLIER (UX_OPERATION_NOT_EXPOSED, row R1). To isolate the
 *       query-seam mutation gate itself (typed UX_MUTATION_REFUSED /
 *       AGENT_MUTATION_REFUSED), a DERIVED exposure-material variant of the
 *       frozen graph is used — same components/relations/capability, only
 *       `declaredExposure.audiences` added. The variant is NEVER claimed to
 *       be the frozen fixture: its digest necessarily differs and the
 *       same-fixture anchor test above pins the frozen identity;
 *  R5 invalid authority class where production effect would be required:
 *     - a SIMULATION-class pin refuses production effect AUTHORITY_CLASS_MISMATCH
 *       before any dispatch or journal record (kernel path on the frozen
 *       fixture AND the UX effectful seam); a legacy class-less pin refuses
 *       AUTHORITY_CLASS_FORBIDDEN (never upgraded to PRODUCTION);
 *  R6 missing/ambiguous exact binding fails closed — NO latest/default/order
 *     fallback:
 *     - floating/selector identities (`op.t010a.read@latest`, `latest`, `*`)
 *       refuse INVALID_UX_REQUEST_INPUT (exact identities only, never
 *       normalized); two compatible T003C candidates refuse
 *       AMBIGUOUS_TOOL_IMPLEMENTATION (never first/order-wins); zero
 *       candidates refuse MISSING_TOOL_IMPLEMENTATION; a wrong-audience
 *       exposure (`agent`-only for UX / `ux`-only for Agent) refuses with no
 *       cross-plane fallback; an unbound exact Kind version refuses
 *       ASSEMBLY_ADMISSION_KIND_NOT_BOUND (no fallback Kind).
 *
 * Required invariants (every row, counting + byte-stability):
 *  I1 state remains unchanged on EVERY rejection — the durable execution
 *     store pin/snapshot, the ONE Central Admission journal and the
 *     deterministic test effect recorder are snapshotted before each attempt
 *     and deep-compared after (byte-stability);
 *  I2 the deterministic test effect recorder and the Central Admission
 *     journal receive ZERO unauthorized effects (explicit counting
 *     assertions on every row);
 *  I3 UX/model/Tool payload cannot become Domain authority — forged
 *     `declaredExposure`/`effect` material inside the portable input/proposal
 *     mints nothing (the exact current contract alone classifies exposure and
 *     effect);
 *  I4 ONE Runtime/Central Admission/effect authority only — the authorized
 *     sanity paths cross exactly ONE existing journal (the host-supplied
 *     VolatileAdmissionEffectJournal instance) exactly once; every refusal
 *     leaves it at zero; the query seams never touch it; the source-level
 *     no-second-authority proof is the accepted T004E/T004D boundary suites
 *     (referenced, not duplicated);
 *  I5 renderer-neutral core — no React/React Native/DOM/native renderer or
 *     domain-ux/DAC import exists anywhere under src/ (import-specifier scan).
 *
 * SOURCE_MUTATION=NONE: tests/evidence-only write set. ENVIRONMENT=LOCAL_AGENT
 * (ZCode kimi-executor, kimi-for-coding), real-host posture: real node
 * runtime, real sha256 port, no renderer present, no network, no mocks of
 * any accepted seam.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  T010A_CAPABILITY,
  T010A_EFFECT_TYPE,
  T010A_KIND,
  T010A_OP_READ,
  T010A_OP_RECORD,
  T010A_RESOURCE_CURRENTNESS,
  T010A_RESOURCE_KEY,
  T010A_TOOL_COMPONENT_ID,
  T010A_TOOL_IMPLEMENTATION,
  T010A_WORKFLOW_COMPONENT_ID,
  T010A_WORKFLOW_INSTANCE_ID,
  T010aMemoryDurableExecutionStore,
  T010aMemoryExactPackageCdiAuthority,
  T010aTestExecutor,
  admitT010aOperation,
  bindT010aTool,
  buildT010aAssembly,
  buildT010aOccurrenceContext,
  t010aCaller,
  t010aDefinitionGraph,
  t010aResourceProvider,
  t010aSha256,
  t010aToolComponent,
  type T010aAssemblyBundle,
  type T010aOccurrenceContext,
} from '../fixtures/t010a-neutral-definition.js';
import { T010A_FREEZE_RECORD } from '../fixtures/t010a-neutral-definition.freeze.js';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  admitComponentWithAssembly,
  RuntimeAssemblyError,
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  verifyToolImplementationBinding,
  ToolImplementationBindingError,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  InvocationRequestError,
} from '../../src/contracts/invocation-request.js';
import {
  invokeNonEffectfulTool,
  NonEffectfulInvocationError,
  type NonEffectfulToolDispatchQuery,
} from '../../src/contracts/non-effectful-invocation.js';
import {
  invokeEffectfulTool,
  EffectfulInvocationError,
  type EffectfulToolDispatchQuery,
} from '../../src/contracts/effectful-invocation.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { ResourceProvider } from '../../src/contracts/resource-resolution.js';
import {
  GovernanceExecutionBindingError,
  AssemblyExecutionActivator,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  createGovernanceExecutionPin,
} from '../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/effect-journal.js';
import type { CentralAdmissionPorts } from '../../src/admission/contracts.js';
import {
  UxToolRequestError,
  invokeUxToolEffectfully,
  queryUxTool,
  type InvokeUxToolEffectfullyInput,
  type QueryUxToolInput,
} from '../../src/adapters/ux-tool-request.js';
import {
  AgentToolProjectionError,
  admitAgentMutationIntent,
  projectAgentToolSurface,
  queryAgentTool,
  type AdmitAgentMutationIntentInput,
  type AgentToolQueryInput,
} from '../../src/adapters/agent-tool-projection.js';

// ---------------------------------------------------------------------------
// Same-fixture identity anchor: recompute the freeze record through the
// accepted public APIs (exactly like the T010A suite) — drift fails closed.
// ---------------------------------------------------------------------------

test('T010C anchor: the SAME frozen T010A fixture identity recomputes through the accepted public APIs and deep-matches the literal freeze record', async () => {
  const graph = t010aDefinitionGraph();
  const bundle = await buildT010aAssembly();
  const selection = await resolveCurrentCapabilityProvider(
    graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    bundle.definitionGraphDigest,
    t010aSha256,
  );
  assert.equal(selection.provider.componentId, T010A_TOOL_COMPONENT_ID);
  const binding = await bindT010aTool(bundle, new T010aTestExecutor());

  const workflow = graph.components.find(
    (component) => component.componentId === T010A_WORKFLOW_COMPONENT_ID,
  )!;
  const tool = graph.components.find(
    (component) => component.componentId === T010A_TOOL_COMPONENT_ID,
  )!;
  const toolBody = tool.semanticBody as unknown as {
    operations: readonly { operationId: string; effect: string }[];
  };

  const recomputed = {
    schema: 't010a.freeze-record/v1',
    semantic: {
      graphId: graph.graphId,
      workflowComponentId: workflow.componentId,
      toolComponentId: tool.componentId,
      relationId: graph.relations[0]!.relationId,
      relationKind: graph.relations[0]!.relationKind,
      workflowKindRef: workflow.kind,
      toolKindRef: tool.kind,
      capabilityRef: T010A_CAPABILITY,
      operations: toolBody.operations.map((operation) => ({
        operationId: operation.operationId,
        effect: operation.effect,
      })),
    },
    definition: { definitionGraphDigest: bundle.definitionGraphDigest },
    kindImplementation: {
      workflowRole: bundle.assembly.record.kindImplementations[0]!,
      toolRole: bundle.assembly.record.kindImplementations[0]!,
    },
    toolBinding: binding.evidence,
    finalAssembly: {
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      kindImplementations: binding.successorAssembly.record.kindImplementations,
      implementationBindingEvidence:
        binding.successorAssembly.record.implementationBindingEvidence,
    },
  };
  assert.deepEqual(recomputed, T010A_FREEZE_RECORD);
  // The frozen fixture Tool declares NO exposure material at all — this is
  // what makes the fixture the correct negative-journey substrate for R1.
  const serializedOps = JSON.stringify(toolBody.operations);
  assert.ok(!serializedOps.includes('declaredExposure'));
  // The public consumer verifier accepts the frozen binding under the exact
  // pin — the substrate is the LIVE accepted binding, not a lookalike.
  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: binding.successorAssembly,
    expectedImplementationPin: T010A_TOOL_IMPLEMENTATION,
    sha256: t010aSha256,
  });
  assert.equal(typeof verified.implementationHandle, 'object');
});

// ---------------------------------------------------------------------------
// Shared negative-journey harness: counters, durable-state snapshots and the
// typed-refusal + zero-effect + byte-stability assertion used by EVERY row.
// ---------------------------------------------------------------------------

interface JourneyCounters {
  readonly nonEffectfulCalls: NonEffectfulToolDispatchQuery[];
  readonly effectfulCalls: EffectfulToolDispatchQuery[];
  resourceResolutions: number;
}

interface DurableSnapshot {
  readonly storePin: unknown;
  readonly storeSnapshot: unknown;
  readonly journalRecords: readonly unknown[];
  readonly effects: readonly unknown[];
  readonly observations: readonly unknown[];
}

function makeCounters(): JourneyCounters {
  return { nonEffectfulCalls: [], effectfulCalls: [], resourceResolutions: 0 };
}

async function captureDurable(
  store: T010aMemoryDurableExecutionStore,
  journal: VolatileAdmissionEffectJournal,
  executor: T010aTestExecutor,
): Promise<DurableSnapshot> {
  // JSON round-trip: this is a BYTE-stability snapshot of every durable and
  // recorder surface — deep identity of the serialized bytes, not aliasing.
  // The durable execution store surfaces (pinned occurrence + bound snapshot)
  // are read through the store's own public read ports.
  const [storePin, storeSnapshot] = await Promise.all([
    store.getGovernanceExecutionPin(T010A_WORKFLOW_INSTANCE_ID),
    store.getGovernanceBoundSnapshot(T010A_WORKFLOW_INSTANCE_ID),
  ]);
  return JSON.parse(
    JSON.stringify({
      storePin,
      storeSnapshot,
      journalRecords: journal.getRecords(),
      effects: executor.effects(),
      observations: executor.observations(),
    }),
  ) as DurableSnapshot;
}

function assertNoUnauthorizedWork(
  counters: JourneyCounters,
  executor: T010aTestExecutor,
  journal: VolatileAdmissionEffectJournal,
  row: string,
): void {
  assert.equal(counters.nonEffectfulCalls.length, 0, `${row}: zero non-effectful dispatch`);
  assert.equal(counters.effectfulCalls.length, 0, `${row}: zero effectful dispatch`);
  assert.equal(journal.getRecords().length, 0, `${row}: ZERO journal records`);
  assert.equal(executor.effects().length, 0, `${row}: zero recorder effects`);
}

async function expectRefusal(
  promise: Promise<unknown>,
  errorClass: new (...args: never[]) => Error,
  code: string,
  row: string,
): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    assert.ok(
      error instanceof errorClass,
      `${row}: expected ${errorClass.name}(${code}), got ${String(error)}`,
    );
    assert.equal((error as { code?: string }).code, code, `${row}: typed refusal code`);
    return error as Error;
  }
  throw new Error(`${row}: expected ${errorClass.name}(${code}), but the call resolved`);
}

interface BoundFrozen {
  readonly bundle: T010aAssemblyBundle;
  readonly executor: T010aTestExecutor;
  readonly binding: SealedToolImplementationBinding;
}

async function boundFrozen(): Promise<BoundFrozen> {
  const bundle = await buildT010aAssembly();
  const executor = new T010aTestExecutor();
  const binding = await bindT010aTool(bundle, executor);
  return { bundle, executor, binding };
}

/** Counting non-effectful dispatch port — records crossings, returns valid output. */
function countingNonEffectfulDispatch(counters: JourneyCounters): {
  readonly dispatch: (query: NonEffectfulToolDispatchQuery) => Promise<unknown>;
} {
  return {
    async dispatch(query: NonEffectfulToolDispatchQuery) {
      counters.nonEffectfulCalls.push(query);
      return { observed: true };
    },
  };
}

/** Counting effectful dispatch port — records crossings, returns valid output. */
function countingEffectfulDispatch(counters: JourneyCounters): {
  readonly dispatch: (query: EffectfulToolDispatchQuery) => Promise<unknown>;
} {
  return {
    async dispatch(query: EffectfulToolDispatchQuery) {
      counters.effectfulCalls.push(query);
      return { recorded: true };
    },
  };
}

/** The fixture resource provider wrapped with a resolution counter. */
function countingResourceProvider(counters: JourneyCounters): ResourceProvider {
  const inner = t010aResourceProvider();
  return {
    async resolve(request) {
      counters.resourceResolutions += 1;
      return inner.resolve(request);
    },
  };
}

// ---------------------------------------------------------------------------
// DERIVED exposure-material variant (R4/R5 gate isolation ONLY — never the
// frozen fixture): identical components/relations/capability, with
// `declaredExposure.audiences` added to the two frozen operations. The
// variant necessarily has a DIFFERENT Definition graph digest; every use is
// labelled, and the frozen identity stays pinned by the anchor test above.
// ---------------------------------------------------------------------------

function exposedVariantGraph(audiences: readonly string[]): DefinitionGraphEnvelope {
  const graph = JSON.parse(JSON.stringify(t010aDefinitionGraph())) as DefinitionGraphEnvelope;
  const tool = graph.components.find(
    (component) => component.componentId === T010A_TOOL_COMPONENT_ID,
  )!;
  const body = tool.semanticBody as unknown as {
    operations: { declaredExposure?: unknown }[];
  };
  for (const operation of body.operations) {
    operation.declaredExposure = { audiences: [...audiences] };
  }
  validateDefinitionGraphEnvelope(graph);
  return graph;
}

interface BoundVariant {
  readonly graph: DefinitionGraphEnvelope;
  readonly digest: string;
  readonly bundle: T010aAssemblyBundle;
  readonly executor: T010aTestExecutor;
  readonly binding: SealedToolImplementationBinding;
}

async function boundVariant(audiences: readonly string[]): Promise<BoundVariant> {
  const graph = exposedVariantGraph(audiences);
  const digest = await computeDefinitionGraphDigest(graph, t010aSha256);
  const bundle = await buildT010aAssembly(graph);
  const executor = new T010aTestExecutor();
  const binding = await bindT010aTool(bundle, executor);
  assert.notEqual(digest, T010A_FREEZE_RECORD.definition.definitionGraphDigest);
  return { graph, digest, bundle, executor, binding };
}

function uxQuery(
  variant: BoundVariant,
  counters: JourneyCounters,
  operationId: string,
  overrides: Record<string, unknown> = {},
): QueryUxToolInput {
  return {
    uxSessionId: 'ux.session-t010c',
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId,
    input: { note: 't010c' },
    expectedDefinitionGraphDigest: variant.digest,
    binding: variant.binding,
    currentDefinitionGraph: variant.graph,
    dispatch: countingNonEffectfulDispatch(counters),
    sha256: t010aSha256,
    ...overrides,
  } as QueryUxToolInput;
}

function uxEffectful(
  variant: BoundVariant,
  counters: JourneyCounters,
  fx: T010aOccurrenceContext,
  operationId: string,
  overrides: Record<string, unknown> = {},
): InvokeUxToolEffectfullyInput {
  return {
    uxSessionId: 'ux.session-t010c',
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId,
    input: { note: 't010c' },
    expectedDefinitionGraphDigest: variant.digest,
    binding: variant.binding,
    currentDefinitionGraph: variant.graph,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    effectType: T010A_EFFECT_TYPE,
    dispatch: countingEffectfulDispatch(counters),
    resourceProvider: countingResourceProvider(counters),
    sha256: t010aSha256,
    ...overrides,
  } as InvokeUxToolEffectfullyInput;
}

// ---------------------------------------------------------------------------
// R1 — non-exposed/unauthorized Tool operation (frozen fixture, zero work).
// ---------------------------------------------------------------------------

test('T010C R1: the frozen fixture operations are invisible to the UX plane — both seams refuse UX_OPERATION_NOT_EXPOSED before any admission or dispatch', async (t) => {
  const { bundle, executor, binding } = await boundFrozen();
  const store = new T010aMemoryDurableExecutionStore();
  const journal = new VolatileAdmissionEffectJournal();

  await t.test('query seam refuses the non-exposed effect=none operation', async () => {
    const counters = makeCounters();
    const before = await captureDurable(store, journal, executor);
    await expectRefusal(
      queryUxTool({
        uxSessionId: 'ux.session-t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_READ,
        input: { note: 't010c' },
        expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
        binding,
        currentDefinitionGraph: bundle.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      }),
      UxToolRequestError,
      'UX_OPERATION_NOT_EXPOSED',
      'R1 query',
    );
    assertNoUnauthorizedWork(counters, executor, journal, 'R1 query');
    assert.equal(counters.resourceResolutions, 0, 'R1 query: resource plane untouched');
    assert.deepEqual(await captureDurable(store, journal, executor), before, 'R1 query: byte-stable state');
  });

  await t.test('effectful seam refuses the non-exposed mutation-capable operation', async () => {
    const counters = makeCounters();
    const fx = await buildT010aOccurrenceContext(binding, bundle, {
      effectInput: { note: 't010c' },
    });
    const before = await captureDurable(fx.store, fx.journal, executor);
    await expectRefusal(
      invokeUxToolEffectfully({
        uxSessionId: 'ux.session-t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_RECORD,
        input: { note: 't010c' },
        expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
        binding,
        currentDefinitionGraph: bundle.graph,
        activator: fx.activator,
        admissionRequest: fx.admissionRequest,
        admissionPorts: fx.admissionPorts,
        effectType: T010A_EFFECT_TYPE,
        dispatch: countingEffectfulDispatch(counters),
        resourceProvider: countingResourceProvider(counters),
        sha256: t010aSha256,
      }),
      UxToolRequestError,
      'UX_OPERATION_NOT_EXPOSED',
      'R1 effectful',
    );
    assertNoUnauthorizedWork(counters, executor, fx.journal, 'R1 effectful');
    assert.equal(counters.resourceResolutions, 0, 'R1 effectful: resource plane untouched');
    assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R1 effectful: byte-stable state');
  });

  await t.test('a forged unknown operation id is equally invisible to the UX plane', async () => {
    const counters = makeCounters();
    await expectRefusal(
      queryUxTool({
        uxSessionId: 'ux.session-t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: 'op.t010a.forged',
        input: {},
        expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
        binding,
        currentDefinitionGraph: bundle.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      }),
      UxToolRequestError,
      'UX_OPERATION_NOT_EXPOSED',
      'R1 forged op id',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });
});

test('T010C R1: the Agent projection over the frozen fixture is EMPTY — the Agent plane refuses AGENT_OPERATION_NOT_PROJECTED before any admission or dispatch', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const store = new T010aMemoryDurableExecutionStore();
  const journal = new VolatileAdmissionEffectJournal();

  const projection = await projectAgentToolSurface({
    agentId: 'agent.t010c',
    currentDefinitionGraph: bundle.graph,
    sha256: t010aSha256,
  });
  assert.equal(projection.graphId, T010A_FREEZE_RECORD.semantic.graphId);
  assert.equal(
    projection.definitionGraphDigest,
    T010A_FREEZE_RECORD.definition.definitionGraphDigest,
  );
  const frozenTool = projection.tools.find(
    (entry) => entry.toolComponentId === T010A_TOOL_COMPONENT_ID,
  );
  assert.ok(frozenTool, 'the frozen Tool Component is present but projects ZERO operations');
  assert.equal(frozenTool.operations.length, 0);

  const before = await captureDurable(store, journal, executor);
  await expectRefusal(
    queryAgentTool({
      agentId: 'agent.t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_READ,
      proposal: { note: 't010c' },
      projection,
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    AgentToolProjectionError,
    'AGENT_OPERATION_NOT_PROJECTED',
    'R1 agent',
  );
  assertNoUnauthorizedWork(counters, executor, journal, 'R1 agent');
  assert.deepEqual(await captureDurable(store, journal, executor), before, 'R1 agent: byte-stable state');
});

test('T010C R1: a forged Tool Component id refuses TOOL_COMPONENT_NOT_BOUND at the kernel T004A exposure admission (no implicit binding fallback)', async () => {
  const { bundle, binding } = await boundFrozen();
  await expectRefusal(
    admitToolExposure(
      {
        toolComponentId: 'tool.t010a.forged',
        operationId: T010A_OP_READ,
        caller: t010aCaller(),
        assembly: binding.successorAssembly,
        currentDefinitionGraph: bundle.graph,
        policy: { decideAdmission: () => ({ admitted: true }) },
      },
      t010aSha256,
    ),
    InvocationRequestError,
    'TOOL_COMPONENT_NOT_BOUND',
    'R1 forged tool',
  );
});

// ---------------------------------------------------------------------------
// R2 — stale/mismatched Definition/Assembly/exposure/currentness.
// ---------------------------------------------------------------------------

test('T010C R2: a UX intent claiming a wrong exact current Definition graph digest refuses UX_REQUEST_STALE before any admission (authoritative recomputation, no fallback)', async (t) => {
  const variant = await boundVariant(['ux']);
  const moved = exposedVariantGraph(['ux']);
  (moved.components[0]!.semanticBody as { note?: string }).note = 'MOVED';

  await t.test('a foreign digest claim refuses stale', async () => {
    const counters = makeCounters();
    const journal = new VolatileAdmissionEffectJournal();
    const before = await captureDurable(new T010aMemoryDurableExecutionStore(), journal, variant.executor);
    await expectRefusal(
      queryUxTool(
        uxQuery(variant, counters, T010A_OP_READ, {
          expectedDefinitionGraphDigest:
            'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        }),
      ),
      UxToolRequestError,
      'UX_REQUEST_STALE',
      'R2 stale foreign digest',
    );
    assertNoUnauthorizedWork(counters, variant.executor, journal, 'R2 stale foreign digest');
    assert.equal(counters.resourceResolutions, 0);
    assert.deepEqual(
      await captureDurable(new T010aMemoryDurableExecutionStore(), journal, variant.executor),
      before,
      'R2 stale foreign digest: byte-stable state',
    );
  });

  await t.test('a digest claim for an older graph state refuses stale (the claim is never trusted over recomputation)', async () => {
    const counters = makeCounters();
    const movedDigest = await computeDefinitionGraphDigest(moved, t010aSha256);
    assert.notEqual(movedDigest, variant.digest);
    await expectRefusal(
      queryUxTool(
        uxQuery(variant, counters, T010A_OP_READ, {
          expectedDefinitionGraphDigest: movedDigest,
        }),
      ),
      UxToolRequestError,
      'UX_REQUEST_STALE',
      'R2 stale older state',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });
});

test('T010C R2: an Agent projection bound to another graph state refuses AGENT_PROJECTION_STALE before any admission or dispatch', async () => {
  const variant = await boundVariant(['ux', 'agent']);
  const counters = makeCounters();
  const journal = new VolatileAdmissionEffectJournal();
  // The projection is minted over the variant; the current graph is the
  // FROZEN graph — same graphId, different digest => stale, fail closed.
  const projection = await projectAgentToolSurface({
    agentId: 'agent.t010c',
    currentDefinitionGraph: variant.graph,
    sha256: t010aSha256,
  });
  assert.equal(
    projection.definitionGraphDigest,
    variant.digest,
  );
  const { bundle, executor, binding } = await boundFrozen();
  const before = await captureDurable(new T010aMemoryDurableExecutionStore(), journal, executor);
  await expectRefusal(
    queryAgentTool({
      agentId: 'agent.t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_READ,
      proposal: {},
      projection,
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    AgentToolProjectionError,
    'AGENT_PROJECTION_STALE',
    'R2 agent stale projection',
  );
  assertNoUnauthorizedWork(counters, executor, journal, 'R2 agent stale projection');
  assert.deepEqual(
    await captureDurable(new T010aMemoryDurableExecutionStore(), journal, executor),
    before,
    'R2 agent stale projection: byte-stable state',
  );
});

test('T010C R2: a stale Assembly anchor refuses DEFINITION_CURRENTNESS_MISMATCH at the generic T004A exposure admission — through BOTH caller-plane seams, before any dispatch', async (t) => {
  const variant = await boundVariant(['ux', 'agent']);
  const frozen = await boundFrozen();
  const counters = makeCounters();

  await t.test('UX query seam with a stale anchor', async () => {
    await expectRefusal(
      queryUxTool(
        uxQuery(variant, counters, T010A_OP_READ, { binding: frozen.binding }),
      ),
      InvocationRequestError,
      'DEFINITION_CURRENTNESS_MISMATCH',
      'R2 UX stale anchor',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });

  await t.test('Agent mutation-intent seam with a stale assembly', async () => {
    const projection = await projectAgentToolSurface({
      agentId: 'agent.t010c',
      currentDefinitionGraph: variant.graph,
      sha256: t010aSha256,
    });
    await expectRefusal(
      admitAgentMutationIntent({
        agentId: 'agent.t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_RECORD,
        proposal: {},
        projection,
        assembly: frozen.binding.successorAssembly,
        currentDefinitionGraph: variant.graph,
        sha256: t010aSha256,
      } as AdmitAgentMutationIntentInput),
      InvocationRequestError,
      'DEFINITION_CURRENTNESS_MISMATCH',
      'R2 agent stale assembly',
    );
  });
});

test('T010C R2: a moved current Definition graph refuses DEFINITION_CURRENTNESS_MISMATCH at the kernel T004B/T004C re-admission on the frozen fixture — before any dispatch, effect or journal record', async (t) => {
  const { bundle, executor, binding } = await boundFrozen();
  const base = t010aDefinitionGraph();
  const moved: DefinitionGraphEnvelope = {
    ...base,
    components: [
      {
        ...base.components[0]!,
        semanticBody: { ...(base.components[0]!.semanticBody as object), note: 'MOVED' },
      },
      base.components[1]!,
    ],
  };
  const movedDigest = await computeDefinitionGraphDigest(moved, t010aSha256);
  assert.notEqual(movedDigest, bundle.definitionGraphDigest);

  await t.test('T004B non-effectful re-admission refuses stale currentness', async () => {
    const counters = makeCounters();
    const admitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, { note: 'x' });
    const journal = new VolatileAdmissionEffectJournal();
    await expectRefusal(
      invokeNonEffectfulTool({
        request: admitted,
        binding,
        currentDefinitionGraph: moved,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      }),
      InvocationRequestError,
      'DEFINITION_CURRENTNESS_MISMATCH',
      'R2 T004B stale',
    );
    assertNoUnauthorizedWork(counters, executor, journal, 'R2 T004B stale');
  });

  await t.test('T004C effectful re-admission refuses stale currentness before the occurrence gates', async () => {
    const counters = makeCounters();
    const fx = await buildT010aOccurrenceContext(binding, bundle, { effectInput: { note: 'x' } });
    const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, { note: 'x' });
    const before = await captureDurable(fx.store, fx.journal, executor);
    await expectRefusal(
      invokeEffectfulTool({
        request: admitted,
        binding,
        currentDefinitionGraph: moved,
        activator: fx.activator,
        admissionRequest: fx.admissionRequest,
        admissionPorts: fx.admissionPorts,
        effectType: T010A_EFFECT_TYPE,
        dispatch: countingEffectfulDispatch(counters),
        resourceProvider: countingResourceProvider(counters),
        sha256: t010aSha256,
      }),
      InvocationRequestError,
      'DEFINITION_CURRENTNESS_MISMATCH',
      'R2 T004C stale',
    );
    assertNoUnauthorizedWork(counters, executor, fx.journal, 'R2 T004C stale');
    assert.equal(counters.resourceResolutions, 0, 'R2 T004C stale: resources untouched');
    assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R2 T004C stale: byte-stable state');
  });
});

// ---------------------------------------------------------------------------
// R3 — forged occurrence/activation/implementation-binding/resource authority.
// ---------------------------------------------------------------------------

test('T010C R3: occurrence/journal/admission-evidence material is unrepresentable on the closed-world UX seams — every spelling refuses INVALID_UX_REQUEST_INPUT before any admission', async (t) => {
  const variant = await boundVariant(['ux']);

  await t.test('an occurrence field on the query seam refuses typed', async () => {
    const counters = makeCounters();
    await expectRefusal(
      queryUxTool(
        uxQuery(variant, counters, T010A_OP_READ, {
          occurrence: { workflowInstanceId: 'forged' },
        }),
      ),
      UxToolRequestError,
      'INVALID_UX_REQUEST_INPUT',
      'R3 occurrence field',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });

  await t.test('journal/admitted-exposure/idempotency fields on the effectful seam refuse typed', async () => {
    const counters = makeCounters();
    const fx = await buildT010aOccurrenceContext(variant.binding, variant.bundle, {
      effectInput: { note: 't010c' },
    });
    for (const [field, material] of [
      ['effectJournal', { getRecords: () => [] }],
      ['admittedExposure', { admitted: true }],
      ['idempotencyKey', 'forged-key'],
      ['exposurePolicy', { decideAdmission: () => ({ admitted: true }) }],
    ] as const) {
      await expectRefusal(
        invokeUxToolEffectfully(
          uxEffectful(variant, counters, fx, T010A_OP_RECORD, { [field]: material }),
        ),
        UxToolRequestError,
        'INVALID_UX_REQUEST_INPUT',
        `R3 effectful ${field}`,
      );
    }
    assert.equal(counters.effectfulCalls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });

  await t.test('an accessor-backed hostile field is refused WITHOUT executing the getter', async () => {
    const counters = makeCounters();
    const input = uxQuery(variant, counters, T010A_OP_READ) as unknown as Record<string, unknown>;
    let getterExecuted = false;
    Object.defineProperty(input, 'occurrence', {
      get() {
        getterExecuted = true;
        throw new Error('hostile getter executed');
      },
      enumerable: true,
      configurable: true,
    });
    await expectRefusal(
      queryUxTool(input as unknown as QueryUxToolInput),
      UxToolRequestError,
      'INVALID_UX_REQUEST_INPUT',
      'R3 hostile accessor',
    );
    assert.equal(getterExecuted, false, 'the descriptor-safe snapshot never invokes hidden getters');
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });
});

test('T010C R3: forged projection/authority material on the Agent seams refuses INVALID_PROJECTION_INPUT before any admission', async (t) => {
  const variant = await boundVariant(['agent']);
  const counters = makeCounters();

  await t.test('an authority-bearing extra field on the agent query input refuses typed', async () => {
    const projection = await projectAgentToolSurface({
      agentId: 'agent.t010c',
      currentDefinitionGraph: variant.graph,
      sha256: t010aSha256,
    });
    await expectRefusal(
      queryAgentTool({
        agentId: 'agent.t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_READ,
        proposal: {},
        projection,
        binding: variant.binding,
        currentDefinitionGraph: variant.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
        exposureEvidence: { forged: true },
      } as unknown as AgentToolQueryInput),
      AgentToolProjectionError,
      'INVALID_PROJECTION_INPUT',
      'R3 agent extra field',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });

  await t.test('a forged projection carrying verdict material refuses typed (the projection is derived metadata only)', async () => {
    const projection = await projectAgentToolSurface({
      agentId: 'agent.t010c',
      currentDefinitionGraph: variant.graph,
      sha256: t010aSha256,
    });
    const forged = {
      ...JSON.parse(JSON.stringify(projection)),
      verdict: { admitted: true },
    };
    await expectRefusal(
      queryAgentTool({
        agentId: 'agent.t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_READ,
        proposal: {},
        projection: forged,
        binding: variant.binding,
        currentDefinitionGraph: variant.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      } as unknown as AgentToolQueryInput),
      AgentToolProjectionError,
      'INVALID_PROJECTION_INPUT',
      'R3 forged projection',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });
});

test('T010C R3: a caller-built binding lookalike refuses UNMINTED_TOOL_IMPLEMENTATION_BINDING at the T003C mint seam — implementation authority is never caller-forgeable', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const journal = new VolatileAdmissionEffectJournal();
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, { note: 'x' });
  const lookalike = {
    evidence: { ...binding.evidence },
    successorAssembly: binding.successorAssembly,
    implementationHandle: binding.implementationHandle,
  } as unknown as SealedToolImplementationBinding;
  const before = await captureDurable(new T010aMemoryDurableExecutionStore(), journal, executor);
  await expectRefusal(
    invokeNonEffectfulTool({
      request: admitted,
      binding: lookalike,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    ToolImplementationBindingError,
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    'R3 forged binding',
  );
  assertNoUnauthorizedWork(counters, executor, journal, 'R3 forged binding');
  assert.deepEqual(
    await captureDurable(new T010aMemoryDurableExecutionStore(), journal, executor),
    before,
    'R3 forged binding: byte-stable state',
  );
});

test('T010C R3: a missing authoritative occurrence refuses GOVERNANCE_EXECUTION_PIN_MISSING before any dispatch — through the kernel seam AND the UX effectful seam', async (t) => {
  await t.test('kernel T004C on the frozen fixture (no pin was ever activated)', async () => {
    const { bundle, executor, binding } = await boundFrozen();
    const counters = makeCounters();
    // skipActivation: the pin object exists but was never bound durable.
    const fx = await buildT010aOccurrenceContext(binding, bundle, {
      effectInput: { note: 't010c' },
      skipActivation: true,
    });
    const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, { note: 't010c' });
    const before = await captureDurable(fx.store, fx.journal, executor);
    await expectRefusal(
      invokeEffectfulTool({
        request: admitted,
        binding,
        currentDefinitionGraph: bundle.graph,
        activator: fx.activator,
        admissionRequest: fx.admissionRequest,
        admissionPorts: fx.admissionPorts,
        effectType: T010A_EFFECT_TYPE,
        dispatch: countingEffectfulDispatch(counters),
        resourceProvider: countingResourceProvider(counters),
        sha256: t010aSha256,
      }),
      GovernanceExecutionBindingError,
      'GOVERNANCE_EXECUTION_PIN_MISSING',
      'R3 no occurrence (kernel)',
    );
    assertNoUnauthorizedWork(counters, executor, fx.journal, 'R3 no occurrence (kernel)');
    assert.equal(counters.resourceResolutions, 0, 'R3 no occurrence: resource plane untouched');
    assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R3 no occurrence: byte-stable state');
  });

  await t.test('UX effectful seam: admission succeeds, the T004C occurrence gate still refuses — a sealed Assembly alone is not activation authority', async () => {
    const variant = await boundVariant(['ux']);
    const counters = makeCounters();
    const fx = await buildT010aOccurrenceContext(variant.binding, variant.bundle, {
      effectInput: { note: 't010c' },
      skipActivation: true,
    });
    await expectRefusal(
      invokeUxToolEffectfully(uxEffectful(variant, counters, fx, T010A_OP_RECORD)),
      GovernanceExecutionBindingError,
      'GOVERNANCE_EXECUTION_PIN_MISSING',
      'R3 no occurrence (UX)',
    );
    assertNoUnauthorizedWork(counters, variant.executor, fx.journal, 'R3 no occurrence (UX)');
  });
});

test('T010C R3: a forged resource-currentness revision refuses RESOURCE_CURRENTNESS_MISMATCH at the T005C occurrence re-proof — resource authority is re-proven against the pinned occurrence, never trusted from the caller/provider claim', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, { effectInput: { note: 't010c' } });
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, { note: 't010c' });
  const forgedProvider: ResourceProvider = {
    async resolve(request) {
      counters.resourceResolutions += 1;
      if (request.resourceKey !== T010A_RESOURCE_KEY) {
        return { status: 'absent' };
      }
      // Forged: the exact contract is echoed but the revision is not the pin
      // the occurrence was activated under.
      return {
        status: 'resolved',
        handle: { sink: 't010c-forged-sink' },
        ...(request.contract === undefined ? {} : { contract: request.contract }),
        currentnessPin: {
          providerId: T010A_RESOURCE_CURRENTNESS.providerId,
          resourceKey: T010A_RESOURCE_KEY,
          revisionDigest: 'sha256:t010c-forged-revision',
        },
      };
    },
  };
  const before = await captureDurable(fx.store, fx.journal, executor);
  await expectRefusal(
    invokeEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      activator: fx.activator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: fx.admissionPorts,
      effectType: T010A_EFFECT_TYPE,
      dispatch: countingEffectfulDispatch(counters),
      resourceProvider: forgedProvider,
      sha256: t010aSha256,
    }),
    GovernanceExecutionBindingError,
    'RESOURCE_CURRENTNESS_MISMATCH',
    'R3 forged resource revision',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'R3 forged resource revision');
  assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R3 forged resource: byte-stable state');
});

// ---------------------------------------------------------------------------
// R4 — mutation attempted through query-only/observational seams.
// ---------------------------------------------------------------------------

test('T010C R4: a mutation-capable operation presented to the UX QUERY seam refuses UX_MUTATION_REFUSED before any admission or dispatch (derived exposure variant isolating this gate)', async () => {
  const variant = await boundVariant(['ux']);
  const counters = makeCounters();
  const journal = new VolatileAdmissionEffectJournal();
  const before = await captureDurable(new T010aMemoryDurableExecutionStore(), journal, variant.executor);
  await expectRefusal(
    queryUxTool(uxQuery(variant, counters, T010A_OP_RECORD)),
    UxToolRequestError,
    'UX_MUTATION_REFUSED',
    'R4 UX mutation via query',
  );
  assertNoUnauthorizedWork(counters, variant.executor, journal, 'R4 UX mutation via query');
  assert.equal(counters.resourceResolutions, 0);
  assert.deepEqual(
    await captureDurable(new T010aMemoryDurableExecutionStore(), journal, variant.executor),
    before,
    'R4 UX mutation via query: byte-stable state',
  );
});

test('T010C R4: a mutation-capable operation presented to the Agent QUERY seam refuses AGENT_MUTATION_REFUSED before any admission or dispatch (derived exposure variant isolating this gate)', async () => {
  const variant = await boundVariant(['agent']);
  const counters = makeCounters();
  const projection = await projectAgentToolSurface({
    agentId: 'agent.t010c',
    currentDefinitionGraph: variant.graph,
    sha256: t010aSha256,
  });
  const projected = projection.tools
    .find((entry) => entry.toolComponentId === T010A_TOOL_COMPONENT_ID)!
    .operations.find((operation) => operation.operationId === T010A_OP_RECORD);
  assert.equal(projected?.effect, 'idempotent', 'the projected frozen effect class stays mutation-capable');
  const journal = new VolatileAdmissionEffectJournal();
  const before = await captureDurable(new T010aMemoryDurableExecutionStore(), journal, variant.executor);
  await expectRefusal(
    queryAgentTool({
      agentId: 'agent.t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      proposal: { note: 't010c' },
      projection,
      binding: variant.binding,
      currentDefinitionGraph: variant.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    AgentToolProjectionError,
    'AGENT_MUTATION_REFUSED',
    'R4 agent mutation via query',
  );
  assertNoUnauthorizedWork(counters, variant.executor, journal, 'R4 agent mutation via query');
  assert.deepEqual(
    await captureDurable(new T010aMemoryDurableExecutionStore(), journal, variant.executor),
    before,
    'R4 agent mutation via query: byte-stable state',
  );
});

test('T010C R4: the kernel query seam refuses an effectful operation (EFFECTFUL_OPERATION_REJECTED) and the kernel effectful seam refuses an effectless one (EFFECTLESS_OPERATION_REJECTED) — frozen fixture, before any dispatch or journal record', async (t) => {
  const { bundle, executor, binding } = await boundFrozen();

  await t.test('effectful operation through T004B refuses typed', async () => {
    const counters = makeCounters();
    const journal = new VolatileAdmissionEffectJournal();
    const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, { note: 'x' });
    const before = await captureDurable(new T010aMemoryDurableExecutionStore(), journal, executor);
    await expectRefusal(
      invokeNonEffectfulTool({
        request: admitted,
        binding,
        currentDefinitionGraph: bundle.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      }),
      NonEffectfulInvocationError,
      'EFFECTFUL_OPERATION_REJECTED',
      'R4 effectful via T004B',
    );
    assertNoUnauthorizedWork(counters, executor, journal, 'R4 effectful via T004B');
    assert.deepEqual(
      await captureDurable(new T010aMemoryDurableExecutionStore(), journal, executor),
      before,
      'R4 effectful via T004B: byte-stable state',
    );
  });

  await t.test('effectless operation through T004C refuses typed', async () => {
    const counters = makeCounters();
    const fx = await buildT010aOccurrenceContext(binding, bundle, { effectInput: { note: 'x' } });
    const admitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, { note: 'x' });
    const before = await captureDurable(fx.store, fx.journal, executor);
    await expectRefusal(
      invokeEffectfulTool({
        request: admitted,
        binding,
        currentDefinitionGraph: bundle.graph,
        activator: fx.activator,
        admissionRequest: fx.admissionRequest,
        admissionPorts: fx.admissionPorts,
        effectType: T010A_EFFECT_TYPE,
        dispatch: countingEffectfulDispatch(counters),
        resourceProvider: countingResourceProvider(counters),
        sha256: t010aSha256,
      }),
      EffectfulInvocationError,
      'EFFECTLESS_OPERATION_REJECTED',
      'R4 effectless via T004C',
    );
    assertNoUnauthorizedWork(counters, executor, fx.journal, 'R4 effectless via T004C');
    assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R4 effectless via T004C: byte-stable state');
  });

  await t.test('the UX effectful seam refuses an effectless intent UX_EFFECTLESS_OPERATION_REFUSED (derived exposure variant)', async () => {
    const variant = await boundVariant(['ux']);
    const counters = makeCounters();
    const fx = await buildT010aOccurrenceContext(variant.binding, variant.bundle, {
      effectInput: { note: 't010c' },
    });
    await expectRefusal(
      invokeUxToolEffectfully(uxEffectful(variant, counters, fx, T010A_OP_READ)),
      UxToolRequestError,
      'UX_EFFECTLESS_OPERATION_REFUSED',
      'R4 effectless via UX seam',
    );
    assert.equal(counters.effectfulCalls.length, 0);
    assert.equal(fx.journal.getRecords().length, 0);
  });
});

// ---------------------------------------------------------------------------
// R5 — invalid authority class where production effect would be required.
// ---------------------------------------------------------------------------

async function simulationOccurrence(
  binding: SealedToolImplementationBinding,
  bundle: T010aAssemblyBundle,
  authorityClass: 'SIMULATION' | undefined,
): Promise<{
  readonly activator: AssemblyExecutionActivator;
  readonly store: T010aMemoryDurableExecutionStore;
  readonly baselines: InstanceType<typeof MemoryGovernanceBaselineStore>;
}> {
  // Self-contained activation substrate over the SAME accepted public ports
  // the fixture uses (fresh durable store / baselines / CDI authority —
  // exactly what a real host composes per occurrence).
  const store = new T010aMemoryDurableExecutionStore();
  const baselines = new MemoryGovernanceBaselineStore();
  const body = await createGovernanceBaselineBody(
    {
      domainId: 't010a',
      governanceId: 't010c-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    t010aSha256,
  );
  await baselines.putBody(body);
  const packageCdi = new T010aMemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 't010a',
    packageId: 'pkg-t010a-1',
    domainIntelligenceContentDigest: 'cdi-t010a-1',
  });
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, t010aSha256);
  const governanceBaseline = body.identity;
  if (authorityClass === undefined) {
    // Legacy class-less pin: exact assemblyDigest woven in, NO authorityClass.
    const legacyPin = await createGovernanceExecutionPin(
      {
        workflowTarget: T010A_FREEZE_RECORD.semantic.workflowComponentId,
        workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
        binding: {
          domainId: 't010a',
          packageId: 'pkg-t010a-1',
          domainIntelligenceContentDigest: 'cdi-t010a-1',
          governanceBaseline,
        },
        assemblyDigest: binding.successorAssembly.assemblyDigest,
      },
      t010aSha256,
    );
    await store.bindGovernanceExecutionPin(legacyPin);
    return { activator, store, baselines };
  }
  await activator.activate({
    workflowTarget: T010A_FREEZE_RECORD.semantic.workflowComponentId,
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

test('T010C R5: a SIMULATION-class pin refuses production effect AUTHORITY_CLASS_MISMATCH before any dispatch or journal record — kernel path on the frozen fixture and the UX effectful seam alike', async (t) => {
  await t.test('kernel T004C on the frozen fixture', async () => {
    const { bundle, executor, binding } = await boundFrozen();
    const counters = makeCounters();
    const fx = await buildT010aOccurrenceContext(binding, bundle, { effectInput: { note: 't010c' } });
    const sim = await simulationOccurrence(binding, bundle, 'SIMULATION');
    const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, { note: 't010c' });
    const journal = new VolatileAdmissionEffectJournal();
    const before = await captureDurable(sim.store, journal, executor);
    await expectRefusal(
      invokeEffectfulTool({
        request: admitted,
        binding,
        currentDefinitionGraph: bundle.graph,
        activator: sim.activator,
        admissionRequest: fx.admissionRequest,
        admissionPorts: {
          governance: new GovernanceExecutionCoordinator(sim.store, t010aSha256),
          baselines: sim.baselines,
          effectJournal: journal,
        } as unknown as Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>,
        effectType: T010A_EFFECT_TYPE,
        dispatch: countingEffectfulDispatch(counters),
        resourceProvider: countingResourceProvider(counters),
        sha256: t010aSha256,
      }),
      GovernanceExecutionBindingError,
      'AUTHORITY_CLASS_MISMATCH',
      'R5 simulation pin (kernel)',
    );
    assertNoUnauthorizedWork(counters, executor, journal, 'R5 simulation pin (kernel)');
    assert.equal(counters.resourceResolutions, 0, 'R5 simulation: resource plane untouched');
    assert.deepEqual(await captureDurable(sim.store, journal, executor), before, 'R5 simulation: byte-stable state');
  });

  await t.test('UX effectful seam on the derived exposure variant', async () => {
    const variant = await boundVariant(['ux']);
    const counters = makeCounters();
    const fx = await buildT010aOccurrenceContext(variant.binding, variant.bundle, {
      effectInput: { note: 't010c' },
    });
    const sim = await simulationOccurrence(variant.binding, variant.bundle, 'SIMULATION');
    await expectRefusal(
      invokeUxToolEffectfully(
        uxEffectful(variant, counters, { ...fx, activator: sim.activator }, T010A_OP_RECORD),
      ),
      GovernanceExecutionBindingError,
      'AUTHORITY_CLASS_MISMATCH',
      'R5 simulation pin (UX)',
    );
    assertNoUnauthorizedWork(counters, variant.executor, fx.journal, 'R5 simulation pin (UX)');
    assert.equal(counters.resourceResolutions, 0, 'R5 simulation (UX): resource plane untouched');
  });
});

test('T010C R5: a legacy class-less pin refuses AUTHORITY_CLASS_FORBIDDEN — historical evidence is never upgraded to PRODUCTION', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, { effectInput: { note: 't010c' } });
  const legacy = await simulationOccurrence(binding, bundle, undefined);
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, { note: 't010c' });
  const journal = new VolatileAdmissionEffectJournal();
  const before = await captureDurable(legacy.store, journal, executor);
  await expectRefusal(
    invokeEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      activator: legacy.activator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: {
        governance: new GovernanceExecutionCoordinator(legacy.store, t010aSha256),
        baselines: legacy.baselines,
        effectJournal: journal,
      } as unknown as Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>,
      effectType: T010A_EFFECT_TYPE,
      dispatch: countingEffectfulDispatch(counters),
      resourceProvider: countingResourceProvider(counters),
      sha256: t010aSha256,
    }),
    GovernanceExecutionBindingError,
    'AUTHORITY_CLASS_FORBIDDEN',
    'R5 class-less pin',
  );
  assertNoUnauthorizedWork(counters, executor, journal, 'R5 class-less pin');
  assert.deepEqual(await captureDurable(legacy.store, journal, executor), before, 'R5 class-less pin: byte-stable state');
});

// ---------------------------------------------------------------------------
// R6 — missing/ambiguous exact binding fails closed; NO latest/default/order
// fallback anywhere.
// ---------------------------------------------------------------------------

test('T010C R6: floating/selector identities refuse INVALID_UX_REQUEST_INPUT — exact identities only, never normalized, no latest/default fallback', async (t) => {
  const variant = await boundVariant(['ux']);
  const counters = makeCounters();
  for (const operationId of ['op.t010a.read@latest', 'latest', '*']) {
    await t.test(`operationId "${operationId}"`, async () => {
      await expectRefusal(
        queryUxTool(uxQuery(variant, counters, operationId)),
        UxToolRequestError,
        'INVALID_UX_REQUEST_INPUT',
        `R6 floating ${operationId}`,
      );
      assert.equal(counters.nonEffectfulCalls.length, 0);
    });
  }
});

test('T010C R6: ambiguous or missing exact T003C implementation binding fails closed typed — never first/order/latest-wins', async (t) => {
  const { bundle } = await boundFrozen();
  const selection = await resolveCurrentCapabilityProvider(
    bundle.graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    bundle.definitionGraphDigest,
    t010aSha256,
  );
  const candidate = (id: string): ToolImplementationCandidate => ({
    implementation: {
      implementationId: id,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${id}-content`,
    },
    supportedOperations: [T010A_OP_READ, T010A_OP_RECORD],
    handle: new T010aTestExecutor(),
  });

  await t.test('two compatible candidates refuse AMBIGUOUS_TOOL_IMPLEMENTATION', async () => {
    await expectRefusal(
      bindToolImplementation({
        assembly: bundle.assembly,
        selection: JSON.parse(JSON.stringify(selection)) as typeof selection,
        currentDefinitionGraph: bundle.graph,
        implementations: [candidate('impl.t010c.a'), candidate('impl.t010c.b')],
        sha256: t010aSha256,
      }),
      ToolImplementationBindingError,
      'AMBIGUOUS_TOOL_IMPLEMENTATION',
      'R6 ambiguous binding',
    );
  });

  await t.test('zero candidates refuse MISSING_TOOL_IMPLEMENTATION', async () => {
    await expectRefusal(
      bindToolImplementation({
        assembly: bundle.assembly,
        selection: JSON.parse(JSON.stringify(selection)) as typeof selection,
        currentDefinitionGraph: bundle.graph,
        implementations: [],
        sha256: t010aSha256,
      }),
      ToolImplementationBindingError,
      'MISSING_TOOL_IMPLEMENTATION',
      'R6 missing binding',
    );
  });
});

test('T010C R6: a wrong-audience exposure refuses with NO cross-plane fallback (ux-only is invisible to the Agent plane and agent-only is invisible to the UX plane)', async (t) => {
  await t.test('agent-only exposure is invisible to the UX plane', async () => {
    const variant = await boundVariant(['agent']);
    const counters = makeCounters();
    await expectRefusal(
      queryUxTool(uxQuery(variant, counters, T010A_OP_READ)),
      UxToolRequestError,
      'UX_OPERATION_NOT_EXPOSED',
      'R6 agent-only for UX',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });

  await t.test('ux-only exposure projects NOTHING to the Agent plane', async () => {
    const variant = await boundVariant(['ux']);
    const counters = makeCounters();
    const projection = await projectAgentToolSurface({
      agentId: 'agent.t010c',
      currentDefinitionGraph: variant.graph,
      sha256: t010aSha256,
    });
    const projected = projection.tools.find(
      (entry) => entry.toolComponentId === T010A_TOOL_COMPONENT_ID,
    );
    assert.equal(projected?.operations.length, 0, 'ux-only exposure never falls back into the agent audience');
    await expectRefusal(
      queryAgentTool({
        agentId: 'agent.t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_READ,
        proposal: {},
        projection,
        binding: variant.binding,
        currentDefinitionGraph: variant.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      }),
      AgentToolProjectionError,
      'AGENT_OPERATION_NOT_PROJECTED',
      'R6 ux-only for agent',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });
});

test('T010C R6: an unbound exact Kind version fails closed at Assembly admission — ASSEMBLY_ADMISSION_KIND_NOT_BOUND, no fallback Kind exists', async () => {
  const { bundle } = await boundFrozen();
  const wrongKindTool = {
    ...t010aToolComponent(),
    kind: { kindId: T010A_KIND.kindId, version: '2.0.0' },
  };
  await expectRefusal(
    admitComponentWithAssembly(wrongKindTool, bundle.assembly, {
      currentDefinitionGraph: bundle.graph,
      sha256: t010aSha256,
    }),
    RuntimeAssemblyError,
    'ASSEMBLY_ADMISSION_KIND_NOT_BOUND',
    'R6 unbound kind version',
  );
});

// ---------------------------------------------------------------------------
// I3 — UX/model/Tool payload can never become Domain authority.
// ---------------------------------------------------------------------------

test('T010C I3: forged exposure/effect material inside the portable UX input or the Agent proposal mints NOTHING — the exact current contract alone classifies', async (t) => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();

  await t.test('forged declaredExposure inside the portable input does not expose the frozen operation', async () => {
    await expectRefusal(
      queryUxTool({
        uxSessionId: 'ux.session-t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_READ,
        input: {
          declaredExposure: { audiences: ['ux'] },
          effect: 'none',
          operationId: T010A_OP_RECORD,
        } as JsonValue,
        expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
        binding,
        currentDefinitionGraph: bundle.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      }),
      UxToolRequestError,
      'UX_OPERATION_NOT_EXPOSED',
      'I3 forged exposure in input',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
    assert.equal(executor.observations().length, 0);
  });

  await t.test('a forged proposal claiming mutation capability does not project the frozen operation to the Agent plane', async () => {
    const projection = await projectAgentToolSurface({
      agentId: 'agent.t010c',
      currentDefinitionGraph: bundle.graph,
      sha256: t010aSha256,
    });
    await expectRefusal(
      queryAgentTool({
        agentId: 'agent.t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_RECORD,
        proposal: { effect: 'idempotent', declaredExposure: { audiences: ['agent'] } } as JsonValue,
        projection,
        binding,
        currentDefinitionGraph: bundle.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      }),
      AgentToolProjectionError,
      'AGENT_OPERATION_NOT_PROJECTED',
        'I3 forged proposal',
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// I4 — ONE Runtime/Central Admission/effect authority only: authorized sanity
// paths cross exactly ONE existing journal exactly once; the query seams
// never touch it; every refusal row above left it at zero.
// ---------------------------------------------------------------------------

test('T010C I4: the authorized UX effectful route crosses the ONE host-supplied Central Admission journal exactly once; the authorized query routes cross zero journal records', async (t) => {
  const variant = await boundVariant(['ux', 'agent']);

  await t.test('authorized UX effectful route: exactly one durable record on the ONE host journal', async () => {
    const fx = await buildT010aOccurrenceContext(variant.binding, variant.bundle, {
      effectInput: { note: 't010c-auth' },
    });
    assert.ok(
      fx.admissionPorts.effectJournal instanceof VolatileAdmissionEffectJournal,
      'the journal is the ONE host-supplied Central Admission effect journal instance',
    );
    const effectCalls: EffectfulToolDispatchQuery[] = [];
    const result = await invokeUxToolEffectfully({
      uxSessionId: 'ux.session-t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      input: { note: 't010c-auth' },
      expectedDefinitionGraphDigest: variant.digest,
      binding: variant.binding,
      currentDefinitionGraph: variant.graph,
      activator: fx.activator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: fx.admissionPorts,
      effectType: T010A_EFFECT_TYPE,
      dispatch: {
        async dispatch(query: EffectfulToolDispatchQuery) {
          effectCalls.push(query);
          return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
        },
      },
      resourceProvider: t010aResourceProvider(),
      sha256: t010aSha256,
    });
    // The returned result is the existing authoritative T004C outcome
    // verbatim — UX never rewrites or upgrades it.
    assert.equal(result.outcome.status, 'admitted');
    assert.equal(effectCalls.length, 1, 'exactly one dispatch of the verified handle');
    assert.equal(variant.executor.effects().length, 1, 'the recorder mirrored exactly one effect');
    assert.equal(fx.journal.getRecords().length, 1, 'exactly ONE durable record on the ONE journal');
    assert.ok(
      fx.admissionPorts.effectJournal.getRecords().length === 1,
      'no second journal exists: the host-supplied instance IS the only record surface',
    );
  });

  await t.test('authorized UX query route: OBSERVED-only, zero journal crossings, zero recorder effects', async () => {
    const fx = await buildT010aOccurrenceContext(variant.binding, variant.bundle, {
      effectInput: { note: 't010c-auth' },
    });
    const counters = makeCounters();
    const effectsBefore = variant.executor.effects().length;
    const result = await queryUxTool(
      uxQuery(variant, counters, T010A_OP_READ, {
        input: { note: 't010c-read' },
      }),
    );
    assert.equal(result.status, 'OBSERVED');
    assert.equal(counters.nonEffectfulCalls.length, 1);
    assert.equal(fx.journal.getRecords().length, 0, 'the query seam never touches the journal');
    assert.equal(
      variant.executor.effects().length,
      effectsBefore,
      'the query seam never effects',
    );
  });

  await t.test('authorized Agent query route: OBSERVED-only, zero journal crossings', async () => {
    const projection = await projectAgentToolSurface({
      agentId: 'agent.t010c',
      currentDefinitionGraph: variant.graph,
      sha256: t010aSha256,
    });
    const counters = makeCounters();
    const result = await queryAgentTool({
      agentId: 'agent.t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_READ,
      proposal: { note: 't010c' },
      projection,
      binding: variant.binding,
      currentDefinitionGraph: variant.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    });
    assert.equal(result.status, 'OBSERVED');
    assert.equal(counters.nonEffectfulCalls.length, 1);
    assert.equal(
      variant.executor.effects().length,
      1,
      'exactly the ONE authorized effectful effect above exists; the query added none',
    );
  });
});

// ---------------------------------------------------------------------------
// I5 — renderer-neutral core: no React/RN/DOM/native renderer or domain-ux/DAC
// import exists anywhere under src/ (import-specifier scan of every module).
// ---------------------------------------------------------------------------

test('T010C I5: renderer neutrality — no renderer or domain-ux/DAC import specifier exists anywhere under src/', () => {
  const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(full, 'utf8');
        const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
        for (const specifier of specifiers) {
          // External renderer/domain-ux packages only: the core's OWN
          // internal dac*/ composition modules (e.g. '../dac/contracts.js')
          // are Domain Application Composition kernel modules, never a
          // renderer or the domain-ux implementation package.
          if (
            specifier === 'react' ||
            specifier === 'react-native' ||
            specifier === 'dom' ||
            specifier.startsWith('domain-ux') ||
            specifier.startsWith('domain-application') ||
            specifier.includes('react-native') ||
            specifier.includes('reactnative')
          ) {
            offenders.push(`${full}: ${specifier}`);
          }
        }
      }
    }
  };
  walk(srcRoot);
  assert.deepEqual(
    offenders,
    [],
    'no React/React Native/DOM/native renderer or domain-ux/DAC type may enter DomainHarness core',
  );
});
