/**
 * v0.7 sealed Runtime Assembly core contract (issue #587, fine-grained DAG
 * T002B; closes #568 and #575 by implementation + review).
 *
 * This module is the Microkernel seam between the frozen Definition plane
 * (Component/Definition identity, T001A-T001C) and trusted closed-world Kind
 * implementation handles. It owns exactly the concerns #587 assigns to T002B:
 *
 * - a content-addressed, serializable RuntimeAssemblyRecord: the exact
 *   Definition graph digest, the exact KindImplementation pins, the canonical
 *   #568 logical resource requirement material, and generic §G
 *   implementation-binding evidence slots;
 * - the exact KindImplementationPin identity (kind + implementation
 *   id/version/digest). Module paths, provider paths, function source text
 *   and live handles are NEVER digest material;
 * - `sealRuntimeAssembly`, the authority boundary that validates and
 *   synchronously snapshots every authority-bearing input, derives the
 *   low-level admission declarations from the SEALED bindings, and mints
 *   opaque/frozen sealed bindings paired with their exact pins;
 * - `admitComponentWithAssembly`, the Assembly-bound admission path that
 *   consumes the sealed binding (never a caller-supplied validator), proves
 *   Definition currentness by authoritative recomputation, and mints frozen,
 *   non-aliasing AssemblyBoundComponentAdmission evidence.
 *
 * Deliberately absent (successor-owned, per #587): activation/execution pins
 * (T002C), PRODUCTION|SIMULATION authority class enforcement (T002D), Tool
 * provider selection/implementation binding semantics (T003C — this module
 * provides only the generic content-addressed evidence container), resource
 * resolution (T005B), resource instance pins (T005C), and any public barrel
 * exposure (T001E/#570). A sealed Assembly carries identity and admission
 * provenance only — ASSEMBLY_SEALED=YES, ACTIVATION_AUTHORITY=NO,
 * DURABLE_EFFECT_AUTHORITY=NO.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), the #573 frozen Kind-compatibility decision, the #556
 * low-level `admitComponent` decision helper, the T005A declaration
 * validator, and the #555 repaired Definition graph digest — all imported,
 * never reimplemented. No global Kind catalog or registry exists here, and
 * no concrete Workflow/XState/ToolRegistry/storage/provider import is
 * permitted in this file.
 *
 * Torn-snapshot discipline (#587 §E, same as #555): every authority-bearing
 * caller input is descriptor-safe validated and snapshotted synchronously
 * before the first `await`; after any suspension only module-owned snapshot
 * material is read, so a caller mutating its own graph, pins or declarations
 * while a digest promise is pending can never produce torn or hybrid
 * Assembly evidence.
 */
import { type CapabilityContractRef, type ComponentEnvelope, type ComponentId, type KindRef, type SemanticContractRef } from './component.js';
import { type ComponentKindValidator } from './component-admission.js';
import { type DefinitionGraphEnvelope } from './definition-graph.js';
import { type ContentDigest, type Sha256Port } from './identity.js';
import { type ResourceContractRef, type ToolResourceRequirementsDeclaration } from './resource-requirements.js';
/**
 * Versioned Runtime Assembly digest domain tag, owned exclusively by this
 * file. Sibling to, and never borrowed by, the T001B/T001C digest domains:
 * any future change to the material shape is a NEW domain tag; historical
 * Assembly identities never change retroactively.
 */
export declare const RUNTIME_ASSEMBLY_DIGEST_DOMAIN = "kaicreator.runtime-assembly.digest.v1";
/**
 * Fail-closed Runtime Assembly failure taxonomy (#587). Every failure is
 * typed and terminal — none carries or suggests a substitute/default/latest
 * resolution, and no diagnostic ever serializes validator functions, secret
 * values or live handles (only exact identity strings participate).
 */
export type RuntimeAssemblyErrorCode = 'INVALID_ASSEMBLY_INPUT' | 'DEFINITION_CURRENTNESS_MISMATCH' | 'MISSING_KIND_IMPLEMENTATION' | 'AMBIGUOUS_KIND_IMPLEMENTATION' | 'INCOMPATIBLE_KIND_IMPLEMENTATION' | 'INVALID_IMPLEMENTATION_PIN' | 'INVALID_RESOURCE_REQUIREMENT_IDENTITY' | 'DUPLICATE_BINDING_EVIDENCE' | 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND' | 'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH';
export declare class RuntimeAssemblyError extends Error {
    readonly code: RuntimeAssemblyErrorCode;
    constructor(code: RuntimeAssemblyErrorCode, message: string);
}
/**
 * Exact, immutable identity of one bound Kind implementation. `kind` is the
 * exact required/admitted KindRef; implementation id/version are exact opaque
 * identities (never ranges/floating selectors); `implementationDigest` is a
 * valid content digest of the exact implementation content/artifact. Module
 * paths, provider paths and function source text are NOT authority identity.
 */
export interface KindImplementationPin {
    /** The exact required/admitted KindRef this implementation is bound to. */
    readonly kind: KindRef;
    /** Exact opaque implementation identity — never a range/floating selector. */
    readonly implementation: {
        readonly implementationId: string;
        readonly implementationVersion: string;
        readonly implementationDigest: ContentDigest;
    };
}
/**
 * Sealing input for one exact KindImplementation: the exact pin, the exact
 * semantic/capability contracts understood for that Kind, and the trusted
 * closed-world validator handle. The raw caller-provided declaration is
 * validated and snapshotted at sealing; only the SEALED binding derived from
 * it can ever authorize an admission (#575 closure).
 */
export interface KindImplementationBindingInput {
    readonly pin: KindImplementationPin;
    readonly understoodSemanticContracts: readonly SemanticContractRef[];
    readonly understoodCapabilities: readonly CapabilityContractRef[];
    readonly validateComponent: ComponentKindValidator;
}
/**
 * Canonical Assembly identity material of one logical resource requirement:
 * exactly the five normative #568/#587§F fields. Secret values, credentials,
 * live handles, connection objects, host lookups and provider objects are
 * structurally unrepresentable.
 */
export interface AssemblyResourceRequirement {
    /** Stable exact logical Runtime Resource identity. */
    readonly resourceKey: string;
    /** Optional exact/versioned resource semantic contract. */
    readonly contract?: ResourceContractRef;
    /** Optional exact narrowing to one operation of the owner. */
    readonly operationId?: string;
    /** Mandatory explicit criticality boolean — no default, no coercion. */
    readonly required: boolean;
}
/** Canonical identity material of one owner's logical resource requirements. */
export interface AssemblyResourceRequirementsMaterial {
    /** Exact owner Tool Component logical identity. */
    readonly componentId: ComponentId;
    /** Order-normalized requirements (sorted by exact resourceKey). */
    readonly requirements: readonly AssemblyResourceRequirement[];
}
/** Binding of a T005A declaration to its exact owner for sealing. */
export interface RuntimeAssemblyResourceRequirementBinding {
    /** The owner Tool Component (validated compositionally by T005A). */
    readonly owner: ComponentEnvelope;
    /** The T005A logical resource requirements declaration of that owner. */
    readonly declaration: ToolResourceRequirementsDeclaration;
}
/**
 * Generic immutable content-addressed implementation-binding evidence slot
 * (#587 §G). Exact-identity-only and opaque to the kernel: T002B never
 * selects a Tool provider, chooses a Tool implementation, inspects Tool
 * operation semantics or queries a registry — T003C is the sole owner of
 * minting Tool-specific authoritative binding evidence and populating these
 * slots.
 */
export interface AssemblyImplementationBindingEvidence {
    /** Exact opaque binding-subject identity; unique within one Assembly. */
    readonly subject: string;
    /** Content digest of the exact binding evidence material. */
    readonly bindingDigest: ContentDigest;
}
/** Complete sealing input. All authority-bearing material is synchronously
 * snapshot at sealing; the caller's objects are never frozen or mutated. */
export interface SealRuntimeAssemblyInput {
    /** The live Definition graph the Assembly is sealed over. */
    readonly definitionGraph: DefinitionGraphEnvelope;
    /** Exact KindImplementation bindings; one per exact required/admitted Kind. */
    readonly kindImplementations: readonly KindImplementationBindingInput[];
    /** Optional T005A logical resource requirement bindings (#568 closure). */
    readonly resourceRequirements?: readonly RuntimeAssemblyResourceRequirementBinding[];
    /** Optional §G generic implementation-binding evidence slots. */
    readonly implementationBindingEvidence?: readonly AssemblyImplementationBindingEvidence[];
    /**
     * Optional caller-claimed Definition graph digest. Never trusted blindly:
     * the authoritative path recomputes the digest from the supplied graph and
     * any mismatch fails closed with DEFINITION_CURRENTNESS_MISMATCH.
     */
    readonly claimedDefinitionGraphDigest?: ContentDigest;
}
/**
 * Serializable, content-addressed Runtime Assembly authority identity. This
 * object IS the assemblyDigest material: exactly the versioned domain tag,
 * the exact Definition graph digest, the exact KindImplementation pins
 * (order-normalized), the canonical #568 resource requirement material
 * (order-normalized), and the §G evidence slots (order-normalized). No
 * function, handle, secret or runtime identity is representable here.
 */
export interface RuntimeAssemblyRecord {
    readonly digestDomain: typeof RUNTIME_ASSEMBLY_DIGEST_DOMAIN;
    /** Exact Definition graph semantic digest this Assembly is bound to. */
    readonly definitionGraphDigest: ContentDigest;
    /** Exact KindImplementation pins, sorted by exact Kind identity. */
    readonly kindImplementations: readonly KindImplementationPin[];
    /** Canonical logical resource requirement material, sorted by componentId. */
    readonly resourceRequirements: readonly AssemblyResourceRequirementsMaterial[];
    /** Generic implementation-binding evidence slots, sorted by subject. */
    readonly implementationBindingEvidence: readonly AssemblyImplementationBindingEvidence[];
}
/**
 * Opaque frozen binding of one exact KindImplementation pin to its trusted
 * closed-world validator handle. Minted only by `sealRuntimeAssembly`; the
 * validator is runtime authority ONLY through the Assembly-bound admission
 * path, never as raw caller input.
 */
export interface SealedKindImplementationBinding {
    readonly pin: KindImplementationPin;
    readonly understoodSemanticContracts: readonly SemanticContractRef[];
    readonly understoodCapabilities: readonly CapabilityContractRef[];
    readonly validateComponent: ComponentKindValidator;
}
/**
 * Private anti-forgery brand. The `unique symbol` computed key is not
 * exported, so no external code can construct a value satisfying
 * `SealedRuntimeAssembly`; `admitComponentWithAssembly` verifies the brand
 * before any authority use, closing the #575 raw-validator minting path.
 */
declare const SEALED_ASSEMBLY_BRAND: unique symbol;
/**
 * The sealed Runtime Assembly: the serializable record plus the assembly
 * digest and the trusted runtime binding handles associated with the exact
 * pins (#587 §A). Sealing grants identity and admission provenance only —
 * never activation, occurrence or effect authority (#587 §H).
 */
export interface SealedRuntimeAssembly {
    /** Serializable content-addressed authority identity (digest material). */
    readonly record: RuntimeAssemblyRecord;
    /** Content digest of the record — changes with any identity-material change. */
    readonly assemblyDigest: ContentDigest;
    /** Frozen sealed bindings, one per exact KindImplementation pin. */
    readonly bindings: readonly SealedKindImplementationBinding[];
    readonly [SEALED_ASSEMBLY_BRAND]: true;
}
/**
 * Authoritative Assembly-bound Component admission evidence, minted only by
 * `admitComponentWithAssembly`. Binds the componentId, the exact
 * DefinitionGraphDigest/currentness, the assemblyDigest, the exact admitted
 * KindRef, the exact KindImplementationPin, and fresh immutable admitted
 * semantic/capability refs. Never retains caller-owned nested references and
 * is never confused with the lower-level ComponentAdmissionResult.
 */
export interface AssemblyBoundComponentAdmission {
    readonly status: 'ADMITTED';
    readonly componentId: ComponentId;
    readonly definitionGraphDigest: ContentDigest;
    readonly assemblyDigest: ContentDigest;
    readonly admittedKind: KindRef;
    readonly admittedKindImplementation: KindImplementationPin;
    readonly admittedSemanticContracts: readonly SemanticContractRef[];
    readonly admittedCapabilities: readonly CapabilityContractRef[];
}
/** Admission options: the current Definition graph and the Sha256Port. */
export interface AdmitComponentWithAssemblyOptions {
    /**
     * The current Definition graph. Its digest is authoritatively recomputed
     * and must equal the digest recorded in the sealed Assembly; any stale or
     * mismatching graph fails closed.
     */
    readonly currentDefinitionGraph: DefinitionGraphEnvelope;
    readonly sha256: Sha256Port;
}
/**
 * Seal a Runtime Assembly over an exact Definition graph.
 *
 * Authority boundary: raw caller-provided declarations/validators never
 * become runtime authority. Every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted BEFORE the first `await` (#587 §E
 * torn-snapshot discipline, same as #555); after any suspension only
 * module-owned snapshot material is read. The Definition graph digest is
 * authoritatively recomputed through the accepted #555 seam — a
 * caller-supplied claim is verified against it, never trusted blindly — and
 * any stale/mismatching claim fails closed.
 *
 * Deterministic fail-closed precedence: seal-input shape, graph validation
 * (propagated unchanged), binding snapshots, ambiguity, missing
 * implementations, resource identity, evidence identity, then async digest
 * work (currentness claim, Assembly digest). Never downgrades a failure.
 */
export declare function sealRuntimeAssembly(input: SealRuntimeAssemblyInput, sha256: Sha256Port): Promise<SealedRuntimeAssembly>;
/**
 * Read-only anti-forgery guard exported for the T002C assembly-activation seam
 * (#617). It confirms membership in the module-private mint registry without
 * exposing the brand symbol or the registry; it lets the activation authority
 * prove a caller-supplied value is a genuine `SealedRuntimeAssembly` minted by
 * `sealRuntimeAssembly`, but can never be used to mint or forge one.
 */
export declare function isSealedRuntimeAssembly(value: unknown): value is SealedRuntimeAssembly;
/**
 * Authoritative Assembly-bound Component admission.
 *
 * The exact Kind support decision is consumed from the #573 frozen decision
 * over the SEALED bindings' pins (never a caller validator): an unbound or
 * inexact Kind fails closed with ASSEMBLY_ADMISSION_KIND_NOT_BOUND. The
 * current Definition graph digest is authoritatively recomputed and must
 * equal the digest recorded in the sealed Assembly, else
 * ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH fails closed. Only then is the
 * low-level `admitComponent` invoked with a declaration derived from the
 * sealed binding, and its result is re-emitted as frozen, non-aliasing
 * Assembly-bound evidence binding componentId, currentness, assemblyDigest,
 * exact admitted KindRef and exact KindImplementationPin.
 *
 * Torn-snapshot discipline: the envelope is validated and snapshotted
 * synchronously before the first `await`; the caller's envelope is never
 * re-read after the currentness suspension, so post-admission caller mutation
 * cannot alter admitted evidence.
 */
export declare function admitComponentWithAssembly(envelope: ComponentEnvelope, assembly: SealedRuntimeAssembly, options: AdmitComponentWithAssemblyOptions): Promise<AssemblyBoundComponentAdmission>;
export {};
//# sourceMappingURL=runtime-assembly.d.ts.map