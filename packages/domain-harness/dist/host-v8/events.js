/**
 * v0.8 trusted Node Host — scoped event delivery (T-E, #1004).
 * ==============================================================
 *
 * K-authorized scoped event delivery, Host side: a subscription is an
 * authenticated, tenant/app/instance-scoped grant check — and the check is
 * REPEATED ON EVERY DELIVERY (L2 B01-N5): a role revoked or a grant expired
 * between subscribe and delivery never receives the event.
 *
 * Boundary rules proven here:
 *   - a subscription can never outlive its grant (per-delivery revalidation
 *     of the presented credential — currentness + durable revocation);
 *   - a subscription can never see across its scope: cross-tenant scope is
 *     refused typed at subscribe time, and events outside the authenticated
 *     principal's tenant/app/instance are never delivered (no observer
 *     leakage, B01-N2/N6);
 *   - publishing is a HOST-context capability — the UX transport exposes no
 *     publish route at all.
 */
import { canonicalSnapshot, QualifiedPackageError } from '../public-v8/contracts.js';
import { HostBoundaryError } from './errors.js';
function scopeMatches(event, scope, principal) {
    // Hard identity bounds first: the principal's tenant/app always bound the
    // delivery, even if the scope asked for something wider.
    if (event.tenantId !== principal.tenantId || event.appId !== principal.appId)
        return false;
    if (scope.tenantId !== undefined && event.tenantId !== scope.tenantId)
        return false;
    if (scope.appId !== undefined && event.appId !== scope.appId)
        return false;
    if (scope.instanceKey !== undefined && event.instanceKey !== scope.instanceKey)
        return false;
    if (scope.topic !== undefined && event.topic !== scope.topic)
        return false;
    return true;
}
export class ScopedEventHub {
    #authenticate;
    #subscriptions = [];
    constructor(input) {
        this.#authenticate = input.authenticate;
    }
    /**
     * Host-context publish. Deliveries re-authenticate every subscriber's
     * credential (fresh clock + revocation read); an invalidated subscriber is
     * silently skipped — the publisher never learns about observers, and the
     * observer never receives an event its grant no longer covers.
     */
    async publish(event) {
        if (typeof event.tenantId !== 'string' || event.tenantId.length === 0 || typeof event.appId !== 'string' || event.appId.length === 0) {
            throw new HostBoundaryError('HOST_EVENT_MALFORMED', 'host events must carry non-empty tenantId/appId');
        }
        for (const subscription of [...this.#subscriptions]) {
            if (!subscription.active)
                continue;
            let principal;
            try {
                // Revalidate identity/currentness/revocation ON EVERY DELIVERY.
                principal = await this.#authenticate(subscription.credential);
            }
            catch {
                continue;
            }
            if (!scopeMatches(event, subscription.scope, principal))
                continue;
            subscription.listener(event);
        }
    }
    async subscribe(credential, scope, listener) {
        if (typeof listener !== 'function') {
            throw new HostBoundaryError('HOST_SUBSCRIPTION_MALFORMED', 'an event subscription requires a listener function');
        }
        let parsedScope;
        try {
            parsedScope = canonicalSnapshot(scope);
        }
        catch (error) {
            if (error instanceof QualifiedPackageError) {
                throw new HostBoundaryError('HOST_SUBSCRIPTION_MALFORMED', `subscription scope must be a plain-JSON record: ${error.message}`);
            }
            throw error;
        }
        for (const field of ['tenantId', 'appId', 'instanceKey', 'topic']) {
            const value = parsedScope[field];
            if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
                throw new HostBoundaryError('HOST_SUBSCRIPTION_MALFORMED', `subscription scope field ${field} must be a non-empty string when present`);
            }
        }
        // Authenticate ONCE at subscribe time; cross-tenant scope is refused
        // typed here (never silently filtered — the caller must learn the grant
        // does not cover the request).
        const principal = await this.#authenticate(credential);
        if (parsedScope.tenantId !== undefined && parsedScope.tenantId !== principal.tenantId) {
            throw new HostBoundaryError('HOST_SCOPE_DENIED', `subscription scope tenant ${parsedScope.tenantId} does not match the authenticated principal tenant ${principal.tenantId}`);
        }
        if (parsedScope.appId !== undefined && parsedScope.appId !== principal.appId) {
            throw new HostBoundaryError('HOST_SCOPE_DENIED', `subscription scope app ${parsedScope.appId} does not match the authenticated principal app ${principal.appId}`);
        }
        const subscription = {
            credential: credential,
            scope: parsedScope,
            listener: listener,
            active: true,
        };
        this.#subscriptions.push(subscription);
        return {
            unsubscribe: () => {
                subscription.active = false;
            },
        };
    }
    subscriptionCount() {
        return this.#subscriptions.filter((subscription) => subscription.active).length;
    }
}
//# sourceMappingURL=events.js.map