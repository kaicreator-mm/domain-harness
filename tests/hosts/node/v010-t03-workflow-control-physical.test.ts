/**
 * DomainHarness v0.10 T03 — physical witness: the selected Standard
 * workflow-control feature's bounded loop / child / WAIT / RESUME /
 * callback / deadline semantics performed across the REAL selected Kernel
 * payload (exact current bytes, data-URL import), the REAL Host
 * durable-controls coordinators and a REAL Node24 SQLite CAS file,
 * including close/reopen restart, duplicate delivery, lost-submission
 * heal and cross-B scoping.
 *
 * The feature is the semantic planner (proposals only); every durable
 * turn identity, state CAS, original receipt and effect authorization
 * belongs to the selected Kernel (K01/K02) — this file proves no second
 * workflow runtime exists: remove `plan` from every leg and nothing
 * admits, remove the Kernel and the feature has nothing to drive.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { openSqliteCasStore, type SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/sqlite-cas-store.js';
import { ChildInvocationCoordinator, ExternalWorkCoordinator } from '../../../packages/domain-harness/src/host-v8/durable-controls.js';

// Memoized boot (no top-level await: root tests load as CJS through tsx —
// the same discipline as the T02/T04 loaders).
let kernel: Record<string, any>;
let kernelSha = '';
let plan: (request: Record<string, any>, deps?: Record<string, any>) => any;
let dir = '';
let dbPath = '';
let booted: Promise<void> | undefined;
const bootOnce = (): Promise<void> =>
  (booted ??= (async () => {
    const kernelSource = await readFile(new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8');
    kernelSha = sha256.digestUtf8(kernelSource);
    kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`) as Record<string, any>;
    const featureSource = await readFile(new URL('../../../domain-packages/standard/features/workflow-control/modules/sfeature-workflow-control-v1.mjs', import.meta.url), 'utf8');
    const feature = await import(`data:text/javascript;base64,${Buffer.from(featureSource, 'utf8').toString('base64')}`) as Record<string, any>;
    plan = feature.planWorkflowControl as typeof plan;
    dir = await mkdtemp(path.join(tmpdir(), 'dh010-t03-'));
    dbPath = path.join(dir, 't03-physical.sqlite');
  })());

const sha256 = { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') };
const NOW_MS = Date.parse('2026-10-19T02:00:00.000Z');
const iso = (offsetMs: number) => new Date(NOW_MS + offsetMs).toISOString();

const SCOPE = { deployedAppId: 'deploy-t03', tenantId: 'tenant-t03', appId: 'app-t03', businessPackageId: 'pkg:t03:control' };
const SCOPE_B2 = { ...SCOPE, businessPackageId: 'pkg:t03:other-b' };
const enc = (value: string): string => value.replace(/%/g, '%25').replace(/:/g, '%3A');
const scopedPrefix = (scope: typeof SCOPE): string =>
  `v010-k02:${enc(scope.deployedAppId)}:${enc(scope.tenantId)}:${enc(scope.appId)}:${enc(scope.businessPackageId)}`;
const scopedInstanceKey = (scope: typeof SCOPE, workflowId: string, instanceKey: string): string =>
  `${scopedPrefix(scope)}:wf-instance:${enc(workflowId)}:${enc(instanceKey)}`;

const WORKFLOW_ID = 'wfc';
const target = (instanceKey: string) => ({ workflowId: WORKFLOW_ID, instanceKey });
const caller = { role: 'requester', subject: 'u1', tenantId: SCOPE.tenantId, appId: SCOPE.appId };

const workflow = {
  workflowKey: WORKFLOW_ID,
  initialState: 'active',
  initialContext: {},
  guards: [],
  states: [
    {
      stateKey: 'active',
      transitions: [
        { transitionKey: 'note', trigger: { kind: 'event', eventType: 'NOTED' }, targetState: 'active' },
        { transitionKey: 'waitOpen', trigger: { kind: 'event', eventType: 'WAIT_OPENED' }, targetState: 'waiting' },
        { transitionKey: 'childDone', trigger: { kind: 'event', eventType: 'CHILD_DONE' }, targetState: 'done' },
        { transitionKey: 'childError', trigger: { kind: 'event', eventType: 'CHILD_ERROR' }, targetState: 'failed' },
      ],
    },
    {
      stateKey: 'waiting',
      transitions: [
        {
          transitionKey: 'callbackArrived', trigger: { kind: 'event', eventType: 'CALLBACK' }, targetState: 'done',
          effectIntents: [{ effectType: 'effect:notify', input: { kind: 'resumed' }, idempotencyKey: 'notify:wfc:1' }],
        },
        { transitionKey: 'timeoutArrived', trigger: { kind: 'event', eventType: 'TIMEOUT' }, targetState: 'timedOut' },
      ],
    },
    { stateKey: 'done', kind: 'final' },
    { stateKey: 'failed', kind: 'final' },
    { stateKey: 'timedOut', kind: 'final' },
  ],
};

const intentBinding = (eventType: string) => ({ trigger: { kind: 'event', eventType }, ruleId: `rule:${eventType}`, roles: ['requester'] });
const policy = {
  packageId: 'pkg:t03:control@1.0.0',
  policyId: 'wfc-control',
  domainId: 'control',
  workflowDefinition: workflow,
  decisionSchema: { isValid: (value: any) => typeof value?.decision?.outcome === 'string' && typeof value?.event?.type === 'string' },
  governanceSemantics: { hardInvariants: [] },
  initialStateKey: 'active',
  initialContext: {},
  rules: {
    'rule:NOTED': { ruleId: 'rule:NOTED', eventType: 'NOTED', payloadFromInput: {} },
    'rule:WAIT_OPENED': { ruleId: 'rule:WAIT_OPENED', eventType: 'WAIT_OPENED', payloadFromInput: {} },
    'rule:CALLBACK': { ruleId: 'rule:CALLBACK', eventType: 'CALLBACK', payloadFromInput: {} },
    'rule:TIMEOUT': { ruleId: 'rule:TIMEOUT', eventType: 'TIMEOUT', payloadFromInput: {} },
    'rule:CHILD_DONE': { ruleId: 'rule:CHILD_DONE', eventType: 'CHILD_DONE', payloadFromInput: {} },
    'rule:CHILD_ERROR': { ruleId: 'rule:CHILD_ERROR', eventType: 'CHILD_ERROR', payloadFromInput: {} },
  },
  intentBindings: {
    loopNote: intentBinding('NOTED'),
    waitOpen: intentBinding('WAIT_OPENED'),
    callbackArrived: intentBinding('CALLBACK'),
    timeoutArrived: intentBinding('TIMEOUT'),
    childDone: intentBinding('CHILD_DONE'),
    childError: intentBinding('CHILD_ERROR'),
  },
  effectBindings: {
    'effect:notify': {
      semantics: 'non-idempotent',
      resource: { key: 'notify', operation: 'emit' },
      handler: async ({ input, effectId, resources }: any) => resources.call('notify', 'emit', { ...input, effectId }),
    },
  },
};

/** Trusted-seam resources port replica (the K01 R2 attest contract). */
function trustedDispatcherResources(onCall: (payload: any) => Promise<unknown> | unknown) {
  return {
    async call(resourceKey: string, _operation: string, payload: unknown, attest?: { preHandlerRefusal: string | null }) {
      if (resourceKey !== 'notify') {
        if (attest !== undefined && typeof attest === 'object') attest.preHandlerRefusal = 'HOST_RESOURCE_UNKNOWN';
        throw Object.assign(new Error(`resource ${resourceKey} is not provisioned on this host`), { code: 'HOST_RESOURCE_UNKNOWN' });
      }
      return onCall(payload);
    },
  };
}

function scopedRuntime(store: SqliteCasStore, scope: typeof SCOPE, resources: unknown) {
  return kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:v010-t03', moduleSha256: kernelSha },
    deploymentScope: scope,
    hostPorts: {
      docs: store,
      resources,
      sha256,
      clock: () => iso(0),
    },
    sdkEndpoint: {
      packageId: 'std:v010-t03',
      async interpret(declaration: { ruleId: string; eventType: string }) {
        return {
          source: 'harness-machine',
          structuredDecision: { decision: { outcome: 'decide', data: {} }, event: { type: declaration.eventType, payload: {} } },
          provenance: { ruleId: declaration.ruleId },
          llmAvoided: true,
          cacheDisposition: { read: 'disabled' },
          telemetry: [],
        };
      },
    },
    businessEndpoint: policy,
  });
}

async function openInstanceOnce(runtime: any, instanceKey: string): Promise<void> {
  try {
    await runtime.openInstance({ target: target(instanceKey), authorityClass: 'PRODUCTION' });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'HOST_CAS_CONFLICT' && code !== 'HOST_KEY_EXISTS') throw error;
  }
}

async function submit(runtime: any, occurrence: Record<string, unknown>): Promise<any> {
  return await runtime.submitOccurrence({ caller, target: target(occurrence.instanceKey as string), ...occurrence });
}

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const dispatches: unknown[] = [];
const resources = trustedDispatcherResources(async (payload: any) => {
  dispatches.push(payload);
  return { emitted: true };
});

// One shared physical file for every leg (scoped K doc keys + Host
// durable-control keys keep the concerns disjoint); tests run sequentially.
let store: SqliteCasStore | undefined;
const work = (): ExternalWorkCoordinator => new ExternalWorkCoordinator(store as SqliteCasStore);
const children = (): ChildInvocationCoordinator => new ChildInvocationCoordinator(store as SqliteCasStore);

test('T03-P1: bounded cycles admit exactly the planned steps on the real K; over-budget refuses typed with zero K activity', { timeout: 120_000 }, async () => {
  await bootOnce();
  store = await openSqliteCasStore({ path: dbPath });
  const runtime = scopedRuntime(store, SCOPE, resources);
  await openInstanceOnce(runtime, 'parent-1');
  assert.equal((await runtime.getSnapshot(target('parent-1'))).state.stateKey, 'active');

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const planned = plan({
      kind: 'loop.next',
      target: target('parent-1'),
      control: { loopId: 'l1', iteration, maxIterations: 3, stepIntentTypes: ['loopNote'], deadlineEpochMs: NOW_MS + 60_000 },
      step: { intentType: 'loopNote', input: { n: iteration } },
    }, { now: () => NOW_MS });
    assert.equal(planned.action, 'submit');
    const receipt = await submit(runtime, { instanceKey: 'parent-1', intentType: planned.proposal.intentType, messageId: planned.proposal.messageId, input: planned.proposal.input });
    assert.equal(receipt.status, 'admitted');
    assert.equal(receipt.instance.stateRevision, iteration + 1);
  }
  assert.equal((await runtime.getSnapshot(target('parent-1'))).state.stateKey, 'active', 'self-loop steps keep the state, advance the revision');

  // The K02 original receipts of all three turns ride the SAME instance row.
  const row = (await store.get(scopedInstanceKey(SCOPE, WORKFLOW_ID, 'parent-1'))) as { revision: number; value: Record<string, any> };
  const ring = row.value.durableOriginalReceipts ?? {};
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const messageId = `wfc/loop/wfc/parent-1/l1/${String(iteration)}`;
    const turnId = `turn:${encodeURIComponent(WORKFLOW_ID)}:${encodeURIComponent('parent-1')}:message:${encodeURIComponent(messageId)}`;
    assert.ok(ring[turnId] !== undefined, `original receipt of loop step ${String(iteration)} rides the instance document`);
  }

  // The 4th, over-budget plan refuses BEFORE any K activity.
  const admissions = runtime.counters.admissions;
  assert.throws(
    () => plan({
      kind: 'loop.next', target: target('parent-1'),
      control: { loopId: 'l1', iteration: 3, maxIterations: 3, stepIntentTypes: ['loopNote'] },
      step: { intentType: 'loopNote', input: {} },
    }, { now: () => NOW_MS }),
    code('WORKFLOW_BUDGET_EXHAUSTED'),
  );
  assert.equal(runtime.counters.admissions, admissions, 'the typed refusal produced zero Kernel activity');
  await store.close();
});

test('T03-P2: parent/child through the real ChildInvocationCoordinator; the exact child resumes the parent exactly once', { timeout: 120_000 }, async () => {
  await bootOnce();
  store = await openSqliteCasStore({ path: dbPath });
  const runtime = scopedRuntime(store, SCOPE, resources);
  const coordinator = children();
  await openInstanceOnce(runtime, 'parent-c');
  await openInstanceOnce(runtime, 'child-1');

  const planned = plan({
    kind: 'child.open', target: target('parent-c'),
    control: { childInstanceKey: 'child-1', invocationOrdinal: 1, lineageDepth: 1, childIntentType: 'loopNote', doneIntentType: 'childDone', errorIntentType: 'childError' },
  });
  assert.equal(planned.action, 'open-child');

  const depth = await coordinator.deriveLineageDepth({ appId: SCOPE.appId, tenantId: SCOPE.tenantId, parentInstanceKey: 'parent-c' });
  assert.equal(depth, 1, 'a lineage root edge carries depth 1');
  const opened = await coordinator.open({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, parentInstanceKey: 'parent-c', childInstanceKey: 'child-1',
    invocationOrdinal: 1, lineageDepth: depth, childIntentType: 'loopNote', doneIntentType: 'childDone', errorIntentType: 'childError',
    openedAt: iso(1_000),
  });
  assert.equal(opened.disposition, 'created');
  assert.equal(opened.record.childTurnMessageId, `child-msg:${planned.proposal.expectedCorrelationId}`, 'the feature identity grammar matches the durable Host record');

  const accepted = await coordinator.settleSend({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, record: opened.record, outcome: 'accepted', settledAt: iso(2_000),
  });
  assert.equal(accepted.status, 'accepted');
  // The child turn is admitted on the CHILD K instance.
  const childReceipt = await submit(runtime, { instanceKey: 'child-1', intentType: 'loopNote', messageId: opened.record.childTurnMessageId, input: { started: true } });
  assert.equal(childReceipt.status, 'admitted');

  const terminal = await coordinator.settleTerminal({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, parentInstanceKey: 'parent-c', childInstanceKey: 'child-1',
    invocationOrdinal: 1, terminalKind: 'done', terminalInput: { value: 7 }, settledAt: iso(3_000),
  });
  assert.equal(terminal.disposition, 'accepted');
  const parentTurnSource = (terminal.plan as any).parentTurnSource;

  const resume = plan({
    kind: 'control.resume', target: target('parent-c'),
    control: { expected: { parentActorId: 'parent-c', childActorId: 'child-1', invocationOrdinal: 1, doneIntentType: 'childDone', scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } } },
    settled: { source: parentTurnSource, status: terminal.record.status, scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } },
  });
  assert.equal(resume.action, 'submit');
  assert.deepEqual(resume.proposal.turnSource, parentTurnSource, 'the feature proposes exactly the durable child-terminal turn source');

  const parentReceipt = await submit(runtime, { instanceKey: 'parent-c', intentType: resume.proposal.intentType, messageId: resume.proposal.messageId, input: resume.proposal.input, turnSource: resume.proposal.turnSource });
  assert.equal(parentReceipt.status, 'admitted');
  assert.equal((await runtime.getSnapshot(target('parent-c'))).state.stateKey, 'done');

  // A re-delivery of the same terminal plans an idempotent replay: the same
  // K turn identity replays from its original receipt, zero new activity.
  const again = await coordinator.settleTerminal({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, parentInstanceKey: 'parent-c', childInstanceKey: 'child-1',
    invocationOrdinal: 1, terminalKind: 'done', terminalInput: { value: 7 }, settledAt: iso(4_000),
  });
  assert.equal(again.disposition, 'already-terminal');
  const replay = plan({
    kind: 'control.resume', target: target('parent-c'),
    control: { expected: { parentActorId: 'parent-c', childActorId: 'child-1', invocationOrdinal: 1, doneIntentType: 'childDone', scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } } },
    settled: { source: parentTurnSource, status: again.record.status, submittedTurn: { messageId: resume.proposal.messageId, submittedAt: iso(4_000) }, scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } },
  });
  assert.equal(replay.action, 'replay');

  // The wrong child has no durable invocation: typed refusal, parent K untouched.
  const admissions = runtime.counters.admissions;
  await assert.rejects(
    coordinator.settleTerminal({
      appId: SCOPE.appId, tenantId: SCOPE.tenantId, parentInstanceKey: 'parent-c', childInstanceKey: 'child-OTHER',
      invocationOrdinal: 1, terminalKind: 'done', settledAt: iso(5_000),
    }),
    code('CHILD_INVOCATION_UNKNOWN'),
  );
  assert.throws(
    () => plan({
      kind: 'control.resume', target: target('parent-c'),
      control: { expected: { parentActorId: 'parent-c', childActorId: 'child-1', invocationOrdinal: 1, doneIntentType: 'childDone' } },
      settled: { source: { ...parentTurnSource, childActorId: 'child-OTHER' }, status: 'done' },
    }),
    code('WORKFLOW_RESUME_MISMATCH'),
  );
  assert.equal(runtime.counters.admissions, admissions);
  await store.close();
});

test('T03-P3: WAIT survives a REAL SQLite restart; one callback resumes once, duplicates and lost submissions replay zero-effect', { timeout: 120_000 }, async () => {
  await bootOnce();
  store = await openSqliteCasStore({ path: dbPath });
  let runtime = scopedRuntime(store, SCOPE, resources);
  await openInstanceOnce(runtime, 'parent-w');

  const wait = plan({
    kind: 'wait.open', target: target('parent-w'),
    control: { externalCorrelationId: 'corr-1', deadlineTimerId: 'timer-1', dueAt: iso(30_000), callbackIntentType: 'callbackArrived', timeoutIntentType: 'timeoutArrived' },
  }, { now: () => NOW_MS });
  const registered = await work().register({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-w',
    externalCorrelationId: wait.proposal.externalCorrelationId, deadlineTimerId: wait.proposal.deadlineTimerId,
    dueAt: wait.proposal.dueAt, callbackIntentType: wait.proposal.callbackIntentType, timeoutIntentType: wait.proposal.timeoutIntentType,
    registeredAt: iso(0),
  });
  assert.equal(registered.disposition, 'created');
  const openReceipt = await submit(runtime, { instanceKey: 'parent-w', intentType: 'waitOpen', messageId: 'wfc/wait/parent-w/corr-1', input: { correlation: 'corr-1' } });
  assert.equal(openReceipt.status, 'admitted');
  assert.equal((await runtime.getSnapshot(target('parent-w'))).state.stateKey, 'waiting');

  // ===== REAL restart: close the SQLite file, reopen, rebuild the seams =====
  await store.close();
  await bootOnce();
  store = await openSqliteCasStore({ path: dbPath });
  globalThis.__t03Store = store;
  runtime = scopedRuntime(store, SCOPE, resources);
  const survived = await work().read(SCOPE.appId, SCOPE.tenantId, 'parent-w', 'corr-1');
  assert.equal(survived.status, 'waiting', 'the WAIT checkpoint survived the physical restart');
  assert.equal((await runtime.getSnapshot(target('parent-w'))).state.stateKey, 'waiting', 'the parent K state survived the physical restart');

  const settled = await work().settleCallback({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-w', externalCorrelationId: 'corr-1',
    callbackOrdinal: 1, payload: { approved: true }, receivedAt: iso(1_000),
  });
  assert.equal(settled.disposition, 'accepted');
  assert.equal(settled.messageId, wait.proposal.callbackMessageId, 'the feature resume identity equals the durable coordinator truth');

  const resume = plan({
    kind: 'control.resume', target: target('parent-w'),
    control: { expected: { externalCorrelationId: 'corr-1', callbackIntentType: 'callbackArrived', scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } } },
    settled: { source: settled.turnSource, status: settled.record.status, scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } },
  });
  assert.equal(resume.action, 'submit');
  assert.deepEqual(resume.proposal.turnSource, { kind: 'callback', externalCorrelationId: 'corr-1', callbackOrdinal: 1 });

  const resumed = await submit(runtime, { instanceKey: 'parent-w', intentType: resume.proposal.intentType, messageId: resume.proposal.messageId, input: resume.proposal.input, turnSource: resume.proposal.turnSource });
  assert.equal(resumed.status, 'admitted');
  assert.notEqual(resumed.idempotentReplay, true, 'the first resume is a fresh admission');
  assert.equal((await runtime.getSnapshot(target('parent-w'))).state.stateKey, 'done');
  assert.equal(dispatches.length, 1, 'the resumed decision dispatched its effect exactly once — K owns the side effect');

  await work().markSubmitted(SCOPE.appId, SCOPE.tenantId, 'parent-w', 'corr-1', resume.proposal.messageId, iso(2_000));

  // Duplicate callback delivery: typed duplicate, and the planned REPLAY of
  // the same turn identity answers from the K original receipt.
  const duplicate = await work().settleCallback({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-w', externalCorrelationId: 'corr-1',
    callbackOrdinal: 1, payload: { approved: true }, receivedAt: iso(3_000),
  });
  assert.equal(duplicate.disposition, 'duplicate');
  const replayPlan = plan({
    kind: 'control.resume', target: target('parent-w'),
    control: { expected: { externalCorrelationId: 'corr-1', callbackIntentType: 'callbackArrived', scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } } },
    settled: { source: (duplicate.record as any).terminalSource, status: duplicate.record.status, submittedTurn: (duplicate.record as any).submittedTurn, scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } },
  });
  assert.equal(replayPlan.action, 'replay');
  const replayed = await submit(runtime, { instanceKey: 'parent-w', intentType: replayPlan.proposal.intentType, messageId: replayPlan.proposal.messageId, input: replayPlan.proposal.input, turnSource: replayPlan.proposal.turnSource });
  assert.equal(replayed.status, 'admitted');
  assert.equal(replayed.idempotentReplay, true, 'the K replayed the completed turn from its original receipt');
  assert.equal(dispatches.length, 1, 'a duplicate callback produced zero new effect');

  // Lost-submission heal: a second correlation settles, the process "crashes"
  // before submission; after ANOTHER restart the same identity replays.
  await openInstanceOnce(runtime, 'parent-w2');
  const opened2 = await submit(runtime, { instanceKey: 'parent-w2', intentType: 'waitOpen', messageId: 'wfc/wait/parent-w2/corr-2', input: { correlation: 'corr-2' } });
  assert.equal(opened2.status, 'admitted');
  const wait2 = plan({
    kind: 'wait.open', target: target('parent-w2'),
    control: { externalCorrelationId: 'corr-2', deadlineTimerId: 'timer-2', dueAt: iso(60_000), callbackIntentType: 'callbackArrived', timeoutIntentType: 'timeoutArrived' },
  }, { now: () => NOW_MS });
  await work().register({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-w2',
    externalCorrelationId: 'corr-2', deadlineTimerId: 'timer-2', dueAt: wait2.proposal.dueAt,
    callbackIntentType: 'callbackArrived', timeoutIntentType: 'timeoutArrived', registeredAt: iso(0),
  });
  const settled2 = await work().settleCallback({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-w2', externalCorrelationId: 'corr-2',
    callbackOrdinal: 1, payload: { ok: true }, receivedAt: iso(2_000),
  });
  assert.equal(settled2.disposition, 'accepted');
  // (crash window: no markSubmitted, no Kernel submission yet)
  await store.close();
  await bootOnce();
  store = await openSqliteCasStore({ path: dbPath });
  globalThis.__t03Store = store;
  runtime = scopedRuntime(store, SCOPE, resources);
  const healPlan = plan({
    kind: 'control.resume', target: target('parent-w2'),
    control: { expected: { externalCorrelationId: 'corr-2', callbackIntentType: 'callbackArrived', scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } } },
    settled: { source: settled2.turnSource, status: settled2.record.status, scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } },
  });
  assert.equal(healPlan.action, 'submit', 'the settled-but-unsubmitted turn still plans a first submission after restart');
  const healed = await submit(runtime, { instanceKey: 'parent-w2', intentType: healPlan.proposal.intentType, messageId: healPlan.proposal.messageId, input: healPlan.proposal.input, turnSource: healPlan.proposal.turnSource });
  assert.equal(healed.status, 'admitted');
  assert.notEqual(healed.idempotentReplay, true);
  assert.equal(dispatches.length, 2, 'the healed correlation dispatched exactly its one effect');
  await store.close();
});

test('T03-P4: the deadline race is bounded and one-shot; late callbacks and early fires are typed with zero K activity', { timeout: 120_000 }, async () => {
  await bootOnce();
  store = await openSqliteCasStore({ path: dbPath });
  const runtime = scopedRuntime(store, SCOPE, resources);
  await openInstanceOnce(runtime, 'parent-d');
  await submit(runtime, { instanceKey: 'parent-d', intentType: 'waitOpen', messageId: 'wfc/wait/parent-d/corr-d', input: { correlation: 'corr-d' } });

  const wait = plan({
    kind: 'wait.open', target: target('parent-d'),
    control: { externalCorrelationId: 'corr-d', deadlineTimerId: 'timer-d', dueAt: iso(5_000), callbackIntentType: 'callbackArrived', timeoutIntentType: 'timeoutArrived' },
  }, { now: () => NOW_MS });
  await work().register({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-d',
    externalCorrelationId: 'corr-d', deadlineTimerId: 'timer-d', dueAt: wait.proposal.dueAt,
    callbackIntentType: 'callbackArrived', timeoutIntentType: 'timeoutArrived', registeredAt: iso(0),
  });

  // Early fire: typed, zero mutation.
  await assert.rejects(
    work().settleDeadline({ appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-d', externalCorrelationId: 'corr-d', timerId: 'timer-d', fireOrdinal: 1, firedAt: iso(1_000) }),
    code('DEADLINE_NOT_DUE'),
  );
  // Foreign timer: typed.
  await assert.rejects(
    work().settleDeadline({ appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-d', externalCorrelationId: 'corr-d', timerId: 'timer-X', fireOrdinal: 1, firedAt: iso(6_000) }),
    code('DEADLINE_TIMER_MISMATCH'),
  );

  // The due deadline wins the race.
  const fired = await work().settleDeadline({ appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-d', externalCorrelationId: 'corr-d', timerId: 'timer-d', fireOrdinal: 1, firedAt: iso(6_000) });
  assert.equal(fired.disposition, 'accepted');
  const timeoutPlan = plan({
    kind: 'control.resume', target: target('parent-d'),
    control: { expected: { externalCorrelationId: 'corr-d', deadlineTimerId: 'timer-d', timeoutIntentType: 'timeoutArrived', scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } } },
    settled: { source: fired.turnSource, status: fired.record.status, scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } },
  });
  assert.equal(timeoutPlan.proposal.intentType, 'timeoutArrived');
  const timeoutReceipt = await submit(runtime, { instanceKey: 'parent-d', intentType: timeoutPlan.proposal.intentType, messageId: timeoutPlan.proposal.messageId, input: {}, turnSource: timeoutPlan.proposal.turnSource });
  assert.equal(timeoutReceipt.status, 'admitted');
  assert.equal((await runtime.getSnapshot(target('parent-d'))).state.stateKey, 'timedOut', 'the deadline produced the bounded timeout exit');
  const dispatchesBeforeLate = dispatches.length;

  // The late callback loses the race: typed outcome, and the feature plans
  // NO resume turn for the losing delivery.
  const late = await work().settleCallback({
    appId: SCOPE.appId, tenantId: SCOPE.tenantId, instanceKey: 'parent-d', externalCorrelationId: 'corr-d',
    callbackOrdinal: 1, payload: { too: 'late' }, receivedAt: iso(7_000),
  });
  assert.equal(late.disposition, 'late_after_timeout');
  assert.throws(
    () => plan({
      kind: 'control.resume', target: target('parent-d'),
      control: { expected: { externalCorrelationId: 'corr-d', callbackIntentType: 'callbackArrived', scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } } },
      settled: { source: { kind: 'callback', externalCorrelationId: 'corr-d', callbackOrdinal: 1 }, status: late.record.status, scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } },
    }),
    code('WORKFLOW_RESUME_MISMATCH'),
  );
  assert.equal(dispatches.length, dispatchesBeforeLate, 'the losing callback dispatched nothing');
  await store.close();
});

test('T03-P5/N: two Businesses with the identical workflow+instanceKey stay physically disjoint; foreign resumes refuse typed', { timeout: 120_000 }, async () => {
  await bootOnce();
  store = await openSqliteCasStore({ path: dbPath });
  const b1 = scopedRuntime(store, SCOPE, resources);
  const b2 = scopedRuntime(store, SCOPE_B2, resources);
  await openInstanceOnce(b1, 'shared-key');
  await openInstanceOnce(b2, 'shared-key');

  const step = (iteration: number) => plan({
    kind: 'loop.next', target: target('shared-key'),
    control: { loopId: 'lb', iteration, maxIterations: 1, stepIntentTypes: ['loopNote'] },
    step: { intentType: 'loopNote', input: { b: 2 } },
  }, { now: () => NOW_MS });
  const b2Receipt = await submit(b2, { instanceKey: 'shared-key', intentType: step(0).proposal.intentType, messageId: step(0).proposal.messageId, input: { b: 2 } });
  assert.equal(b2Receipt.status, 'admitted');

  const b1Snapshot = await b1.getSnapshot(target('shared-key'));
  assert.equal(b1Snapshot.stateRevision, 0, 'B1 state never moved: the same logical target in B2 admitted against DISJOINT K documents');
  assert.equal(b2Receipt.instance.stateRevision, 1);

  const b1Keys = await store.list(`${scopedPrefix(SCOPE)}:wf-instance:`);
  const b2Keys = await store.list(`${scopedPrefix(SCOPE_B2)}:wf-instance:`);
  assert.equal(b1Keys.filter((key: string) => key.endsWith(enc('shared-key'))).length, 1);
  assert.equal(b2Keys.filter((key: string) => key.endsWith(enc('shared-key'))).length, 1);
  assert.notDeepEqual(b1Keys, b2Keys, 'the two Businesses occupy disjoint doc namespaces');

  // A settled delivery from B1's scope never resumes a B2 binding.
  assert.throws(
    () => plan({
      kind: 'control.resume', target: target('shared-key'),
      control: { expected: { externalCorrelationId: 'corr-x', callbackIntentType: 'callbackArrived', scope: { appId: SCOPE.appId, tenantId: SCOPE.tenantId } } },
      settled: { source: { kind: 'callback', externalCorrelationId: 'corr-x', callbackOrdinal: 1 }, status: 'callback_received', scope: { appId: SCOPE.appId, tenantId: 'tenant-OTHER' } },
    }),
    code('WORKFLOW_RESUME_MISMATCH'),
  );
  const admissionsB1 = b1.counters.admissions;
  const admissionsB2 = b2.counters.admissions;
  assert.equal(admissionsB1, 0, 'B1 submitted zero occurrences: only B2 moved the shared logical target');
  assert.ok(admissionsB2 >= 1);
  await store.close();
});

after(async () => {
  if (dir !== '') {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  if (store !== undefined) {
    await store.close().catch(() => {});
  }
});
