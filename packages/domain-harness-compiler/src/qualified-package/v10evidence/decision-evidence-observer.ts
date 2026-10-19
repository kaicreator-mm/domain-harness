/**
 * DomainHarness v0.10 T06 (#1173) — Host-origin read-only DecisionEvidence
 * observation bridge.
 * ====================================================================
 *
 * The selected Standard `decision-evidence` feature is deliberately a pure
 * normalizer: a public caller invoking it through
 * `facade.invokeSelectedStandardFeature(..., trustedDeps)` can never turn its
 * own claims into a Kernel admission observation — the trace stays
 * `kernelOutcome: 'unobserved'` on that path, and no caller callback is ever
 * treated as a trusted Host receipt.
 *
 * This module is the deployment-owned trusted counterpart. It closes the loop
 * over REAL selected surfaces only:
 *
 *   (1) the Kernel outcome is read from the actual `facade.send(intent)`
 *       return — the immutable K original receipt of the real selected
 *       kernel-primary (admission, denial or honest UNKNOWN pass through
 *       unchanged; a Kernel refusal is surfaced typed, never invented as an
 *       observation);
 *   (2) the decision result is produced by an actual invocation of the
 *       selected T02 semantic-decision feature whose model/tool boundary the
 *       deployment pinned HERE (closure-private), so the resolver outcome and
 *       its reported counters are the selected module's own output, not a
 *       caller's retelling;
 *   (3) the Host wraps the model/tool endpoints with a transparent counter,
 *       so the trace records Host-measured call counts next to the resolver's
 *       self-reported ones and marks agreement or mismatch honestly;
 *   (4) the evidence feature itself is still invoked through the real facade
 *       and stays the author of the base trace; this bridge only annotates
 *   the outcome/provenance facts it observed itself and freezes the result.
 *
 * The bridge grants no authority: no K State/Journal/Fence/Effect/Permit is
 * read or written beyond the public send receipt, the optional observation
 * sink failure cannot veto or alter the already-issued K receipt, and every
 * object handed back is a frozen snapshot (the receipt digest allows the
 * caller to re-verify the exact receipt bytes the outcome was read from).
 */
import { V10AppFacade } from '../v10build/activation.js';
import type { V10PublicIntent } from '../v10build/activation.js';
import { sha256Canonical } from '../v10build/digest.js';

export const OBSERVER_ABI = 'dh.v10.decision-evidence-observer/1';

/** Kernel outcomes a real receipt can honestly yield. */
export type HostKernelOutcome = 'admitted' | 'denied' | 'terminated' | 'unknown';

export class DecisionEvidenceObserverError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DecisionEvidenceObserverError';
    this.code = code;
  }
}

function refuse(code: string, message: string, options?: { cause?: unknown }): never {
  throw new DecisionEvidenceObserverError(code, message, options);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** The T02 host-selected semantic boundary this bridge is allowed to pin. */
export interface ObserverSemanticBoundary {
  readonly procedures?: ReadonlyMap<unknown, unknown>;
  readonly model?: (payload: unknown) => unknown;
  readonly tool?: (payload: unknown) => unknown;
  readonly now?: () => number;
  readonly createTimeoutSignal?: () => unknown;
}

export interface CreateDecisionEvidenceObserverDeps {
  /** The real activated App facade (deployment-owned; a lookalike is refused). */
  readonly facade: V10AppFacade;
  /** Feature key of the selected decision-evidence feature (e.g. `standard:decision-evidence/1`). */
  readonly evidenceFeatureKey: string;
  /** Feature key of the selected T02 semantic-decision feature. */
  readonly semanticFeatureKey: string;
  /**
   * Host-pinned model/tool/procedure boundary for the semantic resolution.
   * Closure-private once the observer is created: a public caller can never
   * reach or replace these endpoints through any later request.
   */
  readonly semanticDeps?: ObserverSemanticBoundary;
  /**
   * Optional Host-approved observation sink handed to the evidence feature.
   * Its failure (or timeout) surfaces in `observationStore` only — the
   * already-issued immutable K receipt and the observed trace are unaffected.
   */
  readonly persistObservation?: (trace: unknown) => void | Promise<void>;
  readonly observationTimeoutMs?: number;
}

export interface ObserveDecisionEvidenceRequest {
  /** The public intent whose real Kernel receipt is observed. */
  readonly intent: V10PublicIntent;
  /** Evidence identity carried into the base trace authored by the feature. */
  readonly evidence: {
    readonly observationId: string;
    readonly schema: { readonly id: string; readonly revision: string; readonly provenanceKey: string };
    readonly observedDependencies?: readonly unknown[];
  };
  /** The request passed verbatim to the selected T02 semantic-decision feature. */
  readonly semanticRequest: Record<string, unknown>;
}

export interface DecisionEvidenceObservation {
  /** Frozen snapshot of the actual K original receipt the outcome was read from. */
  readonly kernelReceipt: Record<string, unknown>;
  /** The host-annotated immutable DecisionTrace (base authored by the feature). */
  readonly decisionTrace: Record<string, unknown>;
  /** Honest sink outcome from the evidence feature (`not-selected` when no sink). */
  readonly observationStore: string;
  readonly observerAbi: string;
}

/** Map the real receipt status onto the honest outcome vocabulary. */
function kernelOutcomeOf(status: string): HostKernelOutcome {
  if (status === 'admitted' || status === 'denied' || status === 'terminated') return status;
  // `UNKNOWN` (the facade's honest pass-through of unresolved admission) and
  // anything unexpected degrade to `unknown` — never to a pretended success.
  return 'unknown';
}

const SEMANTIC_BOUNDARY_KEYS = new Set(['procedures', 'model', 'tool', 'now', 'createTimeoutSignal']);

export function createDecisionEvidenceObserver(deps: CreateDecisionEvidenceObserverDeps): {
  readonly observerAbi: string;
  observeAndRecord(request: ObserveDecisionEvidenceRequest): Promise<DecisionEvidenceObservation>;
} {
  if (!isPlainRecord(deps)) refuse('OBSERVER_DEPS_INVALID', 'observer deps must be a plain record');
  if (!(deps.facade instanceof V10AppFacade)) {
    refuse('OBSERVER_DEPS_INVALID', 'observer requires the real activated V10AppFacade; lookalike facades are refused');
  }
  const facade = deps.facade;
  if (typeof deps.evidenceFeatureKey !== 'string' || deps.evidenceFeatureKey.length === 0) {
    refuse('OBSERVER_DEPS_INVALID', 'evidenceFeatureKey is required');
  }
  if (typeof deps.semanticFeatureKey !== 'string' || deps.semanticFeatureKey.length === 0) {
    refuse('OBSERVER_DEPS_INVALID', 'semanticFeatureKey is required');
  }
  const rawBoundary = deps.semanticDeps ?? {};
  if (!isPlainRecord(rawBoundary)) {
    refuse('OBSERVER_DEPS_INVALID', 'semanticDeps must be a plain record');
  }
  // Keep the declared boundary typing after the runtime plainness check (the
  // type-guard intersection would otherwise widen members to `unknown`).
  const semanticDeps = rawBoundary as unknown as Partial<ObserverSemanticBoundary>;
  for (const key of Object.keys(semanticDeps)) {
    if (!SEMANTIC_BOUNDARY_KEYS.has(key)) {
      refuse('OBSERVER_DEPS_INVALID', `semanticDeps carries an unknown boundary member '${key}'`);
    }
  }
  if (semanticDeps.procedures !== undefined && !(semanticDeps.procedures instanceof Map)) {
    refuse('OBSERVER_DEPS_INVALID', 'semanticDeps.procedures must be a Map when provided');
  }
  for (const key of ['model', 'tool', 'now', 'createTimeoutSignal'] as const) {
    const member = semanticDeps[key];
    if (member !== undefined && typeof member !== 'function') {
      refuse('OBSERVER_DEPS_INVALID', `semanticDeps.${key} must be callable when provided`);
    }
  }
  if (deps.persistObservation !== undefined && typeof deps.persistObservation !== 'function') {
    refuse('OBSERVER_DEPS_INVALID', 'persistObservation must be callable when provided');
  }
  if (deps.observationTimeoutMs !== undefined
    && (!Number.isSafeInteger(deps.observationTimeoutMs) || deps.observationTimeoutMs < 1 || deps.observationTimeoutMs > 10_000)) {
    refuse('OBSERVER_DEPS_INVALID', 'observationTimeoutMs must be an integer in [1, 10000]');
  }

  // Host-measured counters wrap the pinned endpoints transparently; a count
  // increments before the call settles, so a failed/timeout call stays counted
  // exactly like the resolver's own started-call accounting.
  const hostMeasured = { modelCalls: 0, toolCalls: 0 };
  const pinnedBoundary: Record<string, unknown> = {};
  if (semanticDeps.procedures !== undefined) pinnedBoundary.procedures = semanticDeps.procedures;
  if (semanticDeps.now !== undefined) pinnedBoundary.now = semanticDeps.now;
  if (semanticDeps.createTimeoutSignal !== undefined) pinnedBoundary.createTimeoutSignal = semanticDeps.createTimeoutSignal;
  const pinnedModel = semanticDeps.model;
  if (pinnedModel !== undefined) {
    const model = pinnedModel;
    pinnedBoundary.model = async (payload: unknown): Promise<unknown> => {
      hostMeasured.modelCalls += 1;
      return await model(payload);
    };
  }
  const pinnedTool = semanticDeps.tool;
  if (pinnedTool !== undefined) {
    const tool = pinnedTool;
    pinnedBoundary.tool = async (payload: unknown): Promise<unknown> => {
      hostMeasured.toolCalls += 1;
      return await tool(payload);
    };
  }

  return {
    observerAbi: OBSERVER_ABI,
    async observeAndRecord(request): Promise<DecisionEvidenceObservation> {
      if (!isPlainRecord(request)) {
        refuse('OBSERVER_REQUEST_INVALID', 'observation request must be a plain record');
      }
      const { intent, evidence, semanticRequest } = request as Partial<ObserveDecisionEvidenceRequest>;
      if (!isPlainRecord(intent) || !isPlainRecord(semanticRequest)) {
        refuse('OBSERVER_REQUEST_INVALID', 'intent and semanticRequest are required plain records');
      }
      if (!isPlainRecord(evidence) || typeof evidence.observationId !== 'string') {
        refuse('OBSERVER_REQUEST_INVALID', 'evidence.observationId is required');
      }
      if (!isPlainRecord(evidence.schema)) {
        refuse('OBSERVER_REQUEST_INVALID', 'evidence.schema must be a plain record');
      }
      if (evidence.observedDependencies !== undefined && !Array.isArray(evidence.observedDependencies)) {
        refuse('OBSERVER_REQUEST_INVALID', 'evidence.observedDependencies must be an array when provided');
      }
      if (facade.isClosed()) {
        refuse('OBSERVER_FACADE_CLOSED', 'the observed App facade is closed; no further observation can start');
      }

      // (1) The real selected T02 resolution through the same facade, with the
      // closure-pinned boundary. Errors of the selected feature propagate
      // typed before any occurrence is sent; the bridge never fabricates a
      // decision result.
      hostMeasured.modelCalls = 0;
      hostMeasured.toolCalls = 0;
      const decisionResult = await facade.invokeSelectedStandardFeature(
        deps.semanticFeatureKey,
        semanticRequest,
        Object.freeze({ ...pinnedBoundary }),
      );
      if (!isPlainRecord(decisionResult)) {
        refuse('OBSERVER_SEMANTIC_RESULT_INVALID', 'the selected semantic feature did not return a plain record');
      }

      // (2) The real Kernel path. A typed Kernel refusal means there is NO
      // receipt to observe — it is surfaced typed and never invented into an
      // observation (never-pretend-admitted).
      let receipt: Record<string, unknown>;
      try {
        receipt = await facade.send(intent);
      } catch (error) {
        refuse('OBSERVER_KERNEL_ERROR', 'the selected Kernel refused the intent; no receipt exists to observe', { cause: error });
      }
      if (!isPlainRecord(receipt) || typeof receipt.status !== 'string' || receipt.status.length === 0) {
        refuse('OBSERVER_RECEIPT_INVALID', 'the Kernel return did not carry an honest receipt status; refusing to annotate');
      }
      const receiptSnapshot = deepFreeze(structuredClone(receipt));
      const receiptSha256 = sha256Canonical(receiptSnapshot);
      const outcome = kernelOutcomeOf(receipt.status);
      const occurrence = isPlainRecord(receipt.occurrence) ? receipt.occurrence : {};
      const denial = isPlainRecord(receipt.denial) ? receipt.denial : null;

      // (3) The evidence feature authors the base trace over the actual
      // resolver output. Only whitelisted identity fields are carried; caller
      // request fields never reach the feature through this bridge.
      const evidenceInvokeDeps: Record<string, unknown> = {};
      if (deps.persistObservation !== undefined) evidenceInvokeDeps.persistObservation = deps.persistObservation;
      if (deps.observationTimeoutMs !== undefined) evidenceInvokeDeps.observationTimeoutMs = deps.observationTimeoutMs;
      const base = await facade.invokeSelectedStandardFeature(
        deps.evidenceFeatureKey,
        Object.freeze({
          observationId: evidence.observationId,
          schema: evidence.schema,
          decisionResult,
          ...(evidence.observedDependencies === undefined ? {} : { observedDependencies: evidence.observedDependencies }),
        }),
        evidenceInvokeDeps,
      );
      if (!isPlainRecord(base) || !isPlainRecord(base.decisionTrace) || !isPlainRecord(base.decisionTrace.evidence)) {
        refuse('OBSERVER_EVIDENCE_RESULT_INVALID', 'the selected evidence feature did not author a trace');
      }
      const baseTrace = base.decisionTrace;
      const baseEvidence = baseTrace.evidence as Record<string, unknown>;

      // Host-measured vs resolver-reported counters: agreement is verified,
      // disagreement is marked — neither is silently rewritten. (The feature
      // normalizer reports model calls as `reportedModelCalls` because it
      // deliberately keeps the attestable `modelCalls` slot null; tool calls
      // have no attestable slot and are reported as `toolCalls`.)
      const reportedToolCalls = baseEvidence.toolCalls;
      const reportedMatch = baseEvidence.reportedModelCalls === hostMeasured.modelCalls
        && reportedToolCalls === hostMeasured.toolCalls;
      const decisionTrace = deepFreeze({
        ...baseTrace,
        kernelOutcome: outcome,
        kernelObservation: Object.freeze({
          source: 'host-observed-k-receipt',
          receiptStatus: receipt.status,
          messageId: typeof occurrence.messageId === 'string' ? occurrence.messageId : null,
          workflowInstanceId: typeof occurrence.workflowInstanceId === 'string' ? occurrence.workflowInstanceId : null,
          denialReason: denial !== null && typeof denial.reason === 'string' ? denial.reason : null,
          receiptSha256,
        }),
        evidence: Object.freeze({
          ...baseEvidence,
          hostMeasured: Object.freeze({ ...hostMeasured }),
          modelCallStatus: reportedMatch ? 'host-verified' : 'host-mismatch',
          decisionProvenance: 'host-invoked-selected-feature',
        }),
      });

      return Object.freeze({
        kernelReceipt: receiptSnapshot,
        decisionTrace,
        observationStore: typeof base.observationStore === 'string' ? base.observationStore : 'not-selected',
        observerAbi: OBSERVER_ABI,
      });
    },
  };
}
