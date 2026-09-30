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
import { workflowAddressKey } from '../instance/workflow-address.js';
import type { RuntimeObservationIntent } from '../observation/contracts.js';
import { isRuntimeObservationInstanceProvisioningStore } from '../observation/provisioning-contract.js';
import { RuntimeInstanceProvisioningCoordinator } from './instance-provisioning-coordinator.js';
import {
  isRuntimeInstanceProvisioningStore,
  type EnsureProvisionedInstanceOpenOutcome,
  type EnsureProvisionedInstanceOpenRequest,
  type RuntimeProvisioningCapability,
} from './durable-control-contracts.js';
import {
  RUNTIME_CONTROL_CONTRACT_VERSION,
  RuntimeControlCoordinator,
  RuntimeControlInterruptSignal,
  type ActiveRuntimeTurn,
  type RuntimeControlAuthorizer,
  type RuntimeControlCapability,
  type RuntimeControlReceipt,
  type RuntimeControlRequest,
  type RuntimeControlStore,
} from '../control/index.js';
import { DurableToolRunner } from '../execution/tool-runner/durable-tool-runner.js';
import { DomainMessageAcceptance } from '../messaging/acceptance/domain-message-acceptance.js';
import { WorkflowSendAcceptance } from '../messaging/acceptance/workflow-send-acceptance.js';
import { JournaledDomainMessageEffect } from '../messaging/send-effect/journaled-domain-message-effect.js';
import { SuccessorJournaledDomainMessageEffect } from '../messaging/send-effect/successor-journaled-domain-message-effect.js';
import { preflightPackageActivation } from '../package/activation.js';
import type {
  CompiledPackageValidatorExtensions,
  PackageActivationValidationPolicy,
} from '../package/profile-validation.js';
import { resolvePinnedPackage } from '../package/registry.js';
import { validateSuccessorCompiledPackage } from '../package/successor-validation.js';
import type { CompiledBusinessSourceContract, CompiledBusinessSourceContractPort } from '../projection/compiled-business-source.js';
import type { CompiledDomainDataPort } from '../projection/compiled-domain-data.js';
import { ProjectionService } from '../projection/projection-service.js';
import { DomainQueryDispatcher } from '../query/domain-query-dispatcher.js';
import { PoisonMessageRecoveryCoordinator } from '../recovery-v2/poison-message-recovery.js';
import {
  LEGACY_COMPILED_ARTIFACT_PROFILE,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  sameCompiledArtifactProfile,
} from '../v2/contracts/compiled-artifact-profile.js';
import type { PackageDataBounds } from '../v2/contracts/package-data.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1 } from '../schema/domainharness-json-schema-v1.js';
import { MailboxDrainScheduler } from './mailbox-drain-scheduler.js';
import {
  commitV3ProcessedCommandTurn,
  requireV3ProcessCommandStore,
  type V3ProcessCommandStore,
} from './process-command-integration.js';
import { CompiledWorkflowMessageEffectsV3 } from './compiled-workflow-message-effects-v3.js';
import { CompiledWorkflowRuntimeV3 } from './compiled-workflow-runtime-v3.js';
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
import type { RuntimeStore, StoredAcceptedMessage } from '../v2/contracts/store.js';
import type {
  RuntimeHostBindings,
  RuntimeResources,
} from '../v2/contracts/host.js';
import type {
  CompiledWorkflowDescriptor,
  PackageRegistry,
  TargetCompiledDomainPackage,
} from '../v2/contracts/package.js';
import type { JsonValue } from '../contracts/json.js';
import type {
  OpenWorkflowInstanceRequest,
  RuntimeFailure,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../v2/contracts/workflow.js';
import type { DomainMessage, MessageAcceptedAck } from '../v2/contracts/message.js';
import {
  CompiledWorkflowRuntime,
  type CompiledWorkflowCommandResult,
  type CompiledWorkflowTransition,
} from './compiled-workflow-runtime.js';
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
  /**
   * I-03-ASSEMBLY successor profile enablement: host-side maxima declaring
   * this Runtime/host also accepts successor ('0.3',2,3) packages. Absent
   * (the default) keeps the exact historical legacy-only 0.2/2/2 activation
   * policy. These maxima are host authority; package-recorded bounds may
   * never exceed them and are never truncated or raised.
   */
  supportedPackageDataBounds?: PackageDataBounds;
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
  /**
   * Issue #313 generic public Runtime cancel/interrupt control. Absent (the
   * default) keeps every existing Runtime semantic unchanged and exposes the
   * explicit default-deny `{ status: 'UNSUPPORTED' }` control capability: no
   * authorizer means no external control authority. `enabled` requires a
   * fail-closed `RuntimeControlAuthorizer` plus a durable `RuntimeControlStore`
   * for request/outcome evidence and restart reconciliation.
   */
  control?: RuntimeControlEnableOptions;
}

/** Enablement options for the generic public Runtime control surface (#313). */
export interface RuntimeControlEnableOptions {
  readonly mode: 'enabled';
  readonly authorizer: RuntimeControlAuthorizer;
  readonly store: RuntimeControlStore;
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
  /** Opaque DAC/A2-owned provenance refs, carried verbatim on records when present. */
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

type RuntimeProcessingMode = 'legacy' | 'v3-process-command';

/**
 * Activates the portable retained Runtime from already-target-compiled package
 * modules. The public v0.2 entrypoint always uses the historical processing
 * path; createDomainRuntimeV3 alone opts into the frozen T-009 commit path.
 */
export function createDomainRuntime(options: CreateDomainRuntimeOptions): Promise<DomainRuntime> {
  return createDomainRuntimeInternal(options, 'legacy');
}

/** Internal v3 assembly entrypoint; intentionally not re-exported by runtime/index.ts. */
export function createDomainRuntimeWithProcessCommandOutcomes(
  options: CreateDomainRuntimeOptions,
): Promise<DomainRuntime> {
  return createDomainRuntimeInternal(options, 'v3-process-command');
}

async function createDomainRuntimeInternal(
  options: CreateDomainRuntimeOptions,
  processingMode: RuntimeProcessingMode,
): Promise<DomainRuntime> {
  const processCommandStore: V3ProcessCommandStore | null =
    processingMode === 'v3-process-command' ? requireV3ProcessCommandStore(options.store) : null;

  // Issue #312 observation composition: when enabled, every observation-v1
  // covered mutation flows through the observation-capable store. The frozen
  // observation-v1 contract explicitly excludes T-009 process-command commits,
  // so v3 processed-command publication remains on the same underlying store
  // without fabricating a TURN_COMMITTED observation for an uncovered mutation.
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

  // Shared #312 exact package identity mapping: used by the recording-store
  // decorator for covered RuntimeStore mutations AND by the #180 provisioning
  // ensure/open intent so INSTANCE_OPENED records carry the same identity.
  const resolveObservationPackageIdentity =
    options.observation?.resolvePackageIdentity ??
    ((packageId: string): DomainIntelligencePackageIdentity => {
      const compiledPackage = resolvePinnedPackage(options.packageRegistry, packageId);
      return runtimePackageIdentityFromManifest(compiledPackage.manifest);
    });

  const effectiveStore: RuntimeStore =
    observationRequested && observationStore !== null
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
  const provisioningObservationCapable =
    provisioningStore !== null &&
    isRuntimeObservationInstanceProvisioningStore(options.store);
  const provisioningCoordinator =
    provisioningStore !== null &&
    (!observationRequested || provisioningObservationCapable)
      ? new RuntimeInstanceProvisioningCoordinator(provisioningStore)
      : null;
  const provisioningObservationIntent =
    observationRequested && provisioningObservationCapable
      ? (packageId: string): RuntimeObservationIntent => ({
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

  // I-03-ASSEMBLY activation policy: absent host maxima keep the exact
  // historical legacy-only single-profile validation (byte-for-byte retained
  // behavior for existing hosts); supplied maxima additionally enable the
  // successor 0.3/2/3 profile with the DomainHarness-owned successor
  // validator installed, so retained and successor packages in one registry
  // each validate through their exact profile.
  const successorSupportEnabled = options.supportedPackageDataBounds !== undefined;
  const validationPolicy: PackageActivationValidationPolicy =
    options.supportedPackageDataBounds === undefined
      ? {
          formatVersion: '0.2',
          runtimeContractMajor: 2,
          executionEngineMajor: 2,
          hostCapabilities: options.bindings.capabilities,
          sha256: options.bindings.sha256,
        }
      : {
          supportedProfiles: [
            LEGACY_COMPILED_ARTIFACT_PROFILE,
            SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
          ],
          hostCapabilities: options.bindings.capabilities,
          sha256: options.bindings.sha256,
          supportedPackageDataBounds: options.supportedPackageDataBounds,
        };
  const validatorExtensions: CompiledPackageValidatorExtensions | undefined =
    successorSupportEnabled ? { successor: validateSuccessorCompiledPackage } : undefined;
  await preflightPackageActivation({
    registry: options.packageRegistry,
    store: effectiveStore,
    validationPolicy,
    ...(validatorExtensions === undefined ? {} : { extensions: validatorExtensions }),
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
  // I-03-ASSEMBLY projection boundary (L2-A §3.8): successor packages derive
  // their Domain Data reads and Business Source contract lookups from the
  // exact activated package material — out-of-band host maps cannot claim
  // successor integrity conformance. Retained 0.2/2/2 packages keep the
  // historical host-supplied CompiledDomainDataPort unchanged.
  const dispatchingDomainData: CompiledDomainDataPort | undefined =
    options.domainData === undefined && !successorSupportEnabled
      ? undefined
      : {
          get(packageId, key) {
            const compiledPackage = options.packageRegistry.get(packageId);
            if (compiledPackage !== undefined && isSuccessorCompiledPackage(compiledPackage)) {
              return compiledPackage.domainData?.[key];
            }
            return options.domainData?.get(packageId, key);
          },
        };
  const packageBusinessSourceContracts: CompiledBusinessSourceContractPort = {
    get(packageId, source): CompiledBusinessSourceContract | undefined {
      const compiledPackage = options.packageRegistry.get(packageId);
      if (compiledPackage === undefined || !isSuccessorCompiledPackage(compiledPackage)) {
        return undefined;
      }
      const descriptor = compiledPackage.manifest.businessSources?.find(
        (candidate) => candidate.source === source,
      );
      if (descriptor === undefined) return undefined;
      return {
        schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
        descriptor: { source: descriptor.source, valueSchema: descriptor.valueSchema },
      };
    },
  };
  const projection = new ProjectionService({
    packageRegistry: options.packageRegistry,
    store: options.store,
    ...(options.businessSnapshots === undefined ? {} : { businessSnapshots: options.businessSnapshots }),
    ...(dispatchingDomainData === undefined ? {} : { domainData: dispatchingDomainData }),
    businessSourceContracts: packageBusinessSourceContracts,
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
            if (subscription.kind === 'projection') return;
            options.onBackgroundError?.(error, subscription.target);
          },
        }),
  });

  let disposed = false;
  let disposePromise: Promise<void> | undefined;

  const activeTurns = new Map<string, ActiveRuntimeTurn>();
  const turnKey = (target: WorkflowAddress): string => workflowAddressKey(target);

  const controlRequested = options.control?.mode === 'enabled';
  const controlCoordinator =
    controlRequested && options.control !== undefined
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

  // I-03-ASSEMBLY engine-major-3 execution: the successor interpreter stack is
  // assembled onto the SAME store, acceptance authority, tool runner and
  // notification path — one Runtime, one DurableExecutionStore, one durable
  // effect authority. The I-MSG-REJECT typed acceptance adapter classifies the
  // closed permanent/transient taxonomy; permanent child-send rejections are
  // durably committed by the successor journaled effect and routed by the
  // engine-3 interpreter's total `rejected` routes, while engine-2 packages
  // keep the retained JournaledDomainMessageEffect unchanged.
  const workflowSendAcceptance = new WorkflowSendAcceptance({ acceptance, store: effectiveStore });
  const successorMessageEffect = new SuccessorJournaledDomainMessageEffect({
    store: effectiveStore,
    acceptance: workflowSendAcceptance,
    sha256: options.bindings.sha256,
    ...(options.now === undefined ? {} : { now }),
  });
  const successorMessageEffects = new CompiledWorkflowMessageEffectsV3({
    expression: options.bindings.expression,
    messageEffect: successorMessageEffect,
    onChildAccepted(target, messageId) {
      notifyTargetChanged(target, messageId);
      scheduleDrain(target);
    },
  });
  const runtimeWorkflowV3 = new CompiledWorkflowRuntimeV3({
    expression: options.bindings.expression,
    toolRunner,
    toolExecutor: createRuntimeToolExecutor(options.bindings),
    ...(skillRunner === undefined ? {} : { skillRunner }),
    messageEffects: successorMessageEffects,
  });

  function isSuccessorCompiledPackage(
    compiledPackage: TargetCompiledDomainPackage,
  ): boolean {
    return sameCompiledArtifactProfile(
      {
        formatVersion: compiledPackage.manifest.formatVersion,
        runtimeContractMajor: compiledPackage.manifest.runtimeContractMajor,
        executionEngineMajor: compiledPackage.manifest.executionEngineMajor,
      },
      SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
    );
  }

  // Exact per-package profile dispatch for execution: retained 0.2/2/2
  // packages execute on the historical engine-2 interpreter and successor
  // 0.3/2/3 packages on the engine-3 interpreter, in the same Runtime.
  function processWorkflowMessage(
    compiledPackage: TargetCompiledDomainPackage,
    workflow: CompiledWorkflowDescriptor,
    current: WorkflowInstanceSnapshot,
    stored: StoredAcceptedMessage,
    execution: { signal?: AbortSignal },
  ): Promise<CompiledWorkflowTransition> {
    if (!isSuccessorCompiledPackage(compiledPackage)) {
      return runtimeWorkflow.processMessage(compiledPackage, workflow, current, stored, execution);
    }
    return runtimeWorkflowV3
      .processCommand(compiledPackage, workflow, current, stored, execution)
      .then((result) => {
        if (result.status === 'rejected') {
          throw new Error(result.rejection.message);
        }
        return result.transition;
      });
  }

  function processWorkflowCommand(
    compiledPackage: TargetCompiledDomainPackage,
    workflow: CompiledWorkflowDescriptor,
    current: WorkflowInstanceSnapshot,
    stored: StoredAcceptedMessage,
    execution: { signal?: AbortSignal },
  ): Promise<CompiledWorkflowCommandResult> {
    return isSuccessorCompiledPackage(compiledPackage)
      ? runtimeWorkflowV3.processCommand(compiledPackage, workflow, current, stored, execution)
      : runtimeWorkflow.processCommand(compiledPackage, workflow, current, stored, execution);
  }

  function initialWorkflowState(
    compiledPackage: TargetCompiledDomainPackage,
    workflow: CompiledWorkflowDescriptor,
    input: JsonValue,
  ): JsonValue {
    return isSuccessorCompiledPackage(compiledPackage)
      ? runtimeWorkflowV3.initialState(workflow, input)
      : runtimeWorkflow.initialState(workflow, input);
  }

  const unresolvedTargets = await options.store.listUnresolvedMessageTargets();
  for (const target of unresolvedTargets) {
    await options.store.reclaimInterruptedProcessing(target);
    scheduleDrain(target);
  }

  if (controlCoordinator !== null) {
    await controlCoordinator.reconcileUnresolved();
  }

  async function drainMailbox(target: WorkflowAddress): Promise<void> {
    while (true) {
      if (drainScheduler.disposed) return;
      if (controlCoordinator !== null && controlCoordinator.blocksNewTurns(target)) return;
      const stored = await recovery.nextProcessableMessage(target);
      if (stored === null) return;

      const turnController = new AbortController();
      let settleTurn: () => void = () => {};
      const settled = new Promise<void>((resolve) => {
        settleTurn = resolve;
      });
      const key = turnKey(target);
      activeTurns.set(key, {
        messageId: stored.message.messageId,
        targetSequence: stored.ack.targetSequence,
        controller: turnController,
        settled,
      });

      let committed: WorkflowInstanceSnapshot;
      try {
        committed = processCommandStore === null
          ? await processLegacyTurn(target, stored, turnController)
          : await processV3CommandTurn(target, stored, turnController, processCommandStore);
      } finally {
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

  async function processLegacyTurn(
    target: WorkflowAddress,
    stored: StoredAcceptedMessage,
    turnController: AbortController,
  ): Promise<WorkflowInstanceSnapshot> {
    return instanceEngine.processAcceptedTransition({
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
          const transition = await processWorkflowMessage(
            compiledPackage,
            workflow,
            current,
            stored,
            { signal: turnController.signal },
          );
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
        } catch (error) {
          if (error instanceof RecoveryRecordedError || error instanceof ProcessingConflictError) throw error;
          await recordTechnicalProcessingFailure(target, stored, turnController, error);
          throw new RecoveryRecordedError(target);
        }
      },
    });
  }

  async function processV3CommandTurn(
    target: WorkflowAddress,
    stored: StoredAcceptedMessage,
    turnController: AbortController,
    store: V3ProcessCommandStore,
  ): Promise<WorkflowInstanceSnapshot> {
    let current!: WorkflowInstanceSnapshot;

    await lane.run(target, async () => {
      const resolved = await options.store.getInstance(target);
      if (resolved === null) {
        throw new DomainRuntimeError(
          'instance_not_found',
          `Workflow ${target.workflowId}/${target.instanceKey} does not exist`,
        );
      }
      current = resolved;

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

        const result = await processWorkflowCommand(
          compiledPackage,
          workflow,
          current,
          stored,
          { signal: turnController.signal },
        );
        if (result.status === 'applied' && result.transition.recoveryFailure !== undefined) {
          await recovery.recordProcessingFailure({
            target,
            messageId: stored.message.messageId,
            expectedTargetSequence: stored.ack.targetSequence,
            failure: withControlProvenance(
              result.transition.recoveryFailure,
              turnController.signal,
            ),
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
      } catch (error) {
        if (error instanceof RecoveryRecordedError || error instanceof ProcessingConflictError) throw error;
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
    if (
      workflowAddressKey(committed.address) !== workflowAddressKey(current.address)
      || committed.packageId !== current.packageId
      || committed.correlationId !== current.correlationId
    ) {
      throw new Error('T-009 processed-command commit changed persistent Workflow Instance identity');
    }
    if (committed.stateRevision !== current.stateRevision + 1) {
      throw new Error(
        `T-009 processed-command commit produced stateRevision ${committed.stateRevision}; expected ${current.stateRevision + 1}`,
      );
    }
    return committed;
  }

  async function recordTechnicalProcessingFailure(
    target: WorkflowAddress,
    stored: StoredAcceptedMessage,
    turnController: AbortController,
    error: unknown,
  ): Promise<void> {
    const failure = withControlProvenance(
      turnController.signal.aborted
        ? controlInterruptFailure(turnController.signal, stored.message.messageId)
        : normalizeFailure(error, stored.message.messageId),
      turnController.signal,
    );
    await recovery.recordProcessingFailure({
      target,
      messageId: stored.message.messageId,
      expectedTargetSequence: stored.ack.targetSequence,
      failure,
    });
    notifyTargetChanged(target, stored.message.messageId);
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
      initialState: initialWorkflowState(compiledPackage, workflow, request.input),
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
  async function ensureProvisionedInstanceOpen(
    request: EnsureProvisionedInstanceOpenRequest,
  ): Promise<EnsureProvisionedInstanceOpenOutcome> {
    assertActive();
    if (provisioningCoordinator === null) {
      throw new DomainRuntimeError(
        'provisioning_unsupported',
        'Runtime provisioning ensure/open requires a RuntimeStore implementing the atomic I-OPEN provisioning extension',
      );
    }
    const packageId = request.packageId ?? options.packageRegistry.defaultPackageId;
    const compiledPackage = resolvePinnedPackage(options.packageRegistry, packageId);
    const workflow = compiledPackage.manifest.workflows[request.address.workflowId];
    if (workflow === undefined) {
      throw new DomainRuntimeError(
        'workflow_not_in_package',
        `Package ${packageId} does not contain workflow ${request.address.workflowId}`,
      );
    }
    const requestedAt = now();
    const initialInstance: WorkflowInstanceSnapshot = {
      address: request.address,
      correlationId: request.correlationId,
      packageId,
      lifecycle: 'waiting',
      stateRevision: 0,
      state: initialWorkflowState(compiledPackage, workflow, request.input),
      createdAt: requestedAt,
      updatedAt: requestedAt,
    };
    const result = await provisioningCoordinator.ensureProvisionedWorkflowInstanceOpen(
      {
        provisioningKey: request.provisioningKey,
        target: request.address,
        correlationId: request.correlationId,
        packageId,
        input: request.input,
        requestedAt,
        initialInstance,
      },
      provisioningObservationIntent?.(packageId),
    );
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
    drainScheduler.dispose();
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

  const controlCapability: RuntimeControlCapability =
    controlCoordinator !== null
      ? {
          status: 'ENABLED',
          contractVersion: RUNTIME_CONTROL_CONTRACT_VERSION,
          requestControl: (request: RuntimeControlRequest) => {
            assertActive();
            return controlCoordinator.requestControl(request);
          },
          getControlOutcome: (controlRequestId: string) => {
            assertActive();
            return controlCoordinator.getControlOutcome(controlRequestId);
          },
        }
      : {
          status: 'UNSUPPORTED',
          requestControl: async (request: RuntimeControlRequest): Promise<RuntimeControlReceipt> => ({
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

  const provisioningCapability: RuntimeProvisioningCapability =
    provisioningCoordinator !== null
      ? { status: 'ENABLED', ensureOpen: ensureProvisionedInstanceOpen }
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
    control: controlCapability,
    provisioning: provisioningCapability,
  };
}

/** Failure recorded when a winning INTERRUPT's signal stopped the in-flight turn. */
function controlInterruptFailure(signal: AbortSignal, messageId: string): RuntimeFailure {
  const reason: unknown = signal.reason;
  const controlRequestId =
    reason instanceof RuntimeControlInterruptSignal ? reason.controlRequestId : undefined;
  return {
    code: 'runtime_control_interrupted',
    message:
      controlRequestId === undefined
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
function withControlProvenance(failure: RuntimeFailure, signal: AbortSignal): RuntimeFailure {
  if (!signal.aborted) return failure;
  const reason: unknown = signal.reason;
  if (!(reason instanceof RuntimeControlInterruptSignal)) return failure;
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
