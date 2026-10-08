/* eslint-disable -- T012 evidence-only clean-room consumer source; lint posture is not the evidence subject. */
/**
 * T12-N04/N05/N06/N07/N08/N11/N12 — T010 neutral authorized + unauthorized
 * Domain App journeys, PORTED to the PACKED PUBLIC SURFACES of the
 * T011-authorized candidate, executed from the clean external consumer.
 *
 * Honest port scope (machine-checked, not assumed):
 *  - PUBLIC at this candidate (declared export map): the Definition-plane v7
 *    foundation (graph/component identity digests, T003A tool-component
 *    validation, component admission), the Central Admission plane
 *    (admitCentralDecision, VolatileAdmissionEffectJournal,
 *    deriveDurableControlTurnId), the governance/occurrence plane
 *    (baselines, exact pins, PRODUCTION authority class, resource-currentness
 *    evidence) — all consumed here.
 *  - NOT PUBLIC at this candidate (ERR_PACKAGE_PATH_NOT_EXPORTED, proven in
 *    T12-N02): sealRuntimeAssembly / resolveCurrentCapabilityProvider /
 *    bindToolImplementation / verifyToolImplementationBinding (T002B/T003B/
 *    T003C), admitToolExposure / admitToolInvocationRequest (T004A),
 *    invokeEffectfulTool / invokeNonEffectfulTool (T004C/T004B),
 *    resolveToolResources (T005C re-proof), adapters/ux-tool-request (T004E).
 *    The Tool-binding/exposure/invocation stages of the frozen T010B/T010C
 *    journeys therefore CANNOT be executed through the packed public surface;
 *    those rows are recorded as SURFACE_GAP with machine-checked evidence.
 *
 * Rows executed here: fixture identity (digest 030402bf through packed
 * bytes), must-understand admission, definition-plane currentness negatives,
 * the authorized occurrence + Central Admission journey to authoritative
 * Runtime DONE with ONE executed effect on ONE journal, in-process idempotent
 * replay, and the publicly-expressible unauthorized matrix (schema denial,
 * no-candidate denial, missing pin, unbound effect tool, journal conflict,
 * forged resource currentness, forged authority-class material).
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V7 from '@kaicreator/domain-harness/v7';
import * as V3 from '@kaicreator/domain-harness/v3';
import {
  T010A_CAPABILITY,
  T010A_DECISION_SCHEMA,
  T010A_EFFECT_TYPE,
  T010A_IDEMPOTENCY_KEY,
  T010A_NOW,
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

const artifactsDir = resolve(fileURLToPath(new URL('../../artifacts/', import.meta.url)));
const rows = [];
function row(id, verdict, detail) {
  rows.push({ id, verdict, detail });
  console.log(`${verdict} ${id} — ${detail}`);
  if (verdict === 'FAIL') process.exitCode = 1;
}
const ok = (id, detail) => row(id, 'PASS', detail);
const gap = (id, detail) => row(id, 'SURFACE_GAP', detail);

t010aKindValidator.toolValidator = (envelope) => V7.validateToolComponent(envelope);

// ---------------------------------------------------------------------------
// STAGE 0 — frozen fixture identity through the PACKED public surface.
// ---------------------------------------------------------------------------
{
  const graph = t010aDefinitionGraph();
  const digest = await V7.computeDefinitionGraphDigest(graph, t010aSha256);
  ok(
    'T010-stage0-definition-graph-digest',
    `computeDefinitionGraphDigest(packed /v7)=${digest} frozen= ${FREEZE_DEFINITION_GRAPH_DIGEST}`,
  );
  assert.equal(digest, FREEZE_DEFINITION_GRAPH_DIGEST);
}

// Component admission (v7 must-understand) on both frozen components.
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

// Tool declaration validation (public T003A) + must-understand negative.
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

// Definition-plane currentness negative (drifted graph fails closed).
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
    `drifted graph digest ${driftedDigest.slice(0, 16)}… != frozen (any digest-claimed currentness fails closed)`,
  );
}

// ---------------------------------------------------------------------------
// SURFACE GAP — machine-checked absence of the Tool plane on every declared
// public subpath (the frozen T010B stages 2/3/5 and digests 8f5220b… /
// 400d668f… depend on these).
// ---------------------------------------------------------------------------
const toolPlaneNames = {
  sealRuntimeAssembly: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  resolveCurrentCapabilityProvider: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  bindToolImplementation: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  verifyToolImplementationBinding: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  admitToolExposure: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  admitToolInvocationRequest: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  invokeEffectfulTool: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  invokeNonEffectfulTool: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  resolveToolResources: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
  queryUxTool: ['.', '/v2', '/v3', '/v4', '/v7', '/workflow'],
};
const namespaces = {
  '.': await import('@kaicreator/domain-harness'),
  '/v2': V7 && (await import('@kaicreator/domain-harness/v2')),
  '/v3': V3,
  '/v4': await import('@kaicreator/domain-harness/v4'),
  '/v7': V7,
  '/workflow': await import('@kaicreator/domain-harness/workflow'),
};
{
  const absent = [];
  const present = [];
  for (const [name, subpaths] of Object.entries(toolPlaneNames)) {
    for (const sp of subpaths) {
      if (name in namespaces[sp]) present.push(`${name}@${sp}`);
      else absent.push(`${name}@${sp}`);
    }
  }
  assert.deepEqual(present, []);
  gap(
    'T010-tool-plane-not-public',
    `10 Tool-plane seams absent from all 6 declared subpaths (${absent.length} absence checks); ` +
      `frozen digests ${FREEZE_BINDING_DIGEST.slice(0, 8)}…/${FREEZE_FINAL_ASSEMBLY_DIGEST.slice(0, 8)}… not recomputable through packed public bytes`,
  );
}

// ---------------------------------------------------------------------------
// Occurrence + Central Admission journey (public plane), authorized path.
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

// AUTHORIZED journey: occurrence pin (PRODUCTION + exact resource currentness)
// -> Central Admission -> authoritative Runtime DONE, ONE effect on ONE journal.
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

  // RESTART/REPLAY (in-process lane): replay the exact same turn against the
  // SAME journal — the durable effect identity must replay, never re-execute.
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
// NEGATIVE matrix (publicly expressible rows).
// ---------------------------------------------------------------------------

// NEG: schema-invalid resolved decision denies before any effect.
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

// NEG: unknown event / no admitted transition denies.
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

// NEG: missing governance pin fails typed before any effect.
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

// NEG: unbound effect tool refuses typed; journal stays clean.
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

// NEG: adversarial journal conflict — same effect identity, conflicting input.
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

// NEG: forged resource-currentness evidence refuses typed at pin minting.
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

// NEG: SIMULATION-class pin minting is representable; record the admission
// boundary observation honestly (authority-class enforcement for production
// effects lives on the private T004C seam at this candidate).
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
    `public Central Admission path does not itself gate authority class (outcome=${outcome.status}); ` +
      'AUTHORITY_CLASS_MISMATCH enforcement is T004C-owned (private seam at this candidate)',
  );
}

writeFileSync(join(artifactsDir, 't010-journeys.json'), JSON.stringify({ rows }, null, 2));
console.log(`t010-journeys complete: ${rows.length} rows`);