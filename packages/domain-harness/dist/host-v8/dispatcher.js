/**
 * v0.8 trusted Node Host — generic resource dispatcher (T-E, #1004).
 * ====================================================================
 *
 * The Host supplies ONLY generic physical resource dispatch with call
 * accounting and typed physical fault injection (adapted from
 * #994@b9ea4d1 src/host/memory-host.mjs `resources` port). It contains NO
 * business policy: what resources exist and what their operations do is a
 * deployment/host-context decision (provisioned at bootstrap, outside the
 * UX transport surface), never a caller capability.
 *
 * Every dispatch carries the AUTHENTICATED principal (verified credential),
 * so a resource can never mistake caller-declared user data for identity.
 *
 * #1023 S05 — the dispatcher's map keys are PHYSICAL keys. Deployment-owned
 * handlers install under their bare logical key (this module's historical
 * shape); capability-owned adapters install under the INJECTIVE composed
 * `<scopeId>\u0000<logicalKey>` entries the trusted kernel gateway provisions,
 * where the scope is minted per activation by the trusted loader. Two
 * independently approved closures binding the same logical route therefore
 * retain two distinct entries and can never cross-route. The scoped-physical
 * namespace is RESERVED against raw `call` dispatch (#1023 S05 R1 P1-01):
 * naming a composed key by its exact string — from a Business effect handler
 * whose declared route says otherwise, from an adapter-less closure's raw
 * port, or from any other raw-port caller — refuses typed, because the only
 * route into a scoped entry is the trusted per-activation `callScoped`
 * wiring that composes the caller deployment's OWN loader-minted scope.
 */
import { HostBoundaryError } from './errors.js';
/**
 * #1023 S05 R1 P1-01: the delimiter of the scoped-physical namespace. Every
 * capability-owned adapter the trusted kernel gateway provisions is retained
 * under `<scopeId>\u0000<logicalKey>`; the namespace is RESERVED against raw
 * `call` dispatch — no Business effect handler (scoped or adapter-less
 * closure alike) and no other raw-port caller can reach another deployment's
 * scoped entry by naming its exact string. The ONLY route into a scoped
 * entry is `callScoped`, composed with the caller deployment's OWN
 * loader-minted scope by the trusted per-activation port wiring (never
 * forwarded to the Kernel mechanism or any package).
 */
const SCOPED_RESOURCE_DELIMITER = '\u0000';
export class ResourceDispatcher {
    #handlers = new Map();
    #calls = [];
    #failNextResource = null;
    /**
     * Host-context retention probe (#1023 S05): the sorted PHYSICAL keys every
     * currently provisioned handler is retained under — the observable
     * registry behind "the Host registers and retains each deployment's
     * unique physical identity". Keys here are the composed
     * `<scopeId>\0<logicalKey>` entries the trusted gateway provisions
     * (capability-owned adapters) plus any deployment-owned bare keys.
     * Read-only diagnostics; never installs, never routes.
     */
    resourceKeys() {
        return [...this.#handlers.keys()].sort();
    }
    /** Host-context provisioning (deployment configuration, not caller surface). */
    provision(resourceKey, handler) {
        this.#assertProvisionableKey(resourceKey);
        if (typeof handler !== 'function') {
            throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource provisioning requires a callable handler');
        }
        if (this.#handlers.has(resourceKey)) {
            throw new HostBoundaryError('HOST_RESOURCE_PROVISIONED', `resource ${resourceKey} is already provisioned on this host`);
        }
        this.#handlers.set(resourceKey, handler);
    }
    /**
     * All-or-nothing batch provisioning (#1023 S04 R1 P1-01): every key is
     * validated — shape, freedom on this Host and uniqueness inside the batch —
     * BEFORE the first handler installs, and the installs commit in the same
     * synchronous block. A colliding or malformed batch therefore leaves ZERO
     * partial install (the bounded reversible batch the trusted gateway
     * registers app adapters through); a mid-loop throw is structurally
     * impossible because nothing can interleave between the preflight and the
     * commit inside one synchronous call.
     */
    provisionAll(entries) {
        // Runtime shape gate runs through `unknown` on purpose: narrowing a
        // readonly-array parameter with Array.isArray degrades the element type,
        // and this surface is host-context wiring input — every field is checked,
        // nothing is trusted from the declared type alone.
        const batch = entries;
        if (!Array.isArray(batch)) {
            throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'provisionAll requires an array of {resourceKey, handler} entries');
        }
        const seen = new Set();
        const validated = [];
        for (const entry of batch) {
            if (typeof entry !== 'object' || entry === null) {
                throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'provisionAll entries must be {resourceKey, handler} records');
            }
            const record = entry;
            if (typeof record.resourceKey !== 'string' || record.resourceKey.length === 0) {
                throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource keys must be non-empty strings');
            }
            if (typeof record.handler !== 'function') {
                throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', `resource ${record.resourceKey} batch provisioning requires a callable handler`);
            }
            const resourceKey = record.resourceKey;
            const handler = record.handler;
            if (seen.has(resourceKey)) {
                throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', `resource ${resourceKey} appears more than once in one provisioning batch`);
            }
            if (this.#handlers.has(resourceKey)) {
                throw new HostBoundaryError('HOST_RESOURCE_PROVISIONED', `resource ${resourceKey} is already provisioned on this host`);
            }
            seen.add(resourceKey);
            validated.push({ resourceKey, handler });
        }
        for (const { resourceKey, handler } of validated) {
            this.#handlers.set(resourceKey, handler);
        }
    }
    #assertProvisionableKey(resourceKey) {
        if (typeof resourceKey !== 'string' || resourceKey.length === 0) {
            throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource keys must be non-empty strings');
        }
    }
    /** Host-context probe: is a resource key provisioned? Never installs. */
    has(resourceKey) {
        return typeof resourceKey === 'string' && this.#handlers.has(resourceKey);
    }
    /**
     * Host-context rollback of ONE provisioning (#1023 S04 R1 P1-01): removes
     * the key's handler typed, refusing when absent. Deployment/diagnostics
     * surface only — it is never reachable from the UX transport.
     */
    unprovision(resourceKey) {
        this.#assertProvisionableKey(resourceKey);
        if (!this.#handlers.delete(resourceKey)) {
            throw new HostBoundaryError('HOST_RESOURCE_UNKNOWN', `resource ${resourceKey} is not provisioned on this host`);
        }
    }
    /** Physical resource fault: the NEXT call to resourceKey fails after accounting (KPK-06 port). */
    failNextCall(resourceKey) {
        this.#failNextResource = resourceKey;
    }
    async call(resourceKey, operation, payload, context) {
        if (typeof resourceKey !== 'string' || resourceKey.length === 0 || typeof operation !== 'string' || operation.length === 0) {
            throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource dispatch requires non-empty resourceKey and operation strings');
        }
        // #1023 S05 R1 P1-01: the scoped-physical namespace is reserved. A key
        // containing the delimiter is another (or this) deployment's capability
        // entry; a Business effect handler whose DECLARED route is one thing can
        // still name a different physical key in its EXECUTABLE (a declaration is
        // not proof of what the code calls), so the physical boundary itself must
        // fail closed: naming the reserved namespace through the raw port refuses
        // typed, and the refusal is accounted like any physically observed one.
        if (resourceKey.includes(SCOPED_RESOURCE_DELIMITER)) {
            this.#calls.push({
                record: {
                    resourceKey,
                    operation,
                    principalSubject: context.principal.subject,
                    principalRoles: [...context.principal.roles],
                },
                resourceKey,
                operation,
            });
            throw new HostBoundaryError('HOST_RESOURCE_NAMESPACE_RESERVED', `HOST_RESOURCE_NAMESPACE_RESERVED: resource keys containing the scoped-physical delimiter are reserved for the trusted per-activation capability port; dispatching a scoped physical key by name through the raw Host resource port is refused`);
        }
        return this.#dispatch(resourceKey, operation, payload, context);
    }
    /**
     * #1023 S05 R1 P1-01: the privileged scoped dispatch. Composes the given
     * deployment scope with the logical key and dispatches the retained
     * capability entry — the ONLY route into the reserved namespace. This
     * method exists on the physical Host boundary for the trusted bootstrap
     * port wiring; the loader's per-activation resources view calls it with
     * the scope it minted itself, and that view never forwards the member to
     * the Kernel mechanism, the Business packages or any caller (the raw ports
     * are additionally session-capability-gated in kernel-host.ts).
     */
    async callScoped(scopeId, resourceKey, operation, payload, context) {
        if (typeof scopeId !== 'string' || scopeId.length === 0 || scopeId.includes(SCOPED_RESOURCE_DELIMITER)) {
            throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'scoped resource dispatch requires a non-empty scopeId without the scoped-physical delimiter');
        }
        if (typeof resourceKey !== 'string' || resourceKey.length === 0 || typeof operation !== 'string' || operation.length === 0) {
            throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource dispatch requires non-empty resourceKey and operation strings');
        }
        return this.#dispatch(`${scopeId}${SCOPED_RESOURCE_DELIMITER}${resourceKey}`, operation, payload, context);
    }
    /** The shared physical dispatch core: accounting, fault injection, handler. */
    async #dispatch(resourceKey, operation, payload, context) {
        const handler = this.#handlers.get(resourceKey);
        if (handler === undefined) {
            // Accounting happens BEFORE any refusal: an unprovisioned dispatch is
            // still a physically observed (and refused) call.
            this.#calls.push({
                record: {
                    resourceKey,
                    operation,
                    principalSubject: context.principal.subject,
                    principalRoles: [...context.principal.roles],
                },
                resourceKey,
                operation,
            });
            throw new HostBoundaryError('HOST_RESOURCE_UNKNOWN', `host resource ${resourceKey}.${operation} is not provisioned on this host`);
        }
        this.#calls.push({
            record: {
                resourceKey,
                operation,
                principalSubject: context.principal.subject,
                principalRoles: [...context.principal.roles],
            },
            resourceKey,
            operation,
        });
        if (this.#failNextResource !== null && this.#failNextResource === resourceKey) {
            this.#failNextResource = null;
            throw new HostBoundaryError('HOST_FAULT_INJECTED', `physical resource ${resourceKey}.${operation} timed out after dispatch (uncertain outcome)`);
        }
        return handler(operation, payload, context);
    }
    /** Call accounting (diagnostics, host context only). */
    calls() {
        return this.#calls.map((entry) => entry.record);
    }
    callCount() {
        return this.#calls.length;
    }
}
//# sourceMappingURL=dispatcher.js.map