// I-03-ASSEMBLY focused integration material: one shared in-memory
// RuntimeStore (mailbox turns + T-009 processed-command commits + effect
// journal + atomic I-OPEN provisioning seam), a real-sha256 host fake (the
// successor packageId seam is the portable canonical digest, so the fake hash
// of unit tests cannot round-trip a publicly compiled package), and builders
// for publicly compiled successor packages plus retained 0.2/2/2 fixtures.
import { createHash } from 'node:crypto';
import type {
  CommandOutcomeSnapshot,
  DurableProcessDataSnapshot,
  ProcessedCommandTurnCommit,
  RuntimeStoreProcessCommandExtension,
} from '../../packages/domain-harness/src/contracts/process-command.js';
import type {
  BeginEffectRequest,
  CompleteEffectRequest,
  CommitProcessedMessageRequest,
  FailMessageProcessingRequest,
  RuntimeStore,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
} from '../../packages/domain-harness/src/v2/contracts/store.js';
import type { EffectJournalRecord } from '../../packages/domain-harness/src/v2/contracts/effect.js';
import type { DomainMessage, MessageAcceptedAck, MessageDispositionSnapshot } from '../../packages/domain-harness/src/v2/contracts/message.js';
import type { RuntimeHostBindings } from '../../packages/domain-harness/src/v2/index.js';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../../packages/domain-harness/src/v2/contracts/workflow.js';
import { workflowAddressKey } from '../../packages/domain-harness/src/instance/workflow-address.js';
import type {
  EnsureProvisionedWorkflowInstanceOpenResult,
  ProvisionAndOpenWorkflowInstanceRequest,
  RuntimeInstanceProvisioningStore,
} from '../../packages/domain-harness/src/runtime/durable-control-contracts.js';
import { compileDomainPackage } from '../../packages/domain-harness-compiler/src/index.js';
import type {
  BusinessSourceCompileEntry,
  DomainDataCompileEntry,
} from '../../packages/domain-harness-compiler/src/index.js';
import type {
  CapabilityId,
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawRoute,
  RawToolDefinition,
  RawWorkflow,
  TargetHostProfile,
} from '../../packages/domain-harness-compiler/src/raw/types.js';

export const ASSEMBLY_CRYPTO: CapabilityId = 'crypto-hash-sha256@1';
export const ASSEMBLY_MODULE: CapabilityId = 'compiled-package-module@1';
export const ASSEMBLY_INVENTORY: CapabilityId = 'inventory-native@1';
export const HOST_LOCAL_INVENTORY_BINDING_ID = 'assembly-inventory-native-v1';

export const ASSEMBLY_BOUNDS = {
  maxDomainDataEntries: 16,
  maxDomainDataEntryCanonicalBytes: 2048,
  maxTotalDomainDataCanonicalBytes: 8192,
  maxBusinessSources: 8,
  maxSchemaCanonicalBytes: 4096,
} as const;

export const HOST_MAXIMA = {
  maxDomainDataEntries: 32,
  maxDomainDataEntryCanonicalBytes: 4096,
  maxTotalDomainDataCanonicalBytes: 16384,
  maxBusinessSources: 32,
  maxSchemaCanonicalBytes: 8192,
} as const;

export function assemblyTarget(
  overrides: Partial<TargetHostProfile> = {},
): TargetHostProfile {
  return {
    id: 'assembly-host@1',
    capabilities: [ASSEMBLY_CRYPTO, ASSEMBLY_MODULE, ASSEMBLY_INVENTORY],
    bindings: {
      [ASSEMBLY_CRYPTO]: 'assembly-sha256-v1',
      [ASSEMBLY_MODULE]: 'assembly-module-v1',
      [ASSEMBLY_INVENTORY]: HOST_LOCAL_INVENTORY_BINDING_ID,
    },
    packageDataBounds: { ...ASSEMBLY_BOUNDS },
    ...overrides,
  };
}

export const ASSEMBLY_BINDING_CONTENTS: Readonly<Record<string, string>> = {
  'assembly-sha256-v1': 'assembly sha256 adapter artifact',
  'assembly-module-v1': 'assembly compiled module loader artifact',
  [HOST_LOCAL_INVENTORY_BINDING_ID]: 'assembly host-local inventory adapter artifact',
};

export interface AssemblyHostOptions {
  readonly inventoryCalls?: Array<{ toolId: string; input: unknown; effectId: string }>;
  readonly expression?: RuntimeHostBindings['expression'];
}

/**
 * Real-sha256 deterministic host fake. The successor packageId is the portable
 * canonical digest over the manifest identity material, so activation of a
 * publicly compiled package requires a real hash port; expression evaluation
 * resolves the small closed fixture expression set.
 */
export function createAssemblyHost(options: AssemblyHostOptions = {}): RuntimeHostBindings {
  const inventoryCalls = options.inventoryCalls ?? [];
  return {
    capabilities: [ASSEMBLY_CRYPTO, ASSEMBLY_MODULE, ASSEMBLY_INVENTORY],
    sha256: {
      async digestUtf8(value: string): Promise<string> {
        return createHash('sha256').update(value, 'utf8').digest('hex');
      },
    },
    secureRandom: {
      randomId(): string {
        return `assembly-random-${Math.random().toString(36).slice(2)}`;
      },
    },
    expression: options.expression ?? {
      async evaluate(request) {
        if (request.expression === '$.child') {
          return { workflowId: 'child', instanceKey: 'child-1' };
        }
        if (request.expression === '$.missingChild') {
          return { workflowId: 'child', instanceKey: 'missing-child' };
        }
        if (request.expression === '$.rejection.code') {
          const scope = request.input as { rejection?: { code?: string } };
          return scope.rejection?.code === 'target_terminal';
        }
        return request.input;
      },
    },
    hostLocalDomainTools: {
      [HOST_LOCAL_INVENTORY_BINDING_ID]: {
        capability: ASSEMBLY_INVENTORY,
        digest: createHash('sha256')
          .update(
            JSON.stringify({
              bindingId: HOST_LOCAL_INVENTORY_BINDING_ID,
              contentDigest: createHash('sha256')
                .update(ASSEMBLY_BINDING_CONTENTS[HOST_LOCAL_INVENTORY_BINDING_ID] ?? '', 'utf8')
                .digest('hex'),
            }),
          )
          .digest('hex'),
        async execute(request) {
          inventoryCalls.push({
            toolId: request.toolId,
            input: request.input,
            effectId: request.context.effectId,
          });
          return { reserved: true, effectId: request.context.effectId };
        },
      },
    },
  };
}

export interface AssemblyRawWorkflowSpec {
  readonly workflowId: string;
  readonly effectTarget?: string;
  readonly rejected?: readonly RawRoute[];
  readonly tool?: RawToolDefinition;
  /** Terminal-on-message child shape: no effects, no invoke. */
  readonly simple?: boolean;
}

export function assemblyRawPackage(
  workflows: readonly AssemblyRawWorkflowSpec[] = [],
): LoadedRawDomainPackage {
  return {
    root: '/assembly-fixture',
    schemaVersion: '0.1',
    domainId: 'assembly.domain',
    limits: { maxSteps: 16 },
    workflows: new Map(
      workflows.map((spec) => [
        spec.workflowId,
        spec.simple === true
          ? simpleWorkflow(spec.workflowId)
          : parentWorkflow(spec),
      ]),
    ),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(workflows.map((spec) => [spec.workflowId, []])),
  };
}

function simpleWorkflow(workflowId: string): RawWorkflow {
  return {
    id: workflowId,
    sourcePath: `/authoring/${workflowId}.yaml`,
    initial: 'start',
    states: {
      start: {
        id: 'start',
        final: false,
        done: [],
        error: [],
        events: {
          BEGIN: { routes: [{ target: 'done' }] },
          NOTIFY: { routes: [{ target: 'done' }] },
        },
      },
      done: { id: 'done', final: true, done: [], error: [], events: {} },
    },
  };
}

function parentWorkflow(spec: AssemblyRawWorkflowSpec): RawWorkflow {
  return {
    id: spec.workflowId,
    sourcePath: `/authoring/${spec.workflowId}.yaml`,
    initial: 'start',
    states: {
      start: {
        id: 'start',
        final: false,
        done: [],
        error: [],
        events: {
          BEGIN: { routes: [{ target: 'acting' }] },
        },
      },
      acting: {
        id: 'acting',
        final: false,
        ...(spec.tool === undefined ? {} : {
          invoke: { kind: 'tool', ref: spec.tool.toolId },
        }),
        done: [{ target: 'done' }],
        error: [],
        events: {},
        effects: [{
          kind: 'domain-message',
          targetExpression: spec.effectTarget ?? '$.child',
          messageType: 'NOTIFY',
          payloadExpression: '$',
          rejected: spec.rejected ?? [{ target: 'rejected' }],
        }],
      },
      done: { id: 'done', final: true, done: [], error: [], events: {} },
      rejected: { id: 'rejected', final: true, done: [], error: [], events: {} },
    },
  };
}

export interface CompileAssemblyPackageOptions {
  readonly raw?: LoadedRawDomainPackage;
  readonly workflows?: readonly AssemblyRawWorkflowSpec[];
  readonly tools?: readonly RawToolDefinition[];
  readonly projections?: readonly RawProjectionDefinition[];
  readonly domainData?: readonly DomainDataCompileEntry[];
  readonly businessSources?: readonly BusinessSourceCompileEntry[];
  readonly target?: TargetHostProfile;
}

/** Compile through the PUBLIC compiler entry: the emission under test. */
export function compileAssemblyPackage(options: CompileAssemblyPackageOptions = {}) {
  return compileDomainPackage({
    raw: options.raw ?? assemblyRawPackage(options.workflows ?? [{ workflowId: 'parent' }]),
    domainVersion: '1.0.0-assembly',
    target: options.target ?? assemblyTarget(),
    bindingContents: ASSEMBLY_BINDING_CONTENTS,
    ...(options.tools === undefined ? {} : { tools: options.tools }),
    ...(options.projections === undefined ? {} : { projections: options.projections }),
    ...(options.domainData === undefined ? {} : { domainData: options.domainData }),
    ...(options.businessSources === undefined ? {} : { businessSources: options.businessSources }),
  });
}

/** Module references for every capability-bound binding the compiler records. */
export function assemblyBindingModules(
  manifest: { bindingDigests: Readonly<Record<string, string>> },
): Record<string, { moduleSpecifier: string; exportName: string; content: string }> {
  return Object.fromEntries(
    Object.keys(manifest.bindingDigests)
      .sort()
      .map((bindingId, index) => [
        bindingId,
        {
          moduleSpecifier: `./bindings/assembly-b${index}.js`,
          exportName: 'binding',
          content: ASSEMBLY_BINDING_CONTENTS[bindingId] ?? '',
        },
      ]),
  );
}

export function assemblyInventoryTool(): RawToolDefinition {
  return {
    toolId: 'inventory.reserve',
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', additionalProperties: true },
    effect: 'idempotent',
    executionKind: 'host-local-domain-tool@1',
    bindingCapability: ASSEMBLY_INVENTORY,
    requiredCapabilities: [ASSEMBLY_INVENTORY],
  };
}

interface StoredRecord {
  readonly message: DomainMessage;
  disposition: MessageDispositionSnapshot;
}

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

function timestamp(index: number): string {
  return `2026-09-30T00:00:${String(index % 60).padStart(2, '0')}.000Z`;
}

/**
 * Fully-implemented-enough in-memory RuntimeStore for the Assembly suite:
 * mailbox turns, T-009 processed-command commits, durable effect journal and
 * the atomic I-OPEN provisioning seam, all on one store instance.
 */
export class AssemblyMemoryStore implements RuntimeStore, RuntimeStoreProcessCommandExtension, RuntimeInstanceProvisioningStore {
  readonly #instances = new Map<string, WorkflowInstanceSnapshot>();
  readonly #messages = new Map<string, StoredRecord>();
  readonly #effects = new Map<string, EffectJournalRecord>();
  readonly #outcomes = new Map<string, CommandOutcomeSnapshot>();
  readonly #processData = new Map<string, DurableProcessDataSnapshot>();
  readonly #nextSequence = new Map<string, number>();
  readonly #provisioningKeys = new Set<string>();
  provisioningOpenCalls = 0;

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
    const acceptedAt = timestamp(targetSequence);
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

  async failMessageProcessing(request: FailMessageProcessingRequest): Promise<void> {
    const instance = this.#requireInstance(request.target);
    const record = this.#requireMessage(request.target, request.messageId);
    if (record.disposition.targetSequence !== request.expectedTargetSequence) throw new Error('sequence mismatch');
    const failure = structuredClone(request.failure) as WorkflowInstanceSnapshot['failure'];
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
    this.#effects.set(completed.effectId, structuredClone(completed));
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

  async ensureProvisionedWorkflowInstanceOpen(
    request: ProvisionAndOpenWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceOpenResult> {
    this.provisioningOpenCalls += 1;
    const key = workflowAddressKey(request.target);
    const provisioningDisposition = this.#provisioningKeys.has(request.provisioningKey)
      ? 'existing' as const
      : 'created' as const;
    this.#provisioningKeys.add(request.provisioningKey);

    const existing = this.#instances.get(key);
    if (existing !== undefined) {
      return {
        provisioningDisposition,
        instanceDisposition: 'existing' as const,
        record: this.#provisioningRecord(request, updatedAtNow()),
        instance: structuredClone(existing),
      };
    }
    this.#instances.set(key, structuredClone(request.initialInstance));
    this.#nextSequence.set(key, 1);
    return {
      provisioningDisposition,
      instanceDisposition: 'created' as const,
      record: this.#provisioningRecord(request, updatedAtNow()),
      instance: structuredClone(request.initialInstance),
    };
  }

  listEffects(): readonly EffectJournalRecord[] {
    return [...this.#effects.values()].map((record) => structuredClone(record));
  }

  #provisioningRecord(
    request: ProvisionAndOpenWorkflowInstanceRequest,
    createdAt: string,
  ): EnsureProvisionedWorkflowInstanceOpenResult['record'] {
    return {
      provisioningKey: request.provisioningKey,
      target: structuredClone(request.target),
      correlationId: request.correlationId,
      packageId: request.packageId,
      input: request.input,
      createdAt,
    };
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

function updatedAtNow(): string {
  return '2026-09-30T00:00:00.000Z';
}
