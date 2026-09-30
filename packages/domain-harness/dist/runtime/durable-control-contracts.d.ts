import type { JsonValue } from '../contracts/json.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
export interface ProvisionWorkflowInstanceRequest {
    readonly provisioningKey: string;
    readonly target: WorkflowAddress;
    readonly correlationId: string;
    readonly packageId: string;
    readonly input: JsonValue;
    readonly requestedAt: string;
}
export interface ProvisionedWorkflowInstance {
    readonly provisioningKey: string;
    readonly target: WorkflowAddress;
    readonly correlationId: string;
    readonly packageId: string;
    readonly input: JsonValue;
    readonly createdAt: string;
}
export interface EnsureProvisionedWorkflowInstanceResult {
    readonly disposition: 'created' | 'existing';
    readonly record: ProvisionedWorkflowInstance;
}
/**
 * I-OPEN / #180 additive request for the RuntimeStore/instance atomic ensure/open seam.
 *
 * `initialInstance` is the exact revision-0 snapshot already computed by the Runtime
 * from the selected package/workflow. The durable adapter never derives workflow
 * semantics, a provisioning key or initial state on its own.
 */
export interface ProvisionAndOpenWorkflowInstanceRequest extends ProvisionWorkflowInstanceRequest {
    readonly initialInstance: WorkflowInstanceSnapshot;
}
/**
 * Result of one atomic provisioning-key + Runtime-instance convergence.
 *
 * The two dispositions are deliberately independent: a newly bound provisioning
 * key may converge to an already-existing identity-compatible Runtime instance,
 * while an older provisioning ledger entry may need to materialize its missing
 * instance exactly once after an upgrade/restart.
 */
export interface EnsureProvisionedWorkflowInstanceOpenResult {
    readonly provisioningDisposition: 'created' | 'existing';
    readonly instanceDisposition: 'created' | 'existing';
    readonly record: ProvisionedWorkflowInstance;
    readonly instance: WorkflowInstanceSnapshot;
}
/**
 * Successor-only RuntimeStore/instance provisioning extension (I-OPEN / #180).
 *
 * Implementations MUST perform provisioning-key reconciliation and exact
 * WorkflowInstance create-or-return in ONE host transaction/durability domain.
 * A caller must never emulate this contract with query-then-insert. Exact replay
 * must never reset a progressed instance to `initialInstance`.
 */
export interface RuntimeInstanceProvisioningStore {
    ensureProvisionedWorkflowInstanceOpen(request: ProvisionAndOpenWorkflowInstanceRequest): Promise<EnsureProvisionedWorkflowInstanceOpenResult>;
}
/** Shared exact T-010 identity predicate used by coordinator and host adapters. */
export declare function provisioningRecordMatchesRequest(record: ProvisionedWorkflowInstance, request: ProvisionWorkflowInstanceRequest): boolean;
/**
 * Identity-only compatibility for an already durable Runtime instance.
 * State/lifecycle/revision are intentionally excluded because an idempotent
 * ensure replay must return a progressed or terminal instance without resetting it.
 */
export declare function provisioningInstanceIdentityMatchesRequest(instance: WorkflowInstanceSnapshot, request: ProvisionWorkflowInstanceRequest): boolean;
/**
 * Exact initial-snapshot predicate for a newly materialized instance.
 * Runtime owns construction; the store only persists this exact snapshot.
 */
export declare function initialProvisioningInstanceMatchesRequest(instance: WorkflowInstanceSnapshot, request: ProvisionAndOpenWorkflowInstanceRequest): boolean;
/** Structural capability check used by v3 composition without widening RuntimeStore. */
export declare function isRuntimeInstanceProvisioningStore(store: unknown): store is RuntimeInstanceProvisioningStore;
/**
 * #180 additive public Runtime ensure/open request. The provisioning key is
 * ALWAYS caller-supplied and explicit: the Runtime never derives one from
 * address/correlation/package/input, and never auto-provisions from workflow
 * activity (#138).
 */
export interface EnsureProvisionedInstanceOpenRequest {
    readonly provisioningKey: string;
    readonly address: WorkflowAddress;
    readonly correlationId: string;
    readonly input: JsonValue;
    /** Defaults to the registry's default package, identical to openInstance(). */
    readonly packageId?: string;
}
/** #180 additive public ensure/open outcome; existing snapshots are returned unchanged. */
export interface EnsureProvisionedInstanceOpenOutcome {
    readonly instance: WorkflowInstanceSnapshot;
    readonly provisioningDisposition: 'created' | 'existing';
    readonly instanceDisposition: 'created' | 'existing';
}
/**
 * #180 additive optional Runtime provisioning capability (the third optional
 * capability member after #312 observation and #313 control). The factory
 * always populates it explicitly: `UNSUPPORTED` when the RuntimeStore does not
 * implement the atomic I-OPEN provisioning extension — or, with Runtime
 * Observation enabled, its observation-capable form, because instance
 * materialization is then a covered `INSTANCE_OPENED` mutation that must commit
 * atomically with its observation record and is never silently downgraded to an
 * unobserved write. Consumers treating older hand-built runtimes without this
 * member MUST default it to UNSUPPORTED. The retained `openInstance()` behavior
 * is unchanged; `ensureOpen` never auto-runs the initial state.
 */
export type RuntimeProvisioningCapability = {
    readonly status: 'ENABLED';
    ensureOpen(request: EnsureProvisionedInstanceOpenRequest): Promise<EnsureProvisionedInstanceOpenOutcome>;
} | {
    readonly status: 'UNSUPPORTED';
};
export interface RegisterExternalWorkRequest {
    readonly externalCorrelationId: string;
    readonly target: WorkflowAddress;
    readonly deadlineTimerId: string;
    readonly dueAt: string;
    readonly registeredAt: string;
}
export type ExternalWorkCorrelationStatus = 'waiting' | 'callback_received' | 'timed_out';
export interface DeadlineControlSource {
    readonly kind: 'deadline';
    readonly durableControlTurnId: string;
    readonly target: WorkflowAddress;
    readonly externalCorrelationId: string;
    readonly timerId: string;
    readonly fireOrdinal: number;
    readonly observedAt: string;
}
export interface ExternalCallbackControlSource {
    readonly kind: 'external_callback';
    readonly durableControlTurnId: string;
    readonly target: WorkflowAddress;
    readonly externalCorrelationId: string;
    readonly callbackOrdinal: number;
    readonly payload: JsonValue;
    readonly observedAt: string;
}
export type DurableExternalWorkControlSource = DeadlineControlSource | ExternalCallbackControlSource;
interface ExternalWorkCorrelationRecordBase {
    readonly externalCorrelationId: string;
    readonly target: WorkflowAddress;
    readonly deadlineTimerId: string;
    readonly dueAt: string;
    readonly revision: number;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface WaitingExternalWorkCorrelationRecord extends ExternalWorkCorrelationRecordBase {
    readonly status: 'waiting';
}
export interface CallbackCompletedExternalWorkCorrelationRecord extends ExternalWorkCorrelationRecordBase {
    readonly status: 'callback_received';
    readonly terminalSource: ExternalCallbackControlSource;
}
export interface TimedOutExternalWorkCorrelationRecord extends ExternalWorkCorrelationRecordBase {
    readonly status: 'timed_out';
    readonly terminalSource: DeadlineControlSource;
}
export type CompletedExternalWorkCorrelationRecord = CallbackCompletedExternalWorkCorrelationRecord | TimedOutExternalWorkCorrelationRecord;
export type ExternalWorkCorrelationRecord = WaitingExternalWorkCorrelationRecord | CompletedExternalWorkCorrelationRecord;
export interface EnsureExternalWorkCorrelationResult {
    readonly disposition: 'created' | 'existing';
    readonly record: ExternalWorkCorrelationRecord;
}
export interface CompareAndSetExternalWorkCorrelationRequest {
    readonly externalCorrelationId: string;
    readonly expectedRevision: number;
    readonly next: CompletedExternalWorkCorrelationRecord;
}
/**
 * Durable persistence seam for T-010.
 *
 * Implementations MUST make each ensure operation atomic. In particular,
 * `ensureProvisionedWorkflowInstance` binds one provisioning key to one exact
 * logical WorkflowAddress and creates/opens that logical instance in the same
 * durable transaction; callers must never emulate this with query-then-insert.
 *
 * The external-work methods store only correlation/deadline state. They do not
 * submit, cancel, poll or otherwise own the external job platform.
 */
export interface DurableControlStore {
    ensureProvisionedWorkflowInstance(request: ProvisionWorkflowInstanceRequest): Promise<EnsureProvisionedWorkflowInstanceResult>;
    ensureExternalWorkCorrelation(request: RegisterExternalWorkRequest): Promise<EnsureExternalWorkCorrelationResult>;
    getExternalWorkCorrelation(externalCorrelationId: string): Promise<ExternalWorkCorrelationRecord | null>;
    /**
     * Return records whose durable deadline may be due. The result may be stale;
     * the coordinator always re-checks current state and resolves through CAS.
     */
    listDueExternalWorkCorrelations(dueAtOrBefore: string): Promise<readonly ExternalWorkCorrelationRecord[]>;
    /**
     * Atomically replace one waiting correlation record by its terminal state.
     * Return false when expectedRevision is stale or the record is no longer
     * waiting. Implementations must not partially update a correlation record.
     */
    compareAndSetExternalWorkCorrelation(request: CompareAndSetExternalWorkCorrelationRequest): Promise<boolean>;
}
export {};
//# sourceMappingURL=durable-control-contracts.d.ts.map