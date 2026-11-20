/**
 * DomainHarness v0.11.0 T01 (#1575) — L204 exact App Lock (L2 §5.2/§5.3).
 *
 * The Lock is the ONLY runtime fact BUILD produces (PRD AR-05/B04). It is
 * serialized as canonical JSON (UTF-8, lexicographic keys, no whitespace)
 * so repeated BUILD over identical input yields byte-identical files.
 *
 * closureDigest = sha256(canonicalJson(L)) where L is the full Lock value
 * tree with the `closureDigest` field REMOVED (L2 §5.3 P1-01). The
 * predecessor image has no self-reference: `bootstrapKdpPin` carries only
 * KDP-side facts; references to this Lock's digest exist solely in
 * installation-time records (`InstalledRecord`/`BootstrapPin`) and are
 * produced after the Lock is sealed.
 */
import type { ContentDigest, SemVer } from './base.js';
import type { EffectIntent, FunctionOutcomeKind } from './element-contracts.js';
import type { ElementRef, ElementVisibility, EntryRef, FunctionRef, ResolvedTarget } from './refs.js';
import type { PackageLayer, PackageRole } from './package-manifest.js';
import type { ResourceRef } from './element-contracts.js';
import type { DH_LOCK_SCHEMA_VERSION } from './schema-versions.js';
export interface SelectedPackage {
    readonly packageId: string;
    readonly version: SemVer;
    readonly layer: PackageLayer;
    readonly role: PackageRole;
    /** Exact Target artifact + digest. */
    readonly artifact: ResourceRef;
    /** True iff authoring declared a paired, digest-sealed technical lifecycle. */
    readonly technicalLifecycle: boolean;
    /** Resolved package-id dependency edges. */
    readonly dependsOn: readonly string[];
}
export interface SelectedElement {
    /** namespace + id + exact version + definitionDigest. */
    readonly ref: ElementRef;
    /** The one owner Package (PRD P04). */
    readonly ownerPackageId: string;
    readonly visibility: ElementVisibility;
    readonly contentDigests: readonly ContentDigest[];
    readonly contractDigests: readonly ContentDigest[];
}
export interface SelectedFunction {
    readonly ref: FunctionRef;
    readonly outcomes: readonly FunctionOutcomeKind[];
    /** 0.11.0 is permanently 'none'. */
    readonly effects: EffectIntent;
    /** The one selected implementation (PRD P05). */
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
/**
 * Acyclic pin of the KDP bootstrap artifact inside a Lock: KDP-side facts
 * only, with NO field pointing at this Lock's own digest (L2 §13.5 P1-01).
 */
export interface BootstrapKdpRef {
    readonly kdpPackageId: string;
    readonly kdpPrimaryEntry: 'bootstrap';
    /** implementationDigest of the KDP entry artifact. */
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
    /** Exact 'node24-esm/1'. */
    readonly target: ResolvedTarget;
    readonly bootstrapKdpPin: BootstrapKdpRef;
    readonly selectedPackages: readonly SelectedPackage[];
    readonly selectedElements: readonly SelectedElement[];
    readonly selectedFunctions: readonly SelectedFunction[];
    readonly hookBindings: readonly SealedHookBinding[];
    /** Package ids in BUILD topological order (lexicographic tie-break). */
    readonly technicalInitOrder: readonly string[];
    /** Strict reverse of technicalInitOrder. */
    readonly technicalDisposeOrder: readonly string[];
    /** Exactly one. */
    readonly businessAppInit: FunctionRef;
    readonly ingress: readonly SealedIngress[];
    /** Digests of the whole selected resource closure (PRD 5.1). */
    readonly resourceDigests: Readonly<Record<string, ContentDigest>>;
    /** Unknown optional content explicitly excluded from this Lock (L2 §2.3/PRD E10). */
    readonly excludedUnknownContent: readonly string[];
    /**
     * = sha256(canonicalJson(this Lock with `closureDigest` removed));
     * exact predecessor image in L2 §5.3.
     */
    readonly closureDigest: ContentDigest;
}
