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
  const builtApp = buildV10App(await richComposition());
  const counters = freshV10Counters();
  const activation = await activateV10App(builtApp, {
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

    // The observation reached the activation observe sink as a separate
    // record carrying the COMPLETE L2 §C identity envelope (subject/tenant/
    // deployment/B/workflow/instance/turn) — Host-completed around the
    // Kernel-owned occurrence identity, separate from the redacted hook
    // projection above.
    assert.equal(counters.advisoryObservations.length, 1);
    const observation = counters.advisoryObservations[0] as Record<string, unknown>;
    assert.equal(observation.kind, 'advisory-observation');
    assert.equal(observation.hook, 'turn-observation/v1');
    assert.equal(observation.providerId, 'advisory-beta');
    const turn = observation.turn as Record<string, unknown>;
    assert.equal(turn.status, 'admitted');
    assert.equal(turn.intentType, INTENT.intentType);
    assert.equal(turn.workflowId, WORKFLOW_ID);
    const turnId = turn.turnId as string;
    assert.equal(typeof turnId, 'string');
    assert.deepEqual(observation.identity, {
      subjectDigest: builtApp.subjectDigest,
      appId: 'app:v010-t00-rich',
      tenantId: TENANT,
      deployedAppId: null, // assembly activations wire no deployment identity
      businessPackageId: BUSINESS_PACKAGE_ID,
      workflowId: WORKFLOW_ID,
      instanceKey: INTENT.instanceKey,
      turnId,
    });
    assert.ok(!('identity' in (globals.__v010BetaProjections?.[0] ?? {})), 'the hook never receives the identity envelope');
    assert.deepEqual(observation.observation, {
      providerId: 'advisory-beta',
      hook: 'turn-observation/v1',
      observed: { turnId, status: 'admitted' },
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

// ---------------------------------------------------------------------------
// Follow-up 2 (R1) — consultation stays synchronous: a thenable result is
// rejected outright, never awaited, and can never stall a lane, delay a
// decided receipt or surface as an unhandled rejection.
// ---------------------------------------------------------------------------

/** A promise that never settles (no timers, no I/O holding the loop). */
function neverSettling(): Promise<never> {
  return new Promise(() => { /* deliberately pending forever */ });
}

/** A promise that rejects asynchronously AFTER the turn has settled. */
function lateRejection(): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('late advisory rejection witness')), 20);
  });
}

/** Race a turn against a short timeout to prove prompt settlement. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} — did not settle within ${String(ms)}ms`)), ms);
  });
  timer?.unref();
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

test('N-KEXT-ASYNC-ADVICE: an async hook resolving VALID advice is rejected, counted and never applied', async () => {
  clearAdvisoryWitnesses();
  const business = await continuationBusiness();
  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' });
  const base = await basicComposition({ extensions: [alpha], routes: [MAIN_ROUTE, CONTINUATION_ROUTE] });
  const activation = await activateV10App(buildV10App({ ...base, modules: [...base.modules, business] }), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    advisoryGlobals().__v010AlphaAdvicePlan = [{ advice: Promise.resolve({ maxSteps: 1 }) }];
    const receipt = await continuationTurn(activation, 'async-1');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 3 },
      'the promise result (even resolving a valid ceiling) is never awaited or applied');
    const k = activation.facade.kCounters(CONTINUATION_BUSINESS_ID);
    assert.equal(k.budgetAdviceConsultations, 1);
    assert.equal(k.advisoryRejected, 1, 'the thenable result is counted as rejected');
    assert.equal(k.budgetAdviceClamps, 0, 'the async advice tightened nothing');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-PENDING-ADVICE: a never-settling advice promise cannot stall the lane', async () => {
  clearAdvisoryWitnesses();
  const business = await continuationBusiness();
  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' });
  const base = await basicComposition({ extensions: [alpha], routes: [MAIN_ROUTE, CONTINUATION_ROUTE] });
  const activation = await activateV10App(buildV10App({ ...base, modules: [...base.modules, business] }), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    advisoryGlobals().__v010AlphaAdvicePlan = [{ advice: neverSettling() }];
    const receipt = await withTimeout(continuationTurn(activation, 'pending-1'), 2_000, 'the turn with a pending advice promise');
    assert.equal(receipt.status, 'terminated', 'the turn completed promptly despite the pending hook promise');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 3 }, 'the unadvised budget bounded the turn');
    const k = activation.facade.kCounters(CONTINUATION_BUSINESS_ID);
    assert.equal(k.budgetAdviceConsultations, 1);
    assert.equal(k.advisoryRejected, 1);
    assert.equal(k.effectDispatches, 0);
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-PENDING-OBSERVATION: a never-settling observation promise cannot delay or change the decided receipt', async () => {
  clearAdvisoryWitnesses();
  // The no-extension reference receipt for the SAME turn/clock seed.
  const basic = await activateV10App(buildV10App(await basicComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now,
  });
  let reference: Record<string, unknown>;
  try {
    reference = await basic.facade.send({ ...INTENT, instanceKey: 'instance:pend-obs', messageId: 'msg:pend-obs' }) as Record<string, unknown>;
  } finally {
    basic.dispose();
  }

  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    advisoryGlobals().__v010AlphaAdvicePlan = [{ advice: {} }]; // valid, no tightening
    advisoryGlobals().__v010BetaPlan = [{ garbage: neverSettling() }];
    const receipt = await withTimeout(
      activation.facade.send({ ...INTENT, instanceKey: 'instance:pend-obs', messageId: 'msg:pend-obs' }) as Promise<Record<string, unknown>>,
      2_000, 'the send with a pending observation promise',
    );
    assert.equal(receipt.status, 'admitted');
    assert.deepEqual(receipt, reference, 'the decided receipt is returned promptly and unchanged');
    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(k.turnObservationConsultations, 1);
    assert.equal(k.advisoryRejected, 1, 'the pending observation promise is counted as rejected');
    assert.deepEqual(counters.advisoryObservations, [], 'nothing reached the sink');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-LATE-REJECT-THENABLE: a thenable that later rejects causes no unhandled rejection', async () => {
  clearAdvisoryWitnesses();
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    advisoryGlobals().__v010AlphaAdvicePlan = [{ advice: lateRejection() }];
    advisoryGlobals().__v010BetaPlan = [{ garbage: lateRejection() }];
    const first = await activation.facade.send({ ...INTENT, instanceKey: 'instance:late-1', messageId: 'msg:late-1' });
    assert.equal(first.status, 'admitted');
    const second = await activation.facade.send({ ...INTENT, instanceKey: 'instance:late-2', messageId: 'msg:late-2' });
    assert.equal(second.status, 'admitted');
    // Let the deferred rejections fire against the discarded thenables.
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    assert.deepEqual(unhandled, [], 'the Primary detached both discarded thenables');
    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.ok(k.advisoryRejected >= 2, `both thenables were counted (advisoryRejected=${String(k.advisoryRejected)})`);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

// ---------------------------------------------------------------------------
// Follow-up 2 (R2) — the work-unit bound exists only when a hardBudget is
// wired or advice tightens it; legacy wiring keeps pre-#1264 behavior.
// ---------------------------------------------------------------------------

const MANY_EFFECTS_BUSINESS_ID = 'business-many-effects@v010.1.0.0';
const MANY_EFFECTS_ROUTE = { intentId: 'submitManyEffects', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' };

async function manyEffectsBusiness(): Promise<V10ModuleInput> {
  return businessEntry(
    './fixtures-v010/business-many-effects-v1.mjs',
    MANY_EFFECTS_BUSINESS_ID,
    ['business:policy/1', 'intent:submitManyEffects'],
  );
}

test('P-KEXT-LEGACY-WORKUNITS: with NO wired hardBudget a 65-effect turn admits exactly as before #1264', async () => {
  clearAdvisoryWitnesses();
  const business = await manyEffectsBusiness();
  const base = await basicComposition({ routes: [MAIN_ROUTE, MANY_EFFECTS_ROUTE] });
  const built = buildV10App({ ...base, modules: [...base.modules, business] });
  // A malformed hardBudget record is omitted by the activation wiring — the
  // kernel then runs with no hardBudget, the legacy plain-v08-bridge shape.
  const legacyWiring = JSON.parse(JSON.stringify(built)) as typeof built;
  (legacyWiring as { hardBudget: unknown }).hardBudget = { broken: true };
  const activation = await activateV10App(legacyWiring, {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now,
  });
  try {
    const receipt = await activation.facade.send({
      intentType: 'submitManyEffects', instanceKey: 'instance:many-1', messageId: 'msg:many-1',
      input: { amount: 30 },
    });
    assert.equal(receipt.status, 'admitted', `65 effects must admit without a wired budget (${JSON.stringify(receipt).slice(0, 300)})`);
    const denial = receipt.denial as Record<string, unknown> | undefined;
    assert.notEqual(denial?.reason, 'admission-budget-exhausted', 'the turn was not denied for budget');
    const k = activation.facade.kCounters(MANY_EFFECTS_BUSINESS_ID);
    assert.equal(k.effectDispatches, 65, 'all 65 effect intents dispatched');
    assert.equal(k.journalBegins, 65);
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('P-KEXT-WIRED-WORKUNITS: with a wired hardBudget the same 65-effect turn is budget-denied', async () => {
  clearAdvisoryWitnesses();
  const business = await manyEffectsBusiness();
  const base = await basicComposition({ routes: [MAIN_ROUTE, MANY_EFFECTS_ROUTE] });
  const options: BuildV10AppOptions = {
    ...base,
    modules: [...base.modules, business],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 32 },
  };
  const activation = await activateV10App(buildV10App(options), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now,
  });
  try {
    const receipt = await activation.facade.send({
      intentType: 'submitManyEffects', instanceKey: 'instance:many-2', messageId: 'msg:many-2',
      input: { amount: 30 },
    });
    assert.equal(receipt.status, 'denied');
    const denial = receipt.denial as Record<string, unknown>;
    assert.equal(denial.reason, 'admission-budget-exhausted');
    assert.equal(denial.workUnits, 65);
    assert.equal(denial.maxWorkUnits, 32);
    const k = activation.facade.kCounters(MANY_EFFECTS_BUSINESS_ID);
    assert.equal(k.effectDispatches, 0, 'the wired bound denies with zero dispatches');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

// ---------------------------------------------------------------------------
// Follow-up 3 (F1) — the ENTIRE advisory-result handling is isolation-
// guarded: accessors, hostile Proxies and throwing `then` getters are
// dropped and counted without ever leaking into the Primary, and a
// post-disposition fault can never withhold an already-decided receipt.
// (Setups reused from the independent review probes, PR #1269.)
// ---------------------------------------------------------------------------

test('N-KEXT-F1-ADVICE-GETTER: a throwing advice getter is dropped and counted, never invoked', async () => {
  clearAdvisoryWitnesses();
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    advisoryGlobals().__v010AlphaAdvicePlan = [{ advice: { get maxSteps() { throw new Error('review: advice getter'); } } }];
    const receipt = await activation.facade.send({ ...INTENT });
    assert.equal(receipt.status, 'admitted', 'send must not throw from result inspection');
    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(k.advisoryRejected, 1, 'the accessor-carrying result is counted as rejected');
    assert.equal(k.budgetAdviceClamps, 0, 'the hostile advice tightened nothing');
    assert.equal(k.budgetAdviceConsultations, 1);
    assert.deepEqual(counters.advisoryObservations.map((entry) => (entry as { turn?: { status?: string } }).turn?.status), ['admitted']);
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-F1-OBS-THEN-GETTER: a throwing observation then getter cannot withhold a committed ACK', async () => {
  clearAdvisoryWitnesses();
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    advisoryGlobals().__v010BetaPlan = [{ garbage: { get then() { throw new Error('review: observation then getter'); } } }];
    const receipt = await activation.facade.send({ ...INTENT });
    assert.equal(receipt.status, 'admitted', 'the first ACK must not be withheld by a post-disposition fault');
    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(k.journalBegins, 1, 'the turn had durably committed before the fault');
    assert.equal(k.effectDispatches, 1);
    assert.equal(k.engineCommits, 1);
    assert.equal(k.advisoryRejected, 1, 'the hostile result is counted, not leaked');
    assert.deepEqual(counters.advisoryObservations, [], 'the hostile result never reached the sink');
    const retry = await activation.facade.send({ ...INTENT });
    assert.equal(retry.status, 'admitted');
    assert.equal(retry.idempotentReplay, true, 'the retry proves the first turn was durably committed');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-F1-OBS-PROXY-TRAP: a result whose prototype inspection throws is ignored and counted', async () => {
  clearAdvisoryWitnesses();
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    advisoryGlobals().__v010BetaPlan = [{ garbage: new Proxy({}, { getPrototypeOf() { throw new Error('review: prototype trap'); } }) }];
    const receipt = await activation.facade.send({ ...INTENT });
    assert.equal(receipt.status, 'admitted', 'send must not throw from the prototype classification');
    const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(k.advisoryRejected, 1);
    assert.deepEqual(counters.advisoryObservations, []);
    assert.equal(k.journalBegins, 1);
    assert.equal(k.effectDispatches, 1);
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

// ---------------------------------------------------------------------------
// Follow-up 3 (F2) — the observation envelope carries the complete L2 §C
// identity and is distinguishable per tenant and per Business; a replayed
// admitted message adds zero records.
// ---------------------------------------------------------------------------

test('N-KEXT-F2-TENANT-SCOPE: two deployment tenants of one App give distinguishable observation envelopes', async () => {
  clearAdvisoryWitnesses();
  const built = buildV10App(await richComposition());
  const counters = freshV10Counters();
  const store = new PlainCasDocStore();
  for (const tenantId of ['tenant:scope-a', 'tenant:scope-b']) {
    const deploymentIdentity = { deployedAppId: 'deployment:advisory-scope', tenantId, appId: built.appId };
    const activation = await activateV10App(built, { store, counters, tenantId, deploymentIdentity });
    try {
      const receipt = await activation.facade.send({ ...INTENT });
      assert.equal(receipt.status, 'admitted');
    } finally {
      activation.dispose();
    }
  }
  assert.equal(counters.advisoryObservations.length, 2);
  const first = counters.advisoryObservations[0] as Record<string, unknown>;
  const second = counters.advisoryObservations[1] as Record<string, unknown>;
  assert.notDeepEqual(first, second, 'different tenant envelopes must be distinguishable in the shared sink');
  assert.equal((first.identity as Record<string, unknown>).tenantId, 'tenant:scope-a');
  assert.equal((second.identity as Record<string, unknown>).tenantId, 'tenant:scope-b');
  assert.equal((first.identity as Record<string, unknown>).deployedAppId, 'deployment:advisory-scope');
  assert.equal((first.identity as Record<string, unknown>).subjectDigest, built.subjectDigest);
  assert.equal((first.identity as Record<string, unknown>).instanceKey, INTENT.instanceKey);
});

test('N-KEXT-F2-BUSINESS-SCOPE: the same occurrence identity under two Businesses stays attributable', async () => {
  clearAdvisoryWitnesses();
  const business = await dualEffectBusiness();
  const base = await basicComposition({ extensions: [], routes: [MAIN_ROUTE, DUAL_EFFECT_ROUTE] });
  const options: BuildV10AppOptions = { ...base, modules: [...base.modules, business] };
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(options), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    // No extensions here: exercise the identity attribution through the
    // kernel counter plane instead of the observation sink.
    const first = await activation.facade.send({
      ...INTENT, instanceKey: 'instance:shared-1', messageId: 'msg:shared-1',
    });
    const second = await activation.facade.send({
      intentType: 'submitDualEffect', instanceKey: 'instance:shared-1', messageId: 'msg:shared-1',
      input: { amount: 30 },
    });
    assert.equal(first.status, 'admitted');
    assert.equal(second.status, 'admitted');
    assert.ok(!('denial' in first) || first.denial === undefined);
    const main = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
    const dual = activation.facade.kCounters(DUAL_EFFECT_BUSINESS_ID);
    assert.equal(main.admissions, 1);
    assert.equal(dual.admissions, 1);
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }

  // The same shared-identity scenario over the observation sink, with the
  // observation hook selected: two Businesses, same workflow-independent
  // instance/message, each envelope names its OWN Business.
  const dualWithBetaBase = await richComposition({
    extensions: [await extensionEntry({ fixture: 'kext-advisory-beta-v1.mjs', hookExport: 'observeBeta' })],
    routes: [...(await richComposition()).routes, DUAL_EFFECT_ROUTE],
  });
  const richOptions: BuildV10AppOptions = { ...dualWithBetaBase, modules: [...dualWithBetaBase.modules, business] };
  const betaCounters = freshV10Counters();
  const richActivation = await activateV10App(buildV10App(richOptions), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters: betaCounters,
  });
  try {
    const first = await richActivation.facade.send({
      ...INTENT, instanceKey: 'instance:shared-2', messageId: 'msg:shared-2',
    });
    const second = await richActivation.facade.send({
      intentType: 'submitDualEffect', instanceKey: 'instance:shared-2', messageId: 'msg:shared-2',
      input: { amount: 30 },
    });
    assert.equal(first.status, 'admitted');
    assert.equal(second.status, 'admitted');
    assert.equal(betaCounters.advisoryObservations.length, 2);
    const firstIdentity = (betaCounters.advisoryObservations[0] as Record<string, unknown>).identity as Record<string, unknown>;
    const secondIdentity = (betaCounters.advisoryObservations[1] as Record<string, unknown>).identity as Record<string, unknown>;
    assert.equal(firstIdentity.businessPackageId, BUSINESS_PACKAGE_ID);
    assert.equal(secondIdentity.businessPackageId, DUAL_EFFECT_BUSINESS_ID);
    assert.notDeepEqual(firstIdentity, secondIdentity, 'same workflow-independent message under two Businesses is attributable');
    assert.equal(firstIdentity.instanceKey, 'instance:shared-2');
    assert.equal(secondIdentity.instanceKey, 'instance:shared-2');
  } finally {
    richActivation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-F2-REPLAY-ZERO: an admitted replay of the same message adds zero observation records', async () => {
  clearAdvisoryWitnesses();
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    const first = await activation.facade.send({ ...INTENT });
    assert.equal(first.status, 'admitted');
    assert.equal(counters.advisoryObservations.length, 1);
    const replay = await activation.facade.send({ ...INTENT });
    assert.equal(replay.status, 'admitted');
    assert.equal(replay.idempotentReplay, true);
    assert.equal(counters.advisoryObservations.length, 1, 'the admitted replay added zero records');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

// ---------------------------------------------------------------------------
// Follow-up 3 (F3) — the legacy (no hardBudget, no extensions) FR07 receipt
// stays byte-identical to the pre-#1264 base apart from the Kernel's own
// identity bytes (moduleSha256 and the governanceBindingDigest derived from
// it). (Setup reused from the independent review's legacy-continuation
// probe, PR #1269.)
// ---------------------------------------------------------------------------

test('P-KEXT-F3-LEGACY-CONTINUATION: base/head FR07 receipts without a budget differ only in kernel identity', async () => {
  const { execFileSync } = await import('node:child_process');
  const business = await continuationBusiness();
  const routes = [MAIN_ROUTE, CONTINUATION_ROUTE];
  const receipts: string[] = [];
  const payloadPath = '../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs';
  const headSource = await readFile(new URL(payloadPath, import.meta.url), 'utf8');
  const sources: [string, string][] = [
    ['base', execFileSync('git', ['show', '53bef03305da69a7a9a5931065b9150561605913:packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs'], { encoding: 'utf8' })],
    ['head', headSource],
  ];
  for (const [revision, kernelSource] of sources) {
    const base = await basicComposition({ routes });
    const options: BuildV10AppOptions = {
      ...base,
      modules: base.modules.map((entry) => entry.role === 'kernel-primary'
        ? { ...entry, moduleSource: kernelSource, moduleSha256: sha256HexSource(kernelSource) }
        : entry),
    };
    options.modules = [...options.modules, business];
    const built = buildV10App(options);
    // Explicit legacy wiring (no hardBudget reaches the kernel).
    const legacy = JSON.parse(JSON.stringify(built)) as typeof built;
    (legacy as { hardBudget: unknown }).hardBudget = { broken: true };
    const activation = await activateV10App(legacy, {
      store: new PlainCasDocStore(), tenantId: 'tenant:legacy-f3', now: tickingClock().now,
      modelPort: queryLoopModelPort,
    });
    try {
      const receipt = await continuationTurn(activation, 'legacy-f3');
      assert.equal(receipt.status, 'terminated');
      assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 3 });
      if (revision === 'HEAD') {
        const continuation = continuationBoundOf(receipt);
        assert.equal(continuation.turnMaxSteps, undefined, 'the legacy receipt carries no new budget diagnostic');
      }
      receipts.push(JSON.stringify(receipt, (key, value) => (key === 'moduleSha256' || key === 'governanceBindingDigest') ? '<kernel-identity>' : value));
    } finally {
      activation.dispose();
    }
  }
  assert.deepEqual(JSON.parse(receipts[1]!), JSON.parse(receipts[0]!), 'the legacy no-budget FR07 receipt drifted beyond kernel identity bytes');
});

// ---------------------------------------------------------------------------
// Follow-up 4 (controller review) — advisoryDataSnapshot defects:
// the array branch must read elements only through own data descriptors
// (never invoke an accessor's getter, never drop extra non-index own
// properties), and an own `__proto__` key must refuse the result instead of
// reshaping the snapshot's prototype.
// ---------------------------------------------------------------------------

test('N-KEXT-F4-ARRAY-GETTER: an accessor array element is refused and its getter is never invoked', async () => {
  clearAdvisoryWitnesses();
  let getterInvoked = false;
  const accessorArray = [2, 2];
  Object.defineProperty(accessorArray, '0', {
    enumerable: true,
    get() { getterInvoked = true; return 1; },
  });
  const extraKeyArray = [1];
  (extraKeyArray as unknown as Record<string, unknown>).extra = 1;

  const business = await continuationBusiness();
  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' });
  const base = await basicComposition({ extensions: [alpha], routes: [MAIN_ROUTE, CONTINUATION_ROUTE] });
  const activation = await activateV10App(buildV10App({ ...base, modules: [...base.modules, business] }), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    advisoryGlobals().__v010AlphaAdvicePlan = [{ advice: accessorArray }, { advice: extraKeyArray }];
    const receipt = await continuationTurn(activation, 'f4-arr-1');
    assert.equal(receipt.status, 'terminated');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 3 }, 'the hostile array advice was never applied');
    const second = await continuationTurn(activation, 'f4-arr-2');
    assert.equal(second.status, 'terminated');
    assert.equal(getterInvoked, false, 'the accessor element getter must never be invoked');
    const k = activation.facade.kCounters(CONTINUATION_BUSINESS_ID);
    assert.equal(k.advisoryRejected, 2, 'both hostile arrays are counted (accessor element, extra non-index own property)');
    assert.equal(k.budgetAdviceClamps, 0);

  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }

  // Observation side over a beta-wired activation: the same hostile arrays
  // are refused without getter invocation and nothing reaches the sink.
  const counters = freshV10Counters();
  const observed = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    advisoryGlobals().__v010BetaPlan = [{ garbage: accessorArray }, { garbage: extraKeyArray }];
    const first = await observed.facade.send({ ...INTENT, instanceKey: 'instance:f4-obs', messageId: 'msg:f4-obs' });
    assert.equal(first.status, 'admitted');
    const second = await observed.facade.send({ ...INTENT, instanceKey: 'instance:f4-obs2', messageId: 'msg:f4-obs2' });
    assert.equal(second.status, 'admitted');
    assert.equal(getterInvoked, false, 'the observation snapshot must not invoke the getter either');
    const kMain = observed.facade.kCounters(BUSINESS_PACKAGE_ID);
    assert.equal(kMain.advisoryRejected, 2);
    assert.equal(kMain.turnObservationConsultations, 2);
    assert.deepEqual(counters.advisoryObservations, [], 'neither hostile array reached the sink');
  } finally {
    observed.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-F4-DUNDER-PROTO-ADVICE: JSON-parsed __proto__ advice is refused and never applied through inheritance', async () => {
  clearAdvisoryWitnesses();
  const business = await continuationBusiness();
  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' });
  const base = await basicComposition({ extensions: [alpha], routes: [MAIN_ROUTE, CONTINUATION_ROUTE] });
  const activation = await activateV10App(buildV10App({ ...base, modules: [...base.modules, business] }), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, modelPort: queryLoopModelPort,
  });
  try {
    // JSON.parse materializes "__proto__" as an OWN key of the result.
    const dunder = JSON.parse('{"__proto__":{"maxSteps":1}}') as Record<string, unknown>;
    assert.ok(Object.hasOwn(dunder, '__proto__'), 'the probe requires an own __proto__ key');
    advisoryGlobals().__v010AlphaAdvicePlan = [{ advice: dunder }];
    const receipt = await continuationTurn(activation, 'f4-dunder-1');
    assert.deepEqual(receipt.terminal, { code: 'MAX_STEPS_EXHAUSTED', step: 3 }, 'the __proto__ advice never clamped the bound');
    const k = activation.facade.kCounters(CONTINUATION_BUSINESS_ID);
    assert.equal(k.advisoryRejected, 1, 'the __proto__-shaped result is refused');
    assert.equal(k.budgetAdviceClamps, 0, 'no inherited field was ever applied');
    assert.equal(k.budgetAdviceConsultations, 1);
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

test('N-KEXT-F4-DUNDER-PROTO-OBS: an own __proto__ observation key is refused and reshapes nothing', async () => {
  clearAdvisoryWitnesses();
  const counters = freshV10Counters();
  const activation = await activateV10App(buildV10App(await richComposition()), {
    store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters,
  });
  try {
    const dunder = JSON.parse('{"__proto__":{"injected":true}}') as Record<string, unknown>;
    advisoryGlobals().__v010BetaPlan = [{ garbage: dunder }];
    const first = await activation.facade.send({ ...INTENT, instanceKey: 'instance:f4-p1', messageId: 'msg:f4-p1' });
    assert.equal(first.status, 'admitted');
    assert.deepEqual(counters.advisoryObservations, [], 'the __proto__-shaped observation never reached the sink');
    assert.equal(activation.facade.kCounters(BUSINESS_PACKAGE_ID).advisoryRejected, 1);

    // A subsequent benign observation still arrives as an ordinary plain
    // record — the hostile result reshaped nothing anywhere.
    const second = await activation.facade.send({ ...INTENT, instanceKey: 'instance:f4-p2', messageId: 'msg:f4-p2' });
    assert.equal(second.status, 'admitted');
    assert.equal(counters.advisoryObservations.length, 1);
    const delivered = counters.advisoryObservations[0] as Record<string, unknown>;
    assert.equal(Object.getPrototypeOf(delivered), Object.prototype, 'the sink record is an ordinary object');
    assert.equal(delivered.observation !== null && typeof delivered.observation === 'object', true);
    assert.equal(Object.getPrototypeOf(delivered.observation), Object.prototype, 'no prototype change anywhere in the snapshot');
  } finally {
    activation.dispose();
    clearAdvisoryWitnesses();
  }
});

// ---------------------------------------------------------------------------
// Follow-up 5 (independent re-review R2-F1/R2-F2) — the result inspection
// performs NO [[Get]] on a hook result and never calls user code: native
// Promises are classified/detached through the INTRINSIC
// Promise.prototype.then (brand check, real noop handlers), everything else
// is consumed only through Reflect.ownKeys + own property DESCRIPTORS
// (Symbol keys, non-enumerable keys, accessors, own __proto__, exotic array
// shapes all refuse). Regressions run EVERY case on BOTH hooks through a
// real facade.send inside a CHILD process with a process-level
// unhandledRejection listener (setups reused from the independent r2
// review probes, PR #1269).
// ---------------------------------------------------------------------------

const R2_CASES = [
  'then-getter-throw',
  'then-getter-nonthrow',
  'then-getter-slow',
  'promise-then-getter-late-reject',
  'then-data-function-derived',
  'proxy-array-get-trap',
  'dunder-nonenumerable',
  'symbol-key',
  'nested-array-nonenumerable-extra',
] as const;

test('N-KEXT-R2-HOSTILE-MATRIX: no [[Get]], no user calls, no unhandledRejection, receipts identical (both hooks)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const childPath = fileURLToPath(new URL('./fixtures-v010/advisory-hostile-child.mjs', import.meta.url));
  for (const hook of ['budget', 'observation'] as const) {
    for (const caseId of R2_CASES) {
      const run = spawnSync(process.execPath, ['--import', 'tsx', childPath, caseId, hook], {
        encoding: 'utf8', timeout: 60_000,
      });
      const resultLine = (run.stdout ?? '').split('\n').find((line) => line.startsWith('RESULT '));
      assert.ok(run.status === 0, `${hook}/${caseId} child exit ${String(run.status)}: ${((run.stderr ?? '').slice(0, 400) || resultLine || '')}`);
      assert.ok(resultLine !== undefined, `${hook}/${caseId} printed no RESULT line`);
      const result = JSON.parse(resultLine.slice('RESULT '.length)) as {
        status: string; receiptIdentical: boolean; advisoryRejected: number;
        sinkCount: number; elapsedMs: number; flags: Record<string, number>;
        unhandled: string[]; failures: string[];
      };
      assert.deepEqual(result.failures, [], `${hook}/${caseId} failures: ${JSON.stringify(result)}`);
      assert.equal(result.status, 'admitted');
      assert.equal(result.receiptIdentical, true, `${hook}/${caseId}: the receipt must equal the no-extension receipt`);
      assert.equal(result.advisoryRejected, 1);
      assert.equal(result.sinkCount, 0);
      assert.equal(result.flags.thenTouches, 0);
      assert.equal(result.flags.thenCalls, 0);
      assert.equal(result.flags.getTraps, 0);
      assert.deepEqual(result.unhandled, []);
      if (caseId === 'then-getter-slow') {
        assert.ok(result.elapsedMs < 250, `${hook}/${caseId}: send must not be delayed by the never-invoked slow getter (${String(result.elapsedMs)}ms)`);
      }
    }
  }
});
