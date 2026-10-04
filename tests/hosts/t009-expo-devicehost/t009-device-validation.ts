/**
 * T009 (issue #595) v0.6 Expo/Android/Hermes REAL-device validation runner.
 *
 * Everything runs against the real stack on device: the REAL expo-sqlite
 * runtime store + authority adapters (packages/domain-harness-expo generated/
 * — single-file deployment sharing one ExclusiveTransactionQueue), the
 * vendored portable core dist (byte-identical to the v0.6 base build), a
 * publicly compiled successor package carrying the T009 semantic-decision
 * declarations, a pure-TS SHA-256 host capability and the real Hermes engine.
 * No Metro mocks, no Node stubs, no volatile stand-ins for durable ports.
 *
 * The 9 journeys of #595, in two launches joined by a REAL `am force-stop`
 * process kill (no JS cleanup between the phase-1 durable writes and the
 * phase-2 recovery oracles):
 *
 *   launch 1  stage=phase1
 *     PLATFORM  Hermes engine live + sha256 known-answer + native sqlite
 *     J1        compiled package accepted + executed end-to-end through
 *               resolveAndAdmitTurn on the device expo-sqlite store
 *     J2        Rule / Exact Reuse / non-model Promoted paths, zero model
 *     J3        fresh semantic path through an in-app host-supplied model port
 *     J4        declared semantic-unavailable, no model: fail-closed typed
 *               terminal + declared-event admission (+ denial finality)
 *     J5        resolver result through Admission guard/hard-invariant authority
 *     J7        A8 duplicate replay + incompatible messageId collision
 *               fail-closed on the device store
 *     J8        A9 invalid revision pair rejected without partial commit
 *     then arms the force-stop barrier T009-RELAUNCH (durable phase-1 facts:
 *     full decision-receipt stream, observation totals, command outcomes,
 *     instance revisions, effect/journal counts)
 *   launch 2  stage=phase2-armed  (fresh Hermes process, same store files)
 *     J6        receipt/observation durability + correlation read-back across
 *               the force-stop/relaunch boundary
 *     J9        FORCE-STOP / RELAUNCH recovery: replaying the processed
 *               command produces no duplicate decision, no duplicate effect,
 *               no duplicate state mutation, no duplicate receipt
 *     aggregates every case result and emits the terminal result.
 */
import * as SQLite from 'expo-sqlite';
import {
  canonicalJsonStringify,
  createDomainRuntimeV3,
  deriveDurableControlTurnId,
  DomainRuntimeV3Error,
  DecisionResolverError,
  StaticPackageRegistry,
  type DomainIntelligencePackageIdentity,
  computeCompiledPackageId,
  createRegistryPromotedChildArtifactPort,
  createXStateHarnessMachineRunner,
  PromotedArtifactRegistry,
  RuntimeObservationError,
  RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  runtimeObservationId,
  runtimeObservationStreamKey,
  runtimePackageIdentityFromManifest,
  assertValidDecisionResolutionReceipt,
  prepareProcessedCommandTurn,
  type DecisionResolutionReceipt,
  type DomainMessage,
  type JsonValue,
  type MessageAcceptedAck,
  type RuntimeObservationRecord,
  type RuntimeObservationStreamRef,
  type ResolveAndAdmitTurnRequest,
  type WorkflowAddress,
  type WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness';
import {
  EXPO_RUNTIME_STORE_SCHEMA_VERSION,
  ExclusiveTransactionQueue,
  openExpoSqliteAuthorityStores,
  openExpoSqliteRuntimeStore,
  type ExpoSqliteDatabaseLike,
  type ExpoSqliteModuleLike,
} from './generated/src/store/index.js';
import {
  allAvailableArtifacts,
  CMD_TARGET,
  CMD_WORKFLOW_INSTANCE_ID,
  CapturingRule,
  errorCode,
  errorMessage,
  finalResponse,
  harnessMaterial,
  makeBaseline,
  makeDefinition,
  promotedFixture,
  queryHarnessMaterial,
  quoteEvent,
  quoteResult,
  resolverFixture,
  ScriptedEffectTools,
  ScriptedModel,
  TARGET,
  WORKFLOW_INSTANCE_ID,
  sha256HexUtf8,
  deviceSha256,
} from './t009-fixtures';
import {
  T009_DECLARATION_DIGESTS_JSON,
  T009_DEP_VERSIONS_JSON,
  T009_HOST_BOUNDS_JSON,
  T009_HOST_CAPABILITIES_JSON,
  T009_KAT_VECTORS_JSON,
  T009_MANIFEST_JSON,
  T009_PACKAGE_ID,
  T009_REPO_HEAD,
  T009_REPO_TREE,
} from './fixture-constants';

declare const HermesInternal: unknown;

const CONTROL_DB = 't009-control.db';
const MAIN_DB = 't009-main.db';
const NOW = '2026-10-04T07:00:00.000Z';
const CDI_DIGEST = 'cdi-orders-b1';
const CMD_CORRELATION = 'corr-t009-cmd';
const RELAUNCH_BARRIER = 'T009-RELAUNCH';

type Manifest = Record<string, unknown>;
const T009_MANIFEST = JSON.parse(T009_MANIFEST_JSON) as Manifest;
const T009_DECLARATION_DIGESTS = JSON.parse(T009_DECLARATION_DIGESTS_JSON) as Record<string, string>;
const T009_HOST_BOUNDS = JSON.parse(T009_HOST_BOUNDS_JSON) as Record<string, number>;
const T009_HOST_CAPABILITIES = JSON.parse(T009_HOST_CAPABILITIES_JSON) as string[];
const T009_DEP_VERSIONS = JSON.parse(T009_DEP_VERSIONS_JSON) as Record<string, string>;
const T009_KAT_VECTORS = JSON.parse(T009_KAT_VECTORS_JSON) as Record<string, [string, string]>;

interface CaseResult {
  readonly status: 'PASS' | 'FAIL' | 'BLOCKED';
  readonly checks: readonly string[];
  readonly note?: string;
}

export interface T009ValidationResult {
  readonly status: 'PASS' | 'ARMED' | 'RESTART_REQUIRED' | 'FAIL';
  readonly phase: 1 | 2;
  readonly stage: string;
  readonly barrier?: string;
  readonly platform: 'expo-android-hermes';
  readonly hermes: { present: boolean; runtimeProperties: Record<string, string> | null };
  readonly runtime: {
    sqliteEngine: string | null;
    storeSchemaVersion: number;
    deps: Record<string, string>;
  };
  readonly checkout: { head: string; tree: string };
  readonly packageId: string;
  readonly journeys: Readonly<Record<string, CaseResult>>;
  readonly details: Readonly<Record<string, JsonValue>>;
  readonly error?: string;
}

/* ------------------------------------------------------------------------ */
/* Small helpers                                                             */
/* ------------------------------------------------------------------------ */

function expoSqliteModule(): ExpoSqliteModuleLike {
  return {
    async openDatabaseAsync(databaseName: string) {
      return (await SQLite.openDatabaseAsync(databaseName)) as unknown as ExpoSqliteDatabaseLike;
    },
  };
}

function check(condition: boolean, label: string, checks: string[]): void {
  if (!condition) {
    throw new Error(`T009 device check failed: ${label}`);
  }
  checks.push(label);
}

async function runCase(
  caseId: string,
  cases: Record<string, CaseResult>,
  body: (checks: string[]) => Promise<void>,
): Promise<void> {
  const checks: string[] = [];
  try {
    await body(checks);
    cases[caseId] = { status: 'PASS', checks };
  } catch (error) {
    cases[caseId] = { status: 'FAIL', checks, note: `${errorMessage(error)} (code=${errorCode(error)})` };
  }
}

function hermesProof(): { present: boolean; runtimeProperties: Record<string, string> | null } {
  const present = typeof HermesInternal === 'object' && HermesInternal !== null;
  let runtimeProperties: Record<string, string> | null = null;
  if (present) {
    try {
      runtimeProperties = (HermesInternal as { getRuntimeProperties?: () => Record<string, string> })
        .getRuntimeProperties?.() ?? null;
    } catch {
      runtimeProperties = null;
    }
  }
  return { present, runtimeProperties };
}

/* ------------------------------------------------------------------------ */
/* Control database (stage machine + case ledger + durable facts)            */
/* ------------------------------------------------------------------------ */

async function openControl(): Promise<ExpoSqliteDatabaseLike> {
  const database = (await SQLite.openDatabaseAsync(CONTROL_DB)) as unknown as ExpoSqliteDatabaseLike;
  await database.execAsync(`
CREATE TABLE IF NOT EXISTS t009_control (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  stage TEXT NOT NULL,
  armed_barrier TEXT
);
CREATE TABLE IF NOT EXISTS t009_cases (
  case_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS t009_facts (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
`);
  const row = await database.getFirstAsync<{ stage: string }>('SELECT stage FROM t009_control WHERE singleton_id = 1', []);
  if (row === null) {
    await database.runAsync('INSERT INTO t009_control(singleton_id, stage) VALUES(1, ?)', ['phase1']);
  }
  return database;
}

async function getStage(database: ExpoSqliteDatabaseLike): Promise<{ stage: string; armedBarrier: string | null }> {
  const row = await database.getFirstAsync<{ stage: string; armed_barrier: string | null }>(
    'SELECT stage, armed_barrier FROM t009_control WHERE singleton_id = 1',
    [],
  );
  if (row === null) throw new Error('T009 control row missing');
  return { stage: row.stage, armedBarrier: row.armed_barrier };
}

async function setStage(database: ExpoSqliteDatabaseLike, stage: string, armedBarrier: string | null): Promise<void> {
  await database.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('UPDATE t009_control SET stage = ?, armed_barrier = ? WHERE singleton_id = 1', [stage, armedBarrier]);
  });
}

async function recordCaseRow(database: ExpoSqliteDatabaseLike, caseId: string, result: CaseResult): Promise<void> {
  await database.runAsync(
    'INSERT INTO t009_cases(case_id, status, checks_json, note) VALUES(?, ?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET status = excluded.status, checks_json = excluded.checks_json, note = excluded.note',
    [caseId, result.status, JSON.stringify(result.checks), result.note ?? null],
  );
}

async function putFact(database: ExpoSqliteDatabaseLike, key: string, value: unknown): Promise<void> {
  await database.runAsync(
    'INSERT INTO t009_facts(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
    [key, JSON.stringify(value)],
  );
}

async function getFact<T>(database: ExpoSqliteDatabaseLike, key: string): Promise<T | undefined> {
  const row = await database.getFirstAsync<{ v: string }>('SELECT v FROM t009_facts WHERE k = ?', [key]);
  return row === null ? undefined : (JSON.parse(row.v) as T);
}

async function loadCases(database: ExpoSqliteDatabaseLike): Promise<Record<string, CaseResult>> {
  const rows = await database.getAllAsync<{ case_id: string; status: string; checks_json: string; note: string | null }>(
    'SELECT case_id, status, checks_json, note FROM t009_cases',
    [],
  );
  const result: Record<string, CaseResult> = {};
  for (const row of rows) {
    result[row.case_id] = {
      status: row.status as CaseResult['status'],
      checks: JSON.parse(row.checks_json) as string[],
      ...(row.note === null ? {} : { note: row.note }),
    };
  }
  return result;
}

/* ------------------------------------------------------------------------ */
/* Store helpers                                                             */
/* ------------------------------------------------------------------------ */

const PACKAGE_IDENTITY = runtimePackageIdentityFromManifest(T009_MANIFEST as never);

function streamRefFor(target: WorkflowAddress): RuntimeObservationStreamRef {
  return { target, package: PACKAGE_IDENTITY, epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID };
}

/** Read the FULL durable observation stream through the existing cursor paging. */
async function readAllRecords(
  store: { readObservations(request: never): Promise<{ records: RuntimeObservationRecord[]; nextCursor?: string }> },
  target: WorkflowAddress,
): Promise<RuntimeObservationRecord[]> {
  const records: RuntimeObservationRecord[] = [];
  let afterCursor: string | undefined;
  for (;;) {
    const page = await (store.readObservations as unknown as (
      request: { stream: RuntimeObservationStreamRef; afterCursor?: string; limit: number },
    ) => Promise<{ records: RuntimeObservationRecord[]; nextCursor?: string }>)({
      stream: streamRefFor(target),
      ...(afterCursor === undefined ? {} : { afterCursor }),
      limit: 2,
    });
    records.push(...page.records);
    if (page.nextCursor === undefined) break;
    afterCursor = page.nextCursor;
  }
  return records;
}

function receiptsOf(records: readonly RuntimeObservationRecord[]): Array<{ sequence: number; receipt: DecisionResolutionReceipt }> {
  const receipts: Array<{ sequence: number; receipt: DecisionResolutionReceipt }> = [];
  for (const record of records) {
    if (record.kind !== 'DECISION_RECEIPT' || record.decisionReceipt === undefined) {
      throw new Error(`T009 device check failed: non-receipt record in stream kind=${record.kind}`);
    }
    receipts.push({ sequence: record.sequence, receipt: record.decisionReceipt });
  }
  return receipts;
}

async function observationTotals(
  database: ExpoSqliteDatabaseLike,
): Promise<{ streams: number; records: number; maxSeq: number }> {
  const totals = await database.getFirstAsync<{ streams: number; records: number; maxSeq: number | null }>(
    'SELECT (SELECT COUNT(*) FROM dh_v3_observation_streams) AS streams, (SELECT COUNT(*) FROM dh_v3_observation_records) AS records, (SELECT COALESCE(MAX(sequence), 0) FROM dh_v3_observation_records) AS maxSeq',
    [],
  );
  return { streams: totals?.streams ?? 0, records: totals?.records ?? 0, maxSeq: totals?.maxSeq ?? 0 };
}

async function sqliteEngineVersion(): Promise<string | null> {
  const database = (await SQLite.openDatabaseAsync('t009-attest.db')) as unknown as ExpoSqliteDatabaseLike;
  try {
    const row = await database.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v', []);
    return row?.v ?? null;
  } finally {
    await database.closeAsync?.();
  }
}

/**
 * Attach the v0.6 T006 Decision-Receipt observation seam (host-side adapter)
 * onto the REAL ExpoSqliteRuntimeStore instance. The seam is a structural
 * store contract (`DecisionReceiptObservationStore`); this host implementation
 * appends the DECISION_RECEIPT record through the SAME shared
 * ExclusiveTransactionQueue and the SAME durable tables the runtime store uses,
 * with the adapter contract's exact binding/contiguity/atomicity semantics
 * (validate fail-closed before any write; one contiguous sequence; identity
 * mismatch fails closed).
 */
function attachReceiptSeam(
  store: object,
  database: ExpoSqliteDatabaseLike,
  writes: ExclusiveTransactionQueue,
): void {
  const append = async (request: {
    target: WorkflowAddress;
    packageIdentity: DomainIntelligencePackageIdentity;
    receipt: DecisionResolutionReceipt;
    observedAt: string;
  }): Promise<RuntimeObservationRecord> => {
    // Fail closed BEFORE any durable state changes.
    assertValidDecisionResolutionReceipt(request.receipt);
    return writes.run(async (transaction) => {
      const epochId = RUNTIME_OBSERVATION_INITIAL_EPOCH_ID;
      // The runtime store binds stream rows to the canonical text of the WHOLE
      // package identity; the seam must produce byte-identical material.
      const identityJson = canonicalJsonStringify(request.packageIdentity as unknown as JsonValue);
      const streamRow = await transaction.getFirstAsync<{ package_identity_json: string; last_sequence: number }>(
        `SELECT package_identity_json, last_sequence
           FROM dh_v3_observation_streams
          WHERE workflow_id = ? AND instance_key = ? AND epoch_id = ?`,
        [request.target.workflowId, request.target.instanceKey, epochId],
      );
      let lastSequence: number;
      if (streamRow === null) {
        lastSequence = 0;
        await transaction.runAsync(
          `INSERT INTO dh_v3_observation_streams(
             workflow_id, instance_key, epoch_id, package_identity_json, last_sequence, created_at
           ) VALUES(?, ?, ?, ?, 0, ?)`,
          [request.target.workflowId, request.target.instanceKey, epochId, identityJson, request.observedAt],
        );
      } else if (streamRow.package_identity_json !== identityJson) {
        throw new RuntimeObservationError(
          'STREAM_IDENTITY_MISMATCH',
          `Durable observation stream for ${request.target.workflowId}/${request.target.instanceKey} is bound to a different package identity`,
        );
      } else {
        lastSequence = streamRow.last_sequence;
      }
      const streamRef: RuntimeObservationStreamRef = {
        target: request.target,
        package: request.packageIdentity,
        epochId,
      };
      const streamKey = runtimeObservationStreamKey(streamRef);
      const sequence = lastSequence + 1;
      const record = {
        stream: streamRef,
        sequence,
        observationId: runtimeObservationId(streamKey, sequence),
        kind: 'DECISION_RECEIPT',
        observedAt: request.observedAt,
        decisionReceipt: request.receipt,
      } as RuntimeObservationRecord;
      await transaction.runAsync(
        `INSERT INTO dh_v3_observation_records(
           workflow_id, instance_key, epoch_id, sequence, record_json, observed_at
         ) VALUES(?, ?, ?, ?, ?, ?)`,
        [
          request.target.workflowId,
          request.target.instanceKey,
          epochId,
          sequence,
          JSON.stringify(record),
          request.observedAt,
        ],
      );
      const streamUpdate = await transaction.runAsync(
        `UPDATE dh_v3_observation_streams
            SET last_sequence = ?
          WHERE workflow_id = ? AND instance_key = ? AND epoch_id = ? AND last_sequence = ?`,
        [sequence, request.target.workflowId, request.target.instanceKey, epochId, lastSequence],
      );
      if (streamUpdate.changes !== 1) {
        throw new RuntimeObservationError(
          'OBSERVATION_APPEND_FAILED',
          `Observation sequence allocation raced for ${request.target.workflowId}/${request.target.instanceKey}`,
        );
      }
      return record;
    });
  };
  (store as { recordDecisionReceipt?: unknown }).recordDecisionReceipt = append;
}

/* ------------------------------------------------------------------------ */
/* Assembly construction (single-file durable deployment)                    */
/* ------------------------------------------------------------------------ */

interface Deployment {
  readonly database: ExpoSqliteDatabaseLike;
  readonly store: object;
  readonly assembly: Awaited<ReturnType<typeof createDomainRuntimeV3>>;
  readonly tools: ScriptedEffectTools;
  readonly authority: Awaited<ReturnType<typeof openExpoSqliteAuthorityStores>>;
  readonly b1: Awaited<ReturnType<typeof makeBaseline>>;
}

async function openDeployment(): Promise<Deployment> {
  const database = await expoSqliteModule().openDatabaseAsync(MAIN_DB);
  const authority = await openExpoSqliteAuthorityStores({ database });
  // Single-file deployment: the runtime store shares the authority bundle's
  // one ExclusiveTransactionQueue (one writer gate over the whole store file).
  const store = await openExpoSqliteRuntimeStore({
    database,
    writes: authority.writes,
    now: () => NOW,
  } as never);
  attachReceiptSeam(store as object, database, authority.writes);

  const b1 = await makeBaseline('B1');
  await authority.baselines.putBody(b1);

  const compiledPackage = {
    manifest: T009_MANIFEST,
    bindings: { 'bind:quotes.lookup': 'host-read-handle' },
    domainData: {},
  };
  const tools = new ScriptedEffectTools();
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage as never], T009_PACKAGE_ID),
    store: store as never,
    observation: { mode: 'enabled' as const },
    bindings: {
      capabilities: T009_HOST_CAPABILITIES,
      sha256: deviceSha256,
      secureRandom: {
        randomId(): string {
          return `t009-random-${Math.random().toString(36).slice(2)}`;
        },
      },
      expression: {
        // Minimal JSONata-ish evaluator for the compiled declarations'
        // inputSelection vocabulary: '$.order' selects the order record from
        // the invoking context (the same value the Node ExpressionRuntime
        // produces for the conformance fixtures).
        async evaluate(request: { expression: string; input: JsonValue }): Promise<JsonValue> {
          if (request.expression === '$.order') {
            const order = (request.input as { order?: JsonValue } | null)?.order;
            return order === undefined ? null : order;
          }
          return request.input;
        },
      },
    } as never,
    supportedPackageDataBounds: T009_HOST_BOUNDS,
    v3: {
      baselines: authority.baselines,
      activationAuthority: authority.activation,
      exactPackageCdi: authority.exactPackageCdi,
      durableExecution: store as never,
      effectJournal: authority.admissionEffectJournal,
      effectTools: tools,
      evidence: authority.evidence,
    },
  } as never);
  return { database, store: store as object, assembly, tools, authority, b1 };
}

function compiledPackageSnapshot(): WorkflowInstanceSnapshot {
  return {
    address: TARGET,
    correlationId: 'corr-t009-main',
    packageId: T009_PACKAGE_ID,
    lifecycle: 'waiting',
    stateRevision: 0,
    state: { phase: 'review' },
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as WorkflowInstanceSnapshot;
}

function cmdInstanceSnapshot(): WorkflowInstanceSnapshot {
  return {
    address: CMD_TARGET,
    correlationId: CMD_CORRELATION,
    packageId: T009_PACKAGE_ID,
    lifecycle: 'waiting',
    stateRevision: 0,
    state: { phase: 'review' },
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as WorkflowInstanceSnapshot;
}

async function pinInstance(
  assembly: Deployment['assembly'],
  b1Identity: unknown,
  workflowTarget: string,
  workflowInstanceId: string,
): Promise<void> {
  await assembly.governance.pinExecution({
    workflowTarget,
    workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: T009_PACKAGE_ID,
      domainIntelligenceContentDigest: CDI_DIGEST,
      governanceBaseline: b1Identity,
    },
  } as never);
}

interface TurnOverrides {
  readonly decisionId?: string;
  readonly turn?: ResolveAndAdmitTurnRequest['turn'];
  readonly definition?: ResolveAndAdmitTurnRequest['definition'];
  readonly event?: ResolveAndAdmitTurnRequest['event'];
  readonly currentStateKey?: string;
  readonly rule?: unknown;
  readonly resolver?: ResolveAndAdmitTurnRequest['resolver'];
  readonly harness?: ResolveAndAdmitTurnRequest['harness'];
  readonly promoted?: ResolveAndAdmitTurnRequest['promoted'];
  readonly dependencies?: ResolveAndAdmitTurnRequest['dependencies'];
  readonly invokingArtifacts?: ResolveAndAdmitTurnRequest['invokingArtifacts'];
  readonly applicabilityFacts?: ResolveAndAdmitTurnRequest['applicabilityFacts'];
  readonly target?: WorkflowAddress;
  readonly workflowInstanceId?: string;
}

function turnRequest(overrides: TurnOverrides = {}): ResolveAndAdmitTurnRequest {
  const target = overrides.target ?? TARGET;
  // The rule port rides the resolver ports (frozen order: Rule first); a
  // turn-level `rule` override is wired onto the resolver exactly like the
  // v0.6 conformance fixture vocabulary does.
  const resolver = {
    ...(overrides.rule === undefined ? {} : { rule: overrides.rule as never }),
    ...(overrides.resolver ?? {}),
  };
  return {
    decisionId: overrides.decisionId ?? 'quote-decision',
    target,
    turn: overrides.turn ?? { kind: 'message', sourceMessageId: 'turn:1' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: overrides.workflowInstanceId ?? WORKFLOW_INSTANCE_ID,
    definition: overrides.definition ?? makeDefinition(),
    currentStateKey: overrides.currentStateKey ?? 'review',
    context: { order: { sku: 'P-1', quantity: 3 } },
    event: overrides.event ?? quoteEvent(42),
    now: NOW,
    resolver,
    ...(overrides.harness === undefined ? {} : { harness: overrides.harness }),
    ...(overrides.promoted === undefined ? {} : { promoted: overrides.promoted }),
    ...(overrides.dependencies === undefined ? {} : { dependencies: overrides.dependencies }),
    ...(overrides.invokingArtifacts === undefined ? {} : { invokingArtifacts: overrides.invokingArtifacts }),
    ...(overrides.applicabilityFacts === undefined ? {} : { applicabilityFacts: overrides.applicabilityFacts }),
  } as ResolveAndAdmitTurnRequest;
}

function expectAdmitted(outcome: { status: string } & Record<string, unknown>): Record<string, unknown> {
  if (outcome.status !== 'admitted') {
    throw new Error(`T009 device check failed: expected admitted outcome, got ${JSON.stringify(outcome).slice(0, 600)}`);
  }
  return outcome;
}

function expectDenied(outcome: { status: string } & Record<string, unknown>): Record<string, unknown> {
  if (outcome.status !== 'denied') {
    throw new Error(`T009 device check failed: expected denied outcome, got ${JSON.stringify(outcome).slice(0, 600)}`);
  }
  return outcome;
}

function commandMessage(messageId: string, overrides: Partial<DomainMessage> = {}): DomainMessage {
  return {
    messageId,
    target: CMD_TARGET,
    type: 'QUOTE_DECIDED',
    payload: { amount: 42 },
    correlationId: CMD_CORRELATION,
    ...overrides,
  };
}

/**
 * The composed host command-turn loop over the device store: A8 acceptance
 * boundary → processing mark → resolveAndAdmitTurn seam → runtime-core
 * processed-command preparation → A9-guarded store commit.
 */
async function processCommandTurn(
  deployment: Deployment,
  message: DomainMessage,
  overrides: TurnOverrides = {},
): Promise<{ kind: 'duplicate-ack'; ack: MessageAcceptedAck; existingOutcome: unknown } | { kind: 'processed'; ack: MessageAcceptedAck; outcome: unknown }> {
  const store = deployment.store as never as {
    acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck>;
    markMessageProcessing(target: WorkflowAddress, messageId: string, processingAt: string): Promise<boolean>;
    getMessageDisposition(target: WorkflowAddress, messageId: string): Promise<{ disposition: string; targetSequence: number } | null>;
    getInstance(target: WorkflowAddress): Promise<{ stateRevision: number } | null>;
    getCommandOutcome(target: WorkflowAddress, messageId: string): Promise<unknown>;
    commitProcessedCommandTurn(commit: unknown): Promise<void>;
  };
  const ack = await store.acceptMessage(message);
  if (ack.status === 'duplicate') {
    const existingOutcome = await store.getCommandOutcome(message.target, message.messageId);
    return { kind: 'duplicate-ack', ack, existingOutcome };
  }
  const marked = await store.markMessageProcessing(message.target, message.messageId, NOW);
  if (marked !== true) throw new Error('T009 device check failed: the head accepted message must mark processing');
  const outcome = await deployment.assembly.resolveAndAdmitTurn(turnRequest({
    ...overrides,
    target: message.target,
    workflowInstanceId: CMD_WORKFLOW_INSTANCE_ID,
    turn: { kind: 'message', sourceMessageId: message.messageId },
  }));
  const instance = await store.getInstance(message.target);
  const disposition = await store.getMessageDisposition(message.target, message.messageId);
  const existingOutcome = await store.getCommandOutcome(message.target, message.messageId);
  if (instance === null || disposition === null) {
    throw new Error('T009 device check failed: durable turn state must exist before commit');
  }
  const resolution = outcome.status === 'admitted'
    ? ({ status: 'applied', result: { transitionKey: (outcome as { admitted?: { transitionKey?: string } }).admitted?.transitionKey } } as const)
    : ({ status: 'rejected', rejection: { code: 'admission-denied', message: `reason: ${(outcome as { denial?: { reason?: string } }).denial?.reason}` } } as const);
  const prepared = prepareProcessedCommandTurn(
    { instance, disposition, existingOutcome } as never,
    {
      target: message.target,
      messageId: message.messageId,
      expectedTargetSequence: disposition.targetSequence,
      expectedStateRevision: instance.stateRevision,
      nextState: { phase: outcome.status === 'admitted' ? (outcome as { admitted?: { targetState?: string } }).admitted?.targetState : 'review' },
      nextProcessData: {},
      nextLifecycle: 'waiting',
      resolution,
      updatedAt: NOW,
    } as never,
  );
  if (prepared.kind === 'commit') {
    await store.commitProcessedCommandTurn(prepared.commit);
    return { kind: 'processed', ack, outcome };
  }
  return { kind: 'processed', ack, outcome };
}

/* ------------------------------------------------------------------------ */
/* Phase 1 — journeys J1, J2, J3, J4, J5, J7, J8 + relaunch arming           */
/* ------------------------------------------------------------------------ */

async function runPhase1(control: ExpoSqliteDatabaseLike): Promise<T009ValidationResult> {
  const cases: Record<string, CaseResult> = {};
  const details: Record<string, JsonValue> = {};
  const hermes = hermesProof();
  details['hermes'] = hermes as unknown as JsonValue;

  await runCase('PLATFORM', cases, async (checks) => {
    check(hermes.present, 'PLATFORM hermes-engine-live (typeof HermesInternal !== undefined)', checks);
    check(
      Object.keys(T009_KAT_VECTORS).every((name) => sha256HexUtf8(T009_KAT_VECTORS[name]![0]) === T009_KAT_VECTORS[name]![1]),
      'PLATFORM device-sha256-known-answer-vectors',
      checks,
    );
    const engine = await sqliteEngineVersion();
    details['sqliteEngine'] = engine;
    check(typeof engine === 'string' && engine.length > 0, `PLATFORM native-sqlite-open (sqlite_version()=${String(engine)})`, checks);
    const expectedSchema = EXPO_RUNTIME_STORE_SCHEMA_VERSION;
    details['storeSchemaVersion'] = expectedSchema;
    check(Number.isInteger(expectedSchema) && expectedSchema > 0, 'PLATFORM expo-store-schema-version-exposed', checks);
  });

  // Identity: the device recomputes the compiled package identity from the
  // exact manifest bytes with its OWN pure-TS sha256.
  let devicePackageId = '';
  await runCase('IDENTITY', cases, async (checks) => {
    devicePackageId = await computeCompiledPackageId(T009_MANIFEST as never, deviceSha256);
    check(devicePackageId === T009_PACKAGE_ID, 'IDENTITY compiled-packageId-device-recompute-matches-build', checks);
    for (const [decisionId, digest] of Object.entries(T009_DECLARATION_DIGESTS)) {
      check(/^[0-9a-f]{64}$/.test(digest), `IDENTITY declaration-digest-shape ${decisionId}`, checks);
    }
  });

  const deployment = await openDeployment();
  const b1 = deployment.b1;
  try {
    const store = deployment.store as never as {
      createInstance(snapshot: unknown): Promise<void>;
      getInstance(target: WorkflowAddress): Promise<{ stateRevision: number; lifecycle: string } | null>;
      getMessageDisposition(target: WorkflowAddress, messageId: string): Promise<{ disposition: string; targetSequence: number } | null>;
      getCommandOutcome(target: WorkflowAddress, messageId: string): Promise<unknown>;
      readObservations(request: never): Promise<{ records: RuntimeObservationRecord[]; nextCursor?: string }>;
    };
    await store.createInstance(compiledPackageSnapshot());
    await store.createInstance(cmdInstanceSnapshot());
    await pinInstance(deployment.assembly, b1.identity, TARGET.workflowId, WORKFLOW_INSTANCE_ID);
    await pinInstance(deployment.assembly, b1.identity, CMD_TARGET.workflowId, CMD_WORKFLOW_INSTANCE_ID);

    const durablePromoted = await promotedFixture(
      { store: deployment.authority.promotedArtifacts, pinStore: deployment.authority.dynamicChildPins },
      { packageId: T009_PACKAGE_ID, domainIntelligenceContentDigest: CDI_DIGEST, governanceBaseline: b1.identity },
    );
    const promotedPorts = {
      runtime: durablePromoted.runtime,
      artifactPort: createRegistryPromotedChildArtifactPort(
        new PromotedArtifactRegistry(deployment.authority.promotedArtifacts, deviceSha256),
      ),
      revocation: {
        readRevocation: (artifact: unknown) =>
          new PromotedArtifactRegistry(deployment.authority.promotedArtifacts, deviceSha256).readRevocation(artifact as never),
      },
    };

    let journalCountBaseline = (await deployment.authority.admissionEffectJournal.getRecords()).length;
    let toolCallsBaseline = deployment.tools.calls.length;
    const toolDelta = () => deployment.tools.calls.length - toolCallsBaseline;
    const journalDelta = async () => (await deployment.authority.admissionEffectJournal.getRecords()).length - journalCountBaseline;
    const checkpoint = async (): Promise<void> => {
      toolCallsBaseline = deployment.tools.calls.length;
      journalCountBaseline = (await deployment.authority.admissionEffectJournal.getRecords()).length;
    };

    /* -------------------------------------------------------------------- */
    /* J1 — compiled package accepted + executed end-to-end                  */
    /* -------------------------------------------------------------------- */
    await runCase('J1', cases, async (checks) => {
      const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });
      const model = new ScriptedModel([]);
      const outcome = expectAdmitted(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule,
        resolver: { harnessRunner: createXStateHarnessMachineRunner() },
        harness: harnessMaterial(model),
        turn: { kind: 'message', sourceMessageId: 'j1-rule' },
      })) as never) as Record<string, unknown>;
      const admitted = outcome.admitted as Record<string, unknown>;
      const resolverFacts = admitted.resolver as Record<string, unknown>;
      check(admitted.transitionKey === 'approve', 'J1 transition-approved', checks);
      check(admitted.targetState === 'approved', 'J1 target-state-approved', checks);
      check(resolverFacts.source === 'rule', 'J1 resolver-source-rule', checks);
      check(resolverFacts.llmAvoided === true && resolverFacts.freshModelCallCount === 0, 'J1 zero-model-access', checks);
      check(model.calls === 0 && rule.calls === 1, 'J1 rule-called-model-untouched', checks);
      check(toolDelta() === 1, `J1 effect-executed-exactly-once (delta=${toolDelta()})`, checks);
      check((await journalDelta()) === 1, 'J1 effect-journaled-exactly-once', checks);
      const expectedTurnId = deriveDurableControlTurnId(TARGET, { kind: 'message', sourceMessageId: 'j1-rule' });
      check(admitted.durableControlTurnId === expectedTurnId, 'J1 durable-control-turn-id-derivation', checks);
      const receipt = outcome.receipt as Record<string, unknown>;
      check(receipt.disposition === 'admitted' && receipt.source === 'rule', 'J1 return-receipt-honest', checks);
      check(receipt.durableControlTurnId === expectedTurnId, 'J1 return-receipt-turn-correlation', checks);
      const durable = receiptsOf(await readAllRecords(store as never, TARGET));
      check(durable.length === 1, `J1 receipt-durably-projected (count=${durable.length})`, checks);
      check(
        canonicalJsonStringify(durable[0]!.receipt) === canonicalJsonStringify(receipt as never),
        'J1 durable-receipt-matches-return-receipt',
        checks,
      );
      check(durable[0]!.receipt.decisionId === 'quote-decision', 'J1 receipt-decision-identity', checks);
      await checkpoint();
    });

    /* -------------------------------------------------------------------- */
    /* J2 — Rule / Exact Reuse / non-model Promoted without model config     */
    /* -------------------------------------------------------------------- */
    await runCase('J2', cases, async (checks) => {
      // (a) Rule path.
      const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule-j2' }) });
      const modelA = new ScriptedModel([]);
      const a = expectAdmitted(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule,
        resolver: { harnessRunner: createXStateHarnessMachineRunner() },
        harness: harnessMaterial(modelA),
        turn: { kind: 'message', sourceMessageId: 'j2a-rule' },
      })) as never) as Record<string, unknown>;
      check((a.admitted as Record<string, unknown>).resolver !== undefined
        && (a.receipt as Record<string, unknown>).source === 'rule', 'J2a rule-source-receipt', checks);
      check(modelA.calls === 0, 'J2a zero-model-calls', checks);

      // (b) Exact Reuse: seed through the fresh Harness path, then replay the
      // same input with an EMPTY model queue — the durable device semantic
      // cache answers and the model is never reached.
      const cacheStore = deployment.authority.semanticCache;
      const seedModel = new ScriptedModel([finalResponse('approve', { via: 'cache-seed' })]);
      const seed = expectAdmitted(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule: new CapturingRule({ status: 'no-match' }),
        resolver: { cacheStore: cacheStore as never, harnessRunner: createXStateHarnessMachineRunner() },
        harness: harnessMaterial(seedModel),
        dependencies: { artifacts: [{ kind: 'harness-config', artifactId: 'harness:quote', contentDigest: 'digest-harness:quote' }] },
        turn: { kind: 'message', sourceMessageId: 'j2b-seed' },
      })) as never) as Record<string, unknown>;
      check((seed.receipt as Record<string, unknown>).source === 'harness-machine', 'J2b seed-via-harness', checks);
      check(seedModel.calls === 1, 'J2b seed-fresh-model-called-once', checks);

      const hitModel = new ScriptedModel([]);
      const hit = expectAdmitted(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule: new CapturingRule({ status: 'no-match' }),
        resolver: { cacheStore: cacheStore as never, harnessRunner: createXStateHarnessMachineRunner() },
        harness: harnessMaterial(hitModel),
        dependencies: { artifacts: [{ kind: 'harness-config', artifactId: 'harness:quote', contentDigest: 'digest-harness:quote' }] },
        turn: { kind: 'message', sourceMessageId: 'j2b-hit' },
      })) as never) as Record<string, unknown>;
      const hitResolver = ((hit.admitted as Record<string, unknown>).resolver ?? {}) as Record<string, unknown>;
      check(hitResolver.source === 'exact-cache', `J2b exact-reuse-source (source=${String(hitResolver.source)})`, checks);
      check(hitModel.calls === 0, 'J2b exact-reuse-never-touches-model', checks);
      check(hitResolver.freshModelCallCount === 0 && hitResolver.llmAvoided === true, 'J2b exact-reuse-llm-avoided', checks);
      check(hitResolver.cacheRead === 'hit', 'J2b cache-read-hit-telemetry', checks);
      check((hit.receipt as Record<string, unknown>).source === 'exact-cache', 'J2b receipt-reuse-source', checks);

      // (c) Non-model Promoted subworkflow path: the host supplies the
      // promoted execution material (a query executor + the DURABLE device
      // harness journal); the child output is data until admission.
      const promotedModel = new ScriptedModel([]);
      const promoted = expectAdmitted(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        decisionId: 'quote-promoted-decision',
        rule: new CapturingRule({ status: 'no-match' }),
        resolver: { promoted: promotedPorts as never, harnessRunner: createXStateHarnessMachineRunner() },
        harness: harnessMaterial(promotedModel),
        promoted: {
          executor: { async executeQuery(): Promise<JsonValue> { return { quote: quoteResult('approve', { amount: 42 }), price: 42 }; } },
          journal: deployment.authority.harnessJournal,
        } as never,
        dependencies: { artifacts: [{ kind: 'harness-config', artifactId: 'harness:quote', contentDigest: 'digest-harness:quote' }] },
        invokingArtifacts: [...allAvailableArtifacts()],
        applicabilityFacts: [{ kind: 'knowledge', artifactId: 'ctx:b2b-quote', contentDigest: 'digest-ctx:b2b-quote' }],
        turn: { kind: 'message', sourceMessageId: 'j2c-promoted' },
      })) as never) as Record<string, unknown>;
      const promotedResolver = ((promoted.admitted as Record<string, unknown>).resolver ?? {}) as Record<string, unknown>;
      check(promotedResolver.source === 'promoted-subworkflow', `J2c promoted-source (source=${String(promotedResolver.source)})`, checks);
      check(promotedModel.calls === 0, 'J2c promoted-never-touches-model', checks);
      check(promotedResolver.freshModelCallCount === 0, 'J2c promoted-zero-fresh-model-calls', checks);
      check((promoted.receipt as Record<string, unknown>).source === 'promoted-subworkflow', 'J2c receipt-promoted-source', checks);
      await checkpoint();
    });

    /* -------------------------------------------------------------------- */
    /* J3 — fresh semantic path with the in-app host-supplied model port     */
    /* -------------------------------------------------------------------- */
    await runCase('J3', cases, async (checks) => {
      const fixture = resolverFixture();
      const outcome = expectAdmitted(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule: new CapturingRule({ status: 'no-match' }),
        resolver: { harnessRunner: fixture.runner },
        harness: queryHarnessMaterial(fixture.model),
        turn: { kind: 'message', sourceMessageId: 'j3-fresh' },
      })) as never) as Record<string, unknown>;
      const resolverFacts = ((outcome.admitted as Record<string, unknown>).resolver ?? {}) as Record<string, unknown>;
      check(resolverFacts.source === 'harness-machine', `J3 fresh-source (source=${String(resolverFacts.source)})`, checks);
      check(fixture.model.calls === 1, 'J3 host-model-port-called-exactly-once', checks);
      check(resolverFacts.freshModelCallCount === 1, 'J3 fresh-model-call-count-honest', checks);
      check(resolverFacts.llmAvoided === false, 'J3 llm-not-avoided-honest', checks);
      const receipt = outcome.receipt as Record<string, unknown>;
      check(receipt.disposition === 'admitted' && receipt.source === 'harness-machine', 'J3 receipt-fresh-source', checks);
      check(receipt.freshModelCallCount === 1 && receipt.llmAvoided === false, 'J3 receipt-honest-model-evidence', checks);
      await checkpoint();
    });

    /* -------------------------------------------------------------------- */
    /* J4 — declared semantic-unavailable with NO model                      */
    /* -------------------------------------------------------------------- */
    await runCase('J4', cases, async (checks) => {
      // (a) fail-closed: typed terminal, no fabricated answer, no effect.
      const ruleA = new CapturingRule({ status: 'no-match' });
      let captured: unknown;
      let threw = false;
      try {
        await deployment.assembly.resolveAndAdmitTurn(turnRequest({
          rule: ruleA,
          turn: { kind: 'message', sourceMessageId: 'j4a-fail-closed' },
        }));
      } catch (error) {
        threw = true;
        captured = error;
      }
      check(threw, 'J4a fail-closed-terminal-throws', checks);
      check(captured instanceof DomainRuntimeV3Error, 'J4a typed-runtime-error', checks);
      check(
        captured instanceof DomainRuntimeV3Error && captured.code === 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE',
        `J4a unavailable-code (code=${captured instanceof DomainRuntimeV3Error ? captured.code : errorCode(captured)})`,
        checks,
      );
      check(!(captured instanceof DecisionResolverError), 'J4a distinct-from-resolver-error', checks);
      check(ruleA.calls === 1, 'J4a deterministic-sources-ran', checks);
      check(toolDelta() === 0, 'J4a zero-effect', checks);
      check((await journalDelta()) === 0, 'J4a zero-journal-mutation', checks);
      const receiptsA = receiptsOf(await readAllRecords(store as never, TARGET));
      const unavailableReceipt = receiptsA[receiptsA.length - 1]!.receipt;
      check(unavailableReceipt.disposition === 'semantic-unavailable', 'J4a receipt-semantic-unavailable', checks);
      const failureA = unavailableReceipt.failure as Record<string, unknown> | undefined;
      check(failureA?.kind === 'semantic-unavailable', 'J4a receipt-failure-category', checks);
      check(unavailableReceipt.source === undefined, 'J4a no-fabricated-source', checks);

      // (c) declared-event denial is FINAL (hard invariants still apply).
      const ruleC = new CapturingRule({ status: 'no-match' });
      const denied = expectDenied(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        decisionId: 'quote-declared-decision',
        rule: ruleC,
        event: quoteEvent(5000),
        turn: { kind: 'message', sourceMessageId: 'j4c-declared-denied' },
      })) as never) as Record<string, unknown>;
      const denial = denied.denial as Record<string, unknown>;
      check(denial.reason === 'hard-invariant', `J4c declared-denial-reason (reason=${String(denial.reason)})`, checks);
      check((denial.resolver as Record<string, unknown>).source === 'declared-unavailable', 'J4c denial-source-declared', checks);
      check(toolDelta() === 0, 'J4c denial-zero-effect', checks);
      const receiptsC = receiptsOf(await readAllRecords(store as never, TARGET));
      check(receiptsC[receiptsC.length - 1]!.receipt.disposition === 'denied', 'J4c denial-receipt-durable', checks);

      // (b) declared-event admission carries ONLY the declared material.
      const ruleB = new CapturingRule({ status: 'no-match' });
      const admitted = expectAdmitted(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        decisionId: 'quote-declared-decision',
        rule: ruleB,
        turn: { kind: 'message', sourceMessageId: 'j4b-declared' },
      })) as never) as Record<string, unknown>;
      const resolverB = ((admitted.admitted as Record<string, unknown>).resolver ?? {}) as Record<string, unknown>;
      check(resolverB.source === 'declared-unavailable', `J4b declared-source (source=${String(resolverB.source)})`, checks);
      check(resolverB.freshModelCallCount === 0 && resolverB.llmAvoided === true, 'J4b declared-zero-model', checks);
      check(ruleB.calls === 1, 'J4b rule-ran-once', checks);
      check(toolDelta() === 1, 'J4b declared-transition-effect-executed', checks);
      const receiptB = admitted.receipt as Record<string, unknown>;
      check(receiptB.disposition === 'admitted' && receiptB.source === 'declared-unavailable', 'J4b receipt-declared-source', checks);
      check(receiptB.failure === undefined, 'J4b admitted-receipt-no-failure', checks);
      await checkpoint();
    });

    /* -------------------------------------------------------------------- */
    /* J5 — resolver result through Admission guard/invariant authority      */
    /* -------------------------------------------------------------------- */
    await runCase('J5', cases, async (checks) => {
      // (a) guard rejection AFTER the model proposal is final.
      const harness = resolverFixture();
      const deniedGuard = expectDenied(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule: new CapturingRule({ status: 'no-match' }),
        resolver: { harnessRunner: harness.runner },
        harness: harnessMaterial(harness.model),
        dependencies: { artifacts: [{ kind: 'harness-config', artifactId: 'harness:quote', contentDigest: 'digest-harness:quote' }] },
        definition: makeDefinition({
          approveGuardId: 'guard:tiny',
          omitReject: true,
          guards: [{
            guardId: 'guard:tiny',
            predicate: {
              op: 'lte',
              left: { source: 'event', path: ['payload', 'amount'] },
              right: { source: 'literal', value: 50 },
            },
          }],
        }),
        event: quoteEvent(80),
        turn: { kind: 'message', sourceMessageId: 'j5a-guard' },
      })) as never) as Record<string, unknown>;
      const guardDenial = deniedGuard.denial as Record<string, unknown>;
      check(guardDenial.reason === 'guard', `J5a guard-denial-reason (reason=${String(guardDenial.reason)})`, checks);
      check(guardDenial.guardId === 'guard:tiny', 'J5a guard-id-identified', checks);
      check((guardDenial.resolver as Record<string, unknown>).source === 'harness-machine', 'J5a proposal-source-honest', checks);
      check(harness.model.calls === 1, 'J5a model-never-retried-after-denial', checks);
      check(toolDelta() === 0, 'J5a denial-zero-effect', checks);
      check((await journalDelta()) === 0, 'J5a denial-zero-journal', checks);
      const guardReceipts = receiptsOf(await readAllRecords(store as never, TARGET));
      const guardReceipt = guardReceipts[guardReceipts.length - 1]!.receipt;
      check(guardReceipt.disposition === 'denied', 'J5a receipt-denied', checks);
      check(guardReceipt.freshModelCallCount === 1 && guardReceipt.llmAvoided === false, 'J5a receipt-honest-proposal', checks);
      const guardFailure = guardReceipt.failure as Record<string, unknown>;
      check(guardFailure.kind === 'admission-denied' && guardFailure.reason === 'guard', 'J5a receipt-bounded-category', checks);

      // (b) hard-invariant denial of a RULE result (same admission authority).
      const deniedInvariant = expectDenied(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule-j5' }) }),
        event: quoteEvent(5000),
        turn: { kind: 'message', sourceMessageId: 'j5b-invariant' },
      })) as never) as Record<string, unknown>;
      const invariantDenial = deniedInvariant.denial as Record<string, unknown>;
      check(invariantDenial.reason === 'hard-invariant', `J5b invariant-denial-reason (reason=${String(invariantDenial.reason)})`, checks);
      check(toolDelta() === 0, 'J5b invariant-denial-zero-effect', checks);
      const invariantReceipts = receiptsOf(await readAllRecords(store as never, TARGET));
      const invariantFailure = invariantReceipts[invariantReceipts.length - 1]!.receipt.failure as Record<string, unknown>;
      check(invariantFailure.kind === 'admission-denied' && invariantFailure.reason === 'hard-invariant', 'J5b receipt-category', checks);
      await checkpoint();
    });

    /* -------------------------------------------------------------------- */
    /* J7 — A8 duplicate replay + incompatible messageId collision           */
    /* -------------------------------------------------------------------- */
    await runCase('J7', cases, async (checks) => {
      const msg1 = commandMessage('cmd:a1');
      const turnOutcome = await processCommandTurn(deployment, msg1, {
        rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'cmd-a1' }) }),
      });
      check(turnOutcome.kind === 'processed', 'J7 first-turn-processed', checks);
      const outcome1 = await store.getCommandOutcome(CMD_TARGET, 'cmd:a1');
      check(outcome1 !== null, 'J7 command-outcome-durable', checks);
      const instanceAfter = await store.getInstance(CMD_TARGET);
      const totalsAfterFirst = await observationTotals(deployment.database);

      // Idempotent replay: SAME identity tuple returns the original duplicate
      // ack unchanged.
      const replayAck = await (store as never as { acceptMessage(m: DomainMessage): Promise<MessageAcceptedAck> }).acceptMessage(msg1);
      check(replayAck.status === 'duplicate', 'J7 replay-is-duplicate', checks);
      check(
        replayAck.targetSequence === (turnOutcome as { ack: MessageAcceptedAck }).ack.targetSequence
          && replayAck.acceptedAt === (turnOutcome as { ack: MessageAcceptedAck }).ack.acceptedAt,
        'J7 duplicate-ack-unchanged',
        checks,
      );

      // Incompatible replay (same messageId, DIFFERENT payload) fails closed
      // BEFORE any new durable write.
      let collision: unknown;
      let collided = false;
      try {
        await (store as never as { acceptMessage(m: DomainMessage): Promise<MessageAcceptedAck> })
          .acceptMessage(commandMessage('cmd:a1', { payload: { amount: 43 } }));
      } catch (error) {
        collided = true;
        collision = error;
      }
      check(collided, 'J7 collision-fails-closed', checks);
      check(errorCode(collision) === 'MESSAGE_IDENTITY_COLLISION', `J7 collision-code (code=${errorCode(collision)})`, checks);
      const totalsAfterCollision = await observationTotals(deployment.database);
      check(
        totalsAfterCollision.records === totalsAfterFirst.records && totalsAfterCollision.streams === totalsAfterFirst.streams,
        'J7 collision-writes-nothing (observation totals unchanged)',
        checks,
      );
      const outcomeAfterCollision = await store.getCommandOutcome(CMD_TARGET, 'cmd:a1');
      check(
        JSON.stringify(outcomeAfterCollision) === JSON.stringify(outcome1),
        'J7 collision-cannot-reuse-or-mutate-outcome',
        checks,
      );
      check(
        (await store.getInstance(CMD_TARGET))?.stateRevision === instanceAfter?.stateRevision,
        'J7 collision-no-state-mutation',
        checks,
      );

      // Loop-level replay: duplicate-ack + the SAME durable outcome, no new work.
      const loopReplay = await processCommandTurn(deployment, msg1);
      check(loopReplay.kind === 'duplicate-ack', 'J7 loop-replay-duplicate-ack', checks);
      check(
        JSON.stringify((loopReplay as { existingOutcome: unknown }).existingOutcome) === JSON.stringify(outcome1),
        'J7 loop-replay-existing-outcome-unchanged',
        checks,
      );

      await putFact(control, 'phase1.cmdA1', {
        ack: (turnOutcome as { ack: MessageAcceptedAck }).ack,
        outcome: outcome1,
        instanceRevision: instanceAfter?.stateRevision ?? -1,
        observationTotals: totalsAfterFirst,
      });
    });

    /* -------------------------------------------------------------------- */
    /* J8 — A9 invalid revision pair rejected without partial commit         */
    /* -------------------------------------------------------------------- */
    await runCase('J8', cases, async (checks) => {
      const msg2 = commandMessage('cmd:b1');
      const store8 = store as never as {
        acceptMessage(m: DomainMessage): Promise<MessageAcceptedAck>;
        markMessageProcessing(target: WorkflowAddress, messageId: string, at: string): Promise<boolean>;
        getMessageDisposition(target: WorkflowAddress, messageId: string): Promise<{ disposition: string; targetSequence: number } | null>;
        getInstance(target: WorkflowAddress): Promise<{ stateRevision: number } | null>;
        getCommandOutcome(target: WorkflowAddress, messageId: string): Promise<unknown>;
        commitProcessedCommandTurn(commit: unknown): Promise<void>;
      };
      const ack = await store8.acceptMessage(msg2);
      check(ack.status === 'accepted', 'J8 message-accepted', checks);
      check(await store8.markMessageProcessing(msg2.target, 'cmd:b1', NOW) === true, 'J8 marked-processing', checks);
      const outcomeTurn = await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'cmd-b1' }) }),
        target: CMD_TARGET,
        workflowInstanceId: CMD_WORKFLOW_INSTANCE_ID,
        turn: { kind: 'message', sourceMessageId: 'cmd:b1' },
      }));
      check(outcomeTurn.status === 'admitted', `J8 turn-admitted-before-commit (status=${String(outcomeTurn.status)})`, checks);
      const instance = await store8.getInstance(CMD_TARGET);
      const disposition = await store8.getMessageDisposition(CMD_TARGET, 'cmd:b1');
      if (instance === null || disposition === null) throw new Error('T009 device check failed: J8 durable state missing');
      const prepared = prepareProcessedCommandTurn(
        { instance, disposition, existingOutcome: null } as never,
        {
          target: CMD_TARGET,
          messageId: 'cmd:b1',
          expectedTargetSequence: disposition.targetSequence,
          expectedStateRevision: instance.stateRevision,
          nextState: { phase: 'approved' },
          nextProcessData: {},
          nextLifecycle: 'waiting',
          resolution: { status: 'applied', result: { transitionKey: 'approve' } },
          updatedAt: NOW,
        } as never,
      );
      check(prepared.kind === 'commit', 'J8 core-prepared-commit', checks);
      const commit = (prepared as unknown as { commit: Record<string, unknown> }).commit;
      const totalsBefore = await observationTotals(deployment.database);

      // (a) Frozen A9 structural guard: a nonconforming revision pair
      // (N -> N+7) fails closed BEFORE any durable mutation.
      let structural: unknown;
      let structuralThrew = false;
      try {
        await store8.commitProcessedCommandTurn({
          ...commit,
          nextStateRevision: (commit.expectedStateRevision as number) + 7,
        });
      } catch (error) {
        structuralThrew = true;
        structural = error;
      }
      check(structuralThrew, 'J8 invalid-revision-pair-rejected', checks);
      check(errorCode(structural) === 'STATE_REVISION_MISMATCH', `J8 structural-guard-code (code=${errorCode(structural)})`, checks);
      check(
        (await store8.getInstance(CMD_TARGET))?.stateRevision === instance.stateRevision,
        'J8 no-state-mutation-after-rejection',
        checks,
      );
      check((await store8.getMessageDisposition(CMD_TARGET, 'cmd:b1'))?.disposition === 'processing', 'J8 disposition-still-processing', checks);
      check((await store8.getCommandOutcome(CMD_TARGET, 'cmd:b1')) === null, 'J8 no-command-outcome-written', checks);
      const totalsAfterA = await observationTotals(deployment.database);
      check(
        totalsAfterA.records === totalsBefore.records && totalsAfterA.streams === totalsBefore.streams,
        'J8 no-partial-commit (observation totals unchanged)',
        checks,
      );

      // (b) Store-defensive identity check: a structurally valid pair whose
      // expected revision does not match the DURABLE revision also fails
      // closed without any partial write.
      let defensive: unknown;
      let defensiveThrew = false;
      try {
        await store8.commitProcessedCommandTurn({
          ...commit,
          expectedStateRevision: 5,
          nextStateRevision: 6,
        });
      } catch (error) {
        defensiveThrew = true;
        defensive = error;
      }
      check(defensiveThrew, 'J8 durable-revision-mismatch-rejected', checks);
      check(
        errorCode(defensive) === 'INSTANCE_STATE_CONFLICT' || errorCode(defensive) === 'STATE_REVISION_MISMATCH',
        `J8 defensive-guard-code (code=${errorCode(defensive)})`,
        checks,
      );
      check((await store8.getInstance(CMD_TARGET))?.stateRevision === instance.stateRevision, 'J8 defensive-no-mutation', checks);
      check((await store8.getCommandOutcome(CMD_TARGET, 'cmd:b1')) === null, 'J8 defensive-no-outcome', checks);

      // The SAME command commits cleanly through the exact derived commit —
      // the rejection never corrupted the turn.
      await store8.commitProcessedCommandTurn(commit);
      const outcome2 = await store8.getCommandOutcome(CMD_TARGET, 'cmd:b1');
      check(outcome2 !== null, 'J8 clean-commit-after-rejections', checks);
      check((await store8.getMessageDisposition(CMD_TARGET, 'cmd:b1'))?.disposition === 'processed', 'J8 disposition-processed', checks);
      check(
        (await store8.getInstance(CMD_TARGET))?.stateRevision === instance.stateRevision + 1,
        'J8 exact-one-revision-advance',
        checks,
      );

      await putFact(control, 'phase1.cmdB1', {
        outcome: outcome2,
        instanceRevision: (await store8.getInstance(CMD_TARGET))?.stateRevision ?? -1,
      });
    });

    // Durable phase-1 facts the relaunch phase reads back.
    const phase1Receipts = receiptsOf(await readAllRecords(store as never, TARGET));
    const phase1Totals = await observationTotals(deployment.database);
    const cmdInstance = await store.getInstance(CMD_TARGET);
    const targetInstance = await store.getInstance(TARGET);
    await putFact(control, 'phase1.receipts', phase1Receipts);
    await putFact(control, 'phase1.observationTotals', phase1Totals);
    await putFact(control, 'phase1.instances', {
      target: { revision: targetInstance?.stateRevision ?? -1 },
      cmd: { revision: cmdInstance?.stateRevision ?? -1 },
    });
    await putFact(control, 'phase1.counts', {
      toolCalls: deployment.tools.calls.length,
      journalRecords: (await deployment.authority.admissionEffectJournal.getRecords()).length,
    });
    await putFact(control, 'phase1.promotedIdentity', { identity: durablePromoted.body.identity });
    details['phase1Receipts'] = phase1Receipts.length;
    details['phase1Totals'] = phase1Totals as unknown as JsonValue;

    for (const [caseId, result] of Object.entries(cases)) {
      await recordCaseRow(control, caseId, result);
    }
    await setStage(control, 'phase2-armed', RELAUNCH_BARRIER);
    await deployment.authority.close();

    return {
      status: 'ARMED',
      phase: 1,
      stage: 'phase2-armed',
      barrier: RELAUNCH_BARRIER,
      platform: 'expo-android-hermes',
      hermes,
      runtime: {
        sqliteEngine: (details['sqliteEngine'] as string | null) ?? null,
        storeSchemaVersion: EXPO_RUNTIME_STORE_SCHEMA_VERSION,
        deps: T009_DEP_VERSIONS,
      },
      checkout: { head: T009_REPO_HEAD, tree: T009_REPO_TREE },
      packageId: T009_PACKAGE_ID,
      journeys: cases,
      details,
    };
  } catch (error) {
    for (const [caseId, result] of Object.entries(cases)) {
      await recordCaseRow(control, caseId, result);
    }
    await deployment.authority.close().catch(() => undefined);
    throw error;
  }
}

/* ------------------------------------------------------------------------ */
/* Phase 2 — journeys J6, J9 after the REAL force-stop/relaunch              */
/* ------------------------------------------------------------------------ */

async function runPhase2(control: ExpoSqliteDatabaseLike): Promise<T009ValidationResult> {
  const cases: Record<string, CaseResult> = {};
  const details: Record<string, JsonValue> = {};
  const hermes = hermesProof();
  details['hermes'] = hermes as unknown as JsonValue;

  const factsReceipts = await getFact<Array<{ sequence: number; receipt: DecisionResolutionReceipt }>>(control, 'phase1.receipts');
  const factsTotals = await getFact<{ streams: number; records: number; maxSeq: number }>(control, 'phase1.observationTotals');
  const factsCmdA1 = await getFact<{ ack: MessageAcceptedAck; outcome: unknown; instanceRevision: number; observationTotals: { streams: number; records: number; maxSeq: number } }>(control, 'phase1.cmdA1');
  const factsCounts = await getFact<{ toolCalls: number; journalRecords: number }>(control, 'phase1.counts');
  const factsInstances = await getFact<{ target: { revision: number }; cmd: { revision: number } }>(control, 'phase1.instances');
  if (
    factsReceipts === undefined || factsTotals === undefined || factsCmdA1 === undefined
    || factsCounts === undefined || factsInstances === undefined
  ) {
    throw new Error('T009 phase-2 precondition failed: phase-1 durable facts missing (stage machine corrupted?)');
  }

  const deployment = await openDeployment();
  const b1 = await makeBaseline('B1');
  await deployment.authority.baselines.putBody(b1);
  try {
    const store = deployment.store as never as {
      getInstance(target: WorkflowAddress): Promise<{ stateRevision: number; lifecycle: string } | null>;
      getMessageDisposition(target: WorkflowAddress, messageId: string): Promise<{ disposition: string; targetSequence: number } | null>;
      getCommandOutcome(target: WorkflowAddress, messageId: string): Promise<unknown>;
      acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck>;
      readObservations(request: never): Promise<{ records: RuntimeObservationRecord[]; nextCursor?: string }>;
    };

    // Re-pin through the DURABLE execution-pin authority: the pins survived in
    // expo-sqlite, so the bind must report/exact-match the existing material.
    await pinInstance(deployment.assembly, b1.identity, TARGET.workflowId, WORKFLOW_INSTANCE_ID);
    await pinInstance(deployment.assembly, b1.identity, CMD_TARGET.workflowId, CMD_WORKFLOW_INSTANCE_ID);

    /* -------------------------------------------------------------------- */
    /* J6 — receipt/observation durability + correlation across force-stop   */
    /* -------------------------------------------------------------------- */
    await runCase('J6', cases, async (checks) => {
      const relaunched = receiptsOf(await readAllRecords(store as never, TARGET));
      check(relaunched.length === factsReceipts.length, `J6 receipt-count-durable (${relaunched.length} vs ${factsReceipts.length})`, checks);
      let byteIdentical = true;
      for (let index = 0; index < Math.min(relaunched.length, factsReceipts.length); index += 1) {
        if (JSON.stringify(relaunched[index]) !== JSON.stringify(factsReceipts[index])) {
          byteIdentical = false;
          break;
        }
      }
      check(byteIdentical, 'J6 receipts-byte-identical-after-force-stop', checks);
      check(relaunched.every((entry, index) => entry.sequence === index + 1), 'J6 sequences-contiguous-ordered', checks);

      // Correlation without contradiction (frozen #585-11 shape).
      const turnIds = new Set(relaunched.map((entry) => entry.receipt.durableControlTurnId));
      check(turnIds.size === relaunched.length, 'J6 per-turn-identities-distinct', checks);
      const byDecision = new Map<string, Set<string>>();
      for (const entry of relaunched) {
        const digests = byDecision.get(entry.receipt.decisionId) ?? new Set<string>();
        digests.add(entry.receipt.declarationDigest);
        byDecision.set(entry.receipt.decisionId, digests);
      }
      check(
        [...byDecision.entries()].every(([, digests]) => digests.size === 1),
        'J6 declaration-digest-stable-per-decision',
        checks,
      );
      check(
        T009_DECLARATION_DIGESTS['quote-decision']
          === relaunched.find((entry) => entry.receipt.decisionId === 'quote-decision')?.receipt.declarationDigest,
        'J6 digest-matches-build-time-compiled-identity',
        checks,
      );
      check(
        relaunched.every((entry) => entry.receipt.workflowInstanceId === WORKFLOW_INSTANCE_ID),
        'J6 workflow-instance-correlation',
        checks,
      );
      for (const entry of relaunched) {
        const derived = deriveDurableControlTurnId(TARGET, deriveSourceHint(entry.receipt));
        if (derived !== entry.receipt.durableControlTurnId) {
          throw new Error(`T009 device check failed: J6 turn-id derivation mismatch for ${entry.receipt.durableControlTurnId}`);
        }
      }
      checks.push('J6 durable-turn-ids-derivable-from-turn-identity');
      const totals = await observationTotals(deployment.database);
      check(totals.records === factsTotals.records, `J6 observation-totals-durable (${totals.records} vs ${factsTotals.records})`, checks);
      details['j6ReceiptCount'] = relaunched.length;
    });

    /* -------------------------------------------------------------------- */
    /* J9 — FORCE-STOP / RELAUNCH recovery: zero duplicates                  */
    /* -------------------------------------------------------------------- */
    await runCase('J9', cases, async (checks) => {
      const beforeTotals = await observationTotals(deployment.database);
      check(beforeTotals.records === factsTotals.records, 'J9 no-records-created-by-relaunch', checks);

      // Re-deliver the EXACT processed command of phase 1.
      const replay = await processCommandTurn(deployment, commandMessage('cmd:a1'));
      check(replay.kind === 'duplicate-ack', `J9 replay-duplicate-ack (kind=${replay.kind})`, checks);
      check(
        JSON.stringify((replay as { existingOutcome: unknown }).existingOutcome) === JSON.stringify(factsCmdA1.outcome),
        'J9 existing-command-outcome-unchanged',
        checks,
      );
      const afterTotals = await observationTotals(deployment.database);
      check(afterTotals.records === beforeTotals.records, 'J9 no-duplicate-observation-record', checks);
      const receiptsAfter = receiptsOf(await readAllRecords(store as never, TARGET));
      check(receiptsAfter.length === factsReceipts.length, 'J9 no-duplicate-decision-receipt', checks);
      check(
        (await store.getInstance(CMD_TARGET))?.stateRevision === factsInstances.cmd.revision,
        'J9 no-duplicate-state-mutation (revision unchanged)',
        checks,
      );
      check((await store.getCommandOutcome(CMD_TARGET, 'cmd:a1')) !== null, 'J9 outcome-still-durable', checks);
      check((await store.getMessageDisposition(CMD_TARGET, 'cmd:a1'))?.disposition === 'processed', 'J9 disposition-still-processed', checks);
      // Fresh phase-2 effect tooling: the replay executed NOTHING.
      check(deployment.tools.calls.length === 0, `J9 no-duplicate-effect (phase2 tool calls=${deployment.tools.calls.length})`, checks);
      check(
        (await deployment.authority.admissionEffectJournal.getRecords()).length === factsCounts.journalRecords,
        'J9 no-duplicate-journal-record',
        checks,
      );
      const freshTurnReceiptsBefore = receiptsAfter.length;
      // A fresh decision turn still works normally after relaunch (recovery did
      // not wedge the store): one admitted rule turn, exactly one new receipt.
      const fresh = expectAdmitted(await deployment.assembly.resolveAndAdmitTurn(turnRequest({
        rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'post-relaunch' }) }),
        resolver: { harnessRunner: createXStateHarnessMachineRunner() },
        harness: harnessMaterial(new ScriptedModel([])),
        turn: { kind: 'message', sourceMessageId: 'j9-post-relaunch-turn' },
      })) as never) as Record<string, unknown>;
      check(fresh.status === 'admitted', 'J9 post-relaunch-turn-admitted', checks);
      const receiptsFresh = receiptsOf(await readAllRecords(store as never, TARGET));
      check(receiptsFresh.length === freshTurnReceiptsBefore + 1, 'J9 post-relaunch-exactly-one-new-receipt', checks);
    });

    for (const [caseId, result] of Object.entries(cases)) {
      await recordCaseRow(control, caseId, result);
    }
    await setStage(control, 'done', null);
    await deployment.authority.close();

    const all = await loadCases(control);
    const status = Object.values(all).every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL';
    return {
      status,
      phase: 2,
      stage: 'done',
      platform: 'expo-android-hermes',
      hermes,
      runtime: {
        sqliteEngine: await sqliteEngineVersion(),
        storeSchemaVersion: EXPO_RUNTIME_STORE_SCHEMA_VERSION,
        deps: T009_DEP_VERSIONS,
      },
      checkout: { head: T009_REPO_HEAD, tree: T009_REPO_TREE },
      packageId: T009_PACKAGE_ID,
      journeys: all,
      details,
    };
  } catch (error) {
    for (const [caseId, result] of Object.entries(cases)) {
      await recordCaseRow(control, caseId, result);
    }
    await deployment.authority.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Reconstruct the turn source behind a receipt for derivation re-assertion.
 * The receipts were all produced from message turns of the main instance, and
 * the durable control-turn identity is derived from (target, turn) alone — the
 * host ledger maps receipt identity back to its source message id.
 */
function deriveSourceHint(receipt: DecisionResolutionReceipt): { kind: 'message'; sourceMessageId: string } {
  const knownSourceMessageIds = [
    'j1-rule',
    'j2a-rule',
    'j2b-seed',
    'j2b-hit',
    'j2c-promoted',
    'j3-fresh',
    'j4a-fail-closed',
    'j4b-declared',
    'j4c-declared-denied',
    'j5a-guard',
    'j5b-invariant',
    'j9-post-relaunch-turn',
  ];
  for (const sourceMessageId of knownSourceMessageIds) {
    if (deriveDurableControlTurnId(TARGET, { kind: 'message', sourceMessageId }) === receipt.durableControlTurnId) {
      return { kind: 'message', sourceMessageId };
    }
  }
  throw new Error(`T009 device check failed: no known turn source derives ${receipt.durableControlTurnId}`);
}

/* ------------------------------------------------------------------------ */
/* Entry point                                                               */
/* ------------------------------------------------------------------------ */

export async function runT009DeviceValidation(): Promise<T009ValidationResult> {
  const control = await openControl();
  try {
    const { stage } = await getStage(control);
    if (stage === 'phase1') {
      return await runPhase1(control);
    }
    if (stage === 'phase2-armed') {
      return await runPhase2(control);
    }
    if (stage === 'done') {
      const all = await loadCases(control);
      return {
        status: Object.values(all).every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL',
        phase: 2,
        stage: 'done',
        platform: 'expo-android-hermes',
        hermes: hermesProof(),
        runtime: {
          sqliteEngine: await sqliteEngineVersion(),
          storeSchemaVersion: EXPO_RUNTIME_STORE_SCHEMA_VERSION,
          deps: T009_DEP_VERSIONS,
        },
        checkout: { head: T009_REPO_HEAD, tree: T009_REPO_TREE },
        packageId: T009_PACKAGE_ID,
        journeys: all,
        details: {},
      };
    }
    throw new Error(`T009 unknown control stage ${stage}`);
  } finally {
    await control.closeAsync?.();
  }
}
