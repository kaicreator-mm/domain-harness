/**
 * v0.8 BUILD qualification — phase 1 (T-A, #1000).
 * ================================================
 *
 * `qualifyPackageClosure()` performs the bounded build-time static
 * qualification the frozen L2 mandates for the qualified package ABI:
 * Identity (exact module bytes → SHA-256, self-declared module identity
 * exports), Compatibility (ABI registry/kind agreement, required exports
 * AST-verified), Binding (K/S/multiple-B role shape, intent bindings,
 * provider uniqueness) and exact closure (TypeScript-AST static import
 * analysis; no regex-only import filter).
 *
 * The result is an UNSIGNED qualification: it carries a subject digest but
 * no authority. Authority is attached separately and externally
 * (approval.ts, phase 2) — BUILD can never self-mint it.
 *
 * Qualified-Graph identity uses the #956 R3 repaired escaping rule: each
 * tuple member escapes '/' as '%2F' before joining, so slash-bearing IDs
 * stay injective ('a/b' + 'c' never collides with 'a' + 'b/c') while
 * slash-free IDs keep their historical spelling.
 */
import { type QualifiedBinding, type QualifiedPackageKind } from '@kaicreator/domain-harness/v8';
export declare class QualificationError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export interface QualifiedPackageSubmission {
    readonly packageId: string;
    readonly kind: QualifiedPackageKind;
    readonly abiVersion: string;
    /** Sealed module path inside the package (e.g. 'modules/kernel.mjs'). */
    readonly modulePath: string;
    readonly moduleSource: string;
    readonly endpoints: readonly {
        endpointId: string;
        kind: string;
    }[];
    /** Business packages advertise the intent types their policy binds. */
    readonly intentTypes?: readonly string[];
}
export interface QualificationSubmission {
    readonly rootPackageId: string;
    readonly packages: readonly QualifiedPackageSubmission[];
    /** Role + intent bindings over the submitted packages. */
    readonly bindings: readonly QualifiedBinding[];
}
export interface UnsignedQualification {
    readonly formatVersion: 'v08-build-qualification/1';
    readonly rootPackageId: string;
    readonly subjectDigest: string;
    readonly packages: readonly {
        packageId: string;
        kind: QualifiedPackageKind;
        abiVersion: string;
        modulePath: string;
        moduleSha256: string;
        endpoints: readonly {
            endpointId: string;
            kind: string;
        }[];
        intentTypes: readonly string[];
    }[];
    readonly bindings: readonly QualifiedBinding[];
    readonly qualifiedAt: string;
    readonly producerId: string;
}
/** Escape each tuple member so the joined qualified key stays injective. */
export declare function qualifiedKey(packageId: string, componentId: string): string;
/**
 * Phase 1 — qualify one exact closure. Every rejection happens BEFORE any
 * module is executed: qualification is purely static.
 */
export declare function qualifyPackageClosure(submission: unknown): UnsignedQualification;
