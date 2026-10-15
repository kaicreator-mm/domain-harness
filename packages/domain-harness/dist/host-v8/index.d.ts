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
export type { CasDocumentStore, CasGetResult, CasPutConditions, ValidatedWriteCondition } from './cas.js';
export { openSqliteCasStore, SqliteCasStore } from './sqlite-cas-store.js';
export type { SqliteCasStoreOptions } from './sqlite-cas-store.js';
export { HOST_CREDENTIAL_TYPE, HostIdentityVerifier, assertCredentialShape, credentialBindingDigest, mintPrincipalCredential, revocationKey, } from './identity.js';
export type { HostCredential, HostPrincipal, PrincipalGrant } from './identity.js';
export { ResourceDispatcher } from './dispatcher.js';
export type { DispatchContext, ResourceCallRecord, ResourceHandler } from './dispatcher.js';
export { ScopedEventHub } from './events.js';
export type { EventScope, EventListener, HostEvent, HostSubscription } from './events.js';
export { bootstrapTrustedHost, isHostTrustChannelEstablished, } from './bootstrap.js';
export type { TrustedHostHandle, TrustedHostStorageSpec, TrustedHostStorageInstance, TrustedNodeHost, TrustedNodeHostInput } from './bootstrap.js';
export { assertIntentScope, createHostUxTransport, createUxTransport, uxDocumentNamespace, } from './ux-transport.js';
export type { UxDispatchReceipt, UxKernelRoute, UxQueryKind, UxQueryRequest, UxTarget, UxTransport } from './ux-transport.js';
export { createKernelGateway, kernelReceiptAsHostEvent, } from './kernel-gateway.js';
export type { KernelGateway, KernelGatewayAgentToolQueryResult, KernelGatewayAppInput, KernelGatewayCancelRequest, KernelGatewayCancelResult, KernelGatewayLatestObserver, KernelGatewayLatestObserverScope, KernelGatewayLatestObserverStatus, KernelGatewayLatestObserverUpdate, KernelGatewayOperationCall, KernelGatewayProjectionDependency, KernelGatewayProjectionRequest, KernelGatewaySendIntent, KernelGatewayToolCallRequest, KernelReceiptScope, KernelReceiptSubscription, } from './kernel-gateway.js';
export { HOST_TOOL_CALL_APPROVED_TRANSPORTS, HOST_TOOL_CALL_MAX_OUTPUT_BYTES, HOST_TOOL_CALL_TRANSPORT_LOCAL, HOST_TOOL_CALL_TRANSPORT_REMOTE_HTTP_JSON, dispatchHostToolCall, validateHostToolCallAdapters, } from './tool-call-port.js';
export type { HostToolCallAdapter, HostToolCallAdapters } from './tool-call-port.js';
export { HF20_MUTATION_OBSERVATION_CONTRACT_VERSION, HF20_MUTATION_OBSERVATION_KINDS, HF20_MUTATION_OBSERVATION_RETENTION_LIMIT, HF20_OBSERVATION_READ_LIMIT_DEFAULT, HF20_OBSERVATION_READ_LIMIT_MAX, HF20_OBSERVATION_READ_LIMIT_MIN, Hf20ObservationError, appendHf20MutationObservation, decodeHf20Cursor, encodeHf20Cursor, isHf20MutationObservationWindow, newHf20ObservationWindow, projectHf20ObservationPage, } from './hf20-mutation-observation.js';
export type { Hf20MutationCommitIntent, Hf20MutationObservationKind, Hf20MutationObservationRecord, Hf20MutationObservationWindow, Hf20ObservationCursor, Hf20ObservationErrorCode, Hf20ObservationGap, Hf20ObservationGapKind, Hf20ObservationPage, Hf20ObservationReadRequest, } from './hf20-mutation-observation.js';
export { ChildInvocationCoordinator, DurableControlError, ExternalWorkCoordinator, childInvocationCorrelationId, kernelTurnSourceOf } from './durable-controls.js';
export type { ChildInvocationRecord, ChildInvocationTurnPlan, DurableControlErrorCode, ExternalWorkRecord, ExternalWorkTurnSource, RegisterExternalWorkInput, } from './durable-controls.js';
//# sourceMappingURL=index.d.ts.map