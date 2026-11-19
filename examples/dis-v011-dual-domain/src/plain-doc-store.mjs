/**
 * D3 (#1532) — in-process plain CAS document store (V10DocStore).
 *
 * Honestly an in-memory store, never claimed as physical-host evidence: the
 * physical two-process SQLite CAS proofs live in the runtime's own host
 * tests (`tests/hosts/node/` and the 0.1.0 runtime-consumer example). This
 * store implements exactly the caller-owned plain CAS contract the public
 * microkernel facade accepts: get / conditional put / conditional remove.
 */

const conflict = (message) => Object.assign(new Error(message), { code: 'HOST_CAS_CONFLICT' });

export class PlainDocStore {
  #documents = new Map();

  async get(key) {
    const doc = this.#documents.get(key);
    return doc === undefined ? null : { value: structuredClone(doc.value), revision: doc.revision };
  }

  async put(key, value, condition) {
    const existing = this.#documents.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) throw conflict(`CAS conflict on ${key}: document already exists`);
      this.#documents.set(key, { value: structuredClone(value), revision: 0 });
      return { revision: 0 };
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw conflict(`CAS conflict on ${key}: revision moved (expected ${condition.revision})`);
    }
    const revision = existing.revision + 1;
    this.#documents.set(key, { value: structuredClone(value), revision });
    return { revision };
  }

  async remove(key, condition) {
    const existing = this.#documents.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) throw conflict(`CAS conflict on ${key}: document exists; a create-conditioned remove refuses to delete it`);
      return;
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw conflict(`CAS conflict on ${key}: revision moved (expected ${condition.revision})`);
    }
    this.#documents.delete(key);
  }

  keys() {
    return [...this.#documents.keys()];
  }
}
