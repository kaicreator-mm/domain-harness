/** Upper bound on one explicit queryMany call; fail closed above it. */
export const MAX_QUERY_MANY_SELECTORS = 32;
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
/**
 * Bounded snapshot of ONE explicit queryMany selector. A malformed entry is
 * isolated to its own result: it never aborts the other requested targets.
 */
function manySelector(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const candidate = raw;
    const workflowId = candidate.workflowId;
    const instanceKey = candidate.instanceKey;
    const businessPackageId = candidate.businessPackageId;
    if (typeof workflowId !== 'string' || workflowId.length === 0 || workflowId.length > 512)
        return null;
    if (typeof instanceKey !== 'string' || instanceKey.length === 0 || instanceKey.length > 512)
        return null;
    if (businessPackageId !== undefined
        && (typeof businessPackageId !== 'string' || businessPackageId.length === 0 || businessPackageId.length > 512))
        return null;
    return businessPackageId === undefined
        ? { workflowId, instanceKey }
        : { workflowId, instanceKey, businessPackageId };
}
function refused(index, code, message) {
    return Object.freeze({ status: 'refused', index, code, message });
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
    /**
     * Explicit multi-target variant: every requested selector is authorized and
     * read INDEPENDENTLY, and results are correlated to the input position. A
     * malformed selector, denied/hidden target, authorization fault or physical
     * read fault is reported only for its own entry; the remaining entries still
     * answer. There is deliberately no cross-B transaction, rollback or
     * all-or-nothing assumption: earlier entries are never revoked because a
     * later one failed. Enumeration and denial shapes match `query`, so a hidden
     * B remains indistinguishable from an absent one.
     */
    async queryMany(selectors) {
        if (!Array.isArray(selectors)
            || selectors.length === 0
            || selectors.length > MAX_QUERY_MANY_SELECTORS) {
            reject('QUERY_SELECTORS_INVALID', 'queryMany requires a non-empty explicit array of at most ' + String(MAX_QUERY_MANY_SELECTORS) + ' selectors');
        }
        const results = [];
        for (let index = 0; index < selectors.length; index += 1) {
            results.push(await this.#queryManyOne(selectors[index], index));
        }
        return Object.freeze(results);
    }
    async #queryManyOne(raw, index) {
        const selector = manySelector(raw);
        if (selector === null) {
            // One generic message for every malformed field: the refusal itself
            // must not become a shape oracle.
            return refused(index, 'QUERY_SELECTOR_INVALID', 'query selector is invalid');
        }
        // All candidates are BUILD-selected identities; no physical K lookup
        // happens during enumeration, and unselected B identities are invisible.
        const visible = [];
        for (const route of this.#routes) {
            if (route.workflowId !== selector.workflowId
                || (selector.businessPackageId !== undefined && route.businessPackageId !== selector.businessPackageId))
                continue;
            const target = Object.freeze({
                ...this.#host.deployment,
                businessPackageId: route.businessPackageId,
                workflowId: selector.workflowId,
                instanceKey: selector.instanceKey,
            });
            let authorized;
            try {
                authorized = await this.#authorized(target);
            }
            catch {
                return refused(index, 'QUERY_AUTHORIZATION_UNAVAILABLE', 'cannot verify scoped query authorization');
            }
            if (authorized)
                visible.push(target);
        }
        // Denied/unselected/absent all collapse into one non-oracle result for
        // THIS entry only.
        if (visible.length === 0)
            return refused(index, 'QUERY_NOT_FOUND', 'no visible query target');
        if (visible.length !== 1) {
            return refused(index, 'QUERY_AMBIGUOUS', 'multiple visible Business targets; specify businessPackageId');
        }
        const target = visible[0];
        // Recheck authorization immediately before this entry's only read.
        try {
            if (!await this.#authorized(target))
                return refused(index, 'QUERY_NOT_FOUND', 'no visible query target');
        }
        catch {
            return refused(index, 'QUERY_AUTHORIZATION_UNAVAILABLE', 'cannot verify scoped query authorization');
        }
        let snapshot;
        try {
            snapshot = await this.#host.readSnapshot(target);
        }
        catch {
            return refused(index, 'QUERY_READ_FAILED', 'the scoped snapshot reader failed');
        }
        if (snapshot === null || snapshot === undefined) {
            return refused(index, 'QUERY_NOT_FOUND', 'no visible query target');
        }
        return Object.freeze({ status: 'answered', index, target, snapshot });
    }
}
export function createV10AuthorizedMultiBQuery(host) {
    return new V10AuthorizedMultiBQuery(host);
}
//# sourceMappingURL=v010-authorized-multib-query.js.map