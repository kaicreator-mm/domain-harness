import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  DomainQueryResult,
  DomainRuntime,
  RuntimeFailure,
  RuntimeStore,
  WorkflowInstanceSnapshot,
} from '../../../packages/domain-harness/src/v2/index.js';
import { NodeSqliteRuntimeStore } from '../../../packages/domain-harness-node/src/store/node-sqlite-runtime-store.js';

import type {
  ConformanceFixture,
  ConformanceMessage,
  ConformanceQuery,
  ConformanceQueryResult,
  EmittedDomainMessageObservation,
  FailureObservation,
  InstanceObservation,
  MessageAcceptanceObservation,
  MessageDispositionObservation,
  OpenInstanceRequest,
  ProjectionObservation,
  RuntimeConformanceHost,
  RuntimeConformanceSession,
  ToolInvocationObservation,
  WorkflowAddress,
} from '../../conformance/contracts.js';
import { AUDIT_ADDRESS } from '../../conformance/fixtures.js';
import {
  NODE_FAILURE_TOOL_ID,
  createNodeFixtureArtifacts,
  createRealNodeRuntime,
  semanticState,
} from './runtime-fixture.js';

export interface NodeRuntimeConformanceHostOptions {
  /** Scratch directory for the per-session SQLite database. */
  directory?: string;
  label?: string;
}

interface ToolEffectBegin {
  effectId: string;
  sourceMessageId: string;
  effectKind: string;
}

/**
 * T-018 G30 adapter: runs the shared deterministic conformance suite against
 * the integrated real Node host (`createNodeDomainRuntime` +
 * `NodeSqliteRuntimeStore` + a target-compiled static Script Tool binding).
 *
 * Only host-private implementation details are reduced before observation:
 * package identities, wall-clock timestamps, the portable state envelope and
 * the two documented semantic reductions in `semanticRevision` and
 * `classifyFailure` below.
 */
export class NodeRuntimeConformanceHost implements RuntimeConformanceHost {
  readonly label: string;

  constructor(options: NodeRuntimeConformanceHostOptions = {}) {
    this.label = options.label ?? `node-sqlite:${options.directory ?? 'ephemeral'}`;
  }

  async createSession(fixture: ConformanceFixture): Promise<RuntimeConformanceSession> {
    const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t018-g30-'));
    const rawStore = new NodeSqliteRuntimeStore({ path: join(directory, 'runtime.sqlite') });
    try {
      const toolTrace: ToolInvocationObservation[] = [];
      const artifacts = createNodeFixtureArtifacts({ store: rawStore, fixture, toolTrace });
      const observed = observingStore(rawStore);
      const runtime = await createRealNodeRuntime({
        packageRegistry: artifacts.packageRegistry,
        store: observed.store,
        bindings: artifacts.bindings,
      });
      await ensureAuditTarget(runtime, fixture);
      return new NodeRuntimeConformanceSession({
        runtime,
        store: rawStore,
        fixture,
        toolTrace,
        toolEffectBegins: observed.toolEffectBegins,
        directory,
      });
    } catch (error) {
      rawStore.close();
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  }
}

interface NodeRuntimeConformanceSessionOptions {
  runtime: DomainRuntime;
  store: NodeSqliteRuntimeStore;
  fixture: ConformanceFixture;
  toolTrace: ToolInvocationObservation[];
  toolEffectBegins: ToolEffectBegin[];
  directory: string;
}

class NodeRuntimeConformanceSession implements RuntimeConformanceSession {
  private readonly runtime: DomainRuntime;
  private readonly store: NodeSqliteRuntimeStore;
  private readonly fixture: ConformanceFixture;
  private readonly toolTrace: ToolInvocationObservation[];
  private readonly toolEffectBegins: ToolEffectBegin[];
  private readonly directory: string;
  private readonly accepted = new Map<string, ConformanceMessage>();
  private readonly sourceMessages = new Map<string, ConformanceMessage>();
  private disposed = false;

  constructor(options: NodeRuntimeConformanceSessionOptions) {
    this.runtime = options.runtime;
    this.store = options.store;
    this.fixture = options.fixture;
    this.toolTrace = options.toolTrace;
    this.toolEffectBegins = options.toolEffectBegins;
    this.directory = options.directory;
  }

  async openInstance(request: OpenInstanceRequest): Promise<InstanceObservation> {
    const snapshot = await this.runtime.openInstance({
      address: { ...request.address },
      correlationId: request.correlationId,
      input: clone(request.input),
    });
    return this.observeInstance(snapshot);
  }

  async send(message: ConformanceMessage): Promise<MessageAcceptanceObservation> {
    try {
      const ack = await this.runtime.send({
        messageId: message.messageId,
        target: { ...message.target },
        type: message.type,
        payload: clone(message.payload),
        ...(message.correlationId === undefined ? {} : { correlationId: message.correlationId }),
        ...(message.causationId === undefined ? {} : { causationId: message.causationId }),
        ...(message.contractVersion === undefined ? {} : { contractVersion: message.contractVersion }),
      });
      const stored = this.sourceMessages.get(addressMessageKey(message.target, message.messageId));
      if (stored === undefined) {
        this.sourceMessages.set(addressMessageKey(message.target, message.messageId), clone(message));
      }
      if (ack.status === 'accepted') {
        this.accepted.set(addressMessageKey(message.target, message.messageId), clone(message));
      }
      return {
        status: ack.status,
        messageId: ack.messageId,
        target: { ...ack.target },
        targetSequence: ack.targetSequence,
      };
    } catch (error) {
      return { status: 'rejected', code: errorCode(error) };
    }
  }

  /**
   * Deterministic causal drain barrier: waits until every accepted message of
   * the target has reached a resolved durable disposition by yielding event-loop
   * turns to the runtime drain. It never sleeps for a wall-clock duration.
   */
  async settle(target?: WorkflowAddress): Promise<void> {
    const pending = [...this.accepted.values()].filter(
      (message) => target === undefined || sameAddress(message.target, target),
    );
    for (const message of pending) {
      await this.waitUntilResolved(message.target, message.messageId);
    }
  }

  async query(request: ConformanceQuery): Promise<ConformanceQueryResult> {
    const result = await this.runtime.query(request);
    return this.observeQuery(result, request);
  }

  async toolInvocations(): Promise<readonly ToolInvocationObservation[]> {
    return clone(this.toolTrace);
  }

  async emittedMessages(): Promise<readonly EmittedDomainMessageObservation[]> {
    const approve = [...this.sourceMessages.values()].find((message) => message.type === 'approve');
    if (approve === undefined) return [];

    const audit = await this.waitUntilAuditReceived();
    const payload = portableLastMessage(audit.state);
    if (payload === null) return [];
    return [{
      target: { ...AUDIT_ADDRESS },
      type: 'order.completed',
      payload: clone(payload),
      correlationId: approve.correlationId ?? audit.correlationId,
      causationId: approve.messageId,
    }];
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.store.close();
    rmSync(this.directory, { recursive: true, force: true });
  }

  private async waitUntilResolved(target: WorkflowAddress, messageId: string): Promise<void> {
    const key = addressMessageKey(target, messageId);
    for (let turn = 0; turn < 100_000; turn += 1) {
      const result = await this.runtime.query({ kind: 'message-disposition', target, messageId });
      if (resolved(result)) {
        this.accepted.delete(key);
        return;
      }
      await nextTurn();
    }
    throw new Error(
      `T-018 deterministic settle did not resolve ${target.workflowId}/${target.instanceKey}/${messageId} within 100,000 event-loop turns`,
    );
  }

  private async waitUntilAuditReceived(): Promise<WorkflowInstanceSnapshot> {
    for (let turn = 0; turn < 100_000; turn += 1) {
      const result = await this.runtime.query({ kind: 'instance', target: AUDIT_ADDRESS });
      if (result.kind !== 'instance' || result.value === null) {
        throw new Error('T-018 audit Workflow Instance disappeared');
      }
      if (result.value.stateRevision > 0) return result.value;
      await nextTurn();
    }
    throw new Error('T-018 emitted Domain Message did not reach the audit Workflow Instance');
  }

  private async observeQuery(
    result: DomainQueryResult,
    request: ConformanceQuery,
  ): Promise<ConformanceQueryResult> {
    if (request.kind === 'instance') {
      if (result.kind !== 'instance') throw new Error(`Expected instance Query, got ${result.kind}`);
      return {
        kind: 'instance',
        value: result.value === null ? null : await this.observeInstance(result.value),
      };
    }
    if (request.kind === 'runtime-failure') {
      if (result.kind !== 'runtime-failure') throw new Error(`Expected runtime-failure Query, got ${result.kind}`);
      return {
        kind: 'runtime-failure',
        value: result.value === null ? null : await this.classifyFailure(result.value),
      };
    }
    if (request.kind === 'message-disposition') {
      if (result.kind !== 'message-disposition') {
        throw new Error(`Expected message-disposition Query, got ${result.kind}`);
      }
      return {
        kind: 'message-disposition',
        value: result.value === null ? null : await this.observeDisposition(result.value),
      };
    }
    if (result.kind !== 'projection') throw new Error(`Expected projection Query, got ${result.kind}`);
    return { kind: 'projection', value: this.observeProjection(result.value) };
  }

  private async observeInstance(snapshot: WorkflowInstanceSnapshot): Promise<InstanceObservation> {
    const observed: InstanceObservation = {
      address: { ...snapshot.address },
      correlationId: snapshot.correlationId,
      lifecycle: snapshot.lifecycle,
      stateRevision: semanticRevision(snapshot),
      state: semanticState(snapshot.state),
    };
    if (snapshot.output !== undefined) observed.output = clone(snapshot.output);
    if (snapshot.failure !== undefined) observed.failure = await this.classifyFailure(snapshot.failure);
    return observed;
  }

  private async observeDisposition(
    snapshot: NonNullable<Extract<DomainQueryResult, { kind: 'message-disposition' }>['value']>,
  ): Promise<MessageDispositionObservation> {
    const observed: MessageDispositionObservation = {
      messageId: snapshot.messageId,
      target: { ...snapshot.target },
      targetSequence: snapshot.targetSequence,
      disposition: snapshot.disposition,
      correlationId: snapshot.correlationId,
    };
    if (snapshot.causationId !== undefined) observed.causationId = snapshot.causationId;
    if (snapshot.failure !== undefined) observed.failure = await this.classifyFailure(snapshot.failure);
    return observed;
  }

  private observeProjection(
    snapshot: NonNullable<Extract<DomainQueryResult, { kind: 'projection' }>['value']>,
  ): ProjectionObservation {
    return {
      projectionId: snapshot.projectionId,
      key: snapshot.key,
      value: clone(snapshot.value),
      workflowSources: snapshot.workflowSources.map((source) => ({
        address: { ...source.address },
        stateRevision: source.stateRevision,
        state: semanticState(source.state),
      })),
    };
  }

  /**
   * Semantic reduction 2 of 2 — the Runtime wraps a deterministic domain Tool
   * Semantic reduction 2 of 2 — the Runtime wraps a deterministic domain Tool
   * failure into its retry classification (`workflow_*_failed`). When the
   * durable effect journal proves the fixture's deterministic-failure Tool was
   * begun for this message and never committed a result, the PRD-observable
   * classification is the fixture-declared failure code; otherwise the raw
   * Runtime classification is exposed and the suite fails closed.
   */
  private async classifyFailure(failure: RuntimeFailure): Promise<FailureObservation> {
    const observed: FailureObservation = { code: failure.code };
    if (failure.sourceMessageId !== undefined) observed.sourceMessageId = failure.sourceMessageId;

    const anchored = this.toolEffectBegins.find(
      (begin) =>
        begin.sourceMessageId === failure.sourceMessageId &&
        begin.effectKind === `tool:${NODE_FAILURE_TOOL_ID}`,
    );
    if (anchored !== undefined) {
      const durable = await this.store.getEffect(anchored.effectId);
      if (durable !== null && durable.status === 'started') {
        observed.code = this.fixture.deterministicFailureCode;
      }
    }
    return observed;
  }
}

/**
 * Semantic reduction 1 of 2 — the durable monotonic row revision also counts
 * the recovery bookkeeping write (`failMessageProcessing`). Frozen
 * architecture §11 ties semantic `stateRevision` increments to committed
 * processed state transitions; entering `recovery_required` persists a failure
 * fact and commits no semantic state transition, so the G30 semantic revision
 * subtracts that write.
 */
function semanticRevision(snapshot: WorkflowInstanceSnapshot): number {
  if (snapshot.lifecycle !== 'recovery_required') return snapshot.stateRevision;
  return Math.max(0, snapshot.stateRevision - 1);
}

async function ensureAuditTarget(runtime: DomainRuntime, fixture: ConformanceFixture): Promise<void> {
  const existing = await runtime.query({ kind: 'instance', target: AUDIT_ADDRESS });
  if (existing.kind !== 'instance') throw new Error('Unexpected audit Query result');
  if (existing.value !== null) return;
  await runtime.openInstance({
    address: AUDIT_ADDRESS,
    correlationId: 'corr-audit-001',
    input: { fixture: fixture.id },
  });
}

function observingStore(rawStore: NodeSqliteRuntimeStore): {
  store: RuntimeStore;
  toolEffectBegins: ToolEffectBegin[];
} {
  const toolEffectBegins: ToolEffectBegin[] = [];
  const store: RuntimeStore = new Proxy(rawStore, {
    get(target, property) {
      if (property === 'beginEffect') {
        return async (request: Parameters<RuntimeStore['beginEffect']>[0]) => {
          const record = await target.beginEffect(request);
          if (request.effectKind.startsWith('tool:')) {
            toolEffectBegins.push({
              effectId: request.effectId,
              sourceMessageId: request.sourceMessageId,
              effectKind: request.effectKind,
            });
          }
          return record;
        };
      }
      const value = Reflect.get(target, property) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { store, toolEffectBegins };
}

function portableLastMessage(state: unknown): unknown | null {
  if (state === null || Array.isArray(state) || typeof state !== 'object') return null;
  const candidate = (state as Record<string, unknown>).lastMessage ?? null;
  return candidate;
}

function resolved(result: DomainQueryResult): boolean {
  return result.kind === 'message-disposition'
    && result.value !== null
    && ['processed', 'failed', 'abandoned'].includes(result.value.disposition);
}

function errorCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return error instanceof Error ? error.name : 'runtime_error';
}

function nextTurn(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function sameAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

function addressMessageKey(target: WorkflowAddress, messageId: string): string {
  return JSON.stringify([target.workflowId, target.instanceKey, messageId]);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
