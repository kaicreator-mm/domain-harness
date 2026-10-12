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
 *   - K-receipt subscriptions re-authenticate the credential on EVERY
 *     delivery and silently stop when the grant is no longer valid.
 *
 * This module wires; it implements no Kernel policy, no Guard/Effect/
 * Journal semantics and no second runtime (those belong to the physically
 * selected Kernel package, T-C).
 */

import { DomainHarness, getFacadeKernelOps, type V8DomainFacade, type V8FacadeKernelOps } from '../public-v8/microkernel.js';
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

export interface KernelGateway {
  /** Host-context provisioning: load + bind one approved Domain App. */
  registerApp(input: KernelGatewayAppInput): Promise<void>;
  /** Whether an app closure is registered for the appId (routing probe). */
  hasApp(appId: string): boolean;
  /** Authenticated send through the REAL selected Kernel of the app. */
  send(credential: unknown, intent: KernelGatewaySendIntent): Promise<unknown>;
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

export function createKernelGateway(input: { readonly host: TrustedNodeHost }): KernelGateway {
  if (typeof input !== 'object' || input === null || typeof input.host !== 'object' || input.host === null) {
    throw new HostBoundaryError('GATEWAY_MALFORMED', 'createKernelGateway requires the trusted host handle from bootstrapTrustedHost');
  }
  const host = input.host;
  const apps = new Map<string, RegisteredApp>();

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
      // The PUBLIC one-argument load — qualification, trust gate, whole-
      // closure byte preflight and physical import all happen inside.
      const facade = await DomainHarness.load(registration.packageRoot);
      const ops = getFacadeKernelOps(facade);
      if (ops === undefined) {
        throw new HostBoundaryError('GATEWAY_FACADE_INVALID', 'the loaded package did not produce a gateway-capable facade (protected ops seam missing)');
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
      return app.ops.submitAs(principal, {
        intentType: intent.intentType,
        messageId: intent.messageId,
        instanceKey: intent.target.instanceKey,
        ...(intent.input === undefined ? {} : { input: intent.input }),
      });
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
