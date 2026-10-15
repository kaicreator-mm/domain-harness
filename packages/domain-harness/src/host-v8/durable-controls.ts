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

import { canonicalJsonStringify } from '../contracts/identity.js';
import type { CasDocumentStore } from './cas.js';

export type DurableControlErrorCode =
  | 'DURABLE_CONTROL_INVALID'
  | 'DURABLE_CONTROL_UNAVAILABLE'
  | 'EXTERNAL_WORK_IDENTITY_CONFLICT'
  | 'UNKNOWN_EXTERNAL_CORRELATION'
  | 'DEADLINE_TIMER_MISMATCH'
  | 'DEADLINE_NOT_DUE'
  | 'CALLBACK_IDENTITY_CONFLICT'
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
  return { kind: 'timer', timerId: source.timerId as string, fireOrdinal: source.fireOrdinal ?? 1 };
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
