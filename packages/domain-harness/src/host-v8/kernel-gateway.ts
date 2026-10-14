/**
 * v0.8 trusted Node Host — authenticated Kernel gateway (#1013, I02/I03).
 * ===========================================================================
 *
 * The Host-side bridge between the typed authenticated UX boundary and the
 * REAL selected Kernel of a loaded qualified Domain App closure:
 *
 *   credential ──H authenticate──► HostPrincipal ──scope gate──► private
 *   facade ops (public-v8/microkernel.ts getFacadeKernelOps) ──► Kernel
 *   submitOccurrence / getSnapshot / protected Genesis openInstance.
 *
 * Authority rules enforced here (the #1005@6112954208 / #1013 repair):
 *   - every verb re-authenticates the presented credential (issuer,
 *     audience, tenant, app, currentness, durable revocation) through the
 *     trusted Host verifier — nothing is cached from a previous call;
 *   - the Kernel `caller` is derived ONLY from the issuer-signed roles ∩
 *     the sealed Business binding roles (decided inside the private ops
 *     seam); a caller-declared role is user data and never reaches the
 *     Kernel as authority;
 *   - cross-tenant / cross-app / malformed instance targets are refused
 *     typed before any Kernel activity (assertIntentScope);
 *   - Genesis activation is a PROTECTED Host command: it requires a
 *     host-configured genesis role on the authenticated principal, and the
 *     initial state/context stay owned by the sealed Business policy — no
 *     raw `openInstance`, Kernel namespace or Journal handle ever escapes;
 *   - app registration is DURABLY pinned (#1013 R1 F-02): the exact
 *     installed closure identity (rootPackageId + whole-closure digest +
 *     K/S/B module digests + host audience) is persisted in the physical
 *     Host store under guarded CAS, so package replacement / stale roots
 *     refuse across process restarts before their module bytes ever load,
 *     and re-registering the SAME closure after a restart is idempotent.
 *     The registration is ATOMIC (#1023 S04 R1 P1-01): the capability
 *     resource adapters install as one all-or-nothing batch BEFORE the
 *     durable pin commit, and ANY post-load failure rolls the batch back,
 *     awaits the facade's S03 lifecycle teardown and leaves no pin, no
 *     partial adapter and no live facade behind;
 *   - K-receipt subscriptions re-authenticate the credential on EVERY
 *     delivery and silently stop when the grant is no longer valid;
 *   - cancellation (#1003 FR07-KH2, B3) is request-scoped and
 *     H-authenticated: every `send` mints ONE AbortController whose signal
 *     rides beside the Kernel request as the protected occurrence control;
 *     `cancel` re-authenticates, applies the same tenant/app scope gate and
 *     aborts only an in-flight occurrence the SAME principal subject
 *     submitted (any other id, or another subject's, answers
 *     `not-in-flight` alike). The signal carries no authority — the selected Kernel owns
 *     the latch, and a cancel arriving after K closed it for admission
 *     cannot split the authoritative occurrence.
 *
 * This module wires; it implements no Kernel policy, no Guard/Effect/
 * Journal semantics and no second runtime (those belong to the physically
 * selected Kernel package, T-C).
 */

import { DomainHarness, getFacadeKernelOps, type V8DomainFacade, type V8FacadeKernelOps } from '../public-v8/microkernel.js';
import { QualifiedPackageError, canonicalSnapshot, sha256Hex } from '../public-v8/contracts.js';
import { HostBoundaryError } from './errors.js';
import type { TrustedNodeHost } from './bootstrap.js';
import { assertIntentScope, type UxTarget } from './ux-transport.js';
import type { HostEvent } from './events.js';
import type { HostCredential, HostPrincipal } from './identity.js';

/** One registered qualified Domain App closure bound to a host appId. */
export interface KernelGatewayAppInput {
  /** Host application identity; credentials are audience/tenant/app-bound to this. */
  readonly appId: string;
  /**
   * The sealed qualified package root (compiler BUILD + external approval
   * proof) loaded through the PUBLIC one-argument `DomainHarness.load`.
   */
  readonly packageRoot: unknown;
  /**
   * Roles (issuer-signed) allowed to run the protected Genesis activation
   * for this app. Host governance configuration — never caller data.
   */
  readonly genesisRoles: readonly string[];
}

export interface KernelGatewaySendIntent {
  readonly intentType: string;
  readonly messageId: string;
  readonly input?: unknown;
  readonly target: UxTarget;
}

/** K-receipt subscription scope (all fields must stay inside the principal). */
export interface KernelReceiptScope {
  readonly appId: string;
  readonly instanceKey: string;
}

export interface KernelReceiptSubscription {
  unsubscribe(): void;
}

/** Request-scoped cancellation request (#1003 FR07-KH2). */
export interface KernelGatewayCancelRequest {
  readonly target: UxTarget;
  readonly messageId: string;
}

/**
 * #1023 S04 — one authenticated BUILD-fixed OperationCall through the
 * gateway. Pure operations carry only the capability/operation identity
 * and plain-JSON input; effectful operations additionally carry the
 * occurrence address components exactly like an authenticated send.
 */
export interface KernelGatewayOperationCall {
  readonly appId: string;
  readonly capabilityId: string;
  readonly operationId: string;
  readonly input?: unknown;
  /** Effectful operations only: the occurrence instance address component. */
  readonly instanceKey?: string;
  /** Effectful operations only: the occurrence dedup/replay identity. */
  readonly messageId?: string;
}

/**
 * `cancel-requested`: the in-flight occurrence's signal was raised — the
 * `send` receipt stays the authoritative outcome (`terminated`/CANCELLED, or
 * `admitted` when K had already closed its latch for admission).
 * `not-in-flight`: nothing of this principal is running under that id.
 */
export interface KernelGatewayCancelResult {
  readonly status: 'cancel-requested' | 'not-in-flight';
}

export interface KernelGateway {
  /** Host-context provisioning: load + bind one approved Domain App. */
  registerApp(input: KernelGatewayAppInput): Promise<void>;
  /** Whether an app closure is registered for the appId (routing probe). */
  hasApp(appId: string): boolean;
  /** Authenticated send through the REAL selected Kernel of the app. */
  send(credential: unknown, intent: KernelGatewaySendIntent): Promise<unknown>;
  /**
   * #1023 S04: authenticated BUILD-fixed OperationCall. Every call
   * re-authenticates the credential and scope-gates the authenticated
   * principal's app exactly like send; pure operations dispatch the exact
   * sealed handler, effectful operations traverse the same unbypassable
   * Business admission + Kernel occurrence path as send.
   */
  invokeOperation(credential: unknown, request: KernelGatewayOperationCall): Promise<unknown>;
  /** Authenticated, request-scoped cancellation of the principal's own in-flight send. */
  cancel(credential: unknown, request: KernelGatewayCancelRequest): Promise<KernelGatewayCancelResult>;
  /** Authenticated scoped instance read (K getSnapshot). */
  queryInstance(credential: unknown, target: UxTarget): Promise<unknown>;
  /** Authenticated subscribe to Kernel receipts; revalidated per delivery. */
  subscribe(credential: HostCredential, scope: KernelReceiptScope, listener: (receipt: unknown) => void): Promise<KernelReceiptSubscription>;
  /** Protected Genesis activation (host-configured role authority). */
  activateGenesis(credential: unknown, request: {
    readonly appId: string;
    readonly instanceKey: string;
    readonly correlationId?: string;
  }): Promise<unknown>;
}

interface RegisteredApp {
  readonly appId: string;
  readonly facade: V8DomainFacade;
  readonly ops: V8FacadeKernelOps;
  readonly genesisRoles: readonly string[];
}

/** The durable app-registration pin record (physical Host store). */
interface AppClosurePinRecord {
  readonly pinVersion: 1;
  readonly appId: string;
  readonly audience: string;
  readonly rootPackageId: string;
  readonly closureDigest: string;
  readonly packages: readonly { readonly packageId: string; readonly kind: string; readonly moduleSha256: string }[];
  readonly closurePin: string;
}

/**
 * Durable CAS key under which a gateway registration pins the EXACT
 * installed closure identity of an app (#1013 R1 F-02). Same namespace
 * convention as the revocation records; never inside the Kernel journal
 * prefix (`v08-kernel:…`).
 */
function appPinKey(appId: string): string {
  return `v8host:gateway:app-pin:${appId}`;
}

/** The descriptor-safe closure identity read off a sealed root BEFORE load. */
interface ClaimedClosureIdentity {
  readonly rootPackageId: string;
  readonly closureDigest: string;
  readonly packages: readonly { readonly packageId: string; readonly kind: string; readonly moduleSha256: string }[];
}

function readPackageShas(packages: unknown): { packageId: string; kind: string; moduleSha256: string }[] | undefined {
  if (!Array.isArray(packages)) return undefined;
  const out: { packageId: string; kind: string; moduleSha256: string }[] = [];
  for (const pkg of packages) {
    if (typeof pkg !== 'object' || pkg === null) return undefined;
    const record = pkg as { packageId?: unknown; kind?: unknown; moduleSha256?: unknown };
    if (typeof record.packageId !== 'string' || typeof record.kind !== 'string' || typeof record.moduleSha256 !== 'string') return undefined;
    out.push({ packageId: record.packageId, kind: record.kind, moduleSha256: record.moduleSha256 });
  }
  return out.sort((a, b) => (a.packageId < b.packageId ? -1 : a.packageId > b.packageId ? 1 : 0));
}

/**
 * Best-effort descriptor-safe read of the identity a SUPPLIED root claims
 * (canonicalSnapshot never invokes hostile getters). Returns `undefined`
 * when the shape is unreadable — the qualified load remains the authority
 * that refuses malformed roots typed; the pin check just runs earlier.
 */
function readClaimedClosureIdentity(packageRoot: unknown): ClaimedClosureIdentity | undefined {
  let snapshot: unknown;
  try {
    snapshot = canonicalSnapshot(packageRoot);
  } catch {
    return undefined;
  }
  if (typeof snapshot !== 'object' || snapshot === null) return undefined;
  const record = snapshot as { rootPackageId?: unknown; build?: unknown; packages?: unknown };
  const build = record.build;
  if (typeof record.rootPackageId !== 'string' || typeof build !== 'object' || build === null) return undefined;
  const closureDigest = (build as { closureDigest?: unknown }).closureDigest;
  if (typeof closureDigest !== 'string') return undefined;
  const packages = readPackageShas(record.packages);
  if (packages === undefined) return undefined;
  return { rootPackageId: record.rootPackageId, closureDigest, packages };
}

/** The same identity off the LOADED build trace (authoritative form). */
function readInstalledClosureIdentity(trace: unknown): ClaimedClosureIdentity | undefined {
  if (typeof trace !== 'object' || trace === null) return undefined;
  const record = trace as { root?: unknown; packages?: unknown };
  if (typeof record.root !== 'object' || record.root === null) return undefined;
  const root = record.root as { rootPackageId?: unknown; closureDigest?: unknown };
  if (typeof root.rootPackageId !== 'string' || typeof root.closureDigest !== 'string') return undefined;
  const packages = readPackageShas(record.packages);
  if (packages === undefined) return undefined;
  return { rootPackageId: root.rootPackageId, closureDigest: root.closureDigest, packages };
}

function closurePin(appId: string, audience: string, identity: ClaimedClosureIdentity): string {
  return sha256Hex(JSON.stringify({
    pinVersion: 1,
    appId,
    audience,
    rootPackageId: identity.rootPackageId,
    closureDigest: identity.closureDigest,
    packages: identity.packages,
  }));
}

export function createKernelGateway(input: { readonly host: TrustedNodeHost; readonly gatewaySessionCap: string }): KernelGateway {
  if (typeof input !== 'object' || input === null || typeof input.host !== 'object' || input.host === null) {
    throw new HostBoundaryError('GATEWAY_MALFORMED', 'createKernelGateway requires the trusted host handle from bootstrapTrustedHost');
  }
  if (typeof input.gatewaySessionCap !== 'string' || input.gatewaySessionCap.length === 0) {
    throw new HostBoundaryError(
      'GATEWAY_MALFORMED',
      'createKernelGateway requires the gateway session capability issued by bootstrapTrustedHost (handle.gatewaySessionCap); the protected facade ops seam is closed without it (#1013 R2 @6122817203)',
    );
  }
  const host = input.host;
  const gatewaySessionCap = input.gatewaySessionCap;
  const apps = new Map<string, RegisteredApp>();
  /**
   * In-flight cancellable occurrences, keyed by the authenticated
   * tenant/app + instanceKey + messageId (#1003 FR07-KH2). Entries exist
   * only while their `send` is running.
   */
  const inFlight = new Map<string, Set<{ readonly subject: string; readonly controller: AbortController }>>();

  function inFlightKey(principal: HostPrincipal, target: UxTarget, messageId: unknown): string {
    return JSON.stringify([principal.tenantId, principal.appId, target.instanceKey, messageId]);
  }

  async function authenticate(credential: unknown): Promise<HostPrincipal> {
    return host.authenticate(credential);
  }

  function requireApp(appId: string, principal: HostPrincipal): RegisteredApp {
    // The appId is taken from the AUTHENTICATED principal (or asserted
    // equal to it) — never from unverified request data alone.
    const app = apps.get(principal.appId);
    if (app === undefined || app.appId !== appId) {
      throw new HostBoundaryError(
        'HOST_SCOPE_DENIED',
        `no qualified Domain App closure is registered on this gateway for the authenticated app ${principal.appId}; cross-app routing is refused`,
      );
    }
    return app;
  }

  const gateway: KernelGateway = {
    async registerApp(registration: KernelGatewayAppInput): Promise<void> {
      if (typeof registration.appId !== 'string' || registration.appId.length === 0 || registration.appId.includes(':')) {
        throw new HostBoundaryError('GATEWAY_APP_MALFORMED', 'registerApp requires a non-empty appId without the namespace delimiter \':\'');
      }
      if (!Array.isArray(registration.genesisRoles) || registration.genesisRoles.length === 0
        || !registration.genesisRoles.every((role) => typeof role === 'string' && role.length > 0)) {
        throw new HostBoundaryError('GATEWAY_APP_MALFORMED', 'registerApp requires a non-empty genesisRoles array of host governance roles');
      }
      if (apps.has(registration.appId)) {
        throw new HostBoundaryError('GATEWAY_APP_ALREADY_REGISTERED', `app ${registration.appId} is already registered on this gateway`);
      }
      // ---- #1013 R1 F-02: durable app-registration closure pin. The EXACT
      // installed closure identity (appId + host audience + rootPackageId +
      // whole-closure digest + per-package K/S/B module digests) is pinned in
      // the PHYSICAL Host store under guarded CAS, so package
      // replacement/stale roots refuse across process restarts — a second,
      // independently valid signed closure for the same appId never gets to
      // load (its module bytes never execute), and re-registering the SAME
      // closure after a restart is idempotent. This all happens BEFORE any
      // effect or Genesis can run through the app.
      const pinKey = appPinKey(registration.appId);
      const pinnedEntry = await host.docs.get(pinKey);
      const pinned = pinnedEntry !== null && typeof pinnedEntry.value === 'object' && pinnedEntry.value !== null
        ? (pinnedEntry.value as { closurePin?: unknown }).closurePin
        : undefined;
      if (pinnedEntry !== null && pinned === undefined) {
        throw new HostBoundaryError('GATEWAY_APP_PIN_INVALID', `app ${registration.appId} carries an unreadable registration pin in the physical Host store`);
      }
      if (pinned !== undefined) {
        // Pre-load refusal: descriptor-safe claimed identity, no module bytes.
        const claimed = readClaimedClosureIdentity(registration.packageRoot);
        const claimedPin = claimed === undefined ? undefined : closurePin(registration.appId, host.audience, claimed);
        if (claimedPin === undefined || claimedPin !== pinned) {
          throw new HostBoundaryError(
            'GATEWAY_APP_CLOSURE_MISMATCH',
            `app ${registration.appId} is durably pinned to a different approved closure on this host (rootPackageId/closureDigest/K/S/B module digests differ); package replacement and stale roots refuse before load`,
          );
        }
      }
      // The PUBLIC one-argument load — qualification, trust gate, whole-
      // closure byte preflight and physical import all happen inside.
      // #1023 S04 R1 P1-01: from this S03-activating load on, the
      // registration is ALL-OR-NOTHING — any failure below rolls back every
      // resource adapter THIS call installed (bounded reversible batch) and
      // AWAITS the facade's reverse-order lifecycle teardown, so no durable
      // pin, no partial adapter install and no live facade can survive a
      // refused registration.
      const facade = await DomainHarness.load(registration.packageRoot);
      const installedKeys: string[] = [];
      let ops: V8FacadeKernelOps | undefined;
      try {
        // #1013 R2 (@6122817203): the ops seam requires the bootstrap-issued
        // gateway session capability — structural access to the sibling
        // module or a forged principal carries no authority here.
        ops = getFacadeKernelOps(facade, gatewaySessionCap);
        if (ops === undefined) {
          throw new HostBoundaryError('GATEWAY_FACADE_INVALID', 'the loaded package did not produce a gateway-capable facade (protected ops seam missing)');
        }
        // Authoritative pin form: the LOADED build trace (the load's verified
        // identity, not merely the supplied root's claim).
        const installed = readInstalledClosureIdentity(await facade.query({ kind: 'build' }));
        if (installed === undefined) {
          throw new HostBoundaryError('GATEWAY_FACADE_INVALID', 'the loaded package produced no readable build trace for the closure pin');
        }
        const installedPin = closurePin(registration.appId, host.audience, installed);
        if (pinned !== undefined && installedPin !== pinned) {
          throw new HostBoundaryError(
            'GATEWAY_APP_CLOSURE_MISMATCH',
            `app ${registration.appId} is durably pinned to a different approved closure on this host (the loaded closure identity differs from the pinned one)`,
          );
        }
        // ---- #1023 S04: provision the BUILD-selected capability resource
        // adapters derived from the sealed OperationCall ABI. The adapters
        // are the ONLY physical route to the capability-owned effectful
        // handlers, and they are reachable exclusively through the selected
        // Kernel's effect dispatch (hostPorts.resources carries the Host
        // service principal — never a caller identity). A resource key is
        // physical-Host-global, so the install is an ALL-OR-NOTHING batch
        // (R1 P1-01): the dispatcher preflights every key — collision on
        // this Host and duplication inside the batch — and commits every
        // handler in one synchronous block, BEFORE the durable pin below. A
        // second registration claiming any taken key therefore refuses with
        // ZERO partial install.
        const adapters = ops.operationResourceAdapters();
        host.resources.provisionAll(adapters.map((adapter) => ({
          resourceKey: adapter.resourceKey,
          handler: (operation: string, payload: unknown): unknown => {
            const handler = adapter.operations.get(operation);
            if (handler === undefined) {
              throw new HostBoundaryError(
                'HOST_RESOURCE_OPERATION_UNKNOWN',
                `resource ${adapter.resourceKey} has no BUILD-selected handler for operation ${operation}`,
              );
            }
            return handler(payload);
          },
        })));
        installedKeys.push(...adapters.map((adapter) => adapter.resourceKey));
        // ---- Durable pin commit LAST (#1013 R1 F-02 / S04 R1 P1-01): the
        // guarded CAS is the FINAL durable step of the registration — nothing
        // after it can fail, so a refused registration can never leave a pin
        // behind, and a pin conflict rolls the adapter batch back above. A
        // concurrent first registration of the same appId can never be
        // overwritten (mustBeAbsent); on losing that race the re-read
        // distinguishes the IDENTICAL closure (concurrent idempotent
        // registration — the adapters this call installed stay live, matching
        // the restart idempotency contract) from a conflicting closure
        // (rollback + typed conflict).
        if (pinned === undefined) {
          const record: AppClosurePinRecord = Object.freeze({
            pinVersion: 1,
            appId: registration.appId,
            audience: host.audience,
            rootPackageId: installed.rootPackageId,
            closureDigest: installed.closureDigest,
            packages: Object.freeze(installed.packages.map((pkg) => Object.freeze({ ...pkg }))),
            closurePin: installedPin,
          });
          try {
            await host.docs.put(pinKey, record, { mustBeAbsent: true });
          } catch (error) {
            const concurrentEntry = await host.docs.get(pinKey);
            const concurrentPin = concurrentEntry !== null && typeof concurrentEntry.value === 'object' && concurrentEntry.value !== null
              ? (concurrentEntry.value as { closurePin?: unknown }).closurePin
              : undefined;
            if (concurrentPin !== installedPin) {
              throw new HostBoundaryError(
                'GATEWAY_APP_PIN_CONFLICT',
                `durably pinning app ${registration.appId} failed (concurrent or conflicting registration): ${String((error as Error)?.message ?? error)}`,
              );
            }
            // The identical closure won the concurrent CAS — idempotent.
          }
        }
      } catch (error) {
        // ---- Bounded rollback (#1023 S04 R1 P1-01): remove every adapter
        // THIS call installed, then AWAIT the facade's reverse-order S03
        // teardown. The primary typed error is never erased; rollback and
        // teardown failures ride BESIDE it on the thrown error.
        const rollbackFailures: string[] = [];
        for (const key of installedKeys) {
          try {
            host.resources.unprovision(key);
          } catch (rollbackError) {
            rollbackFailures.push(`unprovision ${key}: ${String((rollbackError as Error)?.message ?? rollbackError)}`);
          }
        }
        try {
          await facade.stop();
        } catch (teardownError) {
          rollbackFailures.push(`lifecycle teardown: ${String((teardownError as Error)?.message ?? teardownError)}`);
        }
        if (rollbackFailures.length > 0 && error instanceof HostBoundaryError) {
          throw new HostBoundaryError(error.code, `${error.message} (post-failure rollback also reported: ${rollbackFailures.join('; ')})`);
        }
        if (rollbackFailures.length > 0 && error instanceof QualifiedPackageError) {
          error.cleanupFailures = [
            ...(error.cleanupFailures ?? []),
            ...rollbackFailures.map((message) => ({ packageId: `gateway:registerApp:${registration.appId}`, message })),
          ];
        }
        throw error;
      }
      apps.set(registration.appId, Object.freeze({
        appId: registration.appId,
        facade,
        ops,
        // the guard above narrowed the declared readonly string[]; restore it
        genesisRoles: Object.freeze([...(registration.genesisRoles as readonly string[])]),
      }));
    },

    hasApp(appId: string): boolean {
      return typeof appId === 'string' && apps.has(appId);
    },

    async send(credential: unknown, intent: KernelGatewaySendIntent): Promise<unknown> {
      if (typeof intent !== 'object' || intent === null) {
        throw new HostBoundaryError('UX_INTENT_MALFORMED', 'gateway send requires an intent record');
      }
      const principal = await authenticate(credential);
      assertIntentScope(intent.target, principal);
      const app = requireApp(intent.target.appId, principal);
      const key = inFlightKey(principal, intent.target, intent.messageId);
      const entry = Object.freeze({ subject: principal.subject, controller: new AbortController() });
      const entries = inFlight.get(key) ?? new Set();
      entries.add(entry);
      inFlight.set(key, entries);
      try {
        return await app.ops.submitAs(principal, {
          intentType: intent.intentType,
          messageId: intent.messageId,
          instanceKey: intent.target.instanceKey,
          ...(intent.input === undefined ? {} : { input: intent.input }),
        }, { signal: entry.controller.signal });
      } finally {
        entries.delete(entry);
        if (entries.size === 0 && inFlight.get(key) === entries) inFlight.delete(key);
      }
    },

    async invokeOperation(credential: unknown, request: KernelGatewayOperationCall): Promise<unknown> {
      if (
        typeof request !== 'object'
        || request === null
        || typeof request.appId !== 'string'
        || request.appId.length === 0
        || typeof request.capabilityId !== 'string'
        || request.capabilityId.length === 0
        || typeof request.operationId !== 'string'
        || request.operationId.length === 0
      ) {
        throw new HostBoundaryError('HOST_OPERATION_MALFORMED', 'gateway invokeOperation requires {appId, capabilityId, operationId} with non-empty strings');
      }
      // Re-authenticate exactly like send: every OperationCall presents a
      // current credential — issuer, audience, tenant/app, roles, revocation
      // and currentness are all re-verified, nothing is cached.
      const principal = await authenticate(credential);
      // The appId is asserted against the AUTHENTICATED principal's app —
      // cross-app/cross-tenant routing is refused before any dispatch.
      const app = requireApp(request.appId, principal);
      const call = {
        capabilityId: request.capabilityId,
        operationId: request.operationId,
        ...(request.input === undefined ? {} : { input: request.input }),
      };
      // An effectful call addressing an occurrence gets the same
      // request-scoped cancellation as send (#1003 FR07-KH2); a pure call
      // carries no occurrence address and therefore no in-flight entry.
      if (request.instanceKey === undefined || request.messageId === undefined) {
        return app.ops.invokeOperation(principal, call);
      }
      const key = inFlightKey(principal, { tenantId: principal.tenantId, appId: request.appId, instanceKey: request.instanceKey }, request.messageId);
      const entry = Object.freeze({ subject: principal.subject, controller: new AbortController() });
      const entries = inFlight.get(key) ?? new Set();
      entries.add(entry);
      inFlight.set(key, entries);
      try {
        return await app.ops.invokeOperation(principal, {
          ...call,
          instanceKey: request.instanceKey,
          messageId: request.messageId,
        }, { signal: entry.controller.signal });
      } finally {
        entries.delete(entry);
        if (entries.size === 0 && inFlight.get(key) === entries) inFlight.delete(key);
      }
    },

    async cancel(credential: unknown, request: KernelGatewayCancelRequest): Promise<KernelGatewayCancelResult> {
      if (
        typeof request !== 'object'
        || request === null
        || typeof request.target !== 'object'
        || request.target === null
        || typeof request.target.instanceKey !== 'string'
        || typeof request.messageId !== 'string'
        || request.messageId.length === 0
      ) {
        throw new HostBoundaryError('HOST_CANCEL_MALFORMED', 'gateway cancel requires {target:{tenantId, appId, instanceKey}, messageId}');
      }
      // Re-authenticate and scope-gate exactly like send: a cancel is an
      // authenticated Host command, never an unauthenticated facade route.
      const principal = await authenticate(credential);
      assertIntentScope(request.target, principal);
      requireApp(request.target.appId, principal);
      // Only the principal's OWN in-flight entries are visible: another
      // subject's occurrence under the same id answers exactly like an
      // absent one, so cancel is neither an authority nor an in-flight
      // existence/timing oracle across subjects.
      const entries = inFlight.get(inFlightKey(principal, request.target, request.messageId));
      const own = entries === undefined ? [] : [...entries].filter((entry) => entry.subject === principal.subject);
      if (own.length === 0) {
        return Object.freeze({ status: 'not-in-flight' });
      }
      for (const entry of own) entry.controller.abort();
      return Object.freeze({ status: 'cancel-requested' });
    },

    async queryInstance(credential: unknown, target: UxTarget): Promise<unknown> {
      const principal = await authenticate(credential);
      assertIntentScope(target, principal);
      const app = requireApp(target.appId, principal);
      // The read resolves the tenant/app-qualified instance address of the
      // AUTHENTICATED principal (#1013 @6117218727 Candidate A): a second
      // tenant reusing the same appId/instanceKey reads only its own
      // physical instance — never the first tenant's state.
      return app.ops.queryInstance(principal, target.instanceKey);
    },

    async subscribe(credential: HostCredential, scope: KernelReceiptScope, listener: (receipt: unknown) => void): Promise<KernelReceiptSubscription> {
      if (typeof listener !== 'function') {
        throw new HostBoundaryError('HOST_SUBSCRIPTION_MALFORMED', 'a Kernel receipt subscription requires a listener function');
      }
      // Authenticate ONCE here; every delivery re-authenticates below.
      const principal = await authenticate(credential);
      if (scope.appId !== principal.appId) {
        throw new HostBoundaryError('HOST_SCOPE_DENIED', `subscription scope app ${scope.appId} does not match the authenticated principal app ${principal.appId}`);
      }
      const app = requireApp(scope.appId, principal);
      // The receipt filter address is the SINGLE ops-derived qualified
      // workflowInstanceId (workflowKey:tenant:app:instanceKey) — the same
      // address Genesis/send/query resolve to, so a subscription can never
      // observe another tenant's occurrences even when both tenants reuse
      // the same appId/instanceKey.
      const workflowInstanceId = app.ops.workflowInstanceId(principal, scope.instanceKey);
      let active = true;
      const unsubscribeFacade = app.ops.observeReceipts((receipt: unknown) => {
        if (!active) return;
        const occurrence = (receipt as { occurrence?: { workflowInstanceId?: unknown } } | null)?.occurrence;
        if (occurrence?.workflowInstanceId !== workflowInstanceId) return;
        void (async () => {
          try {
            // Currentness/revocation lease: the grant is re-verified on
            // EVERY delivery; an invalidated subscriber stops receiving.
            await authenticate(credential);
          } catch {
            active = false;
            unsubscribeFacade();
            return;
          }
          if (active) listener(receipt);
        })();
      });
      return {
        unsubscribe: (): void => {
          active = false;
          unsubscribeFacade();
        },
      };
    },

    async activateGenesis(credential: unknown, request: {
      readonly appId: string;
      readonly instanceKey: string;
      readonly correlationId?: string;
    }): Promise<unknown> {
      if (typeof request !== 'object' || request === null) {
        throw new HostBoundaryError('HOST_GENESIS_MALFORMED', 'activateGenesis requires {appId, instanceKey}');
      }
      const principal = await authenticate(credential);
      const app = requireApp(request.appId, principal);
      const authorized = app.genesisRoles.some((role) => principal.roles.includes(role));
      if (!authorized) {
        throw new HostBoundaryError(
          'HOST_GENESIS_ROLE_DENIED',
          `authenticated principal (subject ${principal.subject}, roles [${principal.roles.join(', ')}]) holds none of the host-configured genesis roles [${app.genesisRoles.join(', ')}] for app ${app.appId}`,
        );
      }
      // Genesis opens the instance at the authenticated principal's
      // tenant/app-qualified address: each tenant provisions (and later
      // submits to) its OWN physical instance — duplicate/conflicting
      // Genesis stays per-tenant, and no tenant can pre-empt another's
      // namespace by choosing the same instanceKey.
      return app.ops.provisionGenesis(principal, {
        instanceKey: request.instanceKey,
        ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
      });
    },
  };
  return Object.freeze(gateway);
}

/**
 * Bridge a Kernel receipt into the Host scoped event hub shape (host-context
 * publishing convenience; the receipt is inert data at this boundary).
 */
export function kernelReceiptAsHostEvent(
  tenantId: string,
  appId: string,
  instanceKey: string,
  receipt: unknown,
  emittedAt: string,
): HostEvent {
  return Object.freeze({
    tenantId,
    appId,
    instanceKey,
    topic: 'kernel-receipt',
    payload: JSON.parse(JSON.stringify(receipt)) as unknown,
    emittedAt,
  });
}
