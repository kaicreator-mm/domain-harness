/**
 * v0.7 must-understand Component admission contract (issue #543, fine-grained
 * DAG T001D).
 *
 * A pure, deterministic, fail-closed admission function deciding whether one
 * already-validated `ComponentEnvelope` is understandable by a caller that
 * declares exactly which Kinds (exact KindRef = kindId + exact version), which
 * exact semantic contracts, and which behaviorally material `semanticBody`
 * fields it understands. The caller supplies the complete understood set;
 * admission fails closed on anything outside it. This is the frozen L2 rule
 * "Must-understand validation occurs at Definition admission for the exact
 * KindRef/version" and "unknown/incompatible required semantics fail closed".
 *
 * There is deliberately no global Kind catalog and no Kind implementation
 * registry here; no compatibility ranges, ordering, `latest`/`current`/
 * nearest-version selection (T002A); no Runtime Assembly/pins (T002B); no Tool
 * operation contracts or capability resolution (T003A/T003B); no digests
 * (T001B/T001C); no public barrel exposure (T001E). This is definition-plane
 * must-understand admission only and is not coupled to the v0.3 governance
 * admission (`src/admission/`).
 */
import type { ComponentEnvelope, ComponentId, KindRef, SemanticContractRef } from './component.js';
import type { JsonValue } from './json.js';
/**
 * One caller declaration of complete must-understand knowledge for one exact
 * Kind version: the exact KindRef plus the exact semantic contracts and the
 * behaviorally material `semanticBody` top-level fields understood for it.
 */
export interface UnderstoodKindDeclaration {
    /** Exact KindRef: kindId + exact version, same exactness rules as `component.ts`. */
    readonly kind: KindRef;
    /** Exact semantic contract refs this caller understands for this exact Kind version; duplicates forbidden. */
    readonly understoodSemanticContracts: readonly SemanticContractRef[];
    /**
     * The complete set of `semanticBody` TOP-LEVEL field names this caller
     * understands as behaviorally material for this exact Kind version;
     * non-empty strings; duplicates forbidden. A comprehension set, not a
     * presence requirement — comparison is exact string equality on top-level
     * keys only (no prefixes, globs, dot-paths, nesting traversal, defaults, or
     * normalization).
     */
    readonly materialSemanticBodyFields: readonly string[];
}
/**
 * The complete understood-Kind set supplied by the caller. Each exact KindRef
 * (kindId+version) appears at most once; multiple exact versions of one kindId
 * may coexist (each exact, no ordering/range meaning). An empty set is
 * structurally valid and admits nothing.
 */
export type UnderstoodKindSet = readonly UnderstoodKindDeclaration[];
/** Deterministic, fail-closed admission failure codes. */
export type ComponentAdmissionErrorCode = 'UNKNOWN_KIND' | 'KIND_VERSION_MISMATCH' | 'UNKNOWN_SEMANTIC_CONTRACT' | 'UNKNOWN_MATERIAL_FIELD' | 'INVALID_UNDERSTOOD_KIND_SET' | 'ADMISSION_INPUT_INVALID';
/** The failure taxonomy discriminator: each failure code maps to exactly one class. */
export type ComponentAdmissionFailureClass = 'KIND' | 'CONTRACT' | 'FIELD' | 'INPUT';
/**
 * Typed admission failure mirroring the `ComponentContractError` pattern of
 * `src/contracts/component.ts`: a dedicated error class carrying a `code`
 * plus exactly one failure-class discriminator.
 */
export declare class ComponentAdmissionError extends Error {
    readonly code: ComponentAdmissionErrorCode;
    readonly failureClass: ComponentAdmissionFailureClass;
    constructor(code: ComponentAdmissionErrorCode, message: string);
}
/** The deterministic admitted result of must-understand Component admission. */
export interface ComponentAdmissionResult {
    readonly status: 'ADMITTED';
    /** Echoed from the envelope. */
    readonly componentId: ComponentId;
    /** The exact matched KindRef. */
    readonly admittedKind: KindRef;
    /** The envelope's exact semantic contract refs that were admitted (envelope order). */
    readonly admittedSemanticContracts: readonly SemanticContractRef[];
    /** The admitted top-level semanticBody fields, sorted lexicographically (deterministic). */
    readonly admittedMaterialFields: readonly string[];
    /** Verbatim opaque pass-through; never validated, merged, dropped, or promoted. */
    readonly nonMaterialExtensions?: JsonValue;
}
/**
 * Pure, deterministic, fail-closed must-understand admission of one
 * already-validated Component envelope against the caller-supplied complete
 * understood-Kind set. Throws `ComponentAdmissionError` on failure; never
 * mutates its inputs.
 *
 * Kind matching is exact on both kindId and version — no fallback to another
 * version of a known kindId, no range/`latest`/`current`/`default`/ordering
 * semantics of any kind. Semantic contract matching is exact on both
 * contractId and version. `requiredCapabilities` are not must-understand
 * material at this seam and are neither validated nor carried on the result.
 */
export declare function admitComponent(envelope: ComponentEnvelope, understoodKinds: UnderstoodKindSet): ComponentAdmissionResult;
//# sourceMappingURL=component-admission.d.ts.map