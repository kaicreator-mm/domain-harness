/**
 * C01 (#1177) — the PHYSICAL witness suite: the selected K→C external Effect
 * Operation over a REAL file-backed SQLite K store (openSqliteCasStore) on
 * the real Node24 host, including REAL child-process competing writers.
 * ===========================================================================
 *
 * Contract semantics (permit gate, envelopes, negatives) are proven in
 * `tests/assembly/v010-c01-external-effect.test.ts`; THIS file proves what
 * only a physical substrate can:
 *
 *   PH-P1  RESTART: journal/permit/receipt rows survive a full activation
 *          dispose → re-activate over the SAME SQLite file; the identical
 *          messageId replay answers from the K02 original receipt with ZERO
 *          new provider dispatch, and a fresh job dispatches anew.
 *   PH-N2  DUPLICATE CALLBACK: the provider console delivers the same
 *          completion callback twice — the first records, the second is
 *          typed 'duplicate' with ZERO state change; exactly one callback
 *          row; the standing terminal outcome is the callback's; the K
 *          journal gained no new effect.
 *   PH-N3  MISSING BEST-EFFORT DISPOSITION: deleting the post-commit turn
 *          disposition row from SQLite does NOT damage the K02 original
 *          receipt — the replay still answers, zero new dispatch.
 *   PH-R1  TWO-PROCESS COMPETING WRITERS: two real child Node processes
 *          submit the SAME messageId/input/instance concurrently over ONE
 *          SQLite K file — exactly ONE physical provider dispatch, exactly
 *          one job row, the loser fail-closed (typed refusal or honest
 *          UNKNOWN), never a duplicate external effect.
 */
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import {
  V10_TARGET_PROFILE,
  activateV10App,
  buildV10App,
  sha256Hex,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { createV10DocsPort } from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';
// The trusted gate seam is internal (#1227): tests wire it through the module
// path, never through the curated public barrel.
import { dispatchThroughExternalEffectGate } from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/external-effect.js';
import type { V10DocStore, V10DocWriteCondition, V10ModuleInput } from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import * as extjobConsole from '../../assembly/fixtures-v010/capability-extjob-runx-v1.mjs';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the C01 physical witness targets the selected Node24 runtime (running ${process.versions.node})`,
);

const TENANT = 'tenant:v010-c01';
const BASE_MS = Date.UTC(2026, 9, 19, 12, 0, 0);
const CHILD_SCRIPT = fileURLToPath(new URL('./v010-c01-child.mjs', import.meta.url));

/** V10DocStore adapter over the physical SQLite CAS store (K01/K02 physical substrate). */
class SqliteV10DocStore implements V10DocStore {
  constructor(private readonly store: Awaited<ReturnType<typeof openSqliteCasStore>>) {}
  async get(key: string) { return await this.store.get(key); }
  async put(key: string, value: unknown, condition: V10DocWriteCondition) {
    return await this.store.put(key, value, condition.kind === 'create'
      ? { mustBeAbsent: true }
      : { mustMatchRevision: condition.revision });
  }
  async remove(key: string, condition: V10DocWriteCondition) {
    await this.store.remove(key, condition.kind === 'create'
      ? { mustBeAbsent: true }
      : { mustMatchRevision: condition.revision });
  }
  async keys(): Promise<readonly string[]> { return await this.store.list(''); }
}

interface Pinned {
  readonly dir: string;
  readonly kPath: string;
  readonly jobPath: string;
}

async function freshPhysical(): Promise<Pinned> {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-c01-phys-'));
  const kPath = join(dir, 'k.sqlite');
  const jobPath = join(dir, 'extjob.sqlite');
  (globalThis as { __c01JobStorePath?: string }).__c01JobStorePath = jobPath;
  (globalThis as { __c01NotifyStorePath?: string }).__c01NotifyStorePath = join(dir, 'extnotify.sqlite');
  return { dir, kPath, jobPath };
}

function clearPins(): void {
  delete (globalThis as { __c01JobStorePath?: string }).__c01JobStorePath;
  delete (globalThis as { __c01NotifyStorePath?: string }).__c01NotifyStorePath;
  delete (globalThis as { __c01JobFaults?: string }).__c01JobFaults;
}

async function c01Modules(): Promise<V10ModuleInput[]> {
  const [kernel, sdk, router, business, extjob, extnotify] = await Promise.all([
    readFile(new URL('../../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../assembly/fixtures-v010/business-external-jobs-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../assembly/fixtures-v010/capability-extjob-runx-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../assembly/fixtures-v010/capability-extnotify-provider-v1.mjs', import.meta.url), 'utf8'),
  ]);
  const routerBody = router.replace(/^export /gm, '');
  const standardBundle = `${sdk}
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
  return [
    {
      packageId: 'v08-kernel-mechanism@v0.10.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel, moduleSha256: sha256Hex(kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: standardBundle, moduleSha256: sha256Hex(standardBundle),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    {
      packageId: 'business-external-jobs@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: business, moduleSha256: sha256Hex(business),
      endpoint: 'business-policy', dependencies: [],
      provides: [
        'business:policy/1', 'intent:submitExternalJob', 'intent:checkExternalJob', 'intent:reconcileExternalJob',
        'intent:sendNotification', 'intent:submitUnpermittedJobProbe', 'intent:submitCrossCapabilityProbe', 'intent:submitExpiringJob',
        'intent:submitDoubleDispatchProbe', 'intent:submitConcurrentDispatchProbe',
      ], requires: [],
    },
    {
      packageId: 'capability-extjob-runx@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: extjob, moduleSha256: sha256Hex(extjob),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:extjob/1'], requires: [],
      externalImports: { node: [], npm: [], native: ['better-sqlite3'] },
      capabilityId: 'extjob', externalEffect: true,
      handlers: [
        { operationId: 'job.submit', handler: 'jobSubmit' },
        { operationId: 'job.status', handler: 'jobStatus' },
        { operationId: 'job.reconcile', handler: 'jobReconcile' },
      ],
    },
    {
      packageId: 'capability-extnotify-provider@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: extnotify, moduleSha256: sha256Hex(extnotify),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:extnotify/1'], requires: [],
      externalImports: { node: [], npm: [], native: ['better-sqlite3'] },
      capabilityId: 'extnotify', externalEffect: true,
      handlers: [
        { operationId: 'notify.send', handler: 'notifySend' },
        { operationId: 'notify.status', handler: 'notifyStatus' },
      ],
    },
  ];
}

async function buildC01App() {
  return buildV10App({
    appId: 'app:v010-c01-external-effects',
    audience: 'aud:v010-c01',
    targetProfile: V10_TARGET_PROFILE,
    modules: await c01Modules(),
    routes: [
      { intentId: 'submitExternalJob', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' },
      { intentId: 'checkExternalJob', operationId: 'job.status', capabilityId: 'extjob', handlerId: 'jobStatus' },
      { intentId: 'reconcileExternalJob', operationId: 'job.reconcile', capabilityId: 'extjob', handlerId: 'jobReconcile' },
    ],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 'c01-external-effect',
  });
}

/**
 * [R1 P1-2] The two-B scoped composition: B1 and B2 share the SAME
 * workflowId (`external-jobs`) and instanceKey, so only the K02 scoped
 * deployment tuple (each B's own businessPackageId) keeps their K records
 * physically disjoint — the exact scenario C01 must support.
 */
async function buildC01TwoBApp() {
  const modules = await c01Modules();
  const second = await readFile(new URL('../../assembly/fixtures-v010/business-external-b-second-v1.mjs', import.meta.url), 'utf8');
  modules.push({
    packageId: 'business-external-jobs-b@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
    moduleSource: second, moduleSha256: sha256Hex(second),
    endpoint: 'business-policy', dependencies: [],
    provides: ['business:policy/1', 'intent:submitSecondBJob'], requires: [],
  });
  return buildV10App({
    appId: 'app:v010-c01-external-effects',
    audience: 'aud:v010-c01',
    targetProfile: V10_TARGET_PROFILE,
    modules,
    routes: [
      { intentId: 'submitExternalJob', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' },
      { intentId: 'checkExternalJob', operationId: 'job.status', capabilityId: 'extjob', handlerId: 'jobStatus' },
      { intentId: 'reconcileExternalJob', operationId: 'job.reconcile', capabilityId: 'extjob', handlerId: 'jobReconcile' },
      { intentId: 'submitSecondBJob', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' },
    ],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 'c01-external-effect-two-b',
  });
}

/** The K02 key-component encoding (percent and colon only). */
function encK02(value: string): string {
  return value.replace(/%/g, '%25').replace(/:/g, '%3A');
}

/** The K02 scoped namespace prefix of one deployment tuple (the Host composition). */
function scopePrefix(identity: { deployedAppId: string; tenantId: string; appId: string }, businessPackageId: string): string {
  return ['v010-k02', encK02(identity.deployedAppId), encK02(identity.tenantId), encK02(identity.appId), encK02(businessPackageId)].join(':') + ':';
}

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

function firstEffectOutput(receipt: Record<string, unknown>): unknown {
  assert.equal(receipt.status, 'admitted', `receipt must be admitted: ${JSON.stringify(receipt).slice(0, 400)}`);
  const effect = (receipt.admitted as { effects?: { disposition?: string; output?: unknown }[] }).effects?.[0];
  assert.ok(effect !== undefined);
  assert.equal(effect.disposition, 'executed');
  return effect.output;
}

/** Direct SQL row surgery on the physical K store (the lost-disposition fault). */
function deleteRowsLike(kPath: string, pattern: string): number {
  const db = new Database(kPath);
  try {
    return db.prepare('DELETE FROM v8_host_docs WHERE key LIKE ?').run(`%${pattern}%`).changes;
  } finally {
    db.close();
  }
}

function countRowsLike(kPath: string, pattern: string): number {
  const db = new Database(kPath, { readonly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM v8_host_docs WHERE key LIKE ?').get(`%${pattern}%`) as { n: number }).n;
  } finally {
    db.close();
  }
}

test('PH-P1 RESTART: journal/permit/receipt survive dispose → re-activate; replay is zero-dispatch; fresh work dispatches anew', async () => {
  const pinned = await freshPhysical();
  try {
    const app = await buildC01App();
    const store1 = await openSqliteCasStore({ path: pinned.kPath });
    const first = await activateV10App(app, { store: new SqliteV10DocStore(store1), tenantId: TENANT, now: () => BASE_MS });

    const submitted = await first.facade.send({
      intentType: 'submitExternalJob', instanceKey: 'instance:c01-restart', messageId: 'msg:phys-restart-1',
      input: fullInput({ requestId: 'R-PHYS-1', jobSpec: { kind: 'export', rows: 7 } }),
    });
    assert.deepEqual(firstEffectOutput(submitted), { phase: 'accepted', externalRef: 'job:R-PHYS-1' });
    first.dispose();
    await store1.close();

    // The physical K file holds the durable carrier rows.
    assert.ok(countRowsLike(pinned.kPath, 'effect-journal') >= 1, 'journal rows persist');
    assert.ok(countRowsLike(pinned.kPath, 'effect-permit') >= 1, 'permit rows persist');
    assert.ok(countRowsLike(pinned.kPath, 'wf-instance') >= 1, 'instance rows persist');

    // Full second activation over the SAME files; the replay answers from the
    // K02 original receipt with ZERO new provider dispatch.
    const store2 = await openSqliteCasStore({ path: pinned.kPath });
    const second = await activateV10App(app, { store: new SqliteV10DocStore(store2), tenantId: TENANT, now: () => BASE_MS });
    const replay = await second.facade.send({
      intentType: 'submitExternalJob', instanceKey: 'instance:c01-restart', messageId: 'msg:phys-restart-1',
      input: fullInput({ requestId: 'R-PHYS-1', jobSpec: { kind: 'export', rows: 7 } }),
    });
    assert.notEqual(replay.status, 'denied');
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1, 'the provider dispatched exactly once across the restart');

    const kc = second.facade.kCounters('business-external-jobs@v010.1.0.0');
    assert.ok(kc.durableOriginalReceiptReplays + kc.turnAdmissionReplays >= 1, 'the replay answered from the K02 original receipt');

    // Fresh work through the re-activated App dispatches anew.
    const fresh = await second.facade.send({
      intentType: 'submitExternalJob', instanceKey: 'instance:c01-restart-2', messageId: 'msg:phys-restart-2',
      input: fullInput({ requestId: 'R-PHYS-2', jobSpec: { kind: 'export', rows: 8 } }),
    });
    assert.deepEqual(firstEffectOutput(fresh), { phase: 'accepted', externalRef: 'job:R-PHYS-2' });
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 2);
    second.dispose();
    await store2.close();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('PH-N2 DUPLICATE CALLBACK: the provider records exactly one completion callback; the second is a typed duplicate', async () => {
  const pinned = await freshPhysical();
  try {
    const store = await openSqliteCasStore({ path: pinned.kPath });
    const activation = await activateV10App(await buildC01App(), { store: new SqliteV10DocStore(store), tenantId: TENANT, now: () => BASE_MS });

    await activation.facade.send({
      intentType: 'submitExternalJob', instanceKey: 'instance:c01-cb', messageId: 'msg:phys-cb-1',
      input: fullInput({ requestId: 'R-CB', jobSpec: { kind: 'export', rows: 1 } }),
    });
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1);
    const journalEffectsBefore = countRowsLike(pinned.kPath, 'effect-journal');

    // The provider console delivers the SAME completion callback twice (and a
    // conflicting third): exactly one records; the provider's own exactly-once
    // log holds; ZERO new K journal effects appear (console-only deliveries).
    const outcome = { ok: true, output: { deliveredByCallback: true, jobId: 'job:R-CB' } };
    const firstDelivery = extjobConsole.deliverCallback('job:R-CB', outcome);
    const duplicateDelivery = extjobConsole.deliverCallback('job:R-CB', outcome);
    const conflicting = extjobConsole.deliverCallback('job:R-CB', { ok: true, output: { forged: true } });
    assert.equal(firstDelivery.disposition, 'recorded');
    assert.equal(duplicateDelivery.disposition, 'duplicate');
    assert.equal(conflicting.disposition, 'conflict');
    assert.equal(extjobConsole.callbackCount(), 1, 'exactly one callback row');
    assert.equal(countRowsLike(pinned.kPath, 'effect-journal'), journalEffectsBefore, 'duplicate callbacks create zero new K effects');

    // The standing terminal outcome IS the callback's — through the App.
    const status = await activation.facade.send({
      intentType: 'checkExternalJob', instanceKey: 'instance:c01-cb-2', messageId: 'msg:phys-cb-2',
      input: fullInput({ requestId: 'R-CB', jobId: 'job:R-CB' }),
    });
    const envelope = firstEffectOutput(status) as { phase: string; outcome: { ok: boolean; output: { deliveredByCallback?: boolean } } };
    assert.equal(envelope.phase, 'terminal');
    assert.equal(envelope.outcome.output.deliveredByCallback, true);

    // The duplicate callback produced ZERO new K effects and no re-submission.
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1, 'no duplicate physical submission');

    activation.dispose();
    await store.close();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('PH-N3 MISSING DISPOSITION: a deleted best-effort disposition row never damages the K02 original receipt', async () => {
  const pinned = await freshPhysical();
  try {
    const store = await openSqliteCasStore({ path: pinned.kPath });
    const activation = await activateV10App(await buildC01App(), { store: new SqliteV10DocStore(store), tenantId: TENANT, now: () => BASE_MS });

    await activation.facade.send({
      intentType: 'submitExternalJob', instanceKey: 'instance:c01-disp', messageId: 'msg:phys-disp-1',
      input: fullInput({ requestId: 'R-DISP', jobSpec: { kind: 'export', rows: 2 } }),
    });
    assert.ok(countRowsLike(pinned.kPath, 'turn-disposition') >= 1, 'the committed turn wrote its best-effort disposition row');

    // The best-effort disposition write is LOST (direct row surgery).
    const deleted = deleteRowsLike(pinned.kPath, 'turn-disposition');
    assert.ok(deleted >= 1);
    assert.equal(countRowsLike(pinned.kPath, 'turn-disposition'), 0);

    // The original receipt still answers the identical replay — zero dispatch.
    const replay = await activation.facade.send({
      intentType: 'submitExternalJob', instanceKey: 'instance:c01-disp', messageId: 'msg:phys-disp-1',
      input: fullInput({ requestId: 'R-DISP', jobSpec: { kind: 'export', rows: 2 } }),
    });
    assert.notEqual(replay.status, 'denied', 'receipt liveness does not depend on the best-effort disposition');
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1);
    const kc = activation.facade.kCounters('business-external-jobs@v010.1.0.0');
    assert.ok(kc.durableOriginalReceiptReplays + kc.turnAdmissionReplays >= 1);

    activation.dispose();
    await store.close();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('PH-R1 TWO-PROCESS RACE: two real child processes, one shared SQLite K file — exactly ONE physical dispatch', async () => {
  const pinned = await freshPhysical();
  try {
    const outcomes = await Promise.all([0, 1].map(async (index) => {
      const outcomeFile = join(pinned.dir, `child-${index}.json`);
      const child = spawn(process.execPath, [
        '--import', 'tsx', CHILD_SCRIPT,
        pinned.kPath, pinned.jobPath, 'msg:phys-race-1', 'R-RACE', outcomeFile,
      ], { cwd: fileURLToPath(new URL('../../../', import.meta.url)), stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      const code = await new Promise<number>((resolve) => {
        child.on('close', (exitCode) => resolve(exitCode ?? -1));
        child.on('error', () => resolve(-1));
      });
      if (code !== 0) {
        return { ok: false, code: `EXIT_${code}`, message: stderr.slice(0, 400) };
      }
      return JSON.parse(await readFile(outcomeFile, 'utf8')) as { ok: boolean; status?: string; code?: string; message?: string };
    }));

    // The two concurrent same-messageId submissions resolve to the SAME
    // logical turn: either one admits and the other replays the K02 original
    // receipt (identical bytes — both look 'admitted' with the same effectId)
    // or the loser is typed fail-closed. The PHYSICAL exactly-once witnesses
    // are the provider's own dispatch log, its job table and the K journal.
    const receipts = outcomes.map((outcome) => JSON.stringify(outcome));
    const winners = outcomes.filter((outcome) => outcome.ok === true);
    assert.ok(winners.length >= 1, `at least one child's turn admitted: ${JSON.stringify(outcomes)}`);
    if (winners.length === 2) {
      const effectIds = winners.map((winner) => String((winner as { effect?: { effectId?: string } }).effect?.effectId));
      assert.equal(effectIds[0], effectIds[1], 'two concurrent identical submissions resolve to the SAME logical turn');
    } else {
      const loser = outcomes.find((outcome) => outcome.ok === false) as { code?: string };
      assert.match(
        String(loser.code),
        /ADMISSION_STATE_CAS_CONFLICT|ADMISSION_EFFECT_AMBIGUOUS|ADMISSION_EFFECT_JOURNAL_CONFLICT|ADMISSION_EFFECT_FAILED|K02_/,
        `the losing turn is fail-closed typed, got ${receipts.join(' | ')}`,
      );
    }

    // The provider physically dispatched EXACTLY once and holds ONE job row.
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 1, 'exactly one physical job submission across two processes');
    assert.ok(extjobConsole.jobByKey('R-RACE') !== undefined, 'the job row exists');
    assert.equal(extjobConsole.jobByKey('R-RACE').job_id, 'job:R-RACE');

    // And the K store holds exactly one effect journal row for the turn.
    assert.equal(countRowsLike(pinned.kPath, 'effect-journal'), 1);
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test('PH-P2 SCOPED TWO-B (R1 P1-2): two B on one workflow/instance over ONE SQLite file stay disjoint under the K02 scoped grammar', async () => {
  const pinned = await freshPhysical();
  const B1 = 'business-external-jobs@v010.1.0.0';
  const B2 = 'business-external-jobs-b@v010.1.0.0';
  const identity = { deployedAppId: 'deploy:c01-scoped', tenantId: 'tenant:c01-scoped', appId: 'app:v010-c01-external-effects' };
  try {
    const app = await buildC01TwoBApp();
    const store = await openSqliteCasStore({ path: pinned.kPath });
    const activation = await activateV10App(app, {
      store: new SqliteV10DocStore(store),
      tenantId: identity.tenantId,
      deploymentIdentity: identity,
      now: () => BASE_MS,
    });

    // B1 and B2 share workflowId + instanceKey + messageId by construction:
    // ONLY the K02 scoped namespace keeps their records physically disjoint.
    const b1 = await activation.facade.send({
      intentType: 'submitExternalJob', instanceKey: 'instance:scoped-shared', messageId: 'msg:scoped-shared',
      input: fullInput({ requestId: 'R-SCOPED-B1', jobSpec: { kind: 'scoped' } }),
    });
    const b2 = await activation.facade.send({
      intentType: 'submitSecondBJob', instanceKey: 'instance:scoped-shared', messageId: 'msg:scoped-shared',
      input: fullInput({ requestId: 'R-SCOPED-B2', jobSpec: { kind: 'scoped' } }),
    });
    const b1Output = firstEffectOutput(b1) as { phase: string; externalRef: string };
    const b2Output = firstEffectOutput(b2) as { phase: string; externalRef: string };
    assert.equal(b1Output.externalRef, 'job:R-SCOPED-B1');
    assert.equal(b2Output.externalRef, 'job:R-SCOPED-B2');
    assert.equal(extjobConsole.dispatchCounts()['job.submit'], 2, 'both B dispatched exactly once each');

    const e1 = String((b1.admitted as { effects: { effectId: string }[] }).effects[0].effectId);
    const e2 = String((b2.admitted as { effects: { effectId: string }[] }).effects[0].effectId);
    // The logical turn identity is the SAME for both B (same workflow,
    // instance and messageId); disjointness is the K02 namespace's job —
    // exactly the composition K02's own two-B witness proves.
    assert.equal(e1, e2, 'the logical turn identity is shared; the deployment namespace separates the records');
    assert.notEqual(
      `${scopePrefix(identity, B1)}${e1}`,
      `${scopePrefix(identity, B2)}${e1}`,
      'the two physical permit addresses differ by the deployed business identity',
    );

    // Physical K rows: TWO disjoint records per family, all under the K02
    // scoped grammar, and ZERO legacy-family keys (no unscoped fallback).
    const allKeys = await store.list('');
    assert.ok(allKeys.every((key) => key.startsWith('v10/k/')), 'every K document stays behind the facade prefix');
    assert.ok(allKeys.every((key) => key.includes('v010-k02:')), 'every record is addressed through the K02 scoped namespace prefix');
    const permits = allKeys.filter((key) => key.includes(':effect-permit:'));
    const journals = allKeys.filter((key) => key.includes(':effect-journal:'));
    const claims = allKeys.filter((key) => key.includes(':effect-dispatch-claim:'));
    assert.equal(permits.length, 2, 'one permit per B');
    assert.equal(journals.length, 2, 'one journal per B');
    assert.equal(claims.length, 2, 'one dispatch claim per B');
    assert.ok(permits.some((key) => key.includes(encK02(B1))), 'B1 permit lives under B1\'s scoped tuple');
    assert.ok(permits.some((key) => key.includes(encK02(B2))), 'B2 permit lives under B2\'s scoped tuple');

    // Cross-B: B1's effect addressed under B2's scoped family resolves to
    // NOTHING — a foreign scoped B never reaches another B's permit, and the
    // invoker stays untouched (zero invocation).
    const docs = createV10DocsPort({
      store: new SqliteV10DocStore(store),
      docsPrefix: `v10/k/${app.subjectDigest}/${identity.tenantId}/`,
      assertOpen: () => {},
    });
    let invoked = 0;
    const invoke = async (): Promise<unknown> => {
      invoked += 1;
      return { phase: 'terminal', externalRef: 'forged', outcome: { ok: true, output: {} } };
    };

    // A LIVE permit that exists ONLY in B1's namespace: B2 naming the exact
    // same logical address can never resolve it (zero cross-B reachability).
    const foreignEffectId = 'turn:synthetic:message:foreign-live';
    await store.put(
      `v10/k/${app.subjectDigest}/${identity.tenantId}/${scopePrefix(identity, B1)}v08-kernel:effect-permit:${foreignEffectId}`,
      {
        pinVersion: 1, state: 'live', effectId: foreignEffectId, durableControlTurnId: 'turn:synthetic:foreign',
        businessPackageId: B1, capabilityKey: 'extjob', operations: ['job.submit'], awaitPolicy: 'phase',
        attempt: 1, expiresAt: new Date(BASE_MS + 60_000).toISOString(),
        target: { workflowId: 'external-jobs', instanceKey: 'instance:scoped-shared' },
      },
      { mustBeAbsent: true },
    );
    await assert.rejects(
      dispatchThroughExternalEffectGate({ docs: { get: async (bp: string, key: string) => await docs.get(`${scopePrefix(identity, bp)}${key}`) }, nowIso: () => new Date(BASE_MS).toISOString() }, {
        capabilityId: 'extjob',
        operationId: 'job.submit',
        payload: { requestId: 'R-FOREIGN' },
        attest: {
          effectPermit: {
            effectId: foreignEffectId,
            durableControlTurnId: 'turn:synthetic:foreign',
            businessPackageId: B2,
            keys: {
              permit: `v08-kernel:effect-permit:${foreignEffectId}`,
              journal: `v08-kernel:effect-journal:${foreignEffectId}`,
              fence: 'unreached-fence',
              dispatchClaim: 'unreached-claim',
            },
          },
        },
        invoke,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'V10_EFFECT_PERMIT_UNKNOWN');
        return true;
      },
    );
    assert.equal(invoked, 0, 'a foreign scoped B invocation never reached an adapter');

    activation.dispose();
    await store.close();
  } finally {
    clearPins();
    extjobConsole.shutdown();
  }
});

test.after(() => {
  // Best-effort temp cleanup; Windows refuses unlinking files with open
  // handles, leftovers simply age out of the OS temp tree.
  void rm(join(tmpdir(), 'dh-v010-c01-phys-'), { recursive: true, force: true }).catch(() => {});
});
