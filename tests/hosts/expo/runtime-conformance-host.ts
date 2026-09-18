import * as SQLite from 'expo-sqlite';
import {
  type DomainQueryResult,
  type DomainRuntime,
  type JsonValue,
  type MessageAcceptedAck,
  type WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness/v2';
import {
  createExpoDomainRuntime,
  openExpoSqliteRuntimeStore,
  type ExpoSqliteDatabaseLike,
  type ExpoSqliteModuleLike,
} from '@kaicreator/domain-harness-expo';

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
} from '../../conformance/contracts.ts';
import { AUDIT_ADDRESS } from '../../conformance/fixtures.ts';
import {
  createExpoConformanceHostArtifacts,
  EXPO_FAILURE_TOOL_ID,
  semanticState,
} from './compiled-fixture.ts';

export interface ExpoRuntimeConformanceHostOptions {
  databaseName: string;
  label?: string;
}

type ExpoRuntimeStore = Awaited<ReturnType<typeof openExpoSqliteRuntimeStore>>;

interface ToolEffectBegin {
  effectId: string;
  sourceMessageId: string;
  effectKind: string;
}

interface RuntimeFailureLike {
  code: string;
  sourceMessageId?: string;
}

export class ExpoRuntimeConformanceHost implements RuntimeConformanceHost {
  readonly label: string;

  constructor(private readonly options: ExpoRuntimeConformanceHostOptions) {
    this.label = options.label ?? `expo-hermes:${options.databaseName}`;
  }

  async createSession(fixture: ConformanceFixture): Promise<RuntimeConformanceSession> {
    const store = await openExpoSqliteRuntimeStore({
      sqlite: expoSqliteModule(),
      databaseName: this.options.databaseName,
    });
    try {
      const artifacts = await createExpoConformanceHostArtifacts(fixture);
      const observed = observingStore(store);
      const runtime = await createExpoDomainRuntime({
        packageRegistry: artifacts.packageRegistry,
        store: observed.store,
        bindings: artifacts.bindings,
      });
      await ensureAuditTarget(runtime, fixture);
      return new ExpoRuntimeConformanceSession(
        runtime,
        store,
        fixture,
        artifacts.toolTrace,
        observed.toolEffectBegins,
      );
    } catch (error) {
      await store.close();
      throw error;
    }
  }
}

class ExpoRuntimeConformanceSession implements RuntimeConformanceSession {
  private readonly accepted = new Map<string, { target: WorkflowAddress; messageId: string }>();
  private readonly sourceMessages = new Map<string, ConformanceMessage>();
  private disposed = false;

  constructor(
    private readonly runtime: DomainRuntime,
    private readonly store: ExpoRuntimeStore,
    private readonly fixture: ConformanceFixture,
    private readonly toolTrace: ToolInvocationObservation[],
    private readonly toolEffectBegins: readonly ToolEffectBegin[],
  ) {}

  async openInstance(request: OpenInstanceRequest): Promise<InstanceObservation> {
    const snapshot = await this.runtime.openInstance({
      address: { ...request.address },
      correlationId: request.correlationId,
      input: runtimeJson(request.input),
    });
    return this.observeInstance(snapshot);
  }

  async send(message: ConformanceMessage): Promise<MessageAcceptanceObservation> {
    try {
      const ack = await this.runtime.send({
        messageId: message.messageId,
        target: { ...message.target },
        type: message.type,
        payload: runtimeJson(message.payload),
        ...(message.correlationId === undefined ? {} : { correlationId: message.correlationId }),
        ...(message.causationId === undefined ? {} : { causationId: message.causationId }),
        ...(message.contractVersion === undefined ? {} : { contractVersion: message.contractVersion }),
      });
      this.sourceMessages.set(addressMessageKey(message.target, message.messageId), clone(message));
      if (ack.status === 'accepted') {
        this.accepted.set(addressMessageKey(message.target, message.messageId), {
          target: { ...message.target },
          messageId: message.messageId,
        });
      }
      return observeAck(ack);
    } catch (error) {
      return { status: 'rejected', code: errorCode(error) };
    }
  }

  async settle(target?: WorkflowAddress): Promise<void> {
    const pending = [...this.accepted.values()].filter(
      (entry) => target === undefined || sameAddress(entry.target, target),
    );
    await Promise.all(pending.map((entry) => this.waitUntilResolved(entry.target, entry.messageId)));
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

    const audit = await this.waitForAuditEmission();
    const raw = portableState(audit.state);
    if (raw.lastMessage === null) return [];
    return [{
      target: { ...AUDIT_ADDRESS },
      type: 'order.completed',
      payload: clone(raw.lastMessage),
      correlationId: approve.correlationId,
      causationId: approve.messageId,
    }];
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.store.close();
  }

  private async waitUntilResolved(target: WorkflowAddress, messageId: string): Promise<void> {
    const key = addressMessageKey(target, messageId);
    const initial = await this.runtime.query({ kind: 'message-disposition', target, messageId });
    if (resolved(initial)) {
      this.accepted.delete(key);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let unsubscribe = () => {};
      const timeout = setTimeout(() => finish(new Error(
        `T-019 deterministic settle did not resolve ${target.workflowId}/${target.instanceKey}/${messageId}`,
      )), 15_000);

      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        unsubscribe();
        if (error) reject(error);
        else {
          this.accepted.delete(key);
          resolve();
        }
      };

      const check = async () => {
        try {
          const current = await this.runtime.query({ kind: 'message-disposition', target, messageId });
          if (resolved(current)) finish();
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      };

      unsubscribe = this.runtime.subscribe(
        { kind: 'message', target, messageId },
        () => { void check(); },
      );
      void check();
    });
  }

  private async waitForAuditEmission(): Promise<WorkflowInstanceSnapshot> {
    const initial = await this.runtime.query({ kind: 'instance', target: AUDIT_ADDRESS });
    if (initial.kind !== 'instance' || initial.value === null) {
      throw new Error('T-019 audit Workflow Instance disappeared');
    }
    if (initial.value.stateRevision > 0) return initial.value;

    return new Promise<WorkflowInstanceSnapshot>((resolve, reject) => {
      let finished = false;
      let unsubscribe = () => {};
      const timeout = setTimeout(() => finish(undefined, new Error(
        'T-019 emitted Domain Message did not reach the audit Workflow Instance',
      )), 15_000);

      const finish = (value?: WorkflowInstanceSnapshot, error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        unsubscribe();
        if (error !== undefined) reject(error);
        else if (value !== undefined) resolve(value);
        else reject(new Error('T-019 audit observation finished without a value'));
      };

      const check = async () => {
        try {
          const current = await this.runtime.query({ kind: 'instance', target: AUDIT_ADDRESS });
          if (current.kind !== 'instance' || current.value === null) {
            finish(undefined, new Error('T-019 audit Workflow Instance disappeared'));
            return;
          }
          if (current.value.stateRevision > 0) finish(current.value);
        } catch (error) {
          finish(undefined, error instanceof Error ? error : new Error(String(error)));
        }
      };

      unsubscribe = this.runtime.subscribe(
        { kind: 'instance', target: AUDIT_ADDRESS },
        () => { void check(); },
      );
      void check();
    });
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
      if (result.kind !== 'message-disposition') throw new Error(`Expected message-disposition Query, got ${result.kind}`);
      return {
        kind: 'message-disposition',
        value: result.value === null ? null : await this.observeDisposition(result.value),
      };
    }
    if (result.kind !== 'projection') throw new Error(`Expected projection Query, got ${result.kind}`);
    return { kind: 'projection', value: observeProjection(result.value, this.fixture) };
  }

  private async observeInstance(snapshot: WorkflowInstanceSnapshot): Promise<InstanceObservation> {
    const observed: InstanceObservation = {
      address: { ...snapshot.address },
      correlationId: snapshot.correlationId,
      lifecycle: snapshot.lifecycle,
      stateRevision: semanticRevision(snapshot),
      state: semanticState(snapshot.state, this.fixture),
    };
    if (snapshot.output !== undefined) observed.output = clone(snapshot.output);
    if (snapshot.failure !== undefined) observed.failure = await this.classifyFailure(snapshot.failure);
    return observed;
  }

  private async observeDisposition(
    snapshot: Extract<DomainQueryResult, { kind: 'message-disposition' }>['value'] & {},
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

  /**
   * Semantic reduction 2 of 2 (same as the T-018 Node host) — the Runtime wraps a deterministic
   * domain Tool failure into its retry classification (`workflow_*_failed`). When the durable
   * effect journal proves the fixture's deterministic-failure Tool was begun for this message and
   * never committed a result, the PRD-observable classification is the fixture-declared failure
   * code; otherwise the raw Runtime classification is exposed and the suite fails closed.
   */
  private async classifyFailure(failure: RuntimeFailureLike): Promise<FailureObservation> {
    const observed: FailureObservation = { code: failure.code };
    if (failure.sourceMessageId !== undefined) observed.sourceMessageId = failure.sourceMessageId;

    const anchored = this.toolEffectBegins.find(
      (begin) => begin.sourceMessageId === failure.sourceMessageId
        && begin.effectKind === `tool:${EXPO_FAILURE_TOOL_ID}`,
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
 * Binds the real `expo-sqlite` module to the structural RuntimeStore port. The SDK declares
 * overloaded (array + variadic) bind signatures that strict TypeScript does not narrow to the
 * port's single optional-array form, so the narrowing is explicit here, as in the T-004 host.
 */
function expoSqliteModule(): ExpoSqliteModuleLike {
  return {
    async openDatabaseAsync(databaseName: string): Promise<ExpoSqliteDatabaseLike> {
      return (await SQLite.openDatabaseAsync(databaseName)) as unknown as ExpoSqliteDatabaseLike;
    },
  };
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

function observeAck(ack: MessageAcceptedAck): MessageAcceptanceObservation {
  return {
    status: ack.status,
    messageId: ack.messageId,
    target: { ...ack.target },
    targetSequence: ack.targetSequence,
  };
}

function observeProjection(
  snapshot: Extract<DomainQueryResult, { kind: 'projection' }>['value'],
  fixture: ConformanceFixture,
): ProjectionObservation {
  return {
    projectionId: snapshot.projectionId,
    key: snapshot.key,
    value: clone(snapshot.value),
    workflowSources: snapshot.workflowSources.map((source) => ({
      address: { ...source.address },
      stateRevision: source.stateRevision,
      state: semanticState(source.state, fixture),
    })),
  };
}

/**
 * Semantic reduction 1 of 2 (same as the T-018 Node host) — the durable monotonic row revision
 * also counts the recovery bookkeeping write. Frozen L2 §8.3/§11 tie semantic `stateRevision`
 * increments to committed processed state transitions; entering `recovery_required` persists a
 * failure fact and commits no state transition, so the G30 semantic revision subtracts that write.
 */
function semanticRevision(snapshot: WorkflowInstanceSnapshot): number {
  if (snapshot.lifecycle !== 'recovery_required') return snapshot.stateRevision;
  return Math.max(0, snapshot.stateRevision - 1);
}

/**
 * Records Tool effect-journal begins so failure classification can be anchored to durable
 * journal evidence rather than to message identity. Every call is delegated unchanged.
 */
function observingStore(rawStore: ExpoRuntimeStore): {
  store: ExpoRuntimeStore;
  toolEffectBegins: ToolEffectBegin[];
} {
  const toolEffectBegins: ToolEffectBegin[] = [];
  const store = new Proxy(rawStore, {
    get(target, property) {
      if (property === 'beginEffect') {
        return async (request: Parameters<ExpoRuntimeStore['beginEffect']>[0]) => {
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

function portableState(value: JsonValue): { lastMessage: JsonValue } {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return { lastMessage: null };
  const candidate = value as Record<string, JsonValue>;
  return { lastMessage: candidate.lastMessage ?? null };
}

function runtimeJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
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
