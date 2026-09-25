/**
 * T-023 Expo Android/Hermes v0.3 host validation batch (issue #241).
 *
 * Runs the REAL v0.3 stack on device: the 13 Expo expo-sqlite adapters
 * (generated/ from packages/domain-harness-expo/src/store), the vendored
 * portable core (@kaicreator/domain-harness dist, vendor/), and a pure-TS
 * SHA-256 host capability. No Node built-ins, no better-sqlite3, no Metro
 * mocks — the release APK embeds this exact bundle.
 *
 * Two phases, mirroring the T-004 force-stop protocol:
 *   phase 1 (fresh database): E1/E2/E10 build+contract gates, then durable
 *     writes — assembled-runtime turns (E8), governance pin/snapshot (E4),
 *     process data + command outcome + external-work deadline (E6), promoted
 *     registry + alias + child pin + semantic cache (E3), fail-closed
 *     conflict probes (E9) — ending RESTART_REQUIRED.
 *   phase 2 (after am force-stop + relaunch): reopen assertions — pins
 *     byte-identical, committed effect replayed without re-execution (E5),
 *     deadlines/process data intact (E6), registry/cache/pins intact (E3),
 *     migration meta still 3 (E10), conflicts still fail-closed (E9).
 */
import * as SQLite from 'expo-sqlite';
import {
  EXPO_RUNTIME_STORE_SCHEMA_VERSION,
  openExpoSqliteAuthorityStores,
  openExpoSqliteRuntimeStore,
  type ExpoSqliteAuthorityStores,
  type ExpoSqliteDatabaseLike,
  type ExpoSqliteModuleLike,
  type ExpoSqliteRuntimeStore,
} from './generated/src/store/index.js';
import {
  runExclusiveTransactionQueueUnitCheck,
  runRuntimeStoreConformance,
  type CloseableRuntimeStore,
} from './generated/tests/store/runtime-store-conformance.js';
import type {
  DomainMessage,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from './generated/src/store/runtime-store-types.js';
import {
  PromotedArtifactRegistry,
  StaticPackageRegistry,
  canonicalJsonStringify,
  createDomainRuntimeV3,
  createGovernanceBaselineBody,
  dynamicChildSlotKey,
  prepareExactSemanticInvocation,
  prepareSemanticCacheWrite,
  type AdmissionEffectToolBinding,
  type AdmissionEffectToolPort,
  type AdmissionEffectToolRequest,
  type CentralAdmissionRequest,
  type CreateDomainRuntimeV3AuthorityOptions,
  type DecisionResolverSource,
  type DomainWorkflowDefinition,
  type DomainWorkflowEffectIntent,
  type GovernanceBaselineAuthorityBinding,
  type GovernanceBaselineBody,
  type PromotedArtifactBody,
  type ResolvedDecision,
  type ToolEffectSemantics,
} from '@kaicreator/domain-harness';
import {
  STANDARD_CAPABILITIES,
  type JsonObject,
  type JsonValue,
  type RuntimeHostBindings,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';
import { T023_PACKAGE_ID } from './fixture-constants';
import { deviceSha256, sha256HexUtf8 } from './device-sha256';

declare const HermesInternal: unknown;

const MAIN_DB = 'domain-harness-t023-v3-host.db';
const CONFORMANCE_DB = 'domain-harness-t023-conformance.db';
const MIGRATION_DB = 'domain-harness-t023-migration.db';
const ARTIFACT_ID = 'subworkflow:quote-review';

const TARGET: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'instance:42' };
const WORKFLOW_INSTANCE_ID = 'order-quote:instance:42';
const NOW = '2026-09-21T07:00:00.000Z';

const EFFECT_RESERVE = {
  kind: 'tool',
  artifactId: 'effect:reserve',
  contentDigest: 'digest-effect:reserve',
} as const;

/** Deny any proposed event whose payload.amount exceeds 100. */
const CAP_INVARIANT = {
  invariantId: 'inv:cap-100',
  predicate: {
    op: 'not',
    predicate: {
      op: 'gt',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'literal', value: 100 },
    },
  },
} as const;

export interface T023ValidationResult {
  readonly status: 'PASS' | 'RESTART_REQUIRED';
  readonly phase: 1 | 2;
  readonly platform: 'expo-android-hermes';
  readonly hermes: boolean;
  readonly schemaVersion: number;
  readonly packageId: string;
  readonly checks: readonly string[];
  readonly details: Readonly<Record<string, JsonValue>>;
  readonly nextAction?: string;
}

function expoSqliteModule(): ExpoSqliteModuleLike {
  return {
    async openDatabaseAsync(databaseName: string): Promise<ExpoSqliteDatabaseLike> {
      return (await SQLite.openDatabaseAsync(databaseName)) as unknown as ExpoSqliteDatabaseLike;
    },
  };
}

function check(condition: boolean, label: string, checks: string[]): void {
  if (!condition) {
    throw new Error(`T-023 device check failed: ${label}`);
  }
  checks.push(label);
}

/* ------------------------------------------------------------------------ */
/* Fixture builders (byte-parity with the T-022 Node host fixture semantics) */
/* ------------------------------------------------------------------------ */

async function makeBaselineV(
  version: string,
  hardInvariants: readonly JsonValue[],
): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version,
      semantics: { hardInvariants: [...hardInvariants], operatorAuthority: version },
    },
    deviceSha256,
  );
}

const RESERVE_INTENT: DomainWorkflowEffectIntent = {
  effectType: 'effect:reserve',
  input: { reservation: 'quote', amount: 42 },
  idempotencyKey: 'reserve:quote:1',
};

function quoteEvent(amount: number): { readonly type: string; readonly payload: JsonObject } {
  return { type: 'QUOTE_DECIDED', payload: { amount } };
}

function makeDefinition(): DomainWorkflowDefinition {
  return {
    workflowKey: 'order-quote',
    initialState: 'review',
    initialContext: {},
    guards: [
      {
        guardId: 'guard:amount-ok',
        predicate: {
          op: 'lte',
          left: { source: 'event', path: ['payload', 'amount'] },
          right: { source: 'literal', value: 1000 },
        },
      },
    ],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'approved',
            guardId: 'guard:amount-ok',
            effectIntents: [RESERVE_INTENT],
          },
          {
            transitionKey: 'reject',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'rejected',
          },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
    ],
  };
}

function quoteDecision(amount: number): JsonValue {
  return {
    decision: { outcome: 'approve', data: { amount } },
    event: { type: 'QUOTE_DECIDED', payload: { amount } },
  };
}

const decisionSchema = {
  isValid(value: JsonValue): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const decision = record['decision'];
    const event = record['event'];
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
    return (
      typeof (decision as Record<string, unknown>)['outcome'] === 'string' &&
      typeof (event as Record<string, unknown>)['type'] === 'string'
    );
  },
};

function resolvedFrom(
  source: DecisionResolverSource,
  structuredDecision: JsonValue,
): ResolvedDecision<JsonValue> {
  return {
    source,
    structuredDecision,
    provenance: {},
    freshModelCallCount: source === 'harness-machine' ? 1 : 0,
    llmAvoided: source !== 'harness-machine',
    cacheDisposition: source === 'exact-cache' ? { read: 'hit' } : { read: 'disabled' },
    telemetry: [],
  };
}

function makeAdmissionRequest(
  overrides: Partial<CentralAdmissionRequest> = {},
): CentralAdmissionRequest {
  return {
    target: TARGET,
    turn: overrides.turn ?? { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: overrides.trigger ?? { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition: overrides.definition ?? makeDefinition(),
    currentStateKey: overrides.currentStateKey ?? 'review',
    context: overrides.context ?? {},
    event: overrides.event ?? quoteEvent(42),
    resolved: overrides.resolved ?? resolvedFrom('harness-machine', quoteDecision(42)),
    decisionSchema: overrides.decisionSchema ?? decisionSchema,
    now: NOW,
  };
}

class DeviceScriptedEffectTools implements AdmissionEffectToolPort {
  readonly calls: AdmissionEffectToolRequest[] = [];

  public constructor(
    private readonly bindings: Readonly<Record<string, ToolEffectSemantics>> = {
      'effect:reserve': 'non-idempotent',
    },
  ) {}

  public resolve(effectType: string): AdmissionEffectToolBinding | undefined {
    const semantics = this.bindings[effectType];
    if (semantics === undefined) return undefined;
    return { effectType, effectSemantics: semantics, toolArtifact: EFFECT_RESERVE };
  }

  public async execute(request: AdmissionEffectToolRequest): Promise<JsonValue> {
    this.calls.push(request);
    return { reserved: true, effectId: request.effectId };
  }
}

function deviceHostBindings(): RuntimeHostBindings {
  let randomIdCounter = 0;
  return {
    capabilities: [
      STANDARD_CAPABILITIES.cryptoHashSha256,
      STANDARD_CAPABILITIES.secureRandom,
      STANDARD_CAPABILITIES.expressionJsonata,
    ],
    sha256: deviceSha256,
    secureRandom: {
      randomId(): string {
        randomIdCounter += 1;
        return `device-random-${randomIdCounter}`;
      },
    },
    expression: {
      async evaluate(request: { input: JsonValue }): Promise<JsonValue> {
        return request.input;
      },
    },
  } as unknown as RuntimeHostBindings;
}

/** Manifest is byte-parity with build-device-fixture.mjs (packageId codegen). */
function bootablePackage(): TargetCompiledDomainPackage {
  const manifest: TargetCompiledDomainPackage['manifest'] = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'orders',
    domainVersion: '0.3.0-expo-host-test',
    packageId: T023_PACKAGE_ID,
    targetProfileId: 't023-expo-host@1',
    requiredCapabilities: [],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  return { manifest, bindings: {} };
}

/* ------------------------------------------------------------------------ */
/* Shared main-database fixture (one handle, one writer gate)                */
/* ------------------------------------------------------------------------ */

type HostAssembly = Awaited<ReturnType<typeof createDomainRuntimeV3>>;

interface MainFixture {
  readonly database: ExpoSqliteDatabaseLike;
  readonly store: ExpoSqliteRuntimeStore;
  readonly authorities: ExpoSqliteAuthorityStores;
  readonly assembly: HostAssembly;
  readonly tools: DeviceScriptedEffectTools;
  readonly b1: GovernanceBaselineBody;
  close(): Promise<void>;
}

async function openMainFixture(sqlite: ExpoSqliteModuleLike): Promise<MainFixture> {
  const database = await sqlite.openDatabaseAsync(MAIN_DB);
  const authorities = await openExpoSqliteAuthorityStores({ database });
  const store = await openExpoSqliteRuntimeStore({ database, writes: authorities.writes });
  const b1 = await makeBaselineV('B1', [CAP_INVARIANT as unknown as JsonValue]);
  const b2 = await makeBaselineV('B2', []);
  await authorities.baselines.putBody(b1);
  await authorities.baselines.putBody(b2);
  const tools = new DeviceScriptedEffectTools();
  const compiledPackage = bootablePackage();
  const v3: CreateDomainRuntimeV3AuthorityOptions = {
    baselines: authorities.baselines,
    activationAuthority: authorities.activation,
    exactPackageCdi: authorities.exactPackageCdi,
    durableExecution: store,
    effectJournal: authorities.admissionEffectJournal,
    effectTools: tools,
    evidence: authorities.evidence,
  };
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store,
    bindings: deviceHostBindings(),
    v3,
  });
  let closed = false;
  return {
    database,
    store,
    authorities,
    assembly,
    tools,
    b1,
    async close() {
      if (closed) return;
      closed = true;
      await store.close();
      await authorities.close();
      await database.closeAsync?.();
    },
  };
}

async function pinMainInstance(fixture: MainFixture): Promise<void> {
  await fixture.assembly.governance.pinExecution({
    workflowTarget: TARGET.workflowId,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 'orders',
      packageId: T023_PACKAGE_ID,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    },
  });
}

/* ------------------------------------------------------------------------ */
/* E1 / E2 / E10 build-and-contract gates                                    */
/* ------------------------------------------------------------------------ */

async function runSha256KnownAnswers(checks: string[]): Promise<void> {
  check(
    sha256HexUtf8('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'E1 sha256-empty-KAT',
    checks,
  );
  check(
    sha256HexUtf8('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'E1 sha256-abc-KAT',
    checks,
  );
  check(
    sha256HexUtf8('The quick brown fox jumps over the lazy dog') ===
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    'E1 sha256-fox-KAT',
    checks,
  );
  // UTF-8 multibyte path (parity vector computed by Node crypto at review time).
  check(
    (await deviceSha256.digestUtf8('héllo→世界')) === sha256HexUtf8('héllo→世界'),
    'E1 sha256-utf8-self-consistency',
    checks,
  );
}

async function readSchemaVersion(
  sqlite: ExpoSqliteModuleLike,
  databaseName: string,
): Promise<number> {
  const database = await sqlite.openDatabaseAsync(databaseName);
  try {
    const row = await database.getFirstAsync<{ schema_version: number }>(
      'SELECT schema_version FROM dh_v2_store_meta WHERE singleton_id = 1',
      [],
    );
    return row === null ? -1 : row.schema_version;
  } finally {
    await database.closeAsync?.();
  }
}

async function runMigrationUpgradeCheck(
  sqlite: ExpoSqliteModuleLike,
  checks: string[],
): Promise<void> {
  // Fabricate a v1-era physical store: meta row at version 1 plus one live
  // dh_v2 instance row. Opening the T-023 store must upgrade in place to 3
  // and preserve the v1-era row (E10).
  const database = await sqlite.openDatabaseAsync(MIGRATION_DB);
  await database.execAsync(`
CREATE TABLE IF NOT EXISTS dh_v2_store_meta (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  schema_version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dh_v2_instances (
  internal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  instance_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (
    lifecycle IN ('active', 'waiting', 'recovery_required', 'completed', 'failed', 'cancelled', 'terminated')
  ),
  state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
  workflow_state_json TEXT NOT NULL,
  output_json TEXT,
  failure_json TEXT,
  next_target_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_target_sequence >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workflow_id, instance_key)
);
INSERT INTO dh_v2_store_meta(singleton_id, schema_version) VALUES(1, 1);
INSERT INTO dh_v2_instances(
  workflow_id, instance_key, correlation_id, package_id, lifecycle,
  state_revision, workflow_state_json, output_json, failure_json,
  next_target_sequence, created_at, updated_at
) VALUES(
  'order-quote', 'v1-era', 'corr-v1-era', 'pkg-v1-era', 'active',
  0, '{"step":0}', NULL, NULL, 1, '${NOW}', '${NOW}'
);
`);
  const store = await openExpoSqliteRuntimeStore({ database });
  try {
    const version = await readSchemaVersion(sqlite, MIGRATION_DB);
    check(version === EXPO_RUNTIME_STORE_SCHEMA_VERSION, 'E10 migration-v1-to-v3-meta', checks);
    const preserved = await store.getInstance({ workflowId: 'order-quote', instanceKey: 'v1-era' });
    check(
      preserved !== null && preserved.packageId === 'pkg-v1-era' && preserved.correlationId === 'corr-v1-era',
      'E10 migration-v1-data-preserved',
      checks,
    );
    const tables = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'dh_v3_%'`,
      [],
    );
    check(tables !== null && tables.count === 26, 'E10 migration-v3-26-authority-tables', checks);
    const observationTables = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('dh_v3_observation_streams', 'dh_v3_observation_records')`,
      [],
    );
    check(
      observationTables !== null && observationTables.count === 2,
      'E10 migration-v3-observation-tables-present',
      checks,
    );
  } finally {
    await store.close();
    await database.closeAsync?.();
  }
}

/* ------------------------------------------------------------------------ */
/* Phase 1                                                                   */
/* ------------------------------------------------------------------------ */

async function runPhase1(sqlite: ExpoSqliteModuleLike): Promise<T023ValidationResult> {
  const checks: string[] = [];
  const details: Record<string, JsonValue> = {};

  // E1: portable core + pure-TS sha256 on Hermes (static bundle gate ran at
  // build time; these are the runtime anchors).
  await runSha256KnownAnswers(checks);
  check(typeof HermesInternal === 'object', 'E1 hermes-engine-live', checks);

  // E10: fresh migrate lands at meta version 3; v1→v3 in-place upgrade works.
  await runMigrationUpgradeCheck(sqlite, checks);

  // E2: the full v0.2 RuntimeStore conformance checklist on Hermes, on the
  // same adapter the v0.3 seams extend (logical contract matches Node host).
  await runExclusiveTransactionQueueUnitCheck();
  checks.push('E2 exclusive-transaction-queue-unit');
  const conformance = await runRuntimeStoreConformance({
    async open(): Promise<CloseableRuntimeStore> {
      return openExpoSqliteRuntimeStore({ sqlite, databaseName: CONFORMANCE_DB });
    },
    async reopen(store: CloseableRuntimeStore): Promise<CloseableRuntimeStore> {
      await store.close();
      return openExpoSqliteRuntimeStore({ sqlite, databaseName: CONFORMANCE_DB });
    },
  });
  check(conformance.restartPersistence === true, 'E2 runtime-store-conformance', checks);
  details['conformanceChecks'] = conformance.checks.length;
  details['conformanceConcurrentAcceptance'] = conformance.concurrentAcceptanceCount;

  // Main assembled fixture: 13 adapters on one physical database, one queue.
  const fixture = await openMainFixture(sqlite);
  try {
    const version = await readSchemaVersion(sqlite, MAIN_DB);
    check(version === EXPO_RUNTIME_STORE_SCHEMA_VERSION, 'E10 main-db-schema-v3', checks);

    // E4 (write half): governance execution pin + bound snapshot.
    await pinMainInstance(fixture);
    const pinned = await fixture.assembly.governance.requirePinnedExecution(WORKFLOW_INSTANCE_ID);
    check(pinned !== undefined && pinned !== null, 'E4 governance-pin-execution', checks);

    // E8/E5 (write half): two admitted turns through the assembled runtime.
    const first = await fixture.assembly.admitTurn(makeAdmissionRequest());
    if (first.status !== 'admitted') throw new Error('T-023: first turn not admitted');
    check(first.admitted.effects[0]?.disposition === 'executed', 'E8 turn1-effect-executed', checks);
    check(fixture.tools.calls.length === 1, 'E8 turn1-tool-ran-once', checks);
    const second = await fixture.assembly.admitTurn(
      makeAdmissionRequest({ turn: { kind: 'message', sourceMessageId: 'msg:2' } }),
    );
    if (second.status !== 'admitted') throw new Error('T-023: second turn not admitted');
    check(fixture.tools.calls.length === 2, 'E8 turn2-tool-ran', checks);
    const journal = await fixture.authorities.admissionEffectJournal.getRecords();
    check(
      journal.length === 2 &&
        journal[0]?.status === 'completed' &&
        journal[1]?.status === 'completed' &&
        (journal[0]?.effectId ?? '') < (journal[1]?.effectId ?? ''),
      'E5 journal-two-completed-ordered',
      checks,
    );
    const evidence = await fixture.authorities.evidence.records();
    check(
      evidence.length === 2 && evidence.every((record) => record.sourceKind === 'decision'),
      'E8 decision-evidence-appended',
      checks,
    );

    // E4 (snapshot half): persist the bound snapshot through the governance
    // surface (pinExecution itself does not snapshot; persistSnapshot is the
    // digest-guarded seam) and record canonical bytes for the phase-2
    // cross-force-stop comparison in the evidence log.
    await fixture.assembly.governance.persistSnapshot({
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      governanceBindingDigest: pinned.bindingDigest,
      snapshot: { marker: 't023-bound-snapshot', packageId: T023_PACKAGE_ID },
    });
    const boundSnapshot = await fixture.store.getGovernanceBoundSnapshot(WORKFLOW_INSTANCE_ID);
    check(boundSnapshot !== undefined && boundSnapshot !== null, 'E4 bound-snapshot-persisted', checks);
    details['pinCanonical'] = canonicalJsonStringify(
      await fixture.store.getGovernanceExecutionPin(WORKFLOW_INSTANCE_ID),
    );
    details['snapshotCanonical'] = canonicalJsonStringify(boundSnapshot);

    // E6 (write half): process data + command outcome + external-work
    // deadline through the T-009/T-010 seams on the same durability domain.
    const e6Target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'e6-command' };
    const e6Snapshot: WorkflowInstanceSnapshot = {
      address: e6Target,
      correlationId: 'corr-e6',
      packageId: T023_PACKAGE_ID,
      lifecycle: 'active',
      stateRevision: 0,
      state: { step: 0 },
      createdAt: NOW,
      updatedAt: NOW,
    };
    await fixture.store.createInstance(e6Snapshot);
    const e6Message: DomainMessage = {
      messageId: 'cmd-e6-1',
      target: e6Target,
      type: 'command',
      payload: { approve: true },
    };
    const e6Ack = await fixture.store.acceptMessage(e6Message);
    check(
      await fixture.store.markMessageProcessing(e6Target, 'cmd-e6-1', NOW),
      'E6 message-processing',
      checks,
    );
    await fixture.store.commitProcessedCommandTurn({
      target: e6Target,
      messageId: 'cmd-e6-1',
      expectedTargetSequence: e6Ack.targetSequence,
      expectedStateRevision: 0,
      nextStateRevision: 1,
      nextState: { step: 1 },
      nextProcessData: { cursor: 'e6-cursor', attempt: 1 },
      nextLifecycle: 'active',
      outcome: {
        status: 'applied',
        messageId: 'cmd-e6-1',
        target: e6Target,
        targetSequence: e6Ack.targetSequence,
        packageId: T023_PACKAGE_ID,
        correlationId: 'corr-e6',
        acceptedAt: NOW,
        resolvedAt: NOW,
        result: { approved: true },
      },
      updatedAt: NOW,
    });
    const processData = await fixture.store.getProcessData(e6Target);
    check(
      processData !== null && canonicalJsonStringify(processData.data) === '{"attempt":1,"cursor":"e6-cursor"}',
      'E6 process-data-written',
      checks,
    );
    const outcome = await fixture.store.getCommandOutcome(e6Target, 'cmd-e6-1');
    check(outcome !== null && outcome.status === 'applied', 'E6 command-outcome-written', checks);
    const external = await fixture.store.ensureExternalWorkCorrelation({
      externalCorrelationId: 'ext-e6-1',
      target: e6Target,
      deadlineTimerId: 'timer-e6-1',
      dueAt: '2026-09-22T00:00:00.000Z',
      registeredAt: NOW,
    });
    check(external.disposition === 'created', 'E6 external-work-registered', checks);
    const due = await fixture.store.listDueExternalWorkCorrelations('2026-09-22T01:00:00.000Z');
    check(due.length === 1 && due[0]?.deadlineTimerId === 'timer-e6-1', 'E6 deadline-listed', checks);

    // E4 (package pin half): the live instance pins the compiled package.
    const packagePins = await fixture.store.listPinnedPackageIds();
    check(packagePins.includes(T023_PACKAGE_ID), 'E4 package-pinned-by-live-instance', checks);

    // E3 (write half): promoted registry + alias + child pin + semantic cache.
    const registry = new PromotedArtifactRegistry(fixture.authorities.promotedArtifacts, deviceSha256);
    const promotedAuthority: GovernanceBaselineAuthorityBinding = {
      domainId: 'orders',
      packageId: T023_PACKAGE_ID,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    };
    const promoteVersion = async (version: string, marker: string): Promise<PromotedArtifactBody> => {
      const material = {
        schemaVersion: 'candidate-envelope-v1',
        candidateKind: 'workflow',
        candidateId: 'candidate:quote-review',
        marker,
      } as unknown as JsonValue;
      const result = await registry.promote({
        artifactId: ARTIFACT_ID,
        version,
        validation: {
          ok: true,
          identity: {
            candidateKind: 'workflow',
            candidateId: 'candidate:quote-review',
            candidateContentDigest: await deviceSha256.digestUtf8(canonicalJsonStringify(material)),
            validatorContractVersion: 'candidate-validator-v1',
            governanceBaseline: { ...promotedAuthority.governanceBaseline },
          },
          grantsExecutionPermission: false,
        },
        authorityBinding: promotedAuthority,
        semanticMaterial: material,
        promotion: {
          recordId: `promotion:${ARTIFACT_ID}:${version}`,
          authorityRef: `audit://promotion/${version}`,
          recordedAt: NOW,
        },
      });
      return result.body;
    };
    const v1 = await promoteVersion('1.0.0', 'quote');
    await registry.bindAlias({ artifactId: ARTIFACT_ID, alias: 'stable', artifact: v1.identity, expectedRevision: 0 });
    const v2 = await promoteVersion('1.1.0', 'quote2');
    await registry.bindAlias({ artifactId: ARTIFACT_ID, alias: 'stable', artifact: v2.identity, expectedRevision: 1 });
    const selected = await registry.selectAlias({
      artifactId: ARTIFACT_ID,
      alias: 'stable',
      expectedRevision: 2,
      expectedAuthority: promotedAuthority,
    });
    check(
      selected.body.identity.contentDigest === v2.identity.contentDigest,
      'E3 alias-selects-v2',
      checks,
    );
    const recovered = await registry.recoverExact(v1.identity, promotedAuthority);
    check(
      recovered.body.identity.contentDigest === v1.identity.contentDigest,
      'E3 recoverExact-v1',
      checks,
    );

    const slot = {
      target: TARGET,
      parentActorId: 'decision:quote',
      childActorId: 'child:quote-review:1',
      invocationOrdinal: 1,
    };
    const slotKey = dynamicChildSlotKey(slot);
    const childPin = {
      slot,
      invokingPackageId: T023_PACKAGE_ID,
      invokingAuthority: {
        domainId: 'orders',
        packageId: T023_PACKAGE_ID,
        domainIntelligenceContentDigest: 'cdi-orders-b1',
        governanceBaseline: fixture.b1.identity,
      },
      artifact: v1.identity,
      pinnedAt: NOW,
    };
    check(
      (await fixture.authorities.dynamicChildPins.insertOnce(slotKey, childPin)) === 'inserted',
      'E3 child-pin-inserted',
      checks,
    );

    const invocation = await prepareExactSemanticInvocation(
      {
        namespace: 't023-device',
        domainId: 'orders',
        decisionId: 'decision:quote',
        selectedInput: { amount: 42 },
        dependencies: {
          artifacts: [
            { kind: 'workflow', artifactId: 'workflow:order-quote', contentDigest: T023_PACKAGE_ID },
          ],
          projections: [],
          revisions: [],
        },
        cachePolicy: { mode: 'eligible' },
      },
      deviceSha256,
    );
    if (invocation.cacheEligibility.mode !== 'eligible' || invocation.semanticIdentity === undefined) {
      throw new Error('T-023: cache invocation not eligible');
    }
    const preparedWrite = await prepareSemanticCacheWrite(
      invocation,
      { quote: 'approve' },
      { kind: 'workflow', artifactId: 'workflow:order-quote', contentDigest: T023_PACKAGE_ID },
      {
        artifacts: [
          { kind: 'workflow', artifactId: 'workflow:order-quote', contentDigest: T023_PACKAGE_ID },
        ],
        projections: [],
        revisions: [],
      },
      1_000,
      deviceSha256,
    );
    if (!preparedWrite.eligible) throw new Error('T-023: cache write not eligible: ' + preparedWrite.reason);
    const put = await fixture.authorities.semanticCache.putIfAbsent(preparedWrite.entry, 1_000);
    check(put.status === 'inserted', 'E3 cache-entry-inserted', checks);
    const cacheRead = await fixture.authorities.semanticCache.read(invocation.semanticIdentity.key, 1_000);
    check(cacheRead.status === 'hit', 'E3 cache-read-hit', checks);

    // E9: fail-closed conflict probes (same codes as the Node host).
    const pinAgain = await fixture.store.bindGovernanceExecutionPin({
      workflowTarget: TARGET.workflowId,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      bindingDigest: 'different-binding-digest',
      domainId: 'orders',
      packageId: T023_PACKAGE_ID,
      domainIntelligenceContentDigest: 'cdi-orders-b2',
      governanceBaseline: { ...fixture.b1.identity, version: 'B2', contentDigest: 'different' },
    });
    check(pinAgain === 'conflict', 'E9 pin-conflict-never-overwrites', checks);

    const probeEvidence = {
      evidenceId: 'ev:t023:probe:0',
      truthClass: 'runtime-evidence',
      executionAuthority: 'none',
      domainId: 'orders',
      sourceKind: 'metric',
      durability: 'durable-audit',
      provenance: {
        packageId: T023_PACKAGE_ID,
        governanceBaseline: {
          domainId: 'orders',
          governanceId: 'orders-governance',
          schemaVersion: fixture.b1.identity.schemaVersion,
          contentDigest: fixture.b1.identity.contentDigest,
        },
      },
      payload: { probe: 1 },
    } as const;
    await fixture.authorities.evidence.append(probeEvidence as never);
    let evidenceConflictCode = 'none';
    try {
      await fixture.authorities.evidence.append({
        ...probeEvidence,
        payload: { probe: 2 },
      } as never);
    } catch (error) {
      evidenceConflictCode = (error as { code?: string }).code ?? 'missing-code';
    }
    check(
      evidenceConflictCode === 'RUNTIME_EVIDENCE_APPEND_CONFLICT',
      'E9 evidence-append-conflict',
      checks,
    );

    const effectProbe = {
      effectId: `${first.admitted.durableControlTurnId}/effect/0`,
      target: TARGET,
      durableControlTurnId: first.admitted.durableControlTurnId,
      operationOrdinal: 0,
      effectType: 'effect:reserve',
      effectSemantics: 'non-idempotent',
      status: 'started',
      attempt: 1,
      input: { reservation: 'DIFFERENT', amount: 43 },
      idempotencyKey: 'reserve:quote:1',
      startedAt: NOW,
    } as const;
    let effectConflictCode = 'none';
    try {
      await fixture.authorities.admissionEffectJournal.beginEffect(effectProbe as never);
    } catch (error) {
      effectConflictCode = (error as { code?: string }).code ?? 'missing-code';
    }
    check(
      effectConflictCode === 'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      'E9 effect-journal-identity-conflict',
      checks,
    );

    let staleAliasCode = 'none';
    try {
      await registry.bindAlias({
        artifactId: ARTIFACT_ID,
        alias: 'stable',
        artifact: v1.identity,
        expectedRevision: 0,
      });
    } catch (error) {
      staleAliasCode = (error as { code?: string }).code ?? 'missing-code';
    }
    check(staleAliasCode === 'PROMOTED_ARTIFACT_STALE_SELECTION', 'E9 alias-stale-revision', checks);

    const cacheReplay = await fixture.authorities.semanticCache.putIfAbsent(
      { ...preparedWrite.entry, result: { quote: 'reject' }, resultDigest: 'different' },
      1_000,
    );
    check(
      cacheReplay.status === 'existing' &&
        canonicalJsonStringify(cacheReplay.entry.result) === canonicalJsonStringify({ quote: 'approve' }),
      'E9 cache-first-writer-wins',
      checks,
    );

    details['turnIds'] = [
      first.admitted.durableControlTurnId,
      second.admitted.durableControlTurnId,
    ] as unknown as JsonValue;
    details['v1Digest'] = v1.identity.contentDigest;
    details['v2Digest'] = v2.identity.contentDigest;

    return {
      status: 'RESTART_REQUIRED',
      phase: 1,
      platform: 'expo-android-hermes',
      hermes: typeof HermesInternal === 'object',
      schemaVersion: version,
      packageId: T023_PACKAGE_ID,
      checks,
      details,
      nextAction:
        'adb shell am force-stop com.kaicreator.domainharness.t023v3host, relaunch, and capture the phase-2 DOMAIN_HARNESS_T023_VALIDATION line.',
    };
  } finally {
    await fixture.close();
  }
}

/* ------------------------------------------------------------------------ */
/* Phase 2 (after am force-stop + relaunch)                                  */
/* ------------------------------------------------------------------------ */

async function runPhase2(sqlite: ExpoSqliteModuleLike): Promise<T023ValidationResult> {
  const checks: string[] = [];
  const details: Record<string, JsonValue> = {};
  await runSha256KnownAnswers(checks);

  const fixture = await openMainFixture(sqlite);
  try {
    const version = await readSchemaVersion(sqlite, MAIN_DB);
    check(version === EXPO_RUNTIME_STORE_SCHEMA_VERSION, 'E10 meta-still-v3-after-restart', checks);

    // E4: package + governance + snapshot survive the process kill.
    const pinned = await fixture.assembly.governance.requirePinnedExecution(WORKFLOW_INSTANCE_ID);
    check(pinned !== undefined && pinned !== null, 'E4 pin-survives-force-stop', checks);
    const boundSnapshot = await fixture.store.getGovernanceBoundSnapshot(WORKFLOW_INSTANCE_ID);
    check(
      boundSnapshot !== undefined &&
        boundSnapshot !== null &&
        (boundSnapshot as { governanceBindingDigest?: string }).governanceBindingDigest ===
          (pinned as { bindingDigest?: string }).bindingDigest,
      'E4 snapshot-survives-force-stop',
      checks,
    );
    details['pinCanonical'] = canonicalJsonStringify(
      await fixture.store.getGovernanceExecutionPin(WORKFLOW_INSTANCE_ID),
    );
    details['snapshotCanonical'] = canonicalJsonStringify(boundSnapshot);
    const packagePins = await fixture.store.listPinnedPackageIds();
    check(packagePins.includes(T023_PACKAGE_ID), 'E4 package-pin-survives', checks);
    const childPin = await fixture.authorities.dynamicChildPins.get(
      dynamicChildSlotKey({
        target: TARGET,
        parentActorId: 'decision:quote',
        childActorId: 'child:quote-review:1',
        invocationOrdinal: 1,
      }),
    );
    check(
      childPin !== undefined && childPin.invokingPackageId === T023_PACKAGE_ID,
      'E4 child-pin-survives',
      checks,
    );

    // E5: the committed phase-1 effect is replayed from the journal; the
    // tool port is a fresh instance (new process) and must never run.
    const journalBefore = await fixture.authorities.admissionEffectJournal.getRecords();
    check(
      journalBefore.length === 2 && journalBefore.every((record) => record.status === 'completed'),
      'E5 journal-intact-after-restart',
      checks,
    );
    const replayed = await fixture.assembly.admitTurn(makeAdmissionRequest());
    if (replayed.status !== 'admitted') throw new Error('T-023: replay turn not admitted');
    check(replayed.admitted.effects[0]?.disposition === 'replayed', 'E5 effect-replayed', checks);
    check(fixture.tools.calls.length === 0, 'E5 tool-never-reran', checks);
    const replayedAgain = await fixture.assembly.admitTurn(makeAdmissionRequest());
    if (replayedAgain.status !== 'admitted') throw new Error('T-023: second replay not admitted');
    check(
      replayedAgain.admitted.effects[0]?.disposition === 'replayed' && fixture.tools.calls.length === 0,
      'E5 replay-idempotent',
      checks,
    );
    const journalAfter = await fixture.authorities.admissionEffectJournal.getRecords();
    check(journalAfter.length === 2, 'E5 no-duplicate-journal-record', checks);
    const evidence = await fixture.authorities.evidence.records();
    check(evidence.length === 3, 'E5 evidence-append-only', checks);

    // E6: process data / command outcome / deadline survive; CAS settles once.
    const e6Target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'e6-command' };
    const processData = await fixture.store.getProcessData(e6Target);
    check(
      processData !== null && canonicalJsonStringify(processData.data) === '{"attempt":1,"cursor":"e6-cursor"}',
      'E6 process-data-survives',
      checks,
    );
    const outcome = await fixture.store.getCommandOutcome(e6Target, 'cmd-e6-1');
    check(outcome !== null && outcome.status === 'applied', 'E6 outcome-survives', checks);
    const due = await fixture.store.listDueExternalWorkCorrelations('2026-09-22T01:00:00.000Z');
    check(due.length === 1 && due[0]?.revision === 0, 'E6 deadline-survives', checks);
    const settled = await fixture.store.compareAndSetExternalWorkCorrelation({
      externalCorrelationId: 'ext-e6-1',
      expectedRevision: 0,
      next: {
        ...due[0]!,
        status: 'callback_received',
        revision: 1,
        updatedAt: NOW,
        terminalSource: {
          kind: 'external_callback',
          durableControlTurnId: 'turn-e6-callback',
          target: e6Target,
          externalCorrelationId: 'ext-e6-1',
          callbackOrdinal: 1,
          payload: { approved: true },
          observedAt: NOW,
        },
      },
    });
    check(settled === true, 'E6 cas-settles-once', checks);
    const settledAgain = await fixture.store.compareAndSetExternalWorkCorrelation({
      externalCorrelationId: 'ext-e6-1',
      expectedRevision: 0,
      next: {
        ...due[0]!,
        status: 'timed_out',
        revision: 1,
        updatedAt: NOW,
        terminalSource: {
          kind: 'deadline',
          durableControlTurnId: 'turn-e6-deadline',
          target: e6Target,
          externalCorrelationId: 'ext-e6-1',
          timerId: 'timer-e6-1',
          fireOrdinal: 1,
          observedAt: NOW,
        },
      },
    });
    check(settledAgain === false, 'E6 cas-stale-rejected', checks);

    // E3: registry / cache / alias survive with exact digests.
    const registry = new PromotedArtifactRegistry(fixture.authorities.promotedArtifacts, deviceSha256);
    const promotedAuthority: GovernanceBaselineAuthorityBinding = {
      domainId: 'orders',
      packageId: T023_PACKAGE_ID,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    };
    const selected = await registry.selectAlias({
      artifactId: ARTIFACT_ID,
      alias: 'stable',
      expectedRevision: 2,
      expectedAuthority: promotedAuthority,
    });
    check(selected.body.identity.contentDigest.length === 64, 'E3 alias-survives', checks);
    const recovered = await registry.recoverExact(childPin!.artifact, promotedAuthority);
    check(
      recovered.body.identity.contentDigest === childPin!.artifact.contentDigest,
      'E3 pinned-digest-recoverable',
      checks,
    );
    const invocation = await prepareExactSemanticInvocation(
      {
        namespace: 't023-device',
        domainId: 'orders',
        decisionId: 'decision:quote',
        selectedInput: { amount: 42 },
        dependencies: {
          artifacts: [
            { kind: 'workflow', artifactId: 'workflow:order-quote', contentDigest: T023_PACKAGE_ID },
          ],
          projections: [],
          revisions: [],
        },
        cachePolicy: { mode: 'eligible' },
      },
      deviceSha256,
    );
    const cacheRead = await fixture.authorities.semanticCache.read(
      invocation.semanticIdentity!.key,
      1_000,
    );
    check(
      cacheRead.status === 'hit' &&
        canonicalJsonStringify(cacheRead.entry.result) === canonicalJsonStringify({ quote: 'approve' }),
      'E3 cache-hit-after-restart',
      checks,
    );

    // E9: still fail-closed after the restart.
    const pinAgain = await fixture.store.bindGovernanceExecutionPin({
      workflowTarget: TARGET.workflowId,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      bindingDigest: 'yet-another-digest',
      domainId: 'orders',
      packageId: T023_PACKAGE_ID,
      domainIntelligenceContentDigest: 'cdi-orders-b2',
      governanceBaseline: { ...fixture.b1.identity, version: 'B2', contentDigest: 'different' },
    });
    check(pinAgain === 'conflict', 'E9 pin-conflict-after-restart', checks);

    details['selectedDigest'] = selected.body.identity.contentDigest;
    return {
      status: 'PASS',
      phase: 2,
      platform: 'expo-android-hermes',
      hermes: typeof HermesInternal === 'object',
      schemaVersion: version,
      packageId: T023_PACKAGE_ID,
      checks,
      details,
    };
  } finally {
    await fixture.close();
  }
}

/* ------------------------------------------------------------------------ */

export async function runExpoV3HostValidation(): Promise<T023ValidationResult> {
  const sqlite = expoSqliteModule();
  // Phase detection: the governance execution pin is the durable sentinel —
  // it is written only at the end of a complete phase-1 fixture setup... but
  // any existing pin means phase 1 committed its durable writes already.
  const probe = await sqlite.openDatabaseAsync(MAIN_DB);
  let phase: 1 | 2 = 1;
  try {
    const row = await probe.getFirstAsync<{ workflow_instance_id: string }>(
      `SELECT workflow_instance_id FROM dh_v3_governance_execution_pins WHERE workflow_instance_id = ?`,
      [WORKFLOW_INSTANCE_ID],
    );
    if (row !== null) phase = 2;
  } catch {
    phase = 1;
  } finally {
    await probe.closeAsync?.();
  }
  return phase === 1 ? runPhase1(sqlite) : runPhase2(sqlite);
}
