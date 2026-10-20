/**
 * v0.8.1 R02 — a stale admission can never defeat the selected Kernel's state CAS.
 * ================================================================================
 *
 * The per-instance serialized lane is in-process only. Two Kernel runtimes
 * over ONE durable store (= two Host processes over one SQLite file) each
 * hold their own lane, so the v0.7 `expectedTargetSequence` discipline must
 * be enforced by the durable store itself. Before v0.8.1 the selected
 * payload re-read the instance at commit and CASed on the FRESH revision: a
 * slow admission decided against a stale snapshot overwrote a committed
 * FINAL state and dispatched a non-idempotent production effect.
 *
 * Physical witnesses over the REAL Node Host SqliteCasStore (two
 * independent handles on one file) and the EXACT selected kernel payload
 * bytes (data-URL import, installer discipline):
 *
 *   R02-N1  B decides slowly against review@0; A commits review → rejected
 *           (FINAL). B refuses typed ADMISSION_STATE_CAS_CONFLICT with ZERO
 *           journal rows and ZERO dispatches; the FINAL state stands.
 *   R02-N2  reverse winner: the effect-bearing admission commits first; the
 *           stale effect-free admission refuses typed; exactly ONE journal
 *           row and ONE dispatch exist.
 *   R02-P   sequential admissions alternating between both runtimes (each
 *           reading the fresh snapshot) keep admitting, effect executes once.
 *   R02-a   engine commit honors expectedTargetSequence (typed refusal, no
 *           write) instead of CASing on a fresh re-read.
 *   R02-b   a displaced admission-fence holder can never commit; a claim at
 *           a stale fence revision refuses typed.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { openSqliteCasStore, type SqliteCasStore } from '../../src/host-v8/index.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const KERNEL_SOURCE = await readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8');
const KERNEL_SHA256 = createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex');
const kernel: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(KERNEL_SOURCE, 'utf8').toString('base64')}`);

const NOW = '2026-10-16T00:00:00.000Z';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const sqlitePath = join(tmpdir(), `dh081-r02-${String(process.pid)}-${String(Date.now())}.sqlite`);
const storeA: SqliteCasStore = await openSqliteCasStore({ path: sqlitePath });
const storeB: SqliteCasStore = await openSqliteCasStore({ path: sqlitePath });

after(async () => {
  await storeA.close();
  await storeB.close();
  for (const suffix of ['', '-wal', '-shm']) {
    await rm(`${sqlitePath}${suffix}`, { force: true });
  }
});

const dispatches: unknown[] = [];

const workflow = {
  workflowKey: 'quote',
  initialState: 'review',
  initialContext: {},
  guards: [],
  states: [
    {
      stateKey: 'review',
      transitions: [
        {
          transitionKey: 'approve', trigger: { kind: 'event', eventType: 'APPROVED' }, targetState: 'approved',
          effectIntents: [{ effectType: 'effect:reserve', input: { amount: 42 }, idempotencyKey: 'reserve:q1' }],
        },
        { transitionKey: 'reject', trigger: { kind: 'event', eventType: 'REJECTED' }, targetState: 'rejected' },
        { transitionKey: 'note', trigger: { kind: 'event', eventType: 'NOTED' }, targetState: 'review' },
      ],
    },
    { stateKey: 'approved', kind: 'final' },
    { stateKey: 'rejected', kind: 'final' },
  ],
};

const rule = (ruleId: string, eventType: string) => ({ ruleId, eventType, payloadFromInput: {} });
const policy = {
  packageId: 'biz:quote@1.0.0',
  policyId: 'quote',
  domainId: 'sales',
  workflowDefinition: workflow,
  decisionSchema: { isValid: (value: any) => typeof value?.event?.type === 'string' },
  governanceSemantics: { hardInvariants: [] },
  initialStateKey: 'review',
  initialContext: {},
  rules: {
    'rule:approve': rule('rule:approve', 'APPROVED'),
    'rule:reject': rule('rule:reject', 'REJECTED'),
    'rule:note': rule('rule:note', 'NOTED'),
  },
  intentBindings: {
    approve: { trigger: { kind: 'event', eventType: 'APPROVED' }, ruleId: 'rule:approve', roles: ['approver'] },
    reject: { trigger: { kind: 'event', eventType: 'REJECTED' }, ruleId: 'rule:reject', roles: ['approver'] },
    note: { trigger: { kind: 'event', eventType: 'NOTED' }, ruleId: 'rule:note', roles: ['approver'] },
  },
  effectBindings: {
    'effect:reserve': {
      semantics: 'non-idempotent',
      handler: async ({ input, effectId, resources }: { input: Record<string, unknown>; effectId: string; resources: { call: (key: string, op: string, payload: unknown) => Promise<unknown> } }) =>
        resources.call('ledger', 'reserve', { ...input, effectId }),
    },
  },
};

/** A slow decision (e.g. a ModelPort turn) that parks until released. */
interface SlowGate {
  ruleId: string;
  /** Resolves once the parked decision has started (its snapshot is read). */
  entered: Promise<void>;
  release: () => void;
  park: () => Promise<void>;
}

function slowGate(ruleId: string): SlowGate {
  let release!: () => void;
  let markEntered!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { markEntered = resolve; });
  return { ruleId, entered, release, park: async () => { markEntered(); await released; } };
}

function runtime(docs: SqliteCasStore, gate?: SlowGate) {
  return kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:r02', moduleSha256: KERNEL_SHA256 },
    hostPorts: {
      docs,
      resources: { async call(_key: string, _op: string, payload: unknown) { dispatches.push(payload); return { reserved: true }; } },
      sha256: { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint: {
      packageId: 'std:r02',
      async interpret(declaration: { ruleId: string; eventType: string }) {
        if (gate !== undefined && declaration.ruleId === gate.ruleId) await gate.park();
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

const caller = { role: 'approver', subject: 'u', tenantId: 't', appId: 'a' };
const target = (instanceKey: string) => ({ workflowId: 'quote', instanceKey });

async function journalRows(instanceKey: string): Promise<number> {
  const keys = await storeA.list(JOURNAL_PREFIX);
  return keys.filter((key) => key.includes(encodeURIComponent(instanceKey))).length;
}

test('R02-N1 two runtimes on one SQLite file: the stale admission refuses typed before any journal/effect; the FINAL state stands', async () => {
  const gate = slowGate('rule:approve');
  const processA = runtime(storeA);
  const processB = runtime(storeB, gate);
  await processA.openInstance({ target: target('t:a:n1'), authorityClass: 'PRODUCTION' });
  const dispatchBefore = dispatches.length;

  const pendingApprove = processB.submitOccurrence({ intentType: 'approve', messageId: 'm-approve', input: {}, target: target('t:a:n1'), caller });
  await gate.entered; // B read its snapshot @0 and parks inside the decision
  const rejected = await processA.submitOccurrence({ intentType: 'reject', messageId: 'm-reject', input: {}, target: target('t:a:n1'), caller });
  assert.equal(rejected.status, 'admitted');
  assert.equal(rejected.instance.state.stateKey, 'rejected');
  assert.equal(rejected.instance.stateRevision, 1);

  gate.release();
  await assert.rejects(pendingApprove, (error: unknown) => {
    const typed = error as { name?: string; code?: string };
    return typed.name === 'CentralAdmissionError' && typed.code === 'ADMISSION_STATE_CAS_CONFLICT';
  });

  const final = await processA.getSnapshot(target('t:a:n1'));
  assert.equal(final.state.stateKey, 'rejected', 'the committed FINAL rejection is never overwritten');
  assert.equal(final.stateRevision, 1);
  assert.equal(final.lifecycle, 'completed');
  assert.equal(dispatches.length, dispatchBefore, 'zero physical dispatches of the non-idempotent effect');
  assert.equal(await journalRows('t:a:n1'), 0, 'zero journal rows: the stale admission lost before journal begin');
});

test('R02-N2 reverse winner: the effect-bearing admission commits, the stale effect-free admission refuses typed', async () => {
  const gate = slowGate('rule:reject');
  const processA = runtime(storeA, gate);
  const processB = runtime(storeB);
  await processA.openInstance({ target: target('t:a:n2'), authorityClass: 'PRODUCTION' });
  const dispatchBefore = dispatches.length;

  const pendingReject = processA.submitOccurrence({ intentType: 'reject', messageId: 'm-reject', input: {}, target: target('t:a:n2'), caller });
  await gate.entered;
  const approved = await processB.submitOccurrence({ intentType: 'approve', messageId: 'm-approve', input: {}, target: target('t:a:n2'), caller });
  assert.equal(approved.status, 'admitted');
  assert.equal(approved.instance.state.stateKey, 'approved');

  gate.release();
  await assert.rejects(pendingReject, (error: unknown) => (error as { code?: string }).code === 'ADMISSION_STATE_CAS_CONFLICT');

  const final = await processB.getSnapshot(target('t:a:n2'));
  assert.equal(final.state.stateKey, 'approved');
  assert.equal(final.stateRevision, 1);
  assert.equal(dispatches.length, dispatchBefore + 1, 'exactly ONE dispatch: the winner\'s');
  assert.equal(await journalRows('t:a:n2'), 1, 'exactly ONE journal row');
});

test('R02-P sequential admissions alternating across both runtimes keep admitting; the effect executes once', async () => {
  const processA = runtime(storeA);
  const processB = runtime(storeB);
  await processA.openInstance({ target: target('t:a:p1'), authorityClass: 'PRODUCTION' });
  const dispatchBefore = dispatches.length;

  const first = await processA.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: target('t:a:p1'), caller });
  const second = await processB.submitOccurrence({ intentType: 'note', messageId: 'm-note-2', input: {}, target: target('t:a:p1'), caller });
  const approved = await processA.submitOccurrence({ intentType: 'approve', messageId: 'm-approve', input: {}, target: target('t:a:p1'), caller });
  assert.deepEqual(
    [first.instance.stateRevision, second.instance.stateRevision, approved.instance.stateRevision],
    [1, 2, 3],
  );
  assert.equal(approved.status, 'admitted');
  assert.equal(approved.admitted.effects[0].disposition, 'executed');
  assert.equal(dispatches.length, dispatchBefore + 1);

  const late = await processB.submitOccurrence({ intentType: 'reject', messageId: 'm-reject', input: {}, target: target('t:a:p1'), caller });
  assert.equal(late.status, 'denied', 'a fresh admission against the FINAL state is an honest typed denial');
  assert.equal(late.denial.reason, 'no-candidate-transition');
});

test('R02-a engine commit honors expectedTargetSequence: a stale sequence refuses typed and writes nothing', async () => {
  const engine = new kernel.WorkflowInstanceEngine(storeA, { now: () => NOW });
  const address = target('t:a:engine');
  await engine.createInstance({ address, correlationId: 'c', packageId: 'biz:quote@1.0.0', initialState: { stateKey: 'review', context: {} } });
  const transition = (stateKey: string) => () => ({ nextState: { stateKey, context: {} } });

  const committed = await engine.processAcceptedTransition({ target: address, messageId: 'm1', expectedTargetSequence: 0, transition: transition('approved') });
  assert.equal(committed.stateRevision, 1);
  await assert.rejects(
    engine.processAcceptedTransition({ target: address, messageId: 'm2', expectedTargetSequence: 0, transition: transition('rejected') }),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_STATE_CAS_CONFLICT',
  );
  const current = await engine.getInstance(address);
  assert.equal(current.stateRevision, 1);
  assert.equal(current.state.stateKey, 'approved');
});

test('R02-b/K01 a same-revision competing fence claim refuses (#1108); same-turn replay and post-commit supersede stay legal', async () => {
  const engine = new kernel.WorkflowInstanceEngine(storeA, { now: () => NOW });
  const engineB = new kernel.WorkflowInstanceEngine(storeB, { now: () => NOW });
  const address = target('t:a:fence');
  await engine.createInstance({ address, correlationId: 'c', packageId: 'biz:quote@1.0.0', initialState: { stateKey: 'review', context: {} } });

  assert.equal(await engine.readAdmissionFenceRevision(address), null);
  const turnIdentity = 'r02-direct:turn-x:canonical-empty';
  const original = await engine.claimAdmissionFence({ target: address, turnId: 'turn:x', turnIdentity, expectedTargetSequence: 0, snapshotFenceRevision: null });
  // A claim whose own snapshot predates the holder's claim (stale
  // snapshotFenceRevision) still refuses — pre-existing #1100 discipline.
  await assert.rejects(
    engineB.claimAdmissionFence({ target: address, turnId: 'turn:stale', expectedTargetSequence: 0, snapshotFenceRevision: null }),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_STATE_CAS_CONFLICT',
  );
  // [#1108 K01] A FRESH-snapshot rival (its read observed the holder's fence
  // revision) must ALSO refuse at the same stateRevision: pre-fix this claim
  // CAS-overwrote the in-flight holder, letting the rival dispatch a competing
  // non-idempotent effect and orphan the first writer's dispatch. The holder is
  // protected until it commits, fails unambiguously, or is reconciled by replay.
  const observed = await engineB.readAdmissionFenceRevision(address);
  await assert.rejects(
    engineB.claimAdmissionFence({ target: address, turnId: 'turn:y', expectedTargetSequence: 0, snapshotFenceRevision: observed }),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_STATE_CAS_CONFLICT',
  );
  // Same canonical turn attaches read-only; an in-flight holder must retain its CAS revision.
  const reclaimed = await engine.claimAdmissionFence({ target: address, turnId: 'turn:x', turnIdentity, expectedTargetSequence: 0, snapshotFenceRevision: await engine.readAdmissionFenceRevision(address) });
  assert.equal(reclaimed.revision, original.revision, 'same-turn attach must not steal the CAS revision');

  const transition = () => ({ nextState: { stateKey: 'approved', context: {} } });
  // A commit whose fence document was displaced (simulated directly on the
  // physical store — post-fix no claim path can produce this) refuses typed.
  const fenceKey = `v08-kernel:admission-fence:${String(address.workflowId)}:${String(address.instanceKey)}`;
  await storeB.put(fenceKey, { pinVersion: 1, stateRevision: 0, turnId: 'turn:evil', claimedAt: NOW }, { mustMatchRevision: reclaimed.revision as number });
  await assert.rejects(
    engine.processAcceptedTransition({ target: address, messageId: 'mx', expectedTargetSequence: 0, admissionFence: reclaimed, transition }),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_STATE_CAS_CONFLICT',
  );
  // Defense in depth: even the OLD holder cannot re-claim a fence that a
  // different turn now holds at the same stateRevision — the corrupted/
  // displaced fence is fail-closed for everyone until reconciliation.
  await assert.rejects(
    engine.claimAdmissionFence({ target: address, turnId: 'turn:x', turnIdentity, expectedTargetSequence: 0, snapshotFenceRevision: await engine.readAdmissionFenceRevision(address) }),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_STATE_CAS_CONFLICT',
  );
  // Operator reconciliation of the simulated corruption restores the holder's
  // fence document; the holder re-claims its own turn and commits.
  const displaced = await storeB.get(fenceKey);
  await storeB.put(fenceKey, { pinVersion: 1, stateRevision: 0, turnId: 'turn:x', turnIdentity, claimedAt: NOW }, { mustMatchRevision: (displaced?.revision ?? 0) as number });
  const healed = await engine.claimAdmissionFence({ target: address, turnId: 'turn:x', turnIdentity, expectedTargetSequence: 0, snapshotFenceRevision: await engine.readAdmissionFenceRevision(address) });
  const committed = await engine.processAcceptedTransition({ target: address, messageId: 'mx', expectedTargetSequence: 0, admissionFence: healed, transition });
  assert.equal(committed.stateRevision, 1);
  assert.equal(committed.lastMessageId, 'mx');

  // Post-commit: the leftover fence is at an OLDER stateRevision than the next
  // snapshot — the normal revision-CAS supersede keeps the sequential path live.
  const supersede = await engineB.claimAdmissionFence({ target: address, turnId: 'turn:z', expectedTargetSequence: 1, snapshotFenceRevision: await engineB.readAdmissionFenceRevision(address) });
  assert.equal(supersede.stateRevision, 1);
});

test('K01-e zero-ambiguity release frees the fence for the next turn; a fence without a claim revision stays held', async () => {
  const engine = new kernel.WorkflowInstanceEngine(storeA, { now: () => NOW });
  const address = target('t:a:release');
  await engine.createInstance({ address, correlationId: 'c', packageId: 'biz:quote@1.0.0', initialState: { stateKey: 'review', context: {} } });

  const held = await engine.claimAdmissionFence({ target: address, turnId: 'turn:f1', expectedTargetSequence: 0, snapshotFenceRevision: null });
  // A release without the claim's physical revision cannot be conditional, so
  // it must be a no-op (fail-closed: the fence stays held).
  await engine.releaseAdmissionFence(address, { turnId: 'turn:f1', stateRevision: 0 });
  assert.notEqual(await engine.readAdmissionFenceRevision(address), null);
  // The conditional release removes exactly the holder's revision.
  await engine.releaseAdmissionFence(address, held);
  assert.equal(await engine.readAdmissionFenceRevision(address), null);
  // The next turn claims cleanly at the same stateRevision.
  const next = await engine.claimAdmissionFence({ target: address, turnId: 'turn:f2', expectedTargetSequence: 0, snapshotFenceRevision: null });
  assert.equal(next.stateRevision, 0);
});
