import type { WorkflowAddress } from '../v2/contracts/workflow.js';
export declare function addressKey(target: WorkflowAddress): string;
export interface MailboxDrainSchedulerOptions {
    /** Runs one mailbox drain loop for the target (provided by the runtime). */
    drain(target: WorkflowAddress): Promise<void>;
    /**
     * Errors for which the durable failure fact is already persisted and
     * observable (poison-message recovery) and which are therefore not
     * reported again as background errors.
     */
    isDrainSuppressed?(error: unknown): boolean;
    /** Background error reporting; the scheduler guarantees it cannot throw out. */
    reportError(error: unknown, target: WorkflowAddress): void;
}
/**
 * Owns mailbox drain scheduling state and its invariants (issue #169/#171):
 *
 * - at most one active drain per target;
 * - wake-up preservation: a schedule during an active drain is remembered and
 *   re-drains exactly once after the active drain settles (lost-wakeup fix);
 * - identity-guarded cleanup: a stale drain's `finally` never deletes or
 *   reschedules a newer drain for the same target;
 * - disposal: no new drains (including redrains) are scheduled after
 *   dispose(); already-running drain loops stop at their next safe boundary
 *   because they observe `disposed`;
 * - quiescence: `awaitIdle()` resolves when no drain is active or requested,
 *   following redrain chains.
 *
 * Error routing is hardened: a throwing host `reportError` handler cannot turn
 * drain-error routing into an unhandled rejection on the floating drain chain.
 */
export declare class MailboxDrainScheduler {
    #private;
    constructor(options: MailboxDrainSchedulerOptions);
    get disposed(): boolean;
    get activeDrainCount(): number;
    schedule(target: WorkflowAddress): void;
    awaitIdle(): Promise<void>;
    dispose(): void;
}
//# sourceMappingURL=mailbox-drain-scheduler.d.ts.map