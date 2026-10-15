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
import { DomainHarness, getFacadeKernelOps } from '../public-v8/microkernel.js';
import { QualifiedPackageError, canonicalSnapshot, sha256Hex } from '../public-v8/contracts.js';
import { isInstalledHandleShape, resolveInstalledPackageRoot } from '../public-v8/deploy.js';
import { HostBoundaryError } from './errors.js';
import { assertIntentScope } from './ux-transport.js';
/**
 * Durable CAS key under which a gateway registration pins the EXACT
 * installed closure identity of an app (#1013 R1 F-02). Same namespace
 * convention as the revocation records; never inside the Kernel journal
 * prefix (`v08-kernel:…`).
 */
function appPinKey(appId) {
    return `v8host:gateway:app-pin:${appId}`;
}
function readPackageShas(packages) {
    if (!Array.isArray(packages))
        return undefined;
    const out = [];
    for (const pkg of packages) {
        if (typeof pkg !== 'object' || pkg === null)
            return undefined;
        const record = pkg;
        if (typeof record.packageId !== 'string' || typeof record.kind !== 'string' || typeof record.moduleSha256 !== 'string')
            return undefined;
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
function readClaimedClosureIdentity(packageRoot) {
    let snapshot;
    try {
        snapshot = canonicalSnapshot(packageRoot);
    }
    catch {
        return undefined;
    }
    if (typeof snapshot !== 'object' || snapshot === null)
        return undefined;
    const record = snapshot;
    const build = record.build;
    if (typeof record.rootPackageId !== 'string' || typeof build !== 'object' || build === null)
        return undefined;
    const closureDigest = build.closureDigest;
    if (typeof closureDigest !== 'string')
        return undefined;
    const packages = readPackageShas(record.packages);
    if (packages === undefined)
        return undefined;
    return { rootPackageId: record.rootPackageId, closureDigest, packages };
}
/** The same identity off the LOADED build trace (authoritative form). */
function readInstalledClosureIdentity(trace) {
    if (typeof trace !== 'object' || trace === null)
        return undefined;
    const record = trace;
    if (typeof record.root !== 'object' || record.root === null)
        return undefined;
    const root = record.root;
    if (typeof root.rootPackageId !== 'string' || typeof root.closureDigest !== 'string')
        return undefined;
    const packages = readPackageShas(record.packages);
    if (packages === undefined)
        return undefined;
    return { rootPackageId: root.rootPackageId, closureDigest: root.closureDigest, packages };
}
function closurePin(appId, audience, identity) {
    return sha256Hex(JSON.stringify({
        pinVersion: 1,
        appId,
        audience,
        rootPackageId: identity.rootPackageId,
        closureDigest: identity.closureDigest,
        packages: identity.packages,
    }));
}
export function createKernelGateway(input) {
    if (typeof input !== 'object' || input === null || typeof input.host !== 'object' || input.host === null) {
        throw new HostBoundaryError('GATEWAY_MALFORMED', 'createKernelGateway requires the trusted host handle from bootstrapTrustedHost');
    }
    if (typeof input.gatewaySessionCap !== 'string' || input.gatewaySessionCap.length === 0) {
        throw new HostBoundaryError('GATEWAY_MALFORMED', 'createKernelGateway requires the gateway session capability issued by bootstrapTrustedHost (handle.gatewaySessionCap); the protected facade ops seam is closed without it (#1013 R2 @6122817203)');
    }
    const host = input.host;
    const gatewaySessionCap = input.gatewaySessionCap;
    const apps = new Map();
    /**
     * In-flight cancellable occurrences, keyed by the authenticated
     * tenant/app + instanceKey + messageId (#1003 FR07-KH2). Entries exist
     * only while their `send` is running.
     */
    const inFlight = new Map();
    function inFlightKey(principal, target, messageId) {
        return JSON.stringify([principal.tenantId, principal.appId, target.instanceKey, messageId]);
    }
    async function authenticate(credential) {
        return host.authenticate(credential);
    }
    function requireApp(appId, principal) {
        // The appId is taken from the AUTHENTICATED principal (or asserted
        // equal to it) — never from unverified request data alone.
        const app = apps.get(principal.appId);
        if (app === undefined || app.appId !== appId) {
            throw new HostBoundaryError('HOST_SCOPE_DENIED', `no qualified Domain App closure is registered on this gateway for the authenticated app ${principal.appId}; cross-app routing is refused`);
        }
        return app;
    }
    /**
     * The K-attested revision selector of one source snapshot: the selected
     * Kernel's own monotonic `stateRevision` (`rev-<n>`). Anything the loaded
     * mechanism did not attest fails closed — the gateway never mints a
     * revision from unverified data.
     */
    function snapshotRevisionOf(snapshot) {
        if (typeof snapshot !== 'object' || snapshot === null) {
            throw new HostBoundaryError('HOST_PROJECTION_SOURCE_UNKNOWN', 'a projection source resolved to no Kernel instance at the authenticated address');
        }
        const revision = snapshot.stateRevision;
        if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
            throw new HostBoundaryError('HOST_PROJECTION_SOURCE_UNKNOWN', 'a projection source carries no K-attested stateRevision; fail closed');
        }
        return `rev-${revision}`;
    }
    /**
     * The retained S query/observer/agent projections of an app's SEALED
     * Standard SDK (surfaced at load exactly like the FR08 retained
     * decision-source endpoints). A sealed SDK that does not export them
     * refuses the query/observer/agent verbs typed — no Host-side
     * re-implementation ever substitutes for the sealed projection bytes.
     */
    function requireRetainedProjection(app) {
        const retained = app.ops.retainedProjection;
        if (retained === undefined) {
            throw new HostBoundaryError('HOST_PROJECTION_SDK_UNAVAILABLE', `the sealed Standard SDK of app ${app.appId} exposes no retained query/observer/agent projection endpoints (projectRetainedRead / coalesceRetainedObservations / projectRetainedAgentTools)`);
        }
        return retained;
    }
    const gateway = {
        async registerApp(registration) {
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
                ? pinnedEntry.value.closurePin
                : undefined;
            if (pinnedEntry !== null && pinned === undefined) {
                throw new HostBoundaryError('GATEWAY_APP_PIN_INVALID', `app ${registration.appId} carries an unreadable registration pin in the physical Host store`);
            }
            if (pinned !== undefined) {
                // Pre-load refusal: descriptor-safe claimed identity, no module bytes.
                // #1023 S01: an installed reference resolves through the trusted
                // deployment seam FIRST (its artifact root IS the claimed identity),
                // so a restart re-registration of the SAME closure under its opaque
                // reference stays idempotent instead of being refused as an
                // unreadable claim; a DIFFERENT closure's reference still mismatches
                // the pin. Resolution failures propagate typed and fail closed.
                const claimedSource = isInstalledHandleShape(registration.packageRoot)
                    ? await resolveInstalledPackageRoot(registration.packageRoot)
                    : registration.packageRoot;
                const claimed = readClaimedClosureIdentity(claimedSource);
                const claimedPin = claimed === undefined ? undefined : closurePin(registration.appId, host.audience, claimed);
                if (claimedPin === undefined || claimedPin !== pinned) {
                    throw new HostBoundaryError('GATEWAY_APP_CLOSURE_MISMATCH', `app ${registration.appId} is durably pinned to a different approved closure on this host (rootPackageId/closureDigest/K/S/B module digests differ); package replacement and stale roots refuse before load`);
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
            const installedKeys = [];
            let ops;
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
                    throw new HostBoundaryError('GATEWAY_APP_CLOSURE_MISMATCH', `app ${registration.appId} is durably pinned to a different approved closure on this host (the loaded closure identity differs from the pinned one)`);
                }
                // ---- #1023 S04/S05: provision the BUILD-selected capability
                // resource adapters derived from the sealed OperationCall ABI. The
                // adapters are the ONLY physical route to the capability-owned
                // effectful handlers, and they are reachable exclusively through the
                // selected Kernel's effect dispatch (hostPorts.resources carries the
                // Host service principal — never a caller identity). #1023 S05: each
                // adapter carries its activation's INJECTIVE physical deployment
                // identity, so the gateway installs it under the composed key
                // `<scopeId>\0<logicalKey>` — two independently approved closures
                // binding the SAME logical route install two distinct entries and
                // can never cross-route (the S04 Host-global logical-key collision
                // is gone by construction). The install is still an ALL-OR-NOTHING
                // batch (R1 P1-01): the dispatcher preflights every key — collision
                // on this Host and duplication inside the batch — and commits every
                // handler in one synchronous block, BEFORE the durable pin below. A
                // batch collision is now reachable only through a same-scope reuse
                // (structurally impossible: the scope is minted fresh per load);
                // the post-batch pin CAS race remains the guarded failure path.
                const adapters = ops.operationResourceAdapters();
                host.resources.provisionAll(adapters.map((adapter) => ({
                    resourceKey: adapter.physicalResourceKey,
                    handler: (operation, payload) => {
                        const handler = adapter.operations.get(operation);
                        if (handler === undefined) {
                            throw new HostBoundaryError('HOST_RESOURCE_OPERATION_UNKNOWN', `resource ${adapter.resourceKey} has no BUILD-selected handler for operation ${operation}`);
                        }
                        return handler(payload);
                    },
                })));
                installedKeys.push(...adapters.map((adapter) => adapter.physicalResourceKey));
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
                    const record = Object.freeze({
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
                    }
                    catch (error) {
                        const concurrentEntry = await host.docs.get(pinKey);
                        const concurrentPin = concurrentEntry !== null && typeof concurrentEntry.value === 'object' && concurrentEntry.value !== null
                            ? concurrentEntry.value.closurePin
                            : undefined;
                        if (concurrentPin !== installedPin) {
                            throw new HostBoundaryError('GATEWAY_APP_PIN_CONFLICT', `durably pinning app ${registration.appId} failed (concurrent or conflicting registration): ${String(error?.message ?? error)}`);
                        }
                        // The identical closure won the concurrent CAS — idempotent.
                    }
                }
            }
            catch (error) {
                // ---- Bounded rollback (#1023 S04 R1 P1-01): remove every adapter
                // THIS call installed, then AWAIT the facade's reverse-order S03
                // teardown. The primary typed error is never erased; rollback and
                // teardown failures ride BESIDE it on the thrown error.
                const rollbackFailures = [];
                for (const key of installedKeys) {
                    try {
                        host.resources.unprovision(key);
                    }
                    catch (rollbackError) {
                        rollbackFailures.push(`unprovision ${key}: ${String(rollbackError?.message ?? rollbackError)}`);
                    }
                }
                try {
                    await facade.stop();
                }
                catch (teardownError) {
                    rollbackFailures.push(`lifecycle teardown: ${String(teardownError?.message ?? teardownError)}`);
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
                genesisRoles: Object.freeze([...registration.genesisRoles]),
            }));
        },
        hasApp(appId) {
            return typeof appId === 'string' && apps.has(appId);
        },
        async send(credential, intent) {
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
            }
            finally {
                entries.delete(entry);
                if (entries.size === 0 && inFlight.get(key) === entries)
                    inFlight.delete(key);
            }
        },
        async invokeOperation(credential, request) {
            if (typeof request !== 'object'
                || request === null
                || typeof request.appId !== 'string'
                || request.appId.length === 0
                || typeof request.capabilityId !== 'string'
                || request.capabilityId.length === 0
                || typeof request.operationId !== 'string'
                || request.operationId.length === 0) {
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
            }
            finally {
                entries.delete(entry);
                if (entries.size === 0 && inFlight.get(key) === entries)
                    inFlight.delete(key);
            }
        },
        async cancel(credential, request) {
            if (typeof request !== 'object'
                || request === null
                || typeof request.target !== 'object'
                || request.target === null
                || typeof request.target.instanceKey !== 'string'
                || typeof request.messageId !== 'string'
                || request.messageId.length === 0) {
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
            for (const entry of own)
                entry.controller.abort();
            return Object.freeze({ status: 'cancel-requested' });
        },
        async queryInstance(credential, target) {
            const principal = await authenticate(credential);
            assertIntentScope(target, principal);
            const app = requireApp(target.appId, principal);
            // The read resolves the tenant/app-qualified instance address of the
            // AUTHENTICATED principal (#1013 @6117218727 Candidate A): a second
            // tenant reusing the same appId/instanceKey reads only its own
            // physical instance — never the first tenant's state.
            return app.ops.queryInstance(principal, target.instanceKey);
        },
        async queryDecisionReceipt(credential, request) {
            const principal = await authenticate(credential);
            assertIntentScope(request, principal);
            const app = requireApp(request.appId, principal);
            // [#1003 NF06] Same authenticated-read discipline as queryInstance:
            // the tenant/app-qualified address of the AUTHENTICATED principal plus
            // the exact message turn. The Kernel alone owns the Business-declared
            // reader-role gate and the record bytes; an unauthenticated or
            // out-of-scope read never reaches the physical store.
            return app.ops.queryDecisionReceipt(principal, { instanceKey: request.instanceKey, messageId: request.messageId });
        },
        async subscribe(credential, scope, listener) {
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
            const unsubscribeFacade = app.ops.observeReceipts((receipt) => {
                if (!active)
                    return;
                const occurrence = receipt?.occurrence;
                if (occurrence?.workflowInstanceId !== workflowInstanceId)
                    return;
                void (async () => {
                    try {
                        // Currentness/revocation lease: the grant is re-verified on
                        // EVERY delivery; an invalidated subscriber stops receiving.
                        await authenticate(credential);
                    }
                    catch {
                        active = false;
                        unsubscribeFacade();
                        return;
                    }
                    if (active)
                        listener(receipt);
                })();
            });
            return {
                unsubscribe: () => {
                    active = false;
                    unsubscribeFacade();
                },
            };
        },
        async queryProjection(credential, request) {
            if (typeof request !== 'object'
                || request === null
                || typeof request.appId !== 'string'
                || request.appId.length === 0
                || typeof request.projectionId !== 'string'
                || request.projectionId.length === 0
                || !Array.isArray(request.dependencies)
                || request.dependencies.length === 0
                || request.dependencies.length > 8
                || typeof request.fields !== 'object'
                || request.fields === null
                || Array.isArray(request.fields)) {
                throw new HostBoundaryError('HOST_PROJECTION_MALFORMED', 'queryProjection requires {appId, projectionId, 1–8 dependencies, fields} with a plain fields record');
            }
            const names = new Set();
            // Re-assert the element type after the Array.isArray shape gate (the
            // predicate narrows the readonly array's elements to `any` for
            // type-aware lint); each field is re-validated below regardless.
            const dependencies = request.dependencies;
            for (const dependency of dependencies) {
                if (typeof dependency !== 'object'
                    || dependency === null
                    || typeof dependency.name !== 'string'
                    || dependency.name.length === 0
                    || dependency.name.includes(':')
                    || typeof dependency.instanceKey !== 'string'
                    || dependency.instanceKey.length === 0
                    || typeof dependency.expectedRevision !== 'string'
                    || dependency.expectedRevision.length === 0) {
                    throw new HostBoundaryError('HOST_PROJECTION_MALFORMED', 'each projection dependency requires non-empty name/instanceKey/expectedRevision strings');
                }
                if (names.has(dependency.name)) {
                    throw new HostBoundaryError('HOST_PROJECTION_MALFORMED', `ambiguous duplicate projection source ${dependency.name}`);
                }
                names.add(dependency.name);
            }
            const principal = await authenticate(credential);
            const app = requireApp(request.appId, principal);
            const retained = requireRetainedProjection(app);
            // Every source resolves through the SAME authenticated principal-
            // qualified K read as queryInstance — a second tenant reusing the same
            // appId/instanceKey can only ever project its own physical instance.
            const snapshots = {};
            for (const dependency of dependencies) {
                const snapshot = await app.ops.queryInstance(principal, dependency.instanceKey);
                snapshots[dependency.name] = { revision: snapshotRevisionOf(snapshot), value: snapshot };
            }
            // The retained S projection owns the deterministic fail-closed
            // semantics (SDK_PROJECTION_STALE / SDK_PROJECTION_MISSING …); its
            // typed refusal propagates to the caller unchanged.
            return retained.projectRead({
                projectionId: request.projectionId,
                dependencies: dependencies.map((dependency) => ({ name: dependency.name, expectedRevision: dependency.expectedRevision })),
                fields: { ...request.fields },
            }, snapshots);
        },
        async observeLatest(credential, scope, listener) {
            if (typeof listener !== 'function') {
                throw new HostBoundaryError('HOST_SUBSCRIPTION_MALFORMED', 'a latest observer requires a listener function');
            }
            if (typeof scope !== 'object' || scope === null || typeof scope.appId !== 'string' || typeof scope.instanceKey !== 'string' || scope.instanceKey.length === 0) {
                throw new HostBoundaryError('HOST_SUBSCRIPTION_MALFORMED', 'a latest observer requires {appId, instanceKey}');
            }
            const principal = await authenticate(credential);
            if (scope.appId !== principal.appId) {
                throw new HostBoundaryError('HOST_SCOPE_DENIED', `observer scope app ${scope.appId} does not match the authenticated principal app ${principal.appId}`);
            }
            const app = requireApp(scope.appId, principal);
            const retained = requireRetainedProjection(app);
            const workflowInstanceId = app.ops.workflowInstanceId(principal, scope.instanceKey);
            // ---- The HF17 reconnect contract, and nothing more: ONE Query
            // latest opens the session, then a NEW non-durable subscription. No
            // cursor, no offset, no replay — occurrences landing between the
            // query and this subscription (or while unsubscribed) are gone by
            // contract; the next session's Query latest observes their effect.
            const latest = await app.ops.queryInstance(principal, scope.instanceKey);
            let observerStatus = 'live';
            // Per-session serialized flush lane: epoch/observation/delivery order
            // can never interleave, and the coalescing input stays bounded.
            let lane = Promise.resolve();
            let epoch = 0;
            let coalesced;
            let lastDeliveredRevision;
            function stopWith(next) {
                observerStatus = next;
                try {
                    unsubscribeFacade();
                }
                catch {
                    // A facade teardown failure never resurrects a stopped session.
                }
            }
            const unsubscribeFacade = app.ops.observeReceipts((receipt) => {
                if (observerStatus !== 'live')
                    return;
                const occurrence = receipt?.occurrence;
                if (occurrence?.workflowInstanceId !== workflowInstanceId)
                    return;
                lane = lane.then(async () => {
                    if (observerStatus !== 'live')
                        return;
                    try {
                        // Currentness/revocation lease: the grant is re-verified on
                        // EVERY delivery; an invalidated subscriber stops receiving.
                        await authenticate(credential);
                    }
                    catch {
                        stopWith('credential-stopped');
                        return;
                    }
                    // G23 flush semantics: re-read the LATEST revision at flush with
                    // a bounded observer-read retry; a persistently failing read
                    // stops the session fail-closed (no unbounded retry loop).
                    let snapshot;
                    try {
                        let attempt = 0;
                        for (;; attempt += 1) {
                            try {
                                snapshot = await app.ops.queryInstance(principal, scope.instanceKey);
                                break;
                            }
                            catch (error) {
                                if (attempt >= 2)
                                    throw error;
                            }
                        }
                    }
                    catch {
                        stopWith('read-failed');
                        return;
                    }
                    if (observerStatus !== 'live' || snapshot === null || typeof snapshot !== 'object')
                        return;
                    const revision = snapshotRevisionOf(snapshot);
                    epoch += 1;
                    // Incremental coalescing through the sealed S projection: the
                    // session's accumulated latest plus the new observation collapse
                    // to the newest monotonic epoch (same-subject duplicates die
                    // here), keeping the S input bounded for the session's lifetime.
                    let newest;
                    try {
                        const projected = retained.coalesceObservations(coalesced === undefined ? [{ subscriptionId: workflowInstanceId, revision, epoch }] : [coalesced, { subscriptionId: workflowInstanceId, revision, epoch }]);
                        newest = projected.observations?.find((observation) => observation.subscriptionId === workflowInstanceId);
                    }
                    catch {
                        // A coalescing refusal is a projection-staleness signal (e.g. a
                        // reordered epoch); the session stops fail-closed.
                        stopWith('read-failed');
                        return;
                    }
                    if (newest === undefined) {
                        stopWith('read-failed');
                        return;
                    }
                    coalesced = newest;
                    if (newest.revision === lastDeliveredRevision)
                        return; // coalesced away
                    // Bounded listener retry (G23): one immediate retry, then the
                    // session stops — a failing consumer never loops the Host.
                    let delivered = false;
                    for (let attempt = 0; !delivered; attempt += 1) {
                        try {
                            listener({ revision: newest.revision, snapshot });
                            delivered = true;
                        }
                        catch {
                            if (attempt >= 1) {
                                stopWith('listener-failed');
                                return;
                            }
                        }
                    }
                    lastDeliveredRevision = newest.revision;
                }).catch(() => {
                    // The lane never rejects: every failure path stops the session.
                });
            });
            return Object.freeze({
                latest,
                status: () => observerStatus,
                unsubscribe: () => {
                    if (observerStatus === 'live')
                        stopWith('closed');
                },
            });
        },
        async queryAgentTools(credential, request) {
            if (typeof request !== 'object' || request === null || typeof request.appId !== 'string' || request.appId.length === 0) {
                throw new HostBoundaryError('HOST_AGENT_TOOLS_MALFORMED', 'queryAgentTools requires a non-empty appId');
            }
            const principal = await authenticate(credential);
            const app = requireApp(request.appId, principal);
            const retained = requireRetainedProjection(app);
            const surface = app.ops.describeOperationSurface(principal);
            // OperationCall binds the COMPOSITE (capabilityId, operationId), so
            // project each BUILD-sealed capability independently: unrelated
            // capability packages may legitimately reuse the same operationId.
            // The sealed S projection remains the sole read-only eligibility
            // interpreter and still refuses duplicates WITHIN one capability.
            const byCapability = new Map();
            for (const descriptor of surface) {
                const group = byCapability.get(descriptor.capabilityId) ?? [];
                group.push(descriptor);
                byCapability.set(descriptor.capabilityId, group);
            }
            const tools = [];
            let projectionAuthority = 'projection-only';
            for (const [capabilityId, descriptors] of byCapability) {
                const projection = retained.projectAgentTools(descriptors.map((descriptor) => ({
                    operationId: descriptor.operationId,
                    agentExposed: descriptor.agentExposed,
                    effectClass: descriptor.effectClass,
                })));
                if (typeof projection.authority === 'string')
                    projectionAuthority = projection.authority;
                // Apply the same Business-bound role pick inside THIS capability.
                // An identical operationId admitted on another capability grants
                // no visibility or calling authority here.
                const admitted = new Set(descriptors.filter((descriptor) => descriptor.principalAdmitted).map((descriptor) => descriptor.operationId));
                for (const tool of projection.tools ?? []) {
                    if (!admitted.has(tool.operationId))
                        continue;
                    tools.push(Object.freeze({
                        capabilityId,
                        operationId: tool.operationId,
                        effectClass: 'none',
                        authority: typeof tool.authority === 'string' ? tool.authority : 'projection-only',
                    }));
                }
            }
            return Object.freeze({
                kind: 'agent-tool-query',
                appId: request.appId,
                tools: Object.freeze(tools),
                projectionAuthority,
            });
        },
        async activateGenesis(credential, request) {
            if (typeof request !== 'object' || request === null) {
                throw new HostBoundaryError('HOST_GENESIS_MALFORMED', 'activateGenesis requires {appId, instanceKey}');
            }
            const principal = await authenticate(credential);
            const app = requireApp(request.appId, principal);
            const authorized = app.genesisRoles.some((role) => principal.roles.includes(role));
            if (!authorized) {
                throw new HostBoundaryError('HOST_GENESIS_ROLE_DENIED', `authenticated principal (subject ${principal.subject}, roles [${principal.roles.join(', ')}]) holds none of the host-configured genesis roles [${app.genesisRoles.join(', ')}] for app ${app.appId}`);
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
export function kernelReceiptAsHostEvent(tenantId, appId, instanceKey, receipt, emittedAt) {
    return Object.freeze({
        tenantId,
        appId,
        instanceKey,
        topic: 'kernel-receipt',
        payload: JSON.parse(JSON.stringify(receipt)),
        emittedAt,
    });
}
//# sourceMappingURL=kernel-gateway.js.map