/**
 * v0.8.1 R01 — durable (target, messageId) dedup for MESSAGE turns in the
 * selected Kernel payload.
 * =======================================================================
 *
 * v0.2–v0.7 FR04 resolved a re-sent messageId to its durable disposition
 * (DUPLICATE). The v0.8 port routed only NON-message durable control turns
 * through the #1062 turn-disposition / #1066 same-CAS admission-history
 * gate, so a re-send on a self-loop transition committed a SECOND state
 * revision under the same durableControlTurnId (the effect journal only
 * masked the physical dispatch). Contract tests on the PHYSICAL kernel
 * payload bytes (data-URL import, installer discipline):
 *
 *   R01-P1  a re-send of an admitted messageId on a legal self-loop replays
 *           the stored receipt (idempotentReplay) with zero new revision,
 *           journal row or dispatch;
 *   R01-N1  the same messageId under a DIFFERENT intentType refuses typed
 *           ADMISSION_TURN_DISPOSITION_CONFLICT before admission;
 *   R01-P2  a late retry after further transitions still replays the
 *           original ACK instead of a misleading business denial;
 *   R01-P3  a disposition lost to the crash window is answered by the
 *           same-CAS admission history (zero new revision) and healed;
 *   R01-P4  denials are not dispositions: a re-sent denied message is
 *           evaluated afresh (no state ever moved for it).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const KERNEL_SOURCE = readFileSync(fileURLToPath(new URL('../src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url)), 'utf8');
const KERNEL_SHA256 = createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex');
const kernel: Record<string, any> = await import('data:text/javascript;base64,' + Buffer.from(KERNEL_SOURCE, 'utf8').toString('base64'));

const NOW = '2026-10-16T00:00:00.000Z';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const DISPOSITION_PREFIX = 'v08-kernel:turn-disposition:';

function memoryDocs() {
  const docs = new Map<string, { value: any; revision: number }>();
  let failPrefix: string | undefined;
  return {
    /** Test injection: fail the NEXT put whose key matches the prefix once. */
    failNextPutOn(prefix: string): void {
      failPrefix = prefix;
    },
    async get(key: string) {
      const doc = docs.get(key);
      return doc === undefined ? null : { value: JSON.parse(JSON.stringify(doc.value)), revision: doc.revision };
    },
    async put(key: string, value: any, conditions: Record<string, unknown> = {}) {
      if (failPrefix !== undefined && key.startsWith(failPrefix)) {
        failPrefix = undefined;
        throw Object.assign(new Error(`injected store failure for ${key}`), { code: 'HOST_STORE_INJECTED_FAILURE' });
      }
      const existing = docs.get(key);
      if (conditions.mustBeAbsent === true && existing !== undefined) {
        throw Object.assign(new Error(`host doc ${key} exists`), { code: 'HOST_KEY_EXISTS' });
      }
      if (conditions.mustMatchRevision !== undefined && existing?.revision !== conditions.mustMatchRevision) {
        throw Object.assign(new Error(`host doc ${key} CAS conflict`), { code: 'HOST_CAS_CONFLICT' });
      }
      const revision = existing === undefined ? 0 : existing.revision + 1;
      docs.set(key, { value: JSON.parse(JSON.stringify(value)), revision });
      return { revision };
    },
    async list(prefix: string) {
      return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

const workflow = {
  workflowKey: 'cart',
  initialState: 'open',
  initialContext: {},
  guards: [],
  states: [
    {
      stateKey: 'open',
      transitions: [
        // An ordinary self-loop: "add a line item" is legal again in the same state.
        {
          transitionKey: 'add', trigger: { kind: 'event', eventType: 'ITEM_ADDED' }, targetState: 'open',
          effectIntents: [{ effectType: 'effect:audit', input: { action: 'add' }, idempotencyKey: 'audit:add' }],
        },
        { transitionKey: 'close', trigger: { kind: 'event', eventType: 'CLOSED' }, targetState: 'closed' },
      ],
    },
    { stateKey: 'closed', kind: 'final' },
  ],
};

const policy = {
  packageId: 'biz:cart@1.0.0',
  policyId: 'cart',
  domainId: 'shop',
  workflowDefinition: workflow,
  decisionSchema: { isValid: (value: any) => typeof value?.event?.type === 'string' },
  governanceSemantics: { hardInvariants: [] },
  initialStateKey: 'open',
  initialContext: {},
  rules: {
    'rule:add': { ruleId: 'rule:add', eventType: 'ITEM_ADDED', payloadFromInput: { sku: 'sku' } },
    'rule:close': { ruleId: 'rule:close', eventType: 'CLOSED', payloadFromInput: {} },
  },
  intentBindings: {
    addItem: { trigger: { kind: 'event', eventType: 'ITEM_ADDED' }, ruleId: 'rule:add', roles: ['buyer'] },
    closeCart: { trigger: { kind: 'event', eventType: 'CLOSED' }, ruleId: 'rule:close', roles: ['buyer'] },
  },
  effectBindings: {
    'effect:audit': {
      semantics: 'idempotent',
      handler: async ({ input, effectId, resources }: { input: Record<string, unknown>; effectId: string; resources: { call: (key: string, op: string, payload: unknown) => Promise<unknown> } }) =>
        resources.call('audit', 'append', { ...input, effectId }),
    },
  },
};

const sdkEndpoint = {
  packageId: 'std:r01',
  interpret(rule: { ruleId: string; eventType: string; payloadFromInput: Record<string, string> }, input: Record<string, unknown>) {
    const payload: Record<string, unknown> = {};
    for (const [payloadKey, inputKey] of Object.entries(rule.payloadFromInput)) {
      if (Object.hasOwn(input, inputKey)) payload[payloadKey] = input[inputKey];
    }
    return {
      source: 'harness-machine',
      structuredDecision: { decision: { outcome: 'decide', data: payload }, event: { type: rule.eventType, payload } },
      provenance: { ruleId: rule.ruleId },
      llmAvoided: true,
      cacheDisposition: { read: 'disabled' },
      telemetry: [],
    };
  },
};

const TARGET = { workflowId: 'cart', instanceKey: 't:a:i1' };
const caller = { role: 'buyer', subject: 'u1', tenantId: 't', appId: 'a' };

async function harness() {
  const docs = memoryDocs();
  const dispatches: unknown[] = [];
  const rt = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:r01', moduleSha256: KERNEL_SHA256 },
    hostPorts: {
      docs,
      resources: { async call(_key: string, _op: string, payload: unknown) { dispatches.push(payload); return { ok: true }; } },
      sha256: { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint,
    businessEndpoint: policy,
  });
  await rt.openInstance({ target: TARGET, authorityClass: 'PRODUCTION' });
  const send = (intentType: string, messageId: string, input: Record<string, unknown>) =>
    rt.submitOccurrence({ intentType, messageId, input, target: TARGET, caller });
  return { docs, dispatches, rt, send };
}

test('R01-P1 a re-sent messageId on a legal self-loop replays its receipt: zero new revision, journal row or dispatch', async () => {
  const { docs, dispatches, rt, send } = await harness();
  const first = await send('addItem', 'msg-1', { sku: 'A' });
  assert.equal(first.status, 'admitted');
  assert.equal(first.instance.stateRevision, 1);
  assert.equal(first.turnDisposition.status, 'recorded');
  const journalBefore = (await docs.list(JOURNAL_PREFIX)).length;

  const retry = await send('addItem', 'msg-1', { sku: 'A' });
  assert.equal(retry.status, 'admitted');
  assert.equal(retry.idempotentReplay, true);
  assert.equal(retry.admitted.durableControlTurnId, first.admitted.durableControlTurnId);
  assert.equal(retry.instance.stateRevision, 1, 'the replay carries the ORIGINAL committed revision');
  assert.equal((await rt.getSnapshot(TARGET)).stateRevision, 1, 'no second state revision under the same turn id');
  assert.equal((await docs.list(JOURNAL_PREFIX)).length, journalBefore, 'zero new journal rows');
  assert.equal(dispatches.length, 1, 'zero new physical dispatches');

  const next = await send('addItem', 'msg-2', { sku: 'B' });
  assert.equal(next.status, 'admitted', 'a DIFFERENT messageId still re-admits the self-loop');
  assert.equal(next.instance.stateRevision, 2);
});

test('R01-N1 the same messageId under a different intentType refuses typed before admission', async () => {
  const { rt, send } = await harness();
  await send('addItem', 'msg-1', { sku: 'A' });
  // [v0.10 K02 #1168 splice] The changed-intent conflict is detected by the
  // same-CAS original-receipt ladder, which answers before the disposition
  // ladder (its identity is now input-complete, so a changed INPUT refuses
  // typed as well — see the TEST_MATRIX combined coverage).
  await assert.rejects(send('closeCart', 'msg-1', {}), (error: unknown) => {
    const typed = error as { name?: string; code?: string };
    return typed.name === 'CentralAdmissionError' && typed.code === 'K02_TURN_RECEIPT_INTENT_CONFLICT';
  });
  const snapshot = await rt.getSnapshot(TARGET);
  assert.equal(snapshot.stateRevision, 1);
  assert.equal(snapshot.state.stateKey, 'open');
});

test('R01-P2 a late retry after further transitions replays the original ACK', async () => {
  const { dispatches, rt, send } = await harness();
  const first = await send('addItem', 'msg-1', { sku: 'A' });
  const closed = await send('closeCart', 'msg-2', {});
  assert.equal(closed.instance.stateRevision, 2);

  const late = await send('addItem', 'msg-1', { sku: 'A' });
  assert.equal(late.status, 'admitted');
  assert.equal(late.idempotentReplay, true);
  assert.deepEqual(late.admitted, first.admitted);
  assert.equal((await rt.getSnapshot(TARGET)).stateRevision, 2);
  assert.equal(dispatches.length, 1);
});

test('R01-P3 a disposition lost to the crash window is answered by the same-CAS history and healed', async () => {
  const { docs, dispatches, rt, send } = await harness();
  docs.failNextPutOn(DISPOSITION_PREFIX);
  const first = await send('addItem', 'msg-1', { sku: 'A' });
  assert.equal(first.status, 'admitted', 'the committed business ACK never fails on the observation');
  assert.equal(first.turnDisposition.status, 'not_recorded');
  assert.equal((await docs.list(DISPOSITION_PREFIX)).length, 0);

  const recovered = await send('addItem', 'msg-1', { sku: 'A' });
  assert.equal(recovered.status, 'admitted');
  assert.equal(recovered.idempotentReplay, true);
  // [v0.10 K02 #1168 splice] The replay answers from the same-CAS ORIGINAL
  // receipt: it carries the EXACT original acknowledged projection (the
  // stateRevision as it stood at the original admission), never a
  // pseudo-receipt re-derived from the newest snapshot.
  assert.ok(String(recovered.turnId).endsWith(':message:msg-1'), 'the replay carries the original turn id');
  assert.equal(recovered.instance.stateRevision, 1, 'the replay carries the ORIGINAL admitted projection');
  assert.equal(recovered.turnDisposition.status, 'recorded', 'the replay heals the lost disposition');
  assert.equal((await rt.getSnapshot(TARGET)).stateRevision, 1);
  assert.equal(dispatches.length, 1);

  const again = await send('addItem', 'msg-1', { sku: 'A' });
  assert.equal(again.idempotentReplay, true);
  assert.equal((await rt.getSnapshot(TARGET)).stateRevision, 1);
});

test('R01-P4 denials are not dispositions: a re-sent denied message is evaluated afresh', async () => {
  const { docs, send } = await harness();
  await send('closeCart', 'msg-close', {});
  const denied = await send('addItem', 'msg-late', { sku: 'A' });
  assert.equal(denied.status, 'denied');
  assert.equal(denied.denial.reason, 'no-candidate-transition');
  const dispositions = await docs.list(DISPOSITION_PREFIX);
  assert.equal(dispositions.length, 1, 'only the admitted close turn holds a disposition');
  const again = await send('addItem', 'msg-late', { sku: 'A' });
  assert.equal(again.status, 'denied');
  assert.equal(again.idempotentReplay, undefined);
});
