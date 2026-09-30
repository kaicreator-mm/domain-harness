import { isRuntimeObservationStore, ObservationRecordingRuntimeStore, RUNTIME_OBSERVATION_CONTRACT_VERSION, RUNTIME_OBSERVATION_EVENT_FAMILIES, runtimePackageIdentityFromManifest, } from '../observation/index.js';
import { WorkflowInstanceEngine } from '../engine/workflow-instance-engine.js';
import { PerInstanceSerializedLane } from '../engine/per-instance-serialized-lane.js';
import { workflowAddressKey } from '../instance/workflow-address.js';
import { isRuntimeObservationInstanceProvisioningStore } from '../observation/provisioning-contract.js';
import { RuntimeInstanceProvisioningCoordinator } from './instance-provisioning-coordinator.js';
import { isRuntimeInstanceProvisioningStore, } from './durable-control-contracts.js';
import { RUNTIME_CONTROL_CONTRACT_VERSION, RuntimeControlCoordinator, RuntimeControlInterruptSignal, } from '../control/index.js';
import { DurableToolRunner } from '../execution/tool-runner/durable-tool-runner.js';
import { DomainMessageAcceptance } from '../messaging/acceptance/domain-message-acceptance.js';
import { JournaledDomainMessageEffect } from '../messaging/send-effect/journaled-domain-message-effect.js';
import { preflightPackageActivation } from '../package/activation.js';
import { resolvePinnedPackage } from '../package/registry.js';
import { ProjectionService } from '../projection/projection-service.js';
import { DomainQueryDispatcher } from '../query/domain-query-dispatcher.js';
import { PoisonMessageRecoveryCoordinator } from '../recovery-v2/poison-message-recovery.js';
import { MailboxDrainScheduler } from './mailbox-drain-scheduler.js';
import { commitV3ProcessedCommandTurn, requireV3ProcessCommandStore, } from './process-command-integration.js';
import { RuntimeSubscriptionCoordinator } from './subscription-coordinator.js';
import { DomainRuntimeError } from './runtime-errors.js';
import { CompiledWorkflowRuntime } from './compiled-workflow-runtime.js';
import { JournaledSkillRunner } from './journaled-skill-runner.js';
import { createRuntimeToolExecutor } from './tool-executor.js';
class RecoveryRecordedError extends Error {
    target;
    constructor(target) {
        super(`Workflow ${target.workflowId}/${target.instanceKey} entered recovery_required`);
        this.target = target;
        this.name = 'RecoveryRecordedError';
    }
}
/**
 * Wake-up registry behind the optional `watch` on the ENABLED observation
 * capability. Purely a coalescible hint: it fires when observation records
 * commit and carries no data — consumers must re-read the durable sequence
 * (push never substitutes the durable pull/cursor read).
 */
class ObservationWakeRegistry {
    #watchers = new Map();
    watch(target, onWake) {
        const key = `${target.workflowId}\u0000${target.instanceKey}`;
        let listeners = this.#watchers.get(key);
        if (listeners === undefined) {
            listeners = new Set();
            this.#watchers.set(key, listeners);
        }
        listeners.add(onWake);
        let active = true;
        return () => {
            if (!active)
                return;
            active = false;
            const current = this.#watchers.get(key);
            if (current === undefined)
                return;
            current.delete(onWake);
            if (current.size === 0)
                this.#watchers.delete(key);
        };
    }
    wake(target) {
        const listeners = this.#watchers.get(`${target.workflowId}\u0000${target.instanceKey}`);
        if (listeners === undefined)
            return;
        for (const onWake of [...listeners]) {
            try {
                onWake();
            }
            catch {
                // A wake-up listener is host convenience code; its failure can never
                // affect the durable record path that already committed.
            }
        }
    }
    clear() {
        this.#watchers.clear();
    }
}
class ProcessingConflictError extends Error {
    target;
    constructor(target) {
        super(`Workflow ${target.workflowId}/${target.instanceKey} mailbox head could not enter processing`);
        this.target = target;
        this.name = 'ProcessingConflictError';
    }
}
/**
 * Activates the portable retained Runtime from already-target-compiled package
 * modules. The public v0.2 entrypoint always uses the historical processing
 * path; createDomainRuntimeV3 alone opts into the frozen T-009 commit path.
 */
export function createDomainRuntime(options) {
    return createDomainRuntimeInternal(options, 'legacy');
}
/** Internal v3 assembly entrypoint; intentionally not re-exported by runtime/index.ts. */
export function createDomainRuntimeWithProcessCommandOutcomes(options) {
    return createDomainRuntimeInternal(options, 'v3-process-command');
}
async function createDomainRuntimeInternal(options, processingMode) {
    const processCommandStore = processingMode === 'v3-process-command' ? requireV3ProcessCommandStore(options.store) : null;
    // Issue #312 observation composition: when enabled, every observation-v1
    // covered mutation flows through the observation-capable store. The frozen
    // observation-v1 contract explicitly excludes T-009 process-command commits,
    // so v3 processed-command publication remains on the same underlying store
    // without fabricating a TURN_COMMITTED observation for an uncovered mutation.
    const observationStore = isRuntimeObservationStore(options.store) ? options.store : null;
    const observationRequested = options.observation?.mode === 'enabled';
    if (observationRequested && observationStore === null) {
        throw new DomainRuntimeError('observation_store_required', 'observation.mode "enabled" requires a RuntimeStore implementing RuntimeObservationStore');
    }
    const observationWake = new ObservationWakeRegistry();
    const now = options.now ?? (() => new Date().toISOString());
    // Shared #312 exact package identity mapping: used by the recording-store
    // decorator for covered RuntimeStore mutations AND by the #180 provisioning
    // ensure/open intent so INSTANCE_OPENED records carry the same identity.
    const resolveObservationPackageIdentity = options.observation?.resolvePackageIdentity ??
        ((packageId) => {
            const compiledPackage = resolvePinnedPackage(options.packageRegistry, packageId);
            return runtimePackageIdentityFromManifest(compiledPackage.manifest);
        });
    const effectiveStore = observationRequested && observationStore !== null
        ? new ObservationRecordingRuntimeStore({
            base: observationStore,
            resolvePackageIdentity: resolveObservationPackageIdentity,
            ...(options.now === undefined ? {} : { now: options.now }),
            ...(options.observation?.runtimeBindingRef === undefined
                ? {}
                : { runtimeBindingRef: options.observation.runtimeBindingRef }),
            ...(options.observation?.runtimeActivationRef === undefined
                ? {}
                : { runtimeActivationRef: options.observation.runtimeActivationRef }),
            onRecordsCommitted: (target) => observationWake.wake(target),
        })
        : options.store;
    // Issue #180 provisioning composition: the additive ensure/open capability
    // requires the atomic RuntimeInstanceProvisioningStore extension. When
    // observation is enabled, instance materialization is a covered
    // INSTANCE_OPENED mutation, so the capability additionally requires the
    // observation-capable form — provisioning is then reported UNSUPPORTED
    // rather than silently downgrading to an unobserved instance write.
    const provisioningStore = isRuntimeInstanceProvisioningStore(options.store)
        ? options.store
        : null;
    const provisioningObservationCapable = provisioningStore !== null &&
        isRuntimeObservationInstanceProvisioningStore(options.store);
    const provisioningCoordinator = provisioningStore !== null &&
        (!observationRequested || provisioningObservationCapable)
        ? new RuntimeInstanceProvisioningCoordinator(provisioningStore)
        : null;
    const provisioningObservationIntent = observationRequested && provisioningObservationCapable
        ? (packageId) => ({
            kind: 'INSTANCE_OPENED',
            packageIdentity: resolveObservationPackageIdentity(packageId),
            observedAt: now(),
            ...(options.observation?.runtimeBindingRef === undefined
                ? {}
                : { runtimeBindingRef: options.observation.runtimeBindingRef }),
            ...(options.observation?.runtimeActivationRef === undefined
                ? {}
                : { runtimeActivationRef: options.observation.runtimeActivationRef }),
        })
        : undefined;
    await preflightPackageActivation({
        registry: options.packageRegistry,
        store: effectiveStore,
        validationPolicy: {
            formatVersion: '0.2',
            runtimeContractMajor: 2,
            executionEngineMajor: 2,
            hostCapabilities: options.bindings.capabilities,
            sha256: options.bindings.sha256,
        },
    });
    const lane = new PerInstanceSerializedLane();
    const instanceEngine = new WorkflowInstanceEngine(effectiveStore, { now, lane });
    const acceptance = new DomainMessageAcceptance({
        store: effectiveStore,
        packages: options.packageRegistry,
    });
    const recovery = new PoisonMessageRecoveryCoordinator(effectiveStore, { now });
    const toolRunner = new DurableToolRunner({
        store: effectiveStore,
        sha256: options.bindings.sha256,
        now,
    });
    const skillRunner = options.ai === undefined
        ? undefined
        : new JournaledSkillRunner({
            store: effectiveStore,
            sha256: options.bindings.sha256,
            ai: options.ai,
            now,
        });
    const messageEffect = new JournaledDomainMessageEffect({
        store: effectiveStore,
        acceptance,
        sha256: options.bindings.sha256,
        now,
    });
    const projection = new ProjectionService({
        packageRegistry: options.packageRegistry,
        store: options.store,
        ...(options.businessSnapshots === undefined ? {} : { businessSnapshots: options.businessSnapshots }),
        ...(options.domainData === undefined ? {} : { domainData: options.domainData }),
        expression: options.bindings.expression,
        sha256: options.bindings.sha256,
    });
    const query = new DomainQueryDispatcher({ store: options.store, projection });
    const subscriptionCoordinator = new RuntimeSubscriptionCoordinator({
        store: options.store,
        projection,
        packageRegistry: options.packageRegistry,
        ...(options.onBackgroundError === undefined
            ? {}
            : {
                onObservationError(error, subscription) {
                    if (subscription.kind === 'projection')
                        return;
                    options.onBackgroundError?.(error, subscription.target);
                },
            }),
    });
    let disposed = false;
    let disposePromise;
    const activeTurns = new Map();
    const turnKey = (target) => workflowAddressKey(target);
    const controlRequested = options.control?.mode === 'enabled';
    const controlCoordinator = controlRequested && options.control !== undefined
        ? new RuntimeControlCoordinator({
            authorizer: options.control.authorizer,
            store: options.control.store,
            ports: {
                store: options.store,
                recovery,
                lane,
                now,
                activeTurn: (target) => activeTurns.get(turnKey(target)),
                onNewTurnsUnblocked: (target) => {
                    if (!disposed && controlCoordinator?.blocksNewTurns(target) !== true) {
                        scheduleDrain(target);
                    }
                },
            },
        })
        : null;
    const drainScheduler = new MailboxDrainScheduler({
        drain: (target) => drainMailbox(target),
        isDrainSuppressed: (error) => error instanceof RecoveryRecordedError,
        reportError(error, target) {
            options.onBackgroundError?.(error, target);
        },
    });
    const scheduleDrain = (target) => {
        drainScheduler.schedule(target);
    };
    const notifyTargetChanged = (target, messageId) => {
        subscriptionCoordinator.notifyTargetChanged(target, messageId);
    };
    const assertActive = () => {
        if (disposed) {
            throw new DomainRuntimeError('runtime_disposed', 'DomainRuntime has been disposed; create a new Runtime to resume operations');
        }
    };
    const runtimeWorkflow = new CompiledWorkflowRuntime({
        expression: options.bindings.expression,
        toolRunner,
        toolExecutor: createRuntimeToolExecutor(options.bindings),
        ...(skillRunner === undefined ? {} : { skillRunner }),
        messageEffect,
        onChildAccepted(target, messageId) {
            notifyTargetChanged(target, messageId);
            scheduleDrain(target);
        },
    });
    const unresolvedTargets = await options.store.listUnresolvedMessageTargets();
    for (const target of unresolvedTargets) {
        await options.store.reclaimInterruptedProcessing(target);
        scheduleDrain(target);
    }
    if (controlCoordinator !== null) {
        await controlCoordinator.reconcileUnresolved();
    }
    async function drainMailbox(target) {
        while (true) {
            if (drainScheduler.disposed)
                return;
            if (controlCoordinator !== null && controlCoordinator.blocksNewTurns(target))
                return;
            const stored = await recovery.nextProcessableMessage(target);
            if (stored === null)
                return;
            const turnController = new AbortController();
            let settleTurn = () => { };
            const settled = new Promise((resolve) => {
                settleTurn = resolve;
            });
            const key = turnKey(target);
            activeTurns.set(key, {
                messageId: stored.message.messageId,
                targetSequence: stored.ack.targetSequence,
                controller: turnController,
                settled,
            });
            let committed;
            try {
                committed = processCommandStore === null
                    ? await processLegacyTurn(target, stored, turnController)
                    : await processV3CommandTurn(target, stored, turnController, processCommandStore);
            }
            finally {
                activeTurns.delete(key);
                settleTurn();
            }
            if (isTerminal(committed)) {
                notifyTargetChanged(target);
                return;
            }
            notifyTargetChanged(target, stored.message.messageId);
        }
    }
    async function processLegacyTurn(target, stored, turnController) {
        return instanceEngine.processAcceptedTransition({
            target,
            messageId: stored.message.messageId,
            expectedTargetSequence: stored.ack.targetSequence,
            async transition(current) {
                const marked = await options.store.markMessageProcessing(target, stored.message.messageId, now());
                if (!marked)
                    throw new ProcessingConflictError(target);
                try {
                    const compiledPackage = resolvePinnedPackage(options.packageRegistry, current.packageId);
                    const workflow = compiledPackage.manifest.workflows[current.address.workflowId];
                    if (workflow === undefined) {
                        throw new Error(`Pinned package ${current.packageId} has no workflow ${current.address.workflowId}`);
                    }
                    const transition = await runtimeWorkflow.processMessage(compiledPackage, workflow, current, stored, { signal: turnController.signal });
                    if (transition.recoveryFailure !== undefined) {
                        await recovery.recordProcessingFailure({
                            target,
                            messageId: stored.message.messageId,
                            expectedTargetSequence: stored.ack.targetSequence,
                            failure: withControlProvenance(transition.recoveryFailure, turnController.signal),
                        });
                        notifyTargetChanged(target, stored.message.messageId);
                        throw new RecoveryRecordedError(target);
                    }
                    return {
                        nextState: transition.nextState,
                        nextLifecycle: transition.nextLifecycle,
                        ...(transition.output === undefined ? {} : { output: transition.output }),
                    };
                }
                catch (error) {
                    if (error instanceof RecoveryRecordedError || error instanceof ProcessingConflictError)
                        throw error;
                    await recordTechnicalProcessingFailure(target, stored, turnController, error);
                    throw new RecoveryRecordedError(target);
                }
            },
        });
    }
    async function processV3CommandTurn(target, stored, turnController, store) {
        let current;
        await lane.run(target, async () => {
            const resolved = await options.store.getInstance(target);
            if (resolved === null) {
                throw new DomainRuntimeError('instance_not_found', `Workflow ${target.workflowId}/${target.instanceKey} does not exist`);
            }
            current = resolved;
            const marked = await options.store.markMessageProcessing(target, stored.message.messageId, now());
            if (!marked)
                throw new ProcessingConflictError(target);
            try {
                const compiledPackage = resolvePinnedPackage(options.packageRegistry, current.packageId);
                const workflow = compiledPackage.manifest.workflows[current.address.workflowId];
                if (workflow === undefined) {
                    throw new Error(`Pinned package ${current.packageId} has no workflow ${current.address.workflowId}`);
                }
                const result = await runtimeWorkflow.processCommand(compiledPackage, workflow, current, stored, { signal: turnController.signal });
                if (result.status === 'applied' && result.transition.recoveryFailure !== undefined) {
                    await recovery.recordProcessingFailure({
                        target,
                        messageId: stored.message.messageId,
                        expectedTargetSequence: stored.ack.targetSequence,
                        failure: withControlProvenance(result.transition.recoveryFailure, turnController.signal),
                    });
                    notifyTargetChanged(target, stored.message.messageId);
                    throw new RecoveryRecordedError(target);
                }
                await commitV3ProcessedCommandTurn({
                    store,
                    current,
                    stored,
                    result,
                    updatedAt: now(),
                });
            }
            catch (error) {
                if (error instanceof RecoveryRecordedError || error instanceof ProcessingConflictError)
                    throw error;
                await recordTechnicalProcessingFailure(target, stored, turnController, error);
                throw new RecoveryRecordedError(target);
            }
        });
        // The processed-command commit itself is the stateRevision authority. This
        // read is verification only and is deliberately outside the recovery catch:
        // once the atomic commit returns, a later read/invariant failure must never
        // fabricate a second failure fact over an already-processed message.
        const committed = await options.store.getInstance(target);
        if (committed === null) {
            throw new Error(`T-009 processed command removed workflow ${target.workflowId}/${target.instanceKey}`);
        }
        if (workflowAddressKey(committed.address) !== workflowAddressKey(current.address)
            || committed.packageId !== current.packageId
            || committed.correlationId !== current.correlationId) {
            throw new Error('T-009 processed-command commit changed persistent Workflow Instance identity');
        }
        if (committed.stateRevision !== current.stateRevision + 1) {
            throw new Error(`T-009 processed-command commit produced stateRevision ${committed.stateRevision}; expected ${current.stateRevision + 1}`);
        }
        return committed;
    }
    async function recordTechnicalProcessingFailure(target, stored, turnController, error) {
        const failure = withControlProvenance(turnController.signal.aborted
            ? controlInterruptFailure(turnController.signal, stored.message.messageId)
            : normalizeFailure(error, stored.message.messageId), turnController.signal);
        await recovery.recordProcessingFailure({
            target,
            messageId: stored.message.messageId,
            expectedTargetSequence: stored.ack.targetSequence,
            failure,
        });
        notifyTargetChanged(target, stored.message.messageId);
    }
    async function openInstance(request) {
        assertActive();
        const packageId = request.packageId ?? options.packageRegistry.defaultPackageId;
        const compiledPackage = resolvePinnedPackage(options.packageRegistry, packageId);
        const workflow = compiledPackage.manifest.workflows[request.address.workflowId];
        if (workflow === undefined) {
            throw new DomainRuntimeError('workflow_not_in_package', `Package ${packageId} does not contain workflow ${request.address.workflowId}`);
        }
        const instance = await instanceEngine.createInstance({
            address: request.address,
            correlationId: request.correlationId,
            packageId,
            initialState: runtimeWorkflow.initialState(workflow, request.input),
            lifecycle: 'waiting',
        });
        notifyTargetChanged(request.address);
        return instance;
    }
    /**
     * #180 additive atomic provisioning ensure/open. The Runtime is the sole
     * authority for package/workflow resolution and the exact revision-0 initial
     * snapshot (same construction openInstance uses, including `waiting`
     * lifecycle — the initial state is never auto-run); the durable store alone
     * performs the atomic provisioning-key + instance convergence in one host
     * transaction, fail-closed validated by RuntimeInstanceProvisioningCoordinator.
     * An existing progressed/terminal instance is returned unchanged.
     */
    async function ensureProvisionedInstanceOpen(request) {
        assertActive();
        if (provisioningCoordinator === null) {
            throw new DomainRuntimeError('provisioning_unsupported', 'Runtime provisioning ensure/open requires a RuntimeStore implementing the atomic I-OPEN provisioning extension');
        }
        const packageId = request.packageId ?? options.packageRegistry.defaultPackageId;
        const compiledPackage = resolvePinnedPackage(options.packageRegistry, packageId);
        const workflow = compiledPackage.manifest.workflows[request.address.workflowId];
        if (workflow === undefined) {
            throw new DomainRuntimeError('workflow_not_in_package', `Package ${packageId} does not contain workflow ${request.address.workflowId}`);
        }
        const requestedAt = now();
        const initialInstance = {
            address: request.address,
            correlationId: request.correlationId,
            packageId,
            lifecycle: 'waiting',
            stateRevision: 0,
            state: runtimeWorkflow.initialState(workflow, request.input),
            createdAt: requestedAt,
            updatedAt: requestedAt,
        };
        const result = await provisioningCoordinator.ensureProvisionedWorkflowInstanceOpen({
            provisioningKey: request.provisioningKey,
            target: request.address,
            correlationId: request.correlationId,
            packageId,
            input: request.input,
            requestedAt,
            initialInstance,
        }, provisioningObservationIntent?.(packageId));
        if (result.instanceDisposition === 'created') {
            // Only a newly materialized instance changed durable state (and, in
            // observation mode, emitted its exactly-once INSTANCE_OPENED record);
            // an idempotent replay changed nothing and notifies nobody.
            notifyTargetChanged(request.address);
            observationWake.wake(request.address);
        }
        return {
            instance: result.instance,
            provisioningDisposition: result.provisioningDisposition,
            instanceDisposition: result.instanceDisposition,
        };
    }
    async function send(message) {
        assertActive();
        const ack = await acceptance.accept(message);
        notifyTargetChanged(message.target, message.messageId);
        scheduleDrain(message.target);
        return ack;
    }
    async function recover(request) {
        assertActive();
        let shouldDrain = false;
        const instance = await lane.run(request.target, async () => {
            const current = await options.store.getInstance(request.target);
            if (current === null) {
                throw new DomainRuntimeError('instance_not_found', `Workflow ${request.target.workflowId}/${request.target.instanceKey} does not exist`);
            }
            const messageId = current.failure?.sourceMessageId;
            if (messageId === undefined || messageId.length === 0) {
                throw new DomainRuntimeError('recovery_identity_missing', 'Recovery requires a durable poison-message identity on the instance failure');
            }
            const reason = request.reason?.trim();
            if (reason === undefined || reason.length === 0) {
                throw new DomainRuntimeError('recovery_reason_required', `Recovery action ${request.action} requires a non-empty domain authorization reason`);
            }
            if (request.action === 'retry') {
                const authorization = current.failure?.code === 'ambiguous_non_idempotent_effect'
                    ? (() => {
                        const effectId = current.failure?.effectId;
                        if (effectId === undefined || effectId.length === 0) {
                            throw new DomainRuntimeError('recovery_effect_identity_missing', 'Ambiguous non-idempotent recovery is missing durable effectId');
                        }
                        return {
                            kind: 'ambiguous-non-idempotent-resolved',
                            effectId,
                            reason,
                        };
                    })()
                    : { kind: 'domain-policy', reason };
                const retried = await recovery.retry({
                    target: request.target,
                    messageId,
                    authorization,
                });
                shouldDrain = true;
                return retried.instance;
            }
            return recovery.terminalize({
                mode: 'recovery',
                target: request.target,
                lifecycle: request.action === 'resolve' ? 'completed' : 'terminated',
                reason: { authorizationReason: reason },
                authorization: {
                    kind: 'domain-authorized',
                    reason,
                },
            });
        });
        notifyTargetChanged(request.target);
        if (shouldDrain)
            scheduleDrain(request.target);
        return { instance };
    }
    function subscribe(request, listener) {
        assertActive();
        return subscriptionCoordinator.subscribe(request, listener);
    }
    function invalidateBusinessSnapshot(request) {
        assertActive();
        subscriptionCoordinator.invalidateBusinessSnapshot(request);
    }
    async function awaitIdle() {
        for (;;) {
            await drainScheduler.awaitIdle();
            await subscriptionCoordinator.idle();
            if (drainScheduler.activeDrainCount === 0) {
                return;
            }
        }
    }
    function dispose() {
        disposePromise ??= performDispose();
        return disposePromise;
    }
    async function performDispose() {
        disposed = true;
        drainScheduler.dispose();
        subscriptionCoordinator.dispose();
        observationWake.clear();
        await drainScheduler.awaitIdle();
    }
    const observationCapability = observationRequested && observationStore !== null
        ? {
            status: 'ENABLED',
            contractVersion: RUNTIME_OBSERVATION_CONTRACT_VERSION,
            eventFamilies: RUNTIME_OBSERVATION_EVENT_FAMILIES,
            readObservations: (request) => observationStore.readObservations(request),
            watch: (stream, onWake) => observationWake.watch(stream.target, onWake),
        }
        : { status: 'UNSUPPORTED' };
    const controlCapability = controlCoordinator !== null
        ? {
            status: 'ENABLED',
            contractVersion: RUNTIME_CONTROL_CONTRACT_VERSION,
            requestControl: (request) => {
                assertActive();
                return controlCoordinator.requestControl(request);
            },
            getControlOutcome: (controlRequestId) => {
                assertActive();
                return controlCoordinator.getControlOutcome(controlRequestId);
            },
        }
        : {
            status: 'UNSUPPORTED',
            requestControl: async (request) => ({
                controlRequestId: request.controlRequestId,
                status: 'resolved',
                disposition: 'UNSUPPORTED',
                outcome: 'UNSUPPORTED',
                record: {
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
                    authorization: {
                        decision: 'DENIED',
                        callerRef: request.callerRef,
                        code: 'control_not_configured',
                    },
                    status: 'resolved',
                    receiptDisposition: 'UNSUPPORTED',
                    outcome: 'UNSUPPORTED',
                    requestedAt: now(),
                    resolvedAt: now(),
                },
            }),
        };
    const provisioningCapability = provisioningCoordinator !== null
        ? { status: 'ENABLED', ensureOpen: ensureProvisionedInstanceOpen }
        : { status: 'UNSUPPORTED' };
    return {
        openInstance,
        send,
        query(request) {
            assertActive();
            return query.query(request);
        },
        subscribe,
        recover,
        invalidateBusinessSnapshot,
        awaitIdle,
        dispose,
        observation: observationCapability,
        control: controlCapability,
        provisioning: provisioningCapability,
    };
}
/** Failure recorded when a winning INTERRUPT's signal stopped the in-flight turn. */
function controlInterruptFailure(signal, messageId) {
    const reason = signal.reason;
    const controlRequestId = reason instanceof RuntimeControlInterruptSignal ? reason.controlRequestId : undefined;
    return {
        code: 'runtime_control_interrupted',
        message: controlRequestId === undefined
            ? `Turn for message ${messageId} was interrupted by runtime control`
            : `Turn for message ${messageId} was interrupted by runtime control ${controlRequestId}`,
        sourceMessageId: messageId,
        ...(controlRequestId === undefined
            ? {}
            : {
                details: {
                    kind: 'runtime-control',
                    controlRequestId,
                    action: 'INTERRUPT',
                    authorizationRef: '',
                    policyRevision: '',
                },
            }),
    };
}
/** Binds exact control provenance into a failure recorded for a signalled turn. */
function withControlProvenance(failure, signal) {
    if (!signal.aborted)
        return failure;
    const reason = signal.reason;
    if (!(reason instanceof RuntimeControlInterruptSignal))
        return failure;
    return {
        ...failure,
        details: {
            ...(failure.details ?? {}),
            kind: 'runtime-control',
            controlRequestId: reason.controlRequestId,
            action: 'INTERRUPT',
            authorizationRef: '',
            policyRevision: '',
        },
    };
}
function normalizeFailure(error, messageId) {
    return {
        code: error instanceof Error && error.name.length > 0
            ? `workflow_${error.name.replace(/Error$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() || 'processing'}_failed`
            : 'workflow_processing_failed',
        message: error instanceof Error ? error.message : String(error),
        sourceMessageId: messageId,
    };
}
function isTerminal(instance) {
    return (instance.lifecycle === 'completed' ||
        instance.lifecycle === 'failed' ||
        instance.lifecycle === 'cancelled' ||
        instance.lifecycle === 'terminated');
}
//# sourceMappingURL=create-domain-runtime.js.map