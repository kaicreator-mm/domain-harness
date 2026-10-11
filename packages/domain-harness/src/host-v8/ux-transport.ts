/**
 * v0.8 trusted Node Host — typed UX transport boundary (T-E, #1004).
 * ====================================================================
 *
 * The ONLY surface a UX consumer ever receives: three typed verbs — send,
 * query, subscribe — adapted from #994@b9ea4d1 src/ux/ux-client.mjs
 * (blob 448a8aad261e704254a34d9f67bb9ee0f3612187) with the experiment's
 * security debt repaired:
 *
 *   - the experiment let the caller SELECT `role` (`caller: { role }`); the
 *     transport treats the whole declared `caller` field as USER DATA: it is
 *     echoed opaquely into the dispatch record and NEVER used for any
 *     authorization decision — the authenticated principal comes from the
 *     issuer-signed credential on EVERY verb (B01-N1);
 *   - intents must be canonical plain JSON: callables, accessors, __proto__
 *     keys and other non-JSON material are refused typed before any dispatch
 *     (KPK-11 vector port: no commit authority can be smuggled);
 *   - query is a scoped, authenticated READ only: raw journal / kernel /
 *     mechanism / effect surfaces have no representable route (B01-N4: no
 *     direct Journal/Kernel/Doc handle bypass — #994's `getJournal` UX
 *     convenience does not exist here);
 *   - subscriptions revalidate the credential on every delivery (B01-N5,
 *     events.ts) and are refused typed when the scope crosses the
 *     authenticated principal's tenant/app (B01-N2);
 *   - the transport object is frozen, exposes no privileged member, and its
 *     constructor rejects injected hostPorts/verifier/installer options
 *     outright (B01-N8 Host face: no mutable installer injection).
 */

import { canonicalSnapshot, QualifiedPackageError } from '../public-v8/contracts.js';
import type { TrustedNodeHost } from './bootstrap.js';
import type { HostEvent, HostSubscription } from './events.js';
import { assertCredentialShape, type HostCredential, type HostPrincipal } from './identity.js';
import { HostBoundaryError } from './errors.js';

/** Where an intent is addressed: the H identity quadruple plus instance. */
export interface UxTarget {
  readonly tenantId: string;
  readonly appId: string;
  readonly instanceKey: string;
}

export interface UxDispatchReceipt {
  readonly status: 'dispatched';
  readonly messageId: string;
  readonly intentType: string;
  readonly resourceKey: string;
  /** The generic resource's physical result (fixture/adapter defined). */
  readonly result: unknown;
  /**
   * The authenticated identity of the dispatch — derived ONLY from the
   * issuer-signed credential. Declared caller roles can never appear here.
   */
  readonly authenticatedPrincipal: {
    readonly subject: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly roles: readonly string[];
  };
  /** The caller-declared field, carried as untrusted user data. */
  readonly declaredCaller: unknown;
}

/** Query kinds the UX surface can express. */
export type UxQueryKind = 'doc';

export interface UxQueryRequest {
  readonly kind: UxQueryKind;
  readonly target?: UxTarget;
  /** Physical document key; reads are namespaced per tenant/app. */
  readonly key?: string;
}

/** UX-scoped document namespace: reads/writes never cross this prefix. */
export function uxDocumentNamespace(tenantId: string, appId: string): string {
  // Namespace-delimiter guard (independent-review P1-1, PR #1011): ':' is
  // the join separator, so separator-bearing ids would collide namespaces
  // across apps AND tenants. Credentials are already charset-restricted at
  // assertCredentialShape; this re-guards the construction site itself
  // (defense in depth for host-context callers).
  if (tenantId.includes(':') || appId.includes(':')) {
    throw new HostBoundaryError('HOST_IDENTITY_ID_MALFORMED', "uxDocumentNamespace ids must not contain ':' (the UX document namespace delimiter)");
  }
  return `ux:${tenantId}:${appId}:`;
}

interface TransportDeps {
  readonly authenticate: (credential: unknown) => Promise<HostPrincipal>;
  readonly dispatch: (resourceKey: string, operation: string, payload: unknown, principal: HostPrincipal) => Promise<unknown>;
  readonly readScopedDoc: (key: string) => Promise<{ value: unknown; revision: number } | null>;
  readonly subscribe: (credential: unknown, scope: unknown, listener: unknown) => Promise<HostSubscription>;
  readonly assertIntentScope: (target: UxTarget, principal: HostPrincipal) => void;
}

const FORBIDDEN_QUERY_KINDS: ReadonlySet<string> = new Set([
  'journal',
  'kernel',
  'mechanism',
  'effect',
  'admission',
  'store',
  'docs',
  'resources',
]);

function assertPlainJsonRecord(value: unknown, code: string, label: string): Record<string, unknown> {
  try {
    return canonicalSnapshot(value) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof QualifiedPackageError) {
      throw new HostBoundaryError(code, `${label} must be canonical plain JSON: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Shape check for fields ALREADY canonicalized by an enclosing snapshot:
 * canonicalSnapshot emits null-prototype plain objects, so a second snapshot
 * pass would refuse its own output; a structural check is the right gate.
 */
function assertCanonicalSubRecord(value: unknown, code: string, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HostBoundaryError(code, `${label} must be a plain JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string, code: string, label: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new HostBoundaryError(code, `${label} field ${field} must be a non-empty string`);
  }
  return value;
}

/**
 * Create the typed UX transport for one credential. The returned object is
 * the complete UX-reachable surface: frozen, allowlisted, portless.
 */
export function createUxTransport(deps: TransportDeps, channel: { readonly credential: HostCredential }): UxTransport {
  if (typeof channel !== 'object' || channel === null) {
    throw new HostBoundaryError('UX_CHANNEL_MALFORMED', 'createUxTransport requires a channel object');
  }
  // The credential is shape-checked EAGERLY: verifier/hostPort material can
  // never ride on it (unbound fields are refused here, before any dispatch).
  assertCredentialShape(channel.credential);
  // B01-N8 Host face: the channel is an allowlist. There is no representable
  // way to inject hostPorts, a verifier, or an installer through it.
  for (const key of Object.keys(channel)) {
    if (key !== 'credential') {
      throw new HostBoundaryError('UX_HOST_PORTS_FORBIDDEN', `createUxTransport channel field ${key} is not part of the typed UX surface (no host ports / verifiers / installers)`);
    }
  }
  const transport: UxTransport = Object.freeze({
    async send(intent: unknown): Promise<UxDispatchReceipt> {
      const parsed = assertPlainJsonRecord(intent, 'UX_INTENT_NOT_JSON', 'intent');
      const intentType = requireString(parsed, 'intentType', 'UX_INTENT_MALFORMED', 'intent');
      const messageId = requireString(parsed, 'messageId', 'UX_INTENT_MALFORMED', 'intent');
      const targetRecord = assertCanonicalSubRecord(parsed.target, 'UX_INTENT_MALFORMED', 'intent target');
      const target: UxTarget = {
        tenantId: requireString(targetRecord, 'tenantId', 'UX_INTENT_MALFORMED', 'intent target'),
        appId: requireString(targetRecord, 'appId', 'UX_INTENT_MALFORMED', 'intent target'),
        instanceKey: requireString(targetRecord, 'instanceKey', 'UX_INTENT_MALFORMED', 'intent target'),
      };
      // H authenticates EVERY dispatch — never cached from construction.
      const principal = await deps.authenticate(channel.credential);
      deps.assertIntentScope(target, principal);
      // `caller` is user data: echoed, never consulted for authorization.
      const declaredCaller = parsed.caller ?? null;
      const resourceKey = `intent:${intentType}`;
      const result = await deps.dispatch(
        resourceKey,
        intentType,
        { messageId, input: parsed.input ?? null, target, declaredCaller },
        principal,
      );
      return Object.freeze({
        status: 'dispatched',
        messageId,
        intentType,
        resourceKey,
        result,
        authenticatedPrincipal: Object.freeze({
          subject: principal.subject,
          tenantId: principal.tenantId,
          appId: principal.appId,
          roles: Object.freeze([...principal.roles]),
        }),
        declaredCaller,
      });
    },

    async query(request: unknown): Promise<unknown> {
      const parsed = assertPlainJsonRecord(request, 'UX_QUERY_MALFORMED', 'query');
      const kind = requireString(parsed, 'kind', 'UX_QUERY_MALFORMED', 'query');
      if (FORBIDDEN_QUERY_KINDS.has(kind)) {
        throw new HostBoundaryError('UX_QUERY_KIND_FORBIDDEN', `query kind ${kind} is not representable on the UX surface; raw journal/kernel/store reads have no route`);
      }
      if (kind !== 'doc') {
        throw new HostBoundaryError('UX_QUERY_KIND_UNSUPPORTED', `query kind ${kind} is not supported by this host transport (supported: doc)`);
      }
      const principal = await deps.authenticate(channel.credential);
      const key = requireString(parsed, 'key', 'UX_QUERY_MALFORMED', 'query');
      const namespace = uxDocumentNamespace(principal.tenantId, principal.appId);
      // Namespace isolation invariant: the prefix check is only
      // collision-free because tenantId/appId cannot contain the ':'
      // delimiter — assertCredentialShape refuses separator-bearing
      // credential ids (HOST_IDENTITY_ID_MALFORMED) and
      // uxDocumentNamespace re-guards the construction, so a cross-tenant
      // or cross-app document read has no representable route.
      if (!key.startsWith(namespace)) {
        throw new HostBoundaryError(
          'HOST_SCOPE_DENIED',
          `document ${key} is outside the authenticated namespace ${namespace}; cross-tenant reads are refused`,
        );
      }
      const doc = await deps.readScopedDoc(key);
      if (doc === null) {
        throw new HostBoundaryError('UX_DOC_NOT_FOUND', `document ${key} does not exist in the authenticated namespace`);
      }
      // A detached snapshot: mutating the response can never mutate authority.
      return Object.freeze({ value: Object.freeze(JSON.parse(JSON.stringify(doc.value)) as unknown), revision: doc.revision });
    },

    async subscribe(scope: unknown, listener: unknown): Promise<HostSubscription> {
      return deps.subscribe(channel.credential, scope, listener);
    },
  });
  return transport;
}

export interface UxTransport {
  send(intent: unknown): Promise<UxDispatchReceipt>;
  query(request: unknown): Promise<unknown>;
  subscribe(scope: unknown, listener: (event: HostEvent) => void): Promise<HostSubscription>;
}

/** The host-side scope gate shared by send and any instance-scoped verb. */
export function assertIntentScope(target: UxTarget, principal: HostPrincipal): void {
  if (target.tenantId !== principal.tenantId) {
    throw new HostBoundaryError(
      'HOST_SCOPE_DENIED',
      `intent target tenant ${target.tenantId} does not match the authenticated principal tenant ${principal.tenantId}; cross-tenant dispatch is refused`,
    );
  }
  if (target.appId !== principal.appId) {
    throw new HostBoundaryError(
      'HOST_SCOPE_DENIED',
      `intent target app ${target.appId} does not match the authenticated principal app ${principal.appId}; cross-app dispatch is refused`,
    );
  }
  if (target.instanceKey.length === 0 || target.instanceKey.includes('..')) {
    throw new HostBoundaryError('UX_INTENT_MALFORMED', `intent target instanceKey ${target.instanceKey} is malformed`);
  }
}

/**
 * Wire the typed UX transport to a trusted host for one credential. The
 * caller (host context) hands the RETURNED transport to the UX consumer —
 * never the host object itself.
 */
export function createHostUxTransport(host: TrustedNodeHost, credential: HostCredential): UxTransport {
  return createUxTransport(
    {
      authenticate: (credentialToCheck) => host.authenticate(credentialToCheck),
      dispatch: (resourceKey, operation, payload, principal) => host.resources.call(resourceKey, operation, payload, { principal }),
      readScopedDoc: (key) => host.docs.get(key),
      subscribe: (credentialToCheck, scope, listener) => host.events.subscribe(credentialToCheck, scope, listener),
      assertIntentScope,
    },
    { credential },
  );
}
