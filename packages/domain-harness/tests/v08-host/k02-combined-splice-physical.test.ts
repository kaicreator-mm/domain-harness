/**
 * v0.10 K02 #1168 phase-2 — the TRUE combined physical test: the SPLICED
 * selected kernel (durable original-receipt carrier integrated after the K01
 * release) over the REAL Node Host SqliteCasStore, including REAL two-process
 * legs over ONE shared SQLite file.
 * ===========================================================================
 *
 * The kernel under test is imported by EXACT current bytes (data-URL
 * installer discipline) and its blob is pinned below to the POST-SPLICE
 * integration digest recorded at the splice — this file is the physical
 * witness that the combined behavior (K01 fence/attest semantics x K02
 * same-CAS original receipts x scoped namespace) holds on the integrated
 * bytes, never claimed PASS before this splice:
 *
 *   CB-P1  same-CAS original receipt atomicity (in-process, SCOPED wiring):
 *          the instance document revision == stateRevision and the ORIGINAL
 *          receipt (identity input-complete + deployment-scoped, instance
 *          projection == the committed state) rides the SAME physical row;
 *          store close/reopen keeps it; a late replay answers from the ring
 *          with the EXACT original projection and zero new dispatch;
 *          canonically-equivalent input (different key order) replays.
 *   CB-N1  changed-input / changed-intent typed conflicts BEFORE any
 *          admission activity (the root-cause-1 repair on the integrated
 *          kernel): K02_TURN_RECEIPT_INPUT_CONFLICT / _INTENT_CONFLICT.
 *   CB-F1  fence/receipt coordination under the K01 R2 attest contract:
 *          an adapter-thrown tagged code after the real dispatch proves
 *          nothing (fence held, NO receipt — the turn never admitted, the
 *          follower is refused at the held fence); the TRUSTED dispatcher
 *          pre-handler refusal (attested HOST_RESOURCE_UNKNOWN) proves zero
 *          external effect and releases the fence through the docs.remove
 *          seam; the follower then admits and its ORIGINAL receipt lands in
 *          the ring while the poison turn never gets one.
 *   CB-R1  REAL two-process same-turn race over ONE SQLite file (stock-node
 *          children, SCOPED keys): the concurrent same-turn duplicate is an
 *          honest typed UNKNOWN, the in-flight holder honestly loses its
 *          stolen fence at commit, the reconciling retry replays the
 *          completed journal (exactly-once effect) and lands the ORIGINAL
 *          receipt, and a changed-input re-send refuses typed.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openSqliteCasStore, type CasPutConditions, type SqliteCasStore } from '../../src/host-v8/index.js';

// ---------------------------------------------------------------------------
// The REAL spliced selected kernel, imported by exact current bytes.
// ---------------------------------------------------------------------------
const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const KERNEL_SOURCE = await readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8');
const KERNEL_BLOB_SHA1 = createHash('sha1').update(`blob ${String(Buffer.byteLength(KERNEL_SOURCE, 'utf8'))}\u0000${KERNEL_SOURCE}`, 'utf8').digest('hex');
// The POST-SPLICE integrated kernel blob (recorded at the K02 phase-2 splice
// on top of K01 R2 36f068e3). Any further kernel drift fails this import.
const K02_SPLICED_KERNEL_BLOB_SHA1 = 'c164f491efc0047b7654088f8c359cb3fd58ceaf';
assert.equal(KERNEL_BLOB_SHA1, K02_SPLICED_KERNEL_BLOB_SHA1, 'the combined test runs the exact spliced integration kernel bytes');
const KERNEL_SHA256 = createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex');
const kernel: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(KERNEL_SOURCE, 'utf8').toString('base64')}`);

const WORKER_SCRIPT = fileURLToPath(new URL('./children/k02-splice-worker.mjs', import.meta.url));
const CHILD_TIMEOUT_MS = 120_000;
const WORKFLOW_ID = 'quote';
const NOW = '2026-10-19T00:00:00.000Z';

const SCOPE = { deployedAppId: 'deploy-combined', tenantId: 'tenant-combined', appId: 'app-combined', businessPackageId: 'pkg:quote:combined' };
const enc = (value: string): string => value.replace(/%/g, '%25').replace(/:/g, '%3A');
const SCOPE_PREFIX = `v010-k02:${enc(SCOPE.deployedAppId)}:${enc(SCOPE.tenantId)}:${enc(SCOPE.appId)}:${enc(SCOPE.businessPackageId)}`;
const scopedInstanceKey = (instanceKey: string): string => `${SCOPE_PREFIX}:wf-instance:${enc(WORKFLOW_ID)}:${enc(instanceKey)}`;
const scopedFenceKey = (instanceKey: string): string => `${SCOPE_PREFIX}:admission-fence:${enc(WORKFLOW_ID)}:${enc(instanceKey)}`;
const SCOPED_JOURNAL_PREFIX = `${SCOPE_PREFIX}:effect-journal:`;

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
      handler: async ({ input, effectId, resources: handlerResources }: any) =>
        handlerResources.call('ledger', 'reserve', { ...input, effectId }),
    },
  },
};

const caller = { role: 'approver', subject: 'u1', tenantId: SCOPE.tenantId, appId: SCOPE.appId };
const TARGET = { workflowId: WORKFLOW_ID, instanceKey: 'combined-1' };

type ReceiptRing = Record<string, {
  carrierVersion?: number;
  identity?: string;
  intentType?: string;
  buildIdentity?: { kernelModuleSha256?: string };
  receipt?: { turnId?: string; instance?: { stateRevision?: number }; inputDigest?: string; attributedAt?: string };
}>;

function readRing(instanceDoc: any): ReceiptRing {
  return (instanceDoc?.durableOriginalReceipts ?? {}) as ReceiptRing;
}

function messageTurnId(messageId: string): string {
  return `turn:${enc(WORKFLOW_ID)}:${enc(TARGET.instanceKey)}:message:${enc(messageId)}`;
}

/**
 * The trusted-seam resources port replica (the K01 R2 contract, host side):
 * the kernel mints one attest per call and passes it as the TRAILING
 * argument; ONLY this trusted dispatcher marks `preHandlerRefusal` for its
 * OWN pre-handler refusals (unprovisioned key), synchronously before
 * throwing. An adapter-thrown error (even carrying a dispatcher-owned code
 * name) is NEVER a mark. A handler fault or a post-mutation throw leaves the
 * attest unmarked — fail-closed.
 */
function trustedDispatcherResources(options: {
  provisioned: () => boolean;
  onCall: (payload: any, attest: { preHandlerRefusal: string | null }) => Promise<unknown> | unknown;
}) {
  return {
    async call(resourceKey: string, _operation: string, payload: unknown, attest?: { preHandlerRefusal: string | null }) {
      if (!options.provisioned()) {
        // The trusted dispatcher's OWN pre-handler refusal: marked
        // synchronously BEFORE the throw.
        if (attest !== undefined && typeof attest === 'object') attest.preHandlerRefusal = 'HOST_RESOURCE_UNKNOWN';
        throw Object.assign(new Error(`resource ${resourceKey} is not provisioned on this host`), { code: 'HOST_RESOURCE_UNKNOWN' });
      }
      return options.onCall(payload, attest ?? { preHandlerRefusal: null });
    },
  };
}

function scopedRuntime(
  store: SqliteCasStore | Record<string, unknown>,
  resources: unknown,
  policyOverride?: Record<string, unknown>,
  sdkEndpointOverride?: Record<string, unknown>,
) {
  return kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:k02-combined', moduleSha256: KERNEL_SHA256 },
    deploymentScope: SCOPE,
    hostPorts: {
      docs: store,
      resources,
      sha256: { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint: (sdkEndpointOverride as Record<string, any> | undefined) ?? {
      packageId: 'std:k02-combined',
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
    businessEndpoint: (policyOverride as Record<string, any> | undefined) ?? policy,
  });
}

// ---------------------------------------------------------------------------
// CB-P1 / CB-N1 / CB-F1 — in-process legs on ONE scoped SQLite fixture.
// ---------------------------------------------------------------------------
const inProcessDir = await mkdtemp(path.join(tmpdir(), 'dh-k02-combined-ip-'));
const inProcessDb = path.join(inProcessDir, 'combined.sqlite');
let inProcessStore: SqliteCasStore;
const inProcessDispatches: unknown[] = [];
const provisioned = true;

test('CB-P1 same-CAS original-receipt atomicity, restart durability and exact-original replay on the spliced kernel (scoped wiring)', { timeout: 120_000 }, async () => {
  inProcessStore = await openSqliteCasStore({ path: inProcessDb });
  const runtime = scopedRuntime(inProcessStore, trustedDispatcherResources({
    provisioned: () => provisioned,
    onCall: async (payload) => {
      inProcessDispatches.push(payload);
      return { reserved: true };
    },
  }));
  await runtime.openInstance({ target: TARGET, authorityClass: 'PRODUCTION' });

  const receipt = await runtime.submitOccurrence({ intentType: 'approve', messageId: 'm-cb-1', input: { sku: 'A', note: { deep: [1, 2] } }, target: TARGET, caller }) as any;
  assert.equal(receipt.status, 'admitted');
  assert.notEqual(receipt.idempotentReplay, true, 'the first admission is not a replay');
  assert.equal(receipt.instance.stateRevision, 1);
  assert.equal(receipt.instance.state.stateKey, 'approved');
  assert.equal(inProcessDispatches.length, 1, 'exactly one physical dispatch');

  // SAME physical row: revision == stateRevision, and the ORIGINAL receipt
  // of the turn is IN the committed document with the projection it
  // acknowledges.
  const row = (await inProcessStore.get(scopedInstanceKey(TARGET.instanceKey))) as {
    revision: number;
    value: Record<string, any>;
  } | null;
  assert.ok(row !== null);
  assert.equal(row!.revision, row!.value.stateRevision, 'the instance doc revision stays equal to its stateRevision');
  assert.equal(row!.value.stateRevision, 1);
  const ring = readRing(row!.value);
  const envelope = ring[messageTurnId('m-cb-1')];
  assert.ok(envelope !== undefined, 'the original receipt rides the SAME committed document value');
  assert.equal(envelope.carrierVersion, 1);
  assert.equal(envelope.receipt?.turnId, messageTurnId('m-cb-1'));
  assert.equal(envelope.receipt?.instance?.stateRevision, 1, 'the receipt carries the projection this very CAS committed');
  assert.match(envelope.receipt?.inputDigest ?? '', /^sha256:[0-9a-f]{64}$/, 'the receipt identity is input-complete');
  // The identity is deployment-scoped and build-stable: the scope tuple is
  // inside the identity, the pinned module SHA rides the envelope.
  const identity = JSON.parse(envelope.identity!);
  assert.equal(identity.deploymentScope.deployedAppId, SCOPE.deployedAppId);
  assert.equal(identity.inputDigest, envelope.receipt?.inputDigest);
  assert.equal(envelope.buildIdentity?.kernelModuleSha256, KERNEL_SHA256);

  // Restart durability: close + reopen the SAME SQLite file.
  await inProcessStore.close();
  inProcessStore = await openSqliteCasStore({ path: inProcessDb });
  const reopenedRow = (await inProcessStore.get(scopedInstanceKey(TARGET.instanceKey))) as {
    revision: number;
    value: Record<string, any>;
  } | null;
  assert.equal(reopenedRow!.value.stateRevision, 1, 'the committed row (state + original receipt) survived the restart');
  assert.ok(readRing(reopenedRow!.value)[messageTurnId('m-cb-1')] !== undefined, 'the original receipt survived the restart');

  // The late replay answers from the same-CAS ring with the EXACT original
  // projection and ZERO new dispatch.
  const runtime2 = scopedRuntime(inProcessStore, trustedDispatcherResources({
    provisioned: () => provisioned,
    onCall: async (payload) => {
      inProcessDispatches.push(payload);
      return { reserved: true };
    },
  }));
  const replay = await runtime2.submitOccurrence({ intentType: 'approve', messageId: 'm-cb-1', input: { note: { deep: [1, 2] }, sku: 'A' }, target: TARGET, caller }) as any;
  assert.equal(replay.status, 'admitted');
  assert.equal(replay.idempotentReplay, true, 'canonically-equivalent input (key order flipped) is the SAME canonical input — replay, not conflict');
  assert.equal(replay.instance.stateRevision, 1, 'the replay carries the ORIGINAL acknowledged projection, not the newest snapshot');
  assert.equal(inProcessDispatches.length, 1, 'the replay dispatched nothing');
});

test('CB-N1 changed-input / changed-intent refuse typed BEFORE any admission activity (root-cause-1 repair on the integrated kernel)', { timeout: 120_000 }, async () => {
  // Same fixture instance: now at stateRevision 1 (approved, FINAL).
  const dispatchesBefore = inProcessDispatches.length;
  const runtime = scopedRuntime(inProcessStore, trustedDispatcherResources({
    provisioned: () => provisioned,
    onCall: async (payload) => { inProcessDispatches.push(payload); return { reserved: true }; },
  }));

  // Same messageId, CHANGED canonical input: typed input conflict.
  await assert.rejects(
    () => runtime.submitOccurrence({ intentType: 'approve', messageId: 'm-cb-1', input: { sku: 'CHANGED' }, target: TARGET, caller }),
    (error: unknown) => {
      const typed = error as { code?: string };
      return typed.code === 'K02_TURN_RECEIPT_INPUT_CONFLICT';
    },
    'the changed canonical input under an admitted messageId refuses typed',
  );
  // Same messageId, different intentType: typed intent conflict.
  await assert.rejects(
    () => runtime.submitOccurrence({ intentType: 'note', messageId: 'm-cb-1', input: { sku: 'A', note: { deep: [1, 2] } }, target: TARGET, caller }),
    (error: unknown) => {
      const typed = error as { code?: string };
      return typed.code === 'K02_TURN_RECEIPT_INTENT_CONFLICT';
    },
  );
  assert.equal(inProcessDispatches.length, dispatchesBefore, 'the conflicts dispatched nothing');
  const row = (await inProcessStore.get(scopedInstanceKey(TARGET.instanceKey))) as {
    revision: number;
    value: Record<string, any>;
  } | null;
  assert.equal(row!.value.stateRevision, 1, 'the conflicts committed nothing');
  const ring = readRing(row!.value);
  assert.equal(Object.keys(ring).length, 1, 'the ring still holds exactly the one admitted turn');
});

test('CB-F1 fence/receipt coordination under the K01 R2 attest contract: tagged lost-ACK keeps the fence and writes NO receipt; the attested dispatcher refusal releases via docs.remove; the follower receipt lands', { timeout: 120_000 }, async () => {
  // TWO FRESH scoped instances on the same store: 'combined-fence'
  // materializes the UNCERTAIN leg (fence held); 'combined-drain'
  // materializes the ATTESTED release journey (a held fence refuses rival
  // turns, so the attested pre-handler refusal must be the FIRST activity of
  // its own instance — the tg5 q-drain choreography).
  const target = { workflowId: WORKFLOW_ID, instanceKey: 'combined-fence' };
  const drainTarget = { workflowId: WORKFLOW_ID, instanceKey: 'combined-drain' };
  const ledgerLines: string[] = [];
  let provisionLedger = true;
  const journalReads = async (instanceKey: string): Promise<Array<{ status: string; zeroExternalEffect: boolean }>> => {
    const keys = await inProcessStore.list(SCOPED_JOURNAL_PREFIX);
    const out: Array<{ status: string; zeroExternalEffect: boolean }> = [];
    for (const key of keys.filter((candidate) => candidate.includes(enc(instanceKey)))) {
      const doc = await inProcessStore.get(key);
      const record = (doc as any)?.value?.record;
      if (record !== undefined) out.push({ status: String(record.status), zeroExternalEffect: record.error?.zeroExternalEffect === true });
    }
    return out;
  };

  // The adapter lands the physical dispatch and only THEN throws a tagged
  // code (the honest code collision) — the first, UNCERTAIN failure.
  const poisonRuntime = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:k02-combined', moduleSha256: KERNEL_SHA256 },
    deploymentScope: SCOPE,
    hostPorts: {
      docs: inProcessStore,
      resources: trustedDispatcherResources({
        provisioned: () => provisionLedger,
        onCall: async (payload) => {
          // The adapter lands the physical mutation FIRST…
          ledgerLines.push(String((payload as any)?.effectId));
          // …then throws an error carrying a dispatcher-owned code name with
          // NO attest mark (an adapter cannot mark the kernel-minted attest).
          throw Object.assign(new Error(`physical ledger outage for ${String((payload as any)?.effectId)}`), { code: 'HOST_RESOURCE_MALFORMED' });
        },
      }),
      sha256: { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint: {
      packageId: 'std:k02-combined',
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
  await poisonRuntime.openInstance({ target, authorityClass: 'PRODUCTION' });
  await poisonRuntime.openInstance({ target: drainTarget, authorityClass: 'PRODUCTION' });

  await assert.rejects(
    () => poisonRuntime.submitOccurrence({ intentType: 'approve', messageId: 'm-poison', input: {}, target, caller }),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'ADMISSION_EFFECT_FAILED' && String(typed.message).includes('physical ledger outage');
    },
  );
  assert.equal(ledgerLines.length, 1, 'exactly one real external dispatch landed before the lost ACK');
  const rowsAfterPoison = await journalReads(target.instanceKey);
  assert.equal(rowsAfterPoison.length, 1);
  assert.equal(rowsAfterPoison[0]?.status, 'failed');
  assert.equal(rowsAfterPoison[0]?.zeroExternalEffect, false, 'an adapter-thrown code carries NO zero-effect proof (K01 R2 P1)');
  assert.notEqual(await inProcessStore.get(scopedFenceKey(target.instanceKey)), null, 'the fence stays held (fail-closed)');
  let ringRow = await inProcessStore.get(scopedInstanceKey(target.instanceKey));
  assert.equal(Object.keys(readRing(ringRow!.value)).length, 0, 'NO original receipt exists: the turn never admitted (the receipt cannot precede or fake the admission)');

  // A follower occurrence is refused typed at the held fence — and writes no
  // receipt, no journal, no state.
  await assert.rejects(
    () => poisonRuntime.submitOccurrence({ intentType: 'note', messageId: 'm-follow', input: {}, target, caller }),
    (error: unknown) => (error as { code?: string }).code === 'ADMISSION_STATE_CAS_CONFLICT',
  );
  assert.equal((await journalReads(target.instanceKey)).length, 1, 'the refused follower wrote no journal row');

  // The drain journey on its OWN instance: the FIRST turn of 'combined-drain'
  // meets the UNPROVISIONED ledger — the TRUSTED dispatcher refuses
  // pre-handler and MARKS the kernel-minted attest — the provable zero-effect
  // path (the tg5 q-drain seam).
  provisionLedger = false;
  await assert.rejects(
    () => poisonRuntime.submitOccurrence({ intentType: 'approve', messageId: 'm-drain', input: {}, target: drainTarget, caller }),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'ADMISSION_EFFECT_FAILED' && String(typed.message).includes('is not provisioned on this host');
    },
  );
  assert.equal(ledgerLines.length, 1, 'the attested refusal never reached a handler');
  const drainRows = await journalReads(drainTarget.instanceKey);
  const attestedRow = drainRows.find((row) => row.zeroExternalEffect === true);
  assert.ok(attestedRow !== undefined, 'the attested dispatcher pre-handler refusal IS the durable zero-effect proof');
  assert.equal(await inProcessStore.get(scopedFenceKey(drainTarget.instanceKey)), null, "the drain instance's fence was RELEASED through the docs.remove seam (physically absent)");
  assert.notEqual(await inProcessStore.get(scopedFenceKey(target.instanceKey)), null, "the UNCERTAIN instance's fence stays held");
  ringRow = await inProcessStore.get(scopedInstanceKey(drainTarget.instanceKey));
  assert.equal(Object.keys(readRing(ringRow!.value)).length, 0, 'the failed turn still holds no receipt');

  // Now the follower drains on the released instance and ITS original
  // receipt lands in the ring.
  provisionLedger = true;
  const drainReceipt = await poisonRuntime.submitOccurrence({ intentType: 'note', messageId: 'm-follow', input: {}, target: drainTarget, caller }) as any;
  assert.equal(drainReceipt.status, 'admitted', 'the follower occurrence drains after the attested-poisoned one');
  assert.equal(drainReceipt.instance.stateRevision, 1);
  ringRow = await inProcessStore.get(scopedInstanceKey(drainTarget.instanceKey));
  const ring = readRing(ringRow!.value);
  assert.equal(Object.keys(ring).length, 1, 'exactly the follower turn holds an original receipt');
  const followerEnvelope = ring[`turn:${enc(WORKFLOW_ID)}:${enc(drainTarget.instanceKey)}:message:${enc('m-follow')}`];
  assert.ok(followerEnvelope !== undefined);
  assert.equal(followerEnvelope.receipt?.instance?.stateRevision, 1, 'the follower receipt carries the projection its CAS committed');
  const followerFence = (await inProcessStore.get(scopedFenceKey(drainTarget.instanceKey))) as {
    value: { turnId: string };
  } | null;
  assert.equal(followerFence?.value?.turnId, `turn:${enc(WORKFLOW_ID)}:${enc(drainTarget.instanceKey)}:message:${enc('m-follow')}`, "the fence is the follower's own claim (a committed holder's fence persists until the next admission supersedes it by the revision CAS)");

  // The poison turn stays refused typed with zero new dispatch and never
  // gains a receipt; the uncertain instance's fence stays held.
  await assert.rejects(
    () => poisonRuntime.submitOccurrence({ intentType: 'approve', messageId: 'm-poison', input: {}, target, caller }),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed.code === 'ADMISSION_EFFECT_FAILED' && String(typed.message).includes('operator recovery owns any retry');
    },
  );
  assert.equal(ledgerLines.length, 1);
  ringRow = await inProcessStore.get(scopedInstanceKey(target.instanceKey));
  assert.equal(Object.keys(readRing(ringRow!.value)).length, 0, 'the poison turn never gains a receipt');
  assert.notEqual(await inProcessStore.get(scopedFenceKey(target.instanceKey)), null, "the uncertain instance's fence stays held to the end");
});

// ---------------------------------------------------------------------------
// CB-R1 — REAL two-process same-turn race over ONE shared SQLite file.
// ---------------------------------------------------------------------------
interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
  result: Record<string, any> | null;
}

function parseLastJsonLine(stdout: string): Record<string, any> | null {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index] as string);
      if (parsed !== null && typeof parsed === 'object') return parsed as Record<string, any>;
    } catch { /* not a JSON line */ }
  }
  return null;
}

function spawnWorker(args: readonly string[]): ChildProcess {
  return spawn(process.execPath, [WORKER_SCRIPT, ...args], {
    cwd: path.dirname(fileURLToPath(new URL('../../package.json', import.meta.url))),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function startWorker(args: readonly string[]): { child: ChildProcess; done: Promise<ChildResult> } {
  const child = spawnWorker(args);
  const done = new Promise<ChildResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`worker timed out after ${String(CHILD_TIMEOUT_MS)} ms\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, CHILD_TIMEOUT_MS);
    child.stdout!.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, result: parseLastJsonLine(stdout) });
    });
  });
  return { child, done };
}

function runWorker(args: readonly string[]): Promise<ChildResult> {
  return startWorker(args).done;
}

async function rmWithRetries(dir: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM') && attempt < 30) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}

const RACE_SCOPE_ARG = 'deploy-race';
const RACE_SCOPE_PREFIX = `v010-k02:${enc(RACE_SCOPE_ARG)}:${enc('t-scope')}:${enc('a-scope')}:${enc('pkg:quote:scoped')}`;
const raceInstanceKey = (instanceKey: string): string => `${RACE_SCOPE_PREFIX}:wf-instance:${enc(WORKFLOW_ID)}:${enc(instanceKey)}`;

const raceDirs: string[] = [];
const raceStores: SqliteCasStore[] = [];

after(async () => {
  await inProcessStore.close();
  await rm(inProcessDir, { recursive: true, force: true });
  for (const store of raceStores) await store.close();
  for (const dir of [...new Set(raceDirs)]) await rmWithRetries(dir);
});

interface RaceFixture {
  dir: string;
  dbPath: string;
  ledgerPath: string;
  store: SqliteCasStore;
  workerArgs(extra: readonly string[]): string[];
  ledgerLines(): Promise<string[]>;
  waitForCtrl(key: string): Promise<void>;
  putCtrl(key: string): Promise<void>;
  instanceDoc(instanceKey: string): Promise<any>;
  ringOf(instanceKey: string): Promise<ReceiptRing>;
}

async function raceFixture(name: string): Promise<RaceFixture> {
  const dir = await mkdtemp(path.join(tmpdir(), `dh-k02-combined-race-${name}-`));
  raceDirs.push(dir);
  const dbPath = path.join(dir, 'race.sqlite');
  const ledgerPath = path.join(dir, 'ledger.ndjson');
  await writeFile(ledgerPath, '', 'utf8');
  const store = await openSqliteCasStore({ path: dbPath });
  raceStores.push(store);
  const workerArgs = (extra: readonly string[]) => ['--db', dbPath, '--ledger', ledgerPath, '--scope', RACE_SCOPE_ARG, ...extra];
  const waitForCtrl = async (key: string): Promise<void> => {
    const deadline = Date.now() + 60_000;
    while ((await store.get(`ctrl:${key}`)) === null) {
      if (Date.now() > deadline) throw new Error(`control key ctrl:${key} never appeared`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  return {
    dir, dbPath, ledgerPath, store, workerArgs, waitForCtrl,
    putCtrl: async (key: string) => { await store.put(`ctrl:${key}`, { go: true }, { mustBeAbsent: true }); },
    ledgerLines: async () => (await readFile(ledgerPath, 'utf8')).split(/\r?\n/).filter((line) => line.trim().length > 0),
    instanceDoc: async (instanceKey: string) => (await store.get(raceInstanceKey(instanceKey)))?.value ?? null,
    ringOf: async (instanceKey: string) => readRing((await store.get(raceInstanceKey(instanceKey)))?.value),
  };
}

test('CB-R1 two real processes race the SAME turn over ONE SQLite file: exactly-once effect, the in-flight holder honestly loses its stolen fence, the reconciling retry lands the ORIGINAL receipt', { timeout: 300_000 }, async () => {
  const fx = await raceFixture('r1');
  const instance = 'race-1';
  const opened = await runWorker(fx.workerArgs(['--mode', 'open', '--instance', instance, '--worker', 'opener']));
  assert.equal(opened.result?.status, 'ok', `open failed: ${opened.stdout}\n${opened.stderr}`);

  // A parks inside the effect handler AFTER its fence claim; B — a REAL
  // second process — carries the SAME messageId. By identity B is the SAME
  // turn re-entered in-flight: the same-turnId re-claim is the kernel's
  // crash-recovery path (a slow holder is indistinguishable from a crashed
  // one), so B takes the fence and hits the durable 'started' +
  // non-idempotent journal record — the honest typed UNKNOWN (K01-N1), never
  // a second dispatch, never a fabricated ACK.
  const pendingA = startWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-race', '--worker', 'a', '--park', 'r1-entered:r1-go']));
  await fx.waitForCtrl('r1-entered');
  const b = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-race', '--worker', 'b']));
  assert.equal(b.result?.status, 'error', `B outcome: ${b.stdout}\n${b.stderr}`);
  assert.equal(b.result?.error_code, 'ADMISSION_EFFECT_AMBIGUOUS', 'the concurrent same-turn duplicate is an honest typed UNKNOWN while the journal row is started');
  assert.equal((await fx.ledgerLines()).length, 0, 'B dispatched nothing');

  // A resumes: its handler lands the ONE real external dispatch, the journal
  // completes — and its COMMIT honestly loses (#requireHeldAdmissionFence:
  // B's re-claim moved the fence), zero durable state move.
  await fx.putCtrl('r1-go');
  const a = await pendingA.done;
  assert.equal(a.result?.status, 'error', `A outcome: ${a.stdout}\n${a.stderr}`);
  assert.equal(a.result?.error_code, 'ADMISSION_STATE_CAS_CONFLICT', 'the in-flight holder loses its commit honestly after the same-turn re-claim');
  assert.equal((await fx.ledgerLines()).length, 1, 'exactly ONE real external dispatch (accounted by the journal)');
  let doc = await fx.instanceDoc(instance);
  assert.equal(doc.stateRevision, 0, 'no state moved yet');

  // The reconciling retry (a third process): the journal 'completed' record
  // is REPLAYED (no second dispatch — K01-N2 semantics) and the commit
  // lands — with the ORIGINAL receipt riding the same state CAS.
  const retry = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-race', '--worker', 'c']));
  assert.equal(retry.result?.status, 'admitted', `retry outcome: ${retry.stdout}\n${retry.stderr}`);
  assert.equal(retry.result?.stateRevision, 1);
  assert.equal((await fx.ledgerLines()).length, 1, 'still exactly one real external dispatch — the completed journal is replayed, never re-executed');

  // The ORIGINAL receipt is in the scoped instance document: exactly one
  // admitted turn, exactly one state revision.
  const ring = await fx.ringOf(instance);
  const envelope = ring[`turn:${enc(WORKFLOW_ID)}:${enc(instance)}:message:${enc('m-race')}`];
  assert.ok(envelope !== undefined, 'the original receipt rode the reconciling state CAS');
  assert.equal(envelope?.receipt?.instance?.stateRevision, 1);
  doc = await fx.instanceDoc(instance);
  assert.equal(doc.stateRevision, 1, 'the state moved exactly once');
  assert.equal(doc.state.stateKey, 'approved');

  // A changed-input re-send of the SAME messageId from yet another process
  // refuses typed (root-cause-1 repair, cross-process).
  const changed = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-race', '--input-json', '{"sku":"CHANGED"}', '--worker', 'd']));
  assert.equal(changed.result?.status, 'error', `changed-input outcome: ${changed.stdout}\n${changed.stderr}`);
  assert.equal(changed.result?.error_code, 'K02_TURN_RECEIPT_INPUT_CONFLICT', 'the changed canonical input refuses typed across processes');
  assert.equal((await fx.ledgerLines()).length, 1, 'the conflict dispatched nothing');
  const finalRing = await fx.ringOf(instance);
  assert.equal(Object.keys(finalRing).length, 1, 'the ring holds exactly the single admitted turn');
});

// ---------------------------------------------------------------------------
// CB-Q1 / CB-J1 — review round-1 P1/P2 physical regression legs: the
// continuation query read and the public journal list surface must thread
// the SCOPED doc keys (kernel deploymentScope wiring). A same-address LEGACY
// document on the SAME physical store must stay unreachable, and
// getJournalRecords must work in scoped wiring (before the journalPrefix
// repair it threw K02_SCOPE_INVALID on every scoped deployment).
// ---------------------------------------------------------------------------
test('CB-Q1 the continuation query reads the SCOPED instance document; a same-address LEGACY document on the same store is unreachable', { timeout: 120_000 }, async () => {
  const SDK_SOURCE = await readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8');
  const sdk: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(SDK_SOURCE, 'utf8').toString('base64')}`);
  const q1Dir = await mkdtemp(path.join(tmpdir(), 'dh-k02-cbq1-'));
  const q1Store = await openSqliteCasStore({ path: path.join(q1Dir, 'cbq1.sqlite') });
  try {
    const q1Target = { workflowId: WORKFLOW_ID, instanceKey: 'cb-q1' };
    const legacyInstanceKey = `v08-kernel:wf-instance:${WORKFLOW_ID}:cb-q1`;

    // Physical read log over the REAL store (the FR07-KH2 counting-wrapper
    // discipline): which instance key the K-owned continuation read touched.
    const reads: string[] = [];
    const countingStore = {
      async get(key: string) { reads.push(key); return q1Store.get(key); },
      async put(key: string, value: unknown, conditions: CasPutConditions) { return q1Store.put(key, value, conditions); },
      async remove(key: string, conditions: CasPutConditions) { return q1Store.remove(key, conditions); },
      async list(prefix: string) { return q1Store.list(prefix); },
      async close() { return q1Store.close(); },
    };

    // The POISON: a legacy-namespace instance document at the SAME address,
    // shaped exactly so the unscoped legacy-key fallback would ACCEPT it
    // (matching address, revision 0 == the pre-turn stateRevision, valid context).
    await q1Store.put(legacyInstanceKey, {
      address: { workflowId: WORKFLOW_ID, instanceKey: q1Target.instanceKey },
      stateRevision: 0,
      state: { stateKey: 'review', context: { customerTier: 'BRONZE-POISON' } },
    }, { mustBeAbsent: true });

    // Behavioral poison probe: the model turns any NON-gold observation into
    // a DISALLOWED final outcome — if the query ever read the legacy poison
    // document, this turn terminates FINAL_OUTCOME_NOT_ALLOWED instead of
    // admitting. Only the scoped document's 'gold' admits.
    const resolver = sdk.createHostBoundModelResolver({
      invoke: async (request: { input: any }) => {
        const input = request.input;
        if (input.step === 1) {
          return { kind: 'query', call: { capabilityId: 'quote.readTier', input: {} } };
        }
        const observedTier = input.observations?.[0]?.output?.tier;
        const outcome = observedTier === 'gold' ? 'decide' : 'poison-detected';
        return {
          kind: 'final',
          result: { decision: { outcome, data: { tier: observedTier } }, event: { type: 'APPROVED', payload: {} } },
        };
      },
    });
    const continuationPolicy: Record<string, unknown> = {
      ...policy,
      policyId: 'quote-continuation',
      initialContext: { customerTier: 'gold' },
      rules: {
        ...policy.rules,
        'rule:tiered': {
          kind: 'model-decision',
          id: 'rule:tiered',
          modelOperation: 'quote.continue',
          harness: {
            maxSteps: 3,
            capabilities: {
              'quote.readTier': { mode: 'read', source: 'instance-context', fields: { tier: 'customerTier' }, outputSchema: { tier: 'string' } },
            },
            allowedOutcomes: ['decide'],
            allowedEvents: ['APPROVED'],
          },
        },
      },
      intentBindings: {
        ...policy.intentBindings,
        tieredApprove: { trigger: { kind: 'event', eventType: 'APPROVED' }, ruleId: 'rule:tiered', roles: ['approver'] },
      },
    };
    const rt = scopedRuntime(countingStore, {
      async call(_resourceKey: string, _operation: string, _payload: unknown) { return { reserved: true }; },
    }, continuationPolicy, {
      packageId: 'std:k02-combined',
      interpret: async () => { throw new Error('the continuation rule must run through invokeStep, never interpret'); },
      invokeStep: (declaration: unknown, input: unknown, context: unknown, control: unknown) =>
        resolver.invokeStep(declaration, input, context, control),
    });

    await rt.openInstance({ target: q1Target, authorityClass: 'PRODUCTION' });
    const receipt = await rt.submitOccurrence({ intentType: 'tieredApprove', messageId: 'm-q1', input: {}, target: q1Target, caller });
    assert.equal(receipt.status, 'admitted', `the continuation turn admits from the SCOPED document (a poison read would terminate FINAL_OUTCOME_NOT_ALLOWED): ${JSON.stringify(receipt)}`);
    assert.equal(receipt.admitted.resolver.continuation.queries, 1, 'exactly one K-owned query executed and produced a valid observation');
    assert.equal(receipt.admitted.targetState, 'approved');
    assert.ok(reads.includes(scopedInstanceKey(q1Target.instanceKey)), 'the continuation read touched the SCOPED instance key');
    assert.ok(!reads.includes(legacyInstanceKey), 'the LEGACY same-address instance key was never read — cross-namespace documents are physically unreachable');
  } finally {
    await q1Store.close();
    await rm(q1Dir, { recursive: true, force: true });
  }
});

test('CB-J1 the public journal list surface works in scoped wiring and cannot enumerate foreign namespaces', { timeout: 120_000 }, async () => {
  const j1Dir = await mkdtemp(path.join(tmpdir(), 'dh-k02-cbj1-'));
  const j1Store = await openSqliteCasStore({ path: path.join(j1Dir, 'cbj1.sqlite') });
  try {
    // Foreign journal documents on the SAME physical store: a legacy-namespace
    // record and another deployment scope's record.
    await j1Store.put('v08-kernel:effect-journal:foreign-legacy', { record: { effectId: 'foreign-legacy' } }, { mustBeAbsent: true });
    await j1Store.put(
      `v010-k02:${enc('deploy-other')}:${enc(SCOPE.tenantId)}:${enc(SCOPE.appId)}:${enc('pkg:quote:other')}:effect-journal:foreign-b2`,
      { record: { effectId: 'foreign-b2' } },
      { mustBeAbsent: true },
    );

    const j1Dispatches: unknown[] = [];
    const rt = scopedRuntime(j1Store, {
      async call(_resourceKey: string, _operation: string, payload: unknown) { j1Dispatches.push(payload); return { reserved: true }; },
    });
    const j1Target = { workflowId: WORKFLOW_ID, instanceKey: 'cb-j1' };
    await rt.openInstance({ target: j1Target, authorityClass: 'PRODUCTION' });
    const receipt = await rt.submitOccurrence({ intentType: 'approve', messageId: 'm-j1', input: {}, target: j1Target, caller });
    assert.equal(receipt.status, 'admitted');
    assert.equal(j1Dispatches.length, 1, 'one real effect dispatch settled this deployment\'s own journal record');

    // The scoped journal list surface (before the journalPrefix repair this
    // threw K02_SCOPE_INVALID on every scoped deployment).
    const records: { effectId?: unknown }[] = await rt.getJournalRecords();
    assert.equal(records.length, 1, 'exactly this deployment\'s own journal record is visible');
    assert.ok(records.every((record) => !String(record.effectId).includes('foreign')), 'no foreign-namespace journal record is enumerable');
  } finally {
    await j1Store.close();
    await rm(j1Dir, { recursive: true, force: true });
  }
});
