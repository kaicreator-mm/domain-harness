/**
 * DomainHarness v0.9 — THE one supported deployment-owned trusted bootstrap
 * entry, published as the `@kaicreator/domain-harness/v9/deployment` subpath
 * (#1118 review P1-01 bounded repair).
 * ===========================================================================
 *
 * ISOLATION CONTRACT. This subpath is deliberately separate from the ordinary
 * consumer app API `@kaicreator/domain-harness/v9`, which still exports ONLY
 * the frozen `DomainHarness` value whose single verb is
 * `load(installedRef: string)` — a consumer can never pass a Host, verifier,
 * Kernel, issuer, store or module namespace through it. Conversely this
 * deployment entry exports no consumer-facing facade: `DomainHarness` is not
 * re-exported here. The raw trusted-channel registrar
 * (`attachV09TrustedBridge` / `runV09InTrustedHostScope`) stays internal —
 * the ONLY supported way to enter the trusted Host request scope is the
 * composed bridge's `runWithinTrustedContext` returned below.
 *
 * AUTHORITY MODEL. Importing this module grants no cross-deployment
 * authority. The trusted ingredients a deployment must ALREADY own are the
 * authority: the physical `V09HostDocumentStore` instance (its data is the
 * deployment's installed packages and durable journals), the trusted issuer
 * secrets map, and the Host caller authenticator. A process that composes a
 * bridge over its OWN materials can only load ITS OWN installed packages —
 * it can never read, borrow or select another deployment's Host, because the
 * public `load` never scans a process-global Host set.
 *
 * PRECISE REQUEST-SCOPED INVOCATION MODEL.
 *  1. The deployment process composes exactly one bridge per trusted
 *     presentation with `createV09DomainHarnessBridge({ store,
 *     trustedIssuers, audience, runtimeAbi, hostAbi, authenticator,
 *     presentation })` (same ingredients `createProtectedHostV09` consumes).
 *  2. For each inbound caller request the deployment invokes
 *     `bridge.runWithinTrustedContext(async () => { ... })` around the
 *     consumer handler. Inside that callback — and only inside it — an
 *     ordinary consumer module (importing only `.../v9`) calls
 *     `await DomainHarness.load(installedRef)` and uses the returned facade's
 *     `send` / `query` / `subscribe` / `stop`.
 *  3. Every facade verb re-checks the SAME current trusted Host scope at use
 *     time. A facade captured inside one trusted callback and then used
 *     AFTER that callback returned (or inside a different Host's callback)
 *     refuses with the public `CALLER_SCOPE_DENIED` family — the facade is
 *     not a transferable bearer capability.
 *  4. `bridge.close()` detaches the public binding synchronously BEFORE the
 *     async teardown; every later `load` or facade verb fails closed.
 *
 * INSTALLATION. `createProtectedHostV09` over the SAME store materials is
 * the supported governance path for `install(sealedRoot, approvalProof,
 * audience)` / `revoke(subjectDigest, reason)`; `issueV09ApprovalProof`
 * mints the approval with a trusted issuer secret the deployment owns, and
 * `computeV09SealedRootSubjectDigest` re-derives the content-addressed
 * subject digest so an operator can verify a received sealed root before
 * installing it.
 */
export { createV09DomainHarnessBridge } from './operation-bridge.js';
export type { V09BridgeBootstrap, V09BridgeDiagnostic, V09ComposedBridge, V09DeliveryAuthorization, } from './operation-bridge.js';
export { V09_HOST_ABI, V09_IMPORT_POLICY_REVISION, V09_RUNTIME_ABI, V09_SEALED_ROOT_FORMAT, computeV09SealedRootSubjectDigest, createProtectedHostV09, issueV09ApprovalProof, verifyV09ApprovalProof, } from '../host-v9/index.js';
export type { ProtectedHostV09, ProtectedHostV09Options, V09ApprovalProof, V09SealedQualifiedRootData, V09TrustedIssuers, } from '../host-v9/index.js';
export { V09HostStoreError } from '../host-v9/index.js';
export type { V09HostDocumentStore, V09StorePutCondition } from '../host-v9/index.js';
export type { V09HostVerifiedIdentity, V09PrivateHostAuthenticator, } from '../operations-v9/private-principal.js';
//# sourceMappingURL=deployment.d.ts.map