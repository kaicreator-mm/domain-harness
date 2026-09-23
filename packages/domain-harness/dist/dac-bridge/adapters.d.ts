import type { CommandRef, DacIntentAdoptionInput, DacObservedBasis, DomainCommandCorrelation, DomainIntentRef, DomainOutcomeCorrelation, OutcomeRef, SemanticTargetRef, SnapshotRef, ViewRef, WatchRef } from './contracts.js';
import type { DomainMessage, MessageAcceptedAck, MessageDispositionSnapshot } from '../v2/contracts/message.js';
import type { DomainQuery, DomainQueryResult } from '../v2/contracts/query.js';
import type { BusinessSnapshot, ProjectionSnapshot } from '../v2/contracts/projection.js';
import type { WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import type { DomainChange, DomainSubscription } from '../v2/contracts/subscription.js';
/** Structural validation of an observed basis; mutable-alias revisions fail closed. */
export declare function validateObservedBasis(basis: unknown, field: string): asserts basis is DacObservedBasis;
/** Adopt a domain/application semantic-target identity (DAC `SemanticTargetRef`). */
export declare function adoptSemanticTargetRef(input: DacIntentAdoptionInput): SemanticTargetRef;
/** Adopt a UX-authored intent correlation (DAC `DomainIntentRef`). */
export declare function adoptDomainIntentRef(input: DacIntentAdoptionInput): DomainIntentRef;
/**
 * Derive the Runtime command identity (DAC `CommandRef`) from an actual
 * `DomainMessage`. This adapts the existing message identity — it never
 * mints a second command authority, which is why this is the ONLY
 * constructor for CommandRefs.
 */
export declare function commandRefFromDomainMessage(message: DomainMessage): CommandRef;
/**
 * Bind one command to its optional UX origin chain. All correlation members
 * are optional by origin (internal commands without a UX origin stay valid),
 * but contradictions fail closed: two different semantic targets, or two
 * different observed bases, are a CORRELATION_CONFLICT — never silently
 * reconciled by preferring one side (DAC section 11: a consumer MUST NOT
 * silently reinterpret a reference).
 */
export declare function correlateDomainCommand(message: DomainMessage, correlation?: {
    readonly intent?: DomainIntentRef;
    readonly semanticTarget?: SemanticTargetRef;
    readonly observedBasis?: DacObservedBasis;
}): DomainCommandCorrelation;
/**
 * Derive the Runtime-logical outcome correlation (DAC `OutcomeRef`) from a
 * `MessageDispositionSnapshot`. The result is Runtime-scope truth only: it
 * structurally cannot claim an external business outcome
 * (`externalAuthorityOutcome: 'not-claimed'`), and any durable-effect
 * ambiguity stays correlated — never strengthened — via `failure.effectId`
 * pointing at the existing effect evidence mechanisms.
 */
export declare function outcomeRefFromMessageDisposition(disposition: MessageDispositionSnapshot): OutcomeRef;
/**
 * Derive the immediate `accepted` OutcomeRef from a `MessageAcceptedAck`
 * (`status: 'duplicate'` maps to the ack's existing disposition semantics of
 * an already-accepted command and is still an outcome correlation, carried in
 * `opaque.ackStatus`). No external claim is made here either.
 */
export declare function outcomeRefFromAcceptedAck(ack: MessageAcceptedAck): OutcomeRef;
/**
 * Correlate an outcome with the command correlation it resolves. The
 * outcome must resolve the SAME command (messageId + target) or the binding
 * fails closed — a causal chain is never assembled across different
 * commands. Presence of an intent here is correlation evidence only; it
 * never influenced the Runtime decision.
 */
export declare function correlateDomainOutcome(input: {
    readonly disposition?: MessageDispositionSnapshot;
    readonly ack?: MessageAcceptedAck;
    readonly correlation?: DomainCommandCorrelation;
}): DomainOutcomeCorrelation;
/**
 * Derive the renderer-neutral view identity (DAC `ViewRef`) from an existing
 * query and its result. Identity/revision only — the view's data stays in the
 * query result; no rendering semantics exist here. The result must answer the
 * same query kind or the pairing fails closed.
 */
export declare function viewRefFromQueryResult(request: DomainQuery, result: DomainQueryResult): ViewRef;
/** SnapshotRef basis from a `WorkflowInstanceSnapshot` (stateRevision preserved). */
export declare function snapshotRefFromWorkflowInstanceSnapshot(snapshot: WorkflowInstanceSnapshot): SnapshotRef;
/**
 * SnapshotRef basis from a `ProjectionSnapshot`. The revision relationships
 * are preserved, never erased: the projection's own revision, every
 * workflow-source stateRevision and every business-source revision
 * (L2 A2 6.5).
 */
export declare function snapshotRefFromProjectionSnapshot(snapshot: ProjectionSnapshot): SnapshotRef;
/** SnapshotRef basis from a `BusinessSnapshot` (external business-source revision). */
export declare function snapshotRefFromBusinessSnapshot(snapshot: BusinessSnapshot): SnapshotRef;
/**
 * Derive the watch identity (DAC `WatchRef`) from an existing
 * `DomainSubscription` — the watch handle itself, before any change.
 */
export declare function watchRefFromSubscription(subscription: DomainSubscription): WatchRef;
/**
 * Derive the watch identity plus the observed revision/change (DAC
 * `WatchRef` over `DomainSubscription` + `DomainChange.revision`). The
 * change must belong to the same subscription kind; a foreign change is
 * never silently reinterpreted.
 */
export declare function watchRefFromObservedChange(subscription: DomainSubscription, change: DomainChange): WatchRef;
//# sourceMappingURL=adapters.d.ts.map