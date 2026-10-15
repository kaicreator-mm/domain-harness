/**
 * #1063 HF20 — ordered durable mutation observation: contract witness +
 * physical carrier witness + staged P/N seam driver (seam-B preparation).
 * ===========================================================================
 *
 * THREE deliberately separate parts (`docs/validation/v0.8/
 * hf20-adoption-decision.md`):
 *
 *   Part A — CONTRACT UNIT (runs now): the pure cursor codec, append
 *   reducer and page projection of the frozen HF20 contract module
 *   (`src/host-v8/hf20-mutation-observation.ts`): contiguous sequences,
 *   eviction → RETENTION_TRUNCATED gap, fail-closed window guard,
 *   stream-bound opaque cursors, beyond-watermark refusal.
 *
 *   Part B — PHYSICAL CARRIER WITNESS (runs now, real SQLite):
 *   B1 drives `SqliteCasStore` DIRECTLY with a state+window document to
 *   witness the same-envelope atomicity the adoption decision rides: ONE
 *   CAS put carries revision+state+window together, a stale-CAS loser
 *   leaves no record, and a fault-injected put leaves the whole row at its
 *   previous revision (no partial window can exist).
 *   B2 drives the REAL selected closure (`DomainHarness.load` → trusted
 *   host → gateway) and witnesses the carrier invariants on today's K:
 *   the physical instance row keeps `revision === snapshot.stateRevision`
 *   across repeated admitted turns, tenant/app isolation is physical row
 *   key separation, and a faulted instance-doc put rejects the send with
 *   the row entirely unchanged. (Today's row carries NO window yet — the
 *   K hook lands with the seam-A merge; this asserts the foundation it
 *   will ride, and honestly states the absence.)
 *
 *   Part C — HF20-P/HF20-N SEAM DRIVER (STAGED): the full positive flow
 *   (ordered records → host close → reopen same physical SQLite → resume
 *   from cursor after a post-restart committed turn) and negatives
 *   (forged/stale/cross-tenant cursor, replay synthesis, uncommitted
 *   mutation, Effect-Journal distinctness) activate ONLY when a gateway
 *   exposes `queryMutationObservations` (checked AT RUN TIME through
 *   `t.skip`, because the wiring is a property of the loaded closure, not
 *   of this file). Until the #1062 seam-A K owner merges and the small K
 *   hook is wired, every Part C test reports a typed SKIP naming the
 *   deferral — never a fake green, never a silent pass-through. This is
 *   test PREPARATION under #1006@6185543865: no kernel-mechanism-v1.mjs
 *   byte is touched here, and Part C owns its complete host lifecycle on
 *   its own physical SQLite file.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import {
  bootstrapTrustedHost,
  createKernelGateway,
  type HostCredential,
  type KernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import { SqliteCasStore, openSqliteCasStore } from '../../src/host-v8/sqlite-cas-store.js';
import {
  HF20_MUTATION_OBSERVATION_RETENTION_LIMIT,
  appendHf20MutationObservation,
  decodeHf20Cursor,
  encodeHf20Cursor,
  isHf20MutationObservationWindow,
  newHf20ObservationWindow,
  projectHf20ObservationPage,
} from '../../src/host-v8/hf20-mutation-observation.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sqliteTempPath } from './helpers.js';

// ===========================================================================
// Part A — contract unit (pure; runs now)
// ===========================================================================

test('HF20 contract: window seeds empty, INSTANCE_OPENED commits at revision 0', () => {
  const empty = newHf20ObservationWindow();
  assert.equal(empty.mutationSequence, 0);
  assert.equal(empty.records.length, 0);
  assert.ok(isHf20MutationObservationWindow(empty));
  const { window, record } = appendHf20MutationObservation(
    empty,
    { kind: 'INSTANCE_OPENED', stateRevisionAfter: 0 },
    '2026-10-15T00:00:00.000Z',
  );
  assert.equal(record.sequence, 1);
  assert.equal(record.stateRevisionAfter, 0);
  assert.equal(window.mutationSequence, 1);
  assert.deepEqual(window.records.map((entry) => entry.sequence), [1]);
});

test('HF20 contract: MUTATION_COMMITTED must advance the document revision by exactly one', () => {
  const opened = appendHf20MutationObservation(
    newHf20ObservationWindow(),
    { kind: 'INSTANCE_OPENED', stateRevisionAfter: 0 },
    '2026-10-15T00:00:00.000Z',
  ).window;
  const committed = appendHf20MutationObservation(
    opened,
    { kind: 'MUTATION_COMMITTED', stateRevisionBefore: 0, stateRevisionAfter: 1, sourceMessageId: 'm-1' },
    '2026-10-15T00:00:01.000Z',
  );
  assert.equal(committed.record.sequence, 2);
  assert.equal(committed.record.sourceMessageId, 'm-1');
  assert.throws(
    () => appendHf20MutationObservation(
      opened,
      { kind: 'MUTATION_COMMITTED', stateRevisionBefore: 0, stateRevisionAfter: 2, sourceMessageId: 'm-bad' },
      '2026-10-15T00:00:01.000Z',
    ),
    (error: unknown) => (error as { code?: string }).code === 'WINDOW_INVALID',
  );
  assert.throws(
    () => appendHf20MutationObservation(
      newHf20ObservationWindow(),
      { kind: 'INSTANCE_OPENED', stateRevisionAfter: 1 },
      '2026-10-15T00:00:00.000Z',
    ),
    (error: unknown) => (error as { code?: string }).code === 'WINDOW_INVALID',
  );
});

test('HF20 contract: sequences stay contiguous and eviction is the explicit RETENTION_TRUNCATED gap', () => {
  let window = newHf20ObservationWindow();
  window = appendHf20MutationObservation(window, { kind: 'INSTANCE_OPENED', stateRevisionAfter: 0 }, 't0').window;
  const total = HF20_MUTATION_OBSERVATION_RETENTION_LIMIT + 10;
  for (let revision = 1; revision <= total - 1; revision += 1) {
    window = appendHf20MutationObservation(
      window,
      { kind: 'MUTATION_COMMITTED', stateRevisionBefore: revision - 1, stateRevisionAfter: revision, sourceMessageId: `m-${revision}` },
      `t${revision}`,
    ).window;
  }
  assert.equal(window.mutationSequence, total);
  assert.equal(window.records.length, HF20_MUTATION_OBSERVATION_RETENTION_LIMIT);
  const earliest = window.records.at(0)?.sequence;
  assert.ok(earliest !== undefined);
  assert.equal(earliest, total - HF20_MUTATION_OBSERVATION_RETENTION_LIMIT + 1);
  // A cursor older than the retained tail gets the retained records PLUS
  // the honest gap — never a silently shortened history.
  const truncated = projectHf20ObservationPage(window, { stream: 'wf:t:a:k' });
  assert.equal(truncated.gap?.kind, 'RETENTION_TRUNCATED');
  assert.equal(truncated.gap?.earliestAvailable, earliest);
  assert.equal(truncated.gap?.highWatermark, total);
  // Exactly-at-the-tail cursor (after = earliest - 1) is contiguous: no gap.
  const contiguous = projectHf20ObservationPage(
    window,
    { stream: 'wf:t:a:k', afterCursor: encodeHf20Cursor('wf:t:a:k', earliest - 1) },
  );
  assert.equal(contiguous.gap, undefined);
  assert.equal(contiguous.records.at(0)?.sequence, earliest);
});

test('HF20 contract: page projection is exclusive-after with nextCursor iff records, clamped limit', () => {
  let window = newHf20ObservationWindow();
  window = appendHf20MutationObservation(window, { kind: 'INSTANCE_OPENED', stateRevisionAfter: 0 }, 't0').window;
  for (let revision = 1; revision <= 4; revision += 1) {
    window = appendHf20MutationObservation(
      window,
      { kind: 'MUTATION_COMMITTED', stateRevisionBefore: revision - 1, stateRevisionAfter: revision, sourceMessageId: `m-${revision}` },
      `t${revision}`,
    ).window;
  }
  const stream = 'wf:tenant:app:key';
  const page = projectHf20ObservationPage(window, { stream, afterCursor: encodeHf20Cursor(stream, 2), limit: 2 });
  assert.deepEqual(page.records.map((record) => record.sequence), [3, 4]);
  assert.equal(page.highWatermark, 5);
  const decoded = decodeHf20Cursor(page.nextCursor as string);
  assert.equal(decoded.stream, stream);
  assert.equal(decoded.after, 4);
  // nextCursor iff at least one record: an exhausted read carries none.
  const exhausted = projectHf20ObservationPage(window, { stream, afterCursor: encodeHf20Cursor(stream, 5) });
  assert.equal(exhausted.records.length, 0);
  assert.equal(exhausted.nextCursor, undefined);
  assert.equal(exhausted.highWatermark, 5);
  // limit is clamped into range, never silently unbounded.
  const clamped = projectHf20ObservationPage(window, { stream, limit: 5000 });
  assert.equal(clamped.records.length, 5);
  assert.throws(
    () => projectHf20ObservationPage(window, { stream, limit: 0 }),
    (error: unknown) => (error as { code?: string }).code === 'READ_LIMIT_INVALID',
  );
});

test('HF20 contract: cursors are stream-bound and cannot claim uncommitted progress', () => {
  const stream = 'wf:tenant:app:key';
  let window = newHf20ObservationWindow();
  window = appendHf20MutationObservation(window, { kind: 'INSTANCE_OPENED', stateRevisionAfter: 0 }, 't0').window;
  // Malformed tokens fail closed.
  for (const bad of ['', '!!!not-base64url!!!', Buffer.from('{}').toString('base64url'), Buffer.from('null').toString('base64url')]) {
    assert.throws(
      () => decodeHf20Cursor(bad),
      (error: unknown) => (error as { code?: string }).code === 'CURSOR_MALFORMED',
    );
  }
  assert.throws(
    () => encodeHf20Cursor(stream, -1),
    (error: unknown) => (error as { code?: string }).code === 'CURSOR_MALFORMED',
  );
  // A cursor minted for ANOTHER stream is refused typed — substitution,
  // including a cross-tenant one, never reads this stream.
  assert.throws(
    () => projectHf20ObservationPage(window, { stream, afterCursor: encodeHf20Cursor('wf:other:app:key', 0) }),
    (error: unknown) => (error as { code?: string }).code === 'CURSOR_STREAM_MISMATCH',
  );
  // Progress beyond the committed watermark was never minted by this stream.
  assert.throws(
    () => projectHf20ObservationPage(window, { stream, afterCursor: encodeHf20Cursor(stream, 99) }),
    (error: unknown) => (error as { code?: string }).code === 'CURSOR_BEYOND_WATERMARK',
  );
});

test('HF20 contract: a structurally broken stored window is refused, never partially projected', () => {
  let window = newHf20ObservationWindow();
  window = appendHf20MutationObservation(window, { kind: 'INSTANCE_OPENED', stateRevisionAfter: 0 }, 't0').window;
  window = appendHf20MutationObservation(
    window,
    { kind: 'MUTATION_COMMITTED', stateRevisionBefore: 0, stateRevisionAfter: 1, sourceMessageId: 'm-1' },
    't1',
  ).window;
  const broken: unknown = {
    ...window,
    records: [{ ...window.records[0], sequence: 7 }],
  };
  assert.equal(isHf20MutationObservationWindow(broken), false);
  assert.throws(
    () => projectHf20ObservationPage(broken as never, { stream: 'wf:t:a:k' }),
    (error: unknown) => (error as { code?: string }).code === 'WINDOW_INVALID',
  );
  assert.throws(
    () => appendHf20MutationObservation(broken as never, { kind: 'MUTATION_COMMITTED', stateRevisionBefore: 1, stateRevisionAfter: 2 }, 't2'),
    (error: unknown) => (error as { code?: string }).code === 'WINDOW_INVALID',
  );
});

// ===========================================================================
// Part B — physical carrier witness (real SQLite; runs now)
// ===========================================================================

test('HF20 carrier B1: one CAS put commits state+window atomically; losers and faults leave the row whole', async () => {
  const store = await openSqliteCasStore({ path: sqliteTempPath('hf20-carrier-b1') });
  try {
    const key = 'v08-kernel:wf-instance:wf:t:a:k';
    const opened = appendHf20MutationObservation(
      newHf20ObservationWindow(),
      { kind: 'INSTANCE_OPENED', stateRevisionAfter: 0 },
      't0',
    );
    const created: unknown = {
      stateRevision: 0,
      state: { stateKey: 'review' },
      mutationObservations: opened.window,
    };
    const createdRow = await store.put(key, created, { mustBeAbsent: true });
    assert.equal(createdRow.revision, 0); // doc revision === stateRevision at create
    // The next committed turn: reducer INSIDE the CAS write, one put.
    const committed = appendHf20MutationObservation(
      opened.window,
      { kind: 'MUTATION_COMMITTED', stateRevisionBefore: 0, stateRevisionAfter: 1, sourceMessageId: 'm-1' },
      't1',
    );
    const nextDoc: unknown = {
      stateRevision: 1,
      state: { stateKey: 'review' },
      mutationObservations: committed.window,
    };
    const nextRow = await store.put(key, nextDoc, { mustMatchRevision: 0 });
    assert.equal(nextRow.revision, 1);
    // A STALE writer (its own record m-lost) loses the CAS and leaves no trace.
    const loser = appendHf20MutationObservation(
      committed.window,
      { kind: 'MUTATION_COMMITTED', stateRevisionBefore: 1, stateRevisionAfter: 2, sourceMessageId: 'm-lost' },
      't2',
    );
    await assert.rejects(
      store.put(key, { stateRevision: 2, state: {}, mutationObservations: loser.window }, { mustMatchRevision: 0 }),
      (error: unknown) => (error as { code?: string }).code === 'HOST_CAS_CONFLICT',
    );
    const afterLoss = await store.get(key);
    assert.ok(afterLoss !== null);
    assert.equal(afterLoss.revision, 1);
    assert.equal((afterLoss.value as { mutationObservations: { mutationSequence: number } }).mutationObservations.mutationSequence, 2);
    // A physically faulted write leaves the ENTIRE row at its previous
    // revision — no partial state and no partial window can exist.
    store.failNextPutMatching(key);
    await assert.rejects(
      store.put(key, { stateRevision: 2, state: {}, mutationObservations: loser.window }, { mustMatchRevision: 1 }),
      (error: unknown) => (error as { code?: string }).code === 'HOST_FAULT_INJECTED',
    );
    const afterFault = await store.get(key);
    assert.ok(afterFault !== null);
    assert.equal(afterFault.revision, 1);
    assert.equal((afterFault.value as { stateRevision: number }).stateRevision, 1);
    assert.equal((afterFault.value as { mutationObservations: { mutationSequence: number } }).mutationObservations.mutationSequence, 2);
  } finally {
    await store.close();
  }
});

// ---- B2: the REAL selected closure through the trusted host gateway ----

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);

const AUDIENCE = 'dh-v08-hf20-carrier';
const APP_ID = 'agent-surface';
const CAPABILITY_ID = 'cap:agent-surface';
const TENANT = 't1';
const INSTANCE_KEY = 'hf20-carrier';
const WORKFLOW_KEY = 'surface-quote';
const INSTANCE_DOC_KEY = `v08-kernel:wf-instance:${WORKFLOW_KEY}:${TENANT}:${APP_ID}:${INSTANCE_KEY}`;
const T2_INSTANCE_DOC_KEY = `v08-kernel:wf-instance:${WORKFLOW_KEY}:t2:${APP_ID}:${INSTANCE_KEY}`;

let handle: TrustedHostHandle;
let gateway: KernelGateway;
let sealedRoot: SealedQualifiedPackageRoot;
let operator: HostCredential;
let requester: HostCredential;
let t2Operator: HostCredential;

before(async () => {
  const [kernelSource, sdkSource, businessSource, capabilityText] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('business-agent-surface.mjs', fixtureDir), 'utf8'),
    readFile(new URL('capability-agent-surface.mjs', fixtureDir), 'utf8'),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`);
  const capability = await import(`data:text/javascript;base64,${Buffer.from(capabilityText, 'utf8').toString('base64')}`);
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:hf20-carrier',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
      { packageId: capability.MODULE_ID as string, kind: 'capability' as const, abiVersion: capability.ABI_VERSION as string, modulePath: 'modules/capability.mjs', moduleSource: capabilityText, endpoints: capability.ENDPOINTS },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID as string, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk' as const, packageId: sdk.MODULE_ID as string, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business' as const, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId,
      })),
      {
        role: 'capability' as const,
        capabilityId: CAPABILITY_ID,
        packageId: capability.MODULE_ID as string,
        endpointId: capability.ENDPOINTS[0].endpointId,
        handlers: [
          { operationId: 'agent.order-summary', handler: 'orderSummary' },
          { operationId: 'internal.audit-export', handler: 'auditExport' },
          { operationId: 'agent.order-reserve', handler: 'reserveLedger' },
        ],
      },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-15T00:00:00.000Z',
  });
  sealedRoot = buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-hf20-carrier',
  }) as SealedQualifiedPackageRoot;

  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('hf20-carrier-b2') },
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: sealedRoot, genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  t2Operator = mintCredential({ tenantId: 't2', appId: APP_ID, subject: 'op2', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op2' });
});

after(async () => {
  await handle.host.close();
});

function sendOn(targetGateway: KernelGateway, messageId: string, principal: HostCredential = requester, tenantId: string = TENANT): Promise<unknown> {
  return targetGateway.send(principal, {
    intentType: 'submitSurfaceQuote',
    messageId,
    input: { amount: 30 },
    target: { tenantId, appId: APP_ID, instanceKey: INSTANCE_KEY },
  });
}

test('HF20 carrier B2: the physical instance row IS the atomicity foundation HF20 rides', async () => {
  assert.ok(handle.store instanceof SqliteCasStore, 'the trusted host storage is the physical SQLite CAS store');
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: INSTANCE_KEY });
  const docKeyList = await handle.store.list('v08-kernel:wf-instance:');
  assert.ok(docKeyList.includes(INSTANCE_DOC_KEY), `physical instance row ${INSTANCE_DOC_KEY} exists`);
  let row = await handle.store.get(INSTANCE_DOC_KEY);
  assert.ok(row !== null);
  let snapshot = (await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey: INSTANCE_KEY })) as { stateRevision: number };
  // The carrier invariant: physical doc revision === K-attested stateRevision.
  assert.equal(row.revision, 0);
  assert.equal(snapshot.stateRevision, 0);
  assert.equal((row.value as { stateRevision: number }).stateRevision, 0);
  // Honest pre-wiring statement: today's committed document carries NO
  // observation window yet — it arrives with the deferred K hook (#1062).
  assert.equal('mutationObservations' in (row.value as object), false);
  // Every admitted turn advances the ONE row by exactly one revision.
  for (let turn = 1; turn <= 3; turn += 1) {
    const receipt = (await sendOn(gateway, `hf20-carrier-${turn}`)) as { status: string };
    assert.equal(receipt.status, 'admitted');
    row = await handle.store.get(INSTANCE_DOC_KEY);
    assert.ok(row !== null);
    snapshot = (await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey: INSTANCE_KEY })) as { stateRevision: number };
    assert.equal(row.revision, turn);
    assert.equal(snapshot.stateRevision, turn);
  }
  // Tenant/app isolation is PHYSICAL: a second tenant's instance is a
  // distinct row and never shares this stream's carrier.
  await gateway.activateGenesis(t2Operator, { appId: APP_ID, instanceKey: INSTANCE_KEY });
  const keys = await handle.store.list('v08-kernel:wf-instance:');
  assert.ok(keys.includes(T2_INSTANCE_DOC_KEY));
  const t2Row = await handle.store.get(T2_INSTANCE_DOC_KEY);
  assert.ok(t2Row !== null);
  assert.equal(t2Row.revision, 0);
  // A physically faulted instance-doc write rejects the whole turn and
  // leaves revision, state and any observation truth entirely unchanged.
  (handle.store as SqliteCasStore).failNextPutMatching('v08-kernel:wf-instance:');
  await assert.rejects(
    sendOn(gateway, 'hf20-carrier-faulted'),
    (error: unknown) => (error as { code?: string }).code === 'HOST_FAULT_INJECTED',
  );
  row = await handle.store.get(INSTANCE_DOC_KEY);
  assert.ok(row !== null);
  assert.equal(row.revision, 3);
  assert.equal((row.value as { stateRevision: number }).stateRevision, 3);
});

// ===========================================================================
// Part C — HF20-P/HF20-N seam driver (STAGED until the K hook lands)
// ===========================================================================

/**
 * The staged seam: the protected gateway read verb the deferred wiring
 * (adoption decision §5) installs. Feature-detected AT RUN TIME (inside
 * the test body through `t.skip`) because the wiring is a property of the
 * loaded closure bytes, not of this file's module shape.
 */
interface Hf20GatewaySeam {
  queryMutationObservations(credential: unknown, request: {
    readonly appId: string;
    readonly instanceKey: string;
    readonly afterCursor?: string;
    readonly limit?: number;
  }): Promise<unknown>;
}

function hf20SeamOf(targetGateway: KernelGateway): Hf20GatewaySeam | undefined {
  const candidate = (targetGateway as unknown as Partial<Hf20GatewaySeam>).queryMutationObservations;
  return typeof candidate === 'function' ? (targetGateway as unknown as Hf20GatewaySeam) : undefined;
}

const HF20_WIRING_PENDING = 'HF20 seam driver staged: gateway verb queryMutationObservations is not wired yet (K hook deferred until #1062 seam-A merges; see docs/validation/v0.8/hf20-adoption-decision.md §5) — NOT RUN, no green claimed';

test('HF20-P: ordered committed-mutation records + restart resume from opaque K-validated cursor', async (t) => {
  const seam = hf20SeamOf(gateway);
  if (seam === undefined) {
    t.skip(HF20_WIRING_PENDING);
    return;
  }
  // This driver owns its complete lifecycle on its own physical SQLite.
  const dbPath = sqliteTempPath('hf20-pn-driver');
  const first = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: dbPath },
  });
  const firstGateway = createKernelGateway({ host: first.host, gatewaySessionCap: first.gatewaySessionCap });
  await firstGateway.registerApp({ appId: APP_ID, packageRoot: sealedRoot, genesisRoles: ['platform-operator'] });
  await firstGateway.activateGenesis(operator, { appId: APP_ID, instanceKey: INSTANCE_KEY });
  for (let turn = 1; turn <= 2; turn += 1) {
    const receipt = (await sendOn(firstGateway, `hf20-p-${turn}`)) as { status: string };
    assert.equal(receipt.status, 'admitted');
  }
  const firstSeam = hf20SeamOf(firstGateway) as Hf20GatewaySeam;
  const page = (await firstSeam.queryMutationObservations(requester, { appId: APP_ID, instanceKey: INSTANCE_KEY })) as {
    records: { sequence: number; kind: string }[];
    nextCursor?: string;
    highWatermark: number;
  };
  // Ordered, committed-mutation-only records with exact instance scope.
  const sequences = page.records.map((record) => record.sequence);
  for (let index = 1; index < sequences.length; index += 1) {
    const previous = sequences.at(index - 1);
    const current = sequences.at(index);
    assert.ok(previous !== undefined && current !== undefined);
    assert.equal(current, previous + 1);
  }
  assert.ok(page.records.every((record) => record.kind === 'INSTANCE_OPENED' || record.kind === 'MUTATION_COMMITTED'));
  assert.ok(page.nextCursor !== undefined);
  const cursor = page.nextCursor as string;
  const watermarkBeforeRestart = page.highWatermark;
  // Restart: close the host, reopen the SAME physical SQLite file.
  await first.host.close();
  const reopened = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: dbPath },
  });
  try {
    const reopenedGateway = createKernelGateway({ host: reopened.host, gatewaySessionCap: reopened.gatewaySessionCap });
    await reopenedGateway.registerApp({ appId: APP_ID, packageRoot: sealedRoot, genesisRoles: ['platform-operator'] });
    const reopenedSeam = hf20SeamOf(reopenedGateway) as Hf20GatewaySeam;
    // Resume first: the cursor still reads exactly-after its sequence.
    const resumedBeforeNew = (await reopenedSeam.queryMutationObservations(requester, { appId: APP_ID, instanceKey: INSTANCE_KEY, afterCursor: cursor })) as {
      records: { sequence: number }[];
      highWatermark: number;
    };
    assert.equal(resumedBeforeNew.highWatermark, watermarkBeforeRestart);
    // One more committed turn AFTER the restart becomes visible from the
    // SAME cursor — the durable resume witness.
    const receipt = (await sendOn(reopenedGateway, 'hf20-p-post-restart')) as { status: string };
    assert.equal(receipt.status, 'admitted');
    const resumed = (await reopenedSeam.queryMutationObservations(requester, { appId: APP_ID, instanceKey: INSTANCE_KEY, afterCursor: cursor })) as {
      records: { sequence: number; stateRevisionAfter: number }[];
      highWatermark: number;
    };
    assert.ok(resumed.records.length >= 1);
    assert.ok(resumed.records.every((record) => record.sequence > watermarkBeforeRestart));
    assert.equal(resumed.highWatermark, watermarkBeforeRestart + 1);
    const lastResumed = resumed.records.at(-1);
    assert.ok(lastResumed !== undefined);
    assert.equal(lastResumed.stateRevisionAfter, watermarkBeforeRestart);
  } finally {
    await reopened.host.close();
  }
});

test('HF20-N: forged/stale/cross-tenant cursors, replay synthesis and uncommitted mutations yield no observation', async (t) => {
  const seam = hf20SeamOf(gateway);
  if (seam === undefined) {
    t.skip(HF20_WIRING_PENDING);
    return;
  }
  const page = (await seam.queryMutationObservations(requester, { appId: APP_ID, instanceKey: INSTANCE_KEY })) as {
    records: { kind?: unknown }[];
    highWatermark: number;
  };
  // Forged progress beyond the committed watermark refuses typed.
  const forged = (() => {
    const payload = JSON.parse(Buffer.from(encodeHf20Cursor('x:not-the-real-stream', 0), 'base64url').toString('utf8')) as { v: number; s: string; a: number };
    payload.a = page.highWatermark + 100;
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  })();
  await assert.rejects(
    seam.queryMutationObservations(requester, { appId: APP_ID, instanceKey: INSTANCE_KEY, afterCursor: forged }),
    (error: unknown) => /CURSOR_/.test(String((error as { code?: string }).code ?? '')),
  );
  // A cursor minted for ANOTHER tenant's stream is substitution: refused.
  await assert.rejects(
    seam.queryMutationObservations(requester, { appId: APP_ID, instanceKey: INSTANCE_KEY, afterCursor: encodeHf20Cursor(`x:t2:${APP_ID}:${INSTANCE_KEY}`, 0) }),
    (error: unknown) => (error as { code?: string }).code === 'CURSOR_STREAM_MISMATCH',
  );
  // Replaying the same read synthesizes nothing: identical page, no growth.
  const replay = (await seam.queryMutationObservations(requester, { appId: APP_ID, instanceKey: INSTANCE_KEY })) as {
    records: unknown[];
    highWatermark: number;
  };
  assert.equal(replay.records.length, page.records.length);
  assert.equal(replay.highWatermark, page.highWatermark);
  // An uncommitted (faulted) mutation yields NO observation record.
  (handle.store as SqliteCasStore).failNextPutMatching('v08-kernel:wf-instance:');
  await assert.rejects(
    sendOn(gateway, 'hf20-n-faulted'),
    (error: unknown) => (error as { code?: string }).code === 'HOST_FAULT_INJECTED',
  );
  const afterFault = (await seam.queryMutationObservations(requester, { appId: APP_ID, instanceKey: INSTANCE_KEY })) as {
    records: { kind?: unknown }[];
    highWatermark: number;
  };
  assert.equal(afterFault.highWatermark, page.highWatermark);
  // Effect Journal distinctness: no journal-shaped record ever enters the
  // mutation-observation stream (kinds are the two mutation families only).
  assert.ok(afterFault.records.every((record) => record.kind === 'INSTANCE_OPENED' || record.kind === 'MUTATION_COMMITTED'));
});
