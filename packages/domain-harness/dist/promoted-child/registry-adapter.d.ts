import type { PromotedArtifactRegistry } from '../promoted-artifact/registry.js';
import type { PromotedChildArtifactPort } from './contracts.js';
/**
 * Adapter from the merged T-012 registry to the narrow T-017 seam.
 * T-012 remains the sole owner of registry storage, lifecycle and retention;
 * retention therefore flows through the registry's own validated retain/release
 * surface, never the raw store.
 */
export declare function createRegistryPromotedChildArtifactPort(registry: PromotedArtifactRegistry): PromotedChildArtifactPort;
//# sourceMappingURL=registry-adapter.d.ts.map