/**
 * v0.7 caller-neutral Tool invocation request + caller exposure contract
 * (issue #609, fine-grained DAG #534 T004A; authority #589 PACK-A T004A
 * section).
 *
 * This module is the Microkernel seam between the sealed Runtime Assembly
 * (T002B), the Tool Component operation contract (T003A) and the successor
 * invocation paths (T004B non-effectful execution, T004C effectful Central
 * Admission). It owns exactly the concerns PACK-A assigns to T004A:
 *
 * - ONE generic caller-neutral request shape: exact Tool Component id +
 *   operationId + portable JSON input + caller context + claimed exact
 *   Definition/Assembly currentness + admitted exposure evidence. Workflow /
 *   Agent / UX / internal callers and every future caller plane share this
 *   single model — caller context is provenance material only and the kernel
 *   never branches on it (adapters live outside the kernel).
 * - `admitToolExposure`: the exposure-authority boundary. Given the exact
 *   current Definition graph, a sealed Runtime Assembly, one bound Tool
 *   Component + operation and one generic injected `ToolExposureAdmissionPolicy`
 *   port, it authoritatively recomputes Definition currentness, lets the
 *   trusted policy decide over descriptor-safe operation/caller snapshots,
 *   and mints frozen, non-aliasing `AdmittedToolExposure` evidence carrying
 *   the exact graph/assembly digests and an exposure digest binding the
 *   declared exposure material + caller snapshot.
 * - `admitToolInvocationRequest`: the request-admission boundary. It
 *   re-verifies the sealed Assembly's content digest, recomputes Definition
 *   currentness, validates the exposure evidence's minting authority, binding
 *   consistency and caller equality, resolves the operation's frozen L2
 *   effect classification from the current graph binding, and mints a frozen
 *   `AdmittedToolInvocationRequest` — request-admission evidence only.
 *
 * Authority rules enforced here without exception (PACK-A):
 * - the caller is provenance/context, NEVER execution authority; a caller
 *   cannot mint exposure evidence (module-private WeakSet mint registry +
 *   own-property brand, the #601 repair applied from the start) and cannot
 *   ride on evidence minted for a different caller (full caller-context
 *   equality, not just the caller id);
 * - the Tool's declarative `declaredExposure` material is NOT runtime
 *   authorization: admission is always a policy decision over the exact
 *   current state, and an operation with no declared exposure at all remains
 *   admissible;
 * - stale Definition / stale Assembly / stale exposure fail closed BEFORE
 *   any dispatch: currentness is authoritatively recomputed at every
 *   admission, never claimed-and-trusted;
 * - request/evidence are immutable and non-aliasing: every authority-bearing
 *   input is descriptor-safe validated and synchronously snapshotted before
 *   the first `await` (torn-snapshot discipline, #587 §E same posture); after
 *   any suspension only module-owned snapshot material and the trusted #555
 *   digest seam (which snapshot the graph synchronously) are read;
 * - no Agent/UX branches exist in the Microkernel; no dispatch, execution,
 *   occurrence anchoring or effect authority is implemented — T004A mints
 *   request-admission evidence only (T004B owns `effect=none` execution,
 *   T004C owns effectful Central Admission anchoring).
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), the T003A Tool declaration validator (imported, failures
 * propagated unchanged), the #555 Definition graph validation/digest seam
 * (graph failures propagated unchanged) and the T002B sealed Assembly shape
 * (only its serializable record identity is consumed — Assembly authenticity
 * for validator-handle provenance remains T002B-owned, #601). No Workflow/
 * XState/ToolRegistry/Agent/UX/AI/HTTP/Search/Storage/node import is
 * permitted in this file, and no public barrel exposes it.
 */
import type { ComponentId } from './component.js';
import { type DefinitionGraphEnvelope } from './definition-graph.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
import type { JsonValue } from './json.js';
import { type SealedRuntimeAssembly } from './runtime-assembly.js';
import { type ToolOperationContract, type ToolOperationEffect } from './tool-component.js';
/**
 * Versioned Tool exposure digest domain tag, owned exclusively by this file.
 * Any future change to the admitted-exposure material shape is a NEW domain
 * tag; historical exposure evidence identities never change retroactively.
 */
export declare const TOOL_EXPOSURE_DIGEST_DOMAIN = "kaicreator.tool-exposure.digest.v1";
/**
 * Fail-closed invocation request/exposure failure taxonomy (T004A). Every
 * failure is typed and terminal — none carries or suggests a substitute/
 * default/latest resolution, and no diagnostic ever serializes policy
 * internals, secret values or live handles (only exact identity strings
 * participate).
 */
export type InvocationRequestErrorCode = 'INVALID_INVOCATION_INPUT' | 'INVALID_INVOCATION_CALLER' | 'INVALID_INVOCATION_REQUEST' | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN' | 'INVALID_EXPOSURE_POLICY' | 'INVALID_ASSEMBLY_EVIDENCE' | 'ASSEMBLY_DIGEST_MISMATCH' | 'DEFINITION_CURRENTNESS_MISMATCH' | 'ASSEMBLY_CURRENTNESS_MISMATCH' | 'EXPOSURE_CURRENTNESS_MISMATCH' | 'FORGED_EXPOSURE_EVIDENCE' | 'INVOCATION_BINDING_MISMATCH' | 'INVOCATION_CALLER_MISMATCH' | 'TOOL_COMPONENT_NOT_BOUND' | 'INVALID_TOOL_INVOCATION_TARGET' | 'EXPOSURE_NOT_ADMITTED';
export declare class InvocationRequestError extends Error {
    readonly code: InvocationRequestErrorCode;
    constructor(code: InvocationRequestErrorCode, message: string);
}
/**
 * ONE generic caller context shared by every caller plane. `callerId` is a
 * required exact identity; `callerKind` is an OPEN provenance string (never
 * a closed union — no adapter plane can require a kernel branch) and
 * `attributes` is optional portable JSON provenance. None of these fields
 * carries, implies or mints authority of any kind.
 */
export interface InvocationCallerContext {
    /** Required exact caller identity — provenance only, never authority. */
    readonly callerId: string;
    /** Optional open caller-plane provenance string; never a closed union. */
    readonly callerKind?: string;
    /** Optional portable JSON provenance material; no authority content. */
    readonly attributes?: JsonValue;
}
/**
 * The decision of one exposure-admission policy evaluation. Denial is an
 * expected outcome (not an exception path) and may carry a human-readable
 * reason that is propagated into the typed failure diagnostic.
 */
export type ToolExposureAdmissionDecision = {
    readonly admitted: true;
} | {
    readonly admitted: false;
    readonly reason?: string;
};
/**
 * Generic injected exposure-admission policy port, one interface for all
 * caller planes. The kernel supplies descriptor-safe snapshots of the exact
 * current operation contract and the caller context; the trusted policy
 * implementation (an adapter/host concern) returns an admit/deny decision.
 * The declarative `declaredExposure` material on the operation is input to
 * this decision, never a substitute for it.
 */
export interface ToolExposureAdmissionPolicy {
    decideAdmission(query: {
        readonly operation: ToolOperationContract;
        readonly caller: InvocationCallerContext;
    }): ToolExposureAdmissionDecision;
}
/** Complete exposure-admission input; all authority-bearing material is
 * synchronously snapshotted before the first `await`. */
export interface AdmitToolExposureInput {
    /** Exact Tool Component id bound in the current Definition graph. */
    readonly toolComponentId: ComponentId;
    /** Exact operation identity declared by that Tool Component. */
    readonly operationId: string;
    /** Generic caller-neutral context; provenance only. */
    readonly caller: InvocationCallerContext;
    /** Sealed Runtime Assembly the exact current graph digest is bound to. */
    readonly assembly: SealedRuntimeAssembly;
    /** The live current Definition graph; currentness is authoritatively proven. */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /** Trusted generic exposure-admission policy port. */
    readonly policy: ToolExposureAdmissionPolicy;
}
/**
 * Authoritative admitted-exposure evidence, minted only by
 * `admitToolExposure`. Binds the exact Tool Component + operation, the full
 * frozen caller snapshot, the exact Definition/Assembly digests current at
 * mint time, and an exposure digest over the declared exposure material +
 * caller snapshot. The caller can never mint or mutate it: the module-private
 * WeakSet mint registry is the authoritative anti-forgery test and the
 * unique-symbol brand is retained as own-property defense in depth (#601
 * lesson applied from the start — neither prototype-chain inheritance nor
 * symbol theft can satisfy the registry).
 */
export interface AdmittedToolExposure {
    readonly status: 'ADMITTED';
    readonly toolComponentId: ComponentId;
    readonly operationId: string;
    readonly caller: InvocationCallerContext;
    readonly definitionGraphDigest: ContentDigest;
    readonly assemblyDigest: ContentDigest;
    readonly exposureDigest: ContentDigest;
    readonly [ADMITTED_EXPOSURE_BRAND]: true;
}
/**
 * Private anti-forgery brand + module-private minting registry (authoritative
 * test). The brand property alone is bypassable (prototype-chain inheritance,
 * reflective symbol theft — see #601), so registry membership decided here is
 * what actually authorizes evidence.
 */
declare const ADMITTED_EXPOSURE_BRAND: unique symbol;
/**
 * ONE generic caller-neutral invocation request shape (PACK-A). Binds the
 * exact Tool Component id, the exact operationId, portable JSON input, the
 * generic caller context, the claimed exact Definition/Assembly currentness
 * and the admitted exposure evidence. Every field is verified against exact
 * current state at admission — nothing is claimed-and-trusted.
 */
export interface ToolInvocationRequest {
    /** Exact Tool Component id; must be bound in the current graph. */
    readonly toolComponentId: ComponentId;
    /** Exact operation identity declared by that Tool Component. */
    readonly operationId: string;
    /** Portable JSON input material. */
    readonly input: JsonValue;
    /** Generic caller-neutral context; provenance only, never authority. */
    readonly caller: InvocationCallerContext;
    /** Claimed exact Definition graph digest — verified by recomputation. */
    readonly definitionGraphDigest: ContentDigest;
    /** Claimed exact Assembly digest — verified by recomputation. */
    readonly assemblyDigest: ContentDigest;
    /** Admitted exposure evidence minted by `admitToolExposure`. */
    readonly exposure: AdmittedToolExposure;
}
/** Admission options: the sealed Assembly and the current Definition graph. */
export interface AdmitToolInvocationRequestOptions {
    /** The sealed Runtime Assembly the request is admitted against. */
    readonly assembly: SealedRuntimeAssembly;
    /**
     * The current Definition graph. Its digest is authoritatively recomputed
     * and must equal the Assembly-bound digest, the request claim and the
     * exposure-bound digest; any stale or mismatching state fails closed.
     */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
}
/**
 * Authoritative admitted-invocation-request evidence, minted only by
 * `admitToolInvocationRequest`. REQUEST_ADMITTED=YES, DISPATCH_AUTHORITY=NO,
 * EFFECT_AUTHORITY=NO: this object binds identity, currentness, the frozen
 * caller provenance snapshot and the operation's frozen L2 effect
 * CLASSIFICATION (carried forward for T004B/T004C gating) — it never grants
 * execution, occurrence anchoring or durable-effect authority, and the
 * module exports no dispatch/execute entry point at all.
 */
export interface AdmittedToolInvocationRequest {
    readonly status: 'ADMITTED';
    readonly toolComponentId: ComponentId;
    readonly operationId: string;
    readonly input: JsonValue;
    readonly caller: InvocationCallerContext;
    readonly operationEffect: ToolOperationEffect;
    readonly definitionGraphDigest: ContentDigest;
    readonly assemblyDigest: ContentDigest;
    readonly exposure: AdmittedToolExposure;
}
/**
 * Admit one caller exposure against the exact current state.
 *
 * Deterministic fail-closed precedence: input shape, exact identities, caller
 * contract, policy shape, Assembly identity shape, graph validation
 * (propagated unchanged), Tool binding resolution, Tool declaration
 * validation (propagated unchanged), operation existence, then async
 * currentness recomputation, exposure digest, policy decision and mint.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and snapshotted synchronously before the first `await`; the
 * policy decision consumes only module-owned snapshots; minted evidence is
 * deeply frozen and never aliases caller-owned state.
 */
export declare function admitToolExposure(input: AdmitToolExposureInput, sha256: Sha256Port): Promise<AdmittedToolExposure>;
/**
 * Admit one generic caller-neutral invocation request against the exact
 * current state.
 *
 * Deterministic fail-closed precedence: options/input shape, exact
 * identities, portable JSON input, caller contract, digest formats, Assembly
 * identity shape, exposure minting authority, exposure/request binding and
 * caller consistency, graph validation (propagated unchanged), Tool binding
 * resolution and declaration validation (propagated unchanged), operation
 * existence, then async digest recomputation, then currentness failures —
 * tampered Assembly identity, stale Definition, stale Assembly claim, stale
 * exposure — and finally the mint.
 *
 * Torn-snapshot discipline: the request material is descriptor-safe validated
 * and snapshotted synchronously before the first `await`; only module-owned
 * snapshots and the trusted #555 digest seam are read after any suspension.
 * The minted admitted request is deeply frozen and never aliases caller-owned
 * state. REQUEST_ADMITTED=YES, DISPATCH_AUTHORITY=NO, EFFECT_AUTHORITY=NO.
 */
export declare function admitToolInvocationRequest(request: ToolInvocationRequest, options: AdmitToolInvocationRequestOptions, sha256: Sha256Port): Promise<AdmittedToolInvocationRequest>;
export {};
//# sourceMappingURL=invocation-request.d.ts.map