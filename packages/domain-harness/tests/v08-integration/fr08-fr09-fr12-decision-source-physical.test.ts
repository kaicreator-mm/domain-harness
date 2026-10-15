/**
 * #1003 T-D seam (A) — FR08 general / FR09 / FR12 selected-path closure on
 * the REAL v0.8 `DomainHarness.load(package)` composition (PR #1057 R1
 * repair): the sealed decision-source Business fixture → authenticated
 * gateway send → selected Kernel turn → the retained Standard SDK
 * decision-source semantics select, the Kernel supplies the qualified
 * observations and owns every durable record (exact-cache entry,
 * promoted-child pin) in the Host true-CAS SQLite document store — and the
 * selected candidate flows through the UNCHANGED central admission.
 *
 * This REPLACES the former V3-only witness (V3 createDomainRuntimeV3
 * admitTurn with a hand-constructed `resolved`): the tested subject here is
 * the selected v0.8 K/S/U path itself, so the frozen rows' observables are
 * witnessed where they must hold. The V3 file remains in history as the
 * design oracle.
 *
 * Legs and negatives (Node24 + real SQLite):
 *   - FR08-P/FR12-P ordering: rule → promoted-subworkflow (FR09-P governed
 *     selection + durable pin, zero model) → exact-cache hit (zero model,
 *     no re-pin) → bounded harness fallback with truthful measured(1).
 *   - FR08-N drift: the dependency material changes between turns (the
 *     first admitted turn durably projects `priceListRevision`); the stale
 *     entry is keyed under the old dependency digest and is NEVER served —
 *     a fresh recompute runs instead, and both durable rows coexist.
 *   - FR08-N denial finality: a guard-denied candidate is final (zero
 *     effect/journal, no hidden re-resolution) and is never cached; an
 *     existing cache entry survives interleaved denials and keeps serving.
 *   - FR09-N revoked: a revoked approved artifact refuses the turn closed
 *     (retained S SDK_CHILD_NOT_ELIGIBLE) before ANY Kernel admission —
 *     zero effect/journal/cache/pin delta.
 *   - NF05-style PRE: a substituted declarationDigest fails the trusted
 *     load boundary before any instance exists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapTrustedHost, createKernelGateway } from '../../src/host-v8/index.js';
import {
  INTEG_ISSUER,
  INTEG_ISSUER_SECRET,
  assertFixtureBytes,
  mintCredential,
  sealRealApp,
  sqliteTempPath,
} from './helpers.js';

const AUDIENCE = 'dh-v08-fr0812';
const APP_ID = 'ds2-quote';
const JOURNAL_PREFIX = 'v08-kernel:effect-journal:';
const CACHE_PREFIX = 'v08-kernel:decision-cache:';
const PIN_PREFIX = 'v08-kernel:promoted-pin:';

interface ResolverEvidence {
  readonly source?: string;
  readonly llmAvoided?: boolean;
  readonly modelCallEvidence?: { status?: string; count?: number; scope?: string };
  readonly cacheRead?: string;
  readonly cacheWrite?: string;
}

interface SendReceipt {
  status: string;
  admitted?: { resolver?: ResolverEvidence; effects?: unknown[] };
  denial?: { reason?: string; resolver?: ResolverEvidence };
}

/** One scripted ModelPort response per physical invocation. */
const modelResponses: { decision: { outcome: string }; event: { type: string; payload: Record<string, unknown> } }[] = [
  // ordering t4 — bounded harness fallback
  { decision: { outcome: 'approve' }, event: { type: 'QUOTE_DECIDED', payload: { amount: 9, quotaAfter: 60, revision: 'r1' } } },
  // drift t1 (dependency not yet projected) and t2 (drift recompute)
  { decision: { outcome: 'approve' }, event: { type: 'QUOTE_DECIDED', payload: { amount: 9, quotaAfter: 60, revision: 'r1' } } },
  { decision: { outcome: 'approve' }, event: { type: 'QUOTE_DECIDED', payload: { amount: 9, quotaAfter: 60, revision: 'r1' } } },
  // denial t2 — the admitted harness candidate (first invocation below)
  { decision: { outcome: 'approve' }, event: { type: 'QUOTE_DECIDED', payload: { amount: 10, quotaAfter: 30, revision: 'r1' } } },
  // denial t3 — the dependency-stabilized recompute (same material)
  { decision: { outcome: 'approve' }, event: { type: 'QUOTE_DECIDED', payload: { amount: 10, quotaAfter: 30, revision: 'r1' } } },
];
const invocations: unknown[] = [];
const ledgerCalls: unknown[] = [];
let handle: Awaited<ReturnType<typeof bootstrapTrustedHost>>;
let gateway: ReturnType<typeof createKernelGateway>;
let operator: ReturnType<typeof mintCredential>;
let requester: ReturnType<typeof mintCredential>;

test.before(async () => {
  await assertFixtureBytes('decisionSource');
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('fr0812ds') },
    modelPort: {
      invoke: async (request: { operation: string; input: unknown }) => {
        invocations.push({ operation: request.operation, input: request.input });
        const response = modelResponses[invocations.length - 1];
        if (response === undefined) throw new Error(`unexpected ModelPort invocation #${invocations.length}`);
        return response;
      },
    },
  });
  handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: await sealRealApp('decisionSource'), genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: 't1', appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: 't1', appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
});

test.after(async () => {
  await handle.host.close();
});

async function activate(instanceKey: string): Promise<string> {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey });
  return instanceKey;
}

function send(input: {
  readonly intentType: string;
  readonly messageId: string;
  readonly input: Record<string, unknown>;
  readonly instanceKey: string;
}): Promise<unknown> {
  return gateway.send(requester, {
    intentType: input.intentType,
    messageId: input.messageId,
    input: input.input,
    target: { tenantId: 't1', appId: APP_ID, instanceKey: input.instanceKey },
  });
}

/** The qualified workflow instance address component the Kernel stores under. */
function qualified(instanceKey: string): string {
  return `ds-quote:t1:${APP_ID}:${instanceKey}`;
}

async function docKeysUnder(prefix: string, instanceKey: string): Promise<string[]> {
  const keys = (await handle.host.docs.list(prefix)) as string[];
  return keys.filter((key) => key.includes(qualified(instanceKey)));
}

async function cacheRecordsFor(instanceKey: string): Promise<{ key: string; record: Record<string, unknown> }[]> {
  const out = [];
  for (const key of await docKeysUnder(CACHE_PREFIX, instanceKey)) {
    const envelope = (await handle.host.docs.get(key)) as { value?: Record<string, unknown> } | null;
    if (envelope?.value !== undefined) out.push({ key, record: envelope.value });
  }
  return out;
}

async function pinRecordsFor(instanceKey: string): Promise<{ key: string; record: Record<string, unknown> }[]> {
  const out = [];
  for (const key of await docKeysUnder(PIN_PREFIX, instanceKey)) {
    const envelope = (await handle.host.docs.get(key)) as { value?: Record<string, unknown> } | null;
    if (envelope?.value !== undefined) out.push({ key, record: envelope.value });
  }
  return out;
}

async function journalCountFor(instanceKey: string): Promise<number> {
  const keys = (await handle.host.docs.list(JOURNAL_PREFIX)) as string[];
  let matching = 0;
  for (const key of keys) {
    const doc = (await handle.host.docs.get(key)) as { value?: { record?: { target?: { instanceKey?: string } } } } | null;
    if (doc?.value?.record?.target?.instanceKey === `t1:${APP_ID}:${instanceKey}`) matching += 1;
  }
  return matching;
}

test('FR08-P/FR09-P/FR12-P: rule→promoted(pinned)→exact-cache→bounded harness each admitted through the selected K central admission', async () => {
  const instanceKey = await activate('ordering');
  const ledgerBefore = ledgerCalls.length;

  // ---- 1. deterministic rule leg (input-projected payload) ----
  const t1 = await send({
    intentType: 'submitQuote',
    messageId: 'm-ds-1',
    input: { amount: 5, quotaAfter: 60, revision: 'r1', sku: 'A' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t1.status, 'admitted');
  assert.deepEqual(
    { ...t1.admitted?.resolver },
    {
      source: 'rule',
      llmAvoided: true,
      modelCallEvidence: { status: 'measured', count: 0, scope: 'bound-model-port-invocations' },
      cacheRead: 'disabled',
      telemetryEventCount: 0,
    },
    'the rule-source truth: deterministic, zero model calls, cache leg never consulted',
  );
  assert.equal(invocations.length, 0);
  assert.equal(t1.admitted?.effects?.length, 1, 'one authorized effect per admitted turn');

  // ---- 2. governed promoted child: approved identity, durable pin, zero model ----
  const t2 = await send({
    intentType: 'submitQuote',
    messageId: 'm-ds-2',
    input: { sku: 'B', route: 'promoted', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t2.status, 'admitted');
  assert.equal(t2.admitted?.resolver?.source, 'promoted-subworkflow');
  assert.equal(t2.admitted?.resolver?.llmAvoided, true);
  assert.equal(t2.admitted?.resolver?.cacheRead, 'miss');
  assert.equal(invocations.length, 0, 'the approved pinned child decides without any model call');
  const pins = await pinRecordsFor(instanceKey);
  assert.equal(pins.length, 1, 'exactly ONE durable promoted pin for this instance');
  const pinRecord = pins[0]?.record ?? assert.fail('expected the promoted pin record');
  assert.deepEqual(
    { artifactId: pinRecord.artifactId, contentDigest: pinRecord.contentDigest },
    { artifactId: 'promoted:quote-review', contentDigest: 'sha256:quote-review-v1' },
    'the durable pin carries the EXACT approved artifact identity (pin-before-execution)',
  );

  // ---- 3. exact-cache fast path: the promoted turn's durable record serves, zero model, no re-pin ----
  const t3 = await send({
    intentType: 'submitQuote',
    messageId: 'm-ds-3',
    input: { sku: 'B', route: 'promoted', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t3.status, 'admitted');
  assert.deepEqual(
    { ...t3.admitted?.resolver },
    {
      source: 'exact-cache',
      llmAvoided: true,
      modelCallEvidence: { status: 'measured', count: 0, scope: 'bound-model-port-invocations' },
      cacheRead: 'hit',
      telemetryEventCount: 0,
    },
    'FR12-P: the no-fresh-LLM fast path serves the cached admitted decision',
  );
  assert.equal(invocations.length, 0, 'a cache hit never consults a model');
  assert.equal((await pinRecordsFor(instanceKey)).length, 1, 'a cache hit never re-pins or re-runs the child');

  // ---- 4. bounded harness fallback: exactly ONE trusted ModelPort turn, truthful measured(1) ----
  const t4 = await send({
    intentType: 'submitQuote',
    messageId: 'm-ds-4',
    input: { sku: 'C', route: 'harness', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t4.status, 'admitted');
  assert.deepEqual(
    { ...t4.admitted?.resolver },
    {
      source: 'harness-machine',
      llmAvoided: false,
      modelCallEvidence: { status: 'measured', count: 1, scope: 'bound-model-port-invocations' },
      cacheRead: 'miss',
      telemetryEventCount: 0,
    },
    'the bounded fallback truthfully counts its single physical model call',
  );
  assert.equal(invocations.length, 1);

  // ---- durable ordering truth: one cache row per admitted source turn, one journal/effect each ----
  const cacheRecords = await cacheRecordsFor(instanceKey);
  assert.equal(cacheRecords.length, 3, 'exactly the rule, promoted and harness turns produced durable cache rows');
  assert.deepEqual(
    cacheRecords.map((entry) => entry.record.source).sort(),
    ['harness-machine', 'promoted-subworkflow', 'rule'],
    'one durable cache row per producing source turn (docs.list order is not stable)',
  );
  const promotedRow = cacheRecords.find((entry) => entry.record.source === 'promoted-subworkflow');
  assert.deepEqual(
    promotedRow?.record.producedBy,
    { kind: 'promoted-artifact', artifactId: 'promoted:quote-review', contentDigest: 'sha256:quote-review-v1' },
    'the durable decision record carries the approved producer artifact identity',
  );
  assert.equal(await journalCountFor(instanceKey), 4, 'one durable journal record per admitted turn');
  assert.equal(ledgerCalls.length - ledgerBefore, 4, 'one physical effect per admitted turn');
});

test('FR08-N: dependency-revision drift is a cache miss with a fresh recompute — the stale entry is never served', async () => {
  const instanceKey = await activate('drift');
  const modelCallsBefore = invocations.length;

  // t1: the dependency field is not yet projected — the entry lands under
  // the empty dependency material; the model candidate projects `r1`.
  const t1 = await send({
    intentType: 'submitDriftQuote',
    messageId: 'm-drift-1',
    input: { sku: 'C', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t1.status, 'admitted');
  assert.equal(t1.admitted?.resolver?.source, 'harness-machine');
  assert.equal(t1.admitted?.resolver?.cacheRead, 'miss');
  assert.equal(invocations.length - modelCallsBefore, 1);

  // The first admitted turn durably fixed the dependency revision at r1.
  const snapshot = await gateway.queryInstance(requester, { tenantId: 't1', appId: APP_ID, instanceKey }) as { state?: { context?: { priceListRevision?: string } } };
  assert.equal(snapshot.state?.context?.priceListRevision, 'r1', 'the dependency revision is durably projected');

  // t2: same input, but the CURRENT dependency material is now r1 — the
  // lookup key differs, the stale (empty-dependency) entry can never serve,
  // and a FRESH bounded harness recompute runs instead.
  const t2 = await send({
    intentType: 'submitDriftQuote',
    messageId: 'm-drift-2',
    input: { sku: 'C', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t2.status, 'admitted');
  assert.equal(t2.admitted?.resolver?.source, 'harness-machine', 'the stale entry is a miss, never a served hit');
  assert.equal(t2.admitted?.resolver?.cacheRead, 'miss');
  assert.equal(invocations.length - modelCallsBefore, 2, 'the drift recomputes fresh — one new physical model call');

  // t3: the t2 entry IS pinned to the current dependency material and serves.
  const t3 = await send({
    intentType: 'submitDriftQuote',
    messageId: 'm-drift-3',
    input: { sku: 'C', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t3.status, 'admitted');
  assert.equal(t3.admitted?.resolver?.source, 'exact-cache');
  assert.equal(t3.admitted?.resolver?.cacheRead, 'hit');
  assert.equal(invocations.length - modelCallsBefore, 2, 'the current entry serves with zero further model calls');

  // Both durable rows coexist with DIFFERENT dependency material — the
  // stale one is inert, not deleted and not served.
  const records = await cacheRecordsFor(instanceKey);
  assert.equal(records.length, 2);
  const dependencySets = records.map((entry) => (entry.record.provenance as { dependencies?: Record<string, string> }).dependencies);
  assert.ok(
    dependencySets.some((deps) => deps?.priceListRevision === '')
      && dependencySets.some((deps) => deps?.priceListRevision === 'r1'),
    'the two durable rows are pinned to different dependency revisions',
  );
});

test('FR08-N: a K-denied candidate is final — no hidden retry, never cached, and the cache stays reusable', async () => {
  const instanceKey = await activate('denial');
  const modelCallsBefore = invocations.length;
  const ledgerBefore = ledgerCalls.length;

  // t1: the deterministic rule leg proposes an amount that violates its own
  // declared quota guard — the DENIED turn is final: zero effects, zero
  // journal, no resolver retry, and the denied candidate is never cached.
  const t1 = await send({
    intentType: 'submitQuote',
    messageId: 'm-denial-1',
    input: { amount: 80, quotaAfter: 30, revision: 'r1', sku: 'D' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t1.status, 'denied');
  assert.equal(t1.denial?.reason, 'guard');
  assert.equal(t1.denial?.resolver?.source, 'rule');
  assert.equal(ledgerCalls.length - ledgerBefore, 0, 'a denied turn dispatches no effects');
  assert.equal(await journalCountFor(instanceKey), 0, 'a denied turn journals nothing');
  assert.equal((await cacheRecordsFor(instanceKey)).length, 0, 'a denied candidate is never cached');
  assert.equal(invocations.length - modelCallsBefore, 0, 'the denial re-consulted no later resolver leg');

  // t2: an input the rule declines produces the bounded fallback turn and
  // IS admitted (its guard passes) — its candidate becomes durable under
  // the pre-turn dependency material (the revision is not yet projected).
  const t2 = await send({
    intentType: 'submitQuote',
    messageId: 'm-denial-2',
    input: { sku: 'D', route: 'harness', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t2.status, 'admitted');
  assert.equal(t2.admitted?.resolver?.source, 'harness-machine');
  assert.equal(invocations.length - modelCallsBefore, 1);
  assert.equal((await cacheRecordsFor(instanceKey)).length, 1);

  // t3: the t2 commit durably established the dependency revision, so the
  // same input now looks up under NEW dependency material — an honest miss
  // (the same semantics the drift negative witnesses), never a served
  // stale entry — and the fresh recompute admits identically.
  const t3 = await send({
    intentType: 'submitQuote',
    messageId: 'm-denial-3',
    input: { sku: 'D', route: 'harness', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t3.status, 'admitted');
  assert.equal(t3.admitted?.resolver?.source, 'harness-machine');
  assert.equal(t3.admitted?.resolver?.cacheRead, 'miss');
  assert.equal(invocations.length - modelCallsBefore, 2, 'the dependency change recomputes fresh');

  // t4: the denial is deterministic and repeatable — still final, still
  // zero-effect, and the durable cache rows are untouched.
  const t4 = await send({
    intentType: 'submitQuote',
    messageId: 'm-denial-4',
    input: { amount: 80, quotaAfter: 30, revision: 'r1', sku: 'D' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t4.status, 'denied');
  assert.equal(t4.denial?.resolver?.source, 'rule');
  assert.equal(ledgerCalls.length - ledgerBefore, 2, 'only the admitted turns dispatched effects');
  assert.equal((await cacheRecordsFor(instanceKey)).length, 2, 'the denials never wrote cache rows');

  // t5: the dependency-stabilized row now serves the same input — the
  // interleaved denials neither poisoned the cache nor triggered any
  // hidden re-resolution.
  const t5 = await send({
    intentType: 'submitQuote',
    messageId: 'm-denial-5',
    input: { sku: 'D', route: 'harness', revision: 'r1' },
    instanceKey,
  }) as SendReceipt;
  assert.equal(t5.status, 'admitted');
  assert.equal(t5.admitted?.resolver?.source, 'exact-cache');
  assert.equal(t5.admitted?.resolver?.cacheRead, 'hit');
  assert.equal(invocations.length - modelCallsBefore, 2, 'exactly one resolver pass per admitted source, never a hidden retry');
});

test('FR09-N: a revoked approved artifact fails the resolution closed before any Kernel admission', async () => {
  const instanceKey = await activate('revoked');
  const ledgerBefore = ledgerCalls.length;
  const modelCallsBefore = invocations.length;

  await assert.rejects(
    () => send({
      intentType: 'submitRevokedChild',
      messageId: 'm-revoked-1',
      input: { sku: 'E' },
      instanceKey,
    }),
    (error: unknown) => (error as { code?: string })?.code === 'SDK_CHILD_NOT_ELIGIBLE',
    'the retained S selection refuses the revoked child',
  );
  assert.equal(invocations.length - modelCallsBefore, 0, 'no model turn started');
  assert.equal(ledgerCalls.length - ledgerBefore, 0, 'zero effects dispatched');
  assert.equal(await journalCountFor(instanceKey), 0, 'zero journal records');
  assert.equal((await cacheRecordsFor(instanceKey)).length, 0, 'zero cache rows');
  assert.equal((await pinRecordsFor(instanceKey)).length, 0, 'no pin was committed for the refused child');
});

test('NF05-N-PRE: a substituted decision-source declaration fails the trusted load boundary typed before any instance exists', async () => {
  const badRoot = await sealRealApp('decisionSourceBad');
  await assertFixtureBytes('decisionSourceBad');
  await assert.rejects(
    () => gateway.registerApp({ appId: 'ds2-quote-bad', packageRoot: badRoot, genesisRoles: ['platform-operator'] }),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return typed?.code === 'ACTIVATION_FAILED'
        && String(typed?.message).includes('stale or substituted descriptor');
    },
  );
});
