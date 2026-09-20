/**
 * Scenario interpreter: runs a pack's scenarios against a real
 * createDomainRuntime assembly (memory RuntimeStore + simulated ports) and
 * collects findings. Divergences between the contract drafts (v0.3 target
 * semantics) and current SDK behavior are asserted as *current* behavior and
 * recorded via `finding` steps so the suite stays green while the evidence
 * for GitHub issues accumulates in reports/findings.json.
 */
import assert from 'node:assert/strict';
import { AssertionError } from 'node:assert';

import { createDomainRuntime } from '../../../packages/domain-harness/src/runtime/create-domain-runtime.js';
import { StaticPackageRegistry } from '../../../packages/domain-harness/src/package/registry.js';
import type { DomainRuntime } from '../../../packages/domain-harness/src/v2/contracts/runtime.js';
import type { WorkflowAddress } from '../../../packages/domain-harness/src/v2/contracts/workflow.js';
import type { DomainChange } from '../../../packages/domain-harness/src/v2/contracts/subscription.js';
import { createClock, createDeterministicRandomPort, createExpressionPort, createSha256Port, type Clock } from './host.js';
import { SimBusinessStore } from './business-store.js';
import { createSimTransport, SimAiPort, SimDomainDataPort, type SimTransport } from './sim-ports.js';
import { MemoryRuntimeStore } from './memory-runtime-store.js';
import type { LoadedPack, Scenario, ScenarioStep } from './pack.js';

export interface Finding {
  id: string;
  severity: 'info' | 'divergence' | 'defect';
  summary: string;
  evidence?: Record<string, unknown>;
  related?: string;
  pack: string;
  scenario: string;
  step: number;
}

export interface RunResult {
  pack: string;
  packageId?: string;
  requiredCapabilities?: readonly string[];
  scenariosRun: number;
  stepsRun: number;
  findings: Finding[];
}

interface Ctx {
  runtime: DomainRuntime;
  clock: Clock;
  store: MemoryRuntimeStore;
  business: SimBusinessStore;
  ai: SimAiPort;
  domainData: SimDomainDataPort;
  transport: SimTransport;
  findings: Finding[];
  backgroundErrors: Array<{ message: string; target: WorkflowAddress }>;
  watches: Map<string, { signals: DomainChange[] }>;
  counters: { steps: number };
  pack: LoadedPack;
  scenario: Scenario;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runExecutablePack(pack: LoadedPack): Promise<RunResult> {
  assert.ok(pack.compiled, 'executable pack failed to compile: ' + pack.meta.project);
  const compiled = pack.compiled;
  const clock = createClock();
  const store = new MemoryRuntimeStore({ now: () => clock.now() });
  const business = new SimBusinessStore();
  for (const [source, entries] of Object.entries(pack.businessSeeds)) business.seed(source, entries);
  const ai = new SimAiPort(pack.aiResponses);
  const domainData = new SimDomainDataPort(pack.domainData, new Set([compiled.manifest.packageId]));
  const transport = await createSimTransport({
    packDir: pack.dir,
    handlerModules: pack.handlerModules ?? {},
    business,
    domainData: pack.domainData,
    clock,
  });

  const findings: Finding[] = [];
  const backgroundErrors: Array<{ message: string; target: WorkflowAddress }> = [];

  const assemble = async (): Promise<DomainRuntime> => {
    const capabilities = [
      ...new Set([
        ...(pack.hostProfile?.capabilities ?? []),
        ...compiled.manifest.requiredCapabilities,
      ]),
    ];
    return createDomainRuntime({
      packageRegistry: new StaticPackageRegistry([compiled], compiled.manifest.packageId),
      store,
      bindings: {
        capabilities,
        sha256: createSha256Port(),
        secureRandom: createDeterministicRandomPort(),
        expression: createExpressionPort(),
        remoteTransports: { 'http-transport@1': transport.port },
      },
      resources: { businessDb: 'simulated-p4', aiRuntime: 'simulated-ai-runtime' },
      ai,
      businessSnapshots: business.asPort(),
      domainData,
      now: () => clock.now(),
      onBackgroundError: (error, target) => {
        backgroundErrors.push({
          message: error instanceof Error ? error.message : String(error),
          target,
        });
      },
    });
  };

  const ctx: Ctx = {
    runtime: await assemble(),
    clock,
    store,
    business,
    ai,
    domainData,
    transport,
    findings,
    backgroundErrors,
    watches: new Map(),
    counters: { steps: 0 },
    pack,
    scenario: { id: '<none>', description: '', steps: [] },
  };

  let scenariosRun = 0;
  for (const scenario of pack.scenarios) {
    ctx.scenario = scenario;
    for (const [index, step] of scenario.steps.entries()) {
      ctx.counters.steps += 1;
      await runStep(ctx, step, index, assemble);
    }
    scenariosRun += 1;
  }

  return {
    pack: pack.meta.project,
    packageId: compiled.manifest.packageId,
    requiredCapabilities: compiled.manifest.requiredCapabilities,
    scenariosRun,
    stepsRun: ctx.counters.steps,
    findings,
  };
}

type AssembleFn = () => Promise<DomainRuntime>;

async function runStep(ctx: Ctx, step: ScenarioStep, index: number, assemble: AssembleFn): Promise<void> {
  const label = `[${ctx.pack.meta.project}/${ctx.scenario.id} step ${index} ${step.action}]`;
  try {
    switch (step.action) {
      case 'open': {
        const snapshot = await ctx.runtime.openInstance({
          address: { workflowId: str(step.workflowId), instanceKey: str(step.instanceKey) },
          correlationId: step.correlationId === undefined ? str(step.instanceKey) : str(step.correlationId),
          input: (step.input ?? null) as never,
        });
        if (step.expect !== undefined) assertInstanceSnapshot(snapshot, step.expect as Record<string, unknown>, label);
        return;
      }
      case 'send': {
        ctx.clock.advance(1);
        const ack = await ctx.runtime.send({
          messageId: str(step.messageId),
          target: address(step.to as Record<string, unknown>),
          type: str(step.type),
          payload: (step.payload ?? null) as never,
          ...(step.correlationId === undefined ? {} : { correlationId: str(step.correlationId) }),
          ...(step.causationId === undefined ? {} : { causationId: str(step.causationId) }),
          ...(step.contractVersion === undefined ? {} : { contractVersion: str(step.contractVersion) }),
        });
        if (step.expectAck !== undefined) assertSubset(ack, step.expectAck, label + ' ack');
        return;
      }
      case 'settle': {
        const timeoutMs = step.timeoutMs === undefined ? 10_000 : num(step.timeoutMs);
        const deadline = Date.now() + timeoutMs;
        while (ctx.store.hasUnresolvedMessages()) {
          if (Date.now() > deadline) {
            throw new Error(label + ' timed out with unresolved mailbox messages');
          }
          await sleep(2);
        }
        for (const entry of ctx.business.drainDirty()) ctx.runtime.invalidateBusinessSnapshot(entry);
        if (ctx.backgroundErrors.length > 0 && step.allowBackgroundErrors !== true) {
          throw new Error(label + ' background drain errors: ' + JSON.stringify(ctx.backgroundErrors));
        }
        return;
      }
      case 'expect-instance': {
        const result = await ctx.runtime.query({ kind: 'instance', target: address(step.target as Record<string, unknown>) });
        assert.equal(result.kind, 'instance');
        if (result.value === null) {
          if (step.expect === null) return;
          throw new Error(label + ' instance does not exist');
        }
        assertInstanceSnapshot(result.value, (step.expect ?? {}) as Record<string, unknown>, label);
        return;
      }
      case 'expect-disposition': {
        const target = address(step.target as Record<string, unknown>);
        const result = await ctx.runtime.query({
          kind: 'message-disposition',
          target,
          messageId: str(step.messageId),
        });
        assert.equal(result.kind, 'message-disposition');
        if (result.value === null) throw new Error(label + ' message not found');
        const expect = (step.expect ?? {}) as Record<string, unknown>;
        const actual: Record<string, unknown> = {
          disposition: result.value.disposition,
          ...(result.value.failure === undefined ? {} : { failureCode: result.value.failure.code }),
        };
        assertSubset(actual, expect, label);
        return;
      }
      case 'expect-projection': {
        const result = await ctx.runtime.query({
          kind: 'projection',
          projectionId: str(step.projectionId),
          key: str(step.key),
          ...(step.input === undefined ? {} : { input: step.input as never }),
        });
        assert.equal(result.kind, 'projection');
        if (step.expect !== undefined) assertSubset(result.value.value, step.expect, label);
        return;
      }
      case 'expect-business': {
        const snapshot = ctx.business.read({ source: str(step.source), key: str(step.key) });
        if (step.expect !== undefined) assertSubset(snapshot.value, step.expect, label);
        if (step.revisionEquals !== undefined) assert.equal(snapshot.revision, str(step.revisionEquals), label + ' revision');
        return;
      }
      case 'expect-ai-calls': {
        const actual = ctx.ai.callCount(step.skillId === undefined ? undefined : str(step.skillId));
        assert.equal(actual, num(step.count), label + ' ai call count');
        return;
      }
      case 'expect-transport-context': {
        // L2-4 evidence: the frozen RemoteTransportRequest cannot carry the
        // effect context, so idempotencyKey never reaches the execution edge.
        const invocations = ctx.transport.invocations;
        assert.ok(invocations.length >= num(step.minInvocations ?? 1), label + ' expected invocations');
        const carrying = invocations.filter((entry) => entry.carriedIdempotencyKey !== undefined);
        assert.equal(carrying.length, 0, label + ' transport unexpectedly carried idempotencyKey');
        recordFinding(ctx, index, {
          id: str(step.findingId ?? 'L2-4-idempotency-key-not-transported'),
          severity: 'divergence',
          summary: str(step.summary ?? 'RemoteTransportRequest carries no effect context; idempotencyKey stops at the journal and never reaches Tool execution (design doc v0.2 §9.4 [L2-4]).'),
          evidence: { invocations: invocations.length, sample: invocations[0] },
          related: step.related === undefined ? undefined : str(step.related),
        });
        return;
      }
      case 'invalidate': {
        ctx.runtime.invalidateBusinessSnapshot({ source: str(step.source), key: str(step.key) });
        return;
      }
      case 'watch-projection': {
        const name = str(step.as);
        const signals: DomainChange[] = [];
        ctx.runtime.subscribe(
          { kind: 'projection', projectionId: str(step.projectionId), key: str(step.key) },
          (change) => signals.push(change),
        );
        ctx.watches.set(name, { signals });
        return;
      }
      case 'expect-watch': {
        const watch = ctx.watches.get(str(step.as));
        assert.ok(watch, label + ' unknown watch');
        await sleep(5);
        assert.ok(watch.signals.length >= num(step.minSignals), label + ' watch signals');
        return;
      }
      case 'restart': {
        ctx.clock.advance(5);
        ctx.runtime = await assemble();
        // Startup recovery drains anything left unresolved (I135 semantics).
        const deadline = Date.now() + 10_000;
        while (ctx.store.hasUnresolvedMessages()) {
          if (Date.now() > deadline) throw new Error(label + ' restart recovery did not quiesce');
          await sleep(2);
        }
        for (const entry of ctx.business.drainDirty()) ctx.runtime.invalidateBusinessSnapshot(entry);
        ctx.backgroundErrors.length = 0;
        recordFinding(ctx, index, {
          id: 'restart-recovery-ok',
          severity: 'info',
          summary: 'Runtime restart reclaimed unresolved mailboxes and resumed instances from the durable store (activation recovery path).',
        });
        return;
      }
      case 'recover': {
        const result = await ctx.runtime.recover({
          target: address(step.target as Record<string, unknown>),
          action: step.op as 'retry' | 'resolve' | 'terminate',
          reason: str(step.reason),
        });
        if (step.expect !== undefined) assertInstanceSnapshot(result.instance, step.expect as Record<string, unknown>, label);
        return;
      }
      case 'advance-clock': {
        ctx.clock.advance(num(step.seconds));
        return;
      }
      case 'expect-throw': {
        const inner = step.step as ScenarioStep;
        let threw = false;
        let message = '';
        try {
          await runStep(ctx, inner, index, assemble);
        } catch (error) {
          threw = true;
          message = error instanceof Error ? error.message : String(error);
        }
        assert.ok(threw, label + ' expected the nested step to throw');
        if (step.errorMatch !== undefined) {
          assert.match(message, new RegExp(str(step.errorMatch)), label + ' error message');
        }
        return;
      }
      case 'finding': {
        recordFinding(ctx, index, {
          id: str(step.id),
          severity: (step.severity as Finding['severity']) ?? 'divergence',
          summary: str(step.summary),
          ...(step.evidence === undefined ? {} : { evidence: step.evidence as Record<string, unknown> }),
          ...(step.related === undefined ? {} : { related: str(step.related) }),
        });
        return;
      }
      default:
        throw new Error(label + ' unknown action ' + String(step.action));
    }
  } catch (error) {
    if (error instanceof AssertionError) throw error;
    throw new Error(label + ' ' + (error instanceof Error ? error.stack ?? error.message : String(error)));
  }
}

function recordFinding(
  ctx: Ctx,
  step: number,
  finding: Omit<Finding, 'pack' | 'scenario' | 'step'>,
): void {
  ctx.findings.push({
    ...finding,
    pack: ctx.pack.meta.project,
    scenario: ctx.scenario.id,
    step,
  });
}

function assertInstanceSnapshot(
  snapshot: { lifecycle: string; state: unknown; output?: unknown; failure?: { code: string } },
  expect: Record<string, unknown>,
  label: string,
): void {
  const actual: Record<string, unknown> = { lifecycle: snapshot.lifecycle };
  const state = snapshot.state as Record<string, unknown> | null;
  if (state !== null && typeof state === 'object') {
    actual.stateId = state.stateId;
    actual.lastResult = state.lastResult ?? null;
    actual.lastMessage = state.lastMessage ?? null;
    actual.data = state.data ?? null;
  }
  if (snapshot.output !== undefined) actual.output = snapshot.output;
  if (snapshot.failure !== undefined) actual.failureCode = snapshot.failure.code;
  assertSubset(actual, expect, label);
}

function assertSubset(actual: unknown, expected: unknown, path: string): void {
  if (expected === null || typeof expected !== 'object') {
    assert.deepStrictEqual(actual, expected, 'mismatch at ' + path + ': actual=' + JSON.stringify(actual));
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), 'expected array at ' + path);
    assert.equal((actual as unknown[]).length, expected.length, 'array length at ' + path);
    expected.forEach((item, index) => assertSubset((actual as unknown[])[index], item, path + '[' + index + ']'));
    return;
  }
  assert.ok(actual !== null && typeof actual === 'object', 'expected object at ' + path + ', actual=' + JSON.stringify(actual));
  for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
    assertSubset((actual as Record<string, unknown>)[key], value, path + '.' + key);
  }
}

function str(value: unknown): string {
  assert.equal(typeof value, 'string', 'expected string, got ' + typeof value);
  return value as string;
}

function num(value: unknown): number {
  assert.equal(typeof value, 'number', 'expected number, got ' + typeof value);
  return value as number;
}

function address(value: Record<string, unknown>): WorkflowAddress {
  return { workflowId: str(value.workflowId), instanceKey: str(value.instanceKey) };
}
