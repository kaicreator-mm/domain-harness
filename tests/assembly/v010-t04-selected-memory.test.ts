/**
 * T04 (#1171) — selected C Memory integration slice over a REAL T00-built
 * and activated App.
 * ====================================================================
 *
 * The standalone Host adapter P/N lives in
 * `tests/hosts/node/v010-memory-scoped.test.ts`; THIS file proves the
 * terminal-acceptance half the handoff requires: the selected C Memory
 * package is actually WIRED through a real `buildV10App` + `activateV10App`
 * composition — public intent → real Kernel admission/journal/effect
 * dispatch → the facade's sealed resource port → the selected capability's
 * typed put/get/search/delete handlers → the REAL product adapter → one
 * real file-backed SQLite store — with per-operation authorization honored
 * (sealed allowlist), TTL/CAS visible through the App, physical restart
 * persistence across activations, a foreign-scope probe typed-refused with
 * ZERO physical mutation, and a Tiny BUILD that neither selects nor ever
 * evaluates the Memory capability.
 *
 * Memory here proves NO Kernel authority: the K docs live in a separate
 * store under `v10/k/**` and Memory never writes there; a denied Memory op
 * surfaces as an honest Kernel effect failure, never a forged receipt.
 */
import { freshV10Counters } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import {
  V10BuildError,
  V10_TARGET_PROFILE,
  activateV10App,
  buildV10App,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { V10ModuleInput } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import {
  INTENT as TINY_INTENT,
  PlainCasDocStore,
  basicComposition,
  sha256HexSource,
} from './helpers-v010.js';

const KERNEL_PACKAGE_ID = 'v08-kernel-mechanism@1.0.0';
const STANDARD_PACKAGE_ID = 'standard-sdk@v08.1.0.0';
const BUSINESS_MEMORY_ID = 'business-memory-notes@v010.1.0.0';
const CAPABILITY_MEMORY_ID = 'capability-scoped-memory@v010.1.0.0';
const TENANT = 'tenant:v010-t04-rich';
const BASE_MS = Date.UTC(2026, 9, 19, 9, 0, 0);

/**
 * Pin a FRESH physical store directory for one test (the fixture reads it
 * through globalThis). Windows refuses to unlink a file an open SQLite
 * connection still holds, so each test gets its own mkdtemp directory
 * instead of deleting a shared file; leftovers live in the OS temp tree.
 */
async function freshMemoryStore(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t04-sel-'));
  const path = join(dir, 'memory.sqlite');
  (globalThis as { __v010T04MemoryStorePath?: string }).__v010T04MemoryStorePath = path;
  return path;
}
function clearPinnedMemoryStore(): void {
  delete (globalThis as { __v010T04MemoryStorePath?: string }).__v010T04MemoryStorePath;
}

/** Manually advanced clock shared by the Kernel turns and the Memory adapter. */
function controlledClock(): { now: () => number; advance(ms: number): void } {
  let current = BASE_MS;
  return { now: (): number => current, advance: (ms: number): void => { current += ms; } };
}

/** Pin the Memory adapter's clock (the fixture's globalThis test seam). */
function pinMemoryClock(now: () => number): void {
  (globalThis as { __v010T04MemoryClock?: () => number }).__v010T04MemoryClock = now;
}
function unpinMemoryClock(): void {
  delete (globalThis as { __v010T04MemoryClock?: () => number }).__v010T04MemoryClock;
}

/** BUILD-style vendored SDK bundle (same strategy as the T00 helpers). */
async function standardBundle(): Promise<string> {
  const [sdk, router] = await Promise.all([
    readFile(new URL('../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../domain-packages/standard/basic/workflow-router.mjs', import.meta.url), 'utf8'),
  ]);
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
// v0.10 T04 BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
}

async function richWithMemoryModules(): Promise<V10ModuleInput[]> {
  const [kernel, sdk, business, memory] = await Promise.all([
    readFile(new URL('../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    standardBundle(),
    readFile(new URL('./fixtures-v010/business-memory-notes-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./fixtures-v010/capability-memory-v1.mjs', import.meta.url), 'utf8'),
  ]);
  return [
    {
      packageId: KERNEL_PACKAGE_ID, role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel, moduleSha256: sha256HexSource(kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: STANDARD_PACKAGE_ID, role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: sdk, moduleSha256: sha256HexSource(sdk),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    {
      packageId: BUSINESS_MEMORY_ID, role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: business, moduleSha256: sha256HexSource(business),
      endpoint: 'business-policy', dependencies: [],
      provides: ['business:policy/1', 'intent:submitMemoryNote', 'intent:submitForeignMemoryNote'], requires: [],
    },
    {
      packageId: CAPABILITY_MEMORY_ID, role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: memory, moduleSha256: sha256HexSource(memory),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:memory/1'], requires: [],
      externalImports: {
        node: ['node:path', 'node:os', 'node:fs'],
        npm: ['@kaicreator/domain-harness/v8/host'],
        native: [],
      },
      capabilityId: 'memory',
      handlers: [
        { operationId: 'memory.put', handler: 'memoryPut' },
        { operationId: 'memory.get', handler: 'memoryGet' },
        { operationId: 'memory.search', handler: 'memorySearch' },
        { operationId: 'memory.delete', handler: 'memoryDelete' },
      ],
    },
  ];
}

async function buildRichWithMemory() {
  return buildV10App({
    appId: 'app:v010-t04-rich-with-memory',
    audience: 'aud:v010-t04',
    targetProfile: V10_TARGET_PROFILE,
    modules: await richWithMemoryModules(),
    routes: [
      { intentId: 'submitMemoryNote', operationId: 'memory.put', capabilityId: 'memory', handlerId: 'memoryPut' },
      { intentId: 'submitForeignMemoryNote', operationId: 'memory.put', capabilityId: 'memory', handlerId: 'memoryPut' },
    ],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 't04-rich-memory',
  });
}

interface NoteInput {
  op: 'put' | 'get' | 'search' | 'delete';
  key: string;
  value?: unknown;
  expectedRevision?: number;
  ttlMs?: number;
  requestId: string;
}

function note(messageId: string, input: NoteInput, intentType = 'submitMemoryNote'): {
  intentType: string; instanceKey: string; messageId: string; input: Record<string, unknown>;
} {
  // The rule projection requires every declared field to be present; absent
  // optional fields ride as null. Each turn rides its own Kernel instance so
  // an honestly-failed effect turn (which holds that instance's K01
  // admission fence fail-closed) never blocks the NEXT verification turn —
  // the shared composed Memory thread keeps the namespace identical.
  return {
    intentType,
    instanceKey: `instance:t04-note-${messageId}`,
    messageId,
    input: {
      op: input.op,
      key: input.key,
      value: input.value ?? null,
      expectedRevision: input.expectedRevision ?? null,
      ttlMs: input.ttlMs ?? null,
      requestId: input.requestId,
    },
  };
}

interface EffectOutcome {
  readonly effectId?: string;
  readonly disposition?: string;
  readonly output?: unknown;
}

/** The admitted receipt's first effect outcome (typed view of plain data). */
function firstEffect(receipt: Record<string, unknown>): EffectOutcome {
  assert.equal(receipt.status, 'admitted', `receipt must be admitted: ${JSON.stringify(receipt).slice(0, 300)}`);
  const admitted = receipt.admitted as { effects?: EffectOutcome[] } | undefined;
  const effect = admitted?.effects?.[0];
  assert.ok(effect !== undefined, 'the admitted receipt carries at least one effect outcome');
  assert.equal(effect.disposition, 'executed');
  return effect;
}

function effectFailureCode(error: unknown): string {
  assert.ok(error instanceof Error, `expected Error, got ${String(error)}`);
  assert.equal((error as { code?: string }).code, 'ADMISSION_EFFECT_FAILED', `unexpected failure: ${String(error)}`);
  return error.message;
}

/** Physical row count of the Memory capability's own SQLite store. */
function physicalMemoryRows(path: string): number {
  const db = new Database(path, { readonly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM v8_host_docs').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

test('P-SEL-WIRED: typed put/get/search/delete run through the real T00-selected App and Kernel effect dispatch', async () => {
  const _storePath = await freshMemoryStore();
  const clock = controlledClock();
  pinMemoryClock(clock.now);
  try {
    const app = await buildRichWithMemory();
    const kStore = new PlainCasDocStore();
    const counters = freshV10Counters();
    const activation = await activateV10App(app, { store: kStore, tenantId: TENANT, now: clock.now, counters });

    assert.equal(counters.importsByPackage[CAPABILITY_MEMORY_ID], 1, 'the selected C Memory package really evaluated');

    // put (create) through admission → journal → effect → resource port → adapter
    const put = await activation.facade.send(note('msg:put-1', { op: 'put', key: 'note:alpha', value: { text: 'first note' }, requestId: 'req-put-1' }));
    assert.deepEqual(firstEffect(put).output, { ok: true, operation: 'memory.put', key: 'note:alpha', revision: 0 });

    // get returns the typed read with provenance minted from the effect identity
    const got = await activation.facade.send(note('msg:get-1', { op: 'get', key: 'note:alpha', requestId: 'req-get-1' }));
    const read = (firstEffect(got).output as { read: { value: { text: string }; revision: number; provenance: { source: string } } }).read;
    assert.equal(read.value.text, 'first note');
    assert.equal(read.revision, 0);
    assert.match(read.provenance.source, /^effect:/);

    // search over the same scope
    const found = await activation.facade.send(note('msg:search-1', { op: 'search', key: 'note:', requestId: 'req-search-1' }));
    const rows = (firstEffect(found).output as { rows: { key: string }[] }).rows;
    assert.deepEqual(rows.map((row) => row.key), ['note:alpha']);

    // Memory never touches the K docs namespace: every K key stays under v10/k/
    assert.ok(kStore.keys().every((key) => key.startsWith('v10/k/')), 'Memory records must never land in the K docs store');

    activation.dispose();
  } finally {
    unpinMemoryClock();
    clearPinnedMemoryStore();
  }
});

test('P/N-SEL-CAS-TTL: revision conflicts and TTL expiry are visible through the App', async () => {
  const _storePath = await freshMemoryStore();
  const clock = controlledClock();
  pinMemoryClock(clock.now);
  try {
    const activation = await activateV10App(await buildRichWithMemory(), { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now });

    await activation.facade.send(note('msg:cas-1', { op: 'put', key: 'note:beta', value: 1, requestId: 'req-cas-1' }));

    // Stale CAS: wrong expected revision is typed-refused, nothing mutated
    await assert.rejects(
      activation.facade.send(note('msg:cas-2', { op: 'put', key: 'note:beta', value: 2, expectedRevision: 99, requestId: 'req-cas-2' })),
      (error: unknown) => { assert.match(effectFailureCode(error), /memory\.put refused: HOST_CAS_CONFLICT/); return true; },
    );
    // Matching CAS: the revision advances
    const updated = await activation.facade.send(note('msg:cas-3', { op: 'put', key: 'note:beta', value: 3, expectedRevision: 0, requestId: 'req-cas-3' }));
    assert.equal((firstEffect(updated).output as { revision: number }).revision, 1);

    // TTL: a bounded note expires deterministically on the controlled clock
    await activation.facade.send(note('msg:ttl-1', { op: 'put', key: 'note:gamma', value: 'ephemeral', ttlMs: 2_000, requestId: 'req-ttl-1' }));
    clock.advance(2_000);
    const expired = await activation.facade.send(note('msg:ttl-2', { op: 'get', key: 'note:gamma', requestId: 'req-ttl-2' }));
    assert.equal((firstEffect(expired).output as { read: unknown }).read, null, 'expired note is absent');
    const search = await activation.facade.send(note('msg:ttl-3', { op: 'search', key: 'note:', requestId: 'req-ttl-3' }));
    assert.deepEqual(
      (firstEffect(search).output as { rows: { key: string }[] }).rows.map((row) => row.key),
      ['note:beta'],
      'expired notes never appear in search',
    );

    // delete needs the exact revision: stale refuses, exact removes
    await assert.rejects(
      activation.facade.send(note('msg:del-1', { op: 'delete', key: 'note:beta', expectedRevision: 0, requestId: 'req-del-1' })),
      (error: unknown) => { assert.match(effectFailureCode(error), /memory\.delete refused: HOST_CAS_CONFLICT/); return true; },
    );
    const deleted = await activation.facade.send(note('msg:del-2', { op: 'delete', key: 'note:beta', expectedRevision: 1, requestId: 'req-del-2' }));
    assert.equal((firstEffect(deleted).output as { ok: boolean }).ok, true);
    const after = await activation.facade.send(note('msg:del-3', { op: 'get', key: 'note:beta', requestId: 'req-del-3' }));
    assert.equal((firstEffect(after).output as { read: unknown }).read, null);

    activation.dispose();
  } finally {
    unpinMemoryClock();
    clearPinnedMemoryStore();
  }
});

test('P-SEL-RESTART: records survive a full App activation restart on the real file-backed SQLite store', async () => {
  const storePath = await freshMemoryStore();
  const clock = controlledClock();
  pinMemoryClock(clock.now);
  try {
    const app = await buildRichWithMemory();
    const first = await activateV10App(app, { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now });
    await first.facade.send(note('msg:restart-1', { op: 'put', key: 'note:durable', value: { kept: true }, requestId: 'req-restart-1' }));
    first.dispose();

    // A full second activation re-imports the sealed bytes (fresh data:
    // URLs) and re-opens the SAME physical SQLite file: the surviving record
    // must still be readable through the re-activated App.
    const second = await activateV10App(app, { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now });
    const got = await second.facade.send(note('msg:restart-2', { op: 'get', key: 'note:durable', requestId: 'req-restart-2' }));
    const read = (firstEffect(got).output as { read: { value: { kept: boolean } } }).read;
    assert.deepEqual(read.value, { kept: true });
    assert.ok(physicalMemoryRows(storePath) >= 1, 'the physical SQLite store really holds the surviving record');
    second.dispose();
  } finally {
    unpinMemoryClock();
    clearPinnedMemoryStore();
  }
});

test('N-SEL-FOREIGN-SCOPE: an unselected tenant scope is typed-refused with zero physical mutation', async () => {
  const storePath = await freshMemoryStore();
  const clock = controlledClock();
  pinMemoryClock(clock.now);
  try {
    const activation = await activateV10App(await buildRichWithMemory(), { store: new PlainCasDocStore(), tenantId: TENANT, now: clock.now });

    // Authorized record first, to prove the probe adds NOTHING beside it.
    await activation.facade.send(note('msg:f-0', { op: 'put', key: 'note:ok', value: 1, requestId: 'req-f-0' }));
    const rowsBefore = physicalMemoryRows(storePath);

    // The labeled probe intent: same physical call, tenant NOT selected at BUILD.
    await assert.rejects(
      activation.facade.send(note('msg:f-1', { op: 'put', key: 'note:foreign', value: 'leak', requestId: 'req-f-1' }, 'submitForeignMemoryNote')),
      (error: unknown) => { assert.match(effectFailureCode(error), /memory\.put refused: MEMORY_SCOPE_DENIED/); return true; },
    );
    assert.equal(physicalMemoryRows(storePath), rowsBefore, 'the denied operation physically wrote zero rows');

    // The authorized scope still works afterwards and never sees the probe key
    const search = await activation.facade.send(note('msg:f-2', { op: 'search', key: 'note:', requestId: 'req-f-2' }));
    assert.deepEqual(
      (firstEffect(search).output as { rows: { key: string }[] }).rows.map((row) => row.key),
      ['note:ok'],
    );

    activation.dispose();
  } finally {
    unpinMemoryClock();
    clearPinnedMemoryStore();
  }
});

test('P/N-SEL-TINY-OMITS-MEMORY: a Tiny BUILD neither selects nor evaluates the Memory capability', async () => {
  const tiny = buildV10App(await basicComposition());
  assert.ok(tiny.modules.every((module) => module.packageId !== CAPABILITY_MEMORY_ID), 'Tiny selects no Memory package');

  const counters = freshV10Counters();
  const activation = await activateV10App(tiny, { store: new PlainCasDocStore(), tenantId: 'tenant:v010-t00', now: controlledClock().now, counters });
  assert.equal(counters.importsByPackage[CAPABILITY_MEMORY_ID], undefined, 'Tiny never imports or evaluates Memory bytes');
  const receipt = await activation.facade.send({ ...TINY_INTENT });
  assert.equal(receipt.status, 'admitted', 'Tiny without Memory keeps working');
  activation.dispose();

  // Negative: a route naming the unselected memory capability refuses at BUILD
  const withMemoryRoute = await basicComposition({
    routes: [
      { intentId: 'submitQuoteDecisionDynamic', operationId: 'memory.put', capabilityId: 'memory', handlerId: 'memoryPut' },
    ],
  });
  assert.throws(
    () => buildV10App(withMemoryRoute),
    (error: unknown) => {
      assert.ok(error instanceof V10BuildError);
      assert.equal((error as { code?: string }).code, 'V10_ROUTE_INVALID');
      return true;
    },
    'a Tiny composition cannot route to a capability it did not select',
  );
});
