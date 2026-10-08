/**
 * v0.7 renderer-neutral UX Tool request adapter (issue #907, gate for the
 * frozen #703 T004E packet; fine-grained DAG #534 T004E; controller #537
 * LOCAL_FIRST_MAX_SAFE_PARALLELISM).
 *
 * ADAPTER, not Microkernel semantics: the UX plane is a caller/provenance
 * plane, NEVER an authority owner. This module owns exactly the concern the
 * #703 frozen packet assigns to T004E — and nothing else:
 *
 * - TRANSLATION: `queryUxTool` / `invokeUxToolEffectfully` translate
 *   renderer-neutral UX intent (exact Tool Component + operation + portable
 *   JSON input + caller provenance + the UX-claimed exact current Definition
 *   graph digest) into the GENERIC caller-neutral T004A admission seam. The
 *   current authoritative Definition graph and the sealed T003C binding are
 *   TRUSTED HOST COMPOSITION inputs, never UX material; the adapter re-proves
 *   Definition currentness itself (authoritative digest recomputation) and the
 *   consumed T004A/T004B/T004C seams independently re-prove Definition AND
 *   Assembly AND exposure currentness on every call;
 * - PURE ROUTE: `queryUxTool` invokes ONLY operations whose frozen effect
 *   class (derived from the EXACT current graph, never from UX material) is
 *   exactly `none`, through the generic T004A exposure/request admission and
 *   the T004B effect=none path. The returned result is the T004B OBSERVED-only
 *   outcome, verbatim — UX may project it, never rewrite or upgrade it into
 *   business/runtime truth. A mutation-capable operation presented to this
 *   seam refuses UX_MUTATION_REFUSED BEFORE any admission or dispatch —
 *   never rerouted, never fallen back;
 * - EFFECTFUL ROUTE: `invokeUxToolEffectfully` is the ONLY mutation-capable
 *   entry. It re-derives the frozen effect class from the exact current graph,
 *   refuses effect=none intent typed (UX_EFFECTLESS_OPERATION_REFUSED) before
 *   any admission, then admits the GENERIC T004A request and routes it through
 *   the accepted T004C seam exactly once, against the already-authoritative
 *   occurrence / Central Admission material supplied by TRUSTED HOST
 *   COMPOSITION (`activator`, `admissionRequest`, `admissionPorts`) — yielding
 *   exactly one existing Central Admission record. This module exposes NO
 *   occurrence material, NO journal access, NO admission ports of its own and
 *   NO UX-supplied exposure policy: the exposure admission policy is
 *   module-internal and fixed (declarative `declaredExposure.audiences`
 *   containing the exact `ux` audience is input to the T004A-owned decision,
 *   never a substitute for it, and can never be selected or minted by UX);
 * - FRESHNESS: both seams verify the UX-claimed exact current Definition graph
 *   digest against the authoritatively recomputed digest BEFORE any generic
 *   admission, and refuse UX_REQUEST_STALE on any drift — no latest/default/
 *   order/alias fallback exists anywhere in this module.
 *
 * Authority rules enforced here without exception (#703 frozen packet):
 * - UX owns NO Runtime/journal/admission/currentness authority: the closed-
 *   world input shapes admit no occurrence, activation/pin, admitted-exposure
 *   evidence or policy, implementation binding/handle, resource authority,
 *   journal/effect/idempotency, or governance material — any such field (or
 *   hostile accessor/prototype substitute) fails closed typed
 *   (INVALID_UX_REQUEST_INPUT) before any admission or dispatch;
 * - the caller is provenance only: `uxSessionId` becomes the generic
 *   `{ callerId, callerKind: 'ux' }` caller context and the kernel never
 *   branches on it (no UX branch exists in the Microkernel — proven by the
 *   test matrix over the consumed kernel seams);
 * - renderer neutrality: only exact identities + portable JSON material cross
 *   this boundary — no React/React Native/DOM/native renderer type and no
 *   concrete domain-ux/DAC type enters this module;
 * - T004D coexistence: this is a SIBLING caller adapter to
 *   `agent-tool-projection.ts`; it reuses the same generic T004A/B/C seams and
 *   introduces no second Runtime, journal, occurrence registry, exposure
 *   authority or Central Admission path.
 *
 * Boundary discipline: this module consumes the T004A request/exposure seam,
 * the T004B non-effectful invocation seam, the T004C effectful invocation
 * seam, the T003A Tool declaration validator, the #555 Definition graph
 * validation/digest seam and the shared descriptor-safe record primitive of
 * `record-safety.ts` (all typed failures propagate unchanged). Type-only
 * imports reference the T002D/T005C activator and the Central Admission
 * request shape; no journal/governance/Workflow/AI/HTTP/Search/Storage/node
 * import is permitted in this file, and no public barrel exposes it.
 */
import type { CentralAdmissionRequest } from '../admission/contracts.js';
import type { ComponentId } from '../contracts/component.js';
import { type DefinitionGraphEnvelope } from '../contracts/definition-graph.js';
import { type ContentDigest, type Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import { type NonEffectfulToolDispatchPort, type NonEffectfulToolInvocationResult } from '../contracts/non-effectful-invocation.js';
import { type EffectfulAdmissionPorts, type EffectfulToolDispatchPort, type EffectfulToolInvocationResult } from '../contracts/effectful-invocation.js';
import type { ResourceProvider } from '../contracts/resource-resolution.js';
import type { SealedToolImplementationBinding } from '../contracts/tool-implementation-binding.js';
import type { AssemblyExecutionActivator } from '../governance/assembly-activation.js';
/**
 * Fail-closed UX request refusal taxonomy (#703 frozen packet). Every owner
 * seam failure (T004A exposure/request admission, T003A Tool validation,
 * #555 graph validation, T004B/T004C invocation) propagates UNCHANGED and is
 * deliberately absent. No diagnostic ever serializes policy internals,
 * secret values or live handles (only exact identity strings participate).
 */
export type UxToolRequestErrorCode = 'INVALID_UX_REQUEST_INPUT' | 'UX_OPERATION_NOT_EXPOSED' | 'UX_MUTATION_REFUSED' | 'UX_EFFECTLESS_OPERATION_REFUSED' | 'UX_REQUEST_STALE';
export declare class UxToolRequestError extends Error {
    readonly code: UxToolRequestErrorCode;
    constructor(code: UxToolRequestErrorCode, message: string);
}
/** The fixed caller-plane provenance kind this adapter stamps on its generic
 * caller contexts. Provenance only — the kernel never branches on it. */
export declare const UX_CALLER_KIND = "ux";
/** Complete query-seam input. All UX material is synchronously snapshotted
 * before the first `await`; the seam is structurally read-only — no effectful
 * routing option exists. */
export interface QueryUxToolInput {
    /** Exact UX session identity (provenance only, never authority). */
    readonly uxSessionId: string;
    /** Exact Tool Component id bound in the current graph. */
    readonly toolComponentId: ComponentId;
    /** Exact operation identity declared by that Tool Component. */
    readonly operationId: string;
    /** Portable JSON input material — intent only, never authority. */
    readonly input: JsonValue;
    /** The exact current Definition graph digest the UX intent was shaped
     *  against; verified by authoritative recomputation before admission. */
    readonly expectedDefinitionGraphDigest: ContentDigest;
    /** T003C sealed binding pairing the exact implementation pin + handle. */
    readonly binding: SealedToolImplementationBinding;
    /** The live current Definition graph (trusted host composition input). */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /** Injected Tool calling-convention port (the effect=none dispatch). */
    readonly dispatch: NonEffectfulToolDispatchPort;
    /** Optional injected T005B resource provider. */
    readonly resourceProvider?: ResourceProvider;
    /** The Sha256Port used for every authoritative digest recomputation. */
    readonly sha256: Sha256Port;
}
/**
 * Invoke ONE ux-exposed, effect=none operation through the generic
 * T004A -> T004B path.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any dispatch:
 * closed-world input shape (no occurrence/journal/admission/evidence field is
 * representable), exact identities, portable-JSON input snapshot, membership
 * + exposure gate (UX_OPERATION_NOT_EXPOSED) and the query-only effect gate
 * (UX_MUTATION_REFUSED) — all synchronous, all derived from the EXACT current
 * graph — then UX currentness (UX_REQUEST_STALE), then the generic T004A
 * exposure admission over the exact current state (policy decision over the
 * exact current contract; typed failures propagate unchanged), the T004A
 * request admission, and finally the T004B effect=none invocation, which
 * independently re-admits the request, re-derives the effect class, verifies
 * the T003C binding and dispatches only the verified handle. The returned
 * result is the T004B OBSERVED-only outcome: UX may project it but can never
 * rewrite, upgrade or substitute it as business/runtime truth.
 */
export declare function queryUxTool(input: QueryUxToolInput): Promise<NonEffectfulToolInvocationResult>;
/**
 * Complete effectful-seam input: UX intent material + TRUSTED HOST
 * COMPOSITION authority inputs only. The occurrence authority
 * (`activator` + `admissionRequest` + `admissionPorts`) is supplied by the
 * host and consumed by the accepted T004C seam verbatim — this module
 * neither supplies, mints, copies from UX material, nor re-owns any of it,
 * and it exposes NO journal access of its own.
 */
export interface InvokeUxToolEffectfullyInput {
    /** Exact UX session identity (provenance only, never authority). */
    readonly uxSessionId: string;
    /** Exact Tool Component id bound in the current graph. */
    readonly toolComponentId: ComponentId;
    /** Exact mutation-capable operation identity. */
    readonly operationId: string;
    /** Portable JSON input material — intent only, never authority. */
    readonly input: JsonValue;
    /** The exact current Definition graph digest the UX intent was shaped
     *  against; verified by authoritative recomputation before admission. */
    readonly expectedDefinitionGraphDigest: ContentDigest;
    /** T003C sealed binding pairing the exact implementation pin + handle. */
    readonly binding: SealedToolImplementationBinding;
    /** The live current Definition graph (trusted host composition input). */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /** The accepted T002C/T002D/T005C activation authority (host composition
     *  input; consumed by T004C for its existing occurrence/pin gates, never
     *  re-owned and never used to mint or overwrite an occurrence). */
    readonly activator: AssemblyExecutionActivator;
    /** The turn material of the already-authoritative occurrence (host
     *  composition input to the ONE existing Central Admission path). */
    readonly admissionRequest: CentralAdmissionRequest;
    /** Central Admission ports without the effect-tools port (host
     *  composition input; the effect-tools adapter is installed only inside
     *  the T004C owner). */
    readonly admissionPorts: EffectfulAdmissionPorts;
    /** The exact admission effect type this invocation realizes. */
    readonly effectType: string;
    /** Injected Tool calling-convention port for the verified handle. */
    readonly dispatch: EffectfulToolDispatchPort;
    /** Optional injected T005B resource provider. */
    readonly resourceProvider?: ResourceProvider;
    /** The Sha256Port used for every authoritative digest recomputation. */
    readonly sha256: Sha256Port;
}
/**
 * Route ONE ux-exposed, mutation-capable intent through the generic
 * T004A -> T004C path exactly once.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any admission
 * or effect: closed-world input shape (no occurrence/journal/admission-
 * evidence field is representable on the UX material), exact identities,
 * portable-JSON input snapshot, membership + exposure gate
 * (UX_OPERATION_NOT_EXPOSED), the mutation-capable effect gate
 * (UX_EFFECTLESS_OPERATION_REFUSED — effect classification is re-derived
 * from the EXACT current graph, never trusted from UX material) — all
 * synchronous — then UX currentness (UX_REQUEST_STALE), then the generic
 * T004A exposure admission (policy decision over the exact current contract)
 * and request admission (typed failures propagate unchanged). The admitted
 * generic request is then routed through the accepted T004C seam exactly
 * once, against the already-authoritative occurrence / Central Admission
 * material supplied by trusted host composition: exactly one existing
 * Central Admission record results. No T004B/query fallback exists, and the
 * returned result reflects the existing authoritative T004C/Central
 * Admission outcome — UX may observe/project it but can never rewrite,
 * upgrade or substitute it as business/runtime truth.
 */
export declare function invokeUxToolEffectfully(input: InvokeUxToolEffectfullyInput): Promise<EffectfulToolInvocationResult>;
//# sourceMappingURL=ux-tool-request.d.ts.map