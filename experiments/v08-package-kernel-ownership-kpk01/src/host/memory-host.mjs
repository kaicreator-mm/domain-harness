/**
 * Test Host — in-memory generic resource ports (experiment KPK-01)
 * =================================================================
 *
 * The Host supplies ONLY generic resources: a durable document store with
 * compare-and-swap writes (raw storage), a SHA-256 port, a clock and a
 * physical resource dispatcher with call accounting. It contains NO
 * workflow/admission/journal/effect-semantics knowledge and NO business
 * policy — falsifiers assert it can never fabricate a committed result.
 *
 * In-process ambient-JS boundary note (KPK-11): this is a test Host in the
 * same realm as the experiment; it demonstrates route/capability isolation
 * (no reachable commit path from the public surface), NOT a sandbox against
 * a same-realm arbitrary-code adversary.
 */

class HostStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HostStoreError';
    this.code = code;
  }
}

function deepCloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export class MemoryDocStore {
  #docs = new Map();
  #revisions = new Map();
  #fault = null;

  /**
   * Physical fault injection for tests: the put matching `keySubstring` on
   * its (skip+1)-th occurrence throws (simulates a Host storage crash at that
   * exact durable write; e.g. skip=1 faults the SECOND matching write).
   * This is a Host-environment fault, never kernel logic.
   */
  failNextPutMatching(keySubstring, { skip = 0 } = {}) {
    this.#fault = { keySubstring, remainingSkips: skip };
  }

  async get(key) {
    if (!this.#docs.has(key)) return null;
    return { value: deepCloneJson(this.#docs.get(key)), revision: this.#revisions.get(key) };
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
    const exists = this.#docs.has(key);
    if (conditions.mustBeAbsent === true && exists) {
      throw new HostStoreError('HOST_KEY_EXISTS', `host doc ${key} already exists`);
    }
    if (conditions.mustMatchRevision !== undefined) {
      if (!exists) {
        throw new HostStoreError('HOST_CAS_CONFLICT', `host doc ${key} does not exist; CAS expected revision ${conditions.mustMatchRevision}`);
      }
      if (this.#revisions.get(key) !== conditions.mustMatchRevision) {
        throw new HostStoreError('HOST_CAS_CONFLICT', `host doc ${key} revision is ${this.#revisions.get(key)}; CAS expected ${conditions.mustMatchRevision}`);
      }
    }
    const revision = exists ? this.#revisions.get(key) + 1 : 0;
    this.#docs.set(key, deepCloneJson(value));
    this.#revisions.set(key, revision);
    return { revision };
  }

  async list(prefix) {
    return [...this.#docs.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}

export function createMemoryHost({ now } = {}) {
  let digestOps = 0;
  const sha256 = {
    async digestUtf8(value) {
      digestOps += 1;
      const { createHash } = await import('node:crypto');
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
  const clock = now ?? (() => new Date().toISOString());

  const resourceCalls = [];
  let failNextResource = null;
  const resources = {
    /** Physical resource fault: the NEXT call to resourceKey performs its physical write and then times out. */
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
      throw new Error(`host resource ${resourceKey}.${operation} is not provisioned`);
    },
    calls: () => resourceCalls.slice(),
    callCount: () => resourceCalls.length,
  };

  return {
    docs: new MemoryDocStore(),
    sha256,
    clock,
    resources,
    digestOpCount: () => digestOps,
  };
}
