import type { RuntimeStore } from '../v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import { workflowAddressKey } from '../instance/workflow-address.js';
import type { PerInstanceSerializedLane } from '../engine/per-instance-serialized-lane.js';
import type { PoisonMessageRecoveryCoordinator } from '../recovery-v2/poison-message-recovery.js';
import { AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE } from '../recovery-v2/contracts.js';
import {
  RUNTIME_CONTROL_PROVENANCE_KIND,
  runtimeControlProvenanceOf,
  runtimeControlTerminalizeReason,
  type RuntimeControlAuthorizationDecision,
  type RuntimeControlReceiptDisposition,
  type RuntimeControlAuthorizationEvidence,
  type RuntimeControlAuthorizer,
  type RuntimeControlEffectEvidence,
  type RuntimeControlOutcome,
  type RuntimeControlProvenance,
  type RuntimeControlReceipt,
  type RuntimeControlRecord,
  type RuntimeControlRequest,
  type RuntimeControlStore,
  type RuntimeControlTurnSelector,
} from './contracts.js';

/** Error carrying the durable identity of the control that issued an internal AbortSignal. */
export class RuntimeControlInterruptSignal extends Error {
  constructor(readonly controlRequestId: string) {
    super(`Runtime control ${controlRequestId} interrupted the in-flight turn`);
    this.name = 'RuntimeControlInterruptSignal';
  }
}

/** In-flight turn handle (private; never exposed publicly). */
export interface ActiveRuntimeTurn {
  readonly messageId: string;
  readonly targetSequence: number;
  readonly controller: AbortController;
  /** Resolves once the turn's serialized processing settles (commit or failure). */
  readonly settled: Promise<void>;
}

export interface RuntimeControlRuntimePorts {
  /** Authoritative per-instance facts (store is the durability authority). */
  readonly store: RuntimeStore;
  readonly recovery: PoisonMessageRecoveryCoordinator;
  /** The SAME per-instance serialized lane used by mailbox turns: this is the
   *  deterministic control-vs-commit serialization point. */
  readonly lane: PerInstanceSerializedLane;
  readonly now: () => string;
  /** Current in-flight turn of one target, if any (live-process fact). */
  activeTurn(target: WorkflowAddress): ActiveRuntimeTurn | undefined;
  /** Called after a pending CANCEL stops blocking new turns without terminalizing. */
  onNewTurnsUnblocked(target: WorkflowAddress): void;
}

export interface RuntimeControlCoordinatorOptions {
  readonly authorizer: RuntimeControlAuthorizer;
  readonly store: RuntimeControlStore;
  readonly ports: RuntimeControlRuntimePorts;
}

function isTerminal(lifecycle: WorkflowInstanceSnapshot['lifecycle']): boolean {
  return (
    lifecycle === 'completed' ||
    lifecycle === 'failed' ||
    lifecycle === 'cancelled' ||
    lifecycle === 'terminated'
  );
}

function sameRequestIdentity(
  record: RuntimeControlRecord,
  request: RuntimeControlRequest,
): boolean {
  return (
    record.callerRef === request.callerRef &&
    record.action === request.action &&
    record.target.workflowId === request.target.target.workflowId &&
    record.target.instanceKey === request.target.target.instanceKey &&
    record.expectedStateRevision === request.target.expectedStateRevision &&
    record.expectedTurn?.messageId === request.target.expectedTurn?.messageId &&
    record.expectedTurn?.targetSequence === request.target.expectedTurn?.targetSequence &&
    record.reason === request.reason
  );
}

/**
 * Issue #313 control coordinator. Owns the durable control lifecycle
 * (requested -> accepted -> resolving -> terminal outcome), the fail-closed
 * authorization seam and restart reconciliation. Deterministic winner rule:
 * control resolution and turn commits serialize on the same per-instance lane,
 * and every outcome is derived purely from durable facts read at resolution
 * time — an ignored internal signal can never fabricate a stop.
 */
export class RuntimeControlCoordinator {
  readonly #authorizer: RuntimeControlAuthorizer;
  readonly #controlStore: RuntimeControlStore;
  readonly #ports: RuntimeControlRuntimePorts;
  readonly #pendingCancelTargets = new Set<string>();

  constructor(options: RuntimeControlCoordinatorOptions) {
    this.#authorizer = options.authorizer;
    this.#controlStore = options.store;
    this.#ports = options.ports;
  }

  /** Drain gate: while a CANCEL intent is accepted-but-unresolved, no new turn may begin. */
  blocksNewTurns(target: WorkflowAddress): boolean {
    return this.#pendingCancelTargets.has(workflowAddressKey(target));
  }

  async requestControl(request: RuntimeControlRequest): Promise<RuntimeControlReceipt> {
    if (request.controlRequestId.length === 0 || request.callerRef.length === 0) {
      throw new Error('Runtime control requires controlRequestId and callerRef');
    }

    // Duplicate/conflicting reuse is decided BEFORE any re-authorization: a
    // replayed id resolves against the original authorization evidence.
    const existing = await this.#controlStore.getRequest(request.controlRequestId);
    if (existing !== null) {
      if (sameRequestIdentity(existing, request)) {
        return {
          controlRequestId: existing.controlRequestId,
          status: existing.status,
          disposition: 'DUPLICATE',
          ...(existing.outcome === undefined ? {} : { outcome: existing.outcome }),
          record: existing,
        };
      }
      // Conflicting reuse of a stable request id fails closed; the original
      // durable evidence is never rewritten.
      return {
        controlRequestId: existing.controlRequestId,
        status: existing.status,
        disposition: 'REJECTED',
        record: existing,
      };
    }

    const decision = await this.#authorize(request);
    const authorization = authorizationEvidence(request.callerRef, decision);
    if (decision.status !== 'AUTHORIZED') {
      // DENIED / UNKNOWN: no Runtime mutation; the attempt is still durable evidence.
      const record = await this.#createResolved(
        request,
        authorization,
        'REJECTED',
        'REJECTED',
      );
      return receiptOf(record);
    }

    if (request.action === 'PAUSE' || request.action === 'RESUME') {
      // Explicit UNSUPPORTED, no hidden semantics, no mutation.
      const record = await this.#createResolved(
        request,
        authorization,
        'UNSUPPORTED_ACTION',
        'UNSUPPORTED',
      );
      return receiptOf(record, 'UNSUPPORTED_ACTION');
    }

    const created = await this.#controlStore.createRequest({
      controlRequestId: request.controlRequestId,
      action: request.action,
      target: request.target.target,
      ...(request.target.expectedStateRevision === undefined
        ? {}
        : { expectedStateRevision: request.target.expectedStateRevision }),
      ...(request.target.expectedTurn === undefined
        ? {}
        : { expectedTurn: request.target.expectedTurn }),
      callerRef: request.callerRef,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      authorization,
      status: 'accepted',
      receiptDisposition: 'ACCEPTED',
      outcome: 'PENDING',
      requestedAt: this.#ports.now(),
    });
    if (created.disposition !== 'created') {
      // Concurrent creator won the id; reply from the durable winner.
      return receiptOf(created.record, created.disposition === 'duplicate' ? 'DUPLICATE' : 'REJECTED');
    }

    if (request.action === 'CANCEL') {
      return this.#executeCancel(created.record);
    }
    return this.#executeInterrupt(created.record);
  }

  async getControlOutcome(controlRequestId: string): Promise<RuntimeControlRecord | null> {
    return this.#controlStore.getRequest(controlRequestId);
  }

  /**
   * Startup reconciliation of accepted/resolving controls after process loss.
   * Never blindly reissues a signal or a new intent: each unresolved record is
   * classified purely from authoritative instance/message/effect facts. An
   * accepted CANCEL completes from those facts (it was already a durable
   * admitted intent); an INTERRUPT can only be classified, never re-fired.
   */
  async reconcileUnresolved(): Promise<void> {
    const unresolved = await this.#controlStore.listUnresolvedRequests();
    for (const record of unresolved) {
      if (record.action === 'CANCEL') {
        await this.#executeCancel(record);
      } else if (record.action === 'INTERRUPT') {
        await this.#resolveOnLane(record.target, () => this.#resolveInterruptFacts(record));
      }
    }
  }

  async #authorize(
    request: RuntimeControlRequest,
  ): Promise<RuntimeControlAuthorizationDecision> {
    try {
      return await this.#authorizer.authorize({
        controlRequestId: request.controlRequestId,
        callerRef: request.callerRef,
        target: request.target.target,
        action: request.action,
        ...(request.target.expectedStateRevision === undefined
          ? {}
          : { expectedStateRevision: request.target.expectedStateRevision }),
        ...(request.target.expectedTurn === undefined
          ? {}
          : { expectedTurn: request.target.expectedTurn }),
        ...(request.reason === undefined ? {} : { reason: request.reason }),
      });
    } catch {
      // The authorization seam fails closed on its own errors.
      return { status: 'UNKNOWN', code: 'authorizer_error' };
    }
  }

  async #createResolved(
    request: RuntimeControlRequest,
    authorization: RuntimeControlAuthorizationEvidence,
    disposition: RuntimeControlReceiptDisposition,
    outcome: 'REJECTED' | 'UNSUPPORTED',
  ): Promise<RuntimeControlRecord> {
    const created = await this.#controlStore.createRequest({
      controlRequestId: request.controlRequestId,
      action: request.action,
      target: request.target.target,
      ...(request.target.expectedStateRevision === undefined
        ? {}
        : { expectedStateRevision: request.target.expectedStateRevision }),
      ...(request.target.expectedTurn === undefined
        ? {}
        : { expectedTurn: request.target.expectedTurn }),
      callerRef: request.callerRef,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      authorization,
      status: 'resolved',
      receiptDisposition: disposition,
      outcome,
      requestedAt: this.#ports.now(),
      resolvedAt: this.#ports.now(),
    });
    return created.record;
  }

  async #executeCancel(record: RuntimeControlRecord): Promise<RuntimeControlReceipt> {
    const key = workflowAddressKey(record.target);
    this.#pendingCancelTargets.add(key);
    try {
      // Safe-boundary wait: the in-flight turn (if any) completes to its durable
      // commit; CANCEL then applies at the next boundary and no new turn may
      // begin while the cancel intent is pending (drain gate).
      const active = this.#ports.activeTurn(record.target);
      if (active !== undefined) await active.settled;
      const resolved = await this.#resolveOnLane(record.target, () =>
        this.#resolveCancelFacts(record),
      );
      return receiptOf(resolved);
    } finally {
      this.#pendingCancelTargets.delete(key);
      // If the cancel did not terminalize (stale/rejected/ambiguity), queued
      // accepted work must be allowed to drain again.
      this.#ports.onNewTurnsUnblocked(record.target);
    }
  }

  async #executeInterrupt(record: RuntimeControlRecord): Promise<RuntimeControlReceipt> {
    const active = this.#ports.activeTurn(record.target);
    if (active === undefined) {
      // No live turn: classify from facts (NO_ACTIVE_TURN / TOO_LATE / etc.).
      const resolved = await this.#resolveOnLane(record.target, () =>
        this.#resolveInterruptFacts(record),
      );
      return receiptOf(resolved);
    }

    if (!turnSelectorMatches(record.expectedTurn, active)) {
      // Stale selector never retargets a newer/older turn: no signal, no mutation.
      const resolved = await this.#resolveStale(record);
      return receiptOf(resolved);
    }

    // Durable claim BEFORE the signal: the resolving record with its claimed
    // turn is committed first, then the in-flight turn is signalled.
    const claimed: RuntimeControlTurnSelector = {
      messageId: active.messageId,
      ...(active.targetSequence === undefined
        ? {}
        : { targetSequence: active.targetSequence }),
    };
    const claiming = await this.#controlStore.transitionRequest(
      record.controlRequestId,
      'accepted',
      {
        status: 'resolving',
        claimedTurn: claimed,
        signalIssued: true,
      },
    );
    active.controller.abort(new RuntimeControlInterruptSignal(record.controlRequestId));
    // Deterministic winner: the turn either observes the signal and refuses to
    // commit (control wins) or commits before/regardless of it (turn wins).
    await active.settled;
    const resolved = await this.#resolveOnLane(record.target, () =>
      this.#resolveInterruptFacts(claiming, claimed),
    );
    return receiptOf(resolved);
  }

  #resolveOnLane(
    target: WorkflowAddress,
    resolve: () => Promise<RuntimeControlRecord>,
  ): Promise<RuntimeControlRecord> {
    return this.#ports.lane.run(target, resolve);
  }

  async #resolveStale(record: RuntimeControlRecord): Promise<RuntimeControlRecord> {
    return this.#resolve(record, 'STALE_TARGET', 'STALE_TARGET', {});
  }

  async #resolveInterruptFacts(
    record: RuntimeControlRecord,
    claimed?: RuntimeControlTurnSelector,
  ): Promise<RuntimeControlRecord> {
    const instance = await this.#ports.store.getInstance(record.target);
    if (instance === null) {
      return this.#resolve(record, 'REJECTED', 'REJECTED', {});
    }
    if (
      record.expectedStateRevision !== undefined &&
      record.expectedStateRevision !== instance.stateRevision
    ) {
      return this.#resolve(record, 'STALE_TARGET', 'STALE_TARGET', {});
    }

    const selector = claimed ?? record.claimedTurn;
    const disposition =
      selector === undefined
        ? null
        : await this.#ports.store.getMessageDisposition(record.target, selector.messageId);

    // The targeted turn committed before the control could claim it: history is
    // never rewritten — report TOO_LATE even when the instance has since
    // reached any other (terminal) state.
    if (disposition !== null && disposition.disposition === 'processed') {
      return this.#resolve(record, 'ACCEPTED', 'TOO_LATE_TURN_COMMITTED', {});
    }
    if (isTerminal(instance.lifecycle)) {
      return this.#resolve(record, 'ALREADY_TERMINAL', 'ALREADY_TERMINAL', {});
    }

    if (instance.lifecycle === 'recovery_required') {
      const failure = instance.failure;
      if (failure?.code === AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE) {
        // Unresolved non-idempotent ambiguity is stronger than any stop claim.
        return this.#resolve(record, 'ACCEPTED', 'REQUIRES_RECONCILIATION', {
          effectEvidence: await this.#effectEvidenceFor(failure.effectId),
        });
      }
      const provenance = runtimeControlProvenanceOf(instance);
      if (
        provenance?.kind === RUNTIME_CONTROL_PROVENANCE_KIND &&
        provenance.controlRequestId === record.controlRequestId
      ) {
        return this.#resolve(record, 'ACCEPTED', 'INTERRUPTED_TO_RECOVERY_REQUIRED', {});
      }
      // recovery_required without this control's provenance: contradictory evidence.
      return this.#resolve(record, 'ACCEPTED', 'UNKNOWN', {});
    }
    if (disposition !== null && disposition.disposition === 'failed') {
      // Failed without recovery_required provenance for this control: the
      // durable facts do not prove who stopped the turn.
      return this.#resolve(record, 'ACCEPTED', 'UNKNOWN', {});
    }
    // No active turn at fact time (never active, or reclaimed after a crash).
    return this.#resolve(record, 'NO_ACTIVE_TURN', 'NO_ACTIVE_TURN', {});
  }

  async #resolveCancelFacts(record: RuntimeControlRecord): Promise<RuntimeControlRecord> {
    const instance = await this.#ports.store.getInstance(record.target);
    if (instance === null) {
      return this.#resolve(record, 'REJECTED', 'REJECTED', {});
    }
    if (
      record.expectedStateRevision !== undefined &&
      record.expectedStateRevision !== instance.stateRevision
    ) {
      return this.#resolve(record, 'STALE_TARGET', 'STALE_TARGET', {});
    }
    if (isTerminal(instance.lifecycle)) {
      const provenance = runtimeControlProvenanceOf(instance);
      if (
        instance.lifecycle === 'cancelled' &&
        provenance?.controlRequestId === record.controlRequestId
      ) {
        // Already durably cancelled by this exact control (restart rule 1).
        return this.#resolve(record, 'ACCEPTED', 'CANCELLED_AT_SAFE_BOUNDARY', {});
      }
      return this.#resolve(record, 'ALREADY_TERMINAL', 'ALREADY_TERMINAL', {});
    }

    if (instance.lifecycle === 'recovery_required') {
      const failure = instance.failure;
      if (failure?.code === AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE) {
        // CANCELLED_AT_SAFE_BOUNDARY is forbidden while ambiguity is unresolved.
        return this.#resolve(record, 'ACCEPTED', 'REQUIRES_RECONCILIATION', {
          effectEvidence: await this.#effectEvidenceFor(failure.effectId),
        });
      }
    }

    // Safe boundary with no unresolved non-idempotent ambiguity: terminalize
    // to `cancelled` under exact control provenance. Queued accepted messages
    // take the existing terminal/abandoned disposition; the effect journal and
    // all history/evidence are preserved (cancel is never rollback).
    const provenance: RuntimeControlProvenance = {
      kind: RUNTIME_CONTROL_PROVENANCE_KIND,
      controlRequestId: record.controlRequestId,
      action: 'CANCEL',
      authorizationRef: record.authorization.decision === 'AUTHORIZED'
        ? record.authorization.authorizationRef
        : '',
      policyRevision: record.authorization.decision === 'AUTHORIZED'
        ? record.authorization.policyRevision
        : '',
    };
    await this.#ports.recovery.terminalize({
      mode: instance.lifecycle === 'recovery_required' ? 'recovery' : 'normal',
      target: record.target,
      lifecycle: 'cancelled',
      reason: runtimeControlTerminalizeReason(provenance),
      authorization: {
        kind: 'domain-authorized',
        reason: `runtime-control:${record.controlRequestId}`,
      },
    });
    return this.#resolve(record, 'ACCEPTED', 'CANCELLED_AT_SAFE_BOUNDARY', {
      observedStateRevision: (await this.#ports.store.getInstance(record.target))
        ?.stateRevision,
    });
  }

  async #effectEvidenceFor(
    effectId: string | undefined,
  ): Promise<readonly RuntimeControlEffectEvidence[] | undefined> {
    if (effectId === undefined || effectId.length === 0) return undefined;
    const journal = await this.#ports.store.getEffect(effectId);
    return [
      {
        effectId,
        semantics: 'non-idempotent',
        durableStatus: journal === null ? 'unknown' : journal.status,
        ...(journal === null ? {} : { reconciliationRef: `${journal.effectKind}:${journal.attempt}` }),
      },
    ];
  }

  async #resolve(
    record: RuntimeControlRecord,
    disposition: RuntimeControlReceiptDisposition,
    outcome: RuntimeControlOutcome,
    extra: {
      observedStateRevision?: number | undefined;
      effectEvidence?: readonly RuntimeControlEffectEvidence[] | undefined;
    },
  ): Promise<RuntimeControlRecord> {
    try {
      return await this.#controlStore.transitionRequest(
        record.controlRequestId,
        record.status,
        {
          status: 'resolved',
          receiptDisposition: disposition,
          outcome,
          resolvedAt: this.#ports.now(),
          ...(extra.observedStateRevision === undefined
            ? {}
            : { observedStateRevision: extra.observedStateRevision }),
          ...(extra.effectEvidence === undefined || extra.effectEvidence.length === 0
            ? {}
            : { effectEvidence: extra.effectEvidence }),
        },
      );
    } catch {
      // CAS failure means a concurrent resolution won (single-writer store) —
      // or the record already reconciled. Never overwrite: read and return.
      const current = await this.#controlStore.getRequest(record.controlRequestId);
      if (current !== null) return current;
      throw new Error(
        `Runtime control record ${record.controlRequestId} disappeared during resolution`,
      );
    }
  }
}

function turnSelectorMatches(
  expected: RuntimeControlTurnSelector | undefined,
  active: ActiveRuntimeTurn,
): boolean {
  if (expected === undefined) return true;
  if (expected.messageId !== active.messageId) return false;
  return expected.targetSequence === undefined || expected.targetSequence === active.targetSequence;
}

function authorizationEvidence(
  callerRef: string,
  decision: RuntimeControlAuthorizationDecision,
): RuntimeControlAuthorizationEvidence {
  if (decision.status === 'AUTHORIZED') {
    return {
      decision: 'AUTHORIZED',
      callerRef,
      authorizationRef: decision.authorizationRef,
      policyRevision: decision.policyRevision,
    };
  }
  return {
    decision: decision.status,
    callerRef,
    code: decision.code,
    ...(decision.reason === undefined ? {} : { reason: decision.reason }),
  };
}

function receiptOf(
  record: RuntimeControlRecord,
  overrideDisposition?: RuntimeControlReceipt['disposition'],
): RuntimeControlReceipt {
  return {
    controlRequestId: record.controlRequestId,
    status: record.status,
    disposition: overrideDisposition ?? record.receiptDisposition ?? 'ACCEPTED',
    ...(record.outcome === undefined ? {} : { outcome: record.outcome }),
    record,
  };
}
