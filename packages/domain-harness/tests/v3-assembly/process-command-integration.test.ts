import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CommandOutcomeSnapshot,
  DurableProcessDataSnapshot,
  ProcessedCommandTurnCommit,
  RuntimeStoreProcessCommandExtension,
} from '../../src/contracts/process-command.js';
import { workflowAddressKey } from '../../src/instance/workflow-address.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import {
  createDomainRuntime,
  createDomainRuntimeWithProcessCommandOutcomes,
} from '../../src/runtime/create-domain-runtime.js';
import { DomainRuntimeError } from '../../src/runtime/runtime-errors.js';
import type { EffectJournalRecord } from '../../src/v2/contracts/effect.js';
import type {
  DomainMessage,
  MessageAcceptedAck,
  MessageDispositionSnapshot,
} from '../../src/v2/contracts/message.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/contracts/package.js';
import type {
  BeginEffectRequest,
  CommitProcessedMessageRequest,
  CompleteEffectRequest,
  FailMessageProcessingRequest,
  RuntimeStore,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
} from '../../src/v2/contracts/store.js';
import type {
  RuntimeFailure,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../../src/v2/contracts/workflow.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';

const TARGET: WorkflowAddress = { workflowId: 'review', instanceKey: 'case-1' };
const CORRELATION_ID = 'corr-1';

interface StoredRecord {
  readonly message: DomainMessage;
  disposition: MessageDispositionSnapshot;
}

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

class CommandRuntimeStore implements RuntimeStore, RuntimeStoreProcessCommandExtension {
  readonly #instances = new Map<string, WorkflowInstanceSnapshot>();
  readonly #messages = new Map<string, StoredRecord>();
  readonly #effects = new Map<string, EffectJournalRecord>();
  readonly #outcomes = new Map<string, CommandOutcomeSnapshot>();
  readonly #processData = new Map<string, DurableProcessDataSnapshot>();
  readonly #nextSequence = new Map<string, number>();

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    const key = workflowAddressKey(snapshot.address);
    if (this.#instances.has(key)) throw new Error(`duplicate instance ${key}`);
    this.#instances.set(key, structuredClone(snapshot));
    this.#processData.set(key, {
      target: structuredClone(snapshot.address),
      instanceStateRevision: snapshot.stateRevision,
      data: {},
    });
    this.#nextSequence.set(key, 1);
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const value = this.#instances.get(workflowAddressKey(target));
    return value === undefined ? null : structuredClone(value);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    return [...new Set([...this.#instances.values()].map((item) => item.packageId))].sort();
  }

  async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    const messageKey = this.#messageKey(message.target, message.messageId);
    const existing = this.#messages.get(messageKey);
    if (existing !== undefined) {
      return {
        status: 'duplicate',
        messageId: existing.disposition.messageId,
        target: structuredClone(existing.disposition.target),
        targetSequence: existing.disposition.targetSequence,
        packageId: existing.disposition.packageId,
        acceptedAt: existing.disposition.acceptedAt,
      };
    }

    const instance = this.#requireInstance(message.target);
    if (instance.lifecycle !== 'active' && instance.lifecycle !== 'waiting') {
      throw new Error(`target ${workflowAddressKey(message.target)} is not accepting`);
    }
    const targetKey = workflowAddressKey(message.target);
    const targetSequence = this.#nextSequence.get(targetKey) ?? 1;
    this.#nextSequence.set(targetKey, targetSequence + 1);
    const acceptedAt = timestamp(10 + targetSequence);
    const persisted: DomainMessage = {
      ...structuredClone(message),
      correlationId: message.correlationId ?? instance.correlationId,
    };
    const disposition: MessageDispositionSnapshot = {
      messageId: persisted.messageId,
      target: structuredClone(persisted.target),
      targetSequence,
      packageId: instance.packageId,
      disposition: 'accepted',
      correlationId: persisted.correlationId!,
      ...(persisted.causationId === undefined ? {} : { causationId: persisted.causationId }),
      acceptedAt,
    };
    this.#messages.set(messageKey, { message: persisted, disposition });
    return {
      status: 'accepted',
      messageId: persisted.messageId,
      target: structuredClone(persisted.target),
      targetSequence,
      packageId: instance.packageId,
      acceptedAt,
    };
  }

  async getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    const record = this.#messages.get(this.#messageKey(target, messageId));
    return record === undefined ? null : structuredClone(record.disposition);
  }

  async getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null> {
    const candidates = [...this.#messages.values()]
      .filter(
        (item) => sameAddress(item.disposition.target, target) && item.disposition.disposition === 'accepted',
      )
      .sort((a, b) => a.disposition.targetSequence - b.disposition.targetSequence);
    const record = candidates[0];
    if (record === undefined) return null;
    return {
      message: structuredClone(record.message),
      ack: {
        status: 'accepted',
        messageId: record.disposition.messageId,
        target: structuredClone(record.disposition.target),
        targetSequence: record.disposition.targetSequence,
        packageId: record.disposition.packageId,
        acceptedAt: record.disposition.acceptedAt,
      },
    };
  }

  async markMessageProcessing(
    target: WorkflowAddress,
    messageId: string,
    processingAt: string,
  ): Promise<boolean> {
    const record = this.#messages.get(this.#messageKey(target, messageId));
    if (record === undefined || record.disposition.disposition !== 'accepted') return false;
    record.disposition = {
      ...record.disposition,
      disposition: 'processing',
      processingAt,
    };
    return true;
  }

  async commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void> {
    const instance = this.#requireInstance(request.target);
    const record = this.#requireMessage(request.target, request.messageId);
    if (record.disposition.disposition !== 'processing') throw new Error('message is not processing');
    if (record.disposition.targetSequence !== request.expectedTargetSequence) throw new Error('sequence mismatch');

    record.disposition = {
      ...record.disposition,
      disposition: 'processed',
      resolvedAt: request.updatedAt,
    };
    const next = structuredClone(instance);
    next.lifecycle = request.nextLifecycle;
    next.stateRevision += 1;
    next.state = structuredClone(request.nextState);
    if (request.output !== undefined) next.output = structuredClone(request.output);
    delete next.failure;
    next.updatedAt = request.updatedAt;
    this.#instances.set(workflowAddressKey(request.target), next);
    this.#terminalizeRemainingAccepted(request.target, request.nextLifecycle, request.updatedAt);
  }

  async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    const instance = this.#requireInstance(request.target);
    const record = this.#requireMessage(request.target, request.messageId);
    if (record.disposition.targetSequence !== request.expectedTargetSequence) throw new Error('sequence mismatch');
    const failure = structuredClone(request.failure) as unknown as RuntimeFailure;
    record.disposition = {
      ...record.disposition,
      disposition: 'failed',
      failure,
      resolvedAt: request.updatedAt,
    };
    const next = structuredClone(instance);
    next.lifecycle = 'recovery_required';
    next.failure = failure;
    next.updatedAt = request.updatedAt;
    this.#instances.set(workflowAddressKey(request.target), next);
  }

  async terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void> {
    const next = structuredClone(this.#requireInstance(request.target));
    next.lifecycle = request.lifecycle;
    if (request.output !== undefined) next.output = structuredClone(request.output);
    next.updatedAt = request.updatedAt;
    this.#instances.set(workflowAddressKey(request.target), next);
    this.#terminalizeRemainingAccepted(request.target, request.lifecycle, request.updatedAt);
  }

  async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    const targets = new Map<string, WorkflowAddress>();
    for (const { disposition } of this.#messages.values()) {
      if (disposition.disposition === 'accepted' || disposition.disposition === 'processing') {
        targets.set(workflowAddressKey(disposition.target), disposition.target);
      }
    }
    return [...targets.values()].sort((a, b) => workflowAddressKey(a).localeCompare(workflowAddressKey(b)));
  }

  async reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]> {
    const reclaimed: Array<{ sequence: number; messageId: string }> = [];
    for (const record of this.#messages.values()) {
      if (!sameAddress(record.disposition.target, target) || record.disposition.disposition !== 'processing') continue;
      const next = structuredClone(record.disposition);
      next.disposition = 'accepted';
      delete next.processingAt;
      record.disposition = next;
      reclaimed.push({ sequence: next.targetSequence, messageId: next.messageId });
    }
    return reclaimed.sort((a, b) => a.sequence - b.sequence).map((item) => item.messageId);
  }

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    const value = this.#effects.get(effectId);
    return value === undefined ? null : structuredClone(value);
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.#effects.get(request.effectId);
    if (existing !== undefined) return structuredClone(existing);
    this.#effects.set(request.effectId, structuredClone(request));
    return structuredClone(request);
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.#effects.get(request.effectId);
    if (existing === undefined) throw new Error(`unknown effect ${request.effectId}`);
    const completed: EffectJournalRecord = {
      ...existing,
      status: request.status,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
      ...(request.error === undefined ? {} : { error: structuredClone(request.error) }),
      completedAt: request.completedAt,
    };
    this.#effects.set(request.effectId, structuredClone(completed));
    return structuredClone(completed);
  }

  async resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot> {
    const instance = this.#requireInstance(target);
    const sourceMessageId = instance.failure?.sourceMessageId;
    if (sourceMessageId !== undefined) {
      const record = this.#requireMessage(target, sourceMessageId);
      const nextDisposition = structuredClone(record.disposition);
      nextDisposition.disposition = 'accepted';
      delete nextDisposition.failure;
      delete nextDisposition.resolvedAt;
      delete nextDisposition.processingAt;
      record.disposition = nextDisposition;
    }
    const recovered = structuredClone(instance);
    recovered.lifecycle = 'waiting';
    delete recovered.failure;
    recovered.updatedAt = updatedAt;
    this.#instances.set(workflowAddressKey(target), recovered);
    return structuredClone(recovered);
  }

  async getProcessData(target: WorkflowAddress): Promise<DurableProcessDataSnapshot | null> {
    const value = this.#processData.get(workflowAddressKey(target));
    return value === undefined ? null : structuredClone(value);
  }

  async getCommandOutcome(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<CommandOutcomeSnapshot | null> {
    const value = this.#outcomes.get(this.#messageKey(target, messageId));
    return value === undefined ? null : structuredClone(value);
  }

  async commitProcessedCommandTurn(commit: ProcessedCommandTurnCommit): Promise<void> {
    const instance = this.#requireInstance(commit.target);
    const record = this.#requireMessage(commit.target, commit.messageId);
    if (record.disposition.disposition !== 'processing') throw new Error('message is not processing');
    if (record.disposition.targetSequence !== commit.expectedTargetSequence) throw new Error('sequence mismatch');
    if (instance.stateRevision !== commit.expectedStateRevision) throw new Error('state revision mismatch');
    if (commit.nextStateRevision !== commit.expectedStateRevision + 1) throw new Error('invalid next revision');

    record.disposition = {
      ...record.disposition,
      disposition: 'processed',
      resolvedAt: commit.updatedAt,
    };
    const next = structuredClone(instance);
    next.lifecycle = commit.nextLifecycle;
    next.stateRevision = commit.nextStateRevision;
    next.state = structuredClone(commit.nextState);
    if (commit.output !== undefined) next.output = structuredClone(commit.output);
    delete next.failure;
    next.updatedAt = commit.updatedAt;
    this.#instances.set(workflowAddressKey(commit.target), next);
    this.#processData.set(workflowAddressKey(commit.target), {
      target: structuredClone(commit.target),
      instanceStateRevision: commit.nextStateRevision,
      data: structuredClone(commit.nextProcessData),
    });
    this.#outcomes.set(this.#messageKey(commit.target, commit.messageId), structuredClone(commit.outcome));
    this.#terminalizeRemainingAccepted(commit.target, commit.nextLifecycle, commit.updatedAt);
  }

  #messageKey(target: WorkflowAddress, messageId: string): string {
    return `${workflowAddressKey(target)}\u0000${messageId}`;
  }

  #requireInstance(target: WorkflowAddress): WorkflowInstanceSnapshot {
    const value = this.#instances.get(workflowAddressKey(target));
    if (value === undefined) throw new Error(`unknown instance ${workflowAddressKey(target)}`);
    return value;
  }

  #requireMessage(target: WorkflowAddress, messageId: string): StoredRecord {
    const value = this.#messages.get(this.#messageKey(target, messageId));
    if (value === undefined) throw new Error(`unknown message ${messageId}`);
    return value;
  }

  #terminalizeRemainingAccepted(
    target: WorkflowAddress,
    lifecycle: WorkflowInstanceSnapshot['lifecycle'],
    resolvedAt: string,
  ): void {
    if (!['completed', 'failed', 'cancelled', 'terminated'].includes(lifecycle)) return;
    for (const record of this.#messages.values()) {
      if (!sameAddress(record.disposition.target, target) || record.disposition.disposition !== 'accepted') continue;
      record.disposition = {
        ...record.disposition,
        disposition: 'abandoned',
        resolvedAt,
      };
    }
  }
}

function timestamp(index: number): string {
  return `2026-09-30T00:00:${String(index).padStart(2, '0')}.000Z`;
}

function monotonicNow(): () => string {
  let index = 0;
  return () => timestamp(index++);
}

async function testPackage(): Promise<{
  readonly compiledPackage: TargetCompiledDomainPackage;
  readonly bindings: ReturnType<typeof createRuntimeHostFake>;
}> {
  const bindings = createRuntimeHostFake({
    expression: {
      async evaluate(request) {
        if (request.expression === 'never') return false;
        if (request.expression === 'boom') throw new Error('expression exploded');
        return request.input;
      },
    },
  });
  const messageContracts = Object.fromEntries(
    ['SUBMIT', 'CHECK', 'APPROVE', 'CRASH'].map((type) => [
      type,
      { type, payloadSchema: { type: 'object', additionalProperties: true } },
    ]),
  );
  const manifest: TargetCompiledDomainPackage['manifest'] = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'review-domain',
    domainVersion: '0.3.0-i-reject-test',
    packageId: 'pending',
    targetProfileId: 'i-reject-test@1',
    requiredCapabilities: [],
    workflows: {
      review: {
        workflowId: 'review',
        definition: {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: {
                SUBMIT: { routes: [{ target: 'review' }] },
                CRASH: { routes: [{ target: 'review', when: 'boom' }] },
              },
            },
            review: {
              final: false,
              done: [],
              error: [],
              events: {
                CHECK: { routes: [{ target: 'done', when: 'never' }] },
                APPROVE: { routes: [{ target: 'done' }] },
              },
            },
            done: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts,
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  manifest.packageId = await computeCompiledPackageId(manifest, bindings.sha256);
  return { compiledPackage: { manifest, bindings: {} }, bindings };
}

function command(messageId: string, type: string): DomainMessage {
  return {
    messageId,
    target: TARGET,
    type,
    payload: { messageId },
    correlationId: CORRELATION_ID,
  };
}

async function boot(mode: 'legacy' | 'v3') {
  const { compiledPackage, bindings } = await testPackage();
  const store = new CommandRuntimeStore();
  const options = {
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store,
    bindings,
    now: monotonicNow(),
  };
  const runtime = mode === 'legacy'
    ? await createDomainRuntime(options)
    : await createDomainRuntimeWithProcessCommandOutcomes(options);
  await runtime.openInstance({
    address: TARGET,
    correlationId: CORRELATION_ID,
    input: { caseId: 'case-1' },
  });
  return { runtime, store };
}

test('#137 v3: no-handler and no-route are durable normal rejections and the lane continues', async () => {
  const { runtime, store } = await boot('v3');

  await runtime.send(command('m1', 'SUBMIT'));
  await runtime.awaitIdle();
  assert.equal((await store.getCommandOutcome(TARGET, 'm1'))?.status, 'applied');
  assert.equal((await store.getMessageDisposition(TARGET, 'm1'))?.disposition, 'processed');
  assert.equal((await store.getInstance(TARGET))?.stateRevision, 1);

  await runtime.send(command('m2', 'SUBMIT'));
  await runtime.awaitIdle();
  const staleOutcome = await store.getCommandOutcome(TARGET, 'm2');
  assert.equal(staleOutcome?.status, 'rejected');
  if (staleOutcome?.status !== 'rejected') assert.fail('expected rejected command outcome');
  assert.equal(staleOutcome.rejection.code, 'MESSAGE_NOT_ACCEPTED_IN_STATE');
  assert.equal((await store.getMessageDisposition(TARGET, 'm2'))?.disposition, 'processed');
  assert.equal((await store.getInstance(TARGET))?.lifecycle, 'waiting');
  assert.equal((await store.getInstance(TARGET))?.stateRevision, 2);

  await runtime.send(command('m3', 'CHECK'));
  await runtime.awaitIdle();
  const routeOutcome = await store.getCommandOutcome(TARGET, 'm3');
  assert.equal(routeOutcome?.status, 'rejected');
  if (routeOutcome?.status !== 'rejected') assert.fail('expected rejected command outcome');
  assert.equal(routeOutcome.rejection.code, 'NO_MATCHING_ROUTE');
  assert.equal((await store.getMessageDisposition(TARGET, 'm3'))?.disposition, 'processed');
  assert.equal((await store.getInstance(TARGET))?.stateRevision, 3);

  await runtime.send(command('m4', 'APPROVE'));
  await runtime.awaitIdle();
  assert.equal((await store.getCommandOutcome(TARGET, 'm4'))?.status, 'applied');
  assert.equal((await store.getMessageDisposition(TARGET, 'm4'))?.disposition, 'processed');
  const completed = await store.getInstance(TARGET);
  assert.equal(completed?.lifecycle, 'completed');
  assert.equal(completed?.stateRevision, 4);
  assert.deepEqual((await store.getProcessData(TARGET))?.data, {});
  assert.equal((await store.getProcessData(TARGET))?.instanceStateRevision, 4);

  await runtime.dispose();
});

test('#137 v3: technical execution errors still poison the instance instead of becoming rejection', async () => {
  const { runtime, store } = await boot('v3');

  await runtime.send(command('boom-1', 'CRASH'));
  await runtime.awaitIdle();

  assert.equal((await store.getMessageDisposition(TARGET, 'boom-1'))?.disposition, 'failed');
  assert.equal((await store.getCommandOutcome(TARGET, 'boom-1')), null);
  const current = await store.getInstance(TARGET);
  assert.equal(current?.lifecycle, 'recovery_required');
  assert.match(current?.failure?.message ?? '', /expression exploded/);

  await runtime.dispose();
});

test('#137 legacy: retained createDomainRuntime keeps the historical poison-message behavior', async () => {
  const { runtime, store } = await boot('legacy');

  await runtime.send(command('legacy-1', 'SUBMIT'));
  await runtime.awaitIdle();
  await runtime.send(command('legacy-2', 'SUBMIT'));
  await runtime.awaitIdle();

  assert.equal((await store.getMessageDisposition(TARGET, 'legacy-2'))?.disposition, 'failed');
  assert.equal((await store.getCommandOutcome(TARGET, 'legacy-2')), null);
  assert.equal((await store.getInstance(TARGET))?.lifecycle, 'recovery_required');

  await runtime.dispose();
});

test('#137 v3: missing T-009 store extension fails closed before Runtime activation', async () => {
  const { compiledPackage, bindings } = await testPackage();
  const fullStore = new CommandRuntimeStore();
  const hidden = new Set(['getProcessData', 'getCommandOutcome', 'commitProcessedCommandTurn']);
  const baseOnlyStore = new Proxy(fullStore, {
    get(target, property, receiver) {
      if (typeof property === 'string' && hidden.has(property)) return undefined;
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as RuntimeStore;

  await assert.rejects(
    () => createDomainRuntimeWithProcessCommandOutcomes({
      packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
      store: baseOnlyStore,
      bindings,
    }),
    (error: unknown) =>
      error instanceof DomainRuntimeError && error.code === 'process_command_store_required',
  );
});
