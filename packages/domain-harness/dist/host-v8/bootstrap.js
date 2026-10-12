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
import { installTrustedIssuers, isTrustChannelEstablished, preflightTrustedIssuersInstall } from '../public-v8/trust.js';
import { installKernelHostPorts, preflightKernelHostPorts } from '../public-v8/kernel-host.js';
import { installHostModelPort, preflightHostModelPort } from '../public-v8/model-port.js';
import { sha256Hex } from '../public-v8/contracts.js';
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
 * The fixed Host service identity attached to Kernel effect dispatches
 * (#1013, I01): Business effect handlers execute with Host-provisioned
 * resources, not with the submitting user's identity — effects are
 * kernel-owned and no principal material ever flows into them.
 */
const KERNEL_EFFECT_SERVICE_PRINCIPAL = Object.freeze({
    issuerId: 'v8-host',
    grantId: 'kernel-effect-service',
    tenantId: 'v8-host',
    appId: 'kernel-effects',
    subject: 'v8-kernel-effect-service',
    audience: 'v8-host',
    roles: Object.freeze(['kernel-effect']),
});
/**
 * Protected Host bootstrap. Establishes the one-shot load trust channel
 * (trust.ts seam) and assembles the trusted Node Host over probed true-CAS
 * physical storage. Transactional across ALL one-shot channels (#1013 R1
 * F-01): occupancy and shape of every channel are preflighted
 * synchronously BEFORE any irreversible installation, and the installs
 * commit in the same synchronous block (no async gap) — a bootstrap that
 * refuses (occupied Kernel channel, malformed/occupied ModelPort,
 * established trust channel, invalid input) leaves ZERO trust/Kernel/
 * ModelPort residue, so a partially-bootstrapped process can never exist
 * and a rejected attempt never blocks a subsequent trusted bootstrap.
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
    // ---- Build EVERYTHING the host needs before any one-shot channel is
    // touched (#1013 R1 F-01): a constructor or wiring failure below must
    // leave the process exactly as un-bootstrapped as it started. ----
    const resources = new ResourceDispatcher();
    // #1013 (I01): the COMPLETE protected Kernel Host ports over the probed
    // physical storage. The physically selected Kernel mechanism consumes
    // exactly this bounded contract (kernel-mechanism-v1.mjs): true-CAS docs
    // get/put/list over the SAME probed physical store (conditions forwarded
    // verbatim — the store's refusal of unconditional writes stays
    // authoritative), a trusted sha256 digest, the physical resource dispatch
    // port for Business effect handlers, and the trusted clock.
    const kernelPorts = {
        docs: Object.freeze({
            get: (key) => store.get(key),
            put: (key, value, conditions) => store.put(key, value, conditions),
            list: (prefix) => store.list(prefix),
        }),
        sha256: Object.freeze({
            // Trusted digest (same construction as the compiler/verifier digest).
            digestUtf8: (value) => sha256Hex(value),
        }),
        resources: Object.freeze({
            // Business effect handlers call resources.call(key, operation, payload)
            // with no principal argument; the effect dispatch attribution is the
            // HOST service identity — the submitting principal never leaks into
            // effect execution, and effect handlers can never mint authority.
            call: (resourceKey, operation, payload) => resources.call(resourceKey, operation, payload, { principal: KERNEL_EFFECT_SERVICE_PRINCIPAL }),
        }),
        clock: () => now().toISOString(),
    };
    const trustInput = {
        issuers: input.issuers,
        ...(input.maxProofAgeMs !== undefined ? { maxProofAgeMs: input.maxProofAgeMs } : {}),
    };
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
    // ---- Transactional one-shot commit (#1013 R1 F-01). PREFLIGHT every
    // one-shot channel — occupancy AND port shape, plus the trust input —
    // synchronously, then commit them in the SAME synchronous block with NO
    // await between preflight and commit. A rejected bootstrap therefore
    // consumes NOTHING: an occupied Kernel channel, a malformed or occupied
    // ModelPort, an established trust channel or an invalid trust input all
    // refuse typed with zero trust/Kernel/ModelPort residue (JS is
    // single-threaded, so no other code can interleave the two blocks). ----
    preflightTrustedIssuersInstall(trustInput);
    preflightKernelHostPorts(kernelPorts);
    if (input.modelPort !== undefined) {
        preflightHostModelPort(input.modelPort);
    }
    // The #1004 → trust.ts seam: install the protected load gate, the kernel
    // Host ports (one-shot like the load gate: a running process can never
    // have its Kernel Host binding swapped mid-flight), and the optional
    // trusted ModelPort (#1013 I04; absent stays an honest model-free state).
    installTrustedIssuers(trustInput);
    installKernelHostPorts(kernelPorts);
    if (input.modelPort !== undefined) {
        installHostModelPort(input.modelPort);
    }
    if (!isTrustChannelEstablished()) {
        throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'the load trust channel did not establish after protected installation');
    }
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