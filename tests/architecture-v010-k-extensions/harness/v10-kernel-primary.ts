/**
 * #1150 research harness — the v0.10 K Primary composition.
 *
 * ONE Primary over the REAL selected v0.9 kernel mechanism: this class alone
 * invokes the imported kernel module's `createOccurrenceRuntime` (lazily,
 * exactly once per business package) and alone owns Admission / State /
 * Journal / Effect / Replay / UNKNOWN through it. Kernel-extensions selected
 * in the subject participate ONLY as data-only advisory hooks:
 *
 *  - 'admission-budget-advice/v1' receives a frozen, redacted proposed-step
 *    projection plus the immutable hard budget profile and returns a bounded
 *    suggested step ceiling. The Primary INDEPENDENTLY validates the return
 *    (exact fields, plain data, bounded integer), clamps it against its OWN
 *    hard ceiling, and records the consultation durably in its own document
 *    namespace. Oversize advice clamps; malformed or authority-shaped advice
 *    is ignored typed; no advice is ever a permit or a success decision.
 *  - 'recovery-diagnostics/v1' receives an immutable, permission-filtered
 *    projection of outstanding UNKNOWN journal correlation IDs and returns
 *    prioritized observation-only hints. Hints with authority-shaped fields
 *    (action/terminalStatus) or unknown correlation IDs are dropped typed;
 *    the journal is never written by this path and UNKNOWN stays UNKNOWN.
 *
 * Extensions never receive the docs/CAS/sha256/resources ports, the kernel
 * namespace, or any permit; they see only frozen plain data built here.
 */
import { createHash } from 'node:crypto';

import type { KDocumentStore, CasPutCondition } from './memory-cas-store.js';
import type { V10Counters } from './v10-loader.js';
import type { V10Subject, V10SubjectEntry } from './v10-subject.js';

const K_DOCS_PREFIX = 'v10/k/';
const MAX_HINTS = 16;
const MAX_REASON_CHARS = 128;
const MAX_CEILING = 1_000_000_000;

export type V10PublicIntent = {
  readonly intentType: string;
  readonly instanceKey: string;
  readonly messageId: string;
  readonly input: Record<string, unknown>;
  readonly budget?: { readonly requestedCeiling?: unknown; readonly workUnits?: unknown };
};

export class V10PrimaryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'V10PrimaryError';
    this.code = code;
  }
}

export interface SelectedExtension {
  readonly packageId: string;
  readonly providerId: string;
  readonly hook: string;
  readonly hookFn: (...args: unknown[]) => unknown;
  readonly dispose?: () => void;
}

export interface AdvisoryCounters {
  advisoryConsultations: number;
  adviceHonored: number;
  adviceClamped: number;
  adviceIgnoredMalformed: number;
  adviceIgnoredFields: number;
  adviceIgnoredError: number;
  budgetRefusals: number;
  recoveryConsultations: number;
  hintsAccepted: number;
  hintsDroppedFields: number;
  hintsDroppedUnknown: number;
  hintsDroppedMalformed: number;
  hintReturnsIgnored: number;
  recoveryObservations: number;
  receiptsObserved: number;
  resourceCalls: number;
}

interface KRuntime {
  readonly counters: Record<string, number>;
  openInstance(request: unknown): Promise<unknown>;
  submitOccurrence(request: unknown): Promise<unknown>;
  getSnapshot(target: unknown): Promise<unknown>;
  getJournalRecords(): Promise<readonly Record<string, unknown>[]>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  return Object.freeze(value);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface PrimaryDeps {
  readonly subject: V10Subject;
  readonly namespaces: ReadonlyMap<string, Record<string, unknown>>;
  readonly kernelEntry: V10SubjectEntry;
  readonly standardEntry: V10SubjectEntry;
  readonly extensions: readonly SelectedExtension[];
  readonly store: KDocumentStore;
  readonly tenantId: string;
  readonly now: () => number;
  readonly counters: V10Counters;
}

export class V10PrimaryFacade {
  readonly #deps: PrimaryDeps;
  readonly #docsPrefix: string;
  readonly #runtimes = new Map<string, KRuntime>();
  readonly #advisory: AdvisoryCounters = {
    advisoryConsultations: 0,
    adviceHonored: 0,
    adviceClamped: 0,
    adviceIgnoredMalformed: 0,
    adviceIgnoredFields: 0,
    adviceIgnoredError: 0,
    budgetRefusals: 0,
    recoveryConsultations: 0,
    hintsAccepted: 0,
    hintsDroppedFields: 0,
    hintsDroppedUnknown: 0,
    hintsDroppedMalformed: 0,
    hintReturnsIgnored: 0,
    recoveryObservations: 0,
    receiptsObserved: 0,
    resourceCalls: 0,
  };
  #observationSeq = 0;
  #closed = false;

  constructor(deps: PrimaryDeps) {
    this.#deps = deps;
    this.#docsPrefix = `${K_DOCS_PREFIX}${deps.subject.subjectDigest}/${deps.tenantId}/`;
  }

  get advisoryCounters(): Readonly<AdvisoryCounters> {
    return { ...this.#advisory };
  }

  get selectedExtensions(): readonly { packageId: string; providerId: string; hook: string }[] {
    return this.#deps.extensions.map((extension) => ({
      packageId: extension.packageId, providerId: extension.providerId, hook: extension.hook,
    }));
  }

  isClosed(): boolean {
    return this.#closed;
  }

  close(): void {
    this.#closed = true;
  }

  /** The REAL K kernel's own counters (admissions/journal/effects/commits). */
  kCounters(businessPackageId: string): Record<string, number> {
    const runtime = this.#runtimeFor(businessPackageId);
    return { ...runtime.counters };
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new V10PrimaryError('FACADE_CLOSED', 'the v0.10 facade is closed; no further K activity can start');
    }
  }

  // -------------------------------------------------------------------------
  // K-owned document port (scoped, conditional writes only, list for journal)
  // -------------------------------------------------------------------------

  readonly #docs = {
    get: async (key: string): Promise<{ value: unknown; revision: number } | null> => {
      this.#assertOpen();
      return this.#deps.store.get(`${this.#docsPrefix}${key}`);
    },
    put: async (key: string, value: unknown, condition: unknown): Promise<{ revision: number }> => {
      this.#assertOpen();
      let mapped: CasPutCondition;
      const revision = isPlainRecord(condition) ? condition.mustMatchRevision : undefined;
      if (isPlainRecord(condition) && condition.mustBeAbsent === true) {
        mapped = { kind: 'create' };
      } else if (typeof revision === 'number' && Number.isSafeInteger(revision)) {
        mapped = { kind: 'cas', revision };
      } else {
        throw new V10PrimaryError('K_DOC_CONDITION_REQUIRED', `K document write of ${key} requires a physical revision expectation`);
      }
      try {
        return await this.#deps.store.put(`${this.#docsPrefix}${key}`, value, mapped);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'HOST_CAS_CONFLICT' || code === undefined) {
          throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { code: 'HOST_CAS_CONFLICT' });
        }
        throw error;
      }
    },
    list: async (prefix: string): Promise<readonly string[]> => {
      this.#assertOpen();
      const full = `${this.#docsPrefix}${prefix}`;
      return this.#deps.store.keys().filter((key) => key.startsWith(full)).map((key) => key.slice(this.#docsPrefix.length));
    },
  };

  /** Sealed capability dispatch: the ONLY physical resource port, K-composition-owned. */
  readonly #resources = {
    call: async (capabilityId: unknown, operationId: unknown, payload: unknown): Promise<unknown> => {
      this.#assertOpen();
      if (typeof capabilityId !== 'string' || typeof operationId !== 'string' || !isPlainRecord(payload)) {
        throw new V10PrimaryError('RESOURCE_INPUT_INVALID', 'a resource call requires (capabilityId, operationId, record payload)');
      }
      const entry = this.#deps.subject.entries.find((candidate) => candidate.role === 'capability' && candidate.capabilityId === capabilityId);
      const handlerName = entry?.handlers?.find((handler) => handler.operationId === operationId)?.handler;
      if (entry === undefined || handlerName === undefined) {
        throw new V10PrimaryError('RESOURCE_ROUTE_UNSEALED', `resource ${capabilityId}:${operationId} is not sealed in this subject`);
      }
      const handler = this.#deps.namespaces.get(entry.packageId)?.[handlerName];
      if (typeof handler !== 'function') {
        throw new V10PrimaryError('RESOURCE_ABI_INVALID', `sealed handler ${handlerName} is not callable`);
      }
      this.#advisory.resourceCalls += 1;
      return await (handler as (input: unknown) => unknown)(payload);
    },
  };

  // -------------------------------------------------------------------------
  // The ONE runtime factory invocation per business package (real v0.9 K)
  // -------------------------------------------------------------------------

  #runtimeFor(businessPackageId: string): KRuntime {
    this.#assertOpen();
    const existing = this.#runtimes.get(businessPackageId);
    if (existing !== undefined) return existing;
    const { namespaces, kernelEntry, counters } = this.#deps;
    const kernelNamespace = namespaces.get(kernelEntry.packageId) as Record<string, unknown>;
    const createRuntime = kernelNamespace.createOccurrenceRuntime as (options: unknown) => KRuntime;
    const businessNamespace = namespaces.get(businessPackageId) as Record<string, unknown>;
    const policy = (businessNamespace.getPolicy as () => unknown)();
    if (!isPlainRecord(policy)) {
      throw new V10PrimaryError('BUSINESS_ABI_INVALID', `Business ${businessPackageId} policy is not a record`);
    }
    counters.runtimeFactoryInvocations += 1;
    const runtime = createRuntime({
      moduleIdentity: { packageId: kernelEntry.packageId, moduleSha256: kernelEntry.moduleSha256 },
      hostPorts: {
        docs: this.#docs,
        resources: this.#resources,
        sha256: { digestUtf8: (value: string): string => sha256Hex(value) },
        clock: (): string => new Date(this.#deps.now()).toISOString(),
      },
      sdkEndpoint: {
        packageId: this.#deps.standardEntry.packageId,
        interpret: (declaration: unknown, input: unknown, context: unknown): unknown =>
          (namespaces.get(this.#deps.standardEntry.packageId)?.interpret as (d: unknown, i: unknown, c: unknown) => unknown)(declaration, input, context),
      },
      businessEndpoint: policy,
      observe: (receipt: unknown): void => {
        this.#advisory.receiptsObserved += 1;
        void receipt;
      },
    });
    this.#runtimes.set(businessPackageId, runtime);
    return runtime;
  }

  #businessFor(intentType: string): string {
    const route = this.#deps.subject.routes.find((row) => row.intentId === intentType);
    if (route === undefined) {
      throw new V10PrimaryError('INTENT_UNSEALED', `intent ${intentType} carries no sealed route rows`);
    }
    const business = this.#deps.subject.entries.find(
      (entry) => entry.role === 'business' && entry.provides.includes(`intent:${intentType}`),
    );
    if (business === undefined) {
      throw new V10PrimaryError('INTENT_UNSEALED', `intent ${intentType} has no owning business package`);
    }
    return business.packageId;
  }

  #policyWorkflowId(businessPackageId: string): string {
    const policy = (this.#deps.namespaces.get(businessPackageId)?.getPolicy as () => unknown)();
    const workflowKey = isPlainRecord(policy) && isPlainRecord(policy.workflowDefinition)
      ? policy.workflowDefinition.workflowKey
      : undefined;
    if (typeof workflowKey !== 'string' || workflowKey.length === 0) {
      throw new V10PrimaryError('BUSINESS_ABI_INVALID', `Business ${businessPackageId} declares no workflowKey`);
    }
    return workflowKey;
  }

  // -------------------------------------------------------------------------
  // Admission path: Router → K-boundary revalidation → advisory budget → K
  // -------------------------------------------------------------------------

  async send(intent: V10PublicIntent): Promise<Record<string, unknown>> {
    this.#assertOpen();
    const { intentType, instanceKey, messageId } = intent;
    const businessPackageId = this.#businessFor(intentType);
    const workflowId = this.#policyWorkflowId(businessPackageId);
    const target = { workflowId, instanceKey };

    // Pure Standard Router over the sealed route rows (real v0.9 module).
    const rows = this.#deps.subject.routes.filter((row) => row.intentId === intentType);
    if (rows.length === 0) {
      throw new V10PrimaryError('INTENT_UNSEALED', `intent ${intentType} carries no sealed route rows`);
    }
    const basisDigest = `sha256:${this.#deps.subject.subjectDigest}`;
    const bindings = rows.map((row) => ({ intentId: row.intentId, operationId: row.operationId, capabilityId: row.capabilityId, handlerId: row.handlerId }));
    const candidates = rows.map((row) => ({ operationId: row.operationId, capabilityId: row.capabilityId, priority: 1, eligibility: 'eligible' }));
    const router = this.#deps.namespaces.get(this.#deps.standardEntry.packageId)?.routeWorkflowIntent as (request: unknown) => Record<string, unknown>;
    const routed = router({ intentId: intentType, basisDigest, bindings, candidates });
    if (routed.kind !== 'selected') {
      throw new V10PrimaryError(`ROUTER_${String(routed.kind).toUpperCase()}`, `the selected Standard Router outcome '${String(routed.kind)}' admits nothing`);
    }
    const matched = rows.some((row) => row.operationId === routed.operationId
      && row.capabilityId === routed.capabilityId
      && row.handlerId === routed.handlerId);
    if (!matched || routed.basisDigest !== basisDigest) {
      throw new V10PrimaryError('ROUTING_BINDING_UNMATCHED', 'the Router result does not exactly match a sealed route row of this subject');
    }

    // Advisory budget consultation + Primary-owned clamping/revalidation,
    // durably recorded in the Primary's own document namespace.
    const budgetOutcome = await this.#consultBudgetAdvice(intent, workflowId);

    // Primary hard work-units gate: BEFORE any K admission activity.
    const requestedWorkUnits = intent.budget?.workUnits;
    const hard = this.#deps.subject.hardBudget;
    if (typeof requestedWorkUnits === 'number' && Number.isSafeInteger(requestedWorkUnits) && requestedWorkUnits > hard.maxWorkUnitsPerTurn) {
      this.#advisory.budgetRefusals += 1;
      throw new V10PrimaryError('ADMISSION_BUDGET_EXCEEDED', `turn ${messageId} requests ${requestedWorkUnits} work units above the Primary hard ceiling ${hard.maxWorkUnitsPerTurn}; refused before any K admission`);
    }

    const runtime = this.#runtimeFor(businessPackageId);
    const existing = await runtime.getSnapshot(target);
    if (existing === null || existing === undefined) {
      try {
        await runtime.openInstance({ target, correlationId: `corr:${messageId}`, authorityClass: 'PRODUCTION' });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'HOST_CAS_CONFLICT' && code !== 'HOST_KEY_EXISTS') throw error;
      }
    }
    try {
      const receipt = await runtime.submitOccurrence({
        kind: 'v08/tc-intent', intentType, target, messageId, input: intent.input,
        caller: { role: 'requester' },
      });
      if (!isPlainRecord(receipt)) {
        throw new V10PrimaryError('K_RECEIPT_INVALID', 'the Kernel admission receipt is not a record');
      }
      return { ...receipt, budget: budgetOutcome };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ADMISSION_EFFECT_AMBIGUOUS' || code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT') {
        // The kernel's own honest UNKNOWN: the effect may have landed but its
        // terminal journal commit could not; no false ACK, no retry.
        return { status: 'UNKNOWN', messageId, code, budget: budgetOutcome };
      }
      throw error;
    }
  }

  async #consultBudgetAdvice(intent: V10PublicIntent, workflowId: string): Promise<Record<string, unknown>> {
    const { intentType, messageId, instanceKey } = intent;
    const hard = this.#deps.subject.hardBudget;
    const requestedRaw = intent.budget?.requestedCeiling;
    const requested = typeof requestedRaw === 'number' && Number.isSafeInteger(requestedRaw) && requestedRaw >= 1
      ? Math.min(requestedRaw, hard.maxStepsPerTurn)
      : hard.maxStepsPerTurn;

    let providerId: string | null = null;
    let disposition: 'none' | 'honored' | 'clamped' | 'ignored-malformed' | 'ignored-fields' | 'ignored-error' = 'none';
    let adviceCeiling: number | null = null;

    const extension = this.#deps.extensions.find((candidate) => candidate.hook === 'admission-budget-advice/v1');
    if (extension !== undefined) {
      this.#advisory.advisoryConsultations += 1;
      providerId = extension.providerId;
      const input = deepFreeze({
        turn: { intentType, messageId, workflowId, instanceKey },
        hardBudgetProfile: { maxStepsPerTurn: hard.maxStepsPerTurn, maxAdvisoryConsultationsPerTurn: 1 },
      });
      let returned: unknown;
      try {
        returned = extension.hookFn(input);
      } catch {
        this.#advisory.adviceIgnoredError += 1;
        disposition = 'ignored-error';
      }
      if (disposition !== 'ignored-error') {
        if (!isPlainRecord(returned)) {
          this.#advisory.adviceIgnoredMalformed += 1;
          disposition = 'ignored-malformed';
        } else {
          const keys = Object.keys(returned);
          const fieldsExact = keys.length === 4 && ['kind', 'providerId', 'hook', 'suggestedCeiling'].every((field) => keys.includes(field));
          const ceiling = returned.suggestedCeiling;
          const ceilingOk = typeof ceiling === 'number' && Number.isSafeInteger(ceiling) && ceiling >= 1 && ceiling <= MAX_CEILING;
          if (!fieldsExact) {
            // Authority-shaped or incomplete returns are untrusted data.
            this.#advisory.adviceIgnoredFields += 1;
            disposition = 'ignored-fields';
          } else if (
            returned.kind !== 'advice' || returned.providerId !== extension.providerId
            || returned.hook !== extension.hook || !ceilingOk
          ) {
            this.#advisory.adviceIgnoredMalformed += 1;
            disposition = 'ignored-malformed';
          } else if ((ceiling as number) > hard.maxStepsPerTurn) {
            this.#advisory.adviceClamped += 1;
            disposition = 'clamped';
            adviceCeiling = hard.maxStepsPerTurn;
          } else {
            this.#advisory.adviceHonored += 1;
            disposition = 'honored';
            adviceCeiling = ceiling as number;
          }
        }
      }
    }

    const effectiveCeiling = Math.min(requested, adviceCeiling ?? hard.maxStepsPerTurn);
    const outcome = {
      providerId,
      disposition,
      adviceCeiling,
      hardCeiling: hard.maxStepsPerTurn,
      requestedCeiling: requested,
      effectiveCeiling,
      at: new Date(this.#deps.now()).toISOString(),
    };
    await this.#docs.put(`kext-advisory:${messageId}`, outcome, { mustBeAbsent: true });
    return outcome;
  }

  // -------------------------------------------------------------------------
  // Recovery diagnostics: data-only projection + observation-only hints
  // -------------------------------------------------------------------------

  async diagnoseRecovery(): Promise<Record<string, unknown>> {
    this.#assertOpen();
    const businessPackageId = this.#deps.subject.entries.find((entry) => entry.role === 'business')?.packageId;
    if (businessPackageId === undefined) {
      throw new V10PrimaryError('SUBJECT_INVALID', 'no business package is selected');
    }
    const runtime = this.#runtimeFor(businessPackageId);
    const records = await runtime.getJournalRecords();
    const projection = records
      .filter((record) => record.status === 'started')
      .map((record) => ({
        correlationId: typeof record.effectId === 'string' ? record.effectId : '',
        begunAt: typeof record.begunAt === 'string' ? record.begunAt : (typeof record.startedAt === 'string' ? record.startedAt : ''),
      }))
      .filter((row) => row.correlationId.length > 0);

    const known = new Set(projection.map((row) => row.correlationId));
    let consulted = false;
    let providerId: string | null = null;
    const accepted: { correlationId: string; priority: number; reason: string }[] = [];

    const extension = this.#deps.extensions.find((candidate) => candidate.hook === 'recovery-diagnostics/v1');
    if (extension !== undefined && projection.length > 0) {
      consulted = true;
      providerId = extension.providerId;
      this.#advisory.recoveryConsultations += 1;
      const input = deepFreeze({ unknownCorrelations: projection.map((row) => ({ ...row })) });
      let returned: unknown;
      try {
        returned = extension.hookFn(input);
      } catch {
        this.#advisory.hintReturnsIgnored += 1;
        returned = undefined;
      }
      if (returned !== undefined) {
        if (!isPlainRecord(returned)) {
          this.#advisory.hintReturnsIgnored += 1;
        } else {
          const keys = Object.keys(returned);
          const fieldsExact = keys.length === 4 && ['kind', 'providerId', 'hook', 'hints'].every((field) => keys.includes(field));
          const hints = returned.hints;
          if (!fieldsExact || returned.kind !== 'hints' || returned.providerId !== extension.providerId
            || returned.hook !== extension.hook || !Array.isArray(hints) || hints.length > MAX_HINTS) {
            this.#advisory.hintReturnsIgnored += 1;
          } else {
            for (const hint of hints) {
              if (!isPlainRecord(hint)) {
                this.#advisory.hintsDroppedMalformed += 1;
                continue;
              }
              const fields = Object.keys(hint);
              if (fields.some((field) => field !== 'correlationId' && field !== 'priority' && field !== 'reason')) {
                // Authority-shaped extras (action/terminalStatus/...) ride here.
                this.#advisory.hintsDroppedFields += 1;
                continue;
              }
              const { correlationId, priority, reason } = hint;
              if (typeof correlationId !== 'string' || !known.has(correlationId)) {
                this.#advisory.hintsDroppedUnknown += 1;
                continue;
              }
              if (typeof priority !== 'number' || !Number.isSafeInteger(priority) || priority < 1 || priority > 64
                || typeof reason !== 'string' || reason.length === 0 || reason.length > MAX_REASON_CHARS) {
                this.#advisory.hintsDroppedMalformed += 1;
                continue;
              }
              accepted.push({ correlationId, priority, reason });
              this.#advisory.hintsAccepted += 1;
            }
          }
        }
      }
    }

    // Primary-owned conservative ordering: hinted ids by priority, then the
    // remaining outstanding ids in durable journal order.
    accepted.sort((left, right) => left.priority - right.priority);
    const hinted = new Set(accepted.map((hint) => hint.correlationId));
    const ordering = [
      ...accepted.map((hint) => hint.correlationId),
      ...projection.map((row) => row.correlationId).filter((id) => !hinted.has(id)),
    ];

    this.#observationSeq += 1;
    this.#advisory.recoveryObservations += 1;
    await this.#docs.put(`kext-recovery-observation:${this.#observationSeq}`, {
      consulted, providerId, accepted, ordering, outstandingCount: projection.length,
      at: new Date(this.#deps.now()).toISOString(),
    }, { mustBeAbsent: true });

    return { outstanding: projection.length, consulted, providerId, accepted, ordering };
  }
}
