/**
 * v0.7 Agent Tool projection / mutation refusal adapter (issue #886,
 * fine-grained DAG #534 T004D; authority #589 PACK-C T004D section;
 * readiness #702 VERDICT=READY_AFTER_DEPENDENCIES).
 *
 * ADAPTER, not Microkernel semantics: the Agent is a projection/caller plane,
 * NEVER an authority owner. This module owns exactly the concerns PACK-C
 * assigns to T004D — and nothing else:
 *
 * - PROJECTION: `projectAgentToolSurface` derives the Agent plane's exposed
 *   Tool menu from the EXACT current Definition graph. An operation is
 *   projected only when its exact admitted exposure permits Agent/query use —
 *   the declarative `declaredExposure` material of the current contract
 *   carries an `audiences` list containing the exact `agent` audience. The
 *   projection is derived metadata only: deeply frozen, canonicalized,
 *   non-aliasing snapshots of the exact current contract, bound to the exact
 *   current Definition graph digest. It mints no evidence and authorizes
 *   nothing — stale projection can never authorize current execution;
 * - QUERY SEAM: `queryAgentTool` is the Agent/Harness query-only seam. It
 *   invokes ONLY operations whose frozen effect class is exactly `none`,
 *   through the generic T004A exposure/request admission and the T004B
 *   effect=none path. Model output enters as `proposal` material — provenance
 *   only, never invocation or transition authority. Any mutation-capable
 *   (effectful) operation submitted through this seam is refused typed
 *   (AGENT_MUTATION_REFUSED) BEFORE any implementation dispatch — never
 *   rerouted, never fallen back; an operation absent from the projected
 *   surface refuses AGENT_OPERATION_NOT_PROJECTED, and a projection that no
 *   longer matches the exact current state refuses AGENT_PROJECTION_STALE —
 *   both before any admission or dispatch;
 * - MUTATION ROUTE: `admitAgentMutationIntent` is the ONLY mutation-capable
 *   entry, and it is NOT a mutation shortcut: it enters the GENERIC T004A
 *   request (exposure admission + request admission, callerKind `agent`
 *   provenance only) and returns the admitted request. The host MUST route
 *   that request through the T004C effectful seam against an
 *   already-authoritative occurrence / Central Admission; this module exposes
 *   NO effectful dispatch, NO occurrence material, NO journal access and NO
 *   admission ports — the Agent plane can never supply or forge occurrence,
 *   pin, verdict or effect authority;
 * - FRESHNESS: both seams re-verify projection freshness against the exact
 *   current graph (identity + authoritatively recomputed digest) before any
 *   generic admission, and the consumed T004A/T004B seams independently
 *   re-prove Definition/Assembly/exposure currentness on every call. The
 *   projection never substitutes for admission evidence.
 *
 * Authority rules enforced here without exception (PACK-C T004D):
 * - the module makes ZERO authority decisions: exposure admission is the
 *   T004A-owned policy seam over exact current state; effect classification
 *   and the effect=none gate are T004B/T004C-owned; occurrence/effect
 *   authority is Central-Admission-owned. This adapter adds no Tool-registry
 *   authority, no second runtime and no second admission path;
 * - the caller is provenance only: `agentId` becomes the generic
 *   `{ callerId, callerKind: 'agent' }` caller context and the kernel never
 *   branches on it (no Agent branch exists in the Microkernel — proven by the
 *   test matrix);
 * - the frozen v0.2 DomainQueryDispatcher/read seam is NOT widened: this
 *   module is a SIBLING adapter and mutation stays structurally absent from
 *   the Agent query path.
 *
 * Boundary discipline: this module consumes the T004A request/exposure seam,
 * the T004B non-effectful invocation seam, the T003A Tool declaration
 * validator, the #555 Definition graph validation/digest seam and the shared
 * descriptor-safe record primitive of `record-safety.ts` (all typed failures
 * propagate unchanged). No effectful-invocation/admission/governance/
 * Workflow/journal/AI/HTTP/Search/Storage/node import is permitted in this
 * file, and no public barrel exposes it.
 */
import type { ComponentId } from '../contracts/component.js';
import { type DefinitionGraphEnvelope } from '../contracts/definition-graph.js';
import { type ContentDigest, type Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import { type AdmittedToolInvocationRequest } from '../contracts/invocation-request.js';
import { type NonEffectfulToolDispatchPort, type NonEffectfulToolInvocationResult } from '../contracts/non-effectful-invocation.js';
import type { ResourceProvider } from '../contracts/resource-resolution.js';
import type { SealedRuntimeAssembly } from '../contracts/runtime-assembly.js';
import type { SealedToolImplementationBinding } from '../contracts/tool-implementation-binding.js';
import { type ToolOperationEffect } from '../contracts/tool-component.js';
/**
 * Fail-closed Agent projection refusal taxonomy (PACK-C T004D). Every owner
 * seam failure (T004A exposure/request admission, T003A Tool validation,
 * #555 graph validation, T004B invocation) propagates UNCHANGED and is
 * deliberately absent. No diagnostic ever serializes policy internals,
 * secret values or live handles (only exact identity strings participate).
 */
export type AgentToolProjectionErrorCode = 'INVALID_PROJECTION_INPUT' | 'AGENT_OPERATION_NOT_PROJECTED' | 'AGENT_MUTATION_REFUSED' | 'AGENT_PROJECTION_STALE';
export declare class AgentToolProjectionError extends Error {
    readonly code: AgentToolProjectionErrorCode;
    constructor(code: AgentToolProjectionErrorCode, message: string);
}
/** The fixed caller-plane provenance kind this adapter stamps on its generic
 * caller contexts. Provenance only — the kernel never branches on it. */
export declare const AGENT_CALLER_KIND = "agent";
/** One projected operation: exact identity + frozen L2 effect class + the
 * exact current input/output schema snapshots. No handle, exposure evidence
 * or admission material is representable. */
export interface AgentProjectedOperation {
    /** Exact operation identity declared by the owning Tool Component. */
    readonly operationId: string;
    /** The frozen L2 effect class of the exact current contract. */
    readonly effect: ToolOperationEffect;
    /** Canonicalized snapshot of the exact current input schema material. */
    readonly inputSchema: JsonValue;
    /** Canonicalized snapshot of the exact current output schema material. */
    readonly outputSchema: JsonValue;
}
/** One projected Tool Component: exact identity + its agent-exposed
 * operations in declaration order. */
export interface AgentProjectedTool {
    /** Exact Tool Component id bound in the projected Definition graph. */
    readonly toolComponentId: ComponentId;
    /** The agent-exposed operations of this Tool (declaration order). */
    readonly operations: readonly AgentProjectedOperation[];
}
/**
 * The Agent Tool surface projection: derived metadata minted only by
 * `projectAgentToolSurface`. Binds the exact agent identity, the exact graph
 * identity + digest current at projection time, and frozen non-aliasing
 * schema snapshots of exactly the agent-exposed operations. PROJECTION ≠
 * AUTHORITY: this object mints no evidence and can never substitute for
 * admission evidence — every seam re-proves exact currentness on use.
 */
export interface AgentToolSurfaceProjection {
    readonly status: 'PROJECTED';
    /** The exact Agent identity this surface was projected for. */
    readonly agentId: string;
    /** The exact Definition graph identity the projection was derived from. */
    readonly graphId: string;
    /** The exact Definition graph digest current at projection time. */
    readonly definitionGraphDigest: ContentDigest;
    /** Agent-exposed Tools of the projected graph (graph component order). */
    readonly tools: readonly AgentProjectedTool[];
}
/** Complete projection input; all material is synchronously snapshotted
 * before the first `await`. */
export interface ProjectAgentToolSurfaceInput {
    /** Exact Agent identity the surface is projected for (provenance only). */
    readonly agentId: string;
    /** The live current Definition graph; currentness is digest-bound. */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /** The Sha256Port used for the authoritative graph digest. */
    readonly sha256: Sha256Port;
}
/**
 * Project the Agent Tool surface from the EXACT current Definition graph.
 *
 * Deterministic fail-closed precedence: input shape, exact identity, graph
 * envelope validation (propagated unchanged), then per-Tool declaration
 * validation (T003A failures propagated unchanged) and synchronous canonical
 * operation snapshots, and finally the authoritative graph digest bind.
 *
 * Only operations whose exact current declarative exposure admits the
 * `agent` audience are projected. The minted projection is deeply frozen,
 * non-aliasing and digest-bound — derived metadata only.
 */
export declare function projectAgentToolSurface(input: ProjectAgentToolSurfaceInput): Promise<AgentToolSurfaceProjection>;
/** Complete query-seam input. All authority-bearing material is synchronously
 * snapshotted before the first `await`; the seam is structurally read-only —
 * no effectful routing option exists. */
export interface AgentToolQueryInput {
    /** Exact Agent identity (provenance only). */
    readonly agentId: string;
    /** Exact Tool Component id bound in the current graph. */
    readonly toolComponentId: ComponentId;
    /** Exact operation identity declared by that Tool Component. */
    readonly operationId: string;
    /** Model output/proposal material — provenance only, never authority. */
    readonly proposal: JsonValue;
    /** The Agent Tool surface projection (derived metadata; freshness-gated). */
    readonly projection: AgentToolSurfaceProjection;
    /** T003C sealed binding pairing the exact implementation pin + handle. */
    readonly binding: SealedToolImplementationBinding;
    /** The live current Definition graph. */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /** Injected Tool calling-convention port (the effect=none dispatch). */
    readonly dispatch: NonEffectfulToolDispatchPort;
    /** Optional injected T005B resource provider. */
    readonly resourceProvider?: ResourceProvider;
    /** The Sha256Port used for every authoritative digest recomputation. */
    readonly sha256: Sha256Port;
}
/**
 * Invoke ONE agent-exposed, effect=none operation through the generic
 * T004A -> T004B path.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any dispatch:
 * closed-world input shape, exact identities, projection view, membership
 * (AGENT_OPERATION_NOT_PROJECTED), the query-only effect gate
 * (AGENT_MUTATION_REFUSED) — all synchronous — then projection freshness
 * (AGENT_PROJECTION_STALE), then the generic T004A exposure admission over
 * the exact current state (policy decision over the exact current contract;
 * typed failures propagate unchanged), the T004A request admission, and
 * finally the T004B effect=none invocation, which independently re-admits
 * the request, re-derives the effect class, verifies the T003C binding and
 * dispatches only the verified handle. Model proposal material is provenance
 * only; the returned observational result can never mutate authoritative
 * Domain state.
 */
export declare function queryAgentTool(input: AgentToolQueryInput): Promise<NonEffectfulToolInvocationResult>;
/**
 * Complete mutation-intent input: proposal material + freshness anchors only.
 * NO dispatch port, NO occurrence material, NO admission ports — this seam
 * cannot execute anything. */
export interface AdmitAgentMutationIntentInput {
    /** Exact Agent identity (provenance only). */
    readonly agentId: string;
    /** Exact Tool Component id bound in the current graph. */
    readonly toolComponentId: ComponentId;
    /** Exact mutation-capable operation identity. */
    readonly operationId: string;
    /** Model output/proposal material — provenance only, never authority. */
    readonly proposal: JsonValue;
    /** The Agent Tool surface projection (derived metadata; freshness-gated). */
    readonly projection: AgentToolSurfaceProjection;
    /** The sealed Runtime Assembly the generic request is admitted against. */
    readonly assembly: SealedRuntimeAssembly;
    /** The live current Definition graph. */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /** The Sha256Port used for every authoritative digest recomputation. */
    readonly sha256: Sha256Port;
}
/**
 * Admit ONE mutation-capable Agent intent into the GENERIC T004A request.
 *
 * Deterministic fail-closed precedence: closed-world input shape, exact
 * identities, projection view, membership (AGENT_OPERATION_NOT_PROJECTED) —
 * all synchronous — then projection freshness (AGENT_PROJECTION_STALE), then
 * the generic T004A exposure admission (policy decision over the exact
 * current contract) and request admission (typed failures propagate
 * unchanged). The admitted request is returned for the HOST to route through
 * the T004C effectful seam against an already-authoritative occurrence —
 * this module exposes no mutation dispatch and performs no effect
 * classification of its own (the T004C-owned gate derives the frozen effect
 * class from the exact current graph at re-admission).
 */
export declare function admitAgentMutationIntent(input: AdmitAgentMutationIntentInput): Promise<AdmittedToolInvocationRequest>;
//# sourceMappingURL=agent-tool-projection.d.ts.map