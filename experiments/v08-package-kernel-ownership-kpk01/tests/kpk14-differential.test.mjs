/**
 * KPK-14 — independent differential vs the ORIGINAL frozen v0.7 modules
 * =====================================================================
 * BOUNDED semantic differential (user scope 6093427821: same-business-effect
 * /deny/current-version-safety reference where genuinely useful — NOT legacy
 * API parity, NOT exhaustive golden edge cases):
 *
 * The SAME scenario material (identical constants to the v0.7 admission
 * golden fixtures) is executed
 *   (A) through the ORIGINAL frozen v0.7 `admitCentralDecision` +
 *       `VolatileAdmissionEffectJournal` imported live from
 *       packages/domain-harness/src (base 3c71b91 = version/v0.7 tree), and
 *   (B) through the physically loaded Kernel Domain Package via
 *       `DomainHarness.load(package)` and the typed UX transport,
 * and the outcomes/journal rows/error taxonomies are compared field by field.
 *
 * This file MUST run under tsx (`node --import tsx --test`) because side (A)
 * imports the repository's TypeScript sources directly. It is excluded from
 * the stock-Node test glob for that reason (KPK-13 proves the stock path).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  admitCentralDecision,
  VolatileAdmissionEffectJournal,
  CentralAdmissionError as V07CentralAdmissionError,
} from '../../../packages/domain-harness/src/admission/index.js';
import {
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
} from '../../../packages/domain-harness/src/governance/index.js';

import { load, buildPackageRoot, createMemoryHost } from '../index.mjs';
import { NOW, TARGET, WORKFLOW_INSTANCE_ID, TURN_ID, EFFECT_ID } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

/* ------------------------------------------------------------------------- */
/* v0.7-side fixture — mirrors tests/admission/helpers.ts (same repo, v0.7)  */
/* ------------------------------------------------------------------------- */

const sha256 = {
  async digestUtf8(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const CAP_INVARIANT = {
  invariantId: 'inv:cap-100',
  predicate: {
    op: 'not',
    predicate: {
      op: 'gt',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'literal', value: 100 },
    },
  },
};

const RESERVE_INTENT = {
  effectType: 'effect:reserve',
  input: { reservation: 'quote', amount: 42 },
  idempotencyKey: 'reserve:quote:1',
};

function makeDefinition({ omitReject } = { omitReject: false }) {
  return {
    workflowKey: 'order-quote',
    initialState: 'review',
    initialContext: {},
    guards: [{
      guardId: 'guard:amount-ok',
      predicate: {
        op: 'lte',
        left: { source: 'event', path: ['payload', 'amount'] },
        right: { source: 'literal', value: 50 },
      },
    }],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'approved',
            guardId: 'guard:amount-ok',
            effectIntents: [RESERVE_INTENT],
          },
          ...(omitReject ? [] : [{
            transitionKey: 'reject',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'rejected',
          }]),
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
    ],
  };
}

const decisionSchema = {
  isValid(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const decision = value.decision;
    const event = value.event;
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
    return typeof decision.outcome === 'string' && typeof event.type === 'string';
  },
};

function resolvedFrom(structuredDecision) {
  return {
    source: 'harness-machine',
    structuredDecision,
    provenance: {},
    freshModelCallCount: 1,
    llmAvoided: false,
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}

function quoteDecision(amount) {
  return {
    decision: { outcome: 'approve', data: { amount } },
    event: { type: 'QUOTE_DECIDED', payload: { amount } },
  };
}

class ScriptedEffectTools {
  constructor() {
    this.calls = [];
  }
  resolve(effectType) {
    if (effectType !== 'effect:reserve') return undefined;
    return { effectType, effectSemantics: 'non-idempotent', toolArtifact: { kind: 'tool', artifactId: 'effect:reserve', contentDigest: 'digest-effect:reserve' } };
  }
  async execute(request) {
    this.calls.push(request);
    return { reserved: true, effectId: request.effectId };
  }
}

class MemoryDurableExecutionStore {
  #pins = new Map();
  #snapshots = new Map();
  async getGovernanceExecutionPin(id) { return this.#pins.get(id); }
  async bindGovernanceExecutionPin(pin) {
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    return JSON.stringify(existing) === JSON.stringify(pin) ? 'existing' : 'conflict';
  }
  async getGovernanceBoundSnapshot(id) { return this.#snapshots.get(id); }
  async putGovernanceBoundSnapshot(snapshot) { this.#snapshots.set(snapshot.workflowInstanceId, snapshot); }
}

async function v07AdmissionFixture() {
  const baseline = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version: 'B1',
    semantics: { hardInvariants: [CAP_INVARIANT], operatorAuthority: 'B1' },
  }, sha256);
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(baseline);
  const durableStore = new MemoryDurableExecutionStore();
  const coordinator = new GovernanceExecutionCoordinator(durableStore, sha256);
  const pin = await coordinator.pinExecution({
    workflowTarget: TARGET.workflowId,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-b1',
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: baseline.identity,
    },
  });
  const journal = new VolatileAdmissionEffectJournal();
  const tools = new ScriptedEffectTools();
  return {
    ports: { governance: coordinator, baselines, sha256, effectJournal: journal, effectTools: tools },
    journal,
    tools,
    pin,
  };
}

function v07Request({ amount, omitReject = false }) {
  return {
    target: TARGET,
    turn: { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition: makeDefinition({ omitReject }),
    currentStateKey: 'review',
    context: {},
    event: { type: 'QUOTE_DECIDED', payload: { amount } },
    resolved: resolvedFrom(quoteDecision(amount)),
    decisionSchema,
    now: NOW,
  };
}

/* ------------------------------------------------------------------------- */
/* package-side fixture                                                      */
/* ------------------------------------------------------------------------- */

async function packageRuntime() {
  const host = createMemoryHost({ now: () => NOW });
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const runtime = await load(pkg, { hostPorts: host });
  await runtime.openInstance({ target: TARGET, correlationId: 'corr:42' });
  return { runtime, host };
}

function packageIntent({ amount, strict = false }) {
  return {
    kind: 'kpk01/intent',
    intentType: strict ? 'submitQuoteDecisionStrict' : 'submitQuoteDecision',
    target: TARGET,
    messageId: 'msg:1',
    input: { amount },
    caller: { role: 'requester' },
  };
}

/* ------------------------------------------------------------------------- */
/* differential scenarios                                                    */
/* ------------------------------------------------------------------------- */

test('KPK-14: positive approval — admitted plans and journal rows agree semantically (and byte-for-byte on the journal row)', async () => {
  const v07 = await v07AdmissionFixture();
  const v07Outcome = await admitCentralDecision(v07Request({ amount: 42 }), v07.ports);
  assert.equal(v07Outcome.status, 'admitted');

  const pkg = await packageRuntime();
  const receipt = await pkg.runtime.send(packageIntent({ amount: 42 }));
  assert.equal(receipt.status, 'admitted');

  // Semantic field comparison of the admitted plan.
  assert.equal(receipt.admitted.transitionKey, v07Outcome.admitted.transitionKey);
  assert.equal(receipt.admitted.targetState, v07Outcome.admitted.targetState);
  assert.equal(receipt.admitted.durableControlTurnId, v07Outcome.admitted.durableControlTurnId);
  assert.equal(receipt.admitted.durableControlTurnId, TURN_ID);
  assert.deepEqual(receipt.admitted.resolver, v07Outcome.admitted.resolver);
  assert.deepEqual(
    receipt.admitted.effects.map(({ disposition, effectId, effectType, idempotencyKey, output }) => ({ disposition, effectId, effectType, idempotencyKey, output })),
    v07Outcome.admitted.effects.map(({ disposition, effectId, effectType, idempotencyKey, output }) => ({ disposition, effectId, effectType, idempotencyKey, output })),
  );

  // The journal rows are byte-identical (deterministic fixed clock).
  const v07Rows = v07.journal.getRecords();
  const pkgRows = await pkg.runtime.query({ kind: 'journal' });
  assert.equal(v07Rows.length, 1);
  assert.equal(pkgRows.length, 1);
  assert.deepEqual(pkgRows[0], v07Rows[0]);

  await writeEvidence('kpk14-differential-positive', {
    falsifier: 'KPK-14',
    scope: 'bounded same-business-effect semantic reference (user scope 6093427821)',
    original: {
      module: 'packages/domain-harness/src/admission/index.js @ main 3c71b9138056babfafbc7de1349b5924483f2203',
      admittedPlan: v07Outcome.admitted,
      journalRow: v07Rows[0],
      effectToolCalls: v07.tools.calls.length,
    },
    packageOwned: {
      kernelModule: 'kernel-vnext@1.1.0 (data:-instantiated sealed bytes)',
      admittedPlan: receipt.admitted,
      journalRow: pkgRows[0],
      resourceCalls: pkg.host.resources.callCount(),
    },
    agreedFields: ['transitionKey', 'targetState', 'durableControlTurnId', 'resolver evidence', 'effects[]', 'journal row (deep-equal)'],
  });
});

test('KPK-14: hard-invariant and guard denials agree', async () => {
  // amount 150 → hard invariant inv:cap-100 on both sides.
  const v07Inv = await v07AdmissionFixture();
  const v07InvOutcome = await admitCentralDecision(v07Request({ amount: 150 }), v07Inv.ports);
  assert.equal(v07InvOutcome.status, 'denied');
  assert.equal(v07InvOutcome.denial.reason, 'hard-invariant');
  assert.equal(v07InvOutcome.denial.invariantId, 'inv:cap-100');

  const pkgInv = await packageRuntime();
  const pkgInvReceipt = await pkgInv.runtime.send(packageIntent({ amount: 150 }));
  assert.equal(pkgInvReceipt.status, 'denied');
  assert.equal(pkgInvReceipt.denial.reason, v07InvOutcome.denial.reason);
  assert.equal(pkgInvReceipt.denial.invariantId, v07InvOutcome.denial.invariantId);
  assert.equal(pkgInvReceipt.denial.durableControlTurnId, v07InvOutcome.denial.durableControlTurnId);

  // amount 75 on the strict (omitReject) definition → guard denial on both sides.
  const v07Guard = await v07AdmissionFixture();
  const v07GuardOutcome = await admitCentralDecision(v07Request({ amount: 75, omitReject: true }), v07Guard.ports);
  assert.equal(v07GuardOutcome.status, 'denied');
  assert.equal(v07GuardOutcome.denial.reason, 'guard');
  assert.equal(v07GuardOutcome.denial.guardId, 'guard:amount-ok');

  const pkgGuard = await packageRuntime();
  const pkgGuardReceipt = await pkgGuard.runtime.send(packageIntent({ amount: 75, strict: true }));
  assert.equal(pkgGuardReceipt.status, 'denied');
  assert.equal(pkgGuardReceipt.denial.reason, v07GuardOutcome.denial.reason);
  assert.equal(pkgGuardReceipt.denial.guardId, v07GuardOutcome.denial.guardId);
  assert.equal(pkgGuardReceipt.denial.transitionKey, v07GuardOutcome.denial.transitionKey);

  await writeEvidence('kpk14-differential-denials', {
    falsifier: 'KPK-14',
    hardInvariant: { original: v07InvOutcome.denial, package: pkgInvReceipt.denial },
    guardStrict: { original: v07GuardOutcome.denial, package: pkgGuardReceipt.denial },
  });
});

test('KPK-14: identical occurrence replay and the non-idempotent UNKNOWN taxonomy agree', async () => {
  // Replay: re-running the SAME admission against the same journal replays
  // the completed effect with no new tool call (v0.7 §18).
  const v07 = await v07AdmissionFixture();
  await admitCentralDecision(v07Request({ amount: 42 }), v07.ports);
  const v07Replay = await admitCentralDecision(v07Request({ amount: 42 }), v07.ports);
  assert.equal(v07Replay.status, 'admitted');
  assert.equal(v07Replay.admitted.effects[0].disposition, 'replayed');
  assert.equal(v07.tools.calls.length, 1);

  // Package side: crash BEFORE the state commit of the FIRST attempt (the
  // effect is durably completed, the instance stays in 'review'), then retry
  // the same occurrence → journal replay, zero extra dispatches.
  const pkg = await packageRuntime();
  pkg.host.docs.failNextPutMatching('kpk01:wf-instance'); // fires at send #1's engine commit
  await assert.rejects(() => pkg.runtime.send(packageIntent({ amount: 42 })), (error) => error.code === 'HOST_FAULT_INJECTED');
  const pkgRetry = await pkg.runtime.send(packageIntent({ amount: 42 }));
  assert.equal(pkgRetry.status, 'admitted');
  assert.equal(pkgRetry.admitted.effects[0].disposition, 'replayed');
  assert.equal(pkgRetry.admitted.effects[0].effectId, v07Replay.admitted.effects[0].effectId);
  assert.equal(pkg.host.resources.callCount(), 1, 'package side: zero extra dispatches, like the original');

  // Ambiguous: seed a started-not-committed non-idempotent record on the
  // ORIGINAL journal, then admit → ADMISSION_EFFECT_AMBIGUOUS. The package
  // side hits the same taxonomy via a physical journal-complete fault.
  const v07Amb = await v07AdmissionFixture();
  await v07Amb.journal.beginEffect({
    effectId: EFFECT_ID,
    target: TARGET,
    durableControlTurnId: TURN_ID,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'started',
    attempt: 1,
    input: RESERVE_INTENT.input,
    idempotencyKey: RESERVE_INTENT.idempotencyKey,
    startedAt: NOW,
  });
  await assert.rejects(
    () => admitCentralDecision(v07Request({ amount: 42 }), v07Amb.ports),
    (error) => error instanceof V07CentralAdmissionError && error.code === 'ADMISSION_EFFECT_AMBIGUOUS',
  );

  const pkgAmb = await packageRuntime();
  pkgAmb.host.docs.failNextPutMatching('kpk01:effect-journal', { skip: 1 });
  await assert.rejects(
    () => pkgAmb.runtime.send(packageIntent({ amount: 42 })),
    (error) => error.name === 'CentralAdmissionError' && error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT',
  );
  await assert.rejects(
    () => pkgAmb.runtime.send(packageIntent({ amount: 42 })),
    (error) => error.name === 'CentralAdmissionError' && error.code === 'ADMISSION_EFFECT_AMBIGUOUS',
  );
  assert.equal(pkgAmb.host.resources.callCount(), 1);

  await writeEvidence('kpk14-differential-replay-unknown', {
    falsifier: 'KPK-14',
    replay: {
      original: { disposition: v07Replay.admitted.effects[0].disposition, toolCalls: v07.tools.calls.length },
      package: { disposition: pkgRetry.admitted.effects[0].disposition, resourceCalls: pkg.host.resources.callCount() },
    },
    unknownTaxonomy: {
      originalSeededAmbiguity: 'ADMISSION_EFFECT_AMBIGUOUS',
      packagePhysicalFaultPath: ['ADMISSION_EFFECT_JOURNAL_CONFLICT (uncertain)', 'ADMISSION_EFFECT_AMBIGUOUS (retry forbidden)'],
      dispatchCounts: { original: v07Amb.tools.calls.length, package: pkgAmb.host.resources.callCount() },
    },
  });
});

test('KPK-14: owner table — which side executed what (no Host proxy)', async () => {
  const pkg = await packageRuntime();
  const receipt = await pkg.runtime.send(packageIntent({ amount: 42 }));
  const mechanism = await pkg.runtime.query({ kind: 'mechanism' });
  const kernelPkgSha = (await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' }))
    .packages.find((p) => p.kind === 'kernel').moduleSha256;

  assert.equal(receipt.attribution.kernel.moduleSha256, kernelPkgSha);
  assert.equal(mechanism.moduleSha256, kernelPkgSha);
  assert.equal(mechanism.moduleId, 'kernel-vnext@1.1.0');

  await writeEvidence('kpk14-owner-table', {
    falsifier: 'KPK-14',
    ownerTable: [
      { concern: 'admission decision (schema→invariants→guard→transition)', owner: 'kernel-vnext@1.1.0 (migrated admitCentralDecision)', source: 'admission/admission.ts@v07 955ecf1f' },
      { concern: 'guard/hard-invariant predicate evaluation', owner: 'kernel-vnext@1.1.0 (migrated predicate engine)', source: 'workflow/predicate.ts@v07' },
      { concern: 'durable effect journal semantics', owner: 'kernel-vnext@1.1.0 (migrated begin/complete + KernelDurableEffectJournal)', source: 'admission/effect-journal.ts@v07 c6ae1f98' },
      { concern: 'state transition commit + revision discipline', owner: 'kernel-vnext@1.1.0 (migrated WorkflowInstanceEngine)', source: 'engine/workflow-instance-engine.ts@v07 10829999' },
      { concern: 'rule interpretation', owner: 'standard-sdk@1.0.0', source: 'new SDK package (no v0.7 owner existed at this seam)' },
      { concern: 'business policy (guards, effects, roles)', owner: 'business-order-approval@1.0.0', source: 'mirrors v0.7 admission golden fixtures' },
      { concern: 'raw durable storage / crypto / clock / physical resources', owner: 'Host ports', source: 'generic primitives only' },
      { concern: 'loading/wiring/UX transport', owner: 'Microkernel', source: 'no mechanism code (KPK-02)' },
    ],
    pinnedOriginalSources: {
      baseCommit: '3c71b9138056babfafbc7de1349b5924483f2203',
      versionV07: '86110c616b8cb18c730553e4cdab7ef555214521',
      admissionTsBlob: '955ecf1fcd9e7ceb4478e46a1c2f5f4d0266fa4e',
      admissionContractsBlob: '2b441f1fd4aaa5d0944131283de92153ae878a86',
      effectJournalBlob: 'c6ae1f98c1e0c0cb5582df16ff3075c93c1f5fc2',
      engineBlob: '108299995ba1b4be2366becd500fc1cd24d57c44',
      laneBlob: 'd5a94501648f547ef408870c16b0ce6297fc81b5',
      instanceRepoBlob: '3e2252967aea56d8ef698001f02dc301f4f5925d',
    },
    executingKernelModuleSha256: kernelPkgSha,
  });
});
