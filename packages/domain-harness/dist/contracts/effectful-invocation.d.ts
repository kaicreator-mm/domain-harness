/**
 * v0.7 effectful Tool invocation path — authoritative occurrence / Central
 * Admission composition (issue #874, fine-grained DAG T004C; authority #589
 * PACK-C T004C section + #672 readiness VERDICT=READY_CURRENT).
 *
 * This module is the Microkernel seam that routes ONE effectful Tool
 * invocation (an operation whose frozen L2 effect class is `idempotent` or
 * `non-idempotent`) onto an ALREADY-AUTHORITATIVE Domain/Workflow occurrence
 * through the EXISTING Central Admission effect path. It owns exactly the
 * composition concerns PACK-C assigns to T004C — and nothing else:
 *
 * - OCCURRENCE ANCHOR: every effectful Tool invocation binds to an
 *   already-authoritative occurrence. The occurrence identity is carried by
 *   the admission turn material itself (`admissionRequest.target` +
 *   `.workflowInstanceId` + `.turn`); this module never mints an occurrence,
 *   a turn id, an effect id or a pin. The identity material is descriptor-
 *   safely snapshotted synchronously before the first `await` and the
 *   admission request is reconstructed over the module-owned snapshot, so a
 *   caller mutating its own turn material mid-flight can never redirect the
 *   effect to a fresh occurrence/effect namespace;
 * - ONE EFFECT AUTHORITY: the existing Central Admission
 *   (`admitCentralDecision` + the existing `AdmissionDurableEffectJournal`
 *   port) is the ONLY public effect-admission and durable-effect/journal
 *   path. This module introduces no second runtime, journal, idempotency
 *   namespace, retry authority, effect registry or caller-supplied
 *   authorization verdict: the caller cannot even express an effect-tools
 *   port — the module installs the ONLY adapter, and that adapter dispatches
 *   ONLY the already-verified exact T003C binding handle (no independent
 *   implementation selection exists anywhere in this file);
 * - RE-PROOF, NEVER TRUST: the exact request/currentness is re-proven
 *   against the SAME genuine final sealed Assembly and current Definition
 *   through the accepted T004A seam (`admitToolInvocationRequest` — its typed
 *   failures propagate unchanged), whose dispatch anchor is the binding's own
 *   successor Assembly proven by the directly consumed T002B mint verifier
 *   (`isSealedRuntimeAssembly` — a self-consistent forgery fails
 *   ASSEMBLY_PROVENANCE_UNVERIFIED before any admission work). Caller claims
 *   are provenance only;
 * - EXACT BINDING: the accepted shared T003C consumer verifier
 *   (`verifyToolImplementationBinding`) is consumed against that SAME final
 *   Assembly BEFORE the opaque implementation handle is paired and exposed.
 *   No latest/default/range/registry-order/first-wins implementation
 *   selection exists. The verified material must agree with the re-admitted
 *   request on Tool Component, bound operation set, Definition graph digest
 *   AND final Assembly digest, else the invocation fails closed
 *   (INVALID_BINDING_EVIDENCE) before any effect;
 * - OCCURRENCE PIN GATES: the SAME occurrence must satisfy the accepted
 *   T002C/T002D/T005C gates on the injected `AssemblyExecutionActivator`:
 *   `requireProductionEffectAuthority` proves the durable, assembly-bearing,
 *   exact-`PRODUCTION`-class pin (SIMULATION, legacy class-less, unknown or
 *   malformed authority can never be upgraded — typed failures propagate
 *   unchanged), and this module additionally proves that the pinned
 *   occurrence is bound to the SAME final sealed Assembly as the admitted
 *   invocation (`OCCURRENCE_ASSEMBLY_MISMATCH` — a replaced Assembly never
 *   rides a pin bound to its predecessor; activation stays bind-once);
 * - RESOURCES/CURRENTNESS: required resources resolve ONLY through the
 *   accepted T005B seam (`resolveToolResources`) before dispatch; the fresh
 *   T005C resource-currentness pins are re-proven against the SAME occurrence
 *   pin through `requireResourceCurrentness`, so a missing/stale/replaced/
 *   ambiguous required currentness fails closed BEFORE the side effect;
 * - EFFECT CLASS GATE: an operation classified `none` never enters this path
 *   (T004B owns the effect=none path) — it fails
 *   EFFECTLESS_OPERATION_REJECTED before any dispatch and before any journal
 *   record;
 * - INTENT CLOSURE: the effect executed by Central Admission must realize
 *   exactly the admitted invocation: the adapter dispatches the admitted
 *   operation with the journaled intent input ONLY when it is exactly the
 *   re-admitted request input on the snapshotted occurrence target, else the
 *   typed EFFECT_INTENT_MISMATCH fails closed (the existing admission owner
 *   semantics then handle the begun record — never this module);
 * - PRESERVED OWNER SEMANTICS: durable effect identity, begin/complete,
 *   duplicate/idempotency, replay and recovery behavior stay ENTIRELY with
 *   the existing Central Admission effect execution (`executeEffectIntents`)
 *   and journal. This module never touches a journal record directly; when an
 *   effect may have happened and the durable outcome is unknown, the existing
 *   ambiguous/unknown-outcome posture stands — uncertainty is never converted
 *   into an unsafe automatic retry;
 * - AUDIT WITHOUT SECRETS: exact implementation/currentness auditability is
 *   derived from the exact pinned Assembly + the accepted T003C binding
 *   verification and returned as identity material only; live handles,
 *   functions and secrets never enter durable identity, evidence or
 *   diagnostics.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive of `record-safety.ts` (#557 + #578), the T004A request-admission
 * seam, the T002B mint verifier, the T003C binding verification seam, the
 * T005B resource-resolution seam, the T002C/T002D/T005C activation gates and
 * the Central Admission seam (all consumed directly; their typed failures
 * propagate unchanged). No concrete Workflow/XState/ToolRegistry/SQLite/
 * Agent/UX/AI/HTTP/Search/Storage/node import is permitted in this file, and
 * no public barrel exposes it.
 */
import type { ComponentId } from './component.js';
import type { DefinitionGraphEnvelope } from './definition-graph.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
import type { JsonValue } from './json.js';
import { type AdmittedToolInvocationRequest } from './invocation-request.js';
import { type ResolvedResourceEntry, type ResourceProvider } from './resource-resolution.js';
import { type SealedToolImplementationBinding, type ToolImplementationIdentity } from './tool-implementation-binding.js';
import type { AdmissionDurableEffectJournal, CentralAdmissionOutcome, CentralAdmissionRequest } from '../admission/contracts.js';
import type { GovernanceBaselineStore } from '../governance/contracts.js';
import type { GovernanceExecutionCoordinator, RuntimeAuthorityClass } from '../governance/execution-binding.js';
import type { AssemblyExecutionActivator } from '../governance/assembly-activation.js';
import type { ToolEffectSemantics } from '../v2/contracts/package.js';
/**
 * Fail-closed effectful invocation failure taxonomy (PACK-C T004C). Only the
 * composition concerns THIS module owns appear here: every owner-seam failure
 * (T004A request admission, T003C binding verification, T005B resolution, the
 * T002C/T002D/T005C occurrence gates and Central Admission itself) propagates
 * UNCHANGED and is deliberately absent. No diagnostic ever serializes
 * implementation handles, secret values or live objects (only exact identity
 * strings participate).
 */
export type EffectfulInvocationErrorCode = 'INVALID_INVOCATION_INPUT' | 'INVALID_TOOL_DISPATCH_PORT' | 'INVALID_BINDING_EVIDENCE' | 'ASSEMBLY_PROVENANCE_UNVERIFIED' | 'EFFECTLESS_OPERATION_REJECTED' | 'OCCURRENCE_ASSEMBLY_MISMATCH' | 'MISSING_RESOURCE_PROVIDER' | 'EFFECT_INTENT_MISMATCH';
export declare class EffectfulInvocationError extends Error {
    readonly code: EffectfulInvocationErrorCode;
    constructor(code: EffectfulInvocationErrorCode, message: string);
}
/**
 * The Central Admission ports the caller supplies — WITHOUT the effect-tools
 * port. The effect-tools port is not caller-expressible: this module installs
 * the only adapter, and that adapter dispatches only the already-verified
 * exact T003C binding (no independent implementation selection can be
 * injected by any caller plane).
 */
export interface EffectfulAdmissionPorts {
    /** T-014 gate; the exact durable pin is required for EVERY admission. */
    readonly governance: GovernanceExecutionCoordinator;
    readonly baselines: GovernanceBaselineStore;
    /** The existing durable effect journal — the ONE effect authority. */
    readonly effectJournal: AdmissionDurableEffectJournal;
}
/**
 * ONE generic dispatch query: the opaque implementation handle paired by the
 * T003C sealed binding (exposed only after full verification), the admitted
 * exact operation, the journaled input snapshot, the T005B-resolved resource
 * entries and the durable effect identity context derived by the existing
 * Central Admission path. No caller context and no authority material is
 * representable here.
 */
export interface EffectfulToolDispatchQuery {
    /** Opaque runtime handle paired with the exact pin OUTSIDE digest material. */
    readonly handle: unknown;
    /** The admitted exact operation identity. */
    readonly operationId: string;
    /** The journaled effect input (exactly the admitted invocation input). */
    readonly input: JsonValue;
    /** T005B-resolved entries keyed by exact resourceKey (empty when none apply). */
    readonly resources: ReadonlyMap<string, ResolvedResourceEntry>;
    /** The durable effect identity derived by Central Admission. */
    readonly effectId: string;
    readonly durableControlTurnId: string;
    readonly operationOrdinal: number;
    readonly effectType: string;
    readonly idempotencyKey?: string;
    readonly logicalTime: string;
}
/**
 * Generic injected HOST_INTEGRATION port for the effectful Tool calling
 * convention: the host knows how to invoke its own opaque handles. `dispatch`
 * may be async; a throw/rejection is the Tool's own failure and propagates
 * through the existing admission owner semantics — this module never catches,
 * wraps or converts it into an outcome.
 */
export interface EffectfulToolDispatchPort {
    readonly dispatch: (query: EffectfulToolDispatchQuery) => Promise<unknown>;
}
/** Complete invocation input. All authority-bearing material is snapshotted
 * synchronously before the first `await`. */
export interface InvokeEffectfulToolInput {
    /** T004A admitted request — consumed as dispatch intent, re-admitted
     *  internally over the exact current state before any effect. */
    readonly request: AdmittedToolInvocationRequest;
    /** T003C sealed binding pairing the exact implementation pin with the
     *  runtime handle; its successor Assembly is the dispatch anchor whose
     *  provenance is proven by the directly consumed T002B mint verifier. */
    readonly binding: SealedToolImplementationBinding;
    /** The live current Definition graph; currentness is authoritatively
     *  recomputed at re-admission. */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /**
     * The accepted T002C/T002D/T005C activation authority — CONSUMED for its
     * existing occurrence/pin gates (`requireProductionEffectAuthority`,
     * `requireResourceCurrentness`), never re-owned and never used to mint,
     * activate or overwrite an occurrence.
     */
    readonly activator: AssemblyExecutionActivator;
    /**
     * The turn material of the already-authoritative occurrence for the ONE
     * existing Central Admission path. The occurrence identity (target +
     * workflowInstanceId + turn + now) is snapshotted synchronously and the
     * request is reconstructed over the module-owned snapshot before admission.
     */
    readonly admissionRequest: CentralAdmissionRequest;
    /** Central Admission ports without the effect-tools port (see above). */
    readonly admissionPorts: EffectfulAdmissionPorts;
    /** The exact admission effect type this invocation realizes. */
    readonly effectType: string;
    /** Injected Tool calling-convention port for the verified handle. */
    readonly dispatch: EffectfulToolDispatchPort;
    /** Optional injected T005B resource provider — REQUIRED when the sealed
     *  Assembly carries applicable requirements for this operation. */
    readonly resourceProvider?: ResourceProvider;
    /** The Sha256Port used for every authoritative digest recomputation. */
    readonly sha256: Sha256Port;
}
/**
 * The result of one effectful invocation: the existing Central Admission
 * outcome (admitted plan or typed denial — owner semantics) plus exact
 * identity material for audit (the proven PRODUCTION occurrence pin identity
 * and the exact verified implementation pin). OBSERVED identity only: no live
 * handle, secret or journal record is representable, and this object never
 * mints occurrence, transition or effect authority by itself.
 */
export interface EffectfulToolInvocationResult {
    /** The existing Central Admission outcome — owner semantics, verbatim. */
    readonly outcome: CentralAdmissionOutcome;
    /** The exact occurrence pin identity the effect executed under. */
    readonly occurrence: {
        readonly workflowTarget: string;
        readonly workflowInstanceId: string;
        /** Exactly `PRODUCTION` — proven by the consumed T002D gate. */
        readonly authorityClass: RuntimeAuthorityClass;
        /** The exact durable pin digest (the occurrence currentness evidence). */
        readonly pinBindingDigest: string;
        /** The exact final sealed Assembly digest (pin-equal, proven). */
        readonly assemblyDigest: ContentDigest;
    };
    /** The exact verified invocation identity dispatched under. */
    readonly invocation: {
        readonly toolComponentId: ComponentId;
        readonly operationId: string;
        readonly effectType: string;
        readonly effectSemantics: ToolEffectSemantics;
        readonly implementation: ToolImplementationIdentity;
        readonly bindingDigest: ContentDigest;
        readonly definitionGraphDigest: ContentDigest;
    };
}
/**
 * Route ONE admitted effectful Tool invocation onto an already-authoritative
 * occurrence through the ONE existing Central Admission effect path.
 *
 * Deterministic fail-closed precedence, every gate BEFORE any side effect:
 * input shape + port shapes + request/occurrence-identity snapshots and the
 * dispatch-anchor snapshot (where the directly consumed T002B mint verifier
 * decides the final Assembly's provenance, ASSEMBLY_PROVENANCE_UNVERIFIED) —
 * all synchronous; then the T004A re-admission over the exact current state
 * (typed failures propagate unchanged), the freshly derived effect-class gate
 * (EFFECTLESS_OPERATION_REJECTED), the T003C-owned binding verification whose
 * typed failures propagate unchanged, T004C-owned dispatch consistency over
 * the VERIFIED binding (INVALID_BINDING_EVIDENCE), the occurrence-pin gates on
 * the SAME activator (`requireProductionEffectAuthority` — exact PRODUCTION
 * class only — plus the module-owned occurrence/Assembly match), T005B
 * resource resolution + the T005C occurrence-currentness re-proof, and only
 * then the ONE existing Central Admission effect path with the only
 * verified-binding adapter. The Tool's own thrown failures flow through the
 * existing admission owner semantics — never caught, wrapped or converted
 * into an outcome by this module.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted before the first `await`; after any
 * suspension only module-owned snapshot material, the frozen genuine-mint
 * anchor and the fresh frozen T003C-verified material are read — the
 * dispatched handle is the verifier-paired reference, never a re-read of
 * caller-owned state.
 */
export declare function invokeEffectfulTool(input: InvokeEffectfulToolInput): Promise<EffectfulToolInvocationResult>;
//# sourceMappingURL=effectful-invocation.d.ts.map