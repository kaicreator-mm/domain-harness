/**
 * v0.7 must-understand Component admission contract (T001D, repaired by #556).
 *
 * Authoritative admission is fail-closed and open-Kind: the caller supplies
 * the complete set of exact Kind declarations it understands. Each declaration
 * carries the exact semantic/capability contracts understood for that Kind and
 * the closed-world validator belonging to that exact Kind implementation.
 *
 * There is deliberately no global Kind catalog or implementation registry in
 * this module. Runtime Assembly/dispatch successors own how the exact validator
 * implementation is selected and pinned; this seam only requires that the
 * validator matched to the exact KindRef is invoked before ADMITTED is returned.
 *
 * Validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578). The
 * understood-set index is built from descriptor-safe snapshots: exact refs
 * indexed for admission decisions are fresh `{id, version}` value objects, so
 * a caller mutating its own declarations after validation can never change
 * an admission conclusion. The canonical exact-ref matrix rejects floating
 * tokens (`latest`/`current`/`active`/`default`/`*`/`x`), range operators
 * (`^ ~ < > | *`), x-range/partial versions (`1.x`, `x`, `1.`) and embedded
 * `id@version` selectors.
 */
import { type CapabilityContractRef, type ComponentEnvelope, type ComponentId, type KindRef, type SemanticContractRef } from './component.js';
import type { JsonValue } from './json.js';
/** Closed-world validator for one exact admitted Kind implementation. */
export type ComponentKindValidator = (envelope: ComponentEnvelope) => void;
/**
 * Complete must-understand declaration for one exact KindRef.
 *
 * `validateComponent` must validate the complete behaviorally material
 * `semanticBody` for this exact Kind/version. It may reuse a Kind-specific
 * public validator such as `validateToolComponent`; failures propagate
 * unchanged so the Kind contract remains the single source of truth.
 */
export interface UnderstoodKindDeclaration {
    readonly kind: KindRef;
    readonly understoodSemanticContracts: readonly SemanticContractRef[];
    readonly understoodCapabilities: readonly CapabilityContractRef[];
    readonly validateComponent: ComponentKindValidator;
}
/** Complete caller-supplied exact Kind support set. */
export type UnderstoodKindSet = readonly UnderstoodKindDeclaration[];
export type ComponentAdmissionErrorCode = 'UNKNOWN_KIND' | 'KIND_VERSION_MISMATCH' | 'UNKNOWN_SEMANTIC_CONTRACT' | 'UNKNOWN_CAPABILITY' | 'INVALID_UNDERSTOOD_KIND_SET';
export type ComponentAdmissionFailureClass = 'KIND' | 'CONTRACT' | 'CAPABILITY' | 'INPUT';
export declare class ComponentAdmissionError extends Error {
    readonly code: ComponentAdmissionErrorCode;
    readonly failureClass: ComponentAdmissionFailureClass;
    constructor(code: ComponentAdmissionErrorCode, message: string);
}
export interface ComponentAdmissionResult {
    readonly status: 'ADMITTED';
    readonly componentId: ComponentId;
    readonly admittedKind: KindRef;
    readonly admittedSemanticContracts: readonly SemanticContractRef[];
    readonly admittedCapabilities: readonly CapabilityContractRef[];
    /** Opaque non-behavioral pass-through; never sent to the Kind validator as semantics. */
    readonly nonMaterialExtensions?: JsonValue;
}
/**
 * Fail-closed must-understand admission for one Component.
 *
 * Order is deliberate:
 * 1. base Component envelope validation;
 * 2. exact Kind support;
 * 3. exact required semantic/capability contract understanding;
 * 4. exact Kind implementation's closed-world Component validator;
 * 5. ADMITTED result.
 *
 * Base/Kind-validator errors propagate unchanged. This module never invents a
 * fallback, global registry, compatibility range, or generic top-level-field
 * substitute for the Kind's own semantic validation. The ADMITTED result
 * carries fresh `{id, version}` ref copies (the caller's envelope and
 * declarations are never aliased into admission evidence); the opaque
 * `nonMaterialExtensions` pass-through keeps its original reference.
 */
export declare function admitComponent(envelope: ComponentEnvelope, understoodKinds: UnderstoodKindSet): ComponentAdmissionResult;
//# sourceMappingURL=component-admission.d.ts.map