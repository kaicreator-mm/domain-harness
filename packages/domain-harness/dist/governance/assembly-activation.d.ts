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
 * T002D (#655, repaired #688) extends the SAME pin additively with the
 * runtime authority class (PRODUCTION | SIMULATION): every activation through
 * this v0.7 class-bearing path MUST supply the exact canonical class up front
 * (typed fail-closed on a missing or malformed class, synchronously before
 * any currentness proof or durable bind - never defaulted, inferred or
 * upgraded). The class is synchronously snapshotted, woven into the pin
 * digest and replayed exactly: class-bearing replay/recovery verifies and
 * preserves the exact pinned historical class unconditionally (a caller
 * expectation is only an additional assertion), a SIMULATION-class pin can
 * never satisfy production effect/publication authority, and cross-class
 * substitution fails closed. Legacy class-less pins are historical/
 * compatibility evidence only - they keep byte-identical digests and remain
 * replayable as history, but they can never be newly minted through this
 * activation path nor re-issued as v0.7 activation/currentness authority.
 * No second pin, currentness or effect-authority plane is introduced.
 *
 * T005C (#656) extends the SAME pin additively with the exact stable
 * NON-SECRET resource-instance/currentness evidence: the activation request
 * may carry, per behaviorally relevant resource occurrence, the evidence
 * produced/validated by the accepted T005B resource seam (`resolveToolResources`
 * currentness pins - exact provider/resource identity + exact revision/
 * currentness digest; this layer never re-owns provider selection/resolution).
 * The evidence is synchronously validated, order-normalized and snapshotted
 * before any await, woven into the pin digest, and enforced as coverage: a
 * REQUIRED component-scope requirement of the sealed Assembly fails typed
 * (`RESOURCE_CURRENTNESS_PIN_REQUIRED`) before any durable bind when no
 * stable non-secret pin was supplied - hashing/serializing live values is
 * forbidden, so a provider that cannot produce an exact pin fails closed;
 * evidence outside the exact sealed Assembly requirement material fails typed
 * (`INVALID_RESOURCE_CURRENTNESS`); an OPTIONAL requirement stays outside
 * exact occurrence currentness exactly when the owning declaration's explicit
 * `required: false` posture permits and no pin is supplied (an optional pin
 * that IS supplied participates in currentness). Replay/recovery verifies the
 * exact pinned evidence and accepts an additional caller expectation only as
 * an assertion; a resource revision/provider replacement therefore invalidates
 * the affected occurrence's currentness truthfully while Definition identity
 * and the sealed logical `resourceRequirements` stay untouched. There is no
 * third resource registry/currentness hierarchy and no
 * latest/default/first/order fallback.
 *
 * Boundary discipline (inward only): consumes the T002B sealed-Assembly port
 * (`runtime-assembly.ts`), the #555 repaired Definition graph digest seam, the
 * T005B-validated evidence material (types only), and the existing
 * execution-binding authority. No concrete Workflow/XState, ToolRegistry,
 * storage or provider import is permitted here.
 */
import { type DefinitionGraphEnvelope } from '../contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../contracts/identity.js';
import type { ResourceCurrentnessEvidence } from '../contracts/resource-resolution.js';
import { type SealedRuntimeAssembly } from '../contracts/runtime-assembly.js';
import type { GovernanceBaselineBody, GovernanceBaselineStore } from './contracts.js';
import { type DomainActivationBinding, type DurableExecutionStore, type ExactPackageCdiAuthority, type GovernanceBoundSnapshot, type GovernanceExecutionPin, type RuntimeAuthorityClass } from './execution-binding.js';
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
    /**
     * T002D (#655, repaired #688): the exact canonical runtime authority class
     * to activate under. REQUIRED on this v0.7 class-bearing activation path: a
     * missing or malformed class fails typed (`AUTHORITY_CLASS_FORBIDDEN`)
     * synchronously before any currentness proof or durable bind. The class is
     * synchronously snapshotted and woven into the pin digest, so it becomes
     * immutable activation/currentness evidence. It is never defaulted,
     * inferred or upgraded (legacy class-less pins are historical evidence
     * only and cannot be minted through this path).
     */
    readonly authorityClass: RuntimeAuthorityClass;
    /**
     * T005C (#656): the exact stable NON-SECRET resource-instance/currentness
     * evidence for this occurrence, produced/validated by the accepted T005B
     * resource seam (`resolveToolResources` currentness pins) and re-validated +
     * order-normalized here synchronously before any await. Optional at the
     * type level, but ENFORCED as coverage: every REQUIRED component-scope
     * requirement of the sealed Assembly must carry exactly one evidence entry,
     * or activation fails typed (`RESOURCE_CURRENTNESS_PIN_REQUIRED`) before
     * any durable bind; evidence outside the exact sealed Assembly requirement
     * material fails typed (`INVALID_RESOURCE_CURRENTNESS`). An OPTIONAL
     * requirement needs no evidence (the owning declaration's explicit
     * `required: false` posture permits that), and an optional pin that is
     * supplied participates in the occurrence currentness. There is no
     * default/fallback pin: a provider that cannot produce a stable non-secret
     * pin fails closed rather than having live values hashed or serialized.
     */
    readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
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
     * v0.7 activation gate: returns only after the exact assembly-bound,
     * class-bearing pin is already durable. A durable pin that carries no exact
     * `assemblyDigest` (a pre-T002C legacy pin) fails closed here - there is no
     * silent fallback to non-assembly authority. A durable pin that carries no
     * exact canonical `authorityClass` (a pre-T002D legacy pin) also fails
     * closed here (T002D repaired #688): legacy class-less pins are historical/
     * compatibility evidence only and can never be re-issued as v0.7
     * activation/currentness authority.
     */
    requireActivatedExecution(workflowInstanceId: string): Promise<GovernanceExecutionPin>;
    /**
     * T002D (#655) production effect/publication gate on the SAME pin hierarchy:
     * durable production authoritative occurrence, durable business
     * effect/publication and production journal authority are satisfied only by
     * a pin carrying the exact `PRODUCTION` authority class. A SIMULATION-class
     * pin may execute/observe under simulation semantics, but it can never mint
     * production effect authority (fail closed BEFORE any effect/publication).
     * A legacy class-less pin is never silently treated as production either.
     */
    requireProductionEffectAuthority(workflowInstanceId: string): Promise<GovernanceExecutionPin>;
    /**
     * T005C (#656) occurrence-currentness gate on the SAME pin hierarchy: given
     * the FRESH resource-currentness evidence of a new exact resolution, returns
     * only when it exactly equals the evidence durably pinned for the occurrence.
     * A resource revision/provider replacement therefore invalidates the
     * affected occurrence's activation/execution currentness truthfully, and a
     * pin that carries no evidence can never satisfy an expectation — no
     * default/fallback, no latest/first/order selection, and no hybrid evidence
     * (the fresh material is validated and order-normalized before the durable
     * pin is read, so a caller mutating its own array mid-await cannot help).
     */
    requireResourceCurrentness(workflowInstanceId: string, expectedResourceCurrentness: readonly ResourceCurrentnessEvidence[]): Promise<GovernanceExecutionPin>;
    /**
     * Replay/recovery: resolves the SAME exact Assembly identity the occurrence
     * was pinned under, never a mutable provider alias. Package/CDI and
     * Governance Baseline currentness are re-proven by the existing recovery
     * seam; the recovered pin's `assemblyDigest` must be present and exact, and
     * when an `expectedAssembly` is supplied it must match exactly (a replaced
     * Assembly is never an acceptable replay target for an old pin).
     *
     * T002D (#655, repaired #688): class currentness is enforced
     * UNCONDITIONALLY for class-bearing history. The exact pinned historical
     * class is verified as canonical on every replay (in addition to being
     * proven by the digest evidence) and is preserved verbatim in the recovered
     * authority; a caller `expectedAuthorityClass` is only an ADDITIONAL
     * assertion on top - omitting it can never bypass class currentness, and
     * cross-class substitution fails closed. A legacy class-less pin (no
     * `authorityClass` woven into its digest) replays as historical/
     * compatibility evidence only: it can never gain or upgrade to a class,
     * and any caller expectation fails closed against it.
     *
     * T005C (#656): the exact pinned resource-currentness evidence is verified
     * UNCONDITIONALLY for evidence-bearing history (it is woven into the pin
     * digest, so any durable tampering fails the digest proof first). A caller
     * `expectedResourceCurrentness` is only an ADDITIONAL assertion on top: a
     * stale, replaced or missing exact resource revision fails typed
     * (`RESOURCE_CURRENTNESS_MISMATCH`), and currentness can never be asserted
     * onto a pin that carries no evidence (no default/fallback, no
     * latest/first/order selection).
     */
    recover(request: {
        readonly workflowInstanceId: string;
        readonly expectedAssembly?: SealedRuntimeAssembly;
        readonly expectedAuthorityClass?: RuntimeAuthorityClass;
        readonly expectedResourceCurrentness?: readonly ResourceCurrentnessEvidence[];
    }): Promise<RecoveredAssemblyExecution>;
}
//# sourceMappingURL=assembly-activation.d.ts.map