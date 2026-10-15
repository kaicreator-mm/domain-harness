/**
 * #1062 HF32 — durable Workflow child-send result routing on the SELECTED
 * physical path (real Node24 + real SQLite + real sealed closure).
 * =====================================================================
 *
 * Selected path under test (DomainHarness.load(package) → protected H → K):
 *
 *   gateway.sendChildMessage / deliverChildTerminal / queryChildInvocation
 *     → Host-side source-pinned CAS state machine (pending → accepted |
 *       rejected → done | error), the v0.7 compiled-workflow
 *       message-effects all-or-durable-rejection semantics adapted to the
 *       v0.8 true-CAS store
 *     → the CHILD message turn rides the SAME shared non-message seam
 *       (callback turnSource bound to the invocation correlation), the
 *       correlated CHILD TERMINAL routes to its parent exactly once through
 *       the child-terminal turnSource — both submit through the SAME
 *       authenticated ops.submitAs seam as send
 *     → the Kernel derives the deterministic turn ids, admits through the
 *       unchanged central admission, and the K-owned turn disposition
 *       makes replays idempotent (zero doubled State/Effect).
 *
 * P legs: a parent sends a durable child message through approved H/K
 * addressing; the child terminal routes to its parent exactly once with
 * durable accepted/rejected/terminal truth.
 *
 * N legs: a PERMANENT rejection (sealed Business role gate) commits
 * durably BEFORE route selection (rejected_routed) and the rejected
 * invocation is NEVER retried (typed refusal, never transient); duplicate
 * child terminals and target substitutions cannot double any effect.
 */

import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

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

const AUDIENCE = 'dh-v08-hf32';
const APP_ID = 'durable-controls';
const TENANT = 't1';
const WORKFLOW_KEY = 'durable-controls';

let handle: TrustedHostHandle;
let gateway: KernelGateway;
let operator: HostCredential;
let requester: HostCredential;
const ledgerCalls: { operation: string; payload: Record<string, unknown> }[] = [];

function component(value: string): string {
  return encodeURIComponent(value);
}

function qualified(instanceKey: string): string {
  return `${TENANT}:${APP_ID}:${instanceKey}`;
}

/** The deterministic CHILD message turn id (callback source bound to the invocation correlation). */
function expectedChildTurnId(parentKey: string, childKey: string, ordinal: number): string {
  return `turn:${component(WORKFLOW_KEY)}:${component(qualified(childKey))}:callback:${component(`child:${parentKey}:${childKey}:${String(ordinal)}`)}:1`;
}

/** The deterministic PARENT child-terminal turn id. */
function expectedTerminalTurnId(parentKey: string, childKey: string, ordinal: number, terminalKind: string): string {
  return `turn:${component(WORKFLOW_KEY)}:${component(qualified(parentKey))}:child:${component(parentKey)}:${component(childKey)}:${String(ordinal)}:${terminalKind}`;
}

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
    storage: { path: sqliteTempPath('hf32main') },
  });
  handle.host.resources.provision('ledger', (operation: string, payload: unknown) => {
    ledgerCalls.push({ operation, payload: payload as Record<string, unknown> });
    return { reserved: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
});

after(async () => {
  await handle.host.close();
});

async function activate(instanceKey: string): Promise<void> {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey });
}

async function startWaiting(instanceKey: string, messageId: string): Promise<void> {
  await activate(instanceKey);
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

async function assertRefused(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code, `expected ${code}, got: ${String((error as Error)?.message ?? error)}`);
    return true;
  });
}

function sendChild(parentKey: string, childKey: string, childIntentType: string, input?: unknown, invocationOrdinal?: number): Promise<unknown> {
  return gateway.sendChildMessage(requester, {
    appId: APP_ID,
    parentInstanceKey: parentKey,
    childInstanceKey: childKey,
    childIntentType,
    doneIntentType: 'onChildDone',
    errorIntentType: 'onChildError',
    ...(input === undefined ? {} : { input }),
    ...(invocationOrdinal === undefined ? {} : { invocationOrdinal }),
  });
}

function deliverTerminal(parentKey: string, childKey: string, ordinal: number, terminalKind: 'done' | 'error', input?: unknown): Promise<unknown> {
  return gateway.deliverChildTerminal(requester, {
    appId: APP_ID,
    parentInstanceKey: parentKey,
    childInstanceKey: childKey,
    invocationOrdinal: ordinal,
    terminalKind,
    ...(input === undefined ? {} : { input }),
  });
}

// ---------------------------------------------------------------------------
// HF32-P: durable child send + correlated terminal routed to the parent once
// ---------------------------------------------------------------------------

test('HF32-P a parent sends a durable child message through H/K addressing; the child turn commits with the deterministic correlation id', async () => {
  await startWaiting('hf32-p1', 'm-p1-start');
  await activate('hf32-p1c');
  const ledgerBefore = ledgerCalls.length;
  const sent = await sendChild('hf32-p1', 'hf32-p1c', 'runChildTask', { amount: 5 }) as {
    status: string;
    invocation: { status: string; invocationOrdinal: number };
    receipt: { status: string; admitted: { durableControlTurnId: string }; instance: { state: { stateKey: string } } };
  };
  assert.equal(sent.status, 'accepted');
  assert.equal(sent.invocation.status, 'accepted');
  assert.equal(sent.invocation.invocationOrdinal, 1);
  assert.equal(sent.receipt.status, 'admitted');
  assert.equal(sent.receipt.admitted.durableControlTurnId, expectedChildTurnId('hf32-p1', 'hf32-p1c', 1));
  assert.equal(sent.receipt.instance.state.stateKey, 'taskDone', 'the child instance committed its task');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'exactly one child effect');
  const record = await gateway.queryChildInvocation(requester, {
    appId: APP_ID, parentInstanceKey: 'hf32-p1', childInstanceKey: 'hf32-p1c', invocationOrdinal: 1,
  }) as { status: string };
  assert.equal(record.status, 'accepted', 'the durable accepted truth is persisted');
});

test('HF32-P the correlated child terminal routes to its parent exactly once', async () => {
  const ledgerBefore = ledgerCalls.length;
  const before = await stateOf('hf32-p1');
  const terminal = await deliverTerminal('hf32-p1', 'hf32-p1c', 1, 'done', { amount: 7 }) as {
    status: string;
    invocation: { status: string };
    receipt: { status: string; admitted: { durableControlTurnId: string }; instance: { state: { stateKey: string } } };
  };
  assert.equal(terminal.status, 'accepted');
  assert.equal(terminal.invocation.status, 'done');
  assert.equal(terminal.receipt.status, 'admitted');
  assert.equal(terminal.receipt.admitted.durableControlTurnId, expectedTerminalTurnId('hf32-p1', 'hf32-p1c', 1, 'done'));
  assert.equal(terminal.receipt.instance.state.stateKey, 'childOk', 'the parent routed the done terminal');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'exactly one parent effect');
  const after = await stateOf('hf32-p1');
  assert.equal(after.stateRevision, before.stateRevision + 1);
});

test('HF32-P an error terminal routes to the parent error state (all-or-durable-rejection routing truth)', async () => {
  await startWaiting('hf32-p4', 'm-p4-start');
  await activate('hf32-p4c');
  const sent = await sendChild('hf32-p4', 'hf32-p4c', 'runChildTask', { amount: 2 }) as { status: string };
  assert.equal(sent.status, 'accepted');
  const ledgerBefore = ledgerCalls.length;
  const terminal = await deliverTerminal('hf32-p4', 'hf32-p4c', 1, 'error', { reason: 'child-boom' }) as {
    status: string;
    receipt: { status: string; admitted: { durableControlTurnId: string }; instance: { state: { stateKey: string } } };
  };
  assert.equal(terminal.status, 'accepted');
  assert.equal(terminal.receipt.status, 'admitted');
  assert.equal(terminal.receipt.admitted.durableControlTurnId, expectedTerminalTurnId('hf32-p4', 'hf32-p4c', 1, 'error'));
  assert.equal(terminal.receipt.instance.state.stateKey, 'childFailed');
  assert.equal(ledgerCalls.length, ledgerBefore, 'the error route declares no effect');
});

// ---------------------------------------------------------------------------
// HF32-N: duplicate terminals / target substitutions — typed, zero effect
// ---------------------------------------------------------------------------

test('HF32-N a duplicate child terminal is typed already-terminal with zero new state/effect', async () => {
  const before = await stateOf('hf32-p1');
  const ledgerBefore = ledgerCalls.length;
  const duplicate = await deliverTerminal('hf32-p1', 'hf32-p1c', 1, 'done', { amount: 7 }) as { status: string };
  assert.equal(duplicate.status, 'already-terminal');
  const after = await stateOf('hf32-p1');
  assert.equal(after.stateRevision, before.stateRevision, 'the duplicate terminal committed nothing');
  assert.equal(ledgerCalls.length, ledgerBefore, 'the duplicate terminal dispatched no effect');
});

test('HF32-N target substitution (foreign parent / child / ordinal) refuses typed with zero effect', async () => {
  const ledgerBefore = ledgerCalls.length;
  await assertRefused(deliverTerminal('hf32-other-parent', 'hf32-p1c', 1, 'done', { amount: 7 }), 'CHILD_INVOCATION_UNKNOWN');
  await assertRefused(deliverTerminal('hf32-p1', 'hf32-other-child', 1, 'done', { amount: 7 }), 'CHILD_INVOCATION_UNKNOWN');
  await assertRefused(deliverTerminal('hf32-p1', 'hf32-p1c', 42, 'done', { amount: 7 }), 'CHILD_INVOCATION_UNKNOWN');
  assert.equal(ledgerCalls.length, ledgerBefore);
});

test('HF32-N re-sending a settled invocation refuses typed (never re-opened)', async () => {
  const ledgerBefore = ledgerCalls.length;
  await assertRefused(sendChild('hf32-p1', 'hf32-p1c', 'runChildTask', { amount: 5 }, 1), 'CHILD_INVOCATION_SETTLED');
  assert.equal(ledgerCalls.length, ledgerBefore);
});

// ---------------------------------------------------------------------------
// HF32-N: a PERMANENT rejection commits durably BEFORE route selection and
// is NEVER misclassified as transient / retried
// ---------------------------------------------------------------------------

test('HF32-N a permanent child rejection (sealed role gate) settles durably rejected_routed and is never retried', async () => {
  await startWaiting('hf32-p3', 'm-p3-start');
  await activate('hf32-p3c');
  const ledgerBefore = ledgerCalls.length;

  // runChildTaskRestricted admits ONLY role child-worker — the requester's
  // submission is PERMANENTLY refused at the sealed Business gate.
  const rejected = await sendChild('hf32-p3', 'hf32-p3c', 'runChildTaskRestricted', { amount: 5 }) as {
    status: string;
    invocation: { status: string; rejection?: { code?: string } };
    rejection: { code: string };
  };
  assert.equal(rejected.status, 'rejected_routed');
  assert.equal(rejected.invocation.status, 'rejected');
  assert.equal(rejected.rejection.code, 'PRINCIPAL_ROLE_NOT_BOUND');
  const child = await stateOf('hf32-p3c');
  assert.equal(child.stateKey, 'review', 'the child state was never touched');
  assert.equal(ledgerCalls.length, ledgerBefore, 'zero effects for the rejected send');

  // The durable rejection truth is persisted BEFORE any route selection.
  const record = await gateway.queryChildInvocation(requester, {
    appId: APP_ID, parentInstanceKey: 'hf32-p3', childInstanceKey: 'hf32-p3c', invocationOrdinal: 1,
  }) as { status: string; rejection?: { code?: string } };
  assert.equal(record.status, 'rejected');
  assert.equal(record.rejection?.code, 'PRINCIPAL_ROLE_NOT_BOUND');

  // The rejected invocation is NEVER retried: a typed refusal, never a
  // transient re-send loop.
  await assertRefused(sendChild('hf32-p3', 'hf32-p3c', 'runChildTaskRestricted', { amount: 5 }, 1), 'CHILD_INVOCATION_REJECTED');
  assert.equal(ledgerCalls.length, ledgerBefore, 'still zero effects');
  assert.equal((await stateOf('hf32-p3c')).stateKey, 'review');

  // A terminal on the rejected invocation refuses typed as well.
  await assertRefused(deliverTerminal('hf32-p3', 'hf32-p3c', 1, 'done', { amount: 7 }), 'CHILD_INVOCATION_NOT_ACCEPTED');
  assert.equal(ledgerCalls.length, ledgerBefore);
});
