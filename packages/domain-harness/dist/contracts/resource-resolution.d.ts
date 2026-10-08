/**
 * v0.7 Runtime Resource injection/resolution port (issue #608, fine-grained
 * DAG T005B; planning authority #589 PACK-A T005B section).
 *
 * HOST_INTEGRATION behind a generic `ResourceProvider` port. This module owns
 * exactly the T005B concerns and nothing else:
 *
 * - `resolveToolResources` resolves ONLY the logical requirements contained in
 *   the exact sealed Runtime Assembly (T002B canonical #568 material) for one
 *   affected Tool Component (optionally narrowed to one exact invocation
 *   operation). Requirements not in the Assembly are never requested from a
 *   provider, and nothing outside the Assembly material can add requirements;
 * - required missing/incompatible fails closed (typed) BEFORE any affected
 *   Tool invocation/effect authority can be granted — resolution either
 *   returns a complete result or throws; there is no partial success;
 * - optional missing/incompatible is an EXPLICIT absence entry — never an
 *   ambient, default, or fallback value. No caller-visible default handle
 *   exists anywhere in this module;
 * - the `ResourceProvider` is INJECTED per call. This module imports no
 *   SQLite/HTTP/filesystem/cloud (or any other concrete) resource
 *   implementation and exposes no registry, catalog, or lookup of its own;
 * - live values/secrets/tokens/handles/connections never enter any diagnostic
 *   this module produces: error messages carry only exact identity strings
 *   (resourceKey / contractId / version) from the sealed Assembly material.
 *   A provider's thrown error message, returned handle, and any unknown
 *   provider-response values are NEVER propagated into messages. Provider-
 *   controlled own-key names and symbol descriptions are not echoed either
 *   (#643): they may themselves be secret-shaped (`sk-…`), prototype-pollution
 *   (`__proto__`), or control-character material, so diagnostics carry only a
 *   bounded, non-secret, deterministic classification of them. Handles are
 *   runtime-only references inside the result map and are never serialized;
 * - torn-snapshot discipline (same as #587 §E): every authority-bearing input
 *   (options, Assembly record requirement material) is descriptor-safe
 *   validated and snapshotted SYNCHRONOUSLY before the first provider
 *   suspension; each provider response is synchronously snapshotted
 *   immediately after its await. The caller's objects are never re-read after
 *   an await, and the caller's objects are never frozen or mutated;
 * - provider-response inspection is contained (#794): a hostile response
 *   object — e.g. a Proxy whose descriptor/ownKeys/get traps throw, or an
 *   engine Proxy-invariant TypeError — cannot escape the synchronous response
 *   snapshot as an untyped provider-controlled exception. Every such escape
 *   fails closed as a deterministic typed INVALID_RESOURCE_PROVIDER_RESPONSE
 *   whose fixed message never echoes the caught value's text;
 * - no provider downgrade/latest/default/order fallback: exactly one injected
 *   provider is consulted, exactly once per requirement, in canonical
 *   (componentId, resourceKey) order. A failure is terminal — never retried,
 *   never substituted.
 *
 * T005C resource-currentness capture (issue #656): a `resolved` provider
 * response MAY carry a stable NON-SECRET resource-instance/currentness pin
 * (`currentnessPin`: exact provider identity + exact resource identity +
 * exact revision/currentness digest; field names are implementation detail).
 * This module is the structural fence for that material: a closed field
 * whitelist, exact non-floating identity strings and an exact resourceKey
 * match are enforced synchronously right after the provider await, the
 * captured snapshot is frozen/non-aliased, and no secret value, credential,
 * live handle, connection object, function or provider object can ever be
 * represented in it or in any diagnostic. Capture is ADDITIVE and
 * capture-only: a required resource resolved without a pin still resolves
 * (an invented/default/fallback pin would be a lie) — whether pinned evidence
 * is mandatory for an occurrence is owned by the T005C activation gate, which
 * consumes ONLY material produced/validated here.
 *
 * Deliberately absent (successor-owned):
 * - activation/execution-currentness integration of the captured evidence and
 *   the required/optional currentness posture gate (T005C governance seam,
 *   `governance/execution-binding.ts` + `governance/assembly-activation.ts`)
 *   — resolution still grants nothing; a resolved handle remains an OPAQUE
 *   runtime value and never becomes authority by itself;
 * - invocation request/admission and exposure authority (T004A) — resolution
 *   grants nothing; the caller decides, after resolution, whether to proceed;
 * - Assembly sealing/anti-forgery minting (T002B) — this module structurally
 *   validates and snapshots the requirement material it consumes, but the
 *   sealed-Assembly brand/mint registry remains the T002B authority boundary
 *   upstream. Callers in real flows hold an Assembly minted by
 *   `sealRuntimeAssembly`;
 * - any public barrel exposure (T001E/#570) — this module is internal, like
 *   its T005A/T002B siblings.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), imported never reimplemented. The canonical requirement
 * material types are consumed from `runtime-assembly.ts` (T002B), the
 * declaration contract from `resource-requirements.ts` (T005A).
 */
import type { ComponentId } from './component.js';
import type { ContentDigest } from './identity.js';
import type { ResourceContractRef } from './resource-requirements.js';
import type { SealedRuntimeAssembly } from './runtime-assembly.js';
/**
 * The exact logical resolution request handed to the injected provider: a
 * synchronous, frozen snapshot of one sealed-Assembly requirement. The
 * provider receives exact identities only — never the caller's live objects.
 */
export interface ResourceResolutionRequest {
    /** Exact owner Tool Component logical identity. */
    readonly componentId: ComponentId;
    /** Stable exact logical Runtime Resource identity (a name, not a location). */
    readonly resourceKey: string;
    /** Optional exact/versioned resource semantic contract from the Assembly. */
    readonly contract?: ResourceContractRef;
    /** Optional exact operation narrowing from the Assembly. */
    readonly operationId?: string;
    /** The requirement's explicit criticality — the provider sees it verbatim. */
    readonly required: boolean;
}
/**
 * T005C (#656): stable NON-SECRET resource-instance/currentness pin material
 * for one resolved resource, supplied by the provider on a `resolved`
 * response. Exactly the three closed fields — the exact provider identity,
 * the exact resource identity (which must equal the requirement's
 * `resourceKey`) and one exact revision/content/currentness digest. Secret
 * values, credentials, live handles, connection objects, functions/module
 * paths and provider objects are structurally unrepresentable (closed
 * whitelist of exact identity strings only; unknown fields fail closed).
 */
export interface ResourceCurrentnessPin {
    /** Exact non-secret provider identity that attests the instance revision. */
    readonly providerId: string;
    /** Exact resource identity — must equal the requirement's `resourceKey`. */
    readonly resourceKey: string;
    /** Exact non-floating revision/content/currentness digest. */
    readonly revisionDigest: ContentDigest;
}
/**
 * T005C (#656): occurrence-level resource-currentness evidence consumed by
 * the governance activation/execution-currentness seam: the exact owner
 * component plus the stable non-secret instance pin resolved for it. This is
 * the ONLY shape the T002C execution pin ever carries for resources — plain
 * exact identity/digest material, never a live value, handle or provider
 * object.
 */
export interface ResourceCurrentnessEvidence {
    /** Exact owner component logical identity. */
    readonly componentId: ComponentId;
    /** Exact non-secret provider identity that attests the instance revision. */
    readonly providerId: string;
    /** Exact resource identity. */
    readonly resourceKey: string;
    /** Exact non-floating revision/content/currentness digest. */
    readonly revisionDigest: ContentDigest;
}
/**
 * One provider response. The `handle` is an OPAQUE runtime value: this
 * module never inspects, serializes, or diagnoses it. `contract` on a
 * `resolved` response is the exact contract the provider claims to satisfy —
 * the kernel verifies the exact match against the Assembly requirement, it
 * never trusts the status string alone. `supportedContracts` on an
 * `incompatible` response is diagnostic-only identity material. The optional
 * T005C `currentnessPin` is stable non-secret instance/currentness evidence
 * only (closed whitelist, exact identities/digest, structural secret/handle
 * fence); it is capture-only here and carries no authority by itself.
 */
export type ResourceProviderResponse = {
    readonly status: 'resolved';
    readonly handle: unknown;
    readonly contract?: ResourceContractRef;
    readonly currentnessPin?: ResourceCurrentnessPin;
} | {
    readonly status: 'absent';
} | {
    readonly status: 'incompatible';
    readonly supportedContracts?: readonly ResourceContractRef[];
};
/**
 * The generic injected HOST_INTEGRATION port. One implementation is supplied
 * per resolution call by the host; the core never selects, ranks, caches, or
 * fallbacks between providers. `resolve` may be async; a synchronous throw
 * or a rejection surfaces as `RESOURCE_PROVIDER_FAILURE` (typed) — the
 * provider's own error text is never propagated (redaction discipline). A
 * hostile response object that throws during the response snapshot/inspection
 * fails closed the same way as typed `INVALID_RESOURCE_PROVIDER_RESPONSE`
 * (#794) — its trap/error text is never propagated either.
 */
export interface ResourceProvider {
    readonly resolve: (request: ResourceResolutionRequest) => Promise<ResourceProviderResponse>;
}
/** Resolution input. All authority-bearing material is snapshotted synchronously. */
export interface ResolveToolResourcesOptions {
    /** The exact sealed Runtime Assembly whose requirements are resolved. */
    readonly assembly: SealedRuntimeAssembly;
    /** Exact affected Tool Component identity (must own requirements in the Assembly). */
    readonly componentId: ComponentId;
    /** Optional exact invocation operation; absent = component-scope resolution. */
    readonly operationId?: string;
    /** The injected provider — the only host-integration surface. */
    readonly provider: ResourceProvider;
}
/**
 * One resolved entry. `resolved` carries the opaque runtime handle and, when
 * the provider supplied one, the T005C stable non-secret currentness pin as
 * a frozen, non-aliased snapshot (T005C activation owns the posture gate);
 * `absent` is the explicit, first-class representation of an unmet OPTIONAL
 * requirement — never a default/ambient stand-in.
 */
export type ResolvedResourceEntry = {
    readonly resourceKey: string;
    readonly status: 'resolved';
    readonly handle: unknown;
    readonly currentnessPin?: ResourceCurrentnessPin;
} | {
    readonly resourceKey: string;
    readonly status: 'absent';
};
/**
 * The complete resolution result for one affected Tool invocation scope.
 * Runtime-only: the map is never digest material, never diagnostics material,
 * and never carries authority/currentness evidence (T005C owns identity).
 */
export interface ResolvedToolResources {
    /** Exact owner Tool Component identity. */
    readonly componentId: ComponentId;
    /** Present only when the resolution was operation-scoped. */
    readonly operationId?: string;
    /** Resolved entries keyed by exact resourceKey (canonical insertion order). */
    readonly resources: ReadonlyMap<string, ResolvedResourceEntry>;
}
/**
 * Fail-closed T005B failure taxonomy (#589 PACK-A). Every failure is typed
 * and terminal — none carries or suggests a substitute/default/latest
 * resolution, and no diagnostic ever serializes provider handles, secret
 * values, or provider-supplied free text (only exact identity strings from
 * the sealed Assembly material participate). Provider-controlled own-key
 * names and symbol descriptions participate only as bounded, non-secret,
 * deterministic classifications (#643) — never verbatim.
 */
export type ResourceResolutionErrorCode = 'INVALID_RESOLUTION_INPUT' | 'INVALID_RESOURCE_PROVIDER_RESPONSE' | 'MISSING_REQUIRED_RESOURCE' | 'INCOMPATIBLE_RESOURCE' | 'RESOURCE_PROVIDER_FAILURE';
export declare class ResourceResolutionError extends Error {
    readonly code: ResourceResolutionErrorCode;
    constructor(code: ResourceResolutionErrorCode, message: string);
}
/**
 * Resolve the exact sealed-Assembly resource requirements for one affected
 * Tool invocation scope, through the single injected `ResourceProvider`.
 *
 * Authority rules (#589 PACK-A T005B):
 *
 * - ONLY requirements contained in the exact sealed Assembly are resolved;
 *   the provider is asked exactly once per applicable requirement, in
 *   canonical (resourceKey) order, and nothing else;
 * - a required resource that is missing (`absent`) or incompatible (provider
 *   `incompatible`, or a `resolved` response whose exact contract does not
 *   exactly equal the Assembly requirement contract) fails closed with a
 *   typed error BEFORE this function returns — i.e. before any affected Tool
 *   invocation/effect authority can be granted by the caller. Failures are
 *   terminal: no retry, no second provider, no downgrade/latest/default;
 * - an optional resource that is missing or incompatible is returned as an
 *   explicit `absent` entry — never an ambient/default fallback value;
 * - resolved handles are opaque runtime values; when the provider supplies a
 *   T005C stable non-secret currentness pin it is validated (closed
 *   whitelist, exact identities, exact resourceKey match) and captured as a
 *   frozen/non-aliased snapshot on the entry — capture only, never authority
 *   (the T005C activation/currentness gate consumes and owns the posture);
 * - torn-snapshot discipline: all Assembly material and options are
 *   snapshotted synchronously before the first provider suspension, and every
 *   provider response is snapshotted synchronously right after its await. The
 *   caller mutating its own objects mid-resolution cannot affect the result;
 * - redaction: no error message ever contains a provider handle, a provider
 *   thrown-message, or any provider-supplied value — only exact identity
 *   strings from the Assembly material; provider-controlled own-key names and
 *   symbol descriptions appear only as bounded, non-secret, deterministic
 *   classifications (#643).
 */
export declare function resolveToolResources(options: ResolveToolResourcesOptions): Promise<ResolvedToolResources>;
//# sourceMappingURL=resource-resolution.d.ts.map