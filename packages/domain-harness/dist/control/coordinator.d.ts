import type { RuntimeStore } from '../v2/contracts/store.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import type { PerInstanceSerializedLane } from '../engine/per-instance-serialized-lane.js';
import type { PoisonMessageRecoveryCoordinator } from '../recovery-v2/poison-message-recovery.js';
import { type RuntimeControlAuthorizer, type RuntimeControlReceipt, type RuntimeControlRecord, type RuntimeControlRequest, type RuntimeControlStore } from './contracts.js';
/** Error carrying the durable identity of the control that issued an internal AbortSignal. */
export declare class RuntimeControlInterruptSignal extends Error {
    readonly controlRequestId: string;
    constructor(controlRequestId: string);
}
/** In-flight turn handle (private; never exposed publicly). */
export interface ActiveRuntimeTurn {
    readonly messageId: string;
    readonly targetSequence: number;
    readonly controller: AbortController;
    /** Resolves once the turn's serialized processing settles (commit or failure). */
    readonly settled: Promise<void>;
}
export interface RuntimeControlRuntimePorts {
    /** Authoritative per-instance facts (store is the durability authority). */
    readonly store: RuntimeStore;
    readonly recovery: PoisonMessageRecoveryCoordinator;
    /** The SAME per-instance serialized lane used by mailbox turns: this is the
     *  deterministic control-vs-commit serialization point. */
    readonly lane: PerInstanceSerializedLane;
    readonly now: () => string;
    /** Current in-flight turn of one target, if any (live-process fact). */
    activeTurn(target: WorkflowAddress): ActiveRuntimeTurn | undefined;
    /** Called after a pending CANCEL stops blocking new turns without terminalizing. */
    onNewTurnsUnblocked(target: WorkflowAddress): void;
}
export interface RuntimeControlCoordinatorOptions {
    readonly authorizer: RuntimeControlAuthorizer;
    readonly store: RuntimeControlStore;
    readonly ports: RuntimeControlRuntimePorts;
}
/**
 * Issue #313 control coordinator. Owns the durable control lifecycle
 * (requested -> accepted -> resolving -> terminal outcome), the fail-closed
 * authorization seam and restart reconciliation. Deterministic winner rule:
 * control resolution and turn commits serialize on the same per-instance lane,
 * and every outcome is derived purely from durable facts read at resolution
 * time — an ignored internal signal can never fabricate a stop.
 */
export declare class RuntimeControlCoordinator {
    #private;
    constructor(options: RuntimeControlCoordinatorOptions);
    /** Drain gate: while a CANCEL intent is accepted-but-unresolved, no new turn may begin. */
    blocksNewTurns(target: WorkflowAddress): boolean;
    requestControl(request: RuntimeControlRequest): Promise<RuntimeControlReceipt>;
    getControlOutcome(controlRequestId: string): Promise<RuntimeControlRecord | null>;
    /**
     * Startup reconciliation of accepted/resolving controls after process loss.
     * Never blindly reissues a signal or a new intent: each unresolved record is
     * classified purely from authoritative instance/message/effect facts. An
     * accepted CANCEL completes from those facts (it was already a durable
     * admitted intent); an INTERRUPT can only be classified, never re-fired.
     */
    reconcileUnresolved(): Promise<void>;
}
//# sourceMappingURL=coordinator.d.ts.map