import type { AIOperationPort } from '../contracts/ai.js';
import type { DomainIntelligencePackageIdentity } from '../contracts/domain-data.js';
import { type RuntimeControlAuthorizer, type RuntimeControlStore } from '../control/index.js';
import type { CompiledDomainDataPort } from '../projection/compiled-domain-data.js';
import type { PackageDataBounds } from '../v2/contracts/package-data.js';
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
    /**
     * I-03-ASSEMBLY successor profile enablement: host-side maxima declaring
     * this Runtime/host also accepts successor ('0.3',2,3) packages. Absent
     * (the default) keeps the exact historical legacy-only 0.2/2/2 activation
     * policy. These maxima are host authority; package-recorded bounds may
     * never exceed them and are never truncated or raised.
     */
    supportedPackageDataBounds?: PackageDataBounds;
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
    /**
     * Issue #313 generic public Runtime cancel/interrupt control. Absent (the
     * default) keeps every existing Runtime semantic unchanged and exposes the
     * explicit default-deny `{ status: 'UNSUPPORTED' }` control capability: no
     * authorizer means no external control authority. `enabled` requires a
     * fail-closed `RuntimeControlAuthorizer` plus a durable `RuntimeControlStore`
     * for request/outcome evidence and restart reconciliation.
     */
    control?: RuntimeControlEnableOptions;
}
/** Enablement options for the generic public Runtime control surface (#313). */
export interface RuntimeControlEnableOptions {
    readonly mode: 'enabled';
    readonly authorizer: RuntimeControlAuthorizer;
    readonly store: RuntimeControlStore;
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
    /** Opaque DAC/A2-owned provenance refs, carried verbatim on records when present. */
    readonly runtimeBindingRef?: string;
    readonly runtimeActivationRef?: string;
}
/**
 * Activates the portable retained Runtime from already-target-compiled package
 * modules. The public v0.2 entrypoint always uses the historical processing
 * path; createDomainRuntimeV3 alone opts into the frozen T-009 commit path.
 */
export declare function createDomainRuntime(options: CreateDomainRuntimeOptions): Promise<DomainRuntime>;
/** Internal v3 assembly entrypoint; intentionally not re-exported by runtime/index.ts. */
export declare function createDomainRuntimeWithProcessCommandOutcomes(options: CreateDomainRuntimeOptions, out?: {
    validatedPackages?: PackageRegistry;
}): Promise<DomainRuntime>;
//# sourceMappingURL=create-domain-runtime.d.ts.map