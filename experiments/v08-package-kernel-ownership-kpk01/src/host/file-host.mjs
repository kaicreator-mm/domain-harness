/**
 * Test Host — file-backed durable generic resource ports (experiment KPK-01,
 * KPK-07)
 * =============================================================================
 *
 * Same generic port surface as memory-host.mjs, but documents are durable
 * files (atomic write via tmp+rename) so an instance "restart" (a brand-new
 * `DomainHarness.load` over a brand-new Host object on the same directory)
 * genuinely recovers kernel journal/pin/instance records. Bounded claim: this
 * proves durable-record recovery through the Host storage seam; it is NOT a
 * real OS crash-mid-write or multi-process contention simulation (KPK-07 is
 * reported with that explicit boundary).
 */

import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

class HostStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HostStoreError';
    this.code = code;
  }
}

function docFileName(key) {
  // Deterministic short hash of the key: doc keys embed canonical JSON and
  // would overflow Windows MAX_PATH if escaped literally. The original key is
  // stored inside the document itself.
  return `${createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 24)}.json`;
}

export class FileDocStore {
  #dir;
  #fault = null;

  constructor(dir) {
    this.#dir = dir;
  }

  /** Physical fault injection for tests (same contract as MemoryDocStore). */
  failNextPutMatching(keySubstring, { skip = 0 } = {}) {
    this.#fault = { keySubstring, remainingSkips: skip };
  }

  async #ensureDir() {
    await mkdir(this.#dir, { recursive: true });
  }

  async #readDoc(key) {
    const doc = await this.#readRaw(path.join(this.#dir, docFileName(key)));
    return doc;
  }

  async #readRaw(file) {
    try {
      const raw = await readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async get(key) {
    const doc = await this.#readDoc(key);
    return doc === null ? null : { value: doc.value, revision: doc.revision };
  }

  async put(key, value, conditions = {}) {
    if (this.#fault !== null && key.includes(this.#fault.keySubstring)) {
      if (this.#fault.remainingSkips > 0) {
        this.#fault.remainingSkips -= 1;
      } else {
        this.#fault = null;
        throw new HostStoreError('HOST_FAULT_INJECTED', `host storage physically faulted during write of ${key}`);
      }
    }
    await this.#ensureDir();
    const file = path.join(this.#dir, docFileName(key));
    const existing = await this.#readDoc(key);
    const exists = existing !== null;
    if (conditions.mustBeAbsent === true && exists) {
      throw new HostStoreError('HOST_KEY_EXISTS', `host doc ${key} already exists`);
    }
    if (conditions.mustMatchRevision !== undefined) {
      if (!exists) {
        throw new HostStoreError('HOST_CAS_CONFLICT', `host doc ${key} does not exist; CAS expected revision ${conditions.mustMatchRevision}`);
      }
      if (existing.revision !== conditions.mustMatchRevision) {
        throw new HostStoreError('HOST_CAS_CONFLICT', `host doc ${key} revision is ${existing.revision}; CAS expected ${conditions.mustMatchRevision}`);
      }
    }
    const revision = exists ? existing.revision + 1 : 0;
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await writeFile(tmp, JSON.stringify({ key, revision, value }), 'utf8');
    await rename(tmp, file);
    return { revision };
  }

  async list(prefix) {
    try {
      const names = await readdir(this.#dir);
      const keys = [];
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const doc = await this.#readRaw(path.join(this.#dir, name));
        if (doc !== null && typeof doc.key === 'string') keys.push(doc.key);
      }
      return keys.filter((key) => key.startsWith(prefix)).sort();
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }
}

export function createFileHost(dir, { now } = {}) {
  const sha256 = {
    async digestUtf8(value) {
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
  const clock = now ?? (() => new Date().toISOString());

  const resourceCalls = [];
  let failNextResource = null;
  const resources = {
    failNextCall(resourceKey) {
      failNextResource = resourceKey;
    },
    async call(resourceKey, operation, payload) {
      resourceCalls.push({ resourceKey, operation, payload });
      if (failNextResource !== null && failNextResource === resourceKey) {
        failNextResource = null;
        throw new Error(`physical resource ${resourceKey}.${operation} timed out after dispatch (uncertain outcome)`);
      }
      if (resourceKey === 'ledger' && operation === 'reserve') {
        return { reserved: true, effectId: payload.effectId };
      }
      if (resourceKey === 'warehouse' && operation === 'reserveStock') {
        return { stockReserved: true, effectId: payload.effectId };
      }
      throw new Error(`host resource ${resourceKey}.${operation} are not provisioned`);
    },
    calls: () => resourceCalls.slice(),
    callCount: () => resourceCalls.length,
  };

  return {
    docs: new FileDocStore(dir),
    sha256,
    clock,
    resources,
  };
}
