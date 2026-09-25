import type { RuntimeObservationCapability } from '../../observation/contracts.js';
import type { RuntimeControlCapability } from '../../control/contracts.js';
import type { DomainMessage, MessageAcceptedAck } from './message.js';
import type { DomainQuery, DomainQueryResult } from './query.js';
import type { BusinessInvalidation, DomainChangeListener, DomainSubscription, Unsubscribe } from './subscription.js';
import type { OpenWorkflowInstanceRequest, WorkflowAddress, WorkflowInstanceSnapshot } from './workflow.js';
export interface RecoveryRequest {
    target: WorkflowAddress;
    action: 'retry' | 'resolve' | 'terminate';
    reason?: string;
}
export interface RecoveryResult {
    instance: WorkflowInstanceSnapshot;
}
export interface DomainRuntime {
    openInstance(request: OpenWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot>;
    send(message: DomainMessage): Promise<MessageAcceptedAck>;
    query(request: DomainQuery): Promise<DomainQueryResult>;
    subscribe(request: DomainSubscription, listener: DomainChangeListener): Unsubscribe;
    recover(request: RecoveryRequest): Promise<RecoveryResult>;
    invalidateBusinessSnapshot(request: BusinessInvalidation): void;
    /**
     * Resolves when every currently scheduled Runtime-owned background task has
     * completed: mailbox drains (including lost-wakeup redrains and startup
     * reclaim drains) and subscription observations (including in-flight flushes
     * and pending failure retries). New work scheduled while waiting is included.
     *
     * Documented limit: a subscription whose observation keeps failing retains a
     * pending retry by design (convergence guarantee), so awaitIdle() resolves
     * only after a successful observation or dispose(). awaitIdle() itself works
     * after disposal and then resolves once in-flight drains reach their safe
     * boundary.
     */
    awaitIdle(): Promise<void>;
    /**
     * Idempotent lifecycle shutdown. Prevents new Runtime-owned background
     * scheduling; the in-flight mailbox turn (if any) completes to its durable
     * commit boundary and no further turn is started; subscription delivery,
     * observation retries and lost-wakeup redrains stop and cannot resurrect.
     * Resolves once no further Runtime-owned store access can occur — it does
     * NOT close injected host resources (store/SQLite); hosts close those after
     * dispose() resolves. Public operations invoked after disposal reject with
     * DomainRuntimeError code 'runtime_disposed'.
     */
    dispose(): Promise<void>;
    /**
     * Issue #312 durable ordered Runtime Observation Stream capability.
     * Optional and additive: the factory always populates it explicitly —
     * `{ status: 'UNSUPPORTED' }` when observation is not enabled (existing
     * Runtime semantics unchanged; absence of records never means "no
     * activity"), or the enabled durable pull/cursor read surface. Consumers
     * treating older hand-built runtimes without this member MUST default it
     * to UNSUPPORTED.
     */
    readonly observation?: RuntimeObservationCapability;
    /**
     * Issue #313 generic public Runtime cancel/interrupt control capability.
     * Optional and additive: the factory always populates it explicitly —
     * `{ status: 'UNSUPPORTED' }` (default deny; a request receives an
     * UNSUPPORTED receipt and causes no mutation) when no fail-closed
     * `RuntimeControlAuthorizer` is configured, or the authorized durable
     * requestControl/getControlOutcome surface when enabled. Consumers
     * treating older hand-built runtimes without this member MUST default it
     * to UNSUPPORTED. Raw AbortSignal/XState authority stays private: the
     * durable control record is the only public truth.
     */
    readonly control?: RuntimeControlCapability;
}
//# sourceMappingURL=runtime.d.ts.map