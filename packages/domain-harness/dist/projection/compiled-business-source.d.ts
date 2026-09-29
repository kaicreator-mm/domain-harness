import type { DomainHarnessJsonSchemaContractVersion } from '../schema/domainharness-json-schema-v1.js';
import type { CompiledBusinessSourceDescriptor } from '../v2/contracts/package-data.js';
/** Runtime projection seam for Mode A; Mode-B bytes/digests are not executable in I-BIZ-SRC. */
export type CompiledModeABusinessSourceDescriptor = Omit<CompiledBusinessSourceDescriptor, 'validatorBindingDigest'> & {
    readonly validatorBindingDigest?: never;
};
/** Exact package-pinned Business Source contract used before external snapshot evaluation. */
export interface CompiledBusinessSourceContract {
    readonly schemaContractVersion: DomainHarnessJsonSchemaContractVersion;
    readonly descriptor: CompiledModeABusinessSourceDescriptor;
}
/**
 * Read-only lookup derived from an activation-validated package section.
 * Implementations are package-local/in-memory and must not consult external
 * Business SoR state.
 */
export interface CompiledBusinessSourceContractPort {
    get(packageId: string, source: string): CompiledBusinessSourceContract | undefined;
}
//# sourceMappingURL=compiled-business-source.d.ts.map