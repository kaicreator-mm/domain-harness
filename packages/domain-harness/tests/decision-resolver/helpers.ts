import assert from 'node:assert/strict';
import type { JsonObject, JsonValue } from '../../src/contracts/json.js';
import type { CompiledArtifactIdentity } from '../../src/contracts/domain-data.js';
import type {
  BusinessHarnessInput,
  BusinessHarnessModelResponse,
  BusinessHarnessResult,
  ModelPort,
} from '../../src/harness/contract.js';
import { VolatileHarnessExecutionJournalStore } from '../../src/harness/execution-journal.js';
import { VolatileExactSemanticCacheStore } from '../../src/semantic-cache/index.js';
import type {
  DecisionResolverHarnessConfig,
  DecisionResolverInvocation,
  DecisionResolverPorts,
  DecisionResolverRulePort,
  HarnessMachineRunnerPort,
} from '../../src/decision-resolver/index.js';
import { createXStateHarnessMachineRunner } from '../../src/decision-resolver/index.js';
import type { SemanticCacheCurrentSchema } from '../../src/semantic-cache/exact-semantic-cache.js';
import {
  invokingContext,
  makeSlot,
  ref,
  sha256,
} from '../promoted-child/helpers.js';

export { invokingContext, makeSlot, ref, sha256 };

/* ------------------------------------------------------------------------ */
/* Result shapes + schemas                                                   */
/* ------------------------------------------------------------------------ */

export type QuoteDecisionResult = {
  readonly decision: { readonly outcome: string; readonly data: JsonValue };
  readonly event: { readonly type: string; readonly payload: JsonValue };
};

export function quoteResult(outcome: string, data: JsonValue): QuoteDecisionResult {
  return {
    decision: { outcome, data },
    event: { type: 'QUOTE_DECIDED', payload: data },
  };
}

function isQuoteDecision(value: JsonValue): value is QuoteDecisionResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const decision = record.decision;
  const event = record.event;
  if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
  return typeof (decision as Record<string, unknown>).outcome === 'string'
    && typeof (event as Record<string, unknown>).type === 'string';
}

export const decisionSchema: SemanticCacheCurrentSchema<QuoteDecisionResult> = {
  isValid: isQuoteDecision,
};

export const rejectingSchema: SemanticCacheCurrentSchema<QuoteDecisionResult> = {
  isValid: (value): value is QuoteDecisionResult => {
    void value;
    return false;
  },
};

/* ------------------------------------------------------------------------ */
/* Scripted model + Harness fallback configuration                            */
/* ------------------------------------------------------------------------ */

export class ScriptedModel implements ModelPort {
  calls = 0;
  readonly queue: BusinessHarnessModelResponse[];

  constructor(steps: readonly BusinessHarnessModelResponse[]) {
    this.queue = [...steps];
  }

  async generate(): Promise<BusinessHarnessModelResponse> {
    this.calls += 1;
    const next = this.queue.shift();
    if (next === undefined) throw new Error('scripted model queue exhausted');
    return next;
  }
}

export function finalResponse(outcome: string, data: JsonValue): BusinessHarnessModelResponse {
  return { kind: 'final', result: quoteResult(outcome, data) };
}

export function queryResponse(capabilityId: string, input: JsonValue): BusinessHarnessModelResponse {
  return { kind: 'query', call: { capabilityId, input } };
}

export const HARNESS_PRODUCER: CompiledArtifactIdentity = ref('harness-config', 'harness:quote', 'digest-harness:quote');

export function harnessConfig(
  model: ModelPort,
  journal: VolatileHarnessExecutionJournalStore,
  overrides: Partial<DecisionResolverHarnessConfig> = {},
  inputOverrides: Partial<BusinessHarnessInput> = {},
): DecisionResolverHarnessConfig {
  return {
    input: {
      domainFacts: {} as JsonObject,
      compiledIntelligence: {} as JsonObject,
      workflowContext: {} as JsonObject,
      allowedDecisionOutcomes: ['approve', 'reject'],
      allowedEventTypes: ['QUOTE_DECIDED'],
      capabilities: [],
      model,
      maxSteps: 4,
      ...inputOverrides,
    },
    journal,
    harnessProducerIdentity: HARNESS_PRODUCER,
    ...overrides,
  };
}

/* ------------------------------------------------------------------------ */
/* Rule ports                                                                  */
/* ------------------------------------------------------------------------ */

export class ScriptedRule implements DecisionResolverRulePort<QuoteDecisionResult> {
  calls = 0;

  constructor(
    private readonly outcome:
      | { readonly status: 'no-match' }
      | { readonly status: 'match'; readonly result: QuoteDecisionResult },
    readonly producerIdentity: CompiledArtifactIdentity = ref('rule', 'rule:quote-rules', 'digest-rule:quote-rules'),
  ) {}

  async evaluate() {
    this.calls += 1;
    return this.outcome;
  }
}

export class ThrowingRule implements DecisionResolverRulePort<QuoteDecisionResult> {
  readonly producerIdentity: CompiledArtifactIdentity = ref('rule', 'rule:quote-rules', 'digest-rule:quote-rules');

  async evaluate(): Promise<never> {
    throw new Error('rule integrity failure');
  }
}

/* ------------------------------------------------------------------------ */
/* Invocation builder                                                          */
/* ------------------------------------------------------------------------ */

export interface InvocationFixture {
  readonly cacheStore: VolatileExactSemanticCacheStore<QuoteDecisionResult>;
  readonly journal: VolatileHarnessExecutionJournalStore;
  readonly runner: HarnessMachineRunnerPort;
}

export function makeFixture(): InvocationFixture {
  return {
    cacheStore: new VolatileExactSemanticCacheStore<QuoteDecisionResult>(),
    journal: new VolatileHarnessExecutionJournalStore(),
    runner: createXStateHarnessMachineRunner(),
  };
}

export interface InvocationOptions {
  readonly selectedInput?: JsonValue;
  readonly dependencies?: DecisionResolverInvocation<QuoteDecisionResult>['dependencies'];
  readonly durableControlTurnId?: string;
  readonly promoted?: DecisionResolverInvocation<QuoteDecisionResult>['promoted'];
  readonly harness?: DecisionResolverInvocation<QuoteDecisionResult>['harness'];
  readonly invoking?: DecisionResolverInvocation<QuoteDecisionResult>['invoking'];
  readonly schema?: SemanticCacheCurrentSchema<QuoteDecisionResult>;
  readonly allBehaviorallyRelevantDependenciesPrebound?: boolean;
}

export async function makeInvocation(
  options: InvocationOptions = {},
): Promise<DecisionResolverInvocation<QuoteDecisionResult>> {
  return {
    namespace: 'tenant:a',
    domainId: 'orders',
    decisionId: 'quote-decision',
    selectedInput: options.selectedInput ?? { sku: 'P-1', quantity: 3 },
    dependencies: options.dependencies ?? { artifacts: [HARNESS_PRODUCER] },
    invoking: options.invoking ?? invokingContext(),
    slot: makeSlot(),
    pinnedAt: '2026-09-21T06:00:00.000Z',
    durableControlTurnId: options.durableControlTurnId ?? 'turn:1',
    semanticContractDigest: await sha256.digestUtf8('decision-contract:quote:v1'),
    nowEpochMs: 1_800_000_000_000,
    currentSchema: options.schema ?? decisionSchema,
    ...(options.promoted === undefined ? {} : { promoted: options.promoted }),
    ...(options.harness === undefined ? {} : { harness: options.harness }),
    ...(options.allBehaviorallyRelevantDependenciesPrebound === undefined
      ? {}
      : { allBehaviorallyRelevantDependenciesPrebound: options.allBehaviorallyRelevantDependenciesPrebound }),
  };
}

export function makePorts(
  fixture: InvocationFixture,
  overrides: Partial<DecisionResolverPorts<QuoteDecisionResult>> = {},
): DecisionResolverPorts<QuoteDecisionResult> {
  return {
    cacheStore: fixture.cacheStore,
    harnessRunner: fixture.runner,
    ...overrides,
  };
}

export function assertTerminalOk(result: BusinessHarnessResult): void {
  assert.equal(result.status, 'ok');
}

/**
 * JSON-value equality for resolver decisions. Harness/cache-sourced payloads
 * pass through canonical JSON (null-prototype objects), so prototype-strict
 * deepEqual would fail on content-identical values.
 */
export function assertJsonEqual(actual: JsonValue, expected: JsonValue): void {
  assert.deepEqual(
    JSON.parse(JSON.stringify(actual)) as unknown,
    JSON.parse(JSON.stringify(expected)) as unknown,
  );
}
