/**
 * v0.7 Assembly-plane Tool implementation binding (issue #607, fine-grained
 * DAG T003C; authority #589 PACK-A).
 *
 * The Microkernel seam that binds the ALREADY-SELECTED exact Tool Component
 * (T003B Definition-plane evidence, consumed here, never re-selected) to
 * exactly one compatible exact Tool implementation. The Microkernel owns
 * exact binding evidence/currentness through this module — never concrete
 * Tool semantics: no provider selection, no invocation, no resource
 * resolution, no ToolRegistry authority and no concrete Tool implementation
 * import exists here.
 *
 * Normative rules owned here, without exception (#589 PACK-A T003C):
 * - the exact pin contains the exact Tool Component identity plus
 *   implementationId + implementationVersion + implementation content digest
 *   plus the exact supported operation identities where required;
 *   function/module path, process handle, registry order and mutable provider
 *   objects are NEVER identity;
 * - zero compatible implementations => typed `MISSING_TOOL_IMPLEMENTATION`;
 *   multiple compatible implementations without an exact authoritative pin =>
 *   `AMBIGUOUS_TOOL_IMPLEMENTATION`; never first/latest/default/ordering;
 * - an exact authoritative pin (all three identity fields) resolves
 *   ambiguity; a pin that matches no offered candidate exactly (id, version
 *   AND digest) fails `MISSING_TOOL_IMPLEMENTATION`; a pin whose candidate is
 *   incompatible fails `INCOMPATIBLE_TOOL_IMPLEMENTATION`;
 * - compatibility is exact operation-support containment of the bound
 *   operation set — every bound operation must be an operation the candidate
 *   declares support for. When `requiredOperations` is omitted, the bound set
 *   is exactly every operation the Tool Component declares (canonical whole
 *   Tool binding); narrowing is caller-explicit, never inferred;
 * - the runtime implementation handle is paired with the exact pin on the
 *   sealed binding, OUTSIDE every digest material: two candidates with
 *   identical pin identity but different handles bind to byte-identical
 *   evidence;
 * - evidence is fresh/frozen/non-aliasing and binds the DefinitionGraphDigest
 *   + the exact Tool provider (component id + provided capability ref) + the
 *   exact implementation pin + the successor Assembly digest it was minted
 *   into. Replacing the implementation changes the successor assemblyDigest
 *   while the Definition identity (Definition graph digest) is unchanged;
 * - a sealed Assembly is NEVER mutated. The binding is materialized as §G
 *   generic binding evidence through the T002B generic container: the
 *   successor Assembly is created by resealing over the same exact
 *   KindImplementation pins with the new/replaced subject slot. Pre-existing
 *   slots for other subjects are preserved.
 *
 * Authority closure (PACK-A): this module consumes the T003B
 * `CurrentCapabilityProviderSelection` (Definition-plane) and the T002B
 * `SealedRuntimeAssembly` as caller-supplied assembly-plane material. It
 * proves currentness by authoritatively recomputing the Definition graph
 * digest through the #555 seam and requiring it to equal BOTH the digest
 * recorded in the sealed Assembly and the digest bound in the selection —
 * a stale or foreign graph, selection or assembly fails closed with
 * `DEFINITION_GRAPH_DIGEST_MISMATCH` before any evidence is minted. The
 * sealed-Assembly mint (WeakSet) verification remains owned by the T002B
 * admission consumption path; this module never re-derives or bypasses it.
 *
 * Torn-snapshot discipline (#587 §E, same as #555): every authority-bearing
 * caller input is descriptor-safe validated and synchronously snapshotted
 * before the first `await`; after any suspension only module-owned snapshot
 * material is read, so a caller mutating its own graph, selection,
 * candidates or pin while a digest promise is pending can never mint torn
 * or hybrid binding evidence.
 *
 * Boundary: validation consumes the shared descriptor-safe record primitive
 * and unified exact-reference authority of `record-safety.ts` (#557 +
 * #578), the T002B generic container (`sealRuntimeAssembly`), the #555
 * Definition graph digest seam, and the T003A Tool declaration validator
 * (`validateToolComponent`) — all imported, never reimplemented. No
 * Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage import
 * is permitted in this file.
 */
import type { CapabilityContractRef, ComponentId } from './component.js';
import { type DefinitionGraphEnvelope } from './definition-graph.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
import type { CurrentCapabilityProviderSelection } from './capability-provision.js';
import { type SealedRuntimeAssembly } from './runtime-assembly.js';
/**
 * Fail-closed Tool implementation binding failure taxonomy (#589 PACK-A).
 * Every failure is typed and terminal — none carries or suggests a
 * substitute/default/latest resolution, and no diagnostic ever serializes
 * implementation handles, secret values or live objects (only exact identity
 * strings participate).
 *
 * Consumer-verifier additions (#640; #589 §A A1–A4) — the five frozen
 * deterministic failures downstream consumers (T003E/T004B) rely on:
 * - `UNMINTED_TOOL_IMPLEMENTATION_BINDING`: an authority use over an object
 *   that is not a member of the module-private mint registry;
 * - `TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH`: the verified evidence
 *   material is malformed, not canonical, or its recomputed v1 bindingDigest
 *   does not equal `evidence.bindingDigest`;
 * - `MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING`: no final-Assembly slot for
 *   the exact subject exists (never repaired by another slot/alias);
 * - `STALE_TOOL_IMPLEMENTATION_BINDING`: the subject slot was replaced by a
 *   different bindingDigest, or the final Assembly's Definition identity no
 *   longer matches the evidence;
 * - `TOOL_IMPLEMENTATION_PIN_MISMATCH`: a consumer-supplied expected exact
 *   implementation pin does not equal the verified evidence pin.
 */
export type ToolImplementationBindingErrorCode = 'INVALID_BINDING_INPUT' | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN' | 'MISSING_TOOL_IMPLEMENTATION' | 'AMBIGUOUS_TOOL_IMPLEMENTATION' | 'INCOMPATIBLE_TOOL_IMPLEMENTATION' | 'DEFINITION_GRAPH_DIGEST_MISMATCH' | 'UNMINTED_TOOL_IMPLEMENTATION_BINDING' | 'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH' | 'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING' | 'STALE_TOOL_IMPLEMENTATION_BINDING' | 'TOOL_IMPLEMENTATION_PIN_MISMATCH';
export declare class ToolImplementationBindingError extends Error {
    readonly code: ToolImplementationBindingErrorCode;
    /**
     * AMBIGUOUS only: the conflicting implementationIds, sorted
     * lexicographically, so the failure diagnostics are deterministic under
     * every candidate ordering. Empty for every other code.
     */
    readonly conflictingImplementationIds: readonly string[];
    constructor(code: ToolImplementationBindingErrorCode, message: string, conflictingImplementationIds?: readonly string[]);
}
/**
 * Exact, immutable identity of one Tool implementation. All three fields are
 * exact opaque identities — never ranges/floating selectors — and the
 * content digest pins the exact implementation content/artifact. Module
 * paths, provider objects, function source text and live handles are NOT
 * authority identity.
 */
export interface ToolImplementationIdentity {
    /** Exact opaque implementation identity — never a range/floating selector. */
    readonly implementationId: string;
    /** Exact opaque implementation version — never a range/floating/x-range selector. */
    readonly implementationVersion: string;
    /** Valid content digest of the exact implementation content/artifact. */
    readonly implementationDigest: ContentDigest;
}
/**
 * One offered Tool implementation candidate. The candidate envelope is
 * whitelisted to exactly {implementation, supportedOperations, handle?}:
 * module paths, provider objects, registry entries and invoke functions are
 * structurally unrepresentable. `handle` is an opaque runtime value paired
 * with the pin OUTSIDE digest material — it never participates in identity,
 * compatibility, evidence or diagnostics.
 */
export interface ToolImplementationCandidate {
    /** The exact implementation pin identity. */
    readonly implementation: ToolImplementationIdentity;
    /** Exact operation identities this candidate declares support for. */
    readonly supportedOperations: readonly string[];
    /** Opaque runtime handle; paired outside digest material, never identity. */
    readonly handle?: unknown;
}
/** Complete binding input. All authority-bearing material is synchronously
 * snapshot at call time; the caller's objects are never frozen or mutated. */
export interface BindToolImplementationInput {
    /** The sealed Runtime Assembly to bind into (never mutated). */
    readonly assembly: SealedRuntimeAssembly;
    /** The T003B Definition-plane selection evidence (consumed, not owned). */
    readonly selection: CurrentCapabilityProviderSelection;
    /** The live Definition graph; its digest is authoritatively recomputed. */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    /** The offered Tool implementation candidates (the caller's exact set). */
    readonly implementations: readonly ToolImplementationCandidate[];
    /**
     * Optional exact narrowing of the bound operation set. Each entry must be
     * an operation the Tool Component declares. Omitted = the canonical whole
     * Tool binding (every declared operation).
     */
    readonly requiredOperations?: readonly string[];
    /**
     * Optional exact authoritative pin resolving ambiguity: all three identity
     * fields must equal one offered candidate exactly. Never first/latest.
     */
    readonly exactPin?: ToolImplementationIdentity;
    /** The Sha256Port used for every authoritative digest recomputation. */
    readonly sha256: Sha256Port;
}
/**
 * Serializable, content-addressed Tool implementation binding evidence.
 * Fresh, frozen, non-aliasing; binds the DefinitionGraphDigest + the exact
 * Tool provider + the exact implementation pin + the successor Assembly
 * digest. No handle, secret, endpoint, provider object or invocation field
 * is representable.
 */
export interface ToolImplementationBindingEvidence {
    readonly status: 'BOUND';
    /** Exact Definition graph content digest, authoritatively recomputed. */
    readonly definitionGraphDigest: ContentDigest;
    /** Digest of the successor Assembly this evidence was minted into. */
    readonly assemblyDigest: ContentDigest;
    /** Exact identity of the already-selected Domain Tool Component. */
    readonly toolComponentId: ComponentId;
    /** The exact capability ref the Tool provider was selected for. */
    readonly providesCapability: CapabilityContractRef;
    /** The exact implementation pin (id/version/content digest). */
    readonly implementation: ToolImplementationIdentity;
    /** The exact bound operation identities, order-normalized. */
    readonly supportedOperations: readonly string[];
    /** Content digest of the exact binding evidence material. */
    readonly bindingDigest: ContentDigest;
}
/**
 * Private anti-forgery brand. The `unique symbol` computed key is not
 * exported, so no external code can construct a value satisfying
 * `SealedToolImplementationBinding`; future consumers verify mint through the
 * module-private registry pattern of T002B.
 */
declare const SEALED_TOOL_BINDING_BRAND: unique symbol;
/**
 * The sealed Tool implementation binding: the serializable evidence, the
 * successor sealed Assembly (carrying the §G evidence slot), and the runtime
 * implementation handle paired with the exact pin outside digest material.
 * Minted only by `bindToolImplementation`; freezing is deep on identity
 * material, the handle is paired by reference as an opaque runtime value.
 */
export interface SealedToolImplementationBinding {
    /** Serializable content-addressed binding evidence. */
    readonly evidence: ToolImplementationBindingEvidence;
    /** The successor sealed Assembly created through the T002B container. */
    readonly successorAssembly: SealedRuntimeAssembly;
    /** Opaque runtime handle paired with the exact pin (never digest material). */
    readonly implementationHandle: unknown;
    readonly [SEALED_TOOL_BINDING_BRAND]: true;
}
/**
 * Bind the already-selected exact Tool Component to exactly one compatible
 * exact Tool implementation.
 *
 * Authority boundary: the sealed input Assembly is never mutated. Binding
 * evidence is minted fresh/frozen/non-aliasing, then a SUCCESSOR Assembly is
 * created through the T002B generic container by resealing over the same
 * exact KindImplementation pins with the new (or replacement) §G evidence
 * slot for the exact Tool Component subject; prior slots for other subjects
 * are preserved.
 *
 * Fail-closed precedence: input shape, assembly/selection snapshot, graph +
 * Tool declaration validation (propagated unchanged), selection/graph
 * consistency, operation exactness, candidate snapshot, the synchronous
 * binding decision (missing/ambiguous/incompatible), then the async
 * currentness recomputation (DEFINITION_GRAPH_DIGEST_MISMATCH) and the
 * evidence/successor digest work. Never downgrades a failure.
 *
 * Torn-snapshot discipline: everything authority-bearing is synchronously
 * snapshotted before the first `await`; after the currentness suspension
 * only module-owned snapshot material is read and resealed.
 */
export declare function bindToolImplementation(input: BindToolImplementationInput): Promise<SealedToolImplementationBinding>;
/**
 * Read-only synchronous mint-membership verifier/type guard (#589 §A A1 —
 * the T002B `isSealedRuntimeAssembly` precedent). The module-private WeakSet
 * mint registry is the authoritative test — it cannot be satisfied by
 * prototype inheritance or symbol reflection, since only
 * `bindToolImplementation` ever adds a member. The unique-symbol brand is
 * kept as defense in depth, but consulted as an OWN property only
 * (`Object.hasOwn`), so a brand value inherited through a forged prototype
 * chain or stolen by symbol reflection contributes nothing: brand, property
 * shape and copied field values alone are never sufficient.
 *
 * The guard can never be used to mint or forge a member; consumers (T003E
 * closure, T004B admission) rely on it to prove a caller-supplied binding is
 * a genuine `bindToolImplementation` mint before any authority use.
 */
export declare function isSealedToolImplementationBinding(value: unknown): value is SealedToolImplementationBinding;
/**
 * Fresh frozen, non-aliased verified currentness material (#589 §A A3.5):
 * carries the exact Definition identity, the CURRENT final Assembly digest,
 * the exact T003C subject and the exact verified bindingDigest. No handle,
 * provider object or invocation field is representable.
 */
export interface VerifiedToolImplementationCurrentness {
    readonly status: 'CURRENT';
    /** Exact Definition identity, equal to the verified evidence's graph digest. */
    readonly definitionGraphDigest: ContentDigest;
    /** Content digest of the exact current final Assembly currentness was decided against. */
    readonly finalAssemblyDigest: ContentDigest;
    /** The exact T003C subject (`evidence.toolComponentId`). */
    readonly subject: ComponentId;
    /** The exact verified bindingDigest matched in the final Assembly slot. */
    readonly bindingDigest: ContentDigest;
}
/**
 * Fresh frozen, non-aliased verified evidence: the descriptor-safe snapshot
 * of the verified evidence material plus the final-Assembly currentness
 * decided against the exact current final Assembly (#589 §A A2/A3). Never
 * carries a runtime handle.
 */
export interface VerifiedToolImplementationBindingEvidence {
    readonly status: 'VERIFIED';
    /** The verified evidence snapshot (v1 digest material + provenance fields). */
    readonly evidence: ToolImplementationBindingEvidence;
    /** The verified final-Assembly currentness. */
    readonly currentness: VerifiedToolImplementationCurrentness;
}
/** Input of the T003C-owned evidence verifier (#589 §A A2). */
export interface VerifyToolImplementationBindingEvidenceInput {
    /**
     * The authority-bearing evidence material to verify. Descriptor-safely
     * snapshotted synchronously before the first `await`; unsafe hidden or
     * accessor structure fails the deterministic invalid-input taxonomy before
     * evidence verification, and malformed/non-canonical/digest-mismatching
     * material fails `TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH`.
     */
    readonly evidence: unknown;
    /** The exact current final sealed Assembly (genuine T002B mint). */
    readonly finalAssembly: SealedRuntimeAssembly;
    /** The Sha256Port used for the authoritative v1 digest recomputation. */
    readonly sha256: Sha256Port;
}
/** Input of the binding verification path (#589 §A A4). */
export interface VerifyToolImplementationBindingInput {
    /** The exact sealed binding to verify — must be a module-private mint. */
    readonly binding: SealedToolImplementationBinding;
    /** The exact current final sealed Assembly (genuine T002B mint). */
    readonly finalAssembly: SealedRuntimeAssembly;
    /**
     * Optional consumer-supplied exact implementation pin (all three identity
     * fields) that must equal the verified evidence pin exactly; a mismatch
     * fails `TOOL_IMPLEMENTATION_PIN_MISMATCH`. Never resolved against
     * candidates, ordering, latest or any other lookup.
     */
    readonly expectedImplementationPin?: ToolImplementationIdentity;
    /** The Sha256Port used for the authoritative v1 digest recomputation. */
    readonly sha256: Sha256Port;
}
/**
 * Fresh frozen, non-aliased verified binding (#589 §A A4): the verified
 * evidence and currentness material, plus the ORIGINAL opaque runtime
 * implementation handle reference — exposed/paired only after mint, evidence,
 * final-slot and exact-pin verification all succeeded. The handle remains
 * outside every semantic digest and never supplies authority/currentness.
 */
export interface VerifiedToolImplementationBinding {
    readonly status: 'VERIFIED_CURRENT';
    /** The verified evidence snapshot (never carries the handle). */
    readonly evidence: ToolImplementationBindingEvidence;
    /** The verified final-Assembly currentness. */
    readonly currentness: VerifiedToolImplementationCurrentness;
    /** The original opaque handle reference, paired after full verification. */
    readonly implementationHandle: unknown;
}
/**
 * The T003C-owned consumer evidence verifier (#640; #589 §A A2): owns ALL
 * parsing/canonicalization/digest reconstruction for
 * `ToolImplementationBindingEvidence`. T003E/T004B call this seam and never
 * copy the digest algorithm.
 *
 * Pipeline: descriptor-safe structure capture of the evidence and the exact
 * final Assembly material synchronously before the first `await` (unsafe
 * hidden/accessor structure fails INVALID_BINDING_INPUT here, with zero
 * getter executions); exact closed v1 material validation
 * (`TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH`); authoritative v1 digest
 * recomputation and exact-equality check; then final-Assembly currentness by
 * exact Definition identity, exact subject slot and exact bindingDigest match
 * (missing → `MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING`, replaced/foreign
 * → `STALE_TOOL_IMPLEMENTATION_BINDING`). The returned evidence and
 * currentness are fresh frozen and non-aliased; `evidence.assemblyDigest`
 * remains historical provenance and is never compared to the final Assembly.
 */
export declare function verifyToolImplementationBindingEvidence(input: VerifyToolImplementationBindingEvidenceInput): Promise<VerifiedToolImplementationBindingEvidence>;
/**
 * The T003C binding verification path over the exact
 * `SealedToolImplementationBinding` object (#640; #589 §A A4): first proves
 * module-private mint membership (`UNMINTED_TOOL_IMPLEMENTATION_BINDING`),
 * then verifies the embedded evidence with the A2/A3 semantics against the
 * exact current final Assembly, then requires any consumer-supplied expected
 * exact implementation pin to equal the verified evidence pin exactly
 * (`TOOL_IMPLEMENTATION_PIN_MISMATCH`) — only then is the ORIGINAL opaque
 * `implementationHandle` reference paired with the fresh verified evidence.
 *
 * The handle, module path, function identity and registry objects remain
 * outside every semantic digest and never supply authority/currentness; no
 * lookup by implementation id, registry order, latest/default or first match
 * exists. Torn-snapshot discipline (#589 §A A5): all authority material is
 * synchronously snapshotted before the first `await`, and the returned
 * structures are fresh frozen and non-aliased.
 */
export declare function verifyToolImplementationBinding(input: VerifyToolImplementationBindingInput): Promise<VerifiedToolImplementationBinding>;
export {};
//# sourceMappingURL=tool-implementation-binding.d.ts.map