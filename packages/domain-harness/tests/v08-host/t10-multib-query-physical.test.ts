/**
 * v0.10 T10 #1176 — physical Multi-B authorized scoped query over the REAL
 * selected kernel + one SQLite CAS store.
 * ===========================================================================
 *
 * Two Business packages of ONE deployment share workflowId+instanceKey on
 * ONE physical store. The K02 scoped document-store namespace (injective
 * tuple [deployedAppId,tenantId,appId,businessPackageId]) keeps their K
 * State, fence, journal, effect and original-receipt spaces disjoint; the
 * T10 authorized query selector (`host-v8/v010-authorized-multib-query`)
 * sits ON TOP of that physical reality:
 *
 *   T10-P1  explicit scoped query returns each exact B's own snapshot and
 *           target tuple; each B replays its OWN original receipt under the
 *           same messageId the other B used (independent dedup truth), and
 *           the physical key spaces stay disjoint.
 *   T10-P2  unscoped query with BOTH B visible is typed QUERY_AMBIGUOUS
 *           with ZERO physical store reads (ambiguity is decided before any
 *           snapshot read — no implicit first-match).
 *   T10-P3  unscoped query with ONE visible B returns that B only: the
 *           hidden B physically exists with the same workflowId+instanceKey
 *           yet neither changes the answer nor surfaces at all.
 *   T10-N1  an explicit query for an unauthorized (hidden) B is refused
 *           identically to a fully absent workflow — same code AND message —
 *           with zero physical reads (no existence oracle).
 *   T10-N2  a cross-tenant principal is refused before any physical read.
 *   T10-N3  a malformed selector is refused without key search.
 *   T10-N4  queries never write: every query path above leaves the physical
 *           store put/remove counters and the effect dispatch log unchanged.
 *   T10-P4  after a physical store close/reopen (restart), the query answers
 *           from DURABLE per-B state — each B still exactly its own.
 *
 * The kernel asserted here is the exact K02-spliced integration blob (same
 * pin as k02-namespace-two-b-physical.test.ts); any kernel drift fails the
 * import before a single query runs.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { openSqliteCasStore, type SqliteCasStore } from '../../src/host-v8/index.js';
import {
  createV10AuthorizedMultiBQuery,
  type V10MultiBQueryTarget,
} from '../../src/host-v8/v010-authorized-multib-query.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const KERNEL_SOURCE = await readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8');
const KERNEL_BLOB_SHA1 = createHash('sha1').update(`blob ${String(Buffer.byteLength(KERNEL_SOURCE, 'utf8'))}\u0000${KERNEL_SOURCE}`, 'utf8').digest('hex');
// Same read-only pin as the K02 physical suite. Rebound after C01 (#1177)
// legitimately advanced the selected kernel payload with the external-effect
// binding/permit configuration: the pre-C01 blob was c164f491; the current
// C01-integrated blob is 1a6a1394 and the K02 physical suite already pins
// exactly that post-C01 byte identity. T10 composes over it and never edits
// kernel bytes; the blob assertion below is the byte proof of this rebind.
// Current selected Kernel includes R01 K01 live same-turn fence guard (#1205); previous C01 blob 1a6a1394a505f4727306208d588fcab841e72980.
// Re-pinned after the #1242 permitted-claim-only kernel change; previous spliced blob db7a8f16de2b26d2fdb10e6ca7f8e90b3f1daf30.
// Re-pinned after the #1264 K advisory consultation plane landed in the selected kernel; previous spliced blob 72a886ffca85fc90caea954ee9fb5b3df7b4fcfa.
// Re-pinned after #1264 follow-up 2 (synchronous consultation + wired-only work-unit bound); previous blob 64f39cd68c71868adb29a464ed7122497891bfd7.
// Re-pinned after #1264 follow-up 3 (guarded advisory-result snapshots, observation identity envelope, conditional budget diagnostic); previous blob 7fe178a0f52dc553981c9714f8370682d945ee35.
const K02_SPLICED_KERNEL_BLOB_SHA1 = '6327507aeeb3a0e739d9fe9ed40ae7a61ad9841d';
assert.equal(KERNEL_BLOB_SHA1, K02_SPLICED_KERNEL_BLOB_SHA1, 'the selected kernel payload is byte-identical to the K02-spliced integration blob');
const KERNEL_SHA256 = createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex');
const kernel: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(KERNEL_SOURCE, 'utf8').toString('base64')}`);

const CARRIER_SOURCE = await readFile(new URL('durable-receipt-carrier-v1.mjs', payloadDir), 'utf8');
const carrier: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(CARRIER_SOURCE, 'utf8').toString('base64')}`);
const { createScopedDocumentStore, scopedNamespacePrefix } = carrier;

const NOW = '2026-10-19T00:00:00.000Z';
const sqlitePath = join(tmpdir(), `dh010-t10-q-${String(process.pid)}-${String(Date.now())}.sqlite`);
let store: SqliteCasStore;
const dispatches: unknown[] = [];

// Physical read/write witness: every store access during the query phase is
// counted at the SINGLE physical store both B namespaces live in.
let physicalGets = 0;
let physicalPuts = 0;
let physicalRemoves = 0;
const countedStore = {
  get: async (key: string) => {
    physicalGets += 1;
    return await store.get(key);
  },
  put: async (key: string, value: unknown, conditions: unknown) => {
    physicalPuts += 1;
    return await store.put(key, value, conditions as never);
  },
  remove: async (key: string, conditions: unknown) => {
    physicalRemoves += 1;
    return await store.remove(key, conditions as never);
  },
  list: async (prefix: string) => await store.list(prefix),
  close: async () => {
    await store.close();
  },
};

const DEPLOYMENT = { deployedAppId: 'deploy-shared', tenantId: 'tenant-shared', appId: 'app-shared' } as const;
const B_ALPHA = 'pkg:quote:alpha';
const B_BETA = 'pkg:quote:beta';
const SCOPE_ALPHA = { ...DEPLOYMENT, businessPackageId: B_ALPHA };
const SCOPE_BETA = { ...DEPLOYMENT, businessPackageId: B_BETA };
const SHARED_TARGET = { workflowId: 'quote', instanceKey: 'shared-q-1' };

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
        { transitionKey: 'note', trigger: { kind: 'event', eventType: 'NOTED' }, targetState: 'review' },
      ],
    },
    { stateKey: 'approved', kind: 'final' },
  ],
};

const policy = (packageId: string) => ({
  packageId,
  policyId: 'quote',
  domainId: 'sales',
  workflowDefinition: workflow,
  decisionSchema: { isValid: (value: any) => typeof value?.event?.type === 'string' },
  governanceSemantics: { hardInvariants: [] },
  initialStateKey: 'review',
  initialContext: {},
  rules: {
    'rule:approve': { ruleId: 'rule:approve', eventType: 'APPROVED', payloadFromInput: {} },
    'rule:note': { ruleId: 'rule:note', eventType: 'NOTED', payloadFromInput: {} },
  },
  intentBindings: {
    approve: { trigger: { kind: 'event', eventType: 'APPROVED' }, ruleId: 'rule:approve', roles: ['approver'] },
    note: { trigger: { kind: 'event', eventType: 'NOTED' }, ruleId: 'rule:note', roles: ['approver'] },
  },
  effectBindings: {
    'effect:reserve': {
      semantics: 'non-idempotent',
      handler: async ({ input, effectId, resources }: { input: Record<string, unknown>; effectId: string; resources: { call: (key: string, op: string, payload: unknown) => Promise<unknown> } }) =>
        resources.call('ledger', 'reserve', { ...input, effectId }),
    },
  },
});

function runtime(docs: unknown, packageId: string) {
  return kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:t10-q', moduleSha256: KERNEL_SHA256 },
    hostPorts: {
      docs,
      resources: { async call(_key: string, _op: string, payload: unknown) { dispatches.push(payload); return { reserved: true }; } },
      sha256: { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint: {
      packageId: 'std:t10-q',
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
    businessEndpoint: policy(packageId),
  });
}

const scopedAlpha = createScopedDocumentStore(SCOPE_ALPHA, countedStore);
const scopedBeta = createScopedDocumentStore(SCOPE_BETA, countedStore);
const runtimeAlpha = runtime(scopedAlpha, B_ALPHA);
const runtimeBeta = runtime(scopedBeta, B_BETA);
const runtimes = new Map<string, ReturnType<typeof runtime>>([
  [B_ALPHA, runtimeAlpha],
  [B_BETA, runtimeBeta],
]);

const hostPrincipal = { source: 'host-authenticated', subject: 'user:query-1', tenantId: DEPLOYMENT.tenantId };

/** The trusted-Host query composition: BUILD-selected routes, Host principal,
 * Host authorization, and the REAL per-B K02-scoped kernel snapshot reader. */
function makeQuery(options: { visible?: readonly string[]; principal?: { tenantId: string } } = {}) {
  const visible = new Set(options.visible ?? [B_ALPHA, B_BETA]);
  const principal = options.principal ?? hostPrincipal;
  const checks: V10MultiBQueryTarget[] = [];
  const reads: V10MultiBQueryTarget[] = [];
  const query = createV10AuthorizedMultiBQuery<Record<string, any>>({
    deployment: DEPLOYMENT,
    verifiedPrincipal: principal,
    selectedRoutes: [
      { businessPackageId: B_ALPHA, workflowId: SHARED_TARGET.workflowId },
      { businessPackageId: B_BETA, workflowId: SHARED_TARGET.workflowId },
    ],
    authorize: (verified: unknown, target) => {
      checks.push(target);
      const subject = verified as { tenantId: string };
      return subject.tenantId === target.tenantId && visible.has(target.businessPackageId);
    },
    readSnapshot: async (target) => {
      reads.push(target);
      return await runtimes.get(target.businessPackageId)!.getSnapshot({
        workflowId: target.workflowId,
        instanceKey: target.instanceKey,
      });
    },
  });
  return { query, checks, reads };
}

const refusal = (code: string) => (error: unknown): boolean =>
  error !== null && typeof error === 'object' && (error as { code?: string }).code === code;

before(async () => {
  store = await openSqliteCasStore({ path: sqlitePath });
});

after(async () => {
  await store.close();
  for (const suffix of ['', '-wal', '-shm']) {
    await rm(`${sqlitePath}${suffix}`, { force: true });
  }
});

test('T10-P1 physical: explicit scoped query answers each exact B over one SQLite store; original replay stays disjoint', async () => {
  // Both B of ONE deployment create the SAME workflowId+instanceKey.
  await runtimeAlpha.openInstance({ target: SHARED_TARGET, authorityClass: 'PRODUCTION' });
  await runtimeBeta.openInstance({ target: SHARED_TARGET, authorityClass: 'PRODUCTION' });
  const caller = { role: 'approver', subject: 'u1', tenantId: DEPLOYMENT.tenantId, appId: DEPLOYMENT.appId };
  await runtimeAlpha.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: SHARED_TARGET, caller });
  await runtimeBeta.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: SHARED_TARGET, caller });
  const dispatchesBefore = dispatches.length;
  await runtimeAlpha.submitOccurrence({ intentType: 'approve', messageId: 'm-approve', input: {}, target: SHARED_TARGET, caller });
  assert.equal(dispatches.length, dispatchesBefore + 1, 'exactly ONE effect dispatch (alpha\'s reserve)');

  // Each B replays its OWN original receipt under the SAME messageId.
  const alphaReplay = await runtimeAlpha.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: SHARED_TARGET, caller });
  const betaReplay = await runtimeBeta.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: SHARED_TARGET, caller });
  assert.equal(alphaReplay.idempotentReplay, true);
  assert.equal(betaReplay.idempotentReplay, true);
  assert.equal(alphaReplay.instance.stateRevision, 1);
  assert.equal(betaReplay.instance.stateRevision, 1, 'B2 counts its own turn, never B1\'s');
  assert.equal(dispatches.length, dispatchesBefore + 1, 'replays dispatch nothing');

  // The authorized explicit query: exact target tuple + exact B snapshot.
  const h = makeQuery();
  const alphaAnswer = await h.query.query({ ...SHARED_TARGET, businessPackageId: B_ALPHA });
  assert.deepEqual(alphaAnswer.target, { ...DEPLOYMENT, businessPackageId: B_ALPHA, workflowId: SHARED_TARGET.workflowId, instanceKey: SHARED_TARGET.instanceKey });
  assert.equal(alphaAnswer.snapshot.state.stateKey, 'approved');
  assert.equal(alphaAnswer.snapshot.lifecycle, 'completed');
  const betaAnswer = await h.query.query({ ...SHARED_TARGET, businessPackageId: B_BETA });
  assert.equal(betaAnswer.snapshot.state.stateKey, 'review', 'B2\'s instance is untouched by B1\'s completion');
  assert.equal(betaAnswer.snapshot.stateRevision, 1);
  assert.deepEqual(h.reads.map((target) => target.businessPackageId), [B_ALPHA, B_BETA], 'one physical snapshot read per exact B — never a blend');
  assert.ok(physicalGets > 0, 'the answer was backed by real physical store reads');

  // Physical disjointness of the two B namespaces on the ONE store.
  const keys = await store.list('v010-k02:');
  const alphaKeys = keys.filter((key) => key.startsWith(`${scopedNamespacePrefix(SCOPE_ALPHA)}:`));
  const betaKeys = keys.filter((key) => key.startsWith(`${scopedNamespacePrefix(SCOPE_BETA)}:`));
  assert.ok(alphaKeys.length >= 2);
  assert.ok(betaKeys.length >= 2);
  assert.equal(alphaKeys.filter((key) => betaKeys.includes(key)).length, 0, 'zero shared physical keys between the two B');
});

test('T10-P2 physical: unscoped query over two VISIBLE B is typed ambiguous with ZERO physical reads', async () => {
  const h = makeQuery();
  const getsBefore = physicalGets;
  await assert.rejects(h.query.query({ ...SHARED_TARGET }), refusal('QUERY_AMBIGUOUS'));
  assert.equal(physicalGets, getsBefore, 'ambiguity was decided before any physical snapshot read — no implicit first-match');
  assert.equal(h.reads.length, 0);
});

test('T10-P3 physical: one visible B answers alone; the hidden B with the same workflowId+instanceKey never surfaces', async () => {
  const h = makeQuery({ visible: [B_ALPHA] });
  const getsBefore = physicalGets;
  const answer = await h.query.query({ ...SHARED_TARGET });
  assert.equal(answer.target.businessPackageId, B_ALPHA);
  assert.equal(answer.snapshot.state.stateKey, 'approved');
  const direct = await runtimeAlpha.getSnapshot(SHARED_TARGET);
  assert.equal(answer.snapshot.state.stateKey, direct.state.stateKey);
  assert.equal(answer.snapshot.stateRevision, direct.stateRevision);
  assert.deepEqual(h.reads.map((target) => target.businessPackageId), [B_ALPHA]);
  assert.ok(physicalGets > getsBefore, 'the single visible answer was physically read');

  // The hidden B is physically alive in the same store under the same
  // workflowId+instanceKey — the answer above must not depend on that fact.
  const betaDirect = await runtimeBeta.getSnapshot(SHARED_TARGET);
  assert.equal(betaDirect.state.stateKey, 'review', 'B2 physically exists with the same workflowId+instanceKey');
});

test('T10-N1 physical: unauthorized explicit B is refused identically to an absent workflow, with zero physical reads', async () => {
  const h = makeQuery({ visible: [B_ALPHA] });
  const getsBefore = physicalGets;
  const hiddenRefusal = await h.query.query({ ...SHARED_TARGET, businessPackageId: B_BETA }).then(
    () => assert.fail('expected refusal'),
    (error: unknown) => error as { code?: string; message?: string },
  );
  assert.equal(hiddenRefusal.code, 'QUERY_NOT_FOUND');
  const absentRefusal = await h.query.query({ workflowId: 'ghost-workflow', instanceKey: SHARED_TARGET.instanceKey }).then(
    () => assert.fail('expected refusal'),
    (error: unknown) => error as { code?: string; message?: string },
  );
  assert.equal(absentRefusal.code, 'QUERY_NOT_FOUND');
  assert.equal(hiddenRefusal.message, absentRefusal.message, 'denial is byte-identical whether or not a hidden B physically exists (no existence oracle)');
  assert.equal(h.reads.length, 0);
  assert.equal(physicalGets, getsBefore, 'no physical read on any denial path');
});

test('T10-N2 physical: a cross-tenant principal is refused before any physical read', async () => {
  const h = makeQuery({ principal: { tenantId: 'tenant-other' } });
  const getsBefore = physicalGets;
  await assert.rejects(h.query.query({ ...SHARED_TARGET }), refusal('QUERY_NOT_FOUND'));
  await assert.rejects(h.query.query({ ...SHARED_TARGET, businessPackageId: B_ALPHA }), refusal('QUERY_NOT_FOUND'));
  assert.equal(h.reads.length, 0);
  assert.equal(physicalGets, getsBefore, 'tenant denial happened entirely before physical existence reads');
});

test('T10-N3 physical: a malformed selector is refused without any key search or authorization probe', async () => {
  const h = makeQuery();
  const getsBefore = physicalGets;
  await assert.rejects(h.query.query({ workflowId: 'quote', instanceKey: '' }), refusal('QUERY_SELECTOR_INVALID'));
  await assert.rejects(h.query.query({ workflowId: '', instanceKey: 'x' }), refusal('QUERY_SELECTOR_INVALID'));
  assert.equal(h.checks.length, 0, 'no target was even considered for authorization');
  assert.equal(h.reads.length, 0);
  assert.equal(physicalGets, getsBefore);
});

test('T10-N4 physical: every query path leaves the physical store and effect log unwritten', async () => {
  const h = makeQuery();
  const putsBefore = physicalPuts;
  const removesBefore = physicalRemoves;
  const dispatchesBefore = dispatches.length;
  await h.query.query({ ...SHARED_TARGET, businessPackageId: B_ALPHA });
  await assert.rejects(h.query.query({ ...SHARED_TARGET }), refusal('QUERY_AMBIGUOUS'));
  await assert.rejects(h.query.query({ ...SHARED_TARGET, businessPackageId: 'pkg:not-selected' }), refusal('QUERY_NOT_FOUND'));
  assert.equal(physicalPuts, putsBefore, 'queries perform zero physical writes');
  assert.equal(physicalRemoves, removesBefore);
  assert.equal(dispatches.length, dispatchesBefore, 'queries dispatch zero effects');
});

test('T10-P4 physical: after a store close/reopen (restart) the query answers from DURABLE per-B state', async () => {
  // Restart: close the physical SQLite file, reopen it, rebuild the scoped
  // runtimes over the SAME file — the query must answer from durable bytes,
  // not from any in-memory runtime state left over from the setup phase.
  await store.close();
  store = await openSqliteCasStore({ path: sqlitePath });
  const reopenedAlpha = runtime(createScopedDocumentStore(SCOPE_ALPHA, countedStore), B_ALPHA);
  const reopenedBeta = runtime(createScopedDocumentStore(SCOPE_BETA, countedStore), B_BETA);
  runtimes.set(B_ALPHA, reopenedAlpha);
  runtimes.set(B_BETA, reopenedBeta);

  const h = makeQuery();
  const alphaAnswer = await h.query.query({ ...SHARED_TARGET, businessPackageId: B_ALPHA });
  assert.equal(alphaAnswer.snapshot.state.stateKey, 'approved', 'B1\'s durable completed state survives the restart');
  assert.equal(alphaAnswer.snapshot.lifecycle, 'completed');
  const betaAnswer = await h.query.query({ ...SHARED_TARGET, businessPackageId: B_BETA });
  assert.equal(betaAnswer.snapshot.state.stateKey, 'review', 'B2\'s durable mid-flight state survives the restart, still untouched by B1');
  assert.equal(betaAnswer.snapshot.stateRevision, 1);
  // The restarted deployment stays ambiguous for a both-visible unscoped query.
  await assert.rejects(h.query.query({ ...SHARED_TARGET }), refusal('QUERY_AMBIGUOUS'));
});
