import { type ContentDigest, type Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { ResourceCurrentnessEvidence } from '../contracts/resource-resolution.js';
import type { GovernanceBaselineAuthorityBinding, GovernanceBaselineBody, GovernanceBaselineStore, GovernancePackageCdiBinding } from './contracts.js';
/**
 * T002D (#655): runtime authority class of an activation/execution occurrence.
 * Belongs to the Assembly/activation/runtime authority plane, NOT Domain
 * Definition identity: the same Definition may back production and simulation
 * assemblies/activations, and no equal Definition identity or similar
 * implementation contents ever imply equal authority class. The class is
 * captured in the exact activation/currentness evidence (the pin digest) and
 * is immutable once pinned.
 */
export type RuntimeAuthorityClass = 'PRODUCTION' | 'SIMULATION';
export declare const PRODUCTION_AUTHORITY_CLASS: RuntimeAuthorityClass;
export declare const SIMULATION_AUTHORITY_CLASS: RuntimeAuthorityClass;
export type DomainActivationBinding = GovernanceBaselineAuthorityBinding;
export interface GovernanceExecutionPin extends DomainActivationBinding {
    readonly workflowTarget: string;
    readonly workflowInstanceId: string;
    readonly bindingDigest: string;
    /**
     * T002C (#617): the exact sealed Runtime Assembly digest this occurrence was
     * activated under. Optional at the type level so pre-T002C (legacy v0.3)
     * pins remain representable, but the v0.7 assembly-activation gate
     * (#617 `AssemblyExecutionActivator`) requires it and fails closed when it
     * is absent, stale, replaced or aliased. When present it is woven into
     * `bindingDigest`, so any Assembly change changes the pin currentness.
     * Never a Tool/Workflow-specific value - generic Assembly identity only.
     */
    readonly assemblyDigest?: ContentDigest;
    /**
     * T002D (#655): the runtime authority class this occurrence was activated
     * under. Optional at the type level so pre-T002D (legacy) pins remain
     * representable and keep their byte-identical legacy digests; when present
     * it is woven into `bindingDigest`, so the class is part of the exact
     * activation/currentness evidence and can never be mutated or substituted
     * after pinning. A SIMULATION-class pin can never satisfy production
     * authoritative occurrence, durable business effect/publication or
     * production journal authority.
     */
    readonly authorityClass?: RuntimeAuthorityClass;
    /**
     * T005C (#656): the exact stable NON-SECRET resource-instance/currentness
     * evidence this occurrence was activated under — one frozen, order-
     * normalized entry per resource occurrence whose exact runtime revision is
     * behaviorally relevant. Optional at the type level so pre-T005C (legacy)
     * pins remain representable and keep their byte-identical legacy digests;
     * when present every entry is woven into `bindingDigest`, so any resource
     * revision/provider replacement changes the occurrence's activation/
     * execution currentness. Entries carry exact identity/digest material only
     * (produced/validated by the T005B resource seam) — secret values,
     * credentials, live handles, connection objects, functions/module paths and
     * provider objects are structurally unrepresentable, and no second resource
     * registry/currentness hierarchy exists: this field IS the resource
     * currentness authority, on the ONE existing pin.
     */
    readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
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
export type GovernanceExecutionBindingErrorCode = 'INVALID_DOMAIN_ACTIVATION_BINDING' | 'MISSING_DOMAIN_ACTIVATION_BINDING' | 'FLOATING_EXECUTION_AUTHORITY_FORBIDDEN' | 'INVALID_GOVERNANCE_EXECUTION_PIN' | 'GOVERNANCE_EXECUTION_PIN_MISSING' | 'GOVERNANCE_EXECUTION_PIN_CONFLICT' | 'GOVERNANCE_EXECUTION_PIN_MISMATCH' | 'SNAPSHOT_BEFORE_GOVERNANCE_PIN' | 'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH' | 'PACKAGE_CDI_BINDING_MISMATCH' | 'PACKAGE_CDI_RECOVERY_MISMATCH' | 'GOVERNANCE_BASELINE_BINDING_MISMATCH' | 'GOVERNANCE_BASELINE_RECOVERY_MISMATCH' | 'ASSEMBLY_DIGEST_FORBIDDEN' | 'ASSEMBLY_NOT_SEALED' | 'MISSING_ASSEMBLY_DIGEST' | 'ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH' | 'ASSEMBLY_REPLAY_MISMATCH' | 'AUTHORITY_CLASS_FORBIDDEN' | 'AUTHORITY_CLASS_MISMATCH' | 'INVALID_RESOURCE_CURRENTNESS' | 'RESOURCE_CURRENTNESS_PIN_REQUIRED' | 'RESOURCE_CURRENTNESS_MISMATCH';
export declare class GovernanceExecutionBindingError extends Error {
    readonly code: GovernanceExecutionBindingErrorCode;
    constructor(code: GovernanceExecutionBindingErrorCode, message: string);
}
/**
 * T002C (#617): an Assembly digest bound into the execution pin must be an
 * exact, non-empty content digest - never a floating selector or a mutable
 * provider alias (`latest`/`current`/`active`/`alias:`/`@current`/...). The
 * exact sealed Assembly is content-addressed, so its digest is the only
 * acceptable identity; anything else fails closed.
 */
export declare function requireExactAssemblyDigest(value: unknown, field: string): ContentDigest;
/**
 * T002D (#655): a runtime authority class bound into the execution pin must be
 * exactly `PRODUCTION` or `SIMULATION` - never a floating selector, alias or
 * derived/implicit value. The class is an explicit activation-plane fact, not
 * derivable from Definition identity or implementation contents, and anything
 * else fails closed.
 */
export declare function requireRuntimeAuthorityClass(value: unknown, field: string): RuntimeAuthorityClass;
/**
 * T005C (#656): validate, order-normalize (componentId, then resourceKey) and
 * deep-freeze one occurrence's resource-currentness evidence. This is the
 * SINGLE normalizer for the material carried on `GovernanceExecutionPin
 * .resourceCurrentness`: the governance seam consumes ONLY stable non-secret
 * evidence produced/validated by the T005B resource seam, re-validates it
 * defensively here (durable pin material is untrusted store data), and never
 * invents, defaults or falls back to any evidence. Duplicate
 * (componentId, resourceKey) entries fail closed — never first-wins.
 */
export declare function normalizeResourceCurrentnessEvidence(value: readonly ResourceCurrentnessEvidence[] | undefined, field: string): readonly ResourceCurrentnessEvidence[] | undefined;
/**
 * T005C (#656): exact equality of two (already order-normalized) resource-
 * currentness evidence sets. `undefined` on both sides is equal; an evidence-
 * less pin can never equal a pin that carries evidence, and any per-entry
 * difference (provider, resource or exact revision digest) is a mismatch —
 * stale, replaced and missing evidence are all typed failures, never a
 * fallback.
 */
export declare function sameResourceCurrentnessEvidence(left: readonly ResourceCurrentnessEvidence[] | undefined, right: readonly ResourceCurrentnessEvidence[] | undefined): boolean;
export declare function cloneActivationBinding(binding: DomainActivationBinding): DomainActivationBinding;
export declare function assertDomainActivationBinding(binding: DomainActivationBinding): void;
export declare function requireExactPackageCdi(binding: DomainActivationBinding, authority: ExactPackageCdiAuthority, errorCode?: Extract<GovernanceExecutionBindingErrorCode, 'PACKAGE_CDI_BINDING_MISMATCH' | 'PACKAGE_CDI_RECOVERY_MISMATCH'>): Promise<GovernancePackageCdiBinding>;
export declare function requireExactGovernanceBody(binding: DomainActivationBinding, baselines: GovernanceBaselineStore, sha256: Sha256Port, errorCode?: Extract<GovernanceExecutionBindingErrorCode, 'GOVERNANCE_BASELINE_BINDING_MISMATCH' | 'GOVERNANCE_BASELINE_RECOVERY_MISMATCH'>): Promise<GovernanceBaselineBody>;
export declare class DomainActivationBindingCoordinator {
    #private;
    constructor(authority: DomainActivationAuthority, packageCdiAuthority: ExactPackageCdiAuthority, baselines: GovernanceBaselineStore, sha256: Sha256Port);
    publish(binding: DomainActivationBinding): Promise<DomainActivationBinding>;
    resolveForNewInstance(domainId: string): Promise<DomainActivationBinding>;
}
export declare function computeGovernanceExecutionBindingDigest(binding: DomainActivationBinding, sha256: Sha256Port, assemblyDigest?: ContentDigest, authorityClass?: RuntimeAuthorityClass, resourceCurrentness?: readonly ResourceCurrentnessEvidence[]): Promise<string>;
export declare function createGovernanceExecutionPin(request: {
    readonly workflowTarget: string;
    readonly workflowInstanceId: string;
    readonly binding: DomainActivationBinding;
    readonly assemblyDigest?: ContentDigest;
    readonly authorityClass?: RuntimeAuthorityClass;
    readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
}, sha256: Sha256Port): Promise<GovernanceExecutionPin>;
export declare function validateGovernanceExecutionPin(value: unknown, sha256: Sha256Port, expectedWorkflowInstanceId?: string): Promise<GovernanceExecutionPin>;
export declare class GovernanceExecutionCoordinator {
    #private;
    constructor(store: DurableExecutionStore, sha256: Sha256Port);
    pinExecution(request: {
        readonly workflowTarget: string;
        readonly workflowInstanceId: string;
        readonly binding: DomainActivationBinding;
        readonly assemblyDigest?: ContentDigest;
        readonly authorityClass?: RuntimeAuthorityClass;
        readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
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