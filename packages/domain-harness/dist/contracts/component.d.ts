import type { JsonValue } from './json.js';
/** The two frozen Product families a Domain Component belongs to. */
export declare const COMPONENT_FAMILIES: readonly ["semantic", "tool"];
export type ComponentFamily = (typeof COMPONENT_FAMILIES)[number];
/**
 * Stable logical identity of one Component within a Domain Definition.
 * Non-empty, never a floating selector, and never an implementation identity.
 */
export type ComponentId = string;
/**
 * Exact, versioned semantic Kind contract identity. Open by design: any new
 * Kind is representable, so the Component core never grows a closed
 * workflow/rule/skill/tool Kind union. This is contract identity only —
 * implementation/provider/module identity is a later assembly concern.
 */
export interface KindRef {
    readonly kindId: string;
    readonly version: string;
}
/** Exact, versioned behaviorally material semantic contract reference. */
export interface SemanticContractRef {
    readonly contractId: string;
    readonly version: string;
}
/** Exact Capability contract identity (requires/provides semantics). */
export interface CapabilityContractRef {
    readonly capabilityId: string;
    readonly version: string;
}
/**
 * Portable semantic envelope of one Domain Component. `semanticBody` is the
 * only behaviorally material body; `nonMaterialExtensions` is explicitly
 * non-behavioral and can never be mistaken for required semantics. No
 * implementation/module/provider/assembly/runtime-resource identity is
 * representable on this envelope.
 */
export interface ComponentEnvelope {
    readonly family: ComponentFamily;
    readonly componentId: ComponentId;
    readonly kind: KindRef;
    readonly requiredSemanticContracts: readonly SemanticContractRef[];
    readonly requiredCapabilities: readonly CapabilityContractRef[];
    readonly semanticBody: JsonValue;
    readonly nonMaterialExtensions?: JsonValue;
}
export type ComponentContractErrorCode = 'INVALID_COMPONENT_ENVELOPE' | 'INVALID_COMPONENT_ID' | 'INVALID_COMPONENT_FAMILY' | 'INVALID_KIND_REF' | 'INVALID_SEMANTIC_CONTRACT_REF' | 'INVALID_CAPABILITY_REF' | 'INVALID_SEMANTIC_BODY' | 'INVALID_NON_MATERIAL_EXTENSIONS' | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN';
export declare class ComponentContractError extends Error {
    readonly code: ComponentContractErrorCode;
    constructor(code: ComponentContractErrorCode, message: string);
}
/**
 * Structural fail-closed validation of a Component envelope. Invalid exact
 * identities are always rejected — never silently normalized to a
 * default/current value. Validation runs descriptor-safe on a snapshot of
 * the caller envelope (#578): accessor/symbol-keyed/non-enumerable material
 * and exotic prototypes are typed rejections, and no hidden getter can
 * execute during validation or diagnostics. The caller input is never
 * frozen or mutated.
 */
export declare function validateComponentEnvelope(envelope: ComponentEnvelope): void;
//# sourceMappingURL=component.d.ts.map