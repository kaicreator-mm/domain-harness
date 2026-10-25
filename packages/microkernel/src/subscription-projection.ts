/**
 * T06a — pure, unexported-by-package subscription projection. This helper is
 * source-draft only until T04/T06b integrate the governed subscriber facade.
 * It deliberately does not authorize selectors, invoke K, or deliver callbacks.
 */
export interface V10ProjectedTarget {
  readonly deployedAppId: string;
  readonly tenantId: string;
  readonly appId: string;
  readonly businessPackageId: string;
  readonly workflowId: string;
  readonly instanceKey: string;
}

export interface V10ProjectedSubscriptionEvent {
  readonly kind: string;
  readonly occurrenceId: string;
  readonly target: Readonly<V10ProjectedTarget>;
  readonly snapshot?: unknown;
}

export interface V10SnapshotProjectionEvidence {
  /** One snapshot candidate captured on the observation path, if available. */
  readonly candidate: unknown;
  /** A query result's outward "snapshot" value for exactly the same target. */
  readonly querySnapshot: unknown;
  /** Both revisions MUST come from the trusted same-revision query/observe seam. */
  readonly candidateRevision: number;
  readonly queryRevision: number;
}

export interface V10ProjectionInput {
  /** Raw K receipt, treated as untrusted data. Only two scalar fields are read. */
  readonly receipt: unknown;
  /** Already selected, per-target-authorized deployment tuple; not public input. */
  readonly target: unknown;
  /** Absent or unverifiable equality means event with NO snapshot field. */
  readonly snapshotEvidence?: V10SnapshotProjectionEvidence;
}

const TARGET_KEYS = Object.freeze([
  'deployedAppId', 'tenantId', 'appId', 'businessPackageId', 'workflowId', 'instanceKey',
] as const);

/** Reject accessors, prototype-bearing class instances and cycles: never run caller code. */
function safeDataRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!Object.hasOwn(descriptor, 'value')) return null;
  }
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return null;
  return value as Record<string, unknown>;
}

function dataField(value: unknown, key: string): unknown {
  const record = safeDataRecord(value);
  if (record === null) return undefined;
  const field = Object.getOwnPropertyDescriptor(record, key);
  return field !== undefined && Object.hasOwn(field, 'value') ? field.value : undefined;
}

function copyJsonData(value: unknown, stack: Set<object> = new Set()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('snapshot must be finite JSON data');
    return value;
  }
  if (typeof value !== 'object') throw new TypeError('snapshot must be JSON data');
  if (stack.has(value)) throw new TypeError('cyclic snapshot');
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      const array: unknown[] = [];
      for (let i = 0; i < value.length; i += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
          throw new TypeError('sparse/accessor snapshot array');
        }
        array.push(copyJsonData(descriptor.value, stack));
      }
      return Object.freeze(array);
    }
    const record = safeDataRecord(value);
    if (record === null) throw new TypeError('non-plain snapshot');
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      const field = Object.getOwnPropertyDescriptor(record, key);
      if (field === undefined || !Object.hasOwn(field, 'value')) throw new TypeError('snapshot accessor');
      Object.defineProperty(copy, key, {
        value: copyJsonData(field.value, stack),
        enumerable: true, configurable: false, writable: false,
      });
    }
    return Object.freeze(copy);
  } finally {
    stack.delete(value);
  }
}

function canonicalJson(value: unknown): string | null {
  try {
    const copied = copyJsonData(value);
    return JSON.stringify(copied) ?? null;
  } catch {
    return null;
  }
}

/** A snapshot is publishable ONLY with independent equal-revision query evidence. */
export function verifiedSameRevisionSnapshot(
  evidence: V10SnapshotProjectionEvidence | undefined,
): unknown {
  if (evidence === undefined) return undefined;
  if (!Number.isSafeInteger(evidence.candidateRevision) ||
      !Number.isSafeInteger(evidence.queryRevision) ||
      evidence.candidateRevision < 0 ||
      evidence.candidateRevision !== evidence.queryRevision) return undefined;
  const candidate = canonicalJson(evidence.candidate);
  const queried = canonicalJson(evidence.querySnapshot);
  if (candidate === null || queried === null || candidate !== queried) return undefined;
  try {
    return copyJsonData(evidence.querySnapshot);
  } catch {
    return undefined;
  }
}

/**
 * Project precisely {kind, occurrenceId, target, snapshot?}; no receipt metadata.
 * A null result means invalid raw receipt / trusted-target tuple; it is never
 * an authorization refusal oracle (T06b governs query/refusal parity).
 */
export function projectV10SubscriptionEvent(
  input: V10ProjectionInput,
): Readonly<V10ProjectedSubscriptionEvent> | null {
  try {
    const kind = dataField(input.receipt, 'status');
    const occurrenceId = dataField(dataField(input.receipt, 'occurrence'), 'messageId');
    if (typeof kind !== 'string' || kind.length === 0 ||
        typeof occurrenceId !== 'string' || occurrenceId.length === 0) return null;
    const targetRecord = safeDataRecord(input.target);
    if (targetRecord === null) return null;
    const target: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const key of TARGET_KEYS) {
      const value = dataField(targetRecord, key);
      if (typeof value !== 'string' || value.length === 0) return null;
      Object.defineProperty(target, key, { value, enumerable: true, writable: false, configurable: false });
    }
    const event: {
      kind: string;
      occurrenceId: string;
      target: Readonly<V10ProjectedTarget>;
      snapshot?: unknown;
    } = { kind, occurrenceId, target: Object.freeze(target) as unknown as V10ProjectedTarget };
    const snapshot = verifiedSameRevisionSnapshot(input.snapshotEvidence);
    if (snapshot !== undefined) event.snapshot = snapshot;
    return Object.freeze(event);
  } catch {
    // Observation is non-authoritative and never affects a K send/receipt.
    return null;
  }
}

/** Pure post-await re-check predicate; the real async pump belongs to T06b. */
export function mayDeliverV10Observation(state: {
  readonly active: boolean;
  readonly authorized: boolean;
  readonly revoked: boolean;
  readonly stopped: boolean;
  readonly terminal: boolean;
}): boolean {
  return state.active === true &&
    state.authorized === true &&
    state.revoked === false &&
    state.stopped === false &&
    state.terminal === false;
}
