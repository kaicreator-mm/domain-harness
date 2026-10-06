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
import { computeDefinitionGraphDigest, validateDefinitionGraphEnvelope, } from '../contracts/definition-graph.js';
import { isSealedRuntimeAssembly, } from '../contracts/runtime-assembly.js';
import { GovernanceExecutionBindingError, assertDomainActivationBinding, cloneActivationBinding, createGovernanceExecutionPin, normalizeResourceCurrentnessEvidence, recoverGovernanceExecutionAuthority, requireExactAssemblyDigest, requireExactGovernanceBody, requireExactPackageCdi, requireRuntimeAuthorityClass, sameResourceCurrentnessEvidence, validateGovernanceExecutionPin, } from './execution-binding.js';
function fail(code, message) {
    throw new GovernanceExecutionBindingError(code, message);
}
function requireNonEmptyString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        fail('INVALID_DOMAIN_ACTIVATION_BINDING', `${field} must be a non-empty string`);
    }
    return value;
}
/**
 * T005C (#656) resource-currentness coverage gate, proven synchronously
 * against the deeply frozen sealed Assembly record (torn-safe - the record is
 * immutable at mint time). Exact coverage, never a registry:
 *  - every supplied evidence entry must correspond to exactly one requirement
 *    of the sealed Assembly (any criticality, any scope) - evidence outside
 *    the exact sealed material fails typed (`INVALID_RESOURCE_CURRENTNESS`);
 *  - every REQUIRED component-scope requirement (no `operationId`) must carry
 *    exactly one evidence entry, or the gate fails typed
 *    (`RESOURCE_CURRENTNESS_PIN_REQUIRED`) before any durable bind - there is
 *    no default/fallback pin and live values are never hashed or serialized;
 *  - an OPTIONAL requirement (explicit `required: false` posture of the
 *    owning declaration) may stay outside occurrence currentness when no pin
 *    is supplied; operation-scoped requirements are pinned exactly when the
 *    host supplies their operation resolution evidence.
 */
function requireResourceCurrentnessCoverage(record, evidence) {
    const requiredKeys = new Set();
    const knownKeys = new Set();
    for (const material of record.resourceRequirements) {
        for (const requirement of material.requirements) {
            const key = `${material.componentId}\u0000${requirement.resourceKey}`;
            knownKeys.add(key);
            if (requirement.required && requirement.operationId === undefined) {
                requiredKeys.add(key);
            }
        }
    }
    for (const entry of evidence) {
        const key = `${entry.componentId}\u0000${entry.resourceKey}`;
        if (!knownKeys.has(key)) {
            fail('INVALID_RESOURCE_CURRENTNESS', `resource-currentness evidence for component "${entry.componentId}" resource "${entry.resourceKey}" does not correspond to any requirement of the exact sealed Assembly; evidence outside the sealed Assembly material fails closed and no parallel resource identity/registry exists`);
        }
    }
    for (const key of requiredKeys) {
        if (!evidence.some((entry) => `${entry.componentId}\u0000${entry.resourceKey}` === key)) {
            const separatorIndex = key.indexOf('\u0000');
            const componentId = key.slice(0, separatorIndex);
            const resourceKey = key.slice(separatorIndex + 1);
            fail('RESOURCE_CURRENTNESS_PIN_REQUIRED', `the sealed Assembly requires resource "${resourceKey}" of component "${componentId}" and its exact runtime revision/currentness is behaviorally relevant for this occurrence, but no stable non-secret resource-currentness evidence was supplied; activation fails closed before any durable bind (hashing or serializing live values is forbidden - the T005B resource seam must produce an exact pin)`);
        }
    }
}
/**
 * Atomic assembly activation authority. Reuses the ONE existing
 * `DurableExecutionStore` and `GovernanceExecutionPin` shape - it creates no
 * second pin hierarchy, store or effect authority (#537, #582 finding 10).
 */
export class AssemblyExecutionActivator {
    #store;
    #packageCdiAuthority;
    #baselines;
    #sha256;
    constructor(store, packageCdiAuthority, baselines, sha256) {
        this.#store = store;
        this.#packageCdiAuthority = packageCdiAuthority;
        this.#baselines = baselines;
        this.#sha256 = sha256;
    }
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
    async activate(request) {
        // ---- PHASE 1 (synchronous): read, validate and snapshot all authority material.
        if (typeof request !== 'object' || request === null) {
            fail('INVALID_DOMAIN_ACTIVATION_BINDING', 'assembly activation request must be an object');
        }
        const workflowTarget = requireNonEmptyString(request.workflowTarget, 'workflowTarget');
        const workflowInstanceId = requireNonEmptyString(request.workflowInstanceId, 'workflowInstanceId');
        const bindingInput = request.binding;
        const assemblyInput = request.assembly;
        const graphInput = request.currentDefinitionGraph;
        assertDomainActivationBinding(bindingInput);
        const binding = cloneActivationBinding(bindingInput);
        // Anti-forgery (#587/#575): only a genuine sealed Assembly minted by
        // sealRuntimeAssembly can authorize activation; a caller-constructed
        // object never carries the module-private mint registry membership.
        if (!isSealedRuntimeAssembly(assemblyInput)) {
            fail('ASSEMBLY_NOT_SEALED', 'assembly activation requires a SealedRuntimeAssembly minted by sealRuntimeAssembly; a caller-constructed assembly can never carry the sealed-Assembly brand');
        }
        const assemblyDigest = requireExactAssemblyDigest(assemblyInput.assemblyDigest, 'assembly.assemblyDigest');
        // T002D (#655, repaired #688): this v0.7 class-bearing activation path
        // requires the exact canonical authority class up front. A missing or
        // malformed class fails typed (`AUTHORITY_CLASS_FORBIDDEN`) here,
        // synchronously before any await, currentness proof or durable bind -
        // never defaulted, inferred or upgraded to PRODUCTION. The snapshot uses
        // the same torn-snapshot discipline as the Assembly digest (#617).
        const authorityClass = requireRuntimeAuthorityClass(request.authorityClass, 'authorityClass');
        // The sealed Assembly is deeply frozen at mint time, so its record digest
        // is already immutable; capture it synchronously as snapshot material.
        const assemblyDefinitionGraphDigest = assemblyInput.record.definitionGraphDigest;
        // T005C (#656): the resource-currentness evidence is validated,
        // order-normalized and frozen synchronously (same torn-snapshot
        // discipline as the Assembly digest and authority class), and its
        // coverage is proven synchronously against the deeply frozen sealed
        // record - no await has happened, so no torn or hybrid resource
        // currentness can ever participate. A REQUIRED component-scope
        // requirement without a stable non-secret pin, or evidence outside the
        // exact sealed Assembly material, fails closed HERE, before any
        // currentness proof or durable bind.
        const resourceCurrentness = normalizeResourceCurrentnessEvidence(request.resourceCurrentness, 'resourceCurrentness');
        requireResourceCurrentnessCoverage(assemblyInput.record, resourceCurrentness ?? []);
        // Synchronous descriptor-safe graph validation (the #555 seam snapshots
        // the admitted graph internally before its first await, so the digest in
        // PHASE 2 is torn-safe).
        validateDefinitionGraphEnvelope(graphInput);
        // ---- PHASE 2 (async): currentness proofs + atomic bind-once. No caller-owned re-read.
        const currentDigest = await computeDefinitionGraphDigest(graphInput, this.#sha256);
        if (currentDigest !== assemblyDefinitionGraphDigest) {
            fail('ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH', 'the current Definition graph digest does not match the exact digest the sealed Assembly was bound to; a stale or replaced Definition fails closed before any pin is bound');
        }
        await requireExactPackageCdi(binding, this.#packageCdiAuthority, 'PACKAGE_CDI_BINDING_MISMATCH');
        await requireExactGovernanceBody(binding, this.#baselines, this.#sha256, 'GOVERNANCE_BASELINE_BINDING_MISMATCH');
        const pin = await createGovernanceExecutionPin({
            workflowTarget,
            workflowInstanceId,
            binding,
            assemblyDigest,
            authorityClass,
            // T005C (#656): the exact, synchronously normalized evidence snapshot
            // is woven into the pin digest — never a caller-owned re-read.
            ...(resourceCurrentness === undefined ? {} : { resourceCurrentness }),
        }, this.#sha256);
        const disposition = await this.#store.bindGovernanceExecutionPin(pin);
        if (disposition === 'conflict') {
            fail('GOVERNANCE_EXECUTION_PIN_CONFLICT', `workflow instance ${pin.workflowInstanceId} is already bound to different execution authority; an Assembly replacement can never overwrite a pinned occurrence`);
        }
        return this.requireActivatedExecution(workflowInstanceId);
    }
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
    async requireActivatedExecution(workflowInstanceId) {
        const id = requireNonEmptyString(workflowInstanceId, 'workflowInstanceId');
        const raw = await this.#store.getGovernanceExecutionPin(id);
        if (raw === undefined || raw === null) {
            fail('GOVERNANCE_EXECUTION_PIN_MISSING', `workflow instance ${id} has no durable GovernanceExecutionPin; a sealed Assembly alone is not activation authority`);
        }
        const pin = await validateGovernanceExecutionPin(raw, this.#sha256, id);
        if (pin.assemblyDigest === undefined) {
            fail('MISSING_ASSEMBLY_DIGEST', `the durable pin for ${id} carries no exact assemblyDigest; the v0.7 assembly-activation gate requires the exact sealed Assembly identity (no silent fallback)`);
        }
        if (pin.authorityClass === undefined) {
            fail('AUTHORITY_CLASS_FORBIDDEN', `the durable pin for ${id} carries no authorityClass; the v0.7 activation/currentness gate requires an explicit canonical PRODUCTION|SIMULATION class, and a legacy class-less pin is historical/compatibility evidence only (never re-issued as v0.7 activation authority, never upgraded to PRODUCTION)`);
        }
        requireRuntimeAuthorityClass(pin.authorityClass, 'pin.authorityClass');
        return pin;
    }
    /**
     * T002D (#655) production effect/publication gate on the SAME pin hierarchy:
     * durable production authoritative occurrence, durable business
     * effect/publication and production journal authority are satisfied only by
     * a pin carrying the exact `PRODUCTION` authority class. A SIMULATION-class
     * pin may execute/observe under simulation semantics, but it can never mint
     * production effect authority (fail closed BEFORE any effect/publication).
     * A legacy class-less pin is never silently treated as production either.
     */
    async requireProductionEffectAuthority(workflowInstanceId) {
        const pin = await this.requireActivatedExecution(workflowInstanceId);
        if (pin.authorityClass !== 'PRODUCTION') {
            fail('AUTHORITY_CLASS_MISMATCH', `workflow instance ${pin.workflowInstanceId} is pinned under authority class ${JSON.stringify(pin.authorityClass ?? null)}; only an exact PRODUCTION-class pin can satisfy production effect/publication authority, and no implicit or simulated class may be substituted`);
        }
        return pin;
    }
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
    async requireResourceCurrentness(workflowInstanceId, expectedResourceCurrentness) {
        const expected = normalizeResourceCurrentnessEvidence(expectedResourceCurrentness, 'expectedResourceCurrentness');
        const pin = await this.requireActivatedExecution(workflowInstanceId);
        if (!sameResourceCurrentnessEvidence(pin.resourceCurrentness, expected)) {
            fail('RESOURCE_CURRENTNESS_MISMATCH', `the fresh resource-currentness evidence does not exactly match the evidence pinned for ${workflowInstanceId}; a stale, replaced or missing exact resource revision fails closed before the affected execution/effect`);
        }
        return pin;
    }
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
    async recover(request) {
        const workflowInstanceId = requireNonEmptyString(request.workflowInstanceId, 'workflowInstanceId');
        const expectedAssembly = request.expectedAssembly;
        if (expectedAssembly !== undefined && !isSealedRuntimeAssembly(expectedAssembly)) {
            fail('ASSEMBLY_NOT_SEALED', 'expectedAssembly must be a SealedRuntimeAssembly minted by sealRuntimeAssembly');
        }
        const expectedAuthorityClass = request.expectedAuthorityClass;
        if (expectedAuthorityClass !== undefined) {
            requireRuntimeAuthorityClass(expectedAuthorityClass, 'expectedAuthorityClass');
        }
        // T005C (#656): the caller expectation is validated and order-normalized
        // synchronously, before any await — same torn-snapshot discipline.
        const expectedResourceCurrentness = normalizeResourceCurrentnessEvidence(request.expectedResourceCurrentness, 'expectedResourceCurrentness');
        const recovered = await recoverGovernanceExecutionAuthority({
            workflowInstanceId,
            store: this.#store,
            packageCdiAuthority: this.#packageCdiAuthority,
            baselines: this.#baselines,
            sha256: this.#sha256,
        });
        const pin = recovered.pin;
        if (pin.assemblyDigest === undefined) {
            fail('MISSING_ASSEMBLY_DIGEST', `cannot replay ${workflowInstanceId}: the durable pin carries no exact assemblyDigest; v0.7 replay resolves the exact sealed Assembly identity, never a mutable alias`);
        }
        requireExactAssemblyDigest(pin.assemblyDigest, 'recovered pin assemblyDigest');
        if (expectedAssembly !== undefined && expectedAssembly.assemblyDigest !== pin.assemblyDigest) {
            fail('ASSEMBLY_REPLAY_MISMATCH', `replay Assembly ${expectedAssembly.assemblyDigest} does not match the exact assemblyDigest pinned for ${workflowInstanceId}; a replaced Assembly cannot satisfy an old pin`);
        }
        // T002D repaired (#688): unconditional class currentness for class-bearing
        // history. The pinned class is re-asserted canonical on EVERY replay (the
        // digest proof above already fails any rewrite of the class evidence);
        // the caller expectation below is only an additional assertion, never the
        // sole enforcement mechanism.
        if (pin.authorityClass !== undefined) {
            requireRuntimeAuthorityClass(pin.authorityClass, 'recovered pin authorityClass');
        }
        if (expectedAuthorityClass !== undefined && pin.authorityClass !== expectedAuthorityClass) {
            fail('AUTHORITY_CLASS_MISMATCH', `replay authority class ${JSON.stringify(expectedAuthorityClass)} does not match the class pinned for ${workflowInstanceId} (${JSON.stringify(pin.authorityClass ?? null)}); cross-class substitution fails closed and replay preserves the exact pinned class (a legacy class-less pin can never gain a class)`);
        }
        // T005C (#656): the caller resource-currentness expectation is only an
        // ADDITIONAL assertion on top of the unconditional digest proof — a pin
        // that carries no evidence can never satisfy an expectation, and any
        // stale/replaced/missing exact revision fails typed (no fallback).
        if (expectedResourceCurrentness !== undefined
            && !sameResourceCurrentnessEvidence(pin.resourceCurrentness, expectedResourceCurrentness)) {
            fail('RESOURCE_CURRENTNESS_MISMATCH', `replay resource-currentness evidence does not exactly match the evidence pinned for ${workflowInstanceId}; a stale, replaced or missing exact resource revision fails closed, and currentness can never be asserted onto a pin that carries none (no default/fallback, no latest/first/order selection)`);
        }
        return Object.freeze({
            pin,
            assemblyDigest: pin.assemblyDigest,
            governanceBaseline: recovered.governanceBaseline,
            ...(recovered.snapshot === undefined ? {} : { snapshot: recovered.snapshot }),
        });
    }
}
//# sourceMappingURL=assembly-activation.js.map