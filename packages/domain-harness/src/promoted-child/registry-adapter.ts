import type {
  PromotedArtifactStore,
  SelectedPromotedArtifact,
} from '../promoted-artifact/contracts.js';
import type { PromotedArtifactRegistry } from '../promoted-artifact/registry.js';
import type { PromotedChildArtifactPort } from './contracts.js';

/**
 * Adapter from the merged T-012 registry/store to the narrow T-017 seam.
 * T-012 remains the sole owner of registry storage, lifecycle and retention.
 */
export function createRegistryPromotedChildArtifactPort(
  registry: PromotedArtifactRegistry,
  store: PromotedArtifactStore,
): PromotedChildArtifactPort {
  return {
    resolveExact: async (artifact, expectedAuthority) => {
      // Fresh exact selection must stay revocation-blocked: resolveExact throws
      // for revoked/missing artifacts BEFORE the provenance reload below runs.
      const body = await registry.resolveExact(
        artifact,
        expectedAuthority,
      );
      const loaded = await registry.recoverExact(artifact, expectedAuthority);
      return { body, promotion: loaded.promotion, selection: { kind: 'exact-digest', artifact } };
    },
    selectVersion: (artifactId, version, expectedAuthority) => registry.selectVersion({
      artifactId,
      version,
      expectedAuthority: expectedAuthority,
    }),
    selectAlias: (artifactId, alias, expectedRevision, expectedAuthority) => registry.selectAlias({
      artifactId,
      alias,
      ...(expectedRevision !== undefined ? { expectedRevision } : {}),
      expectedAuthority: expectedAuthority,
    }),
    recoverExact: async (artifact, expectedAuthority): Promise<SelectedPromotedArtifact> => {
      const loaded = await registry.recoverExact(
        artifact,
        expectedAuthority,
      );
      return { body: loaded.body, promotion: loaded.promotion, selection: { kind: 'exact-digest', artifact } };
    },
    putRetention: (reference) => store.putRetention(reference),
    releaseRetention: (expected) => store.releaseRetention(expected),
  };
}
