/**
 * T05 (#1172) — physical witness: Context Assembly + Agent-as-ordinary-
 * Business-Workflow over a REAL T00-built and activated App, the REAL
 * selected Kernel payload (K01/K02), and REAL Node24 SQLite CAS files.
 * ====================================================================
 *
 * The Agent is one selected ordinary Business package (`agent-context-loop`):
 * every turn is a public intent through the sealed Standard Router and the
 * real Kernel admission/effect path. The selected Standard features are pure
 * semantic producers the trusted Host dispatches through the same facade:
 *   - Context Assembly (T05) bounds and orders observations, but marks them
 *     caller-reported and mints no authorization;
 *   - SemanticDecision (T02) resolves Rule -> exact reuse -> pinned procedure
 *     -> optional Model, with truthful call evidence;
 *   - workflow-control (T03) proposes the deterministic bounded loop step.
 * The only governed mutation is the Business commit effect: a scoped Memory
 * put dispatched through the Kernel effect journal + the selected C Memory
 * capability. The read-only Tool capability has no mutation operation.
 *
 * Physical guarantees exercised here:
 *   - multi-turn K admission on one workflow instance (real SQLite K docs),
 *   - bounded context from ACTUAL scoped Memory/Tool reads,
 *   - optional no-Model and measured-Model decisions, honest unavailable,
 *   - K02 immutable original-receipt replay with zero duplicate Memory rows,
 *   - changed-input typed conflict,
 *   - full activation restart on the same physical stores,
 *   - cross-tenant Memory denial with zero physical mutation,
 *   - unbounded Agent step denied by the Business guard and the T03 planner,
 *   - Tiny BUILD neither selects nor imports any advanced T05 module.
 */
import { freshV10Counters } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import {
  V10_TARGET_PROFILE,
  V10_SFEATURE_ABI,
  activateV10App,
  buildV10App,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type {
  V10DocStore,
  V10ModuleInput,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../packages/domain-harness/src/host-v8/sqlite-cas-store.js';
import {
  INTENT as TINY_INTENT,
  PlainCasDocStore,
  basicComposition,
  sha256HexSource,
} from './helpers-v010.js';

const kernelPackageId = 'v08-kernel-mechanism@1.0.0';
const standardPackageId = 'standard-sdk@v08.1.0.0';
const businessAgentId = 'business-agent-workflow@v010.1.0.0';
const capabilityMemoryId = 'capability-agent-memory@v010.1.0.0';
const capabilityToolId = 'capability-agent-tool-read@v010.1.0.0';
const sfeatureContextId = 'sfeature-context-assembly@v010.1.0.0';
const sfeatureSemanticId = 'sfeature-semantic-decision@v010.1.0.0';
const sfeatureWorkflowId = 'sfeature-workflow-control@v010.1.0.0';

const tenantId = 'tenant:v010-t05-rich';
const workflowId = 'agent-context-loop';
const instanceKey = 'instance-agent-main';
const BASE_MS = Date.UTC(2026, 9, 19, 12, 0, 0);
const AGENT_MAX_STEPS = 4;

const scope = {
  deployedAppId: 'deploy:v010-t05-rich',
  tenantId,
  appId: 'app:v010-t05-rich',
  businessPackageId: businessAgentId,
  agentId: 'agent:context-agent',
  threadId: 'thread:context-main',
} as const;

interface ContextEntry {
  id: string;
  kind: string;
  content: string;
  verification: string;
  provenance?: { source: string; revision: string; observedBy: string };
}
interface ContextResult {
  kind: string;
  entries: ContextEntry[];
  budget: { includedEntries: number; includedCharacters: number; omittedEntries: number };
  modelCalls: number | null;
  modelCallEvidence: string;
  trustedHostAuthorization: boolean;
  kernelEffectPermit: boolean;
}
interface SemanticResult {
  kind: 'selected' | 'unavailable';
  source?: 'rule' | 'reuse' | 'procedure' | 'model' | 'tool';
  decision?: { outcome: string; data?: unknown };
  reason?: string;
  evidence: { modelCalls: number; modelCallEvidence: string; kernelEffectPermit: boolean; steps: number };
}
interface PlanResult {
  kind: string;
  action: string;
  final: boolean;
  kernelEffectPermit: boolean;
  proposal: { intentType: string; messageId: string };
  budget: { iteration: number; maxIterations: number };
}
interface EffectOutcome {
  effectId?: string;
  effectType?: string;
  disposition?: string;
  output?: unknown;
}
interface Receipt {
  status: string;
  idempotentReplay?: boolean;
  admission?: unknown;
  admitted?: { effects?: EffectOutcome[]; transitionKey?: string };
  occurrence?: { messageId?: string };
  denial?: { reason?: string; guardId?: string };
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function controlledClock(): { now: () => number; advance(ms: number): void } {
  let current = BASE_MS;
  return { now: (): number => current, advance: (ms: number): void => { current += ms; } };
}

async function freshMemoryStore(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t05-agent-'));
  const path = join(dir, 'memory.sqlite');
  (globalThis as { __v010T05MemoryStorePath?: string }).__v010T05MemoryStorePath = path;
  return path;
}

function pinMemoryClock(now: () => number): void {
  (globalThis as { __v010T05MemoryClock?: () => number }).__v010T05MemoryClock = now;
}

function resetToolCalls(): void {
  (globalThis as { __v010T05ToolCalls?: number }).__v010T05ToolCalls = 0;
}

function toolCalls(): number {
  const value = (globalThis as { __v010T05ToolCalls?: number }).__v010T05ToolCalls;
  return typeof value === 'number' ? value : 0;
}

function cleanupPins(): void {
  delete (globalThis as { __v010T05MemoryStorePath?: string }).__v010T05MemoryStorePath;
  delete (globalThis as { __v010T05MemoryClock?: () => number }).__v010T05MemoryClock;
  delete (globalThis as { __v010T05ToolCalls?: number }).__v010T05ToolCalls;
}

/** V10DocStore over the REAL physical SQLite CAS store. */
interface PhysicalKStore {
  readonly docStore: V10DocStore;
  close(): Promise<void>;
}

async function openPhysicalKStore(path: string): Promise<PhysicalKStore> {
  const physical = await openSqliteCasStore({ path });
  // Synchronous key listing for the K docs port; WAL keeps it consistent
  // with the writer connection.
  const reader = new Database(path, { readonly: true, fileMustExist: true });
  const docStore: V10DocStore = {
    get: async (key) => await physical.get(key),
    put: async (key, value, condition) => condition.kind === 'create'
      ? await physical.put(key, value, { mustBeAbsent: true })
      : await physical.put(key, value, { mustMatchRevision: condition.revision }),
    remove: async (key, condition) => {
      if (condition.kind !== 'cas') {
        throw new Error('the physical K store remove requires a CAS revision');
      }
      await physical.remove(key, { mustMatchRevision: condition.revision });
    },
    keys: () => (reader.prepare('SELECT key FROM v8_host_docs').all() as { key: string }[]).map((row) => row.key),
  };
  return {
    docStore,
    close: async (): Promise<void> => {
      reader.close();
      await physical.close();
    },
  };
}

function physicalRows(path: string): number {
  if (!existsSync(path)) return 0;
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM v8_host_docs').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

async function standardBundle(): Promise<string> {
  const [sdk, router] = await Promise.all([
    readFile(new URL('../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../domain-packages/standard/basic/workflow-router.mjs', import.meta.url), 'utf8'),
  ]);
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
// v0.10 T05 BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
}

async function featureModule(
  directory: 'payload' | 'fixtures-v010',
  file: string,
  spec: { packageId: string; featureKey: string; featureExport: string; fixture?: boolean },
): Promise<V10ModuleInput> {
  const url = directory === 'payload'
    ? new URL(`../../domain-packages/standard/features/${file.replace(/^sfeature-/, '').replace(/-v1\.mjs$/, '')}/modules/${file}`, import.meta.url)
    : new URL(`./fixtures-v010/${file}`, import.meta.url);
  const source = await readFile(url, 'utf8');
  return {
    packageId: spec.packageId,
    role: 'standard-feature',
    abiVersion: V10_SFEATURE_ABI,
    moduleSource: source,
    moduleSha256: sha256HexSource(source),
    endpoint: 'standard-feature',
    dependencies: [],
    provides: [spec.featureKey],
    requires: [],
    featureExport: spec.featureExport,
  };
}

async function richAgentModules(): Promise<V10ModuleInput[]> {
  const [kernel, sdk, business, memory, tool, contextFeature, semanticFeature, workflowFeature] = await Promise.all([
    readFile(new URL('../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    standardBundle(),
    readFile(new URL('./fixtures-v010/business-agent-workflow-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./fixtures-v010/capability-agent-memory-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./fixtures-v010/capability-agent-tool-v1.mjs', import.meta.url), 'utf8'),
    featureModule('payload', 'sfeature-context-assembly-v1.mjs', {
      packageId: sfeatureContextId,
      featureKey: 'standard:context-assembly/1',
      featureExport: 'assembleBoundedContext',
    }),
    featureModule('payload', 'sfeature-semantic-decision-v1.mjs', {
      packageId: sfeatureSemanticId,
      featureKey: 'standard:semantic-decision/1',
      featureExport: 'resolveSemanticDecision',
    }),
    featureModule('payload', 'sfeature-workflow-control-v1.mjs', {
      packageId: sfeatureWorkflowId,
      featureKey: 'standard:workflow-control/1',
      featureExport: 'planWorkflowControl',
    }),
  ]);
  return [
    {
      packageId: kernelPackageId,
      role: 'kernel-primary',
      abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel,
      moduleSha256: sha256HexSource(kernel),
      endpoint: 'occurrence-runtime',
      dependencies: [],
      provides: ['kernel:occurrence-runtime/1'],
      requires: [],
    },
    {
      packageId: standardPackageId,
      role: 'standard-primary',
      abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: sdk,
      moduleSha256: sha256HexSource(sdk),
      endpoint: 'rule-interpreter',
      dependencies: [],
      provides: ['standard:interpret/1', 'standard:route/1'],
      requires: [],
    },
    contextFeature,
    semanticFeature,
    workflowFeature,
    {
      packageId: businessAgentId,
      role: 'business',
      abiVersion: 'v08-business-abi/1',
      moduleSource: business,
      moduleSha256: sha256HexSource(business),
      endpoint: 'business-policy',
      dependencies: [],
      provides: [
        'business:policy/1',
        'intent:agentCollectContext',
        'intent:agentCommitTurn',
        'intent:agentProbeForeignMemory',
      ],
      requires: [],
    },
    {
      packageId: capabilityMemoryId,
      role: 'capability',
      abiVersion: 'v08-capability-abi/1',
      moduleSource: memory,
      moduleSha256: sha256HexSource(memory),
      endpoint: 'capability-endpoint',
      dependencies: [],
      provides: ['capability:memory/1'],
      requires: [],
      externalImports: {
        node: ['node:path', 'node:os', 'node:fs'],
        npm: ['@kaicreator/domain-harness/v8/host'],
        native: [],
      },
      capabilityId: 'memory',
      handlers: [
        { operationId: 'memory.put', handler: 'memoryPut' },
        { operationId: 'memory.get', handler: 'memoryGet' },
        { operationId: 'memory.search', handler: 'memorySearch' },
        { operationId: 'memory.delete', handler: 'memoryDelete' },
      ],
    },
    {
      packageId: capabilityToolId,
      role: 'capability',
      abiVersion: 'v08-capability-abi/1',
      moduleSource: tool,
      moduleSha256: sha256HexSource(tool),
      endpoint: 'capability-endpoint',
      dependencies: [],
      provides: ['capability:tool-read/1'],
      requires: [],
      capabilityId: 'tool',
      handlers: [{ operationId: 'tool.lookup', handler: 'toolLookup' }],
    },
  ];
}

async function buildAgentApp() {
  return buildV10App({
    appId: 'app:v010-t05-rich',
    audience: 'aud:v010-t05',
    targetProfile: V10_TARGET_PROFILE,
    modules: await richAgentModules(),
    routes: [
      { intentId: 'agentCollectContext', operationId: 'memory.search', capabilityId: 'memory', handlerId: 'memorySearch' },
      { intentId: 'agentCommitTurn', operationId: 'memory.put', capabilityId: 'memory', handlerId: 'memoryPut' },
      { intentId: 'agentProbeForeignMemory', operationId: 'memory.search', capabilityId: 'memory', handlerId: 'memorySearch' },
    ],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 't05-rich-agent',
  });
}

function firstEffect(receipt: Receipt): EffectOutcome {
  assert.equal(receipt.status, 'admitted', `receipt must be admitted: ${JSON.stringify(receipt).slice(0, 400)}`);
  const effect = receipt.admitted?.effects?.[0];
  assert.ok(effect !== undefined, 'the admitted receipt carries at least one effect outcome');
  assert.equal(effect.disposition, 'executed');
  return effect;
}

function effectFailureCode(error: unknown): string {
  assert.ok(error instanceof Error, `expected Error, got ${String(error)}`);
  assert.equal((error as { code?: string }).code, 'ADMISSION_EFFECT_FAILED', `unexpected failure: ${String(error)}`);
  return error.message;
}

function codeOf(error: unknown): string {
  return error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : '';
}

interface TurnOptions {
  readonly instance: string;
  readonly iteration: number;
  readonly stage: 'greet' | 'escalate' | 'summarize' | 'procedure';
  readonly note: string;
  readonly requestId?: string;
  readonly model?: (payload: unknown) => unknown;
  readonly procedure?: (input: Record<string, unknown>) => unknown;
}

/** Non-commit turns carry the same bounded rule-authorized field set. */
function readTurnInput(requestId: string): Record<string, unknown> {
  return {
    iteration: null,
    note: null,
    decisionOutcome: null,
    decisionData: null,
    contextDigest: null,
    contextEntries: null,
    modelCalls: null,
    modelCallEvidence: null,
    requestId,
  };
}

function collectMessageId(instance: string, iteration: number): string {
  return `t05/collect/${instance}/${String(iteration)}`;
}

interface TurnResult {
  readonly collect: Receipt;
  readonly observations: { id: string; kind: string; content: string; scope?: unknown; provenance?: unknown }[];
  readonly context: ContextResult;
  readonly decision: SemanticResult;
  readonly plan: PlanResult;
  readonly commit?: Receipt;
}

async function agentTurn(
  activation: Awaited<ReturnType<typeof activateV10App>>,
  clock: { now: () => number },
  options: TurnOptions,
): Promise<TurnResult> {
  const { facade } = activation;
  const requestId = options.requestId ?? `req-turn-${String(options.iteration)}`;
  const collect = await facade.send({
    intentType: 'agentCollectContext',
    instanceKey: options.instance,
    messageId: collectMessageId(options.instance, options.iteration),
    input: readTurnInput(requestId),
  }) as Receipt;
  const collectOutput = firstEffect(collect).output as { observations: TurnResult['observations'] };

  const context = await facade.invokeSelectedStandardFeature(
    'standard:context-assembly/1',
    {
      scope,
      observations: collectOutput.observations,
      budget: { maxEntries: 8, maxCharacters: 4096 },
    },
  ) as ContextResult;
  assert.equal(context.kind, 'assembled-context');
  assert.equal(context.trustedHostAuthorization, false, 'the semantic feature never mints Host authorization');
  assert.equal(context.kernelEffectPermit, false, 'the semantic feature never mints a K permit');
  assert.equal(context.modelCalls, null, 'context assembly performs no Model call');

  const decision = await facade.invokeSelectedStandardFeature(
    'standard:semantic-decision/1',
    {
      input: { stage: options.stage, note: options.note },
      schema: { id: 'schema:agent-turn', revision: 'r1', provenanceKey: 'policy:agent-turn@r1' },
      rules: [
        { id: 'rule:greet', when: { stage: 'greet' }, decision: { outcome: 'answer', data: { tone: 'concise' } } },
        { id: 'rule:summarize', when: { stage: 'summarize' }, decision: { outcome: 'answer', data: { tone: 'summary' } } },
      ],
      ...(options.procedure === undefined ? {} : {
        procedure: { id: 'proc:agent-answer', revision: 'r1' },
      }),
      fallback: { kind: 'model', operationId: 'model.agent-answer' },
      limits: { maxSteps: 3, maxModelCalls: 1, maxToolCalls: 0, deadlineEpochMs: BASE_MS + 600_000 },
    },
    {
      now: clock.now,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.procedure === undefined ? {} : {
        procedures: new Map([['proc:agent-answer', { revision: 'r1', resolve: options.procedure }]]),
      }),
    },
  ) as SemanticResult;
  assert.equal(decision.evidence.kernelEffectPermit, false);

  const plan = await facade.invokeSelectedStandardFeature(
    'standard:workflow-control/1',
    {
      kind: 'loop.next',
      target: { workflowId, instanceKey: options.instance },
      control: {
        loopId: 'agent-turns',
        maxIterations: AGENT_MAX_STEPS,
        iteration: options.iteration,
        stepIntentTypes: ['agentCommitTurn'],
        deadlineEpochMs: BASE_MS + 600_000,
      },
      step: { intentType: 'agentCommitTurn', input: {} },
    },
    { now: clock.now },
  ) as PlanResult;
  assert.equal(plan.kernelEffectPermit, false);
  assert.equal(plan.action, 'submit');

  if (decision.kind === 'unavailable') {
    return { collect, observations: collectOutput.observations, context, decision, plan };
  }

  const commit = await facade.send({
    intentType: 'agentCommitTurn',
    instanceKey: options.instance,
    messageId: plan.proposal.messageId,
    input: {
      iteration: options.iteration,
      note: options.note,
      decisionOutcome: decision.decision?.outcome ?? '',
      decisionData: decision.decision?.data ?? null,
      contextDigest: 'sha256:' + sha256Text(JSON.stringify(context.entries)),
      contextEntries: context.entries.length,
      modelCalls: decision.evidence.modelCalls,
      modelCallEvidence: decision.evidence.modelCallEvidence,
      requestId,
    },
  }) as Receipt;
  return { collect, observations: collectOutput.observations, context, decision, plan, commit };
}

const rulePathModel = (): never => {
  throw new Error('the no-model Rule path must never invoke the Model dependency');
};

async function withAgentStores<T>(
  fn: (env: { readonly kPath: string }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'dh-v010-t05-k-'));
  const kPath = join(dir, 'kernel.sqlite');
  try {
    return await fn({ kPath });
  } finally {
    cleanupPins();
  }
}

test('T05-P0: multi-turn ordinary Business Agent workflow over real K admission and SQLite', async () => {
  const memoryPath = await freshMemoryStore();
  const clock = controlledClock();
  pinMemoryClock(clock.now);
  resetToolCalls();
  await withAgentStores(async ({ kPath }) => {
    const physical = await openPhysicalKStore(kPath);
    try {
      const app = await buildAgentApp();
      const counters = freshV10Counters();
      const activation = await activateV10App(app, { store: physical.docStore, tenantId, now: clock.now, counters });
      assert.deepEqual(
        activation.facade.selectedFeatures.map((feature) => feature.featureKey).sort(),
        ['standard:context-assembly/1', 'standard:semantic-decision/1', 'standard:workflow-control/1'],
      );
      assert.equal(
        app.modules.filter((module) => module.role === 'business').length,
        1,
        'exactly one ordinary Business package carries the Agent workflow',
      );
      assert.ok(app.modules.every((module) => ['kernel-primary', 'standard-primary', 'standard-feature', 'business', 'capability'].includes(module.role)));

      // Turn 0: deterministic Rule path, no Model call at all.
      const turn0 = await agentTurn(activation, clock, {
        instance: instanceKey,
        iteration: 0,
        stage: 'greet',
        note: 'first turn',
        model: rulePathModel,
      });
      assert.equal(turn0.decision.kind, 'selected');
      assert.equal(turn0.decision.source, 'rule');
      assert.equal(turn0.decision.evidence.modelCalls, 0);
      assert.equal(turn0.decision.evidence.modelCallEvidence, 'unmeasured');
      assert.equal(toolCalls(), 1, 'the collect turn performs exactly one read-only Tool lookup');
      assert.equal(firstEffect(turn0.collect).effectType, 'effect:agent-context-read');
      assert.equal(turn0.context.entries.length, 1, 'the first turn sees the Tool observation only');
      assert.equal(turn0.context.entries[0]?.kind, 'tool');
      assert.ok(turn0.context.entries.every((entry) => entry.verification === 'caller-reported'));
      assert.ok(turn0.context.entries.every((entry) =>
        typeof entry.provenance?.source === 'string' && entry.provenance.source.length > 0
        && typeof entry.provenance.revision === 'string' && entry.provenance.revision.length > 0
        && typeof entry.provenance.observedBy === 'string' && entry.provenance.observedBy.length > 0));
      assert.equal(firstEffect(turn0.commit as Receipt).effectType, 'effect:agent-turn-remember');
      assert.equal(firstEffect(turn0.commit as Receipt).output !== undefined, true);
      const commit0 = firstEffect(turn0.commit as Receipt).output as { key: string; revision: number };
      assert.deepEqual({ key: commit0.key, revision: commit0.revision }, { key: 'agent:turn:0', revision: 0 });
      assert.equal(physicalRows(memoryPath), 1, 'exactly one governed Memory write');

      // Turn 1: no matching Rule -> declared Model fallback, measured honestly.
      let modelInvocations = 0;
      const turn1 = await agentTurn(activation, clock, {
        instance: instanceKey,
        iteration: 1,
        stage: 'escalate',
        note: 'second turn',
        model: (payload) => {
          modelInvocations += 1;
          assert.equal((payload as { operationId: string }).operationId, 'model.agent-answer');
          return { outcome: 'answer', data: { tone: 'model', bounded: true } };
        },
      });
      assert.equal(turn1.decision.source, 'model');
      assert.equal(turn1.decision.evidence.modelCalls, 1);
      assert.equal(turn1.decision.evidence.modelCallEvidence, 'measured');
      assert.equal(modelInvocations, 1);
      assert.equal(toolCalls(), 2);
      assert.equal(turn1.context.entries.length, 2, 'the second turn sees the first committed Memory row plus the Tool row');
      assert.deepEqual(
        turn1.context.entries.map((entry) => entry.kind).sort(),
        ['memory', 'tool'],
      );
      const memoryEntry = turn1.context.entries.find((entry) => entry.kind === 'memory');
      assert.match(memoryEntry?.provenance?.source ?? '', /^effect:/, 'Memory observations carry the actual K write effect as source');
      assert.equal(turn1.plan.final, false);
      assert.equal(firstEffect(turn1.commit as Receipt).disposition, 'executed');
      assert.equal(physicalRows(memoryPath), 2);

      // Turn 2: Rule path again, no Model.
      const turn2 = await agentTurn(activation, clock, {
        instance: instanceKey,
        iteration: 2,
        stage: 'summarize',
        note: 'third turn',
        model: rulePathModel,
      });
      assert.equal(turn2.decision.source, 'rule');
      assert.equal(turn2.decision.evidence.modelCalls, 0);
      assert.equal(turn2.plan.final, false);
      assert.equal(turn2.context.entries.length, 3);
      assert.equal(physicalRows(memoryPath), 3);

      // Turn 3: pinned procedure path (no Rule match, no Model call), the
      // bounded loop's final step.
      const turn3 = await agentTurn(activation, clock, {
        instance: instanceKey,
        iteration: 3,
        stage: 'procedure',
        note: 'fourth turn',
        procedure: (input) => {
          assert.deepEqual(input, { stage: 'procedure', note: 'fourth turn' });
          return { outcome: 'answer', data: { tone: 'procedure' } };
        },
      });
      assert.equal(turn3.decision.source, 'procedure');
      assert.equal(turn3.decision.evidence.modelCalls, 0);
      assert.equal(turn3.plan.final, true);
      assert.equal(turn3.context.entries.length, 4);
      assert.equal(physicalRows(memoryPath), 4);

      // No Agent runtime: one Business runtime factory invocation for the
      // whole multi-turn run, and all K activity is the selected kernel's.
      assert.equal(activation.counters.runtimeFactoryInvocations, 1);
      assert.ok(counters.importsByPackage[businessAgentId] === 1);
      assert.ok(counters.importsByPackage[capabilityMemoryId] === 1);
      assert.ok(counters.importsByPackage[capabilityToolId] === 1);
      const sealedTool = app.modules.find((module) => module.packageId === capabilityToolId);
      assert.deepEqual(
        sealedTool?.handlers,
        [{ operationId: 'tool.lookup', handler: 'toolLookup' }],
        'the Tool capability seals ONE read-only operation and no mutation handler',
      );
      const kCounters = activation.facade.kCounters(businessAgentId);
      assert.ok(kCounters.admissions >= 8, 'four collect + four commit turns all entered the real Kernel');
      assert.ok(kCounters.effectDispatches >= 8);
      assert.ok(kCounters.durableOriginalReceiptReplays === 0);

      // The K docs namespace holds only Kernel records; Memory lives in its
      // own physical store and never lands in K State.
      const keys = physical.docStore.keys?.() ?? [];
      assert.ok(keys.length > 0);
      assert.ok(keys.every((key) => key.startsWith('v10/k/')), 'K docs stay in the v10/k namespace');

      activation.dispose();
    } finally {
      await physical.close();
    }
  });
});

test('T05-P1/N1: K02 original receipt replay, zero duplicate Memory writes and changed-input conflict', async () => {
  const memoryPath = await freshMemoryStore();
  const clock = controlledClock();
  pinMemoryClock(clock.now);
  resetToolCalls();
  await withAgentStores(async ({ kPath }) => {
    const physical = await openPhysicalKStore(kPath);
    try {
      const activation = await activateV10App(await buildAgentApp(), { store: physical.docStore, tenantId, now: clock.now });
      const turn = await agentTurn(activation, clock, {
        instance: instanceKey,
        iteration: 0,
        stage: 'greet',
        note: 'replay me',
        model: rulePathModel,
      });
      assert.equal(physicalRows(memoryPath), 1);
      const rowsBefore = physicalRows(memoryPath);
      const toolCallsBefore = toolCalls();
      const replayCountBefore = activation.facade.kCounters(businessAgentId).durableOriginalReceiptReplays ?? 0;

      // Replay the read-only collect turn: original receipt, zero new Tool
      // or Memory activity.
      const collectReplay = await activation.facade.send({
        intentType: 'agentCollectContext',
        instanceKey,
        messageId: collectMessageId(instanceKey, 0),
        input: readTurnInput('req-turn-0'),
      }) as Receipt;
      assert.equal(collectReplay.status, 'admitted');
      assert.equal(collectReplay.idempotentReplay, true);
      assert.equal(toolCalls(), toolCallsBefore, 'a replayed collect performs zero new Tool dispatch');

      // Replay the commit turn with the exact same messageId + input.
      const commitReplay = await activation.facade.send({
        intentType: 'agentCommitTurn',
        instanceKey,
        messageId: turn.plan.proposal.messageId,
        input: {
          iteration: 0,
          note: 'replay me',
          decisionOutcome: 'answer',
          decisionData: { tone: 'concise' },
          contextDigest: 'sha256:' + sha256Text(JSON.stringify(turn.context.entries)),
          contextEntries: turn.context.entries.length,
          modelCalls: 0,
          modelCallEvidence: 'unmeasured',
          requestId: 'req-turn-0',
        },
      }) as Receipt;
      assert.equal(commitReplay.status, 'admitted');
      assert.equal(commitReplay.idempotentReplay, true);
      assert.equal(physicalRows(memoryPath), rowsBefore, 'the replayed commit writes zero duplicate Memory rows');
      assert.ok(
        (activation.facade.kCounters(businessAgentId).durableOriginalReceiptReplays ?? 0) >= replayCountBefore + 2,
        'both replays were served from the durable K02 original-receipt ladder',
      );

      // Same messageId, changed canonical input: typed conflict before any
      // new admission/effect activity.
      await assert.rejects(
        activation.facade.send({
          intentType: 'agentCommitTurn',
          instanceKey,
          messageId: turn.plan.proposal.messageId,
          input: {
            iteration: 0,
            note: 'changed after admission',
            decisionOutcome: 'answer',
            decisionData: { tone: 'concise' },
            contextDigest: 'sha256:' + sha256Text(JSON.stringify(turn.context.entries)),
            contextEntries: turn.context.entries.length,
            modelCalls: 0,
            modelCallEvidence: 'unmeasured',
            requestId: 'req-turn-0',
          },
        }),
        (error: unknown) => {
          assert.equal(codeOf(error), 'K02_TURN_RECEIPT_INPUT_CONFLICT');
          assert.match(String((error as Error).message), /already durably admitted with a different canonical input/);
          return true;
        },
      );
      assert.equal(physicalRows(memoryPath), rowsBefore, 'the refused conflict mutates nothing');

      activation.dispose();
    } finally {
      await physical.close();
    }
  });
});

test('T05-P2: full activation restart on the same physical SQLite stores keeps Memory and K receipts', async () => {
  const memoryPath = await freshMemoryStore();
  const clock = controlledClock();
  pinMemoryClock(clock.now);
  resetToolCalls();
  await withAgentStores(async ({ kPath }) => {
    const app = await buildAgentApp();
    const first = await openPhysicalKStore(kPath);
    const firstActivation = await activateV10App(app, { store: first.docStore, tenantId, now: clock.now });
    const turn0 = await agentTurn(firstActivation, clock, {
      instance: instanceKey,
      iteration: 0,
      stage: 'greet',
      note: 'before restart',
      model: rulePathModel,
    });
    assert.equal(physicalRows(memoryPath), 1);
    firstActivation.dispose();
    await first.close();

    // A NEW physical store handle + NEW activation over the same files.
    const second = await openPhysicalKStore(kPath);
    try {
      const secondActivation = await activateV10App(app, { store: second.docStore, tenantId, now: clock.now });
      assert.equal(activationModule(secondActivation), true);
      assert.equal(physicalRows(memoryPath), 1, 'the scoped Memory record survived the restart');

      // The pre-restart original receipt still replays byte-for-byte with no
      // new State/Journal/Effect activity.
      const replay = await secondActivation.facade.send({
        intentType: 'agentCommitTurn',
        instanceKey,
        messageId: turn0.plan.proposal.messageId,
        input: {
          iteration: 0,
          note: 'before restart',
          decisionOutcome: 'answer',
          decisionData: { tone: 'concise' },
          contextDigest: 'sha256:' + sha256Text(JSON.stringify(turn0.context.entries)),
          contextEntries: turn0.context.entries.length,
          modelCalls: 0,
          modelCallEvidence: 'unmeasured',
          requestId: 'req-turn-0',
        },
      }) as Receipt;
      assert.equal(replay.status, 'admitted');
      assert.equal(replay.idempotentReplay, true);
      assert.equal(physicalRows(memoryPath), 1);

      // The workflow keeps admitting NEW turns after the restart and sees the
      // pre-restart Memory record through an ACTUAL scoped read.
      const turn1 = await agentTurn(secondActivation, clock, {
        instance: instanceKey,
        iteration: 1,
        stage: 'summarize',
        note: 'after restart',
        model: rulePathModel,
      });
      assert.equal(turn1.context.entries.filter((entry) => entry.kind === 'memory').length, 1);
      assert.equal(physicalRows(memoryPath), 2);
      assert.equal(secondActivation.counters.runtimeFactoryInvocations, 1);

      secondActivation.dispose();
    } finally {
      await second.close();
    }
  });
});

function activationModule(activation: Awaited<ReturnType<typeof activateV10App>>): boolean {
  return activation.facade.isClosed() === false;
}

test('T05-N2: cross-tenant reads, unavailable Model and an unbounded Agent step all stay honest', async () => {
  const memoryPath = await freshMemoryStore();
  const clock = controlledClock();
  pinMemoryClock(clock.now);
  resetToolCalls();
  await withAgentStores(async ({ kPath }) => {
    const physical = await openPhysicalKStore(kPath);
    try {
      const activation = await activateV10App(await buildAgentApp(), { store: physical.docStore, tenantId, now: clock.now });

      // (a) A foreign-scope observation is refused by the selected Context
      // feature BEFORE it can enter any composed output; no read happened.
      const foreignScope = { ...scope, tenantId: 'tenant:v010-t05-foreign' };
      assert.equal(toolCalls(), 0);
      await assert.rejects(
        activation.facade.invokeSelectedStandardFeature('standard:context-assembly/1', {
          scope,
          observations: [{
            id: 'observation:foreign',
            kind: 'memory',
            content: 'foreign secret',
            scope: foreignScope,
            provenance: { source: 'memory:host', revision: 'r1', observedBy: 'host:app' },
          }],
          budget: { maxEntries: 4, maxCharacters: 256 },
        }),
        (error: unknown) => { assert.equal(codeOf(error), 'CONTEXT_SCOPE_DENIED'); return true; },
      );
      // Forged authority is ordinary data and is refused typed.
      await assert.rejects(
        activation.facade.invokeSelectedStandardFeature('standard:context-assembly/1', {
          scope,
          observations: [{ id: 'x', kind: 'memory', content: 'x', scope, provenance: { source: 's', revision: 'r', observedBy: 'h' }, effectPermit: { forged: true } }],
          budget: { maxEntries: 4, maxCharacters: 256 },
        }),
        (error: unknown) => { assert.equal(codeOf(error), 'CONTEXT_AUTHORITY_FORBIDDEN'); return true; },
      );
      assert.equal(toolCalls(), 0, 'the pure context feature dispatched no Tool read');

      // (b) The labeled foreign-Memory probe reaches the REAL capability,
      // which denies the unselected tenant with zero physical mutation.
      const rowsBeforeProbe = physicalRows(memoryPath);
      await assert.rejects(
        activation.facade.send({
          intentType: 'agentProbeForeignMemory',
          instanceKey: 'instance-agent-foreign',
          messageId: 't05/foreign-probe/1',
          input: readTurnInput('req-foreign-1'),
        }),
        (error: unknown) => {
          assert.match(effectFailureCode(error), /MEMORY_SCOPE_DENIED/);
          return true;
        },
      );
      assert.equal(physicalRows(memoryPath), rowsBeforeProbe, 'the denied foreign read physically wrote zero rows');
      assert.equal(toolCalls(), 0);

      // (c) Declared Model fallback with no Model dependency: honest
      // unavailable, no fabricated success, and NO commit turn is sent.
      const collect = await activation.facade.send({
        intentType: 'agentCollectContext',
        instanceKey,
        messageId: 't05/collect/unavailable/0',
        input: readTurnInput('req-unavailable-0'),
      }) as Receipt;
      const collectOutput = firstEffect(collect).output as { observations: unknown[] };
      const context = await activation.facade.invokeSelectedStandardFeature('standard:context-assembly/1', {
        scope,
        observations: collectOutput.observations,
        budget: { maxEntries: 8, maxCharacters: 4096 },
      }) as ContextResult;
      assert.equal(context.entries.length, 1);
      const unavailable = await activation.facade.invokeSelectedStandardFeature('standard:semantic-decision/1', {
        input: { stage: 'escalate', note: 'needs a model' },
        schema: { id: 'schema:agent-turn', revision: 'r1', provenanceKey: 'policy:agent-turn@r1' },
        rules: [{ id: 'rule:greet', when: { stage: 'greet' }, decision: { outcome: 'answer' } }],
        fallback: { kind: 'model', operationId: 'model.agent-answer' },
        limits: { maxSteps: 3, maxModelCalls: 1, maxToolCalls: 0, deadlineEpochMs: BASE_MS + 600_000 },
      }, { now: clock.now }) as SemanticResult;
      assert.equal(unavailable.kind, 'unavailable');
      assert.equal(unavailable.reason, 'model-unavailable');
      assert.equal(unavailable.evidence.modelCalls, 0);
      assert.equal(physicalRows(memoryPath), rowsBeforeProbe, 'an unavailable Model produces no mutation');

      // (d) The selected T03 planner refuses iteration 3 of a 3-step loop.
      await assert.rejects(
        activation.facade.invokeSelectedStandardFeature('standard:workflow-control/1', {
          kind: 'loop.next',
          target: { workflowId, instanceKey },
          control: { loopId: 'agent-turns', maxIterations: AGENT_MAX_STEPS, iteration: AGENT_MAX_STEPS, stepIntentTypes: ['agentCommitTurn'] },
          step: { intentType: 'agentCommitTurn', input: {} },
        }, { now: clock.now }),
        (error: unknown) => { assert.equal(codeOf(error), 'WORKFLOW_BUDGET_EXHAUSTED'); return true; },
      );

      // (e) The Business guard independently refuses the same over-budget
      // commit: a typed denial with zero effect and zero Memory rows.
      const denied = await activation.facade.send({
        intentType: 'agentCommitTurn',
        instanceKey,
        messageId: 't05/commit/over-budget/3',
        input: {
          iteration: AGENT_MAX_STEPS,
          note: 'over budget',
          decisionOutcome: 'answer',
          decisionData: { tone: 'concise' },
          contextDigest: 'sha256:00',
          contextEntries: 1,
          modelCalls: 0,
          modelCallEvidence: 'unmeasured',
          requestId: 'req-over-budget-3',
        },
      }) as Receipt;
      assert.equal(denied.status, 'denied');
      assert.equal(denied.denial?.reason, 'guard');
      assert.equal(denied.denial?.guardId, 'guard:agent-turn-budget');
      assert.equal(physicalRows(memoryPath), rowsBeforeProbe, 'the denied over-budget turn mutates nothing');
      assert.equal(toolCalls(), 1, 'only the labeled collect turn performed a Tool read');

      // (f) The workflow is still live after denials: a valid turn is admitted.
      const live = await agentTurn(activation, clock, {
        instance: instanceKey,
        iteration: 0,
        stage: 'greet',
        note: 'still live',
        model: rulePathModel,
      });
      assert.equal(live.commit?.status, 'admitted');
      assert.equal(physicalRows(memoryPath), rowsBeforeProbe + 1);

      activation.dispose();
    } finally {
      await physical.close();
    }
  });
});

test('T05-P3: Tiny BUILD neither selects nor imports any advanced T05 module', async () => {
  resetToolCalls();
  const tiny = buildV10App(await basicComposition());
  for (const packageId of [businessAgentId, capabilityMemoryId, capabilityToolId, sfeatureContextId, sfeatureSemanticId, sfeatureWorkflowId]) {
    assert.ok(tiny.modules.every((module) => module.packageId !== packageId), `Tiny must not select ${packageId}`);
  }
  const counters = freshV10Counters();
  const activation = await activateV10App(tiny, { store: new PlainCasDocStore(), tenantId: 'tenant:v010-t00', now: () => BASE_MS, counters });
  for (const packageId of [businessAgentId, capabilityMemoryId, capabilityToolId, sfeatureContextId, sfeatureSemanticId, sfeatureWorkflowId]) {
    assert.equal(counters.importsByPackage[packageId], undefined, `${packageId} bytes were never evaluated`);
  }
  const receipt = await activation.facade.send({ ...TINY_INTENT }) as Receipt;
  assert.equal(receipt.status, 'admitted', 'the Tiny App keeps working without any T05 module');
  await assert.rejects(
    activation.facade.invokeSelectedStandardFeature('standard:context-assembly/1', {
      scope,
      observations: [],
      budget: { maxEntries: 1, maxCharacters: 1 },
    }),
    (error: unknown) => { assert.equal(codeOf(error), 'V10_FEATURE_NOT_SELECTED'); return true; },
  );
  activation.dispose();
});
