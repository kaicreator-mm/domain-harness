/**
 * v0.9 N02 (#1028) — physical transactional CAS document port.
 * ===========================================================================
 *
 * The physical substrate of the v0.9 protected H registry for the FIRST
 * SELECTED reference cohort (Node.js 24.x ESM + true-CAS SQLite; L2 Freeze
 * decision 2/5 and §11 D01/D02): a generic durable document store with true
 * revision compare-and-swap. It contains NO H governance logic (#1032 owns
 * registry schema/authorization/currentness) and NO business
 * Journal/Admission/Effect logic (the selected Kernel owns those); this layer
 * owns ONLY physical CAS durability, locking, rollback and typed failure.
 *
 * Structure-compatible with the v0.8 `CasDocumentStore` face
 * (`packages/domain-harness/src/host-v8/cas.ts`, read-only reuse reference —
 * deliberately NOT imported: the v0.9 physical adapter is self-contained):
 *
 *   get(key)                    → { value, revision } | null (absent)
 *   put(key, value, condition)  → { revision } | typed conflict
 *   remove(key, condition)      → void | typed conflict
 *   list(prefix)                → sorted keys with the prefix
 *   close()                     → resource disposal
 *
 * DISPATCH-specified v0.9 extensions (documented as the JIT integration
 * contract for #1032's host-v9 port declaration and #1036):
 *
 *   1. The write condition is a discriminated union — exactly one of
 *      `{ kind: 'create' }` (key must be absent; lands at revision 0) or
 *      `{ kind: 'cas', revision }` (key must exist at exactly that revision;
 *      lands at revision + 1). A write WITHOUT a physical revision
 *      expectation does not exist: an absent/malformed condition is a typed
 *      refusal, never an unconditional overwrite (v0.8 C01-N10 discipline).
 *   2. Typed failure taxonomy (see `V09CasErrorCode`): conflicts are typed
 *      with expected/actual revisions, contention is typed busy, unusable
 *      storage is typed unavailable, and genuinely indeterminate outcomes are
 *      typed UNKNOWN — never guessed success (no false ACK).
 *   3. `transact(mutations)` — an atomic multi-document CAS transaction: all
 *      mutations apply sequentially in ONE immediate transaction with
 *      in-transaction visibility, or NONE apply (typed mid-batch refusal
 *      rolls the whole batch back). This is the physical ordering primitive
 *      underneath §11 D02 "authorization permit commit and revocation commit
 *      are ordered in the same protected currentness/epoch authority".
 *
 * Documents are canonical JSON: values must be JSON-representable; the
 * audience/currentness tuple is part of the stored document value, so a CAS
 * swap publishes the whole tuple atomically (no torn field-level writes).
 */

/** Result of a successful `get`: the parsed JSON value and its physical revision. */
export interface V09CasGetResult {
  readonly value: unknown;
  readonly revision: number;
}

/**
 * The write condition. `create` requires the key to be absent (lands at
 * revision 0); `cas` requires the key to exist at exactly `revision` (lands
 * at `revision + 1`). Validated at runtime by `validateV09WriteCondition`.
 */
export type V09CasWriteCondition =
  | { readonly kind: 'create' }
  | { readonly kind: 'cas'; readonly revision: number };

/** One mutation inside a `transact` batch. */
export type V09CasMutation =
  | { readonly kind: 'put'; readonly key: string; readonly value: unknown; readonly condition: V09CasWriteCondition }
  | { readonly kind: 'remove'; readonly key: string; readonly condition: V09CasWriteCondition };

/** Per-mutation result inside a committed transaction, in mutation order. */
export interface V09CasTransactionEntry {
  readonly key: string;
  readonly op: 'put' | 'remove';
  /** `put`: the new post-write revision. `remove`: the revision the key had when deleted. */
  readonly revision: number;
}

/**
 * The generic physical transactional CAS document port. Implementations must
 * be true CAS stores: cross-process atomic revision-checked writes (IMMEDIATE
 * transactions), typed failures, honest UNKNOWN, and real `close()` disposal.
 */
export interface V09PhysicalCasStore {
  /** Read the document at `key`, deep-equivalent JSON, or `null` when absent. */
  get(key: string): Promise<V09CasGetResult | null>;
  /**
   * Write under a mandatory create/CAS condition. Returns the new revision,
   * or fails typed: `already_exists` / `revision_conflict` / `store_busy` /
   * `store_unavailable` / `outcome_unknown` / `store_closed`.
   */
  put(key: string, value: unknown, condition: V09CasWriteCondition): Promise<{ readonly revision: number }>;
  /**
   * Delete under a mandatory revision CAS condition (`create` is a typed
   * refusal — deletes always carry the revision they delete).
   */
  remove(key: string, condition: V09CasWriteCondition): Promise<void>;
  /**
   * Atomic multi-document CAS transaction: every mutation applies in order in
   * ONE immediate transaction (later mutations see earlier ones' effects), or
   * the first typed refusal rolls the WHOLE batch back leaving zero partial
   * writes. Malformed mutations are validated before the write lock is taken.
   */
  transact(mutations: readonly V09CasMutation[]): Promise<readonly V09CasTransactionEntry[]>;
  /** Sorted keys sharing `prefix`. */
  list(prefix: string): Promise<readonly string[]>;
  /** Release the physical resources. Idempotent; later operations fail typed `store_closed`. */
  close(): Promise<void>;
}

export type V09CasErrorCode =
  | 'condition_required'
  | 'condition_malformed'
  | 'key_malformed'
  | 'value_not_json'
  | 'already_exists'
  | 'revision_conflict'
  | 'store_busy'
  | 'store_unavailable'
  | 'store_closed'
  | 'driver_unavailable'
  | 'outcome_unknown';

/**
 * Typed physical CAS failure. `indeterminate` is true ONLY for
 * `outcome_unknown`: the attempted operation's landed state is physically
 * unknown (e.g. an unclassifiable driver error) and the caller MUST resolve
 * it by an authoritative `get` read-back — never assume success, never assume
 * failure. Every other code is a determinate refusal (nothing was written).
 * `actualRevision` is present when the key exists at a conflicting revision
 * and absent when the key does not exist (distinguishes stale-CAS from
 * deleted-key CAS for the loser's retry decision).
 */
export class V09CasStoreError extends Error {
  readonly code: V09CasErrorCode;
  readonly expectedRevision?: number;
  readonly actualRevision?: number;
  readonly indeterminate: boolean;

  constructor(
    code: V09CasErrorCode,
    message: string,
    details?: {
      readonly expectedRevision?: number;
      readonly actualRevision?: number;
      readonly cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'V09CasStoreError';
    this.code = code;
    this.indeterminate = code === 'outcome_unknown';
    if (details?.expectedRevision !== undefined) this.expectedRevision = details.expectedRevision;
    if (details?.actualRevision !== undefined) this.actualRevision = details.actualRevision;
    if (details?.cause !== undefined) this.cause = details.cause;
  }
}

export function isV09CasStoreError(error: unknown): error is V09CasStoreError {
  return error instanceof V09CasStoreError;
}

/**
 * Runtime gate for the write condition: absent condition is a typed refusal
 * (unconditional writes do not exist on this port); `create` and
 * `{kind:'cas', revision:<non-negative safe integer>}` are the only accepted
 * shapes. Takes `unknown` because the physical boundary must classify junk,
 * not trust TypeScript annotations.
 */
export function validateV09WriteCondition(key: string, condition: unknown): V09CasWriteCondition {
  if (typeof condition !== 'object' || condition === null) {
    throw new V09CasStoreError(
      'condition_required',
      `write of ${key} requires a physical revision expectation ({kind:'create'} or {kind:'cas',revision}); unconditional writes do not exist on this store`,
    );
  }
  const kind = (condition as { kind?: unknown }).kind;
  if (kind === 'create') return { kind: 'create' };
  if (kind !== 'cas') {
    throw new V09CasStoreError(
      'condition_malformed',
      `write of ${key} carries condition kind ${String(kind)}; the physical write plan must be exactly {kind:'create'} or {kind:'cas',revision}`,
    );
  }
  const revision = (condition as { revision?: unknown }).revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new V09CasStoreError(
      'condition_malformed',
      `write of ${key} declares CAS revision ${String(revision)}; CAS expectations must be non-negative safe integers`,
    );
  }
  return { kind: 'cas', revision };
}

export function validateV09CasKey(key: unknown): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new V09CasStoreError('key_malformed', 'document keys must be non-empty strings');
  }
  return key;
}

/** Serialize a document to its canonical stored JSON form (JSON-only port). */
export function serializeV09CasValue(key: string, value: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch (cause) {
    throw new V09CasStoreError(
      'value_not_json',
      `value for ${key} is not JSON-representable; the physical store persists JSON documents only`,
      { cause },
    );
  }
  if (typeof serialized !== 'string') {
    throw new V09CasStoreError(
      'value_not_json',
      `value for ${key} serializes to undefined; the physical store persists JSON documents only`,
    );
  }
  return serialized;
}

/** Parse a stored JSON document back, typed on physical corruption. */
export function parseV09CasValue(key: string, stored: string): unknown {
  try {
    return JSON.parse(stored) as unknown;
  } catch (cause) {
    throw new V09CasStoreError(
      'outcome_unknown',
      `stored bytes for ${key} are not valid JSON; the document cannot be trusted as either present or absent content`,
      { cause },
    );
  }
}

/**
 * Bootstrap-time physical true-CAS probe (v0.8 C01-N7 discipline, ported):
 * a store presented to protected H must PROVE true revision CAS behavior by
 * exercising an actual conflict before it is accepted. A store that cannot
 * run the sequence, accepts a stale-revision write, or accepts an
 * unconditional write is refused typed — never silently degraded.
 */
export async function probeV09PhysicalCasStore(store: V09PhysicalCasStore): Promise<void> {
  const key = `v09:cas-probe:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  try {
    if ((await store.get(key)) !== null) {
      throw new Error('probe key is not fresh');
    }
    const created = await store.put(key, { probe: 'create' }, { kind: 'create' });
    if (created.revision !== 0) {
      throw new Error(`create returned revision ${String(created.revision)} instead of 0`);
    }
    const advanced = await store.put(key, { probe: 'cas' }, { kind: 'cas', revision: 0 });
    if (advanced.revision !== 1) {
      throw new Error(`advance returned revision ${String(advanced.revision)} instead of 1`);
    }
  } catch (error) {
    throw new V09CasStoreError(
      'store_unavailable',
      `the presented storage could not exercise the true-CAS probe sequence (create, CAS advance, read back); it is refused instead of degraded (${String(error instanceof Error ? error.message : error)})`,
      { cause: error },
    );
  }
  let staleRejected = false;
  try {
    await store.put(key, { probe: 'stale' }, { kind: 'cas', revision: 0 });
  } catch {
    staleRejected = true;
  }
  if (!staleRejected) {
    throw new V09CasStoreError(
      'store_unavailable',
      'the presented storage accepted a stale-revision write; it is not a true CAS store and is refused instead of degraded',
    );
  }
  let unconditionalRejected = false;
  try {
    await store.put(key, { probe: 'unconditional' }, undefined as unknown as V09CasWriteCondition);
  } catch {
    unconditionalRejected = true;
  }
  if (!unconditionalRejected) {
    throw new V09CasStoreError(
      'store_unavailable',
      'the presented storage accepted an unconditional write; revision-conditioned writes are mandatory',
    );
  }
  const after = await store.get(key);
  if (after === null || after.revision !== 1 || (after.value as { probe?: string }).probe !== 'cas') {
    throw new V09CasStoreError(
      'store_unavailable',
      'CAS probe read-back does not match the last accepted physical write',
    );
  }
  await store.remove(key, { kind: 'cas', revision: 1 });
  if ((await store.get(key)) !== null) {
    throw new V09CasStoreError('store_unavailable', 'CAS probe cleanup remove did not take effect');
  }
}
