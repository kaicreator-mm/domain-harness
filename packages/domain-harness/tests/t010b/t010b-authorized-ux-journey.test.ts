/**
 * T010B authorized UX Domain App journey evidence (issue #914; frozen #722
 * readiness contract; controller #537 LOCAL_FIRST_MAX_SAFE_PARALLELISM;
 * #589 PACK-D T010B / #534 E11).
 *
 * Proves the authorized renderer-neutral journey END TO END at this exact
 * head, consuming the ONE frozen T010A fixture (accepted repair #910 @407b9ae4)
 * WITHOUT mutation:
 *
 *   neutral UX interaction
 *     -> exact current UX/Tool exposure admission        (T004A, stage 2)
 *     -> generic invocation / admitted Domain intent      (T004A, stage 3)
 *     -> admitted authoritative Domain/Workflow occurrence(T002C/T002D, stage 4)
 *     -> Tool invocation as declared                      (T004C, stage 5)
 *     -> authoritative Runtime outcome DONE               (Central Admission, stage 6)
 *
 * Authority semantics proven (frozen #722 contract):
 * - UX binding is intent/provenance ONLY (accepted T004E adapter semantics):
 *   the closed-world UX intent can mint exposure/occurrence/activation/
 *   implementation/resource/journal/effect authority NOTHING;
 * - exact Definition/Assembly/exposure/currentness verified BEFORE dispatch:
 *   the pre-dispatch UX currentness gate, the T004A exposure/request
 *   admission re-proofs, the T003C consumer verifier and the T004C
 *   occurrence/binding/resource gates all run before any dispatch;
 * - pure path (effect=none) routes through the accepted generic T004B seam
 *   and stays OBSERVED-only — it can never produce DONE;
 * - effectful path routes through the accepted generic T004C seam exactly
 *   once against the ONE already-authoritative PRODUCTION occurrence / ONE
 *   existing Central Admission path;
 * - ONE Runtime/Central Admission/durable-effect authority: the
 *   deterministic test-only effect recorder is observational, never a second
 *   journal; authoritative DONE is read from the Runtime outcome
 *   (`result.outcome` — the existing Central Admission outcome), NEVER from
 *   Tool/UX/model return values;
 * - renderer-neutral portable evidence only: no React/RN/domain-ux runtime
 *   dependency is imported anywhere in this suite;
 * - stale/replaced binding/Assembly/exposure/occurrence negatives are
 *   explicit and fail closed BEFORE any dispatch or effect;
 * - fixture-bound: the three freeze digests (DefinitionGraphDigest 030402bf…,
 *   T003C bindingDigest 8f5220b…, final assemblyDigest 400d668f…) are
 *   asserted against the committed freeze record recomputed through the
 *   accepted public APIs.
 *
 * T004E ADAPTER NOTE (honest boundary): the frozen T010A contract declares
 * no `declaredExposure` audience material, so the accepted adapter's
 * module-internal fixed policy refuses the frozen operations typed
 * `UX_OPERATION_NOT_EXPOSED` (asserted below). The positive journey
 * therefore exercises the SAME generic T004A seam the adapter consumes, with
 * the SAME UX caller-provenance translation (`UX_CALLER_KIND`), and the
 * fixture's admission policy decides exposure over the exact current
 * contract. The adapter is additionally proven to refuse authority-lookalike
 * UX material typed before any admission or dispatch.
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode, Windows/Git Bash, node v24.21.0).
 * SOURCE_MUTATION=NONE (tests/evidence-only write set under tests/t010b/).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import {
  resolveCurrentCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import {
  bindToolImplementation,
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
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
import type { JsonValue } from '../../src/contracts/json.js';
import type { ResourceProvider } from '../../src/contracts/resource-resolution.js';
import type { CentralAdmissionPorts, CentralAdmissionRequest } from '../../src/admission/contracts.js';
import type { AssemblyExecutionActivator } from '../../src/governance/index.js';
import { deriveDurableControlTurnId } from '../../src/admission/admission.js';
import {
  UxToolRequestError,
  invokeUxToolEffectfully,
  queryUxTool,
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
  T010aTestExecutor,
  bindT010aTool,
  buildT010aAssembly,
  buildT010aOccurrenceContext,
  t010aDefinitionGraph,
  t010aResourceProvider,
  t010aSha256,
  t010aToolCandidate,
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
} from './helpers/renderer-neutral-ux-binding.js';

// The three committed freeze digests this journey is bound to (issue #914
// claim; freeze record t010a-neutral-definition.freeze.ts).
const FREEZE_DEFINITION_GRAPH_DIGEST =
  '030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c';
const FREEZE_BINDING_DIGEST =
  '8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87';
const FREEZE_FINAL_ASSEMBLY_DIGEST =
  '400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0';

const UX_SESSION_ID = 'ux.session.t010b-1';

interface BoundJourney {
  readonly bundle: T010aAssemblyBundle;
  readonly executor: T010aTestExecutor;
  readonly binding: SealedToolImplementationBinding;
}

async function boundJourney(): Promise<BoundJourney> {
  const bundle = await buildT010aAssembly();
  const executor = new T010aTestExecutor();
  const binding = await bindT010aTool(bundle, executor);
  return { bundle, executor, binding };
}

// ---------------------------------------------------------------------------
// Stage 0 — FIXTURE_BOUND: the journey binds the exact frozen T010A identity
// (recomputed through the accepted public APIs; never auto-refreshed).
// ---------------------------------------------------------------------------

test('T010B stage 0: the journey binds the exact frozen T010A fixture identity (freeze digests + full freeze record deep-match)', async () => {
  const graph = t010aDefinitionGraph();
  const bundle = await buildT010aAssembly();
  const binding = await bindT010aTool(bundle, new T010aTestExecutor());

  // The three freeze digests asserted against the committed record.
  assert.equal(bundle.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(
    T010A_FREEZE_RECORD.definition.definitionGraphDigest,
    FREEZE_DEFINITION_GRAPH_DIGEST,
  );
  assert.equal(binding.evidence.bindingDigest, FREEZE_BINDING_DIGEST);
  assert.equal(T010A_FREEZE_RECORD.toolBinding.bindingDigest, FREEZE_BINDING_DIGEST);
  assert.equal(binding.successorAssembly.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(T010A_FREEZE_RECORD.finalAssembly.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);

  // Full freeze-record recompute deep-match (same accepted APIs that produced
  // the literal; any fixture drift fails closed here).
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

  // The exact prerequisite matrix is current: T003C consumer verifier accepts
  // the binding against the exact final successor Assembly under the exact
  // Tool pin, and the final Assembly evidence slot carries exactly this
  // binding's bindingDigest.
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
  assert.deepEqual(binding.evidence.implementation, T010A_TOOL_IMPLEMENTATION);
});

// ---------------------------------------------------------------------------
// Stage 1 — neutral UX interaction: renderer-neutral, intent/provenance only.
// ---------------------------------------------------------------------------

test('T010B stage 1: the neutral UX interaction is renderer-neutral portable intent, provenance only, with no representable authority', async () => {
  const bundle = await buildT010aAssembly();
  const intent = createUxToolIntent({
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId: T010A_OP_RECORD,
    input: { note: 't010b-journey-1' },
    expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
  });

  // Closed-world shape: exactly the five intent fields, frozen.
  assert.deepEqual(Object.keys(intent), [...UX_INTENT_FIELDS]);
  assert.ok(Object.isFrozen(intent));

  // Renderer-neutral portability: JSON round-trip is identity; no function,
  // handle, class or host-ambient material is representable.
  assert.deepEqual(JSON.parse(JSON.stringify(intent)), { ...intent });
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const entry of Object.values(value)) visit(entry);
      return;
    }
    assert.ok(
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
      'UX intent leaves must be portable JSON scalars',
    );
  };
  visit(intent);

  // Caller provenance is the generic UX caller kind of the accepted T004E
  // adapter — provenance only, the kernel never branches on it.
  assert.deepEqual(uxCallerFor(intent), {
    callerId: UX_SESSION_ID,
    callerKind: 'ux',
  });

  // The frozen fixture contract declares NO ux-audience exposure material:
  // the accepted T004E adapter refuses the frozen operations typed
  // UX_OPERATION_NOT_EXPOSED (exact-current declarative exposure gate).
  const { bundle: b2, binding } = await boundJourney();
  await assert.rejects(
    queryUxTool({
      uxSessionId: UX_SESSION_ID,
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_READ,
      input: { note: 'x' },
      expectedDefinitionGraphDigest: b2.definitionGraphDigest,
      binding,
      currentDefinitionGraph: b2.graph,
      dispatch: { async dispatch() { return null; } },
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof UxToolRequestError && error.code === 'UX_OPERATION_NOT_EXPOSED',
  );
});

test('T010B stage 1 negative: authority-lookalike material on the UX interaction is unrepresentable and refuses typed', async () => {
  const bundle = await buildT010aAssembly();
  const base = {
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId: T010A_OP_RECORD,
    input: { note: 't010b' },
    expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
  };
  for (const lookalikeKey of ['exposure', 'occurrence', 'activation', 'pin', 'handle', 'binding', 'journal', 'effect', 'resource']) {
    assert.throws(
      () => createUxToolIntent({ ...base, [lookalikeKey]: { forged: true } }),
      (error: unknown) =>
        error instanceof UxBindingError && error.code === 'INVALID_UX_INTENT',
      `authority lookalike field "${lookalikeKey}" must refuse typed`,
    );
  }
  // Hostile accessor-backed material refuses typed as well.
  assert.throws(
    () =>
      createUxToolIntent({
        ...base,
        get exposure() {
          return { forged: true };
        },
      }),
    (error: unknown) => error instanceof UxBindingError && error.code === 'INVALID_UX_INTENT',
  );
});

test('T010B stage 1 negative: the accepted T004E adapter refuses occurrence/journal/admission-evidence material on its closed-world UX input before any admission or dispatch', async () => {
  const { bundle, binding } = await boundJourney();
  let nonEffectfulCalls = 0;
  let effectfulCalls = 0;
  const dispatch = {
    async dispatch() {
      nonEffectfulCalls += 1;
      return null;
    },
  };
  const effectfulDispatch = {
    async dispatch() {
      effectfulCalls += 1;
      return null;
    },
  };
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: { note: 't010b' },
  });

  const queryBase = {
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId: T010A_OP_READ,
    input: { note: 'x' },
    expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
    binding,
    currentDefinitionGraph: bundle.graph,
    dispatch,
    sha256: t010aSha256,
  };
  const effectfulBase = {
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId: T010A_OP_RECORD,
    input: { note: 'x' },
    expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
    binding,
    currentDefinitionGraph: bundle.graph,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    effectType: T010A_EFFECT_TYPE,
    dispatch: effectfulDispatch,
    sha256: t010aSha256,
  };

  // Authority lookalike fields refuse typed BEFORE any admission/dispatch.
  await assert.rejects(
    queryUxTool({ ...queryBase, exposure: { forged: true } } as never),
    (error: unknown) =>
      error instanceof UxToolRequestError && error.code === 'INVALID_UX_REQUEST_INPUT',
  );
  await assert.rejects(
    invokeUxToolEffectfully({ ...effectfulBase, journal: {} } as never),
    (error: unknown) =>
      error instanceof UxToolRequestError && error.code === 'INVALID_UX_REQUEST_INPUT',
  );
  await assert.rejects(
    invokeUxToolEffectfully({ ...effectfulBase, occurrence: fx.pin } as never),
    (error: unknown) =>
      error instanceof UxToolRequestError && error.code === 'INVALID_UX_REQUEST_INPUT',
  );
  assert.equal(nonEffectfulCalls, 0);
  assert.equal(effectfulCalls, 0);
  const journal = fx.admissionPorts.effectJournal as unknown as {
    getRecords(): readonly unknown[];
  };
  assert.equal(journal.getRecords().length, 0);
});

// ---------------------------------------------------------------------------
// Stages 2-6 — the authorized effectful journey, end to end.
// ---------------------------------------------------------------------------

interface JourneyFx {
  readonly admitted: import('../../src/contracts/invocation-request.js').AdmittedToolInvocationRequest;
  readonly activator: AssemblyExecutionActivator;
  readonly admissionRequest: CentralAdmissionRequest;
  readonly admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  readonly resourceProvider: ResourceProvider;
}

async function journeyFixture(
  operationId: string,
  input: JsonValue,
): Promise<BoundJourney & JourneyFx> {
  const { bundle, executor, binding } = await boundJourney();
  // Stage 1: neutral UX interaction (intent/provenance only).
  const intent = createUxToolIntent({
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId,
    input,
    expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
  });
  // Pre-dispatch currentness: the UX-claimed digest is authoritatively
  // re-proved BEFORE any admission (mirrors the T004E UX_REQUEST_STALE gate).
  await requireUxIntentCurrent(intent, bundle.graph, t010aSha256);
  // Stage 2: exact current UX/Tool exposure admission via the generic T004A
  // seam (the seam the accepted T004E adapter consumes; the policy decision
  // is T004A-owned over the exact current contract).
  const exposure = await admitToolExposure(
    planUxExposureAdmission(intent, bundle, binding, T010A_ADMIT_ALL),
    t010aSha256,
  );
  // Stage 3: generic invocation / admitted Domain intent.
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
  // Stage 4: ONE already-authoritative PRODUCTION Domain/Workflow occurrence
  // (accepted T002C/T002D activation; Central Admission turn material).
  const fx = await buildT010aOccurrenceContext(binding, bundle, { effectInput: input });
  return {
    bundle,
    executor,
    binding,
    admitted,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    resourceProvider: t010aResourceProvider(),
  };
}

test('T010B stages 2-3: exact current UX/Tool exposure admission + generic invocation intent admit the UX caller against the frozen current contract', async () => {
  const input = { note: 't010b-admission-1' };
  const fx = await journeyFixture(T010A_OP_RECORD, input);

  // Exposure evidence: minted by the T004A seam, bound to the frozen exact
  // current state, carrying UX provenance only.
  const exposure = fx.admitted.exposure;
  assert.equal(exposure.status, 'ADMITTED');
  assert.equal(exposure.toolComponentId, T010A_TOOL_COMPONENT_ID);
  assert.equal(exposure.operationId, T010A_OP_RECORD);
  assert.deepEqual(exposure.caller, { callerId: UX_SESSION_ID, callerKind: 'ux' });
  assert.equal(exposure.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(exposure.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(typeof exposure.exposureDigest, 'string');

  // Admitted request: the frozen effect class is re-derived from the exact
  // current graph by the T004A seam; the input is the frozen portable JSON.
  assert.equal(fx.admitted.status, 'ADMITTED');
  assert.equal(fx.admitted.operationEffect, 'idempotent');
  assert.deepEqual(fx.admitted.input, input);
  assert.equal(fx.admitted.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(fx.admitted.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
});

test('T010B stage 4: the admitted occurrence is ONE already-authoritative PRODUCTION occurrence pinned to the exact final Assembly', async () => {
  const fx = await journeyFixture(T010A_OP_RECORD, { note: 't010b-occurrence-1' });
  // The durable pin is already bound for the exact occurrence identity and
  // carries the exact final Assembly digest + PRODUCTION authority class.
  const pin = await fx.admissionPorts.governance.requirePinnedExecution(
    T010A_WORKFLOW_INSTANCE_ID,
  );
  assert.equal(pin.workflowTarget, T010A_WORKFLOW_TARGET);
  assert.equal(pin.workflowInstanceId, T010A_WORKFLOW_INSTANCE_ID);
  assert.equal(pin.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(pin.authorityClass, 'PRODUCTION');
});

test('T010B stages 5-6: Tool invocation as declared through T004C and authoritative Runtime outcome DONE (not from Tool/UX/model return values)', async () => {
  const input = { note: 't010b-journey-1' };
  const fx = await journeyFixture(T010A_OP_RECORD, input);

  const calls: EffectfulToolDispatchQuery[] = [];
  const result = await invokeEffectfulTool({
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.bundle.graph,
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
    resourceProvider: fx.resourceProvider,
    sha256: t010aSha256,
  });

  // Stage 5: exactly ONE dispatch of the VERIFIED paired handle, as declared.
  assert.equal(calls.length, 1);
  const query = calls[0]!;
  assert.equal(query.handle, fx.binding.implementationHandle);
  assert.equal(query.operationId, T010A_OP_RECORD);
  assert.deepEqual(query.input, input);

  // Stage 6: authoritative Runtime outcome DONE — read ONLY from the
  // existing Central Admission outcome produced by the accepted Runtime
  // path. The Tool return value ({recorded: true, ...}) is merely the
  // effect's observed output material; it is never consulted for DONE.
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

  // T005C: the required resource resolved through the injected test provider
  // with the exact frozen non-secret currentness pin.
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

  // ONE authority: exactly ONE durable record on the ONE existing Central
  // Admission journal; the deterministic test-only recorder only observed
  // the effect input for assertions (never consulted by any seam).
  const journal = fx.admissionPorts.effectJournal as unknown as {
    getRecords(): readonly {
      effectId: string;
      status: string;
      effectType: string;
      effectSemantics: string;
      input: unknown;
      durableControlTurnId: string;
    }[];
  };
  const records = journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.effectId, effect.effectId);
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectType, T010A_EFFECT_TYPE);
  assert.equal(records[0]!.effectSemantics, 'idempotent');
  assert.deepEqual(records[0]!.input, input);
  assert.equal(records[0]!.durableControlTurnId, turnId);
  assert.equal(fx.executor.effects().length, 1);
  assert.deepEqual(fx.executor.effects()[0], { operationId: T010A_OP_RECORD, input });

  // Occurrence-bound result identity; no live handle leaks into the result.
  assert.equal(result.occurrence.workflowTarget, T010A_WORKFLOW_TARGET);
  assert.equal(result.occurrence.workflowInstanceId, T010A_WORKFLOW_INSTANCE_ID);
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.deepEqual(result.invocation.implementation, T010A_TOOL_IMPLEMENTATION);
  assert.ok(!JSON.stringify(result).includes('t010a-test-audit-log'));
  assert.ok(Object.isFrozen(result));
});

test('T010B pure route: the effect=none operation routes through T004B as OBSERVED only and gains no DONE/transition/effect authority', async () => {
  const input = { note: 't010b-read-1' };
  const fx = await journeyFixture(T010A_OP_READ, input);

  const calls: NonEffectfulToolDispatchQuery[] = [];
  const result = await invokeNonEffectfulTool({
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.bundle.graph,
    dispatch: {
      async dispatch(query) {
        calls.push(query);
        return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
      },
    },
    sha256: t010aSha256,
  });

  // OBSERVED-only: no effect, no occurrence transition, no journal record,
  // no DONE — the pure path is structurally incapable of producing any of it.
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.operationId, T010A_OP_READ);
  assert.deepEqual(result.output, { observed: true, observationCount: 1 });
  assert.deepEqual(result.implementation, T010A_TOOL_IMPLEMENTATION);
  assert.equal(result.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(result.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(result.bindingDigest, FREEZE_BINDING_DIGEST);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.handle, fx.binding.implementationHandle);
  assert.deepEqual(calls[0]!.input, input);
  assert.equal(calls[0]!.resources.size, 0);

  const journal = fx.admissionPorts.effectJournal as unknown as {
    getRecords(): readonly unknown[];
  };
  assert.equal(journal.getRecords().length, 0);
  assert.equal(fx.executor.effects().length, 0);
  assert.equal(fx.executor.observations().length, 1);
});

test('T010B authority split: the effect=none path never enters T004C and the effectful path never falls back to T004B (typed fail-closed before dispatch)', async () => {
  const { bundle, executor, binding } = await boundJourney();

  // Mutation-capable intent through the pure seam refuses typed.
  const effectfulAdmitted = await admitToolInvocationRequest(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      input: { note: 'x' },
      caller: { callerId: UX_SESSION_ID, callerKind: 'ux' },
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure: await admitToolExposure(
        {
          toolComponentId: T010A_TOOL_COMPONENT_ID,
          operationId: T010A_OP_RECORD,
          caller: { callerId: UX_SESSION_ID, callerKind: 'ux' },
          assembly: binding.successorAssembly,
          currentDefinitionGraph: bundle.graph,
          policy: T010A_ADMIT_ALL,
        },
        t010aSha256,
      ),
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: bundle.graph },
    t010aSha256,
  );
  const nonEffectfulCalls: unknown[] = [];
  await assert.rejects(
    invokeNonEffectfulTool({
      request: effectfulAdmitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: {
        async dispatch(query) {
          nonEffectfulCalls.push(query);
          return null;
        },
      },
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof NonEffectfulInvocationError &&
      error.code === 'EFFECTFUL_OPERATION_REJECTED',
  );
  assert.equal(nonEffectfulCalls.length, 0);
  assert.equal(executor.effects().length, 0);

  // Effectless intent through the effectful seam refuses typed.
  const fx = await journeyFixture(T010A_OP_READ, { note: 'none' });
  const effectfulCalls: unknown[] = [];
  await assert.rejects(
    invokeEffectfulTool({
      request: fx.admitted,
      binding: fx.binding,
      currentDefinitionGraph: fx.bundle.graph,
      activator: fx.activator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: fx.admissionPorts,
      effectType: T010A_EFFECT_TYPE,
      dispatch: {
        async dispatch(query) {
          effectfulCalls.push(query);
          return null;
        },
      },
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof EffectfulInvocationError &&
      error.code === 'EFFECTLESS_OPERATION_REJECTED',
  );
  assert.equal(effectfulCalls.length, 0);
  const journal = fx.admissionPorts.effectJournal as unknown as {
    getRecords(): readonly unknown[];
  };
  assert.equal(journal.getRecords().length, 0);
});

// ---------------------------------------------------------------------------
// Stage 1-4 negatives: stale/replaced intent, Assembly, exposure, binding and
// occurrence all fail closed BEFORE any dispatch or effect.
// ---------------------------------------------------------------------------

test('T010B negative: a stale UX intent (shaped against an older Definition) refuses BEFORE any admission or dispatch', async () => {
  const { bundle, executor } = await boundJourney();
  const staleIntent = createUxToolIntent({
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId: T010A_OP_RECORD,
    input: { note: 'stale' },
    // Claimed digest does not match the authoritatively recomputed current
    // digest of the exact current graph.
    expectedDefinitionGraphDigest:
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });
  await assert.rejects(
    requireUxIntentCurrent(staleIntent, bundle.graph, t010aSha256),
    (error: unknown) => error instanceof UxBindingError && error.code === 'UX_INTENT_STALE',
  );

  // The stale intent can never enter the journey: every journey composition
  // (see journeyFixture) runs this UX-plane gate BEFORE any exposure
  // admission is planned — the typed refusal above is the pre-dispatch
  // currentness check for the UX claim (mirrors the accepted T004E
  // UX_REQUEST_STALE seam), and no fallback/rebind path exists for it.
  assert.equal(executor.effects().length, 0);
});

test('T010B negative: a stale/replaced Definition graph fails closed at the pre-dispatch currentness check before any Tool dispatch', async () => {
  const fx = await journeyFixture(T010A_OP_RECORD, { note: 't010b-stale-graph' });
  const base = t010aDefinitionGraph();
  const workflow = base.components[0]!;
  const movedGraph: DefinitionGraphEnvelope = {
    ...base,
    components: [
      {
        ...workflow,
        semanticBody: { ...(workflow.semanticBody as object), note: 'MUTATED' },
      },
      base.components[1]!,
    ],
  };

  const calls: EffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeEffectfulTool({
      request: fx.admitted,
      binding: fx.binding,
      currentDefinitionGraph: movedGraph,
      activator: fx.activator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: fx.admissionPorts,
      effectType: T010A_EFFECT_TYPE,
      dispatch: {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      },
      resourceProvider: fx.resourceProvider,
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'DEFINITION_CURRENTNESS_MISMATCH',
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.executor.effects().length, 0);
  const journal = fx.admissionPorts.effectJournal as unknown as {
    getRecords(): readonly unknown[];
  };
  assert.equal(journal.getRecords().length, 0);
});

test('T010B negative: a tampered/replaced Assembly identity fails closed at the T004A request admission before any dispatch', async () => {
  const fx = await journeyFixture(T010A_OP_RECORD, { note: 't010b-tampered-assembly' });
  const tamperedAssembly = {
    ...fx.binding.successorAssembly,
    assemblyDigest:
      'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  };
  await assert.rejects(
    admitToolInvocationRequest(
      {
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_RECORD,
        input: { note: 't010b-tampered-assembly' },
        caller: { callerId: UX_SESSION_ID, callerKind: 'ux' },
        definitionGraphDigest: fx.admitted.definitionGraphDigest,
        assemblyDigest: tamperedAssembly.assemblyDigest,
        exposure: fx.admitted.exposure,
      },
      { assembly: tamperedAssembly, currentDefinitionGraph: fx.bundle.graph },
      t010aSha256,
    ),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'ASSEMBLY_DIGEST_MISMATCH',
  );
});

test('T010B negative: stale exposure evidence (Definition drifted since mint) fails closed before any dispatch', async () => {
  const { bundle, binding } = await boundJourney();
  const exposure = await admitToolExposure(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      caller: { callerId: UX_SESSION_ID, callerKind: 'ux' },
      assembly: binding.successorAssembly,
      currentDefinitionGraph: bundle.graph,
      policy: T010A_ADMIT_ALL,
    },
    t010aSha256,
  );
  const base = t010aDefinitionGraph();
  const workflow = base.components[0]!;
  const movedGraph: DefinitionGraphEnvelope = {
    ...base,
    components: [
      {
        ...workflow,
        semanticBody: { ...(workflow.semanticBody as object), note: 'DRIFTED' },
      },
      base.components[1]!,
    ],
  };
  await assert.rejects(
    admitToolInvocationRequest(
      {
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId: T010A_OP_RECORD,
        input: { note: 'x' },
        caller: { callerId: UX_SESSION_ID, callerKind: 'ux' },
        definitionGraphDigest: exposure.definitionGraphDigest,
        assemblyDigest: exposure.assemblyDigest,
        exposure,
      },
      { assembly: binding.successorAssembly, currentDefinitionGraph: movedGraph },
      t010aSha256,
    ),
    (error: unknown) =>
      error instanceof Error &&
      ['DEFINITION_CURRENTNESS_MISMATCH', 'EXPOSURE_CURRENTNESS_MISMATCH'].includes(
        (error as { code?: string }).code ?? '',
      ),
  );
});

test('T010B negative: a replaced T003C binding / final Assembly never rides the pinned occurrence (OCCURRENCE_ASSEMBLY_MISMATCH before any dispatch)', async () => {
  const input = { note: 't010b-replaced-binding' };
  // Occurrence pinned under the FIRST binding's successor Assembly.
  const fxA = await journeyFixture(T010A_OP_RECORD, input);
  // A SECOND, genuinely-sealed binding over the same frozen graph under a
  // REPLACED exact Tool implementation pin (legitimately re-bound current
  // implementation) — a different final Assembly digest.
  const executorB = new T010aTestExecutor();
  const selection = await resolveCurrentCapabilityProvider(
    fxA.bundle.graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    fxA.bundle.definitionGraphDigest,
    t010aSha256,
  );
  const replacedPin = {
    ...T010A_TOOL_IMPLEMENTATION,
    implementationVersion: '2.0.0',
  };
  const bindingB = await bindToolImplementation({
    assembly: fxA.bundle.assembly,
    selection: JSON.parse(JSON.stringify(selection)) as typeof selection,
    currentDefinitionGraph: fxA.bundle.graph,
    implementations: [
      { ...t010aToolCandidate(executorB), implementation: replacedPin },
    ],
    sha256: t010aSha256,
  });
  assert.notEqual(
    bindingB.successorAssembly.assemblyDigest,
    fxA.binding.successorAssembly.assemblyDigest,
  );

  // Fresh exposure + request admission against binding B's successor
  // Assembly (current state under the second binding).
  const exposureB = await admitToolExposure(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      caller: { callerId: UX_SESSION_ID, callerKind: 'ux' },
      assembly: bindingB.successorAssembly,
      currentDefinitionGraph: fxA.bundle.graph,
      policy: T010A_ADMIT_ALL,
    },
    t010aSha256,
  );
  const admittedB = await admitToolInvocationRequest(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      input,
      caller: { callerId: UX_SESSION_ID, callerKind: 'ux' },
      definitionGraphDigest: exposureB.definitionGraphDigest,
      assemblyDigest: exposureB.assemblyDigest,
      exposure: exposureB,
    },
    { assembly: bindingB.successorAssembly, currentDefinitionGraph: fxA.bundle.graph },
    t010aSha256,
  );

  // The occurrence pin was bound to Assembly A; the admitted request is
  // proven against Assembly B: a replaced Assembly can never ride a pinned
  // occurrence — fail closed before any dispatch or effect.
  const calls: EffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeEffectfulTool({
      request: admittedB,
      binding: bindingB,
      currentDefinitionGraph: fxA.bundle.graph,
      activator: fxA.activator,
      admissionRequest: fxA.admissionRequest,
      admissionPorts: fxA.admissionPorts,
      effectType: T010A_EFFECT_TYPE,
      dispatch: {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      },
      resourceProvider: fxA.resourceProvider,
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof EffectfulInvocationError &&
      error.code === 'OCCURRENCE_ASSEMBLY_MISMATCH',
  );
  assert.equal(calls.length, 0);
  assert.equal(executorB.effects().length, 0);
  const journal = fxA.admissionPorts.effectJournal as unknown as {
    getRecords(): readonly unknown[];
  };
  assert.equal(journal.getRecords().length, 0);
});

test('T010B negative: without an already-authoritative occurrence pin there is NO DONE — the Runtime outcome authority is never substituted by Tool return values', async () => {
  const { bundle, executor, binding } = await boundJourney();
  const intent = createUxToolIntent({
    uxSessionId: UX_SESSION_ID,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    operationId: T010A_OP_RECORD,
    input: { note: 't010b-no-done-without-occurrence' },
    expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
  });
  await requireUxIntentCurrent(intent, bundle.graph, t010aSha256);
  const exposure = await admitToolExposure(
    planUxExposureAdmission(intent, bundle, binding, T010A_ADMIT_ALL),
    t010aSha256,
  );
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
  // Occurrence context WITHOUT activation: no durable pin exists.
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: intent.input,
    skipActivation: true,
  });

  const calls: EffectfulToolDispatchQuery[] = [];
  await assert.rejects(
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
          calls.push(query);
          // The Tool WOULD "succeed" — and still no DONE can exist, because
          // DONE authority is Runtime-owned, never Tool-return-owned.
          return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
        },
      },
      resourceProvider: t010aResourceProvider(),
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'GOVERNANCE_EXECUTION_PIN_MISSING',
  );
  assert.equal(calls.length, 0);
  assert.equal(executor.effects().length, 0);
  const journal = fx.admissionPorts.effectJournal as unknown as {
    getRecords(): readonly unknown[];
  };
  assert.equal(journal.getRecords().length, 0);
});

test('T010B negative: a forged binding lookalike never dispatches (UNMINTED_TOOL_IMPLEMENTATION_BINDING) — UX material cannot mint implementation authority', async () => {
  // effect=none operation: the binding-mint gate is reached on the pure path.
  const fx = await journeyFixture(T010A_OP_READ, { note: 't010b-forged-binding' });
  const lookalike = {
    evidence: { ...fx.binding.evidence },
    successorAssembly: fx.binding.successorAssembly,
    implementationHandle: fx.binding.implementationHandle,
  } as unknown as SealedToolImplementationBinding;
  const calls: NonEffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeNonEffectfulTool({
      request: fx.admitted,
      binding: lookalike,
      currentDefinitionGraph: fx.bundle.graph,
      dispatch: {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      },
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.executor.observations().length, 0);
  assert.equal(fx.executor.effects().length, 0);
});
