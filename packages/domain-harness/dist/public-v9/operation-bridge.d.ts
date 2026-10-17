/**
 * DomainHarness v0.9 N08 (#1036) — the ONE executable H→K runtime bridge.
 * ===========================================================================
 *
 * INTERNAL TRUSTED COMPOSITION ONLY. This module is NOT re-exported from
 * `./v9` or any public subpath: there is deliberately no public constructor
 * that could accept a caller-supplied Host, Authenticator, Kernel, store or
 * module namespace. Only the trusted deployment/Host bootstrap composes it:
 *
 *   createV09DomainHarnessBridge({ store, trustedIssuers, audience,
 *     runtimeAbi, hostAbi, authenticator, presentation })
 *
 * …over the SAME trusted ingredients `createProtectedHostV09` consumes. It
 * consumes — never duplicates — the merged protected components:
 *
 *   - #1032 protected H registry: `activate(installedRef)` performs the real
 *     reference lookup, audience/ABI binding, stored-bytes re-hash, zero-import
 *     AST repeat, current approval proof and the shared per-subject CAS epoch
 *     commit, then evaluates the sealed bytes into REAL per-activation
 *     `data:` ESM namespaces (D01/D02).
 *   - #1124 trusted private principal authority: every `send`/`query`/effect
 *     mint re-authenticates the trusted presentation at the requested purpose
 *     (audience/app/tenant/subject/grant/epoch/expiry re-checked at every
 *     sensitive use — D03).
 *   - #1126 one-shot physical effect permit on the SAME shared per-subject
 *     CAS authority: `resources.call` mints a permit BEFORE the sealed
 *     capability handler executes; revoke-first refuses typed, permit-first
 *     completes truthfully (honest in-flight rule, D02/D03).
 *   - #1027 selected ABI discipline: the pure Standard WorkflowRouter runs
 *     from the SEALED standard module's own evaluated namespace, over the
 *     sealed route rows; a `missing`/`ambiguous`/`denied` outcome and a
 *     router result that does not exactly match one sealed route row
 *     (including the `sha256:<subjectDigest>` basis) admits nothing.
 *   - the selected Kernel mechanism (`createOccurrenceRuntime`) from the
 *     sealed kernel module's own namespace — the Kernel alone owns
 *     Admission, State, Journal, Effect and UNKNOWN; this bridge adds no
 *     second Runtime, Journal or Admission engine. K-owned durable docs ride
 *     the SAME injected physical store under `v9/k/<subjectDigest>/<tenantId>/`
 *     through a condition-shape adapter (per-tenant physical isolation).
 *
 * `load(installedRef: string)` is the one public input: exactly the opaque
 * H-issued reference string. `send`/`query` accept caller business data
 * only; authenticated identity and scope are always H-sourced. Public
 * failures collapse onto the frozen D04 families; protected subcodes stay
 * on the internal bridge diagnostics channel.
 *
 * #1120 lifecycle wiring: `subscribe`/`stop` are the #1120 scoped
 * lifecycle over THIS bridge's trusted ports — the selected Kernel's own
 * `observe` receipt side-channel (wired into `createOccurrenceRuntime`),
 * a REAL #1126 one-shot delivery permit minted on the shared per-subject
 * CAS authority at subscription, the #1124 fresh principal issue at every
 * `subscribe`/`delivery`/`stop` purpose, and the private #1120
 * `recheckDeliveryAuthorization` seam answering from the CURRENT authority
 * record (revoked / expired / unknown-permit refuse; a recorded unexpired
 * permit digest is authorized with its epoch) on EVERY sensitive delivery.
 * The per-facade `dispose` mirrors the bridge's own trusted teardown for
 * exactly that facade. No second Runtime, Journal, issuer or observer
 * authority is created here.
 */
import { type ProtectedHostV09 } from '../host-v9/registry.js';
import { type V09HostDocumentStore } from '../host-v9/store-port.js';
import type { V09TrustedIssuers } from '../host-v9/approval.js';
import { type V09PrivateHostAuthenticator } from '../operations-v9/private-principal.js';
import { type V9PublicErrorCode } from './errors.js';
import type { V9DomainHarness } from './contracts.js';
/** Internal channel verification; does NOT return a Host or privileged port. */
export declare function isV09AuthenticatedBridgeHarness(value: unknown): value is V9DomainHarness;
export interface V09BridgeBootstrap {
    /** The SAME physical store the protected H registry was bootstrapped with. */
    readonly store: V09HostDocumentStore;
    readonly trustedIssuers: V09TrustedIssuers;
    readonly audience: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    /** Trusted Host caller authenticator (#1124 port); deployment material, never public. */
    readonly authenticator: V09PrivateHostAuthenticator;
    /** The deployment's authenticated caller presentation, fixed at composition. */
    readonly presentation: unknown;
    /** Trusted activation authority class; fixed by the deployment profile, never caller input. */
    readonly authorityClass?: string;
    /** Trusted monotonic-enough Host clock; test injection internal. */
    readonly nowMs?: () => number;
}
export interface V09BridgeDiagnostic {
    readonly at: string;
    readonly operation: string;
    readonly internalCode: string;
    readonly publicCode: V9PublicErrorCode;
}
/** The #1120 delivery-recheck seam answer for a still-current one-shot permit. */
export interface V09DeliveryAuthorization {
    readonly decision: 'authorized';
    readonly authorityEpoch: number;
    readonly expiresAtMs: number;
}
export interface V09ComposedBridge {
    /** The public value: `load` is the ONLY method; no host/kernel/namespace escape. */
    readonly harness: V9DomainHarness;
    /** Host-only request scope: never exposed from the published ./v9 value. */
    runWithinTrustedContext<T>(action: () => T | Promise<T>): Promise<T>;
    /** The trusted governance channel (the protected H this bridge composed). */
    host(): Promise<ProtectedHostV09>;
    /** Private #1120 seam: current-authority delivery authorization recheck. */
    recheckDeliveryAuthorization(subjectDigest: unknown, permitDigest: unknown): Promise<V09DeliveryAuthorization>;
    /** Trusted-internal protected subcode channel (never public). */
    drainBridgeDiagnostics(): readonly V09BridgeDiagnostic[];
    /** Trusted lifecycle teardown: invalidates every facade and closes the host. */
    close(): Promise<void>;
}
/**
 * Compose the ONE executable bridge. Trusted bootstrap only; the returned
 * `harness` is the public `V9DomainHarness` value (`load` alone).
 */
export declare function createV09DomainHarnessBridge(bootstrap: V09BridgeBootstrap): V09ComposedBridge;
//# sourceMappingURL=operation-bridge.d.ts.map