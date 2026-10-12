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
 * [#1013 I01] The bootstrap ALSO installs the protected kernel Host
 * binding channel (public-v8/kernel-host.ts, one-shot) with the FULL
 * bounded port set the selected Kernel mechanism consumes at runtime:
 * the probed true-CAS docs port (get/put/list over THIS store — the same
 * physical storage, adapted, never a second store), the node:crypto
 * sha256 port, the trusted bootstrap clock, and the generic resource
 * dispatcher behind a Host-owned dispatch principal. With this, the
 * strictly one-argument `DomainHarness.load(package)` becomes executable
 * in a real process; a process that never bootstrapped still fails closed
 * with KERNEL_HOST_NOT_INSTALLED, and no public surface ever exposes the
 * ports (no second load argument, no raw Host port export).
 *
 * Ordering: the kernel Host channel is installed BEFORE the one-shot load
 * trust channel is consumed. If the kernel channel is already occupied
 * (a hostile or stale manual installation), bootstrap refuses typed and
 * the trust channel stays unconsumed — a failed bootstrap can never leave
 * its freshly-established issuer trust bound to someone else's Host ports.
 *
 * Issuer secrets live ONLY in closures (load gate + identity verifier).
 * The TrustedNodeHost object exposes no getter that can read them, and the
 * UX transport surface is a strict allowlist (no docs, no dispatcher, no
 * publish, no installer, no host ports — B01-N4/N6/N8).
 */
import { createHash } from 'node:crypto';
import { installTrustedIssuers, isTrustChannelEstablished } from '../public-v8/trust.js';
import { installKernelHostPorts } from '../public-v8/kernel-host.js';
import { probeTrueCasStore, InMemoryCasStore } from './cas.js';
import { ResourceDispatcher } from './dispatcher.js';
import { ScopedEventHub } from './events.js';
import { HostIdentityVerifier, revocationKey } from './identity.js';
import { HostBoundaryError } from './errors.js';
import { openSqliteCasStore, SqliteCasStore } from './sqlite-cas-store.js';
function isSqliteStore(store) {
    return store instanceof SqliteCasStore;
}
/**
 * Protected Host bootstrap. Establishes the one-shot load trust channel
 * (trust.ts seam) and assembles the trusted Node Host over probed true-CAS
 * physical storage. A second bootstrap in the same process fails typed with
 * TRUST_CHANNEL_ALREADY_ESTABLISHED (from the load gate) — a partially
 * bootstrapped process can never be re-trusted mid-flight.
 */
export async function bootstrapTrustedHost(input) {
    if (typeof input.audience !== 'string' || input.audience.length === 0) {
        throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'bootstrapTrustedHost requires a non-empty audience');
    }
    if (!(input.issuers instanceof Map) || input.issuers.size === 0) {
        throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'bootstrapTrustedHost requires a non-empty issuers Map (issuerId → secret)');
    }
    const now = input.now ?? (() => new Date());
    // ---- Physical storage first: a storage failure must NOT consume the
    // one-shot trust channel (the process stays un-bootstrapped and fail-closed).
    let store;
    if (input.storage === undefined) {
        store = new InMemoryCasStore();
    }
    else if ('path' in input.storage) {
        store = await openSqliteCasStore({ path: input.storage.path });
    }
    else {
        store = input.storage.store;
    }
    // C01-N7 at the physical boundary: prove the presented storage is a true
    // CAS store BEFORE any authority is allowed to rely on it.
    await probeTrueCasStore(store);
    // ---- [#1013 I01] The protected kernel Host binding channel: install
    // the FULL bounded port set over the probed physical storage, BEFORE the
    // one-shot load trust channel is consumed (see module header). Every
    // port adapts a Host-owned facility — nothing here is caller-supplied:
    //   docs      — the same true-CAS store, shape-adapted 1:1 (get/put/list);
    //   sha256    — node:crypto SHA-256 over UTF-8 (trusted Host crypto);
    //   clock     — the bootstrap clock (injectable for tests, ISO-8601);
    //   resources — the generic dispatcher behind the Host's own dispatch
    //               principal (K/business effect handlers dispatch physical
    //               resources as the Host, never as a caller).
    const resources = new ResourceDispatcher();
    const kernelDispatchPrincipal = Object.freeze({
        issuerId: `host:${input.audience}`,
        grantId: `host-kernel-dispatch:${input.audience}`,
        tenantId: 'host',
        appId: input.audience,
        subject: `host-kernel:${input.audience}`,
        audience: input.audience,
        roles: Object.freeze(['host-kernel']),
    });
    installKernelHostPorts({
        docs: {
            get: (key) => store.get(key),
            put: (key, value, conditions) => store.put(key, value, conditions),
            list: (prefix) => store.list(prefix),
        },
        sha256: {
            digestUtf8: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
        },
        clock: () => now().toISOString(),
        resources: {
            call: (resourceKey, operation, payload) => resources.call(resourceKey, operation, payload, { principal: kernelDispatchPrincipal }),
        },
    });
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
    const events = new ScopedEventHub({ authenticate: (credential) => verifier.authenticate(credential) });
    const host = Object.freeze({
        audience: input.audience,
        docs: store,
        resources,
        events,
        authenticate: (credential) => verifier.authenticate(credential),
        revokeGrant: async (grantId) => {
            if (typeof grantId !== 'string' || grantId.length === 0) {
                throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'revokeGrant requires a non-empty grantId');
            }
            await store.put(revocationKey(grantId), { revokedAt: now().toISOString() }, { mustBeAbsent: true });
        },
        isGrantRevoked: async (grantId) => (await store.get(revocationKey(grantId))) !== null,
        close: async () => {
            if (isSqliteStore(store))
                await store.close();
        },
    });
    return { host, store };
}
/**
 * Diagnostics-only probe (tests/evidence): whether THIS process has the
 * protected load trust channel established. Never a trust decision input.
 */
export function isHostTrustChannelEstablished() {
    return isTrustChannelEstablished();
}
//# sourceMappingURL=bootstrap.js.map