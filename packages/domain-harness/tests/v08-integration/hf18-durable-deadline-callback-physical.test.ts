/**
 * #1062 HF18 — durable deadline + callback correlation on the SELECTED
 * physical path (real Node24 + real SQLite + real sealed closure).
 * =====================================================================
 *
 * Selected path under test (DomainHarness.load(package) → protected H → K):
 *
 *   gateway.registerExternalWork / acceptExternalCallback / fireDeadline /
 *   queryExternalWork / recoverDurableControls
 *     → Host-side source-pinned CAS state machine (v0.7
 *       DurableControlCoordinator semantics adapted to the true-CAS store)
 *     → the ONE winning delivery submits through the SAME authenticated
 *       ops.submitAs seam as send, carrying the trusted-Host turnSource
 *     → the Kernel derives the deterministic durable control turn id,
 *       admits through the unchanged central admission, commits the state
 *       CAS, journals effects, and writes the K-owned turn disposition
 *       (idempotent replay on redelivery — zero doubled State/Effect).
 *
 * bootstrapTrustedHost's trust channel is one-shot per process, so this
 * process hosts exactly ONE shared Host; every additional Host (fresh
 * process restart, in-memory refusal, SQLite crash-window injection) is a
 * spawned child (hf18-child-hosts.mjs).
 *
 * P legs: a bound callback and a due deadline each submit exactly ONE
 * authorized K turn/State/Effect; the persisted correlation survives a
 * REAL close/reopen AND a fresh-process restart; recovery heals a
 * settled-but-unsubmitted record exactly once.
 *
 * N legs: duplicate / payload-changed / late / early-fire / foreign-timer /
 * misbound-target deliveries are typed outcomes with ZERO Kernel activity;
 * an unprivileged principal cannot register and its delivery is denied
 * with zero effect; a non-durable host refuses registration BEFORE any
 * mutation; a failed K disposition create (crash-window injection on the
 * physical SQLite store) is reported honestly and never doubles the
 * terminal state — no cross-document atomicity is claimed anywhere.
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  type HostCredential,
  type KernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import {
  issueApprovalProof,
  qualifyPackageClosure,
  buildQualifiedPackage,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sqliteTempPath } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);

const AUDIENCE = 'dh-v08-hf18';
const APP_ID = 'durable-controls';
const TENANT = 't1';
const WORKFLOW_KEY = 'durable-controls';

let handle: TrustedHostHandle;
let gateway: KernelGateway;
let operator: HostCredential;
let requester: HostCredential;
let outsider: HostCredential;
const ledgerCalls: { operation: string; payload: Record<string, unknown> }[] = [];

function component(value: string): string {
  return encodeURIComponent(value);
}

function expectedCallbackTurnId(instanceKey: string, correlationId: string, ordinal: number): string {
  return `turn:${component(WORKFLOW_KEY)}:${component(`${TENANT}:${APP_ID}:${instanceKey}`)}:callback:${component(correlationId)}:${String(ordinal)}`;
}

function expectedTimerTurnId(instanceKey: string, timerId: string): string {
  return `turn:${component(WORKFLOW_KEY)}:${component(`${TENANT}:${APP_ID}:${instanceKey}`)}:timer:${component(timerId)}:1`;
}

/** Seal the K/S/B(fixture) closure through the REAL BUILD path. */
async function sealControlsClosure(): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('business-durable-controls.mjs', fixtureDir), 'utf8'),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`);
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:durable-controls',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID as string, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk' as const, packageId: sdk.MODULE_ID as string, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business' as const, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-15T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-hf18-hf32',
  }) as SealedQualifiedPackageRoot;
}

before(async () => {
  const root = await sealControlsClosure();
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('hf18main') },
  });
  handle.host.resources.provision('ledger', (operation: string, payload: unknown) => {
    ledgerCalls.push({ operation, payload: payload as Record<string, unknown> });
    return { reserved: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator', 'requester'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  outsider = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'out', roles: ['observer-only'], audience: AUDIENCE, grantId: 'g-out' });
});

after(async () => {
  if (handle !== undefined) {
    await handle.host.close();
  }
});

async function startWaiting(instanceKey: string, messageId: string): Promise<void> {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey });
  const receipt = await gateway.send(requester, {
    intentType: 'submitStart',
    messageId,
    input: { amount: 1 },
    target: { tenantId: TENANT, appId: APP_ID, instanceKey },
  }) as { status: string };
  assert.equal(receipt.status, 'admitted');
}

async function stateOf(instanceKey: string): Promise<{ stateKey: string; stateRevision: number }> {
  const snapshot = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey }) as { state: { stateKey: string }; stateRevision: number };
  return { stateKey: snapshot.state.stateKey, stateRevision: snapshot.stateRevision };
}

async function registerWork(instanceKey: string, correlationId: string, timerId: string, dueAt: string): Promise<void> {
  const registered = await gateway.registerExternalWork(operator, {
    appId: APP_ID, instanceKey,
    externalCorrelationId: correlationId, deadlineTimerId: timerId, dueAt,
    callbackIntentType: 'resumeFromCallback', timeoutIntentType: 'timeOutOnDeadline',
  }) as { status: string; record: { status: string } };
  assert.equal(registered.status, 'registered');
  assert.equal(registered.record.status, 'waiting');
}

async function assertRefused(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code, `expected ${code}, got: ${String((error as Error)?.message ?? error)}`);
    return true;
  });
}

/** Spawn one hf18-child-hosts leg and return its parsed result line. */
async function runChild(mode: string, args: string[]): Promise<Record<string, unknown>> {
  const child = spawn(process.execPath, [
    '--import', 'tsx',
    fileURLToPath(new URL('./hf18-child-hosts.ts', import.meta.url)),
    mode, ...args,
  ], { cwd: process.cwd(), env: process.env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code: number | null) => resolve(code ?? -1));
  });
  const prefix = `HF18_CHILD_RESULT ${mode} `;
  const line = stdout.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  assert.ok(line !== undefined, `the ${mode} child printed its result line (exit ${String(exitCode)}, stdout: ${stdout.slice(0, 400)}, stderr: ${stderr.slice(0, 400)})`);
  assert.equal(exitCode, 0, `the ${mode} child must succeed (stderr: ${stderr.slice(0, 400)})`);
  return JSON.parse(line.slice(prefix.length)) as Record<string, unknown>;
}

let rootFile: string;

// ---------------------------------------------------------------------------
// HF18-P: ONE bound callback / ONE due deadline → exactly ONE authorized
// K turn/State/Effect with the deterministic turn id
// ---------------------------------------------------------------------------

test('HF18-P one bound callback delivery → one admitted K turn with the deterministic callback turn id', async () => {
  await startWaiting('hf18-b', 'm-start-b');
  await registerWork('hf18-b', 'corr-b', 'timer-b', new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const ledgerBefore = ledgerCalls.length;
  const outcome = await gateway.acceptExternalCallback(requester, {
    appId: APP_ID, instanceKey: 'hf18-b', externalCorrelationId: 'corr-b',
    callbackOrdinal: 1, payload: { amount: 8, requestId: 'r-b-1' },
  }) as { status: string; receipt: { status: string; admitted: { durableControlTurnId: string }; instance: { state: { stateKey: string } }; turnDisposition?: { status: string } } };
  assert.equal(outcome.status, 'accepted');
  assert.equal(outcome.receipt.status, 'admitted');
  assert.equal(outcome.receipt.admitted.durableControlTurnId, expectedCallbackTurnId('hf18-b', 'corr-b', 1));
  assert.equal(outcome.receipt.instance.state.stateKey, 'resumed');
  assert.equal(outcome.receipt.turnDisposition?.status, 'recorded');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'exactly one ledger effect for the winning callback turn');
});

test('HF18-P a due deadline fires → one admitted timer K turn', async () => {
  await startWaiting('hf18-c', 'm-start-c');
  await registerWork('hf18-c', 'corr-c', 'timer-c', new Date(Date.now() - 60 * 1000).toISOString());
  const ledgerBefore = ledgerCalls.length;
  const outcome = await gateway.fireDeadline(operator, {
    appId: APP_ID, instanceKey: 'hf18-c', externalCorrelationId: 'corr-c',
    timerId: 'timer-c', fireOrdinal: 1,
  }) as { status: string; receipt: { status: string; admitted: { durableControlTurnId: string }; instance: { state: { stateKey: string } } } };
  assert.equal(outcome.status, 'accepted');
  assert.equal(outcome.receipt.status, 'admitted');
  assert.equal(outcome.receipt.admitted.durableControlTurnId, expectedTimerTurnId('hf18-c', 'timer-c'));
  assert.equal(outcome.receipt.instance.state.stateKey, 'timedOut');
  assert.equal(ledgerCalls.length - ledgerBefore, 1);
});

// ---------------------------------------------------------------------------
// HF18-N: duplicate / changed-payload / late / early / foreign / misbound —
// typed outcomes, ZERO Kernel activity
// ---------------------------------------------------------------------------

test('HF18-N duplicate callback delivery is a typed duplicate with zero new state/effect', async () => {
  const before = await stateOf('hf18-b');
  const ledgerBefore = ledgerCalls.length;
  const duplicate = await gateway.acceptExternalCallback(requester, {
    appId: APP_ID, instanceKey: 'hf18-b', externalCorrelationId: 'corr-b',
    callbackOrdinal: 1, payload: { amount: 8, requestId: 'r-b-1' },
  }) as { status: string };
  assert.equal(duplicate.status, 'duplicate');
  const after = await stateOf('hf18-b');
  assert.equal(after.stateRevision, before.stateRevision, 'no second state commit');
  assert.equal(ledgerCalls.length, ledgerBefore, 'no second effect');
});

test('HF18-N the same ordinal with a changed payload refuses typed (identity conflict)', async () => {
  const ledgerBefore = ledgerCalls.length;
  await assertRefused(gateway.acceptExternalCallback(requester, {
    appId: APP_ID, instanceKey: 'hf18-b', externalCorrelationId: 'corr-b',
    callbackOrdinal: 1, payload: { amount: 999, requestId: 'r-b-forged' },
  }), 'CALLBACK_IDENTITY_CONFLICT');
  assert.equal(ledgerCalls.length, ledgerBefore);
});

test('HF18-N a callback after the deadline won is typed late_after_timeout with zero effect', async () => {
  const ledgerBefore = ledgerCalls.length;
  const late = await gateway.acceptExternalCallback(requester, {
    appId: APP_ID, instanceKey: 'hf18-c', externalCorrelationId: 'corr-c',
    callbackOrdinal: 1, payload: { amount: 5, requestId: 'r-c-late' },
  }) as { status: string };
  assert.equal(late.status, 'late_after_timeout');
  const state = await stateOf('hf18-c');
  assert.equal(state.stateKey, 'timedOut', 'the timed-out terminal truth stands');
  assert.equal(ledgerCalls.length, ledgerBefore);
});

test('HF18-N an early deadline fire refuses typed DEADLINE_NOT_DUE and mutates nothing', async () => {
  await startWaiting('hf18-d', 'm-start-d');
  await registerWork('hf18-d', 'corr-d', 'timer-d', new Date(Date.now() + 60 * 60 * 1000).toISOString());
  await assertRefused(gateway.fireDeadline(operator, {
    appId: APP_ID, instanceKey: 'hf18-d', externalCorrelationId: 'corr-d',
    timerId: 'timer-d', fireOrdinal: 1,
  }), 'DEADLINE_NOT_DUE');
  const record = await gateway.queryExternalWork(requester, {
    appId: APP_ID, instanceKey: 'hf18-d', externalCorrelationId: 'corr-d',
  }) as { status: string };
  assert.equal(record.status, 'waiting', 'the early fire mutated nothing');
});

test('HF18-N a foreign timer refuses typed DEADLINE_TIMER_MISMATCH', async () => {
  await assertRefused(gateway.fireDeadline(operator, {
    appId: APP_ID, instanceKey: 'hf18-d', externalCorrelationId: 'corr-d',
    timerId: 'timer-foreign', fireOrdinal: 1,
  }), 'DEADLINE_TIMER_MISMATCH');
});

test('HF18-N a misbound target (wrong instance) answers typed UNKNOWN_EXTERNAL_CORRELATION with zero effect', async () => {
  const ledgerBefore = ledgerCalls.length;
  await assertRefused(gateway.acceptExternalCallback(requester, {
    appId: APP_ID, instanceKey: 'hf18-not-registered', externalCorrelationId: 'corr-b',
    callbackOrdinal: 1, payload: { amount: 8, requestId: 'r-b-1' },
  }), 'UNKNOWN_EXTERNAL_CORRELATION');
  assert.equal(ledgerCalls.length, ledgerBefore);
});

test('HF18-N an unprivileged principal cannot register work and its delivery is denied with zero effect; recovery heals exactly once', async () => {
  await startWaiting('hf18-e', 'm-start-e');
  await assertRefused(gateway.registerExternalWork(outsider, {
    appId: APP_ID, instanceKey: 'hf18-e',
    externalCorrelationId: 'corr-e', deadlineTimerId: 'timer-e',
    dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    callbackIntentType: 'resumeFromCallback', timeoutIntentType: 'timeOutOnDeadline',
  }), 'HOST_CONTROL_ROLE_DENIED');
  await registerWork('hf18-e', 'corr-e', 'timer-e', new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const ledgerBefore = ledgerCalls.length;
  // The record SETTLES (single CAS winner) but the Kernel turn is denied at
  // the sealed Business role gate — zero state/effect activity.
  await assertRefused(gateway.acceptExternalCallback(outsider, {
    appId: APP_ID, instanceKey: 'hf18-e', externalCorrelationId: 'corr-e',
    callbackOrdinal: 1, payload: { amount: 6, requestId: 'r-e-1' },
  }), 'PRINCIPAL_ROLE_NOT_BOUND');
  assert.equal(ledgerCalls.length, ledgerBefore, 'zero effects for the denied delivery');
  assert.equal((await stateOf('hf18-e')).stateKey, 'waiting', 'the denied delivery moved no state');

  // Recovery heal: an authorized control principal re-submits the STORED
  // terminal source — the turn runs EXACTLY once, and a second recovery
  // pass re-submits nothing (idempotent, zero doubled effect).
  const healed = await gateway.recoverDurableControls(operator, { appId: APP_ID }) as { status: string; fired: number; healed: number };
  assert.equal(healed.status, 'recovered');
  assert.ok(healed.healed >= 1, `at least the settled-unsubmitted correlation was healed (got ${String(healed.healed)})`);
  assert.equal((await stateOf('hf18-e')).stateKey, 'resumed', 'the healed turn committed the terminal state');
  const ledgerAfterHeal = ledgerCalls.length;
  assert.equal(ledgerAfterHeal - ledgerBefore, 1, 'exactly one effect across delivery + heal');
  const again = await gateway.recoverDurableControls(operator, { appId: APP_ID }) as { healed: number };
  assert.equal(again.healed, 0, 'the submittedTurn marker prevents re-submission');
  assert.equal(ledgerCalls.length, ledgerAfterHeal, 'no doubled effect from the second recovery');
});

// ---------------------------------------------------------------------------
// Child-process legs (each additional Host needs its own process: the
// trust channel is one-shot per process)
// ---------------------------------------------------------------------------

test('HF18-N a non-durable host refuses registration typed BEFORE any mutation', async () => {
  rootFile ??= await (async () => {
    const file = join(tmpdir(), `dh1062-hf18-root-${process.pid}.json`);
    const boot = await sealControlsClosure();
    await writeFile(file, JSON.stringify(boot), 'utf8');
    return file;
  })();
  const result = await runChild('memory', [rootFile]);
  assert.equal(result.refused, 'HOST_DURABLE_CONTROLS_UNAVAILABLE');
});

test('HF18-N SQLite crash-window injection: failed turn-disposition create reports honestly and never doubles', async () => {
  const result = await runChild('unknown', [rootFile, sqliteTempPath('hf18unknown'), 'hf18-u', 'corr-u', '3', 'r-u-1']);
  assert.equal(result.outcomeStatus, 'accepted');
  assert.equal(result.receiptStatus, 'admitted');
  assert.equal(result.turnDisposition, 'not_recorded', 'the lost disposition is honestly reported');
  assert.equal(result.state, 'resumed');
  assert.equal(result.ledgerCalls, 1, 'the authoritative commit happened exactly once');
  assert.equal(result.duplicateStatus, 'duplicate', 'the settled correlation never re-opens');
  assert.equal(result.hasSubmittedMarker, true, 'the heal marker exists — recovery will not resubmit');
  assert.equal(result.stateAfterRecovery, 'resumed');
  assert.equal(result.revisionAfterDuplicate, result.revision, 'the terminal state was not doubled');
  assert.equal(result.ledgerCalls, 1, 'no duplicate effect anywhere');
});

test('HF18-P-RESTART a fresh process reopens the physical store and delivers the bound callback exactly once', async () => {
  const dbPath = sqliteTempPath('hf18restart');
  const setup = await runChild('setup', [rootFile, dbPath, 'hf18-r', 'corr-r']);
  assert.equal(setup.startStatus, 'admitted');
  const result = await runChild('reopen', [rootFile, dbPath, 'hf18-r', 'corr-r', '9', 'r-r-1']);
  assert.equal(result.recordStatus, 'waiting', 'the correlation physically survived the fresh-process restart');
  assert.equal(result.outcomeStatus, 'accepted');
  assert.equal(result.receiptStatus, 'admitted');
  assert.equal(result.turnId, expectedCallbackTurnId('hf18-r', 'corr-r', 1));
  assert.equal(result.state, 'resumed');
  assert.equal(result.ledgerCalls, 1, 'exactly one physical ledger effect in the fresh process');
  assert.equal(result.duplicateStatus, 'duplicate');
  assert.equal(result.revisionUnchangedByDuplicate, true);
  assert.equal(result.ledgerUnchangedByDuplicate, true);
});
