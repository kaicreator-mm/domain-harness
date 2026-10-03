/**
 * v0.3 runtime-assembly error authority. Extracted from
 * create-domain-runtime-v3.ts so the T004 decision-binding adapter
 * (decision-resolver-binding.ts) can fail closed through the SAME public
 * error class without an import cycle; the public-v3 surface keeps exporting
 * it from the assembly module unchanged.
 */
export type DomainRuntimeV3ErrorCode = 'RUNTIME_V3_AUTHORITY_REQUIRED'
/**
 * v0.6 T004: no compiled semantic-decision declaration exists for the
 * requested stable decisionId in the admission-validated pinned package
 * (or the pinned package carries no semantic-decision material at all).
 * Fail closed: the runtime never runs a decision without its declaration.
 */
 | 'RUNTIME_V3_DECISION_BINDING_UNRESOLVED'
/**
 * v0.6 T004: a declaration exists but its material cannot be bound onto the
 * existing resolver invocation (input-selection failure, off-contract
 * result schema, declared promoted reference without supplied promoted
 * material, or a capability binding outside the declaration's query-only
 * identities). Fail closed before any resolver or admission work.
 */
 | 'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE';
export declare class DomainRuntimeV3Error extends Error {
    readonly code: DomainRuntimeV3ErrorCode;
    constructor(code: DomainRuntimeV3ErrorCode, message: string);
}
export declare function failV3(code: DomainRuntimeV3ErrorCode, message: string): never;
//# sourceMappingURL=runtime-v3-errors.d.ts.map