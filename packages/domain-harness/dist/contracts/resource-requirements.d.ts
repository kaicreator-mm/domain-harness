/**
 * v0.7 Tool logical resource requirement declaration contract (issue #554,
 * fine-grained DAG T005A).
 *
 * The Definition-plane contract material by which a Tool Component declares
 * the Runtime Resources it needs — logical identities only. A resource
 * requirement declaration is a SEPARATE declaration keyed to exactly one Tool
 * Component by exact `componentId` (L2 A6/A11); it is never a field inside the
 * frozen `ToolOperationsDeclaration` (T003A) and never part of any digest.
 *
 * Structural secrets fence (fail-closed): logical requirements cannot carry
 * live values, secrets, credentials, endpoints, handles, or provider/model
 * identities. Enforcement is structural — field whitelist only, no free-form
 * JSON material anywhere in the contract, unknown fields fail closed with
 * typed errors, and the module exports no resolver, reader, or accessor that
 * could bind a requirement to a live resource.
 *
 * Validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578): the
 * declaration and every requirement are validated on descriptor-safe
 * snapshots, so accessor-backed declaration fields are rejected before any
 * authority use, and no hidden getter can execute during validation or
 * diagnostics.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - runtime resource resolution, injection, binding, materialization (T005B);
 * - resource instance identity, currentness, and non-secret pins (T005C);
 * - content/graph digests and digest composition of requirements (T001B/T001C);
 * - must-understand admission (T001D);
 * - graph/relation attachment of declarations to Components (T001C).
 */
import type { ComponentEnvelope, ComponentId } from './component.js';
/**
 * Exact, versioned resource semantic-contract reference. Optional on a
 * requirement: some resources are keyed values with no material contract.
 * Conventions are identical to `SemanticContractRef`/`CapabilityContractRef`.
 */
export interface ResourceContractRef {
    /** Exact resource semantic-contract identity. */
    readonly contractId: string;
    /** Exact version. */
    readonly version: string;
}
/**
 * One logical Runtime Resource requirement: a stable exact logical identity
 * (the resolution key T005B resolves — a logical name, not a location), an
 * optional exact/versioned contract reference, optional exact narrowing to one
 * existing operation of the owner, and a mandatory explicit criticality
 * boolean (L2: "Missing required resource fails closed before the affected
 * invocation/effect"). Nothing else is representable.
 */
export interface ToolResourceRequirement {
    /** Stable exact logical Runtime Resource identity. */
    readonly resourceKey: string;
    /** Optional exact/versioned resource semantic contract. */
    readonly contract?: ResourceContractRef;
    /** Absent = requirement applies at Tool Component scope. */
    readonly operationId?: string;
    /** Mandatory explicit boolean — no default, no coercion. */
    readonly required: boolean;
}
/**
 * The logical resource requirement declaration of exactly one Tool Component.
 * `requirements` may be empty (= declares no requirements).
 */
export interface ToolResourceRequirementsDeclaration {
    /** Exact owner Tool Component logical identity. */
    readonly componentId: ComponentId;
    readonly requirements: readonly ToolResourceRequirement[];
}
export type ResourceRequirementContractErrorCode = 'INVALID_RESOURCE_REQUIREMENTS_DECLARATION' | 'INVALID_RESOURCE_REQUIREMENT_OWNER' | 'INVALID_RESOURCE_REQUIREMENT' | 'INVALID_RESOURCE_KEY' | 'INVALID_RESOURCE_CONTRACT_REF' | 'INVALID_RESOURCE_REQUIREMENT_OPERATION' | 'INVALID_RESOURCE_REQUIREMENT_DUPLICATE' | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN';
export declare class ResourceRequirementContractError extends Error {
    readonly code: ResourceRequirementContractErrorCode;
    constructor(code: ResourceRequirementContractErrorCode, message: string);
}
/**
 * Structural fail-closed validation of one Tool Component's logical resource
 * requirement declaration. Synchronous, pure, and total: it reads its two
 * arguments, performs no I/O, no environment access, no lookup, and no
 * mutation, and either returns `void` or throws a typed
 * `ResourceRequirementContractError`. Validation runs on descriptor-safe
 * snapshots (#578); the caller input is never frozen or mutated.
 *
 * Composition: `validateToolComponent(owner)` runs first — its failures
 * surface unchanged as the existing `ComponentContractError` /
 * `ToolComponentContractError`. The declaration is then validated as keyed to
 * exactly that owner: exact `componentId` match (never silently rebound),
 * exact identities with no floating selectors, exact `{contractId, version}`
 * contract references, operation narrowing against the owner's actual
 * operations, and resource keys unique across component and operation scopes.
 *
 * No resource is resolved, injected, bound, or materialized here (T005B), and
 * no resource instance identity or currentness pin is taken (T005C).
 */
export declare function validateToolResourceRequirements(owner: ComponentEnvelope, declaration: ToolResourceRequirementsDeclaration): void;
//# sourceMappingURL=resource-requirements.d.ts.map