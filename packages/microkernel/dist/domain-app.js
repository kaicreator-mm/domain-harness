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
 * frozen. Typed errors crossing this boundary keep their Contracts class
 * identity, `name` and stable wire `code`; a `message` that would leak K
 * document keys, K key grammar or absolute Host paths is redacted to its
 * code-only form (frozen redaction rule, L2 §3 / O10).
 */
import { V10Error, V10ActivationError, } from '@kaicreator/domain-harness-contracts';
import { activateV10App } from './internal/activation.js';
/** K document keys, K key grammar and absolute Host paths never cross the entry. */
const FORBIDDEN_MESSAGE_PATTERNS = [
    /v08-kernel:/u,
    /v010-k02:/u,
    /v10\/k\//u,
    /(?:[A-Za-z]:[\\/]|\/(?:home|Users|root|tmp|var)\/)/u,
];
/** The public error contract (L2 §3 / O10): name, code, safe message only. */
function publicError(error) {
    if (!(error instanceof V10Error))
        return error;
    for (const pattern of FORBIDDEN_MESSAGE_PATTERNS) {
        if (pattern.test(error.message)) {
            const redacted = new error.constructor(error.code, `[${error.code}] the public facade refused this operation; the diagnostic rode a protected key or path grammar`);
            redacted.name = error.name;
            return redacted;
        }
    }
    return error;
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
        throw publicError(error);
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
                throw publicError(error);
            }
        },
        query: (async (selectorOrSelectors) => {
            const run = Array.isArray(selectorOrSelectors)
                ? facade.queryManyScopedSnapshots(selectorOrSelectors)
                : facade.queryScopedSnapshot(selectorOrSelectors);
            try {
                return await run;
            }
            catch (error) {
                throw publicError(error);
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
                throw publicError(error);
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
