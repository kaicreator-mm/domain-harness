/**
 * T07 (#1174) — PHYSICAL read-only Shadow L4 witness.
 * =====================================================================
 *
 * This suite runs the Host-owned Shadow L4 runner against a REAL file-backed
 * SQLite K store (`openSqliteCasStore`) on Node 24, over an ACTUALLY
 * selected v0.10 App (selected kernel/SDK/business/capability plus the
 * T07 baseline Standard feature). It proves what the pure candidate-report
 * feature deliberately cannot:
 *
 *   PH-P1  a byte-pinned approved candidate that matches the exact selected
 *          fallback over the real selected K observations, with the SQLite
 *          rows, WAL and a read-only `total_changes()` witness unchanged;
 *   PH-P2  an explicit candidate-state (not approved) runs the shadow but is
 *          never promoted/approved;
 *   PH-N1  a bounded candidate counterexample difference leaves the exact
 *          approved fallback in place and writes nothing;
 *   PH-N2  a candidate exception is an honest `shadow-failed` report with
 *          zero production writes;
 *   PH-N3  a candidate synchronous timeout is bounded by the VM and writes
 *          nothing;
 *   PH-N4  an effect-shaped candidate proposal is refused before it can be
 *          mistaken for authority, with zero writes;
 *   PH-N5  revoked, digest-mismatched, self-approved and identical
 *          candidates are typed refusals before evaluation;
 *   PH-N6  fallback digest/revision/provenance/approval mismatches STOP with
 *          a typed no-fallback refusal, production unchanged;
 *   PH-P3  two runs over the same physical snapshot produce the same replay
 *          digest and still write nothing;
 *   PH-N11 two legitimate deployments of the SAME BUILD/Tenant (distinct
 *          deployedAppId) share one SQLite store: Shadow on one deployment
 *          observes ONLY its own exact K02 prefixes, even when the other
 *          deployment's keys sort first and outnumber the whole case budget;
 *   PH-N12 the same isolation survives a store/facade restart: the replay
 *          digest and the observed key set are identical, still zero writes;
 *   PH-N13 an activation without a deployment identity refuses typed before
 *          any K read; it never widens to the unscoped App/Tenant namespace.
 *
 * Every test also asserts the instrumented production store's put/remove
 * counters stay at zero, the full `v8_host_docs` table is row-identical, the
 * selected K counters do not move, Memory is untouched and no external Effect
 * dispatch occurs. The original selected K02 receipt therefore remains the
 * only authority; the shadow never re-activates, promotes or dispatches.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import {
  activateV10App,
  buildV10App,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { V10BuiltApp, V10DocStore, V10DocWriteCondition, V10ModuleInput } from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import {
  SHADOW_K_DOCS_PREFIX,
  ShadowL4Error,
  pinCandidateSource,
  runShadowL4,
  selectedFallbackPin,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10shadow/index.js';
import type {
  ShadowKReadStore,
  ShadowL4Report,
  ShadowL4RunnerOptions,
  ShadowL4VersionPin,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10shadow/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import { createV10ScopedMemory } from '../../../packages/domain-harness/src/host-v8/v010-scoped-memory.js';
import { basicComposition, featureEntry, INTENT } from '../../assembly/helpers-v010.js';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the T07 physical shadow witness targets the selected Node24 runtime (running ${process.versions.node})`,
);

const TENANT = 'tenant:v010-t07-shadow';
const DEPLOYED_APP_ID = 'deploy:v010-t07-shadow';
const BUSINESS_PACKAGE_ID = 'business-order-approval@v08.1.0.0';
const FALLBACK_PACKAGE_ID = 'sfeature-shadow-baseline@v010.1.0.0';
const BASE_MS = Date.UTC(2026, 9, 19, 12, 0, 0);
const SEED_INTENT = {
  ...INTENT,
  instanceKey: 'instance:t07-seed',
  messageId: 'msg:t07-seed',
} as const;

/** K02 key-component escaping (% → %25, : → %3A), mirroring the product encoder. */
const encodeKComponent = (value: string): string => value.replace(/%/g, '%25').replace(/:/g, '%3A');

interface SqliteRow {
  readonly key: string;
  readonly revision: number;
  readonly value: string;
}

/** V10DocStore over the REAL physical SQLite CAS store, counting every mutation. */
class InstrumentedStore implements V10DocStore {
  putCalls = 0;
  removeCalls = 0;
  getCalls = 0;
  keysCalls = 0;
  constructor(
    private readonly store: Awaited<ReturnType<typeof openSqliteCasStore>>,
    private readonly keyReader: InstanceType<typeof Database>,
  ) {}
  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    this.getCalls += 1;
    return await this.store.get(key);
  }
  async put(key: string, value: unknown, condition: V10DocWriteCondition): Promise<{ revision: number }> {
    this.putCalls += 1;
    return await this.store.put(key, value, condition.kind === 'create'
      ? { mustBeAbsent: true }
      : { mustMatchRevision: condition.revision });
  }
  async remove(key: string, condition: V10DocWriteCondition): Promise<void> {
    this.removeCalls += 1;
    await this.store.remove(key, condition.kind === 'create'
      ? { mustBeAbsent: true }
      : { mustMatchRevision: condition.revision });
  }
  keys(): readonly string[] {
    this.keysCalls += 1;
    return (this.keyReader.prepare('SELECT key FROM v8_host_docs').all() as { key: string }[])
      .map((row) => row.key);
  }
  resetCounters(): void {
    this.putCalls = 0;
    this.removeCalls = 0;
    this.getCalls = 0;
    this.keysCalls = 0;
  }
}

function sha256File(path: string): string | null {
  return existsSync(path)
    ? createHash('sha256').update(readFileSync(path)).digest('hex')
    : null;
}

/** The physical zero-write witness: durable DB/WAL bytes + the reader's own change counter. */
function physicalWitness(kPath: string, reader: InstanceType<typeof Database>): {
  readonly main: string | null;
  readonly wal: string | null;
  readonly totalChanges: number;
} {
  const totalChanges = reader.prepare('SELECT total_changes() AS n').get() as { n: number };
  return Object.freeze({
    main: sha256File(kPath),
    wal: sha256File(`${kPath}-wal`),
    totalChanges: totalChanges.n,
  });
}

/** Direct SQL row snapshot (the whole production table, including Memory rows). */
function readRows(kPath: string): readonly SqliteRow[] {
  const db = new Database(kPath, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  try {
    return db.prepare('SELECT key, revision, value FROM v8_host_docs ORDER BY key').all() as SqliteRow[];
  } finally {
    db.close();
  }
}

interface ShadowHarness {
  readonly dir: string;
  readonly kPath: string;
  readonly app: V10BuiltApp;
  readonly baselineSource: string;
  readonly fallbackPin: ShadowL4VersionPin;
  readonly store: InstrumentedStore;
  readonly activation: Awaited<ReturnType<typeof activateV10App>>;
  readonly keyReader: InstanceType<typeof Database>;
  readonly reader: InstanceType<typeof Database>;
  readonly memory: ReturnType<typeof createV10ScopedMemory>;
  readonly memoryScope: Parameters<ReturnType<typeof createV10ScopedMemory>['get']>[0];
  readonly memoryBefore: unknown;
  readonly receipt: Record<string, unknown>;
  readonly beforeRows: readonly SqliteRow[];
  readonly kCountersBefore: Record<string, number>;
  readonly kDocsBase: string;
  witness(): unknown;
  cleanup(): Promise<void>;
}

async function buildShadowApp(overrideAppId?: string): Promise<{ app: V10BuiltApp; baselineSource: string }> {
  const baselineSource = await readFile(new URL('./v010-t07-shadow-baseline-v1.mjs', import.meta.url), 'utf8');
  const feature: V10ModuleInput = await featureEntry({
    fixture: 'sfeature-shadow-baseline-v1.mjs',
    moduleSourceOverride: baselineSource,
    featureKey: 'standard:shadow-baseline/1',
    featureExport: 'evaluate',
  });
  const input = await basicComposition({ features: [feature] });
  const app = buildV10App(overrideAppId === undefined ? input : { ...input, appId: overrideAppId });
  return { app, baselineSource };
}

async function createHarness(): Promise<ShadowHarness> {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t07-shadow-'));
  const kPath = join(dir, 'k.sqlite');
  const raw = await openSqliteCasStore({ path: kPath });
  const keyReader = new Database(kPath, { readonly: true, fileMustExist: true });
  keyReader.pragma('query_only = ON');
  const store = new InstrumentedStore(raw, keyReader);
  const { app, baselineSource } = await buildShadowApp();
  const activation = await activateV10App(app, {
    store,
    tenantId: TENANT,
    deploymentIdentity: { deployedAppId: DEPLOYED_APP_ID, tenantId: TENANT, appId: app.appId },
    now: () => BASE_MS,
  });
  const receipt = await activation.facade.send(SEED_INTENT);
  assert.equal(receipt.status, 'admitted', `seed turn must be admitted: ${JSON.stringify(receipt).slice(0, 400)}`);

  const memory = createV10ScopedMemory({
    store: raw,
    authorize: () => true,
    now: () => BASE_MS,
  });
  const memoryScope = {
    deployedAppId: DEPLOYED_APP_ID,
    tenantId: TENANT,
    appId: app.appId,
    businessPackageId: BUSINESS_PACKAGE_ID,
    agentId: 'agent:t07',
    threadId: 'thread:t07',
  };
  await memory.put({
    scope: memoryScope,
    key: 'shadow:untouched',
    value: { amount: 7, state: 'production' },
    provenance: { source: 'trusted-host', recordedBy: 'trusted-host' },
    condition: { mustBeAbsent: true },
  });
  const memoryBefore = await memory.get(memoryScope, 'shadow:untouched');

  // Seeding is complete: from here on, any put/remove is a shadow-run write.
  store.resetCounters();
  const reader = new Database(kPath, { readonly: true, fileMustExist: true });
  reader.pragma('query_only = ON');
  const beforeRows = readRows(kPath);
  const kCountersBefore = { ...activation.facade.kCounters(BUSINESS_PACKAGE_ID) };
  const fallbackPin = selectedFallbackPin(app, {
    selectedPackageId: FALLBACK_PACKAGE_ID,
    kind: 'Rule',
    id: 'rule:quote-approval',
  });
  // [i1217] The activation carries a deployment identity, so every K document
  // sits under the deployment-tuple prefix, not the legacy digest prefix.
  const kDocsBase = `${SHADOW_K_DOCS_PREFIX}deployment:${encodeKComponent(DEPLOYED_APP_ID)}:${encodeKComponent(TENANT)}:${encodeKComponent(app.appId)}/`;
  let cleaned = false;
  return {
    dir,
    kPath,
    app,
    baselineSource,
    fallbackPin,
    store,
    activation,
    keyReader,
    reader,
    memory,
    memoryScope,
    memoryBefore,
    receipt,
    beforeRows,
    kCountersBefore,
    kDocsBase,
    witness: (): unknown => physicalWitness(kPath, reader),
    cleanup: async (): Promise<void> => {
      if (cleaned) return;
      cleaned = true;
      try {
        activation.dispose();
      } finally {
        keyReader.close();
        reader.close();
        await raw.close();
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

async function withHarness(run: (harness: ShadowHarness) => Promise<void>): Promise<void> {
  const harness = await createHarness();
  try {
    await run(harness);
  } finally {
    await harness.cleanup();
  }
}

async function runShadow(
  harness: ShadowHarness,
  source: string,
  pin: ShadowL4VersionPin,
  options: {
    readonly approvedFallback?: ShadowL4RunnerOptions['approvedFallback'];
    readonly app?: V10BuiltApp;
    readonly tenantId?: string;
    readonly trustedCandidateApproval?: NonNullable<ShadowL4RunnerOptions['trustedCandidateApproval']>;
    readonly evaluationTimeoutMs?: number;
    readonly budget?: { readonly maxCases: number; readonly maxComparisons: number };
  } = {},
): Promise<ShadowL4Report> {
  return await runShadowWith({
    facade: harness.activation.facade,
    app: options.app ?? harness.app,
    store: {
      get: async (key: string) => await harness.store.get(key),
      keys: async () => await harness.store.keys(),
    },
    witness: harness.witness,
    fallbackPin: harness.fallbackPin,
    source,
    pin,
    tenantId: options.tenantId ?? TENANT,
    budget: options.budget ?? { maxCases: 8, maxComparisons: 8 },
    ...(options.approvedFallback === undefined ? {} : { approvedFallback: options.approvedFallback }),
    ...(options.trustedCandidateApproval === undefined
      ? {}
      : { trustedCandidateApproval: options.trustedCandidateApproval }),
    ...(options.evaluationTimeoutMs === undefined ? {} : { evaluationTimeoutMs: options.evaluationTimeoutMs }),
  });
}

interface ShadowRunSurface {
  readonly facade: ShadowL4RunnerOptions['facade'];
  readonly app: V10BuiltApp;
  readonly store: ShadowKReadStore;
  readonly witness: () => unknown;
  readonly fallbackPin: ShadowL4VersionPin;
  readonly source: string;
  readonly pin: ShadowL4VersionPin;
  readonly tenantId: string;
  readonly budget: { readonly maxCases: number; readonly maxComparisons: number };
  readonly approvedFallback?: ShadowL4RunnerOptions['approvedFallback'];
  readonly trustedCandidateApproval?: NonNullable<ShadowL4RunnerOptions['trustedCandidateApproval']>;
  readonly evaluationTimeoutMs?: number;
}

async function runShadowWith(surface: ShadowRunSurface): Promise<ShadowL4Report> {
  return await runShadowL4({
    facade: surface.facade,
    app: surface.app,
    store: surface.store,
    tenantId: surface.tenantId,
    candidate: { pin: surface.pin, source: surface.source, exportName: 'evaluate' },
    approvedFallback: surface.approvedFallback ?? {
      pin: surface.fallbackPin,
      selectedPackageId: FALLBACK_PACKAGE_ID,
      exportName: 'evaluate',
    },
    budget: surface.budget,
    physicalWitness: surface.witness,
    evaluationTimeoutMs: surface.evaluationTimeoutMs ?? 100,
    ...(surface.trustedCandidateApproval === undefined
      ? {}
      : { trustedCandidateApproval: surface.trustedCandidateApproval }),
  });
}

async function assertZeroProductionWrites(harness: ShadowHarness, report: ShadowL4Report): Promise<void> {
  assert.equal(
    report.production.productionWritesVerifiedZero,
    true,
    `the physical witness must verify zero writes (failure: ${JSON.stringify(report.failure)})`,
  );
  assert.equal(report.production.snapshotUnchanged, true);
  assert.equal(report.production.physicalWitnessUnchanged, true);
  assert.equal(report.production.storeMutationMethodsUsed, 0);
  assert.equal(report.production.externalEffectCalls, 0);
  assert.equal(report.production.memoryWrites, 0);
  assert.equal(report.production.cacheWrites, 0);
  assert.ok(report.production.storeReads > 0, 'the runner must have read real selected K documents');
  assert.equal(harness.store.putCalls, 0, 'production docs.put must never be called');
  assert.equal(harness.store.removeCalls, 0, 'production docs.remove must never be called');
  assert.deepEqual(readRows(harness.kPath), harness.beforeRows, 'the physical v8_host_docs rows must be identical');
  assert.deepEqual(
    harness.activation.facade.kCounters(BUSINESS_PACKAGE_ID),
    harness.kCountersBefore,
    'the selected K counters must not move',
  );
  assert.equal(harness.activation.counters.externalEffectDispatches, 0, 'no external Effect dispatch');
  assert.deepEqual(
    await harness.memory.get(harness.memoryScope, 'shadow:untouched'),
    harness.memoryBefore,
    'the scoped Memory row must be untouched',
  );
  assert.equal(harness.activation.facade.isClosed(), false);
}

function shadowCode(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof ShadowL4Error && error.code === code;
}

function candidatePin(source: string, overrides: Partial<Omit<ShadowL4VersionPin, 'sha256'>> = {}): ShadowL4VersionPin {
  return pinCandidateSource({
    kind: 'Rule',
    id: 'rule:quote-approval',
    revision: 'candidate:r2',
    provenance: 'candidate:pinned-source:t07',
    approvalState: 'candidate',
    ...overrides,
  }, source);
}

function trustedApproval(pin: ShadowL4VersionPin): {
  readonly id: string;
  readonly revision: string;
  readonly sha256: string;
  readonly state: 'approved';
} {
  return { id: pin.id, revision: pin.revision, sha256: pin.sha256, state: 'approved' };
}

test('T07-PH-P1: approved byte-pinned candidate matches the exact selected fallback over real K observations with physical zero writes', async () => {
  await withHarness(async (harness) => {
    const source = `// T07 controlled candidate: byte-distinct from the selected fallback.\n${harness.baselineSource}`;
    const pin = candidatePin(source, { approvalState: 'approved' });
    const report = await runShadow(harness, source, pin, {
      trustedCandidateApproval: trustedApproval(pin),
    });

    assert.equal(report.status, 'match');
    assert.equal(report.failure, null);
    assert.ok(report.comparisons >= 3, `the real selected K snapshot must provide multiple cases (got ${report.comparisons})`);
    assert.deepEqual(report.differingCaseIds, []);
    assert.equal(report.matchingCaseIds.length, report.comparisons);
    assert.equal(report.candidateApproval.state, 'approved');
    assert.equal(report.candidateApproval.authority, 'host-admission');
    assert.equal(report.approvedFallback.sha256, harness.fallbackPin.sha256);
    assert.equal(report.approvedFallback.revision, FALLBACK_PACKAGE_ID);
    assert.equal(report.approvedFallback.provenance, harness.fallbackPin.provenance);
    assert.ok(report.observations.total >= report.observations.considered);
    assert.equal(report.observations.truncated, report.observations.total > report.observations.considered);
    assert.ok(report.observations.keys.every((key) => key.startsWith(harness.kDocsBase)));
    assert.equal(report.canSelfApprove, false);
    assert.equal(report.canPromote, false);
    assert.equal(report.kernelEffectPermit, false);
    assert.equal(report.evidenceAuthority, 'host-owned-readonly-shadow');
    await assertZeroProductionWrites(harness, report);

    // After the physical zero-write window, the original K02 receipt is still
    // the only authority: an identical replay answers with the SAME effect
    // and dispatches no new effect.
    const replay = await harness.activation.facade.send(SEED_INTENT);
    assert.equal(replay.status, 'admitted');
    const firstEffect = (harness.receipt.admitted as { effects?: { effectId?: string }[] }).effects?.[0]?.effectId;
    const replayEffect = (replay.admitted as { effects?: { effectId?: string }[] }).effects?.[0]?.effectId;
    assert.equal(replayEffect, firstEffect);
    assert.equal(
      harness.activation.facade.kCounters(BUSINESS_PACKAGE_ID).effectDispatches,
      harness.kCountersBefore.effectDispatches,
      'the replay must not dispatch a new effect',
    );
  });
});

test('T07-PH-P2: an explicit candidate-state (not approved) is evaluated but never promoted or self-approved', async () => {
  await withHarness(async (harness) => {
    const source = `// T07 explicit candidate-state evaluation.\n${harness.baselineSource}`;
    const pin = candidatePin(source);
    assert.equal(pin.approvalState, 'candidate');
    const report = await runShadow(harness, source, pin);
    assert.equal(report.status, 'match');
    assert.equal(report.candidateApproval.state, 'candidate');
    assert.equal(report.candidateApproval.authority, 'explicit-candidate');
    assert.equal(report.canSelfApprove, false);
    assert.equal(report.canPromote, false);
    await assertZeroProductionWrites(harness, report);
  });
});

test('T07-PH-N1: a bounded candidate counterexample difference keeps the exact approved fallback and writes nothing', async () => {
  await withHarness(async (harness) => {
    const source = `export function evaluate(input) {
      const value = input && typeof input.value === 'object' && input.value !== null ? input.value : {};
      return {
        key: input && input.key,
        revision: input && input.revision,
        state: 'candidate-difference',
        phase: typeof value.phase === 'string' ? value.phase : null,
        outcome: typeof value.outcome === 'string' ? value.outcome : null,
      };
    }`;
    const pin = candidatePin(source, { revision: 'candidate:r3', provenance: 'candidate:differing:t07' });
    const report = await runShadow(harness, source, pin);
    assert.equal(report.status, 'difference');
    assert.equal(report.failure, null);
    assert.ok(report.differingCaseIds.length > 0);
    assert.equal(report.matchingCaseIds.length + report.differingCaseIds.length, report.comparisons);
    assert.notEqual(report.differencePreview, null);
    assert.match(String(report.differencePreview), /candidate-difference/);
    assert.equal(report.approvedFallback.sha256, harness.fallbackPin.sha256);
    assert.equal(report.approvedFallback.revision, FALLBACK_PACKAGE_ID);
    assert.equal(report.canPromote, false);
    await assertZeroProductionWrites(harness, report);
  });
});

test('T07-PH-N2: a candidate exception is an honest shadow failure with zero production writes', async () => {
  await withHarness(async (harness) => {
    const source = `export function evaluate() { throw new Error('intentional T07 shadow failure'); }`;
    const pin = candidatePin(source, { revision: 'candidate:throws', provenance: 'candidate:throws:t07' });
    const report = await runShadow(harness, source, pin);
    assert.equal(report.status, 'shadow-failed');
    assert.equal(report.failure?.code, 'SHADOW_CANDIDATE_THREW');
    assert.match(String(report.failure?.message), /intentional T07 shadow failure/);
    await assertZeroProductionWrites(harness, report);
  });
});

test('T07-PH-N3: a synchronous candidate timeout is bounded by the isolated VM and writes nothing', async () => {
  await withHarness(async (harness) => {
    const source = `export function evaluate() { while (true) { /* bounded by vm timeout */ } }`;
    const pin = candidatePin(source, { revision: 'candidate:timeout', provenance: 'candidate:timeout:t07' });
    const report = await runShadow(harness, source, pin, { evaluationTimeoutMs: 25 });
    assert.equal(report.status, 'shadow-failed');
    assert.equal(report.failure?.code, 'SHADOW_CANDIDATE_TIMEOUT');
    await assertZeroProductionWrites(harness, report);
  });
});

test('T07-PH-N4: an effect-shaped candidate proposal is refused, not treated as authority, with zero writes', async () => {
  await withHarness(async (harness) => {
    const source = `export function evaluate() {
      return { effectPermit: 'forged', nested: { resources: { call: function () {} } } };
    }`;
    const pin = candidatePin(source, { revision: 'candidate:effect-proposal', provenance: 'candidate:effect-proposal:t07' });
    const report = await runShadow(harness, source, pin);
    assert.equal(report.status, 'shadow-failed');
    assert.equal(report.failure?.code, 'SHADOW_CANDIDATE_EFFECT_PROPOSAL');
    assert.match(String(report.failure?.message), /effectPermit/);
    assert.equal(report.kernelEffectPermit, false);
    await assertZeroProductionWrites(harness, report);
  });
});

test('T07-PH-N5: revoked, digest-mismatched, self-approved and identical candidates are typed refusals before evaluation', async () => {
  await withHarness(async (harness) => {
    const source = `// T07 refusal candidate.\n${harness.baselineSource}`;

    const revoked = candidatePin(source, { approvalState: 'revoked' });
    await assert.rejects(runShadow(harness, source, revoked), shadowCode('SHADOW_CANDIDATE_REVOKED'));

    const otherSource = `export function evaluate() { return { key: null }; }`;
    const mismatched = candidatePin(otherSource, { revision: 'candidate:mismatch' });
    await assert.rejects(runShadow(harness, source, mismatched), shadowCode('SHADOW_CANDIDATE_SOURCE_MISMATCH'));

    const selfApproved = candidatePin(source, { approvalState: 'approved', revision: 'candidate:self-approved' });
    await assert.rejects(runShadow(harness, source, selfApproved), shadowCode('SHADOW_APPROVAL_UNTRUSTED'));

    const identical = pinCandidateSource({
      kind: 'Rule',
      id: 'rule:quote-approval-copy',
      revision: 'candidate:identical',
      provenance: 'candidate:identical:t07',
      approvalState: 'candidate',
    }, harness.baselineSource);
    await assert.rejects(runShadow(harness, harness.baselineSource, identical), shadowCode('SHADOW_CANDIDATE_IDENTICAL_TO_FALLBACK'));

    assert.equal(harness.store.putCalls, 0);
    assert.equal(harness.store.removeCalls, 0);
    assert.deepEqual(readRows(harness.kPath), harness.beforeRows);
  });
});

test('T07-PH-N6: fallback digest/revision/provenance/approval mismatches STOP with a typed no-fallback refusal', async () => {
  await withHarness(async (harness) => {
    const source = `// T07 fallback refusal candidate.\n${harness.baselineSource}`;
    const pin = candidatePin(source, { revision: 'candidate:fallback-refusal' });
    const fallback = {
      pin: harness.fallbackPin,
      selectedPackageId: FALLBACK_PACKAGE_ID,
      exportName: 'evaluate',
    };

    await assert.rejects(
      runShadow(harness, source, pin, { approvedFallback: { ...fallback, pin: { ...harness.fallbackPin, sha256: 'a'.repeat(64) } } }),
      shadowCode('SHADOW_FALLBACK_PIN_MISMATCH'),
    );
    await assert.rejects(
      runShadow(harness, source, pin, { approvedFallback: { ...fallback, pin: { ...harness.fallbackPin, revision: 'retired:r1' } } }),
      shadowCode('SHADOW_FALLBACK_PIN_MISMATCH'),
    );
    await assert.rejects(
      runShadow(harness, source, pin, { approvedFallback: { ...fallback, pin: { ...harness.fallbackPin, provenance: 'selected:wrong' } } }),
      shadowCode('SHADOW_FALLBACK_PIN_MISMATCH'),
    );
    await assert.rejects(
      runShadow(harness, source, pin, { approvedFallback: { ...fallback, pin: { ...harness.fallbackPin, approvalState: 'candidate' } } }),
      shadowCode('SHADOW_FALLBACK_NOT_APPROVED'),
    );
    await assert.rejects(
      runShadow(harness, source, pin, { approvedFallback: { ...fallback, selectedPackageId: 'sfeature:not-selected@1.0.0' } }),
      shadowCode('SHADOW_FALLBACK_NOT_SELECTED'),
    );
    await assert.rejects(
      runShadow(harness, source, pin, { approvedFallback: { ...fallback, pin: { ...harness.fallbackPin, revision: 'latest' } } }),
      shadowCode('SHADOW_PIN_INVALID'),
    );

    assert.equal(harness.store.putCalls, 0);
    assert.equal(harness.store.removeCalls, 0);
    assert.deepEqual(readRows(harness.kPath), harness.beforeRows);
  });
});

test('T07-PH-P3: replay over the same physical snapshot is deterministic and still writes nothing', async () => {
  await withHarness(async (harness) => {
    const source = `// T07 replay candidate.\n${harness.baselineSource}`;
    const pin = candidatePin(source, { revision: 'candidate:replay' });
    const first = await runShadow(harness, source, pin);
    await assertZeroProductionWrites(harness, first);
    const second = await runShadow(harness, source, pin);
    await assertZeroProductionWrites(harness, second);
    assert.equal(first.status, 'match');
    assert.equal(second.status, 'match');
    assert.equal(first.replayDigest, second.replayDigest);
    assert.deepEqual(first.cases, second.cases);
  });
});

test('T07-PH-N7: a Host store without the read-only key interface STOPs with evidence and writes nothing', async () => {
  await withHarness(async (harness) => {
    const source = `// T07 missing read interface candidate.\n${harness.baselineSource}`;
    const pin = candidatePin(source, { revision: 'candidate:no-read-interface' });
    const readOnly: ShadowKReadStore = {
      get: async (key: string) => await harness.store.get(key),
    } as unknown as ShadowKReadStore;
    await assert.rejects(
      runShadowL4({
        facade: harness.activation.facade,
        app: harness.app,
        store: readOnly,
        tenantId: TENANT,
        candidate: { pin, source, exportName: 'evaluate' },
        approvedFallback: { pin: harness.fallbackPin, selectedPackageId: FALLBACK_PACKAGE_ID, exportName: 'evaluate' },
        budget: { maxCases: 8, maxComparisons: 8 },
        physicalWitness: harness.witness,
      }),
      shadowCode('SHADOW_READ_INTERFACE_MISSING'),
    );
    assert.equal(harness.store.putCalls, 0);
    assert.equal(harness.store.removeCalls, 0);
    assert.deepEqual(readRows(harness.kPath), harness.beforeRows);
  });
});


test('T07-PH-N8: real BUILD B with the same Standard features cannot be shadowed through facade A, even with real B K documents', async () => {
  await withHarness(async (harness) => {
    const buildB = await buildShadowApp('app:v010-t07-other-build');
    assert.notEqual(buildB.app.subjectDigest, harness.app.subjectDigest);
    assert.deepEqual(
      buildB.app.modules.filter((module) => module.role === 'standard-feature').map((module) => module.packageId),
      harness.app.modules.filter((module) => module.role === 'standard-feature').map((module) => module.packageId),
      'BUILD A and B have the SAME selected Standard feature roster',
    );
    // Populate real K documents for the other legitimately built App B.
    const activatedB = await activateV10App(buildB.app, {
      store: harness.store,
      tenantId: TENANT,
      deploymentIdentity: { deployedAppId: DEPLOYED_APP_ID, tenantId: TENANT, appId: buildB.app.appId },
      now: () => BASE_MS,
    });
    try {
      await activatedB.facade.send(SEED_INTENT);
    } finally {
      activatedB.dispose();
    }
    harness.store.resetCounters();
    const source = `// A/B identity falsifier.\n${harness.baselineSource}`;
    const pin = candidatePin(source);
    const fallbackB = selectedFallbackPin(buildB.app, {
      selectedPackageId: FALLBACK_PACKAGE_ID,
      kind: 'Rule',
      id: 'rule:quote-approval',
    });
    await assert.rejects(
      runShadow(harness, source, pin, {
        app: buildB.app,
        approvedFallback: { pin: fallbackB, selectedPackageId: FALLBACK_PACKAGE_ID, exportName: 'evaluate' },
      }),
      shadowCode('SHADOW_APP_FACADE_MISMATCH'),
    );
    assert.equal(harness.store.keysCalls, 0, 'mismatched BUILD identity must refuse before listing K keys');
    assert.equal(harness.store.getCalls, 0, 'mismatched BUILD identity must refuse before first K read');
    assert.equal(harness.store.putCalls, 0);
    assert.equal(harness.store.removeCalls, 0);
  });
});

test('T07-PH-N9: real activated facade tenant cannot be replaced by a caller-selected other tenant', async () => {
  await withHarness(async (harness) => {
    const foreignTenant = 'tenant:v010-t07-foreign';
    const activationOtherTenant = await activateV10App(harness.app, {
      store: harness.store,
      tenantId: foreignTenant,
      deploymentIdentity: { deployedAppId: DEPLOYED_APP_ID, tenantId: foreignTenant, appId: harness.app.appId },
      now: () => BASE_MS,
    });
    try {
      await activationOtherTenant.facade.send(SEED_INTENT);
    } finally {
      activationOtherTenant.dispose();
    }
    harness.store.resetCounters();
    const source = `// Foreign tenant falsifier.\n${harness.baselineSource}`;
    await assert.rejects(
      runShadow(harness, source, candidatePin(source), { tenantId: foreignTenant }),
      shadowCode('SHADOW_APP_FACADE_MISMATCH'),
    );
    assert.equal(harness.store.keysCalls, 0, 'wrong tenant must be refused before observing K keys');
    assert.equal(harness.store.getCalls, 0, 'wrong tenant must be refused before any K read');
    assert.equal(harness.store.putCalls, 0);
    assert.equal(harness.store.removeCalls, 0);
  });
});

test('T07-PH-N10: a BUILD view with forged Business identity refuses before any K read', async () => {
  await withHarness(async (harness) => {
    const businesses = harness.app.modules.filter((module) => module.role === 'business');
    assert.ok(businesses.length > 0, 'the selected BUILD must carry at least one Business package');
    // Same subject digest and App id as the activated facade; only the
    // reported selected Business roster is forged.
    const forgedApp = {
      ...harness.app,
      modules: harness.app.modules.map((module) => module.role === 'business'
        ? { ...module, packageId: 'business-forged@v08.1.0.0' }
        : module),
    } as unknown as V10BuiltApp;
    const source = `// Forged Business identity falsifier.\n${harness.baselineSource}`;
    await assert.rejects(
      runShadow(harness, source, candidatePin(source), { app: forgedApp }),
      shadowCode('SHADOW_APP_FACADE_MISMATCH'),
    );
    assert.equal(harness.store.keysCalls, 0, 'forged Business identity must refuse before listing K keys');
    assert.equal(harness.store.getCalls, 0, 'forged Business identity must refuse before first K read');
    assert.equal(harness.store.putCalls, 0);
    assert.equal(harness.store.removeCalls, 0);
    assert.deepEqual(readRows(harness.kPath), harness.beforeRows);
  });
});


const OWN_DEPLOYMENT_ID = 'deploy:z-owned';
const FOREIGN_DEPLOYMENT_ID = 'deploy:a-foreign';

interface SharedDeploymentHarness {
  readonly dir: string;
  readonly kPath: string;
  readonly app: V10BuiltApp;
  readonly baselineSource: string;
  readonly fallbackPin: ShadowL4VersionPin;
  readonly ownPrefix: string;
  readonly ownBase: string;
  readonly foreignBase: string;
  readonly activation: Awaited<ReturnType<typeof activateV10App>>;
  readonly store: InstrumentedStore;
  rows(): readonly SqliteRow[];
  witness(): unknown;
  restart(): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Two legitimate activations of the SAME built App and tenant with distinct
 * `deployedAppId`s on ONE file-backed SQLite store. The foreign deployment id
 * sorts strictly before the observed one, so its K02 keys come first in the
 * physical key order and are numerous enough to consume a small case budget.
 */
async function createSharedDeploymentHarness(): Promise<SharedDeploymentHarness> {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t07-shared-deploy-'));
  const kPath = join(dir, 'k.sqlite');
  const { app, baselineSource } = await buildShadowApp();
  const fallbackPin = selectedFallbackPin(app, {
    selectedPackageId: FALLBACK_PACKAGE_ID,
    kind: 'Rule',
    id: 'rule:quote-approval',
  });
  const ownDeployment = { deployedAppId: OWN_DEPLOYMENT_ID, tenantId: TENANT, appId: app.appId };
  let raw = await openSqliteCasStore({ path: kPath });
  let keyReader = new Database(kPath, { readonly: true, fileMustExist: true });
  keyReader.pragma('query_only = ON');
  let reader = new Database(kPath, { readonly: true, fileMustExist: true });
  reader.pragma('query_only = ON');
  let store = new InstrumentedStore(raw, keyReader);
  let activation: Awaited<ReturnType<typeof activateV10App>> | null = null;
  const closeConnections = async (): Promise<void> => {
    keyReader.close();
    reader.close();
    await raw.close();
  };
  try {
    activation = await activateV10App(app, {
      store,
      tenantId: TENANT,
      deploymentIdentity: ownDeployment,
      now: () => BASE_MS,
    });
    const ownReceipt = await activation.facade.send({
      ...SEED_INTENT,
      instanceKey: 'instance:t07-own',
      messageId: 'msg:t07-own',
    });
    assert.equal(ownReceipt.status, 'admitted', `own deployment seed must be admitted: ${JSON.stringify(ownReceipt).slice(0, 400)}`);

    const foreign = await activateV10App(app, {
      store,
      tenantId: TENANT,
      deploymentIdentity: { ...ownDeployment, deployedAppId: FOREIGN_DEPLOYMENT_ID },
      now: () => BASE_MS,
    });
    try {
      const foreignReceipt = await foreign.facade.send({
        ...SEED_INTENT,
        instanceKey: 'instance:t07-foreign',
        messageId: 'msg:t07-foreign',
      });
      assert.equal(foreignReceipt.status, 'admitted', `foreign deployment seed must be admitted: ${JSON.stringify(foreignReceipt).slice(0, 400)}`);
    } finally {
      foreign.dispose();
    }

    // The expected prefix is derived HERE, independently of the code under
    // test, so an over-wide selector is observable rather than self-consistent.
    // #1217: governed K rows are addressed by the stable deployment tuple —
    // `v10/k/deployment:<deployedAppId>:<tenantId>:<appId>/` — never by the
    // BUILD subjectDigest. The two deployments therefore occupy two DISTINCT
    // outer namespaces on the shared store.
    const ownBase = `${SHADOW_K_DOCS_PREFIX}deployment:${encodeKComponent(OWN_DEPLOYMENT_ID)}:${encodeKComponent(TENANT)}:${encodeKComponent(app.appId)}/`;
    const foreignBase = `${SHADOW_K_DOCS_PREFIX}deployment:${encodeKComponent(FOREIGN_DEPLOYMENT_ID)}:${encodeKComponent(TENANT)}:${encodeKComponent(app.appId)}/`;
    const ownPrefix = `${ownBase}v010-k02:${encodeKComponent(OWN_DEPLOYMENT_ID)}:${encodeKComponent(TENANT)}:${encodeKComponent(app.appId)}:${encodeKComponent(BUSINESS_PACKAGE_ID)}:`;
    const allKeys = readRows(kPath).map((row) => row.key);
    const ownKeys = allKeys.filter((key) => key.startsWith(ownBase));
    const foreignKeys = allKeys.filter((key) => key.startsWith(foreignBase));
    assert.ok(ownKeys.length > 0, 'the own deployment must have written real K documents');
    assert.ok(foreignKeys.length > 0, 'the shared SQLite store must hold the foreign deployment\'s real K documents');

    let cleaned = false;
    return {
      dir,
      kPath,
      app,
      baselineSource,
      fallbackPin,
      ownPrefix,
      ownBase,
      foreignBase,
      get activation(): Awaited<ReturnType<typeof activateV10App>> {
        if (activation === null) throw new Error('shared deployment harness is not activated');
        return activation;
      },
      get store(): InstrumentedStore {
        return store;
      },
      rows: (): readonly SqliteRow[] => readRows(kPath),
      witness: (): unknown => physicalWitness(kPath, reader),
      restart: async (): Promise<void> => {
        const current = activation;
        if (current === null) throw new Error('shared deployment harness is not activated');
        current.dispose();
        await closeConnections();
        raw = await openSqliteCasStore({ path: kPath });
        keyReader = new Database(kPath, { readonly: true, fileMustExist: true });
        keyReader.pragma('query_only = ON');
        reader = new Database(kPath, { readonly: true, fileMustExist: true });
        reader.pragma('query_only = ON');
        store = new InstrumentedStore(raw, keyReader);
        const next = await activateV10App(app, {
          store,
          tenantId: TENANT,
          deploymentIdentity: ownDeployment,
          now: () => BASE_MS,
        });
        activation = next;
        const rebound = next.facade.selectedShadowBinding;
        assert.equal(rebound.deployedAppId, OWN_DEPLOYMENT_ID);
        assert.deepEqual([...rebound.k02DocumentPrefixes], [ownPrefix]);
        store.resetCounters();
      },
      cleanup: async (): Promise<void> => {
        if (cleaned) return;
        cleaned = true;
        try {
          activation?.dispose();
        } finally {
          await closeConnections();
          await rm(dir, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    activation?.dispose();
    await closeConnections();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

async function assertPhysicalZeroWrites(
  store: InstrumentedStore,
  kPath: string,
  beforeRows: readonly SqliteRow[],
  report: ShadowL4Report,
): Promise<void> {
  assert.equal(
    report.production.productionWritesVerifiedZero,
    true,
    `the physical witness must verify zero writes (failure: ${JSON.stringify(report.failure)})`,
  );
  assert.equal(report.production.snapshotUnchanged, true);
  assert.equal(report.production.physicalWitnessUnchanged, true);
  assert.equal(report.production.storeMutationMethodsUsed, 0);
  assert.equal(report.production.externalEffectCalls, 0);
  assert.equal(report.production.memoryWrites, 0);
  assert.equal(report.production.cacheWrites, 0);
  assert.ok(report.production.storeReads > 0, 'the runner must have read real selected K documents');
  assert.equal(store.putCalls, 0, 'production docs.put must never be called');
  assert.equal(store.removeCalls, 0, 'production docs.remove must never be called');
  assert.deepEqual(readRows(kPath), beforeRows, 'the physical v8_host_docs rows must be identical');
}

function assertOnlyOwnDeploymentObserved(
  report: ShadowL4Report,
  ownPrefix: string,
  ownKeys: readonly string[],
  limit: number,
): void {
  const expected = [...ownKeys].sort().slice(0, limit);
  assert.deepEqual([...report.observations.keys], expected, 'the bounded selection must be this deployment\'s keys, in physical order');
  assert.ok(report.observations.keys.every((key) => key.startsWith(ownPrefix)), 'every observation must sit under the exact deployment prefix');
  assert.equal(report.observations.total, ownKeys.length, 'the observation total must count ONLY this deployment\'s K rows');
  assert.equal(report.observations.considered, expected.length);
  assert.equal(report.observations.truncated, ownKeys.length > expected.length);
  assert.equal(report.deployedAppId, OWN_DEPLOYMENT_ID);
  assert.deepEqual([...report.observations.documentPrefixes], [ownPrefix]);
}

test('T07-PH-N11: a sibling deployment of the same BUILD/Tenant never enters the Shadow snapshot, even when its keys sort first and exceed the budget', async () => {
  const harness = await createSharedDeploymentHarness();
  try {
    // #1217: the sibling occupies its OWN outer deployment namespace on the
    // shared store. The falsifier still stands: enumerated broadly in physical
    // key order, every foreign key sorts before this deployment's first key.
    const baseKeys = harness.rows().map((row) => row.key).sort();
    const ownKeys = baseKeys.filter((key) => key.startsWith(harness.ownBase));
    const foreignKeys = baseKeys.filter((key) => key.startsWith(harness.foreignBase));
    assert.ok(foreignKeys.length >= 2, 'the foreign deployment must outnumber a maxCases=2 budget');
    assert.ok(
      foreignKeys[foreignKeys.length - 1] < ownKeys[0],
      'every foreign deployment key must sort before this deployment\'s first key (the falsifying order)',
    );

    harness.store.resetCounters();
    const beforeRows = harness.rows();
    const source = `// T07 deployment-isolation candidate.\n${harness.baselineSource}`;
    const pin = candidatePin(source, { revision: 'candidate:deployment-isolation' });
    const report = await runShadowWith({
      facade: harness.activation.facade,
      app: harness.app,
      store: { get: async (key: string) => await harness.store.get(key), keys: async () => await harness.store.keys() },
      witness: harness.witness,
      fallbackPin: harness.fallbackPin,
      source,
      pin,
      tenantId: TENANT,
      budget: { maxCases: 2, maxComparisons: 2 },
    });

    assert.equal(report.status, 'match');
    assertOnlyOwnDeploymentObserved(report, harness.ownPrefix, ownKeys, 2);
    assert.ok(
      report.observations.keys.every((key) => !foreignKeys.includes(key)),
      'no foreign deployment key may be observed or charged to the case budget',
    );
    const binding = harness.activation.facade.selectedShadowBinding;
    assert.equal(binding.deployedAppId, OWN_DEPLOYMENT_ID, 'the Host binding must name the activated deployment instance');
    assert.deepEqual([...binding.k02DocumentPrefixes], [harness.ownPrefix], 'the Host binding must report the exact deployed tuple');
    await assertPhysicalZeroWrites(harness.store, harness.kPath, beforeRows, report);
  } finally {
    await harness.cleanup();
  }
});

test('T07-PH-N12: deployment isolation and the replay digest survive a store/facade restart with zero writes', async () => {
  const harness = await createSharedDeploymentHarness();
  try {
    const source = `// T07 restart-isolation candidate.\n${harness.baselineSource}`;
    const pin = candidatePin(source, { revision: 'candidate:restart-isolation' });
    const surface = {
      app: harness.app,
      witness: harness.witness,
      fallbackPin: harness.fallbackPin,
      source,
      pin,
      tenantId: TENANT,
      budget: { maxCases: 2, maxComparisons: 2 },
    };
    const ownKeys = harness.rows()
      .map((row) => row.key)
      .filter((key) => key.startsWith(harness.ownPrefix))
      .sort();
    harness.store.resetCounters();
    const beforeRows = harness.rows();
    const first = await runShadowWith({
      ...surface,
      facade: harness.activation.facade,
      store: { get: async (key: string) => await harness.store.get(key), keys: async () => await harness.store.keys() },
    });
    assert.equal(first.status, 'match');
    assertOnlyOwnDeploymentObserved(first, harness.ownPrefix, ownKeys, 2);
    await assertPhysicalZeroWrites(harness.store, harness.kPath, beforeRows, first);

    await harness.restart();
    const afterRestartRows = harness.rows();
    assert.deepEqual(afterRestartRows, beforeRows, 'reopening the store and reactivating must not mutate any row');
    harness.store.resetCounters();
    const second = await runShadowWith({
      ...surface,
      facade: harness.activation.facade,
      store: { get: async (key: string) => await harness.store.get(key), keys: async () => await harness.store.keys() },
    });
    assert.equal(second.status, 'match');
    assertOnlyOwnDeploymentObserved(second, harness.ownPrefix, ownKeys, 2);
    assert.deepEqual([...second.observations.keys], [...first.observations.keys], 'the restart must observe the same physical keys');
    assert.equal(second.replayDigest, first.replayDigest, 'the replay digest must be identical after a restart');
    await assertPhysicalZeroWrites(harness.store, harness.kPath, beforeRows, second);
  } finally {
    await harness.cleanup();
  }
});

test('T07-PH-N13: an activation without a deployment binding refuses typed before any K read instead of widening unscoped', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t07-no-deployment-'));
  const kPath = join(dir, 'k.sqlite');
  const raw = await openSqliteCasStore({ path: kPath });
  const keyReader = new Database(kPath, { readonly: true, fileMustExist: true });
  keyReader.pragma('query_only = ON');
  const store = new InstrumentedStore(raw, keyReader);
  const { app, baselineSource } = await buildShadowApp();
  const activation = await activateV10App(app, { store, tenantId: TENANT, now: () => BASE_MS });
  try {
    const receipt = await activation.facade.send(SEED_INTENT);
    assert.equal(receipt.status, 'admitted', 'the unscoped legacy activation must still admit its seed turn');

    const base = `${SHADOW_K_DOCS_PREFIX}${app.subjectDigest}/${TENANT}/`;
    const beforeRows = readRows(kPath);
    assert.ok(
      beforeRows.some((row) => row.key.startsWith(base)),
      'the unscoped activation physically wrote K rows under the broad App/Tenant prefix',
    );
    store.resetCounters();
    const source = `// T07 missing-deployment-binding falsifier.\n${baselineSource}`;
    const fallbackPin = selectedFallbackPin(app, {
      selectedPackageId: FALLBACK_PACKAGE_ID,
      kind: 'Rule',
      id: 'rule:quote-approval',
    });
    await assert.rejects(
      runShadowWith({
        facade: activation.facade,
        app,
        store: { get: async (key: string) => await store.get(key), keys: async () => await store.keys() },
        witness: () => physicalWitness(kPath, new Database(kPath, { readonly: true, fileMustExist: true })),
        fallbackPin,
        source,
        pin: candidatePin(source, { revision: 'candidate:no-deployment' }),
        tenantId: TENANT,
        budget: { maxCases: 8, maxComparisons: 8 },
      }),
      shadowCode('SHADOW_DEPLOYMENT_BINDING_MISSING'),
    );
    const binding = activation.facade.selectedShadowBinding;
    assert.equal(binding.deployedAppId, null, 'a deployment-identity-less activation carries no deployment instance');
    assert.deepEqual([...binding.k02DocumentPrefixes], [], 'and therefore reports no exact K02 prefixes');
    assert.equal(store.keysCalls, 0, 'a missing deployment binding must refuse before listing K keys');
    assert.equal(store.getCalls, 0, 'a missing deployment binding must refuse before the first K read');
    assert.equal(store.putCalls, 0);
    assert.equal(store.removeCalls, 0);
    assert.deepEqual(readRows(kPath), beforeRows, 'the refusal must not mutate any row');
  } finally {
    activation.dispose();
    keyReader.close();
    await raw.close();
    await rm(dir, { recursive: true, force: true });
  }
});
