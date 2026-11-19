/**
 * DomainHarness v0.11.0 T01 (#1575) — L203 Package Manifest / Primary /
 * Hook / technical lifecycle contracts (L2 §4).
 *
 * One uniform manifest/loader/technical-lifecycle contract for every
 * K/S/B package (PRD AR-04/P01); layer and role describe responsibility,
 * never distinct manifest schemas. `provides`/`contributesTo` are typed
 * Hook declarations bound to owner-declared hooks — bare-string tag
 * dispatch is refused (PRD P07/P08). The five graphs (layer/role view,
 * package dependency + Hook DAG, Element build DAG, cycle-legal semantic
 * graph, optional workflow behavior) stay separate; BUILD validates each
 * shape separately and never merges one big DAG (PRD §2/AR-06).
 */
import type { SemVer } from './base.js';
import type { ResourceRef, SchemaRef } from './element-contracts.js';
import type {
  ElementVisibility,
  EntryRef,
  FunctionRef,
  TargetBinding,
} from './refs.js';
import type { DH_PACKAGE_SCHEMA_VERSION } from './schema-versions.js';

/** Full words (PRD examples); the R4 "K"/"S"/"B" abbreviations are retired (L2 §13.2-4). */
export type PackageLayer = 'kernel' | 'sdk' | 'business';

export type PackageRole = 'primary' | 'extension';

export interface ElementEntry {
  readonly id: string;
  readonly version: SemVer;
  /** Element definition source (yaml/json normalize to equivalence, PRD P10). */
  readonly definitionRef: ResourceRef;
  readonly visibility: ElementVisibility;
}

export interface PackageDependency {
  /** Id of the depended-on package. */
  readonly package: string;
  /** Authoring-time range; BUILD resolves every edge to an exact version (PRD B04). */
  readonly version: string;
  /** The exported interface id actually consumed — a typed dependency edge (PRD P07). */
  readonly interface: string;
}

export interface ExportEntry {
  readonly elementId?: string;
  readonly functionId?: string;
  readonly interfaceId?: string;
}

/** Carried by `provides`: hooks this package declares it owns. */
export interface HookDeclaration {
  readonly id: string;
  readonly interfaceSchemaRef: SchemaRef;
  readonly cardinality: 'single' | 'multi';
}

export interface CapabilityDeclaration {
  readonly interfaces?: readonly ExportEntry[];
  readonly hooks?: readonly HookDeclaration[];
}

/** Bound to a hook already declared by its owner; no ambient dispatch (PRD P07/P08). */
export interface HookBinding {
  readonly ownerPackageId: string;
  readonly hookId: string;
  /** This package's implementation of the hook. */
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
  /** 0..N; a KDP kernel package may own zero Domain Elements (PRD P03). */
  readonly elements: readonly ElementEntry[];
  /** Typed API dependency edges; forms a DAG. */
  readonly dependsOn: readonly PackageDependency[];
  readonly imports: readonly FunctionRef[];
  readonly exports: readonly ExportEntry[];
  readonly provides?: CapabilityDeclaration;
  readonly contributesTo: readonly HookBinding[];
  readonly targetVariants: readonly TargetBinding[];
  /** Paired with technicalDispose — declaring only one is a BUILD refusal (PRD B04/A07). */
  readonly technicalInit?: EntryRef;
  readonly technicalDispose?: EntryRef;
}
