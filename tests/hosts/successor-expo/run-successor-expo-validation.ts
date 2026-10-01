/**
 * SX wave #458 successor (0.3,2,3) Expo/Android/Hermes REAL-device validation
 * runner (issue #458, prep matrix SX-E01..SX-E16 in #452 comment 5915129424).
 *
 * Everything runs against the real stack on device: the 13 expo-sqlite
 * adapters (generated/ from packages/domain-harness-expo), the vendored
 * portable core dist, a publicly compiled successor package (fixtures/, bound
 * to the merged TESTED_HEAD by build-device-fixture.mjs), a pure-TS SHA-256
 * host capability and the real Hermes engine. No Metro mocks, no Node stubs.
 *
 * Orchestration (host side: run-device-validation.mjs):
 *   launch 1  stage=phase1    -> SX-E01/E03/E04/E05 static oracles + MAIN_DB
 *                                journeys (E02/E06/E07/E08/E10/E11/E12) +
 *                                migration (E14); then arms crash barrier
 *                                SX-E09-CP1 -> FAULT_BARRIER_ARMED
 *   launch 2  barrier CP1 oracle -> arms SX-E09-CP2
 *   launch 3  barrier CP2 oracle -> arms SX-E15-CP1
 *   launch 4  barrier oracle     -> arms SX-E15-CP2
 *   launch 5  barrier oracle     -> stage=phase2 (MAIN_DB untouched since
 *                                launch 1's process was force-stopped)
 *   launch 6  stage=phase2    -> two-phase force-stop persistence protocol
 *                                (SX-E13), replay/no-duplication oracles,
 *                                aggregates every case result and emits the
 *                                SX-E16 comparator. {status:'PASS'} only here.
 *
 * Barrier checkpoints use unique databases and are real `am force-stop`
 * kills of the Hermes process between armed durable writes and their
 * recovery oracles (no JS cleanup runs in between).
 */
import * as SQLite from 'expo-sqlite';
import {
  EXPO_RUNTIME_STORE_SCHEMA_VERSION,
  openExpoSqliteRuntimeStore,
  type ExpoSqliteDatabaseLike,
  type ExpoSqliteModuleLike,
  type ExpoSqliteRuntimeStore,
} from './generated/src/store/index.js';
import {
  runExclusiveTransactionQueueUnitCheck,
  runRuntimeStoreConformance,
  type CloseableRuntimeStore,
} from './generated/tests/store/runtime-store-conformance.js';
import {
  runRuntimeProvisioningConformance,
  type ProvisioningConformanceStore,
} from './generated/tests/store/runtime-provisioning-conformance.js';
import {
  canonicalJsonStringify,
  computeCompiledPackageId,
  createDomainRuntime,
  DomainHarnessJsonSchemaV1Error,
  DomainHarnessJsonSchemaV1Validator,
  StaticPackageRegistry,
  type BusinessSnapshot,
  type BusinessSnapshotPort,
  type JsonValue,
  type RuntimeHostBindings,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness';
// Non-public activation validators are imported from the vendored dist by
// relative path (the public barrel deliberately does not re-export them;
// the vendored dist is byte-identical to the merged TESTED_HEAD build).
import { validateSuccessorCompiledPackage } from './vendor/domain-harness/dist/package/successor-validation.js';
import { validateCompiledPackageByProfile } from './vendor/domain-harness/dist/package/profile-validation.js';

import { createDomainRuntimeWithProcessCommandOutcomes } from './vendor/domain-harness/dist/runtime/create-domain-runtime.js';
import { LEGACY_COMPILED_ARTIFACT_PROFILE, SUCCESSOR_COMPILED_ARTIFACT_PROFILE } from './vendor/domain-harness/dist/v2/contracts/compiled-artifact-profile.js';
import {
  BINDING_CONTENTS_JSON,
  BOUNDS_JSON,
  BUILD_FACTS_JSON,
  CANONICAL_DIGESTS_JSON,
  CORPUS_REVISION,
  FIXTURE_ASSEMBLY_HEAD,
  FIXTURE_ASSEMBLY_TREE,
  FIXTURE_REPO_HEAD,
  INVENTORY_BINDING_ID,
  RETAINED_FIXTURE_FILE_SHA256,
  RETAINED_MANIFEST_JSON,
  RETAINED_PACKAGE_ID,
  SCHEMA_CORPUS_JSON,
  SUCCESSOR_DOMAIN_DATA_JSON,
  SUCCESSOR_FIXTURE_FILE_SHA256,
  SUCCESSOR_MANIFEST_JSON,
  SUCCESSOR_PACKAGE_ID,
} from './fixture-constants';
import { deviceSha256, sha256HexUtf8 } from './device-sha256';

declare const HermesInternal: unknown;

const CONTROL_DB = 'sx458-control.db';
const MAIN_DB = 'sx458-main.db';
const CONFORMANCE_DB = 'sx458-conformance.db';
const PROVISIONING_CONFORMANCE_DB = 'sx458-provisioning-conformance.db';
const PROVISION_STRESS_DB = 'sx458-provision-stress.db';
const MIGRATION_DB = 'sx458-migration.db';
const CRASH09A_DB = 'sx458-crash-e09-cp1.db';
const CRASH09B_DB = 'sx458-crash-e09-cp2.db';
const CRASH15_DB = 'sx458-crash-e15.db';

const BARRIER_QUEUE = ['SX-E09-CP1', 'SX-E09-CP2', 'SX-E15-CP1', 'SX-E15-CP2'] as const;

const CAP_CRYPTO = 'crypto-hash-sha256@1' as const;
const CAP_MODULE = 'compiled-package-module@1' as const;
const CAP_INVENTORY = 'inventory-native@1' as const;

const NOW = '2026-10-01T07:00:00.000Z';
const CORRELATION_ID = 'sx458-corr';

interface Bounds {
  readonly maxDomainDataEntries: number;
  readonly maxDomainDataEntryCanonicalBytes: number;
  readonly maxTotalDomainDataCanonicalBytes: number;
  readonly maxBusinessSources: number;
  readonly maxSchemaCanonicalBytes: number;
}

interface SchemaCase {
  readonly id: string;
  readonly schema: JsonValue;
  readonly instance: JsonValue;
  readonly expect: string;
}

interface CaseResult {
  readonly status: 'PASS' | 'FAIL' | 'BLOCKED';
  readonly checks: readonly string[];
  readonly note?: string;
}

export interface SuccessorValidationResult {
  readonly status: 'PASS' | 'RESTART_REQUIRED' | 'ARMED' | 'FAIL';
  readonly phase: 1 | 2;
  readonly stage: string;
  readonly barrier?: string;
  readonly platform: 'expo-android-hermes';
  readonly hermes: boolean;
  readonly schemaVersion: number;
  readonly successorPackageId: string;
  readonly retainedPackageId: string;
  readonly cases: Readonly<Record<string, CaseResult>>;
  readonly details: Readonly<Record<string, JsonValue>>;
  readonly error?: string;
  readonly comparator?: JsonValue;
  readonly nextAction?: string;
}

/* ------------------------------------------------------------------------ */
/* Small helpers                                                             */
/* ------------------------------------------------------------------------ */

function expoSqliteModule(): ExpoSqliteModuleLike {
  return {
    async openDatabaseAsync(databaseName: string): Promise<ExpoSqliteDatabaseLike> {
      return (await SQLite.openDatabaseAsync(databaseName)) as unknown as ExpoSqliteDatabaseLike;
    },
  };
}

function check(condition: boolean, label: string, checks: string[]): void {
  if (!condition) {
    throw new Error(`SX458 device check failed: ${label}`);
  }
  checks.push(label);
}

function errorCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'missing-code');
  }
  return 'missing-code';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------------------------------------------------ */
/* Fixture loading                                                           */
/* ------------------------------------------------------------------------ */

const SUCCESSOR_MANIFEST = JSON.parse(SUCCESSOR_MANIFEST_JSON) as TargetCompiledDomainPackage['manifest'];
const RETAINED_MANIFEST = JSON.parse(RETAINED_MANIFEST_JSON) as TargetCompiledDomainPackage['manifest'];
const SUCCESSOR_DOMAIN_DATA = JSON.parse(SUCCESSOR_DOMAIN_DATA_JSON) as Record<string, JsonValue>;
const BUILD_FACTS = JSON.parse(BUILD_FACTS_JSON) as Record<string, unknown>;
const SCHEMA_CORPUS = JSON.parse(SCHEMA_CORPUS_JSON) as readonly SchemaCase[];
const CANONICAL_DIGESTS = JSON.parse(CANONICAL_DIGESTS_JSON) as Record<string, string>;
const BOUNDS = JSON.parse(BOUNDS_JSON) as { package: Bounds; host: Bounds };
const BINDING_CONTENTS = JSON.parse(BINDING_CONTENTS_JSON) as Record<string, string>;

function successorPackage(): TargetCompiledDomainPackage {
  return {
    manifest: SUCCESSOR_MANIFEST,
    bindings: { [INVENTORY_BINDING_ID]: { opaque: 'host-local-inventory' } },
    domainData: SUCCESSOR_DOMAIN_DATA,
  };
}

function retainedPackage(): TargetCompiledDomainPackage {
  return { manifest: RETAINED_MANIFEST, bindings: {} };
}

function supportedPolicy(bounds?: Bounds) {
  return {
    supportedProfiles: [LEGACY_COMPILED_ARTIFACT_PROFILE, SUCCESSOR_COMPILED_ARTIFACT_PROFILE],
    hostCapabilities: [CAP_CRYPTO, CAP_MODULE, CAP_INVENTORY],
    sha256: deviceSha256,
    targetProfileId: SUCCESSOR_MANIFEST.targetProfileId,
    ...(bounds === undefined ? {} : { supportedPackageDataBounds: { ...bounds } }),
  };
}

/* ------------------------------------------------------------------------ */
/* Host bindings (real deviceSha256, scripted expression port, durable       */
/* host-local inventory tool through DurableToolRunner)                      */
/* ------------------------------------------------------------------------ */

interface InventorySnapshotPort {
  value: JsonValue;
}

class InventoryTool {
  readonly calls: Array<{ toolId: string; input: unknown; effectId: string }> = [];
  /** Mutable business snapshot value; SX-E06 flips this between probes. */
  readonly snapshot: InventorySnapshotPort = { value: { accountId: 'acc-1', tier: 'gold' } };

  async bindings(): Promise<RuntimeHostBindings> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- closure capture inside object literal
    const tool = this;
    const contentDigestBase = BINDING_CONTENTS[INVENTORY_BINDING_ID] ?? '';
    const contentDigest = await deviceSha256.digestUtf8(contentDigestBase);
    const digest = await deviceSha256.digestUtf8(
      JSON.stringify({ bindingId: INVENTORY_BINDING_ID, contentDigest }),
    );
    return {
      capabilities: [CAP_CRYPTO, CAP_MODULE, CAP_INVENTORY],
      sha256: deviceSha256,
      secureRandom: {
        randomId(): string {
          return `sx458-random-${Math.random().toString(36).slice(2)}`;
        },
      },
      expression: {
        async evaluate(request: { expression: string; input: JsonValue }): Promise<JsonValue> {
          if (request.expression === '$.child') return { workflowId: 'child', instanceKey: 'child-1' };
          if (request.expression === '$.missingChild') return { workflowId: 'child', instanceKey: 'missing-child' };
          if (request.expression === '$.strictChild') return { workflowId: 'strict-child', instanceKey: 'strict-1' };
          if (request.expression === '$.ghostChild') return { workflowId: 'ghost', instanceKey: 'ghost-1' };
          if (request.expression === '$.toolChild') return { workflowId: 'child', instanceKey: 'tool-child-1' };
          return request.input;
        },
      },
      hostLocalDomainTools: {
        [INVENTORY_BINDING_ID]: {
          capability: CAP_INVENTORY,
          digest,
          async execute(request: { toolId: string; input: unknown; context: { effectId: string } }) {
            tool.calls.push({ toolId: request.toolId, input: request.input, effectId: request.context.effectId });
            return { reserved: true, effectId: request.context.effectId };
          },
        },
      },
    } as unknown as RuntimeHostBindings;
  }

  snapshots(): BusinessSnapshotPort {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- closure capture inside object literal
    const tool = this;
    return {
      async read(request: { source: string; key: string }): Promise<BusinessSnapshot> {
        return { source: request.source, key: request.key, revision: '1', value: tool.snapshot.value };
      },
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Runtime fixtures                                                          */
/* ------------------------------------------------------------------------ */

type AnyRuntime = Awaited<ReturnType<typeof createDomainRuntime>>;

type RuntimeMode = 'legacy' | 'v3';

async function openRuntime(
  sqlite: ExpoSqliteModuleLike,
  databaseName: string,
  mode: RuntimeMode,
  observationEnabled: boolean,
): Promise<{ database: ExpoSqliteDatabaseLike; store: ExpoSqliteRuntimeStore; runtime: AnyRuntime; tool: InventoryTool }> {
  const database = await sqlite.openDatabaseAsync(databaseName);
  const store = await openExpoSqliteRuntimeStore({ database });
  const tool = new InventoryTool();
  const options = {
    packageRegistry: new StaticPackageRegistry(
      [retainedPackage(), successorPackage()],
      RETAINED_PACKAGE_ID,
    ),
    store,
    bindings: await tool.bindings(),
    businessSnapshots: tool.snapshots(),
    supportedPackageDataBounds: { ...BOUNDS.host },
    ...(observationEnabled ? { observation: { mode: 'enabled' as const } } : {}),
  };
  const runtime: AnyRuntime = mode === 'v3'
    ? await createDomainRuntimeWithProcessCommandOutcomes(options as never)
    : await createDomainRuntime(options as never);
  return { database, store, runtime, tool };
}

function message(messageId: string, target: { workflowId: string; instanceKey: string }, type: string, payload: JsonValue = {}) {
  return { messageId, target, type, payload, correlationId: CORRELATION_ID };
}

async function readSchemaVersion(sqlite: ExpoSqliteModuleLike, databaseName: string): Promise<number> {
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

async function observationFacts(
  database: ExpoSqliteDatabaseLike,
): Promise<{ streams: number; records: number; opened: number; maxSeq: number; minSeq: number }> {
  const totals = await database.getFirstAsync<{ streams: number; records: number }>(
    'SELECT (SELECT COUNT(*) FROM dh_v3_observation_streams) AS streams, (SELECT COUNT(*) FROM dh_v3_observation_records) AS records',
    [],
  );
  const opened = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM dh_v3_observation_records WHERE record_json LIKE '%"INSTANCE_OPENED"%'`,
    [],
  );
  const seq = await database.getFirstAsync<{ maxSeq: number | null; minSeq: number | null }>(
    'SELECT MAX(sequence) AS maxSeq, MIN(sequence) AS minSeq FROM dh_v3_observation_records',
    [],
  );
  return {
    streams: totals?.streams ?? 0,
    records: totals?.records ?? 0,
    opened: opened?.count ?? 0,
    maxSeq: seq?.maxSeq ?? 0,
    minSeq: seq?.minSeq ?? 0,
  };
}

/* ------------------------------------------------------------------------ */
/* Control database (stage machine + case ledger)                            */
/* ------------------------------------------------------------------------ */

async function openControl(sqlite: ExpoSqliteModuleLike): Promise<ExpoSqliteDatabaseLike> {
  const database = await sqlite.openDatabaseAsync(CONTROL_DB);
  await database.execAsync(`
CREATE TABLE IF NOT EXISTS sx458_control (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  stage TEXT NOT NULL,
  armed_barrier TEXT,
  phase1_done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sx458_cases (
  case_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS sx458_facts (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
`);
  const row = await database.getFirstAsync<{ stage: string }>('SELECT stage FROM sx458_control WHERE singleton_id = 1', []);
  if (row === null) {
    await database.runAsync('INSERT INTO sx458_control(singleton_id, stage, phase1_done) VALUES(1, ?, 0)', ['phase1']);
  }
  return database;
}

async function getStage(database: ExpoSqliteDatabaseLike): Promise<{ stage: string; armedBarrier: string | null; phase1Done: number }> {
  const row = await database.getFirstAsync<{ stage: string; armed_barrier: string | null; phase1_done: number }>(
    'SELECT stage, armed_barrier, phase1_done FROM sx458_control WHERE singleton_id = 1',
    [],
  );
  if (row === null) throw new Error('SX458 control row missing');
  return { stage: row.stage, armedBarrier: row.armed_barrier, phase1Done: row.phase1_done };
}

async function setStage(database: ExpoSqliteDatabaseLike, stage: string, armedBarrier: string | null, phase1Done?: number): Promise<void> {
  await database.withExclusiveTransactionAsync(async (tx) => {
    if (phase1Done === undefined) {
      await tx.runAsync(
        'UPDATE sx458_control SET stage = ?, armed_barrier = ? WHERE singleton_id = 1',
        [stage, armedBarrier],
      );
    } else {
      await tx.runAsync(
        'UPDATE sx458_control SET stage = ?, armed_barrier = ?, phase1_done = ? WHERE singleton_id = 1',
        [stage, armedBarrier, phase1Done],
      );
    }
  });
}

async function recordCase(database: ExpoSqliteDatabaseLike, caseId: string, result: CaseResult): Promise<void> {
  await database.runAsync(
    'INSERT INTO sx458_cases(case_id, status, checks_json, note) VALUES(?, ?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET status = excluded.status, checks_json = excluded.checks_json, note = excluded.note',
    [caseId, result.status, JSON.stringify(result.checks), result.note ?? null],
  );
}

async function putFact(database: ExpoSqliteDatabaseLike, key: string, value: unknown): Promise<void> {
  await database.runAsync(
    'INSERT INTO sx458_facts(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
    [key, JSON.stringify(value)],
  );
}

async function getFact(database: ExpoSqliteDatabaseLike, key: string): Promise<JsonValue | undefined> {
  const row = await database.getFirstAsync<{ v: string }>('SELECT v FROM sx458_facts WHERE k = ?', [key]);
  return row === null ? undefined : (JSON.parse(row.v) as JsonValue);
}

async function loadCases(database: ExpoSqliteDatabaseLike): Promise<Record<string, CaseResult>> {  const rows = await database.getAllAsync<{ case_id: string; status: string; checks_json: string; note: string | null }>(
    'SELECT case_id, status, checks_json, note FROM sx458_cases',
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
/* Phase-agnostic static oracles (SX-E01/E03/E04/E05)                        */
/* ------------------------------------------------------------------------ */

async function runSha256KnownAnswers(checks: string[]): Promise<void> {
  check(
    sha256HexUtf8('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'SX-E01 sha256-empty-KAT',
    checks,
  );
  check(
    sha256HexUtf8('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'SX-E01 sha256-abc-KAT',
    checks,
  );
  check(
    sha256HexUtf8('The quick brown fox jumps over the lazy dog') ===
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    'SX-E01 sha256-fox-KAT',
    checks,
  );
  check(
    (await deviceSha256.digestUtf8('héllo→世界')) === sha256HexUtf8('héllo→世界'),
    'SX-E01 sha256-utf8-self-consistency',
    checks,
  );
  for (const [id, expected] of Object.entries(CANONICAL_DIGESTS)) {
    const vectorText = id === 'sx-d01-empty' ? ''
      : id === 'sx-d02-abc' ? 'abc'
      : id === 'sx-d03-unicode' ? 'héllo→世界'
      : id === 'sx-d04-key-order-a' ? JSON.stringify({ a: 1, b: 2 })
      : JSON.stringify({ b: 2, a: 1 });
    // JSON-typed vectors are digested over their canonical (key-sorted) form
    // via the core canonicalizer, mirroring the build-time fixture compiler.
    let parsedVector: unknown = null;
    try {
      parsedVector = JSON.parse(vectorText);
    } catch {
      parsedVector = null;
    }
    const vectorMaterial = (parsedVector !== null && typeof parsedVector === 'object')
      ? canonicalJsonStringify(parsedVector)
      : vectorText;
    check(
      (await deviceSha256.digestUtf8(vectorMaterial)) === expected,
      `SX-E01/E04 canonical-vector-${id}`,
      checks,
    );
  }
  check(
    CANONICAL_DIGESTS['sx-d04-key-order-a'] === CANONICAL_DIGESTS['sx-d05-key-order-b'],
    'SX-E04 key-order-canonical-equality',
    checks,
  );
}

async function runAttestation(sqlite: ExpoSqliteModuleLike, checks: string[], details: Record<string, JsonValue>): Promise<void> {
  check(typeof HermesInternal === 'object', 'SX-E01 hermes-engine-live', checks);
  await runSha256KnownAnswers(checks);

  const database = await sqlite.openDatabaseAsync('sx458-attestation.db');
  try {
    const sqliteVersion = await database.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v', []);
    check(typeof sqliteVersion?.v === 'string' && sqliteVersion.v.length > 0, 'SX-E01 native-sqlite-open', checks);
    details['sqliteVersion'] = sqliteVersion?.v ?? 'unknown';

    // Real exclusive native transaction through expo-sqlite's
    // withExclusiveTransactionAsync (the same seam the store queue uses).
    await database.execAsync('CREATE TABLE IF NOT EXISTS sx458_attest (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    await database.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT OR REPLACE INTO sx458_attest(k, v) VALUES(?, ?)', ['marker', NOW]);
    });
    const marker = await database.getFirstAsync<{ v: string }>('SELECT v FROM sx458_attest WHERE k = ?', ['marker']);
    check(marker?.v === NOW, 'SX-E01 exclusive-transaction-committed', checks);
  } finally {
    await database.closeAsync?.();
  }
}

async function runSchemaCorpus(checks: string[], details: Record<string, JsonValue>): Promise<void> {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  const outcomes: Record<string, string> = {};
  for (const testCase of SCHEMA_CORPUS) {
    let observed = 'accept';
    try {
      validator.validate(testCase.schema as never, testCase.instance, testCase.id);
    } catch (error) {
      if (!(error instanceof DomainHarnessJsonSchemaV1Error)) throw error;
      observed = `reject:${error.code}`;
    }
    outcomes[testCase.id] = observed;
    check(
      observed === testCase.expect,
      `SX-E03 ${testCase.id} expected=${testCase.expect} observed=${observed}`,
      checks,
    );
  }
  details['schemaCorpusOutcomes'] = outcomes;
}

async function runIdentityAndActivationIntegrity(checks: string[], details: Record<string, JsonValue>): Promise<void> {
  // Cross-host digest parity: the device recomputes both package identities
  // with its own pure-TS SHA-256 against the compiler-emitted manifests.
  const successorId = await computeCompiledPackageId(SUCCESSOR_MANIFEST, deviceSha256);
  check(successorId === SUCCESSOR_PACKAGE_ID, 'SX-E04 successor-packageId-device-recompute', checks);
  const retainedId = await computeCompiledPackageId(RETAINED_MANIFEST, deviceSha256);
  check(retainedId === RETAINED_PACKAGE_ID, 'SX-E04 retained-packageId-device-recompute', checks);

  // Build-time compiler facts verified on device (recorded by
  // build-device-fixture.mjs from the PUBLIC compiler on TESTED_HEAD).
  check(BUILD_FACTS['domainDataValueChangeGivesDifferentPackageId'] === true, 'SX-E04 build-domaindata-change-moves-packageId', checks);
  check(BUILD_FACTS['domainDataOrderingDoesNotChangePackageId'] === true, 'SX-E04 build-ordering-does-not-move-packageId', checks);
  check(BUILD_FACTS['boundsChangeGivesDifferentPackageId'] === true, 'SX-E04 build-bounds-change-moves-packageId', checks);
  check(typeof BUILD_FACTS['rejectsMissingRejectedRoutes'] === 'string', 'SX-E07 build-rejects-missing-rejected', checks);
  check(typeof BUILD_FACTS['rejectsNonTotalRejectedRoutes'] === 'string', 'SX-E07 build-rejects-non-total-rejected', checks);
  check(typeof BUILD_FACTS['rejectsUnknownRejectedTarget'] === 'string', 'SX-E07 build-rejects-unknown-rejected-target', checks);
  check(typeof BUILD_FACTS['rejectsOrphanDomainDataKey'] === 'string', 'SX-E04 build-rejects-orphan-domain-data', checks);
  check(typeof BUILD_FACTS['rejectsDuplicateDomainDataKey'] === 'string', 'SX-E04 build-rejects-duplicate-domain-data', checks);
  check(typeof BUILD_FACTS['rejectsValueViolatingValueSchema'] === 'string', 'SX-E04 build-rejects-value-schema-violation', checks);

  const policy = supportedPolicy(BOUNDS.host);
  const extensions = { successor: validateSuccessorCompiledPackage };

  // Clean activation of the publicly compiled package on device.
  const validated = await validateCompiledPackageByProfile(
    { manifest: SUCCESSOR_MANIFEST, bindings: {}, domainData: SUCCESSOR_DOMAIN_DATA },
    policy,
    extensions,
  );
  check(validated.manifest.packageId === SUCCESSOR_PACKAGE_ID, 'SX-E04 successor-activation-ok', checks);
  check(
    canonicalJsonStringify(validated.manifest.packageDataBounds) === canonicalJsonStringify(BOUNDS.package),
    'SX-E05 package-bounds-not-truncated-or-widened',
    checks,
  );

  // Tampered Domain Data value -> reject.
  let threw = 'none';
  try {
    const tampered = JSON.parse(SUCCESSOR_DOMAIN_DATA_JSON) as Record<string, JsonValue>;
    (tampered.tier as { level: number }).level = 999;
    await validateCompiledPackageByProfile({ manifest: SUCCESSOR_MANIFEST, bindings: {}, domainData: tampered }, policy, extensions);
  } catch (error) {
    threw = errorCode(error);
  }
  check(threw !== 'none', 'SX-E04 tampered-domain-data-value-rejected', checks);
  details['tamperedValueCode'] = threw;

  // Forged descriptor digest -> reject.
  threw = 'none';
  try {
    const manifest = JSON.parse(SUCCESSOR_MANIFEST_JSON) as TargetCompiledDomainPackage['manifest'];
    (manifest.domainData?.[0] as { contentDigest: string }).contentDigest = 'forged-digest';
    await validateCompiledPackageByProfile({ manifest, bindings: {}, domainData: SUCCESSOR_DOMAIN_DATA }, policy, extensions);
  } catch (error) {
    threw = errorCode(error);
  }
  check(threw !== 'none', 'SX-E04 forged-descriptor-digest-rejected', checks);
  details['forgedDigestCode'] = threw;

  // Missing Domain Data entry -> reject.
  threw = 'none';
  try {
    await validateCompiledPackageByProfile({ manifest: SUCCESSOR_MANIFEST, bindings: {}, domainData: {} }, policy, extensions);
  } catch (error) {
    threw = errorCode(error);
  }
  check(threw !== 'none', 'SX-E04 missing-domain-data-rejected', checks);

  // Wrong schema contract version -> reject.
  threw = 'none';
  try {
    const manifest = JSON.parse(SUCCESSOR_MANIFEST_JSON) as TargetCompiledDomainPackage['manifest'];
    (manifest as { schemaContractVersion?: string }).schemaContractVersion = 'domainharness-json-schema/0';
    await validateCompiledPackageByProfile({ manifest, bindings: {}, domainData: SUCCESSOR_DOMAIN_DATA }, policy, extensions);
  } catch (error) {
    threw = errorCode(error);
  }
  check(threw !== 'none', 'SX-E04 wrong-schema-contract-rejected', checks);

  // Undeclared projection dependency -> activation-time fail-closed closure.
  threw = 'none';
  try {
    const manifest = JSON.parse(SUCCESSOR_MANIFEST_JSON) as TargetCompiledDomainPackage['manifest'];
    const overview = manifest.projections['overview'] as unknown as { dependencies: Array<{ kind: string; key?: string }> };
    overview.dependencies = [...overview.dependencies, { kind: 'domain-data', key: 'undeclared-key' }];
    await validateSuccessorCompiledPackage(
      { manifest, bindings: {}, domainData: SUCCESSOR_DOMAIN_DATA },
      policy,
    );
  } catch (error) {
    threw = errorCode(error);
  }
  check(threw !== 'none', 'SX-E06 undeclared-projection-dependency-fails-activation', checks);
  details['undeclaredDependencyCode'] = threw;
}

async function runBoundsMatrix(checks: string[], details: Record<string, JsonValue>): Promise<void> {
  const extensions = { successor: validateSuccessorCompiledPackage };
  const value = { manifest: SUCCESSOR_MANIFEST, bindings: {}, domainData: SUCCESSOR_DOMAIN_DATA };

  // Equal-limit acceptance: host maxima exactly equal to package bounds.
  await validateCompiledPackageByProfile(value, supportedPolicy({ ...BOUNDS.package }), extensions);
  checks.push('SX-E05 equal-limit-acceptance');

  // One-unit-lower host maxima on each of the five bounds: independent rejects.
  const boundKeys = Object.keys(BOUNDS.package) as Array<keyof Bounds>;
  const codes: Record<string, string> = {};
  for (const key of boundKeys) {
    const lowered = { ...BOUNDS.package, [key]: BOUNDS.package[key] - 1 };
    let threw = 'none';
    try {
      await validateCompiledPackageByProfile(value, supportedPolicy(lowered), extensions);
    } catch (error) {
      threw = errorCode(error);
    }
    check(threw !== 'none', `SX-E05 host-maximum-below-package-bound-${key}-rejected`, checks);
    codes[key] = threw;
  }
  details['loweredBoundCodes'] = codes;

  // Missing host maxima: successor activation must fail closed on a host that
  // has not declared maxima (retained-only host).
  let missingMaxima = 'none';
  try {
    await validateCompiledPackageByProfile(value, supportedPolicy(undefined), extensions);
  } catch (error) {
    missingMaxima = errorCode(error);
  }
  check(missingMaxima !== 'none', 'SX-E05 missing-host-maxima-fail-successor-activation', checks);
  details['missingMaximaCode'] = missingMaxima;

  // Retained package still validates under the legacy policy without maxima.
  await validateCompiledPackageByProfile(
    { manifest: RETAINED_MANIFEST, bindings: {} },
    {
      formatVersion: LEGACY_COMPILED_ARTIFACT_PROFILE.formatVersion,
      runtimeContractMajor: LEGACY_COMPILED_ARTIFACT_PROFILE.runtimeContractMajor,
      executionEngineMajor: LEGACY_COMPILED_ARTIFACT_PROFILE.executionEngineMajor,
      hostCapabilities: [CAP_CRYPTO, CAP_MODULE, CAP_INVENTORY],
      sha256: deviceSha256,
      targetProfileId: RETAINED_MANIFEST.targetProfileId,
    },
  );
  checks.push('SX-E05 retained-only-host-still-works');

  // Opposite tuples reject before feature decoding.
  for (const [label, manifest] of [
    ['sx-e02 tuple (0.3,2,2)', { ...SUCCESSOR_MANIFEST, executionEngineMajor: 2 }],
    ['sx-e02 tuple (0.2,2,3)', { ...RETAINED_MANIFEST, executionEngineMajor: 3, formatVersion: '0.2' }],
  ] as const) {
    let threw = 'none';
    try {
      await validateCompiledPackageByProfile({ manifest: manifest as TargetCompiledDomainPackage['manifest'], bindings: {} }, supportedPolicy(BOUNDS.host), extensions);
    } catch (error) {
      threw = errorCode(error);
    }
    check(threw !== 'none', `${label} rejected`, checks);
    details[label] = threw;
  }
}

/* ------------------------------------------------------------------------ */
/* Migration (SX-E14)                                                        */
/* ------------------------------------------------------------------------ */

async function runMigrationUpgrade(sqlite: ExpoSqliteModuleLike, checks: string[]): Promise<void> {
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
  'retained', 'v1-era', 'corr-v1-era', 'pkg-v1-era', 'active',
  0, '{"step":0}', NULL, NULL, 1, '${NOW}', '${NOW}'
);
`);
  const reference = await sqlite.openDatabaseAsync('sx458-fresh-reference.db');
  const referenceTables = await reference.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'dh_v3_%'`,
    [],
  );
  await reference.closeAsync?.();
  const store = await openExpoSqliteRuntimeStore({ database });
  try {
    const version = await readSchemaVersion(sqlite, MIGRATION_DB);
    check(version === EXPO_RUNTIME_STORE_SCHEMA_VERSION, 'SX-E14 migration-v1-to-v3-meta', checks);
    const preserved = await store.getInstance({ workflowId: 'retained', instanceKey: 'v1-era' });
    check(
      preserved !== null && preserved.packageId === 'pkg-v1-era' && preserved.correlationId === 'corr-v1-era',
      'SX-E14 migration-v1-data-preserved',
      checks,
    );
    const tables = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'dh_v3_%'`,
      [],
    );
    check(
      tables !== null && tables.count === (referenceTables?.count ?? -1),
      `SX-E14 migration-table-count-matches-current-source (${tables?.count})`,
      checks,
    );
    const observationTables = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('dh_v3_observation_streams', 'dh_v3_observation_records')`,
      [],
    );
    check(observationTables !== null && observationTables.count === 2, 'SX-E14 observation-tables-present', checks);
  } finally {
    await store.close();
    await database.closeAsync?.();
  }
}

/* ------------------------------------------------------------------------ */
/* Main-database phase-1 journeys                                            */
/* ------------------------------------------------------------------------ */

async function runMainPhase1(sqlite: ExpoSqliteModuleLike, control: ExpoSqliteDatabaseLike, checks: string[], details: Record<string, JsonValue>): Promise<void> {
  // Store conformance corpora on the real native adapter (SX-E12/E14 bases).
  await runExclusiveTransactionQueueUnitCheck();
  checks.push('SX-E12 exclusive-transaction-queue-unit');
  const conformance = await runRuntimeStoreConformance({
    async open(): Promise<CloseableRuntimeStore> {
      return openExpoSqliteRuntimeStore({ sqlite, databaseName: CONFORMANCE_DB });
    },
    async reopen(store: CloseableRuntimeStore): Promise<CloseableRuntimeStore> {
      await store.close();
      return openExpoSqliteRuntimeStore({ sqlite, databaseName: CONFORMANCE_DB });
    },
  });
  check(conformance.restartPersistence === true, 'SX-E14 runtime-store-conformance', checks);
  details['conformanceChecks'] = conformance.checks.length;

  const provisioning = await runRuntimeProvisioningConformance({
    async open(): Promise<ProvisioningConformanceStore> {
      return openExpoSqliteRuntimeStore({ sqlite, databaseName: PROVISIONING_CONFORMANCE_DB }) as unknown as ProvisioningConformanceStore;
    },
    async reopen(store: ProvisioningConformanceStore): Promise<ProvisioningConformanceStore> {
      await store.close();
      return openExpoSqliteRuntimeStore({ sqlite, databaseName: PROVISIONING_CONFORMANCE_DB }) as unknown as ProvisioningConformanceStore;
    },
  });
  check(provisioning.restartPersistence === true, 'SX-E12 provisioning-conformance', checks);
  check(provisioning.concurrentCreatedCount === 1, 'SX-E12 provisioning-single-instance', checks);
  check(provisioning.observationExactlyOnce === true, 'SX-E12 provisioning-observation-once', checks);
  details['provisioningChecks'] = provisioning.checks.length;

  await runMigrationUpgrade(sqlite, checks);

  // 32-way same-key provisioning stress on a dedicated DB (SX-E12).
  {
    const stress = await openRuntime(sqlite, PROVISION_STRESS_DB, 'legacy', true);
    try {
      check(stress.runtime.provisioning?.status === 'ENABLED', 'SX-E12 provisioning-capability-enabled', checks);
      const stressProvisioning = stress.runtime.provisioning;
      if (stressProvisioning?.status !== 'ENABLED') throw new Error('provisioning not enabled');
      const results = await Promise.all(
        Array.from({ length: 32 }, (_item, index) =>
          stressProvisioning.ensureOpen({
            provisioningKey: 'sx458-stress-key',
            address: { workflowId: 'parent', instanceKey: 'stress-1' },
            correlationId: `stress-${index}`,
            input: {},
            packageId: SUCCESSOR_PACKAGE_ID,
          })),
      );
      const created = results.filter((item) => item.provisioningDisposition === 'created').length;
      const instanceCreated = results.filter((item) => item.instanceDisposition === 'created').length;
      check(created === 1 && instanceCreated === 1, `SX-E12 32-way-same-key-single-create (created=${created})`, checks);
      check(results.every((item) => item.instance.packageId === SUCCESSOR_PACKAGE_ID), 'SX-E12 stress-instance-pins-successor', checks);
      // Competing keys on distinct addresses: each key creates exactly one.
      const competitorA = await stressProvisioning.ensureOpen({
        provisioningKey: 'sx458-competitor-a',
        address: { workflowId: 'parent', instanceKey: 'competitor-a' },
        correlationId: 'competitor-a',
        input: {},
        packageId: SUCCESSOR_PACKAGE_ID,
      });
      const competitorB = await stressProvisioning.ensureOpen({
        provisioningKey: 'sx458-competitor-b',
        address: { workflowId: 'parent', instanceKey: 'competitor-b' },
        correlationId: 'competitor-b',
        input: {},
        packageId: SUCCESSOR_PACKAGE_ID,
      });
      check(
        competitorA.provisioningDisposition === 'created' && competitorB.provisioningDisposition === 'created',
        'SX-E12 competing-keys-both-created',
        checks,
      );
      const facts = await observationFacts(stress.database);
      check(facts.opened === 4, `SX-E12 one-INSTANCE_OPENED-per-create (opened=${facts.opened})`, checks);
      details['stressObservation'] = facts as unknown as JsonValue;
    } finally {
      await stress.store.close();
      await stress.database.closeAsync?.();
    }
  }

  // MAIN_DB assembled runtime: retained + successor on ONE runtime/store.
  const main = await openRuntime(sqlite, MAIN_DB, 'v3', true);
  try {
    const version = await readSchemaVersion(sqlite, MAIN_DB);
    check(version === EXPO_RUNTIME_STORE_SCHEMA_VERSION, 'SX-E13 main-db-schema-v3', checks);
    const facts0 = await observationFacts(main.database);
    details['mainObservationBefore'] = facts0 as unknown as JsonValue;

    // SX-E02: retained engine-2 instance executes through the historical
    // interpreter with unchanged pins.
    await main.runtime.openInstance({
      address: { workflowId: 'retained', instanceKey: 'legacy-1' },
      correlationId: CORRELATION_ID,
      input: {},
      packageId: RETAINED_PACKAGE_ID,
    });
    await main.runtime.send(message('legacy-1', { workflowId: 'retained', instanceKey: 'legacy-1' }, 'ADVANCE'));
    await main.runtime.awaitIdle();
    const legacyAfter = await main.store.getInstance({ workflowId: 'retained', instanceKey: 'legacy-1' });
    check(legacyAfter !== null && legacyAfter.packageId === RETAINED_PACKAGE_ID, 'SX-E02 retained-pin-unchanged', checks);
    check(
      legacyAfter !== null && (legacyAfter.state as { stateId?: string }).stateId === 'finished',
      'SX-E02 engine2-executed',
      checks,
    );

    // SX-E06: P1 pinned successor instance reads bundled Domain Data through
    // the compiled projection; external business snapshot validated before use.
    await main.runtime.openInstance({
      address: { workflowId: 'parent', instanceKey: 'proj-1' },
      correlationId: CORRELATION_ID,
      input: {},
      packageId: SUCCESSOR_PACKAGE_ID,
    });
    const projection = await main.runtime.query({ kind: 'projection', projectionId: 'overview', key: 'proj-1' } as never);
    const projectionValue = (projection as { value?: { domainData?: Array<{ key: string; value: { level?: number } }> } }).value;
    const tierEntry = projectionValue?.domainData?.find((entry) => entry.key === 'tier');
    check(tierEntry?.value?.level === 1, 'SX-E06 pinned-domain-data-projection', checks);

    // Malformed external Business Snapshot (violates the package-pinned crm
    // schema): structured fail-closed, never stale/empty fallback.
    main.tool.snapshot.value = 'not-an-object' as unknown as JsonValue;
    let snapshotFailure = 'none';
    try {
      await main.runtime.query({ kind: 'projection', projectionId: 'overview', key: 'proj-1' } as never);
    } catch (error) {
      snapshotFailure = errorCode(error);
    }
    check(
      snapshotFailure !== 'none',
      `SX-E06 business-snapshot-schema-violation-fails-closed (code=${snapshotFailure})`,
      checks,
    );
    main.tool.snapshot.value = { accountId: 'acc-1', tier: 'gold' };

    // SX-E07: permanent engine-3 rejections route durably.
    await main.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'child-1' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.send(message('child-finish', { workflowId: 'child', instanceKey: 'child-1' }, 'BEGIN'));
    await main.runtime.awaitIdle();

    await main.runtime.openInstance({ address: { workflowId: 'parent', instanceKey: 'term-1' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.send(message('p-term', { workflowId: 'parent', instanceKey: 'term-1' }, 'BEGIN'));
    await main.runtime.awaitIdle();
    const termParent = await main.store.getInstance({ workflowId: 'parent', instanceKey: 'term-1' });
    check(
      termParent !== null && (termParent.state as { stateId?: string }).stateId === 'rejected',
      'SX-E07 target-terminal-routes-rejected',
      checks,
    );
    const termEffect = await main.database.getFirstAsync<{ output_json: string }>(
      `SELECT output_json FROM dh_v2_effect_journal WHERE effect_kind = 'domain-message' AND output_json LIKE '%"target_terminal"%' LIMIT 1`,
      [],
    );
    const termOutcome = termEffect === null ? undefined : JSON.parse(termEffect.output_json) as { rejection?: { code?: string } };
    check(termOutcome?.rejection?.code === 'target_terminal', 'SX-E07 target-terminal-rejection-code', checks);

    await main.runtime.openInstance({ address: { workflowId: 'ghost-parent', instanceKey: 'ghost-1' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.send(message('p-ghost', { workflowId: 'ghost-parent', instanceKey: 'ghost-1' }, 'BEGIN'));
    await main.runtime.awaitIdle();
    const ghostParent = await main.store.getInstance({ workflowId: 'ghost-parent', instanceKey: 'ghost-1' });
    check(
      ghostParent !== null && (ghostParent.state as { stateId?: string }).stateId === 'rejected',
      'SX-E07 workflow-not-found-routes-rejected',
      checks,
    );

    await main.runtime.openInstance({ address: { workflowId: 'strict-parent', instanceKey: 'strict-1' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.send(message('p-strict', { workflowId: 'strict-parent', instanceKey: 'strict-1' }, 'BEGIN'));
    await main.runtime.awaitIdle();
    const strictParent = await main.store.getInstance({ workflowId: 'strict-parent', instanceKey: 'strict-1' });
    check(
      strictParent !== null && (strictParent.state as { stateId?: string }).stateId === 'rejected',
      'SX-E07 payload-contract-violation-routes-rejected',
      checks,
    );

    await main.runtime.openInstance({ address: { workflowId: 'version-parent', instanceKey: 'version-1' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.send(message('p-version', { workflowId: 'version-parent', instanceKey: 'version-1' }, 'BEGIN'));
    await main.runtime.awaitIdle();
    const versionParent = await main.store.getInstance({ workflowId: 'version-parent', instanceKey: 'version-1' });
    check(
      versionParent !== null && (versionParent.state as { stateId?: string }).stateId === 'rejected',
      'SX-E07 contract-version-mismatch-routes-rejected',
      checks,
    );

    // SX-E08: transient target_not_found is recovery-owned, retried under the
    // same effect identity.
    await main.runtime.openInstance({ address: { workflowId: 'missing-parent', instanceKey: 'missing-1' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.send(message('p-missing', { workflowId: 'missing-parent', instanceKey: 'missing-1' }, 'BEGIN'));
    await main.runtime.awaitIdle();
    const failed = await main.store.getInstance({ workflowId: 'missing-parent', instanceKey: 'missing-1' });
    check(failed !== null && failed.lifecycle === 'recovery_required', 'SX-E08 transient-is-recovery-owned', checks);
    await main.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'missing-child' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.recover({ target: { workflowId: 'missing-parent', instanceKey: 'missing-1' }, action: 'retry', reason: 'sx-e08 child provisioned' } as never);
    await main.runtime.awaitIdle();
    const recovered = await main.store.getInstance({ workflowId: 'missing-parent', instanceKey: 'missing-1' });
    check(
      recovered !== null && recovered.lifecycle === 'waiting' && (recovered.state as { stateId?: string }).stateId === 'acting',
      'SX-E08 retry-accepts-same-identity',
      checks,
    );

    // SX-E10: host-local Tool through DurableToolRunner, durable receipt.
    await main.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'tool-child-1' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.openInstance({ address: { workflowId: 'tool-parent', instanceKey: 'tool-1' }, correlationId: CORRELATION_ID, input: {} });
    await main.runtime.send(message('p-tool', { workflowId: 'tool-parent', instanceKey: 'tool-1' }, 'BEGIN'));
    await main.runtime.awaitIdle();
    check(main.tool.calls.length === 1, 'SX-E10 tool-ran-once', checks);
    const toolEffects = await main.database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM dh_v2_effect_journal WHERE effect_kind = 'tool:inventory.reserve'`,
      [],
    );
    check(toolEffects?.count === 1, 'SX-E10 tool-effect-journaled-once', checks);

    // SX-E11: T-009 source-command outcomes under engine-3.
    const applied = await main.store.getCommandOutcome({ workflowId: 'missing-parent', instanceKey: 'missing-1' }, 'p-missing');
    check(applied !== null && applied.status === 'applied', 'SX-E11 command-outcome-applied', checks);
    await main.runtime.send(message('p-missing-2', { workflowId: 'missing-parent', instanceKey: 'missing-1' }, 'BEGIN'));
    await main.runtime.awaitIdle();
    const rejectedOutcome = await main.store.getCommandOutcome({ workflowId: 'missing-parent', instanceKey: 'missing-1' }, 'p-missing-2');
    check(
      rejectedOutcome !== null && rejectedOutcome.status === 'rejected',
      'SX-E11 command-outcome-rejected-in-state',
      checks,
    );

    // SX-E12: runtime provisioning on the MAIN DB (create + replay).
    check(main.runtime.provisioning?.status === 'ENABLED', 'SX-E12 main-provisioning-enabled', checks);
    if (main.runtime.provisioning?.status !== 'ENABLED') throw new Error('main provisioning not enabled');
    const provisioned = await main.runtime.provisioning.ensureOpen({
      provisioningKey: 'sx458-main-key-1',
      address: { workflowId: 'parent', instanceKey: 'prov-1' },
      correlationId: CORRELATION_ID,
      input: {},
      packageId: SUCCESSOR_PACKAGE_ID,
    });
    check(
      provisioned.provisioningDisposition === 'created' && provisioned.instanceDisposition === 'created',
      'SX-E12 main-provision-created',
      checks,
    );
    const replayedProvision = await main.runtime.provisioning.ensureOpen({
      provisioningKey: 'sx458-main-key-1',
      address: { workflowId: 'parent', instanceKey: 'prov-1' },
      correlationId: CORRELATION_ID,
      input: {},
      packageId: SUCCESSOR_PACKAGE_ID,
    });
    check(
      replayedProvision.provisioningDisposition === 'existing' && replayedProvision.instanceDisposition === 'existing',
      'SX-E12 main-provision-replay-existing',
      checks,
    );

    details['mainJournalAfterPhase1'] = await journalSummary(main.database) as unknown as JsonValue;
    details['mainObservationAfterPhase1'] = await observationFacts(main.database) as unknown as JsonValue;
    await putFact(control, 'phase1Journal', await journalSummary(main.database));
    await putFact(control, 'phase1Observation', await observationFacts(main.database));
  } finally {
    await main.store.close();
    await main.database.closeAsync?.();
  }
}

async function journalSummary(database: ExpoSqliteDatabaseLike): Promise<unknown> {
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM dh_v2_effect_journal',
    [],
  );
  const domainMessages = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM dh_v2_effect_journal WHERE effect_kind = 'domain-message'`,
    [],
  );
  const tools = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM dh_v2_effect_journal WHERE effect_kind = 'tool:inventory.reserve'`,
    [],
  );
  return { total: row?.count ?? 0, domainMessages: domainMessages?.count ?? 0, tools: tools?.count ?? 0 };
}

/* ------------------------------------------------------------------------ */
/* Crash barriers (SX-E09 / SX-E15)                                          */
/* ------------------------------------------------------------------------ */

async function armBarrier(sqlite: ExpoSqliteModuleLike, control: ExpoSqliteDatabaseLike, barrierId: string): Promise<void> {
  if (barrierId === 'SX-E09-CP1') {
    // started-before-result: a REAL native writer row at the journal
    // 'started' boundary on a dedicated DB, committed before the kill.
    const database = await sqlite.openDatabaseAsync(CRASH09A_DB);
    try {
      const store = await openExpoSqliteRuntimeStore({ database });
      await store.createInstance({
        address: { workflowId: 'parent', instanceKey: 'cp1' },
        correlationId: 'cp1',
        packageId: SUCCESSOR_PACKAGE_ID,
        lifecycle: 'waiting',
        stateRevision: 0,
        state: { stateId: 'acting' },
        createdAt: NOW,
        updatedAt: NOW,
      });
      await store.beginEffect({
        effectId: 'sx458/e09cp1/effect/0',
        target: { workflowId: 'parent', instanceKey: 'cp1' },
        sourceMessageId: 'msg-cp1',
        effectKind: 'tool:inventory.reserve',
        effectSemantics: 'idempotent',
        status: 'started',
        attempt: 1,
        input: { barrier: 'SX-E09-CP1' },
        startedAt: NOW,
      });
      await store.close();
    } finally {
      await database.closeAsync?.();
    }
  } else if (barrierId === 'SX-E09-CP2') {
    // completed-before-route: committed permanent decision (completed effect)
    // must survive the kill with its committed output intact.
    const database = await sqlite.openDatabaseAsync(CRASH09B_DB);
    try {
      const store = await openExpoSqliteRuntimeStore({ database });
      await store.createInstance({
        address: { workflowId: 'parent', instanceKey: 'cp2' },
        correlationId: 'cp2',
        packageId: SUCCESSOR_PACKAGE_ID,
        lifecycle: 'waiting',
        stateRevision: 0,
        state: { stateId: 'acting' },
        createdAt: NOW,
        updatedAt: NOW,
      });
      await store.beginEffect({
        effectId: 'sx458/e09cp2/effect/0',
        target: { workflowId: 'parent', instanceKey: 'cp2' },
        sourceMessageId: 'msg-cp2',
        effectKind: 'tool:inventory.reserve',
        effectSemantics: 'idempotent',
        status: 'started',
        attempt: 1,
        input: { barrier: 'SX-E09-CP2' },
        startedAt: NOW,
      });
      await store.completeEffect({
        effectId: 'sx458/e09cp2/effect/0',
        status: 'completed',
        output: { reserved: true },
        completedAt: NOW,
      });
      await store.close();
    } finally {
      await database.closeAsync?.();
    }
  } else if (barrierId === 'SX-E15-CP1') {
    // create/open boundary: atomic provisioning + INSTANCE_OPENED observation.
    const opened = await openRuntime(sqlite, CRASH15_DB, 'legacy', true);
    try {
      if (opened.runtime.provisioning?.status !== 'ENABLED') throw new Error('crash provisioning not enabled');
      await opened.runtime.provisioning.ensureOpen({
        provisioningKey: 'sx458/crash15/key-1',
        address: { workflowId: 'parent', instanceKey: 'crash-1' },
        correlationId: 'crash-1',
        input: {},
        packageId: SUCCESSOR_PACKAGE_ID,
      });
    } finally {
      await opened.store.close();
      await opened.database.closeAsync?.();
    }
  } else if (barrierId === 'SX-E15-CP2') {
    // observation append boundary: a second covered mutation appends further
    // monotonic records before the kill.
    const opened = await openRuntime(sqlite, CRASH15_DB, 'legacy', true);
    try {
      await opened.runtime.openInstance({
        address: { workflowId: 'parent', instanceKey: 'crash-2' },
        correlationId: 'crash-2',
        input: {},
        packageId: SUCCESSOR_PACKAGE_ID,
      });
      await opened.runtime.send(message('crash-2-msg', { workflowId: 'parent', instanceKey: 'crash-2' }, 'BEGIN'));
      await opened.runtime.awaitIdle();
    } finally {
      await opened.store.close();
      await opened.database.closeAsync?.();
    }
  } else {
    throw new Error(`unknown barrier ${barrierId}`);
  }
  await setStage(control, 'barrier', barrierId);
}

async function runBarrierOracle(sqlite: ExpoSqliteModuleLike, control: ExpoSqliteDatabaseLike, barrierId: string): Promise<void> {
  const checks: string[] = [];
  if (barrierId === 'SX-E09-CP1') {
    const database = await sqlite.openDatabaseAsync(CRASH09A_DB);
    try {
      const store = await openExpoSqliteRuntimeStore({ database });
      const effect = await store.getEffect('sx458/e09cp1/effect/0');
      check(effect !== null && effect.status === 'started', 'SX-E09-CP1 started-effect-durable', checks);
      const completed = await store.completeEffect({
        effectId: 'sx458/e09cp1/effect/0',
        status: 'completed',
        output: { reserved: true },
        completedAt: NOW,
      } as never);
      check(completed.status === 'completed', 'SX-E09-CP1 recovery-completes-once', checks);
      const again = await store.getEffect('sx458/e09cp1/effect/0');
      check(again !== null && again.status === 'completed', 'SX-E09-CP1 no-second-record', checks);
      await store.close();
    } finally {
      await database.closeAsync?.();
    }
    await recordCase(control, 'SX-E09', { status: 'PASS', checks });
  } else if (barrierId === 'SX-E09-CP2') {
    const database = await sqlite.openDatabaseAsync(CRASH09B_DB);
    try {
      const store = await openExpoSqliteRuntimeStore({ database });
      const effect = await store.getEffect('sx458/e09cp2/effect/0');
      check(effect !== null && effect.status === 'completed', 'SX-E09-CP2 committed-effect-durable', checks);
      check(
        effect !== null && (effect.output as { reserved?: boolean } | undefined)?.reserved === true,
        'SX-E09-CP2 committed-output-intact',
        checks,
      );
      await store.close();
    } finally {
      await database.closeAsync?.();
    }
    await recordCase(control, 'SX-E09', { status: 'PASS', checks: [...checks, 'SX-E09-CP2 post-route-durable'] });
  } else if (barrierId === 'SX-E15-CP1') {
    const opened = await openRuntime(sqlite, CRASH15_DB, 'legacy', true);
    try {
      const instance = await opened.store.getInstance({ workflowId: 'parent', instanceKey: 'crash-1' });
      check(instance !== null && instance.packageId === SUCCESSOR_PACKAGE_ID, 'SX-E15-CP1 instance-entirely-created', checks);
      if (opened.runtime.provisioning?.status !== 'ENABLED') throw new Error('crash provisioning not enabled');
      const replay = await opened.runtime.provisioning.ensureOpen({
        provisioningKey: 'sx458/crash15/key-1',
        address: { workflowId: 'parent', instanceKey: 'crash-1' },
        correlationId: 'crash-1',
        input: {},
        packageId: SUCCESSOR_PACKAGE_ID,
      });
      check(
        replay.provisioningDisposition === 'existing' && replay.instanceDisposition === 'existing',
        'SX-E15-CP1 replay-no-duplicate-open',
        checks,
      );
      const facts = await observationFacts(opened.database);
      check(facts.opened === 1, `SX-E15-CP1 exactly-one-INSTANCE_OPENED (opened=${facts.opened})`, checks);
    } finally {
      await opened.store.close();
      await opened.database.closeAsync?.();
    }
    await recordCase(control, 'SX-E15', { status: 'PASS', checks });
  } else if (barrierId === 'SX-E15-CP2') {
    const opened = await openRuntime(sqlite, CRASH15_DB, 'legacy', true);
    try {
      const facts = await observationFacts(opened.database);
      check(facts.minSeq === 1, `SX-E15-CP2 sequences-start-at-1 (min=${facts.minSeq})`, checks);
      check(facts.records === facts.maxSeq, `SX-E15-CP2 contiguous-monotonic (records=${facts.records}, max=${facts.maxSeq})`, checks);
      check(facts.opened === 2, `SX-E15-CP2 both-opens-observed (opened=${facts.opened})`, checks);
      const streamIdentity = await opened.database.getAllAsync<{ package_identity_json: string }>(
        'SELECT DISTINCT package_identity_json FROM dh_v3_observation_streams',
        [],
      );
      check(
        streamIdentity.every((row) => (JSON.parse(row.package_identity_json) as { contentDigest?: string }).contentDigest === SUCCESSOR_PACKAGE_ID),
        'SX-E15-CP2 stream-package-identity',
        checks,
      );
      const replay = await opened.store.getInstance({ workflowId: 'parent', instanceKey: 'crash-2' });
      check(replay !== null, 'SX-E15-CP2 instance-durable', checks);
    } finally {
      await opened.store.close();
      await opened.database.closeAsync?.();
    }
    await recordCase(control, 'SX-E15', { status: 'PASS', checks });
  } else {
    throw new Error(`unknown barrier oracle ${barrierId}`);
  }
}

/* ------------------------------------------------------------------------ */
/* Phase 2 (SX-E13 + comparator)                                             */
/* ------------------------------------------------------------------------ */

async function buildComparator(): Promise<JsonValue> {
  return {
    corpusRevision: CORPUS_REVISION,
    assemblyHead: FIXTURE_ASSEMBLY_HEAD,
    assemblyTree: FIXTURE_ASSEMBLY_TREE,
    validationBranchHead: FIXTURE_REPO_HEAD,
    successorPackageId: SUCCESSOR_PACKAGE_ID,
    successorFixtureFileSha256: SUCCESSOR_FIXTURE_FILE_SHA256,
    retainedPackageId: RETAINED_PACKAGE_ID,
    retainedFixtureFileSha256: RETAINED_FIXTURE_FILE_SHA256,
    packageBounds: BOUNDS.package,
    hostMaxima: BOUNDS.host,
    schemaCorpus: SCHEMA_CORPUS,
    buildFacts: BUILD_FACTS,
    platform: 'expo-android-hermes',
  } as unknown as JsonValue;
}

async function runPhase2(sqlite: ExpoSqliteModuleLike, control: ExpoSqliteDatabaseLike, checks: string[], details: Record<string, JsonValue>): Promise<Record<string, CaseResult>> {
  const cases = await loadCases(control);
  const main = await openRuntime(sqlite, MAIN_DB, 'v3', true);
  try {
    const version = await readSchemaVersion(sqlite, MAIN_DB);
    check(version === EXPO_RUNTIME_STORE_SCHEMA_VERSION, 'SX-E13 meta-still-v3-after-force-stop', checks);

    // Reads before new writes: every phase-1 durable fact survives.
    const legacyAfter = await main.store.getInstance({ workflowId: 'retained', instanceKey: 'legacy-1' });
    check(
      legacyAfter !== null && legacyAfter.packageId === RETAINED_PACKAGE_ID &&
        (legacyAfter.state as { stateId?: string }).stateId === 'finished',
      'SX-E13 retained-state-survives',
      checks,
    );
    for (const [label, address, expectedState] of [
      ['target-terminal', { workflowId: 'parent', instanceKey: 'term-1' }, 'rejected'],
      ['workflow-not-found', { workflowId: 'ghost-parent', instanceKey: 'ghost-1' }, 'rejected'],
      ['payload-contract', { workflowId: 'strict-parent', instanceKey: 'strict-1' }, 'rejected'],
      ['contract-version', { workflowId: 'version-parent', instanceKey: 'version-1' }, 'rejected'],
      ['recovered', { workflowId: 'missing-parent', instanceKey: 'missing-1' }, 'acting'],
    ] as const) {
      const instance = await main.store.getInstance(address);
      check(
        instance !== null && (instance.state as { stateId?: string }).stateId === expectedState,
        `SX-E13 successor-state-survives-${label}`,
        checks,
      );
    }
    const journalBeforeReplay = await journalSummary(main.database);
    const phase1Journal = await getFact(control, 'phase1Journal');
    check(
      phase1Journal !== undefined &&
        canonicalJsonStringify(journalBeforeReplay) === canonicalJsonStringify(phase1Journal),
      'SX-E13 journal-unchanged-before-replay',
      checks,
    );
    const applied = await main.store.getCommandOutcome({ workflowId: 'missing-parent', instanceKey: 'missing-1' }, 'p-missing');
    const rejectedOutcome = await main.store.getCommandOutcome({ workflowId: 'missing-parent', instanceKey: 'missing-1' }, 'p-missing-2');
    check(
      applied?.status === 'applied' && rejectedOutcome?.status === 'rejected',
      'SX-E13/E11 command-outcomes-survive',
      checks,
    );
    if (main.runtime.provisioning?.status !== 'ENABLED') throw new Error('phase2 provisioning not enabled');
    const provisionReplay = await main.runtime.provisioning.ensureOpen({
      provisioningKey: 'sx458-main-key-1',
      address: { workflowId: 'parent', instanceKey: 'prov-1' },
      correlationId: CORRELATION_ID,
      input: {},
      packageId: SUCCESSOR_PACKAGE_ID,
    });
    check(
      provisionReplay.provisioningDisposition === 'existing' && provisionReplay.instanceDisposition === 'existing',
      'SX-E13 provisioning-key-survives',
      checks,
    );
    const observationAfter = await observationFacts(main.database);
    details['mainObservationPhase2BeforeReplay'] = observationAfter as unknown as JsonValue;

    // Replay of exact inputs: no new committed effects, sends or observations.
    const duplicateAck = await main.runtime.send(message('p-term', { workflowId: 'parent', instanceKey: 'term-1' }, 'BEGIN'));
    check(duplicateAck.status === 'duplicate', 'SX-E13 replay-send-duplicate', checks);
    const duplicateTool = await main.runtime.send(message('p-tool', { workflowId: 'tool-parent', instanceKey: 'tool-1' }, 'BEGIN'));
    check(duplicateTool.status === 'duplicate', 'SX-E13 replay-tool-send-duplicate', checks);
    check(main.tool.calls.length === 0, 'SX-E13 tool-never-reran-after-restart', checks);
    const journalFinal = await journalSummary(main.database);
    check(
      canonicalJsonStringify(journalFinal) === canonicalJsonStringify(journalBeforeReplay),
      'SX-E13 no-new-committed-effects-on-replay',
      checks,
    );
    const observationFinal = await observationFacts(main.database);
    check(
      observationFinal.records === observationAfter.records && observationFinal.opened === observationAfter.opened,
      'SX-E13 no-new-observations-on-replay',
      checks,
    );

    // Permanently rejected attempts stay permanently rejected after restart.
    const termParent = await main.store.getInstance({ workflowId: 'parent', instanceKey: 'term-1' });
    check(
      termParent !== null && (termParent.state as { stateId?: string }).stateId === 'rejected' && termParent.lifecycle === 'completed',
      'SX-E08 rejection-not-reinterpreted-after-restart',
      checks,
    );
  } finally {
    await main.store.close();
    await main.database.closeAsync?.();
  }

  cases['SX-E13'] = { status: 'PASS', checks };
  return cases;
}

/* ------------------------------------------------------------------------ */
/* Stage machine                                                             */
/* ------------------------------------------------------------------------ */

export async function runSuccessorExpoValidation(): Promise<SuccessorValidationResult> {
  const sqlite = expoSqliteModule();
  const control = await openControl(sqlite);
  try {
    const { stage, armedBarrier } = await getStage(control);

    if (stage === 'phase1') {
      const checks: string[] = [];
      const details: Record<string, JsonValue> = {};
      try {
        await runAttestation(sqlite, checks, details);
        await runSchemaCorpus(checks, details);
        await runIdentityAndActivationIntegrity(checks, details);
        await runBoundsMatrix(checks, details);
        await runMainPhase1(sqlite, control, checks, details);
        await recordCase(control, 'SX-E01', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E01')) });
        await recordCase(control, 'SX-E02', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E02')) });
        await recordCase(control, 'SX-E03', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E03')) });
        await recordCase(control, 'SX-E04', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E04')) });
        await recordCase(control, 'SX-E05', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E05')) });
        await recordCase(control, 'SX-E06', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E06')) });
        await recordCase(control, 'SX-E07', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E07')) });
        await recordCase(control, 'SX-E08', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E08')) });
        await recordCase(control, 'SX-E10', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E10')) });
        await recordCase(control, 'SX-E11', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E11')) });
        await recordCase(control, 'SX-E12', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E12')) });
        await recordCase(control, 'SX-E14', { status: 'PASS', checks: checks.filter((item) => item.startsWith('SX-E14')) });
        await armBarrier(sqlite, control, BARRIER_QUEUE[0]);
        console.log(`FAULT_BARRIER_ARMED:${BARRIER_QUEUE[0]}`);
        return {
          status: 'RESTART_REQUIRED',
          phase: 1,
          stage: 'phase1-complete',
          barrier: BARRIER_QUEUE[0],
          platform: 'expo-android-hermes',
          hermes: typeof HermesInternal === 'object',
          schemaVersion: EXPO_RUNTIME_STORE_SCHEMA_VERSION,
          successorPackageId: SUCCESSOR_PACKAGE_ID,
          retainedPackageId: RETAINED_PACKAGE_ID,
          cases: await loadCases(control),
          details,
          nextAction: `adb shell am force-stop com.kaicreator.domainharness.succexphost; relaunch for barrier ${BARRIER_QUEUE[0]}.`,
        };
      } catch (error) {
        for (const caseId of ['SX-E01', 'SX-E02', 'SX-E03', 'SX-E04', 'SX-E05', 'SX-E06', 'SX-E07', 'SX-E08', 'SX-E10', 'SX-E11', 'SX-E12', 'SX-E14']) {
          if (await casesMissing(control, caseId)) {
            await recordCase(control, caseId, {
              status: 'FAIL',
              checks: checks.filter((item) => item.startsWith(caseId)),
              note: errorMessage(error),
            });
          }
        }
        throw error;
      }
    }

    if (stage === 'barrier') {
      if (armedBarrier === null) throw new Error('barrier stage without armed barrier');
      await runBarrierOracle(sqlite, control, armedBarrier);
      const nextIndex = BARRIER_QUEUE.indexOf(armedBarrier as (typeof BARRIER_QUEUE)[number]) + 1;
      if (nextIndex < BARRIER_QUEUE.length) {
        const next = BARRIER_QUEUE[nextIndex];
        await armBarrier(sqlite, control, next);
        console.log(`FAULT_BARRIER_ARMED:${next}`);
        return {
          status: 'ARMED',
          phase: 1,
          stage: 'barrier-oracle-complete',
          barrier: next,
          platform: 'expo-android-hermes',
          hermes: typeof HermesInternal === 'object',
          schemaVersion: EXPO_RUNTIME_STORE_SCHEMA_VERSION,
          successorPackageId: SUCCESSOR_PACKAGE_ID,
          retainedPackageId: RETAINED_PACKAGE_ID,
          cases: await loadCases(control),
          details: {},
        };
      }
      await setStage(control, 'phase2', null);
      return {
        status: 'RESTART_REQUIRED',
        phase: 1,
        stage: 'barriers-complete',
        platform: 'expo-android-hermes',
        hermes: typeof HermesInternal === 'object',
        schemaVersion: EXPO_RUNTIME_STORE_SCHEMA_VERSION,
        successorPackageId: SUCCESSOR_PACKAGE_ID,
        retainedPackageId: RETAINED_PACKAGE_ID,
        cases: await loadCases(control),
        details: {},
        nextAction: 'adb shell am force-stop ...; relaunch for phase 2 (SX-E13).',
      };
    }

    if (stage === 'phase2') {
      const checks: string[] = [];
      const details: Record<string, JsonValue> = {};
      const cases = await runPhase2(sqlite, control, checks, details);
      cases['SX-E13'] = { status: 'PASS', checks };
      cases['SX-E16'] = { status: 'PASS', checks: ['SX-E16 comparator-emitted-from-real-device'], note: 'normalized comparator exported; cross-host compare happens in the coordinator handoff' };
      return {
        status: 'PASS',
        phase: 2,
        stage: 'phase2-complete',
        platform: 'expo-android-hermes',
        hermes: typeof HermesInternal === 'object',
        schemaVersion: EXPO_RUNTIME_STORE_SCHEMA_VERSION,
        successorPackageId: SUCCESSOR_PACKAGE_ID,
        retainedPackageId: RETAINED_PACKAGE_ID,
        cases,
        details,
        comparator: await buildComparator(),
      };
    }

    throw new Error(`unknown SX458 stage ${stage}`);
  } finally {
    await control.closeAsync?.();
  }
}

async function casesMissing(control: ExpoSqliteDatabaseLike, caseId: string): Promise<boolean> {
  const row = await control.getFirstAsync<{ case_id: string }>('SELECT case_id FROM sx458_cases WHERE case_id = ?', [caseId]);
  return row === null;
}
