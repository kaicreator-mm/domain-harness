/**
 * v0.7 Definition-plane Capability provider selection (issue #553, fine-grained
 * DAG T003B).
 *
 * The frozen L2 fixes the normative posture this module implements: Capability
 * remains a stable `requires/provides` contract identity, and **selection among
 * multiple Domain Tool providers is Definition authority** — Assembly may only
 * bind the already-selected provider to exactly one compatible implementation.
 * This file IS that Definition authority for the single-ref case: given a
 * validated `DefinitionGraphEnvelope` and one exact required
 * `CapabilityContractRef`, it deterministically names the one Domain Tool
 * Component whose `providesCapabilities` declares that exact ref — or fails
 * closed with a typed error when zero or multiple eligible providers exist.
 *
 * Boundary rules owned here, without exception:
 * - provider candidacy is Tool-family only; semantic-family components are
 *   never providers, and a component's own `requiredCapabilities` is never
 *   provider evidence (no silent self-provision);
 * - matching is exact ref equality on BOTH fields — no normalization, no
 *   ranges, no compat suffixes, no nearest-version, no ordering/priority;
 * - graph envelope failures propagate the original
 *   `DefinitionGraphContractError` unwrapped; tool declaration failures
 *   propagate the original `ToolComponentContractError` unwrapped (a broken
 *   tool body must never silently "provide nothing");
 * - the selection is a pure function: no input mutation, no ambient state, no
 *   I/O; invariant under every ordering of bound components and declared refs;
 * - the result evidence carries Component identity + capability ref only — no
 *   implementation, module, binding, pin, digest, endpoint or routing
 *   identity is representable.
 *
 * Definition-currentness-bound selection (issue #572, R2 delta): the additive
 * seam `resolveCurrentCapabilityProvider` reuses the same candidacy core but
 * additionally binds the decision to the exact current Definition graph
 * digest (recomputed through the #555 seam and compared against a supplied
 * claimed digest) and to the exact consumer Component that actually declares
 * the required capability in its `requiredCapabilities`. Its result proves,
 * and proves only:
 *
 *   PROVEN:     DEFINITION_SELECTION_CURRENTNESS_BOUND (exact graph content
 *               digest, recomputed and matched before any evidence is minted)
 *               + CONSUMER_REQUIREMENT_PROVEN (the exact ref occurs in the
 *               bound consumer's requiredCapabilities)
 *               + PROVIDER_CHOICE_PROVEN (deterministic exact-ref selection).
 *   NOT PROVEN: MUST_UNDERSTAND_ADMISSION (no trusted admission evidence is
 *               consumed), ASSEMBLY_KIND_PROVENANCE (no sealed Runtime
 *               Assembly / KindImplementation provenance), and
 *               RUNTIME_AUTHORITY_GRADE. A structurally valid, current graph
 *               without trusted admission provenance may therefore obtain a
 *               `CurrentCapabilityProviderSelection`, but that evidence is
 *               Definition-currentness-bound Definition selection — never
 *               admitted or runtime-authoritative evidence.
 *
 * T003C/#575 consumption guard: a `CurrentCapabilityProviderSelection`
 * without trusted must-understand admission evidence and exact sealed Runtime
 * Assembly / KindImplementation provenance MUST NOT be used to mint an
 * authoritative implementation binding. Authority closure is owned by
 * T003C/T003E with the #575/T002B conjunction:
 *
 *   currentness-bound Definition provider selection
 *   + trusted must-understand admission evidence
 *   + exact sealed Runtime Assembly / KindImplementation provenance
 *
 * Runtime enforcement of that conjunction lands with T003C/#575 and is
 * intentionally out of scope here.
 *
 * Input validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578, the
 * PR-2 retrofit): the required capability ref and the optional consumer id
 * are validated on descriptor-safe snapshots, so accessor-backed,
 * symbol-keyed, non-enumerable or exotic-prototype input is rejected before
 * any authority use, and downstream authority reads consume the validated
 * snapshot — never the caller-owned object. The exported runtime surface is
 * unchanged; no new public name is added.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - assembly-plane implementation binding/registries/pins (T003C): assembly
 *   may never choose a different provider than this selection returns;
 * - host/domain capability-plane collision semantics (T003D);
 * - capability closure, recursion or batch resolution over required
 *   capabilities (T003E — exactly one required ref per call);
 * - Tool invocation runtime, occurrence anchoring, exposure authority (T004);
 * - runtime resource resolution (T005).
 */
import type { CapabilityContractRef, ComponentId } from './component.js';
import { type DefinitionGraphEnvelope } from './definition-graph.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
export type CapabilityProvisionErrorCode = 'CAPABILITY_PROVIDER_NOT_FOUND' | 'CAPABILITY_PROVIDER_AMBIGUOUS' | 'INVALID_SELECTION_INPUT' | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN' | 'CONSUMER_CAPABILITY_NOT_REQUIRED' | 'DEFINITION_GRAPH_DIGEST_MISMATCH';
/**
 * Typed, fail-closed selection failure. Never recovered from, never wrapped:
 * graph/tool contract errors from the imported validators surface unchanged
 * (they are distinct error classes, not this one).
 */
export declare class CapabilityProvisionContractError extends Error {
    readonly code: CapabilityProvisionErrorCode;
    /**
     * AMBIGUOUS only: the conflicting provider ComponentIds, sorted
     * lexicographically, so the failure diagnostics are deterministic under
     * every component ordering. Empty for every other code.
     */
    readonly conflictingProviderComponentIds: readonly ComponentId[];
    constructor(code: CapabilityProvisionErrorCode, message: string, conflictingProviderComponentIds?: readonly ComponentId[]);
}
/** Provider evidence: exact Component identity plus the exact declared ref. */
export interface CapabilityProviderEvidence {
    /** Exact ComponentId of the single selected Domain Tool Component. */
    readonly componentId: ComponentId;
    /** Always the `tool` family — semantic components are never providers. */
    readonly family: 'tool';
    /** The exact capability ref as declared by the provider. */
    readonly providesCapability: CapabilityContractRef;
}
/**
 * Deterministic selection evidence. Component identity + capability ref only:
 * no Tool Implementation id, module/package path, assembly digest, pin, runtime
 * endpoint, or provider-routing identity is representable. Capability refs in
 * successful evidence are fresh frozen values, never aliases of caller-owned
 * request/graph objects.
 *
 * This is candidate-discovery evidence: it is not bound to a graph
 * currentness digest and it carries no consumer-requirement proof, so it is
 * not admitted or runtime-authoritative evidence (see
 * `CurrentCapabilityProviderSelection` and the module docstring).
 */
export interface CapabilityProviderSelection {
    /** Graph identity the selection was derived from. */
    readonly graphId: string;
    /** The exact required ref as immutable value evidence (never normalized). */
    readonly requiredCapability: CapabilityContractRef;
    /** The one Definition-selected Domain Tool provider. */
    readonly provider: CapabilityProviderEvidence;
}
/**
 * Consumer-requirement evidence inside a currentness-bound selection: the
 * exact ComponentId plus the exact capability ref as copied (and frozen) from
 * that Component's `requiredCapabilities` in the validated graph — proof that
 * this consumer actually declares this exact requirement in this exact graph
 * content. Never an alias of caller-owned graph/envelope objects.
 */
export interface CurrentCapabilityConsumerEvidence {
    /** Exact ComponentId of the bound consumer Component. */
    readonly componentId: ComponentId;
    /** The exact required ref as declared by the consumer, fresh frozen. */
    readonly requiredCapability: CapabilityContractRef;
}
/**
 * Definition-currentness-bound provider selection evidence (issue #572).
 *
 * PROVEN by this evidence: the exact Definition graph content currentness
 * (`definitionGraphDigest`, recomputed through the #555 seam and matched
 * before minting), the consumer requirement (the exact ref occurs in the
 * bound consumer's `requiredCapabilities`), and the deterministic exact-ref
 * provider choice. NOT PROVEN: must-understand admission, sealed Runtime
 * Assembly / KindImplementation provenance, runtime authority. This type is
 * deliberately named and shaped so it cannot be mistaken for admitted or
 * runtime-authoritative evidence; authority closure is the T003C/T003E +
 * #575/T002B conjunction documented in the module docstring.
 */
export interface CurrentCapabilityProviderSelection {
    /** Graph identity the selection was derived from. */
    readonly graphId: string;
    /**
     * The exact Definition graph content digest, verified by recomputation
     * against the supplied graph before this evidence was minted — the
     * currentness anchor. Never the unverified supplied value alone.
     */
    readonly definitionGraphDigest: ContentDigest;
    /** The exact required ref as declared by the consumer, fresh frozen. */
    readonly requiredCapability: CapabilityContractRef;
    /** The bound consumer plus its declared requirement, fresh frozen. */
    readonly consumer: CurrentCapabilityConsumerEvidence;
    /** The one Definition-selected Domain Tool provider (existing shape). */
    readonly provider: CapabilityProviderEvidence;
}
/**
 * Definition-plane Capability provider selection: deterministically names the
 * one Domain Tool Component whose `providesCapabilities` declares the exact
 * required ref, or fails closed.
 *
 * Purity: the graph is validated (never mutated), candidacy is derived only
 * from the graph and the selection inputs, no ambient state is read and no
 * I/O is performed. The result is invariant under every ordering of bound
 * components, declared refs, and graph relations (relations are never
 * consulted). Failures are deterministic: ambiguity diagnostics are sorted by
 * componentId, and tool declaration validation runs in componentId order so
 * the surfaced `ToolComponentContractError` is permutation-invariant too.
 * Successful evidence owns fresh frozen capability-ref values so later caller
 * mutation cannot alter an already-completed provider-selection decision.
 */
export declare function selectCapabilityProvider(graph: DefinitionGraphEnvelope, requiredCapability: CapabilityContractRef, consumerComponentId?: ComponentId): CapabilityProviderSelection;
/**
 * Definition-currentness-bound Capability provider selection (issue #572).
 *
 * Deterministically names the one Domain Tool Component that provides the
 * exact required ref, exactly like `selectCapabilityProvider`, but the
 * returned evidence is additionally bound to:
 *
 * 1. the exact consumer — `consumerComponentId` is REQUIRED (compile-time and
 *    runtime fail-closed) and must reference a component bound in the graph;
 * 2. the exact consumer requirement — the exact ref (both fields) must occur
 *    in that component's `requiredCapabilities` inside the validated graph,
 *    otherwise `CONSUMER_CAPABILITY_NOT_REQUIRED`;
 * 3. the exact graph currentness — the supplied `currentGraphDigest` is a
 *    CLAIM that must be recomputed through the #555
 *    `computeDefinitionGraphDigest` seam over this exact graph content and
 *    compared; a structurally invalid digest fails `INVALID_SELECTION_INPUT`,
 *    a stale or foreign digest fails `DEFINITION_GRAPH_DIGEST_MISMATCH`. An
 *    unverified supplied digest is never written into evidence.
 *
 * Fail-closed order: graph validation -> ref/consumer exact validation ->
 * consumer requirement membership -> candidacy (the existing
 * `selectCapabilityProvider` core, which also excludes the consumer itself
 * from candidacy — never satisfied-by-self) -> digest recompute/compare.
 * Graph and tool contract errors propagate unwrapped; provider
 * NOT_FOUND/AMBIGUOUS semantics, sorted ambiguity diagnostics and permutation
 * invariance are identical to the candidate API because the candidacy is
 * delegated to it unchanged.
 *
 * Snapshot discipline (#558 seam, extended by the fresh review of #572): the
 * digest seam snapshots the graph synchronously at call time, and this
 * function matches that discipline — candidacy and every authority-bearing
 * capture (the requirement value, the graphId, the frozen evidence refs) run
 * BEFORE the `await computeDefinitionGraphDigest` suspension. After the await
 * only the digest comparison and the return remain, so a caller mutating its
 * own graph while the digest promise is pending can never mint torn hybrid
 * evidence (a digest certifying pre-mutation content alongside
 * requirement/provider/graphId read from post-mutation content).
 *
 * Semantics: this mints Definition-currentness-bound selection evidence, NOT
 * admitted or runtime-authoritative evidence — must-understand admission and
 * sealed Assembly/KindImplementation provenance are not consumed here (see
 * the module docstring and `CurrentCapabilityProviderSelection`).
 */
export declare function resolveCurrentCapabilityProvider(graph: DefinitionGraphEnvelope, requiredCapability: CapabilityContractRef, consumerComponentId: ComponentId, currentGraphDigest: ContentDigest, sha256: Sha256Port): Promise<CurrentCapabilityProviderSelection>;
//# sourceMappingURL=capability-provision.d.ts.map