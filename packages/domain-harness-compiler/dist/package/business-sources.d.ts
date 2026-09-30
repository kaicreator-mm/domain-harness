import { type CompiledBusinessSourceSection, type JsonSchema, type PackageDataBounds } from '@kaicreator/domain-harness/v2';
import type { RawProjectionDefinition } from '../raw/types.js';
export interface BusinessSourceCompileEntry {
    readonly source: string;
    readonly valueSchema: JsonSchema;
}
export declare class BusinessSourceCompileError extends Error {
    readonly issues: readonly string[];
    constructor(issues: readonly string[]);
}
/**
 * Internal successor compiler primitive. This implements Mode-A schema
 * interpretation only. No compiler-emitted validator bytes are produced here,
 * so no `validatorBindingDigest` is fabricated.
 */
export declare function buildCompiledBusinessSourceSection(entries: readonly BusinessSourceCompileEntry[], bounds: PackageDataBounds, projections: readonly RawProjectionDefinition[]): CompiledBusinessSourceSection;
