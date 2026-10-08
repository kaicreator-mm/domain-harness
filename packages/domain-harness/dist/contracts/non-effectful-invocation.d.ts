/**
 * v0.7 non-effectful Tool invocation path (issue #632, fine-grained DAG #534
 * T004B; authority #589 PACK-C T004B section).
 *
 * This module is the Microkernel seam that executes ONE admitted Tool
 * invocation request (T004A) against the exact runtime implementation handle
 * paired by the T003C sealed binding — for operations whose frozen L2 effect
 * class is exactly `none`. It owns exactly the concerns PACK-C assigns to
 * T004B:
 *
 * - ONLY an operation explicitly classified `effect=none` may use this path.
 *  The effect class is never taken from the caller's request object: the
 *  request is RE-ADMITTED through the exported T004A seam over the exact
 *  current state, and the freshly re-derived classification gates dispatch.
 *  Any other effect class fails closed with EFFECTFUL_OPERATION_REJECTED
 *  BEFORE the dispatch port runs — never rerouted, never fallen back to an
 *  effectful path (T004C owns effectful Central Admission);
 * - dispatch ONLY the runtime handle paired with the exact current
 *  implementation pin: the T003C-owned consumer verifier proves the binding's
 *  mint authenticity, evidence digest and exact subject slot/currentness
 *  against the SAME final sealed Assembly before the opaque handle is paired
 *  and exposed, and the verified evidence must agree with the re-admitted
 *  request on Tool Component, bound operation set, Definition graph digest
 *  AND Assembly digest. Stale, mismatched or non-mint bindings fail before
 *  call;
 * - the result is OBSERVATIONAL/COMPUTATIONAL output only: it cannot mutate
 *  authoritative Domain state, append the durable effect journal, mint an
 *  occurrence, or become business truth merely because a Tool returned it.
 *  The module imports nothing transition/journal/occurrence-related, exposes
 *  no such option on its closed input shape and mints a frozen result binding
 *  only identity + portable output material;
 * - required resources go through the T005B resolution boundary before
 *  dispatch (T005C resource identity/currentness evidence is not landed; this
 *  module consumes T005B resolution results only and never invents T005C
 *  semantics). An Assembly that carries applicable requirements without an
 *  injected provider fails closed — no ambient, default or fallback resource;
 * - snapshot discipline: every authority-bearing input (request material,
 *  binding evidence, successor-Assembly identity, paired handle, applicable
 *  requirement material) is descriptor-safe validated and synchronously
 *  snapshotted BEFORE the first `await`; after any suspension only
 *  module-owned snapshot material is read. No caller-owned reread after
 *  await;
 * - Tool thrown/typed failures remain failures: a thrown dispatch error
 *  propagates unchanged and no authoritative outcome is ever synthesized; a
 *  non-portable Tool return fails closed typed.
 *
 * ---------------------------------------------------------------------------
 * GENUINE PROVENANCE CONSUMPTION (#691 post-merge bounded repair; #589
 * issuecomment-5993726738 §A2–A4/§C, executable #640, Fresh Review #685 P1-1
 * and P1-2, Fresh Planning Review #671)
 *
 * The final Assembly's provenance is decided by the accepted T002B-owned
 * `isSealedRuntimeAssembly` mint verifier consumed DIRECTLY over the exact
 * final Assembly — the binding's own successor Assembly, which is the one and
 * only dispatch anchor (exact contextual Assembly pin, #646/#658 posture: no
 * host-held mint record, caller trust callback, latest/default/global current
 * Assembly owner or content-consistency-only substitute exists, and no
 * injected host decision can affirm a forgery). A self-consistent forged
 * Assembly passes every T004A content check yet fails here with
 * ASSEMBLY_PROVENANCE_UNVERIFIED before any dispatch.
 *
 * The T003C binding authenticity/currentness semantics are CONSUMED, never
 * re-derived: `verifyToolImplementationBinding` proves module-private mint
 * membership, re-verifies the accepted v1 bindingDigest over the evidence
 * material, and decides exact subject slot/currentness against the SAME
 * final sealed Assembly BEFORE the opaque implementation handle is paired and
 * exposed. Its typed failures (UNMINTED_TOOL_IMPLEMENTATION_BINDING,
 * TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH,
 * MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING, STALE_TOOL_IMPLEMENTATION_BINDING,
 * TOOL_IMPLEMENTATION_PIN_MISMATCH) propagate unchanged — this module never
 * re-owns those semantics. Only the verifier-returned handle is ever
 * dispatched; a field-perfect lookalike of a genuine binding can never carry
 * the mint registry membership and fails closed before any dispatch.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), the T004A request-admission seam (re-admission; its typed
 * failures propagate unchanged), the T002B mint verifier and the T003C
 * binding verification seam (both consumed directly; their typed failures
 * propagate unchanged), and the T005B resource-resolution seam (its typed
 * failures propagate unchanged). No
 * Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage/node
 * import is permitted in this file, and no public barrel exposes it.
 */
import type { ComponentId } from './component.js';
import type { DefinitionGraphEnvelope } from './definition-graph.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
import type { JsonValue } from './json.js';
import { type AdmittedToolInvocationRequest } from './invocation-request.js';
import { type ResolvedResourceEntry, type ResourceProvider } from './resource-resolution.js';
import { type SealedToolImplementationBinding, type ToolImplementationIdentity } from './tool-implementation-binding.js';
/**
 * Fail-closed non-effectful invocation failure taxonomy (PACK-C T004B). Every
 * failure is typed and terminal — none carries or suggests a
 * substitute/default/latest resolution, and no diagnostic ever serializes
 * implementation handles, secret values or live objects (only exact identity
 * strings participate).
 */
export type NonEffectfulInvocationErrorCode = 'INVALID_INVOCATION_INPUT' | 'INVALID_BINDING_EVIDENCE' | 'ASSEMBLY_PROVENANCE_UNVERIFIED' | 'MISSING_RESOURCE_PROVIDER' | 'INVALID_TOOL_DISPATCH_PORT' | 'EFFECTFUL_OPERATION_REJECTED' | 'INVALID_TOOL_OUTPUT';
export declare class NonEffectfulInvocationError extends Error {
    readonly code: NonEffectfulInvocationErrorCode;
    constructor(code: NonEffectfulInvocationErrorCode, message: string);
}
/**
 * ONE generic dispatch query: the opaque implementation handle paired by the
 * T003C sealed binding, the admitted exact operation, the frozen input
 * snapshot and the T005B-resolved resource entries. No caller context and no
 * authority material is representable here.
 */
export interface NonEffectfulToolDispatchQuery {
    /** Opaque runtime handle paired with the exact pin OUTSIDE digest material. */
    readonly handle: unknown;
    /** The admitted exact operation identity. */
    readonly operationId: string;
    /** Frozen, canonicalized, non-aliasing portable JSON input snapshot. */
    readonly input: JsonValue;
    /** T005B-resolved entries keyed by exact resourceKey (empty when none apply). */
    readonly resources: ReadonlyMap<string, ResolvedResourceEntry>;
}
/**
 * Generic injected HOST_INTEGRATION port for the Tool calling convention:
 * the host knows how to invoke its own opaque handles. `dispatch` may be
 * async; a throw/rejection is the Tool's own failure and propagates
 * UNCHANGED — this module never catches, wraps or converts it into an
 * outcome.
 */
export interface NonEffectfulToolDispatchPort {
    readonly dispatch: (query: NonEffectfulToolDispatchQuery) => Promise<unknown>;
}
/** Complete invocation input. All authority-bearing material is snapshotted
 * synchronously before the first `await`. */
export interface InvokeNonEffectfulToolInput {
    /** T004A admitted request — consumed as dispatch intent, re-admitted
     *  internally over the exact current state before any dispatch. */
    readonly request: AdmittedToolInvocationRequest;
    /** T003C sealed binding pairing the exact implementation pin with the
     *  runtime handle; its successor Assembly is the dispatch anchor whose
     *  provenance is proven by the directly consumed T002B mint verifier. */
    readonly binding: SealedToolImplementationBinding;
    /** The live current Definition graph; currentness is authoritatively
     *  recomputed at re-admission. */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /** Injected Tool calling-convention port. */
    readonly dispatch: NonEffectfulToolDispatchPort;
    /** Optional injected T005B resource provider — REQUIRED when the sealed
     *  Assembly carries applicable requirements for this operation. */
    readonly resourceProvider?: ResourceProvider;
    /** The Sha256Port used for every authoritative digest recomputation. */
    readonly sha256: Sha256Port;
}
/**
 * The observational result of one non-effectful invocation: identity
 * material for audit (what exact pin was dispatched, under which exact
 * binding/Definition/Assembly identities) plus the frozen portable output.
 * OBSERVED ≠ authoritative: this object can never mutate Domain state,
 * append a durable effect journal, mint an occurrence or become business
 * truth.
 */
export interface NonEffectfulToolInvocationResult {
    readonly status: 'OBSERVED';
    readonly toolComponentId: ComponentId;
    readonly operationId: string;
    readonly output: JsonValue;
    /** The exact implementation pin whose paired handle was dispatched. */
    readonly implementation: ToolImplementationIdentity;
    /** The T003C binding evidence digest dispatched under. */
    readonly bindingDigest: ContentDigest;
    readonly definitionGraphDigest: ContentDigest;
    readonly assemblyDigest: ContentDigest;
}
/**
 * Execute ONE admitted Tool invocation request through the `effect=none`
 * path.
 *
 * Deterministic fail-closed precedence: input shape, port shapes, request
 * snapshot and the dispatch-anchor snapshot (where the directly consumed
 * T002B mint verifier decides the final Assembly's provenance,
 * ASSEMBLY_PROVENANCE_UNVERIFIED) — all synchronous — then, after the single
 * re-admission suspension, the freshly derived effect gate
 * (EFFECTFUL_OPERATION_REJECTED), the T003C-owned binding verification whose
 * typed failures propagate unchanged
 * (UNMINTED_TOOL_IMPLEMENTATION_BINDING, TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH,
 * MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING, STALE_TOOL_IMPLEMENTATION_BINDING),
 * T004B-owned dispatch consistency over the VERIFIED binding
 * (INVALID_BINDING_EVIDENCE), T005B resource resolution (failures propagated
 * unchanged) and finally the dispatch. The Tool's own thrown failures
 * propagate unchanged; only a portable-JSON Tool return is snapshotted into
 * the frozen observational result.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted before the first `await` (the T004A
 * re-admission's own synchronous phase runs in the same tick, over the same
 * caller-owned graph object, before its first suspension); after any
 * suspension only module-owned snapshot material, the frozen genuine-mint
 * anchor and the fresh frozen T003C-verified material are read — the
 * dispatched handle is the verifier-paired reference, never a re-read of
 * caller-owned state.
 */
export declare function invokeNonEffectfulTool(input: InvokeNonEffectfulToolInput): Promise<NonEffectfulToolInvocationResult>;
//# sourceMappingURL=non-effectful-invocation.d.ts.map