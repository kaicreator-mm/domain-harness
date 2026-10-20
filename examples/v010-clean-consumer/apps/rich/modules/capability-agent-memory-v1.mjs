/**
 * T05 fixture — the selected C Memory capability for the Agent workflow
 * slice (#1172).
 * ====================================================================
 *
 * This is the SAME product adapter T04 delivered
 * (`createV10ScopedMemory` + `openSqliteCasStore` from the installed
 * `@kaicreator/domain-harness/v8/host` package, reached through this
 * module's DECLARED npm allowance), re-scoped for the T05 Agent Business:
 * the sealed authorization allowlist names exactly the deployment tenant
 * and Business package the T05 BUILD composes. It owns only typed
 * put/get/search/delete over its own SQLite document store; it holds no
 * Kernel State/Journal/Fence/Receipt/Permit authority and never writes the
 * K docs namespace.
 */

import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import {
  createV10ScopedMemory,
  openSqliteCasStore,
} from '@kaicreator/domain-harness/v8/host';

export const MODULE_ID = 'capability-agent-memory@v010.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:agent-memory', kind: 'capability-endpoint' },
];

export const OPERATIONS = [
  { operationId: 'memory.put', effectClass: 'none' },
  { operationId: 'memory.get', effectClass: 'none' },
  { operationId: 'memory.search', effectClass: 'none' },
  { operationId: 'memory.delete', effectClass: 'none' },
];

const MEMORY_STORE_DIR = join(tmpdir(), 'dh-v010-t05-agent-memory');

function memoryStorePath() {
  const pinned = globalThis.__v010T05MemoryStorePath;
  return typeof pinned === 'string' && pinned.length > 0 ? pinned : join(MEMORY_STORE_DIR, 'memory.sqlite');
}

/** Sealed allowlist: only the T05 Agent Business in the T05 tenant may read/write. */
const AUTHORIZED_SCOPES = Object.freeze([
  Object.freeze({
    tenantId: 'tenant:v010-t05-rich',
    businessPackageId: 'business-agent-workflow@v010.1.0.0',
  }),
]);

function authorize({ scope }) {
  return AUTHORIZED_SCOPES.some((allowed) =>
    allowed.tenantId === scope.tenantId && allowed.businessPackageId === scope.businessPackageId);
}

const clockNow = () => {
  const pinned = globalThis.__v010T05MemoryClock;
  return typeof pinned === 'function' ? pinned() : Date.now();
};

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
  return await opened;
}

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
    throw new Error('memory operation refused: MEMORY_SCOPE_INVALID: scope must be a record');
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
