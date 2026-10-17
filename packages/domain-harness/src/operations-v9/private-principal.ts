/**
 * DomainHarness v0.9 N08 (#1036): protected-H private principal proof capsule.
 *
 * INTERNAL ONLY. This module must NOT be re-exported from the package root,
 * ./v9, or any public runtime namespace. Only the actual trusted Host
 * bootstrap can supply the verifier below; the UX/user/Domain Package/Agent
 * cannot inject one via the public one-string load API. No plain
 * "AuthorizedPrincipal" object is proof: capabilities are object identities
 * registered in a private WeakMap, and checked against a FRESH trusted Host
 * authentication result before every sensitive use.
 *
 * This is one bounded CONTRACT/CORE SLICE, not an executable facade, Kernel
 * admission decision or physical effect permit. Per-effect/revoke atomicity
 * must separately use #1117's shared per-subject H CAS authority (#1036);
 * #1120 consumes the eventual protected delivery-recheck port.
 */

export type V09PrivatePurpose = 'send' | 'query' | 'subscribe' | 'delivery' | 'effect' | 'stop';

export interface V09HostVerifiedIdentity {
  readonly principalId: string;
  readonly hostAudience: string;
  readonly appId: string;
  readonly tenantId: string;
  readonly issuerAuthEpoch: number;
  readonly expiresAtMs: number;
  /** Exact operation-purpose grants, minted from current H policy. */
  readonly grants: readonly string[];
}

/**
 * Privileged Host-authenticator port. The implementation MUST perform real
 * caller and issuer authentication, not just trust a claimed user object.
 * It is injected solely by trusted Host bootstrap; never via public load,
 * send/query arguments, Business packages or caller-visible SDK exports.
 */
export interface V09PrivateHostAuthenticator {
  authenticate(presentation: unknown): Promise<Readonly<V09HostVerifiedIdentity>>;
}

export interface V09PrivateScopeBootstrap {
  readonly hostAudience: string;
  readonly appId: string;
  readonly tenantId: string;
  readonly subjectDigest: string;
  readonly authenticator: V09PrivateHostAuthenticator;
  /** Trusted monotonic-enough Host clock for expiry; test injection internal. */
  readonly nowMs?: () => number;
}

/** Never expose as a public SDK type or accept a caller-supplied instance. */
export interface V09PrivatePrincipalToken {
  readonly __opaqueV09PrincipalToken?: never;
}

interface IssuedProof {
  readonly presentation: unknown;
  readonly identity: V09HostVerifiedIdentity;
  readonly operationId: string;
  readonly purpose: V09PrivatePurpose;
}

/** Generic public-facing denial; never echoes principal IDs or scopes. */
export class V09PrivateScopeError extends Error {
  readonly code = 'V09_PRIVATE_SCOPE_DENIED';
  constructor() {
    super('Protected caller authorization is unavailable or no longer current.');
    this.name = 'V09PrivateScopeError';
  }
}

const MAX_TOKEN_LIFETIME_MS = 300_000;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function refuse(): never {
  throw new V09PrivateScopeError();
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function identityShape(value: unknown): value is V09HostVerifiedIdentity {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  // Host returns inert own-data; accessors and prototype tricks are refused
  // before identity is used or copied into the internal proof.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const fields = ['principalId', 'hostAudience', 'appId', 'tenantId', 'issuerAuthEpoch', 'expiresAtMs', 'grants'];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== fields.length) return false;
  if (!fields.every(field => Object.hasOwn(descriptors, field) && Object.hasOwn(descriptors[field], 'value'))) return false;
  const v = value as V09HostVerifiedIdentity;
  if (![v.principalId, v.hostAudience, v.appId, v.tenantId].every(validId)) return false;
  if (!Number.isSafeInteger(v.issuerAuthEpoch) || v.issuerAuthEpoch < 1) return false;
  if (!Number.isSafeInteger(v.expiresAtMs)) return false;
  if (!Array.isArray(v.grants) || v.grants.length === 0 || v.grants.length > 128 || Object.getPrototypeOf(v.grants) !== Array.prototype) return false;
  const desc = Object.getOwnPropertyDescriptors(v.grants);
  if (Reflect.ownKeys(desc).length !== v.grants.length + 1) return false;
  return v.grants.every(x => typeof x === 'string' && x.length > 0 && x.length <= 256);
}

function cloneIdentity(v: V09HostVerifiedIdentity): V09HostVerifiedIdentity {
  return Object.freeze({
    principalId: v.principalId,
    hostAudience: v.hostAudience,
    appId: v.appId,
    tenantId: v.tenantId,
    issuerAuthEpoch: v.issuerAuthEpoch,
    expiresAtMs: v.expiresAtMs,
    grants: Object.freeze([...v.grants]),
  });
}

export function createV09PrivatePrincipalAuthority(bootstrap: V09PrivateScopeBootstrap) {
  if (!validId(bootstrap.hostAudience) || !validId(bootstrap.appId) ||
      !validId(bootstrap.tenantId) || typeof bootstrap.subjectDigest !== 'string' ||
      !SHA256.test(bootstrap.subjectDigest) ||
      typeof bootstrap.authenticator?.authenticate !== 'function') {
    refuse();
  }
  const now = bootstrap.nowMs ?? Date.now;
  if (typeof now !== 'function') refuse();
  const issued = new WeakMap<object, IssuedProof>();
  let closed = false;

  function assertVerified(v: unknown, operationId: string, purpose: V09PrivatePurpose, at: number): asserts v is V09HostVerifiedIdentity {
    if (!identityShape(v) ||
        v.hostAudience !== bootstrap.hostAudience ||
        v.appId !== bootstrap.appId ||
        v.tenantId !== bootstrap.tenantId ||
        !v.grants.includes(`${purpose}:${operationId}`) ||
        v.expiresAtMs <= at ||
        v.expiresAtMs - at > MAX_TOKEN_LIFETIME_MS) {
      refuse();
    }
  }

  async function issue(presentation: unknown, operationId: string, purpose: V09PrivatePurpose): Promise<V09PrivatePrincipalToken> {
    if (closed || !validId(operationId) ||
        !(['send', 'query', 'subscribe', 'delivery', 'effect', 'stop'] as string[]).includes(purpose)) refuse();
    let verified: unknown;
    try {
      verified = await bootstrap.authenticator.authenticate(presentation);
    } catch {
      refuse();
    }
    const at = now();
    if (!Number.isSafeInteger(at)) refuse();
    assertVerified(verified, operationId, purpose, at);
    const token = Object.freeze(Object.create(null)) as V09PrivatePrincipalToken;
    issued.set(token, Object.freeze({
      presentation, identity: cloneIdentity(verified), operationId, purpose,
    }));
    return token;
  }

  /**
   * Every sensitive use re-authenticates with the trusted Host: expiry,
   * tenant/app/scope and issuer epoch are compared again. This is NOT a
   * durable effect-permit CAS commit and cannot be used in its place.
   */
  async function recheck(token: unknown, operationId: string, purpose: V09PrivatePurpose): Promise<Readonly<V09HostVerifiedIdentity>> {
    if (closed || token === null || typeof token !== 'object') refuse();
    const saved = issued.get(token);
    if (!saved || saved.operationId !== operationId || saved.purpose !== purpose) refuse();
    let verified: unknown;
    try {
      verified = await bootstrap.authenticator.authenticate(saved.presentation);
    } catch {
      refuse();
    }
    const at = now();
    if (!Number.isSafeInteger(at)) refuse();
    assertVerified(verified, operationId, purpose, at);
    if (verified.principalId !== saved.identity.principalId ||
        verified.issuerAuthEpoch !== saved.identity.issuerAuthEpoch ||
        verified.expiresAtMs < saved.identity.expiresAtMs) {
      refuse();
    }
    return cloneIdentity(verified);
  }

  /** Lifecycle-owned closure invalidates every existing token at once. */
  function close(): void {
    closed = true;
  }

  return Object.freeze({ issue, recheck, close });
}
