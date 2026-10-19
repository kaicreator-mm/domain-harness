/**
 * C01 (#1177) — the selected K→C external Effect Operation contract over a
 * REAL T00-built and activated App, shared by TWO unrelated adapters.
 * ===========================================================================
 *
 * The physical restart / two-process / SQLite-K-store proofs live in
 * `tests/hosts/node/v010-c01-external-effect-physical.test.ts`; THIS file
 * proves the contract semantics end-to-end through the real composition
 * (public intent → Kernel admission → journal → LIVE K-issued effect permit
 * → the trusted Host gate → the sealed adapter → the honest phase envelope):
 *
 *   P-JOB-LIVE-PERMIT   job adapter submits under a live permit; accepted is
 *                       honest and never terminal; status walks running →
 *                       terminal; reconcile reports standing truth.
 *   P-NOTIFY-TERMINAL   the UNRELATED notify provider delivers terminal on
 *                       the SAME contract.
 *   N-UNPERMITTED       a Business handler reaching the external capability
 *                       from a NON-external binding (no K permit) is
 *                       typed-refused; the adapter physically dispatched 0.
 *   N-CROSS-CAPABILITY  a live permit for extnotify never authorizes extjob:
 *                       typed scope refusal, zero extjob dispatch.
 *   N-EXPIRED           a short-TTL permit on a stepping clock is expired at
 *                       gate time: typed refusal, zero dispatch.
 *   N-ACCEPT-NOT-DONE   an accepted-only provider ACK on an await:terminal
 *                       binding fails closed — pending is never success.
 *   N-LOST-ACK-UNKNOWN  an ambiguous permit consume after the adapter landed
 *                       surfaces as the Kernel's honest UNKNOWN; the job
 *                       stands at the provider; no blind retry dispatches.
 *   N-REPLAY            a same-messageId replay answers from the K02
 *                       original receipt with zero new dispatch; changed
 *                       input is a typed conflict.
 *   N-GATE-DIRECT       replaying a settled turn's permit claim against the
 *                       gate directly is refused (consumed permit / foreign
 *                       tenant docs namespace) with the invoker untouched.
 *   P-KEYSPACE          every K document stays under v10/k/** — the adapters
 *                       never write the Kernel's namespace.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  V10_TARGET_PROFILE,
  activateV10App,
  buildV10App,
  dispatchThroughExternalEffectGate,
  freshV10Counters,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { createV10DocsPort } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';
import type { V10ModuleInput } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { PlainCasDocStore, sha256HexSource } from './helpers-v010.js';
import * as extjobConsole from './fixtures-v010/capability-extjob-runx-v1.mjs';
import * as extnotifyConsole from './fixtures-v010/capability-extnotify-provider-v1.mjs';

const KERNEL_PACKAGE_ID = 'v08-kernel-mechanism@v0.10.0';
const STANDARD_PACKAGE_ID = 'standard-sdk@v08.1.0.0';
const BUSINESS_ID = 'business-external-jobs@v010.1.0.0';
const EXTJOB_ID = 'capability-extjob-runx@v010.1.0.0';
const EXTNOTIFY_ID = 'capability-extnotify-provider@v010.1.0.0';
const TENANT = 'tenant:v010-c01';

const BASE_MS = Date.UTC(2026, 9, 19, 11, 0, 0);

function controlledClock(): { now: () => number; advance(ms: number): void } {
  let current = BASE_MS;
  return { now: (): number => current, advance: (ms: number): void => { current += ms; } };
}

/** A clock that steps +1000ms on EVERY read (the expiry witness). */
function steppingClock(): { now: () => number } {
  let current = BASE_MS;
  return { now: (): number => { current += 1000; return current; } };
}

async function pinAdapterStores(): Promise<{ jobPath: string; notifyPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-c01-asm-'));
  const jobPath = join(dir, 'extjob.sqlite');
  const notifyPath = join(dir, 'extnotify.sqlite');
  (globalThis as { __c01JobStorePath?: string }).__c01JobStorePath = jobPath;
  (globalThis as { __c01NotifyStorePath?: string }).__c01NotifyStorePath = notifyPath;
  return { jobPath, notifyPath };
}

function clearPins(): void {
  delete (globalThis as { __c01JobStorePath?: string }).__c01JobStorePath;
  delete (globalThis as { __c01NotifyStorePath?: string }).__c01NotifyStorePath;
  delete (globalThis as { __c01JobFaults?: string }).__c01JobFaults;
  delete (globalThis as { __c01NotifyMode?: string }).__c01NotifyMode;
}

async function standardBundle(): Promise<string> {
  const [sdk, router] = await Promise.all([
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url), 'utf8'),
  ]);
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
// v0.10 C01 BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
}

async function c01Modules(): Promise<V10ModuleInput[]> {
  const [kernel, sdk, business, extjob, extnotify] = await Promise.all([
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    standardBundle(),
    readFile(new URL('./fixtures-v010/business-external-jobs-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./fixtures-v010/capability-extjob-runx-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./fixtures-v010/capability-extnotify-provider-v1.mjs', import.meta.url), 'utf8'),
  ]);
  return [
    {
      packageId: KERNEL_PACKAGE_ID, role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel, moduleSha256: sha256HexSource(kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: STANDARD_PACKAGE_ID, role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: sdk, moduleSha256: sha256HexSource(sdk),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    {
      packageId: BUSINESS_ID, role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: business, moduleSha256: sha256HexSource(business),
      endpoint: 'business-policy', dependencies: [],
      provides: [
        'business:policy/1', 'intent:submitExternalJob', 'intent:checkExternalJob', 'intent:reconcileExternalJob',
        'intent:sendNotification', 'intent:submitUnpermittedJobProbe', 'intent:submitCrossCapabilityProbe', 'intent:submitExpiringJob',
      ], requires: [],
    },
    {
      packageId: EXTJOB_ID, role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: extjob, moduleSha256: sha256HexSource(extjob),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:extjob/1'], requires: [],
      externalImports: { node: [], npm: [], native: ['better-sqlite3'] },
      capabilityId: 'extjob',
      externalEffect: true,
      handlers: [
        { operationId: 'job.submit', handler: 'jobSubmit' },
        { operationId: 'job.status', handler: 'jobStatus' },
        { operationId: 'job.reconcile', handler: 'jobReconcile' },
      ],
    },
    {
      packageId: EXTNOTIFY_ID, role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: extnotify, moduleSha256: sha256HexSource(extnotify),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:extnotify/1'], requires: [],
      externalImports: { node: [], npm: [], native: ['better-sqlite3'] },
      capabilityId: 'extnotify',
      externalEffect: true,
      handlers: [
        { operationId: 'notify.send', handler: 'notifySend' },
        { operationId: 'notify.status', handler: 'notifyStatus' },
      ],
    },
  ];
}

const ROUTES = [
  { intentId: 'submitExternalJob', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' },
  { intentId: 'submitExpiringJob', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' },
  { intentId: 'checkExternalJob', operationId: 'job.status', capabilityId: 'extjob', handlerId: 'jobStatus' },
  { intentId: 'reconcileExternalJob', operationId: 'job.reconcile', capabilityId: 'extjob', handlerId: 'jobReconcile' },
  { intentId: 'sendNotification', operationId: 'notify.send', capabilityId: 'extnotify', handlerId: 'notifySend' },
  { intentId: 'submitUnpermittedJobProbe', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' },
  { intentId: 'submitCrossCapabilityProbe', operationId: 'notify.send', capabilityId: 'extnotify', handlerId: 'notifySend' },
];

async function buildC01App() {
  return buildV10App({
    appId: 'app:v010-c01-external-effects',
    audience: 'aud:v010-c01',
    targetProfile: V10_TARGET_PROFILE,
    modules: await c01Modules(),
    routes: ROUTES,
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 'c01-external-effect',
  });
}

interface SendSpec {
  readonly intentType: string;
  readonly messageId: string;
  readonly input: Record<string, unknown>;
}

/** The rule projection requires every declared field present (absent ⇒ null). */
function fullInput(input: Record<string, unknown>): Record<string, unknown> {
  return {
    requestId: input.requestId ?? null,
    jobSpec: input.jobSpec ?? null,
    jobId: input.jobId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    channel: input.channel ?? null,
    message: input.message ?? null,
  };
}

function send(spec: SendSpec): { intentType: string; instanceKey: string; messageId: string; input: Record<string, unknown> } {
  // One Kernel instance per message: an honestly-failed effect turn holds its
  // instance's admission fence fail-closed (K01), and the NEXT verification
  // turn must never be blocked by it (same discipline as the T04 slice).
  return { intentType: spec.intentType, instanceKey: `instance:c01-${spec.messageId}`, messageId: spec.messageId, input: fullInput(spec.input) };
}

interface EffectOutcome {
  readonly effectId?: string;
  readonly disposition?: string;
  readonly output?: unknown;
}

function firstEffect(receipt: Record<string, unknown>): EffectOutcome {
  assert.equal(receipt.status, 'admitted', `receipt must be admitted: ${JSON.stringify(receipt).slice(0, 400)}`);
  const admitted = receipt.admitted as { effects?: EffectOutcome[] } | undefined;
  const effect = admitted?.effects?.[0];
  assert.ok(effect !== undefined, 'the admitted receipt carries at least one effect outcome');
  assert.equal(effect.disposition, 'executed');
  return effect;
}

function effectFailureCode(error: unknown): string {
  assert.ok(error instanceof Error, `expected Error, got ${String(error)}`);
  assert.equal((error as { code?: string }).code, 'ADMISSION_EFFECT_FAILED', `unexpected failure: ${String(error)}`);
  return error.message;
}

/** A K store wrapper that fails ONE permit-consume write (the lost-ACK fault). */
class ConsumeFaultStore extends PlainCasDocStore {
  #armed: boolean;
  constructor() {
    super();
    this.#armed = true;
  }
  override async put(key: string, value: unknown, condition: import('../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js').V10DocWriteCondition): Promise<{ revision: number }> {
    const record = value as { state?: unknown } | null;
    if (this.#armed && key.includes('effect-permit') && record !== null && typeof record === 'object' && record.state === 'consumed') {
      this.#armed = false;
      throw Object.assign(new Error(`injected CAS conflict on permit consume for ${key}`), { code: 'HOST_CAS_CONFLICT' });
    }
    return await super.put(key, value, condition);
  }
}

test('P-JOB-LIVE-PERMIT: job submit/status/reconcile walk the honest phase envelope under a live K-issued permit', async () => {
  await pinAdapterStores();
  const clock = controlledClock();
  try {
    const counters = freshV10Counters();
    const kStore = new PlainCasDocStore();
    const app = await buildC01App();
    const activation = await activateV10App(app, { store: kStore, tenantId: TENANT, now: clock.now, counters });

    // submit → accepted (never terminal), one mint+consume, one dispatch
    const submitted = await activation.facade.send(send({
      intentType: 'submitExternalJob', messageId: 'msg:job-1',
      input: { requestId: 'R-1', jobSpec: { kind: 'export', rows: 10 } },
    }));
    assert.deepEqual(
      firstEffect(submitted).output,
      { phase: 'accepted', externalRef: 'job:R-1' },
      'the submission effect completes honestly with the ACCEPTED phase envelope',
    );
    const kc = activation.facade.kCounters(BUSINESS_ID);
    assert.equal(kc.effectPermitsMinted, 1, 'the kernel minted exactly one live permit');
    assert.equal(kc.effectPermitsConsumed, 1, 'the kernel consumed the permit at settle time');
    assert.equal(counters.externalEffectDispatches, 1, 'the gate dispatched exactly once');
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1, 'the adapter physically dispatched once');
    assert.equal(extjobConsole.jobByKey('R-1').phase, 'queued', 'the provider durably holds the job as queued');

    // status → running, then terminal (accepted/running are never terminal)
    const running = await activation.facade.send(send({
      intentType: 'checkExternalJob', messageId: 'msg:job-1-status-1', input: { requestId: 'R-1', jobId: 'job:R-1' },
    }));
    assert.deepEqual(firstEffect(running).output, { phase: 'running', externalRef: 'job:R-1' });
    const done = await activation.facade.send(send({
      intentType: 'checkExternalJob', messageId: 'msg:job-1-status-2', input: { requestId: 'R-1', jobId: 'job:R-1' },
    }));
    const doneEnvelope = firstEffect(done).output as { phase: string; outcome: { ok: boolean } };
    assert.equal(doneEnvelope.phase, 'terminal');
    assert.equal(doneEnvelope.outcome.ok, true);

    // reconcile by idempotency key reports the standing terminal truth
    const reconciled = await activation.facade.send(send({
      intentType: 'reconcileExternalJob', messageId: 'msg:job-1-recon', input: { requestId: 'R-1', idempotencyKey: 'job:R-1' },
    }));
    assert.equal((firstEffect(reconciled).output as { phase: string }).phase, 'terminal');

    // Every K document stays in the Kernel's namespace
    assert.ok(kStore.keys().every((key) => key.startsWith('v10/k/')), 'adapters never write the K docs namespace');

    activation.dispose();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('P-NOTIFY-TERMINAL: the unrelated notify provider completes terminally on the SAME contract', async () => {
  await pinAdapterStores();
  const clock = controlledClock();
  try {
    const counters = freshV10Counters();
    const activation = await activateV10App(await buildC01App(), { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now, counters });

    const delivered = await activation.facade.send(send({
      intentType: 'sendNotification', messageId: 'msg:notify-1',
      input: { requestId: 'N-1', channel: 'channel:ops', message: 'build finished' },
    }));
    const envelope = firstEffect(delivered).output as { phase: string; externalRef: string; outcome: { ok: boolean; output: { deliveredTo: string } } };
    assert.equal(envelope.phase, 'terminal');
    assert.equal(envelope.externalRef, 'delivery:N-1');
    assert.equal(envelope.outcome.ok, true);
    assert.equal(envelope.outcome.output.deliveredTo, 'channel:ops');
    assert.equal(counters.externalEffectDispatches, 1);
    assert.equal(extnotifyConsole.dispatchCounts()['notify.send'], 1);
    assert.equal(extnotifyConsole.deliveryByKey('N-1').phase, 'terminal');

    activation.dispose();
  } finally {
    clearPins();
    extnotifyConsole.shutdown();
  }
});

test('N-UNPERMITTED: a non-external binding reaching the external capability is typed-refused with ZERO adapter dispatch', async () => {
  await pinAdapterStores();
  const clock = controlledClock();
  try {
    const counters = freshV10Counters();
    const activation = await activateV10App(await buildC01App(), { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now, counters });

    await assert.rejects(
      activation.facade.send(send({
        intentType: 'submitUnpermittedJobProbe', messageId: 'msg:probe-1',
        input: { requestId: 'R-PROBE', jobSpec: { kind: 'probe' } },
      })),
      (error: unknown) => {
        assert.match(effectFailureCode(error), /V10_EFFECT_PERMIT_REQUIRED/);
        return true;
      },
    );
    assert.equal(extjobConsole.dispatchCounts()['job.submit'] ?? 0, 0, 'the adapter physically dispatched zero submits');
    assert.equal(extjobConsole.jobByKey('R-PROBE'), undefined, 'no job row exists for the probe');
    assert.equal(counters.externalEffectDispatches, 0, 'the gate never dispatched');
    assert.equal(counters.externalEffectRefusals, 1, 'the gate refused typed exactly once');

    activation.dispose();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('N-CROSS-CAPABILITY: a live extnotify permit never authorizes extjob — typed scope refusal, zero extjob dispatch', async () => {
  await pinAdapterStores();
  const clock = controlledClock();
  try {
    const activation = await activateV10App(await buildC01App(), { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now });

    await assert.rejects(
      activation.facade.send(send({
        intentType: 'submitCrossCapabilityProbe', messageId: 'msg:probe-2',
        input: { requestId: 'R-CROSS', jobSpec: { kind: 'cross' } },
      })),
      (error: unknown) => {
        assert.match(effectFailureCode(error), /V10_EFFECT_PERMIT_SCOPE/);
        return true;
      },
    );
    assert.equal(extjobConsole.dispatchCounts()['job.submit'] ?? 0, 0, 'extjob dispatched zero submits');
    assert.equal(extjobConsole.jobByKey('R-CROSS'), undefined);
    assert.equal(extnotifyConsole.dispatchCounts()['notify.send'] ?? 0, 0, 'extnotify dispatched zero sends (its handler targeted extjob)');

    activation.dispose();
  } finally {
    clearPins();
    extjobConsole.shutdown();
    extnotifyConsole.shutdown();
  }
});

test('N-EXPIRED: a short-TTL permit on a stepping clock is expired at gate time — typed refusal, zero dispatch', async () => {
  await pinAdapterStores();
  const clock = steppingClock();
  try {
    const activation = await activateV10App(await buildC01App(), { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now });

    await assert.rejects(
      activation.facade.send(send({
        intentType: 'submitExpiringJob', messageId: 'msg:probe-3',
        input: { requestId: 'R-EXP', jobSpec: { kind: 'expiring' } },
      })),
      (error: unknown) => {
        assert.match(effectFailureCode(error), /V10_EFFECT_PERMIT_EXPIRED/);
        return true;
      },
    );
    assert.equal(extjobConsole.dispatchCounts()['job.submit'] ?? 0, 0, 'expired live authority dispatched nothing');
    assert.equal(extjobConsole.jobByKey('R-EXP'), undefined);

    activation.dispose();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('N-ACCEPT-NOT-DONE: an accepted-only provider ACK on an await:terminal binding fails closed — pending is never success', async () => {
  await pinAdapterStores();
  const clock = controlledClock();
  try {
    (globalThis as { __c01NotifyMode?: string }).__c01NotifyMode = 'accept-only';
    const activation = await activateV10App(await buildC01App(), { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now });

    await assert.rejects(
      activation.facade.send(send({
        intentType: 'sendNotification', messageId: 'msg:notify-accept-only',
        input: { requestId: 'N-ACCEPT', channel: 'channel:slow', message: 'queued only' },
      })),
      (error: unknown) => {
        assert.match(effectFailureCode(error), /V10_EXTERNAL_PENDING/);
        return true;
      },
    );
    // The provider honestly holds a QUEUED delivery; no terminal was invented.
    const row = extnotifyConsole.deliveryByKey('N-ACCEPT');
    assert.equal(row.phase, 'queued', 'the provider keeps the honest accepted state — never a fabricated terminal');
    assert.equal(extnotifyConsole.dispatchCounts()['notify.send'], 1);

    activation.dispose();
  } finally {
    clearPins();
    extnotifyConsole.shutdown();
  }
});

test('N-LOST-ACK-UNKNOWN: an ambiguous permit consume after the job landed surfaces as honest UNKNOWN; no blind retry dispatches', async () => {
  await pinAdapterStores();
  const clock = controlledClock();
  try {
    const kStore = new ConsumeFaultStore();
    const activation = await activateV10App(await buildC01App(), { store: kStore, tenantId: TENANT, now: clock.now });
    const businessId = BUSINESS_ID;

    // The adapter LANDS the job; only the permit consume write is ambiguous.
    const outcome = await activation.facade.send(send({
      intentType: 'submitExternalJob', messageId: 'msg:lost-ack-1',
      input: { requestId: 'R-LOST', jobSpec: { kind: 'export', rows: 3 } },
    }));
    assert.equal(outcome.status, 'UNKNOWN', 'the facade surfaces the kernel-honest UNKNOWN, never a fake ACK');
    assert.equal((outcome as { code?: string }).code, 'ADMISSION_EFFECT_JOURNAL_CONFLICT');
    assert.ok(extjobConsole.jobByKey('R-LOST') !== undefined, 'the job physically landed at the provider');
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1);

    // A blind retry of the same message must NOT dispatch again. The honest
    // shape is fail-closed either way: a typed refusal (held fence) or the
    // facade's UNKNOWN (same-turn journal AMBIGUOUS) — never a new dispatch.
    const retry = await activation.facade.send(send({
      intentType: 'submitExternalJob', messageId: 'msg:lost-ack-1',
      input: { requestId: 'R-LOST', jobSpec: { kind: 'export', rows: 3 } },
    })).then(
      (receipt) => receipt,
      (error: unknown) => {
        const code = (error as { code?: string }).code;
        assert.ok(
          code === 'ADMISSION_STATE_CAS_CONFLICT' || code === 'ADMISSION_EFFECT_AMBIGUOUS' || code === 'ADMISSION_EFFECT_FAILED' || code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `fail-closed retry refusal expected, got ${String(code)}`,
        );
        return { status: 'rejected', code } as Record<string, unknown>;
      },
    );
    assert.ok(
      retry.status === 'UNKNOWN' || retry.status === 'rejected',
      `the retry resolved fail-closed (got ${JSON.stringify(retry).slice(0, 200)})`,
    );
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1, 'no second physical submission');

    // Reconciliation resolves the truth through its OWN admitted turn.
    const reconciled = await activation.facade.send(send({
      intentType: 'reconcileExternalJob', messageId: 'msg:lost-ack-recon',
      input: { requestId: 'R-LOST', idempotencyKey: 'job:R-LOST' },
    }));
    const truth = firstEffect(reconciled).output as { phase: string; externalRef: string };
    assert.equal(truth.externalRef, 'job:R-LOST');
    assert.ok(truth.phase === 'accepted' || truth.phase === 'running' || truth.phase === 'terminal', 'the standing provider truth is reported');
    void businessId;

    activation.dispose();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('N-REPLAY: a same-messageId replay answers from the K02 original receipt with zero new dispatch; changed input is a typed conflict', async () => {
  await pinAdapterStores();
  const clock = controlledClock();
  try {
    const activation = await activateV10App(await buildC01App(), { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now });

    const first = await activation.facade.send(send({
      intentType: 'submitExternalJob', messageId: 'msg:replay-1',
      input: { requestId: 'R-REPLAY', jobSpec: { kind: 'export', rows: 5 } },
    }));
    assert.deepEqual(firstEffect(first).output, { phase: 'accepted', externalRef: 'job:R-REPLAY' });

    // Identical replay: the ORIGINAL receipt answers; zero new activity.
    const replay = await activation.facade.send(send({
      intentType: 'submitExternalJob', messageId: 'msg:replay-1',
      input: { requestId: 'R-REPLAY', jobSpec: { kind: 'export', rows: 5 } },
    }));
    assert.notEqual(replay.status, 'denied', 'an identical replay is answered, not re-decided');
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1, 'the adapter dispatched exactly once');
    const kc = activation.facade.kCounters(BUSINESS_ID);
    assert.ok(
      kc.durableOriginalReceiptReplays + kc.turnAdmissionReplays >= 1,
      'the K02 original-receipt ladder answered the replay',
    );

    // Changed input under the same messageId: typed conflict, zero dispatch.
    await assert.rejects(
      activation.facade.send(send({
        intentType: 'submitExternalJob', messageId: 'msg:replay-1',
        input: { requestId: 'R-REPLAY', jobSpec: { kind: 'export', rows: 999 } },
      })),
      (error: unknown) => {
        const code = (error as { code?: string }).code;
        assert.match(String(code), /K02_TURN_RECEIPT_(INPUT|INTENT)_CONFLICT/, 'changed input replays as a typed conflict');
        return true;
      },
    );
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1, 'still exactly one physical submission');

    activation.dispose();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('N-GATE-DIRECT: replaying a settled turn permit claim (or crossing tenants) is refused before any invocation', async () => {
  await pinAdapterStores();
  const clock = controlledClock();
  try {
    const kStore = new PlainCasDocStore();
    const app = await buildC01App();
    const activation = await activateV10App(app, { store: kStore, tenantId: TENANT, now: clock.now });

    const receipt = await activation.facade.send(send({
      intentType: 'submitExternalJob', messageId: 'msg:gate-1',
      input: { requestId: 'R-GATE', jobSpec: { kind: 'export', rows: 1 } },
    }));
    const effectId = String(firstEffect(receipt).effectId);
    const turnId = effectId.slice(0, effectId.indexOf('/effect/'));
    activation.dispose();

    const docs = createV10DocsPort({ store: kStore, docsPrefix: `v10/k/${app.subjectDigest}/${TENANT}/`, assertOpen: () => {} });
    let invoked = 0;
    const invoke = async (): Promise<unknown> => {
      invoked += 1;
      return { phase: 'terminal', externalRef: 'job:R-GATE', outcome: { ok: true, output: {} } };
    };
    const claim = { effectPermit: { effectId, durableControlTurnId: turnId } };

    // The settled turn's own permit claim: consumed ⇒ refused, zero invoke.
    await assert.rejects(
      dispatchThroughExternalEffectGate({ docs, nowIso: () => new Date(clock.now()).toISOString() }, {
        capabilityId: 'extjob', operationId: 'job.submit', payload: { requestId: 'R-GATE' }, attest: { ...claim }, invoke,
      }),
      (error: unknown) => { assert.equal((error as { code?: string }).code, 'V10_EFFECT_PERMIT_CONSUMED'); return true; },
    );

    // A foreign tenant's docs namespace cannot even see the permit.
    const foreignDocs = createV10DocsPort({ store: kStore, docsPrefix: `v10/k/${app.subjectDigest}/tenant:v010-foreign/`, assertOpen: () => {} });
    await assert.rejects(
      dispatchThroughExternalEffectGate({ docs: foreignDocs, nowIso: () => new Date(clock.now()).toISOString() }, {
        capabilityId: 'extjob', operationId: 'job.submit', payload: { requestId: 'R-GATE' }, attest: { ...claim }, invoke,
      }),
      (error: unknown) => { assert.equal((error as { code?: string }).code, 'V10_EFFECT_PERMIT_UNKNOWN'); return true; },
    );
    assert.equal(invoked, 0, 'the invoker never ran');
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});
