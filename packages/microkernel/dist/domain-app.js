/**
 * DomainHarness v0.10.2 T04 (#1324) — the public Microkernel Facade.
 * =====================================================================
 *
 * `load(app, options)` consumes the ALREADY-TRUSTED prebuilt App
 * (`V10BuiltApp` plain data produced by the canonical BUILD package) and
 * returns one frozen `DomainApp` facade over the governed activation:
 *
 *   - `send(intent)` — one public intent through the sealed route and the
 *     real kernel admission path; the K original receipt is returned as is;
 *   - `query(selector | selectors[])` — the authorized explicit scoped
 *     snapshot query (single or correlated multi-target);
 *   - `subscribe(selector, listener)` — the frozen §8 SHAPE only at this
 *     pin: the exact query preconditions are enforced and the registration
 *     is accepted, but real (asynchronous, projected, frozen-copy) delivery
 *     belongs to T06b and is NOT claimed here — no listener ever fires;
 *   - `stop()` — idempotent explicit teardown.
 *
 * The wrapper adds no authority of its own and hides every internal
 * surface (counters, docs port, effect gate, import-hook registry): the
 * returned object's own keys are exactly [send, query, subscribe, stop],
 * frozen. Typed errors crossing this boundary are REBUILT as fresh
 * same-class Contracts instances carrying exactly `name`, `code` and a safe
 * `message` (`cause` and every extra own property of the thrown instance
 * never cross); a message that would leak K document keys, K key grammar or
 * absolute Host paths is redacted to its code-only form (frozen redaction
 * rule, L2 §3 / O10).
 */
import { V10Error, V10ActivationError, V10BuildError, V10ExternalEffectError, } from '@kaicreator/domain-harness-contracts';
import { activateV10App } from './internal/activation.js';
import { V10MultiBQueryError } from './internal/multib-query.js';
/** K document keys, K key grammar and absolute Host paths never cross the entry. */
const FORBIDDEN_MESSAGE_PATTERNS = [
    /v08-kernel:/u,
    /v010-k02:/u,
    /v10\/k\//u,
    /(?:[A-Za-z]:[\\/]|\/(?:home|Users|root|tmp|var)\/)/u,
];
/**
 * Only explicitly trusted code constructors cross the public error boundary.
 * A Host error's prototype, cause, constructor, hidden fields, and message are
 * not an authority source for picking executable constructors.
 */
function publicError(error, untypedCode) {
    // This fallback must depend only on a trusted call-site code: even reading
    // properties of a forged Error/Proxy may throw with sensitive diagnostics.
    const safeFallback = () => new V10Error(untypedCode, 'the public facade refused an internal Host failure');
    try {
        if (!(error instanceof V10Error) && !(error instanceof V10MultiBQueryError)) {
            return safeFallback();
        }
        // Inspect ONLY own data descriptors. Accessors and throwing Proxy traps
        // are not evaluated, and any unsafe shape fails closed to a fixed reply.
        const ownData = (value, key) => {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
                throw new TypeError('not a trusted plain error data field');
            }
            return descriptor.value;
        };
        const rawCode = ownData(error, 'code');
        const rawMessage = ownData(error, 'message');
        if (typeof rawCode !== 'string' || typeof rawMessage !== 'string') {
            return safeFallback();
        }
        const code = rawCode;
        const message = FORBIDDEN_MESSAGE_PATTERNS.some((pattern) => pattern.test(rawMessage))
            ? `[${code}] the public facade refused this operation; protected diagnostic omitted`
            : rawMessage;
        // Never execute a Host-subclass constructor. The prototype is compared by
        // object identity only, inside this catch-all inspection boundary.
        const proto = Object.getPrototypeOf(error);
        if (proto === V10MultiBQueryError.prototype)
            return new V10MultiBQueryError(code, message);
        if (proto === V10ExternalEffectError.prototype)
            return new V10ExternalEffectError(code, message);
        if (proto === V10ActivationError.prototype)
            return new V10ActivationError(code, message);
        if (proto === V10BuildError.prototype)
            return new V10BuildError(code, message);
        if (proto === V10Error.prototype)
            return new V10Error(code, message);
        // Historical deployment subclasses are untrusted as constructors; only
        // their frozen *wire name* and an own, plain-data boolean may be copied.
        const safe = new V10Error(code, message);
        if (error instanceof V10Error && ownData(error, 'name') === 'V10DeploymentError') {
            safe.name = 'V10DeploymentError';
            const detailDescriptor = Object.getOwnPropertyDescriptor(error, 'detail');
            if (detailDescriptor !== undefined) {
                if (!Object.hasOwn(detailDescriptor, 'value'))
                    return safeFallback();
                const detail = detailDescriptor.value;
                if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
                    return safe;
                }
                const detailProto = Object.getPrototypeOf(detail);
                if (detailProto !== Object.prototype && detailProto !== null)
                    return safeFallback();
                const retryableDescriptor = Object.getOwnPropertyDescriptor(detail, 'retryable');
                if (retryableDescriptor !== undefined) {
                    if (!Object.hasOwn(retryableDescriptor, 'value'))
                        return safeFallback();
                    if (typeof retryableDescriptor.value === 'boolean') {
                        Object.defineProperty(safe, 'detail', {
                            value: Object.freeze({ retryable: retryableDescriptor.value }),
                            enumerable: true, writable: false, configurable: false,
                        });
                    }
                }
            }
        }
        return safe;
    }
    catch {
        // Never forward the inspection failure itself, even when it was raised by
        // a hostile getter or Proxy: it can contain arbitrary paths/credentials.
        return safeFallback();
    }
}
/**
 * Load one trusted prebuilt App and return the frozen public Facade.
 * The activation's structural plain-data refusals (typed, Contracts error
 * identity) cross unchanged except for message redaction.
 */
export async function load(app, options) {
    let activation;
    try {
        activation = await activateV10App(app, options);
    }
    catch (error) {
        throw publicError(error, 'V10_APP_INVALID');
    }
    const facade = activation.facade;
    const subscriptions = new Map();
    let nextSubscriptionId = 1;
    let stopped = false;
    const assertNotStopped = () => {
        if (stopped || facade.isClosed()) {
            throw new V10ActivationError('FACADE_CLOSED', 'the v0.10 App facade is closed; no further K activity can start');
        }
    };
    const domainApp = {
        send: async (intent) => {
            try {
                return await facade.send(intent);
            }
            catch (error) {
                throw publicError(error, 'HOST_DOC_READ_FAILED');
            }
        },
        query: (async (selectorOrSelectors) => {
            try {
                const run = Array.isArray(selectorOrSelectors)
                    ? facade.queryManyScopedSnapshots(selectorOrSelectors)
                    : facade.queryScopedSnapshot(selectorOrSelectors);
                return await run;
            }
            catch (error) {
                throw publicError(error, 'QUERY_READ_FAILED');
            }
        }),
        subscribe: async (selector, listener) => {
            assertNotStopped();
            if (typeof listener !== 'function') {
                throw new V10ActivationError('V10_ACTIVATION_OPTIONS_INVALID', 'subscribe requires a listener function');
            }
            // The exact scoped-query preconditions of L2 §8 (open facade, Host
            // query authority, K02 deployment identity — same typed refusals as
            // query), plus the explicit selector shape. Real projected delivery
            // is T06b and never claimed here: the registration is accepted and
            // simply never fires at this pin.
            if (selector === null || typeof selector !== 'object' || Array.isArray(selector)
                || typeof selector.workflowId !== 'string'
                || typeof selector.instanceKey !== 'string') {
                throw new V10ActivationError('QUERY_SELECTOR_INVALID', 'subscribe requires an explicit workflow and instance');
            }
            try {
                facade.assertQueryPreconditions();
            }
            catch (error) {
                throw publicError(error, 'QUERY_AUTHORIZATION_UNAVAILABLE');
            }
            const id = nextSubscriptionId;
            nextSubscriptionId += 1;
            const subscription = {
                unsubscribe: () => {
                    subscriptions.delete(id);
                },
            };
            subscriptions.set(id, subscription);
            return subscription;
        },
        stop: () => {
            if (stopped)
                return;
            stopped = true;
            for (const subscription of subscriptions.values())
                subscription.unsubscribe();
            subscriptions.clear();
            activation.dispose();
        },
    };
    return Object.freeze(domainApp);
}
