import type { AIOperationPort } from '../contracts/ai.js';
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
import { SubscriptionRegistry, type ProjectionSubscription } from '../subscription/subscription-registry.js';
import { MessageRevisionTracker } from './message-revision-tracker.js';
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
}

class RecoveryRecordedError extends Error {
  constructor(readonly target: WorkflowAddress) {
    super(`Workflow ${target.workflowId}/${target.instanceKey} entered recovery_required`);
    this.name = 'RecoveryRecordedError';
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
  await preflightPackageActivation({
    registry: options.packageRegistry,
    store: options.store,
    validationPolicy: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      hostCapabilities: options.bindings.capabilities,
      sha256: options.bindings.sha256,
    },
  });

  const now = options.now ?? (() => new Date().toISOString());
  const lane = new PerInstanceSerializedLane();
  const instanceEngine = new WorkflowInstanceEngine(options.store, { now, lane });
  const acceptance = new DomainMessageAcceptance({
    store: options.store,
    packages: options.packageRegistry,
  });
  const recovery = new PoisonMessageRecoveryCoordinator(options.store, { now });
  const toolRunner = new DurableToolRunner({
    store: options.store,
    sha256: options.bindings.sha256,
    now,
  });
  const skillRunner = options.ai === undefined
    ? undefined
    : new JournaledSkillRunner({
        store: options.store,
        sha256: options.bindings.sha256,
        ai: options.ai,
        now,
      });
  const messageEffect = new JournaledDomainMessageEffect({
    store: options.store,
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
  const projectionSubscriptions = new Map<string, { request: ProjectionSubscription; count: number }>();
  const messageRevisions = new MessageRevisionTracker();

  const subscriptions = new SubscriptionRegistry({
    observationSource: {
      async readRevision(subscription) {
        if (subscription.kind === 'instance') {
          const instance = await options.store.getInstance(subscription.target);
          return instance === null
            ? null
            : JSON.stringify([instance.packageId, instance.stateRevision, instance.lifecycle, instance.updatedAt]);
        }
        if (subscription.kind === 'message') {
          if (subscription.messageId === undefined) {
            return messageRevisions.read(addressKey(subscription.target));
          }
          const disposition = await options.store.getMessageDisposition(
            subscription.target,
            subscription.messageId,
          );
          return disposition === null
            ? null
            : JSON.stringify([
                disposition.targetSequence,
                disposition.disposition,
                disposition.processingAt ?? null,
                disposition.resolvedAt ?? null,
              ]);
        }
        const snapshot = await projection.read({
          projectionId: subscription.projectionId,
          key: subscription.key,
        });
        return snapshot.revision;
      },
      isProjectionAffectedByBusinessInvalidation(subscription, invalidation) {
        const compiledPackage = options.packageRegistry.get(options.packageRegistry.defaultPackageId);
        const descriptor = compiledPackage?.manifest.projections[subscription.projectionId];
        return descriptor?.dependencies.some(
          (dependency) => dependency.kind === 'business' && dependency.source === invalidation.source,
        ) ?? false;
      },
    },
    ...(options.onBackgroundError === undefined
      ? {}
      : {
          onObservationError(error, subscription) {
            if (subscription.kind === 'projection') return;
            options.onBackgroundError?.(
              error,
              subscription.target,
            );
          },
        }),
  });

  const drains = new Map<string, Promise<void>>();
  const drainRequested = new Set<string>();
  let runtimeWorkflow: CompiledWorkflowRuntime;

  const scheduleDrain = (target: WorkflowAddress): void => {
    const key = addressKey(target);
    if (drains.has(key)) {
      // Preserve the wake-up. The active drain may already have observed an empty
      // mailbox; dropping this signal would strand an accepted message.
      drainRequested.add(key);
      return;
    }
    const drain = Promise.resolve()
      .then(() => drainMailbox(target))
      .catch((error: unknown) => {
        // RecoveryRecordedError is the durable poison-message path: the failure fact
        // is already persisted and observable, so it is not reported again. Every
        // other drain failure — including ProcessingConflictError — surfaces here so
        // a stuck mailbox is never silent.
        if (!(error instanceof RecoveryRecordedError)) {
          try {
            options.onBackgroundError?.(error, target);
          } catch {
            // A throwing host error handler must not turn drain-error routing into
            // an unhandled rejection on the floating drain promise chain.
          }
        }
      })
      .finally(() => {
        if (drains.get(key) !== drain) return;
        drains.delete(key);
        if (drainRequested.delete(key)) scheduleDrain(target);
      });
    drains.set(key, drain);
  };

  const notifyTargetChanged = (target: WorkflowAddress, messageId?: string): void => {
    const key = addressKey(target);
    messageRevisions.bump(key);
    subscriptions.notifyInstanceChanged(target);
    subscriptions.notifyMessageChanged(target, messageId);
    for (const { request } of projectionSubscriptions.values()) {
      subscriptions.notifyProjectionChanged(request.projectionId, request.key);
    }
  };

  runtimeWorkflow = new CompiledWorkflowRuntime({
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
    const packageId = request.packageId ?? options.packageRegistry.defaultPackageId;
    const compiledPackage = resolvePinnedPackage(options.packageRegistry, packageId);
    const workflow = compiledPackage.manifest.workflows[request.address.workflowId];
    if (workflow === undefined) {
      throw new Error(
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
    const ack = await acceptance.accept(message);
    notifyTargetChanged(message.target, message.messageId);
    scheduleDrain(message.target);
    return ack;
  }

  async function recover(request: RecoveryRequest): Promise<RecoveryResult> {
    let shouldDrain = false;
    const instance = await lane.run(request.target, async () => {
      const current = await options.store.getInstance(request.target);
      if (current === null) {
        throw new Error(`Workflow ${request.target.workflowId}/${request.target.instanceKey} does not exist`);
      }
      const messageId = current.failure?.sourceMessageId;
      if (messageId === undefined || messageId.length === 0) {
        throw new Error('Recovery requires a durable poison-message identity on the instance failure');
      }
      const reason = request.reason?.trim();
      if (reason === undefined || reason.length === 0) {
        throw new Error(`Recovery action ${request.action} requires a non-empty domain authorization reason`);
      }

      if (request.action === 'retry') {
        const authorization = current.failure?.code === 'ambiguous_non_idempotent_effect'
          ? (() => {
              const effectId = current.failure?.effectId;
              if (effectId === undefined || effectId.length === 0) {
                throw new Error('Ambiguous non-idempotent recovery is missing durable effectId');
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
    let projectionKey: string | undefined;
    if (request.kind === 'projection') {
      projectionKey = JSON.stringify([request.projectionId, request.key]);
      const existing = projectionSubscriptions.get(projectionKey);
      projectionSubscriptions.set(projectionKey, {
        request: { ...request },
        count: (existing?.count ?? 0) + 1,
      });
    }
    // Target-wide message subscriptions are the only consumer of synthesized
    // revisions; scoping retention to them keeps the tracker bounded by active
    // subscriptions instead of address history (#170).
    let revisionKey: string | undefined;
    if (request.kind === 'message' && request.messageId === undefined) {
      revisionKey = addressKey(request.target);
      messageRevisions.retain(revisionKey);
    }
    const unsubscribe = subscriptions.subscribe(request, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      unsubscribe();
      if (projectionKey !== undefined) {
        const existing = projectionSubscriptions.get(projectionKey);
        if (existing !== undefined) {
          if (existing.count <= 1) projectionSubscriptions.delete(projectionKey);
          else projectionSubscriptions.set(projectionKey, { ...existing, count: existing.count - 1 });
        }
      }
      if (revisionKey !== undefined) messageRevisions.release(revisionKey);
    };
  }

  function invalidateBusinessSnapshot(request: BusinessInvalidation): void {
    subscriptions.invalidateBusinessSnapshot(request);
  }

  return {
    openInstance,
    send,
    query(request: DomainQuery) {
      return query.query(request);
    },
    subscribe,
    recover,
    invalidateBusinessSnapshot,
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

function addressKey(target: WorkflowAddress): string {
  return JSON.stringify([target.workflowId, target.instanceKey]);
}

function isTerminal(instance: WorkflowInstanceSnapshot): boolean {
  return (
    instance.lifecycle === 'completed' ||
    instance.lifecycle === 'failed' ||
    instance.lifecycle === 'cancelled' ||
    instance.lifecycle === 'terminated'
  );
}
