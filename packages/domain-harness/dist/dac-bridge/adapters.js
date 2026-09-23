// Issue #308 / A2 I-005: correlation adapters over the existing
// DomainMessage / query / workflow-snapshot / projection / subscription
// mechanisms for the DAC section-9 UX<->Runtime roles.
//
// Every adapter is correlation-only and additive: no existing primitive is
// redefined, no store/runtime surface is touched, and nothing here can
// execute, transition or dispatch. The Runtime keeps transition authority;
// the Domain UX layer keeps intent semantics (this bridge only adopts and
// preserves them); rendering stays entirely outside.
import { DAC_BRIDGE_ADAPTER_VERSION, DAC_BRIDGE_BASELINE, DacBridgeError, } from './contracts.js';
import { isCommandRef, isDomainIntentRef, isSemanticTargetRef, isSnapshotRef, } from './guards.js';
import { freezeOpaque, isMutableAliasToken, mintCorrelation, mintReference, requireExactBaseline, requireNonEmptyString, } from './registry.js';
function requireWorkflowAddress(value, field) {
    if (value === null ||
        typeof value !== 'object' ||
        typeof value.workflowId !== 'string' ||
        value.workflowId.length === 0 ||
        typeof value.instanceKey !== 'string' ||
        value.instanceKey.length === 0) {
        throw new DacBridgeError('INVALID_REFERENCE', `${field} must be a WorkflowAddress`);
    }
}
/** Structural validation of an observed basis; mutable-alias revisions fail closed. */
export function validateObservedBasis(basis, field) {
    if (basis === null || typeof basis !== 'object') {
        throw new DacBridgeError('INVALID_CORRELATION', `${field} must be an observed-basis object`);
    }
    const candidate = basis;
    if (candidate.kind === 'snapshot-ref') {
        if (!isSnapshotRef(candidate.snapshotRef)) {
            throw new DacBridgeError('INVALID_CORRELATION', `${field}.snapshotRef must be a bridge-minted SnapshotRef (forged snapshot identities fail closed)`);
        }
        return;
    }
    if (candidate.kind === 'revision') {
        requireNonEmptyString(candidate.sourceKind, `${field}.sourceKind`);
        requireNonEmptyString(candidate.revision, `${field}.revision`);
        if (typeof candidate.revision === 'string' && isMutableAliasToken(candidate.revision)) {
            throw new DacBridgeError('MUTABLE_ALIAS_REJECTED', `${field}.revision "${candidate.revision}" is a mutable alias and can never prove an exact observation basis`);
        }
        if (candidate.targetKey !== undefined) {
            requireNonEmptyString(candidate.targetKey, `${field}.targetKey`);
        }
        return;
    }
    throw new DacBridgeError('INVALID_CORRELATION', `${field}.kind must be 'snapshot-ref' or 'revision'`);
}
/** Adopt a domain/application semantic-target identity (DAC `SemanticTargetRef`). */
export function adoptSemanticTargetRef(input) {
    if (input === null || typeof input !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'adoption input must be an object');
    }
    requireExactBaseline(input.baseline);
    requireNonEmptyString(input.semanticIdentity, 'semanticIdentity');
    requireNonEmptyString(input.authorityScope, 'authorityScope');
    if (input.semanticTarget !== undefined) {
        throw new DacBridgeError('INVALID_REFERENCE', 'a semantic-target reference carries no nested semanticTarget');
    }
    if (input.observedBasis !== undefined) {
        throw new DacBridgeError('INVALID_REFERENCE', 'a semantic-target reference carries no observedBasis');
    }
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'semantic-target',
        semanticIdentity: input.semanticIdentity,
        authorityScope: input.authorityScope,
        opaque: freezeOpaque(input.opaque),
    });
}
/** Adopt a UX-authored intent correlation (DAC `DomainIntentRef`). */
export function adoptDomainIntentRef(input) {
    if (input === null || typeof input !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'adoption input must be an object');
    }
    requireExactBaseline(input.baseline);
    requireNonEmptyString(input.semanticIdentity, 'semanticIdentity');
    requireNonEmptyString(input.authorityScope, 'authorityScope');
    if (input.semanticTarget !== undefined && !isSemanticTargetRef(input.semanticTarget)) {
        throw new DacBridgeError('INVALID_CORRELATION', 'semanticTarget must be a bridge-minted SemanticTargetRef (forged targets fail closed)');
    }
    if (input.observedBasis !== undefined) {
        validateObservedBasis(input.observedBasis, 'observedBasis');
    }
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'domain-intent',
        semanticIdentity: input.semanticIdentity,
        authorityScope: input.authorityScope,
        ...(input.semanticTarget === undefined ? {} : { semanticTarget: input.semanticTarget }),
        ...(input.observedBasis === undefined ? {} : { observedBasis: input.observedBasis }),
        opaque: freezeOpaque(input.opaque),
    });
}
/**
 * Derive the Runtime command identity (DAC `CommandRef`) from an actual
 * `DomainMessage`. This adapts the existing message identity — it never
 * mints a second command authority, which is why this is the ONLY
 * constructor for CommandRefs.
 */
export function commandRefFromDomainMessage(message) {
    if (message === null || typeof message !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'message must be a DomainMessage');
    }
    requireNonEmptyString(message.messageId, 'message.messageId');
    requireWorkflowAddress(message.target, 'message.target');
    if (message.correlationId !== undefined) {
        requireNonEmptyString(message.correlationId, 'message.correlationId');
    }
    if (message.causationId !== undefined) {
        requireNonEmptyString(message.causationId, 'message.causationId');
    }
    if (message.contractVersion !== undefined) {
        requireNonEmptyString(message.contractVersion, 'message.contractVersion');
    }
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'command',
        messageId: message.messageId,
        target: message.target,
        ...(message.correlationId === undefined ? {} : { correlationId: message.correlationId }),
        ...(message.causationId === undefined ? {} : { causationId: message.causationId }),
        ...(message.contractVersion === undefined ? {} : { contractVersion: message.contractVersion }),
        opaque: freezeOpaque(undefined),
    });
}
function sameObservedBasis(left, right) {
    if (left === undefined || right === undefined)
        return true;
    if (left.kind !== right.kind)
        return false;
    if (left.kind === 'snapshot-ref' && right.kind === 'snapshot-ref') {
        return left.snapshotRef === right.snapshotRef;
    }
    if (left.kind === 'revision' && right.kind === 'revision') {
        return (left.sourceKind === right.sourceKind &&
            left.revision === right.revision &&
            left.targetKey === right.targetKey);
    }
    return false;
}
/**
 * Bind one command to its optional UX origin chain. All correlation members
 * are optional by origin (internal commands without a UX origin stay valid),
 * but contradictions fail closed: two different semantic targets, or two
 * different observed bases, are a CORRELATION_CONFLICT — never silently
 * reconciled by preferring one side (DAC section 11: a consumer MUST NOT
 * silently reinterpret a reference).
 */
export function correlateDomainCommand(message, correlation) {
    const command = commandRefFromDomainMessage(message);
    if (correlation !== undefined && (correlation === null || typeof correlation !== 'object')) {
        throw new DacBridgeError('INVALID_CORRELATION', 'correlation must be an object when supplied');
    }
    const intent = correlation?.intent;
    const semanticTarget = correlation?.semanticTarget;
    const observedBasis = correlation?.observedBasis;
    if (intent !== undefined && !isDomainIntentRef(intent)) {
        throw new DacBridgeError('INVALID_CORRELATION', 'intent must be a bridge-minted DomainIntentRef (a forged intent is not UX-origin correlation)');
    }
    if (semanticTarget !== undefined && !isSemanticTargetRef(semanticTarget)) {
        throw new DacBridgeError('INVALID_CORRELATION', 'semanticTarget must be a bridge-minted SemanticTargetRef');
    }
    if (observedBasis !== undefined) {
        validateObservedBasis(observedBasis, 'correlation.observedBasis');
    }
    if (intent !== undefined &&
        intent.semanticTarget !== undefined &&
        semanticTarget !== undefined &&
        intent.semanticTarget !== semanticTarget) {
        throw new DacBridgeError('CORRELATION_CONFLICT', 'correlation.semanticTarget and intent.semanticTarget are different references; resolve explicitly instead of silently preferring one');
    }
    if (intent !== undefined &&
        !sameObservedBasis(intent.observedBasis, observedBasis)) {
        throw new DacBridgeError('CORRELATION_CONFLICT', 'correlation.observedBasis conflicts with intent.observedBasis; resolve explicitly instead of silently preferring one');
    }
    return mintCorrelation({
        command,
        ...(intent === undefined ? {} : { intent }),
        ...(semanticTarget === undefined ? {} : { semanticTarget }),
        ...(observedBasis === undefined ? {} : { observedBasis }),
    });
}
const DISPOSITIONS = new Set([
    'accepted',
    'processing',
    'processed',
    'failed',
    'abandoned',
]);
function requireDispositionSnapshot(value) {
    if (value === null || typeof value !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'disposition must be a MessageDispositionSnapshot');
    }
    requireNonEmptyString(value.messageId, 'disposition.messageId');
    requireWorkflowAddress(value.target, 'disposition.target');
    if (!DISPOSITIONS.has(value.disposition)) {
        throw new DacBridgeError('INVALID_REFERENCE', `disposition "${String(value.disposition)}" is not a Runtime message disposition`);
    }
    requireNonEmptyString(value.correlationId, 'disposition.correlationId');
}
/**
 * Derive the Runtime-logical outcome correlation (DAC `OutcomeRef`) from a
 * `MessageDispositionSnapshot`. The result is Runtime-scope truth only: it
 * structurally cannot claim an external business outcome
 * (`externalAuthorityOutcome: 'not-claimed'`), and any durable-effect
 * ambiguity stays correlated — never strengthened — via `failure.effectId`
 * pointing at the existing effect evidence mechanisms.
 */
export function outcomeRefFromMessageDisposition(disposition) {
    requireDispositionSnapshot(disposition);
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'outcome',
        messageId: disposition.messageId,
        target: disposition.target,
        targetSequence: disposition.targetSequence,
        ...(disposition.packageId === undefined ? {} : { packageId: disposition.packageId }),
        disposition: disposition.disposition,
        ...(disposition.correlationId === undefined ? {} : { correlationId: disposition.correlationId }),
        ...(disposition.causationId === undefined ? {} : { causationId: disposition.causationId }),
        ...(disposition.failure === undefined ? {} : { failure: disposition.failure }),
        ...(disposition.acceptedAt === undefined ? {} : { acceptedAt: disposition.acceptedAt }),
        ...(disposition.resolvedAt === undefined ? {} : { resolvedAt: disposition.resolvedAt }),
        outcomeScope: 'runtime-logical',
        externalAuthorityOutcome: 'not-claimed',
        opaque: freezeOpaque(undefined),
    });
}
/**
 * Derive the immediate `accepted` OutcomeRef from a `MessageAcceptedAck`
 * (`status: 'duplicate'` maps to the ack's existing disposition semantics of
 * an already-accepted command and is still an outcome correlation, carried in
 * `opaque.ackStatus`). No external claim is made here either.
 */
export function outcomeRefFromAcceptedAck(ack) {
    if (ack === null || typeof ack !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'ack must be a MessageAcceptedAck');
    }
    requireNonEmptyString(ack.messageId, 'ack.messageId');
    requireWorkflowAddress(ack.target, 'ack.target');
    if (ack.status !== 'accepted' && ack.status !== 'duplicate') {
        throw new DacBridgeError('INVALID_REFERENCE', `ack.status "${String(ack.status)}" is not a MessageAcceptedAck status`);
    }
    requireNonEmptyString(ack.packageId, 'ack.packageId');
    requireNonEmptyString(ack.acceptedAt, 'ack.acceptedAt');
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'outcome',
        messageId: ack.messageId,
        target: ack.target,
        targetSequence: ack.targetSequence,
        packageId: ack.packageId,
        disposition: 'accepted',
        acceptedAt: ack.acceptedAt,
        outcomeScope: 'runtime-logical',
        externalAuthorityOutcome: 'not-claimed',
        opaque: freezeOpaque({ ackStatus: ack.status }),
    });
}
/**
 * Correlate an outcome with the command correlation it resolves. The
 * outcome must resolve the SAME command (messageId + target) or the binding
 * fails closed — a causal chain is never assembled across different
 * commands. Presence of an intent here is correlation evidence only; it
 * never influenced the Runtime decision.
 */
export function correlateDomainOutcome(input) {
    if (input === null || typeof input !== 'object') {
        throw new DacBridgeError('INVALID_CORRELATION', 'correlation input must be an object');
    }
    if ((input.disposition === undefined) === (input.ack === undefined)) {
        throw new DacBridgeError('INVALID_CORRELATION', 'exactly one of disposition or ack must be supplied');
    }
    const outcome = input.disposition !== undefined
        ? outcomeRefFromMessageDisposition(input.disposition)
        : outcomeRefFromAcceptedAck(input.ack);
    const correlation = input.correlation;
    if (correlation !== undefined) {
        if (correlation === null ||
            typeof correlation !== 'object' ||
            !isCommandRef(correlation.command)) {
            throw new DacBridgeError('INVALID_CORRELATION', 'correlation must be a bridge-minted DomainCommandCorrelation');
        }
        const command = correlation.command;
        if (command.messageId !== outcome.messageId ||
            command.target.workflowId !== outcome.target.workflowId ||
            command.target.instanceKey !== outcome.target.instanceKey) {
            throw new DacBridgeError('CORRELATION_CONFLICT', `outcome ${outcome.messageId} does not resolve correlated command ${command.messageId}; causal chains are never assembled across different commands`);
        }
        return mintCorrelation({
            outcome,
            command,
            ...(correlation.intent === undefined ? {} : { intent: correlation.intent }),
            ...(correlation.semanticTarget === undefined
                ? {}
                : { semanticTarget: correlation.semanticTarget }),
            ...(correlation.observedBasis === undefined
                ? {}
                : { observedBasis: correlation.observedBasis }),
        });
    }
    return mintCorrelation({ outcome });
}
/**
 * Derive the renderer-neutral view identity (DAC `ViewRef`) from an existing
 * query and its result. Identity/revision only — the view's data stays in the
 * query result; no rendering semantics exist here. The result must answer the
 * same query kind or the pairing fails closed.
 */
export function viewRefFromQueryResult(request, result) {
    if (request === null || typeof request !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'request must be a DomainQuery');
    }
    if (result === null || typeof result !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'result must be a DomainQueryResult');
    }
    if (request.kind !== result.kind) {
        throw new DacBridgeError('INVALID_CORRELATION', `result kind "${String(result.kind)}" does not answer query kind "${String(request.kind)}"`);
    }
    // Switch on result.kind (the value-bearing side); the request is cast to
    // its matching variant under the kind-equality check above.
    switch (result.kind) {
        case 'instance': {
            const query = request;
            requireWorkflowAddress(query.target, 'request.target');
            return mintReference({
                adapter: DAC_BRIDGE_ADAPTER_VERSION,
                baseline: DAC_BRIDGE_BASELINE,
                role: 'view',
                viewKind: 'instance',
                valuePresent: result.value !== null,
                target: query.target,
                opaque: freezeOpaque(result.value === null ? {} : { stateRevision: result.value.stateRevision }),
            });
        }
        case 'message-disposition': {
            const query = request;
            requireWorkflowAddress(query.target, 'request.target');
            requireNonEmptyString(query.messageId, 'request.messageId');
            return mintReference({
                adapter: DAC_BRIDGE_ADAPTER_VERSION,
                baseline: DAC_BRIDGE_BASELINE,
                role: 'view',
                viewKind: 'message-disposition',
                valuePresent: result.value !== null,
                target: query.target,
                messageId: query.messageId,
                opaque: freezeOpaque(undefined),
            });
        }
        case 'runtime-failure': {
            const query = request;
            requireWorkflowAddress(query.target, 'request.target');
            return mintReference({
                adapter: DAC_BRIDGE_ADAPTER_VERSION,
                baseline: DAC_BRIDGE_BASELINE,
                role: 'view',
                viewKind: 'runtime-failure',
                valuePresent: result.value !== null,
                target: query.target,
                opaque: freezeOpaque(undefined),
            });
        }
        case 'package-pins':
            return mintReference({
                adapter: DAC_BRIDGE_ADAPTER_VERSION,
                baseline: DAC_BRIDGE_BASELINE,
                role: 'view',
                viewKind: 'package-pins',
                valuePresent: true,
                opaque: freezeOpaque({ pinCount: result.value.length }),
            });
        case 'projection': {
            const snapshot = result.value;
            const query = request;
            requireNonEmptyString(snapshot.projectionId, 'result.value.projectionId');
            requireNonEmptyString(snapshot.key, 'result.value.key');
            requireNonEmptyString(snapshot.revision, 'result.value.revision');
            if (snapshot.projectionId !== query.projectionId || snapshot.key !== query.key) {
                throw new DacBridgeError('INVALID_CORRELATION', 'projection result does not answer the requested projection view');
            }
            if (isMutableAliasToken(snapshot.revision)) {
                throw new DacBridgeError('MUTABLE_ALIAS_REJECTED', `projection revision "${snapshot.revision}" is a mutable alias and can never be an exact view basis`);
            }
            return mintReference({
                adapter: DAC_BRIDGE_ADAPTER_VERSION,
                baseline: DAC_BRIDGE_BASELINE,
                role: 'view',
                viewKind: 'projection',
                valuePresent: true,
                projectionId: snapshot.projectionId,
                key: snapshot.key,
                revision: snapshot.revision,
                opaque: freezeOpaque(undefined),
            });
        }
        default:
            throw new DacBridgeError('INVALID_REFERENCE', `unknown DomainQuery kind "${String(request.kind)}"`);
    }
}
/** SnapshotRef basis from a `WorkflowInstanceSnapshot` (stateRevision preserved). */
export function snapshotRefFromWorkflowInstanceSnapshot(snapshot) {
    if (snapshot === null || typeof snapshot !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'snapshot must be a WorkflowInstanceSnapshot');
    }
    requireWorkflowAddress(snapshot.address, 'snapshot.address');
    requireNonEmptyString(snapshot.correlationId, 'snapshot.correlationId');
    requireNonEmptyString(snapshot.packageId, 'snapshot.packageId');
    if (typeof snapshot.stateRevision !== 'number' ||
        !Number.isSafeInteger(snapshot.stateRevision) ||
        snapshot.stateRevision < 0) {
        throw new DacBridgeError('INVALID_REFERENCE', 'snapshot.stateRevision must be a non-negative safe integer');
    }
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'snapshot',
        sourceKind: 'workflow-instance',
        address: snapshot.address,
        correlationId: snapshot.correlationId,
        packageId: snapshot.packageId,
        stateRevision: snapshot.stateRevision,
        opaque: freezeOpaque({ lifecycle: snapshot.lifecycle }),
    });
}
/**
 * SnapshotRef basis from a `ProjectionSnapshot`. The revision relationships
 * are preserved, never erased: the projection's own revision, every
 * workflow-source stateRevision and every business-source revision
 * (L2 A2 6.5).
 */
export function snapshotRefFromProjectionSnapshot(snapshot) {
    if (snapshot === null || typeof snapshot !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'snapshot must be a ProjectionSnapshot');
    }
    requireNonEmptyString(snapshot.projectionId, 'snapshot.projectionId');
    requireNonEmptyString(snapshot.key, 'snapshot.key');
    requireNonEmptyString(snapshot.packageId, 'snapshot.packageId');
    requireNonEmptyString(snapshot.revision, 'snapshot.revision');
    if (isMutableAliasToken(snapshot.revision)) {
        throw new DacBridgeError('MUTABLE_ALIAS_REJECTED', `projection revision "${snapshot.revision}" is a mutable alias and can never be an exact snapshot basis`);
    }
    const workflowSources = snapshot.workflowSources.map((source) => {
        requireWorkflowAddress(source.address, 'snapshot.workflowSources[].address');
        if (typeof source.stateRevision !== 'number' ||
            !Number.isSafeInteger(source.stateRevision) ||
            source.stateRevision < 0) {
            throw new DacBridgeError('INVALID_REFERENCE', 'snapshot.workflowSources[].stateRevision must be a non-negative safe integer');
        }
        return { address: source.address, stateRevision: source.stateRevision };
    });
    const businessSources = snapshot.businessSources.map((source) => {
        requireNonEmptyString(source.source, 'snapshot.businessSources[].source');
        requireNonEmptyString(source.key, 'snapshot.businessSources[].key');
        requireNonEmptyString(source.revision, 'snapshot.businessSources[].revision');
        return { source: source.source, key: source.key, revision: source.revision };
    });
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'snapshot',
        sourceKind: 'projection',
        projectionId: snapshot.projectionId,
        key: snapshot.key,
        packageId: snapshot.packageId,
        revision: snapshot.revision,
        workflowSources: Object.freeze(workflowSources),
        businessSources: Object.freeze(businessSources),
        opaque: freezeOpaque(undefined),
    });
}
/** SnapshotRef basis from a `BusinessSnapshot` (external business-source revision). */
export function snapshotRefFromBusinessSnapshot(snapshot) {
    if (snapshot === null || typeof snapshot !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'snapshot must be a BusinessSnapshot');
    }
    requireNonEmptyString(snapshot.source, 'snapshot.source');
    requireNonEmptyString(snapshot.key, 'snapshot.key');
    requireNonEmptyString(snapshot.revision, 'snapshot.revision');
    // Uniform fail-closed contract with the projection path: a mutable alias
    // can never become an exact snapshot basis (review finding F1, #308).
    if (isMutableAliasToken(snapshot.revision)) {
        throw new DacBridgeError('MUTABLE_ALIAS_REJECTED', `business-source revision "${snapshot.revision}" is a mutable alias and can never be an exact snapshot basis`);
    }
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'snapshot',
        sourceKind: 'business',
        source: snapshot.source,
        key: snapshot.key,
        revision: snapshot.revision,
        opaque: freezeOpaque(undefined),
    });
}
function requireSubscription(value) {
    if (value === null || typeof value !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'subscription must be a DomainSubscription');
    }
    switch (value.kind) {
        case 'instance':
            requireWorkflowAddress(value.target, 'subscription.target');
            return;
        case 'message':
            requireWorkflowAddress(value.target, 'subscription.target');
            return;
        case 'projection':
            requireNonEmptyString(value.projectionId, 'subscription.projectionId');
            requireNonEmptyString(value.key, 'subscription.key');
            return;
        default:
            throw new DacBridgeError('INVALID_REFERENCE', `unknown DomainSubscription kind "${String(value.kind)}"`);
    }
}
/**
 * Derive the watch identity (DAC `WatchRef`) from an existing
 * `DomainSubscription` — the watch handle itself, before any change.
 */
export function watchRefFromSubscription(subscription) {
    requireSubscription(subscription);
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'watch',
        watchKind: subscription.kind,
        ...(subscription.kind === 'instance' ? { target: subscription.target } : {}),
        ...(subscription.kind === 'message'
            ? {
                target: subscription.target,
                ...(subscription.messageId === undefined ? {} : { messageId: subscription.messageId }),
            }
            : {}),
        ...(subscription.kind === 'projection'
            ? { projectionId: subscription.projectionId, key: subscription.key }
            : {}),
        opaque: freezeOpaque(undefined),
    });
}
/**
 * Derive the watch identity plus the observed revision/change (DAC
 * `WatchRef` over `DomainSubscription` + `DomainChange.revision`). The
 * change must belong to the same subscription kind; a foreign change is
 * never silently reinterpreted.
 */
export function watchRefFromObservedChange(subscription, change) {
    requireSubscription(subscription);
    if (change === null || typeof change !== 'object' || change.kind !== subscription.kind) {
        throw new DacBridgeError('INVALID_CORRELATION', 'change.kind must match the subscription kind (a foreign change is never reinterpreted)');
    }
    requireNonEmptyString(change.revision, 'change.revision');
    if (isMutableAliasToken(change.revision)) {
        throw new DacBridgeError('MUTABLE_ALIAS_REJECTED', `change.revision "${change.revision}" is a mutable alias and can never prove an exact observed revision`);
    }
    return mintReference({
        adapter: DAC_BRIDGE_ADAPTER_VERSION,
        baseline: DAC_BRIDGE_BASELINE,
        role: 'watch',
        watchKind: subscription.kind,
        ...(subscription.kind === 'instance' ? { target: subscription.target } : {}),
        ...(subscription.kind === 'message'
            ? {
                target: subscription.target,
                ...(subscription.messageId === undefined ? {} : { messageId: subscription.messageId }),
            }
            : {}),
        ...(subscription.kind === 'projection'
            ? { projectionId: subscription.projectionId, key: subscription.key }
            : {}),
        observedRevision: change.revision,
        changeKind: change.kind,
        opaque: freezeOpaque(undefined),
    });
}
//# sourceMappingURL=adapters.js.map