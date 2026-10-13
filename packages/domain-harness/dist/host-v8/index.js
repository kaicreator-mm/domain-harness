/**
 * `@kaicreator/domain-harness/v8/host` — trusted Node Host subpath (T-E, #1004).
 * ================================================================================
 *
 * The Host-side T-E surface, deliberately SEPARATE from the public v8
 * qualified-package facade (`./v8`, owned by T-B): this subpath is the
 * governance/Host bootstrap + physical storage + typed UX transport
 * boundary. It is the ONLY caller of the protected load trust channel
 * installation (public-v8/trust.ts) in the host graph.
 *
 * Not re-exported here, deliberately: anything from public-v8 (the facade
 * belongs to T-B); installer.ts internals; K-owned Guard/Effect/Journal
 * logic (T-C domain); Standard SDK (T-D domain).
 */
export { HostBoundaryError } from './errors.js';
export { InMemoryCasStore, probeTrueCasStore, validateWriteCondition, } from './cas.js';
export { openSqliteCasStore, SqliteCasStore } from './sqlite-cas-store.js';
export { HOST_CREDENTIAL_TYPE, HostIdentityVerifier, assertCredentialShape, credentialBindingDigest, mintPrincipalCredential, revocationKey, } from './identity.js';
export { ResourceDispatcher } from './dispatcher.js';
export { ScopedEventHub } from './events.js';
export { bootstrapTrustedHost, isHostTrustChannelEstablished, } from './bootstrap.js';
export { assertIntentScope, createHostUxTransport, createUxTransport, uxDocumentNamespace, } from './ux-transport.js';
export { createKernelGateway, kernelReceiptAsHostEvent, } from './kernel-gateway.js';
//# sourceMappingURL=index.js.map