// v0.6 T005 (issue #540, frozen L2 C3): deterministic-only / no-model
// operation stays first-class, and the T001 declared semantic-unavailable
// disposition becomes the final public runtime behavior when fresh semantics
// are required but model capability is unavailable.
//
// Focused deterministic coverage of the 10 issue scenarios:
//  1. no-model runtime: Rule source resolves with zero model access, admission
//     behavior unchanged;
//  2. no-model runtime: Exact Cache reuse resolves with zero model access;
//  3. no-model runtime: a Promoted Subworkflow that needs no model resolves
//     with zero model access;
//  4. no-model + all deterministic sources unresolved + declaration
//     `unavailable = { kind: 'fail-closed' }` → a typed fail-closed unavailable
//     terminal (stable, diagnosable, distinct from generic resolver/Admission
//     failures); no effect, no journal record, no fabricated answer;
//  5. no-model + unresolved + `unavailable = { kind: 'declared-event', … }` →
//     the declared event/outcome carried as data into the SAME Central
//     Admission path (guards/hard invariants still apply; denial is final; no
//     second mutation path; never re-resolved);
//  6. declared-event outcome/eventType are exactly the declared vocabulary
//     values (no runtime invention; defensive fail-closed on material that
//     mismatches the compiled declaration; declared material is not exempt
//     from the admission schema gate);
//  7. model-configured runtime: fresh HarnessMachine path unchanged (the
//     no-model disposition does not fire when model capability is available,
//     and a Harness execution failure stays a resolver failure);
//  8. legacy/declaration-less attempts keep T004 behavior unchanged (binding
//     UNRESOLVED fail-closed; the raw resolver failure surface outside the
//     seam is untouched);
//  9. the unavailable disposition is observable in existing resolver/admission
//     evidence fields WITHOUT any T006 receipt/observation contract;
// 10. the unavailable terminal is its own stable category at the public
//     boundary — never collapsed into ADMISSION_DENIED /
//     SEMANTIC_DECISION_FAILED-class outcomes (L2 §7
//     SEMANTIC_INTELLIGENCE_UNAVAILABLE meaning).
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCanonicalJsonDigest } from '../../src/contracts/identity.js';
import type { CompiledArtifactIdentity } from '../../src/contracts/domain-data.js';
import type { JsonObject, JsonValue } from '../../src/contracts/json.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import {
  VolatileAdmissionEffectJournal,
  type CentralAdmissionOutcome,
} from '../../src/admission/index.js';
import { CentralAdmissionError } from '../../src/admission/index.js';
import {
  DecisionResolverError,
  resolveDecision,
  type DecisionResolverPorts,
  type DecisionResolverPromotedPorts,
  type DecisionResolverRuleInput,
  type DecisionResolverRulePort,
} from '../../src/decision-resolver/index.js';
import { VolatileHarnessExecutionJournalStore } from '../../src/harness/execution-journal.js';
import {
  MemoryGovernanceBaselineStore,
  type GovernanceBaselineBody,
} from '../../src/governance/index.js';
import { VolatileRuntimeEvidenceStore } from '../../src/runtime-evidence/index.js';
import { VolatileExactSemanticCacheStore } from '../../src/semantic-cache/index.js';
import { ExpressionRuntime } from '../../src/expression/index.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1 } from '../../src/schema/domainharness-json-schema-v1.js';
import {
  SEMANTIC_DECISION_CAPABILITY,
  SEMANTIC_DECISION_CONTRACT_VERSION_V1,
  type CompiledSemanticDecisionDescriptor,
  type SemanticDecisionCachePolicy,
  type SemanticDecisionUnavailableDisposition,
} from '../../src/v2/index.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/index.js';
import {
  createDomainRuntimeV3,
  DomainRuntimeV3Error,
} from '../../src/runtime/create-domain-runtime-v3.js';
import {
  declaredSemanticUnavailableOutcome,
  type ResolveAndAdmitTurnRequest,
  type RuntimeHarnessDecisionTurnMaterial,
  type RuntimePromotedDecisionTurnMaterial,
} from '../../src/runtime/decision-resolver-binding.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';
import { MemoryRuntimeStore } from './helpers.js';
import {
  CAP_INVARIANT,
  MemoryDurableExecutionStore,
  ScriptedEffectTools,
  makeBaseline,
  makeDefinition,
  quoteEvent,
  sha256,
  target,
  workflowInstanceId,
  NOW,
} from '../admission/helpers.js';
import type { QuoteDecisionResult } from '../decision-resolver/helpers.js';
import {
  HARNESS_PRODUCER,
  ScriptedModel,
  finalResponse,
  makeFixture,
  makeInvocation,
  quoteResult,
} from '../decision-resolver/helpers.js';
import {
  allAvailableArtifacts,
  promotedFixture,
  ref,
} from '../promoted-child/helpers.js';

/* ------------------------------------------------------------------------ */
/* Compiled successor package carrying T001 semantic-decision declarations   */
/* ------------------------------------------------------------------------ */

const CAPS = {
  hash: 'crypto-hash-sha256@1',
  random: 'secure-random@1',
  expression: 'expression-jsonata@1',
} as const;

const QUOTE_RESULT_SCHEMA: JsonObject = {
  type: 'object',
  required: ['decision', 'event'],
  properties: {
    decision: {
      type: 'object',
      required: ['outcome'],
      properties: { outcome: { enum: ['approve', 'reject'] } },
    },
    event: {
      type: 'object',
      required: ['type'],
      properties: { type: { enum: ['QUOTE_DECIDED'] } },
    },
  },
};

const ESCALATE_RESULT_SCHEMA: JsonObject = {
  type: 'object',
  required: ['decision', 'event'],
  properties: {
    decision: {
      type: 'object',
      required: ['outcome'],
      properties: { outcome: { enum: ['approve', 'escalate', 'reject'] } },
    },
    event: {
      type: 'object',
      required: ['type'],
      properties: { type: { enum: ['NEEDS_INPUT', 'QUOTE_DECIDED'] } },
    },
  },
};

interface DecisionOverrides {
  readonly decisionId?: string;
  readonly inputSelection?: string;
  readonly resultSchema?: JsonObject;
  readonly allowedOutcomes?: readonly string[];
  readonly allowedEventTypes?: readonly string[];
  readonly cachePolicy?: SemanticDecisionCachePolicy;
  readonly promotedReference?: CompiledSemanticDecisionDescriptor['promotedReference'];
  readonly unavailable?: SemanticDecisionUnavailableDisposition;
}

async function quoteDecisionDescriptor(overrides: DecisionOverrides = {}): Promise<CompiledSemanticDecisionDescriptor> {
  const body = {
    decisionId: overrides.decisionId ?? 'quote-decision',
    inputSelection: overrides.inputSelection ?? '$.order',
    resultSchema: overrides.resultSchema ?? QUOTE_RESULT_SCHEMA,
    allowedOutcomes: overrides.allowedOutcomes ?? ['approve', 'reject'],
    allowedEventTypes: overrides.allowedEventTypes ?? ['QUOTE_DECIDED'],
    queryCapabilityIds: ['quotes.lookup'],
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: overrides.cachePolicy ?? ({ mode: 'eligible' } as const),
    ...(overrides.promotedReference === undefined ? {} : { promotedReference: overrides.promotedReference }),
    policy: { maxSteps: 4 },
    unavailable: overrides.unavailable ?? ({ kind: 'fail-closed' } as const),
  };
  return { ...body, declarationDigest: await computeCanonicalJsonDigest(body, sha256) };
}

async function successorPackage(
  decisions: readonly CompiledSemanticDecisionDescriptor[] | undefined,
): Promise<TargetCompiledDomainPackage> {
  const manifest: Record<string, unknown> = {
    formatVersion: '0.3',
    runtimeContractMajor: 2,
    executionEngineMajor: 3,
    domainId: 'orders',
    domainVersion: '0.6.0-t005',
    packageId: 'pending',
    targetProfileId: 't005-integration@1',
    requiredCapabilities: [CAPS.hash, CAPS.random, CAPS.expression, SEMANTIC_DECISION_CAPABILITY],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
            rejected: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {
      'quotes.lookup': {
        toolId: 'quotes.lookup',
        outputSchema: { type: 'object' },
        effect: 'none',
        execution: { kind: 'runtime-read', bindingId: 'bind:quotes.lookup' },
        requiredCapabilities: [CAPS.expression],
      },
    },
    projections: {
      'quote.view': {
        projectionId: 'quote.view',
        expression: '$',
        dependencies: [{ kind: 'business', source: 'quotes.source', selector: {} }],
        outputSchema: { type: 'object' },
      },
    },
    schemas: {},
    bindingDigests: { 'bind:quotes.lookup': 'digest-bind:quotes.lookup' },
    schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
    packageDataBounds: {
      maxDomainDataEntries: 4,
      maxDomainDataEntryCanonicalBytes: 2048,
      maxTotalDomainDataCanonicalBytes: 8192,
      maxBusinessSources: 4,
      maxSchemaCanonicalBytes: 4096,
    },
    domainData: [],
    businessSources: [{ source: 'quotes.source', valueSchema: { type: 'object' } }],
  };
  if (decisions !== undefined) {
    manifest['semanticDecisionContractVersion'] = SEMANTIC_DECISION_CONTRACT_VERSION_V1;
    manifest['semanticDecisions'] = decisions;
  }
  const typed = manifest as unknown as TargetCompiledDomainPackage['manifest'];
  typed.packageId = await computeCompiledPackageId(typed, sha256);
  return {
    manifest: typed,
    bindings: { 'bind:quotes.lookup': 'host-read-handle' },
    domainData: {},
  };
}

/* ------------------------------------------------------------------------ */
/* v3 assembly fixture                                                       */
/* ------------------------------------------------------------------------ */

class MemoryActivationAuthority {
  current: unknown;
  async readDomainActivationBinding(): Promise<unknown> {
    return this.current;
  }
  async publishDomainActivationBinding(binding: unknown): Promise<void> {
    this.current = binding;
  }
}

class MemoryPackageCdiAuthority {
  readonly #records = new Map<string, unknown>();
  add(binding: unknown): void {
    const record = binding as { domainId: string; packageId: string; domainIntelligenceContentDigest: string };
    this.#records.set(`${record.domainId} ${record.packageId} ${record.domainIntelligenceContentDigest}`, binding);
  }
  async resolveExactPackageCdi(binding: unknown): Promise<unknown> {
    const record = binding as { domainId: string; packageId: string; domainIntelligenceContentDigest: string };
    return this.#records.get(`${record.domainId} ${record.packageId} ${record.domainIntelligenceContentDigest}`);
  }
}

interface UnavailableFixture {
  readonly assembly: Awaited<ReturnType<typeof createDomainRuntimeV3>>;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly tools: ScriptedEffectTools;
  readonly evidence: VolatileRuntimeEvidenceStore;
  readonly packageId: string;
  readonly b1: GovernanceBaselineBody;
  readonly declaration: CompiledSemanticDecisionDescriptor;
}

async function unavailableFixture(
  decisions: readonly CompiledSemanticDecisionDescriptor[],
): Promise<UnavailableFixture> {
  const b1 = await makeBaseline('B1', [CAP_INVARIANT]);
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const journal = new VolatileAdmissionEffectJournal();
  const tools = new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' });
  const evidence = new VolatileRuntimeEvidenceStore();
  const compiledPackage = await successorPackage(decisions.length === 0 ? undefined : decisions);
  const expressionRuntime = new ExpressionRuntime();
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store: new MemoryRuntimeStore(),
    bindings: createRuntimeHostFake({
      sha256,
      capabilities: [CAPS.hash, CAPS.random, CAPS.expression, SEMANTIC_DECISION_CAPABILITY],
      expression: {
        async evaluate(request) {
          return expressionRuntime.evaluate(request.expression, request.input, request.logicalTime);
        },
      },
    }),
    supportedPackageDataBounds: {
      maxDomainDataEntries: 32,
      maxDomainDataEntryCanonicalBytes: 4096,
      maxTotalDomainDataCanonicalBytes: 16384,
      maxBusinessSources: 32,
      maxSchemaCanonicalBytes: 8192,
    },
    v3: {
      baselines,
      activationAuthority: new MemoryActivationAuthority() as never,
      exactPackageCdi: new MemoryPackageCdiAuthority() as never,
      durableExecution: new MemoryDurableExecutionStore(),
      effectJournal: journal,
      effectTools: tools,
      evidence,
    },
  });
  return {
    assembly,
    journal,
    tools,
    evidence,
    packageId: compiledPackage.manifest.packageId,
    b1,
    declaration: decisions[0]!,
  };
}

async function pinInstance(fixture: UnavailableFixture): Promise<void> {
  await fixture.assembly.governance.pinExecution({
    workflowTarget: target.workflowId,
    workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: fixture.packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Turn request builders                                                     */
/* ------------------------------------------------------------------------ */

class CapturingRule implements DecisionResolverRulePort<QuoteDecisionResult> {
  calls = 0;
  readonly inputs: DecisionResolverRuleInput[] = [];
  readonly producerIdentity = ref('rule', 'rule:quote-rules', 'digest-rule:quote-rules');

  constructor(
    private readonly outcome:
      | { readonly status: 'no-match' }
      | { readonly status: 'match'; readonly result: QuoteDecisionResult },
  ) {}

  async evaluate(input: DecisionResolverRuleInput): Promise<{ readonly status: 'no-match' } | { readonly status: 'match'; readonly result: QuoteDecisionResult }> {
    this.calls += 1;
    this.inputs.push(input);
    return this.outcome;
  }
}

function harnessMaterial(
  model: ScriptedModel,
  journal = new VolatileHarnessExecutionJournalStore(),
): RuntimeHarnessDecisionTurnMaterial {
  return {
    input: { domainFacts: {}, compiledIntelligence: {}, workflowContext: {}, capabilities: [], model },
    journal,
    harnessProducerIdentity: HARNESS_PRODUCER,
  };
}

interface TurnOverrides {
  readonly decisionId?: string;
  readonly turn?: ResolveAndAdmitTurnRequest['turn'];
  readonly definition?: ResolveAndAdmitTurnRequest['definition'];
  readonly context?: JsonObject;
  readonly event?: ResolveAndAdmitTurnRequest['event'];
  readonly currentStateKey?: string;
  readonly rule?: DecisionResolverRulePort<QuoteDecisionResult>;
  readonly resolver?: Partial<DecisionResolverPorts<QuoteDecisionResult>>;
  readonly harness?: RuntimeHarnessDecisionTurnMaterial;
  readonly promoted?: RuntimePromotedDecisionTurnMaterial;
  readonly dependencies?: ResolveAndAdmitTurnRequest['dependencies'];
  readonly invokingArtifacts?: readonly CompiledArtifactIdentity[];
  readonly applicabilityFacts?: readonly CompiledArtifactIdentity[];
}

function turnRequest(
  overrides: TurnOverrides = {},
): ResolveAndAdmitTurnRequest<QuoteDecisionResult> {
  const resolver: DecisionResolverPorts<QuoteDecisionResult> = {
    ...(overrides.rule === undefined ? {} : { rule: overrides.rule }),
    ...(overrides.resolver === undefined ? {} : overrides.resolver),
  };
  return {
    decisionId: overrides.decisionId ?? 'quote-decision',
    target,
    turn: overrides.turn ?? { kind: 'message', sourceMessageId: `msg:t005-${Math.random().toString(36).slice(2)}` },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId,
    definition: overrides.definition ?? makeDefinition(),
    currentStateKey: overrides.currentStateKey ?? 'review',
    context: overrides.context ?? { order: { sku: 'P-1', quantity: 3 } },
    event: overrides.event ?? quoteEvent(42),
    now: NOW,
    resolver,
    ...(overrides.harness === undefined ? {} : { harness: overrides.harness }),
    ...(overrides.promoted === undefined ? {} : { promoted: overrides.promoted }),
    ...(overrides.dependencies === undefined ? {} : { dependencies: overrides.dependencies }),
    ...(overrides.invokingArtifacts === undefined ? {} : { invokingArtifacts: overrides.invokingArtifacts }),
    ...(overrides.applicabilityFacts === undefined ? {} : { applicabilityFacts: overrides.applicabilityFacts }),
  };
}

function expectAdmitted(outcome: CentralAdmissionOutcome): Extract<CentralAdmissionOutcome, { status: 'admitted' }>['admitted'] {
  if (outcome.status !== 'admitted') assert.fail(`expected admitted outcome, got ${JSON.stringify(outcome)}`);
  return outcome.admitted;
}

function expectDenied(outcome: CentralAdmissionOutcome): Extract<CentralAdmissionOutcome, { status: 'denied' }>['denial'] {
  if (outcome.status !== 'denied') assert.fail(`expected denied outcome, got ${JSON.stringify(outcome)}`);
  return outcome.denial;
}

/* ------------------------------------------------------------------------ */
/* 1 — no-model Rule resolution is first-class                               */
/* ------------------------------------------------------------------------ */

test('T005 1: no-model runtime — a Rule match resolves and admits with zero model access and unchanged admission behavior', async () => {
  // The declaration declares fail-closed, but the disposition must never fire:
  // the deterministic rule resolves first (frozen source order).
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({ unavailable: { kind: 'fail-closed' } })]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });

  // NO harness material and NO harness runner exist anywhere in this turn:
  // model access is impossible by construction.
  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule })));
  assert.equal(admitted.resolver.source, 'rule');
  assert.equal(admitted.resolver.llmAvoided, true);
  assert.equal(admitted.resolver.freshModelCallCount, 0);
  assert.equal(rule.calls, 1);
  // Admission behavior unchanged: the declared transition effect executed
  // through the existing durable effect authority.
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
});

/* ------------------------------------------------------------------------ */
/* 2 — no-model Exact Cache reuse is first-class                             */
/* ------------------------------------------------------------------------ */

test('T005 2: no-model runtime — an exact-cache reuse resolves and admits with zero model access', async () => {
  const fixture = await unavailableFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const cache = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();

  // Seed the exact cache through one setup turn (the supported seeding path).
  const seedModel = new ScriptedModel([finalResponse('approve', { via: 'cache' })]);
  const seed = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(seedModel),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
  })));
  assert.equal(seed.resolver.source, 'harness-machine');
  assert.equal(cache.size, 1);

  // The replay turn is no-model: NO harness runner, NO harness material — the
  // exact cache reuse completes the turn with zero model access.
  const seedModelCalls = seedModel.calls;
  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache },
    dependencies: { artifacts: [HARNESS_PRODUCER] },
  })));
  assert.equal(admitted.resolver.source, 'exact-cache');
  assert.equal(admitted.resolver.llmAvoided, true);
  assert.equal(admitted.resolver.freshModelCallCount, 0);
  assert.equal(seedModel.calls, seedModelCalls, 'the replay turn made zero model calls');
  assert.equal(fixture.tools.calls.length, 2, 'admission behavior unchanged for the cache-reuse turn');
});

/* ------------------------------------------------------------------------ */
/* 3 — no-model Promoted Subworkflow is first-class                          */
/* ------------------------------------------------------------------------ */

test('T005 3: no-model runtime — a promoted subworkflow that needs no model resolves and admits with zero model access', async () => {
  const declaration = await quoteDecisionDescriptor({
    promotedReference: { kind: 'version', artifactId: 'subworkflow:quote-review', version: '1.0.0' },
  });
  const fixture = await unavailableFixture([declaration]);
  await pinInstance(fixture);
  const promoted = await promotedFixture({}, {
    packageId: fixture.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: {
      domainId: fixture.b1.identity.domainId,
      governanceId: fixture.b1.identity.governanceId,
      schemaVersion: fixture.b1.identity.schemaVersion,
      contentDigest: fixture.b1.identity.contentDigest,
    },
  });

  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: {
      promoted: {
        runtime: promoted.runtime,
        artifactPort: promoted.port,
        revocation: { readRevocation: (artifact) => promoted.registry.readRevocation(artifact) },
      } satisfies DecisionResolverPromotedPorts,
    },
    promoted: {
      executor: { async executeQuery() { return { quote: quoteResult('approve', { amount: 42 }), price: 42 }; } },
      journal: new VolatileHarnessExecutionJournalStore(),
    },
    invokingArtifacts: [...allAvailableArtifacts()],
    applicabilityFacts: [ref('knowledge', 'ctx:b2b-quote')],
  })));
  assert.equal(admitted.resolver.source, 'promoted-subworkflow');
  assert.equal(admitted.resolver.llmAvoided, true);
  assert.equal(admitted.resolver.freshModelCallCount, 0);
  // Parent mutation authority unchanged; the declared fail-closed disposition
  // never fired because the deterministic source resolved.
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
});

/* ------------------------------------------------------------------------ */
/* 4 — fail-closed disposition → typed unavailable terminal                  */
/* ------------------------------------------------------------------------ */

test('T005 4: no-model + all deterministic sources unresolved + declared fail-closed → typed unavailable terminal with no effect and no journal record', async () => {
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({ unavailable: { kind: 'fail-closed' } })]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'no-match' });

  let captured: unknown;
  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule })),
    (candidate: unknown) => {
      captured = candidate;
      return candidate instanceof DomainRuntimeV3Error;
    },
  );
  const error = captured as DomainRuntimeV3Error;
  // Its own stable, diagnosable category — not a resolver failure, not an
  // admission failure, not a binding failure (scenario 10 non-collapse).
  assert.equal(error.code, 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE');
  assert.ok(!(error instanceof DecisionResolverError));
  assert.ok(!(error instanceof CentralAdmissionError));
  assert.ok(error.message.includes('quote-decision'), 'the terminal is diagnosable down to the decision');
  // The deterministic sources ran (the resolver exhausted them), but nothing
  // was fabricated: no model answer, no effect, no journal record.
  assert.equal(rule.calls, 1);
  assert.equal(fixture.tools.calls.length, 0, 'no effect execution');
  assert.equal(fixture.journal.getRecords().length, 0, 'no journal record');
});

/* ------------------------------------------------------------------------ */
/* 5 — declared-event disposition → the SAME Central Admission path          */
/* ------------------------------------------------------------------------ */

test('T005 5: no-model + unresolved + declared-event → the declared event/outcome is carried as data through the SAME Central Admission path', async () => {
  // Strict schema: admission can only admit if the carried material was
  // EXACTLY the declared outcome/eventType — nothing invented at runtime.
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({
    unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'reject' },
    resultSchema: {
      type: 'object',
      required: ['decision', 'event'],
      properties: {
        decision: {
          type: 'object',
          required: ['outcome'],
          properties: { outcome: { enum: ['reject'] } },
        },
        event: {
          type: 'object',
          required: ['type'],
          properties: { type: { enum: ['QUOTE_DECIDED'] } },
        },
      },
    },
  })]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'no-match' });

  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule })));
  // The declared material went through the SAME admission path: transition
  // authority stays exactly where it is for every resolution (turn trigger +
  // pinned guards select the transition; the decision is data, never an
  // engine-state rewriter), and the declared transition effect executed.
  assert.equal(admitted.transitionKey, 'approve');
  assert.equal(admitted.targetState, 'approved');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
  assert.equal(fixture.journal.getRecords()[0]!.durableControlTurnId, admitted.durableControlTurnId);
  // The material is marked as runtime-carried declared disposition data —
  // never as a model/harness product (observable, scenario 9). The strict
  // schema gate proves the carried outcome/eventType were exactly the
  // declared values.
  assert.equal(admitted.resolver.source, 'declared-unavailable');
  assert.equal(admitted.resolver.llmAvoided, true);
  assert.equal(admitted.resolver.freshModelCallCount, 0);
  assert.equal(rule.calls, 1);
});

test('T005 5b: an admission denial of the declared-event material is final — no re-resolution, no retry, no second mutation path', async () => {
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({
    unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'reject' },
  })]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'no-match' });

  // The pinned hard invariant denies this turn regardless of the decision
  // material; guards/hard invariants still apply to declared material.
  const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule,
    event: quoteEvent(5000),
  })));
  assert.equal(denied.reason, 'hard-invariant');
  assert.equal(denied.resolver.source, 'declared-unavailable');
  assert.equal(rule.calls, 1, 'the resolver ran exactly once; the declared material is never re-resolved');
  assert.equal(fixture.tools.calls.length, 0, 'no effect execution after denial');
  assert.equal(fixture.journal.getRecords().length, 0, 'no journal mutation after denial');
});

/* ------------------------------------------------------------------------ */
/* 6 — declared vocabulary exactness + defensive fail-closed                 */
/* ------------------------------------------------------------------------ */

test('T005 6: the declared event/outcome are exactly the declared vocabulary values — a strict result schema admits them and only them', async () => {
  // The result schema enum admits exactly the declaration's compiled
  // vocabulary. The declared disposition names 'escalate'/'NEEDS_INPUT' (both
  // inside allowedOutcomes/allowedEventTypes); if the runtime invented any
  // other outcome/eventType, the admission schema gate would deny as 'schema'.
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({
    resultSchema: ESCALATE_RESULT_SCHEMA,
    allowedOutcomes: ['approve', 'escalate', 'reject'],
    allowedEventTypes: ['NEEDS_INPUT', 'QUOTE_DECIDED'],
    unavailable: { kind: 'declared-event', eventType: 'NEEDS_INPUT', outcome: 'escalate' },
  })]);
  await pinInstance(fixture);

  const outcome = await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
  }));
  assert.equal(outcome.status, 'admitted', 'the declared vocabulary passed the strict schema gate unchanged');
  if (outcome.status === 'admitted') {
    assert.equal(outcome.admitted.resolver.source, 'declared-unavailable');
  }
});

test('T005 6b: declared-event material that mismatches the compiled declaration fails closed before any admission work (defensive)', () => {
  // Simulated tampered/foreign declaration material: the T001 compile and
  // activation authorities reject this shape, so the runtime re-check against
  // the same declaration is purely defensive — and it must fail closed with a
  // typed binding error BEFORE any admission material is produced.
  const tampered = {
    decisionId: 'quote-decision',
    allowedOutcomes: ['approve', 'reject'],
    allowedEventTypes: ['QUOTE_DECIDED'],
    unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'deny-all' },
  } as unknown as CompiledSemanticDecisionDescriptor;

  assert.throws(
    () => declaredSemanticUnavailableOutcome<JsonValue>(
      tampered,
      new DecisionResolverError('DECISION_RESOLVER_HARNESS_UNCONFIGURED', 'unconfigured'),
    ),
    (error: unknown) => error instanceof DomainRuntimeV3Error
      && error.code === 'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE'
      && error.message.includes('deny-all'),
  );
});

test('T005 6c: the declared-event material is not exempt from the admission schema gate', async () => {
  // The declared outcome is inside allowedOutcomes but outside the compiled
  // resultSchema enum — the SAME admission schema gate denies it (final).
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({
    allowedOutcomes: ['approve', 'reject'],
    unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'reject' },
    resultSchema: {
      type: 'object',
      required: ['decision', 'event'],
      properties: {
        decision: {
          type: 'object',
          required: ['outcome'],
          properties: { outcome: { enum: ['approve'] } },
        },
        event: {
          type: 'object',
          required: ['type'],
          properties: { type: { enum: ['QUOTE_DECIDED'] } },
        },
      },
    },
  })]);
  await pinInstance(fixture);

  const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
  })));
  assert.equal(denied.reason, 'schema');
  assert.equal(denied.resolver.source, 'declared-unavailable');
  assert.equal(fixture.tools.calls.length, 0);
});

/* ------------------------------------------------------------------------ */
/* 7 — model-configured runtime is unchanged                                 */
/* ------------------------------------------------------------------------ */

test('T005 7: model-configured runtime — the fresh HarnessMachine path is unchanged and the no-model disposition never fires', async () => {
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({
    unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'reject' },
  })]);
  await pinInstance(fixture);
  const harness = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', { via: 'harness' })]);

  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { harnessRunner: harness.runner },
    harness: harnessMaterial(model),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
  })));
  // Model capability was available: the Harness ran (fresh model reasoning),
  // and the declared disposition did NOT fire.
  assert.equal(admitted.resolver.source, 'harness-machine');
  assert.equal(admitted.resolver.freshModelCallCount, 1);
  assert.equal(admitted.resolver.llmAvoided, false);
  assert.equal(model.calls, 1);
  assert.equal(fixture.tools.calls.length, 1);
});

test('T005 7b: a Harness execution failure with capability available stays a resolver failure — never converted to the unavailable terminal', async () => {
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({
    unavailable: { kind: 'fail-closed' },
  })]);
  await pinInstance(fixture);
  const harness = makeFixture();
  // A scripted model with an exhausted queue fails the Harness execution:
  // capability WAS available, so this is DECISION_RESOLVER_HARNESS_FAILED.
  const model = new ScriptedModel([]);

  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: harness.runner },
      harness: harnessMaterial(model),
      dependencies: { artifacts: [HARNESS_PRODUCER] },
    })),
    (error: unknown) => error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_HARNESS_FAILED',
  );
  assert.equal(fixture.tools.calls.length, 0);
  assert.equal(fixture.journal.getRecords().length, 0);
});

/* ------------------------------------------------------------------------ */
/* 8 — legacy/declaration-less behavior unchanged                            */
/* ------------------------------------------------------------------------ */

test('T005 8: declaration-less attempts keep T004 behavior — binding UNRESOLVED fail-closed, no disposition, no resolver work', async () => {
  const fixture = await unavailableFixture([]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'no-match' });

  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule })),
    (error: unknown) => error instanceof DomainRuntimeV3Error
      && error.code === 'RUNTIME_V3_DECISION_BINDING_UNRESOLVED',
  );
  assert.equal(rule.calls, 0, 'binding fails closed before any resolver work');
  assert.equal(fixture.tools.calls.length, 0);
  assert.equal(fixture.journal.getRecords().length, 0);
});

test('T005 8b: the direct resolver surface is untouched — DECISION_RESOLVER_HARNESS_UNCONFIGURED semantics stay raw outside the runtime seam', async () => {
  const helper = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', {})]);
  const invocation = await makeInvocation({
    harness: {
      input: {
        domainFacts: {},
        compiledIntelligence: {},
        workflowContext: {},
        allowedDecisionOutcomes: ['approve', 'reject'],
        allowedEventTypes: ['QUOTE_DECIDED'],
        capabilities: [],
        model,
        maxSteps: 4,
      },
      journal: helper.journal,
      harnessProducerIdentity: HARNESS_PRODUCER,
    },
  });
  // No harnessRunner port supplied to the resolver: the raw existing failure.
  await assert.rejects(
    () => resolveDecision(invocation, { cacheStore: helper.cacheStore }, sha256),
    (error: unknown) => error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_HARNESS_UNCONFIGURED',
  );
});

/* ------------------------------------------------------------------------ */
/* 9 — observable in EXISTING evidence fields (no T006 contract)             */
/* ------------------------------------------------------------------------ */

test('T005 9: the fail-closed unavailable terminal is observable through the existing runtime failure-evidence channel', async () => {
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({ unavailable: { kind: 'fail-closed' } })]);
  await pinInstance(fixture);

  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
    })),
    (error: unknown) => error instanceof DomainRuntimeV3Error
      && error.code === 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE',
  );

  const failures = fixture.evidence.records().filter((record) => record.sourceKind === 'workflow-failure');
  assert.equal(failures.length, 1, 'exactly one existing-channel failure record');
  const payload = failures[0]!.payload as { code?: string; message?: string };
  assert.equal(payload.code, 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE');
  assert.ok(payload.message?.includes('quote-decision'));
});

/* ------------------------------------------------------------------------ */
/* 10 — the terminal is its own stable public category                       */
/* ------------------------------------------------------------------------ */

test('T005 10: the unavailable terminal is not collapsed into ADMISSION_DENIED or SEMANTIC_DECISION_FAILED-class outcomes', async () => {
  const fixture = await unavailableFixture([await quoteDecisionDescriptor({ unavailable: { kind: 'fail-closed' } })]);
  await pinInstance(fixture);

  // It throws — it never becomes an admission outcome (no denial shape).
  let captured: unknown;
  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: makeFixture().runner },
    })),
    (candidate: unknown) => {
      captured = candidate;
      return candidate instanceof Error;
    },
  );
  const error = captured as DomainRuntimeV3Error;
  assert.ok(error instanceof DomainRuntimeV3Error);
  assert.equal((error as DomainRuntimeV3Error).code, 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE');
  assert.ok(!(error instanceof DecisionResolverError), 'not a SEMANTIC_DECISION_FAILED-class resolver failure');
  assert.ok(!(error instanceof CentralAdmissionError), 'not an admission failure');
  assert.ok(
    !(error instanceof DomainRuntimeV3Error && error.code === 'RUNTIME_V3_DECISION_BINDING_UNRESOLVED')
      && !(error instanceof DomainRuntimeV3Error && error.code === 'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE'),
    'not a RUNTIME_V3_DECISION_BINDING_* binding failure',
  );
});

/* ------------------------------------------------------------------------ */
/* Binding-module unit coverage: disposition selection + defensive checks    */
/* ------------------------------------------------------------------------ */

test('T005 U: declaredSemanticUnavailableOutcome selects strictly from the compiled declaration and only on the model-unavailability signal', async () => {
  const declaration = await quoteDecisionDescriptor({
    unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'reject' },
  });

  // (a) Any other error is not-applicable — never converted.
  assert.deepEqual(
    declaredSemanticUnavailableOutcome<JsonValue>(declaration, new Error('unrelated')),
    { kind: 'not-applicable' },
  );
  assert.deepEqual(
    declaredSemanticUnavailableOutcome<JsonValue>(
      declaration,
      new DecisionResolverError('DECISION_RESOLVER_HARNESS_FAILED', 'harness failed'),
    ),
    { kind: 'not-applicable' },
  );

  // (b) The signal with a declared-event disposition produces exactly the
  // declared material as data, model-free.
  const outcome = declaredSemanticUnavailableOutcome<JsonValue>(
    declaration,
    new DecisionResolverError('DECISION_RESOLVER_HARNESS_UNCONFIGURED', 'unconfigured'),
  );
  assert.equal(outcome.kind, 'declared-event');
  if (outcome.kind === 'declared-event') {
    assert.equal(outcome.resolution.source, 'declared-unavailable');
    assert.deepEqual(outcome.resolution.structuredDecision, {
      decision: { outcome: 'reject' },
      event: { type: 'QUOTE_DECIDED' },
    });
    assert.equal(outcome.resolution.freshModelCallCount, 0);
    assert.equal(outcome.resolution.llmAvoided, true);
  }

  // (c) The signal with a fail-closed disposition yields the typed terminal.
  const failClosed = await quoteDecisionDescriptor({ unavailable: { kind: 'fail-closed' } });
  const closed = declaredSemanticUnavailableOutcome<JsonValue>(
    failClosed,
    new DecisionResolverError('DECISION_RESOLVER_HARNESS_UNCONFIGURED', 'unconfigured'),
  );
  assert.equal(closed.kind, 'fail-closed');
  if (closed.kind === 'fail-closed') {
    assert.ok(closed.reason.includes('quote-decision'));
  }

  // (d) Defensive: declared event outside the compiled allowedEventTypes.
  const badEvent = {
    ...declaration,
    unavailable: { kind: 'declared-event', eventType: 'INVENTED_EVENT', outcome: 'reject' },
  } as CompiledSemanticDecisionDescriptor;
  assert.throws(
    () => declaredSemanticUnavailableOutcome<JsonValue>(
      badEvent,
      new DecisionResolverError('DECISION_RESOLVER_HARNESS_UNCONFIGURED', 'unconfigured'),
    ),
    (error: unknown) => error instanceof DomainRuntimeV3Error
      && error.code === 'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
  );

  // (e) Defensive: declared outcome outside the compiled allowedOutcomes.
  const badOutcome = {
    ...declaration,
    unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'deny-all' },
  } as CompiledSemanticDecisionDescriptor;
  assert.throws(
    () => declaredSemanticUnavailableOutcome<JsonValue>(
      badOutcome,
      new DecisionResolverError('DECISION_RESOLVER_HARNESS_UNCONFIGURED', 'unconfigured'),
    ),
    (error: unknown) => error instanceof DomainRuntimeV3Error
      && error.code === 'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
  );
});
