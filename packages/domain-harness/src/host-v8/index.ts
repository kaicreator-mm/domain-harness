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

export {
  InMemoryCasStore,
  probeTrueCasStore,
  validateWriteCondition,
} from './cas.js';
export type { CasDocumentStore, CasGetResult, CasPutConditions, ValidatedWriteCondition } from './cas.js';

export { openSqliteCasStore, SqliteCasStore } from './sqlite-cas-store.js';
export type { SqliteCasStoreOptions } from './sqlite-cas-store.js';

export {
  HOST_CREDENTIAL_TYPE,
  HostIdentityVerifier,
  assertCredentialShape,
  credentialBindingDigest,
  mintPrincipalCredential,
  revocationKey,
} from './identity.js';
export type { HostCredential, HostPrincipal, PrincipalGrant } from './identity.js';

export { ResourceDispatcher } from './dispatcher.js';
export type { DispatchContext, ResourceCallRecord, ResourceHandler } from './dispatcher.js';

export { ScopedEventHub } from './events.js';
export type { EventScope, EventListener, HostEvent, HostSubscription } from './events.js';

export {
  bootstrapTrustedHost,
  isHostTrustChannelEstablished,
} from './bootstrap.js';
export type { TrustedHostHandle, TrustedHostStorageSpec, TrustedNodeHost, TrustedNodeHostInput } from './bootstrap.js';

export {
  assertIntentScope,
  createHostUxTransport,
  createUxTransport,
  uxDocumentNamespace,
} from './ux-transport.js';
export type { UxDispatchReceipt, UxQueryKind, UxQueryRequest, UxTarget, UxTransport } from './ux-transport.js';
