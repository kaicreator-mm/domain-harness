/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { ContentDigest, SemVer } from './base.js';
import type { EffectIntent, FunctionOutcomeKind } from './element-contracts.js';
import type {
  ElementRef,
  ElementVisibility,
  EntryRef,
  FunctionRef,
  ResolvedTarget,
} from './refs.js';
import type { PackageLayer, PackageRole } from './package-manifest.js';
import type { ResourceRef } from './element-contracts.js';
import type { DH_LOCK_SCHEMA_VERSION } from './schema-versions.js';

export interface SelectedPackage {
  readonly packageId: string;
  readonly version: SemVer;
  readonly layer: PackageLayer;
  readonly role: PackageRole;
  readonly artifact: ResourceRef;
  readonly technicalLifecycle: boolean;
  readonly dependsOn: readonly string[];
}

export interface SelectedElement {
  readonly ref: ElementRef;
  readonly ownerPackageId: string;
  readonly visibility: ElementVisibility;
  readonly contentDigests: readonly ContentDigest[];
  readonly contractDigests: readonly ContentDigest[];
}

export interface SelectedFunction {
  readonly ref: FunctionRef;
  readonly outcomes: readonly FunctionOutcomeKind[];
  readonly effects: EffectIntent;
  readonly implementation: EntryRef;
  readonly resources: readonly ResourceRef[];
}

export interface SealedHookBinding {
  readonly ownerPackageId: string;
  readonly hookId: string;
  readonly cardinality: 'single' | 'multi';
  readonly providers: readonly EntryRef[];
}

export interface SealedIngress {
  readonly id: string;
  readonly function: FunctionRef;
  readonly optional: boolean;
}

export interface BootstrapKdpRef {
  readonly kdpPackageId: string;
  readonly kdpPrimaryEntry: 'bootstrap';
  readonly kdpPrimaryDigest: ContentDigest;
}

export interface DomainAppLock {
  readonly kind: 'DomainAppLock';
  readonly schemaVersion: typeof DH_LOCK_SCHEMA_VERSION;
  readonly appIdentity: {
    readonly id: string;
    readonly version: SemVer;
    readonly descriptorDigest: ContentDigest;
  };
  readonly target: ResolvedTarget;
  readonly bootstrapKdpPin: BootstrapKdpRef;
  readonly selectedPackages: readonly SelectedPackage[];
  readonly selectedElements: readonly SelectedElement[];
  readonly selectedFunctions: readonly SelectedFunction[];
  readonly hookBindings: readonly SealedHookBinding[];
  readonly technicalInitOrder: readonly string[];
  readonly technicalDisposeOrder: readonly string[];
  readonly businessAppInit: FunctionRef;
  readonly ingress: readonly SealedIngress[];
  readonly resourceDigests: Readonly<Record<string, ContentDigest>>;
  readonly excludedUnknownContent: readonly string[];
  readonly closureDigest: ContentDigest;
}
