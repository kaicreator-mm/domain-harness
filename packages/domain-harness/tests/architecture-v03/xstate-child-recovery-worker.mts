import { writeFileSync } from 'node:fs';

import Database from 'better-sqlite3';
import { createActor } from 'xstate';

import type { BeginEffectRequest, JsonValue, WorkflowAddress } from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../../domain-harness-node/src/store/node-sqlite-runtime-store.js';
import {
  RESEARCH_PACKAGE_ID,
  RESEARCH_SCENARIOS,
  assertJsonControlSnapshot,
  assertRestorableControlSnapshot,
  createResearchMachines,
  type DomainDecision,
  type ModelRequest,
  type ModelResponse,
  type ResearchPorts,
  type ResearchScenario,
} from './xstate-child-recovery-machine.js';

type Mode = 'crash' | 'resume';

const mode = process.argv[2] as Mode | undefined;
const scenario = process.argv[3] as ResearchScenario | undefined;
const databasePath = process.argv[4];
const boundaryPath = process.argv[5];

if ((mode !== 'crash' && mode !== 'resume')
  || scenario === undefined
  || !RESEARCH_SCENARIOS.includes(scenario)
  || databasePath === undefined) {
  throw new Error('usage: worker <crash|resume> <scenario> <sqlite-path> [boundary-path]');
}

const TARGET: WorkflowAddress = {
  workflowId: 'research-xstate-child-recovery',
  instanceKey: scenario,
};
const SOURCE_MESSAGE_ID = `research-message:${scenario}`;
const DOMAIN_INPUT = { requestId: `request:${scenario}`, scenario } as const;

const store = new NodeSqliteRuntimeStore({ path: databasePath });
const researchDb = new Database(databasePath);
researchDb.pragma('journal_mode = WAL');
researchDb.pragma('synchronous = FULL');
researchDb.exec(`
  CREATE TABLE IF NOT EXISTS research_xstate_snapshots (
    workflow_id TEXT NOT NULL,
    instance_key TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(workflow_id, instance_key)
  );
  CREATE TABLE IF NOT EXISTS research_external_calls (
    label TEXT PRIMARY KEY,
    count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS research_mutations (
    effect_id TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

let signalModelStarted: (() => void) | undefined;
let releaseModel: (() => void) | undefined;
const firstModelStarted = new Promise<void>((resolve) => { signalModelStarted = resolve; });
const firstModelRelease = new Promise<void>((resolve) => { releaseModel = resolve; });
let firstModelGated = false;

async function gateFirstModel(step: number): Promise<void> {
  if (mode !== 'crash' || step !== 1 || firstModelGated) return;
  firstModelGated = true;
  signalModelStarted?.();
  await firstModelRelease;
}

function bump(label: string): number {
  researchDb.prepare(`
    INSERT INTO research_external_calls(label, count)
    VALUES (?, 1)
    ON CONFLICT(label) DO UPDATE SET count = count + 1
  `).run(label);
  const row = researchDb.prepare('SELECT count FROM research_external_calls WHERE label = ?').get(label) as { count: number };
  return row.count;
}

function count(label: string): number {
  const row = researchDb.prepare('SELECT count FROM research_external_calls WHERE label = ?').get(label) as { count: number } | undefined;
  return row?.count ?? 0;
}

function mutationRows(): number {
  const row = researchDb.prepare('SELECT COUNT(*) AS count FROM research_mutations').get() as { count: number };
  return row.count;
}

function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function effectId(kind: 'model' | 'query' | 'mutation', suffix: string): string {
  return `research:${scenario}:${kind}:${suffix}`;
}

function boundary(stage: string, id: string): Promise<never> {
  if (boundaryPath !== undefined) {
    writeFileSync(boundaryPath, JSON.stringify({ scenario, stage, effectId: id }));
  }
  process.stdout.write(`BOUNDARY ${JSON.stringify({ scenario, stage, effectId: id })}\n`);
  return new Promise<never>(() => {});
}

function shouldBeforeCommit(kind: 'model' | 'query' | 'mutation', suffix: string): boolean {
  return mode === 'crash' && scenario === 'ai-before-commit' && kind === 'model' && suffix === '1';
}

function shouldAfterCommit(kind: 'model' | 'query' | 'mutation', suffix: string): boolean {
  if (mode !== 'crash') return false;
  return (
    (scenario === 'ai-committed' && kind === 'model' && suffix === '1')
    || (scenario === 'query-committed' && kind === 'query')
    || (scenario === 'mutation-committed' && kind === 'mutation')
  );
}

async function durable<T extends JsonValue>(options: {
  kind: 'model' | 'query' | 'mutation';
  suffix: string;
  effectKind: string;
  effectSemantics: 'none' | 'idempotent';
  input: JsonValue;
  execute: () => Promise<T>;
}): Promise<T> {
  const id = effectId(options.kind, options.suffix);
  const existing = await store.getEffect(id);
  if (existing?.status === 'completed') return existing.output as T;
  if (existing?.status === 'failed') throw new Error(`durable effect ${id} already failed`);

  if (existing === null) {
    await store.beginEffect({
      effectId: id,
      target: TARGET,
      sourceMessageId: SOURCE_MESSAGE_ID,
      effectKind: options.effectKind,
      effectSemantics: options.effectSemantics,
      status: 'started',
      attempt: 1,
      input: options.input,
      startedAt: new Date().toISOString(),
    });
  }

  const output = await options.execute();
  if (shouldBeforeCommit(options.kind, options.suffix)) {
    return boundary('after-external-call-before-result-commit', id);
  }

  const committed = await store.completeEffect({
    effectId: id,
    status: 'completed',
    output,
    completedAt: new Date().toISOString(),
  });

  if (shouldAfterCommit(options.kind, options.suffix)) {
    return boundary(`after-${options.kind}-commit-before-control-snapshot`, id);
  }
  return committed.output as T;
}

function finalDecision(reason: string): DomainDecision {
  return { type: 'QUOTE_REQUESTED', payload: { reason } };
}

function modelResponse(request: ModelRequest): ModelResponse {
  if (scenario === 'query-committed' && request.step === 1) {
    return { kind: 'tool', call: { name: 'catalog.lookup', input: { sku: 'A-42' } } };
  }
  return {
    kind: 'final',
    decision: finalDecision(
      request.observations.length === 0 ? `model-${request.step}` : `model-${request.step}-after-query`,
    ),
  };
}

const ports: ResearchPorts = {
  model: {
    async generate(request) {
      return durable({
        kind: 'model',
        suffix: String(request.step),
        effectKind: 'ai.model',
        effectSemantics: 'none',
        input: asJson({ step: request.step, observations: request.observations, requestId: request.domain.requestId }),
        execute: async () => {
          await gateFirstModel(request.step);
          bump(`model:${request.step}`);
          return asJson(modelResponse(request)) as ModelResponse & JsonValue;
        },
      }) as Promise<ModelResponse>;
    },
  },
  query: {
    async execute(name, input) {
      return durable({
        kind: 'query',
        suffix: name,
        effectKind: 'query.tool',
        effectSemantics: 'idempotent',
        input: asJson({ name, input }),
        execute: async () => {
          bump(`query:${name}`);
          return { sku: 'A-42', price: 42, currency: 'USD' };
        },
      });
    },
  },
  mutation: {
    async execute(domain) {
      return durable({
        kind: 'mutation',
        suffix: 'apply',
        effectKind: 'domain.mutation',
        effectSemantics: 'idempotent',
        input: asJson({ requestId: domain.requestId }),
        execute: async () => {
          bump('mutation:attempt');
          const result = researchDb.prepare(`
            INSERT OR IGNORE INTO research_mutations(effect_id, value)
            VALUES (?, ?)
          `).run(effectId('mutation', 'apply'), `applied:${domain.requestId}`);
          if (result.changes === 1) bump('mutation:applied');
          return { applied: true, idempotencyKey: effectId('mutation', 'apply') };
        },
      });
    },
  },
};

const { DomainMachine } = createResearchMachines(ports);

function saveControlSnapshot(snapshot: unknown): void {
  assertJsonControlSnapshot(snapshot);
  assertRestorableControlSnapshot(snapshot);
  researchDb.prepare(`
    INSERT INTO research_xstate_snapshots(workflow_id, instance_key, snapshot_json, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workflow_id, instance_key) DO UPDATE SET
      snapshot_json = excluded.snapshot_json,
      created_at = excluded.created_at
  `).run(TARGET.workflowId, TARGET.instanceKey, JSON.stringify(snapshot), new Date().toISOString());
}

function loadControlSnapshot(): unknown {
  const row = researchDb.prepare(`
    SELECT snapshot_json FROM research_xstate_snapshots
    WHERE workflow_id = ? AND instance_key = ?
  `).get(TARGET.workflowId, TARGET.instanceKey) as { snapshot_json: string } | undefined;
  if (row === undefined) throw new Error('RECOVERY_CONTROL_SNAPSHOT_MISSING');
  const snapshot = JSON.parse(row.snapshot_json) as unknown;
  assertJsonControlSnapshot(snapshot);
  assertRestorableControlSnapshot(snapshot);
  return snapshot;
}

function childControlState(persisted: unknown): unknown {
  const root = persisted as { children?: Record<string, { snapshot?: { value?: unknown } }> };
  return root.children?.['reasoning-harness']?.snapshot?.value;
}

async function assertIdentityMismatchFailsClosed(id: string): Promise<boolean> {
  const current = await store.getEffect(id);
  if (current === null) throw new Error(`missing effect ${id}`);
  const request: BeginEffectRequest = {
    effectId: current.effectId,
    target: current.target,
    sourceMessageId: `${current.sourceMessageId}:wrong`,
    effectKind: `${current.effectKind}.wrong`,
    effectSemantics: current.effectSemantics,
    status: 'started',
    attempt: current.attempt + 1,
    ...(current.input === undefined ? {} : { input: current.input }),
    startedAt: new Date().toISOString(),
  };
  try {
    await store.beginEffect(request);
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes('Effect identity collision');
  }
}

function primaryEffectId(): string {
  switch (scenario) {
    case 'ai-committed':
    case 'ai-before-commit':
      return effectId('model', '1');
    case 'query-committed':
      return effectId('query', 'catalog.lookup');
    case 'mutation-committed':
      return effectId('mutation', 'apply');
  }
}

async function waitForDone(actor: ReturnType<typeof createActor>): Promise<ReturnType<typeof actor.getSnapshot>> {
  const current = actor.getSnapshot();
  if (current.status === 'done') return current;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      reject(new Error('Timed out waiting for DomainMachine terminal state'));
    }, 10_000);
    const subscription = actor.subscribe({
      next(snapshot) {
        if (snapshot.status === 'done') {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve(snapshot);
        }
      },
      error(error) {
        clearTimeout(timeout);
        subscription.unsubscribe();
        reject(error);
      },
    });
  });
}

async function createRuntimeInstance(): Promise<void> {
  const now = new Date().toISOString();
  await store.createInstance({
    address: TARGET,
    correlationId: `research-correlation:${scenario}`,
    packageId: RESEARCH_PACKAGE_ID,
    lifecycle: 'active',
    stateRevision: 0,
    state: { researchControlSnapshot: 'research_xstate_snapshots' },
    createdAt: now,
    updatedAt: now,
  });
}

async function runCrash(): Promise<void> {
  await createRuntimeInstance();
  const actor = createActor(DomainMachine, { input: DOMAIN_INPUT });
  actor.start();

  // Effect is journal-started; active fromPromise is blocked immediately before
  // the observable provider call, so this is a real in-flight child snapshot.
  await firstModelStarted;
  saveControlSnapshot(actor.getPersistedSnapshot());
  releaseModel?.();
  await new Promise<never>(() => {});
}

async function runResume(): Promise<void> {
  const instance = await store.getInstance(TARGET);
  if (instance === null) throw new Error('missing persisted RuntimeStore workflow instance');

  const persisted = loadControlSnapshot();
  const restoredParentState = (persisted as { value?: unknown }).value;
  const restoredChildState = childControlState(persisted);
  const actor = createActor(DomainMachine, { snapshot: persisted as never });
  actor.start();

  const finalSnapshot = await waitForDone(actor);
  const finalContext = finalSnapshot.context as { childTerminalState: unknown; harnessResult: unknown };
  const identityMismatchRejected = await assertIdentityMismatchFailsClosed(primaryEffectId());
  const primaryEffect = await store.getEffect(primaryEffectId());
  const pragmas = store.inspectPragmas();

  const result = {
    scenario,
    sqlite: {
      journalMode: pragmas.journalMode,
      synchronous: pragmas.synchronous,
      foreignKeys: pragmas.foreignKeys,
      runtimeInstanceReopened: instance.packageId === RESEARCH_PACKAGE_ID,
    },
    restored: { parentState: restoredParentState, childState: restoredChildState },
    final: {
      parentState: finalSnapshot.value,
      status: finalSnapshot.status,
      childTerminalState: finalContext.childTerminalState,
      harnessResult: finalContext.harnessResult,
    },
    calls: {
      model1: count('model:1'),
      model2: count('model:2'),
      query: count('query:catalog.lookup'),
      mutationAttempts: count('mutation:attempt'),
      mutationApplications: count('mutation:applied'),
      mutationRows: mutationRows(),
    },
    primaryEffectStatus: primaryEffect?.status ?? null,
    identityMismatchRejected,
  };

  process.stdout.write(`RESULT ${JSON.stringify(result)}\n`);
  actor.stop();
}

try {
  if (mode === 'crash') await runCrash();
  else await runResume();
} finally {
  if (mode === 'resume') {
    researchDb.close();
    store.close();
  }
}
