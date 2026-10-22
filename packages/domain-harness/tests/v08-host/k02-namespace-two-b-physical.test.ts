/**
 * v0.10 K02 #1168 — physical two-B deployment namespace over the REAL kernel.
 * ===========================================================================
 *
 * The selected Kernel builds its doc keys from `workflowId`/`instanceKey`
 * only (instanceDocKey/admissionFenceDocKey + journal/effect/disposition
 * families), so two deployed B sharing a workflowId+instanceKey collide on
 * ONE physical store (#1110). K02's scoped document-store adapter (pure
 * composition over the Host docs port) routes every key through the injective
 * deployment tuple [deployedAppId,tenantId,appId,businessPackageId] —
 * deployable TODAY over the UNMODIFIED selected kernel bytes.
 *
 * Physical witnesses over the REAL Node Host SqliteCasStore (one file) and
 * the EXACT selected kernel payload (data-URL import). [v0.10 K02 #1168
 * phase-2 splice] The kernel asserted here is the POST-SPLICE integration
 * blob (the durable original-receipt carrier spliced into the selected
 * kernel after the K01 release); the exact spliced digest is pinned in this
 * file so any further kernel drift fails the import:
 *
 *   K02-N0  control (root cause): two UNSCOPED-WIRING runtimes over one
 *           store with colliding workflowId+instanceKey — the second create
 *           refuses HOST_KEY_EXISTS (the physical collision being repaired;
 *           post-splice the unscoped wiring is the byte-compatible mode).
 *   K02-N1  two scoped runtimes (two B), IDENTICAL workflowId+instanceKey:
 *           both create, transition and complete independently; instance /
 *           admission-fence / journal / turn-disposition doc families are
 *           physically disjoint; neither B can enumerate or read the other.
 *           Post-splice these runtimes are the REAL integrated kernel with
 *           its same-CAS original-receipt ring — replay truth now answers
 *           from the ring inside the scoped namespace.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { openSqliteCasStore, type SqliteCasStore } from '../../src/host-v8/index.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const KERNEL_SOURCE = await readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8');
// Git blob SHA-1 of the payload file (the frozen identity form used across
// the v0.10 planning/claim records).
const KERNEL_BLOB_SHA1 = createHash('sha1').update(`blob ${String(Buffer.byteLength(KERNEL_SOURCE, 'utf8'))}\u0000${KERNEL_SOURCE}`, 'utf8').digest('hex');
// [v0.10 K02 #1168 phase-2 splice] This test no longer asserts the UNMODIFIED
// base blob fa30e1204d47c12f3f5842c497a83a08501d515b: phase-2 spliced the
// durable original-receipt carrier INTO the selected kernel (after the K01
// single-writer release, #1167@36f068e3). The pinned digest below is the
// POST-SPLICE integrated kernel — the test itself records and re-verifies the
// exact spliced bytes so any further drift fails here.
// R01 #1207 selected Kernel revision after #1205; prior blob 1a6a1394a505f4727306208d588fcab841e72980.
// Re-pinned after the #1242 permitted-claim-only kernel change; previous spliced blob db7a8f16de2b26d2fdb10e6ca7f8e90b3f1daf30.
// Re-pinned after the #1264 K advisory consultation plane landed in the selected kernel; previous spliced blob 72a886ffca85fc90caea954ee9fb5b3df7b4fcfa.
// Re-pinned after #1264 follow-up 2 (synchronous consultation + wired-only work-unit bound); previous blob 64f39cd68c71868adb29a464ed7122497891bfd7.
// Re-pinned after #1264 follow-up 3 (guarded advisory-result snapshots, observation identity envelope, conditional budget diagnostic); previous blob 7fe178a0f52dc553981c9714f8370682d945ee35.
const K02_SPLICED_KERNEL_BLOB_SHA1 = '6327507aeeb3a0e739d9fe9ed40ae7a61ad9841d';
assert.equal(KERNEL_BLOB_SHA1, K02_SPLICED_KERNEL_BLOB_SHA1, 'the selected kernel payload is byte-identical to the K02-spliced integration blob (recorded at the phase-2 splice)');
const KERNEL_SHA256 = createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex');
const kernel: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(KERNEL_SOURCE, 'utf8').toString('base64')}`);

const CARRIER_SOURCE = await readFile(new URL('durable-receipt-carrier-v1.mjs', payloadDir), 'utf8');
const carrier: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(CARRIER_SOURCE, 'utf8').toString('base64')}`);
const { createScopedDocumentStore, scopedNamespacePrefix } = carrier;

const NOW = '2026-10-19T00:00:00.000Z';
const sqlitePath = join(tmpdir(), `dh010-k02-ns-${String(process.pid)}-${String(Date.now())}.sqlite`);
let store: SqliteCasStore;
const dispatches: unknown[] = [];

const SCOPE_B1 = { deployedAppId: 'deploy-alpha', tenantId: 'tenant-shared', appId: 'app-shared', businessPackageId: 'pkg:quote:alpha' };
const SCOPE_B2 = { deployedAppId: 'deploy-beta', tenantId: 'tenant-shared', appId: 'app-shared', businessPackageId: 'pkg:quote:beta' };
const COLLIDING_TARGET = { workflowId: 'quote', instanceKey: 'shared-q-1' };

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
    moduleIdentity: { packageId: 'kernel:k02-ns', moduleSha256: KERNEL_SHA256 },
    hostPorts: {
      docs,
      resources: { async call(_key: string, _op: string, payload: unknown) { dispatches.push(payload); return { reserved: true }; } },
      sha256: { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint: {
      packageId: 'std:k02-ns',
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

const caller = { role: 'approver', subject: 'u1', tenantId: 'tenant-shared', appId: 'app-shared' };

before(async () => {
  store = await openSqliteCasStore({ path: sqlitePath });
});

after(async () => {
  await store.close();
  for (const suffix of ['', '-wal', '-shm']) {
    await rm(`${sqlitePath}${suffix}`, { force: true });
  }
});

test('K02-N0 control: WITHOUT the scoped namespace two runtimes over one store collide physically on workflowId+instanceKey', async () => {
  const instanceKey = 'k02:n0-collision';
  const alpha = runtime(store, 'pkg:quote:alpha');
  await alpha.openInstance({ target: { workflowId: 'quote', instanceKey }, authorityClass: 'PRODUCTION' });
  await assert.rejects(
    runtime(store, 'pkg:quote:beta').openInstance({ target: { workflowId: 'quote', instanceKey }, authorityClass: 'PRODUCTION' }),
    (error: unknown) => (error as { code?: string }).code === 'HOST_KEY_EXISTS',
    'the unscoped kernel keys collide: the root physical-namespace defect (#1110) demonstrated on the unmodified kernel',
  );
});

test('K02-N1 two B with IDENTICAL workflowId+instanceKey stay physically disjoint through the scoped namespace', async () => {
  const scopedB1 = createScopedDocumentStore(SCOPE_B1, store);
  const scopedB2 = createScopedDocumentStore(SCOPE_B2, store);
  const alpha = runtime(scopedB1, 'pkg:quote:alpha');
  const beta = runtime(scopedB2, 'pkg:quote:beta');

  // Both deployments create the SAME workflowId+instanceKey independently.
  await alpha.openInstance({ target: COLLIDING_TARGET, authorityClass: 'PRODUCTION' });
  await beta.openInstance({ target: COLLIDING_TARGET, authorityClass: 'PRODUCTION' });

  // Independent state progression with the same messageIds.
  const dispatchesBefore = dispatches.length;
  const alphaNote = await alpha.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: COLLIDING_TARGET, caller });
  const betaNote = await beta.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: COLLIDING_TARGET, caller });
  assert.equal(alphaNote.status, 'admitted');
  assert.equal(betaNote.status, 'admitted');
  assert.equal(alphaNote.instance.stateRevision, 1);
  assert.equal(betaNote.instance.stateRevision, 1, 'B2 counts its OWN transition, not B1\'s');

  // B1 completes with its effect; B2 stays mid-flight — no cross-contamination.
  const alphaDone = await alpha.submitOccurrence({ intentType: 'approve', messageId: 'm-approve', input: {}, target: COLLIDING_TARGET, caller });
  assert.equal(alphaDone.status, 'admitted');
  assert.equal(alphaDone.instance.state.stateKey, 'approved');
  assert.equal(alphaDone.instance.lifecycle, 'completed');
  const betaSnapshot = await beta.getSnapshot(COLLIDING_TARGET);
  assert.equal(betaSnapshot.state.stateKey, 'review', 'B2\'s instance is untouched by B1\'s completion');
  assert.equal(betaSnapshot.stateRevision, 1);
  assert.equal(dispatches.length, dispatchesBefore + 1, 'exactly ONE effect dispatch (B1\'s non-idempotent reserve)');

  // B2 replays its OWN turn under the SAME messageId B1 used — independent dedup truth.
  const betaReplay = await beta.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: COLLIDING_TARGET, caller });
  assert.equal(betaReplay.idempotentReplay, true, 'B2 replays its own admitted turn');
  assert.equal(betaReplay.instance.stateRevision, 1);
  const alphaReplay = await alpha.submitOccurrence({ intentType: 'note', messageId: 'm-note-1', input: {}, target: COLLIDING_TARGET, caller });
  assert.equal(alphaReplay.idempotentReplay, true, 'B1 replays its own admitted turn at its own revision');
  assert.equal(alphaReplay.instance.stateRevision, 1);
  assert.equal(dispatches.length, dispatchesBefore + 1, 'replays dispatch nothing');

  // Physical disjointness on ONE store: every kernel doc family separates by scope.
  const keys = await store.list('v010-k02:');
  const b1Prefix = scopedNamespacePrefix(SCOPE_B1);
  const b2Prefix = scopedNamespacePrefix(SCOPE_B2);
  const b1Keys = keys.filter((key: string) => key.startsWith(`${b1Prefix}:`));
  const b2Keys = keys.filter((key: string) => key.startsWith(`${b2Prefix}:`));
  assert.ok(b1Keys.length >= 2, `B1 keys: ${String(b1Keys.length)}`);
  assert.ok(b2Keys.length >= 2, `B2 keys: ${String(b2Keys.length)}`);
  for (const family of ['wf-instance', 'admission-fence', 'turn-disposition']) {
    assert.ok(b1Keys.some((key: string) => key.includes(`:${family}:`)), `B1 carries a ${family} doc`);
    assert.ok(b2Keys.some((key: string) => key.includes(`:${family}:`)), `B2 carries a ${family} doc`);
  }
  assert.equal(b1Keys.filter((key: string) => b2Keys.includes(key)).length, 0, 'zero shared physical keys between the two B');

  // Neither deployment can enumerate the other through its scoped view.
  const b1View = createScopedDocumentStore(SCOPE_B1, store);
  assert.equal((await b1View.list('')).length, b1Keys.length, 'B1\'s scoped list sees only its own namespace');
  assert.equal(await b1View.get(`${b2Prefix}:v08-kernel:wf-instance:quote:shared-q-1`), null, 'a raw cross-namespace key is not reachable through B1\'s adapter');
});
