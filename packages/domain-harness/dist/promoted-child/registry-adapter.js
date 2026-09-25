/**
 * Adapter from the merged T-012 registry to the narrow T-017 seam.
 * T-012 remains the sole owner of registry storage, lifecycle and retention;
 * retention therefore flows through the registry's own validated retain/release
 * surface, never the raw store.
 */
export function createRegistryPromotedChildArtifactPort(registry) {
    return {
        resolveExact: async (artifact, expectedAuthority) => {
            // Fresh exact selection stays revocation-blocked and loads exactly once.
            const loaded = await registry.resolveExactDetailed(artifact, expectedAuthority);
            return { body: loaded.body, promotion: loaded.promotion, selection: { kind: 'exact-digest', artifact } };
        },
        selectVersion: (artifactId, version, expectedAuthority) => registry.selectVersion({
            artifactId,
            version,
            expectedAuthority,
        }),
        selectAlias: (artifactId, alias, expectedRevision, expectedAuthority) => registry.selectAlias({
            artifactId,
            alias,
            ...(expectedRevision !== undefined ? { expectedRevision } : {}),
            expectedAuthority,
        }),
        recoverExact: async (artifact, expectedAuthority) => {
            const loaded = await registry.recoverExact(artifact, expectedAuthority);
            return { body: loaded.body, promotion: loaded.promotion, selection: { kind: 'exact-digest', artifact } };
        },
        putRetention: async (reference) => registry.retain(reference),
        releaseRetention: async (expected) => registry.release(expected),
    };
}
//# sourceMappingURL=registry-adapter.js.map