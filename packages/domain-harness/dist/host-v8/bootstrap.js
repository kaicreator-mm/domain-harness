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
import { randomBytes } from 'node:crypto';
import { installTrustedIssuers, isTrustChannelEstablished, preflightTrustedIssuersInstall } from '../public-v8/trust.js';
import { installDeploymentAuthority, preflightDeploymentAuthorityInstall } from '../public-v8/deploy.js';
import { installKernelHostPorts, preflightKernelHostPorts } from '../public-v8/kernel-host.js';
import { installHostModelPort, preflightHostModelPort } from '../public-v8/model-port.js';
import { installGatewaySessionCap, preflightGatewaySessionCap } from '../public-v8/microkernel.js';
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
    // ---- #1013 R2 counterexample @6121773380: snapshot the caller input
    // ONCE, before ANY asynchronous step. A top-level accessor could hand the
    // preflight and the commit DIFFERENT values (e.g. a valid ModelPort for
    // the preflight reads, an invalid one for the install read), passing the
    // preflight and then failing the LAST install after issuer trust and the
    // Kernel Host ports are already committed — exactly the partial-install
    // residue this bootstrap exists to make impossible. Synchronous JS does
    // not make repeated reads of an accessor-valued input equal, so:
    //   1. accessor-valued top-level configuration is refused outright
    //      (enforceable data-property check, not a comment-only assumption);
    //   2. every field is then read EXACTLY ONCE (destructure) and only that
    //      immutable reference flows to preflight, install, verifier and host
    //      assembly — the load-gate issuer registry and the Host identity
    //      verifier can never observe drifted issuer/config sets.
    for (const key of Object.keys(input)) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
            throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', `bootstrapTrustedHost refuses accessor-valued top-level input field '${key}'; Host bootstrap configuration must be plain data properties`);
        }
    }
    const { audience, issuers, maxProofAgeMs, maxCredentialAgeMs, storage, now: nowInput, modelPort } = input;
    if (typeof audience !== 'string' || audience.length === 0) {
        throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'bootstrapTrustedHost requires a non-empty audience');
    }
    if (!(issuers instanceof Map) || issuers.size === 0) {
        throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'bootstrapTrustedHost requires a non-empty issuers Map (issuerId → secret)');
    }
    const now = nowInput ?? (() => new Date());
    // ---- Physical storage first: a storage failure must NOT consume the
    // one-shot trust channel (the process stays un-bootstrapped and fail-closed).
    let store;
    if (storage === undefined) {
        store = new InMemoryCasStore();
    }
    else if ('path' in storage) {
        store = await openSqliteCasStore({ path: storage.path });
    }
    else {
        store = storage.store;
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
    // get/put/remove/list over the SAME probed physical store (conditions
    // forwarded verbatim — the store's refusal of unconditional writes and
    // unconditional deletes stays authoritative; [#1108 K01] remove is the
    // conditional admission-fence release path), a trusted sha256 digest, the
    // physical resource dispatch port for Business effect handlers, and the
    // trusted clock.
    const kernelPorts = {
        docs: Object.freeze({
            get: (key) => store.get(key),
            put: (key, value, conditions) => store.put(key, value, conditions),
            list: (prefix) => store.list(prefix),
            remove: (key, conditions) => store.remove(key, conditions),
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
            // #1023 S05 R1 P1-01: the raw `call` refuses the reserved
            // scoped-physical namespace at the dispatcher, and `callScoped` is the
            // ONLY route into it — the trusted loader's per-activation resources
            // view calls it with the scope the loader minted itself. The view the
            // loader hands the Kernel mechanism forwards NEITHER this privileged
            // member nor any scope: a Business package or caller can never present
            // a scope, only its own closure's claimed logical keys.
            call: (resourceKey, operation, payload) => resources.call(resourceKey, operation, payload, { principal: KERNEL_EFFECT_SERVICE_PRINCIPAL }),
            callScoped: (scopeId, resourceKey, operation, payload) => resources.callScoped(scopeId, resourceKey, operation, payload, { principal: KERNEL_EFFECT_SERVICE_PRINCIPAL }),
        }),
        clock: () => now().toISOString(),
    };
    const trustInput = {
        issuers,
        ...(maxProofAgeMs !== undefined ? { maxProofAgeMs } : {}),
    };
    const verifier = new HostIdentityVerifier({
        issuers,
        audience,
        now,
        ...(maxCredentialAgeMs !== undefined ? { maxCredentialAgeMs } : {}),
        revocations: store,
    });
    const events = new ScopedEventHub({ authenticate: (credential) => verifier.authenticate(credential) });
    const host = Object.freeze({
        audience,
        docs: store,
        storageMode: storage === undefined ? 'memory' : 'physical',
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
    // #1013 R2 (@6122817203): the gateway session capability joins the same
    // transaction — it is minted HERE (unguessable, never derived from input
    // data) and installed through the one-shot microkernel channel, so a
    // packed same-process consumer that deep-imports the shipped sibling
    // module can hold its functions but never this process's capability.
    // #1013 R2 fresh review (@5494026032, NEW_P1_01/02): the SAME capability
    // is installed WITH the kernel Host ports and the ModelPort — both raw
    // port getters refuse typed without it, so uncredentialed deep imports of
    // kernel-host.js / model-port.js hold functions but no physical CAS,
    // kernel-effect dispatch or ModelPort authority either.
    const gatewaySessionCap = randomBytes(32).toString('hex');
    preflightTrustedIssuersInstall(trustInput);
    preflightKernelHostPorts(kernelPorts, gatewaySessionCap);
    preflightGatewaySessionCap();
    // #1023 S01 (+R1 #5519609071): the trusted deployment authority joins the
    // SAME transaction — the probed physical store is its storage, the Host
    // audience binds every installed reference (P1-02), and the SAME
    // bootstrap-minted session capability gates every mutating governance
    // command (P1-01: install/revoke/withdraw refuse uncredentialed deep
    // imports exactly like the kernel-host/model-port getters, #1013 R2).
    preflightDeploymentAuthorityInstall({ store, audience, governanceCap: gatewaySessionCap });
    if (modelPort !== undefined) {
        preflightHostModelPort(modelPort, gatewaySessionCap);
    }
    // The #1004 → trust.ts seam: install the protected load gate, the kernel
    // Host ports (one-shot like the load gate: a running process can never
    // have its Host storage swapped mid-flight), and the optional trusted
    // ModelPort (#1013 I04; absent stays an honest model-free state). Every
    // port-bearing channel carries the session capability installed beside it.
    installTrustedIssuers(trustInput);
    installKernelHostPorts(kernelPorts, gatewaySessionCap);
    installGatewaySessionCap(gatewaySessionCap);
    installDeploymentAuthority({ store, audience, governanceCap: gatewaySessionCap });
    if (modelPort !== undefined) {
        installHostModelPort(modelPort, gatewaySessionCap);
    }
    if (!isTrustChannelEstablished()) {
        throw new HostBoundaryError('HOST_BOOTSTRAP_INVALID', 'the load trust channel did not establish after protected installation');
    }
    return { host, store, gatewaySessionCap };
}
/**
 * Diagnostics-only probe (tests/evidence): whether THIS process has the
 * protected load trust channel established. Never a trust decision input.
 */
export function isHostTrustChannelEstablished() {
    return isTrustChannelEstablished();
}
//# sourceMappingURL=bootstrap.js.map