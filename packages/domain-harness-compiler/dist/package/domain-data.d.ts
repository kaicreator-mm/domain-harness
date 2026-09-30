import { type CompiledDomainDataSection, type JsonSchema, type PackageDataBounds } from '@kaicreator/domain-harness/v2';
import type { RawProjectionDefinition } from '../raw/types.js';
export interface DomainDataCompileEntry {
    readonly key: string;
    readonly value: unknown;
    readonly valueSchema?: JsonSchema;
}
export declare class DomainDataCompileError extends Error {
    readonly issues: readonly string[];
    constructor(issues: readonly string[]);
}
/** Internal successor compiler primitive. Public compiler remains 0.2/2/2 until I-03-ASSEMBLY. */
export declare function buildCompiledDomainDataSection(entries: readonly DomainDataCompileEntry[], bounds: PackageDataBounds, projections: readonly RawProjectionDefinition[]): CompiledDomainDataSection;
