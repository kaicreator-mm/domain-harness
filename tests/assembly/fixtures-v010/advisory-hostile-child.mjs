/**
 * #1264 Follow-up 5 — hostile-result regression CHILD process.
 * =============================================================
 * Spawned by `v010-k-advisory-consultation.test.ts` as
 *   node --import tsx advisory-hostile-child.mjs <caseId> <hook>
 * (hook = 'budget' | 'observation'). Runs ONE hostile hook result through a
 * real buildV10App → activateV10App → facade.send with a process-level
 * unhandledRejection listener installed from the first line, asserts the
 * contract in-process, waits out any late async failure, and prints
 * `RESULT {json}` on stdout. Exit 0 = all in-child asserts held; the parent
 * re-asserts the parsed fields.
 *
 * Contract asserted here for every case:
 *  - send resolves 'admitted';
 *  - the receipt is deep-equal to the no-extension receipt for the SAME
 *    identity/clock seed (both runs use the SAME kernel bytes);
 *  - advisoryRejected is exactly the expected count for the case/hook;
 *  - no getter/accessor/then/Proxy-get flag ever fired;
 *  - no unhandledRejection, even for late-rejecting promises.
 */
import { setTimeout as delay } from 'node:timers/promises';

const [caseId, hook] = process.argv.slice(2);
const unhandled = [];
process.on('unhandledRejection', (reason, promise) => {
  unhandled.push(String(reason) + ' samePromise=' + String(promise === hostilePromiseRef));
});

const state = { thenTouches: 0, thenCalls: 0, getTraps: 0, constructorTouches: 0, speciesTouches: 0 };
let hostilePromiseRef = null;

const { buildV10App, activateV10App } = await import('../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js');
const { freshV10Counters } = await import('../../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js');
const { basicComposition, PlainCasDocStore, extensionEntry } = await import('../helpers-v010.js');

const cases = {
  'then-getter-throw': () => ({ get then() { state.thenTouches += 1; throw new Error('then getter fired'); } }),
  'then-getter-nonthrow': () => ({ get then() { state.thenTouches += 1; return undefined; } }),
  'then-getter-slow': () => ({
    get then() {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
      state.thenTouches += 1;
      throw new Error('slow then getter fired');
    },
  }),
  'promise-then-getter-late-reject': () => {
    // [F6] Own `then` accessor on a native Promise: never read, never
    // called; the promise RESOLVES late (a rejection would now be the
    // hook-owned undetached case).
    const promise = new Promise((resolve) => { setTimeout(() => resolve(true), 3000); });
    hostilePromiseRef = promise;
    globalThis.__hostileProbe = promise;
    Object.defineProperty(promise, 'then', {
      enumerable: true, configurable: true,
      get() { state.thenTouches += 1; throw new Error('own then getter on a native promise'); },
    });
    return promise;
  },
  'promise-constructor-accessor': () => {
    // [F6 case h] Own `constructor` accessor: the intrinsic-then fast path
    // is skipped (own keys non-empty) BEFORE any species lookup, so the
    // getter is never invoked. Resolves late on purpose.
    const promise = new Promise((resolve) => { setTimeout(() => resolve(true), 3000); });
    Object.defineProperty(promise, 'constructor', {
      enumerable: true, configurable: true,
      get() { state.constructorTouches += 1; return Promise; },
    });
    return promise;
  },
  'promise-subclass-species': () => {
    // [F6 case i] A Promise subclass whose species getter would run under a
    // naive intrinsic-then call; the exact-prototype precondition skips the
    // intrinsic call entirely, so the getter is never invoked. Resolves.
    class P extends Promise {
      static get [Symbol.species]() { state.speciesTouches += 1; return Promise; }
    }
    return P.resolve('ok');
  },
  'plain-promise-late-reject': () => {
    // [F6 case j] A PLAIN native Promise that rejects late: exact
    // prototype, no own keys — the intrinsic fast path attaches real noop
    // handlers, so no unhandledRejection ever fires.
    const promise = new Promise((_, reject) => { setTimeout(() => reject(new Error('plain native late rejection')), 3000); });
    return promise;
  },
  'then-data-function-derived': () => ({
    then() {
      state.thenCalls += 1;
      return new Promise((_, reject) => { setTimeout(() => reject(new Error('late rejection from then return')), 20); });
    },
  }),
  'proxy-array-get-trap': () => new Proxy([2, 2], {
    get(target, prop) { state.getTraps += 1; return Reflect.get(target, prop); },
  }),
  'dunder-nonenumerable': () => {
    const record = {};
    Object.defineProperty(record, '__proto__', { value: { maxSteps: 1 }, enumerable: false, configurable: true });
    return record;
  },
  'symbol-key': () => {
    const record = { maxSteps: 2 };
    record[Symbol('hidden')] = 1;
    return record;
  },
  'nested-array-nonenumerable-extra': () => ({
    maxSteps: Object.defineProperty([1], 'extra', { value: 1, enumerable: false }),
  }),
};

const hostile = cases[caseId]?.();
if (hostile === undefined) {
  console.error(`unknown case ${String(caseId)}`);
  process.exit(1);
}

const BASE_MS = Date.UTC(2026, 9, 22, 9, 0, 0);
// Each run gets its OWN seeded ticking clock so reference and hostile
// receipts carry identical timestamps.
const makeClock = () => {
  let tick = 0;
  return () => BASE_MS + (tick += 1) * 1000;
};
const INTENT = { intentType: 'submitQuoteDecisionDynamic', instanceKey: 'instance:hostile', messageId: 'msg:hostile', input: { amount: 30, requestId: 'R-hostile' } };
const TENANT = 'tenant:hostile-child';

function normalise(receipt) {
  return JSON.parse(JSON.stringify(receipt));
}

// Reference: the same turn on a no-extension composition, same clock seed.
const reference = await activateV10App(buildV10App(await basicComposition()), {
  store: new PlainCasDocStore(), tenantId: TENANT, now: makeClock(),
});
const referenceReceipt = normalise(await reference.facade.send({ ...INTENT }));
reference.dispose();

const counters = freshV10Counters();
const fixture = hook === 'budget'
  ? await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' })
  : await extensionEntry({ fixture: 'kext-advisory-beta-v1.mjs', hookExport: 'observeBeta' });
const activation = await activateV10App(buildV10App(await basicComposition({ extensions: [fixture] })), {
  store: new PlainCasDocStore(), tenantId: TENANT, now: makeClock(), counters,
});

if (hook === 'budget') {
  globalThis.__v010AlphaAdvicePlan = [{ advice: hostile }];
} else {
  globalThis.__v010BetaPlan = [{ garbage: hostile }];
}

const started = Date.now();
const receipt = normalise(await activation.facade.send({ ...INTENT }));
const elapsedMs = Date.now() - started;

const k = activation.facade.kCounters('business-order-approval@v08.1.0.0');
const result = {
  caseId,
  hook,
  status: receipt.status,
  receiptIdentical: JSON.stringify(receipt) === JSON.stringify(referenceReceipt),
  advisoryRejected: k.advisoryRejected,
  budgetAdviceConsultations: k.budgetAdviceConsultations,
  turnObservationConsultations: k.turnObservationConsultations,
  sinkCount: counters.advisoryObservations.length,
  elapsedMs,
  flags: { ...state },
  unhandled,
};
activation.dispose();

// Let any late async failure (80ms/20ms rejections) surface first.
await delay(3400);
result.unhandled = unhandled;

// Case expectations. Every case is refused and counted exactly once. The
// Proxy-array case is refused with ZERO get traps on both hooks: the budget
// hook refuses it as advice-shaped data, the observation hook refuses it by
// the plain-record rule (a top-level array was never an observation
// record) — either way strictly by the descriptor rules, never by reading
// a property.
const expectedRejected = 1;
const expectedSink = 0;

const failures = [];
if (result.status !== 'admitted') failures.push(`status ${result.status}`);
if (!result.receiptIdentical) failures.push('receipt differs from the no-extension receipt');
if (result.advisoryRejected !== expectedRejected) failures.push(`advisoryRejected ${result.advisoryRejected} != ${expectedRejected}`);
if (result.sinkCount !== expectedSink) failures.push(`sink ${result.sinkCount} != ${expectedSink}`);
if (result.flags.thenTouches !== 0) failures.push(`then getter touched ${result.flags.thenTouches}`);
if (result.flags.thenCalls !== 0) failures.push(`then called ${result.flags.thenCalls}`);
if (result.flags.getTraps !== 0) failures.push(`proxy get traps ${result.flags.getTraps}`);
if (caseId === 'then-getter-slow' && result.elapsedMs >= 250) failures.push(`send delayed by the slow getter: ${result.elapsedMs}ms`);
if (result.unhandled.length !== 0) failures.push(`unhandledRejection: ${result.unhandled.join(' | ')}`);
result.detachDebug = globalThis.__detachDebug ?? 'never-called';
result.failures = failures;

console.log(`RESULT ${JSON.stringify(result)}`);
process.exit(failures.length === 0 ? 0 : 1);
