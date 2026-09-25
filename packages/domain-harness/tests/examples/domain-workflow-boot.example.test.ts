// T-025 example 1 — Domain Workflow-facing boot over the v0.3 assembly.
//
// What a consumer does here, end to end:
//   1. BUILD TIME (offline): produce the Target Compiled Domain Package —
//      `buildCompiledPackage()` stands in for the compiler/toolchain;
//   2. STARTUP: consume the compiled artifact through `createDomainRuntimeV3`
//      with the required authority ports (volatile here — see support.ts);
//   3. pin one workflow instance to its exact execution authority
//      (package + CDI digest + Governance Baseline);
//   4. drive authoritative Domain Workflow turns: structured decision in,
//      schema check, pinned Hard Invariants, current guard, transition,
//      durable effect — with evidence captured automatically.
//
// Everything durable-looking is in-memory (support.ts); no durability claim is
// made or implied. Product vocabulary only: Domain Workflow / Domain Event /
// guard / transition — engine internals are not part of the public surface.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MemoryGovernanceBaselineStore,
  StaticPackageRegistry,
  VolatileAdmissionEffectJournal,
  VolatileRuntimeEvidenceStore,
  createDomainRuntimeV3,
  createGovernanceBaselineBody,
  type CentralAdmissionRequest,
  type DomainHardInvariantPredicate,
  type DomainWorkflowDefinition,
  type JsonValue,
} from '@kaicreator/domain-harness';
import {
  VolatileActivationAuthority,
  VolatileDurableExecutionStore,
  VolatileExactPackageCdiAuthority,
  VolatileEffectTools,
  VolatileRuntimeStore,
  buildCompiledPackage,
  exampleHostBindings,
  exampleSha256,
} from './support.js';

const DOMAIN_ID = 'orders';
const WORKFLOW_ID = 'order-quote';
const INSTANCE_KEY = 'instance:42';
const WORKFLOW_INSTANCE_ID = `${WORKFLOW_ID}:${INSTANCE_KEY}`;
const NOW = '2026-09-22T00:00:00.000Z';

/** Governance Hard Invariant: no quote above 100 may be admitted. */
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
} satisfies DomainHardInvariantPredicate;

function orderBaseline(version: string) {
  return createGovernanceBaselineBody({
    domainId: DOMAIN_ID,
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version,
    semantics: { hardInvariants: [CAP_INVARIANT], operatorAuthority: version },
  }, exampleSha256);
}

/** The order-quote Domain Workflow in product terms. */
function orderQuoteDefinition(): DomainWorkflowDefinition {
  return {
    workflowKey: WORKFLOW_ID,
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
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'approved',
            guardId: 'guard:amount-ok',
            effectIntents: [
              {
                effectType: 'effect:reserve',
                input: { reservation: 'quote', amount: 42 },
                idempotencyKey: 'reserve:quote:1',
              },
            ],
          },
          {
            transitionKey: 'reject',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'rejected',
          },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
    ],
  };
}

const quoteDecisionSchema = {
  isValid(value: JsonValue): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const decision = record['decision'];
    const event = record['event'];
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
    return typeof (decision as Record<string, unknown>)['outcome'] === 'string'
      && typeof (event as Record<string, unknown>)['type'] === 'string';
  },
};

function quoteTurn(amount: number): CentralAdmissionRequest {
  return {
    target: { workflowId: WORKFLOW_ID, instanceKey: INSTANCE_KEY },
    turn: { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition: orderQuoteDefinition(),
    currentStateKey: 'review',
    context: {},
    event: { type: 'QUOTE_DECIDED', payload: { amount } },
    resolved: {
      source: 'harness-machine',
      structuredDecision: {
        decision: { outcome: 'approve', data: { amount } },
        event: { type: 'QUOTE_DECIDED', payload: { amount } },
      },
      provenance: {},
      freshModelCallCount: 1,
      llmAvoided: false,
      cacheDisposition: { read: 'disabled' },
      telemetry: [],
    },
    decisionSchema: quoteDecisionSchema,
    now: NOW,
  };
}

async function boot() {
  // STARTUP consumes the compiled package artifact — no raw sources, no compile.
  const compiledPackage = await buildCompiledPackage();
  const baseline = await orderBaseline('B1');
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(baseline);
  const durableExecution = new VolatileDurableExecutionStore();
  const evidence = new VolatileRuntimeEvidenceStore();
  const effectJournal = new VolatileAdmissionEffectJournal();
  const effectTools = new VolatileEffectTools({ 'effect:reserve': 'non-idempotent' });

  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store: new VolatileRuntimeStore(),
    bindings: exampleHostBindings(),
    v3: {
      baselines,
      activationAuthority: new VolatileActivationAuthority(),
      exactPackageCdi: new VolatileExactPackageCdiAuthority(),
      durableExecution,
      effectJournal,
      effectTools,
      evidence,
    },
  });
  return { assembly, baseline, compiledPackage, durableExecution, effectJournal, effectTools, evidence };
}

async function pinOrderInstance(booted: Awaited<ReturnType<typeof boot>>): Promise<void> {
  await booted.assembly.governance.pinExecution({
    workflowTarget: WORKFLOW_ID,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: DOMAIN_ID,
      packageId: booted.compiledPackage.manifest.packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: booted.baseline.identity,
    },
  });
}

test('example: a Domain App boots one runtime over the compiled package and opens an instance', async () => {
  const booted = await boot();
  const { runtime } = booted.assembly;

  // The ONE retained runtime surface: no second control-flow runtime exists.
  const snapshot = await runtime.openInstance({
    address: { workflowId: WORKFLOW_ID, instanceKey: INSTANCE_KEY },
    correlationId: 'correlation:quote:1',
    input: {},
  });
  assert.equal(snapshot.packageId, booted.compiledPackage.manifest.packageId);
  assert.equal(snapshot.lifecycle, 'waiting');

  await pinOrderInstance(booted);
  const pin = await booted.assembly.governance.requirePinnedExecution(WORKFLOW_INSTANCE_ID);
  assert.equal(pin.packageId, booted.compiledPackage.manifest.packageId);
  assert.deepEqual(pin.governanceBaseline, booted.baseline.identity);
});

test('example: an admitted turn flows decision -> schema -> Hard Invariant -> guard -> transition -> durable effect', async () => {
  const booted = await boot();
  await pinOrderInstance(booted);

  const outcome = await booted.assembly.admitTurn(quoteTurn(42));
  if (outcome.status !== 'admitted') assert.fail('expected admitted outcome');
  assert.equal(outcome.admitted.targetState, 'approved');
  assert.equal(outcome.admitted.effects.length, 1);
  assert.equal(outcome.admitted.effects[0]!.disposition, 'executed');

  // The business mutation ran only through the durable effect authority.
  assert.equal(booted.effectJournal.getRecords().length, 1);

  // Decision evidence was captured with exact provenance — not as replay truth.
  const records = booted.evidence.records();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.sourceKind, 'decision');
  assert.equal(records[0]!.durability, 'durable-audit');
  assert.equal(records[0]!.provenance.packageId, booted.compiledPackage.manifest.packageId);
  assert.deepEqual(records[0]!.provenance.governanceBaseline, booted.baseline.identity);
});

test('example: a quote above the pinned Hard Invariant cap is denied and no effect runs', async () => {
  const booted = await boot();
  await pinOrderInstance(booted);

  const outcome = await booted.assembly.admitTurn(quoteTurn(5000));
  if (outcome.status !== 'denied') assert.fail('expected denied outcome');
  assert.equal(outcome.denial.reason, 'hard-invariant');
  assert.equal(outcome.denial.invariantId, 'inv:cap-100');
  assert.equal(booted.effectJournal.getRecords().length, 0, 'denied turns never reach the effect path');

  const records = booted.evidence.records();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0]!.payload, {
    status: 'denied',
    reason: 'hard-invariant',
    invariantId: 'inv:cap-100',
    resolver: 'harness-machine',
  });
});

test('example: admission without the exact execution pin fails closed instead of fabricating provenance', async () => {
  const booted = await boot();
  await assert.rejects(
    () => booted.assembly.admitTurn(quoteTurn(42)),
    (error: unknown) => error instanceof Error && error.name === 'GovernanceExecutionBindingError',
  );
  assert.equal(booted.evidence.records().length, 0);
});
