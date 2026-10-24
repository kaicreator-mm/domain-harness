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
 * The frozen event projection SHAPE of L2 §8. Real delivery (asynchronous
 * authorize/re-check pump, deep-frozen snapshot copy) is T06b; at this pin
 * `subscribe` enforces the query preconditions and registers only.
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
  const genericMessage = 'the public facade refused an internal Host failure';
  if (!(error instanceof V10Error) && !(error instanceof V10MultiBQueryError)) {
    return new V10Error(untypedCode, genericMessage);
  }
  // This is the *wire code* of a typed error; it is not an executable class.
  const code = typeof error.code === 'string' ? error.code : untypedCode;
  const message = typeof error.message === 'string'
    && !FORBIDDEN_MESSAGE_PATTERNS.some((pattern) => pattern.test(error.message))
    ? error.message
    : `[${code}] the public facade refused this operation; protected diagnostic omitted`;
  // Use exact trusted prototypes and constructors. Never evaluate
  // Object.getPrototypeOf(error).constructor or execute untrusted subclasses:
  // those may recreate secret-bearing own fields *or inherited getters*.
  const proto: unknown = Object.getPrototypeOf(error);
  if (proto === V10MultiBQueryError.prototype) {
    return new V10MultiBQueryError(code, message);
  }
  if (proto === V10ExternalEffectError.prototype) {
    return new V10ExternalEffectError(code, message);
  }
  if (proto === V10ActivationError.prototype) {
    return new V10ActivationError(code, message);
  }
  if (proto === V10BuildError.prototype) {
    return new V10BuildError(code, message);
  }
  // Preserve exact Contracts base identity for an actual base-class error.
  if (proto === V10Error.prototype) {
    return new V10Error(code, message);
  }
  // Legacy Host's deployment class does not belong to the selected
  // Microkernel's import graph. Preserve its bounded *wire name* and only
  // {retryable} data, but NOT its untrusted class/prototype identity.
  const safe = new V10Error(code, message);
  if (error instanceof V10Error && error.name === 'V10DeploymentError') {
    safe.name = 'V10DeploymentError';
    const detail = deploymentRetryableDetail(error);
    if (detail !== undefined) {
      Object.defineProperty(safe, 'detail', {
        value: detail, enumerable: true, writable: false, configurable: false,
      });
    }
  }
  return safe;
}

/** L2 §3: only deployment-named errors may keep exactly {retryable}. */
function deploymentRetryableDetail(error: V10Error): { retryable: boolean } | undefined {
  if (error.name !== 'V10DeploymentError') return undefined;
  const detail: unknown = (error as unknown as { detail?: unknown }).detail;
  if (typeof detail !== 'object' || detail === null) return undefined;
  const retryable: unknown = (detail as { retryable?: unknown }).retryable;
  return typeof retryable === 'boolean' ? { retryable } : undefined;
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
  const subscriptions = new Map<number, V10Subscription>();
  let nextSubscriptionId = 1;
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
      const run = Array.isArray(selectorOrSelectors)
        ? facade.queryManyScopedSnapshots(selectorOrSelectors as readonly V10ScopedSnapshotQuery[])
        : facade.queryScopedSnapshot(selectorOrSelectors as V10ScopedSnapshotQuery);
      try {
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
      // is T06b and never claimed here: the registration is accepted and
      // simply never fires at this pin.
      if (selector === null || typeof selector !== 'object' || Array.isArray(selector)
        || typeof (selector as unknown as Record<string, unknown>).workflowId !== 'string'
        || typeof (selector as unknown as Record<string, unknown>).instanceKey !== 'string') {
        throw new V10ActivationError('QUERY_SELECTOR_INVALID', 'subscribe requires an explicit workflow and instance');
      }
      try {
        facade.assertQueryPreconditions();
      } catch (error) {
        throw publicError(error, 'QUERY_AUTHORIZATION_UNAVAILABLE');
      }
      const id = nextSubscriptionId;
      nextSubscriptionId += 1;
      const subscription: V10Subscription = {
        unsubscribe: (): void => {
          subscriptions.delete(id);
        },
      };
      subscriptions.set(id, subscription);
      return subscription;
    },
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      for (const subscription of subscriptions.values()) subscription.unsubscribe();
      subscriptions.clear();
      activation.dispose();
    },
  };
  return Object.freeze(domainApp);
}
