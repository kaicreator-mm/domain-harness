import type { DomainHarnessJsonSchemaContractVersion } from '../schema/domainharness-json-schema-v1.js';
import type { CompiledBusinessSourceDescriptor } from '../v2/contracts/package-data.js';

/** Exact package-pinned Business Source contract used before external snapshot evaluation. */
export interface CompiledBusinessSourceContract {
  readonly schemaContractVersion: DomainHarnessJsonSchemaContractVersion;
  readonly descriptor: CompiledBusinessSourceDescriptor;
}

/**
 * Read-only lookup derived from the exact activated Target Compiled Domain
 * Package. Implementations are package-local/in-memory and must not consult
 * external Business SoR state.
 */
export interface CompiledBusinessSourceContractPort {
  get(packageId: string, source: string): CompiledBusinessSourceContract | undefined;
}
