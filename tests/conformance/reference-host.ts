import type {
  ConformanceFixture,
  ConformanceMessage,
  ConformanceQuery,
  ConformanceQueryResult,
  EmittedDomainMessageObservation,
  FailureObservation,
  InstanceObservation,
  JsonValue,
  MessageAcceptanceObservation,
  MessageDispositionObservation,
  OpenInstanceRequest,
  RuntimeConformanceHost,
  RuntimeConformanceSession,
  ToolInvocationObservation,
  WorkflowAddress,
} from './contracts.ts';
import { AUDIT_ADDRESS } from './fixtures.ts';

interface StoredMessage {
  message: ConformanceMessage;
  targetSequence: number;
  disposition: MessageDispositionObservation['disposition'];
  failure?: FailureObservation;
}

interface StoredInstance extends InstanceObservation {
  nextSequence: number;
}

export interface ReferenceHostOptions {
  /** Changes only private, deliberately unobservable implementation metadata. */
  internalNoiseSeed?: string;
  /** Used only by the suite self-test to prove semantic drift is detected. */
  semanticFault?: 'quote-output';
}

export class ReferenceConformanceHost implements RuntimeConformanceHost {
  readonly label: string;
  private readonly options: ReferenceHostOptions;

  constructor(options: ReferenceHostOptions = {}) {
    this.options = options;
    this.label = `reference:${options.internalNoiseSeed ?? 'default'}`;
  }

  async createSession(fixture: ConformanceFixture): Promise<RuntimeConformanceSession> {
    return new ReferenceSession(fixture, this.options);
  }
}

class ReferenceSession implements RuntimeConformanceSession {
  private readonly fixture: ConformanceFixture;
  private readonly options: ReferenceHostOptions;
  private readonly instances = new Map<string, StoredInstance>();
  private readonly messages = new Map<string, StoredMessage>();
  private readonly toolTrace: ToolInvocationObservation[] = [];
  private readonly emitted: EmittedDomainMessageObservation[] = [];

  // These intentionally differ between runs and are never exposed through the contract.
  private readonly privateRowBase: number;
  private privateRowCounter = 0;
  private readonly privateWallClock: string;

  constructor(fixture: ConformanceFixture, options: ReferenceHostOptions) {
    this.fixture = fixture;
    this.options = options;
    const seed = options.internalNoiseSeed ?? 'default';
    this.privateRowBase = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    this.privateWallClock = `private-${seed}-${this.privateRowBase}`;
  }

  async openInstance(request: OpenInstanceRequest): Promise<InstanceObservation> {
    const key = addressKey(request.address);
    if (this.instances.has(key)) throw new Error('reference_instance_exists');
    const stored: StoredInstance = {
      address: { ...request.address },
      correlationId: request.correlationId,
      lifecycle: 'waiting',
      stateRevision: 0,
      state: { phase: 'draft', total: null },
      nextSequence: 1,
    };
    this.instances.set(key, stored);
    this.touchPrivateStorage();
    return observeInstance(stored);
  }

  async send(message: ConformanceMessage): Promise<MessageAcceptanceObservation> {
    const target = this.instances.get(addressKey(message.target));
    if (target === undefined) return { status: 'rejected', code: 'target_not_found' };
    if (target.lifecycle !== 'active' && target.lifecycle !== 'waiting') {
      return { status: 'rejected', code: 'target_not_accepting' };
    }
    if (!['quote', 'approve', 'fail'].includes(message.type)) {
      return { status: 'rejected', code: 'message_contract_not_found' };
    }
    if (message.contractVersion !== this.fixture.messageContractVersion) {
      return { status: 'rejected', code: 'contract_version_mismatch' };
    }

    const messageKey = `${addressKey(message.target)}:${message.messageId}`;
    const duplicate = this.messages.get(messageKey);
    if (duplicate !== undefined) {
      return {
        status: 'duplicate',
        messageId: message.messageId,
        target: { ...message.target },
        targetSequence: duplicate.targetSequence,
      };
    }

    const stored: StoredMessage = {
      message: clone(message),
      targetSequence: target.nextSequence,
      disposition: 'accepted',
    };
    target.nextSequence += 1;
    this.messages.set(messageKey, stored);
    this.touchPrivateStorage();
    return {
      status: 'accepted',
      messageId: message.messageId,
      target: { ...message.target },
      targetSequence: stored.targetSequence,
    };
  }

  async settle(target?: WorkflowAddress): Promise<void> {
    const entries = [...this.messages.values()]
      .filter((stored) => stored.disposition === 'accepted')
      .filter((stored) => target === undefined || sameAddress(stored.message.target, target))
      .sort((left, right) => left.targetSequence - right.targetSequence);

    for (const stored of entries) {
      const instance = this.instances.get(addressKey(stored.message.target));
      if (instance === undefined || instance.lifecycle === 'recovery_required') continue;
      await this.process(instance, stored);
    }
  }

  async query(request: ConformanceQuery): Promise<ConformanceQueryResult> {
    if (request.kind === 'instance') {
      const stored = this.instances.get(addressKey(request.target));
      return { kind: 'instance', value: stored === undefined ? null : observeInstance(stored) };
    }
    if (request.kind === 'runtime-failure') {
      const stored = this.instances.get(addressKey(request.target));
      return { kind: 'runtime-failure', value: stored?.failure === undefined ? null : clone(stored.failure) };
    }
    if (request.kind === 'message-disposition') {
      const stored = this.messages.get(`${addressKey(request.target)}:${request.messageId}`);
      return {
        kind: 'message-disposition',
        value: stored === undefined ? null : observeDisposition(stored),
      };
    }

    const instance = this.instances.get(addressKey({
      workflowId: this.fixture.workflowId,
      instanceKey: request.key,
    }));
    if (instance === undefined) throw new Error('projection_source_not_found');
    return {
      kind: 'projection',
      value: {
        projectionId: request.projectionId,
        key: request.key,
        value: {
          orderId: request.key,
          phase: readStateField(instance.state, 'phase'),
          total: readStateField(instance.state, 'total'),
        },
        workflowSources: [
          {
            address: { ...instance.address },
            stateRevision: instance.stateRevision,
            state: clone(instance.state),
          },
        ],
      },
    };
  }

  async toolInvocations(): Promise<readonly ToolInvocationObservation[]> {
    return clone(this.toolTrace);
  }

  async emittedMessages(): Promise<readonly EmittedDomainMessageObservation[]> {
    return clone(this.emitted);
  }

  async dispose(): Promise<void> {
    this.instances.clear();
    this.messages.clear();
  }

  private async process(instance: StoredInstance, stored: StoredMessage): Promise<void> {
    stored.disposition = 'processing';
    const message = stored.message;

    if (message.type === 'quote') {
      const quantity = readNumber(message.payload, 'quantity');
      const unitPrice = readNumber(message.payload, 'unitPrice');
      let total = quantity * unitPrice + this.fixture.deterministicQuoteAdjustment;
      if (this.options.semanticFault === 'quote-output') total += 1;
      const output = { total };
      this.toolTrace.push({
        toolId: 'quote-total',
        effect: 'none',
        input: clone(message.payload),
        output,
      });
      instance.stateRevision += 1;
      instance.state = { phase: 'quoted', total };
      stored.disposition = 'processed';
      this.touchPrivateStorage();
      return;
    }

    if (message.type === 'approve') {
      const total = readStateNumber(instance.state, 'total');
      instance.stateRevision += 1;
      instance.state = { phase: 'completed', total };
      instance.output = { total };
      instance.lifecycle = 'completed';
      stored.disposition = 'processed';
      this.emitted.push({
        target: { ...AUDIT_ADDRESS },
        type: 'order.completed',
        payload: { orderId: instance.address.instanceKey, total },
        correlationId: message.correlationId ?? instance.correlationId,
        causationId: message.messageId,
      });
      this.touchPrivateStorage();
      return;
    }

    const failure: FailureObservation = {
      code: this.fixture.deterministicFailureCode,
      sourceMessageId: message.messageId,
    };
    this.toolTrace.push({
      toolId: 'fixture-failure',
      effect: 'idempotent',
      input: clone(message.payload),
      failureCode: failure.code,
    });
    instance.lifecycle = 'recovery_required';
    instance.failure = failure;
    stored.disposition = 'failed';
    stored.failure = failure;
    this.touchPrivateStorage();
  }

  private touchPrivateStorage(): void {
    this.privateRowCounter += 1;
    void (this.privateRowBase + this.privateRowCounter);
    void this.privateWallClock;
  }
}

function observeInstance(stored: StoredInstance): InstanceObservation {
  const observed: InstanceObservation = {
    address: { ...stored.address },
    correlationId: stored.correlationId,
    lifecycle: stored.lifecycle,
    stateRevision: stored.stateRevision,
    state: clone(stored.state),
  };
  if (stored.output !== undefined) observed.output = clone(stored.output);
  if (stored.failure !== undefined) observed.failure = clone(stored.failure);
  return observed;
}

function observeDisposition(stored: StoredMessage): MessageDispositionObservation {
  const correlationId = stored.message.correlationId ?? '';
  const observed: MessageDispositionObservation = {
    messageId: stored.message.messageId,
    target: { ...stored.message.target },
    targetSequence: stored.targetSequence,
    disposition: stored.disposition,
    correlationId,
  };
  if (stored.message.causationId !== undefined) observed.causationId = stored.message.causationId;
  if (stored.failure !== undefined) observed.failure = clone(stored.failure);
  return observed;
}

function readNumber(value: JsonValue, key: string): number {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(`missing_${key}`);
  const field = (value as { readonly [field: string]: JsonValue })[key];
  if (typeof field !== 'number') throw new Error(`missing_${key}`);
  return field;
}

function readStateNumber(value: JsonValue, key: string): number {
  const result = readStateField(value, key);
  if (typeof result !== 'number') throw new Error(`state_${key}_not_number`);
  return result;
}

function readStateField(value: JsonValue, key: string): JsonValue {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(`state_${key}_missing`);
  const field = (value as { readonly [field: string]: JsonValue })[key];
  if (field === undefined) throw new Error(`state_${key}_missing`);
  return field;
}

function addressKey(address: WorkflowAddress): string {
  return `${address.workflowId}\u0000${address.instanceKey}`;
}

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
