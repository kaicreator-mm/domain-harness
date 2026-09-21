import { canonicalJsonStringify, canonicalizeJson, type Sha256Port } from '../contracts/identity.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import type { ResolvedDecision } from '../decision-resolver/contracts.js';
import type { GovernanceBaselineBody } from '../governance/contracts.js';
import {
  sameGovernanceBaselineIdentity,
  verifyGovernanceBaselineBody,
} from '../governance/identity.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import type {
  DomainWorkflowEffectIntent,
  DomainWorkflowTransition,
  DomainWorkflowTrigger,
} from '../workflow/contract.js';
import {
  createPreparedDomainPredicateEvaluationInput,
  evaluateDomainHardInvariantPredicate,
  evaluateDomainWorkflowGuard,
  prepareDomainHardInvariantPredicate,
  prepareDomainPredicateContext,
  prepareDomainPredicateEvent,
  prepareDomainWorkflowGuard,
  type DomainHardInvariantPredicate,
  type DomainPredicate,
  type DomainPredicateEvaluationInput,
} from '../workflow/predicate.js';
import {
  CentralAdmissionError,
  type AdmittedEffectOutcome,
  type AdmissionEffectJournalRecord,
  type AdmissionResolverEvidence,
  type AdmissionTurnSource,
  type CentralAdmissionOutcome,
  type CentralAdmissionPorts,
  type CentralAdmissionRequest,
} from './contracts.js';

function requireComponent(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CentralAdmissionError(
      'ADMISSION_INVALID_TURN_SOURCE',
      `${label} must be a non-empty string`,
    );
  }
  return encodeURIComponent(value);
}

function requireOrdinal(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CentralAdmissionError(
      'ADMISSION_INVALID_TURN_SOURCE',
      `${label} must be a positive safe integer`,
    );
  }
  return value;
}

/**
 * Deterministic Durable Control Turn identity (frozen L2 §13.2). Replaying the
 * same source derives the same id; distinct sources never collide. Synchronous
 * engine microsteps settle inside the containing turn — every effect/query/AI
 * operation identity derives from this id plus a stable operation ordinal.
 */
export function deriveDurableControlTurnId(
  target: WorkflowAddress,
  source: AdmissionTurnSource,
): string {
  const base = `turn:${requireComponent(target.workflowId, 'workflowId')}:${requireComponent(target.instanceKey, 'instanceKey')}`;
  switch (source.kind) {
    case 'message':
      return `${base}:message:${requireComponent(source.sourceMessageId, 'sourceMessageId')}`;
    case 'child-terminal':
      if (source.terminalKind !== 'done' && source.terminalKind !== 'error') {
        throw new CentralAdmissionError(
          'ADMISSION_INVALID_TURN_SOURCE',
          'terminalKind must be done or error',
        );
      }
      return `${base}:child:${requireComponent(source.parentActorId, 'parentActorId')}:${requireComponent(source.childActorId, 'childActorId')}:${requireOrdinal(source.invocationOrdinal, 'invocationOrdinal')}:${source.terminalKind}`;
    case 'timer':
      return `${base}:timer:${requireComponent(source.timerId, 'timerId')}:${requireOrdinal(source.fireOrdinal, 'fireOrdinal')}`;
    case 'callback':
      return `${base}:callback:${requireComponent(source.externalCorrelationId, 'externalCorrelationId')}:${requireOrdinal(source.callbackOrdinal, 'callbackOrdinal')}`;
    case 'recovery':
      return `${base}:recovery:${requireComponent(source.durableRecoveryActionId, 'durableRecoveryActionId')}:${requireOrdinal(source.resumeOrdinal, 'resumeOrdinal')}`;
    default:
      throw new CentralAdmissionError('ADMISSION_INVALID_TURN_SOURCE', 'unknown turn source kind');
  }
}

/** §21 handoff: resolver telemetry/LLM-avoidance evidence for the turn receipt. */
export function admissionResolverEvidence(
  resolved: ResolvedDecision<JsonValue>,
): AdmissionResolverEvidence {
  return {
    source: resolved.source,
    llmAvoided: resolved.llmAvoided,
    freshModelCallCount: resolved.freshModelCallCount,
    cacheRead: resolved.cacheDisposition.read,
    ...(resolved.cacheDisposition.write === undefined
      ? {}
      : { cacheWrite: resolved.cacheDisposition.write }),
    telemetryEventCount: resolved.telemetry.length,
  };
}

/**
 * The pinned baseline body is the only Hard Invariant source. Structurally
 * malformed content fails closed loudly; evaluation-time predicate errors are
 * denied by the T-006 evaluator (false), which is already the safe direction.
 */
function readPinnedHardInvariants(
  body: GovernanceBaselineBody,
): readonly DomainHardInvariantPredicate[] {
  const raw = body.semantics['hardInvariants'];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new CentralAdmissionError(
      'ADMISSION_INVALID_HARD_INVARIANTS',
      'pinned baseline semantics.hardInvariants must be an array when present',
    );
  }
  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new CentralAdmissionError(
        'ADMISSION_INVALID_HARD_INVARIANTS',
        `hardInvariants[${index}] must be an object`,
      );
    }
    const record = entry as Record<string, unknown>;
    if (typeof record['invariantId'] !== 'string' || record['invariantId'].length === 0) {
      throw new CentralAdmissionError(
        'ADMISSION_INVALID_HARD_INVARIANTS',
        `hardInvariants[${index}].invariantId must be a non-empty string`,
      );
    }
    if (typeof record['predicate'] !== 'object' || record['predicate'] === null || Array.isArray(record['predicate'])) {
      throw new CentralAdmissionError(
        'ADMISSION_INVALID_HARD_INVARIANTS',
        `hardInvariants[${index}].predicate must be a predicate object`,
      );
    }
    return {
      invariantId: record['invariantId'],
      predicate: record['predicate'] as DomainPredicate,
    };
  });
}

async function requirePinnedBaseline(
  request: CentralAdmissionRequest,
  ports: CentralAdmissionPorts,
  sha256: Sha256Port,
): Promise<{ readonly bindingDigest: string; readonly hardInvariants: readonly DomainHardInvariantPredicate[] }> {
  // T-014 gate: pinned governance for EVERY authoritative admission. Pin
  // absence/invalidity propagates as GovernanceExecutionBindingError.
  const pin = await ports.governance.requirePinnedExecution(request.workflowInstanceId);
  const body = await ports.baselines.getBody(pin.governanceBaseline);
  if (body === undefined) {
    throw new CentralAdmissionError(
      'ADMISSION_PINNED_BASELINE_UNAVAILABLE',
      `exact pinned Governance Baseline ${pin.governanceBaseline.governanceId}@${pin.governanceBaseline.contentDigest} is unavailable; no substitution is permitted`,
    );
  }
  try {
    await verifyGovernanceBaselineBody(body, sha256);
  } catch (error) {
    throw new CentralAdmissionError(
      'ADMISSION_PINNED_BASELINE_UNAVAILABLE',
      `exact pinned Governance Baseline body is corrupt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!sameGovernanceBaselineIdentity(body.identity, pin.governanceBaseline)) {
    throw new CentralAdmissionError(
      'ADMISSION_PINNED_BASELINE_UNAVAILABLE',
      'resolved Governance Baseline body does not match the exact GovernanceExecutionPin',
    );
  }
  return { bindingDigest: pin.bindingDigest, hardInvariants: readPinnedHardInvariants(body) };
}

function sameTrigger(left: DomainWorkflowTrigger, right: DomainWorkflowTrigger): boolean {
  return canonicalJsonStringify(left) === canonicalJsonStringify(right);
}

function deny(
  reason: 'schema' | 'hard-invariant' | 'guard' | 'no-candidate-transition',
  turnId: string,
  bindingDigest: string,
  resolver: AdmissionResolverEvidence,
  extras: {
    readonly invariantId?: string;
    readonly transitionKey?: string;
    readonly guardId?: string;
  } = {},
): CentralAdmissionOutcome {
  return {
    status: 'denied',
    denial: {
      reason,
      durableControlTurnId: turnId,
      governanceBindingDigest: bindingDigest,
      ...(extras.invariantId === undefined ? {} : { invariantId: extras.invariantId }),
      ...(extras.transitionKey === undefined ? {} : { transitionKey: extras.transitionKey }),
      ...(extras.guardId === undefined ? {} : { guardId: extras.guardId }),
      resolver,
    },
  };
}

function evaluateHardInvariants(
  hardInvariants: readonly DomainHardInvariantPredicate[],
  input: DomainPredicateEvaluationInput,
): string | undefined {
  for (const invariant of hardInvariants) {
    const prepared = prepareDomainHardInvariantPredicate(invariant);
    if (!evaluateDomainHardInvariantPredicate(prepared, input)) {
      return invariant.invariantId;
    }
  }
  return undefined;
}

function selectAdmittedTransition(
  request: CentralAdmissionRequest,
  input: DomainPredicateEvaluationInput,
): { readonly admitted: DomainWorkflowTransition } | { readonly rejected: { readonly transitionKey: string; readonly guardId?: string } } | { readonly noCandidate: true } {
  const state = request.definition.states.find((candidate) => candidate.stateKey === request.currentStateKey);
  if (state === undefined) {
    throw new CentralAdmissionError(
      'ADMISSION_UNKNOWN_STATE',
      `current state ${request.currentStateKey} is not declared in workflow ${request.definition.workflowKey}`,
    );
  }
  const guards = new Map((request.definition.guards ?? []).map((guard) => [guard.guardId, guard] as const));
  const candidates = (state.transitions ?? []).filter((transition) => sameTrigger(transition.trigger, request.trigger));
  if (candidates.length === 0) return { noCandidate: true };

  let lastRejected: { readonly transitionKey: string; readonly guardId?: string } | undefined;
  for (const candidate of candidates) {
    let guardPasses = true;
    let guardId: string | undefined;
    if (candidate.guardId !== undefined) {
      const guard = guards.get(candidate.guardId);
      if (guard === undefined) {
        throw new CentralAdmissionError(
          'ADMISSION_UNKNOWN_GUARD',
          `transition ${candidate.transitionKey} references unknown guard ${candidate.guardId}`,
        );
      }
      guardId = guard.guardId;
      guardPasses = evaluateDomainWorkflowGuard(prepareDomainWorkflowGuard(guard), input);
    }
    if (guardPasses) return { admitted: candidate };
    lastRejected = {
      transitionKey: candidate.transitionKey,
      ...(guardId === undefined ? {} : { guardId }),
    };
  }
  return { rejected: lastRejected ?? { transitionKey: candidates[0]?.transitionKey ?? '' } };
}

async function executeEffectIntents(
  intents: readonly DomainWorkflowEffectIntent[],
  request: CentralAdmissionRequest,
  ports: CentralAdmissionPorts,
  turnId: string,
): Promise<readonly AdmittedEffectOutcome[]> {
  const outcomes: AdmittedEffectOutcome[] = [];
  let ordinal = 0;
  for (const intent of intents) {
    ordinal += 1;
    const effectId = `${turnId}/effect/${ordinal}`;
    const binding = ports.effectTools.resolve(intent.effectType);
    if (binding === undefined) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_TOOL_UNBOUND',
        `no mutation-capable tool binding is declared for effect type ${intent.effectType}`,
      );
    }
    const record: AdmissionEffectJournalRecord = {
      effectId,
      target: request.target,
      durableControlTurnId: turnId,
      operationOrdinal: ordinal,
      effectType: intent.effectType,
      effectSemantics: binding.effectSemantics,
      status: 'started',
      attempt: 1,
      input: intent.input,
      ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
      startedAt: request.now,
    };

    let begun: { readonly disposition: 'created' | 'existing'; readonly record: AdmissionEffectJournalRecord };
    try {
      begun = await ports.effectJournal.beginEffect(record);
    } catch (error) {
      if (error instanceof CentralAdmissionError) throw error;
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect journal begin failed for ${effectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const durable = begun.record;

    if (durable.status === 'completed') {
      // §18: a completed durable effect found during recovery is reused; the
      // mutation is never re-executed (V8/V12 — no evidence port involved).
      outcomes.push({
        effectId,
        effectType: durable.effectType,
        disposition: 'replayed',
        ...(durable.idempotencyKey === undefined ? {} : { idempotencyKey: durable.idempotencyKey }),
        ...(durable.output === undefined ? {} : { output: durable.output }),
      });
      continue;
    }
    if (durable.status === 'failed') {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_FAILED',
        `effect ${effectId} has a durably failed outcome; operator recovery owns any retry`,
      );
    }
    if (begun.disposition === 'existing' && durable.effectSemantics === 'non-idempotent') {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_AMBIGUOUS',
        `effect ${effectId} was started but never committed; re-executing a non-idempotent effect is forbidden`,
      );
    }

    let output: JsonValue;
    try {
      output = await ports.effectTools.execute({
        effectId,
        target: request.target,
        durableControlTurnId: turnId,
        operationOrdinal: ordinal,
        binding,
        input: intent.input,
        ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
        logicalTime: request.now,
      });
      canonicalizeJson(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure: JsonObject = { message };
      await ports.effectJournal
        .completeEffect(effectId, { status: 'failed', error: failure, completedAt: request.now })
        .catch(() => undefined);
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_FAILED',
        `effect ${effectId} (${intent.effectType}) failed: ${message}`,
      );
    }

    let committed: AdmissionEffectJournalRecord;
    try {
      committed = await ports.effectJournal.completeEffect(
        effectId,
        { status: 'completed', output, completedAt: request.now },
      );
    } catch (error) {
      // Never repeat the external mutation in this attempt; a fresh attempt
      // re-reads the durable journal and either replays or fails closed.
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect journal commit for ${effectId} is ambiguous: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    outcomes.push({
      effectId,
      effectType: intent.effectType,
      disposition: 'executed',
      ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
      ...(committed.output === undefined ? {} : { output: committed.output }),
    });
  }
  return outcomes;
}

/**
 * The single central authoritative admission path (frozen L2 §15, Amendment
 * A1 §8.1): structured result → current schema → pinned Governance Baseline
 * Hard Invariants → current guard → transition → durable effect intent.
 *
 * Every resolver source (rule / exact cache / promoted subworkflow / Business
 * Harness) passes the same gates, so no source can bypass admission. The
 * admitted output is a plan for the parent Durable Control Turn publication;
 * admission itself never mutates workflow state, message dispositions or
 * control snapshots, and holds no resolver/evidence handle — guard rejection
 * is final, with no hidden resolver retry (S7).
 */
export async function admitCentralDecision(
  request: CentralAdmissionRequest,
  ports: CentralAdmissionPorts,
): Promise<CentralAdmissionOutcome> {
  const turnId = deriveDurableControlTurnId(request.target, request.turn);
  const pinned = await requirePinnedBaseline(request, ports, ports.sha256);
  const resolver = admissionResolverEvidence(request.resolved);

  const input = createPreparedDomainPredicateEvaluationInput(
    prepareDomainPredicateContext(request.context),
    prepareDomainPredicateEvent(request.event),
  );

  if (!request.decisionSchema.isValid(request.resolved.structuredDecision)) {
    return deny('schema', turnId, pinned.bindingDigest, resolver);
  }

  const failedInvariant = evaluateHardInvariants(pinned.hardInvariants, input);
  if (failedInvariant !== undefined) {
    return deny('hard-invariant', turnId, pinned.bindingDigest, resolver, { invariantId: failedInvariant });
  }

  const selection = selectAdmittedTransition(request, input);
  if ('noCandidate' in selection) {
    return deny('no-candidate-transition', turnId, pinned.bindingDigest, resolver);
  }
  if ('rejected' in selection) {
    return deny('guard', turnId, pinned.bindingDigest, resolver, selection.rejected);
  }

  const effects = await executeEffectIntents(
    selection.admitted.effectIntents ?? [],
    request,
    ports,
    turnId,
  );

  return {
    status: 'admitted',
    admitted: {
      durableControlTurnId: turnId,
      governanceBindingDigest: pinned.bindingDigest,
      transitionKey: selection.admitted.transitionKey,
      targetState: selection.admitted.targetState,
      effects,
      resolver,
    },
  };
}
