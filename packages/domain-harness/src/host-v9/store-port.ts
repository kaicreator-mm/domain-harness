/**
 * DomainHarness v0.9 N06 (#1032) — typed physical storage PORT of the
 * protected H registry (logical layer only; no physical store lives here).
 * ===========================================================================
 *
 * The physical Node24/SQLite true-CAS store is owned by #1028. This module
 * declares ONLY the v0.9 port the protected H registry consumes, injected at
 * host bootstrap. Exact method contract (documented for the #1028 JIT
 * integration; every physical store must implement precisely this face):
 *
 *   get(key: string)
 *     → Promise<{ value: unknown; revision: number } | null>
 *       The document and its current physical revision, or null when the key
 *       is absent. Returned values must be JSON-representable snapshots that
 *       never alias the authoritative bytes.
 *
 *   put(key: string, value: unknown, condition: V09StorePutCondition)
 *     → Promise<{ revision: number }>            — the NEW revision after an
 *       accepted write, where
 *       condition = { kind: 'create' }                     (write only if the key is absent; an accepted create yields revision 0)
 *                  | { kind: 'cas'; revision: number }     (write only if the current revision equals `revision`; an accepted CAS yields revision + 1)
 *     and refuses with a typed V09HostStoreError instead:
 *       V09_STORE_CONFLICT — the condition did not hold (key existed / revision moved). A lost read must NEVER degrade into an unconditional overwrite.
 *       V09_STORE_BUSY     — transient physical contention; the caller may retry.
 *       V09_STORE_DISK     — durable-write failure; the write must be treated as not committed.
 *       V09_STORE_UNKNOWN  — any other physical failure; fail closed.
 *       V09_STORE_MISUSE   — malformed key or an absent/ambiguous condition; unconditional writes do not exist on this port.
 *
 *   close(): Promise<void> — release all physical resources; no further ops.
 *
 * Structural compatibility with the v0.8 `CasDocumentStore` face
 * (`get → {value, revision} | null`, true revision CAS, deep-cloned values)
 * is intentional; the v0.9 condition shape is the discriminated
 * `{kind:'create'} | {kind:'cas',revision}` union above.
 *
 * `probeV09Store` runs at host bootstrap and REFUSES any store that cannot
 * prove true create-if-absent + revision-CAS behavior (fail closed, same
 * discipline as the v0.8 `probeTrueCasStore` bootstrap probe).
 */

import { V09HostError } from './errors.js';

export interface V09StoreDocument {
  readonly value: unknown;
  readonly revision: number;
}

export type V09StorePutCondition = { readonly kind: 'create' } | { readonly kind: 'cas'; readonly revision: number };

export type V09StoreErrorCode =
  | 'V09_STORE_CONFLICT'
  | 'V09_STORE_BUSY'
  | 'V09_STORE_DISK'
  | 'V09_STORE_UNKNOWN'
  | 'V09_STORE_MISUSE';

export class V09HostStoreError extends Error {
  readonly code: V09StoreErrorCode;

  constructor(code: V09StoreErrorCode, message: string) {
    super(message);
    this.name = 'V09HostStoreError';
    this.code = code;
  }
}

/** The physical document port every v0.9 protected-H store implements. */
export interface V09HostDocumentStore {
  get(key: string): Promise<V09StoreDocument | null>;
  put(key: string, value: unknown, condition: V09StorePutCondition): Promise<{ readonly revision: number }>;
  close(): Promise<void>;
}

export function validateV09StoreCondition(key: string, condition: V09StorePutCondition): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new V09HostStoreError('V09_STORE_MISUSE', 'document keys must be non-empty strings');
  }
  if (typeof condition !== 'object' || condition === null) {
    throw new V09HostStoreError(
      'V09_STORE_MISUSE',
      `write of ${key} requires a physical revision expectation ({kind:'create'} or {kind:'cas',revision}); unconditional writes do not exist on this port`,
    );
  }
  if (condition.kind === 'create') {
    return;
  }
  if (condition.kind === 'cas') {
    if (!Number.isSafeInteger(condition.revision) || condition.revision < 0) {
      throw new V09HostStoreError(
        'V09_STORE_MISUSE',
        `write of ${key} declares a malformed CAS revision; expectations must be non-negative safe integers`,
      );
    }
    return;
  }
  throw new V09HostStoreError(
    'V09_STORE_MISUSE',
    `write of ${key} carries an unsupported condition kind; the physical write plan must be exactly create or CAS`,
  );
}

/**
 * Map a physical store failure onto the protected-H fail-closed refusal.
 * BUSY/DISK/UNKNOWN all refuse as `APPROVAL_STORE_UNAVAILABLE` (D04) — the
 * registry never degrades or silently skips a currentness/artifact step when
 * the store is unreachable.
 */
export function storeFailureToHostError(error: unknown, operation: string): V09HostError {
  if (error instanceof V09HostStoreError) {
    return new V09HostError(
      'APPROVAL_STORE_UNAVAILABLE',
      `V09_STORE_${error.code}`,
      `${operation} failed on the physical store (${error.code}) and fails closed: ${error.message}`,
    );
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new V09HostError(
    'APPROVAL_STORE_UNAVAILABLE',
    'V09_STORE_UNKNOWN',
    `${operation} failed on the physical store and fails closed: ${detail}`,
  );
}

/**
 * Bootstrap-time physical CAS probe: the presented store must PROVE true
 * create-if-absent + revision-CAS behavior by exercising an actual conflict
 * before the host accepts it. A store that accepts a stale-revision write,
 * accepts an unconditional write, or cannot run the sequence is refused
 * typed — never degraded. The probe key is CAS-overwritten to a tombstone
 * marker at the end (this port intentionally has no unconditional remove).
 */
export async function probeV09Store(store: V09HostDocumentStore): Promise<void> {
  const key = `v9host9/probe/${Date.now().toString(36)}-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36)}`;
  const fail = (detail: string): V09HostError =>
    new V09HostError(
      'STORE_UNSUPPORTED',
      'STORE_UNSUPPORTED',
      `the presented storage could not prove the true-CAS probe sequence and is refused instead of degraded: ${detail}`,
    );
  const absent = await store.get(key);
  if (absent !== null) {
    throw fail('probe key is not fresh');
  }
  let created: { readonly revision: number };
  try {
    created = await store.put(key, { probe: 'create' }, { kind: 'create' });
  } catch (error) {
    throw fail(`create-if-absent write refused: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (created.revision !== 0) {
    throw fail(`create returned revision ${String(created.revision)} instead of 0`);
  }
  let advanced: { readonly revision: number };
  try {
    advanced = await store.put(key, { probe: 'cas' }, { kind: 'cas', revision: 0 });
  } catch (error) {
    throw fail(`CAS advance refused: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (advanced.revision !== 1) {
    throw fail(`CAS advance returned revision ${String(advanced.revision)} instead of 1`);
  }
  let staleRejected = false;
  try {
    await store.put(key, { probe: 'stale' }, { kind: 'cas', revision: 0 });
  } catch {
    staleRejected = true;
  }
  if (!staleRejected) {
    throw fail('the store accepted a stale-revision write; it is not a true CAS store');
  }
  let unconditionalRejected = false;
  try {
    await store.put(key, { probe: 'unconditional' }, undefined as unknown as V09StorePutCondition);
  } catch {
    unconditionalRejected = true;
  }
  if (!unconditionalRejected) {
    throw fail('the store accepted an unconditional write; revision-conditioned writes are mandatory');
  }
  const after = await store.get(key);
  if (after === null || after.revision !== 1 || (after.value as { probe?: string } | null)?.probe !== 'cas') {
    throw fail('CAS probe read-back does not match the last accepted physical write');
  }
  await store.put(key, { tombstone: true }, { kind: 'cas', revision: 1 });
}
