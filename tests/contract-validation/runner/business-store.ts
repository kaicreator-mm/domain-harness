/**
 * Simulated P4 (Business Authority Plane).
 *
 * Seeded from `business/<source>.json`; B1/B2 revision discipline:
 * value changed ⇔ revision changed; content-identical writes keep the
 * revision. Dirty tracking lets the runner emit matching
 * invalidateBusinessSnapshot signals (the P2 InvalidationSource duty).
 */
import { createHash } from 'node:crypto';

import type { JsonValue } from '../../../packages/domain-harness/src/contracts/json.js';
import type {
  BusinessSnapshot,
  BusinessSnapshotPort,
  BusinessSnapshotRequest,
} from '../../../packages/domain-harness/src/v2/contracts/projection.js';
import { canonicalString } from './host.js';

export interface BusinessSeedEntry {
  key: string;
  revision: string;
  value: JsonValue;
}

export interface BusinessInvalidationEntry {
  source: string;
  key: string;
}

export class SimBusinessStore {
  readonly #sources = new Map<string, Map<string, { revision: string; value: JsonValue }>>();
  readonly #dirty = new Map<string, BusinessInvalidationEntry>();

  seed(source: string, entries: readonly BusinessSeedEntry[]): void {
    const map = this.#sources.get(source) ?? new Map();
    for (const entry of entries) {
      map.set(entry.key, { revision: entry.revision, value: structuredClone(entry.value) });
    }
    this.#sources.set(source, map);
  }

  sources(): readonly string[] {
    return [...this.#sources.keys()].sort();
  }

  /** BusinessSnapshotPort.read — identity echoed exactly (projection-service checks it). */
  read(request: BusinessSnapshotRequest): BusinessSnapshot {
    const entry = this.#sources.get(request.source)?.get(request.key);
    if (entry === undefined) {
      throw new Error(
        'business_source_missing: ' + request.source + '/' + request.key +
        ' is not provided by the simulated P4',
      );
    }
    return {
      source: request.source,
      key: request.key,
      revision: entry.revision,
      value: structuredClone(entry.value),
    };
  }

  /** Handler-facing read; undefined when absent instead of throwing. */
  peek(source: string, key: string): { revision: string; value: JsonValue } | undefined {
    const entry = this.#sources.get(source)?.get(key);
    return entry === undefined ? undefined : { revision: entry.revision, value: structuredClone(entry.value) };
  }

  /** Handler-facing write with B1/B2 revision discipline + dirty tracking. */
  write(source: string, key: string, next: JsonValue): { revision: string; changed: boolean } {
    const map = this.#sources.get(source) ?? new Map();
    const previous = map.get(key);
    const canonical = canonicalString(next);
    if (previous !== undefined && canonicalString(previous.value) === canonical) {
      return { revision: previous.revision, changed: false };
    }
    const revision = 'rev-' + createHash('sha256').update(canonical).digest('hex').slice(0, 16);
    map.set(key, { revision, value: structuredClone(next) });
    this.#sources.set(source, map);
    this.#dirty.set(source + '::' + key, { source, key });
    return { revision, changed: true };
  }

  /** Runner-facing: take and clear pending invalidation signals. */
  drainDirty(): readonly BusinessInvalidationEntry[] {
    const entries = [...this.#dirty.values()];
    this.#dirty.clear();
    return entries;
  }

  asPort(): BusinessSnapshotPort {
    return {
      read: async (request: BusinessSnapshotRequest): Promise<BusinessSnapshot> => this.read(request),
    };
  }
}
