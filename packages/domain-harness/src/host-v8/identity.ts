/**
 * v0.8 trusted Node Host — H identity context (T-E, #1004).
 * ===========================================================
 *
 * The Host authenticates WHO is calling: issuer, audience, tenant, app,
 * subject, instance scope, granted roles and currentness — all bound by an
 * HMAC-SHA256 issuer attestation over a canonical credential digest, exactly
 * mirroring the load trust gate (public-v8/trust.ts) construction.
 *
 * L2 boundary this module enforces: the caller-DECLARED role (a UX intent's
 * `caller` field) is USER DATA, never an authentication primitive. Roles
 * exist only inside the issuer-signed credential; nothing else can create
 * them. Authentication revalidates currentness and revocation on EVERY
 * verification — a grant is a lease, not a identity lifetime.
 *
 * Credential shape adapted from #994@b9ea4d1 experiment UX `caller` surface
 * (src/ux/ux-client.mjs blob 448a8aad261e704254a34d9f67bb9ee0f3612187):
 * the experiment let the caller SELECT a role; T-E moves the role into the
 * signed grant so the transport can never trust a declared one.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { canonicalJson, canonicalSnapshot, sha256Hex, QualifiedPackageError } from '../public-v8/contracts.js';
import type { CasDocumentStore } from './cas.js';
import { HostBoundaryError } from './errors.js';

export const HOST_CREDENTIAL_TYPE = 'v08-host-principal/1';

/** Revocation records live under this CAS key namespace (durable, shared). */
export function revocationKey(grantId: string): string {
  return `v8host:revoke:${grantId}`;
}

/** The issuer-signed grant material (what the attestation binds). */
export interface PrincipalGrant {
  readonly issuerId: string;
  readonly grantId: string;
  readonly tenantId: string;
  readonly appId: string;
  readonly subject: string;
  /** This host's audience — a credential minted for another host is refused. */
  readonly audience: string;
  readonly roles: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** A presented credential: grant + binding digest + issuer attestation. */
export interface HostCredential extends PrincipalGrant {
  readonly proofType: string;
  readonly proofDigest: string;
  readonly issuerAttestation: string;
}

/** The authenticated identity the Host derives from a verified credential. */
export interface HostPrincipal {
  readonly issuerId: string;
  readonly grantId: string;
  readonly tenantId: string;
  readonly appId: string;
  readonly subject: string;
  readonly audience: string;
  readonly roles: readonly string[];
}

const GRANT_STRING_FIELDS: readonly string[] = [
  'issuerId',
  'grantId',
  'tenantId',
  'appId',
  'subject',
  'audience',
  'issuedAt',
  'expiresAt',
];

export function credentialBindingDigest(grant: PrincipalGrant): string {
  return sha256Hex(
    canonicalJson({
      domain: 'dh.v8.host-principal/1',
      issuerId: grant.issuerId,
      grantId: grant.grantId,
      tenantId: grant.tenantId,
      appId: grant.appId,
      subject: grant.subject,
      audience: grant.audience,
      roles: [...grant.roles],
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
    }),
  );
}

/**
 * Issuer side (governance/test context): mint a credential from a grant and
 * the issuer secret. The secret never leaves the issuer context.
 */
export function mintPrincipalCredential(grant: PrincipalGrant, issuerSecret: string): HostCredential {
  const proofDigest = credentialBindingDigest(grant);
  const issuerAttestation = `hmac-sha256:${createHmac('sha256', issuerSecret).update(proofDigest, 'utf8').digest('hex')}`;
  return {
    proofType: HOST_CREDENTIAL_TYPE,
    issuerId: grant.issuerId,
    grantId: grant.grantId,
    tenantId: grant.tenantId,
    appId: grant.appId,
    subject: grant.subject,
    audience: grant.audience,
    roles: [...grant.roles],
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
    proofDigest,
    issuerAttestation,
  };
}

/**
 * Descriptor-safe structural check of a presented credential (hostile
 * getters / callables / __proto__ keys are refused via the canonical
 * snapshot, exactly like the load gate's root inspection).
 */
export function assertCredentialShape(value: unknown): HostCredential {
  let snapshot: Record<string, unknown>;
  try {
    snapshot = canonicalSnapshot(value) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof QualifiedPackageError) {
      throw new HostBoundaryError('HOST_CREDENTIAL_MALFORMED', `credential is not a canonical plain-JSON record: ${error.message}`);
    }
    throw error;
  }
  const expected = new Set<string>(['proofType', 'proofDigest', 'issuerAttestation', ...GRANT_STRING_FIELDS, 'roles']);
  const ownKeys = Object.keys(snapshot);
  for (const key of ownKeys) {
    if (!expected.has(key)) {
      throw new HostBoundaryError('HOST_CREDENTIAL_MALFORMED', `credential carries unbound field ${key}; every credential field must be issuer-attested`);
    }
  }
  if (snapshot.proofType !== HOST_CREDENTIAL_TYPE) {
    throw new HostBoundaryError('HOST_CREDENTIAL_MALFORMED', `credential proofType ${String(snapshot.proofType)} is not ${HOST_CREDENTIAL_TYPE}`);
  }
  for (const field of GRANT_STRING_FIELDS) {
    const value: unknown = snapshot[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new HostBoundaryError('HOST_CREDENTIAL_MALFORMED', `credential field ${field} must be a non-empty string`);
    }
  }
  // Namespace-delimiter guard (independent-review P1-1, PR #1011): tenantId
  // and appId are joined into UX document namespaces (`ux:<t>:<a>:`), so a
  // ':' inside either id collides namespaces across apps AND tenants —
  // e.g. (t1, a1) would read (t1, a1:sub) documents, and (t1:a1, sub) has
  // EXACTLY the namespace of (t1, a1:sub). Refused typed at the
  // authoritative shape check; uxDocumentNamespace re-guards construction.
  for (const field of ['tenantId', 'appId'] as const) {
    const value: unknown = snapshot[field];
    if (typeof value === 'string' && value.includes(':')) {
      throw new HostBoundaryError(
        'HOST_IDENTITY_ID_MALFORMED',
        `credential ${field} must not contain ':' (the UX document namespace delimiter); issuers must mint separator-free ids`,
      );
    }
  }
  const roles = snapshot.roles;
  if (!Array.isArray(roles) || roles.length === 0 || !roles.every((role) => typeof role === 'string' && role.length > 0)) {
    throw new HostBoundaryError('HOST_CREDENTIAL_MALFORMED', 'credential roles must be a non-empty array of non-empty strings');
  }
  if (Number.isNaN(Date.parse(snapshot.issuedAt as string)) || Number.isNaN(Date.parse(snapshot.expiresAt as string))) {
    throw new HostBoundaryError('HOST_CREDENTIAL_MALFORMED', 'credential issuedAt/expiresAt must be parseable timestamps');
  }
  return snapshot as unknown as HostCredential;
}

export interface HostIdentityVerifierInput {
  /** issuerId → secret, supplied by the same governance bootstrap as the load gate. */
  readonly issuers: ReadonlyMap<string, string>;
  readonly audience: string;
  readonly now: () => Date;
  /** Optional currentness policy for credentials (like the load gate's maxProofAgeMs). */
  readonly maxCredentialAgeMs?: number;
  /** Durable revocation lookups go through the physical CAS store. */
  readonly revocations: CasDocumentStore;
  /** Tolerance for clocks running slightly ahead (default 5 minutes). */
  readonly clockSkewMs?: number;
}

/**
 * Host-side authenticator. Every call re-verifies: registry membership,
 * binding digest, HMAC attestation, audience, validity window, currentness
 * policy and the durable revocation record (C01/N3/N5 revalidation).
 */
export class HostIdentityVerifier {
  readonly #issuers: ReadonlyMap<string, string>;
  readonly #audience: string;
  readonly #now: () => Date;
  readonly #maxCredentialAgeMs: number | undefined;
  readonly #revocations: CasDocumentStore;
  readonly #clockSkewMs: number;

  constructor(input: HostIdentityVerifierInput) {
    this.#issuers = new Map(input.issuers);
    this.#audience = input.audience;
    this.#now = input.now;
    this.#maxCredentialAgeMs = input.maxCredentialAgeMs;
    this.#revocations = input.revocations;
    this.#clockSkewMs = input.clockSkewMs ?? 5 * 60 * 1000;
  }

  async authenticate(credential: unknown): Promise<HostPrincipal> {
    const presented = assertCredentialShape(credential);
    const secret = this.#issuers.get(presented.issuerId);
    if (secret === undefined) {
      throw new HostBoundaryError(
        'HOST_CREDENTIAL_UNTRUSTED_ISSUER',
        `credential issuer ${presented.issuerId} is not in the trusted issuer registry of this host`,
      );
    }
    const expectedDigest = credentialBindingDigest(presented);
    if (expectedDigest !== presented.proofDigest) {
      throw new HostBoundaryError(
        'HOST_CREDENTIAL_MALFORMED',
        'credential binding digest does not match its own material; the grant cannot be authenticated',
      );
    }
    const expected = `hmac-sha256:${createHmac('sha256', secret).update(presented.proofDigest, 'utf8').digest('hex')}`;
    const given = presented.issuerAttestation;
    // UTF-8 byte-length precheck (independent-review P2-1, PR #1011): a
    // code-unit-length-equal multibyte attestation has a DIFFERENT byte
    // length, which would make timingSafeEqual throw a bare RangeError
    // outside the typed error taxonomy. Comparing bytes first keeps every
    // mismatch inside HOST_CREDENTIAL_FORGED.
    const givenBytes = Buffer.from(given, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    const forged = givenBytes.length !== expectedBytes.length || !timingSafeEqual(givenBytes, expectedBytes);
    if (forged) {
      throw new HostBoundaryError(
        'HOST_CREDENTIAL_FORGED',
        `credential attestation does not verify against the trusted issuer secret; a keyless-minted principal never authenticates`,
      );
    }
    if (presented.audience !== this.#audience) {
      throw new HostBoundaryError(
        'HOST_CREDENTIAL_AUDIENCE',
        `credential audience ${presented.audience} does not match this host (${this.#audience}); credentials are not replayable across hosts`,
      );
    }
    const now = this.#now().getTime();
    const issuedAt = Date.parse(presented.issuedAt);
    const expiresAt = Date.parse(presented.expiresAt);
    if (issuedAt > now + this.#clockSkewMs) {
      throw new HostBoundaryError('HOST_CREDENTIAL_NOT_YET_VALID', `credential is dated in the future (${presented.issuedAt})`);
    }
    if (expiresAt <= now) {
      throw new HostBoundaryError('HOST_CREDENTIAL_EXPIRED', `credential expired at ${presented.expiresAt}; an expired grant is never authenticated`);
    }
    if (this.#maxCredentialAgeMs !== undefined && now - issuedAt > this.#maxCredentialAgeMs) {
      throw new HostBoundaryError(
        'HOST_CREDENTIAL_STALE',
        `credential issued at ${presented.issuedAt} is older than the host currentness policy (${String(this.#maxCredentialAgeMs)} ms)`,
      );
    }
    const revoked = await this.#revocations.get(revocationKey(presented.grantId));
    if (revoked !== null) {
      throw new HostBoundaryError(
        'HOST_CREDENTIAL_REVOKED',
        `grant ${presented.grantId} carries a durable revocation record; a revoked principal is refused at every authentication`,
      );
    }
    return Object.freeze({
      issuerId: presented.issuerId,
      grantId: presented.grantId,
      tenantId: presented.tenantId,
      appId: presented.appId,
      subject: presented.subject,
      audience: presented.audience,
      roles: Object.freeze([...presented.roles]),
    });
  }
}
