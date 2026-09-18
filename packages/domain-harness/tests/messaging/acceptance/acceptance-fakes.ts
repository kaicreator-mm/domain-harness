import type { JsonSchema, JsonValue } from '../../../src/contracts/json.js';
import type { DomainMessage, MessageAcceptedAck } from '../../../src/v2/contracts/message.js';
import type {
  TargetCompiledDomainPackage,
} from '../../../src/v2/contracts/package.js';
import type { StoredAcceptedMessage } from '../../../src/v2/contracts/store.js';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
  WorkflowLifecycle,
} from '../../../src/v2/contracts/workflow.js';
import type {
  MessageAcceptancePackageRegistry,
  MessageAcceptanceStore,
} from '../../../src/messaging/contracts/message-acceptance.js';

export class AcceptanceStoreFake implements MessageAcceptanceStore {
  snapshot: WorkflowInstanceSnapshot | null;
  readonly persisted: StoredAcceptedMessage[] = [];
  acceptCalls = 0;
  afterGetInstance?: () => void;
  beforeCommit?: (message: DomainMessage) => Promise<void>;

  private nextSequence = 1;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(snapshot: WorkflowInstanceSnapshot | null) {
    this.snapshot = snapshot;
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const current = this.snapshot;
    if (!current || !sameAddress(current.address, target)) return null;
    const result = cloneSnapshot(current);
    this.afterGetInstance?.();
    return result;
  }

  async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    this.acceptCalls += 1;

    let release!: () => void;
    const previous = this.writeTail;
    this.writeTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      if (this.beforeCommit) await this.beforeCommit(message);

      const current = this.snapshot;
      if (!current || !sameAddress(current.address, message.target)) {
        throw new Error('RuntimeStore atomic acceptance rejected: target not found');
      }
      if (current.lifecycle !== 'active' && current.lifecycle !== 'waiting') {
        throw new Error(`RuntimeStore atomic acceptance rejected: target is ${current.lifecycle}`);
      }

      const existing = this.persisted.find(
        (record) =>
          sameAddress(record.message.target, message.target) &&
          record.message.messageId === message.messageId,
      );
      if (existing) {
        return {
          ...existing.ack,
          target: { ...existing.ack.target },
          status: 'duplicate',
        };
      }

      const targetSequence = this.nextSequence;
      this.nextSequence += 1;
      const ack: MessageAcceptedAck = {
        status: 'accepted',
        messageId: message.messageId,
        target: { ...message.target },
        targetSequence,
        packageId: current.packageId,
        acceptedAt: `2026-09-18T00:00:00.${String(targetSequence).padStart(3, '0')}Z`,
      };
      this.persisted.push({
        message: cloneMessage(message),
        ack: { ...ack, target: { ...ack.target } },
      });
      return ack;
    } finally {
      release();
    }
  }

  setLifecycle(lifecycle: WorkflowLifecycle): void {
    if (!this.snapshot) return;
    this.snapshot = { ...this.snapshot, lifecycle };
  }
}

export function createRegistry(
  packages: readonly TargetCompiledDomainPackage[],
): MessageAcceptancePackageRegistry {
  const byId = new Map(packages.map((item) => [item.manifest.packageId, item]));
  return {
    get(packageId: string): TargetCompiledDomainPackage | undefined {
      return byId.get(packageId);
    },
  };
}

export function createPackage(options: {
  packageId: string;
  contractVersion?: string;
  payloadSchema?: JsonSchema;
}): TargetCompiledDomainPackage {
  const contract = {
    type: 'advance',
    payloadSchema: options.payloadSchema ?? {
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: {
        value: { type: 'number' },
      },
    },
    ...(options.contractVersion === undefined ? {} : { version: options.contractVersion }),
  };

  return {
    manifest: {
      formatVersion: '2',
      runtimeContractMajor: 2,
      executionEngineMajor: 1,
      domainId: 'acceptance-test',
      domainVersion: '1.0.0',
      packageId: options.packageId,
      targetProfileId: 'test',
      requiredCapabilities: [],
      workflows: {
        order: {
          workflowId: 'order',
          definition: {},
          messageContracts: { advance: contract },
        },
      },
      tools: {},
      projections: {},
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

export function createSnapshot(options: {
  packageId?: string;
  lifecycle?: WorkflowLifecycle;
  correlationId?: string;
} = {}): WorkflowInstanceSnapshot {
  return {
    address: { workflowId: 'order', instanceKey: 'order-42' },
    correlationId: options.correlationId ?? 'corr-order-42',
    packageId: options.packageId ?? 'pkg-a',
    lifecycle: options.lifecycle ?? 'active',
    stateRevision: 0,
    state: { stage: 'open' },
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
  };
}

export function createMessage(
  overrides: Partial<DomainMessage> = {},
): DomainMessage {
  return {
    messageId: 'message-1',
    target: { workflowId: 'order', instanceKey: 'order-42' },
    type: 'advance',
    payload: { value: 1 },
    contractVersion: '1',
    ...overrides,
  };
}

function cloneSnapshot(snapshot: WorkflowInstanceSnapshot): WorkflowInstanceSnapshot {
  return {
    ...snapshot,
    address: { ...snapshot.address },
    state: cloneJson(snapshot.state),
    ...(snapshot.output === undefined ? {} : { output: cloneJson(snapshot.output) }),
    ...(snapshot.failure === undefined ? {} : { failure: { ...snapshot.failure } }),
  };
}

function cloneMessage(message: DomainMessage): DomainMessage {
  return {
    ...message,
    target: { ...message.target },
    payload: cloneJson(message.payload),
  };
}

function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneJson);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)]));
}

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}
