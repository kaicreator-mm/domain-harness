export class V10MultiBQueryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'V10MultiBQueryError';
    }
}
function reject(code, message) {
    throw new V10MultiBQueryError(code, message);
}
function ident(value, name) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
        reject('QUERY_SELECTOR_INVALID', name + ' must be a bounded nonempty identifier');
    }
    return value;
}
function routeId(route) {
    return JSON.stringify([route.businessPackageId, route.workflowId]);
}
/**
 * Typed array check: `Array.isArray` alone narrows to `any[]` (its builtin
 * predicate), which would silently degrade every selected route to `any`
 * after the constructor guard; this guard keeps the declared route type.
 */
function isRouteArray(value) {
    return Array.isArray(value);
}
/** Results never expose a denied or unselected Business identity. */
export class V10AuthorizedMultiBQuery {
    #host;
    #routes;
    constructor(host) {
        if (!host || typeof host.authorize !== 'function' || typeof host.readSnapshot !== 'function'
            || host.verifiedPrincipal === null || host.verifiedPrincipal === undefined
            || !host.deployment || !isRouteArray(host.selectedRoutes)) {
            reject('QUERY_HOST_INVALID', 'trusted principal, selected routes, authorization and reader required');
        }
        for (const field of ['deployedAppId', 'tenantId', 'appId']) {
            ident(host.deployment[field], 'deployment ' + field);
        }
        if (host.selectedRoutes.length > 64) {
            reject('QUERY_SELECTED_ROUTES_INVALID', 'too many selected Business routes');
        }
        const seen = new Set();
        const selected = [];
        for (const route of host.selectedRoutes) {
            if (!route || typeof route !== 'object') {
                reject('QUERY_SELECTED_ROUTES_INVALID', 'selected route must be a record');
            }
            ident(route.businessPackageId, 'selected businessPackageId');
            ident(route.workflowId, 'selected workflowId');
            const id = routeId(route);
            if (seen.has(id))
                reject('QUERY_SELECTED_ROUTES_INVALID', 'duplicate selected Business route');
            seen.add(id);
            selected.push(Object.freeze({
                businessPackageId: route.businessPackageId,
                workflowId: route.workflowId,
            }));
        }
        this.#routes = Object.freeze(selected);
        this.#host = host;
    }
    async #authorized(target) {
        try {
            return (await this.#host.authorize(this.#host.verifiedPrincipal, target)) === true;
        }
        catch {
            // Never expose authorization infrastructure exceptions or partial data.
            reject('QUERY_AUTHORIZATION_UNAVAILABLE', 'cannot verify scoped query authorization');
        }
    }
    async query(selector) {
        if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
            reject('QUERY_SELECTOR_INVALID', 'query requires an explicit workflow and instance');
        }
        const workflowId = ident(selector.workflowId, 'workflowId');
        const instanceKey = ident(selector.instanceKey, 'instanceKey');
        const businessPackageId = selector.businessPackageId === undefined
            ? undefined : ident(selector.businessPackageId, 'businessPackageId');
        // All candidates are BUILD-selected identities. No physical K lookups
        // happen during enumeration, and unselected B identities are invisible.
        const visible = [];
        for (const route of this.#routes) {
            if (route.workflowId !== workflowId
                || (businessPackageId !== undefined && route.businessPackageId !== businessPackageId))
                continue;
            const target = Object.freeze({
                ...this.#host.deployment,
                businessPackageId: route.businessPackageId,
                workflowId,
                instanceKey,
            });
            if (await this.#authorized(target))
                visible.push(target);
        }
        // Denied/unselected/absent all collapse into one non-oracle result.
        if (visible.length === 0)
            reject('QUERY_NOT_FOUND', 'no visible query target');
        // Ambiguity is determined by VISIBLE candidates only, never by storage
        // existence or the number of hidden/denied Business identities.
        if (visible.length !== 1)
            reject('QUERY_AMBIGUOUS', 'multiple visible Business targets; specify businessPackageId');
        const target = visible[0];
        // Recheck authorization immediately before the only physical read; a
        // capability revoked during prior selection must not yield a snapshot.
        if (!await this.#authorized(target))
            reject('QUERY_NOT_FOUND', 'no visible query target');
        let snapshot;
        try {
            snapshot = await this.#host.readSnapshot(target);
        }
        catch {
            reject('QUERY_READ_FAILED', 'the scoped snapshot reader failed');
        }
        if (snapshot === null || snapshot === undefined) {
            reject('QUERY_NOT_FOUND', 'no visible query target');
        }
        return { target, snapshot };
    }
}
export function createV10AuthorizedMultiBQuery(host) {
    return new V10AuthorizedMultiBQuery(host);
}
//# sourceMappingURL=v010-authorized-multib-query.js.map