/**
 * #1264 Follow-up 7 — hostile-result regression CHILD process (JSON-string
 * result ABI).
 * ================================================================
 * Spawned by `v010-k-advisory-consultation.test.ts` as
 *   node --import tsx advisory-hostile-child.mjs <caseId> <hook>
 * (hook = 'budget' | 'observation'). Runs ONE hostile hook result through a
 * real buildV10App → activateV10App → facade.send with a process-level
 * unhandledRejection listener installed from the first line, asserts the
 * contract in-process, waits out any late hook-owned async failure, and
 * prints `RESULT {json}` on stdout. Exit 0 = all in-child asserts held.
 *
 * ABI (owner decision): a hook result must be a JSON text string. The
 * Kernel's consumption is `typeof`, a pre-parse length bound and JSON.parse
 * — NOTHING else. For every non-string case the child asserts:
 *  - send resolves 'admitted' promptly;
 *  - advisoryRejected is exactly 1, sink empty;
 *  - the receipt is deep-equal to the no-extension receipt for the SAME
 *    identity/clock seed;
 *  - EVERY spy counter (then accessors, then calls, Proxy get traps,
 *    getPrototypeOf traps, ownKeys traps, descriptor traps, has traps,
 *    constructor/species getters) stayed at 0 — the Kernel executed no user
 *    code and ran no trap;
 *  - no crash. A later rejection produced by a refused Promise value is the
 *    HOOK'S OWN undetached rejection (documented contract): cases that
 *    reject late assert the captured unhandledRejection carries exactly the
 *    hook's own reason.
 */
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const [caseId, hook] = process.argv.slice(2);
const unhandled = [];
process.on('unhandledRejection', (reason) => { unhandled.push(String(reason)); });

const state = {
  thenTouches: 0, thenCalls: 0, getTraps: 0, prototypeTraps: 0, ownKeysTraps: 0,
  descriptorTraps: 0, hasTraps: 0, constructorTouches: 0, speciesTouches: 0,
};

const { buildV10App, activateV10App } = await import('../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js');
const { freshV10Counters } = await import('../../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js');
const { basicComposition, PlainCasDocStore, extensionEntry } = await import('../helpers-v010.js');

/** A Proxy whose reflective traps block forever (mutation canary). */
function infiniteTrapProxy() {
  const blockForever = () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
  return new Proxy({}, {
    getPrototypeOf: blockForever,
    ownKeys: blockForever,
    getOwnPropertyDescriptor: blockForever,
    get: (target, prop) => { state.getTraps += 1; blockForever(); return Reflect.get(target, prop); },
    has: () => { state.hasTraps += 1; return false; },
  });
}

const cases = {
  // --- non-string negatives: every spy must stay at 0 ---
  'then-getter-throw': () => ({ get then() { state.thenTouches += 1; throw new Error('then getter fired'); } }),
  'then-getter-nonthrow': () => ({ get then() { state.thenTouches += 1; return undefined; } }),
  'then-getter-slow': () => ({
    get then() {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
      state.thenTouches += 1;
      throw new Error('slow then getter fired');
    },
  }),
  'promise-then-getter-late-resolve': () => {
    const promise = new Promise((resolve) => { setTimeout(() => resolve(true), 1500); });
    Object.defineProperty(promise, 'then', {
      enumerable: true, configurable: true,
      get() { state.thenTouches += 1; throw new Error('own then getter on a native promise'); },
    });
    return promise;
  },
  'promise-constructor-accessor': () => {
    const promise = new Promise((resolve) => { setTimeout(() => resolve(true), 1500); });
    Object.defineProperty(promise, 'constructor', {
      enumerable: true, configurable: true,
      get() { state.constructorTouches += 1; return Promise; },
    });
    return promise;
  },
  'promise-subclass-species': () => {
    class P extends Promise {
      static get [Symbol.species]() { state.speciesTouches += 1; return Promise; }
    }
    return P.resolve('ok');
  },
  'promise-own-keys-data': () => {
    const promise = new Promise((resolve) => { setTimeout(() => resolve(true), 1500); });
    promise.tag = 'harmless own data key';
    return promise;
  },
  'cross-realm-promise': () => {
    return vm.runInNewContext('new Promise((resolve) => { resolve(true); })');
  },
  'string-object': () => new String('{"maxSteps":1}'),
  'function-value': () => function advisoryFn() { return '{"maxSteps":1}'; },
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
  'nested-slow-ownkeys-proxy': () => ({
    maxSteps: new Proxy([1], {
      ownKeys() {
        state.ownKeysTraps += 1;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
        throw new Error('slow nested ownKeys trap');
      },
    }),
  }),
  'later-rejecting-promise-then-spy': () => {
    // R3-F2 contract: a later-rejecting Promise with an own spy `then`.
    // The Kernel must attach nothing and call nothing; the rejection is the
    // hook's own (captured and asserted below).
    const promise = new Promise((_, reject) => { setTimeout(() => reject(new Error('hook-owned late rejection (then-spy)')), 300); });
    Object.defineProperty(promise, 'then', {
      enumerable: true, configurable: true,
      value() { state.thenCalls += 1; },
    });
    return promise;
  },
  'later-rejecting-promise-proxy': () => {
    // R3-F2 contract, Proxy-wrapped variant: get-trap counter must stay 0.
    const promise = new Promise((_, reject) => { setTimeout(() => reject(new Error('hook-owned late rejection (proxy)')), 300); });
    return new Proxy(promise, {
      get(target, prop) { state.getTraps += 1; return Reflect.get(target, prop); },
    });
  },
  'infinite-trap': infiniteTrapProxy,
  'frozen-promise-pre-hooks': () => {
    // R3-F1 regression: a frozen native Promise created BEFORE async_hooks
    // tracking is enabled. Under the old intrinsic-then fast path,
    // Promise.prototype.then made Node add an async id to the non-extensible
    // object and the process died inside the hook machinery. Under the
    // JSON-string ABI the Kernel must refuse it with typeof alone.
    const { createHook } = require('node:async_hooks');
    const frozen = Object.freeze(new Promise((resolve) => { setTimeout(() => resolve(true), 1500); }));
    const tracing = createHook({ init() { } });
    tracing.enable();
    return frozen;
  },
  'plain-promise-late-reject': () => {
    // R3-F2 contract (clean native variant): refused without attaching any
    // handler, so its later rejection is the HOOK'S OWN.
    const promise = new Promise((_, reject) => { setTimeout(() => reject(new Error('hook-owned late rejection (plain native)')), 300); });
    return promise;
  },
};

const hostile = (cases[caseId]?.() ?? (() => { throw new Error(`unknown case ${String(caseId)}`); })());
if (hostile === undefined) {
  console.error(`unknown case ${String(caseId)}`);
  process.exit(1);
}

const BASE_MS = Date.UTC(2026, 9, 22, 9, 0, 0);
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

// Let any late hook-owned rejection surface and CAPTURE it (the contract
// documents it as hook-owned; the child asserts the reason below).
await delay(1200);
result.unhandled = unhandled;

const failures = [];
if (result.status !== 'admitted') failures.push(`status ${result.status}`);
if (!result.receiptIdentical) failures.push('receipt differs from the no-extension receipt');
if (result.advisoryRejected !== 1) failures.push(`advisoryRejected ${result.advisoryRejected} != 1`);
if (result.sinkCount !== 0) failures.push(`sink ${result.sinkCount} != 0`);
for (const flag of ['thenTouches', 'thenCalls', 'getTraps', 'prototypeTraps', 'ownKeysTraps', 'descriptorTraps', 'hasTraps', 'constructorTouches', 'speciesTouches']) {
  if (result.flags[flag] !== 0) failures.push(`${flag} = ${String(result.flags[flag])} (Kernel ran user code / a trap)`);
}
if (caseId === 'then-getter-slow' && result.elapsedMs >= 250) failures.push(`send delayed by the slow getter: ${result.elapsedMs}ms`);
if (caseId === 'nested-slow-ownkeys-proxy' && result.elapsedMs >= 250) failures.push(`send delayed by the nested ownKeys trap: ${result.elapsedMs}ms`);
const hookOwnedCases = new Set([
  'later-rejecting-promise-then-spy',
  'later-rejecting-promise-proxy',
  'plain-promise-late-reject',
]);
if (hookOwnedCases.has(caseId)) {
  if (result.unhandled.length !== 1) failures.push(`expected exactly 1 hook-owned unhandledRejection, got ${String(result.unhandled.length)}`);
  else if (!result.unhandled[0].includes('hook-owned late rejection')) failures.push(`the unhandledRejection is not the hook's own reason: ${result.unhandled[0]}`);
} else if (result.unhandled.length !== 0) {
  failures.push(`unhandledRejection: ${result.unhandled.join(' | ')}`);
}
result.failures = failures;

console.log(`RESULT ${JSON.stringify(result)}`);
process.exit(failures.length === 0 ? 0 : 1);
