/**
 * Domain App session composition (DIS Runtime 0.11.0-dev.2 I0, issue #1543).
 *
 * Thin glue over A1 (#1541) and A2 (#1542): one App session whose READY gate
 * admits selected no-effect Function invocations through the A2 channel.
 * This module adds NO mechanism of its own — lifecycle semantics (states,
 * one-shot init, reverse best-effort cleanup) live entirely in the A1
 * session; invocation semantics (own-key bindings, effect gate, input
 * validation, bounded execution) live entirely in the A2 invoker. There is
 * no second Kernel, no second State engine and no new Provider gateway
 * (CV-05/06/07/11).
 *
 * `invoke` is gated by the session's READY state through A1's `run()`: any
 * call before `start()`, after `stop()` or during a transitional/terminal
 * state rejects (as a rejected Promise) without reaching the invoker, and an
 * invocation failure never changes the session state — the session stays
 * cleanly stoppable.
 */
import {
  createAppSession,
  type AppLifecycleStep,
  type AppSession,
  type AppSessionDisposeMode,
  type AppSessionObservation,
  type AppSessionStartResult,
  type AppSessionStopResult,
} from './app-init/index.js';
import type {
  FunctionCallOutcome,
  FunctionInvokeRequest,
  FunctionInvoker,
} from './function-call/invoker.js';

/** A1 lifecycle steps plus the A2 invocation channel, in one composition. */
export interface DomainAppConfig {
  /** Ordered Package init steps; may be empty (Basic App). */
  readonly packages?: readonly AppLifecycleStep[];
  /** The single explicitly selected App Init step. */
  readonly app: AppLifecycleStep;
  /** Dispose mode forwarded to the A1 session; defaults to 'single-shot'. */
  readonly disposeMode?: AppSessionDisposeMode;
  /** The A2 channel for selected no-effect Functions. */
  readonly invoker: FunctionInvoker;
}

/** The composed Domain App: A1 session gate + A2 selected-Function calls. */
export interface DomainApp {
  // The raw FunctionInvoker is intentionally not part of this public view.
  // Callers must pass through invoke(), which enforces A1's READY gate.
  observe(): Readonly<AppSessionObservation>;
  start(): Promise<AppSessionStartResult>;
  /**
   * READY-gated invocation: rejects as a rejected Promise unless the session
   * is READY (A1 `run()` gate); call failures never change session state.
   */
  invoke(request: FunctionInvokeRequest): Promise<FunctionCallOutcome>;
  stop(): Promise<AppSessionStopResult>;
}

/**
 * Create one Domain App session: an A1 lifecycle over the selected
 * composition plus the A2 invocation channel, invoked only while READY.
 */
export function createDomainAppSession(config: DomainAppConfig): DomainApp {
  if (!config || typeof config !== 'object') throw new TypeError('config required');
  const invoker = config.invoker;
  if (!invoker || typeof invoker !== 'object' || typeof invoker.invoke !== 'function') {
    throw new TypeError('config.invoker: a FunctionInvoker is required');
  }
  const session: AppSession = createAppSession(config.disposeMode === undefined
    ? { packages: config.packages ?? [], app: config.app }
    : { packages: config.packages ?? [], app: config.app, disposeMode: config.disposeMode });
  return Object.freeze({
    observe: (): Readonly<AppSessionObservation> => session.observe(),
    start: () => session.start(),
    // async so the A1 synchronous READY-gate rejection surfaces uniformly as
    // a rejected Promise for awaiting callers.
    invoke: async (request: FunctionInvokeRequest): Promise<FunctionCallOutcome> =>
      session.run(() => invoker.invoke(request)),
    stop: () => session.stop(),
  });
}
