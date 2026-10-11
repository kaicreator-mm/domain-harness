/**
 * v0.8 trusted Node Host — protected bootstrap (T-E, #1004).
 * ============================================================
 *
 * This is the Host-side wiring the load trust gate (public-v8/trust.ts)
 * anticipated: the governance/Host context holds the issuer secrets and
 * installs the protected load trust channel exactly ONCE per process by
 * calling this module — the ONLY caller of `installTrustedIssuers` in the
 * host graph. A process that never bootstrapped fails closed in `load()`
 * (UNTRUSTED_ISSUER, zero imports) — the #1000 issuer-authorization gap
 * stays structurally closed on the Host side.
 *
 * The same bootstrap assembles the trusted Node Host:
 *   - physical CAS storage (SQLite by default; the store is PROBED at
 *     bootstrap — a store that cannot prove true revision CAS is refused
 *     typed, never degraded, C01-N7);
 *   - the H identity verifier (issuer/audience/tenant/app/subject/roles/
 *     currentness/revocation) over the SAME issuer registry material;
 *   - the generic resource dispatcher and the scoped event hub.
 *
 * Issuer secrets live ONLY in closures (load gate + identity verifier).
 * The TrustedNodeHost object exposes no getter that can read them, and the
 * UX transport surface is a strict allowlist (no docs, no dispatcher, no
 * publish, no installer, no host ports — B01-N4/N6/N8).
 */

import { installTrustedIssuers, isTrustChannelEstablished } from '../public-v8/trust.js';
import { probeTrueCasStore, InMemoryCasStore, type CasDocumentStore } from './cas.js';
import { ResourceDispatcher } from './dispatcher.js';
import { ScopedEventHub } from './events.js';
import { HostIdentityVerifier, revocationKey, type HostCredential, type HostPrincipal } from './identity.js';
import { HostBoundaryError } from './errors.js';
import { openSqliteCasStore, SqliteCasStore } from './sqlite-cas-store.js';

export interface TrustedHostStorageSpec {
  /** SQLite database file (the durable physical store; a real file). */
  readonly path: string;
}

export interface TrustedHostStorageInstance {
  /** A caller-opened store (fixtures/tests); it must pass the true-CAS probe. */
  readonly store: CasDocumentStore;
}

export interface TrustedNodeHostInput {
  /** issuerId → secret, held by the governance/Host bootstrap context. */
  readonly issuers: ReadonlyMap<string, string>;
  /** This host's audience identity (credentials are audience-bound). */
  readonly audience: string;
  /**
   * Currentness policy for the LOAD gate (approval proofs) — forwarded to
   * the protected trust channel verbatim.
   */
  readonly maxProofAgeMs?: number;
  /**
   * Currentness policy for HOST credentials (principal grants). When
   * omitted, credentials are bounded by their own expiresAt only.
   */
  readonly maxCredentialAgeMs?: number;
  /** Durable physical storage; omit for a non-durable in-memory host (fixtures). */
  readonly storage?: TrustedHostStorageSpec | TrustedHostStorageInstance;
  /** Injectable clock (tests). */
  readonly now?: () => Date;
}

export interface TrustedNodeHost {
  readonly audience: string;
  /**
   * Host-context physical document store. NOT part of the UX transport
   * surface — the transport never hands this object to a caller.
   */
  readonly docs: CasDocumentStore;
  /** Host-context generic resource dispatcher (provisioning + accounting). */
  readonly resources: ResourceDispatcher;
  /** Host-context scoped event hub (publish; subscriptions go through the transport). */
  readonly events: ScopedEventHub;
  /** Authenticate a presented credential (H identity verification). */
  authenticate(credential: unknown): Promise<HostPrincipal>;
  /** Durable grant revocation (governance action; typed double-revoke). */
  revokeGrant(grantId: string): Promise<void>;
  isGrantRevoked(grantId: string): Promise<boolean>;
  /** Mint nothing; hosts do not mint credentials (issuers do). */
  close(): Promise<void>;
}

export interface TrustedHostHandle {
  readonly host: TrustedNodeHost;
  readonly store: CasDocumentStore;
}

function isSqliteStore(store: CasDocumentStore): store is SqliteCasStore {
  return store instanceof SqliteCasStore;
}

/**
 * Protected Host bootstrap. Establishes the one-shot load trust channel
 * (trust.ts seam) and assembles the trusted Node Host over probed true-CAS
 * physical storage. A second bootstrap in the same process fails typed with
 * TRUST_CHANNEL_ALREADY_ESTABLISHED (from the load gate) — a partially
 * bootstrapped process can never be re-trusted mid-flight.
 */
export async function bootstrapTrustedHost(input: TrustedNodeHostInput): Promise<TrustedHostHandle> {
  if (typeof input.audience !== 'string' || input.audience.length === 0) {
    throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'bootstrapTrustedHost requires a non-empty audience');
  }
  if (!(input.issuers instanceof Map) || input.issuers.size === 0) {
    throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'bootstrapTrustedHost requires a non-empty issuers Map (issuerId → secret)');
  }

  const now = input.now ?? (() => new Date());
  // ---- Physical storage first: a storage failure must NOT consume the
  // one-shot trust channel (the process stays un-bootstrapped and fail-closed).
  let store: CasDocumentStore;
  if (input.storage === undefined) {
    store = new InMemoryCasStore();
  } else if ('path' in input.storage) {
    store = await openSqliteCasStore({ path: input.storage.path });
  } else {
    store = input.storage.store;
  }
  // C01-N7 at the physical boundary: prove the presented storage is a true
  // CAS store BEFORE any authority is allowed to rely on it.
  await probeTrueCasStore(store);

  // ---- The #1004 → trust.ts seam: install the protected load gate. ----
  installTrustedIssuers({
    issuers: input.issuers,
    ...(input.maxProofAgeMs !== undefined ? { maxProofAgeMs: input.maxProofAgeMs } : {}),
  });
  if (!isTrustChannelEstablished()) {
    throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'the load trust channel did not establish after protected installation');
  }

  const verifier = new HostIdentityVerifier({
    issuers: input.issuers,
    audience: input.audience,
    now,
    ...(input.maxCredentialAgeMs !== undefined ? { maxCredentialAgeMs: input.maxCredentialAgeMs } : {}),
    revocations: store,
  });
  const resources = new ResourceDispatcher();
  const events = new ScopedEventHub({ authenticate: (credential) => verifier.authenticate(credential) });

  const host: TrustedNodeHost = Object.freeze({
    audience: input.audience,
    docs: store,
    resources,
    events,
    authenticate: (credential: unknown) => verifier.authenticate(credential),
    revokeGrant: async (grantId: string): Promise<void> => {
      if (typeof grantId !== 'string' || grantId.length === 0) {
        throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'revokeGrant requires a non-empty grantId');
      }
      await store.put(revocationKey(grantId), { revokedAt: now().toISOString() }, { mustBeAbsent: true });
    },
    isGrantRevoked: async (grantId: string): Promise<boolean> => (await store.get(revocationKey(grantId))) !== null,
    close: async (): Promise<void> => {
      if (isSqliteStore(store)) await store.close();
    },
  });
  return { host, store };
}

/**
 * Diagnostics-only probe (tests/evidence): whether THIS process has the
 * protected load trust channel established. Never a trust decision input.
 */
export function isHostTrustChannelEstablished(): boolean {
  return isTrustChannelEstablished();
}

/** Re-export for the bootstrap surface typing. */
export type { HostCredential, HostPrincipal };
