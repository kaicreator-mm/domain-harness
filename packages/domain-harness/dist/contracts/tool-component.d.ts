import type { JsonValue } from './json.js';
import { type CapabilityContractRef, type ComponentEnvelope } from './component.js';
/**
 * Frozen L2 minimal effect classification for one operation. Exact lowercase
 * literals — no default, no case normalization. Type-level identical to the
 * legacy `ToolEffect` union in `contracts/tool.ts` (proven by fixtures, not
 * by re-exporting legacy symbols).
 */
export type ToolOperationEffect = 'none' | 'idempotent' | 'non-idempotent';
/**
 * One Tool operation: exact stable identity, required portable JSON
 * input/output material (`{}` = explicitly unconstrained), a required exact
 * effect class, optional exact failure-code identities, and optional
 * declarative-only exposure material. No implementation/binding/provider/
 * resource/secret identity is representable.
 */
export interface ToolOperationContract {
    /** Exact stable operation identity; unique within the owning Tool. */
    readonly operationId: string;
    /** Required portable JSON material; `{}` is the explicit unconstrained declaration. */
    readonly inputSchema: JsonValue;
    /** Required portable JSON material; `{}` is the explicit unconstrained declaration. */
    readonly outputSchema: JsonValue;
    /** Required exact effect class — no default, no normalization. */
    readonly effect: ToolOperationEffect;
    /** Optional exact failure-code identities; unique within the operation. */
    readonly declaredFailures?: readonly string[];
    /** Declarative-only caller-audience material; structurally grants no authority. */
    readonly declaredExposure?: JsonValue;
}
/**
 * The single semantic body of a Tool Component: one or more uniquely
 * identified operations plus the exact/versioned Capability contracts this
 * Tool provides (may be empty = provides nothing). Requires stay on the
 * envelope (`requiredCapabilities`, unchanged T001A rules).
 */
export interface ToolOperationsDeclaration {
    readonly operations: readonly [ToolOperationContract, ...ToolOperationContract[]];
    readonly providesCapabilities: readonly CapabilityContractRef[];
}
export type ToolComponentContractErrorCode = 'INVALID_TOOL_COMPONENT_ENVELOPE' | 'INVALID_TOOL_COMPONENT_FAMILY' | 'INVALID_TOOL_OPERATIONS' | 'INVALID_TOOL_OPERATION' | 'INVALID_TOOL_OPERATION_ID' | 'INVALID_TOOL_OPERATION_INPUT' | 'INVALID_TOOL_OPERATION_OUTPUT' | 'INVALID_TOOL_OPERATION_EFFECT' | 'INVALID_TOOL_OPERATION_FAILURE' | 'INVALID_TOOL_OPERATION_EXPOSURE' | 'INVALID_TOOL_CAPABILITY_PROVIDES' | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN';
export declare class ToolComponentContractError extends Error {
    readonly code: ToolComponentContractErrorCode;
    constructor(code: ToolComponentContractErrorCode, message: string);
}
/**
 * Structural fail-closed validation of one Tool Component. Runs the existing
 * `validateComponentEnvelope` first — its failures surface unchanged as
 * `ComponentContractError` — then applies Tool-specific structural validation
 * to a descriptor-safe snapshot of `semanticBody` as exactly one
 * `ToolOperationsDeclaration` (#578). Invalid exact identities are always
 * rejected, never silently normalized.
 */
export declare function validateToolComponent(envelope: ComponentEnvelope): void;
//# sourceMappingURL=tool-component.d.ts.map