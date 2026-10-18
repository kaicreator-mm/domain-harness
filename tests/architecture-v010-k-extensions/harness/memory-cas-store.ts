/**
 * #1150 research harness — deterministic true-CAS in-memory document store.
 *
 * The extension-seam hypothesis does not require SQLite or a provider; it
 * requires REAL conditional-write semantics on the Host document store the
 * selected K kernel consumes. This store implements the same
 * create-if-absent / compare-and-swap discipline as the v0.9 bridge test
 * world: every put carries an expectation, conflicts are typed, and values
 * are canonicalized through structuredClone so snapshots are byte-stable
 * evidence.
 */
import assert from 'node:assert/strict';

export type CasPutCondition = { readonly kind: 'create' } | { readonly kind: 'cas'; readonly revision: number };

export interface CasEnvelope {
  readonly value: unknown;
  readonly revision: number;
}

export class CasConflictError extends Error {
  readonly code = 'HOST_CAS_CONFLICT';
  constructor(key: string, detail: string) {
    super(`CAS conflict on ${key}: ${detail}`);
    this.name = 'CasConflictError';
  }
}

export class MemoryCasStore {
  readonly #docs = new Map<string, { value: unknown; revision: number }>();

  async get(key: string): Promise<CasEnvelope | null> {
    const doc = this.#docs.get(key);
    return doc === undefined ? null : { value: structuredClone(doc.value), revision: doc.revision };
  }

  async put(key: string, value: unknown, condition: CasPutCondition): Promise<{ revision: number }> {
    const existing = this.#docs.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) throw new CasConflictError(key, 'document already exists');
      this.#docs.set(key, { value: structuredClone(value), revision: 0 });
      return { revision: 0 };
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw new CasConflictError(key, `revision moved (expected ${condition.revision})`);
    }
    this.#docs.set(key, { value: structuredClone(value), revision: condition.revision + 1 });
    return { revision: condition.revision + 1 };
  }

  keys(): string[] {
    return [...this.#docs.keys()].sort();
  }

  async rawGet(key: string): Promise<CasEnvelope> {
    const doc = this.#docs.get(key);
    assert.ok(doc !== undefined, `rawGet: missing ${key}`);
    return { value: structuredClone(doc.value), revision: doc.revision };
  }

  /** Byte-stable whole-store snapshot for no-false-rollback assertions. */
  snapshot(): Record<string, { value: unknown; revision: number }> {
    const out: Record<string, { value: unknown; revision: number }> = {};
    for (const key of this.keys()) {
      const doc = this.#docs.get(key);
      assert.ok(doc !== undefined);
      out[key] = { value: structuredClone(doc.value), revision: doc.revision };
    }
    return out;
  }
}

/**
 * Store wrapper whose terminal effect-journal COMPLETION writes always fail
 * physically (same honest-UNKNOWN vector as the v0.9 bridge test): the K
 * kernel durably holds the 'started' effect record, its terminal journal
 * commit cannot land, and the turn surfaces the kernel's own
 * ADMISSION_EFFECT_AMBIGUOUS — the real outstanding-UNKNOWN state the
 * recovery-diagnostics hook projects.
 */
export class FailTerminalEffectCompletions {
  readonly #inner: MemoryCasStore;
  #armed = false;

  constructor(inner: MemoryCasStore) {
    this.#inner = inner;
  }

  arm(): void {
    this.#armed = true;
  }

  async get(key: string): Promise<CasEnvelope | null> {
    return this.#inner.get(key);
  }

  async put(key: string, value: unknown, condition: CasPutCondition): Promise<{ revision: number }> {
    if (
      this.#armed
      && key.includes('v08-kernel:effect-journal:')
      && typeof value === 'object' && value !== null
      && (value as { record?: { status?: unknown } }).record?.status === 'completed'
    ) {
      throw new Error(`physical durable-write failure: terminal completion of ${key}`);
    }
    return this.#inner.put(key, value, condition);
  }

  keys(): string[] {
    return this.#inner.keys();
  }

  async rawGet(key: string): Promise<CasEnvelope> {
    return this.#inner.rawGet(key);
  }

  snapshot(): Record<string, { value: unknown; revision: number }> {
    return this.#inner.snapshot();
  }
}

export type KDocumentStore = MemoryCasStore | FailTerminalEffectCompletions;
