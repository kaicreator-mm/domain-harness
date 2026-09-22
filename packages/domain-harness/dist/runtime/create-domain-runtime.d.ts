import type { AIOperationPort } from '../contracts/ai.js';
import type { DomainIntelligencePackageIdentity } from '../contracts/domain-data.js';
import type { CompiledDomainDataPort } from '../projection/compiled-domain-data.js';
import type { BusinessSnapshotPort } from '../v2/contracts/projection.js';
import type { DomainRuntime } from '../v2/contracts/runtime.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type { RuntimeHostBindings, RuntimeResources } from '../v2/contracts/host.js';
import type { PackageRegistry } from '../v2/contracts/package.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
export interface CreateDomainRuntimeOptions {
    packageRegistry: PackageRegistry;
    store: RuntimeStore;
    bindings: RuntimeHostBindings;
    resources?: RuntimeResources;
    /** Provider-neutral AI Runtime port used only by compiled AI Skill invokes. */
    ai?: AIOperationPort;
    businessSnapshots?: BusinessSnapshotPort;
    domainData?: CompiledDomainDataPort;
    now?: () => string;
    onBackgroundError?: (error: unknown, target: WorkflowAddress) => void;
    /**
     * Issue #312 durable ordered Runtime Observation Stream. Absent/unsupported
     * keeps every existing Runtime semantic unchanged and exposes the explicit
     * `{ status: 'UNSUPPORTED' }` capability; `enabled` requires an
     * observation-capable RuntimeStore (`RuntimeObservationStore`) so every
     * covered mutation commits atomically with its observation record.
     */
    observation?: RuntimeObservationEnableOptions;
}
/** Enablement options for the durable Runtime Observation Stream (#312). */
export interface RuntimeObservationEnableOptions {
    readonly mode: 'enabled';
    /**
     * Overrides the default exact package identity mapping. By default the
     * compiled manifest maps to `DomainIntelligencePackageIdentity` via
     * `runtimePackageIdentityFromManifest` (contentDigest = the content-derived
     * compiled packageId, verified at activation).
     */
    readonly resolvePackageIdentity?: (packageId: string) => DomainIntelligencePackageIdentity;
    /** Opaque DAC/A2-owned provenance refs, carried verbatim when the host holds them. */
    readonly runtimeBindingRef?: string;
    readonly runtimeActivationRef?: string;
}
/**
 * Activates the portable v0.2 Runtime from already-target-compiled package modules.
 * No Raw Domain Package loader/compiler is imported or reachable from this path.
 */
export declare function createDomainRuntime(options: CreateDomainRuntimeOptions): Promise<DomainRuntime>;
//# sourceMappingURL=create-domain-runtime.d.ts.map