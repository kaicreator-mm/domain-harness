/**
 * Bounded execution envelope (D2 #1531): any Function implementation
 * (rule/knowledge now; LLM/Harness Profile later) runs inside a hard, atomic
 * budget and fails closed. Semantics inherited from the #1497 O1 bounded
 * harness invariants recorded in #1499 R96:
 *
 * - budget reservation precedes every await; the reservation ledger is
 *   synchronous and atomic, so concurrent runs can never overspend;
 * - exhaustion of any axis terminates with a structured BUDGET_EXHAUSTED
 *   outcome and never a silent partial success (output stays null);
 * - an executor throw surfaces as EXECUTION_FAILED and is never swallowed
 *   into a fixture fallback; late resolutions after a deadline are discarded
 *   and never returned as the recorded outcome;
 * - only explicitly registered `fixture` / `local-deterministic` provider
 *   kinds are admitted, before execution; reserved authority kinds such as
 *   `llm` are rejected as impersonation; fixture output is never wrapped as
 *   attested/verified;
 * - outcomes and trace events stay at the honest OBSERVED / authority NONE
 *   level with explicit attested:false. No attested claim, no real
 *   LLM/network call, no second Kernel/Meta Authority is produced here.
 *
 * Budget axis scopes follow the O1 precedent (maxCalls lifetime, maxWaitMs
 * per wait): maxSteps/maxWorkUnits form a lifetime ledger shared by all runs
 * of the envelope, while wallClockMs bounds each individual run via the
 * injectable clock.
 *
 * The module is deliberately self-contained (no runtime relative imports) so
 * the strip-types test runner can execute it directly from source.
 */

/** The three hard budget axes of a bounded envelope. */
export interface BoundedBudget {
  /** Lifetime maximum number of reserved steps shared by all runs. */
  readonly maxSteps: number;
  /** Lifetime maximum number of work units shared by all runs. */
  readonly maxWorkUnits: number;
  /** Wall-clock budget in milliseconds applied to each individual run. */
  readonly wallClockMs: number;
}

/** Point-in-time remaining amounts of the consumable budget axes. */
export interface BudgetSnapshot {
  readonly steps: number;
  readonly workUnits: number;
}

/** The axis whose exhaustion caused a fail-closed termination. */
export type BoundedBudgetAxis = 'steps' | 'workUnits' | 'wallClockMs';

/** Structured misuse/configuration rejection (programmer error, not outcome). */
export function boundedConfigError(detail: string): Error & { code: 'BOUNDED_CONFIGURATION_INVALID'; detail: string } {
  return Object.assign(new Error(`BOUNDED_CONFIGURATION_INVALID:${detail}`), {
    code: 'BOUNDED_CONFIGURATION_INVALID' as const,
    detail,
  });
}

/**
 * Structured, fail-closed exhaustion signal. Produced when any budget axis is
 * exhausted; never converted into a fixture fallback or partial success.
 */
export class BoundedBudgetExhaustedError extends Error {
  readonly axis: BoundedBudgetAxis;

  constructor(axis: BoundedBudgetAxis) {
    super(`BUDGET_EXHAUSTED:${axis}`);
    this.name = 'BoundedBudgetExhaustedError';
    this.axis = axis;
  }

  get code(): 'BUDGET_EXHAUSTED' {
    return 'BUDGET_EXHAUSTED';
  }
}

/** Validate and freeze a budget specification at envelope construction. */
export function assertBoundedBudget(budget: BoundedBudget): Readonly<BoundedBudget> {
  if (!budget || typeof budget !== 'object') throw boundedConfigError('budget');
  for (const axis of ['maxSteps', 'maxWorkUnits', 'wallClockMs'] as const) {
    const value = budget[axis];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      throw boundedConfigError(axis);
    }
  }
  return Object.freeze({ ...budget });
}

/**
 * Shared reservation ledger for one envelope. Every mutation is synchronous:
 * the check-then-decrement pair runs in one synchronous block that completes
 * before any await, so concurrent runs can never overspend the ledger.
 */
export class BudgetLedger {
  private remainingSteps: number;
  private remainingWorkUnits: number;

  constructor(total: BudgetSnapshot) {
    this.remainingSteps = total.steps;
    this.remainingWorkUnits = total.workUnits;
  }

  get remaining(): Readonly<BudgetSnapshot> {
    return Object.freeze({ steps: this.remainingSteps, workUnits: this.remainingWorkUnits });
  }

  /**
   * Atomically reserve one step plus its work-unit cost. Throws a structured
   * BoundedBudgetExhaustedError when either axis is insufficient. Reservations
   * are final: failed or abandoned steps stay consumed (no refund).
   */
  reserveStep(workUnits: number): Readonly<BudgetSnapshot> {
    if (this.remainingSteps < 1) throw new BoundedBudgetExhaustedError('steps');
    if (this.remainingWorkUnits < workUnits) throw new BoundedBudgetExhaustedError('workUnits');
    this.remainingSteps -= 1;
    this.remainingWorkUnits -= workUnits;
    return this.remaining;
  }
}

/**
 * Injectable clock for bounded wall-clock accounting. Production uses
 * realClock; bounded tests inject a manual clock and advance it synchronously
 * so wall-clock exhaustion is verified without ever sleeping for real.
 */
export interface BoundedClock {
  /** Current clock time in milliseconds. */
  now(): number;
  /** Schedule onFire after `ms` of clock time; returns a cancel function. */
  schedule(ms: number, onFire: () => void): () => void;
}

export const realClock: BoundedClock = {
  now: () => Date.now(),
  schedule: (ms, onFire) => {
    const timer = setTimeout(onFire, ms);
    return () => clearTimeout(timer);
  },
};

export function assertBoundedClock(clock: BoundedClock): void {
  if (!clock || typeof clock !== 'object' || typeof clock.now !== 'function' || typeof clock.schedule !== 'function') {
    throw boundedConfigError('clock');
  }
}

/**
 * Provider admission: the envelope only admits explicitly registered provider
 * kinds, and this round only `fixture` and `local-deterministic` exist. Kinds
 * that would imply a real Model/Harness authority (`llm`, `harness`) are
 * permanently unavailable to this envelope: registering or impersonating them
 * is rejected as PROVIDER_KIND_FORBIDDEN before any execution or budget
 * spend. Admission is labeling only — no Provider qualification, attestation
 * or verification is produced here, and no real LLM/network call exists.
 */
export const BOUNDED_PROVIDER_KINDS = ['fixture', 'local-deterministic'] as const;
export type BoundedProviderKind = (typeof BOUNDED_PROVIDER_KINDS)[number];

/** Authority-adjacent kinds this envelope can never provide or impersonate. */
export const RESERVED_UNAVAILABLE_PROVIDER_KINDS = ['llm', 'harness'] as const;

export interface BoundedProviderDescriptor {
  readonly kind: BoundedProviderKind;
  readonly id: string;
}

export type ProviderRejectionCode = 'PROVIDER_KIND_UNREGISTERED' | 'PROVIDER_KIND_FORBIDDEN';

export type ProviderAdmission =
  | { readonly admitted: true; readonly descriptor: Readonly<BoundedProviderDescriptor> }
  | { readonly admitted: false; readonly code: ProviderRejectionCode; readonly providerKind: string };

function providerRegistryError(code: ProviderRejectionCode, providerKind: string): Error & { code: ProviderRejectionCode; providerKind: string } {
  return Object.assign(new Error(`${code}:${providerKind}`), { code, providerKind });
}

const isRegisteredKind = (kind: string): kind is BoundedProviderKind =>
  (BOUNDED_PROVIDER_KINDS as readonly string[]).includes(kind);

const isReservedKind = (kind: string): boolean =>
  (RESERVED_UNAVAILABLE_PROVIDER_KINDS as readonly string[]).includes(kind);

/**
 * Validate the provider registry at envelope construction. Unknown kinds and
 * reserved authority kinds (e.g. `llm`) are rejected here already, so a
 * registry can never contain a kind the envelope could not honestly serve.
 */
export function validateProviderRegistry(
  entries: readonly BoundedProviderDescriptor[],
): ReadonlyMap<BoundedProviderKind, Readonly<BoundedProviderDescriptor>> {
  if (!Array.isArray(entries)) throw boundedConfigError('providers');
  const registry = new Map<BoundedProviderKind, Readonly<BoundedProviderDescriptor>>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw boundedConfigError('provider');
    if (typeof entry.id !== 'string' || entry.id.length === 0) throw boundedConfigError('provider.id');
    if (!isRegisteredKind(entry.kind)) {
      const kind = String(entry.kind);
      throw isReservedKind(kind)
        ? providerRegistryError('PROVIDER_KIND_FORBIDDEN', kind)
        : providerRegistryError('PROVIDER_KIND_UNREGISTERED', kind);
    }
    if (registry.has(entry.kind)) throw boundedConfigError(`provider.duplicate:${entry.kind}`);
    registry.set(entry.kind, Object.freeze({ kind: entry.kind, id: entry.id }));
  }
  return registry;
}

/**
 * Admission decision for one execution plan. Runs synchronously before any
 * executor invocation and before any budget reservation.
 */
export function admitProviderKind(
  registry: ReadonlyMap<BoundedProviderKind, Readonly<BoundedProviderDescriptor>>,
  providerKind: string,
): ProviderAdmission {
  const descriptor = registry.get(providerKind as BoundedProviderKind);
  if (descriptor) return { admitted: true, descriptor };
  if (isReservedKind(providerKind)) return { admitted: false, code: 'PROVIDER_KIND_FORBIDDEN', providerKind };
  return { admitted: false, code: 'PROVIDER_KIND_UNREGISTERED', providerKind };
}

/**
 * Observational bounded trace events: parallel minimal observational types,
 * deliberately not the trusted trace.ts claims. Every event carries explicit
 * attested:false and authority:'NONE'. Bounded trace records
 * reserve/settle/exhaustion observability only and must never be promoted
 * into a trusted Trace claim (O2 stays PARTIAL).
 */
export interface BoundedEventFields {
  /** Clock time at which the event was observed. */
  readonly at: number;
  /** Every bounded trace event is an unattested observation. */
  readonly attested: false;
  /** Bounded trace never carries authority. */
  readonly authority: 'NONE';
}

export type BoundedTraceEvent =
  | BoundedEventFields & { readonly type: 'provider-admitted'; readonly providerKind: BoundedProviderKind; readonly providerId: string }
  | BoundedEventFields & { readonly type: 'provider-rejected'; readonly providerKind: string; readonly code: ProviderRejectionCode }
  | BoundedEventFields & { readonly type: 'run-started'; readonly providerKind: BoundedProviderKind; readonly providerId: string; readonly budget: Readonly<BoundedBudget>; readonly deadlineAt: number }
  | BoundedEventFields & { readonly type: 'budget-reserved'; readonly workUnits: number; readonly remaining: Readonly<BudgetSnapshot> }
  | BoundedEventFields & { readonly type: 'budget-settled'; readonly status: 'completed' | 'failed' | 'deadline-abandoned'; readonly workUnits: number; readonly remaining: Readonly<BudgetSnapshot> }
  | BoundedEventFields & { readonly type: 'budget-exhausted'; readonly axis: BoundedBudgetAxis; readonly cause: 'deadline-fired' | 'deadline-elapsed' | 'reserve-denied' }
  | BoundedEventFields & { readonly type: 'execution-failed'; readonly reason: string }
  | BoundedEventFields & { readonly type: 'run-completed' };

/** Per-step work declaration: the cost charged against the ledger. */
export interface BoundedStepTicket {
  readonly workUnits: number;
}

export interface BoundedStepContext {
  /**
   * Reserve-execute-settle step: reservation is synchronous and precedes the
   * awaited executor; settlement is recorded synchronously afterwards.
   */
  step<T>(ticket: BoundedStepTicket, fn: () => T | Promise<T>): Promise<T>;
}

export interface BoundedPlan<O> {
  /** Provider admission happens before any execution or budget spend. */
  readonly providerKind: string;
  readonly run: (ctx: BoundedStepContext) => Promise<O>;
}

/** Explicit provider labeling on a completed outcome. Never attested. */
export interface BoundedProviderLabel {
  readonly kind: BoundedProviderKind;
  readonly id: string;
  readonly attested: false;
  readonly verified: false;
}

interface BoundedOutcomeFields {
  readonly authority: 'NONE';
  readonly attested: false;
  readonly qualified: false;
  readonly effectDispatched: false;
  readonly remaining: Readonly<BudgetSnapshot>;
  readonly trace: readonly BoundedTraceEvent[];
}

export type BoundedOutcome<O> =
  | BoundedOutcomeFields & { readonly status: 'COMPLETED'; readonly disposition: 'OBSERVED'; readonly output: O; readonly provider: BoundedProviderLabel }
  | BoundedOutcomeFields & { readonly status: 'BUDGET_EXHAUSTED'; readonly axis: BoundedBudgetAxis; readonly disposition: 'UNKNOWN'; readonly output: null }
  | BoundedOutcomeFields & { readonly status: 'EXECUTION_FAILED'; readonly reason: string; readonly disposition: 'UNKNOWN'; readonly output: null }
  | BoundedOutcomeFields & { readonly status: 'PROVIDER_REJECTED'; readonly code: ProviderRejectionCode; readonly providerKind: string; readonly disposition: 'UNKNOWN'; readonly output: null };

export interface BoundedEnvelope {
  readonly budget: Readonly<BoundedBudget>;
  readonly providerKinds: readonly BoundedProviderKind[];
  remaining(): Readonly<BudgetSnapshot>;
  execute<O>(plan: BoundedPlan<O>): Promise<BoundedOutcome<O>>;
}

type CompletedMember<O> = Extract<BoundedOutcome<O>, { status: 'COMPLETED' }>;
type ExhaustedMember<O> = Extract<BoundedOutcome<O>, { status: 'BUDGET_EXHAUSTED' }>;
type FailedMember<O> = Extract<BoundedOutcome<O>, { status: 'EXECUTION_FAILED' }>;
type RejectedMember<O> = Extract<BoundedOutcome<O>, { status: 'PROVIDER_REJECTED' }>;

const DEADLINE = Symbol('BOUNDED_WALL_CLOCK_DEADLINE');
const REASON_MAX_LENGTH = 200;
/** C0 control characters (U+0000..U+001F) plus DEL (U+007F), by code point. */
function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0);
  return code === undefined || code <= 0x1f || code === 0x7f;
}

function sanitizeReason(value: unknown): string {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : String(value ?? '');
  const stripped = Array.from(raw).filter((character) => !isControlCharacter(character)).join('');
  const truncated = stripped.length > REASON_MAX_LENGTH ? stripped.slice(0, REASON_MAX_LENGTH) : stripped;
  return truncated.length > 0 ? truncated : 'EXECUTION_FAILED';
}

function completedOutcome<O>(
  output: O,
  provider: BoundedProviderLabel,
  remaining: Readonly<BudgetSnapshot>,
  trace: readonly BoundedTraceEvent[],
): CompletedMember<O> {
  return Object.freeze({
    status: 'COMPLETED', disposition: 'OBSERVED', output, provider,
    authority: 'NONE', attested: false, qualified: false, effectDispatched: false,
    remaining, trace,
  });
}

function exhaustedOutcome<O>(
  axis: BoundedBudgetAxis,
  remaining: Readonly<BudgetSnapshot>,
  trace: readonly BoundedTraceEvent[],
): ExhaustedMember<O> {
  return Object.freeze({
    status: 'BUDGET_EXHAUSTED', axis, disposition: 'UNKNOWN', output: null,
    authority: 'NONE', attested: false, qualified: false, effectDispatched: false,
    remaining, trace,
  });
}

function failedOutcome<O>(
  reason: string,
  remaining: Readonly<BudgetSnapshot>,
  trace: readonly BoundedTraceEvent[],
): FailedMember<O> {
  return Object.freeze({
    status: 'EXECUTION_FAILED', reason, disposition: 'UNKNOWN', output: null,
    authority: 'NONE', attested: false, qualified: false, effectDispatched: false,
    remaining, trace,
  });
}

function rejectedOutcome<O>(
  code: ProviderRejectionCode,
  providerKind: string,
  remaining: Readonly<BudgetSnapshot>,
  trace: readonly BoundedTraceEvent[],
): RejectedMember<O> {
  return Object.freeze({
    status: 'PROVIDER_REJECTED', code, providerKind, disposition: 'UNKNOWN', output: null,
    authority: 'NONE', attested: false, qualified: false, effectDispatched: false,
    remaining, trace,
  });
}

export function createBoundedEnvelope(config: {
  budget: BoundedBudget;
  providers: readonly BoundedProviderDescriptor[];
  clock?: BoundedClock;
}): BoundedEnvelope {
  if (!config || typeof config !== 'object') throw boundedConfigError('config');
  const budget = assertBoundedBudget(config.budget);
  const registry = validateProviderRegistry(config.providers);
  const clock = config.clock === undefined ? realClock : config.clock;
  assertBoundedClock(clock);
  const ledger = new BudgetLedger({ steps: budget.maxSteps, workUnits: budget.maxWorkUnits });
  const providerKinds = Object.freeze(Array.from(registry.keys()));
  const envelope: BoundedEnvelope = {
    budget,
    providerKinds,
    remaining: () => ledger.remaining,
    async execute<O>(plan: BoundedPlan<O>): Promise<BoundedOutcome<O>> {
      if (!plan || typeof plan !== 'object') throw boundedConfigError('plan');
      if (typeof plan.providerKind !== 'string' || plan.providerKind.length === 0) throw boundedConfigError('plan.providerKind');
      const events: BoundedTraceEvent[] = [];
      const record = (event: BoundedTraceEvent): void => { events.push(Object.freeze(event)); };
      const providerKind = plan.providerKind;
      // ---- Provider admission: before execution, before budget spend. ----
      const admission = admitProviderKind(registry, providerKind);
      if (!admission.admitted) {
        record({ type: 'provider-rejected', at: clock.now(), attested: false, authority: 'NONE', providerKind, code: admission.code });
        return rejectedOutcome<O>(admission.code, providerKind, ledger.remaining, Object.freeze(events));
      }
      const { descriptor } = admission;
      if (typeof plan.run !== 'function') throw boundedConfigError('plan.run');
      record({ type: 'provider-admitted', at: clock.now(), attested: false, authority: 'NONE', providerKind: descriptor.kind, providerId: descriptor.id });
      const startedAt = clock.now();
      const deadlineAt = startedAt + budget.wallClockMs;
      record({ type: 'run-started', at: startedAt, attested: false, authority: 'NONE', providerKind: descriptor.kind, providerId: descriptor.id, budget, deadlineAt });

      let exhausted: BoundedBudgetAxis | null = null;
      let inflight: { readonly workUnits: number } | null = null;
      let finished = false;

      // First exhausted axis wins; events stay deduplicated and ordered:
      // an in-flight step is settled as deadline-abandoned before exhaustion.
      const markExhausted = (axis: BoundedBudgetAxis, cause: 'deadline-fired' | 'deadline-elapsed' | 'reserve-denied'): void => {
        if (exhausted !== null) return;
        exhausted = axis;
        if (inflight !== null) {
          record({ type: 'budget-settled', at: clock.now(), attested: false, authority: 'NONE', status: 'deadline-abandoned', workUnits: inflight.workUnits, remaining: ledger.remaining });
          inflight = null;
        }
        record({ type: 'budget-exhausted', at: clock.now(), attested: false, authority: 'NONE', axis, cause });
      };

      let rejectDeadline: ((reason: symbol) => void) | null = null;
      const deadlinePromise = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
      void deadlinePromise.catch(() => {});
      const cancelDeadline = clock.schedule(budget.wallClockMs, () => {
        markExhausted('wallClockMs', 'deadline-fired');
        rejectDeadline!(DEADLINE);
      });
      const deadlineRace = deadlinePromise.then(
        () => ({ kind: 'deadline' as const }),
        () => ({ kind: 'deadline' as const }),
      );

      const ctx: BoundedStepContext = {
        async step<T>(ticket: BoundedStepTicket, fn: () => T | Promise<T>): Promise<T> {
          if (typeof fn !== 'function') throw boundedConfigError('step.fn');
          if (typeof ticket?.workUnits !== 'number' || !Number.isSafeInteger(ticket.workUnits) || ticket.workUnits < 1) throw boundedConfigError('step.workUnits');
          const workUnits = ticket.workUnits;
          // ---- Reserve: synchronous, precedes every await; the ledger's
          // check-then-decrement is atomic under JS concurrency, so parallel
          // runs can never overspend. ----
          if (finished) throw boundedConfigError('step.afterRun');
          if (exhausted !== null) throw new BoundedBudgetExhaustedError(exhausted);
          if (clock.now() >= deadlineAt) {
            markExhausted('wallClockMs', 'deadline-elapsed');
            throw new BoundedBudgetExhaustedError('wallClockMs');
          }
          let remaining: Readonly<BudgetSnapshot>;
          try {
            remaining = ledger.reserveStep(workUnits);
          } catch (error) {
            if (error instanceof BoundedBudgetExhaustedError) markExhausted(error.axis, 'reserve-denied');
            throw error;
          }
          record({ type: 'budget-reserved', at: clock.now(), attested: false, authority: 'NONE', workUnits, remaining });
          inflight = { workUnits };
          // ---- Execute, then settle synchronously and immediately. Failed
          // or deadline-abandoned steps stay consumed (fail-closed; matches
          // the O1 invariant that a timed-out reservation is burned). ----
          try {
            const value = await fn();
            if (!finished && inflight !== null) {
              inflight = null;
              record({ type: 'budget-settled', at: clock.now(), attested: false, authority: 'NONE', status: 'completed', workUnits, remaining: ledger.remaining });
            }
            return value;
          } catch (error) {
            if (!finished && inflight !== null) {
              inflight = null;
              record({ type: 'budget-settled', at: clock.now(), attested: false, authority: 'NONE', status: 'failed', workUnits, remaining: ledger.remaining });
            }
            throw error;
          }
        },
      };

      const runPromise: Promise<O> = (async () => plan.run(ctx))();
      const settled = await Promise.race([
        runPromise.then(
          (value) => ({ kind: 'run' as const, value }),
          (error: unknown) => ({ kind: 'run-error' as const, error }),
        ),
        deadlineRace,
      ]);
      finished = true;
      cancelDeadline();
      // An abandoned run resolving or rejecting after the deadline is never
      // returned as the recorded outcome (O1 late-resolution invariant).
      void runPromise.catch(() => {});

      if (settled.kind === 'deadline') {
        return exhaustedOutcome<O>('wallClockMs', ledger.remaining, Object.freeze(events));
      }
      if (settled.kind === 'run') {
        record({ type: 'run-completed', at: clock.now(), attested: false, authority: 'NONE' });
        const provider: BoundedProviderLabel = Object.freeze({ kind: descriptor.kind, id: descriptor.id, attested: false, verified: false });
        return completedOutcome<O>(settled.value, provider, ledger.remaining, Object.freeze(events));
      }
      const { error } = settled;
      if (error instanceof BoundedBudgetExhaustedError) {
        return exhaustedOutcome<O>(error.axis, ledger.remaining, Object.freeze(events));
      }
      const reason = sanitizeReason(error);
      record({ type: 'execution-failed', at: clock.now(), attested: false, authority: 'NONE', reason });
      return failedOutcome<O>(reason, ledger.remaining, Object.freeze(events));
    },
  };
  return Object.freeze(envelope);
}
