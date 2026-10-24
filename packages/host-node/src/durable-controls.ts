/** v0.10.2 T03a — move-only Host-side durable work/child/poison coordinator. No Kernel submission: real Host bootstrap/recovery remains T03b. */
/**
 * #1062 HF18 — Host-side durable external-work coordinator (deadline +
 * callback correlation), adapted from the frozen v0.7 reference
 * `src/runtime/durable-control-coordinator.ts` (blob 8d341dca…) onto the
 * v0.8 true-CAS document store.
 * ===========================================================================
 *
 * Ownership split (frozen contract of #1062): the Kernel alone owns State,
 * Journal, Effect and turn identity; THIS coordinator owns only the
 * source-pinned CAS state machine that decides WHICH delivery may become a
 * Kernel turn. It owns no wall-clock scheduler and no process lifecycle —
 * the Host decides when to deliver/fire/recover (caller-driven recovery,
 * not a scheduler).
 *
 * State machine per external-work correlation (single document, single CAS
 * authority — no cross-document atomicity is claimed anywhere):
 *
 *   waiting ──CAS──► callback_received   (the winning callback delivery)
 *   waiting ──CAS──► timed_out           (the winning deadline fire)
 *
 * Only the CAS winner's turn source is handed to the Kernel submission
 * seam; duplicates/late/misbound deliveries are typed outcomes that never
 * reach the Kernel. A crash after settlement but before the Kernel turn
 * submission is healed by `recover*` returning the STORED terminal source
 * verbatim (stable turn identity ⇒ the Kernel turn disposition replays it
 * idempotently — zero doubled State/Effect).
 *
 * Record keys live in the Host namespace (never inside `v08-kernel:`):
 *   v8host:durable-control:ext:{appId}:{tenantId}:{instanceKey}:{externalCorrelationId}
 * Every key component is ':'-free by construction (appId at registerApp,
 * tenantId at credential shape check, instanceKey at requireInstanceKey,
 * correlation/timer ids validated HERE typed).
 */

import { canonicalJsonStringify } from '@kaicreator/domain-harness-contracts';
import type { CasDocumentStore } from './sqlite-cas.js';

export type DurableControlErrorCode =
  | 'DURABLE_CONTROL_INVALID'
  | 'DURABLE_CONTROL_UNAVAILABLE'
  | 'EXTERNAL_WORK_IDENTITY_CONFLICT'
  | 'UNKNOWN_EXTERNAL_CORRELATION'
  | 'DEADLINE_TIMER_MISMATCH'
  | 'DEADLINE_NOT_DUE'
  | 'CALLBACK_IDENTITY_CONFLICT'
  | 'CHILD_INVOCATION_UNKNOWN'
  | 'CHILD_INVOCATION_NOT_ACCEPTED'
  | 'CHILD_INVOCATION_ALREADY_TERMINAL'
  | 'CHILD_INVOCATION_SETTLED'
  | 'CHILD_INVOCATION_REJECTED'
  | 'CHILD_LINEAGE_REQUIRED'
  | 'CHILD_LINEAGE_FORGERY'
  | 'CHILD_DEPTH_EXCEEDED'
  | 'POISON_RECOVERY_INVALID'
  | 'POISON_RECOVERY_IDENTITY_CONFLICT'
  | 'POISON_RECOVERY_UNKNOWN'
  | 'DURABLE_CONTROL_CONTENTION';

export class DurableControlError extends Error {
  readonly code: DurableControlErrorCode;

  constructor(code: DurableControlErrorCode, message: string) {
    super(message);
    this.name = 'DurableControlError';
    this.code = code;
  }
}

const MAX_CAS_ATTEMPTS = 8;

export interface ExternalWorkTurnSource {
  readonly kind: 'callback' | 'timer';
  readonly externalCorrelationId: string;
  readonly callbackOrdinal?: number;
  readonly timerId?: string;
  readonly fireOrdinal?: number;
  /** Callback truth stored in the RECORD only — never part of the Kernel turnSource. */
  readonly payload?: unknown;
}

/**
 * Project a stored terminal source onto the EXACT Kernel turn-source shapes
 * (strictTurnSource refuses any extra field): timer ⇒ {kind, timerId,
 * fireOrdinal}, callback ⇒ {kind, externalCorrelationId, callbackOrdinal}.
 */
export function kernelTurnSourceOf(source: ExternalWorkTurnSource): Record<string, unknown> {
  if (source.kind === 'callback') {
    return { kind: 'callback', externalCorrelationId: source.externalCorrelationId, callbackOrdinal: source.callbackOrdinal ?? 1 };
  }
  return {
    kind: 'timer',
    ...(source.timerId === undefined ? {} : { timerId: source.timerId }),
    ...(source.fireOrdinal === undefined ? {} : { fireOrdinal: source.fireOrdinal }),
  };
}

/** The durable record stored at the correlation key (plain JSON). */
export interface ExternalWorkRecord {
  readonly pinVersion: 1;
  readonly kind: 'external-work';
  readonly appId: string;
  readonly tenantId: string;
  readonly instanceKey: string;
  readonly externalCorrelationId: string;
  readonly deadlineTimerId: string;
  readonly dueAt: string;
  /** Sealed Business intents the settled turn submits (bound at registration). */
  readonly callbackIntentType: string;
  readonly timeoutIntentType: string;
  readonly status: 'waiting' | 'callback_received' | 'timed_out';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminalSource?: ExternalWorkTurnSource;
  /** Set after the settled turn was successfully submitted (heal marker). */
  readonly submittedTurn?: { readonly messageId: string; readonly submittedAt: string };
}

export interface RegisterExternalWorkInput {
  readonly appId: string;
  readonly tenantId: string;
  readonly instanceKey: string;
  readonly externalCorrelationId: string;
  readonly deadlineTimerId: string;
  readonly dueAt: string;
  readonly callbackIntentType: string;
  readonly timeoutIntentType: string;
  readonly registeredAt: string;
}

export type SettleCallbackOutcome =
  | { readonly disposition: 'accepted'; readonly record: ExternalWorkRecord; readonly turnSource: ExternalWorkTurnSource; readonly messageId: string }
  | { readonly disposition: 'duplicate' | 'late_after_timeout' | 'ignored_after_completion'; readonly record: ExternalWorkRecord };

export type SettleDeadlineOutcome =
  | { readonly disposition: 'accepted'; readonly record: ExternalWorkRecord; readonly turnSource: ExternalWorkTurnSource; readonly messageId: string }
  | { readonly disposition: 'duplicate' | 'callback_already_completed'; readonly record: ExternalWorkRecord };

function invalid(message: string): never {
  throw new DurableControlError('DURABLE_CONTROL_INVALID', message);
}

function requireComponent(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes(':')) {
    invalid(`${name} must be a non-empty ':'-free string`);
  }
  return value;
}

/** Non-empty string without the ':'-free constraint (message ids carry the delimited correlation). */
function requireNonEmptyText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${name} must be a non-empty string`);
  }
  return value;
}

function requireInstant(value: unknown, name: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    invalid(`${name} must be a valid ISO timestamp`);
  }
  return value;
}

function instantMillis(value: string): number {
  return Date.parse(value);
}

function requirePositiveOrdinal(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    invalid(`${name} must be a positive safe integer`);
  }
  return value;
}

export function externalWorkDocKey(appId: string, tenantId: string, instanceKey: string, externalCorrelationId: string): string {
  return `v8host:durable-control:ext:${appId}:${tenantId}:${instanceKey}:${externalCorrelationId}`;
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', `${name} must be a JSON record`);
  }
  return value as Record<string, unknown>;
}

function decodeExternalWork(envelope: unknown, key: string): ExternalWorkRecord {
  const raw = asRecord(envelope, `external-work record ${key}`);
  if (raw.pinVersion !== 1 || raw.kind !== 'external-work') {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} is not an external-work record`);
  }
  const record = raw as unknown as ExternalWorkRecord;
  requireComponent(record.appId, 'appId');
  requireComponent(record.tenantId, 'tenantId');
  requireComponent(record.instanceKey, 'instanceKey');
  requireComponent(record.externalCorrelationId, 'externalCorrelationId');
  requireComponent(record.deadlineTimerId, 'deadlineTimerId');
  requireInstant(record.dueAt, 'dueAt');
  requireComponent(record.callbackIntentType, 'callbackIntentType');
  requireComponent(record.timeoutIntentType, 'timeoutIntentType');
  if (record.status !== 'waiting' && record.status !== 'callback_received' && record.status !== 'timed_out') {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} carries an unknown status`);
  }
  requireInstant(record.createdAt, 'createdAt');
  requireInstant(record.updatedAt, 'updatedAt');
  if (record.status === 'waiting' && record.terminalSource !== undefined) {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', `waiting record ${key} must not carry a terminalSource`);
  }
  return record;
}

function callbackTurnMessageId(record: ExternalWorkRecord, callbackOrdinal: number): string {
  return `ctrl:callback:${record.externalCorrelationId}:${String(callbackOrdinal)}`;
}

function timerTurnMessageId(record: ExternalWorkRecord): string {
  return `ctrl:timer:${record.deadlineTimerId}:1`;
}

/**
 * The Host-side coordinator over the probed physical CAS store. One
 * instance per host; all verbs are invoked behind gateway authentication.
 */
export class ExternalWorkCoordinator {
  constructor(private readonly docs: CasDocumentStore) {}

  private async load(key: string): Promise<{ record: ExternalWorkRecord; revision: number }> {
    const envelope = await this.docs.get(key);
    if (envelope === null) {
      throw new DurableControlError(
        'UNKNOWN_EXTERNAL_CORRELATION',
        `external correlation ${key} is not durably registered on this host`,
      );
    }
    return { record: decodeExternalWork(envelope.value, key), revision: envelope.revision };
  }

  async register(input: RegisterExternalWorkInput): Promise<{ record: ExternalWorkRecord; disposition: 'created' | 'existing' }> {
    requireComponent(input.externalCorrelationId, 'externalCorrelationId');
    requireComponent(input.deadlineTimerId, 'deadlineTimerId');
    requireInstant(input.dueAt, 'dueAt');
    requireInstant(input.registeredAt, 'registeredAt');
    requireComponent(input.callbackIntentType, 'callbackIntentType');
    requireComponent(input.timeoutIntentType, 'timeoutIntentType');
    const key = externalWorkDocKey(input.appId, input.tenantId, input.instanceKey, input.externalCorrelationId);
    const record: ExternalWorkRecord = {
      pinVersion: 1,
      kind: 'external-work',
      appId: input.appId,
      tenantId: input.tenantId,
      instanceKey: input.instanceKey,
      externalCorrelationId: input.externalCorrelationId,
      deadlineTimerId: input.deadlineTimerId,
      dueAt: input.dueAt,
      callbackIntentType: input.callbackIntentType,
      timeoutIntentType: input.timeoutIntentType,
      status: 'waiting',
      createdAt: input.registeredAt,
      updatedAt: input.registeredAt,
    };
    try {
      await this.docs.put(key, record, { mustBeAbsent: true });
      return { record, disposition: 'created' };
    } catch {
      const existing = await this.load(key);
      const current = existing.record;
      const exact = current.deadlineTimerId === record.deadlineTimerId
        && current.dueAt === record.dueAt
        && current.callbackIntentType === record.callbackIntentType
        && current.timeoutIntentType === record.timeoutIntentType;
      if (!exact) {
        throw new DurableControlError(
          'EXTERNAL_WORK_IDENTITY_CONFLICT',
          `external correlation ${input.externalCorrelationId} is already bound to different logical material`,
        );
      }
      return { record: current, disposition: 'existing' };
    }
  }

  async read(appId: string, tenantId: string, instanceKey: string, externalCorrelationId: string): Promise<ExternalWorkRecord> {
    requireComponent(externalCorrelationId, 'externalCorrelationId');
    const { record } = await this.load(externalWorkDocKey(appId, tenantId, instanceKey, externalCorrelationId));
    return record;
  }

  /**
   * Settle ONE incoming callback against the durable state machine. The
   * CAS winner receives the deterministic callback turn source; everyone
   * else gets a typed duplicate/late/ignored outcome with ZERO Kernel
   * activity.
   */
  async settleCallback(input: {
    readonly appId: string;
    readonly tenantId: string;
    readonly instanceKey: string;
    readonly externalCorrelationId: string;
    readonly callbackOrdinal: number;
    readonly payload: unknown;
    readonly receivedAt: string;
  }): Promise<SettleCallbackOutcome> {
    requirePositiveOrdinal(input.callbackOrdinal, 'callbackOrdinal');
    requireInstant(input.receivedAt, 'receivedAt');
    const key = externalWorkDocKey(input.appId, input.tenantId, input.instanceKey, input.externalCorrelationId);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const { record: current, revision } = await this.load(key);
      if (current.status === 'timed_out') {
        return { disposition: 'late_after_timeout', record: current };
      }
      if (current.status === 'callback_received') {
        const source = current.terminalSource;
        if (source?.kind === 'callback' && source.callbackOrdinal === input.callbackOrdinal) {
          if (canonicalJsonStringify(source.payload ?? null) === canonicalJsonStringify(input.payload)) {
            return { disposition: 'duplicate', record: current };
          }
          throw new DurableControlError(
            'CALLBACK_IDENTITY_CONFLICT',
            `callback ordinal ${String(input.callbackOrdinal)} for ${input.externalCorrelationId} changed payload`,
          );
        }
        return { disposition: 'ignored_after_completion', record: current };
      }
      const source: ExternalWorkTurnSource = instantMillis(input.receivedAt) >= instantMillis(current.dueAt)
        ? { kind: 'timer', externalCorrelationId: current.externalCorrelationId, timerId: current.deadlineTimerId, fireOrdinal: 1 }
        : { kind: 'callback', externalCorrelationId: current.externalCorrelationId, callbackOrdinal: input.callbackOrdinal, payload: input.payload };
      const next: ExternalWorkRecord = {
        ...current,
        status: source.kind === 'timer' ? 'timed_out' : 'callback_received',
        updatedAt: input.receivedAt,
        terminalSource: source,
      };
      const changed = await this.cas(key, next, revision);
      if (changed) {
        return {
          disposition: 'accepted',
          record: next,
          turnSource: source,
          messageId: source.kind === 'callback'
            ? callbackTurnMessageId(current, input.callbackOrdinal)
            : timerTurnMessageId(current),
        };
      }
    }
    throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not settle callback ${input.externalCorrelationId} after bounded retries`);
  }

  /**
   * Settle ONE deadline fire. Early fires and foreign timers refuse typed
   * before any mutation; the CAS winner receives the one-shot timer turn
   * source (fireOrdinal is pinned to 1, the v0.7 T-010 one-shot contract).
   */
  async settleDeadline(input: {
    readonly appId: string;
    readonly tenantId: string;
    readonly instanceKey: string;
    readonly externalCorrelationId: string;
    readonly timerId: string;
    readonly fireOrdinal: number;
    readonly firedAt: string;
  }): Promise<SettleDeadlineOutcome> {
    requireComponent(input.timerId, 'timerId');
    requirePositiveOrdinal(input.fireOrdinal, 'fireOrdinal');
    requireInstant(input.firedAt, 'firedAt');
    if (input.fireOrdinal !== 1) {
      invalid('external-work deadlines are one-shot and require fireOrdinal=1');
    }
    const key = externalWorkDocKey(input.appId, input.tenantId, input.instanceKey, input.externalCorrelationId);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const { record: current, revision } = await this.load(key);
      if (current.deadlineTimerId !== input.timerId) {
        throw new DurableControlError(
          'DEADLINE_TIMER_MISMATCH',
          `timer ${input.timerId} does not own external correlation ${input.externalCorrelationId}`,
        );
      }
      if (current.status === 'timed_out') {
        return { disposition: 'duplicate', record: current };
      }
      if (current.status === 'callback_received') {
        return { disposition: 'callback_already_completed', record: current };
      }
      if (instantMillis(input.firedAt) < instantMillis(current.dueAt)) {
        throw new DurableControlError(
          'DEADLINE_NOT_DUE',
          `timer ${input.timerId} fired before its durable dueAt ${current.dueAt}`,
        );
      }
      const source: ExternalWorkTurnSource = { kind: 'timer', externalCorrelationId: current.externalCorrelationId, timerId: current.deadlineTimerId, fireOrdinal: 1 };
      const next: ExternalWorkRecord = {
        ...current,
        status: 'timed_out',
        updatedAt: input.firedAt,
        terminalSource: source,
      };
      const changed = await this.cas(key, next, revision);
      if (changed) {
        return { disposition: 'accepted', record: next, turnSource: source, messageId: timerTurnMessageId(current) };
      }
    }
    throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not settle deadline ${input.externalCorrelationId} after bounded retries`);
  }

  /**
   * Mark the settled turn as submitted (the heal marker written AFTER a
   * successful Kernel submission). A crash between settlement and this
   * marker is the honest UNKNOWN window healed by `recoverExternalWork`.
   */
  async markSubmitted(
    appId: string,
    tenantId: string,
    instanceKey: string,
    externalCorrelationId: string,
    messageId: string,
    submittedAt: string,
  ): Promise<void> {
    const key = externalWorkDocKey(appId, tenantId, instanceKey, externalCorrelationId);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const { record: current, revision } = await this.load(key);
      if (current.submittedTurn !== undefined && current.submittedTurn.messageId === messageId) return;
      const next: ExternalWorkRecord = {
        ...current,
        submittedTurn: { messageId, submittedAt },
        updatedAt: submittedAt,
      };
      if (await this.cas(key, next, revision)) return;
    }
    // The marker is a heal optimization, never an authority — losing the
    // bounded race only means a later recovery re-reads the settled record
    // and replays the SAME turn id idempotently at the Kernel.
  }

  /**
   * Caller-driven recovery (NOT a scheduler): list every correlation of
   * the tenant/app, fire the due waiting ones, and re-submit every settled
   * record whose turn submission may have been lost (no submittedTurn
   * marker). The stable turn identity makes every re-submission an
   * idempotent Kernel replay — the v0.7 heal contract verbatim.
   */
  async recoverDueAndSettled(input: {
    readonly appId: string;
    readonly tenantId: string;
    readonly now: string;
    readonly fireDue: (correlation: {
      readonly record: ExternalWorkRecord;
      readonly turnSource: ExternalWorkTurnSource;
      readonly messageId: string;
    }) => Promise<void>;
  }): Promise<{ readonly fired: number; readonly healed: number }> {
    requireInstant(input.now, 'now');
    const prefix = `v8host:durable-control:ext:${input.appId}:${input.tenantId}:`;
    const keys = [...await this.docs.list(prefix)].sort();
    let fired = 0;
    let healed = 0;
    for (const key of keys) {
      const { record } = await this.load(key);
      if (record.status === 'waiting') {
        if (instantMillis(input.now) < instantMillis(record.dueAt)) continue;
        const settle = await this.settleDeadline({
          appId: input.appId,
          tenantId: input.tenantId,
          instanceKey: record.instanceKey,
          externalCorrelationId: record.externalCorrelationId,
          timerId: record.deadlineTimerId,
          fireOrdinal: 1,
          firedAt: input.now,
        });
        if (settle.disposition === 'accepted') {
          fired += 1;
          await input.fireDue({ record: settle.record, turnSource: settle.turnSource, messageId: settle.messageId });
          await this.markSubmitted(input.appId, input.tenantId, record.instanceKey, record.externalCorrelationId, settle.messageId, input.now);
        }
        continue;
      }
      if (record.submittedTurn === undefined && record.terminalSource !== undefined) {
        const source = record.terminalSource;
        healed += 1;
        await input.fireDue({
          record,
          turnSource: source,
          messageId: source.kind === 'callback'
            ? callbackTurnMessageId(record, source.callbackOrdinal ?? 1)
            : timerTurnMessageId(record),
        });
        await this.markSubmitted(input.appId, input.tenantId, record.instanceKey, record.externalCorrelationId, source.kind === 'callback'
          ? callbackTurnMessageId(record, source.callbackOrdinal ?? 1)
          : timerTurnMessageId(record), input.now);
      }
    }
    return { fired, healed };
  }

  private async cas(key: string, next: ExternalWorkRecord, expectedRevision: number): Promise<boolean> {
    try {
      await this.docs.put(key, next, { mustMatchRevision: expectedRevision });
      return true;
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'HOST_CAS_CONFLICT') {
        return false; // lost the race: re-read and retry inside the bounded loop
      }
      throw error;
    }
  }
}

// ===========================================================================
// [#1062 HF32] Host-side durable child-invocation coordination, adapted
// from the frozen v0.7 reference `src/runtime/
// compiled-workflow-message-effects-v3.ts` (blob 36ab0b7a…) all-or-durable-
// rejection semantics: a PERMANENT rejection is durably committed BEFORE
// any route selection (rejected_routed), and a settled invocation is never
// silently retried — the v0.8 route selection is the authenticated caller
// acting on the returned truth.
//
// State machine per child invocation (single document, single CAS
// authority — no cross-document atomicity claimed):
//
//   pending ──CAS──► accepted ──CAS──► done | error   (the child-terminal
//                    │                              routing settles once)
//                    └──CAS──► rejected             (permanent; never
//                                                   transient, never retried)
//
// The CHILD message turn rides the SAME non-message seam (a callback
// turnSource bound to the invocation correlation, callbackOrdinal 1), so
// an UNKNOWN-window retry of a pending invocation replays idempotently at
// the Kernel turn disposition. The correlated child terminal routes to its
// parent exactly once through the child-terminal turnSource.
//
// [#1080 FR01] Every invocation record stamps its durable LINEAGE DEPTH
// (a lineage root's edge = 1); a new edge's depth is derived from the
// parent's own incoming records — durable truth, never caller arithmetic —
// and the declared provenance pointer is cross-checked against it. Beyond
// the frozen maximum the send refuses typed BEFORE allocation (see
// MAX_CHILD_LINEAGE_DEPTH below).
//
// Record keys (Host namespace):
//   v8host:durable-control:child:{appId}:{tenantId}:{parentInstanceKey}:
//   {childInstanceKey}:{invocationOrdinal}
// ===========================================================================

// [#1080 FR01] Selected Host-declared bound on durable child-invocation
// lineage depth. Identity provenance: the smallest EXISTING frozen
// child-depth limit — DEFAULT_MAX_CHILD_WORKFLOW_DEPTH = 32
// (src/runner/run-coordinator.ts, "Internal v0.1 defensive bound", pinned
// by tests/child-workflow.test.ts) — reused by value, not a newly invented
// scheduler constant. Edge depths 1..32 are the admitted range (a lineage
// root's first edge is depth 1); depth 33 (max+1) refuses typed.
const MAX_CHILD_LINEAGE_DEPTH = 32;

export interface ChildInvocationRecord {
  readonly pinVersion: 1;
  readonly kind: 'child-invocation';
  readonly appId: string;
  readonly tenantId: string;
  readonly parentInstanceKey: string;
  readonly childInstanceKey: string;
  readonly invocationOrdinal: number;
  /** [#1080 FR01] Durable lineage depth of THIS edge (a lineage root's edge = 1). */
  readonly lineageDepth: number;
  readonly childIntentType: string;
  readonly doneIntentType: string;
  readonly errorIntentType: string;
  readonly status: 'pending' | 'accepted' | 'rejected' | 'done' | 'error';
  readonly childTurnMessageId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rejection?: { readonly code: string; readonly message?: string };
  readonly terminal?: { readonly terminalKind: 'done' | 'error'; readonly input?: unknown; readonly settledAt: string };
  readonly submittedTurn?: { readonly messageId: string; readonly submittedAt: string };
}

export interface ChildInvocationTurnPlan {
  readonly record: ChildInvocationRecord;
  readonly childTurnSource: Record<string, unknown>;
  readonly childTurnMessageId: string;
  readonly parentTurnSource: { kind: 'child-terminal'; parentActorId: string; childActorId: string; invocationOrdinal: number; terminalKind: 'done' | 'error' };
  readonly parentTurnMessageId: string;
}

export function childInvocationDocKey(appId: string, tenantId: string, parentInstanceKey: string, childInstanceKey: string, invocationOrdinal: number): string {
  return `v8host:durable-control:child:${appId}:${tenantId}:${parentInstanceKey}:${childInstanceKey}:${String(invocationOrdinal)}`;
}

export function childInvocationCorrelationId(parentInstanceKey: string, childInstanceKey: string, invocationOrdinal: number): string {
  return `child:${parentInstanceKey}:${childInstanceKey}:${String(invocationOrdinal)}`;
}

function decodeChildInvocation(envelope: unknown, key: string): ChildInvocationRecord {
  const raw = asRecord(envelope, `child-invocation record ${key}`);
  if (raw.pinVersion !== 1 || raw.kind !== 'child-invocation') {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} is not a child-invocation record`);
  }
  const record = raw as unknown as ChildInvocationRecord;
  requireComponent(record.appId, 'appId');
  requireComponent(record.tenantId, 'tenantId');
  requireComponent(record.parentInstanceKey, 'parentInstanceKey');
  requireComponent(record.childInstanceKey, 'childInstanceKey');
  requirePositiveOrdinal(record.invocationOrdinal, 'invocationOrdinal');
  // [#1080 FR01] Fail closed on a tampered record: creation refuses any
  // depth beyond the accepted maximum, so a stored overflowed or missing
  // depth is corruption, never accepted truth.
  if (requirePositiveOrdinal(record.lineageDepth, 'lineageDepth') > MAX_CHILD_LINEAGE_DEPTH) {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} carries a lineage depth beyond the accepted maximum (${String(MAX_CHILD_LINEAGE_DEPTH)})`);
  }
  requireComponent(record.childIntentType, 'childIntentType');
  requireComponent(record.doneIntentType, 'doneIntentType');
  requireComponent(record.errorIntentType, 'errorIntentType');
  if (!['pending', 'accepted', 'rejected', 'done', 'error'].includes(record.status)) {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} carries an unknown status`);
  }
  requireNonEmptyText(record.childTurnMessageId, 'childTurnMessageId');
  requireInstant(record.createdAt, 'createdAt');
  requireInstant(record.updatedAt, 'updatedAt');
  if (record.status === 'pending' && (record.rejection !== undefined || record.terminal !== undefined)) {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', `pending record ${key} must not carry a rejection or terminal`);
  }
  return record;
}

function rejectedRefusal(ordinal: number, record: ChildInvocationRecord): never {
  throw new DurableControlError(
    'CHILD_INVOCATION_REJECTED',
    `child invocation ${String(ordinal)} was PERMANENTLY rejected (${record.rejection?.code ?? 'unknown'}); a rejected invocation is never retried`,
  );
}

export class ChildInvocationCoordinator {
  constructor(private readonly docs: CasDocumentStore) {}

  private async load(key: string): Promise<{ record: ChildInvocationRecord; revision: number }> {
    const envelope = await this.docs.get(key);
    if (envelope === null) {
      throw new DurableControlError('CHILD_INVOCATION_UNKNOWN', `child invocation ${key} is not durably registered on this host`);
    }
    return { record: decodeChildInvocation(envelope.value, key), revision: envelope.revision };
  }

  async peek(appId: string, tenantId: string, parentInstanceKey: string, childInstanceKey: string, invocationOrdinal: number): Promise<ChildInvocationRecord | null> {
    const key = childInvocationDocKey(appId, tenantId, parentInstanceKey, childInstanceKey, invocationOrdinal);
    const envelope = await this.docs.get(key);
    if (envelope === null) return null;
    return decodeChildInvocation(envelope.value, key);
  }

  /**
   * Allocate (or re-address) ONE invocation record. Without an explicit
   * ordinal the next free ordinal of the (parent, child) pair is claimed
   * under create-if-absent CAS; an explicit ordinal re-addresses a known
   * invocation (bounded UNKNOWN-window retry while pending, typed refusal
   * once settled — a rejected invocation is NEVER retried).
   */
  async open(input: {
    readonly appId: string;
    readonly tenantId: string;
    readonly parentInstanceKey: string;
    readonly childInstanceKey: string;
    readonly invocationOrdinal?: number;
    readonly lineageDepth: number;
    readonly childIntentType: string;
    readonly doneIntentType: string;
    readonly errorIntentType: string;
    readonly openedAt: string;
  }): Promise<{ record: ChildInvocationRecord; disposition: 'created' | 'pending-retry' }> {
    requireComponent(input.parentInstanceKey, 'parentInstanceKey');
    requireComponent(input.childInstanceKey, 'childInstanceKey');
    // [#1080 FR01] The stamped depth is re-validated here (defense in
    // depth): the gateway derives it through deriveLineageDepth, and a
    // depth beyond the accepted maximum never reaches a durable record.
    if (requirePositiveOrdinal(input.lineageDepth, 'lineageDepth') > MAX_CHILD_LINEAGE_DEPTH) {
      throw new DurableControlError('DURABLE_CONTROL_INVALID', `lineage depth ${String(input.lineageDepth)} exceeds the accepted maximum (${String(MAX_CHILD_LINEAGE_DEPTH)})`);
    }
    requireComponent(input.childIntentType, 'childIntentType');
    requireComponent(input.doneIntentType, 'doneIntentType');
    requireComponent(input.errorIntentType, 'errorIntentType');
    requireInstant(input.openedAt, 'openedAt');
    if (input.invocationOrdinal !== undefined) {
      requirePositiveOrdinal(input.invocationOrdinal, 'invocationOrdinal');
      const current = await this.peek(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, input.invocationOrdinal);
      if (current !== null) return this.adjudicateExisting(current);
    } else {
      const prefix = `v8host:durable-control:child:${input.appId}:${input.tenantId}:${input.parentInstanceKey}:${input.childInstanceKey}:`;
      const existing = await this.docs.list(prefix);
      let ordinal = existing.length + 1;
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
        const record = this.pendingRecord(input, ordinal);
        try {
          await this.docs.put(childInvocationDocKey(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, ordinal), record, { mustBeAbsent: true });
          return { record, disposition: 'created' };
        } catch (error) {
          if ((error as { code?: string })?.code !== 'HOST_KEY_EXISTS') throw error;
          ordinal += 1;
        }
      }
      throw new DurableControlError('DURABLE_CONTROL_CONTENTION', 'could not allocate a child invocation ordinal after bounded retries');
    }
    // Explicit ordinal, record absent: create it at exactly that ordinal.
    const record = this.pendingRecord(input, input.invocationOrdinal);
    try {
      await this.docs.put(childInvocationDocKey(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, input.invocationOrdinal), record, { mustBeAbsent: true });
      return { record, disposition: 'created' };
    } catch {
      const current = await this.peek(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, input.invocationOrdinal);
      if (current === null) throw new DurableControlError('CHILD_INVOCATION_UNKNOWN', 'child invocation disappeared while being addressed');
      return this.adjudicateExisting(current);
    }
  }

  /**
   * [#1080 FR01] Derive the lineage depth a NEW outgoing edge of
   * `parentInstanceKey` would carry — from DURABLE truth only (the
   * parent's own incoming invocation records), never caller arithmetic —
   * and fail-closed adjudicate the caller's declared provenance pointer
   * against that truth BEFORE any durable allocation:
   *
   *   missing    a non-root parent (it HAS incoming invocation records)
   *              declares no provenance — a deep parent cannot root-claim
   *   forged     a declared pointer that resolves to no incoming record of
   *              THIS parent (tampered ordinal / foreign pair), or a root
   *              parent declaring provenance it cannot have
   *   overflowed  the derived edge depth would exceed the frozen maximum
   *
   * Every edge of a deep tree is itself a durable record allocated through
   * this seam, so the incoming-record scan captures the WHOLE lineage —
   * the bound cannot be bypassed by re-addressing or cross-pair sends.
   */
  async deriveLineageDepth(input: {
    readonly appId: string;
    readonly tenantId: string;
    readonly parentInstanceKey: string;
    readonly declared?: { readonly viaParentInstanceKey: string; readonly invocationOrdinal: number };
  }): Promise<number> {
    requireComponent(input.parentInstanceKey, 'parentInstanceKey');
    if (input.declared !== undefined) {
      requireComponent(input.declared.viaParentInstanceKey, 'viaParentInstanceKey');
      requirePositiveOrdinal(input.declared.invocationOrdinal, 'invocationOrdinal');
    }
    const prefix = `v8host:durable-control:child:${input.appId}:${input.tenantId}:`;
    let parentDepth = 0;
    for (const key of await this.docs.list(prefix)) {
      const parts = key.split(':');
      // v8host:durable-control:child:{appId}:{tenantId}:{parent}:{child}:{ordinal}
      if (parts.length !== 8 || parts[6] !== input.parentInstanceKey) continue;
      const incoming = await this.load(key);
      if (incoming.record.lineageDepth > parentDepth) parentDepth = incoming.record.lineageDepth;
    }
    if (parentDepth === 0) {
      if (input.declared !== undefined) {
        throw new DurableControlError(
          'CHILD_LINEAGE_FORGERY',
          `instance ${input.parentInstanceKey} has no durable incoming child invocation; the declared lineage provenance is forged`,
        );
      }
    } else if (input.declared === undefined) {
      throw new DurableControlError(
        'CHILD_LINEAGE_REQUIRED',
        `instance ${input.parentInstanceKey} is a durable child (incoming lineage depth ${String(parentDepth)}); a deeper send must declare its provenance invocation`,
      );
    } else {
      const resolves = await this.peek(
        input.appId, input.tenantId, input.declared.viaParentInstanceKey, input.parentInstanceKey, input.declared.invocationOrdinal,
      );
      if (resolves === null) {
        throw new DurableControlError(
          'CHILD_LINEAGE_FORGERY',
          `declared lineage provenance (via ${input.declared.viaParentInstanceKey}, ordinal ${String(input.declared.invocationOrdinal)}) is not a durable incoming invocation of ${input.parentInstanceKey} (tampered or foreign)`,
        );
      }
    }
    const edgeDepth = parentDepth + 1;
    if (edgeDepth > MAX_CHILD_LINEAGE_DEPTH) {
      throw new DurableControlError(
        'CHILD_DEPTH_EXCEEDED',
        `child lineage depth ${String(edgeDepth)} would exceed the accepted maximum ${String(MAX_CHILD_LINEAGE_DEPTH)}; the send is refused before any durable allocation`,
      );
    }
    return edgeDepth;
  }

  private adjudicateExisting(current: ChildInvocationRecord): { record: ChildInvocationRecord; disposition: 'created' | 'pending-retry' } {
    if (current.status === 'rejected') rejectedRefusal(current.invocationOrdinal, current);
    if (current.status !== 'pending') {
      throw new DurableControlError(
        'CHILD_INVOCATION_SETTLED',
        `child invocation ${String(current.invocationOrdinal)} is already settled (${current.status}); a settled invocation is never re-sent`,
      );
    }
    return { record: current, disposition: 'pending-retry' };
  }

  private pendingRecord(input: { appId: string; tenantId: string; parentInstanceKey: string; childInstanceKey: string; lineageDepth: number; childIntentType: string; doneIntentType: string; errorIntentType: string; openedAt: string }, ordinal: number): ChildInvocationRecord {
    const correlationId = childInvocationCorrelationId(input.parentInstanceKey, input.childInstanceKey, ordinal);
    return {
      pinVersion: 1,
      kind: 'child-invocation',
      appId: input.appId,
      tenantId: input.tenantId,
      parentInstanceKey: input.parentInstanceKey,
      childInstanceKey: input.childInstanceKey,
      invocationOrdinal: ordinal,
      lineageDepth: input.lineageDepth,
      childIntentType: input.childIntentType,
      doneIntentType: input.doneIntentType,
      errorIntentType: input.errorIntentType,
      status: 'pending',
      childTurnMessageId: `child-msg:${correlationId}`,
      createdAt: input.openedAt,
      updatedAt: input.openedAt,
    };
  }

  /**
   * Settle the child-send outcome: `accepted` (the child message turn was
   * admitted) or `rejected` (a PERMANENT typed refusal, durably committed
   * BEFORE any route selection — the caller routes on the returned truth).
   */
  async settleSend(input: {
    readonly appId: string;
    readonly tenantId: string;
    readonly record: ChildInvocationRecord;
    readonly outcome: 'accepted' | 'rejected';
    readonly rejection?: { readonly code: string; readonly message?: string };
    readonly settledAt: string;
  }): Promise<ChildInvocationRecord> {
    requireInstant(input.settledAt, 'settledAt');
    const key = childInvocationDocKey(input.appId, input.tenantId, input.record.parentInstanceKey, input.record.childInstanceKey, input.record.invocationOrdinal);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const { record: current, revision } = await this.load(key);
      if (current.status !== 'pending') {
        if (current.status === input.outcome) return current; // idempotent same-outcome replay
        throw new DurableControlError('CHILD_INVOCATION_SETTLED', `child invocation ${String(current.invocationOrdinal)} is already settled (${current.status})`);
      }
      const next: ChildInvocationRecord = {
        ...current,
        status: input.outcome,
        ...(input.outcome === 'rejected' && input.rejection !== undefined ? { rejection: input.rejection } : {}),
        updatedAt: input.settledAt,
      };
      try {
        await this.docs.put(key, next, { mustMatchRevision: revision });
        return next;
      } catch (error) {
        if ((error as { code?: string })?.code !== 'HOST_CAS_CONFLICT') throw error;
      }
    }
    throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not settle child invocation ${key} after bounded retries`);
  }

  /**
   * Settle ONE correlated child terminal (done | error). Exactly ONE CAS
   * winner receives the deterministic parent child-terminal turn source;
   * duplicates and terminals on non-accepted invocations refuse typed with
   * ZERO Kernel activity.
   */
  async settleTerminal(input: {
    readonly appId: string;
    readonly tenantId: string;
    readonly parentInstanceKey: string;
    readonly childInstanceKey: string;
    readonly invocationOrdinal: number;
    readonly terminalKind: 'done' | 'error';
    readonly terminalInput?: unknown;
    readonly settledAt: string;
  }): Promise<{ disposition: 'accepted'; plan: ChildInvocationTurnPlan; record: ChildInvocationRecord } | { disposition: 'already-terminal'; record: ChildInvocationRecord }> {
    if (input.terminalKind !== 'done' && input.terminalKind !== 'error') {
      invalid('terminalKind must be done or error');
    }
    requireInstant(input.settledAt, 'settledAt');
    const key = childInvocationDocKey(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, input.invocationOrdinal);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const { record: current, revision } = await this.load(key);
      if (current.status === 'done' || current.status === 'error') {
        return { disposition: 'already-terminal', record: current };
      }
      if (current.status !== 'accepted') {
        throw new DurableControlError(
          'CHILD_INVOCATION_NOT_ACCEPTED',
          `child invocation ${String(current.invocationOrdinal)} is ${current.status}; only an accepted child invocation may receive a terminal`,
        );
      }
      const terminal = { terminalKind: input.terminalKind, ...(input.terminalInput === undefined ? {} : { input: input.terminalInput }), settledAt: input.settledAt };
      const next: ChildInvocationRecord = {
        ...current,
        status: input.terminalKind,
        terminal,
        updatedAt: input.settledAt,
      };
      try {
        await this.docs.put(key, next, { mustMatchRevision: revision });
      } catch (error) {
        if ((error as { code?: string })?.code !== 'HOST_CAS_CONFLICT') throw error;
        continue;
      }
      const correlationId = childInvocationCorrelationId(current.parentInstanceKey, current.childInstanceKey, current.invocationOrdinal);
      return {
        disposition: 'accepted',
        record: next,
        plan: {
          record: next,
          childTurnSource: { kind: 'callback', externalCorrelationId: correlationId, callbackOrdinal: 1 },
          childTurnMessageId: current.childTurnMessageId,
          parentTurnSource: {
            kind: 'child-terminal',
            parentActorId: current.parentInstanceKey,
            childActorId: current.childInstanceKey,
            invocationOrdinal: current.invocationOrdinal,
            terminalKind: input.terminalKind,
          },
          parentTurnMessageId: `ctrl:child-terminal:${correlationId}:${input.terminalKind}`,
        },
      };
    }
    throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not settle child invocation ${key} after bounded retries`);
  }

  /** The heal marker (see ExternalWorkCoordinator.markSubmitted). */
  async markSubmitted(record: ChildInvocationRecord, messageId: string, submittedAt: string): Promise<void> {
    const key = childInvocationDocKey(record.appId, record.tenantId, record.parentInstanceKey, record.childInstanceKey, record.invocationOrdinal);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const { record: current, revision } = await this.load(key);
      if (current.submittedTurn !== undefined && current.submittedTurn.messageId === messageId) return;
      const next: ChildInvocationRecord = { ...current, submittedTurn: { messageId, submittedAt }, updatedAt: submittedAt };
      try {
        await this.docs.put(key, next, { mustMatchRevision: revision });
        return;
      } catch (error) {
        if ((error as { code?: string })?.code !== 'HOST_CAS_CONFLICT') throw error;
      }
    }
    // The marker is a heal optimization, never an authority — losing the
    // bounded race only means a later recovery replays the SAME turn id
    // idempotently at the Kernel.
  }
}

// ===========================================================================
// [#1006 HF16] Host-side durable POISON-RECOVERY coordinator. Same ownership
// split as external work: the Kernel alone owns State/Journal/Effect and
// turn identity; THIS coordinator owns only the source-pinned CAS state
// machine that decides WHICH authorized recovery may become a Kernel turn.
//
// One durable credential per poisoned message (single document, single CAS
// authority, created with mustBeAbsent):
//   authorized ──CAS──► delivered   (the one-shot corrective delivery;
//                                    resumeOrdinal pinned to 1, mirroring
//                                    the one-shot deadline contract)
//
// The credential binds the exact corrective material (sealed Business
// intentType + JSON input) at AUTHORIZATION time; the input lives in the
// RECORD only and is never part of the Kernel turnSource. [#1066 R1
// P1-HF16-01] The credential ALSO pins the durable poison evidence — the
// FAILED effect row of the selected Kernel that proved the named message
// actually poisoned the exact app/tenant/instance — supplied by the trusted
// gateway seam after its fail-closed verification; a nonexistent,
// successful or foreign poison never creates a record at all. The evidence
// is a pinned reference only: the Kernel stays sole authority over Journal
// semantics, and the pinned effectId is never re-executed by anything.
// Re-authorization of the same material resolves to the same record
// ('existing'); DIFFERENT material for the same poisoned message is a typed
// identity conflict, so
// one poison admits exactly one authorized corrective action. Duplicate or
// restart redelivery returns the STORED terminal source — the deterministic
// recovery turn id makes every re-submission an idempotent Kernel turn
// disposition replay with zero doubled State/Effect. The Kernel's own
// fail-closed poison policy is untouched: the original failed effect row is
// never re-executed by any turn.
//
// Record keys live in the Host namespace (never inside `v08-kernel:`):
//   v8host:poison-recovery:{appId}:{tenantId}:{instanceKey}:{poisonMessageId}
// ===========================================================================

export type PoisonRecoveryTurnSource = {
  readonly kind: 'recovery';
  readonly durableRecoveryActionId: string;
  readonly resumeOrdinal: number;
};

export interface PoisonRecoveryRecord {
  readonly pinVersion: 1;
  readonly kind: 'poison-recovery';
  readonly appId: string;
  readonly tenantId: string;
  readonly instanceKey: string;
  readonly poisonMessageId: string;
  /** The sealed Business intent the corrective turn submits (bound here). */
  readonly recoveryIntentType: string;
  /** Corrective occurrence input (RECORD truth only; never in the turnSource). */
  readonly recoveryInput: unknown;
  readonly reason: string;
  readonly authorizedBy: { readonly subject: string; readonly roles: readonly string[] };
  readonly authorizedAt: string;
  /**
   * [#1079 R1 P1-HF16-01] Pinned poison proof: the durable FAILED effect row
   * of the selected Kernel that authorized this credential. Supplied by the
   * trusted gateway seam (the coordinator owns no Kernel-journal read
   * authority); a record cannot exist without verified evidence.
   */
  readonly poisonEvidence: { readonly effectId: string; readonly verifiedAt: string };
  readonly status: 'authorized' | 'delivered';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deliveredSource?: PoisonRecoveryTurnSource;
  /** Heal marker written AFTER a successful Kernel submission. */
  readonly submittedTurn?: { readonly messageId: string; readonly submittedAt: string };
}

export interface AuthorizePoisonRecoveryInput {
  readonly appId: string;
  readonly tenantId: string;
  readonly instanceKey: string;
  readonly poisonMessageId: string;
  readonly recoveryIntentType: string;
  readonly recoveryInput: unknown;
  readonly reason: string;
  readonly authorizedBy: { readonly subject: string; readonly roles: readonly string[] };
  readonly authorizedAt: string;
  /**
   * [#1079 R1 P1-HF16-01] REQUIRED proof that the named message durably
   * poisoned the exact app/tenant/instance: the FAILED effect row the
   * trusted gateway seam verified before creating the credential.
   */
  readonly poisonEvidence: { readonly effectId: string; readonly verifiedAt: string };
}

export type DeliverPoisonRecoveryOutcome =
  | { readonly disposition: 'accepted'; readonly record: PoisonRecoveryRecord; readonly turnSource: PoisonRecoveryTurnSource; readonly messageId: string }
  | { readonly disposition: 'duplicate'; readonly record: PoisonRecoveryRecord; readonly turnSource: PoisonRecoveryTurnSource; readonly messageId: string };

export function poisonRecoveryDocKey(appId: string, tenantId: string, instanceKey: string, poisonMessageId: string): string {
  return `v8host:poison-recovery:${appId}:${tenantId}:${instanceKey}:${poisonMessageId}`;
}

/** The durable recovery action identity embedded in the Kernel turn source. */
export function poisonRecoveryActionId(poisonMessageId: string): string {
  return `pr:${poisonMessageId}`;
}

export function poisonRecoveryTurnMessageId(poisonMessageId: string): string {
  return `ctrl:recovery:${poisonMessageId}:1`;
}

function decodePoisonRecovery(envelope: unknown, key: string): PoisonRecoveryRecord {
  const raw = asRecord(envelope, `poison-recovery record ${key}`);
  if (raw.pinVersion !== 1 || raw.kind !== 'poison-recovery') {
    throw new DurableControlError('POISON_RECOVERY_INVALID', `record ${key} is not a poison-recovery record`);
  }
  const record = raw as unknown as PoisonRecoveryRecord;
  requireComponent(record.appId, 'appId');
  requireComponent(record.tenantId, 'tenantId');
  requireComponent(record.instanceKey, 'instanceKey');
  requireComponent(record.poisonMessageId, 'poisonMessageId');
  requireComponent(record.recoveryIntentType, 'recoveryIntentType');
  requireNonEmptyText(record.reason, 'reason');
  if (typeof record.authorizedBy !== 'object' || record.authorizedBy === null || typeof record.authorizedBy.subject !== 'string') {
    throw new DurableControlError('POISON_RECOVERY_INVALID', `record ${key} carries no authorizing principal`);
  }
  requireInstant(record.authorizedAt, 'authorizedAt');
  if (typeof record.poisonEvidence !== 'object' || record.poisonEvidence === null
    || typeof record.poisonEvidence.effectId !== 'string' || record.poisonEvidence.effectId.length === 0) {
    throw new DurableControlError('POISON_RECOVERY_INVALID', `record ${key} carries no pinned poison evidence (the verified FAILED effectId)`);
  }
  requireInstant(record.poisonEvidence.verifiedAt, 'poisonEvidence.verifiedAt');
  if (record.status !== 'authorized' && record.status !== 'delivered') {
    throw new DurableControlError('POISON_RECOVERY_INVALID', `record ${key} carries an unknown status`);
  }
  requireInstant(record.createdAt, 'createdAt');
  requireInstant(record.updatedAt, 'updatedAt');
  if (record.status === 'authorized' && record.deliveredSource !== undefined) {
    throw new DurableControlError('POISON_RECOVERY_INVALID', `authorized record ${key} must not carry a deliveredSource`);
  }
  if (record.status === 'delivered' && (record.deliveredSource === undefined || record.deliveredSource.resumeOrdinal !== 1)) {
    throw new DurableControlError('POISON_RECOVERY_INVALID', `delivered record ${key} must carry its one-shot terminal source`);
  }
  return record;
}

export class PoisonRecoveryCoordinator {
  constructor(private readonly docs: CasDocumentStore) {}

  private async load(key: string): Promise<{ record: PoisonRecoveryRecord; revision: number }> {
    const envelope = await this.docs.get(key);
    if (envelope === null) {
      throw new DurableControlError(
        'POISON_RECOVERY_UNKNOWN',
        `no durable poison-recovery action exists for ${key}; an unauthorized recovery never reaches the Kernel`,
      );
    }
    return { record: decodePoisonRecovery(envelope.value, key), revision: envelope.revision };
  }

  /**
   * Durably authorize ONE corrective recovery action for an exact poisoned
   * message. [#1079 R1 P1-HF16-01] The caller MUST supply the pinned poison
   * evidence — the durable FAILED effect row of the selected Kernel for the
   * exact app/tenant/instance/message — so a credential can never exist for
   * a nonexistent, successful or foreign poison (the trusted gateway seam
   * verifies the evidence BEFORE calling here; the evidence shape is
   * re-validated fail-closed). Single creation (mustBeAbsent); the same
   * material re-authorizes idempotently ('existing'), different material for
   * the same poison is a typed identity conflict.
   */
  async authorize(input: AuthorizePoisonRecoveryInput): Promise<{ record: PoisonRecoveryRecord; disposition: 'created' | 'existing' }> {
    requireComponent(input.poisonMessageId, 'poisonMessageId');
    requireComponent(input.recoveryIntentType, 'recoveryIntentType');
    requireNonEmptyText(input.reason, 'reason');
    requireInstant(input.authorizedAt, 'authorizedAt');
    if (typeof input.poisonEvidence !== 'object' || input.poisonEvidence === null
      || typeof input.poisonEvidence.effectId !== 'string' || input.poisonEvidence.effectId.length === 0) {
      invalid('poisonEvidence must pin the verified FAILED effectId of the named poisoned message');
    }
    requireInstant(input.poisonEvidence.verifiedAt, 'poisonEvidence.verifiedAt');
    const key = poisonRecoveryDocKey(input.appId, input.tenantId, input.instanceKey, input.poisonMessageId);
    const record: PoisonRecoveryRecord = {
      pinVersion: 1,
      kind: 'poison-recovery',
      appId: input.appId,
      tenantId: input.tenantId,
      instanceKey: input.instanceKey,
      poisonMessageId: input.poisonMessageId,
      recoveryIntentType: input.recoveryIntentType,
      recoveryInput: input.recoveryInput,
      reason: input.reason,
      authorizedBy: input.authorizedBy,
      authorizedAt: input.authorizedAt,
      poisonEvidence: input.poisonEvidence,
      status: 'authorized',
      createdAt: input.authorizedAt,
      updatedAt: input.authorizedAt,
    };
    try {
      await this.docs.put(key, record, { mustBeAbsent: true });
      return { record, disposition: 'created' };
    } catch {
      const { record: current } = await this.load(key);
      const exact = current.recoveryIntentType === record.recoveryIntentType
        && canonicalJsonStringify(current.recoveryInput ?? null) === canonicalJsonStringify(record.recoveryInput ?? null);
      if (!exact) {
        throw new DurableControlError(
          'POISON_RECOVERY_IDENTITY_CONFLICT',
          `poisoned message ${input.poisonMessageId} is already bound to different corrective material; one poison admits exactly one authorized recovery action`,
        );
      }
      return { record: current, disposition: 'existing' };
    }
  }

  /**
   * Read ONE durable recovery action (the persisted authorization truth;
   * survives restarts). Authenticated Host-context read for the delivery
   * verb's pre-CAS Business-intent authority check.
   */
  async read(appId: string, tenantId: string, instanceKey: string, poisonMessageId: string): Promise<PoisonRecoveryRecord> {
    requireComponent(poisonMessageId, 'poisonMessageId');
    const { record } = await this.load(poisonRecoveryDocKey(appId, tenantId, instanceKey, poisonMessageId));
    return record;
  }

  /**
   * Deliver the authorized corrective turn exactly once. The CAS winner
   * (authorized→delivered) hands its deterministic recovery turn source to
   * the Kernel submission seam; every later redelivery — duplicate or after
   * restart — returns the STORED terminal source so the Kernel turn
   * disposition replays it idempotently (zero doubled State/Effect).
   */
  async deliver(input: {
    readonly appId: string;
    readonly tenantId: string;
    readonly instanceKey: string;
    readonly poisonMessageId: string;
    readonly deliveredAt: string;
  }): Promise<DeliverPoisonRecoveryOutcome> {
    requireComponent(input.poisonMessageId, 'poisonMessageId');
    requireInstant(input.deliveredAt, 'deliveredAt');
    const key = poisonRecoveryDocKey(input.appId, input.tenantId, input.instanceKey, input.poisonMessageId);
    const source: PoisonRecoveryTurnSource = {
      kind: 'recovery',
      durableRecoveryActionId: poisonRecoveryActionId(input.poisonMessageId),
      resumeOrdinal: 1,
    };
    const messageId = poisonRecoveryTurnMessageId(input.poisonMessageId);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const { record: current, revision } = await this.load(key);
      if (current.status === 'delivered') {
        return { disposition: 'duplicate', record: current, turnSource: current.deliveredSource ?? source, messageId };
      }
      const next: PoisonRecoveryRecord = {
        ...current,
        status: 'delivered',
        updatedAt: input.deliveredAt,
        deliveredSource: source,
      };
      if (await this.cas(key, next, revision)) {
        return { disposition: 'accepted', record: next, turnSource: source, messageId };
      }
    }
    throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not deliver poison recovery ${key} after bounded retries`);
  }

  /** The heal marker (see ExternalWorkCoordinator.markSubmitted). */
  async markSubmitted(
    appId: string,
    tenantId: string,
    instanceKey: string,
    poisonMessageId: string,
    messageId: string,
    submittedAt: string,
  ): Promise<void> {
    const key = poisonRecoveryDocKey(appId, tenantId, instanceKey, poisonMessageId);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const { record: current, revision } = await this.load(key);
      if (current.submittedTurn !== undefined && current.submittedTurn.messageId === messageId) return;
      const next: PoisonRecoveryRecord = { ...current, submittedTurn: { messageId, submittedAt }, updatedAt: submittedAt };
      if (await this.cas(key, next, revision)) return;
    }
    // The marker is a heal optimization, never an authority — losing the
    // bounded race only means a later redelivery replays the SAME turn id
    // idempotently at the Kernel.
  }

  private async cas(key: string, next: PoisonRecoveryRecord, expectedRevision: number): Promise<boolean> {
    try {
      await this.docs.put(key, next, { mustMatchRevision: expectedRevision });
      return true;
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'HOST_CAS_CONFLICT') {
        return false;
      }
      throw error;
    }
  }
}
