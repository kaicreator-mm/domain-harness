import { type Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { GovernanceBaselineAuthorityBinding, GovernanceBaselineBody, GovernanceBaselineStore, GovernancePackageCdiBinding } from './contracts.js';
export type DomainActivationBinding = GovernanceBaselineAuthorityBinding;
export interface GovernanceExecutionPin extends DomainActivationBinding {
    readonly workflowTarget: string;
    readonly workflowInstanceId: string;
    readonly bindingDigest: string;
}
export interface GovernanceBoundSnapshot {
    readonly workflowInstanceId: string;
    readonly governanceBindingDigest: string;
    readonly snapshot: JsonValue;
}
export type BindGovernanceExecutionPinResult = 'inserted' | 'existing' | 'conflict';
/**
 * Atomic activation authority for new-instance bindings. Implementations MUST
 * publish and read the complete immutable tuple as one record. Field-wise
 * package/CDI/governance updates are forbidden because they can expose torn
 * authority. This port reuses the existing activation authority; it does not
 * create a second runtime or execution store.
 */
export interface DomainActivationAuthority {
    readDomainActivationBinding(domainId: string): Promise<unknown>;
    publishDomainActivationBinding(binding: DomainActivationBinding): Promise<void>;
}
/**
 * Narrow T-014 surface of the existing per-instance DurableExecutionStore.
 * The same concrete durability/ordering authority that owns package pins and
 * control snapshots MUST implement these methods. Host persistence is validated
 * by T-022/T-023, not by portable deterministic tests.
 */
export interface DurableExecutionStore {
    getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown>;
    /** Atomic bind-once operation. Same exact pin is idempotent; conflicts never overwrite. */
    bindGovernanceExecutionPin(pin: GovernanceExecutionPin): Promise<BindGovernanceExecutionPinResult>;
    getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown>;
    putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void>;
}
/** Resolve only an exact package/CDI authority tuple. No floating selectors are accepted. */
export interface ExactPackageCdiAuthority {
    resolveExactPackageCdi(binding: GovernancePackageCdiBinding): Promise<GovernancePackageCdiBinding | undefined>;
}
export type GovernanceExecutionBindingErrorCode = 'INVALID_DOMAIN_ACTIVATION_BINDING' | 'MISSING_DOMAIN_ACTIVATION_BINDING' | 'FLOATING_EXECUTION_AUTHORITY_FORBIDDEN' | 'INVALID_GOVERNANCE_EXECUTION_PIN' | 'GOVERNANCE_EXECUTION_PIN_MISSING' | 'GOVERNANCE_EXECUTION_PIN_CONFLICT' | 'GOVERNANCE_EXECUTION_PIN_MISMATCH' | 'SNAPSHOT_BEFORE_GOVERNANCE_PIN' | 'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH' | 'PACKAGE_CDI_BINDING_MISMATCH' | 'PACKAGE_CDI_RECOVERY_MISMATCH' | 'GOVERNANCE_BASELINE_BINDING_MISMATCH' | 'GOVERNANCE_BASELINE_RECOVERY_MISMATCH';
export declare class GovernanceExecutionBindingError extends Error {
    readonly code: GovernanceExecutionBindingErrorCode;
    constructor(code: GovernanceExecutionBindingErrorCode, message: string);
}
export declare function assertDomainActivationBinding(binding: DomainActivationBinding): void;
export declare class DomainActivationBindingCoordinator {
    #private;
    constructor(authority: DomainActivationAuthority, packageCdiAuthority: ExactPackageCdiAuthority, baselines: GovernanceBaselineStore, sha256: Sha256Port);
    publish(binding: DomainActivationBinding): Promise<DomainActivationBinding>;
    resolveForNewInstance(domainId: string): Promise<DomainActivationBinding>;
}
export declare function computeGovernanceExecutionBindingDigest(binding: DomainActivationBinding, sha256: Sha256Port): Promise<string>;
export declare function createGovernanceExecutionPin(request: {
    readonly workflowTarget: string;
    readonly workflowInstanceId: string;
    readonly binding: DomainActivationBinding;
}, sha256: Sha256Port): Promise<GovernanceExecutionPin>;
export declare function validateGovernanceExecutionPin(value: unknown, sha256: Sha256Port, expectedWorkflowInstanceId?: string): Promise<GovernanceExecutionPin>;
export declare class GovernanceExecutionCoordinator {
    #private;
    constructor(store: DurableExecutionStore, sha256: Sha256Port);
    pinExecution(request: {
        readonly workflowTarget: string;
        readonly workflowInstanceId: string;
        readonly binding: DomainActivationBinding;
    }): Promise<GovernanceExecutionPin>;
    /**
     * Gate to call immediately before an authoritative state-changing control
     * publication. It returns only after the exact pin is already durable.
     * T-019 owns central Workflow wiring of this gate into control publication.
     */
    requirePinnedExecution(workflowInstanceId: string): Promise<GovernanceExecutionPin>;
    persistSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void>;
}
export interface RecoveredGovernanceExecutionAuthority {
    readonly pin: GovernanceExecutionPin;
    readonly governanceBaseline: GovernanceBaselineBody;
    readonly snapshot?: GovernanceBoundSnapshot;
}
export declare function recoverGovernanceExecutionAuthority(request: {
    readonly workflowInstanceId: string;
    readonly store: DurableExecutionStore;
    readonly packageCdiAuthority: ExactPackageCdiAuthority;
    readonly baselines: GovernanceBaselineStore;
    readonly sha256: Sha256Port;
}): Promise<RecoveredGovernanceExecutionAuthority>;
//# sourceMappingURL=execution-binding.d.ts.map