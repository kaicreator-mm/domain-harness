/** 当前领域契约：单一结构定义与严格的数据验证。 */
import type { SemVer } from './base.js';
import type { ResourceRef, SchemaRef } from './element-contracts.js';
import type {
  ElementVisibility,
  EntryRef,
  FunctionRef,
  TargetBinding,
} from './refs.js';
import type { DH_PACKAGE_SCHEMA_VERSION } from './schema-versions.js';

export type PackageLayer = 'kernel' | 'sdk' | 'business';

export type PackageRole = 'primary' | 'extension';

export interface ElementEntry {
  readonly id: string;
  readonly version: SemVer;
  readonly definitionRef: ResourceRef;
  readonly visibility: ElementVisibility;
}

export interface PackageDependency {
  readonly package: string;
  readonly version: string;
  readonly interface: string;
}

export interface ExportEntry {
  readonly elementId?: string;
  readonly functionId?: string;
  readonly interfaceId?: string;
}

export interface HookDeclaration {
  readonly id: string;
  readonly interfaceSchemaRef: SchemaRef;
  readonly cardinality: 'single' | 'multi';
}

export interface CapabilityDeclaration {
  readonly interfaces?: readonly ExportEntry[];
  readonly hooks?: readonly HookDeclaration[];
}

export interface HookBinding {
  readonly ownerPackageId: string;
  readonly hookId: string;
  readonly entry: EntryRef;
}

export interface DomainPackageManifest {
  readonly kind: 'DomainPackage';
  readonly schemaVersion: typeof DH_PACKAGE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly layer: PackageLayer;
  readonly role: PackageRole;
  readonly description?: string;
  readonly elements: readonly ElementEntry[];
  readonly dependsOn: readonly PackageDependency[];
  readonly imports: readonly FunctionRef[];
  readonly exports: readonly ExportEntry[];
  readonly provides?: CapabilityDeclaration;
  readonly contributesTo: readonly HookBinding[];
  readonly targetVariants: readonly TargetBinding[];
  readonly technicalInit?: EntryRef;
  readonly technicalDispose?: EntryRef;
}
