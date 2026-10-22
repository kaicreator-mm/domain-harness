/**
 * #1264 — K Primary turn-time advisory consultation over the REAL selected
 * payload bytes (PRD PC-03/PC-05/PC-07/PC-08, L2 §C advisory replay rule).
 * ========================================================================
 *
 * The selected Kernel Primary is the only authority: it consults the CLOSED
 * advisory hook set (`admission-budget-advice/v1` pre-admission,
 * `turn-observation/v1` post-disposition) through the scoped H→K hook table
 * activation wires from the selected extensions. This suite proves, from the
 * real `facade.send` path:
 *
 *  P — both hooks invoked (counters + observation sink); honored advice
 *      observably bounds a multi-step FR07 continuation turn (maxSteps) and
 *      a two-effect turn (maxWorkUnits); advice beyond the Kernel hard limit
 *      is clamped and never loosens; the BUILD `hardBudget` is a real
 *      Kernel-enforced bound (stricter of Kernel constant and BUILD).
 *  N — malformed / non-integer / ≤0 / oversize / authority-field /
 *      throwing / non-record advice is ignored and counted
 *      (`advisoryRejected`), with receipts identical to the no-extension
 *      receipt for the same turns; a throwing/garbage observation never
 *      changes the receipt or the sink; a replayed identical message
 *      consults ZERO hooks (L2 §C replay rule); Tiny/Basic consults
 *      nothing; an unknown hook key is a BUILD rejection
 *      (V10_ADVISORY_HOOK_UNKNOWN) and the activation refuses one again
 *      against the Kernel's own closed set.
 *
 * Not claimed here: hostile-JS isolation (same-realm trusted JS), physical
 * SQLite two-process truth (K01/K02/T11) and hidden validation.
 */
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import { freshV10Counters } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';
import {
  V10ActivationError,
  V10_KERNEL_ADVISORY_HOOKS,
  V10BuildError,
  activateV10App,
  buildV10App,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { BuildV10AppOptions, V10ModuleInput } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import {
  BUSINESS_PACKAGE_ID,
  INTENT,
  PlainCasDocStore,
  basicComposition,
  extensionEntry,
  richComposition,
  sha256HexSource,
} from './helpers-v010.js';

const ALPHA = 'kext-advisory-alpha@v010.1.0.0';
const CONTINUATION_BUSINESS_ID = 'business-model-continuation@v08.1.0.0';
const DUAL_EFFECT_BUSINESS_ID = 'business-dual-effect@v010.1.0.0';
const WORKFLOW_ID = 'order-quote';
const TENANT = 'tenant:v010-advisory';
const BASE_MS = Date.UTC(2026, 9, 21, 9, 0, 0);
const MAIN_ROUTE = { intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' };

function tickingClock(): { now: () => number } {
  let tick = 0;
  return { now: (): number => BASE_MS + (tick += 1) * 1000 };
}

function activationCode(error: unknown): string {
  assert.ok(error instanceof V10ActivationError, `expected V10ActivationError, got ${String(error)}`);
  return error.code;
}

function buildCode(error: unknown): string {
  assert.ok(error instanceof V10BuildError, `expected V10BuildError, got ${String(error)}`);
  return error.code;
}

interface AdvisoryGlobals {
  __v010AlphaAdvicePlan?: { advice?: unknown; throw?: boolean }[];
  __v010AlphaProposals?: unknown[];
  __v010BetaPlan?: { garbage?: unknown; throw?: boolean }[];
  __v010BetaProjections?: unknown[];
}

function advisoryGlobals(): AdvisoryGlobals {
  return globalThis as unknown as AdvisoryGlobals;
}

function clearAdvisoryWitnesses(): void {
  const globals = advisoryGlobals();
  delete globals.__v010AlphaAdvicePlan;
  delete globals.__v010AlphaProposals;
  delete globals.__v010BetaPlan;
  delete globals.__v010BetaProjections;
}

/** BUILD module entry for one Business package carried by sealed bytes. */
async function businessEntry(path: string, packageId: string, provides: readonly string[]): Promise<V10ModuleInput> {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return {
    packageId,
    role: 'business',
    abiVersion: 'v08-business-abi/1',
    moduleSource: source,
    moduleSha256: sha256HexSource(source),
    endpoint: 'business-policy',
    dependencies: [],
    provides: [...provides],
    requires: [],
  } as unknown as V10ModuleInput;
}

/** The K-owned FR07 continuation harness Business (harness rule, maxSteps 3). */
async function continuationBusiness(): Promise<V10ModuleInput> {
  return businessEntry(
    '../../packages/domain-harness/tests/v08-integration/fixtures/business-model-continuation.mjs',
    CONTINUATION_BUSINESS_ID,
    ['business:policy/1', 'intent:submitContinuationQuote'],
  );
}

/** The two-effect Business fixture (#1264): one approve transition, 2 effects. */
async function dualEffectBusiness(): Promise<V10ModuleInput> {
  return businessEntry(
    './fixtures-v010/business-dual-effect-v1.mjs',
    DUAL_EFFECT_BUSINESS_ID,
    ['business:policy/1', 'intent:submitDualEffect'],
  );
}

const CONTINUATION_ROUTE = { intentId: 'submitContinuationQuote', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' };
const DUAL_EFFECT_ROUTE = { intentId: 'submitDualEffect', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' };

/** A Host ModelPort whose model never converges: every step is a read query. */
const queryLoopModelPort = {
  invoke: async (): Promise<unknown> =>
    ({ kind: 'query', call: { capabilityId: 'quote.readCustomer', input: {} } }),
};

/** Basic core + one extra sealed Business package (+ its route). */
async function compositionWithBusiness(entry: V10ModuleInput, route: { intentId: string; operationId: string; capabilityId: string; handlerId: string }): Promise<BuildV10AppOptions> {
  const base = await basicComposition({ routes: [MAIN_ROUTE, route] });
  return { ...base, modules: [...base.modules, entry] };
}

function continuationTurn(activation: Awaited<ReturnType<typeof activateV10App>>, tag: string): Promise<Record<string, unknown>> {
  return activation.facade.send({
    intentType: 'submitContinuationQuote', instanceKey: `instance:${tag}`, messageId: `msg:${tag}`,
    input: { amount: 30, requestId: `R-${tag}` },
  }) as Promise<Record<string, unknown>>;
}

function continuationBoundOf(receipt: Record<string, unknown>): Record<string, unknown> {
  return ((receipt.resolver as { continuation: Record<string, unknown> }).continuation);
}

test('P-KEXT-CONSULT: a real facade.send consults budget advice pre-admission and delivers the post-disposition observation to the sink', async () => {
  clearAdvisoryWitnesses();
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    const receipt = await activation.facade.send({ ...INTENT });
    assert.equal(receipt.status, 'admitted', `turn must be admitted (${JSON.stringify(receipt).slice(0, 300)})`);
    assert.ok(!('advisory' in receipt) && !('budget' in receipt), 'the receipt carries no advisory/budget fields');

    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(k.budgetAdviceConsultations, 1, 'the budget-advice hook ran exactly once, pre-admission');
    assert.equal(k.budgetAdviceClamps, 1, 'the fixture default advice {maxSteps:2} tightened the limit');
    assert.equal(k.turnObservationConsultations, 1, 'the observation hook ran exactly once, post-disposition');
    assert.equal(k.advisoryRejected, 0);

    // The proposal the Kernel actually handed the hook: frozen, redacted
    // (intentType + workflowId + the Kernel's OWN effective limits only).
    const globals = advisoryGlobals();
    const proposals = globals.__v010AlphaProposals ?? [];
    assert.equal(proposals.length, 1);
    const proposal = proposals[0] as Record<string, unknown>;
    assert.deepEqual(proposal, {
      hook: 'admission-budget-advice/v1',
      intentType: INTENT.intentType,
      workflowId: WORKFLOW_ID,
      hardLimits: { maxSteps: 8, maxWorkUnits: 64 },
    });
    assert.ok(Object.isFrozen(proposal) && Object.isFrozen(proposal.hardLimits), 'the proposal is frozen');
    assert.ok(!('instanceKey' in proposal) && !('input' in proposal) && !('caller' in proposal), 'no instance/input/caller data leaves the Kernel');

    // The observation reached the activation observe sink as a separate record.
    assert.equal(counters.advisoryObservations.length, 1);
    const observation = counters.advisoryObservations[0] as Record<string, unknown>;
    assert.equal(observation.kind, 'advisory-observation');
    assert.equal(observation.hook, 'turn-observation/v1');
    assert.equal(observation.providerId, 'advisory-beta');
    const turn = observation.turn as Record<string, unknown>;
    assert.equal(turn.status, 'admitted');
    assert.equal(turn.intentType, INTENT.intentType);
    assert.equal(turn.workflowId, WORKFLOW_ID);
    assert.equal(typeof turn.turnId, 'string');
    assert.deepEqual(observation.observation, {
      providerId: 'advisory-beta',
      hook: 'turn-observation/v1',
      observed: { turnId: turn.turnId, status: 'admitted' },
    });

    // The projection beta actually received: exactly the public identity set.
    const projections = globals.__v010BetaProjections ?? [];
    assert.equal(projections.length, 1);
    assert.deepEqual(Object.keys(projections[0] as Record<string, unknown>).sort(),
      ['hook', 'intentType', 'status', 'turnId', 'workflowId']);
    assert.ok(Object.isFrozen(projections[0]), 'the observation projection is frozen');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('P-KEXT-BUDGET-TIGHTENS: honored advice observably bounds a multi-step FR07 continuation turn', async () => {
  clearAdvisoryWitnesses();
  const business = await continuationBusiness();

  // Control: no extensions — the policy's own maxSteps (3) is the bound.
  const control = await activateV10App(buildV10App(await compositionWithBusiness(business, CONTINUATION_ROUTE)), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    const receipt = await continuationTurn(control, 'ctrl-1');
    assert.equal(receipt.status, 'terminated');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 3 });
    const continuation = continuationBoundOf(receipt);
    assert.equal(continuation.maxSteps, 3, 'the sealed policy bound is unchanged without extensions');
    assert.equal(continuation.turnMaxSteps, 3, 'the Kernel hard limit (8) does not tighten the policy bound');
  } finally {
    control.dispose();
  }

  // With the alpha extension advising {maxSteps: 2}: the SAME turn stops at 2.
  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' });
  const base = await basicComposition({ extensions: [alpha], routes: [MAIN_ROUTE, CONTINUATION_ROUTE] });
  const advisedOptions: BuildV10AppOptions = { ...base, modules: [...base.modules, business] };
  advisoryGlobals().__v010AlphaAdvicePlan = [];
  const advised = await activateV10App(buildV10App(advisedOptions), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    const receipt = await continuationTurn(advised, 'tight-1');
    assert.equal(receipt.status, 'terminated');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 2 }, 'the honored advice tightened the multi-step turn from 3 to 2');
    const continuation = continuationBoundOf(receipt);
    assert.equal(continuation.maxSteps, 3, 'the sealed policy declaration is never rewritten');
    assert.equal(continuation.turnMaxSteps, 2, 'the per-turn budget carries the tightened bound');
    const k = advised.facade.kCounters(CONTINUATION_BUSINESS_ID);
    assert.equal(k.budgetAdviceConsultations, 1);
    assert.equal(k.budgetAdviceClamps, 1);
    assert.equal(k.effectDispatches, 0, 'a pre-admission terminal dispatches zero effects');
  } finally {
    advised.dispose();
    clearAdvisoryWitnesses();
  }
});

test('P-KEXT-CLAMP-NO-LOOSEN: advice beyond the hard limit is clamped; the BUILD hardBudget is a real Kernel bound', async () => {
  clearAdvisoryWitnesses();
  const business = await continuationBusiness();
  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' });
  const globals = advisoryGlobals();

  // (a) Advice of 100 against the Kernel's own 8: min() clamps to the policy
  // bound 3 — no loosening, and no tightening either (clamps stay 0).
  const looseBase = await basicComposition({ extensions: [alpha], routes: [MAIN_ROUTE, CONTINUATION_ROUTE] });
  const loose = await activateV10App(buildV10App({ ...looseBase, modules: [...looseBase.modules, business] }), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    globals.__v010AlphaAdvicePlan = [{ advice: { maxSteps: 100 } }];
    const receipt = await continuationTurn(loose, 'loose-1');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 3 }, 'oversized advice never loosens the bound');
    assert.equal(continuationBoundOf(receipt).turnMaxSteps, 3);
    const k = loose.facade.kCounters(CONTINUATION_BUSINESS_ID);
    assert.equal(k.budgetAdviceClamps, 0, 'advice at-or-above the effective limit tightens nothing');
    assert.equal(k.budgetAdviceConsultations, 1);
    assert.equal(k.advisoryRejected, 0);
  } finally {
    loose.dispose();
    clearAdvisoryWitnesses();
  }

  // (b) BUILD hardBudget {maxStepsPerTurn: 2} with NO advice: the Kernel's
  // effective limit is the stricter of Kernel 8 and BUILD 2 — enforced.
  const tightBase = await compositionWithBusiness(business, CONTINUATION_ROUTE);
  const tight = await activateV10App(buildV10App({
    ...tightBase, hardBudget: { maxStepsPerTurn: 2, maxWorkUnitsPerTurn: 64 },
  }), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    const receipt = await continuationTurn(tight, 'tight-b-1');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 2 }, 'the BUILD hardBudget is enforced by the Kernel itself');
    assert.equal(continuationBoundOf(receipt).turnMaxSteps, 2);
    assert.equal(tight.facade.kCounters(CONTINUATION_BUSINESS_ID).budgetAdviceConsultations, 0, 'no extension selected, zero consultations');
  } finally {
    tight.dispose();
  }

  // (c) BUILD 2 + advice 100: the advice cannot loosen the BUILD bound.
  const clampedBase = await basicComposition({ extensions: [alpha], routes: [MAIN_ROUTE, CONTINUATION_ROUTE] });
  const clamped = await activateV10App(buildV10App({
    ...clampedBase,
    modules: [...clampedBase.modules, business],
    hardBudget: { maxStepsPerTurn: 2, maxWorkUnitsPerTurn: 64 },
  }), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    globals.__v010AlphaAdvicePlan = [{ advice: { maxSteps: 100 } }];
    const receipt = await continuationTurn(clamped, 'tight-c-1');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 2 }, 'min(BUILD, advice) — advice larger than the hard limit is clamped');
    assert.equal(continuationBoundOf(receipt).turnMaxSteps, 2);
  } finally {
    clamped.dispose();
    clearAdvisoryWitnesses();
  }
});

test('P-KEXT-WORKUNITS: honored advice bounds effect work units before any dispatch', async () => {
  clearAdvisoryWitnesses();
  const business = await dualEffectBusiness();
  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' });
  const base = await basicComposition({ extensions: [alpha], routes: [MAIN_ROUTE, DUAL_EFFECT_ROUTE] });
  const options: BuildV10AppOptions = { ...base, modules: [...base.modules, business] };
  const globals = advisoryGlobals();
  globals.__v010AlphaAdvicePlan = [{ advice: { maxWorkUnits: 1 } }];
  const activation = await activateV10App(buildV10App(options), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now,
  });
  try {
    const denied = await activation.facade.send({
      intentType: 'submitDualEffect', instanceKey: 'instance:wu-1', messageId: 'msg:wu-1',
      input: { amount: 30 },
    });
    assert.equal(denied.status, 'denied');
    const denial = denied.denial as Record<string, unknown>;
    assert.equal(denial.reason, 'admission-budget-exhausted');
    assert.equal(denial.workUnits, 2);
    assert.equal(denial.maxWorkUnits, 1);
    const k = activation.facade.kCounters(DUAL_EFFECT_BUSINESS_ID);
    assert.equal(k.effectDispatches, 0, 'the budget denial dispatches zero effects');
    assert.equal(k.journalBegins, 0, 'the budget denial begins zero journal records');
    assert.equal(k.budgetAdviceClamps, 1);
    assert.equal(k.advisoryRejected, 0);

    // Advice of exactly the required work units admits both dispatches.
    globals.__v010AlphaAdvicePlan = [{ advice: { maxWorkUnits: 2 } }];
    const admitted = await activation.facade.send({
      intentType: 'submitDualEffect', instanceKey: 'instance:wu-2', messageId: 'msg:wu-2',
      input: { amount: 30 },
    });
    assert.equal(admitted.status, 'admitted', `two work units must admit (${JSON.stringify(admitted).slice(0, 300)})`);
    assert.equal(activation.facade.kCounters(DUAL_EFFECT_BUSINESS_ID).effectDispatches, 2);
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-REPLAY: a replayed identical message consults zero hooks (L2 §C replay rule)', async () => {
  clearAdvisoryWitnesses();
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    const first = await activation.facade.send({ ...INTENT });
    assert.equal(first.status, 'admitted');
    const kAfterFirst = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(kAfterFirst.budgetAdviceConsultations, 1);
    assert.equal(kAfterFirst.turnObservationConsultations, 1);

    const retry = await activation.facade.send({ ...INTENT });
    assert.equal(retry.status, 'admitted');
    assert.equal(retry.idempotentReplay, true, 'the identical resend must reach the real K idempotent replay');
    const kAfterRetry = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(kAfterRetry.budgetAdviceConsultations, 1, 'the replay consulted zero budget hooks');
    assert.equal(kAfterRetry.turnObservationConsultations, 1, 'the replay consulted zero observation hooks');
    assert.equal(kAfterRetry.advisoryRejected, 0);
    assert.equal(counters.advisoryObservations.length, 1, 'no new observation was delivered for the replay');
    assert.equal(kAfterRetry.journalBegins, 1);
    assert.equal(kAfterRetry.effectDispatches, 1);
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-ADVICE-REJECTED: hostile advice is ignored+counted and the receipts stay identical to the no-extension receipts', async () => {
  clearAdvisoryWitnesses();
  const hostiles: { advice?: unknown; throw?: boolean }[] = [
    { advice: null },                                     // non-record
    { advice: -5 },                                       // ≤0
    { advice: 2.5 },                                      // non-integer
    { advice: '9' },                                      // non-number
    { advice: { maxSteps: 3, permit: true } },            // smuggled authority field
    { advice: { maxSteps: 3, commit: 1 } },               // smuggled authority field
    { advice: { status: 'ok', maxSteps: 3 } },            // smuggled authority field
    { throw: true },                                      // hook throws
    { advice: { maxSteps: 1_000_000_001 } },              // oversize
    { advice: [] },                                       // array, not a plain record
  ];

  // The no-extension reference: SAME clock seed, SAME store semantics.
  const basicReceipts: Record<string, unknown>[] = [];
  const basic = await activateV10App(buildV10App(await basicComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now,
  });
  try {
    for (let index = 1; index <= hostiles.length; index += 1) {
      const receipt = await basic.facade.send({
        ...INTENT, instanceKey: `instance:ref-${index}`, messageId: `msg:ref-${index}`,
      });
      basicReceipts.push(receipt as Record<string, unknown>);
    }
  } finally {
    basic.dispose();
  }

  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    // The fixture consumes the plan with shift(); capture the count first.
    const hostileTurnCount = hostiles.length;
    advisoryGlobals().__v010AlphaAdvicePlan = hostiles;
    const hostileReceipts: Record<string, unknown>[] = [];
    for (let index = 1; index <= hostileTurnCount; index += 1) {
      const receipt = await activation.facade.send({
        ...INTENT, instanceKey: `instance:ref-${index}`, messageId: `msg:ref-${index}`,
      });
      assert.equal(receipt.status, 'admitted', `hostile advice must not break turn ${index}`);
      hostileReceipts.push(receipt as Record<string, unknown>);
    }
    assert.deepEqual(hostileReceipts, basicReceipts, 'every receipt is identical to the no-extension receipt for the same turn');
    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(k.budgetAdviceConsultations, hostileTurnCount);
    assert.equal(k.advisoryRejected, hostileTurnCount, 'every hostile advice is counted, none applied');
    assert.equal(k.budgetAdviceClamps, 0, 'no hostile advice tightened anything');
    assert.equal(counters.advisoryObservations.length, hostileTurnCount, 'the observation hook still runs normally');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-OBSERVATION-ISOLATED: a throwing/garbage observation never changes the receipt or the sink', async () => {
  clearAdvisoryWitnesses();
  const faults: { garbage?: unknown; throw?: boolean }[] = [{ throw: true }, { garbage: 42 }, { garbage: 'nope' }];

  const basicReceipts: Record<string, unknown>[] = [];
  const basic = await activateV10App(buildV10App(await basicComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now,
  });
  try {
    for (let index = 1; index <= faults.length; index += 1) {
      const receipt = await basic.facade.send({
        ...INTENT, instanceKey: `instance:iso-${index}`, messageId: `msg:iso-${index}`,
      });
      basicReceipts.push(receipt as Record<string, unknown>);
    }
  } finally {
    basic.dispose();
  }

  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    // The fixture consumes the plan with shift(); capture the count first.
    const faultTurnCount = faults.length;
    advisoryGlobals().__v010BetaPlan = faults;
    for (let index = 1; index <= faultTurnCount; index += 1) {
      const receipt = await activation.facade.send({
        ...INTENT, instanceKey: `instance:iso-${index}`, messageId: `msg:iso-${index}`,
      });
      assert.equal(receipt.status, 'admitted', `a faulty observation hook must not break turn ${index}`);
      assert.deepEqual(receipt, basicReceipts[index - 1], 'the faulty observation changed nothing in the receipt');
    }
    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(k.turnObservationConsultations, faultTurnCount);
    assert.equal(k.advisoryRejected, faultTurnCount, 'every faulty observation is isolated and counted');
    assert.deepEqual(counters.advisoryObservations, [], 'no faulty observation reached the sink');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-BASIC-ZERO: Tiny/Basic runs zero consultations and unchanged receipts', async () => {
  clearAdvisoryWitnesses();
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await basicComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    const receipt = await activation.facade.send({ ...INTENT });
    assert.equal(receipt.status, 'admitted');
    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(k.budgetAdviceConsultations, 0);
    assert.equal(k.budgetAdviceClamps, 0);
    assert.equal(k.turnObservationConsultations, 0);
    assert.equal(k.advisoryRejected, 0);
    assert.deepEqual(counters.advisoryObservations, []);
    assert.ok(!('advisory' in receipt) && !('budget' in receipt));
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-BUILD-UNKNOWN-HOOK: a hook key outside the Kernel closed set is a BUILD rejection', async () => {
  const entry = await extensionEntry({
    fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha', hook: 'kext:not-in-closed-set/v1',
  });
  const options = await basicComposition({ extensions: [entry] });
  assert.throws(() => buildV10App(options), (error: unknown) => buildCode(error) === 'V10_ADVISORY_HOOK_UNKNOWN');
});

test('N-KEXT-ACTIVATION-CLOSED-SET: activation refuses an extension outside the Kernel\'s own exported set', async () => {
  const app = buildV10App(await richComposition());
  const tampered = JSON.parse(JSON.stringify(app)) as typeof app;
  for (const module of tampered.modules) {
    if (module.role === 'kernel-extension' && module.packageId === ALPHA) {
      (module as { provides: string[] }).provides = ['kext:post-seal-unknown/v1'];
    }
  }
  await assert.rejects(
    activateV10App(tampered, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now }),
    (error: unknown) => activationCode(error) === 'V10_ADVISORY_HOOK_UNKNOWN',
  );
});

test('P-KEXT-CLOSED-SET-PARITY: the compiler constant mirrors the selected Kernel payload export exactly', async () => {
  const kernelUrl = new URL(
    '../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs',
    import.meta.url,
  ).href;
  const kernel = (await import(kernelUrl)) as { ADVISORY_HOOKS: readonly string[]; MAX_FR07_STEPS: number; MAX_TURN_WORK_UNITS: number };
  assert.deepEqual([...kernel.ADVISORY_HOOKS], [...V10_KERNEL_ADVISORY_HOOKS],
    'the BUILD closed set must stay byte-identical to the Kernel\'s declared ADVISORY_HOOKS');
  assert.equal(kernel.MAX_TURN_WORK_UNITS, 64);
  assert.equal(kernel.MAX_FR07_STEPS, 8);
  assert.ok(Object.isFrozen(kernel.ADVISORY_HOOKS));
});

test('N-KEXT-NO-MODELPORT: without a Host ModelPort a harness turn refuses typed (the wiring is additive)', async () => {
  clearAdvisoryWitnesses();
  const business = await continuationBusiness();
  const activation = await activateV10App(buildV10App(await compositionWithBusiness(business, CONTINUATION_ROUTE)), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now,
  });
  try {
    await assert.rejects(
      continuationTurn(activation, 'noport-1'),
      (error: unknown) => (error as { code?: string }).code === 'CONTINUATION_STEP_ENDPOINT_UNAVAILABLE',
    );
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});
