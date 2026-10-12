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
import { kernelPrincipalChannel, type KernelPrincipalCaller, type V8KernelPrincipalChannel } from '../public-v8/microkernel.js';
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

// ===========================================================================
// Authenticated UX → selected-Kernel routing (I02, #1013).
// ===========================================================================
//
// The generic transport above dispatches intents through the Host's generic
// ResourceDispatcher; this transport binds an issuer-signed, per-operation
// revalidated H principal to the REAL selected Kernel of one loaded package
// scope:
//
//   - send reaches the wired Kernel `submitOccurrence` with the caller
//     REPLACED by the issuer-signed principal record — the Kernel's
//     business-owned role gate therefore evaluates issuer-attested roles
//     only, and a declared payload `caller.role` can select AT MOST a role
//     already inside the signed set (never elevate);
//   - the submit record is rebuilt from validated fields, so no payload
//     field other than {intentType, target, messageId, input} ever reaches
//     the Kernel on this route;
//   - query is a scoped, reauthenticated instance READ through the real
//     Kernel snapshot endpoint (journal/mechanism/counters have no route);
//   - subscriptions revalidate the credential on EVERY delivered receipt
//     (a grant is a lease): a revoked, stale or re-bound principal's
//     subscription is terminated at delivery, never delivered;
//   - the transport is frozen with exactly send/query/subscribe: no
//     openInstance (protected Genesis), no Journal, no Kernel namespace,
//     no Host ports, no installer (B01-N4/N8 heritage).
// ===========================================================================

/** The protected tenant/app/workflow binding of one kernel UX transport. */
export interface KernelUxScopeBinding {
  readonly tenantId: string;
  readonly appId: string;
  readonly workflowId: string;
}

/** The authenticated send receipt: the Kernel outcome plus the H identity. */
export interface UxKernelSendReceipt {
  /** The authoritative Kernel receipt, verbatim and detached. */
  readonly kernelReceipt: unknown;
  /** The identity the Kernel actually evaluated — issuer-signed only. */
  readonly authenticatedPrincipal: {
    readonly issuerId: string;
    readonly grantId: string;
    readonly subject: string;
    readonly tenantId: string;
    readonly appId: string;
    /** The single signed role this submission selected/carried. */
    readonly role: string;
  };
  /** The caller-declared field, carried as untrusted user data. */
  readonly declaredCaller: unknown;
}

export interface KernelUxTransport {
  send(intent: unknown): Promise<UxKernelSendReceipt>;
  query(request: unknown): Promise<unknown>;
  subscribe(scope: unknown, listener: (receipt: unknown) => void): Promise<HostSubscription>;
}

interface KernelTransportDeps {
  readonly authenticate: (credential: unknown) => Promise<HostPrincipal>;
  readonly kernel: V8KernelPrincipalChannel;
  readonly binding: KernelUxScopeBinding;
}

function requireKernelScopeBinding(binding: unknown): KernelUxScopeBinding {
  if (typeof binding !== 'object' || binding === null) {
    throw new HostBoundaryError('UX_KERNEL_BINDING_MALFORMED', 'a kernel UX transport requires a {tenantId, appId, workflowId} scope binding');
  }
  const record = binding as Record<string, unknown>;
  for (const field of ['tenantId', 'appId', 'workflowId'] as const) {
    const value = record[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new HostBoundaryError('UX_KERNEL_BINDING_MALFORMED', `kernel UX scope binding field ${field} must be a non-empty string`);
    }
    if (value.includes(':')) {
      throw new HostBoundaryError('HOST_IDENTITY_ID_MALFORMED', `kernel UX scope binding field ${field} must not contain ':' (the namespace delimiter)`);
    }
  }
  return { tenantId: record.tenantId as string, appId: record.appId as string, workflowId: record.workflowId as string };
}

/** The per-operation identity gate: the principal must BE the binding. */
function assertKernelPrincipalScope(principal: HostPrincipal, binding: KernelUxScopeBinding): void {
  if (principal.tenantId !== binding.tenantId || principal.appId !== binding.appId) {
    throw new HostBoundaryError(
      'HOST_SCOPE_DENIED',
      `authenticated principal tenant/app ${principal.tenantId}/${principal.appId} does not match this kernel binding ${binding.tenantId}/${binding.appId}; cross-tenant or cross-app access is refused`,
    );
  }
}

/** The intent/query target gate: one bound workflow, well-formed instance. */
function requireKernelTarget(parsed: Record<string, unknown>, binding: KernelUxScopeBinding, code: string, label: string): { workflowId: string; instanceKey: string } {
  const targetRecord = assertCanonicalSubRecord(parsed.target, code, label);
  const workflowId = requireString(targetRecord, 'workflowId', code, label);
  const instanceKey = requireString(targetRecord, 'instanceKey', code, label);
  if (instanceKey.includes('..')) {
    throw new HostBoundaryError(code, `${label} instanceKey ${instanceKey} is malformed`);
  }
  if (workflowId !== binding.workflowId) {
    throw new HostBoundaryError(
      'HOST_SCOPE_DENIED',
      `${label} workflow ${workflowId} is outside this kernel binding ${binding.workflowId}; cross-workflow access is refused`,
    );
  }
  return { workflowId, instanceKey };
}

/**
 * Derive the single Kernel role from the SIGNED credential only. A declared
 * `caller.role` may select one of the signed roles; anything outside the
 * signed set is a forged role and refuses the whole operation typed.
 */
function deriveKernelRole(principal: HostPrincipal, declaredCaller: unknown): string {
  let declaredRole: string | undefined;
  if (declaredCaller !== null && declaredCaller !== undefined) {
    if (typeof declaredCaller !== 'object' || Array.isArray(declaredCaller)) {
      throw new HostBoundaryError('UX_INTENT_MALFORMED', 'intent caller must be a plain JSON record when present; it is user data and may never be another shape');
    }
    const record = declaredCaller as Record<string, unknown>;
    if ('role' in record) {
      if (typeof record.role !== 'string' || record.role.length === 0) {
        throw new HostBoundaryError('UX_INTENT_MALFORMED', 'declared caller.role must be a non-empty string when present');
      }
      declaredRole = record.role;
    }
  }
  const signed = `[${principal.roles.join(', ')}]`;
  if (principal.roles.length === 1) {
    const signedRole = principal.roles[0];
    if (signedRole === undefined) {
      throw new HostBoundaryError('HOST_IDENTITY_ID_MALFORMED', 'the authenticated principal carries an empty signed role set');
    }
    if (declaredRole !== undefined && declaredRole !== signedRole) {
      throw new HostBoundaryError(
        'HOST_ROLE_DENIED',
        `declared caller role ${declaredRole} is not within the issuer-signed roles of this principal (${signed}); a declared role can never elevate authority`,
      );
    }
    return signedRole;
  }
  if (typeof declaredRole !== 'string') {
    throw new HostBoundaryError(
      'HOST_ROLE_SELECTION_REQUIRED',
      `this principal carries multiple issuer-signed roles (${signed}); the intent must select one via caller.role, and the selection can never exceed the signed set`,
    );
  }
  if (!principal.roles.includes(declaredRole)) {
    throw new HostBoundaryError(
      'HOST_ROLE_DENIED',
      `declared caller role ${declaredRole} is not within the issuer-signed roles of this principal (${signed}); a declared role can never elevate authority`,
    );
  }
  return declaredRole;
}

/**
 * Create the typed kernel UX transport for one credential. The returned
 * object is the complete UX-reachable surface: frozen, allowlisted,
 * portless — exactly send/query/subscribe.
 */
export function createKernelUxTransport(deps: KernelTransportDeps, channel: { readonly credential: HostCredential }): KernelUxTransport {
  if (typeof channel !== 'object' || channel === null) {
    throw new HostBoundaryError('UX_CHANNEL_MALFORMED', 'createKernelUxTransport requires a channel object');
  }
  // Same eager allowlist discipline as the generic transport: credential
  // shape-checked and nothing else may ride on the channel.
  assertCredentialShape(channel.credential);
  for (const key of Object.keys(channel)) {
    if (key !== 'credential') {
      throw new HostBoundaryError('UX_HOST_PORTS_FORBIDDEN', `createKernelUxTransport channel field ${key} is not part of the typed UX surface (no host ports / verifiers / installers)`);
    }
  }
  if (typeof deps.authenticate !== 'function') {
    throw new HostBoundaryError('UX_KERNEL_BINDING_MALFORMED', 'createKernelUxTransport requires the host authenticate dependency');
  }
  if (
    typeof deps.kernel !== 'object'
    || deps.kernel === null
    || typeof deps.kernel.submitAsPrincipal !== 'function'
    || typeof deps.kernel.snapshotForPrincipal !== 'function'
    || typeof deps.kernel.observeReceipts !== 'function'
  ) {
    throw new HostBoundaryError(
      'UX_KERNEL_BINDING_MALFORMED',
      'createKernelUxTransport requires a kernel principal channel with submitAsPrincipal/snapshotForPrincipal/observeReceipts',
    );
  }
  const binding = requireKernelScopeBinding(deps.binding);

  const transport: KernelUxTransport = Object.freeze({
    async send(intent: unknown): Promise<UxKernelSendReceipt> {
      const parsed = assertPlainJsonRecord(intent, 'UX_INTENT_NOT_JSON', 'intent');
      const intentType = requireString(parsed, 'intentType', 'UX_INTENT_MALFORMED', 'intent');
      const messageId = requireString(parsed, 'messageId', 'UX_INTENT_MALFORMED', 'intent');
      const target = requireKernelTarget(parsed, binding, 'UX_INTENT_MALFORMED', 'intent target');
      // H authenticates EVERY send — never cached from construction.
      const principal = await deps.authenticate(channel.credential);
      assertKernelPrincipalScope(principal, binding);
      const declaredCaller = parsed.caller ?? null;
      const role = deriveKernelRole(principal, declaredCaller);
      const caller: KernelPrincipalCaller = Object.freeze({
        kind: 'v08-host-principal/1',
        issuerId: principal.issuerId,
        grantId: principal.grantId,
        subject: principal.subject,
        tenantId: principal.tenantId,
        appId: principal.appId,
        role,
      });
      // Rebuilt from validated fields ONLY: the declared caller (and any
      // other payload field) never reaches the selected Kernel.
      const submission: Record<string, unknown> = {
        intentType,
        target: Object.freeze({ ...target }),
        messageId,
        caller,
      };
      if (parsed.input !== undefined) {
        submission.input = parsed.input;
      }
      const kernelReceipt = await deps.kernel.submitAsPrincipal(submission, caller);
      return Object.freeze({
        kernelReceipt,
        authenticatedPrincipal: Object.freeze({
          issuerId: principal.issuerId,
          grantId: principal.grantId,
          subject: principal.subject,
          tenantId: principal.tenantId,
          appId: principal.appId,
          role,
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
      if (kind !== 'instance') {
        throw new HostBoundaryError('UX_QUERY_KIND_UNSUPPORTED', `query kind ${kind} is not supported by this kernel transport (supported: instance)`);
      }
      // H authenticates EVERY read — a stale or revoked grant reads nothing.
      const principal = await deps.authenticate(channel.credential);
      assertKernelPrincipalScope(principal, binding);
      const target = requireKernelTarget(parsed, binding, 'UX_QUERY_MALFORMED', 'query target');
      const snapshot = await deps.kernel.snapshotForPrincipal(target);
      if (snapshot === null || snapshot === undefined) {
        throw new HostBoundaryError('UX_INSTANCE_NOT_FOUND', `instance ${target.workflowId}:${target.instanceKey} does not exist in the bound kernel scope`);
      }
      // A detached snapshot: mutating the response can never mutate committed state.
      return Object.freeze({ snapshot: Object.freeze(JSON.parse(JSON.stringify(snapshot)) as unknown) });
    },

    async subscribe(scope: unknown, listener: unknown): Promise<HostSubscription> {
      if (typeof listener !== 'function') {
        throw new HostBoundaryError('UX_SUBSCRIPTION_MALFORMED', 'a kernel receipt subscription requires a listener function');
      }
      const notify = listener as (receipt: unknown) => void;
      let parsedScope: Record<string, unknown>;
      try {
        parsedScope = canonicalSnapshot(scope) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof QualifiedPackageError) {
          throw new HostBoundaryError('UX_SUBSCRIPTION_MALFORMED', `subscription scope must be a plain-JSON record: ${error.message}`);
        }
        throw error;
      }
      const allowedScopeFields = new Set(['workflowId', 'instanceKey', 'tenantId', 'appId']);
      for (const key of Object.keys(parsedScope)) {
        if (!allowedScopeFields.has(key)) {
          throw new HostBoundaryError('UX_SUBSCRIPTION_MALFORMED', `subscription scope field ${key} is not part of the kernel receipt scope (workflowId/instanceKey/tenantId/appId only)`);
        }
      }
      for (const field of ['workflowId', 'instanceKey', 'tenantId', 'appId'] as const) {
        const value = parsedScope[field];
        if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
          throw new HostBoundaryError('UX_SUBSCRIPTION_MALFORMED', `subscription scope field ${field} must be a non-empty string when present`);
        }
      }
      // Authenticate ONCE at subscribe time; out-of-scope requests are
      // refused typed here (never silently filtered).
      const principal = await deps.authenticate(channel.credential);
      assertKernelPrincipalScope(principal, binding);
      const scopeTenantId = parsedScope.tenantId as string | undefined;
      const scopeAppId = parsedScope.appId as string | undefined;
      if (scopeTenantId !== undefined && scopeTenantId !== principal.tenantId) {
        throw new HostBoundaryError('HOST_SCOPE_DENIED', `subscription scope tenant ${scopeTenantId} does not match the authenticated principal tenant ${principal.tenantId}`);
      }
      if (scopeAppId !== undefined && scopeAppId !== principal.appId) {
        throw new HostBoundaryError('HOST_SCOPE_DENIED', `subscription scope app ${scopeAppId} does not match the authenticated principal app ${principal.appId}`);
      }
      const workflowScope = parsedScope.workflowId as string | undefined;
      if (workflowScope !== undefined && workflowScope !== binding.workflowId) {
        throw new HostBoundaryError('HOST_SCOPE_DENIED', `subscription scope workflow ${workflowScope} is outside this kernel binding ${binding.workflowId}`);
      }
      const instanceScope = parsedScope.instanceKey as string | undefined;

      const matchesScope = (receipt: unknown): boolean => {
        const record = receipt as { occurrence?: { workflowInstanceId?: unknown } } | null;
        const id = record?.occurrence?.workflowInstanceId;
        if (typeof id !== 'string') return false;
        if (instanceScope !== undefined && !id.endsWith(`:${instanceScope}`)) return false;
        if (!id.startsWith(`${binding.workflowId}:`)) return false;
        return true;
      };

      let active = true;
      let kernelUnsubscribe: () => boolean = () => false;
      // Per-delivery revalidation (B01-N5 heritage): the credential is
      // re-authenticated BEFORE every receipt delivery — currentness and
      // durable revocation included. An invalidated subscription terminates
      // itself; its listener receives nothing further.
      const revalidatedListener = (receipt: unknown): void => {
        if (!active) return;
        void (async () => {
          let revalidated: HostPrincipal;
          try {
            revalidated = await deps.authenticate(channel.credential);
          } catch {
            active = false;
            kernelUnsubscribe();
            return;
          }
          if (!active) return;
          if (revalidated.tenantId !== binding.tenantId || revalidated.appId !== binding.appId) {
            active = false;
            kernelUnsubscribe();
            return;
          }
          if (matchesScope(receipt)) notify(receipt);
        })();
      };
      kernelUnsubscribe = deps.kernel.observeReceipts(revalidatedListener);
      return {
        unsubscribe: (): void => {
          if (!active) return;
          active = false;
          kernelUnsubscribe();
        },
      };
    },
  });
  return transport;
}

/**
 * Wire the authenticated kernel UX transport: a trusted host, ONE loaded
 * package facade scope, the protected tenant/app/workflow binding and one
 * credential. The host context hands the RETURNED transport to the UX
 * consumer — never the host object, the facade or the kernel channel.
 */
export function createHostKernelUxTransport(
  host: TrustedNodeHost,
  facade: unknown,
  binding: KernelUxScopeBinding,
  credential: HostCredential,
): KernelUxTransport {
  // Typed refusal on any object that is not a live loaded scope: there is
  // no way to hand-craft a kernel binding (KERNEL_CHANNEL_ABSENT).
  const kernel = kernelPrincipalChannel(facade);
  return createKernelUxTransport(
    {
      authenticate: (credentialToCheck) => host.authenticate(credentialToCheck),
      kernel,
      binding,
    },
    { credential },
  );
}
