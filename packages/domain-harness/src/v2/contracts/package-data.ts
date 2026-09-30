import type { ContentDigest } from '../../contracts/identity.js';
import type { JsonSchema, JsonValue } from '../../contracts/json.js';
import type { DomainHarnessJsonSchemaContractVersion } from '../../schema/domainharness-json-schema-v1.js';

/** Frozen successor package data bounds shared by Domain Data and Business Source lanes. */
export interface PackageDataBounds {
  readonly maxDomainDataEntries: number;
  readonly maxDomainDataEntryCanonicalBytes: number;
  readonly maxTotalDomainDataCanonicalBytes: number;
  readonly maxBusinessSources: number;
  readonly maxSchemaCanonicalBytes: number;
}

export interface CompiledDomainDataDescriptor {
  readonly key: string;
  readonly contentDigest: ContentDigest;
  /** Identity-bound schema material validated under the exact successor schema contract. */
  readonly valueSchema?: JsonSchema;
}

/** Package-owned immutable Domain Data material for a successor package. */
export interface CompiledDomainDataSection {
  readonly descriptors: readonly CompiledDomainDataDescriptor[];
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly packageDataBounds: PackageDataBounds;
}

/**
 * Deterministic behaviorally relevant material consumed later by the complete
 * successor package identity assembly. Raw values are represented by their
 * exact content digests in `descriptors` and are not duplicated here.
 */
export interface CompiledDomainDataIdentityMaterial {
  readonly descriptors: readonly CompiledDomainDataDescriptor[];
  readonly packageDataBounds: PackageDataBounds;
}

export interface CompiledBusinessSourceDescriptor {
  readonly source: string;
  readonly valueSchema: JsonSchema;
  /** Present only when portable compiler-emitted validator bytes are packaged. */
  readonly validatorBindingDigest?: ContentDigest;
}

/** Internal successor section consumed later by central 0.3 manifest assembly. */
export interface CompiledBusinessSourceSection {
  readonly schemaContractVersion: DomainHarnessJsonSchemaContractVersion;
  readonly descriptors: readonly CompiledBusinessSourceDescriptor[];
}

export interface CompiledBusinessSourceIdentityMaterial {
  readonly schemaContractVersion: DomainHarnessJsonSchemaContractVersion;
  readonly descriptors: readonly CompiledBusinessSourceDescriptor[];
}

/** Exact locale-independent ordering used by successor package identity. */
export function compareCompiledPackageDataKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Compatibility name retained for I-PKG-DATA callers. */
export const compareCompiledDomainDataKeys = compareCompiledPackageDataKeys;

export const compareCompiledBusinessSourceKeys = compareCompiledPackageDataKeys;

/** One authoritative projection from a validated/compiled Domain Data section into identity material. */
export function compiledDomainDataIdentityMaterial(
  section: CompiledDomainDataSection,
): CompiledDomainDataIdentityMaterial {
  return {
    descriptors: section.descriptors.map((descriptor) => ({
      key: descriptor.key,
      contentDigest: descriptor.contentDigest,
      ...(descriptor.valueSchema === undefined ? {} : { valueSchema: descriptor.valueSchema }),
    })),
    packageDataBounds: { ...section.packageDataBounds },
  };
}

export function compiledBusinessSourceIdentityMaterial(
  section: CompiledBusinessSourceSection,
): CompiledBusinessSourceIdentityMaterial {
  return {
    schemaContractVersion: section.schemaContractVersion,
    descriptors: section.descriptors.map((descriptor) => ({
      source: descriptor.source,
      valueSchema: descriptor.valueSchema,
      ...(descriptor.validatorBindingDigest === undefined
        ? {}
        : { validatorBindingDigest: descriptor.validatorBindingDigest }),
    })),
  };
}
