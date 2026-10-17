/**
 * v0.9 #1120: internal, per-activated-facade subscription/stop lifecycle.
 *
 * This is not a public constructor or an observer-driven authorization hook.
 * The ONE protected H→K bridge supplies every port from its trusted bootstrap:
 * - authorize() re-authenticates a current caller at each purpose (D03);
 * - recheckDeliveryAuthorization() consults #1129's CURRENT shared CAS record;
 * - observeSelectedReceipts() is the physically selected Kernel receipt source;
 * - dispose() is the trusted per-facade resource shutdown.
 *
 * Receipt material never bypasses H. In particular, a subscription made
 * while authorized does not authorize later deliveries: every delivery checks
 * the current Host principal AND the current recorded one-shot permit.
 * If either becomes stale, the callback never runs. The async queue checks
 * the stopped/unsubscribed generation again AFTER both awaited checks.
 *
 * This does not itself wire a real Kernel receipt producer into #1129.
 */
import { DomainHarnessV9Error, V9_PUBLIC_ERROR_CODES } from '../public-v9/errors.js';
import type { V9PublicSubscription } from '../public-v9/contracts.js';

const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const MAX_SUBSCRIPTIONS = 128;

type V09LifecyclePurpose = 'subscribe' | 'delivery' | 'stop';

/** The trusted K→H event envelope; never a user-provided observer argument. */
export interface V09SelectedReceipt {
  readonly subjectDigest: string;
  readonly appId: string;
  readonly tenantId: string;
  readonly permitDigest: string;
  /** Only the selected Kernel's redacted public receipt, never H metadata. */
  readonly receipt: unknown;
}

export interface V09ScopedLifecyclePorts {
  readonly subjectDigest: string;
  readonly appId: string;
  readonly tenantId: string;
  /** Trusted Host principal/currentness authority; not a caller callback. */
  authorize(purpose: V09LifecyclePurpose): Promise<void>;
  /** #1129 protected current subject-authority CAS read. */
  recheckDeliveryAuthorization(subjectDigest: string, permitDigest: string): Promise<{ readonly decision: 'authorized' }>;
  /** Selected Kernel-only producer; its unsubscribe may need async cleanup. */
  observeSelectedReceipts(listener: (receipt: V09SelectedReceipt) => void): Promise<() => void | Promise<void>>;
  /** Trusted shutdown for resources belonging to exactly this facade. */
  dispose(): Promise<void>;
}

interface SubscriptionState {
  active: boolean;
  detach: () => void | Promise<void>;
  /** Pending authorization must not outlive unsubscribe or stop. */
  tail: Promise<void>;
}

function lifecycleError(): DomainHarnessV9Error {
  return new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
}

function isTrustedEnvelope(v: unknown): v is V09SelectedReceipt {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const event = v as Partial<V09SelectedReceipt>;
  return typeof event.subjectDigest === 'string' && HEX64.test(event.subjectDigest)
    && typeof event.permitDigest === 'string' && HEX64.test(event.permitDigest)
    && typeof event.appId === 'string' && ID.test(event.appId)
    && typeof event.tenantId === 'string' && ID.test(event.tenantId)
    && Object.hasOwn(event, 'receipt');
}

/**
 * Bind one trusted activated (subject, app, tenant) lifecycle.
 * This object is H-private; the public facade receives only subscribe/stop.
 */
export function createV09ScopedLifecycle(ports: V09ScopedLifecyclePorts) {
  if (typeof ports !== 'object' || ports === null
    || typeof ports.subjectDigest !== 'string' || !HEX64.test(ports.subjectDigest)
    || typeof ports.appId !== 'string' || !ID.test(ports.appId)
    || typeof ports.tenantId !== 'string' || !ID.test(ports.tenantId)
    || typeof ports.authorize !== 'function'
    || typeof ports.recheckDeliveryAuthorization !== 'function'
    || typeof ports.observeSelectedReceipts !== 'function'
    || typeof ports.dispose !== 'function') {
    throw lifecycleError();
  }

  const subscriptions = new Set<SubscriptionState>();
  let stopped = false;
  let stopping: Promise<void> | undefined;

  async function detach(state: SubscriptionState): Promise<void> {
    if (!state.active) return;
    state.active = false;
    subscriptions.delete(state);
    await state.detach();
    // In-flight authorization promises may still resolve. The active flag
    // prevents their callback from delivering, even after detach returns.
  }

  async function subscribe(observer: (receipt: unknown) => void): Promise<V9PublicSubscription> {
    if (stopped || typeof observer !== 'function' || subscriptions.size >= MAX_SUBSCRIPTIONS) throw lifecycleError();
    try {
      await ports.authorize('subscribe');
    } catch {
      throw lifecycleError();
    }
    if (stopped) throw lifecycleError();

    const state: SubscriptionState = { active: true, detach: () => {}, tail: Promise.resolve() };
    const onReceipt = (event: V09SelectedReceipt): void => {
      if (!state.active || stopped) return;
      // Deliver in selected-K emission order. Never allow an out-of-order
      // authorization or observer exception to leak a subsequent receipt.
      state.tail = state.tail.then(async () => {
        if (!state.active || stopped || !isTrustedEnvelope(event)
          || event.subjectDigest !== ports.subjectDigest || event.appId !== ports.appId
          || event.tenantId !== ports.tenantId) return;
        try {
          await ports.authorize('delivery');
          await ports.recheckDeliveryAuthorization(ports.subjectDigest, event.permitDigest);
          if (!state.active || stopped) return; // late auth/revoke/stop race
          observer(event.receipt);
        } catch {
          // Deliberately suppress raw Host, Kernel and observer errors. A failed
          // sensitive recheck must never downgrade to an unchecked delivery.
        }
      }).catch(() => { /* no unhandled promise or privileged error leak */ });
    };

    try {
      const detachFn = await ports.observeSelectedReceipts(onReceipt);
      if (typeof detachFn !== 'function') throw lifecycleError();
      state.detach = detachFn;
      if (stopped || !state.active) {
        await detach(state);
        throw lifecycleError();
      }
      subscriptions.add(state);
    } catch {
      state.active = false;
      throw lifecycleError();
    }

    return Object.freeze({
      async unsubscribe(): Promise<void> {
        try {
          await detach(state);
        } catch {
          throw lifecycleError();
        }
      },
    });
  }

  async function stop(): Promise<void> {
    if (stopping !== undefined) return stopping;
    if (stopped) return;
    try {
      await ports.authorize('stop');
    } catch {
      throw lifecycleError();
    }
    if (stopping !== undefined) return stopping;

    // Lock synchronously on the first authorized stop; concurrent or later
    // calls reuse the same close outcome. No post-stop receipt may leak.
    stopped = true;
    const active = [...subscriptions];
    for (const state of active) {
      state.active = false;
      subscriptions.delete(state);
    }
    stopping = (async () => {
      let failures = 0;
      // Per-activation resources unwind in reverse acquisition order.
      for (const state of active.reverse()) {
        try { await state.detach(); } catch { failures += 1; }
      }
      try { await ports.dispose(); } catch { failures += 1; }
      if (failures !== 0) throw lifecycleError();
    })();
    return stopping;
  }

  return Object.freeze({ subscribe, stop });
}
