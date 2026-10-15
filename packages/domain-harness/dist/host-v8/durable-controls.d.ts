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
import type { CasDocumentStore } from './cas.js';
export type DurableControlErrorCode = 'DURABLE_CONTROL_INVALID' | 'DURABLE_CONTROL_UNAVAILABLE' | 'EXTERNAL_WORK_IDENTITY_CONFLICT' | 'UNKNOWN_EXTERNAL_CORRELATION' | 'DEADLINE_TIMER_MISMATCH' | 'DEADLINE_NOT_DUE' | 'CALLBACK_IDENTITY_CONFLICT' | 'CHILD_INVOCATION_UNKNOWN' | 'CHILD_INVOCATION_NOT_ACCEPTED' | 'CHILD_INVOCATION_ALREADY_TERMINAL' | 'CHILD_INVOCATION_SETTLED' | 'CHILD_INVOCATION_REJECTED' | 'POISON_RECOVERY_INVALID' | 'POISON_RECOVERY_IDENTITY_CONFLICT' | 'POISON_RECOVERY_UNKNOWN' | 'DURABLE_CONTROL_CONTENTION';
export declare class DurableControlError extends Error {
    readonly code: DurableControlErrorCode;
    constructor(code: DurableControlErrorCode, message: string);
}
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
export declare function kernelTurnSourceOf(source: ExternalWorkTurnSource): Record<string, unknown>;
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
    readonly submittedTurn?: {
        readonly messageId: string;
        readonly submittedAt: string;
    };
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
export type SettleCallbackOutcome = {
    readonly disposition: 'accepted';
    readonly record: ExternalWorkRecord;
    readonly turnSource: ExternalWorkTurnSource;
    readonly messageId: string;
} | {
    readonly disposition: 'duplicate' | 'late_after_timeout' | 'ignored_after_completion';
    readonly record: ExternalWorkRecord;
};
export type SettleDeadlineOutcome = {
    readonly disposition: 'accepted';
    readonly record: ExternalWorkRecord;
    readonly turnSource: ExternalWorkTurnSource;
    readonly messageId: string;
} | {
    readonly disposition: 'duplicate' | 'callback_already_completed';
    readonly record: ExternalWorkRecord;
};
export declare function externalWorkDocKey(appId: string, tenantId: string, instanceKey: string, externalCorrelationId: string): string;
/**
 * The Host-side coordinator over the probed physical CAS store. One
 * instance per host; all verbs are invoked behind gateway authentication.
 */
export declare class ExternalWorkCoordinator {
    private readonly docs;
    constructor(docs: CasDocumentStore);
    private load;
    register(input: RegisterExternalWorkInput): Promise<{
        record: ExternalWorkRecord;
        disposition: 'created' | 'existing';
    }>;
    read(appId: string, tenantId: string, instanceKey: string, externalCorrelationId: string): Promise<ExternalWorkRecord>;
    /**
     * Settle ONE incoming callback against the durable state machine. The
     * CAS winner receives the deterministic callback turn source; everyone
     * else gets a typed duplicate/late/ignored outcome with ZERO Kernel
     * activity.
     */
    settleCallback(input: {
        readonly appId: string;
        readonly tenantId: string;
        readonly instanceKey: string;
        readonly externalCorrelationId: string;
        readonly callbackOrdinal: number;
        readonly payload: unknown;
        readonly receivedAt: string;
    }): Promise<SettleCallbackOutcome>;
    /**
     * Settle ONE deadline fire. Early fires and foreign timers refuse typed
     * before any mutation; the CAS winner receives the one-shot timer turn
     * source (fireOrdinal is pinned to 1, the v0.7 T-010 one-shot contract).
     */
    settleDeadline(input: {
        readonly appId: string;
        readonly tenantId: string;
        readonly instanceKey: string;
        readonly externalCorrelationId: string;
        readonly timerId: string;
        readonly fireOrdinal: number;
        readonly firedAt: string;
    }): Promise<SettleDeadlineOutcome>;
    /**
     * Mark the settled turn as submitted (the heal marker written AFTER a
     * successful Kernel submission). A crash between settlement and this
     * marker is the honest UNKNOWN window healed by `recoverExternalWork`.
     */
    markSubmitted(appId: string, tenantId: string, instanceKey: string, externalCorrelationId: string, messageId: string, submittedAt: string): Promise<void>;
    /**
     * Caller-driven recovery (NOT a scheduler): list every correlation of
     * the tenant/app, fire the due waiting ones, and re-submit every settled
     * record whose turn submission may have been lost (no submittedTurn
     * marker). The stable turn identity makes every re-submission an
     * idempotent Kernel replay — the v0.7 heal contract verbatim.
     */
    recoverDueAndSettled(input: {
        readonly appId: string;
        readonly tenantId: string;
        readonly now: string;
        readonly fireDue: (correlation: {
            readonly record: ExternalWorkRecord;
            readonly turnSource: ExternalWorkTurnSource;
            readonly messageId: string;
        }) => Promise<void>;
    }): Promise<{
        readonly fired: number;
        readonly healed: number;
    }>;
    private cas;
}
export interface ChildInvocationRecord {
    readonly pinVersion: 1;
    readonly kind: 'child-invocation';
    readonly appId: string;
    readonly tenantId: string;
    readonly parentInstanceKey: string;
    readonly childInstanceKey: string;
    readonly invocationOrdinal: number;
    readonly childIntentType: string;
    readonly doneIntentType: string;
    readonly errorIntentType: string;
    readonly status: 'pending' | 'accepted' | 'rejected' | 'done' | 'error';
    readonly childTurnMessageId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly rejection?: {
        readonly code: string;
        readonly message?: string;
    };
    readonly terminal?: {
        readonly terminalKind: 'done' | 'error';
        readonly input?: unknown;
        readonly settledAt: string;
    };
    readonly submittedTurn?: {
        readonly messageId: string;
        readonly submittedAt: string;
    };
}
export interface ChildInvocationTurnPlan {
    readonly record: ChildInvocationRecord;
    readonly childTurnSource: Record<string, unknown>;
    readonly childTurnMessageId: string;
    readonly parentTurnSource: {
        kind: 'child-terminal';
        parentActorId: string;
        childActorId: string;
        invocationOrdinal: number;
        terminalKind: 'done' | 'error';
    };
    readonly parentTurnMessageId: string;
}
export declare function childInvocationDocKey(appId: string, tenantId: string, parentInstanceKey: string, childInstanceKey: string, invocationOrdinal: number): string;
export declare function childInvocationCorrelationId(parentInstanceKey: string, childInstanceKey: string, invocationOrdinal: number): string;
export declare class ChildInvocationCoordinator {
    private readonly docs;
    constructor(docs: CasDocumentStore);
    private load;
    peek(appId: string, tenantId: string, parentInstanceKey: string, childInstanceKey: string, invocationOrdinal: number): Promise<ChildInvocationRecord | null>;
    /**
     * Allocate (or re-address) ONE invocation record. Without an explicit
     * ordinal the next free ordinal of the (parent, child) pair is claimed
     * under create-if-absent CAS; an explicit ordinal re-addresses a known
     * invocation (bounded UNKNOWN-window retry while pending, typed refusal
     * once settled — a rejected invocation is NEVER retried).
     */
    open(input: {
        readonly appId: string;
        readonly tenantId: string;
        readonly parentInstanceKey: string;
        readonly childInstanceKey: string;
        readonly invocationOrdinal?: number;
        readonly childIntentType: string;
        readonly doneIntentType: string;
        readonly errorIntentType: string;
        readonly openedAt: string;
    }): Promise<{
        record: ChildInvocationRecord;
        disposition: 'created' | 'pending-retry';
    }>;
    private adjudicateExisting;
    private pendingRecord;
    /**
     * Settle the child-send outcome: `accepted` (the child message turn was
     * admitted) or `rejected` (a PERMANENT typed refusal, durably committed
     * BEFORE any route selection — the caller routes on the returned truth).
     */
    settleSend(input: {
        readonly appId: string;
        readonly tenantId: string;
        readonly record: ChildInvocationRecord;
        readonly outcome: 'accepted' | 'rejected';
        readonly rejection?: {
            readonly code: string;
            readonly message?: string;
        };
        readonly settledAt: string;
    }): Promise<ChildInvocationRecord>;
    /**
     * Settle ONE correlated child terminal (done | error). Exactly ONE CAS
     * winner receives the deterministic parent child-terminal turn source;
     * duplicates and terminals on non-accepted invocations refuse typed with
     * ZERO Kernel activity.
     */
    settleTerminal(input: {
        readonly appId: string;
        readonly tenantId: string;
        readonly parentInstanceKey: string;
        readonly childInstanceKey: string;
        readonly invocationOrdinal: number;
        readonly terminalKind: 'done' | 'error';
        readonly terminalInput?: unknown;
        readonly settledAt: string;
    }): Promise<{
        disposition: 'accepted';
        plan: ChildInvocationTurnPlan;
        record: ChildInvocationRecord;
    } | {
        disposition: 'already-terminal';
        record: ChildInvocationRecord;
    }>;
    /** The heal marker (see ExternalWorkCoordinator.markSubmitted). */
    markSubmitted(record: ChildInvocationRecord, messageId: string, submittedAt: string): Promise<void>;
}
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
    readonly authorizedBy: {
        readonly subject: string;
        readonly roles: readonly string[];
    };
    readonly authorizedAt: string;
    /**
     * [#1079 R1 P1-HF16-01] Pinned poison proof: the durable FAILED effect row
     * of the selected Kernel that authorized this credential. Supplied by the
     * trusted gateway seam (the coordinator owns no Kernel-journal read
     * authority); a record cannot exist without verified evidence.
     */
    readonly poisonEvidence: {
        readonly effectId: string;
        readonly verifiedAt: string;
    };
    readonly status: 'authorized' | 'delivered';
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly deliveredSource?: PoisonRecoveryTurnSource;
    /** Heal marker written AFTER a successful Kernel submission. */
    readonly submittedTurn?: {
        readonly messageId: string;
        readonly submittedAt: string;
    };
}
export interface AuthorizePoisonRecoveryInput {
    readonly appId: string;
    readonly tenantId: string;
    readonly instanceKey: string;
    readonly poisonMessageId: string;
    readonly recoveryIntentType: string;
    readonly recoveryInput: unknown;
    readonly reason: string;
    readonly authorizedBy: {
        readonly subject: string;
        readonly roles: readonly string[];
    };
    readonly authorizedAt: string;
    /**
     * [#1079 R1 P1-HF16-01] REQUIRED proof that the named message durably
     * poisoned the exact app/tenant/instance: the FAILED effect row the
     * trusted gateway seam verified before creating the credential.
     */
    readonly poisonEvidence: {
        readonly effectId: string;
        readonly verifiedAt: string;
    };
}
export type DeliverPoisonRecoveryOutcome = {
    readonly disposition: 'accepted';
    readonly record: PoisonRecoveryRecord;
    readonly turnSource: PoisonRecoveryTurnSource;
    readonly messageId: string;
} | {
    readonly disposition: 'duplicate';
    readonly record: PoisonRecoveryRecord;
    readonly turnSource: PoisonRecoveryTurnSource;
    readonly messageId: string;
};
export declare function poisonRecoveryDocKey(appId: string, tenantId: string, instanceKey: string, poisonMessageId: string): string;
/** The durable recovery action identity embedded in the Kernel turn source. */
export declare function poisonRecoveryActionId(poisonMessageId: string): string;
export declare function poisonRecoveryTurnMessageId(poisonMessageId: string): string;
export declare class PoisonRecoveryCoordinator {
    private readonly docs;
    constructor(docs: CasDocumentStore);
    private load;
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
    authorize(input: AuthorizePoisonRecoveryInput): Promise<{
        record: PoisonRecoveryRecord;
        disposition: 'created' | 'existing';
    }>;
    /**
     * Read ONE durable recovery action (the persisted authorization truth;
     * survives restarts). Authenticated Host-context read for the delivery
     * verb's pre-CAS Business-intent authority check.
     */
    read(appId: string, tenantId: string, instanceKey: string, poisonMessageId: string): Promise<PoisonRecoveryRecord>;
    /**
     * Deliver the authorized corrective turn exactly once. The CAS winner
     * (authorized→delivered) hands its deterministic recovery turn source to
     * the Kernel submission seam; every later redelivery — duplicate or after
     * restart — returns the STORED terminal source so the Kernel turn
     * disposition replays it idempotently (zero doubled State/Effect).
     */
    deliver(input: {
        readonly appId: string;
        readonly tenantId: string;
        readonly instanceKey: string;
        readonly poisonMessageId: string;
        readonly deliveredAt: string;
    }): Promise<DeliverPoisonRecoveryOutcome>;
    /** The heal marker (see ExternalWorkCoordinator.markSubmitted). */
    markSubmitted(appId: string, tenantId: string, instanceKey: string, poisonMessageId: string, messageId: string, submittedAt: string): Promise<void>;
    private cas;
}
//# sourceMappingURL=durable-controls.d.ts.map