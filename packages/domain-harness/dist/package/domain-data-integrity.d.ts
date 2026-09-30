import { type Sha256Port } from '../contracts/identity.js';
import { type CompiledDomainDataSection } from '../v2/contracts/package-data.js';
export type DomainDataIntegrityErrorCode = 'INVALID_DOMAIN_DATA_SECTION' | 'DOMAIN_DATA_DIGEST_MISMATCH' | 'DOMAIN_DATA_BOUNDS_EXCEEDED' | 'DOMAIN_DATA_SCHEMA_VIOLATION';
export declare class DomainDataIntegrityError extends Error {
    readonly code: DomainDataIntegrityErrorCode;
    readonly details: readonly string[];
    constructor(code: DomainDataIntegrityErrorCode, message: string, details?: readonly string[]);
}
/**
 * Portable successor Domain Data integrity + schema admission validation.
 * Validation operates on a detached canonical snapshot so caller mutation
 * cannot create a time-of-check/time-of-use split while async digests run.
 */
export declare function validateCompiledDomainDataSection(value: unknown, sha256: Sha256Port): Promise<CompiledDomainDataSection>;
//# sourceMappingURL=domain-data-integrity.d.ts.map