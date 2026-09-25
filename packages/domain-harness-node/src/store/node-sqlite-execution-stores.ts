import {
  CentralAdmissionError,
  HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION,
  HARNESS_OPERATION_IDENTITY_VERSION,
  SemanticCacheContractError,
  canonicalJsonStringify,
  isContentDigest,
} from '@kaicreator/domain-harness';
import type {
  AdmissionDurableEffectJournal,
  AdmissionEffectJournalRecord,
  CompiledArtifactIdentity,
  ExactSemanticCacheStore,
  HarnessExecutionJournalRecord,
  HarnessExecutionJournalStore,
  HarnessExecutionOperationIdentity,
  HarnessExecutionSlotIdentity,
  HarnessJournalCommittedRecord,
  HarnessJournalOutcome,
  HarnessJournalStartedRecord,
  SemanticCacheEntry,
  SemanticCacheEvictionReport,
  SemanticCacheKey,
  SemanticCachePut,
  SemanticCacheQuarantineRecord,
  SemanticCacheRead,
  VolatileSemanticCacheRetentionPolicy,
} from '@kaicreator/domain-harness';
import type { JsonValue } from '@kaicreator/domain-harness/v2';
import { canonicalText, decodeJson, type AuthoritySqliteDatabase } from './authority-shared.js';

/**
 * T-022 Node SQLite adapters for the three durable-execution ports owned by
 * the v0.3 authority wave:
 *
 * - `NodeSqliteExactSemanticCacheStore`   (T-013 exact semantic cache)
 * - `NodeSqliteHarnessExecutionJournalStore` (T-016 harness execution journal)
 * - `NodeSqliteAdmissionEffectJournal`    (T-019 admission effect journal)
 *
 * Each adapter mirrors its volatile reference store exactly — same key
 * functions, same validation, same conflict messages, same first-writer-wins
 * and idempotent-settlement semantics — backed by the versioned `dh_v3_*`
 * tables from migration 2. All multi-step mutations run inside a single
 * `transaction(...).immediate()`; stored bodies are canonical JSON so byte
 * comparisons and deep clones are stable across reopen.
 */

interface SemanticCacheEntryRow {
  entry_json: string;
}
interface SemanticCacheClockRow {
  storage_key: string;
  created_at_ms: number;
  expires_at_ms: number | null;
}
interface StorageKeyRow {
  storage_key: string;
}
interface CountRow {
  count: number;
}
interface JournalRecordRow {
  record_json: string;
}
interface EffectRecordRow {
  record_json: string;
}

/* ------------------------------------------------------------------------- */
/* Exact semantic cache (mirrors VolatileExactSemanticCacheStore)             */
/* ------------------------------------------------------------------------- */

const cmp = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
/** Exact artifact key from the volatile reference (NUL separators). */
const artifactKey = (value: CompiledArtifactIdentity): string =>
  `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;
/** Exact storage key from the volatile reference (NUL separators). */
const storageKey = (value: SemanticCacheKey): string =>
  `${value.identityVersion}\u0000${value.namespace}\u0000${value.semanticDigest}`;

function nonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_IDENTITY', `${label} must be non-empty`);
  }
}
function epoch(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_ENTRY', `${label} must be a finite non-negative epoch millisecond`);
  }
}
/** Same checks as the volatile reference's private retentionPolicy. */
function retentionPolicy(value: VolatileSemanticCacheRetentionPolicy): void {
  for (const [label, item] of [['maxEntries', value.maxEntries], ['maxQuarantineRecords', value.maxQuarantineRecords]] as const) {
    if (item !== undefined && (!Number.isSafeInteger(item) || item <= 0)) {
      throw new SemanticCacheContractError('INVALID_RETENTION_POLICY', `${label} must be a positive safe integer`);
    }
  }
  if (value.maxAgeMs !== undefined && (!Number.isFinite(value.maxAgeMs) || value.maxAgeMs <= 0)) {
    throw new SemanticCacheContractError('INVALID_RETENTION_POLICY', 'maxAgeMs must be a finite positive number');
  }
}

/**
 * SQLite-backed exact semantic cache. First writer wins per storage key;
 * expiry, capacity eviction, quarantine trimming and invalidation counts are
 * decided deterministically (oldest by createdAtEpochMs then storage_key).
 */
export class NodeSqliteExactSemanticCacheStore<TResult extends JsonValue = JsonValue> implements ExactSemanticCacheStore<TResult> {
  readonly #db: AuthoritySqliteDatabase;
  readonly #retention: VolatileSemanticCacheRetentionPolicy;

  constructor(db: AuthoritySqliteDatabase, retention: VolatileSemanticCacheRetentionPolicy = {}) {
    retentionPolicy(retention);
    this.#db = db;
    this.#retention = retention;
  }

  async read(key: SemanticCacheKey, nowEpochMs: number): Promise<SemanticCacheRead<TResult>> {
    epoch(nowEpochMs, 'nowEpochMs');
    const id = storageKey(key);
    const row = this.#db.prepare(`
      SELECT entry_json FROM dh_v3_semantic_cache_entries WHERE storage_key = ?
    `).get(id) as SemanticCacheEntryRow | undefined;
    if (row === undefined) return { status: 'miss', reason: 'not-found' };
    const entry = decodeJson<SemanticCacheEntry<TResult>>(row.entry_json, 'semantic cache entry');
    if (this.isExpired(entry, nowEpochMs)) {
      this.#db.transaction(() => {
        this.removeWithinTransaction(id);
      }).immediate();
      return { status: 'miss', reason: 'expired' };
    }
    return { status: 'hit', entry };
  }

  async putIfAbsent(entry: SemanticCacheEntry<TResult>, nowEpochMs: number): Promise<SemanticCachePut<TResult>> {
    epoch(nowEpochMs, 'nowEpochMs');
    this.evictExpired(nowEpochMs);
    const id = storageKey(entry.identity.key);
    const encoded = canonicalText(entry as unknown as JsonValue, 'semantic cache entry');
    const namespace = entry.identity.key.namespace;
    const producer = artifactKey(entry.producerIdentity);
    const createdAt = entry.createdAtEpochMs;
    const expiresAt = entry.expiresAtEpochMs;
    const dependencyKeys = [...new Set((entry.identity.dependencies.artifacts ?? []).map(artifactKey))].sort(cmp);
    return this.#db.transaction(() => {
      const existing = this.#db.prepare(`
        SELECT entry_json FROM dh_v3_semantic_cache_entries WHERE storage_key = ?
      `).get(id) as SemanticCacheEntryRow | undefined;
      if (existing !== undefined) {
        /* First writer wins: the stored entry is returned untouched. */
        return {
          status: 'existing' as const,
          entry: decodeJson<SemanticCacheEntry<TResult>>(existing.entry_json, 'semantic cache entry'),
        };
      }
      this.evictCapacityForIncomingWithinTransaction();
      this.#db.prepare(`
        INSERT INTO dh_v3_semantic_cache_entries
          (storage_key, namespace, producer_key, created_at_ms, expires_at_ms, entry_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(storage_key) DO NOTHING
      `).run(id, namespace, producer, createdAt, expiresAt === undefined ? null : expiresAt, encoded);
      const insertDependency = this.#db.prepare(`
        INSERT INTO dh_v3_semantic_cache_dependencies (dependency_key, storage_key)
        VALUES (?, ?)
        ON CONFLICT(dependency_key, storage_key) DO NOTHING
      `);
      for (const dependencyKey of dependencyKeys) insertDependency.run(dependencyKey, id);
      return { status: 'inserted' as const, entry };
    }).immediate();
  }

  async quarantine(key: SemanticCacheKey, reason: string, nowEpochMs: number): Promise<void> {
    epoch(nowEpochMs, 'nowEpochMs');
    nonEmpty(reason, 'quarantine reason');
    const id = storageKey(key);
    const encodedRecord = canonicalText(
      { key, reason, quarantinedAtEpochMs: nowEpochMs } as unknown as JsonValue,
      'semantic cache quarantine record',
    );
    this.#db.transaction(() => {
      this.removeWithinTransaction(id);
      this.#db.prepare(`
        INSERT INTO dh_v3_semantic_cache_quarantine (storage_key, quarantined_at_ms, record_json)
        VALUES (?, ?, ?)
      `).run(id, nowEpochMs, encodedRecord);
      const max = this.#retention.maxQuarantineRecords;
      if (max === undefined) return;
      const row = this.#db.prepare(
        'SELECT COUNT(*) AS count FROM dh_v3_semantic_cache_quarantine',
      ).get() as CountRow;
      const excess = row.count - max;
      if (excess <= 0) return;
      /* Trim oldest first by ordinal. */
      this.#db.prepare(`
        DELETE FROM dh_v3_semantic_cache_quarantine
        WHERE ordinal IN (SELECT ordinal FROM dh_v3_semantic_cache_quarantine ORDER BY ordinal ASC LIMIT ?)
      `).run(excess);
    }).immediate();
  }

  async invalidateByProducer(value: CompiledArtifactIdentity, _reason: string): Promise<number> {
    const producer = artifactKey(value);
    return this.#db.transaction(() => {
      const rows = this.#db.prepare(`
        SELECT storage_key FROM dh_v3_semantic_cache_entries
        WHERE producer_key = ? ORDER BY storage_key ASC
      `).all(producer) as StorageKeyRow[];
      let count = 0;
      for (const row of rows) if (this.removeWithinTransaction(row.storage_key)) count += 1;
      return count;
    }).immediate();
  }

  async invalidateByDependency(value: CompiledArtifactIdentity, _reason: string): Promise<number> {
    const dependency = artifactKey(value);
    return this.#db.transaction(() => {
      const rows = this.#db.prepare(`
        SELECT DISTINCT storage_key FROM dh_v3_semantic_cache_dependencies
        WHERE dependency_key = ? ORDER BY storage_key ASC
      `).all(dependency) as StorageKeyRow[];
      let count = 0;
      for (const row of rows) if (this.removeWithinTransaction(row.storage_key)) count += 1;
      return count;
    }).immediate();
  }

  async invalidateNamespace(namespace: string, _reason: string): Promise<number> {
    nonEmpty(namespace, 'namespace');
    return this.#db.transaction(() => {
      const rows = this.#db.prepare(`
        SELECT storage_key FROM dh_v3_semantic_cache_entries
        WHERE namespace = ? ORDER BY storage_key ASC
      `).all(namespace) as StorageKeyRow[];
      let count = 0;
      for (const row of rows) if (this.removeWithinTransaction(row.storage_key)) count += 1;
      return count;
    }).immediate();
  }

  async evict(nowEpochMs: number): Promise<SemanticCacheEvictionReport> {
    epoch(nowEpochMs, 'nowEpochMs');
    return this.#db.transaction(() => ({
      expired: this.evictExpiredWithinTransaction(nowEpochMs),
      capacity: this.evictCapacityWithinTransaction(),
    })).immediate();
  }

  /** Inspection surface for tests/review tooling; not part of the cache port. */
  getQuarantineRecords(): readonly SemanticCacheQuarantineRecord[] {
    const rows = this.#db.prepare(`
      SELECT record_json FROM dh_v3_semantic_cache_quarantine ORDER BY ordinal ASC
    `).all() as Array<{ record_json: string }>;
    return rows.map((row) => decodeJson<SemanticCacheQuarantineRecord>(row.record_json, 'semantic cache quarantine record'));
  }

  get size(): number {
    const row = this.#db.prepare(
      'SELECT COUNT(*) AS count FROM dh_v3_semantic_cache_entries',
    ).get() as CountRow;
    return row.count;
  }

  /** Same expiry rule as the volatile reference, including maxAgeMs. */
  private isExpired(entry: SemanticCacheEntry<TResult>, now: number): boolean {
    if (entry.expiresAtEpochMs !== undefined && now >= entry.expiresAtEpochMs) return true;
    return this.#retention.maxAgeMs !== undefined && now - entry.createdAtEpochMs >= this.#retention.maxAgeMs;
  }

  /** Caller must already be inside a transaction. */
  private removeWithinTransaction(id: string): boolean {
    const existing = this.#db.prepare(
      'SELECT 1 FROM dh_v3_semantic_cache_entries WHERE storage_key = ?',
    ).get(id);
    if (existing === undefined) return false;
    this.#db.prepare('DELETE FROM dh_v3_semantic_cache_dependencies WHERE storage_key = ?').run(id);
    this.#db.prepare('DELETE FROM dh_v3_semantic_cache_entries WHERE storage_key = ?').run(id);
    return true;
  }

  /** Caller must already be inside a transaction; iterates storage keys sorted. */
  private evictExpiredWithinTransaction(now: number): number {
    const rows = this.#db.prepare(`
      SELECT storage_key, created_at_ms, expires_at_ms FROM dh_v3_semantic_cache_entries
      ORDER BY storage_key ASC
    `).all() as SemanticCacheClockRow[];
    let count = 0;
    for (const row of rows) {
      const expired = (row.expires_at_ms !== null && now >= row.expires_at_ms)
        || (this.#retention.maxAgeMs !== undefined && now - row.created_at_ms >= this.#retention.maxAgeMs);
      if (expired && this.removeWithinTransaction(row.storage_key)) count += 1;
    }
    return count;
  }

  /** Caller must already be inside a transaction; used by evict() only. */
  private evictCapacityWithinTransaction(): number {
    const max = this.#retention.maxEntries;
    if (max === undefined) return 0;
    const row = this.#db.prepare(
      'SELECT COUNT(*) AS count FROM dh_v3_semantic_cache_entries',
    ).get() as CountRow;
    if (row.count <= max) return 0;
    return this.removeOldestWithinTransaction(row.count - max);
  }

  /** Caller must already be inside a transaction; used by putIfAbsent only. */
  private evictCapacityForIncomingWithinTransaction(): number {
    const max = this.#retention.maxEntries;
    if (max === undefined) return 0;
    const row = this.#db.prepare(
      'SELECT COUNT(*) AS count FROM dh_v3_semantic_cache_entries',
    ).get() as CountRow;
    if (row.count < max) return 0;
    return this.removeOldestWithinTransaction(row.count - max + 1);
  }

  /** Caller must already be inside a transaction; oldest by (createdAt, storage_key). */
  private removeOldestWithinTransaction(count: number): number {
    if (count <= 0) return 0;
    const rows = this.#db.prepare(`
      SELECT storage_key FROM dh_v3_semantic_cache_entries
      ORDER BY created_at_ms ASC, storage_key ASC LIMIT ?
    `).all(count) as StorageKeyRow[];
    let removed = 0;
    for (const row of rows) if (this.removeWithinTransaction(row.storage_key)) removed += 1;
    return removed;
  }

  /** Outside-transaction expired sweep (mirrors the volatile evictExpired step). */
  private evictExpired(now: number): number {
    return this.#db.transaction(() => this.evictExpiredWithinTransaction(now)).immediate();
  }
}

/* ------------------------------------------------------------------------- */
/* Harness execution journal (mirrors VolatileHarnessExecutionJournalStore)   */
/* ------------------------------------------------------------------------- */

/** Same trim-based non-empty rule as the volatile reference module. */
function harnessNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must be non-empty`);
}

function validateSlot(slot: HarnessExecutionSlotIdentity): void {
  harnessNonEmpty(slot.target.workflowId, 'workflowId');
  harnessNonEmpty(slot.target.instanceKey, 'instanceKey');
  harnessNonEmpty(slot.durableControlTurnId, 'durableControlTurnId');
  if (slot.operationKind !== 'ai' && slot.operationKind !== 'query') {
    throw new Error('operationKind must be ai or query');
  }
  if (!Number.isSafeInteger(slot.operationOrdinal) || slot.operationOrdinal <= 0) {
    throw new Error('operationOrdinal must be a positive safe integer');
  }
}

function validateIdentity(identity: HarnessExecutionOperationIdentity): void {
  if (identity.identityVersion !== HARNESS_OPERATION_IDENTITY_VERSION) {
    throw new Error('unexpected Harness operation identity version');
  }
  validateSlot(identity.slot);
  if (!isContentDigest(identity.semanticContractDigest)) {
    throw new Error('semanticContractDigest must be a content digest');
  }
  if (
    identity.promotedChildContentDigest !== undefined
    && !isContentDigest(identity.promotedChildContentDigest)
  ) {
    throw new Error('promotedChildContentDigest must be a content digest when supplied');
  }
}

/** Canonical slot key: exactly the material the volatile reference hashes on. */
function slotKey(slot: HarnessExecutionSlotIdentity): string {
  validateSlot(slot);
  return canonicalJsonStringify({
    workflowId: slot.target.workflowId,
    instanceKey: slot.target.instanceKey,
    durableControlTurnId: slot.durableControlTurnId,
    operationKind: slot.operationKind,
    operationOrdinal: slot.operationOrdinal,
  });
}

function identityKey(identity: HarnessExecutionOperationIdentity): string {
  validateIdentity(identity);
  return canonicalJsonStringify(identity);
}

function outcomeKey(outcome: HarnessJournalOutcome): string {
  return canonicalJsonStringify(outcome);
}

function sameIdentity(
  left: HarnessExecutionOperationIdentity,
  right: HarnessExecutionOperationIdentity,
): boolean {
  return identityKey(left) === identityKey(right);
}

/**
 * SQLite-backed harness execution journal. Slots are addressed by the
 * canonical slot key; `state` mirrors `record_json.state` and transitions
 * started→committed atomically.
 */
export class NodeSqliteHarnessExecutionJournalStore implements HarnessExecutionJournalStore {
  readonly #db: AuthoritySqliteDatabase;

  constructor(db: AuthoritySqliteDatabase) {
    this.#db = db;
  }

  async read(slot: HarnessExecutionSlotIdentity): Promise<HarnessExecutionJournalRecord | null> {
    const key = slotKey(slot);
    const row = this.#db.prepare(`
      SELECT record_json FROM dh_v3_harness_execution_journal WHERE slot_key = ?
    `).get(key) as JournalRecordRow | undefined;
    if (row === undefined) return null;
    return decodeJson<HarnessExecutionJournalRecord>(row.record_json, 'harness execution journal record');
  }

  async begin(identity: HarnessExecutionOperationIdentity): Promise<{
    readonly disposition: 'created' | 'existing';
    readonly record: HarnessExecutionJournalRecord;
  }> {
    validateIdentity(identity);
    const key = slotKey(identity.slot);
    return this.#db.transaction(() => {
      const existing = this.#db.prepare(`
        SELECT record_json FROM dh_v3_harness_execution_journal WHERE slot_key = ?
      `).get(key) as JournalRecordRow | undefined;
      if (existing !== undefined) {
        return {
          disposition: 'existing' as const,
          record: decodeJson<HarnessExecutionJournalRecord>(existing.record_json, 'harness execution journal record'),
        };
      }
      const started: HarnessJournalStartedRecord = {
        formatVersion: HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION,
        state: 'started',
        identity,
      };
      this.#db.prepare(`
        INSERT INTO dh_v3_harness_execution_journal (slot_key, state, record_json)
        VALUES (?, ?, ?)
      `).run(key, started.state, canonicalText(started as unknown as JsonValue, 'harness execution journal record'));
      return { disposition: 'created' as const, record: started };
    }).immediate();
  }

  async commit(
    identity: HarnessExecutionOperationIdentity,
    outcome: HarnessJournalOutcome,
  ): Promise<HarnessJournalCommittedRecord> {
    validateIdentity(identity);
    const key = slotKey(identity.slot);
    return this.#db.transaction(() => {
      const row = this.#db.prepare(`
        SELECT record_json FROM dh_v3_harness_execution_journal WHERE slot_key = ?
      `).get(key) as JournalRecordRow | undefined;
      if (row === undefined) throw new Error('cannot commit a Harness operation that was never begun');
      const existing = decodeJson<HarnessExecutionJournalRecord>(row.record_json, 'harness execution journal record');
      if (!sameIdentity(identity, existing.identity)) {
        throw new Error('cannot commit a Harness operation under a conflicting semantic identity');
      }
      if (existing.state === 'committed') {
        if (outcomeKey(existing.outcome) !== outcomeKey(outcome)) {
          throw new Error('Harness operation slot already has a different committed outcome');
        }
        return existing;
      }
      const committed: HarnessJournalCommittedRecord = {
        formatVersion: HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION,
        state: 'committed',
        identity,
        outcome,
      };
      this.#db.prepare(`
        UPDATE dh_v3_harness_execution_journal
        SET state = ?, record_json = ?
        WHERE slot_key = ?
      `).run(committed.state, canonicalText(committed as unknown as JsonValue, 'harness execution journal record'), key);
      return committed;
    }).immediate();
  }

  /** Inspection surface for tests/review tooling; not part of the port. */
  getRecords(): readonly HarnessExecutionJournalRecord[] {
    const rows = this.#db.prepare(`
      SELECT record_json FROM dh_v3_harness_execution_journal ORDER BY slot_key ASC
    `).all() as JournalRecordRow[];
    return rows.map((row) => decodeJson<HarnessExecutionJournalRecord>(row.record_json, 'harness execution journal record'));
  }
}

/* ------------------------------------------------------------------------- */
/* Admission effect journal (mirrors VolatileAdmissionEffectJournal)          */
/* ------------------------------------------------------------------------- */

function admissionNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      `${label} must be a non-empty string`,
    );
  }
}

function validateEffectRecord(record: AdmissionEffectJournalRecord): void {
  admissionNonEmpty(record.effectId, 'effectId');
  admissionNonEmpty(record.target.workflowId, 'workflowId');
  admissionNonEmpty(record.target.instanceKey, 'instanceKey');
  admissionNonEmpty(record.durableControlTurnId, 'durableControlTurnId');
  admissionNonEmpty(record.effectType, 'effectType');
  if (!Number.isSafeInteger(record.operationOrdinal) || record.operationOrdinal <= 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      'operationOrdinal must be a positive safe integer',
    );
  }
  if (!Number.isSafeInteger(record.attempt) || record.attempt <= 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      'attempt must be a positive safe integer',
    );
  }
}

/**
 * Exact effect identity for re-begin compatibility. Excludes `attempt`,
 * `startedAt`, `completedAt`, status and outcome — the volatile execution
 * detail — per the frozen store contract.
 */
function effectIdentityKey(record: AdmissionEffectJournalRecord): string {
  return canonicalJsonStringify({
    effectId: record.effectId,
    target: {
      workflowId: record.target.workflowId,
      instanceKey: record.target.instanceKey,
    },
    durableControlTurnId: record.durableControlTurnId,
    operationOrdinal: record.operationOrdinal,
    effectType: record.effectType,
    effectSemantics: record.effectSemantics,
    input: record.input,
    idempotencyKey: record.idempotencyKey ?? null,
  });
}

function sameEffectIdentity(
  left: AdmissionEffectJournalRecord,
  right: AdmissionEffectJournalRecord,
): boolean {
  return effectIdentityKey(left) === effectIdentityKey(right);
}

function effectOutcomeKey(record: AdmissionEffectJournalRecord): string {
  return canonicalJsonStringify({
    status: record.status,
    output: record.output ?? null,
    error: record.error ?? null,
  });
}

/**
 * SQLite-backed admission effect journal. `status` mirrors
 * `record_json.status`; begin is keyed by effectId with exact identity
 * compatibility, completion is idempotent per canonical outcome.
 */
export class NodeSqliteAdmissionEffectJournal implements AdmissionDurableEffectJournal {
  readonly #db: AuthoritySqliteDatabase;

  constructor(db: AuthoritySqliteDatabase) {
    this.#db = db;
  }

  async getEffect(effectId: string): Promise<AdmissionEffectJournalRecord | null> {
    const row = this.#db.prepare(`
      SELECT record_json FROM dh_v3_admission_effect_journal WHERE effect_id = ?
    `).get(effectId) as EffectRecordRow | undefined;
    if (row === undefined) return null;
    return decodeJson<AdmissionEffectJournalRecord>(row.record_json, 'admission effect journal record');
  }

  async beginEffect(record: AdmissionEffectJournalRecord): Promise<{
    readonly disposition: 'created' | 'existing';
    readonly record: AdmissionEffectJournalRecord;
  }> {
    validateEffectRecord(record);
    if (record.status !== 'started') {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        'beginEffect requires a started record',
      );
    }
    const encoded = canonicalText(record as unknown as JsonValue, 'admission effect journal record');
    return this.#db.transaction(() => {
      const existing = this.#db.prepare(`
        SELECT record_json FROM dh_v3_admission_effect_journal WHERE effect_id = ?
      `).get(record.effectId) as EffectRecordRow | undefined;
      if (existing !== undefined) {
        const stored = decodeJson<AdmissionEffectJournalRecord>(existing.record_json, 'admission effect journal record');
        if (!sameEffectIdentity(stored, record)) {
          throw new CentralAdmissionError(
            'ADMISSION_EFFECT_JOURNAL_CONFLICT',
            `effect ${record.effectId} already exists with an incompatible identity`,
          );
        }
        return { disposition: 'existing' as const, record: stored };
      }
      this.#db.prepare(`
        INSERT INTO dh_v3_admission_effect_journal (effect_id, status, record_json)
        VALUES (?, ?, ?)
      `).run(record.effectId, record.status, encoded);
      return { disposition: 'created' as const, record };
    }).immediate();
  }

  async completeEffect(
    effectId: string,
    outcome:
      | { readonly status: 'completed'; readonly output: JsonValue; readonly completedAt: string }
      | { readonly status: 'failed'; readonly error: JsonValue; readonly completedAt: string },
  ): Promise<AdmissionEffectJournalRecord> {
    admissionNonEmpty(effectId, 'effectId');
    // Store-side canonical-JSON gate (P3-4): a journaled outcome must always be
    // canonical-JSON-safe, independent of the caller's own checks.
    try {
      canonicalJsonStringify(
        outcome.status === 'completed' ? { output: outcome.output } : { error: outcome.error },
      );
    } catch (error) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect ${effectId} outcome must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return this.#db.transaction(() => {
      const row = this.#db.prepare(`
        SELECT record_json FROM dh_v3_admission_effect_journal WHERE effect_id = ?
      `).get(effectId) as EffectRecordRow | undefined;
      if (row === undefined) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `cannot complete effect ${effectId} that was never begun`,
        );
      }
      const existing = decodeJson<AdmissionEffectJournalRecord>(row.record_json, 'admission effect journal record');
      const completed: AdmissionEffectJournalRecord = outcome.status === 'completed'
        ? {
            ...existing,
            status: 'completed',
            output: outcome.output,
            completedAt: outcome.completedAt,
          }
        : {
            ...existing,
            status: 'failed',
            error: outcome.error,
            completedAt: outcome.completedAt,
          };
      if (existing.status !== 'started') {
        if (effectOutcomeKey(existing) !== effectOutcomeKey(completed)) {
          throw new CentralAdmissionError(
            'ADMISSION_EFFECT_JOURNAL_CONFLICT',
            `effect ${effectId} is already settled with a conflicting outcome`,
          );
        }
        return existing;
      }
      this.#db.prepare(`
        UPDATE dh_v3_admission_effect_journal
        SET status = ?, record_json = ?
        WHERE effect_id = ?
      `).run(completed.status, canonicalText(completed as unknown as JsonValue, 'admission effect journal record'), effectId);
      return completed;
    }).immediate();
  }

  /** Inspection surface for tests/review tooling; not part of the port. */
  getRecords(): readonly AdmissionEffectJournalRecord[] {
    const rows = this.#db.prepare(`
      SELECT record_json FROM dh_v3_admission_effect_journal ORDER BY effect_id ASC
    `).all() as EffectRecordRow[];
    return rows.map((row) => decodeJson<AdmissionEffectJournalRecord>(row.record_json, 'admission effect journal record'));
  }
}
