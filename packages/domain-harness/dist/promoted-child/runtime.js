import { isContentDigest } from '../contracts/identity.js';
import { createHarnessExecutionOperationIdentity, executeJournaledHarnessOperation, } from '../harness/execution-journal.js';
import { DynamicChildExecutionError, } from './contracts.js';
import { compilePromotedChild } from './compiler.js';
import { assertPromotedChildApplicable, assertPromotedChildCompatible, } from './compatibility.js';
import { assertInvokingContextMatchesGovernancePin, DynamicChildPinCoordinator, } from './pin.js';
import { resolvePromotedChildOnce, dynamicChildSlotKey } from './selection.js';
function resolvePath(value, path, label) {
    let current = value;
    for (const segment of path.split('.')) {
        if (Array.isArray(current) && /^\d+$/.test(segment)) {
            current = current[Number(segment)];
        }
        else if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
            current = current[segment];
        }
        else {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_VALUE_RESOLUTION_FAILED', `${label} cannot resolve path segment ${JSON.stringify(segment)}`);
        }
        if (current === undefined) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_VALUE_RESOLUTION_FAILED', `${label} has no value at path ${JSON.stringify(path)}`);
        }
    }
    return current;
}
/**
 * A pinned child execution. Sessions exist ONLY after the exact
 * DynamicChildExecutionPin is durably committed (fresh) or reloaded (recovery),
 * which structurally enforces pin-before-journaled-work (frozen L2 §14.1).
 */
export class PromotedChildExecutionSession {
    pin;
    compiled;
    sha256;
    constructor(pin, compiled, sha256) {
        this.pin = pin;
        this.compiled = compiled;
        this.sha256 = sha256;
    }
    /**
     * T-016 journaled-operation identity context. Every operation executed inside
     * this child carries the exact promoted artifact contentDigest, so committed
     * work from one artifact digest can never be consumed by another (§14.5).
     */
    operationIdentityContext(options) {
        if (typeof options.durableControlTurnId !== 'string' || options.durableControlTurnId.length === 0) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_SELECTION_INVALID', 'durableControlTurnId must be non-empty');
        }
        if (!isContentDigest(options.semanticContractDigest)) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_SELECTION_INVALID', 'semanticContractDigest must be a content digest');
        }
        return {
            target: this.pin.slot.target,
            durableControlTurnId: options.durableControlTurnId,
            semanticContractDigest: options.semanticContractDigest,
            promotedChildContentDigest: this.pin.artifact.contentDigest,
            sha256: this.sha256,
        };
    }
    resolveSource(source, input, stepOutputs, label) {
        switch (source.kind) {
            case 'literal':
                return source.value;
            case 'input':
                return resolvePath(input, source.path, label);
            case 'step-output': {
                const produced = stepOutputs.get(source.node);
                if (produced === undefined) {
                    throw new DynamicChildExecutionError('DYNAMIC_CHILD_VALUE_RESOLUTION_FAILED', `${label} references step node ${source.node} that produced no output`);
                }
                return resolvePath(produced, source.path, label);
            }
            default:
                throw new DynamicChildExecutionError('DYNAMIC_CHILD_VALUE_RESOLUTION_FAILED', `${label} uses an unknown value source`);
        }
    }
    /**
     * Execute the compiled step plan. Query steps run at most once per deterministic
     * operation slot through the T-016 journal. Effect intents are collected as
     * data only — durable effect admission/execution stays with the parent authority.
     */
    async run(options) {
        const context = this.operationIdentityContext(options);
        const signal = options.signal ?? new AbortController().signal;
        const stepOutputs = new Map();
        const emittedEvents = [];
        const effectIntents = [];
        let output;
        let executed = 0;
        for (const compiled of this.compiled.steps) {
            executed += 1;
            if (executed > this.compiled.maxSteps) {
                throw new DynamicChildExecutionError('DYNAMIC_CHILD_BOUND_EXCEEDED', `promoted child executed more than the declared maxSteps bound ${this.compiled.maxSteps}`);
            }
            const label = `step ${compiled.node}`;
            const step = compiled.step;
            switch (step.kind) {
                case 'query': {
                    const resolvedInput = this.resolveSource(step.input, options.input, stepOutputs, label);
                    const identity = await createHarnessExecutionOperationIdentity(context, 'query', compiled.operationOrdinal, {
                        node: compiled.node,
                        tool: {
                            kind: step.tool.kind,
                            artifactId: step.tool.artifactId,
                            contentDigest: step.tool.contentDigest,
                        },
                        input: resolvedInput,
                    });
                    const result = await executeJournaledHarnessOperation(options.journal, identity, signal, async () => {
                        try {
                            const value = await options.executor.executeQuery(step.tool, resolvedInput);
                            return { status: 'succeeded', value };
                        }
                        catch (error) {
                            return {
                                status: 'failed',
                                code: 'QUERY_EXECUTION_FAILED',
                                message: error instanceof Error ? error.message : String(error),
                            };
                        }
                    });
                    if (result.status === 'journal-failure') {
                        throw new DynamicChildExecutionError('DYNAMIC_CHILD_JOURNAL_FAILURE', `journaled query step ${compiled.node} failed closed: ${result.code} ${result.message}`);
                    }
                    if (result.status === 'cancelled') {
                        throw new DynamicChildExecutionError('DYNAMIC_CHILD_JOURNAL_FAILURE', `journaled query step ${compiled.node} was cancelled`);
                    }
                    if (result.evidence.outcome.status !== 'succeeded') {
                        throw new DynamicChildExecutionError('DYNAMIC_CHILD_JOURNAL_FAILURE', `query step ${compiled.node} failed: ${result.evidence.outcome.code} ${result.evidence.outcome.message}`);
                    }
                    stepOutputs.set(compiled.node, result.evidence.outcome.value);
                    break;
                }
                case 'emit-event': {
                    if (!this.compiled.declaredEvents.includes(step.eventType)) {
                        throw new DynamicChildExecutionError('DYNAMIC_CHILD_EVENT_NOT_ALLOWED', `step ${compiled.node} emits undeclared Domain Event ${step.eventType}`);
                    }
                    const payload = step.payload === undefined
                        ? undefined
                        : this.resolveSource(step.payload, options.input, stepOutputs, label);
                    emittedEvents.push({
                        eventType: step.eventType,
                        ...(payload === undefined ? {} : { payload }),
                    });
                    break;
                }
                case 'effect-intent': {
                    effectIntents.push({
                        effect: step.effect,
                        input: this.resolveSource(step.input, options.input, stepOutputs, label),
                        ...(step.idempotencyKey !== undefined ? { idempotencyKey: step.idempotencyKey } : {}),
                    });
                    break;
                }
                case 'terminal-output': {
                    output = this.resolveSource(step.output, options.input, stepOutputs, label);
                    break;
                }
                case 'reasoned':
                    throw new DynamicChildExecutionError('DYNAMIC_CHILD_REASONED_STEP_UNSUPPORTED', `reasoned step ${compiled.node} cannot execute in the v0.3 promoted child runtime`);
                default:
                    throw new DynamicChildExecutionError('DYNAMIC_CHILD_BODY_INVALID', `step ${compiled.node} has an unsupported kind`);
            }
        }
        if (output === undefined) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_BODY_INVALID', 'promoted child completed without producing its declared terminal output');
        }
        return {
            artifact: this.pin.artifact,
            pin: this.pin,
            output,
            emittedEvents,
            effectIntents,
        };
    }
}
function isPromotedRegistryError(error, code) {
    return typeof error === 'object'
        && error !== null
        && error.name === 'PromotedArtifactContractError'
        && error.code === code;
}
export class PromotedChildRuntime {
    artifactPort;
    sha256;
    pins;
    constructor(artifactPort, pinStore, sha256) {
        this.artifactPort = artifactPort;
        this.sha256 = sha256;
        this.pins = new DynamicChildPinCoordinator(pinStore, artifactPort, sha256);
    }
    /**
     * Fresh selection-to-execution boundary (frozen L2 §14.1):
     * resolve once → evaluate against invoking pinned context → commit pin →
     * compile (pure) → child becomes eligible for journaled work.
     */
    async beginFreshExecution(input) {
        const expectedAuthority = {
            domainId: input.invoking.governanceBaseline.domainId,
            packageId: input.invoking.packageId,
            domainIntelligenceContentDigest: input.invoking.domainIntelligenceContentDigest,
            governanceBaseline: input.invoking.governanceBaseline,
        };
        const resolved = await resolvePromotedChildOnce(input.selector, expectedAuthority, this.artifactPort);
        return this.beginFreshResolvedExecution({
            resolved,
            slot: input.slot,
            invoking: input.invoking,
            ...(input.governancePin !== undefined ? { governancePin: input.governancePin } : {}),
            pinnedAt: input.pinnedAt,
        });
    }
    /**
     * Same fresh selection-to-execution boundary, but consuming an already
     * resolved selection object (T-018 resolver pre-read reuse). The runtime
     * never resolves a selector twice per decision invocation (frozen L2 §17.3).
     */
    async beginFreshResolvedExecution(input) {
        const compiled = compilePromotedChild(input.resolved.body);
        assertPromotedChildCompatible(compiled.envelope, input.resolved.promotion.authorityBinding, input.invoking);
        assertPromotedChildApplicable(compiled.envelope, input.invoking);
        const pin = await this.pins.commitPin({
            slot: input.slot,
            resolved: input.resolved,
            invoking: input.invoking,
            ...(input.governancePin !== undefined ? { governancePin: input.governancePin } : {}),
            pinnedAt: input.pinnedAt,
        });
        return new PromotedChildExecutionSession(pin, compiled, this.sha256);
    }
    /**
     * Exact pinned recovery (frozen L2 §14.4). There is deliberately NO selector
     * input: recovery never re-resolves an alias/version. The pin loads the exact
     * body by content digest, the body re-compiles deterministically, and a
     * revoked artifact stays resolvable only on this path.
     */
    async recoverExecution(input) {
        const pin = await this.pins.requirePin(input.slot);
        if (pin.invokingPackageId !== input.invoking.packageId) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_PACKAGE_MISMATCH', 'recovery invoking package does not match the pinned invocation package; recovery never switches to the active package');
        }
        const pinnedAuthority = pin.invokingAuthority;
        const current = input.invoking;
        if (pinnedAuthority.domainIntelligenceContentDigest !== current.domainIntelligenceContentDigest) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_PACKAGE_MISMATCH', 'recovery CDI digest does not match the pinned invocation package authority');
        }
        if (pinnedAuthority.governanceBaseline.domainId !== current.governanceBaseline.domainId
            || pinnedAuthority.governanceBaseline.governanceId !== current.governanceBaseline.governanceId
            || pinnedAuthority.governanceBaseline.schemaVersion !== current.governanceBaseline.schemaVersion
            || pinnedAuthority.governanceBaseline.contentDigest !== current.governanceBaseline.contentDigest) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_GOVERNANCE_MISMATCH', 'recovery authority does not match the pinned invocation authority');
        }
        if (input.governancePin !== undefined) {
            assertInvokingContextMatchesGovernancePin(input.invoking, input.governancePin);
        }
        let recovered;
        try {
            recovered = await this.artifactPort.recoverExact(pin.artifact, pin.invokingAuthority);
        }
        catch (error) {
            if (isPromotedRegistryError(error, 'PROMOTED_ARTIFACT_NOT_FOUND')) {
                throw new DynamicChildExecutionError('DYNAMIC_CHILD_BODY_MISSING', 'the exact promoted artifact body required by a pinned recovery is missing from the registry', error);
            }
            if (isPromotedRegistryError(error, 'PROMOTED_ARTIFACT_DIGEST_MISMATCH')) {
                throw new DynamicChildExecutionError('DYNAMIC_CHILD_DIGEST_MISMATCH', 'the recovered promoted artifact body re-hashes to a different digest; fail closed', error);
            }
            throw error;
        }
        const compiled = compilePromotedChild(recovered.body);
        if (compiled.artifact.contentDigest !== pin.artifact.contentDigest) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_DIGEST_MISMATCH', 'recompiled child identity does not match the durable pin');
        }
        // Recovery of an already-started child is fail-closed: never a fresh fallthrough.
        assertPromotedChildCompatible(compiled.envelope, recovered.promotion.authorityBinding, input.invoking);
        assertPromotedChildApplicable(compiled.envelope, input.invoking);
        return new PromotedChildExecutionSession(pin, compiled, this.sha256);
    }
    async releaseRetention(slot) {
        return this.pins.releaseRetention(slot);
    }
}
/**
 * Standalone journaled-work gate for executors that do not hold a session:
 * no journaled work may exist for a promoted child whose pin was never committed.
 */
export async function requireDynamicChildOperationGate(store, slot) {
    const pin = await store.get(dynamicChildSlotKey(slot));
    if (pin === undefined) {
        throw new DynamicChildExecutionError('DYNAMIC_CHILD_WORK_BEFORE_PIN', 'no journaled work may exist for a promoted child whose exact definition pin was never made durable');
    }
    return pin;
}
//# sourceMappingURL=runtime.js.map