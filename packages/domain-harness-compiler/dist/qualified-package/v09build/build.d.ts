/**
 * DomainHarness v0.9 N06 (#1032) — producer-neutral zero-import BUILD.
 * =====================================================================
 *
 * `buildV09QualifiedRoot` consumes the output of the PUBLISHED v0.8 BUILD
 * pipeline (`buildQualifiedPackage` — which already owns module bytes,
 * closed-role shape, handler-export AST verification, approval and the v0.8
 * digest authority) plus the v0.9 intent→operation route table, and emits
 * the v0.9 sealed qualified root (`dh.v9.sealed-root/1`):
 *
 *  - every selected K/S/B/C binding is sealed as ONE self-contained ESM
 *    module (the v0.8 single-file package bytes); the zero-external-edge
 *    property is enforced here by the pinned-parser full-AST gate
 *    (static import, export-from, export * from, import(), import.meta,
 *    require, eval/code-string constructors all refuse — empty allowlist,
 *    D01);
 *  - the exact ordered package byte SHA-256s, the empty `imports: []`
 *    policy, the ordered binding records (roles, intents, capability
 *    handler maps, route rows) and the selected runtime/Host ABI profile
 *    are sealed into the `dh.v9.qualified-root.subject/1` subject digest
 *    (D04);
 *  - the route table is validated against the sealed root's OWN intent
 *    rows and capability handler maps (no caller-supplied intent
 *    authority — N01 R0 P1 semantics); duplicated package IDs, duplicated
 *    routes and ambiguous/unresolvable routes refuse;
 *  - the emitted root carries NO approval: authority is attached only by
 *    the external governance issuer at the protected install
 *    (`host-v9` `install(sealedRoot, approval, audience)`, D02). BUILD
 *    never mints or verifies the v0.9 approval itself; the consumed v0.8
 *    root's approval is validated for shape/provenance only.
 *
 * This module does not generate business domain logic (domain-forge owns
 * that) and is not a second compiler: it is the qualified closure/seal/ABI
 * selection tool boundary.
 */
import { V09_SEALED_ROOT_FORMAT } from './digest.js';
/** The single self-contained ESM module artifact of one v0.9 package. */
export interface V09SealedPackage {
    readonly packageId: string;
    readonly kind: string;
    readonly abiVersion: string;
    readonly moduleSource: string;
    readonly moduleSha256: string;
    readonly imports: readonly [];
}
/** Ordered binding records sealed into the v0.9 subject. */
export type V09BindingRecord = Readonly<{
    role: 'kernel' | 'standard-sdk' | 'business';
    packageId: string;
    endpointId: string;
}> | Readonly<{
    role: 'intent';
    intentType: string;
    packageId: string;
    endpointId: string;
}> | Readonly<{
    role: 'capability';
    capabilityId: string;
    packageId: string;
    endpointId: string;
    handlers: readonly {
        operationId: string;
        handler: string;
    }[];
}> | Readonly<{
    role: 'route';
    intentId: string;
    operationId: string;
    capabilityId: string;
    handlerId: string;
}>;
/** The v0.9 sealed qualified root (no approval attached — that is governance's step). */
export interface V09SealedQualifiedRoot {
    readonly formatVersion: typeof V09_SEALED_ROOT_FORMAT;
    readonly subjectDigest: string;
    readonly rootPackageId: string;
    readonly buildId: string;
    readonly bundlerRevision: string;
    readonly importPolicyRevision: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    readonly packages: readonly V09SealedPackage[];
    readonly bindings: readonly V09BindingRecord[];
}
export interface BuildV09QualifiedRootOptions {
    /** A sealed v0.8 qualified root produced by the published v0.8 BUILD. */
    readonly sealedRoot: unknown;
    /** Non-empty ordered v0.9 route rows (intentId/operationId/capabilityId/handlerId). */
    readonly routes: unknown;
    /** Bounded BUILD identifier sealed into the subject. */
    readonly buildId: string;
}
/**
 * Produce the v0.9 sealed qualified root: each selected K/S/B/C binding
 * sealed as one self-contained ESM module behind the zero-import AST gate,
 * with the D04 subject digest over the exact ordered bytes and binding
 * records. Purely static — no module is evaluated here.
 */
export declare function buildV09QualifiedRoot(options: BuildV09QualifiedRootOptions): V09SealedQualifiedRoot;
