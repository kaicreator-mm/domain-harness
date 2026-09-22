import type { AIOperationPort } from '../contracts/ai.js';
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
}
/**
 * Activates the portable v0.2 Runtime from already-target-compiled package modules.
 * No Raw Domain Package loader/compiler is imported or reachable from this path.
 */
export declare function createDomainRuntime(options: CreateDomainRuntimeOptions): Promise<DomainRuntime>;
//# sourceMappingURL=create-domain-runtime.d.ts.map