/**
 * v0.7 T002C atomic activation/execution pin integration (issues #617, #589
 * PACK-B T002C; MICROKERNEL boundary class per #580/#581/#582).
 *
 * This module is the SOLE producer of the assembly activation/execution-pin
 * integration. It extends - never parallels - the existing authoritative
 * activation/occurrence authority of `execution-binding.ts`
 * (`GovernanceExecutionPin` / `DomainActivationBinding` /
 * `GovernanceExecutionCoordinator` / `DurableExecutionStore` /
 * `recoverGovernanceExecutionAuthority`), binding the exact sealed T002B
 * Assembly digest (#587 `SealedRuntimeAssembly.assemblyDigest`) into the
 * existing package/governance/currentness/runtime-occurrence tuple.
 *
 * Frozen invariants (#589 T002C):
 *  - all authority-bearing pin fields are synchronously snapshotted before
 *    any `await` (#617 torn-snapshot discipline): a caller mutating its own
 *    binding, Definition graph or Assembly reference mid-flight can never
 *    produce torn or hybrid activation authority;
 *  - activation is all-or-nothing: a missing/stale/replaced Definition graph,
 *    Assembly, package/CDI or Governance Baseline fails closed BEFORE any
 *    durable pin is bound (no partial authority);
 *  - replay/recovery resolves the same exact Assembly identity, never a
 *    mutable provider alias; an Assembly replacement never overwrites a
 *    pinned occurrence (bind-once);
 *  - a sealed Assembly alone is NOT activation authority - only this
 *    activation path mints an assembly-bound execution pin;
 *  - the pin carries no Tool/Workflow-specific semantics - only the generic
 *    content-addressed Assembly digest.
 *
 * Boundary discipline (inward only): consumes the T002B sealed-Assembly port
 * (`runtime-assembly.ts`), the #555 repaired Definition graph digest seam, and
 * the existing execution-binding authority. No concrete Workflow/XState,
 * ToolRegistry, storage or provider import is permitted here.
 */
import { type DefinitionGraphEnvelope } from '../contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../contracts/identity.js';
import { type SealedRuntimeAssembly } from '../contracts/runtime-assembly.js';
import type { GovernanceBaselineBody, GovernanceBaselineStore } from './contracts.js';
import { type DomainActivationBinding, type DurableExecutionStore, type ExactPackageCdiAuthority, type GovernanceBoundSnapshot, type GovernanceExecutionPin } from './execution-binding.js';
/** All-or-nothing assembly activation request for one runtime occurrence. */
export interface ActivateAssemblyExecutionRequest {
    /** Exact workflow target (runtime occurrence identity). */
    readonly workflowTarget: string;
    /** Exact workflow instance id (runtime occurrence identity). */
    readonly workflowInstanceId: string;
    /** The exact package/governance/currentness tuple to activate under. */
    readonly binding: DomainActivationBinding;
    /** The sealed T002B Assembly (anti-forgery minted) to bind into the pin. */
    readonly assembly: SealedRuntimeAssembly;
    /** The live Definition graph the Assembly currentness is proven against. */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
}
/** Exact assembly-bound execution authority recovered for replay/recovery. */
export interface RecoveredAssemblyExecution {
    readonly pin: GovernanceExecutionPin;
    /** The exact sealed Assembly identity the occurrence was pinned under. */
    readonly assemblyDigest: ContentDigest;
    readonly governanceBaseline: GovernanceBaselineBody;
    readonly snapshot?: GovernanceBoundSnapshot;
}
/**
 * Atomic assembly activation authority. Reuses the ONE existing
 * `DurableExecutionStore` and `GovernanceExecutionPin` shape - it creates no
 * second pin hierarchy, store or effect authority (#537, #582 finding 10).
 */
export declare class AssemblyExecutionActivator {
    #private;
    constructor(store: DurableExecutionStore, packageCdiAuthority: ExactPackageCdiAuthority, baselines: GovernanceBaselineStore, sha256: Sha256Port);
    /**
     * Atomically activate one runtime occurrence under an exact sealed Assembly.
     *
     * Torn-snapshot discipline (#617): every authority-bearing field is read,
     * validated and snapshotted synchronously in PHASE 1 BEFORE the first
     * `await`; after any suspension only module-owned snapshot material is
     * read, so caller mutation mid-flight cannot produce hybrid authority.
     *
     * All-or-nothing: Definition currentness, package/CDI currentness and
     * Governance Baseline currentness are each proven BEFORE the durable
     * bind-once; any failure leaves the store untouched (fail closed, never a
     * partial pin).
     */
    activate(request: ActivateAssemblyExecutionRequest): Promise<GovernanceExecutionPin>;
    /**
     * v0.7 activation gate: returns only after the exact assembly-bound pin is
     * already durable. A durable pin that carries no exact `assemblyDigest`
     * (a pre-T002C legacy pin) fails closed here - there is no silent fallback
     * to non-assembly authority.
     */
    requireActivatedExecution(workflowInstanceId: string): Promise<GovernanceExecutionPin>;
    /**
     * Replay/recovery: resolves the SAME exact Assembly identity the occurrence
     * was pinned under, never a mutable provider alias. Package/CDI and
     * Governance Baseline currentness are re-proven by the existing recovery
     * seam; the recovered pin's `assemblyDigest` must be present and exact, and
     * when an `expectedAssembly` is supplied it must match exactly (a replaced
     * Assembly is never an acceptable replay target for an old pin).
     */
    recover(request: {
        readonly workflowInstanceId: string;
        readonly expectedAssembly?: SealedRuntimeAssembly;
    }): Promise<RecoveredAssemblyExecution>;
}
//# sourceMappingURL=assembly-activation.d.ts.map