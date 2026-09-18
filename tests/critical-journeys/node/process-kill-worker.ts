import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type {
  BeginEffectRequest,
  CommitProcessedMessageRequest,
  CompleteEffectRequest,
  DomainMessage,
  FailMessageProcessingRequest,
  RuntimeStore,
} from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../../packages/domain-harness-node/src/store/node-sqlite-runtime-store.ts';

import { PORTABLE_RUNTIME_FIXTURE } from '../../conformance/fixtures.ts';
import {
  NODE_CONFORMANCE_PACKAGE_ID,
  createNodeFixtureRuntime,
} from '../../hosts/node/runtime-fixture.ts';

type Scenario = 'durable-ack' | 'effect-journal' | 'poison-recovery';
type Mode = 'crash' | 'resume';

interface BoundaryRecord {
  scenario: Scenario;
  stage: string;
  effectId?: string;
  messageId?: string;
}

const [mode, scenario, databasePath, tracePath, controlPath] = process.argv.slice(2) as [
  Mode,
  Scenario,
  string,
  string,
  string,
];

if (!['crash', 'resume'].includes(mode) || !['durable-ack', 'effect-journal', 'poison-recovery'].includes(scenario)) {
  throw new Error('Usage: process-kill-worker.ts <crash|resume> <durable-ack|effect-journal|poison-recovery> <db> <trace> <control>');
}

if (mode === 'crash') {
  await runCrashScenario(scenario, databasePath, tracePath, controlPath);
} else {
  await runResumeScenario(scenario, databasePath, tracePath, controlPath);
}

async function runCrashScenario(
  scenario: Scenario,
  databasePath: string,
  tracePath: string,
  controlPath: string,
): Promise<never> {
  const rawStore = new NodeSqliteRuntimeStore({ path: databasePath });
  const store = crashBoundaryStore(rawStore, scenario, controlPath);
  const runtime = await createNodeFixtureRuntime({
    store,
    fixture: PORTABLE_RUNTIME_FIXTURE,
    toolTraceFile: tracePath,
  });
  const target = targetFor(scenario);

  await runtime.openInstance({
    address: target,
    correlationId: correlationFor(scenario),
    input: { phase: 'draft', total: null },
    packageId: NODE_CONFORMANCE_PACKAGE_ID,
  });

  const message = messageFor(scenario);
  const ack = await runtime.send(message);
  if (ack.status !== 'accepted') {
    throw new Error(`T-018 crash worker expected accepted ACK, received ${ack.status}`);
  }

  // The scenario-specific RuntimeStore wrapper emits BOUNDARY only after the
  // precise durable condition under test has been reached. Parent then sends SIGKILL.
  return await never();
}

async function runResumeScenario(
  scenario: Scenario,
  databasePath: string,
  tracePath: string,
  controlPath: string,
): Promise<void> {
  const rawStore = new NodeSqliteRuntimeStore({ path: databasePath });
  try {
    const runtime = await createNodeFixtureRuntime({
      store: rawStore,
      fixture: PORTABLE_RUNTIME_FIXTURE,
      toolTraceFile: tracePath,
    });
    const target = targetFor(scenario);
    const message = messageFor(scenario);
    const control = readBoundary(controlPath);

    const beforeInstance = await requireInstance(runtime, target);
    const beforeDisposition = await requireDisposition(runtime, target, message.messageId);
    const effectBefore = control.effectId === undefined ? null : await rawStore.getEffect(control.effectId);

    if (scenario === 'poison-recovery') {
      let rejectedCode = 'NO_REJECTION';
      try {
        await runtime.send({
          messageId: 'msg-after-poison-kill',
          target,
          type: 'quote',
          payload: { quantity: 2, unitPrice: 20 },
          contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
        });
      } catch (error) {
        rejectedCode = errorCode(error);
      }

      emitResult({
        scenario,
        control,
        before: {
          lifecycle: beforeInstance.lifecycle,
          stateRevision: beforeInstance.stateRevision,
          disposition: beforeDisposition.disposition,
          failureCode: beforeInstance.failure?.code ?? null,
          failureSourceMessageId: beforeInstance.failure?.sourceMessageId ?? null,
        },
        effect: effectBefore === null ? null : {
          status: effectBefore.status,
          attempt: effectBefore.attempt,
          sourceMessageId: effectBefore.sourceMessageId,
        },
        rejectedCode,
        toolTraceCount: readTraceCount(tracePath),
      });
      return;
    }

    const duplicate = await runtime.send(message);
    await settleMessage(runtime, target, message.messageId);
    const afterInstance = await requireInstance(runtime, target);
    const afterDisposition = await requireDisposition(runtime, target, message.messageId);
    const effectAfter = control.effectId === undefined ? null : await rawStore.getEffect(control.effectId);

    emitResult({
      scenario,
      control,
      before: {
        lifecycle: beforeInstance.lifecycle,
        stateRevision: beforeInstance.stateRevision,
        disposition: beforeDisposition.disposition,
      },
      duplicate: {
        status: duplicate.status,
        targetSequence: duplicate.targetSequence,
      },
      after: {
        lifecycle: afterInstance.lifecycle,
        stateRevision: afterInstance.stateRevision,
        disposition: afterDisposition.disposition,
      },
      effect: effectAfter === null ? null : {
        status: effectAfter.status,
        attempt: effectAfter.attempt,
        sourceMessageId: effectAfter.sourceMessageId,
        output: effectAfter.output ?? null,
      },
      toolTraceCount: readTraceCount(tracePath),
    });
  } finally {
    rawStore.close();
  }
}

function crashBoundaryStore(
  rawStore: NodeSqliteRuntimeStore,
  scenario: Scenario,
  controlPath: string,
): RuntimeStore {
  let lastEffectId: string | undefined;

  return new Proxy(rawStore, {
    get(target, property) {
      if (property === 'beginEffect') {
        return async (request: BeginEffectRequest) => {
          lastEffectId = request.effectId;
          return target.beginEffect(request);
        };
      }
      if (property === 'completeEffect') {
        return async (request: CompleteEffectRequest) => {
          const completed = await target.completeEffect(request);
          lastEffectId = request.effectId;
          return completed;
        };
      }
      if (scenario === 'durable-ack' && property === 'markMessageProcessing') {
        return async (_target: unknown, messageId: string): Promise<boolean> => {
          return boundary(controlPath, {
            scenario,
            stage: 'after-accepted-ack-before-processing',
            messageId,
          });
        };
      }
      if (scenario === 'effect-journal' && property === 'commitProcessedMessage') {
        return async (request: CommitProcessedMessageRequest): Promise<void> => {
          await target.commitProcessedMessage(request);
          await boundary(controlPath, {
            scenario,
            stage: 'after-effect-and-message-commit',
            messageId: request.messageId,
            ...(lastEffectId === undefined ? {} : { effectId: lastEffectId }),
          });
        };
      }
      if (scenario === 'poison-recovery' && property === 'failMessageProcessing') {
        return async (request: FailMessageProcessingRequest): Promise<void> => {
          await target.failMessageProcessing(request);
          await boundary(controlPath, {
            scenario,
            stage: 'after-recovery-required-commit',
            messageId: request.messageId,
            ...(lastEffectId === undefined ? {} : { effectId: lastEffectId }),
          });
        };
      }
      const value = Reflect.get(target, property) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as RuntimeStore;
}

function targetFor(scenario: Scenario) {
  return {
    workflowId: PORTABLE_RUNTIME_FIXTURE.workflowId,
    instanceKey: `kill-${scenario}`,
  };
}

function correlationFor(scenario: Scenario): string {
  return `corr-kill-${scenario}`;
}

function messageFor(scenario: Scenario): DomainMessage {
  const target = targetFor(scenario);
  if (scenario === 'poison-recovery') {
    return {
      messageId: 'msg-poison-kill',
      target,
      type: 'fail',
      payload: { reason: 'process-kill-fixture' },
      correlationId: correlationFor(scenario),
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    };
  }
  return {
    messageId: scenario === 'durable-ack' ? 'msg-ack-kill' : 'msg-effect-kill',
    target,
    type: 'quote',
    payload: { quantity: 2, unitPrice: 20 },
    correlationId: correlationFor(scenario),
    contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
  };
}

async function requireInstance(
  runtime: Awaited<ReturnType<typeof createNodeFixtureRuntime>>,
  target: ReturnType<typeof targetFor>,
) {
  const result = await runtime.query({ kind: 'instance', target });
  if (result.kind !== 'instance' || result.value === null) {
    throw new Error(`T-018 resume could not load instance ${target.instanceKey}`);
  }
  return result.value;
}

async function requireDisposition(
  runtime: Awaited<ReturnType<typeof createNodeFixtureRuntime>>,
  target: ReturnType<typeof targetFor>,
  messageId: string,
) {
  const result = await runtime.query({ kind: 'message-disposition', target, messageId });
  if (result.kind !== 'message-disposition' || result.value === null) {
    throw new Error(`T-018 resume could not load message ${messageId}`);
  }
  return result.value;
}

async function settleMessage(
  runtime: Awaited<ReturnType<typeof createNodeFixtureRuntime>>,
  target: ReturnType<typeof targetFor>,
  messageId: string,
): Promise<void> {
  for (let turn = 0; turn < 10_000; turn += 1) {
    const disposition = await requireDisposition(runtime, target, messageId);
    if (!['accepted', 'processing'].includes(disposition.disposition)) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`T-018 resume did not settle ${messageId} within 10,000 event-loop turns`);
}

function boundary<T = never>(path: string, record: BoundaryRecord): Promise<T> {
  writeFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  process.stdout.write(`BOUNDARY ${record.stage}\n`);
  return never();
}

function readBoundary(path: string): BoundaryRecord {
  return JSON.parse(readFileSync(path, 'utf8')) as BoundaryRecord;
}

function readTraceCount(path: string): number {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf8').trim();
  return text.length === 0 ? 0 : text.split('\n').length;
}

function emitResult(value: unknown): void {
  process.stdout.write(`RESULT ${JSON.stringify(value)}\n`);
}

function errorCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return error instanceof Error ? error.name : 'unknown_error';
}

function never<T = never>(): Promise<T> {
  return new Promise<T>(() => {});
}
