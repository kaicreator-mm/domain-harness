/**
 * T04 fixture — the selected C Memory capability package (v0.10 integration
 * slice, #1171).
 * ====================================================================
 *
 * A genuinely selected C capability package for the Rich-with-memory BUILD:
 * it owns exactly the four typed scoped-Memory operations (put/get/search/
 * delete) sealed in the BUILD capability binding, implemented over the REAL
 * product adapter chain — `createV10ScopedMemory` + `openSqliteCasStore`
 * from the installed `@kaicreator/domain-harness/v8/host` package, reached
 * through the module's DECLARED npm allowance (the A01 ordinary-import
 * seam). The physical store is one real SQLite file owned by THIS package
 * (deployment fact), so a restart of the App activation recovers surviving
 * records from the same file.
 *
 * Per-operation authorization (frozen L2 §E) is a sealed allowlist IN THESE
 * BUILD-pinned bytes: only the (tenantId, businessPackageId) pairs listed
 * below may use Memory through this App. The product adapter consults this
 * policy on EVERY operation BEFORE any store access, so a scope the App did
 * not select is typed-refused with zero physical mutation. Caller-claimed
 * identity is never trusted: the scope must name a selected pair, and the
 * identity binding itself (kernel occurrence target → injective tuple) is
 * owned by the Business package + K successors, not re-derived here.
 *
 * This package holds NO Kernel State/Journal/Fence/Receipt authority and
 * needs no K permit: Memory is an optional C capability, and a Tiny BUILD
 * that does not select it never imports or evaluates these bytes.
 */

import { join } from 'node:path';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import {
  createV10ScopedMemory,
  openSqliteCasStore,
} from '@kaicreator/domain-harness/v8/host';

export const MODULE_ID = 'capability-scoped-memory@v010.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:scoped-memory', kind: 'capability-endpoint' },
];

/**
 * The sealed OperationCall-style ABI of this capability: four typed Memory
 * operations, all effectClass 'none' from the Kernel's perspective (Memory
 * is not a K Effect; the only mutation authority here is this package's own
 * scoped document store).
 */
export const OPERATIONS = [
  { operationId: 'memory.put', effectClass: 'none' },
  { operationId: 'memory.get', effectClass: 'none' },
  { operationId: 'memory.search', effectClass: 'none' },
  { operationId: 'memory.delete', effectClass: 'none' },
];

/** The default deployment-owned store directory (one real SQLite file). */
export const MEMORY_STORE_DIR = join(tmpdir(), 'dh-v010-t04-selected-memory');

/**
 * The physical store path for THIS process's opened store. A test may pin a
 * fresh directory per test through globalThis (Windows refuses to unlink a
 * file an open SQLite connection still holds); production deployments use
 * the default path.
 */
function memoryStorePath() {
  const pinned = globalThis.__v010T04MemoryStorePath;
  return typeof pinned === 'string' && pinned.length > 0 ? pinned : join(MEMORY_STORE_DIR, 'memory.sqlite');
}

/**
 * Sealed authorization allowlist: which (tenantId, businessPackageId) pairs
 * this App selected for Memory use. Frozen in BUILD-pinned bytes.
 */
const AUTHORIZED_SCOPES = Object.freeze([
  Object.freeze({ tenantId: 'tenant:v010-t04-rich', businessPackageId: 'business-memory-notes@v010.1.0.0' }),
]);

function authorize({ scope }) {
  return AUTHORIZED_SCOPES.some((allowed) =>
    allowed.tenantId === scope.tenantId && allowed.businessPackageId === scope.businessPackageId);
}

// Test-visible clock seam for deterministic TTL (the PRODUCT adapter takes
// `now` injection; a fixture may pin it — production apps inject real time).
// Shared through globalThis because the activated module instance lives
// behind a per-activation data: URL, distinct from the test's own import of
// this file (the established fixture evidence pattern here).
const clockNow = () => {
  const pinned = globalThis.__v010T04MemoryClock;
  return typeof pinned === 'function' ? pinned() : Date.now();
};
export function setMemoryClockForTest(now) {
  globalThis.__v010T04MemoryClock = now;
}

let opened = null;
async function memory() {
  if (opened === null) {
    const path = memoryStorePath();
    mkdirSync(dirname(path), { recursive: true });
    opened = (async () => {
      const store = await openSqliteCasStore({ path });
      return { store, memory: createV10ScopedMemory({ store, authorize, now: clockNow }) };
    })();
  }
  const handle = await opened;
  return handle;
}

/** Surface the product adapter's typed code inside the effect receipt message. */
function rethrowTyped(operationId, error) {
  const code = error !== null && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : 'MEMORY_ADAPTER_FAULT';
  throw new Error(`${operationId} refused: ${code}: ${error instanceof Error ? error.message : String(error)}`);
}

function requireRecord(payload) {
  if (arguments.length !== 1 || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('scoped-memory adapter receives exactly one plain-data payload');
  }
  return payload;
}

function scopeOf(payload) {
  const scope = payload.scope;
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope)) {
    throw new Error('memory.put refused: MEMORY_SCOPE_INVALID: scope must be a record');
  }
  return scope;
}

export async function memoryPut(payload) {
  const record = requireRecord(payload);
  try {
    const { memory: mem } = await memory();
    const condition = typeof record.expectedRevision === 'number'
      ? { mustMatchRevision: record.expectedRevision }
      : { mustBeAbsent: true };
    let expiresAtMs = null;
    if (record.expiresAtMs !== undefined && record.expiresAtMs !== null) {
      if (typeof record.expiresAtMs !== 'number' || !Number.isSafeInteger(record.expiresAtMs)) {
        throw new Error('memory.put refused: MEMORY_TTL_INVALID: expiresAtMs must be a safe-integer instant');
      }
      expiresAtMs = record.expiresAtMs;
    }
    const { revision } = await mem.put({
      scope: scopeOf(record),
      key: record.key,
      value: record.value,
      provenance: record.provenance,
      expiresAtMs,
      condition,
    });
    return { ok: true, operation: 'memory.put', key: record.key, revision };
  } catch (error) {
    rethrowTyped('memory.put', error);
  }
}

export async function memoryGet(payload) {
  const record = requireRecord(payload);
  try {
    const { memory: mem } = await memory();
    const read = await mem.get(scopeOf(record), record.key);
    return { ok: true, operation: 'memory.get', key: record.key, read };
  } catch (error) {
    rethrowTyped('memory.get', error);
  }
}

export async function memorySearch(payload) {
  const record = requireRecord(payload);
  try {
    const { memory: mem } = await memory();
    const rows = await mem.search(scopeOf(record), record.keyPrefix ?? '', record.maxResults ?? 50);
    return { ok: true, operation: 'memory.search', rows };
  } catch (error) {
    rethrowTyped('memory.search', error);
  }
}

export async function memoryDelete(payload) {
  const record = requireRecord(payload);
  try {
    const { memory: mem } = await memory();
    await mem.delete(scopeOf(record), record.key, record.revision);
    return { ok: true, operation: 'memory.delete', key: record.key };
  } catch (error) {
    rethrowTyped('memory.delete', error);
  }
}
