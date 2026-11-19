/**
 * Selected Domain App session lifecycle (DIS Runtime 0.11.0-dev.2 A1, issue #1541).
 *
 * Pure lifecycle tooling for an App session whose components were already
 * selected by BUILD: an ordered list of Package init callbacks, the single
 * explicitly selected App Init callback, and the corresponding dispose
 * callbacks. Nothing here discovers, hot-plugs, sandboxes or re-selects
 * components; every callback is supplied by the caller up front as plain
 * functions. No external permission, Effect surface, Host service, budget or
 * clock is taken, and no global State Engine or second Kernel is produced:
 * the state lives entirely inside the one session object created here.
 *
 * Finite state machine:
 *
 *   NEW --start--> STARTING --all inits ok--> READY --stop--> STOPPING --all disposes ok--> STOPPED
 *                     |                                         |
 *                     +--(init or cleanup dispose failure)--> FAILED <--(dispose failure)--+
 *
 * - `start()` runs the Package inits in declaration order, then the unique
 *   App Init. Only after every init completed does the session enter READY,
 *   and only READY admits upper-layer calls through `run()`.
 * - Any init failure or dispose failure moves the session to FAILED with the
 *   real error attached. Failure never leaks started resources: every step
 *   whose init completed is disposed in reverse (best-effort) order, a single
 *   throwing dispose never prevents the remaining dispose attempts, and the
 *   final result is structured (first error + dispose error list) — errors
 *   are never swallowed and partial success is never faked.
 * - Every state gate denial is a synchronous structured
 *   APP_SESSION_INVALID_STATE rejection (duplicate start, concurrent start,
 *   start after FAILED / dispose, calls in NEW / STARTING / STOPPING /
 *   STOPPED / FAILED). State transitions happen synchronously before the
 *   first await, so concurrent second callers always observe the
 *   transitional state deterministically.
 * - Dispose invocation semantics are explicit and tested in both modes:
 *   'single-shot' (default) disposes run at most once per session and a
 *   repeat `stop()` is rejected; 'idempotent' makes a repeat `stop()` after a
 *   successful STOPPED return the recorded result without re-invoking any
 *   dispose. A session is single-use in both modes: `start()` after dispose
 *   stays rejected. A FAILED session accepts neither `stop()` nor `start()`:
 *   failure cleanup already attempted its disposes, and re-running them
 *   against partially-initialized components would be dishonest.
 *
 * The module is deliberately self-contained (no runtime relative imports) so
 * the strip-types test runner can execute it directly from source; the
 * sibling index.ts exists only as the module export surface for I0 wiring.
 */

/** Every state of the App session finite state machine. */
export const APP_SESSION_STATES = ['NEW', 'STARTING', 'READY', 'STOPPING', 'STOPPED', 'FAILED'] as const;
export type AppSessionState = (typeof APP_SESSION_STATES)[number];

/** Stable machine-readable error codes; `detail` is a locator, never a contract. */
export type AppSessionErrorCode =
  | 'APP_SESSION_INVALID_STATE'
  | 'APP_SESSION_CONFIGURATION_INVALID'
  | 'APP_SESSION_INIT_FAILED'
  | 'APP_SESSION_DISPOSE_FAILED';

/** Structured lifecycle error (state gate and configuration rejections). */
export class AppSessionError extends Error {
  readonly code: AppSessionErrorCode;
  readonly detail: string;
  constructor(code: AppSessionErrorCode, detail = '') {
    super(detail === '' ? code : code + ':' + detail);
    this.name = 'AppSessionError';
    this.code = code;
    this.detail = detail;
  }
}

/** Which half of the selected composition a lifecycle step belongs to. */
export type AppSessionStepPhase = 'package' | 'app';

/**
 * One explicitly selected lifecycle step: an init callback plus its
 * corresponding dispose callback. Plain functions only — no descriptor
 * objects, no auto-discovery, no sandboxing.
 */
export interface AppLifecycleStep {
  /** Stable identifier surfaced in results, cleanup records and error lists. */
  readonly id: string;
  /** Init callback; awaited sequentially in declaration order during start. */
  readonly init: () => void | Promise<void>;
  /** Corresponding dispose callback; awaited in reverse order during teardown. */
  readonly dispose: () => void | Promise<void>;
}

/** How the session treats a repeat `stop()` after a successful STOPPED. */
export type AppSessionDisposeMode = 'single-shot' | 'idempotent';

export interface AppSessionConfig {
  /**
   * Ordered Package init steps. May be empty: a Basic App with zero Package
   * inits is a legal composition — the unique App Init still runs alone.
   */
  readonly packages: readonly AppLifecycleStep[];
  /** The single explicitly selected App Init step. Exactly one is accepted. */
  readonly app: AppLifecycleStep;
  /** Dispose mode; defaults to 'single-shot'. See module docblock. */
  readonly disposeMode?: AppSessionDisposeMode;
}

/** One lifecycle step recorded by id and composition phase. */
export interface AppSessionStepRecord {
  readonly id: string;
  readonly phase: AppSessionStepPhase;
}

/** A dispose callback that threw during teardown, with the real thrown value. */
export interface AppSessionDisposeError {
  readonly stepId: string;
  readonly phase: AppSessionStepPhase;
  readonly error: unknown;
}

export interface AppSessionStartedResult {
  readonly status: 'READY';
  /** Steps whose init completed, in init order (packages first, then app). */
  readonly started: readonly AppSessionStepRecord[];
}

export interface AppSessionStartFailedResult {
  readonly status: 'FAILED';
  readonly code: 'APP_SESSION_INIT_FAILED';
  /** The step whose init threw. */
  readonly failedStepId: string;
  readonly failedPhase: AppSessionStepPhase;
  /** The real thrown value of the first failure. Never a synthesized error. */
  readonly error: unknown;
  /** Steps whose dispose ran during failure cleanup, in dispose (reverse) order. */
  readonly disposed: readonly AppSessionStepRecord[];
  /** Dispose callbacks that threw during failure cleanup, in attempt order. */
  readonly disposeErrors: readonly AppSessionDisposeError[];
}

export type AppSessionStartResult = AppSessionStartedResult | AppSessionStartFailedResult;

export interface AppSessionStoppedResult {
  readonly status: 'STOPPED';
  /** Steps whose dispose ran, in dispose (reverse) order. */
  readonly disposed: readonly AppSessionStepRecord[];
}

export interface AppSessionStopFailedResult {
  readonly status: 'FAILED';
  readonly code: 'APP_SESSION_DISPOSE_FAILED';
  /** The real thrown value of the first dispose failure. */
  readonly error: unknown;
  /** Steps whose dispose ran, in dispose (reverse) order. */
  readonly disposed: readonly AppSessionStepRecord[];
  /** All dispose callbacks that threw, in attempt order. */
  readonly disposeErrors: readonly AppSessionDisposeError[];
}

export type AppSessionStopResult = AppSessionStoppedResult | AppSessionStopFailedResult;

/** Read-only observation snapshot of the session state machine. */
export interface AppSessionObservation {
  readonly state: AppSessionState;
  /** True only in READY: upper-layer calls are admitted. */
  readonly ready: boolean;
  /** True in a terminal state (STOPPED or FAILED): lifecycle work is finished. */
  readonly closed: boolean;
}

/** Narrowed read-only observation gate for composition (I0/A2 consume this). */
export interface AppSessionObserver {
  observe(): Readonly<AppSessionObservation>;
}

export interface AppSession {
  /** The dispose mode this session was created with (explicit, tested both ways). */
  readonly disposeMode: AppSessionDisposeMode;
  /** Read-only observation gate over the session state machine. */
  observe(): Readonly<AppSessionObservation>;
  /** NEW -> STARTING -> READY. Synchronously state-gated. Never throws for init failures. */
  start(): Promise<AppSessionStartResult>;
  /** READY -> STOPPING -> STOPPED. Synchronously state-gated. Never throws for dispose failures. */
  stop(): Promise<AppSessionStopResult>;
  /** Upper-layer call gate: admitted only in READY; call failures never change session state. */
  run<T>(fn: () => T | Promise<T>): Promise<T>;
}

const CONFIG_KEYS = ['packages', 'app', 'disposeMode'] as const;
const STEP_KEYS = ['id', 'init', 'dispose'] as const;

function configurationInvalid(detail: string): AppSessionError {
  return new AppSessionError('APP_SESSION_CONFIGURATION_INVALID', detail);
}

/** Fail-closed step validation: exact shape, non-empty id, function callbacks. */
function assertLifecycleStep(step: unknown, at: string): AppLifecycleStep {
  if (step === null || typeof step !== 'object' || Array.isArray(step)) throw configurationInvalid(at);
  const record = step as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(STEP_KEYS as readonly string[]).includes(key)) throw configurationInvalid(at + '.' + key);
  }
  if (typeof record.id !== 'string' || record.id.length === 0) throw configurationInvalid(at + '.id');
  if (typeof record.init !== 'function') throw configurationInvalid(at + '.init');
  if (typeof record.dispose !== 'function') throw configurationInvalid(at + '.dispose');
  return Object.freeze({
    id: record.id,
    init: record.init as () => void | Promise<void>,
    dispose: record.dispose as () => void | Promise<void>,
  });
}

/** Internal: a lifecycle step tagged with its composition phase. */
type PhasedLifecycleStep = AppLifecycleStep & { readonly phase: AppSessionStepPhase };

/**
 * Dispose a list of init-completed steps in reverse order, best-effort: every
 * dispose is attempted even after an earlier one threw, and each throw is
 * collected with the real error instead of being swallowed. `disposed`
 * records every dispose attempt (callback invoked) in dispose order.
 */
async function disposeInReverse(steps: readonly PhasedLifecycleStep[]): Promise<{
  disposed: readonly AppSessionStepRecord[];
  disposeErrors: readonly AppSessionDisposeError[];
}> {
  const disposed: AppSessionStepRecord[] = [];
  const disposeErrors: AppSessionDisposeError[] = [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    const record: AppSessionStepRecord = Object.freeze({ id: step.id, phase: step.phase });
    try {
      await step.dispose();
    } catch (error) {
      disposeErrors.push(Object.freeze({ stepId: step.id, phase: step.phase, error }));
    }
    disposed.push(record);
  }
  return { disposed: Object.freeze(disposed), disposeErrors: Object.freeze(disposeErrors) };
}

/**
 * Create one App session over the selected composition. Configuration is
 * validated fail-closed at construction: exact shape, function callbacks,
 * unique ids across packages and app, exactly one App Init (an array or a
 * second `apps`-style field is rejected) and a known dispose mode.
 */
export function createAppSession(config: AppSessionConfig): AppSession {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw configurationInvalid('config');
  }
  const raw = config as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!(CONFIG_KEYS as readonly string[]).includes(key)) throw configurationInvalid('config.' + key);
  }
  if (!Array.isArray(raw.packages)) throw configurationInvalid('config.packages');
  if (raw.disposeMode !== undefined && raw.disposeMode !== 'single-shot' && raw.disposeMode !== 'idempotent') {
    throw configurationInvalid('config.disposeMode');
  }
  const disposeMode: AppSessionDisposeMode = raw.disposeMode === undefined ? 'single-shot' : raw.disposeMode;
  const packages = (raw.packages as unknown[]).map((step, index) => assertLifecycleStep(step, `config.packages[${index}]`));
  // The unique App Init: an array (a second App Init) is not a single step.
  if (Array.isArray(raw.app)) throw configurationInvalid('config.app.second-app-init');
  const app = assertLifecycleStep(raw.app, 'config.app');
  const seen = new Set<string>();
  for (const step of [...packages, app]) {
    if (seen.has(step.id)) throw configurationInvalid('config.duplicate-id:' + step.id);
    seen.add(step.id);
  }

  // The init execution plan: packages in declaration order, then the app.
  const plan: readonly PhasedLifecycleStep[] = Object.freeze([
    ...packages.map((step): PhasedLifecycleStep => ({ ...step, phase: 'package' })),
    { ...app, phase: 'app' },
  ]);

  let state: AppSessionState = 'NEW';
  const started: PhasedLifecycleStep[] = []; // steps whose init completed, in init order
  let recordedStop: AppSessionStopResult | null = null;
  // Admission occurs synchronously in run() while READY. STOPPING closes
  // admission immediately, then drains the already-admitted promises before
  // disposing any Package/App resources.
  const inFlight = new Set<Promise<unknown>>();

  const observe = (): Readonly<AppSessionObservation> => Object.freeze({
    state,
    ready: state === 'READY',
    closed: state === 'STOPPED' || state === 'FAILED',
  });

  const start = (): Promise<AppSessionStartResult> => {
    // Synchronous gate + transition: a concurrent second start always sees
    // STARTING, a completed session always sees READY/STOPPED/FAILED.
    if (state !== 'NEW') throw new AppSessionError('APP_SESSION_INVALID_STATE', 'start:' + state);
    state = 'STARTING';
    const runStart = async (): Promise<AppSessionStartResult> => {
      for (const step of plan) {
        try {
          await step.init();
        } catch (error) {
          // Init failed: reverse best-effort cleanup of what actually started.
          const teardown = await disposeInReverse(started);
          state = 'FAILED';
          const result: AppSessionStartFailedResult = Object.freeze({
            status: 'FAILED',
            code: 'APP_SESSION_INIT_FAILED',
            failedStepId: step.id,
            failedPhase: step.phase,
            error,
            disposed: teardown.disposed,
            disposeErrors: teardown.disposeErrors,
          });
          return result;
        }
        started.push(step);
      }
      state = 'READY';
      const startedRecords = Object.freeze(started.map(
        (step): AppSessionStepRecord => Object.freeze({ id: step.id, phase: step.phase }),
      ));
      const result: AppSessionStartedResult = Object.freeze({ status: 'READY', started: startedRecords });
      return result;
    };
    return runStart();
  };

  const stop = (): Promise<AppSessionStopResult> => {
    // Idempotent mode only: a repeat stop after a successful STOPPED replays
    // the recorded result without re-invoking any dispose callback.
    if (disposeMode === 'idempotent' && state === 'STOPPED' && recordedStop !== null) return Promise.resolve(recordedStop);
    if (state !== 'READY') throw new AppSessionError('APP_SESSION_INVALID_STATE', 'stop:' + state);
    state = 'STOPPING';
    const runStop = async (): Promise<AppSessionStopResult> => {
      // No new run() can be admitted after state becomes STOPPING. Await the
      // captured in-flight calls (including rejected calls) before cleanup;
      // never treat Promise.race/timeout as proof that external effects ended.
      if (inFlight.size > 0) await Promise.allSettled([...inFlight]);
      const teardown = await disposeInReverse(started);
      if (teardown.disposeErrors.length > 0) {
        // A throwing dispose must not fake a clean stop: FAILED with the real
        // first dispose error plus the full dispose error list.
        state = 'FAILED';
        const result: AppSessionStopFailedResult = Object.freeze({
          status: 'FAILED',
          code: 'APP_SESSION_DISPOSE_FAILED',
          error: teardown.disposeErrors[0].error,
          disposed: teardown.disposed,
          disposeErrors: teardown.disposeErrors,
        });
        return result;
      }
      state = 'STOPPED';
      const result: AppSessionStoppedResult = Object.freeze({ status: 'STOPPED', disposed: teardown.disposed });
      if (disposeMode === 'idempotent') recordedStop = result;
      return result;
    };
    return runStop();
  };

  const run = <T>(fn: () => T | Promise<T>): Promise<T> => {
    if (typeof fn !== 'function') throw configurationInvalid('run.fn');
    if (state !== 'READY') throw new AppSessionError('APP_SESSION_INVALID_STATE', 'run:' + state);
    // Register before returning control to the caller. A concurrent stop()
    // must drain this exact call even if its callback has not run yet.
    // Rejection is preserved for the caller; draining does not swallow it.
    const pending = Promise.resolve().then(fn);
    const tracked = pending.finally(() => { inFlight.delete(tracked); });
    inFlight.add(tracked);
    return tracked;
  };

  const session: AppSession = Object.freeze({
    disposeMode,
    observe,
    start,
    stop,
    run,
  });
  return session;
}

/**
 * Narrow a session to its read-only observation gate for composition (I0/A2):
 * exposes state/ready/closed queries only — no start, stop or run access.
 */
export function createAppSessionObserver(session: AppSession): AppSessionObserver {
  if (!session || typeof session.observe !== 'function') throw configurationInvalid('observer.session');
  return Object.freeze({
    observe: (): Readonly<AppSessionObservation> => session.observe(),
  });
}
