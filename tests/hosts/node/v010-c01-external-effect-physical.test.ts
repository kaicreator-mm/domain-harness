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

test.after(() => {
  // Best-effort temp cleanup; Windows refuses unlinking files with open
  // handles, leftovers simply age out of the OS temp tree.
  void rm(join(tmpdir(), 'dh-v010-c01-phys-'), { recursive: true, force: true }).catch(() => {});
});
