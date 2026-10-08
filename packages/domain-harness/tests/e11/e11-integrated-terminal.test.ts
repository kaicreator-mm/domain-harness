/**
 * E11 / T010D — integrated neutral Domain App TERMINAL evidence
 * (gate issue #921; frozen #725 readiness contract CLOSED=approved;
 * controller #537 LOCAL_FIRST_MAX_SAFE_PARALLELISM #537@6042127032;
 * #589 PACK-D T010D/E11 + #534 E11 terminal).
 *
 * ROLE: evidence aggregation/disposition ONLY. This suite is the integrated
 * terminal over the three accepted predecessors, re-derived by EXECUTION at
 * THIS head (bd2f2f97 — the merge of accepted T010B #917 and T010C #918 on
 * the accepted T010A-repair base 407b9ae4). It consumes the SAME accepted
 * fixture + freeze record + seams; it does NOT repair production source,
 * does NOT invent UX/Tool/Standard semantics, and does NOT reinterpret stale
 * A/B/C evidence — predecessor terminals are cited for provenance only, and
 * every load-bearing property below is re-proven by executing the chain here.
 *
 * IDENTITY BINDING (all three predecessors -> the SAME integrated candidate):
 *  - the accepted T010A freeze digests recomputed through the accepted public
 *    APIs (t010aDefinitionGraph -> buildT010aAssembly/sealRuntimeAssembly ->
 *    resolveCurrentCapabilityProvider -> bindT010aTool/bindToolImplementation
 *    -> successor Assembly) and deep-matched against the landed literal
 *    T010A_FREEZE_RECORD (NEVER auto-refreshed):
 *      DefinitionGraphDigest 030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c
 *      T003C bindingDigest       8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87
 *      final assemblyDigest      400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0
 *  - currentness dispositions (verified at git level in the issue terminal):
 *    A repair base 407b9ae4 (accepted #910), B base 407b9ae4 (accepted #917,
 *    merged 6c1a8768), C base 407b9ae4 (accepted #918, merged bd2f2f97);
 *    407b9ae4 is an ancestor of this head; B/C subjects are tests-only and
 *    mutually disjoint (asserted in-suite by source-level cross-binding).
 *
 * SUCCESS PATH (re-executed at this head, one Runtime/Central
 * Admission/effect authority):
 *   Semantic Components + Tool Component + relation (exact frozen Definition)
 *     -> exact current Assembly + T003B provider selection + T003C binding
 *     -> neutral UX request (intent/provenance only, accepted T004E adapter
 *        semantics) -> pre-dispatch currentness -> T004A exposure admission
 *     -> T004A invocation admission -> ONE already-authoritative PRODUCTION
 *        Domain/Workflow occurrence (accepted T002C/T002D activation)
 *     -> Tool invocation as declared through T004C (verified paired handle)
 *     -> authoritative Runtime outcome DONE read ONLY from the existing
 *        Central Admission outcome (`result.outcome`) — NEVER from Tool/UX/
 *        model return values. Exactly ONE durable record on the ONE
 *        host-supplied VolatileAdmissionEffectJournal; the deterministic
 *        test-only recorder is observational, never a second journal. The
 *        pure route (effect=none) routes through T004B as OBSERVED-only and
 *        is structurally incapable of DONE/effect/journal.
 *
 * UNAUTHORIZED PATH (representative re-derived subset of the accepted T010C
 * matrix; every row asserts typed refusal + ZERO dispatch/effect/journal +
 * byte-stable authoritative state via JSON snapshots taken before and after):
 *   R1 frozen operations invisible to the UX plane (UX_OPERATION_NOT_EXPOSED);
 *   R2 stale UX currentness claims (UX_REQUEST_STALE through the accepted
 *      adapter) and a moved current graph at kernel T004C
 *      (DEFINITION_CURRENTNESS_MISMATCH before dispatch);
 *   R3 forged occurrence/authority material on the closed-world UX seam
 *      (INVALID_UX_REQUEST_INPUT) and a missing authoritative occurrence
 *      (GOVERNANCE_EXECUTION_PIN_MISSING before dispatch — even though the
 *      Tool would have "succeeded");
 *   R4 the kernel query seam refuses an effectful operation and the kernel
 *      effectful seam refuses an effectless one (frozen fixture);
 *   R5 a SIMULATION-class pin refuses production effect
 *      (AUTHORITY_CLASS_MISMATCH before dispatch/journal);
 *   R6 floating identities refuse (exact identities only, no @latest
 *      fallback) and a caller-built binding lookalike refuses
 *      UNMINTED_TOOL_IMPLEMENTATION_BINDING;
 *   I3/I4 forged exposure material inside the portable UX input mints
 *      NOTHING, and the authorized positive control crosses the ONE journal
 *      exactly once.
 *
 * SOURCE_MUTATION=NONE: tests/evidence-only write set under tests/e11/.
 * ENVIRONMENT=LOCAL_AGENT (ZCode, Windows/Git Bash, node v24.21.0, npm ci).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDefinitionGraphDigest } from '../../src/contracts/definition-graph.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  InvocationRequestError,
} from '../../src/contracts/invocation-request.js';
import {
  NonEffectfulInvocationError,
  invokeNonEffectfulTool,
  type NonEffectfulToolDispatchQuery,
} from '../../src/contracts/non-effectful-invocation.js';
import {
  EffectfulInvocationError,
  invokeEffectfulTool,
  type EffectfulToolDispatchQuery,
} from '../../src/contracts/effectful-invocation.js';
import type { ResourceProvider } from '../../src/contracts/resource-resolution.js';
import type { CentralAdmissionPorts } from '../../src/admission/contracts.js';
import { deriveDurableControlTurnId } from '../../src/admission/admission.js';
import {
  GovernanceExecutionBindingError,
  AssemblyExecutionActivator,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
} from '../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/effect-journal.js';
import {
  UxToolRequestError,
  invokeUxToolEffectfully,
  queryUxTool,
  type InvokeUxToolEffectfullyInput,
  type QueryUxToolInput,
} from '../../src/adapters/ux-tool-request.js';
import {
  T010A_ADMIT_ALL,
  T010A_CAPABILITY,
  T010A_EFFECT_TYPE,
  T010A_IDEMPOTENCY_KEY,
  T010A_NOW,
  T010A_OP_READ,
  T010A_OP_RECORD,
  T010A_OCCURRENCE_TARGET,
  T010A_RESOURCE_CURRENTNESS,
  T010A_RESOURCE_KEY,
  T010A_TOOL_COMPONENT_ID,
  T010A_TOOL_IMPLEMENTATION,
  T010A_WORKFLOW_COMPONENT_ID,
  T010A_WORKFLOW_INSTANCE_ID,
  T010A_WORKFLOW_TARGET,
  T010aMemoryDurableExecutionStore,
  T010aMemoryExactPackageCdiAuthority,
  T010aTestExecutor,
  admitT010aOperation,
  bindT010aTool,
  buildT010aAssembly,
  buildT010aOccurrenceContext,
  t010aDefinitionGraph,
  t010aResourceProvider,
  t010aSha256,
  type T010aAssemblyBundle,
} from '../fixtures/t010a-neutral-definition.js';
import { T010A_FREEZE_RECORD } from '../fixtures/t010a-neutral-definition.freeze.js';
import {
  createUxToolIntent,
  planUxExposureAdmission,
  requireUxIntentCurrent,
  uxCallerFor,
  UX_INTENT_FIELDS,
  UxBindingError,
} from '../t010b/helpers/renderer-neutral-ux-binding.js';

// The three committed freeze digests of the ONE integrated candidate
// (accepted T010A freeze; bound by both #914 and #915 at this head).
const FREEZE_DEFINITION_GRAPH_DIGEST =
  '030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c';
const FREEZE_BINDING_DIGEST =
  '8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87';
const FREEZE_FINAL_ASSEMBLY_DIGEST =
  '400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0';

const UX_SESSION_ID = 'ux.session.e11-1';
const TESTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Shared journey harness (reused patterns from the accepted T010B/T010C
// suites; this suite keeps its own counters so every row is self-contained).
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
  // JSON round-trip: BYTE-stability of every durable/recorder surface via the
  // store's own public read ports — deep identity of serialized bytes.
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
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert.ok(
      error instanceof errorClass,
      `${row}: expected ${errorClass.name}(${code}), got ${String(error)}`,
    );
    assert.equal((error as { code?: string }).code, code, `${row}: typed refusal code`);
    return;
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
// PART A — IDENTITY BINDING: all three predecessors bind the SAME integrated
// candidate (the accepted T010A freeze digests), never auto-refreshed.
// ---------------------------------------------------------------------------

test('E11 identity: ONE integrated candidate — the accepted T010A freeze digests recomputed at this head and deep-matched against the landed literal (never auto-refreshed)', async () => {
  const graph = t010aDefinitionGraph();
  const bundle = await buildT010aAssembly();
  const binding = await bindT010aTool(bundle, new T010aTestExecutor());

  // The exact semantic identity of the integrated candidate: one Workflow +
  // one Tool + one relation; the relation is Definition graph
  // composition/identity ONLY (never provider-selection/authorization
  // authority — accepted T010A repair semantics, T003E not claimed).
  const workflow = graph.components.find(
    (component) => component.componentId === T010A_WORKFLOW_COMPONENT_ID,
  )!;
  const tool = graph.components.find(
    (component) => component.componentId === T010A_TOOL_COMPONENT_ID,
  )!;
  assert.equal(graph.components.length, 2);
  assert.equal(graph.relations.length, 1);
  assert.equal(graph.relations[0]!.relationId, T010A_FREEZE_RECORD.semantic.relationId);
  const toolBody = tool.semanticBody as unknown as {
    operations: readonly { operationId: string; effect: string }[];
  };
  assert.deepEqual(
    toolBody.operations.map((operation) => ({
      operationId: operation.operationId,
      effect: operation.effect,
    })),
    T010A_FREEZE_RECORD.semantic.operations,
  );

  // The three freeze digests: recomputed == landed literal == canonical.
  assert.equal(bundle.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(T010A_FREEZE_RECORD.definition.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(binding.evidence.bindingDigest, FREEZE_BINDING_DIGEST);
  assert.equal(T010A_FREEZE_RECORD.toolBinding.bindingDigest, FREEZE_BINDING_DIGEST);
  assert.equal(binding.successorAssembly.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(T010A_FREEZE_RECORD.finalAssembly.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);

  // Full freeze-record recompute deep-match through the same accepted public
  // APIs that produced the literal — any fixture drift fails closed here.
  const selection = await resolveCurrentCapabilityProvider(
    graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    bundle.definitionGraphDigest,
    t010aSha256,
  );
  assert.equal(selection.provider.componentId, T010A_TOOL_COMPONENT_ID);
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
  // The freeze record is pure serializable data (accepted T010A P1-2).
  assert.deepEqual(JSON.parse(JSON.stringify(T010A_FREEZE_RECORD)), T010A_FREEZE_RECORD);

  // Currentness: the public T003C consumer verifier accepts the live binding
  // against the exact final successor Assembly under the exact Tool pin, and
  // the final Assembly evidence slot carries exactly this bindingDigest.
  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: binding.successorAssembly,
    expectedImplementationPin: T010A_TOOL_IMPLEMENTATION,
    sha256: t010aSha256,
  });
  assert.equal(verified.implementationHandle, binding.implementationHandle);
  assert.deepEqual(binding.successorAssembly.record.implementationBindingEvidence, [
    { subject: T010A_TOOL_COMPONENT_ID, bindingDigest: binding.evidence.bindingDigest },
  ]);
});

test('E11 identity: all three accepted predecessors bind the SAME candidate at this head — landed-suite source cross-binding (A repair #910, B #917, C #918) with disjoint B/C subjects', () => {
  const suiteA = readFileSync(
    resolve(TESTS_DIR, 't010a-neutral-definition/t010a-neutral-definition.test.ts'),
    'utf8',
  );
  const suiteB = readFileSync(
    resolve(TESTS_DIR, 't010b/t010b-authorized-ux-journey.test.ts'),
    'utf8',
  );
  const suiteC = readFileSync(
    resolve(TESTS_DIR, 't010c/t010c-unauthorized-rejection.test.ts'),
    'utf8',
  );
  const fixtureSource = readFileSync(
    resolve(TESTS_DIR, 'fixtures/t010a-neutral-definition.ts'),
    'utf8',
  );
  const freezeSource = readFileSync(
    resolve(TESTS_DIR, 'fixtures/t010a-neutral-definition.freeze.ts'),
    'utf8',
  );

  // Every predecessor consumes the SAME two landed fixture modules (no
  // substitute fixtures anywhere).
  const suites: ReadonlyArray<readonly [string, string]> = [
    ['A', suiteA],
    ['B', suiteB],
    ['C', suiteC],
  ];
  for (const [name, source] of suites) {
    assert.ok(
      source.includes("from '../fixtures/t010a-neutral-definition.js'"),
      `${name}: binds the landed t010a-neutral-definition fixture module`,
    );
    assert.ok(
      source.includes("from '../fixtures/t010a-neutral-definition.freeze.js'"),
      `${name}: binds the landed t010a-neutral-definition.freeze record`,
    );
  }

  // T010B pins the SAME three full freeze digest literals this suite binds.
  assert.ok(suiteB.includes(FREEZE_DEFINITION_GRAPH_DIGEST), 'B: definition graph digest literal');
  assert.ok(suiteB.includes(FREEZE_BINDING_DIGEST), 'B: binding digest literal');
  assert.ok(suiteB.includes(FREEZE_FINAL_ASSEMBLY_DIGEST), 'B: final assembly digest literal');
  // T010A and T010C bind by full freeze-record recompute deep-match (their
  // accepted identity schema) against the same landed literal.
  assert.ok(
    suiteA.includes("schema: 't010a.freeze-record/v1'"),
    'A: freeze-record recompute identity schema',
  );
  assert.ok(
    suiteC.includes("schema: 't010a.freeze-record/v1'"),
    'C: freeze-record recompute identity schema',
  );
  assert.ok(suiteA.includes('assert.deepEqual(recomputed, T010A_FREEZE_RECORD)'), 'A: deep-match');
  assert.ok(suiteC.includes('assert.deepEqual(recomputed, T010A_FREEZE_RECORD)'), 'C: deep-match');

  // The landed literal itself carries the canonical digests.
  assert.ok(freezeSource.includes(FREEZE_DEFINITION_GRAPH_DIGEST), 'freeze: definition digest');
  assert.ok(freezeSource.includes(FREEZE_BINDING_DIGEST), 'freeze: binding digest');
  assert.ok(freezeSource.includes(FREEZE_FINAL_ASSEMBLY_DIGEST), 'freeze: assembly digest');
  // The fixture remains the neutral substrate: no exposure material baked in.
  assert.ok(!fixtureSource.includes('declaredExposure'), 'fixture: no exposure material');

  // B/C subjects are mutually disjoint: neither suite imports, embeds or
  // writes the other's suite material (tests-only write sets, no mutual
  // mutation — accepted currentness dispositions hold at this head).
  assert.ok(
    !suiteB.includes('t010c-unauthorized-rejection') && !suiteB.includes('tests/t010c'),
    'B: no C material embedded',
  );
  assert.ok(
    !suiteC.includes('t010b-authorized-ux-journey') && !suiteC.includes('tests/t010b'),
    'C: no B material embedded',
  );
  assert.ok(
    !suiteB.includes('T010C ') && !suiteC.includes('T010B '),
    'B/C: no cross-suite test identities',
  );
});

// ---------------------------------------------------------------------------
// PART B — SUCCESS PATH: the integrated chain re-executed at this head under
// ONE Runtime/Central Admission/effect authority.
// ---------------------------------------------------------------------------

test('E11 success: Semantic Components + Tool Component + relation -> exact current Assembly -> T003B provider selection -> T003C binding verified current', async () => {
  const graph = t010aDefinitionGraph();
  const bundle = await buildT010aAssembly();

  // Definition graph composition/identity: exactly the frozen components and
  // relation (relation = identity only, never selection authority).
  assert.equal(graph.components.length, 2);
  assert.equal(graph.relations.length, 1);
  assert.equal(bundle.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);

  // T003B: the Workflow's exact requiredCapability resolves to exactly the
  // one Tool provider over the exact current graph.
  const selection = await resolveCurrentCapabilityProvider(
    graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    bundle.definitionGraphDigest,
    t010aSha256,
  );
  assert.equal(selection.provider.componentId, T010A_TOOL_COMPONENT_ID);

  // T003C: bind the exact current implementation; the successor Assembly is
  // the frozen final Assembly with the binding evidence in its slot.
  const executor = new T010aTestExecutor();
  const binding = await bindT010aTool(bundle, executor);
  assert.equal(binding.evidence.bindingDigest, FREEZE_BINDING_DIGEST);
  assert.equal(binding.successorAssembly.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: binding.successorAssembly,
    expectedImplementationPin: T010A_TOOL_IMPLEMENTATION,
    sha256: t010aSha256,
  });
  assert.equal(typeof verified.implementationHandle, 'object');
});

test('E11 success: neutral UX request -> pre-dispatch currentness -> T004A exposure admission -> T004A invocation admission (exact current contract, UX provenance only)', async () => {
  const { bundle, binding } = await boundFrozen();
  const input = { note: 'e11-admission-1' };

  // Neutral UX interaction: closed-world portable intent, provenance only.
  const intent = createUxToolIntent({
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId: T010A_OP_RECORD,
    input,
    expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
  });
  assert.deepEqual(Object.keys(intent), [...UX_INTENT_FIELDS]);
  assert.ok(Object.isFrozen(intent));
  assert.deepEqual(uxCallerFor(intent), { callerId: UX_SESSION_ID, callerKind: 'ux' });

  // Pre-dispatch currentness: the UX-claimed digest is authoritatively
  // re-proved BEFORE any admission (mirrors the accepted T004E UX_REQUEST_STALE
  // gate); no fallback/rebind path exists for a stale claim.
  await requireUxIntentCurrent(intent, bundle.graph, t010aSha256);

  // T004A exposure admission: minted by the seam, bound to the frozen exact
  // current state, carrying UX provenance only.
  const exposure = await admitToolExposure(
    planUxExposureAdmission(intent, bundle, binding, T010A_ADMIT_ALL),
    t010aSha256,
  );
  assert.equal(exposure.status, 'ADMITTED');
  assert.deepEqual(exposure.caller, { callerId: UX_SESSION_ID, callerKind: 'ux' });
  assert.equal(exposure.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(exposure.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);

  // T004A invocation admission: the frozen effect class is re-derived from
  // the exact current graph by the seam; the input is the portable JSON.
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: intent.toolComponentId,
      operationId: intent.operationId,
      input: intent.input,
      caller: uxCallerFor(intent),
      definitionGraphDigest: exposure.definitionGraphDigest,
      assemblyDigest: exposure.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: bundle.graph },
    t010aSha256,
  );
  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(admitted.operationEffect, 'idempotent');
  assert.deepEqual(admitted.input, input);
  assert.equal(admitted.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(admitted.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
});

test('E11 success: the admitted occurrence is ONE already-authoritative PRODUCTION Domain/Workflow occurrence pinned to the exact final Assembly', async () => {
  const { bundle, binding } = await boundFrozen();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-occurrence-1' },
  });
  const pin = await fx.admissionPorts.governance.requirePinnedExecution(
    T010A_WORKFLOW_INSTANCE_ID,
  );
  assert.equal(pin.workflowTarget, T010A_WORKFLOW_TARGET);
  assert.equal(pin.workflowInstanceId, T010A_WORKFLOW_INSTANCE_ID);
  assert.equal(pin.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(pin.authorityClass, 'PRODUCTION');
  assert.equal(fx.pin.authorityClass, 'PRODUCTION');
});

test('E11 success: T004C Tool invocation as declared -> authoritative Runtime outcome DONE read ONLY from the Central Admission outcome — ONE durable journal record', async () => {
  const input = { note: 'e11-journey-1' };
  const { bundle, executor, binding } = await boundFrozen();
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, input);
  const fx = await buildT010aOccurrenceContext(binding, bundle, { effectInput: input });

  const calls: EffectfulToolDispatchQuery[] = [];
  const result = await invokeEffectfulTool({
    request: admitted,
    binding,
    currentDefinitionGraph: bundle.graph,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    effectType: T010A_EFFECT_TYPE,
    dispatch: {
      async dispatch(query) {
        calls.push(query);
        return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
      },
    },
    resourceProvider: t010aResourceProvider(),
    sha256: t010aSha256,
  });

  // Invocation as declared: exactly ONE dispatch of the VERIFIED paired handle.
  assert.equal(calls.length, 1);
  const query = calls[0]!;
  assert.equal(query.handle, binding.implementationHandle);
  assert.equal(query.operationId, T010A_OP_RECORD);
  assert.deepEqual(query.input, input);

  // Authoritative Runtime outcome DONE — read ONLY from the existing Central
  // Admission outcome. The Tool return value is mere effect-output material.
  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.transitionKey, 'complete');
  assert.equal(result.outcome.admitted.targetState, 'DONE');
  assert.equal(result.outcome.admitted.effects.length, 1);
  const effect = result.outcome.admitted.effects[0]!;
  assert.equal(effect.disposition, 'executed');
  assert.deepEqual(effect.output, { recorded: true, effectCount: 1 });

  // Durable effect identity derives from the SAME occurrence turn lineage.
  const turnId = deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, {
    kind: 'message',
    sourceMessageId: 'msg:t010a:1',
  });
  assert.equal(effect.effectId, `${turnId}/effect/1`);
  assert.equal(query.effectId, effect.effectId);
  assert.equal(query.durableControlTurnId, turnId);
  assert.equal(query.operationOrdinal, 1);
  assert.equal(query.idempotencyKey, T010A_IDEMPOTENCY_KEY);
  assert.equal(query.logicalTime, T010A_NOW);

  // T005C: the required resource resolved with the exact frozen non-secret
  // currentness pin.
  assert.equal(query.resources.size, 1);
  const resource = query.resources.get(T010A_RESOURCE_KEY);
  assert.equal(resource?.status, 'resolved');
  if (resource?.status === 'resolved') {
    assert.deepEqual(resource.currentnessPin, {
      providerId: T010A_RESOURCE_CURRENTNESS.providerId,
      resourceKey: T010A_RESOURCE_KEY,
      revisionDigest: T010A_RESOURCE_CURRENTNESS.revisionDigest,
    });
  }

  // ONE authority: exactly ONE durable record on the ONE host-supplied
  // journal; the deterministic test-only executor merely observed its own
  // dispatch (it is never consulted by any seam — never a second journal).
  const journal = fx.admissionPorts.effectJournal as VolatileAdmissionEffectJournal;
  const records = journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.effectId, effect.effectId);
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectType, T010A_EFFECT_TYPE);
  assert.deepEqual(records[0]!.input, input);
  assert.deepEqual(executor.effects(), [{ operationId: T010A_OP_RECORD, input }]);

  // Occurrence-bound result identity; no live handle leaks into the result.
  assert.equal(result.occurrence.workflowTarget, T010A_WORKFLOW_TARGET);
  assert.equal(result.occurrence.workflowInstanceId, T010A_WORKFLOW_INSTANCE_ID);
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.ok(!JSON.stringify(result).includes('t010a-test-audit-log'));
  assert.ok(Object.isFrozen(result));
});

test('E11 success: the pure route routes through T004B as OBSERVED-only — structurally no DONE, effect, occurrence transition or journal record', async () => {
  const input = { note: 'e11-read-1' };
  const { bundle, executor, binding } = await boundFrozen();
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, input);
  const fx = await buildT010aOccurrenceContext(binding, bundle, { effectInput: input });

  const calls: NonEffectfulToolDispatchQuery[] = [];
  const result = await invokeNonEffectfulTool({
    request: admitted,
    binding,
    currentDefinitionGraph: bundle.graph,
    dispatch: {
      async dispatch(query) {
        calls.push(query);
        return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
      },
    },
    sha256: t010aSha256,
  });

  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.operationId, T010A_OP_READ);
  assert.deepEqual(result.output, { observed: true, observationCount: 1 });
  assert.equal(result.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(result.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(result.bindingDigest, FREEZE_BINDING_DIGEST);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.handle, binding.implementationHandle);
  assert.deepEqual(calls[0]!.input, input);
  assert.equal(calls[0]!.resources.size, 0);

  const journal = fx.admissionPorts.effectJournal as VolatileAdmissionEffectJournal;
  assert.equal(journal.getRecords().length, 0);
  assert.equal(executor.effects().length, 0);
  assert.equal(executor.observations().length, 1);
});

test('E11 success: DONE is Runtime-owned — without an already-authoritative occurrence pin there is NO DONE even when the Tool would succeed', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, {
    note: 'e11-no-done-without-occurrence',
  });
  // Occurrence context WITHOUT activation: no durable pin exists.
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-no-done-without-occurrence' },
    skipActivation: true,
  });

  const counters = makeCounters();
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
      dispatch: {
        async dispatch(query) {
          counters.effectfulCalls.push(query);
          // The Tool WOULD "succeed" — and still no DONE can exist, because
          // DONE authority is Runtime-owned, never Tool-return-owned.
          return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
        },
      },
      resourceProvider: countingResourceProvider(counters),
      sha256: t010aSha256,
    }),
    GovernanceExecutionBindingError,
    'GOVERNANCE_EXECUTION_PIN_MISSING',
    'E11 no-DONE-without-occurrence',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'E11 no-DONE-without-occurrence');
  assert.deepEqual(
    await captureDurable(fx.store, fx.journal, executor),
    before,
    'E11 no-DONE-without-occurrence: byte-stable state',
  );
});

// ---------------------------------------------------------------------------
// PART C — UNAUTHORIZED PATH: representative re-derived subset of the
// accepted T010C matrix. EVERY row: typed refusal + ZERO dispatch/effect/
// journal + byte-stable authoritative state.
// ---------------------------------------------------------------------------

test('E11 unauthorized R1: the frozen operations are invisible to the UX plane — both seams refuse UX_OPERATION_NOT_EXPOSED before any admission or dispatch', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-r1' },
  });
  const before = await captureDurable(fx.store, fx.journal, executor);

  const base = {
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    input: { note: 'e11-r1' },
    expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
    binding,
    currentDefinitionGraph: bundle.graph,
  };
  await expectRefusal(
    queryUxTool({
      ...base,
      operationId: T010A_OP_READ,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    } as QueryUxToolInput),
    UxToolRequestError,
    'UX_OPERATION_NOT_EXPOSED',
    'R1 UX query seam',
  );
  await expectRefusal(
    invokeUxToolEffectfully({
      ...base,
      operationId: T010A_OP_RECORD,
      activator: fx.activator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: fx.admissionPorts,
      effectType: T010A_EFFECT_TYPE,
      dispatch: countingEffectfulDispatch(counters),
      resourceProvider: countingResourceProvider(counters),
      sha256: t010aSha256,
    } as InvokeUxToolEffectfullyInput),
    UxToolRequestError,
    'UX_OPERATION_NOT_EXPOSED',
    'R1 UX effectful seam',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'R1');
  assert.equal(counters.resourceResolutions, 0, 'R1: resource plane untouched');
  assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R1: byte-stable state');
});

test('E11 unauthorized R2: a stale UX currentness claim refuses UX_REQUEST_STALE through the accepted adapter; a moved graph refuses DEFINITION_CURRENTNESS_MISMATCH at kernel T004C before dispatch', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-r2' },
  });
  const before = await captureDurable(fx.store, fx.journal, executor);

  // Adapter-plane stale claim. DERIVED-VARIANT ISOLATION (the accepted T010C
  // adjudication): the frozen fixture operations carry no exposure material,
  // so on the frozen fixture the same intent refuses one gate EARLIER
  // (UX_OPERATION_NOT_EXPOSED, row R1). To isolate the adapter currentness
  // gate itself, a DERIVED exposure-material variant of the frozen graph is
  // used — same components/relations/capability, only
  // `declaredExposure.audiences` added. The variant necessarily has a
  // DIFFERENT Definition graph digest; the frozen identity stays pinned by
  // the Part A identity tests above.
  const variantGraph = JSON.parse(JSON.stringify(t010aDefinitionGraph())) as ReturnType<
    typeof t010aDefinitionGraph
  >;
  const variantTool = variantGraph.components.find(
    (component) => component.componentId === T010A_TOOL_COMPONENT_ID,
  )!;
  const variantBody = variantTool.semanticBody as unknown as {
    operations: { declaredExposure?: unknown }[];
  };
  for (const operation of variantBody.operations) {
    operation.declaredExposure = { audiences: ['ux'] };
  }
  const variantDigest = await computeDefinitionGraphDigest(variantGraph, t010aSha256);
  assert.notEqual(variantDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  const variantBundle = await buildT010aAssembly(variantGraph);
  const variantBinding = await bindT010aTool(variantBundle, new T010aTestExecutor());

  // The claimed digest is authoritatively re-proved and refuses typed — no
  // fallback/rebind.
  await expectRefusal(
    queryUxTool({
      uxSessionId: UX_SESSION_ID,
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_READ,
      input: { note: 'e11-r2' },
      expectedDefinitionGraphDigest:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      binding: variantBinding,
      currentDefinitionGraph: variantGraph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    } as QueryUxToolInput),
    UxToolRequestError,
    'UX_REQUEST_STALE',
    'R2 adapter stale claim (derived variant)',
  );
  // Journey-level stale intent refuses typed at the UX-plane pre-dispatch
  // currentness gate as well (accepted T004E semantics, no fallback).
  const staleIntent = createUxToolIntent({
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId: T010A_OP_RECORD,
    input: { note: 'e11-r2' },
    expectedDefinitionGraphDigest:
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });
  await assert.rejects(
    requireUxIntentCurrent(staleIntent, bundle.graph, t010aSha256),
    (error: unknown) => error instanceof UxBindingError && error.code === 'UX_INTENT_STALE',
  );

  // Kernel-plane: a moved current graph refuses at T004C re-admission before
  // any dispatch or effect.
  const base = t010aDefinitionGraph();
  const workflow = base.components[0]!;
  const movedGraph = {
    ...base,
    components: [
      {
        ...workflow,
        semanticBody: { ...(workflow.semanticBody as object), note: 'MUTATED' },
      },
      base.components[1]!,
    ],
  };
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, {
    note: 'e11-r2',
  });
  await expectRefusal(
    invokeEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: movedGraph,
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
    'R2 kernel moved graph',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'R2');
  assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R2: byte-stable state');
});

test('E11 unauthorized R3: forged occurrence/authority material refuses INVALID_UX_REQUEST_INPUT on the closed-world UX seam; a missing authoritative occurrence refuses GOVERNANCE_EXECUTION_PIN_MISSING before dispatch', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-r3' },
  });
  const before = await captureDurable(fx.store, fx.journal, executor);

  // Authority-lookalike fields are unrepresentable on the closed-world seam:
  // occurrence material (even accessor-backed, getter never executed) refuses
  // typed BEFORE any admission or dispatch.
  await expectRefusal(
    invokeUxToolEffectfully({
      uxSessionId: UX_SESSION_ID,
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      input: { note: 'e11-r3' },
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
      get occurrence() {
        throw new Error('hostile accessor MUST NOT execute');
      },
    } as never),
    UxToolRequestError,
    'INVALID_UX_REQUEST_INPUT',
    'R3 forged occurrence material',
  );
  await expectRefusal(
    invokeUxToolEffectfully({
      uxSessionId: UX_SESSION_ID,
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      input: { note: 'e11-r3' },
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
      journal: { forged: true },
    } as never),
    UxToolRequestError,
    'INVALID_UX_REQUEST_INPUT',
    'R3 forged journal material',
  );

  // No authoritative occurrence: a sealed Assembly alone is not activation
  // authority — T004C refuses before any dispatch (occurrence pre-built,
  // journal untouched).
  const noOccurrence = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-r3' },
    skipActivation: true,
  });
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, {
    note: 'e11-r3',
  });
  await expectRefusal(
    invokeEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      activator: noOccurrence.activator,
      admissionRequest: noOccurrence.admissionRequest,
      admissionPorts: noOccurrence.admissionPorts,
      effectType: T010A_EFFECT_TYPE,
      dispatch: countingEffectfulDispatch(counters),
      resourceProvider: countingResourceProvider(counters),
      sha256: t010aSha256,
    }),
    GovernanceExecutionBindingError,
    'GOVERNANCE_EXECUTION_PIN_MISSING',
    'R3 missing occurrence',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'R3');
  assert.equal(noOccurrence.journal.getRecords().length, 0, 'R3: no-occurrence journal empty');
  assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R3: byte-stable state');
});

test('E11 unauthorized R4: the kernel query seam refuses an effectful operation and the kernel effectful seam refuses an effectless one — frozen fixture, before any dispatch or journal record', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-r4' },
  });
  const before = await captureDurable(fx.store, fx.journal, executor);

  // Mutation-capable intent through the query-only seam refuses typed.
  const effectfulAdmitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, {
    note: 'e11-r4',
  });
  await expectRefusal(
    invokeNonEffectfulTool({
      request: effectfulAdmitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    NonEffectfulInvocationError,
    'EFFECTFUL_OPERATION_REJECTED',
    'R4 effectful op on query seam',
  );

  // Effectless intent through the effectful seam refuses typed.
  const effectlessAdmitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, {
    note: 'e11-r4',
  });
  await expectRefusal(
    invokeEffectfulTool({
      request: effectlessAdmitted,
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
    'R4 effectless op on effectful seam',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'R4');
  assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R4: byte-stable state');
});

test('E11 unauthorized R5: a SIMULATION-class pin refuses production effect AUTHORITY_CLASS_MISMATCH before any dispatch or journal record', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-r5' },
  });
  // Self-contained SIMULATION-class activation substrate over the SAME
  // accepted public ports a real host composes per occurrence.
  const store = new T010aMemoryDurableExecutionStore();
  const baselines = new MemoryGovernanceBaselineStore();
  const body = await createGovernanceBaselineBody(
    {
      domainId: 't010a',
      governanceId: 'e11-governance',
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
  const simActivator: AssemblyExecutionActivator = new AssemblyExecutionActivator(
    store,
    packageCdi,
    baselines,
    t010aSha256,
  );
  await simActivator.activate({
    workflowTarget: T010A_WORKFLOW_TARGET,
    workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 't010a',
      packageId: 'pkg-t010a-1',
      domainIntelligenceContentDigest: 'cdi-t010a-1',
      governanceBaseline: body.identity,
    },
    assembly: binding.successorAssembly,
    authorityClass: 'SIMULATION',
    resourceCurrentness: [T010A_RESOURCE_CURRENTNESS],
    currentDefinitionGraph: bundle.graph,
  });
  const journal = new VolatileAdmissionEffectJournal();
  const before = await captureDurable(store, journal, executor);

  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, {
    note: 'e11-r5',
  });
  await expectRefusal(
    invokeEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      activator: simActivator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: {
        governance: new GovernanceExecutionCoordinator(store, t010aSha256),
        baselines,
        effectJournal: journal,
      } as unknown as Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>,
      effectType: T010A_EFFECT_TYPE,
      dispatch: countingEffectfulDispatch(counters),
      resourceProvider: countingResourceProvider(counters),
      sha256: t010aSha256,
    }),
    GovernanceExecutionBindingError,
    'AUTHORITY_CLASS_MISMATCH',
    'R5 simulation pin',
  );
  assertNoUnauthorizedWork(counters, executor, journal, 'R5');
  assert.equal(counters.resourceResolutions, 0, 'R5: resource plane untouched');
  assert.deepEqual(await captureDurable(store, journal, executor), before, 'R5: byte-stable state');
});

test('E11 unauthorized R6: floating identities refuse INVALID_UX_REQUEST_INPUT (exact identities only, never normalized) and a caller-built binding lookalike refuses UNMINTED_TOOL_IMPLEMENTATION_BINDING', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-r6' },
  });
  const before = await captureDurable(fx.store, fx.journal, executor);

  // No latest/default/order fallback anywhere: selector spellings refuse.
  for (const operationId of ['op.t010a.read@latest', 'latest', '*']) {
    await expectRefusal(
      queryUxTool({
        uxSessionId: UX_SESSION_ID,
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId,
        input: { note: 'e11-r6' },
        expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
        binding,
        currentDefinitionGraph: bundle.graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      } as QueryUxToolInput),
      UxToolRequestError,
      'INVALID_UX_REQUEST_INPUT',
      `R6 floating identity ${operationId}`,
    );
  }

  // Implementation authority is never caller-forgeable: a lookalike built
  // from borrowed fields refuses at the T003C mint verification.
  const lookalike = {
    evidence: { ...binding.evidence },
    successorAssembly: binding.successorAssembly,
    implementationHandle: binding.implementationHandle,
  } as unknown as SealedToolImplementationBinding;
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, {
    note: 'e11-r6',
  });
  await expectRefusal(
    invokeNonEffectfulTool({
      request: admitted,
      binding: lookalike,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    Error,
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    'R6 forged binding lookalike',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'R6');
  assert.equal(executor.observations().length, 0, 'R6: zero recorder observations');
  assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before, 'R6: byte-stable state');
});

test('E11 unauthorized invariants I3+I4: forged exposure material inside the portable UX input mints NOTHING, and the authorized positive control crosses the ONE journal exactly once', async () => {
  const { bundle, executor, binding } = await boundFrozen();
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-i3' },
  });

  // I3: forged declaredExposure/effect material inside the portable input
  // mints nothing — the exact current contract alone classifies; the frozen
  // fixture refuses the same intent one gate EARLIER (R1).
  await expectRefusal(
    queryUxTool({
      uxSessionId: UX_SESSION_ID,
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_READ,
      input: { note: 'e11-i3' },
      expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
      declaredExposure: { audiences: ['ux'], forged: true },
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    } as never),
    UxToolRequestError,
    'INVALID_UX_REQUEST_INPUT',
    'I3 forged exposure material',
  );
  assert.equal(counters.nonEffectfulCalls.length, 0, 'I3: zero dispatch');

  // I4 positive control: the authorized effectful journey crosses the ONE
  // host-supplied journal exactly once; the query route crosses zero.
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_RECORD, {
    note: 'e11-i4',
  });
  const fx2 = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 'e11-i4' },
  });
  await invokeEffectfulTool({
    request: admitted,
    binding,
    currentDefinitionGraph: bundle.graph,
    activator: fx2.activator,
    admissionRequest: fx2.admissionRequest,
    admissionPorts: fx2.admissionPorts,
    effectType: T010A_EFFECT_TYPE,
    dispatch: {
      async dispatch(query) {
        counters.effectfulCalls.push(query);
        return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
      },
    },
    resourceProvider: countingResourceProvider(counters),
    sha256: t010aSha256,
  });
  assert.equal(fx2.journal.getRecords().length, 1, 'I4: exactly ONE journal record');
  assert.equal(counters.effectfulCalls.length, 1, 'I4: exactly ONE dispatch');
  assert.equal(executor.effects().length, 1, 'I4: exactly ONE recorder mirror');
  assert.equal(fx.journal.getRecords().length, 0, 'I4: the OTHER journal instance untouched');
});
