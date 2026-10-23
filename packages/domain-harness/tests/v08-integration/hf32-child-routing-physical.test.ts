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
 * N legs: a PERMANENT rejection commits durably BEFORE route selection
 * (rejected_routed) and the rejected invocation is NEVER retried (typed
 * refusal, never transient); duplicate child terminals and target
 * substitutions cannot double any effect. [#1066 R1 P1-A] a principal
 * without the child-intent Business role is refused BEFORE any durable
 * allocation, and an unauthorized outsider can neither poison a child
 * terminal nor allocate an invocation — the authorized terminal still
 * routes exactly once.
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

const fixtureDir = new URL('./fixtures/', import.meta.url);

const AUDIENCE = 'dh-v08-hf32';
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
    readFile(new URL('../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
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
  await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
  operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  outsider = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'out', roles: ['observer-only'], audience: AUDIENCE, grantId: 'g-out' });
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

function sendChildAs(credential: HostCredential, parentKey: string, childKey: string, childIntentType: string, input?: unknown, invocationOrdinal?: number): Promise<unknown> {
  return gateway.sendChildMessage(credential, {
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

function sendChild(parentKey: string, childKey: string, childIntentType: string, input?: unknown, invocationOrdinal?: number): Promise<unknown> {
  return sendChildAs(requester, parentKey, childKey, childIntentType, input, invocationOrdinal);
}

function deliverTerminalAs(credential: HostCredential, parentKey: string, childKey: string, ordinal: number, terminalKind: 'done' | 'error', input?: unknown): Promise<unknown> {
  return gateway.deliverChildTerminal(credential, {
    appId: APP_ID,
    parentInstanceKey: parentKey,
    childInstanceKey: childKey,
    invocationOrdinal: ordinal,
    terminalKind,
    ...(input === undefined ? {} : { input }),
  });
}

function deliverTerminal(parentKey: string, childKey: string, ordinal: number, terminalKind: 'done' | 'error', input?: unknown): Promise<unknown> {
  return deliverTerminalAs(requester, parentKey, childKey, ordinal, terminalKind, input);
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

test('HF32-N [#1066 R1 P1-A] a principal without the child-intent Business role is refused BEFORE any durable allocation; the durable-rejection truth stays for submission-time refusals', async () => {
  await startWaiting('hf32-p3', 'm-p3-start');
  await activate('hf32-p3c');
  const ledgerBefore = ledgerCalls.length;

  // runChildTaskRestricted admits ONLY role child-worker — the requester's
  // send is refused at the Host boundary BEFORE the invocation record is
  // allocated (the settlement-before-authorization root is closed: an
  // unauthorized principal allocates nothing durable).
  await assertRefused(sendChild('hf32-p3', 'hf32-p3c', 'runChildTaskRestricted', { amount: 5 }), 'HOST_CONTROL_ROLE_DENIED');
  const allocated = await gateway.queryChildInvocation(requester, {
    appId: APP_ID, parentInstanceKey: 'hf32-p3', childInstanceKey: 'hf32-p3c', invocationOrdinal: 1,
  }) as unknown;
  assert.equal(allocated, null, 'no durable invocation record was allocated for the unauthorized send');
  assert.equal((await stateOf('hf32-p3c')).stateKey, 'review', 'the child state was never touched');
  assert.equal(ledgerCalls.length, ledgerBefore, 'zero effects for the refused send');

  // The PERMANENT durable-rejection truth (all-or-durable-rejection) still
  // commits for a submission-time refusal that cannot be predicted at the
  // Host boundary: the child instance does not exist.
  const rejected = await sendChild('hf32-p3', 'hf32-nochild', 'runChildTask', { amount: 5 }) as {
    status: string;
    invocation: { status: string; rejection?: { code?: string } };
    rejection: { code: string };
  };
  assert.equal(rejected.status, 'rejected_routed');
  assert.equal(rejected.invocation.status, 'rejected');
  assert.equal(rejected.rejection.code, 'WORKFLOW_INSTANCE_NOT_FOUND');
  const record = await gateway.queryChildInvocation(requester, {
    appId: APP_ID, parentInstanceKey: 'hf32-p3', childInstanceKey: 'hf32-nochild', invocationOrdinal: 1,
  }) as { status: string; rejection?: { code?: string } };
  assert.equal(record.status, 'rejected');
  assert.equal(record.rejection?.code, 'WORKFLOW_INSTANCE_NOT_FOUND');

  // The rejected invocation is NEVER retried: a typed refusal, never a
  // transient re-send loop.
  await assertRefused(sendChild('hf32-p3', 'hf32-nochild', 'runChildTask', { amount: 5 }, 1), 'CHILD_INVOCATION_REJECTED');
  assert.equal(ledgerCalls.length, ledgerBefore, 'still zero effects');
  assert.equal((await stateOf('hf32-p3c')).stateKey, 'review');

  // A terminal on the rejected invocation refuses typed as well.
  await assertRefused(deliverTerminal('hf32-p3', 'hf32-nochild', 1, 'done', { amount: 7 }), 'CHILD_INVOCATION_NOT_ACCEPTED');
  assert.equal(ledgerCalls.length, ledgerBefore);
});

test('HF32-N [#1066 R1 P1-A] an unauthorized outsider cannot poison a child terminal or allocate a child invocation; the authorized terminal still routes exactly once', async () => {
  await startWaiting('hf32-p5', 'm-p5-start');
  await activate('hf32-p5c');
  const sent = await sendChild('hf32-p5', 'hf32-p5c', 'runChildTask', { amount: 5 }) as { status: string };
  assert.equal(sent.status, 'accepted');
  const before = await stateOf('hf32-p5');
  const ledgerBefore = ledgerCalls.length;

  // The outsider terminal delivery is refused BEFORE the settlement CAS —
  // the invocation is not poisoned and no outsider input is durably stored.
  await assertRefused(deliverTerminalAs(outsider, 'hf32-p5', 'hf32-p5c', 1, 'done', { amount: 999, evil: true }), 'HOST_CONTROL_ROLE_DENIED');
  const notPoisoned = await gateway.queryChildInvocation(requester, {
    appId: APP_ID, parentInstanceKey: 'hf32-p5', childInstanceKey: 'hf32-p5c', invocationOrdinal: 1,
  }) as { status: string; terminal?: unknown };
  assert.equal(notPoisoned.status, 'accepted', 'the invocation is still accepted — no outsider terminal was committed');
  assert.equal(notPoisoned.terminal, undefined, 'no outsider terminal input was durably stored');
  assert.equal((await stateOf('hf32-p5')).stateRevision, before.stateRevision, 'the refused terminal moved no state');
  assert.equal(ledgerCalls.length, ledgerBefore, 'the refused terminal dispatched no effect');

  // The authorized terminal still routes to the parent exactly once — the
  // pre-CAS gate did not break the legitimate routing path.
  const terminal = await deliverTerminal('hf32-p5', 'hf32-p5c', 1, 'done', { amount: 7 }) as {
    status: string;
    receipt: { admitted: { durableControlTurnId: string }; instance: { state: { stateKey: string } } };
  };
  assert.equal(terminal.status, 'accepted');
  assert.equal(terminal.receipt.admitted.durableControlTurnId, expectedTerminalTurnId('hf32-p5', 'hf32-p5c', 1, 'done'));
  assert.equal(terminal.receipt.instance.state.stateKey, 'childOk', 'the parent routed the authorized done terminal');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'exactly one parent effect');

  // The outsider child SEND is refused BEFORE the durable ordinal is
  // allocated — an unauthorized principal cannot even create the record a
  // later privileged caller would act on.
  await startWaiting('hf32-p6', 'm-p6-start');
  await activate('hf32-p6c');
  await assertRefused(sendChildAs(outsider, 'hf32-p6', 'hf32-p6c', 'runChildTask', { amount: 5 }), 'HOST_CONTROL_ROLE_DENIED');
  const allocated = await gateway.queryChildInvocation(requester, {
    appId: APP_ID, parentInstanceKey: 'hf32-p6', childInstanceKey: 'hf32-p6c', invocationOrdinal: 1,
  }) as unknown;
  assert.equal(allocated, null, 'no durable invocation record was allocated for the outsider send');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'still exactly one effect — only the authorized terminal ran');
});
