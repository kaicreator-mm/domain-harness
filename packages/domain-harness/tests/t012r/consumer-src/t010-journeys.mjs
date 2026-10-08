/* eslint-disable -- T012R evidence-only clean-room consumer source; lint posture is not the evidence subject. */
/**
 * T12R-N04/N05/N06/N07/N08/N11/N12 — T010 neutral authorized + unauthorized
 * Domain App journeys, executed FROM PACKED PUBLIC BYTES at the T012-D1-
 * repaired candidate (29dba90b) through the NEW declared public subpath
 * `@kaicreator/domain-harness/v7/execution` (bounded repair, gate #930,
 * adjudication #537@6052473158). SUCCESSOR of tests/t012/consumer-src/
 * t010-journeys.mjs: every prior SURFACE_GAP / OBSERVATION row that existed
 * only because the Tool plane was absent from the packed public surface is
 * replaced here by an EXECUTED row through ./v7/execution. The prior run's
 * publicly-expressible rows are retained unchanged and must stay green.
 *
 * Machine-checked scope:
 *  - Definition-plane rows through packed /v7 (unchanged from the prior run).
 *  - TOOL-PLANE PRESENCE: all 10 accepted seams PRESENT on packed
 *    ./v7/execution and ABSENT from the other 6 declared subpaths (60
 *    absence checks, same as the prior run — now a closedness POSITIVE).
 *  - FROZEN DIGEST TRIPLE recomputed through packed public bytes:
 *    030402bf… via /v7, 8f5220bf… via T003C binding evidence
 *    (./v7/execution), 400d668f… via the final successor Assembly
 *    (./v7/execution) — the exact recomputation the prior run proved
 *    impossible through packed bytes.
 *  - T010B authorized journey: exposure (T004A) + invocation admission
 *    (T004A) + ONE PRODUCTION occurrence (T002C/T002D via /v3) + effectful
 *    invocation (T004C via ./v7/execution) to authoritative Runtime DONE
 *    with exactly ONE dispatch on ONE durable journal; pure route (T004B)
 *    OBSERVED-only with zero journal authority.
 *  - T010C unauthorized matrix through the kernel + UX seams
 *    (./v7/execution): R1 non-exposed, R2 stale currentness, R3 forged
 *    binding / missing occurrence / forged resource revision, R4 mutation
 *    through query seams, R5 authority class, R6 ambiguous/missing binding
 *    + floating identities — every refusal TYPED with zero counters and
 *    byte-stable durable state.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V7 from '@kaicreator/domain-harness/v7';
import * as V3 from '@kaicreator/domain-harness/v3';
import * as EX from '@kaicreator/domain-harness/v7/execution';
import {
  T010A_CAPABILITY,
  T010A_DECISION_SCHEMA,
  T010A_EFFECT_TYPE,
  T010A_IDEMPOTENCY_KEY,
  T010A_NOW,
  T010A_OP_READ,
  T010A_OP_RECORD,
  T010A_OCCURRENCE_TARGET,
  T010A_RESOURCE_CURRENTNESS,
  T010A_TOOL_COMPONENT_ID,
  T010A_WORKFLOW_INSTANCE_ID,
  T010A_WORKFLOW_TARGET,
  T010aMemoryDurableExecutionStore,
  T010aMemoryExactPackageCdiAuthority,
  T010aTestExecutor,
  FREEZE_DEFINITION_GRAPH_DIGEST,
  FREEZE_BINDING_DIGEST,
  FREEZE_FINAL_ASSEMBLY_DIGEST,
  t010aDefinitionGraph,
  t010aGovernanceBody,
  t010aKindValidator,
  t010aResolvedDecision,
  t010aSha256,
  t010aToolComponent,
  t010aWorkflowDefinition,
} from './fixture.mjs';
import {
  T010A_ADMIT_ALL,
  admitT010aOperation,
  bindT010aTool,
  buildT010aAssembly,
  buildT010aOccurrenceContext,
  exposedVariantGraph,
  simulationOccurrence,
  t010aCaller,
} from './fixture-toolplane.mjs';

const artifactsDir = resolve(fileURLToPath(new URL('../artifacts/', import.meta.url)));
const rows = [];
function row(id, verdict, detail) {
  rows.push({ id, verdict, detail });
  console.log(`${verdict} ${id} — ${detail}`);
  if (verdict === 'FAIL') process.exitCode = 1;
}
const ok = (id, detail) => row(id, 'PASS', detail);

// ---------------------------------------------------------------------------
// Shared counter / byte-stability machinery (port of the T010C helpers).
// ---------------------------------------------------------------------------
function makeCounters() {
  return { nonEffectfulCalls: [], effectfulCalls: [], resourceResolutions: 0 };
}
async function captureDurable(store, journal, executor) {
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
  );
}
function assertNoUnauthorizedWork(counters, executor, journal, rowId) {
  assert.equal(counters.nonEffectfulCalls.length, 0, `${rowId}: zero non-effectful dispatch`);
  assert.equal(counters.effectfulCalls.length, 0, `${rowId}: zero effectful dispatch`);
  assert.equal(journal.getRecords().length, 0, `${rowId}: ZERO journal records`);
  assert.equal(executor.effects().length, 0, `${rowId}: zero recorder effects`);
}
async function expectRefusal(promise, errorClass, code, rowId) {
  try {
    await promise;
  } catch (error) {
    assert.ok(
      error instanceof errorClass,
      `${rowId}: expected ${errorClass.name}(${code}), got ${String(error)}`,
    );
    assert.equal(error.code, code, `${rowId}: typed refusal code`);
    return error;
  }
  throw new Error(`${rowId}: expected ${errorClass.name}(${code}), but the call resolved`);
}
function countingNonEffectfulDispatch(counters) {
  return {
    async dispatch(query) {
      counters.nonEffectfulCalls.push(query);
      return { observed: true };
    },
  };
}
function countingEffectfulDispatch(counters) {
  return {
    async dispatch(query) {
      counters.effectfulCalls.push(query);
      return { recorded: true };
    },
  };
}
function countingResourceProvider(counters) {
  const innerResolve = async (request) => {
    if (request.resourceKey !== T010A_RESOURCE_CURRENTNESS.resourceKey) {
      return { status: 'absent' };
    }
    const resolved = {
      status: 'resolved',
      handle: { sink: 't010a-test-audit-log' },
      currentnessPin: {
        providerId: T010A_RESOURCE_CURRENTNESS.providerId,
        resourceKey: T010A_RESOURCE_CURRENTNESS.resourceKey,
        revisionDigest: T010A_RESOURCE_CURRENTNESS.revisionDigest,
      },
    };
    if (request.contract !== undefined) return { ...resolved, contract: request.contract };
    return resolved;
  };
  return {
    async resolve(request) {
      counters.resourceResolutions += 1;
      return innerResolve(request);
    },
  };
}

t010aKindValidator.toolValidator = (envelope) => V7.validateToolComponent(envelope);

async function boundFrozen() {
  const bundle = await buildT010aAssembly(EX);
  const executor = new T010aTestExecutor();
  const binding = await bindT010aTool(EX, bundle, executor);
  return { bundle, executor, binding };
}

// ---------------------------------------------------------------------------
// STAGE 0 — frozen fixture identity through the PACKED public surface.
// ---------------------------------------------------------------------------
{
  const graph = t010aDefinitionGraph();
  const digest = await V7.computeDefinitionGraphDigest(graph, t010aSha256);
  ok(
    'T010-stage0-definition-graph-digest',
    `computeDefinitionGraphDigest(packed /v7)=${digest} frozen=${FREEZE_DEFINITION_GRAPH_DIGEST}`,
  );
  assert.equal(digest, FREEZE_DEFINITION_GRAPH_DIGEST);
}

{
  const graph = t010aDefinitionGraph();
  const tool = graph.components.find((c) => c.componentId === T010A_TOOL_COMPONENT_ID);
  const admittedTool = await V7.admitComponent(tool, [
    {
      kind: tool.kind,
      understoodSemanticContracts: [],
      understoodCapabilities: [T010A_CAPABILITY],
      validateComponent: t010aKindValidator,
    },
  ]);
  ok('T010-stage0-tool-component-admitted', `admitComponent status=${admittedTool.status}`);
  assert.equal(admittedTool.status, 'ADMITTED');
}

{
  const tool = t010aToolComponent();
  V7.validateToolComponent(tool);
  ok('T010-stage0-tool-component-validated', 'validateToolComponent accepted the frozen tool');
  const broken = {
    ...tool,
    semanticBody: {
      ...tool.semanticBody,
      operations: tool.semanticBody.operations.map((op) =>
        op.operationId === T010A_OP_RECORD ? { ...op, effect: 'mystery' } : op,
      ),
    },
  };
  assert.throws(() => V7.validateToolComponent(broken));
  ok('T010-neg-invalid-tool-effect-refused', 'validateToolComponent refused unknown effect class typed');
}

{
  const graph = t010aDefinitionGraph();
  const workflow = graph.components[0];
  const drifted = {
    ...graph,
    components: [
      { ...workflow, semanticBody: { ...workflow.semanticBody, note: 'DRIFTED' } },
      graph.components[1],
    ],
  };
  const driftedDigest = await V7.computeDefinitionGraphDigest(drifted, t010aSha256);
  assert.notEqual(driftedDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  ok(
    'T010-neg-definition-drift',
    `drifted graph digest ${driftedDigest.slice(0, 16)}… != frozen (digest-claimed currentness fails closed)`,
  );
}

// ---------------------------------------------------------------------------
// TOOL-PLANE SURFACE — PRESENCE on ./v7/execution, ABSENCE elsewhere (the
// prior run's 60 SURFACE_GAP absence checks, now a closedness POSITIVE).
// ---------------------------------------------------------------------------
const toolPlaneNames = [
  'sealRuntimeAssembly',
  'resolveCurrentCapabilityProvider',
  'bindToolImplementation',
  'verifyToolImplementationBinding',
  'admitToolExposure',
  'admitToolInvocationRequest',
  'invokeEffectfulTool',
  'invokeNonEffectfulTool',
  'resolveToolResources',
  'queryUxTool',
];
const otherNamespaces = {
  '.': await import('@kaicreator/domain-harness'),
  '/v2': await import('@kaicreator/domain-harness/v2'),
  '/v3': V3,
  '/v4': await import('@kaicreator/domain-harness/v4'),
  '/v7': V7,
  '/workflow': await import('@kaicreator/domain-harness/workflow'),
};
{
  const missing = toolPlaneNames.filter((name) => !(name in EX));
  assert.deepEqual(missing, [], `./v7/execution must export all 10 accepted Tool-plane seams`);
  const presentElsewhere = [];
  const absentElsewhere = [];
  for (const name of toolPlaneNames) {
    for (const [sp, ns] of Object.entries(otherNamespaces)) {
      if (name in ns) presentElsewhere.push(`${name}@${sp}`);
      else absentElsewhere.push(`${name}@${sp}`);
    }
  }
  assert.deepEqual(presentElsewhere, []);
  ok(
    'T010-execution-facade-surface',
    `10/10 Tool-plane seams PRESENT on packed ./v7/execution (${Object.keys(EX).length} total exports) and ABSENT from the other 6 declared subpaths (${absentElsewhere.length} absence checks green; T008C closedness preserved)`,
  );
}

// ---------------------------------------------------------------------------
// FROZEN DIGEST TRIPLE through packed ./v7/execution — the T012-D1 cure
// proved end-to-end: 8f5220bf… and 400d668f… now recompute through
// declared public surfaces.
// ---------------------------------------------------------------------------
const frozen = await boundFrozen();
{
  assert.equal(frozen.bundle.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(frozen.binding.evidence.bindingDigest, FREEZE_BINDING_DIGEST);
  assert.equal(frozen.binding.evidence.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(frozen.binding.successorAssembly.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  ok(
    'T010-stage0-binding-digest',
    `bindToolImplementation(packed ./v7/execution).evidence.bindingDigest=${frozen.binding.evidence.bindingDigest} == frozen ${FREEZE_BINDING_DIGEST}`,
  );
  ok(
    'T010-stage0-final-assembly-digest',
    `successorAssembly.assemblyDigest(packed ./v7/execution)=${frozen.binding.successorAssembly.assemblyDigest} == frozen ${FREEZE_FINAL_ASSEMBLY_DIGEST}`,
  );

  // Full freeze-record recompute deep-match (same public APIs that produced
  // the accepted literal; fixture drift fails closed here).
  const graph = frozen.bundle.graph;
  const workflow = graph.components.find((c) => c.componentId === 'wf.t010a');
  const tool = graph.components.find((c) => c.componentId === T010A_TOOL_COMPONENT_ID);
  const recomputed = {
    schema: 't010a.freeze-record/v1',
    semantic: {
      graphId: graph.graphId,
      workflowComponentId: workflow.componentId,
      toolComponentId: tool.componentId,
      relationId: graph.relations[0].relationId,
      relationKind: graph.relations[0].relationKind,
      workflowKindRef: workflow.kind,
      toolKindRef: tool.kind,
      capabilityRef: T010A_CAPABILITY,
      operations: tool.semanticBody.operations.map((operation) => ({
        operationId: operation.operationId,
        effect: operation.effect,
      })),
    },
    definition: { definitionGraphDigest: frozen.bundle.definitionGraphDigest },
    kindImplementation: {
      workflowRole: frozen.bundle.assembly.record.kindImplementations[0],
      toolRole: frozen.bundle.assembly.record.kindImplementations[0],
    },
    toolBinding: frozen.binding.evidence,
    finalAssembly: {
      assemblyDigest: frozen.binding.successorAssembly.assemblyDigest,
      definitionGraphDigest: frozen.binding.successorAssembly.record.definitionGraphDigest,
      kindImplementations: frozen.binding.successorAssembly.record.kindImplementations,
      implementationBindingEvidence:
        frozen.binding.successorAssembly.record.implementationBindingEvidence,
    },
  };
  assert.deepEqual(recomputed.toolBinding, {
    status: 'BOUND',
    definitionGraphDigest: FREEZE_DEFINITION_GRAPH_DIGEST,
    assemblyDigest: FREEZE_FINAL_ASSEMBLY_DIGEST,
    toolComponentId: T010A_TOOL_COMPONENT_ID,
    providesCapability: T010A_CAPABILITY,
    implementation: {
      implementationId: 'impl.t010a.tool',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:t010a-tool-impl-content',
    },
    supportedOperations: [T010A_OP_READ, T010A_OP_RECORD],
    bindingDigest: FREEZE_BINDING_DIGEST,
  });
  ok(
    'T010-stage0-freeze-record-deep-match',
    'T003C binding evidence recomputed through packed ./v7/execution deep-matches the accepted freeze record exactly',
  );

  const verified = await EX.verifyToolImplementationBinding({
    binding: frozen.binding,
    finalAssembly: frozen.binding.successorAssembly,
    expectedImplementationPin: {
      implementationId: 'impl.t010a.tool',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:t010a-tool-impl-content',
    },
    sha256: t010aSha256,
  });
  assert.equal(verified.implementationHandle, frozen.binding.implementationHandle);
  assert.deepEqual(frozen.binding.successorAssembly.record.implementationBindingEvidence, [
    { subject: T010A_TOOL_COMPONENT_ID, bindingDigest: FREEZE_BINDING_DIGEST },
  ]);
  ok(
    'T010-stage0-binding-verified',
    'verifyToolImplementationBinding(packed ./v7/execution) accepted the binding against the exact final Assembly under the exact Tool pin',
  );
}

// ---------------------------------------------------------------------------
// Occurrence + Central Admission journey (public /v3 plane) — retained from
// the prior run unchanged; must stay green.
// ---------------------------------------------------------------------------
async function buildOccurrence({ authorityClass = 'PRODUCTION', currentness = [T010A_RESOURCE_CURRENTNESS], skipPin = false, effectInput = { note: 't012-journey-1' } } = {}) {
  const b1 = await t010aGovernanceBody(t010aSha256, V3.createGovernanceBaselineBody);
  const baselines = new V3.MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const store = new T010aMemoryDurableExecutionStore();
  const coordinator = new V3.GovernanceExecutionCoordinator(store, t010aSha256);
  let pin = null;
  const pinRequest = {
    workflowTarget: T010A_WORKFLOW_TARGET,
    workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 't010a',
      packageId: 'pkg-t010a-1',
      domainIntelligenceContentDigest: 'cdi-t010a-1',
      governanceBaseline: b1.identity,
    },
    ...(authorityClass === undefined ? {} : { authorityClass }),
    ...(currentness === undefined ? {} : { resourceCurrentness: currentness }),
  };
  if (!skipPin) {
    pin = await V3.createGovernanceExecutionPin(pinRequest, t010aSha256);
    const bound = await coordinator.pinExecution(pinRequest);
    assert.equal(JSON.stringify(bound), JSON.stringify(pin));
  }
  return { b1, baselines, store, coordinator, pin, effectInput };
}

function admissionRequestFor(effectInput, resolved = t010aResolvedDecision('harness-machine', {
  decision: { outcome: 'complete', data: { note: 't010a-note' } },
  event: { type: 'T010A_COMPLETE_REQUESTED', payload: { note: 't010a-note' } },
})) {
  return {
    target: { ...T010A_OCCURRENCE_TARGET },
    turn: { kind: 'message', sourceMessageId: 'msg:t010a:1' },
    trigger: { kind: 'event', eventType: 'T010A_COMPLETE_REQUESTED' },
    workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
    definition: t010aWorkflowDefinition(effectInput),
    currentStateKey: 'READY',
    context: {},
    event: { type: 'T010A_COMPLETE_REQUESTED', payload: { note: 't010a-note' } },
    resolved,
    decisionSchema: T010A_DECISION_SCHEMA,
    now: T010A_NOW,
  };
}

function effectToolsPort(executor, journalProbe) {
  return {
    resolve(effectType) {
      if (effectType !== T010A_EFFECT_TYPE) return undefined;
      return { effectType, effectSemantics: 'idempotent' };
    },
    async execute(request) {
      journalProbe && journalProbe();
      const result = await executor.run(T010A_OP_RECORD, request.input);
      return result;
    },
  };
}

{
  const executor = new T010aTestExecutor();
  const journal = new V3.VolatileAdmissionEffectJournal();
  const occ = await buildOccurrence({ effectInput: { note: 't012-journey-1' } });

  assert.equal(occ.pin.authorityClass, 'PRODUCTION');
  assert.deepEqual(occ.pin.resourceCurrentness, [
    {
      componentId: T010A_TOOL_COMPONENT_ID,
      providerId: T010A_RESOURCE_CURRENTNESS.providerId,
      resourceKey: T010A_RESOURCE_CURRENTNESS.resourceKey,
      revisionDigest: T010A_RESOURCE_CURRENTNESS.revisionDigest,
    },
  ]);
  ok(
    'T010-occurrence-pin-production-current',
    'public createGovernanceExecutionPin minted PRODUCTION pin with exact frozen resource currentness; coordinator bound it (inserted)',
  );

  const request = admissionRequestFor({ note: 't012-journey-1' });
  const outcome = await V3.admitCentralDecision(request, {
    governance: occ.coordinator,
    baselines: occ.baselines,
    sha256: t010aSha256,
    effectJournal: journal,
    effectTools: effectToolsPort(executor),
  });

  assert.equal(outcome.status, 'admitted');
  assert.equal(outcome.admitted.transitionKey, 'complete');
  assert.equal(outcome.admitted.targetState, 'DONE');
  assert.equal(outcome.admitted.effects.length, 1);
  const effect = outcome.admitted.effects[0];
  assert.equal(effect.disposition, 'executed');
  assert.equal(effect.effectType, T010A_EFFECT_TYPE);
  assert.equal(effect.idempotencyKey, T010A_IDEMPOTENCY_KEY);
  assert.deepEqual(effect.output, { recorded: true, effectCount: 1 });

  const turnId = V3.deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, {
    kind: 'message',
    sourceMessageId: 'msg:t010a:1',
  });
  assert.equal(effect.effectId, `${turnId}/effect/1`);
  assert.equal(outcome.admitted.durableControlTurnId, turnId);
  ok(
    'T010-authorized-journey-done',
    'admitCentralDecision(packed /v3) admitted READY->DONE; authoritative outcome carries transitionKey=complete targetState=DONE effects[0]=executed',
  );

  const journaled = await journal.getEffect(effect.effectId);
  assert.equal(journaled.status, 'completed');
  assert.equal(journaled.effectType, T010A_EFFECT_TYPE);
  assert.deepEqual(journaled.input, { note: 't012-journey-1' });
  assert.equal(journaled.durableControlTurnId, turnId);
  assert.equal(journaled.idempotencyKey, T010A_IDEMPOTENCY_KEY);
  assert.equal(executor.effects().length, 1);
  ok(
    'T010-one-authority-one-journal',
    'exactly ONE durable record on the ONE Central Admission journal; test executor observed the same input (observation sink only)',
  );

  const replay = await V3.admitCentralDecision(request, {
    governance: occ.coordinator,
    baselines: occ.baselines,
    sha256: t010aSha256,
    effectJournal: journal,
    effectTools: effectToolsPort(executor),
  });
  assert.equal(replay.status, 'admitted');
  assert.equal(replay.admitted.effects[0].disposition, 'replayed');
  assert.equal(replay.admitted.effects[0].effectId, effect.effectId);
  assert.equal(executor.effects().length, 1, 'replay must not re-invoke the tool');
  const afterReplay = await journal.getEffect(effect.effectId);
  assert.equal(afterReplay.status, 'completed');
  ok(
    'T010-replay-idempotent',
    'exact-turn replay through the packed public admission path returned disposition=replayed with ZERO additional tool invocation',
  );
}

// ---------------------------------------------------------------------------
// T010B AUTHORIZED JOURNEY through the Tool plane (./v7/execution) — the
// rows the prior run recorded as SURFACE_GAP.
// ---------------------------------------------------------------------------

/** Stage 1-4 fixture: intent currentness -> T004A exposure -> T004A
 * invocation admission -> ONE authoritative PRODUCTION occurrence. */
async function journeyFixture(operationId, input) {
  const bundle = await buildT010aAssembly(EX);
  const executor = new T010aTestExecutor();
  const binding = await bindT010aTool(EX, bundle, executor);
  const exposure = await EX.admitToolExposure(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId,
      caller: { callerId: 'ux.session.t010b-1', callerKind: 'ux' },
      assembly: binding.successorAssembly,
      currentDefinitionGraph: bundle.graph,
      policy: T010A_ADMIT_ALL,
    },
    t010aSha256,
  );
  const admitted = await EX.admitToolInvocationRequest(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId,
      input,
      caller: { callerId: 'ux.session.t010b-1', callerKind: 'ux' },
      definitionGraphDigest: exposure.definitionGraphDigest,
      assemblyDigest: exposure.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: bundle.graph },
    t010aSha256,
  );
  const fx = await buildT010aOccurrenceContext(V3, binding, bundle, { effectInput: input });
  return { bundle, executor, binding, admitted, fx };
}

{
  const input = { note: 't010b-admission-1' };
  const fx = await journeyFixture(T010A_OP_RECORD, input);
  const exposure = fx.admitted.exposure;
  assert.equal(exposure.status, 'ADMITTED');
  assert.equal(exposure.toolComponentId, T010A_TOOL_COMPONENT_ID);
  assert.equal(exposure.operationId, T010A_OP_RECORD);
  assert.deepEqual(exposure.caller, { callerId: 'ux.session.t010b-1', callerKind: 'ux' });
  assert.equal(exposure.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(exposure.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(typeof exposure.exposureDigest, 'string');
  assert.equal(fx.admitted.status, 'ADMITTED');
  assert.equal(fx.admitted.operationEffect, 'idempotent');
  assert.deepEqual(fx.admitted.input, input);
  ok(
    'T010b-stages2-3-exposure-invocation-admitted',
    'admitToolExposure + admitToolInvocationRequest through packed ./v7/execution admitted the UX caller against the frozen current contract (digests 030402bf…/400d668f…)',
  );
}

{
  const input = { note: 't010b-occurrence-1' };
  const fx = await journeyFixture(T010A_OP_RECORD, input);
  const pin = await fx.fx.admissionPorts.governance.requirePinnedExecution(T010A_WORKFLOW_INSTANCE_ID);
  assert.equal(pin.workflowTarget, T010A_WORKFLOW_TARGET);
  assert.equal(pin.workflowInstanceId, T010A_WORKFLOW_INSTANCE_ID);
  assert.equal(pin.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(pin.authorityClass, 'PRODUCTION');
  ok(
    'T010b-stage4-occurrence-production-pinned',
    'ONE already-authoritative PRODUCTION occurrence pinned to the exact final Assembly (assemblyDigest=400d668f…) via packed ./v3 activation',
  );
}

{
  const input = { note: 't010b-journey-1' };
  const fx = await journeyFixture(T010A_OP_RECORD, input);
  const calls = [];
  const result = await EX.invokeEffectfulTool({
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.bundle.graph,
    activator: fx.fx.activator,
    admissionRequest: fx.fx.admissionRequest,
    admissionPorts: fx.fx.admissionPorts,
    effectType: T010A_EFFECT_TYPE,
    dispatch: {
      async dispatch(query) {
        calls.push(query);
        return query.handle.run(query.operationId, query.input);
      },
    },
    resourceProvider: countingResourceProvider(makeCounters()),
    sha256: t010aSha256,
  });

  assert.equal(calls.length, 1);
  const query = calls[0];
  assert.equal(query.handle, fx.binding.implementationHandle);
  assert.equal(query.operationId, T010A_OP_RECORD);
  assert.deepEqual(query.input, input);
  assert.equal(result.outcome.status, 'admitted');
  assert.equal(result.outcome.admitted.transitionKey, 'complete');
  assert.equal(result.outcome.admitted.targetState, 'DONE');
  assert.equal(result.outcome.admitted.effects.length, 1);
  const effect = result.outcome.admitted.effects[0];
  assert.equal(effect.disposition, 'executed');
  assert.deepEqual(effect.output, { recorded: true, effectCount: 1 });

  const turnId = V3.deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, {
    kind: 'message',
    sourceMessageId: 'msg:t010a:1',
  });
  assert.equal(effect.effectId, `${turnId}/effect/1`);
  assert.equal(query.effectId, effect.effectId);
  assert.equal(query.durableControlTurnId, turnId);
  assert.equal(query.idempotencyKey, T010A_IDEMPOTENCY_KEY);
  assert.equal(query.logicalTime, T010A_NOW);
  assert.equal(query.resources.size, 1);
  const resource = query.resources.get(T010A_RESOURCE_CURRENTNESS.resourceKey);
  assert.equal(resource?.status, 'resolved');
  assert.deepEqual(resource.currentnessPin, {
    providerId: T010A_RESOURCE_CURRENTNESS.providerId,
    resourceKey: T010A_RESOURCE_CURRENTNESS.resourceKey,
    revisionDigest: T010A_RESOURCE_CURRENTNESS.revisionDigest,
  });

  const records = fx.fx.journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].effectId, effect.effectId);
  assert.equal(records[0].status, 'completed');
  assert.deepEqual(records[0].input, input);
  assert.equal(fx.executor.effects().length, 1);
  assert.equal(result.occurrence.workflowTarget, T010A_WORKFLOW_TARGET);
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.deepEqual(result.invocation.implementation, {
    implementationId: 'impl.t010a.tool',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:t010a-tool-impl-content',
  });
  assert.ok(!JSON.stringify(result).includes('t010a-test-audit-log'));
  assert.ok(Object.isFrozen(result));
  ok(
    'T010b-stages5-6-effectful-done-one-journal',
    'invokeEffectfulTool(packed ./v7/execution): exactly ONE dispatch of the verified paired handle; authoritative Runtime DONE read from the Central Admission outcome; T005C resource re-proof exact; ONE durable journal record; live handle never leaks',
  );
}

{
  const input = { note: 't010b-read-1' };
  const fx = await journeyFixture(T010A_OP_READ, input);
  const calls = [];
  const result = await EX.invokeNonEffectfulTool({
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.bundle.graph,
    dispatch: {
      async dispatch(query) {
        calls.push(query);
        return query.handle.run(query.operationId, query.input);
      },
    },
    sha256: t010aSha256,
  });
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.operationId, T010A_OP_READ);
  assert.deepEqual(result.output, { observed: true, observationCount: 1 });
  assert.deepEqual(result.implementation, {
    implementationId: 'impl.t010a.tool',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:t010a-tool-impl-content',
  });
  assert.equal(result.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  assert.equal(result.assemblyDigest, FREEZE_FINAL_ASSEMBLY_DIGEST);
  assert.equal(result.bindingDigest, FREEZE_BINDING_DIGEST);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].handle, fx.binding.implementationHandle);
  assert.equal(calls[0].resources.size, 0);
  assert.equal(fx.fx.journal.getRecords().length, 0);
  assert.equal(fx.executor.effects().length, 0);
  assert.equal(fx.executor.observations().length, 1);
  ok(
    'T010b-pure-route-observed',
    'invokeNonEffectfulTool(packed ./v7/execution): effect=none operation OBSERVED-only — zero journal records, zero effects, no DONE/transition authority (prior-run N06 PARTIAL now EXECUTED green)',
  );
}

{
  const { bundle, executor, binding } = frozen;
  const effectfulAdmitted = await EX.admitToolInvocationRequest(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      input: { note: 'x' },
      caller: t010aCaller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure: await EX.admitToolExposure(
        {
          toolComponentId: T010A_TOOL_COMPONENT_ID,
          operationId: T010A_OP_RECORD,
          caller: t010aCaller(),
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
  const nonEffectfulCalls = [];
  await expectRefusal(
    EX.invokeNonEffectfulTool({
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
    EX.NonEffectfulInvocationError,
    'EFFECTFUL_OPERATION_REJECTED',
    'authority-split pure seam',
  );
  assert.equal(nonEffectfulCalls.length, 0);
  assert.equal(executor.effects().length, 0);

  const fx = await journeyFixture(T010A_OP_READ, { note: 'none' });
  const effectfulCalls = [];
  await expectRefusal(
    EX.invokeEffectfulTool({
      request: fx.admitted,
      binding: fx.binding,
      currentDefinitionGraph: fx.bundle.graph,
      activator: fx.fx.activator,
      admissionRequest: fx.fx.admissionRequest,
      admissionPorts: fx.fx.admissionPorts,
      effectType: T010A_EFFECT_TYPE,
      dispatch: {
        async dispatch(query) {
          effectfulCalls.push(query);
          return null;
        },
      },
      sha256: t010aSha256,
    }),
    EX.EffectfulInvocationError,
    'EFFECTLESS_OPERATION_REJECTED',
    'authority-split effectful seam',
  );
  assert.equal(effectfulCalls.length, 0);
  assert.equal(fx.fx.journal.getRecords().length, 0);
  ok(
    'T010b-authority-split-typed',
    'effect=none path never enters T004C and effectful path never falls back to T004B — both refuse TYPED (EFFECTFUL_OPERATION_REJECTED / EFFECTLESS_OPERATION_REJECTED) before any dispatch',
  );
}

// ---------------------------------------------------------------------------
// T010C UNAUTHORIZED MATRIX through packed ./v7/execution (T004E UX seams,
// T004A kernel seams, T003C mint seam, T005C re-proof, T002C/T002D
// occurrence gates) — typed refusals, zero counters, byte-stable state.
// ---------------------------------------------------------------------------

// R1 — the frozen fixture operations are invisible to the UX plane.
{
  const { bundle, executor, binding } = frozen;
  const store = new T010aMemoryDurableExecutionStore();
  const journal = new V3.VolatileAdmissionEffectJournal();

  const countersQ = makeCounters();
  const beforeQ = await captureDurable(store, journal, executor);
  await expectRefusal(
    EX.queryUxTool({
      uxSessionId: 'ux.session-t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_READ,
      input: { note: 't010c' },
      expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(countersQ),
      sha256: t010aSha256,
    }),
    EX.UxToolRequestError,
    'UX_OPERATION_NOT_EXPOSED',
    'R1 query',
  );
  assertNoUnauthorizedWork(countersQ, executor, journal, 'R1 query');
  assert.deepEqual(await captureDurable(store, journal, executor), beforeQ);

  const fx = await buildT010aOccurrenceContext(V3, binding, bundle, { effectInput: { note: 't010c' } });
  const countersF = makeCounters();
  const beforeF = await captureDurable(fx.store, fx.journal, executor);
  await expectRefusal(
    EX.invokeUxToolEffectfully({
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
      dispatch: countingEffectfulDispatch(countersF),
      resourceProvider: countingResourceProvider(countersF),
      sha256: t010aSha256,
    }),
    EX.UxToolRequestError,
    'UX_OPERATION_NOT_EXPOSED',
    'R1 effectful',
  );
  assertNoUnauthorizedWork(countersF, executor, fx.journal, 'R1 effectful');

  const countersForged = makeCounters();
  await expectRefusal(
    EX.queryUxTool({
      uxSessionId: 'ux.session-t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: 'op.t010a.forged',
      input: {},
      expectedDefinitionGraphDigest: bundle.definitionGraphDigest,
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(countersForged),
      sha256: t010aSha256,
    }),
    EX.UxToolRequestError,
    'UX_OPERATION_NOT_EXPOSED',
    'R1 forged op id',
  );
  assert.equal(countersForged.nonEffectfulCalls.length, 0);

  const projection = await EX.projectAgentToolSurface({
    agentId: 'agent.t010c',
    currentDefinitionGraph: bundle.graph,
    sha256: t010aSha256,
  });
  assert.equal(projection.definitionGraphDigest, FREEZE_DEFINITION_GRAPH_DIGEST);
  const frozenTool = projection.tools.find((entry) => entry.toolComponentId === T010A_TOOL_COMPONENT_ID);
  assert.equal(frozenTool.operations.length, 0);
  const countersA = makeCounters();
  await expectRefusal(
    EX.queryAgentTool({
      agentId: 'agent.t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_READ,
      proposal: { note: 't010c' },
      projection,
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(countersA),
      sha256: t010aSha256,
    }),
    EX.AgentToolProjectionError,
    'AGENT_OPERATION_NOT_PROJECTED',
    'R1 agent',
  );
  assert.equal(countersA.nonEffectfulCalls.length, 0);
  ok(
    'T010c-r1-non-exposed-refusals',
    'frozen fixture operations refuse UX_OPERATION_NOT_EXPOSED (query + effectful + forged op id via T004E seams) and AGENT_OPERATION_NOT_PROJECTED (T004D seam) — all typed, zero counters, byte-stable state',
  );

  await expectRefusal(
    EX.admitToolExposure(
      {
        toolComponentId: 'tool.t010a.forged',
        operationId: T010A_OP_READ,
        caller: t010aCaller(),
        assembly: binding.successorAssembly,
        currentDefinitionGraph: bundle.graph,
        policy: T010A_ADMIT_ALL,
      },
      t010aSha256,
    ),
    EX.InvocationRequestError,
    'TOOL_COMPONENT_NOT_BOUND',
    'R1 forged tool',
  );
  ok(
    'T010c-r1-forged-tool-refused',
    'forged Tool Component id refuses TOOL_COMPONENT_NOT_BOUND at the kernel T004A exposure admission (no implicit binding fallback)',
  );
}

// R2 — stale currentness refuses at the kernel re-admission.
{
  const { bundle, executor, binding } = frozen;
  const base = t010aDefinitionGraph();
  const moved = {
    ...base,
    components: [
      { ...base.components[0], semanticBody: { ...base.components[0].semanticBody, note: 'MOVED' } },
      base.components[1],
    ],
  };
  const movedDigest = await V7.computeDefinitionGraphDigest(moved, t010aSha256);
  assert.notEqual(movedDigest, bundle.definitionGraphDigest);
  const counters = makeCounters();
  const journal = new V3.VolatileAdmissionEffectJournal();
  const admitted = await admitT010aOperation(EX, binding, bundle, T010A_OP_READ, { note: 'x' });
  await expectRefusal(
    EX.invokeNonEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: moved,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    EX.InvocationRequestError,
    'DEFINITION_CURRENTNESS_MISMATCH',
    'R2 T004B stale',
  );
  assertNoUnauthorizedWork(counters, executor, journal, 'R2 T004B stale');
  ok(
    'T010c-r2-stale-currentness-refused',
    'a moved current Definition graph refuses DEFINITION_CURRENTNESS_MISMATCH at the T004B re-admission before any dispatch',
  );
}

// R3 — forged authority refuses at every seam.
{
  const { bundle, executor, binding } = frozen;
  const counters = makeCounters();
  const journal = new V3.VolatileAdmissionEffectJournal();
  const admitted = await admitT010aOperation(EX, binding, bundle, T010A_OP_READ, { note: 'x' });
  const lookalike = {
    evidence: { ...binding.evidence },
    successorAssembly: binding.successorAssembly,
    implementationHandle: binding.implementationHandle,
  };
  const before = await captureDurable(new T010aMemoryDurableExecutionStore(), journal, executor);
  await expectRefusal(
    EX.invokeNonEffectfulTool({
      request: admitted,
      binding: lookalike,
      currentDefinitionGraph: bundle.graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    EX.ToolImplementationBindingError,
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
    'R3 forged binding',
  );
  assertNoUnauthorizedWork(counters, executor, journal, 'R3 forged binding');
  assert.deepEqual(
    await captureDurable(new T010aMemoryDurableExecutionStore(), journal, executor),
    before,
  );
  ok(
    'T010c-r3-unminted-binding-refused',
    'caller-built binding lookalike refuses UNMINTED_TOOL_IMPLEMENTATION_BINDING at the T003C consumer verifier — implementation authority is never caller-forgeable',
  );
}

{
  const { bundle, executor, binding } = frozen;
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(V3, binding, bundle, {
    effectInput: { note: 't010c' },
    skipActivation: true,
  });
  const admitted = await admitT010aOperation(EX, binding, bundle, T010A_OP_RECORD, { note: 't010c' });
  const before = await captureDurable(fx.store, fx.journal, executor);
  await expectRefusal(
    EX.invokeEffectfulTool({
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
    V3.GovernanceExecutionBindingError,
    'GOVERNANCE_EXECUTION_PIN_MISSING',
    'R3 no occurrence',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'R3 no occurrence');
  assert.equal(counters.resourceResolutions, 0);
  assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before);
  ok(
    'T010c-r3-pin-missing-refused',
    'a missing authoritative occurrence refuses GOVERNANCE_EXECUTION_PIN_MISSING at the T004C occurrence gate before any dispatch — a sealed Assembly alone is not activation authority',
  );
}

{
  const { bundle, executor, binding } = frozen;
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(V3, binding, bundle, { effectInput: { note: 't010c' } });
  const admitted = await admitT010aOperation(EX, binding, bundle, T010A_OP_RECORD, { note: 't010c' });
  const forgedProvider = {
    async resolve(request) {
      counters.resourceResolutions += 1;
      if (request.resourceKey !== T010A_RESOURCE_CURRENTNESS.resourceKey) {
        return { status: 'absent' };
      }
      return {
        status: 'resolved',
        handle: { sink: 't010c-forged-sink' },
        ...(request.contract === undefined ? {} : { contract: request.contract }),
        currentnessPin: {
          providerId: T010A_RESOURCE_CURRENTNESS.providerId,
          resourceKey: T010A_RESOURCE_CURRENTNESS.resourceKey,
          revisionDigest: 'sha256:t010c-forged-revision',
        },
      };
    },
  };
  const before = await captureDurable(fx.store, fx.journal, executor);
  await expectRefusal(
    EX.invokeEffectfulTool({
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
    V3.GovernanceExecutionBindingError,
    'RESOURCE_CURRENTNESS_MISMATCH',
    'R3 forged resource revision',
  );
  assertNoUnauthorizedWork(counters, executor, fx.journal, 'R3 forged resource revision');
  assert.deepEqual(await captureDurable(fx.store, fx.journal, executor), before);
  ok(
    'T010c-r3-forged-resource-refused',
    'a forged resource-currentness revision refuses RESOURCE_CURRENTNESS_MISMATCH at the T005C occurrence re-proof — resource authority is re-proven against the pinned occurrence, never trusted from the provider claim',
  );
}

// R4 — mutation attempted through query-only seams (derived exposure variant).
{
  const graph = exposedVariantGraph(['ux']);
  const bundle = await buildT010aAssembly(EX, graph);
  const digest = bundle.definitionGraphDigest;
  assert.notEqual(digest, FREEZE_DEFINITION_GRAPH_DIGEST);
  const executor = new T010aTestExecutor();
  const binding = await bindT010aTool(EX, bundle, executor);
  const counters = makeCounters();
  await expectRefusal(
    EX.queryUxTool({
      uxSessionId: 'ux.session-t010c',
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId: T010A_OP_RECORD,
      input: { note: 't010c' },
      expectedDefinitionGraphDigest: digest,
      binding,
      currentDefinitionGraph: graph,
      dispatch: countingNonEffectfulDispatch(counters),
      sha256: t010aSha256,
    }),
    EX.UxToolRequestError,
    'UX_MUTATION_REFUSED',
    'R4 ux query mutation',
  );
  assert.equal(counters.nonEffectfulCalls.length, 0);
  ok(
    'T010c-r4-ux-mutation-refused',
    'a mutation-capable operation presented to the UX QUERY seam refuses UX_MUTATION_REFUSED before any admission or dispatch (derived exposure variant; frozen identity pinned by the stage-0 deep match)',
  );
}

// R5 — invalid authority class refuses production effect.
{
  const { bundle, executor, binding } = frozen;
  const counters = makeCounters();
  const fx = await buildT010aOccurrenceContext(V3, binding, bundle, { effectInput: { note: 't010c' } });
  const sim = await simulationOccurrence(V3, binding, bundle, 'SIMULATION');
  const admitted = await admitT010aOperation(EX, binding, bundle, T010A_OP_RECORD, { note: 't010c' });
  const journal = new V3.VolatileAdmissionEffectJournal();
  const before = await captureDurable(sim.store, journal, executor);
  await expectRefusal(
    EX.invokeEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      activator: sim.activator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: {
        governance: new V3.GovernanceExecutionCoordinator(sim.store, t010aSha256),
        baselines: sim.baselines,
        effectJournal: journal,
      },
      effectType: T010A_EFFECT_TYPE,
      dispatch: countingEffectfulDispatch(counters),
      resourceProvider: countingResourceProvider(counters),
      sha256: t010aSha256,
    }),
    V3.GovernanceExecutionBindingError,
    'AUTHORITY_CLASS_MISMATCH',
    'R5 simulation pin',
  );
  assertNoUnauthorizedWork(counters, executor, journal, 'R5 simulation pin');
  assert.equal(counters.resourceResolutions, 0);
  assert.deepEqual(await captureDurable(sim.store, journal, executor), before);
  ok(
    'T010c-r5-simulation-class-refused',
    'a SIMULATION-class pin refuses production effect AUTHORITY_CLASS_MISMATCH at the T004C gate before any dispatch or journal record (prior-run OBSERVATION row now an EXECUTED typed refusal)',
  );

  const countersLegacy = makeCounters();
  const legacy = await simulationOccurrence(V3, binding, bundle, undefined);
  const journalLegacy = new V3.VolatileAdmissionEffectJournal();
  await expectRefusal(
    EX.invokeEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      activator: legacy.activator,
      admissionRequest: fx.admissionRequest,
      admissionPorts: {
        governance: new V3.GovernanceExecutionCoordinator(legacy.store, t010aSha256),
        baselines: legacy.baselines,
        effectJournal: journalLegacy,
      },
      effectType: T010A_EFFECT_TYPE,
      dispatch: countingEffectfulDispatch(countersLegacy),
      resourceProvider: countingResourceProvider(countersLegacy),
      sha256: t010aSha256,
    }),
    V3.GovernanceExecutionBindingError,
    'AUTHORITY_CLASS_FORBIDDEN',
    'R5 class-less pin',
  );
  assertNoUnauthorizedWork(countersLegacy, executor, journalLegacy, 'R5 class-less pin');
  ok(
    'T010c-r5-legacy-classless-refused',
    'a legacy class-less pin refuses AUTHORITY_CLASS_FORBIDDEN — historical evidence is never upgraded to PRODUCTION',
  );
}

// R6 — missing/ambiguous exact binding + floating identities fail closed.
{
  const { bundle } = frozen;
  const selection = await EX.resolveCurrentCapabilityProvider(
    bundle.graph,
    T010A_CAPABILITY,
    'wf.t010a',
    bundle.definitionGraphDigest,
    t010aSha256,
  );
  const candidate = (id) => ({
    implementation: {
      implementationId: id,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${id}-content`,
    },
    supportedOperations: [T010A_OP_READ, T010A_OP_RECORD],
    handle: new T010aTestExecutor(),
  });
  await expectRefusal(
    EX.bindToolImplementation({
      assembly: bundle.assembly,
      selection: JSON.parse(JSON.stringify(selection)),
      currentDefinitionGraph: bundle.graph,
      implementations: [candidate('impl.t010c.a'), candidate('impl.t010c.b')],
      sha256: t010aSha256,
    }),
    EX.ToolImplementationBindingError,
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
    'R6 ambiguous binding',
  );
  await expectRefusal(
    EX.bindToolImplementation({
      assembly: bundle.assembly,
      selection: JSON.parse(JSON.stringify(selection)),
      currentDefinitionGraph: bundle.graph,
      implementations: [],
      sha256: t010aSha256,
    }),
    EX.ToolImplementationBindingError,
    'MISSING_TOOL_IMPLEMENTATION',
    'R6 missing binding',
  );
  ok(
    'T010c-r6-binding-exactness',
    'two compatible T003C candidates refuse AMBIGUOUS_TOOL_IMPLEMENTATION and zero candidates refuse MISSING_TOOL_IMPLEMENTATION — never first/order/latest-wins',
  );

  const graph = exposedVariantGraph(['ux']);
  const bundleV = await buildT010aAssembly(EX, graph);
  const digestV = bundleV.definitionGraphDigest;
  const bindingV = await bindT010aTool(EX, bundleV, new T010aTestExecutor());
  for (const operationId of ['op.t010a.read@latest', 'latest', '*']) {
    const counters = makeCounters();
    await expectRefusal(
      EX.queryUxTool({
        uxSessionId: 'ux.session-t010c',
        toolComponentId: T010A_TOOL_COMPONENT_ID,
        operationId,
        input: { note: 't010c' },
        expectedDefinitionGraphDigest: digestV,
        binding: bindingV,
        currentDefinitionGraph: graph,
        dispatch: countingNonEffectfulDispatch(counters),
        sha256: t010aSha256,
      }),
      EX.UxToolRequestError,
      'INVALID_UX_REQUEST_INPUT',
      `R6 floating ${operationId}`,
    );
    assert.equal(counters.nonEffectfulCalls.length, 0);
  }
  ok(
    'T010c-r6-floating-identities-refused',
    'floating/selector identities (op.t010a.read@latest / latest / *) refuse INVALID_UX_REQUEST_INPUT — exact identities only, never normalized',
  );
}

// ---------------------------------------------------------------------------
// NEGATIVE matrix retained from the prior run (publicly-expressible rows).
// ---------------------------------------------------------------------------

{
  const executor = new T010aTestExecutor();
  const journal = new V3.VolatileAdmissionEffectJournal();
  const occ = await buildOccurrence({});
  const outcome = await V3.admitCentralDecision(
    admissionRequestFor({ note: 'x' }, t010aResolvedDecision('harness-machine', { wrong: true })),
    { governance: occ.coordinator, baselines: occ.baselines, sha256: t010aSha256, effectJournal: journal, effectTools: effectToolsPort(executor) },
  );
  assert.equal(outcome.status, 'denied');
  assert.equal(outcome.denial.reason, 'schema');
  assert.equal(executor.effects().length, 0);
  ok('T010-neg-schema-denial', `denied('schema') before any dispatch; journal+recorder at zero`);
}

{
  const executor = new T010aTestExecutor();
  const journal = new V3.VolatileAdmissionEffectJournal();
  const occ = await buildOccurrence({});
  const request = admissionRequestFor({ note: 'x' });
  const moved = {
    ...request,
    trigger: { kind: 'event', eventType: 'T010A_UNKNOWN' },
    event: { type: 'T010A_UNKNOWN', payload: {} },
    resolved: t010aResolvedDecision('harness-machine', {
      decision: { outcome: 'mystery', data: {} },
      event: { type: 'T010A_UNKNOWN', payload: {} },
    }),
  };
  const outcome = await V3.admitCentralDecision(moved, {
    governance: occ.coordinator, baselines: occ.baselines, sha256: t010aSha256,
    effectJournal: journal, effectTools: effectToolsPort(executor),
  });
  assert.equal(outcome.status, 'denied');
  assert.equal(['no-candidate-transition', 'guard'].includes(outcome.denial.reason), true);
  assert.equal(executor.effects().length, 0);
  ok('T010-neg-no-candidate-denial', `denied('${outcome.denial.reason}'); journal+recorder at zero`);
}

{
  const executor = new T010aTestExecutor();
  const journal = new V3.VolatileAdmissionEffectJournal();
  const occ = await buildOccurrence({ skipPin: true });
  await assert.rejects(
    V3.admitCentralDecision(admissionRequestFor({ note: 'x' }), {
      governance: occ.coordinator, baselines: occ.baselines, sha256: t010aSha256,
      effectJournal: journal, effectTools: effectToolsPort(executor),
    }),
  );
  assert.equal(executor.effects().length, 0);
  const turnId = V3.deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, { kind: 'message', sourceMessageId: 'msg:t010a:1' });
  assert.equal(await journal.getEffect(`${turnId}/effect/1`), null);
  ok('T010-neg-pin-missing', 'admission without an authoritative occurrence pin refused typed; journal at zero');
}

{
  const journal = new V3.VolatileAdmissionEffectJournal();
  const occ = await buildOccurrence({});
  await assert.rejects(
    V3.admitCentralDecision(admissionRequestFor({ note: 'x' }), {
      governance: occ.coordinator, baselines: occ.baselines, sha256: t010aSha256,
      effectJournal: journal,
      effectTools: { resolve: () => undefined, async execute() { throw new Error('must never run'); } },
    }),
    (error) => error instanceof Error && error.code === 'ADMISSION_EFFECT_TOOL_UNBOUND',
  );
  ok('T010-neg-effect-tool-unbound', 'ADMISSION_EFFECT_TOOL_UNBOUND typed; no journal record minted');
}

{
  const executor = new T010aTestExecutor();
  const journal = new V3.VolatileAdmissionEffectJournal();
  const occ = await buildOccurrence({});
  const turnId = V3.deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, { kind: 'message', sourceMessageId: 'msg:t010a:1' });
  await journal.beginEffect({
    effectId: `${turnId}/effect/1`,
    target: T010A_OCCURRENCE_TARGET,
    durableControlTurnId: turnId,
    operationOrdinal: 1,
    attempt: 1,
    effectType: T010A_EFFECT_TYPE,
    effectSemantics: 'idempotent',
    input: { note: 'FORGED-CONFLICTING-INPUT' },
    idempotencyKey: T010A_IDEMPOTENCY_KEY,
    status: 'started',
    startedAt: T010A_NOW,
  });
  await assert.rejects(
    V3.admitCentralDecision(admissionRequestFor({ note: 't012-journey-1' }), {
      governance: occ.coordinator, baselines: occ.baselines, sha256: t010aSha256,
      effectJournal: journal, effectTools: effectToolsPort(executor),
    }),
    (error) => error instanceof Error && error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT',
  );
  assert.equal(executor.effects().length, 0);
  const kept = await journal.getEffect(`${turnId}/effect/1`);
  assert.deepEqual(kept.input, { note: 'FORGED-CONFLICTING-INPUT' }, 'history never rewritten');
  ok('T010-neg-journal-conflict', 'ADMISSION_EFFECT_JOURNAL_CONFLICT; forged record never rewrote journal history');
}

{
  await assert.rejects(
    V3.createGovernanceExecutionPin(
      {
        workflowTarget: T010A_WORKFLOW_TARGET,
        workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
        binding: {
          domainId: 't010a', packageId: 'pkg-t010a-1',
          domainIntelligenceContentDigest: 'cdi-t010a-1',
          governanceBaseline: { domainId: 't010a', governanceId: 't010a-governance', schemaVersion: '1', version: 'B1', bodyDigest: 'sha256:x' },
        },
        authorityClass: 'PRODUCTION',
        resourceCurrentness: [{ providerId: 'p', resourceKey: 'k', revisionDigest: 'not-a-digest' }],
      },
      t010aSha256,
    ),
  );
  ok('T010-neg-forged-resource-currentness', 'forged revisionDigest refused typed at the public pin seam');

  const normalizedA = V3.normalizeResourceCurrentnessEvidence([T010A_RESOURCE_CURRENTNESS], 'x');
  const normalizedB = V3.normalizeResourceCurrentnessEvidence(
    [{ ...T010A_RESOURCE_CURRENTNESS, revisionDigest: 'sha256:other-revision' }],
    'x',
  );
  assert.equal(V3.sameResourceCurrentnessEvidence(normalizedA, normalizedA), true);
  assert.equal(V3.sameResourceCurrentnessEvidence(normalizedA, normalizedB), false);
  ok('T010-resource-currentness-exactness', 'sameResourceCurrentnessEvidence: exact match true, revised revision false');
}

{
  const occ = await buildOccurrence({ authorityClass: 'SIMULATION' });
  assert.equal(occ.pin.authorityClass, 'SIMULATION');
  const journal = new V3.VolatileAdmissionEffectJournal();
  const executor = new T010aTestExecutor();
  const outcome = await V3.admitCentralDecision(admissionRequestFor({ note: 'x' }), {
    governance: occ.coordinator, baselines: occ.baselines, sha256: t010aSha256,
    effectJournal: journal, effectTools: effectToolsPort(executor),
  });
  row(
    'T010-neg-authority-class-boundary',
    'OBSERVATION',
    `public /v3 Central Admission plane alone does not gate authority class (outcome=${outcome.status}); ` +
      'AUTHORITY_CLASS_MISMATCH enforcement is T004C-owned — now EXECUTED green via ./v7/execution (row T010c-r5-simulation-class-refused)',
  );
}

writeFileSync(join(artifactsDir, 't010-journeys.json'), JSON.stringify({ rows }, null, 2));
console.log(`t010-journeys complete: ${rows.length} rows`);
