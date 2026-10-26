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
 *   - `subscribe(selector, listener)` — [v0.10.2 T06b #1326 / L2 §8] the
 *     live subscription seam: the exact query preconditions and the same
 *     multi-B target resolution, then asynchronous delivery of the frozen
 *     T06a projection (`{kind, occurrenceId, target, snapshot?}`) through
 *     the per-activation registry and its authorize/re-check pump;
 *   - `stop()` — idempotent explicit teardown (every subscription inactive,
 *     queues cleared, before the reverse disposal).
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
import {
  V10Error,
  V10ActivationError,
  V10BuildError,
  V10ExternalEffectError,
} from '@kaicreator/domain-harness-contracts';
import type {
  V10BuiltApp,
  V10DocStore,
  V10PublicIntent,
  V10QueryAuthority,
  V10ScopedSnapshotAnswer,
  V10ScopedSnapshotManyAnswer,
  V10ScopedSnapshotQuery,
} from '@kaicreator/domain-harness-contracts';
import { activateV10App } from './internal/activation.js';
import type { V10Activation } from './internal/activation.js';
import { V10MultiBQueryError } from './internal/multib-query.js';

/** The frozen public load options: no `counters` (L2 §3). */
export interface LoadAppOptions {
  readonly store: V10DocStore;
  readonly tenantId?: string;
  readonly deploymentIdentity?: {
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
  };
  readonly queryAuthority?: V10QueryAuthority;
  readonly deploymentRoot?: string;
  readonly now?: () => number;
}

/**
 * The frozen public event projection of L2 §8 (the T06a shape, delivered
 * live by the T06b registry/pump): `kind` is the receipt status,
 * `occurrenceId` its occurrence message id, `target` the authorized scoped
 * query tuple, `snapshot` only with same-revision query evidence.
 */
export interface V10ScopedSubscriptionEvent {
  readonly kind: string;
  readonly occurrenceId: string;
  readonly target: Readonly<Record<string, unknown>>;
  readonly snapshot?: unknown;
}

export interface V10Subscription {
  unsubscribe(): void;
}

export interface DomainApp {
  send(intent: V10PublicIntent): Promise<Record<string, unknown>>;
  query(selector: V10ScopedSnapshotQuery): Promise<V10ScopedSnapshotAnswer>;
  query(selectors: readonly V10ScopedSnapshotQuery[]): Promise<readonly V10ScopedSnapshotManyAnswer[]>;
  subscribe(
    selector: V10ScopedSnapshotQuery,
    listener: (event: V10ScopedSubscriptionEvent) => void,
  ): Promise<V10Subscription>;
  stop(): void;
}

/** K document keys, K key grammar and absolute Host paths never cross the entry. */
const FORBIDDEN_MESSAGE_PATTERNS: readonly RegExp[] = [
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
function publicError(error: unknown, untypedCode: string): V10Error | V10MultiBQueryError {
  // This fallback must depend only on a trusted call-site code: even reading
  // properties of a forged Error/Proxy may throw with sensitive diagnostics.
  const safeFallback = (): V10Error =>
    new V10Error(untypedCode, 'the public facade refused an internal Host failure');
  try {
    if (!(error instanceof V10Error) && !(error instanceof V10MultiBQueryError)) {
      return safeFallback();
    }

    // Inspect ONLY own data descriptors. Accessors and throwing Proxy traps
    // are not evaluated, and any unsafe shape fails closed to a fixed reply.
    const ownData = (value: object, key: string): unknown => {
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
    const proto: unknown = Object.getPrototypeOf(error);
    if (proto === V10MultiBQueryError.prototype) return new V10MultiBQueryError(code, message);
    if (proto === V10ExternalEffectError.prototype) return new V10ExternalEffectError(code, message);
    if (proto === V10ActivationError.prototype) return new V10ActivationError(code, message);
    if (proto === V10BuildError.prototype) return new V10BuildError(code, message);
    if (proto === V10Error.prototype) return new V10Error(code, message);

    // Historical deployment subclasses are untrusted as constructors; only
    // their frozen *wire name* and an own, plain-data boolean may be copied.
    const safe = new V10Error(code, message);
    if (error instanceof V10Error && ownData(error, 'name') === 'V10DeploymentError') {
      safe.name = 'V10DeploymentError';
      const detailDescriptor = Object.getOwnPropertyDescriptor(error, 'detail');
      if (detailDescriptor !== undefined) {
        if (!Object.hasOwn(detailDescriptor, 'value')) return safeFallback();
        const detail = detailDescriptor.value as unknown;
        if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
          return safe;
        }
        const detailProto: unknown = Object.getPrototypeOf(detail);
        if (detailProto !== Object.prototype && detailProto !== null) return safeFallback();
        const retryableDescriptor = Object.getOwnPropertyDescriptor(detail, 'retryable');
        if (retryableDescriptor !== undefined) {
          if (!Object.hasOwn(retryableDescriptor, 'value')) return safeFallback();
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
  } catch {
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
export async function load(app: V10BuiltApp, options: LoadAppOptions): Promise<DomainApp> {
  let activation: V10Activation;
  try {
    activation = await activateV10App(app, options);
  } catch (error) {
    throw publicError(error, 'V10_APP_INVALID');
  }
  const facade = activation.facade;
  let stopped = false;

  const assertNotStopped = (): void => {
    if (stopped || facade.isClosed()) {
      throw new V10ActivationError('FACADE_CLOSED', 'the v0.10 App facade is closed; no further K activity can start');
    }
  };

  const domainApp: DomainApp = {
    send: async (intent: V10PublicIntent): Promise<Record<string, unknown>> => {
      try {
        return await facade.send(intent);
      } catch (error) {
        throw publicError(error, 'HOST_DOC_READ_FAILED');
      }
    },
    query: (async (
      selectorOrSelectors: unknown,
    ): Promise<V10ScopedSnapshotAnswer | readonly V10ScopedSnapshotManyAnswer[]> => {
      try {
        const run = Array.isArray(selectorOrSelectors)
          ? facade.queryManyScopedSnapshots(selectorOrSelectors as readonly V10ScopedSnapshotQuery[])
          : facade.queryScopedSnapshot(selectorOrSelectors as V10ScopedSnapshotQuery);
        return await run;
      } catch (error) {
        throw publicError(error, 'QUERY_READ_FAILED');
      }
    }) as DomainApp['query'],
    subscribe: async (
      selector: V10ScopedSnapshotQuery,
      listener: (event: V10ScopedSubscriptionEvent) => void,
    ): Promise<V10Subscription> => {
      assertNotStopped();
      if (typeof listener !== 'function') {
        throw new V10ActivationError('V10_ACTIVATION_OPTIONS_INVALID', 'subscribe requires a listener function');
      }
      // The exact scoped-query preconditions of L2 §8 (open facade, Host
      // query authority, K02 deployment identity — same typed refusals as
      // query), plus the explicit selector shape. Real projected delivery
      // is T06b (#1326): the facade resolves + authorizes the exact target
      // through the same multi-B selector and registers the live pump.
      if (selector === null || typeof selector !== 'object' || Array.isArray(selector)
        || typeof (selector as unknown as Record<string, unknown>).workflowId !== 'string'
        || typeof (selector as unknown as Record<string, unknown>).instanceKey !== 'string') {
        throw new V10ActivationError('QUERY_SELECTOR_INVALID', 'subscribe requires an explicit workflow and instance');
      }
      try {
        return await facade.subscribe(selector, (event): void => {
          listener(event);
        });
      } catch (error) {
        throw publicError(error, 'QUERY_READ_FAILED');
      }
    },
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      // facade.close() first: every subscription inactive, registry and
      // queues cleared BEFORE the reverse advisory disposal (L2 §8).
      activation.dispose();
    },
  };
  return Object.freeze(domainApp);
}
