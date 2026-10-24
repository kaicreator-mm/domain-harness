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
 * The public error contract (L2 §3 / O10): EVERY typed error crossing the
 * entry is rebuilt as a fresh same-class instance carrying exactly `name`,
 * `code` and a safe `message` — the thrown instance itself never crosses, so
 * its `cause`, its stack and any own property a Host callback attached to it
 * stay inside. Only the deployment family (`V10DeploymentError`, BUILD-owned
 * and unreachable by import here, hence matched by its frozen wire `name`)
 * additionally keeps a `detail`, reduced to exactly `{ retryable }` when the
 * original carried a boolean `retryable` and dropped otherwise. `code`, class
 * identity and safe messages are preserved; a message that would leak K
 * document keys, K key grammar or absolute Host paths is redacted to its
 * code-only form. The fresh instance's `stack` is the facade's own frame and
 * is not part of the contract.
 */
function publicError(error: unknown): unknown {
  if (!(error instanceof V10Error)) return error;
  const message = FORBIDDEN_MESSAGE_PATTERNS.some((pattern) => pattern.test(error.message))
    ? `[${error.code}] the public facade refused this operation; the diagnostic rode a protected key or path grammar`
    : error.message;
  // The constructor is taken from the prototype, not from the instance (a
  // forged own `constructor` must not choose what gets built), and whatever
  // it builds must still be a real Contracts V10Error — otherwise the facade
  // falls back to the base class rather than surface an arbitrary product.
  const Ctor = (Object.getPrototypeOf(error) as {
    constructor: new (code: string, message: string, detail?: { retryable: boolean }) => V10Error;
  }).constructor;
  let normalized: V10Error;
  try {
    normalized = new Ctor(error.code, message, deploymentRetryableDetail(error));
  } catch {
    normalized = new V10Error(error.code, message);
  }
  // A Host-supplied V10Error subclass can have a constructor that creates
  // fresh secret-bearing own fields even when the original instance was
  // discarded. Preserve the subtype ONLY when its new instance has exactly
  // the public own-key contract. Symbols, cause and surprise fields fall
  // back to the Contracts base class instead of crossing the facade.
  const publicKeys = new Set(['stack', 'message', 'name', 'code',
    ...(error.name === 'V10DeploymentError' ? ['detail'] : [])]);
  if (!(normalized instanceof V10Error)
    || normalized.code !== error.code
    || normalized.message !== message
    || Reflect.ownKeys(normalized).some((key) => typeof key !== 'string' || !publicKeys.has(key))) {
    normalized = new V10Error(error.code, message);
  }
  return normalized;
}

/** L2 §3: only `V10DeploymentError` may keep a `detail`, as exactly `{ retryable }`. */
function deploymentRetryableDetail(error: V10Error): { retryable: boolean } | undefined {
  if (error.name !== 'V10DeploymentError') return undefined;
  const detail = (error as unknown as { detail?: unknown }).detail;
  if (typeof detail !== 'object' || detail === null) return undefined;
  const retryable = (detail as { retryable?: unknown }).retryable;
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
    throw publicError(error);
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
        throw publicError(error);
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
        throw publicError(error);
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
        throw publicError(error);
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
