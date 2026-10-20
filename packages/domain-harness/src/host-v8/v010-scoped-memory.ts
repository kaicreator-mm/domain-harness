/**
 * v0.10 T04: optional scoped Memory C/Host adapter over physical document CAS.
 * This is not K State, Journal, Receipt, Fence or an external Effect permit.
 */
import { Buffer } from 'node:buffer';
import type { CasDocumentStore, CasPutConditions } from './cas.js';

export type V10MemoryOperation = 'put' | 'get' | 'search' | 'delete';
export interface V10MemoryScope {
  deployedAppId: string;
  tenantId: string;
  appId: string;
  businessPackageId: string;
  agentId: string;
  threadId: string;
}
export interface V10MemoryProvenance { source: string; recordedBy: string; }
export interface V10MemoryRead {
  value: unknown;
  revision: number;
  provenance: V10MemoryProvenance;
  expiresAtMs: number | null;
}
export interface V10MemoryAuthRequest {
  operation: V10MemoryOperation;
  scope: V10MemoryScope;
  key: string;
}
export interface V10MemoryHost {
  store: CasDocumentStore;
  authorize: (request: V10MemoryAuthRequest) => boolean | Promise<boolean>;
  now?: () => number;
}

export class V10MemoryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'V10MemoryError';
  }
}
function refuse(code: string, message: string): never {
  throw new V10MemoryError(code, message);
}
const SCOPED_FIELDS = ['deployedAppId', 'tenantId', 'appId', 'businessPackageId', 'agentId', 'threadId'] as const;
function scopedPrefix(scope: V10MemoryScope): string {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    refuse('MEMORY_SCOPE_INVALID', 'scope must contain every deployment and Business identity field');
  }
  const segments: string[] = [];
  for (const field of SCOPED_FIELDS) {
    const v = scope[field];
    if (typeof v !== 'string' || v.length === 0 || v.length > 256) {
      refuse('MEMORY_SCOPE_INVALID', 'invalid scoped Memory identity: ' + field);
    }
    segments.push(Buffer.from(v, 'utf8').toString('base64url'));
  }
  return 'v010:memory:' + segments.join(':') + ':';
}
function validKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
    refuse('MEMORY_KEY_INVALID', 'memory key must be a bounded nonempty string');
  }
  return key;
}
function fullKey(scope: V10MemoryScope, key: string): string {
  return scopedPrefix(scope) + Buffer.from(validKey(key), 'utf8').toString('base64url');
}
function canonicalJson(value: unknown): unknown {
  try {
    const raw = JSON.stringify(value);
    if (raw === undefined) refuse('MEMORY_VALUE_INVALID', 'value must be JSON-representable');
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof V10MemoryError) throw error;
    refuse('MEMORY_VALUE_INVALID', 'value must be JSON-representable');
  }
}
function validProvenance(v: V10MemoryProvenance): V10MemoryProvenance {
  if (!v || typeof v !== 'object'
    || typeof v.source !== 'string' || v.source.length === 0 || v.source.length > 256
    || typeof v.recordedBy !== 'string' || v.recordedBy.length === 0 || v.recordedBy.length > 256) {
    refuse('MEMORY_PROVENANCE_INVALID', 'write requires source and recordedBy provenance');
  }
  return { source: v.source, recordedBy: v.recordedBy };
}
function validCondition(c: CasPutConditions): CasPutConditions {
  const create = c?.mustBeAbsent === true;
  const cas = Number.isSafeInteger(c?.mustMatchRevision) && (c.mustMatchRevision as number) >= 0;
  if (create === cas) refuse('MEMORY_CAS_REQUIRED', 'one create or revision-CAS condition is required');
  return c;
}

export class V10ScopedMemoryCapability {
  readonly #store: CasDocumentStore;
  readonly #authorize: V10MemoryHost['authorize'];
  readonly #now: () => number;
  constructor(host: V10MemoryHost) {
    if (!host || typeof host.authorize !== 'function') {
      refuse('MEMORY_AUTHORIZATION_REQUIRED', 'trusted Host authorization is mandatory');
    }
    this.#store = host.store;
    this.#authorize = host.authorize;
    this.#now = host.now ?? Date.now;
  }
  async #admit(operation: V10MemoryOperation, scope: V10MemoryScope, key: string): Promise<string> {
    const physical = fullKey(scope, key);
    if ((await this.#authorize({ operation, scope, key })) !== true) {
      refuse('MEMORY_SCOPE_DENIED', 'memory access refused by Host');
    }
    return physical;
  }
  #visible(value: unknown, revision: number): V10MemoryRead | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      refuse('MEMORY_RECORD_INVALID', 'stored Memory document is not a record');
    }
    const v = value as Record<string, unknown>;
    if (!Object.hasOwn(v, 'value')
      || !(v.expiresAtMs === null || (typeof v.expiresAtMs === 'number' && Number.isFinite(v.expiresAtMs)))
      || !v.provenance || typeof v.provenance !== 'object') {
      refuse('MEMORY_RECORD_INVALID', 'stored memory value, expiry or provenance malformed');
    }
    if (v.expiresAtMs !== null && this.#now() >= v.expiresAtMs) return null;
    return { value: canonicalJson(v.value), revision,
      provenance: validProvenance(v.provenance as V10MemoryProvenance),
      expiresAtMs: v.expiresAtMs };
  }
  async put(input: {
    scope: V10MemoryScope;
    key: string;
    value: unknown;
    provenance: V10MemoryProvenance;
    expiresAtMs?: number | null;
    condition: CasPutConditions;
  }): Promise<{ revision: number }> {
    const physical = await this.#admit('put', input.scope, input.key);
    const expiresAtMs = input.expiresAtMs ?? null;
    if (expiresAtMs !== null && (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= this.#now())) {
      refuse('MEMORY_TTL_INVALID', 'expiration must be a future safe-integer instant');
    }
    // An expired row is invisible to callers, but remains a physical CAS row.
    // A create may reclaim it only by matching its observed revision; two
    // concurrent creators must never both succeed. Live rows still reject
    // mustBeAbsent, and explicit revision-CAS semantics remain unchanged.
    let condition = validCondition(input.condition);
    if (condition.mustBeAbsent === true) {
      const existing = await this.#store.get(physical);
      if (existing !== null && this.#visible(existing.value, existing.revision) === null) {
        condition = { mustMatchRevision: existing.revision };
      }
    }
    return await this.#store.put(physical, {
      value: canonicalJson(input.value),
      provenance: validProvenance(input.provenance),
      expiresAtMs,
    }, condition);
  }
  async get(scope: V10MemoryScope, key: string): Promise<V10MemoryRead | null> {
    const physical = await this.#admit('get', scope, key);
    const found = await this.#store.get(physical);
    return found === null ? null : this.#visible(found.value, found.revision);
  }
  async search(scope: V10MemoryScope, keyPrefix = '', maxResults = 50): Promise<readonly ({ key: string } & V10MemoryRead)[]> {
    const prefix = scopedPrefix(scope);
    if (typeof keyPrefix !== 'string' || keyPrefix.length > 512
      || !Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 100) {
      refuse('MEMORY_SEARCH_INVALID', 'invalid bounded memory query');
    }
    if ((await this.#authorize({ operation: 'search', scope, key: keyPrefix })) !== true) {
      refuse('MEMORY_SCOPE_DENIED', 'memory search refused by Host');
    }
    const results: ({ key: string } & V10MemoryRead)[] = [];
    for (const physical of await this.#store.list(prefix)) {
      if (!physical.startsWith(prefix)) continue;
      const key = Buffer.from(physical.slice(prefix.length), 'base64url').toString('utf8');
      if (!key.startsWith(keyPrefix)) continue;
      if ((await this.#authorize({ operation: 'get', scope, key })) !== true) continue;
      const item = await this.#store.get(physical);
      const visible = item === null ? null : this.#visible(item.value, item.revision);
      if (visible !== null) results.push({ key, ...visible });
      if (results.length >= maxResults) break;
    }
    return results;
  }
  async delete(scope: V10MemoryScope, key: string, revision: number): Promise<void> {
    const physical = await this.#admit('delete', scope, key);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      refuse('MEMORY_CAS_REQUIRED', 'delete requires exact revision');
    }
    await this.#store.remove(physical, { mustMatchRevision: revision });
  }
}

export function createV10ScopedMemory(host: V10MemoryHost): V10ScopedMemoryCapability {
  return new V10ScopedMemoryCapability(host);
}
