import type { AIOperationPort } from '../contracts/ai.js';
import type { DomainIntelligencePackageIdentity } from '../contracts/domain-data.js';
import {
  isRuntimeObservationStore,
  ObservationRecordingRuntimeStore,
  RUNTIME_OBSERVATION_CONTRACT_VERSION,
  RUNTIME_OBSERVATION_EVENT_FAMILIES,
  runtimePackageIdentityFromManifest,
  type RuntimeObservationCapability,
} from '../observation/index.js';
import { WorkflowInstanceEngine } from '../engine/workflow-instance-engine.js';
import { PerInstanceSerializedLane } from '../engine/per-instance-serialized-lane.js';
import { DurableToolRunner } from '../execution/tool-runner/durable-tool-runner.js';
import { DomainMessageAcceptance } from '../messaging/acceptance/domain-message-acceptance.js';
import { JournaledDomainMessageEffect } from '../messaging/send-effect/journaled-domain-message-effect.js';
import { preflightPackageActivation } from '../package/activation.js';
import { resolvePinnedPackage } from '../package/registry.js';
import type { CompiledDomainDataPort } from '../projection/compiled-domain-data.js';
import { ProjectionService } from '../projection/projection-service.js';
import { DomainQueryDispatcher } from '../query/domain-query-dispatcher.js';
import { PoisonMessageRecoveryCoordinator } from '../recovery-v2/poison-message-recovery.js';
import { MailboxDrainScheduler } from './mailbox-drain-scheduler.js';
import { RuntimeSubscriptionCoordinator } from './subscription-coordinator.js';
import { DomainRuntimeError } from './runtime-errors.js';
import type { BusinessSnapshotPort } from '../v2/contracts/projection.js';
import type { DomainQuery } from '../v2/contracts/query.js';
import type {
  DomainRuntime,
  RecoveryRequest,
  RecoveryResult,
} from '../v2/contracts/runtime.js';
import type {
  BusinessInvalidation,
  DomainChangeListener,
  DomainSubscription,
  Unsubscribe,
} from '../v2/contracts/subscription.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type {
  RuntimeHostBindings,
  RuntimeResources,
} from '../v2/contracts/host.js';
import type { PackageRegistry } from '../v2/contracts/package.js';
import type {
  OpenWorkflowInstanceRequest,
  RuntimeFailure,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../v2/contracts/workflow.js';
import type { DomainMessage, MessageAcceptedAck } from '../v2/contracts/message.js';
import { CompiledWorkflowRuntime } from './compiled-workflow-runtime.js';
import { JournaledSkillRunner } from './journaled-skill-runner.js';
import { createRuntimeToolExecutor } from './tool-executor.js';

export interface CreateDomainRuntimeOptions {
  packageRegistry: PackageRegistry;
  store: RuntimeStore;
  bindings: RuntimeHostBindings;
  resources?: RuntimeResources;
  /** Provider-neutral AI Runtime port used only by compiled AI Skill invokes. */
  ai?: AIOperationPort;
  businessSnapshots?: BusinessSnapshotPort;
  domainData?: CompiledDomainDataPort;
  now?: () => string;
  onBackgroundError?: (error: unknown, target: WorkflowAddress) => void;
  /**
   * Issue #312 durable ordered Runtime Observation Stream. Absent/unsupported
   * keeps every existing Runtime semantic unchanged and exposes the explicit
   * `{ status: 'UNSUPPORTED' }` capability; `enabled` requires an
   * observation-capable RuntimeStore (`RuntimeObservationStore`) so every
   * covered mutation commits atomically with its observation record.
   */
  observation?: RuntimeObservationEnableOptions;
}

/** Enablement options for the durable Runtime Observation Stream (#312). */
export interface RuntimeObservationEnableOptions {
  readonly mode: 'enabled';
  /**
   * Overrides the default exact package identity mapping. By default the
   * compiled manifest maps to `DomainIntelligencePackageIdentity` via
   * `runtimePackageIdentityFromManifest` (contentDigest = the content-derived
   * compiled packageId, verified at activation).
   */
  readonly resolvePackageIdentity?: (packageId: string) => DomainIntelligencePackageIdentity;
  /** Opaque DAC/A2-owned provenance refs, carried verbatim when the host holds them. */
  readonly runtimeBindingRef?: string;
  readonly runtimeActivationRef?: string;
}

class RecoveryRecordedError extends Error {
  constructor(readonly target: WorkflowAddress) {
    super(`Workflow ${target.workflowId}/${target.instanceKey} entered recovery_required`);
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
  readonly #watchers = new Map<string, Set<() => void>>();

  watch(target: WorkflowAddress, onWake: () => void): () => void {
    const key = `${target.workflowId}\u0000${target.instanceKey}`;
    let listeners = this.#watchers.get(key);
    if (listeners === undefined) {
      listeners = new Set();
      this.#watchers.set(key, listeners);
    }
    listeners.add(onWake);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.#watchers.get(key);
      if (current === undefined) return;
      current.delete(onWake);
      if (current.size === 0) this.#watchers.delete(key);
    };
  }

  wake(target: WorkflowAddress): void {
    const listeners = this.#watchers.get(`${target.workflowId}\u0000${target.instanceKey}`);
    if (listeners === undefined) return;
    for (const onWake of [...listeners]) {
      try {
        onWake();
      } catch {
        // A wake-up listener is host convenience code; its failure can never
        // affect the durable record path that already committed.
      }
    }
  }

  clear(): void {
    this.#watchers.clear();
  }
}

class ProcessingConflictError extends Error {
  constructor(readonly target: WorkflowAddress) {
    super(`Workflow ${target.workflowId}/${target.instanceKey} mailbox head could not enter processing`);
    this.name = 'ProcessingConflictError';
  }
}

/**
 * Activates the portable v0.2 Runtime from already-target-compiled package modules.
 * No Raw Domain Package loader/compiler is imported or reachable from this path.
 */
export async function createDomainRuntime(options: CreateDomainRuntimeOptions): Promise<DomainRuntime> {
  // Issue #312 observation composition: when enabled, every covered mutation
  // flows through the observation-capable store so the record commits in the
  // SAME durable transaction as the mutation. When absent/unsupported the
  // store below is exactly the caller's store and no observation code runs.
  const observationStore = isRuntimeObservationStore(options.store) ? options.store : null;
  const observationRequested = options.observation?.mode === 'enabled';
  if (observationRequested && observationStore === null) {
    throw new DomainRuntimeError(
      'observation_store_required',
      'observation.mode "enabled" requires a RuntimeStore implementing RuntimeObservationStore',
    );
  }

  const observationWake = new ObservationWakeRegistry();
  const now = options.now ?? (() => new Date().toISOString());

  const effectiveStore: RuntimeStore =
    observationRequested && observationStore !== null
      ? new ObservationRecordingRuntimeStore({
          base: observationStore,
          resolvePackageIdentity:
            options.observation?.resolvePackageIdentity ??
            ((packageId: string): DomainIntelligencePackageIdentity => {
              const compiledPackage = resolvePinnedPackage(options.packageRegistry, packageId);
              return runtimePackageIdentityFromManifest(compiledPackage.manifest);
            }),
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

  // Observation state (subscription registry, projection refcounts, bounded
  // message revisions) is owned by RuntimeSubscriptionCoordinator (#170/#171);
  // drain scheduling state (active drains, wake-ups, disposal gating) is owned
  // by MailboxDrainScheduler (#169/#171). This composition root keeps only the
  // lifecycle flags and wiring.
  const subscriptionCoordinator = new RuntimeSubscriptionCoordinator({
    store: options.store,
    projection,
    packageRegistry: options.packageRegistry,
    ...(options.onBackgroundError === undefined
      ? {}
      : {
          onObservationError(error, subscription) {
            if (subscription.kind === 'projection') return;
            options.onBackgroundError?.(error, subscription.target);
          },
        }),
  });

  let disposed = false;
  let disposePromise: Promise<void> | undefined;

  const drainScheduler = new MailboxDrainScheduler({
    drain: (target) => drainMailbox(target),
    // RecoveryRecordedError is the durable poison-message path: the failure
    // fact is already persisted and observable, so it is not reported again.
    // Every other drain failure — including ProcessingConflictError —
    // surfaces so a stuck mailbox is never silent.
    isDrainSuppressed: (error) => error instanceof RecoveryRecordedError,
    reportError(error, target) {
      options.onBackgroundError?.(error, target);
    },
  });

  const scheduleDrain = (target: WorkflowAddress): void => {
    drainScheduler.schedule(target);
  };

  const notifyTargetChanged = (target: WorkflowAddress, messageId?: string): void => {
    subscriptionCoordinator.notifyTargetChanged(target, messageId);
  };

  const assertActive = (): void => {
    if (disposed) {
      throw new DomainRuntimeError(
        'runtime_disposed',
        'DomainRuntime has been disposed; create a new Runtime to resume operations',
      );
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

  // Startup recovery: a previous writer process may have died with mailbox work
  // still unresolved (accepted but never drained, or interrupted mid-processing).
  // Under the single-writer rule (one logical Domain Runtime per store; L2 §11.1)
  // activation is the safe point to reclaim interrupted processing back to
  // accepted — preserving target sequence — and to schedule a drain per affected
  // instance. Re-execution is then decided by the durable effect-journal recovery
  // matrix (completed → reuse; started none/idempotent → re-run; started
  // non-idempotent → recovery_required), never by blind retry.
  const unresolvedTargets = await options.store.listUnresolvedMessageTargets();
  for (const target of unresolvedTargets) {
    await options.store.reclaimInterruptedProcessing(target);
    scheduleDrain(target);
  }

  async function drainMailbox(target: WorkflowAddress): Promise<void> {
    while (true) {
      // Disposal boundary: the in-flight turn (if any) has already completed;
      // no new turn is started after dispose() (#169).
      if (drainScheduler.disposed) return;
      const stored = await recovery.nextProcessableMessage(target);
      if (stored === null) return;

      const committed = await instanceEngine.processAcceptedTransition({
        target,
        messageId: stored.message.messageId,
        expectedTargetSequence: stored.ack.targetSequence,
        async transition(current) {
          const marked = await options.store.markMessageProcessing(
            target,
            stored.message.messageId,
            now(),
          );
          if (!marked) throw new ProcessingConflictError(target);

          try {
            const compiledPackage = resolvePinnedPackage(options.packageRegistry, current.packageId);
            const workflow = compiledPackage.manifest.workflows[current.address.workflowId];
            if (workflow === undefined) {
              throw new Error(
                `Pinned package ${current.packageId} has no workflow ${current.address.workflowId}`,
              );
            }
            const transition = await runtimeWorkflow.processMessage(
              compiledPackage,
              workflow,
              current,
              stored,
            );
            if (transition.recoveryFailure !== undefined) {
              await recovery.recordProcessingFailure({
                target,
                messageId: stored.message.messageId,
                expectedTargetSequence: stored.ack.targetSequence,
                failure: transition.recoveryFailure,
              });
              notifyTargetChanged(target, stored.message.messageId);
              throw new RecoveryRecordedError(target);
            }
            return {
              nextState: transition.nextState,
              nextLifecycle: transition.nextLifecycle,
              ...(transition.output === undefined ? {} : { output: transition.output }),
            };
          } catch (error) {
            if (error instanceof RecoveryRecordedError || error instanceof ProcessingConflictError) throw error;
            const failure = normalizeFailure(error, stored.message.messageId);
            await recovery.recordProcessingFailure({
              target,
              messageId: stored.message.messageId,
              expectedTargetSequence: stored.ack.targetSequence,
              failure,
            });
            notifyTargetChanged(target, stored.message.messageId);
            throw new RecoveryRecordedError(target);
          }
        },
      });

      if (isTerminal(committed)) {
        notifyTargetChanged(target);
        return;
      }
      notifyTargetChanged(target, stored.message.messageId);
    }
  }

  async function openInstance(request: OpenWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot> {
    assertActive();
    const packageId = request.packageId ?? options.packageRegistry.defaultPackageId;
    const compiledPackage = resolvePinnedPackage(options.packageRegistry, packageId);
    const workflow = compiledPackage.manifest.workflows[request.address.workflowId];
    if (workflow === undefined) {
      throw new DomainRuntimeError(
        'workflow_not_in_package',
        `Package ${packageId} does not contain workflow ${request.address.workflowId}`,
      );
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

  async function send(message: DomainMessage): Promise<MessageAcceptedAck> {
    assertActive();
    const ack = await acceptance.accept(message);
    notifyTargetChanged(message.target, message.messageId);
    scheduleDrain(message.target);
    return ack;
  }

  async function recover(request: RecoveryRequest): Promise<RecoveryResult> {
    assertActive();
    let shouldDrain = false;
    const instance = await lane.run(request.target, async () => {
      const current = await options.store.getInstance(request.target);
      if (current === null) {
        throw new DomainRuntimeError(
          'instance_not_found',
          `Workflow ${request.target.workflowId}/${request.target.instanceKey} does not exist`,
        );
      }
      const messageId = current.failure?.sourceMessageId;
      if (messageId === undefined || messageId.length === 0) {
        throw new DomainRuntimeError(
          'recovery_identity_missing',
          'Recovery requires a durable poison-message identity on the instance failure',
        );
      }
      const reason = request.reason?.trim();
      if (reason === undefined || reason.length === 0) {
        throw new DomainRuntimeError(
          'recovery_reason_required',
          `Recovery action ${request.action} requires a non-empty domain authorization reason`,
        );
      }

      if (request.action === 'retry') {
        const authorization = current.failure?.code === 'ambiguous_non_idempotent_effect'
          ? (() => {
              const effectId = current.failure?.effectId;
              if (effectId === undefined || effectId.length === 0) {
                throw new DomainRuntimeError(
                  'recovery_effect_identity_missing',
                  'Ambiguous non-idempotent recovery is missing durable effectId',
                );
              }
              return {
                kind: 'ambiguous-non-idempotent-resolved' as const,
                effectId,
                reason,
              };
            })()
          : { kind: 'domain-policy' as const, reason };
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
    if (shouldDrain) scheduleDrain(request.target);
    return { instance };
  }

  function subscribe(request: DomainSubscription, listener: DomainChangeListener): Unsubscribe {
    assertActive();
    return subscriptionCoordinator.subscribe(request, listener);
  }

  function invalidateBusinessSnapshot(request: BusinessInvalidation): void {
    assertActive();
    subscriptionCoordinator.invalidateBusinessSnapshot(request);
  }

  async function awaitIdle(): Promise<void> {
    for (;;) {
      await drainScheduler.awaitIdle();
      await subscriptionCoordinator.idle();
      if (drainScheduler.activeDrainCount === 0) {
        return;
      }
    }
  }

  function dispose(): Promise<void> {
    disposePromise ??= performDispose();
    return disposePromise;
  }

  async function performDispose(): Promise<void> {
    disposed = true;
    // No new drains/redrains; in-flight loops stop at their next safe
    // boundary (the current mailbox turn completes to its durable commit).
    drainScheduler.dispose();
    // Delivery, observation retries and idle waiters settle immediately.
    subscriptionCoordinator.dispose();
    observationWake.clear();
    await drainScheduler.awaitIdle();
  }

  const observationCapability: RuntimeObservationCapability =
    observationRequested && observationStore !== null
      ? {
          status: 'ENABLED',
          contractVersion: RUNTIME_OBSERVATION_CONTRACT_VERSION,
          eventFamilies: RUNTIME_OBSERVATION_EVENT_FAMILIES,
          readObservations: (request) => observationStore.readObservations(request),
          watch: (stream, onWake) => observationWake.watch(stream.target, onWake),
        }
      : { status: 'UNSUPPORTED' };

  return {
    openInstance,
    send,
    query(request: DomainQuery) {
      assertActive();
      return query.query(request);
    },
    subscribe,
    recover,
    invalidateBusinessSnapshot,
    awaitIdle,
    dispose,
    observation: observationCapability,
  };
}

function normalizeFailure(error: unknown, messageId: string): RuntimeFailure {
  return {
    code: error instanceof Error && error.name.length > 0
      ? `workflow_${error.name.replace(/Error$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() || 'processing'}_failed`
      : 'workflow_processing_failed',
    message: error instanceof Error ? error.message : String(error),
    sourceMessageId: messageId,
  };
}

function isTerminal(instance: WorkflowInstanceSnapshot): boolean {
  return (
    instance.lifecycle === 'completed' ||
    instance.lifecycle === 'failed' ||
    instance.lifecycle === 'cancelled' ||
    instance.lifecycle === 'terminated'
  );
}
