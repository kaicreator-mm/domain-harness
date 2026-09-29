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
/**
 * Internal successor compiler primitive. Public compileDomainPackage() remains
 * frozen on 0.2/2/2 until central I-03-ASSEMBLY.
 *
 * `projections` is intentionally mandatory: successor compilation may never
 * silently skip the statically knowable Domain Data dependency-closure gate.
 */
export declare function buildCompiledDomainDataSection(entries: readonly DomainDataCompileEntry[], bounds: PackageDataBounds, projections: readonly RawProjectionDefinition[]): CompiledDomainDataSection;
