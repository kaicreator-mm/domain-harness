/**
 * #1003 NF06 — the REAL selected K/S/Host physical path for decision
 * receipts (this file is its OWN clean process; sibling of
 * fr08-sd-nf05-physical.test.ts, same fixture family and trusted ports).
 *
 * Composition under test: the sealed semantic Business fixture's two
 * receipt-policy intents → the authenticated send enters the Kernel submit
 * lane → for `observational-optional` the admitted turn (business state CAS
 * + Effect + Journal already authoritative) appends ONE redacted data-only
 * DECISION_RECEIPT record at the exact durable turn key through the Host
 * true-CAS create; for `durable-mandatory` the v0.8 Host has NO
 * cross-document atomic batch, so the Kernel refuses the intent typed
 * BEFORE admission (zero Effect/Journal/State) and reports
 * PRODUCT_DECISION_REQUIRED. Append failures after the admitted business
 * commit are separate typed observation outcomes that never rewrite the
 * business truth. A spawned child process reopens the same SQLite file and
 * reads the record through the authenticated gateway (physical restart).
 *
 * #1055 R1 repair negatives (two P1 root causes, same fixture):
 *   - CROSS-INTENT: the read authorization is the record's OWN frozen
 *     reader scope (the intent that recorded it), never the union of all
 *     policies' roles — a reader of intent A is refused typed on intent B's
 *     committed receipt, while B's own reader is admitted.
 *   - REPLAY-READ-FAULT: a HOST_KEY_EXISTS re-read that itself fails
 *     physically stays a separate not_recorded observation; the already
 *     committed State/Journal/Effect ACK is never failed by it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapTrustedHost, createKernelGateway, type SqliteCasStore } from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sealRealApp, sqliteTempPath } from './helpers.js';

const AUDIENCE = 'dh-v08-nf06';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const RECEIPT_PREFIX = 'v08-kernel:decision-receipt:';
const DECLARATION_DIGEST = 'cec497dae01dddea7df015a3ecbfb71086095ecb462d714aa80acd8b93fdd986';

const invocations: { operation: string; input: unknown }[] = [];
const ledgerCalls: unknown[] = [];
let handle: Awaited<ReturnType<typeof bootstrapTrustedHost>>;
let gateway: ReturnType<typeof createKernelGateway>;
let operator: ReturnType<typeof mintCredential>;
let requester: ReturnType<typeof mintCredential>;
let outsider: ReturnType<typeof mintCredential>;
/** [#1055 R1 P1-01] Holds ONLY the disjoint restricted intent's reader role. */
let restrictedReader: ReturnType<typeof mintCredential>;
/** [#1055 R1 P1-01] Holds ONLY the open intent's secondary reader role. */
let observerReader: ReturnType<typeof mintCredential>;
let hostClosed = false;
let storagePath: string;
/** The ONE sealed closure of this process — the restart leg re-registers the EXACT same root (durable pin idempotence). */
let sealedRoot: Awaited<ReturnType<typeof sealRealApp>>;

test.before(async () => {
  storagePath = sqliteTempPath('nf06');
  sealedRoot = await sealRealApp('semantic');
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: storagePath },
    modelPort: {
      invoke: async (request: { operation: string; input: unknown }) => {
        invocations.push({ operation: request.operation, input: request.input });
        return {
          decision: { outcome: 'model-proposed' },
          event: { type: 'MODEL_QUOTE_DECIDED', payload: {} },
        };
      },
    },
  });
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: 'sd-quote', packageRoot: sealedRoot, genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  outsider = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'out', roles: ['no-access'], audience: AUDIENCE, grantId: 'g-out' });
  restrictedReader = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'restricted', roles: ['restricted-reader'], audience: AUDIENCE, grantId: 'g-restricted' });
  observerReader = mintCredential({ tenantId: 't1', appId: 'sd-quote', subject: 'obs', roles: ['observer'], audience: AUDIENCE, grantId: 'g-obs' });
});

test.after(async () => {
  if (!hostClosed) await handle.host.close();
});

async function activatedInstance(instanceKey: string): Promise<string> {
  await gateway.activateGenesis(operator, { appId: 'sd-quote', instanceKey });
  return instanceKey;
}

function sendIntent(input: {
  readonly intentType: string;
  readonly messageId: string;
  readonly input: Record<string, unknown>;
  readonly instanceKey: string;
}) {
  return gateway.send(requester, {
    intentType: input.intentType,
    messageId: input.messageId,
    input: input.input,
    target: { tenantId: 't1', appId: 'sd-quote', instanceKey: input.instanceKey },
  });
}

async function journalRecordsFor(instanceKey: string): Promise<number> {
  const keys = await handle.host.docs.list(JOURNAL_PREFIX);
  let matching = 0;
  for (const key of keys) {
    const doc = (await handle.host.docs.get(key)) as { value?: { record?: { target?: { instanceKey?: string } } } } | null;
    if (doc?.value?.record?.target?.instanceKey === `t1:sd-quote:${instanceKey}`) matching += 1;
  }
  return matching;
}

async function stateOf(instanceKey: string): Promise<string> {
  const snapshot = await gateway.queryInstance(requester, { tenantId: 't1', appId: 'sd-quote', instanceKey }) as { state: { stateKey: string } };
  return snapshot.state.stateKey;
}

function receiptKeyOf(instanceKey: string, messageId: string): string {
  // Mirrors K's deriveDurableControlTurnId: every component is URL-encoded
  // (the tenant/app-qualified instanceKey carries ':' → '%3A').
  const component = (value: string) => encodeURIComponent(value);
  return `${RECEIPT_PREFIX}turn:${component('sd-quote')}:${component(`t1:sd-quote:${instanceKey}`)}:message:${component(messageId)}`;
}

test('NF06-P: an observational-optional admitted turn appends ONE redacted receipt and U reads it back authorized', async () => {
  const instanceKey = await activatedInstance('sd-rc-1');
  const ledgerBefore = ledgerCalls.length;
  const receipt = await sendIntent({
    intentType: 'submitSdReceiptQuote',
    messageId: 'm-rc-1',
    input: { amount: 30, requestId: 'SD-RC-1' },
    instanceKey,
  }) as {
    status: string;
    decisionReceipt?: { status?: string; receiptKey?: string; durability?: string };
  };

  assert.equal(receipt.status, 'admitted', 'the business occurrence is admitted through the standard gates');
  assert.equal(receipt.decisionReceipt?.status, 'recorded', 'the observation outcome is honestly recorded');
  assert.equal(receipt.decisionReceipt?.durability, 'observational-optional');
  assert.equal(receipt.decisionReceipt?.receiptKey, receiptKeyOf('sd-rc-1', 'm-rc-1'), 'the record lives at the exact K-owned durable turn key');
  assert.equal(invocations.length, 0, 'the semantic route stays model-free');

  // Business truth is the authority: state, journal, effect.
  assert.equal(await stateOf(instanceKey), 'approved');
  assert.equal(await journalRecordsFor(instanceKey), 1, 'exactly ONE durable journal record');
  assert.equal(ledgerCalls.length - ledgerBefore, 1, 'the transition effect dispatched physically exactly once');

  // U's authorized read returns the redacted data-only record.
  const record = await gateway.queryDecisionReceipt(requester, { tenantId: 't1', appId: 'sd-quote', instanceKey, messageId: 'm-rc-1' }) as {
    projected?: Record<string, unknown>;
    occurrence?: { messageId?: string; workflowInstanceId?: string };
  };
  const projected = record?.projected;
  assert.equal(projected?.kind, 'decision-receipt-record');
  assert.equal(projected?.eventType, 'DECISION_RECEIPT');
  assert.equal(projected?.turnId, 'turn:sd-quote:t1%3Asd-quote%3Asd-rc-1:message:m-rc-1');
  assert.deepEqual(projected?.declaration, { ruleId: 'rule:sd-fixed-quote', declarationDigest: DECLARATION_DIGEST });
  assert.deepEqual(projected?.decision, { outcome: 'approve' });
  assert.deepEqual(projected?.event, { type: 'SD_QUOTE_DECIDED' });
  assert.equal(projected?.llmAvoided, true);
  assert.equal(projected?.authority, 'data-only');
  assert.equal(record?.occurrence?.messageId, 'm-rc-1');
  // Redaction on the physical record: no raw input, no request id, no model text.
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes('SD-RC-1'), 'the raw requestId never enters the persisted record');
  assert.ok(!serialized.includes('"amount"'), 'the raw amount payload never enters the persisted record');

  // The physical document exists exactly once at the turn key (true-CAS create).
  const keys = await handle.host.docs.list(RECEIPT_PREFIX);
  assert.deepEqual(keys, [receiptKeyOf('sd-rc-1', 'm-rc-1')]);
});

test('NF06-N: an unauthorized observer read refuses typed before any record byte is returned', async () => {
  await assert.rejects(
    () => gateway.queryDecisionReceipt(outsider, { tenantId: 't1', appId: 'sd-quote', instanceKey: 'sd-rc-1', messageId: 'm-rc-1' }),
    (error: unknown) => (error as { code?: string })?.code === 'DECISION_RECEIPT_READ_UNAUTHORIZED',
  );
  // A forged (unauthenticated) credential never reaches the store at all.
  await assert.rejects(
    () => gateway.queryDecisionReceipt({ forged: true }, { tenantId: 't1', appId: 'sd-quote', instanceKey: 'sd-rc-1', messageId: 'm-rc-1' }),
    (error: unknown) => typeof (error as { code?: string })?.code === 'string',
  );
});

test('NF06-N-CROSS-INTENT: a reader role of one intent cannot read another intent\'s committed receipt — the authorization is the record\'s own frozen scope, never the union', async () => {
  // A restricted-intent turn on the SAME tenant/app family appends its own
  // receipt under a DISJOINT reader scope (['restricted-reader'] vs
  // ['requester', 'observer']).
  const instanceKey = await activatedInstance('sd-xint-1');
  const receipt = await sendIntent({
    intentType: 'submitSdRestrictedQuote',
    messageId: 'm-xint',
    input: { amount: 30, requestId: 'SD-XINT' },
    instanceKey,
  }) as { status: string; decisionReceipt?: { status?: string; receiptKey?: string } };

  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.decisionReceipt?.status, 'recorded', 'the restricted intent is a normal observational-optional turn');
  assert.equal(receipt.decisionReceipt?.receiptKey, receiptKeyOf('sd-xint-1', 'm-xint'));

  // RED target [#1055 R1 P1-01]: 'requester' IS a declared receipt reader of
  // submitSdReceiptQuote, so a global union gate admits it — but it holds
  // none of THIS record's frozen scope and MUST be refused typed.
  await assert.rejects(
    () => gateway.queryDecisionReceipt(requester, { tenantId: 't1', appId: 'sd-quote', instanceKey, messageId: 'm-xint' }),
    (error: unknown) => (error as { code?: string })?.code === 'DECISION_RECEIPT_READ_UNAUTHORIZED',
    'a reader of intent A must not read intent B\'s committed receipt even though its role is in the all-policies union',
  );
  // Same for a pure 'observer' reader of the open intent.
  await assert.rejects(
    () => gateway.queryDecisionReceipt(observerReader, { tenantId: 't1', appId: 'sd-quote', instanceKey, messageId: 'm-xint' }),
    (error: unknown) => (error as { code?: string })?.code === 'DECISION_RECEIPT_READ_UNAUTHORIZED',
  );

  // The legitimate control: the record's OWN declared reader is admitted and
  // sees the same redacted data-only record.
  const record = await gateway.queryDecisionReceipt(restrictedReader, { tenantId: 't1', appId: 'sd-quote', instanceKey, messageId: 'm-xint' }) as {
    projected?: { kind?: string; decision?: { outcome?: string } };
    occurrence?: { messageId?: string };
  };
  assert.equal(record?.projected?.kind, 'decision-receipt-record');
  assert.equal(record?.projected?.decision?.outcome, 'approve');
  assert.equal(record?.occurrence?.messageId, 'm-xint');

  // Disjoint in the reverse direction too: the restricted reader cannot read
  // the open intent's committed record (m-rc-1 from the P test above).
  await assert.rejects(
    () => gateway.queryDecisionReceipt(restrictedReader, { tenantId: 't1', appId: 'sd-quote', instanceKey: 'sd-rc-1', messageId: 'm-rc-1' }),
    (error: unknown) => (error as { code?: string })?.code === 'DECISION_RECEIPT_READ_UNAUTHORIZED',
  );
});

test('NF06-N: a conflicting record occupying the turn key refuses typed, is never overwritten, and the business truth still advances', async () => {
  const instanceKey = await activatedInstance('sd-conf-1');
  const key = receiptKeyOf('sd-conf-1', 'm-conf');
  // A hostile pre-existing record of a DIFFERENT identity (pinned to other
  // kernel bytes) occupies the exact turn key before the occurrence runs.
  await handle.host.docs.put(key, {
    kernelModuleSha256: 'pinned-to-a-different-kernel-module',
    record: { projected: { kind: 'decision-receipt-record', turnId: 'turn:sd-quote:t1:sd-quote:sd-conf-1:message:m-conf' } },
  }, { mustBeAbsent: true });
  const ledgerBefore = ledgerCalls.length;

  const receipt = await sendIntent({
    intentType: 'submitSdReceiptQuote',
    messageId: 'm-conf',
    input: { amount: 30, requestId: 'SD-CONF' },
    instanceKey,
  }) as { status: string; decisionReceipt?: { status?: string; error?: { code?: string } } };

  assert.equal(receipt.status, 'admitted', 'the business occurrence is still admitted — a receipt conflict never blocks business');
  assert.equal(receipt.decisionReceipt?.status, 'not_recorded');
  assert.equal(receipt.decisionReceipt?.error?.code, 'DECISION_RECEIPT_CONFLICT');
  // Business truth advanced regardless.
  assert.equal(await stateOf(instanceKey), 'approved');
  assert.equal(await journalRecordsFor(instanceKey), 1);
  assert.equal(ledgerCalls.length - ledgerBefore, 1);
  // The conflicting record was NOT overwritten by the append attempt.
  const stored = (await handle.host.docs.get(key)) as { value?: { kernelModuleSha256?: string } };
  assert.equal(stored?.value?.kernelModuleSha256, 'pinned-to-a-different-kernel-module');
});

test('NF06-N-REPLAY-READ-FAULT: a HOST_KEY_EXISTS re-read failure after the admitted business commit stays a separate not_recorded observation — never a business ACK failure', async () => {
  const instanceKey = await activatedInstance('sd-rf-1');
  const key = receiptKeyOf('sd-rf-1', 'm-rf');
  // Pre-occupy the exact turn key with a DIFFERENT-identity record, so the
  // append's true-CAS create refuses HOST_KEY_EXISTS and the code path must
  // re-read the winner — exactly like the conflict test above.
  await handle.host.docs.put(key, {
    kernelModuleSha256: 'pinned-to-a-different-kernel-module',
    record: { projected: { kind: 'decision-receipt-record', turnId: 'turn:sd-quote:t1:sd-quote:sd-rf-1:message:m-rf' } },
  }, { mustBeAbsent: true });
  // RED target [#1055 R1 P1-02]: the re-read itself fails physically — a
  // typed Host read fault on the decision-receipt namespace. The observation
  // boundary must absorb it; the admitted business ACK must survive.
  (handle.store as SqliteCasStore).failNextGetMatching('decision-receipt');
  const ledgerBefore = ledgerCalls.length;

  const receipt = await sendIntent({
    intentType: 'submitSdReceiptQuote',
    messageId: 'm-rf',
    input: { amount: 30, requestId: 'SD-RF' },
    instanceKey,
  }) as { status: string; admitted?: unknown; decisionReceipt?: { status?: string; error?: { code?: string; message?: string } } };

  assert.equal(receipt.status, 'admitted', 'the business ACK is never failed by an observation re-read error');
  assert.ok(receipt.admitted !== undefined, 'the admitted business outcome is still fully reported');
  assert.deepEqual(
    receipt.decisionReceipt,
    { status: 'not_recorded', error: { code: 'HOST_FAULT_INJECTED', message: (receipt.decisionReceipt?.error?.message as string) } },
    'the separate observation outcome reports the actual re-read fault without any recorded claim',
  );
  // Business truth is durable regardless: state, journal, effect — each once.
  assert.equal(await stateOf(instanceKey), 'approved');
  assert.equal(await journalRecordsFor(instanceKey), 1);
  assert.equal(ledgerCalls.length - ledgerBefore, 1);
  // The one-shot read fault is consumed; the occupied record still stands
  // (never overwritten by the append attempt).
  const stored = (await handle.host.docs.get(key)) as { value?: { kernelModuleSha256?: string } };
  assert.equal(stored?.value?.kernelModuleSha256, 'pinned-to-a-different-kernel-module');
});

test('NF06-N-APPEND-FAIL: a physical append failure after the admitted business commit keeps the business ACK truth unchanged and reports not_recorded', async () => {
  const instanceKey = await activatedInstance('sd-fail-1');
  const key = receiptKeyOf('sd-fail-1', 'm-fail');
  const ledgerBefore = ledgerCalls.length;
  // Inject the physical Host storage fault BEFORE the send; it fires on the
  // first write whose key matches the decision-receipt namespace — the
  // journal and instance CAS writes use different keys and stay healthy.
  (handle.store as SqliteCasStore).failNextPutMatching('decision-receipt');

  const receipt = await sendIntent({
    intentType: 'submitSdReceiptQuote',
    messageId: 'm-fail',
    input: { amount: 30, requestId: 'SD-FAIL' },
    instanceKey,
  }) as { status: string; admitted?: unknown; decisionReceipt?: { status?: string; error?: { code?: string; message?: string } } };

  assert.equal(receipt.status, 'admitted', 'the business ACK truth is unchanged by the observation failure');
  assert.ok(receipt.admitted !== undefined, 'the admitted business outcome is still fully reported');
  assert.deepEqual(
    receipt.decisionReceipt,
    { status: 'not_recorded', error: { code: 'HOST_FAULT_INJECTED', message: (receipt.decisionReceipt?.error?.message as string) } },
    'the separate observation outcome is not_recorded with the typed Host fault',
  );
  // No fake persisted-record claim: the key is physically absent.
  assert.equal(await handle.host.docs.get(key), null, 'no persisted receipt exists for the faulted append');
  // Business truth is durable regardless: state, journal, effect.
  assert.equal(await stateOf(instanceKey), 'approved');
  assert.equal(await journalRecordsFor(instanceKey), 1);
  assert.equal(ledgerCalls.length - ledgerBefore, 1);

  // The fault is one-shot: the next admitted turn appends normally again.
  const again = await sendIntent({
    intentType: 'submitSdReceiptQuote',
    messageId: 'm-fail-2',
    input: { amount: 30, requestId: 'SD-FAIL-2' },
    instanceKey: await activatedInstance('sd-fail-2'),
  }) as { decisionReceipt?: { status?: string } };
  assert.equal(again.decisionReceipt?.status, 'recorded');
});

test('NF06-N-MANDATORY: a durable-mandatory receipt policy is refused typed BEFORE admission with zero side effects', async () => {
  const instanceKey = await activatedInstance('sd-man-1');
  const ledgerBefore = ledgerCalls.length;
  const receipt = await sendIntent({
    intentType: 'submitSdMandatoryQuote',
    messageId: 'm-man',
    input: { amount: 30, requestId: 'SD-MAN' },
    instanceKey,
  }) as {
    status: string;
    denial?: { reason?: string; decisionReceipt?: { policy?: string; supported?: boolean; productDecision?: string } };
  };

  assert.equal(receipt.status, 'denied', 'the mandatory mode is denied, never silently degraded to optional');
  assert.equal(receipt.denial?.reason, 'decision-receipt-mandatory-unsupported');
  assert.equal(receipt.denial?.decisionReceipt?.policy, 'durable-mandatory');
  assert.equal(receipt.denial?.decisionReceipt?.supported, false);
  assert.equal(receipt.denial?.decisionReceipt?.productDecision, 'PRODUCT_DECISION_REQUIRED');
  // Zero mutation: no model call, no effect, no journal, no state move, no receipt row.
  assert.equal(invocations.length, 0);
  assert.equal(ledgerCalls.length - ledgerBefore, 0);
  assert.equal(await journalRecordsFor(instanceKey), 0);
  assert.equal(await stateOf(instanceKey), 'review', 'no state mutation before the refusal');
  assert.equal(await handle.host.docs.get(receiptKeyOf('sd-man-1', 'm-man')), null, 'no receipt row was persisted for the refused occurrence');
});

test('NF06-P-RESTART: a fresh process reopens the same SQLite file and reads the persisted DECISION_RECEIPT through the authenticated gateway', async () => {
  const rootFile = join(tmpdir(), `dh1013-nf06-root-${process.pid}.json`);
  await writeFile(rootFile, JSON.stringify(sealedRoot), 'utf8');
  const dbPath = storagePath;

  // Physically close THIS process's store, then spawn a fresh reader.
  await handle.host.close();
  hostClosed = true;

  const reader = spawn(process.execPath, [
    '--import', 'tsx',
    fileURLToPath(new URL('./nf06-restart-reader.ts', import.meta.url)),
    rootFile,
    dbPath,
    'sd-rc-1',
    'm-rc-1',
  ], { cwd: process.cwd(), env: process.env });
  let stdout = '';
  let stderr = '';
  reader.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  reader.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  const exitCode = await new Promise<number>((resolve) => {
    reader.on('close', (code: number | null) => resolve(code ?? -1));
  });
  assert.equal(exitCode, 0, `the restart reader process must succeed (stderr: ${stderr.slice(0, 400)})`);
  const line = stdout.split(/\r?\n/).find((candidate) => candidate.startsWith('NF06_RESTART_RESULT '));
  assert.ok(line !== undefined, `the restart reader printed its result line (stdout: ${stdout.slice(0, 400)})`);
  const result = JSON.parse(line.slice('NF06_RESTART_RESULT '.length)) as {
    record: { projected?: { kind?: string; decision?: { outcome?: string }; declaration?: unknown }; occurrence?: { messageId?: string } } | null;
    state?: string;
    unauthorized?: string;
    absent?: unknown;
  };

  // The persisted DECISION_RECEIPT physically survived the process restart.
  assert.equal(result.record?.projected?.kind, 'decision-receipt-record');
  assert.equal(result.record?.projected?.decision?.outcome, 'approve');
  assert.deepEqual(result.record?.projected?.declaration, { ruleId: 'rule:sd-fixed-quote', declarationDigest: DECLARATION_DIGEST });
  assert.equal(result.record?.occurrence?.messageId, 'm-rc-1');
  // The authoritative business state survived the restart too.
  assert.equal(result.state, 'approved');
  // The reader-role gate and honest-absence semantics survive the restart.
  assert.equal(result.unauthorized, 'DECISION_RECEIPT_READ_UNAUTHORIZED');
  assert.equal(result.absent, 'honest-null');
});
