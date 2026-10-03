// v0.6 T004 (issue #523, frozen L2 C2): bounded Runtime integration of the
// existing DecisionResolver into the existing Central Admission path.
//
// Focused deterministic coverage of the 14 issue scenarios:
//  1. declaration bound by stable decision identity (no second registry authority)
//  2. existing resolveDecision() invoked with exact source order/semantics
//  3. rule result → Central Admission (data only until admitted)
//  4. exact-cache hit → same path; never bypasses guard/hard-invariant authority
//  5. promoted subworkflow → same path; child intents are not parent mutation authority
//  6. HarnessMachine result → same path; fresh model reasoning stays proposal/data
//  7. guard/hard-invariant rejection after a successful resolution is final (no retry)
//  8. resolver schema/currentness failure fails closed before admission mutation
//  9. decision identity + semanticContractDigest + durable control-turn identity +
//     invoking/pinned authority carried consistently resolver → admission
// 10. the T001 declaration result schema is the ONE schema authority for resolver
//     validation AND admission validation
// 11. legacy/deterministic runtime paths without declarations remain unchanged
// 12. ResolvedDecision telemetry reaches the existing Admission resolver evidence
// 13. missing/unknown/incompatible binding material fails closed with stable errors
// 14. negative space: no provider/model routing, no Adaptive Region / Goal
//     Runtime / JIT / Direct Resolution surface exists to reach (by construction
//     of the bounded seam; asserted here where observable).
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCanonicalJsonDigest } from '../../src/contracts/identity.js';
import type { CompiledArtifactIdentity } from '../../src/contracts/domain-data.js';
import type { JsonObject, JsonValue } from '../../src/contracts/json.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import {
  deriveDurableControlTurnId,
  VolatileAdmissionEffectJournal,
  type CentralAdmissionOutcome,
} from '../../src/admission/index.js';
import {
  DecisionResolverError,
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
  type SemanticDecisionPromotedReference,
} from '../../src/v2/index.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/index.js';
import { createDomainRuntime } from '../../src/runtime/create-domain-runtime.js';
import {
  createDomainRuntimeV3,
  DomainRuntimeV3Error,
} from '../../src/runtime/create-domain-runtime-v3.js';
import type {
  ResolveAndAdmitTurnRequest,
  RuntimeHarnessDecisionTurnMaterial,
  RuntimePromotedDecisionTurnMaterial,
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

interface DecisionOverrides {
  readonly decisionId?: string;
  readonly inputSelection?: string;
  readonly queryCapabilityIds?: readonly string[];
  readonly dependencyMaterial?: CompiledSemanticDecisionDescriptor['dependencyMaterial'];
  readonly cachePolicy?: SemanticDecisionCachePolicy;
  readonly promotedReference?: SemanticDecisionPromotedReference;
}

async function quoteDecisionDescriptor(overrides: DecisionOverrides = {}): Promise<CompiledSemanticDecisionDescriptor> {
  const body = {
    decisionId: overrides.decisionId ?? 'quote-decision',
    inputSelection: overrides.inputSelection ?? '$.order',
    resultSchema: QUOTE_RESULT_SCHEMA,
    allowedOutcomes: ['approve', 'reject'],
    allowedEventTypes: ['QUOTE_DECIDED'],
    queryCapabilityIds: overrides.queryCapabilityIds ?? ['quotes.lookup'],
    dependencyMaterial: overrides.dependencyMaterial ?? { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: overrides.cachePolicy ?? ({ mode: 'eligible' } as const),
    ...(overrides.promotedReference === undefined ? {} : { promotedReference: overrides.promotedReference }),
    policy: { maxSteps: 4 },
    unavailable: { kind: 'fail-closed' } as const,
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
    domainVersion: '0.6.0-t004',
    packageId: 'pending',
    targetProfileId: 't004-integration@1',
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

interface IntegrationFixture {
  readonly assembly: Awaited<ReturnType<typeof createDomainRuntimeV3>>;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly tools: ScriptedEffectTools;
  readonly packageId: string;
  readonly b1: GovernanceBaselineBody;
  readonly declaration: CompiledSemanticDecisionDescriptor;
}

async function integrationFixture(
  decisions: readonly CompiledSemanticDecisionDescriptor[],
): Promise<IntegrationFixture> {
  const b1 = await makeBaseline('B1', [CAP_INVARIANT]);
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const journal = new VolatileAdmissionEffectJournal();
  const tools = new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' });
  // An empty list means the package carries NO semantic-decision material at
  // all (the compiled field is omitted; an empty present array fails
  // activation by contract).
  const compiledPackage = await successorPackage(decisions.length === 0 ? undefined : decisions);
  const expressionRuntime = new ExpressionRuntime();
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store: new MemoryRuntimeStore(),
    bindings: createRuntimeHostFake({
      sha256,
      capabilities: [CAPS.hash, CAPS.random, CAPS.expression, SEMANTIC_DECISION_CAPABILITY],
      // Real portable JSONata evaluation, exactly like the production host adapter.
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
      evidence: new VolatileRuntimeEvidenceStore(),
    },
  });
  return {
    assembly,
    journal,
    tools,
    packageId: compiledPackage.manifest.packageId,
    b1,
    declaration: decisions[0]!,
  };
}

async function pinInstance(fixture: IntegrationFixture): Promise<void> {
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
  readonly invokingArtifacts?: readonly ReturnType<typeof ref>[];
  readonly applicabilityFacts?: readonly ReturnType<typeof ref>[];
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
    turn: overrides.turn ?? { kind: 'message', sourceMessageId: 'msg:1' },
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

async function expectV3Failure(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof DomainRuntimeV3Error && error.code === code);
}

/** Fresh rule + cache + harness resolver ports for a deterministic turn. */
function resolverFixture() {
  const fixture = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', { via: 'harness' })]);
  return { ...fixture, model };
}

/* ------------------------------------------------------------------------ */
/* 1 — binding by stable decision identity                                   */
/* ------------------------------------------------------------------------ */

test('T004 1: binds an admitted compiled declaration by stable decision identity through the existing pinned-package registry', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });

  const outcome = await fixture.assembly.resolveAndAdmitTurn(
    turnRequest({ rule, resolver: { harnessRunner: resolverFixture().runner } }),
  );
  const admitted = expectAdmitted(outcome);
  assert.equal(admitted.resolver.source, 'rule');
  assert.equal(admitted.resolver.llmAvoided, true);
  // The admission path is the ONE existing path: durable effect authority ran.
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
  assert.equal(rule.calls, 1);
});

/* ------------------------------------------------------------------------ */
/* 2 — existing resolver invoked with exact frozen order                     */
/* ------------------------------------------------------------------------ */

test('T004 2: the runtime invokes the existing resolveDecision path preserving the frozen source order rule → cache → promoted → harness', async () => {
  // (a) rule beats a populated cache: the cache stage is never consulted.
  const plainFixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(plainFixture);
  const seeded = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();
  const seedModel = new ScriptedModel([finalResponse('approve', { via: 'cache' })]);
  const seedTurn = expectAdmitted(await plainFixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: seeded, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(seedModel),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn: { kind: 'message', sourceMessageId: 'msg:2-seed' },
  })));
  assert.equal(seedTurn.resolver.source, 'harness-machine');
  assert.equal(seedModel.calls, 1, 'seed: resolution fell through rule/cache to the Harness fallback');
  assert.equal(seeded.size, 1);

  const ruleBeatsCache = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });
  const harnessA = resolverFixture();
  const outcomeA = expectAdmitted(await plainFixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: ruleBeatsCache,
    resolver: { cacheStore: seeded, harnessRunner: harnessA.runner },
    harness: harnessMaterial(harnessA.model),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn: { kind: 'message', sourceMessageId: 'msg:2-rule' },
  })));
  assert.equal(outcomeA.resolver.source, 'rule');
  assert.equal(outcomeA.resolver.cacheRead, 'disabled', 'a rule match never consults the cache stage');
  assert.equal(harnessA.model.calls, 0, 'a rule match never reaches the Harness fallback');

  // (b) cache beats promoted: cache hit ends resolution before the promoted stage.
  const declaration = await quoteDecisionDescriptor({
    promotedReference: { kind: 'version', artifactId: 'subworkflow:quote-review', version: '1.0.0' },
  });
  const fixture = await integrationFixture([declaration]);
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
  const promotedPorts: DecisionResolverPromotedPorts = {
    runtime: promoted.runtime,
    artifactPort: promoted.port,
    revocation: { readRevocation: (artifact) => promoted.registry.readRevocation(artifact) },
  };
  const promotedMaterial: RuntimePromotedDecisionTurnMaterial = {
    executor: { async executeQuery() { return { quote: quoteResult('approve', { amount: 42 }), price: 42 }; } },
    journal: new VolatileHarnessExecutionJournalStore(),
  };
  const cache = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();

  // Seed the exact cache through the promoted stage: the promoted result is the
  // cache producer, so the pre-read dependencies prebind its exact identity.
  const promotedBody = promoted.body as unknown as { identity: CompiledArtifactIdentity };
  const seedDependencies = { artifacts: [HARNESS_PRODUCER, promotedBody.identity] };
  const promotedSeedModel = new ScriptedModel([]);
  const seedB = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, promoted: promotedPorts, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(promotedSeedModel),
    promoted: promotedMaterial,
    dependencies: seedDependencies,
    invokingArtifacts: [...allAvailableArtifacts()],
    applicabilityFacts: [ref('knowledge', 'ctx:b2b-quote')],
    turn: { kind: 'message', sourceMessageId: 'msg:2-promoted-seed' },
  })));
  assert.equal(seedB.resolver.source, 'promoted-subworkflow');
  assert.equal(promotedSeedModel.calls, 0);
  assert.equal(cache.size, 1, 'the promoted result was cached through the existing two-phase eligibility');

  const cacheBeatsPromotedModel = new ScriptedModel([]);
  const outcomeB = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: {
      cacheStore: cache,
      promoted: promotedPorts,
      harnessRunner: makeFixture().runner,
    },
    harness: harnessMaterial(cacheBeatsPromotedModel),
    promoted: promotedMaterial,
    dependencies: seedDependencies,
    invokingArtifacts: [...allAvailableArtifacts()],
    applicabilityFacts: [ref('knowledge', 'ctx:b2b-quote')],
    turn: { kind: 'message', sourceMessageId: 'msg:2-cache' },
  })));
  assert.equal(outcomeB.resolver.source, 'exact-cache');
  assert.equal(cacheBeatsPromotedModel.calls, 0, 'a cache hit never reaches the Harness fallback');

  // (c) promoted beats harness: rule no-match, cache miss → promoted executes, model untouched.
  const promotedBeatsHarnessModel = new ScriptedModel([]);
  const outcomeC = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: {
      promoted: promotedPorts,
      harnessRunner: makeFixture().runner,
    },
    harness: harnessMaterial(promotedBeatsHarnessModel),
    promoted: promotedMaterial,
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    invokingArtifacts: [...allAvailableArtifacts()],
    applicabilityFacts: [ref('knowledge', 'ctx:b2b-quote')],
    turn: { kind: 'message', sourceMessageId: 'msg:2-promoted' },
  })));
  assert.equal(outcomeC.resolver.source, 'promoted-subworkflow');
  assert.equal(outcomeC.resolver.freshModelCallCount, 0);
  assert.equal(promotedBeatsHarnessModel.calls, 0, 'a promoted result never reaches the Harness fallback');
});

/* ------------------------------------------------------------------------ */
/* 3 — rule result flows through the single Central Admission path           */
/* ------------------------------------------------------------------------ */

test('T004 3: a rule result is data only until Central Admission admits it — effects run through the durable effect authority', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });

  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule })));
  assert.equal(admitted.transitionKey, 'approve');
  assert.equal(admitted.targetState, 'approved');
  assert.equal(fixture.tools.calls.length, 1, 'the transition effect intent executed exactly once');
  assert.equal(fixture.journal.getRecords().length, 1, 'the effect is journaled by the existing admission journal');
  assert.equal(fixture.journal.getRecords()[0]!.durableControlTurnId, admitted.durableControlTurnId);
});

/* ------------------------------------------------------------------------ */
/* 4 — exact-cache hit flows through the same path, never bypassing guards   */
/* ------------------------------------------------------------------------ */

test('T004 4: an exact-cache hit takes the same Central Admission path and never bypasses guard/hard-invariant authority', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const cache = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();

  // Seed the exact cache through a full Harness fallback turn.
  const seedModel = new ScriptedModel([finalResponse('approve', { via: 'cache' })]);
  const seedTurn = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(seedModel),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn: { kind: 'message', sourceMessageId: 'msg:4-seed' },
  })));
  assert.equal(seedTurn.resolver.source, 'harness-machine');
  assert.equal(cache.size, 1);

  // Replay the same input: cache hit, and the cached result is still only data —
  // a hard-invariant-violating turn context denies admission exactly as for a
  // fresh result.
  const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(new ScriptedModel([])),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    event: quoteEvent(5000),
    turn: { kind: 'message', sourceMessageId: 'msg:4-denied' },
  })));
  assert.equal(denied.reason, 'hard-invariant', 'a cache hit does not bypass the pinned hard invariants');
  assert.equal(denied.resolver.source, 'exact-cache');

  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(new ScriptedModel([])),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn: { kind: 'message', sourceMessageId: 'msg:4-hit' },
  })));
  assert.equal(admitted.resolver.source, 'exact-cache');
  assert.equal(fixture.tools.calls.length, 2, 'admission (not the cache) owns effect execution');
});

/* ------------------------------------------------------------------------ */
/* 5 — promoted subworkflow flows through the same path                      */
/* ------------------------------------------------------------------------ */

test('T004 5: a promoted subworkflow result takes the same admission path; child output/effect intents never become parent mutation authority', async () => {
  const declaration = await quoteDecisionDescriptor({
    promotedReference: { kind: 'version', artifactId: 'subworkflow:quote-review', version: '1.0.0' },
  });
  const fixture = await integrationFixture([declaration]);
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
  // Parent mutation authority is unchanged: exactly the declared transition
  // effect intent ran through the existing durable effect authority — the
  // child's emitted events/effect intents never become parent effects.
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.tools.calls[0]!.binding.effectType, 'effect:reserve');
  assert.equal(fixture.journal.getRecords().length, 1);
});

/* ------------------------------------------------------------------------ */
/* 6 — HarnessMachine flows through the same path; model output is proposal  */
/* ------------------------------------------------------------------------ */

test('T004 6: a HarnessMachine result is proposal data — the same admission path admits it, and model reasoning never publishes state directly', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const harness = resolverFixture();

  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { harnessRunner: harness.runner },
    harness: harnessMaterial(harness.model),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
  })));
  assert.equal(admitted.resolver.source, 'harness-machine');
  assert.equal(admitted.resolver.freshModelCallCount, 1);
  assert.equal(admitted.resolver.llmAvoided, false);
  assert.equal(harness.model.calls, 1);
  // The model-proposed result became state only through the existing admission
  // path: the declared transition effect executed through the journal.
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
});

/* ------------------------------------------------------------------------ */
/* 7 — guard/hard-invariant rejection is final (no fallback/retry/bypass)    */
/* ------------------------------------------------------------------------ */

test('T004 7: a hard-invariant rejection after a successful resolution is final — no resolver fallback, no retry, no alternate mutation path', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });

  const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule,
    resolver: { harnessRunner: resolverFixture().runner },
    harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'harness' })])),
    event: quoteEvent(5000),
  })));
  assert.equal(denied.reason, 'hard-invariant');
  assert.equal(denied.resolver.source, 'rule', 'the denial carries the one resolver result; no later source ran');
  assert.equal(rule.calls, 1, 'the resolver ran exactly once');
  assert.equal(fixture.tools.calls.length, 0, 'no effect execution after denial');
  assert.equal(fixture.journal.getRecords().length, 0, 'no journal mutation after denial');
});

test('T004 7b: a guard rejection after a HarnessMachine resolution is final — the model is never re-invoked', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const harness = resolverFixture();

  const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { harnessRunner: harness.runner },
    harness: harnessMaterial(harness.model),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    definition: makeDefinition({
      approveGuardId: 'guard:tiny',
      omitReject: true,
      guards: [{
        guardId: 'guard:tiny',
        predicate: {
          op: 'lte',
          left: { source: 'event', path: ['payload', 'amount'] },
          right: { source: 'literal', value: 50 },
        },
      }],
    }),
    event: quoteEvent(80),
    turn: { kind: 'message', sourceMessageId: 'msg:7b-guard' },
  })));
  assert.equal(denied.reason, 'guard');
  assert.equal(denied.resolver.source, 'harness-machine');
  assert.equal(harness.model.calls, 1, 'no fallback/retry re-invoked the model after the denial');
  assert.equal(fixture.tools.calls.length, 0);
});

/* ------------------------------------------------------------------------ */
/* 8 — resolver schema/currentness failure fails closed before mutation      */
/* ------------------------------------------------------------------------ */

test('T004 8: a resolver result violating the declaration schema fails closed before any admission mutation', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const invalid = { decision: { outcome: 42 }, event: null } as unknown as QuoteDecisionResult;
  const rule = new CapturingRule({ status: 'match', result: invalid });

  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule,
      resolver: { harnessRunner: resolverFixture().runner },
      harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'harness' })])),
    })),
    (error: unknown) => error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_SCHEMA_VIOLATION',
  );
  assert.equal(fixture.tools.calls.length, 0, 'no effect execution after resolver failure');
  assert.equal(fixture.journal.getRecords().length, 0, 'no journal mutation after resolver failure');
});

/* ------------------------------------------------------------------------ */
/* 9 — identity handoff between resolver invocation and admission            */
/* ------------------------------------------------------------------------ */

test('T004 9: decision identity, declaration digest, durable control-turn identity and pinned authority are carried consistently', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const rule = new CapturingRule({ status: 'no-match' });
  const harnessJournal = new VolatileHarnessExecutionJournalStore();
  const turn: ResolveAndAdmitTurnRequest['turn'] = { kind: 'message', sourceMessageId: 'msg:identity' };

  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule,
    resolver: { harnessRunner: makeFixture().runner },
    harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'harness' })]), harnessJournal),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn,
  })));

  const expectedTurnId = deriveDurableControlTurnId(target, turn);
  assert.equal(admitted.durableControlTurnId, expectedTurnId, 'admission derives the same durable turn identity');

  // Resolver-side invocation identity: rule input carries decision identity +
  // selected input (from the declared inputSelection) + exact pinned authority.
  assert.deepEqual(rule.inputs[0]!.decisionId, 'quote-decision');
  assert.deepEqual(rule.inputs[0]!.selectedInput, { sku: 'P-1', quantity: 3 });
  assert.equal(rule.inputs[0]!.invoking.packageId, fixture.packageId);
  assert.equal(rule.inputs[0]!.invoking.governanceBaseline.contentDigest, fixture.b1.identity.contentDigest);

  // Journaled Harness work inside the decision carries the same durable
  // control-turn identity the admission request derives.
  const records = harnessJournal.getRecords();
  assert.ok(records.length > 0);
  for (const record of records) {
    assert.equal(record.identity.slot.durableControlTurnId, expectedTurnId);
    assert.equal(record.identity.slot.target.workflowId, target.workflowId);
  }
});

test('T004 9b: journaled resolver work identity binds the exact declaration content identity', async () => {
  // Two identical turns under the SAME declaration produce identical journaled
  // operation semantic-contract digests; changing the declaration body (hence
  // its exact declarationDigest) changes the journaled digest — the resolver
  // work identity is consistently derived from the bound declaration.
  const digestOf = async (inputSelection: string): Promise<string[]> => {
    const fixture = await integrationFixture([await quoteDecisionDescriptor({ inputSelection })]);
    await pinInstance(fixture);
    const journal = new VolatileHarnessExecutionJournalStore();
    await fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: makeFixture().runner },
      harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'harness' })]), journal),
      dependencies: { artifacts: [HARNESS_PRODUCER] },
      turn: { kind: 'message', sourceMessageId: `msg:9b-${inputSelection.length}` },
    }));
    return journal.getRecords().map((record) => record.identity.semanticContractDigest);
  };

  const first = await digestOf('$.order');
  const second = await digestOf('$.order');
  assert.ok(first.length > 0);
  assert.deepEqual(second, first, 'same declaration → identical journaled work identity digests');

  const differentDeclaration = await digestOf('$.order.sku');
  assert.notDeepEqual(
    differentDeclaration,
    first,
    'a different declarationDigest changes the journaled work identity digests',
  );
});

/* ------------------------------------------------------------------------ */
/* 10 — one result-schema authority for resolver AND admission               */
/* ------------------------------------------------------------------------ */

test('T004 10: the T001 declaration result schema is the single authority — a result invalid per the declaration fails at the resolver, never as a separate admission schema verdict', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const outsideVocabulary = { decision: { outcome: 'maybe', data: {} }, event: { type: 'QUOTE_DECIDED' } } as unknown as QuoteDecisionResult;

  // 'maybe' is a string decision.outcome — any looser second schema would pass
  // it to admission; the declaration enum rejects it at the resolver boundary.
  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'match', result: outsideVocabulary }),
      resolver: { harnessRunner: resolverFixture().runner },
    })),
    (error: unknown) => error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_SCHEMA_VIOLATION',
  );
  assert.equal(fixture.tools.calls.length, 0);
  assert.equal(fixture.journal.getRecords().length, 0);

  // A declaration-valid result passes the same authority into admission and is
  // admitted (schema gate + guard + invariants all use the consistent material).
  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('reject', { via: 'rule' }) }),
  })));
  assert.equal(admitted.resolver.source, 'rule');
});

/* ------------------------------------------------------------------------ */
/* 11 — legacy/deterministic runtime paths unchanged                         */
/* ------------------------------------------------------------------------ */

test('T004 11: runtime paths without semantic-decision declarations are unchanged — admission works, resolver binding fails closed, legacy runtime still boots', async () => {
  const fixture = await integrationFixture([]);
  await pinInstance(fixture);

  // The existing admitTurn path on a declaration-less package is untouched.
  const admitted = expectAdmitted(await fixture.assembly.admitTurn({
    target,
    turn: { kind: 'message', sourceMessageId: 'msg:legacy' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId,
    definition: makeDefinition(),
    currentStateKey: 'review',
    context: {},
    event: quoteEvent(42),
    resolved: {
      source: 'rule',
      structuredDecision: quoteResult('approve', { via: 'caller' }),
      provenance: {},
      freshModelCallCount: 0,
      llmAvoided: true,
      cacheDisposition: { read: 'disabled' },
      telemetry: [],
    },
    decisionSchema: { isValid: (value: JsonValue): boolean => typeof value === 'object' && value !== null },
    now: NOW,
  }));
  assert.equal(admitted.resolver.source, 'rule');

  // The new seam never invents a binding: no declarations → fail closed.
  await expectV3Failure(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule: new CapturingRule({ status: 'no-match' }) })),
    'RUNTIME_V3_DECISION_BINDING_UNRESOLVED',
  );

  // The legacy (v0.2 processing path) runtime boots unchanged against a
  // retained ('0.2',2,2) package without any semantic-decision material.
  const legacyManifest: Record<string, unknown> = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'orders',
    domainVersion: '0.2.0-legacy-t004',
    packageId: 'pending',
    targetProfileId: 'legacy@1',
    requiredCapabilities: [CAPS.hash, CAPS.random, CAPS.expression],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  const legacyTyped = {
    manifest: legacyManifest,
    bindings: {},
  } as unknown as TargetCompiledDomainPackage;
  (legacyTyped.manifest as { packageId: string }).packageId = await computeCompiledPackageId(
    legacyTyped.manifest as unknown as Parameters<typeof computeCompiledPackageId>[0],
    sha256,
  );
  const legacyRuntime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry([legacyTyped], legacyTyped.manifest.packageId),
    store: new MemoryRuntimeStore(),
    bindings: createRuntimeHostFake({ sha256 }),
  });
  assert.equal(typeof legacyRuntime.send, 'function');
  assert.equal(typeof legacyRuntime.openInstance, 'function');
});

/* ------------------------------------------------------------------------ */
/* 12 — ResolvedDecision telemetry reaches Admission resolver evidence       */
/* ------------------------------------------------------------------------ */

test('T004 12: resolver telemetry (source, freshModelCallCount, llmAvoided, cache disposition) reaches the existing Admission resolver evidence', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const cache = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();

  const seedTurn = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'cache' })])),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
  })));
  assert.deepEqual(
    { ...seedTurn.resolver, telemetryEventCount: seedTurn.resolver.telemetryEventCount },
    {
      source: 'harness-machine',
      llmAvoided: false,
      freshModelCallCount: 1,
      cacheRead: 'miss',
      cacheWrite: 'inserted',
      telemetryEventCount: seedTurn.resolver.telemetryEventCount,
    },
  );

  const hitTurn = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(new ScriptedModel([])),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
  })));
  assert.equal(hitTurn.resolver.source, 'exact-cache');
  assert.equal(hitTurn.resolver.cacheRead, 'hit');
  assert.equal(hitTurn.resolver.llmAvoided, true);
  assert.equal(hitTurn.resolver.freshModelCallCount, 0);
});

/* ------------------------------------------------------------------------ */
/* 13 — missing/unknown/incompatible binding material fails closed           */
/* ------------------------------------------------------------------------ */

test('T004 13: incompatible declaration/runtime binding material fails closed with stable diagnosable errors', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);

  // (a) declared inputSelection fails over the presented context.
  await expectV3Failure(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      context: {},
      rule: new CapturingRule({ status: 'match', result: quoteResult('approve', {}) }),
    })),
    'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
  );

  // (b) declared promoted reference without supplied promoted material.
  const promotedDeclaration = await quoteDecisionDescriptor({
    promotedReference: { kind: 'alias', artifactId: 'subworkflow:quote-review', alias: 'stable' },
  });
  const promotedFixture2 = await integrationFixture([promotedDeclaration]);
  await pinInstance(promotedFixture2);
  await expectV3Failure(
    () => promotedFixture2.assembly.resolveAndAdmitTurn(turnRequest({ rule: new CapturingRule({ status: 'no-match' }) })),
    'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
  );

  // (c) a capability binding outside the declaration's query-only identities.
  const rogueModel = new ScriptedModel([]);
  await expectV3Failure(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: makeFixture().runner },
      harness: {
        input: {
          domainFacts: {},
          compiledIntelligence: {},
          workflowContext: {},
          capabilities: [{ capabilityId: 'effects.mutate', description: 'rogue', kind: 'mutation', execute: async () => ({}) }],
          model: rogueModel,
        },
        journal: new VolatileHarnessExecutionJournalStore(),
        harnessProducerIdentity: HARNESS_PRODUCER,
      },
    })),
    'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
  );
  assert.equal(rogueModel.calls, 0, 'fail closed happens before any model work');
});

test('T004 13b: declared dependency/currentness material is bound through the existing semantic-cache authority', async () => {
  // (d) a declared required projection without prebound projection material
    // fails closed through the EXISTING semantic-cache contract authority.
  const projectionDeclaration = await quoteDecisionDescriptor({
    dependencyMaterial: { requiredProjectionIds: ['quote.view'], requiredRevisionSourceIds: [] },
  });
  const projectionFixture = await integrationFixture([projectionDeclaration]);
  await pinInstance(projectionFixture);
  await assert.rejects(
    () => projectionFixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: resolverFixture().runner },
      harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'harness' })])),
    })),
    (error: unknown) => error instanceof Error && error.name === 'SemanticCacheContractError',
  );

  // (e) a declared revision source without a pre-read revision keeps the
  // existing deterministic currentness semantics: cache bypass, not silence.
  const revisionDeclaration = await quoteDecisionDescriptor({
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: ['quotes.source'] },
  });
  const revisionFixture = await integrationFixture([revisionDeclaration]);
  await pinInstance(revisionFixture);
  const model = new ScriptedModel([finalResponse('approve', { via: 'harness' })]);
  const admitted = expectAdmitted(await revisionFixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: new VolatileExactSemanticCacheStore<QuoteDecisionResult>(), harnessRunner: makeFixture().runner },
    harness: harnessMaterial(model),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
  })));
  assert.equal(admitted.resolver.source, 'harness-machine');
  assert.equal(admitted.resolver.cacheRead, 'bypass', 'declared-but-unprebound live revision deterministically bypasses the cache');
});

test('T004 13c: reaching the Harness stage without a runner surfaces the existing resolver failure', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      harness: harnessMaterial(new ScriptedModel([finalResponse('approve', {})])),
    })),
    (error: unknown) => error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_HARNESS_UNCONFIGURED',
  );
});

/* ------------------------------------------------------------------------ */
/* 14 — direct resolver semantics are unchanged behind the runtime seam      */
/* ------------------------------------------------------------------------ */

test('T004 14: the existing resolveDecision contract is reused unchanged — the runtime seam resolves through the very same exported function', async () => {
  const fixture = await integrationFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);

  // The runtime seam holds the ONE resolver call site: a rule result resolved
  // inside the seam admits identically, with exactly one rule evaluation.
  const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });
  const outcome = await fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule }));
  assert.equal(expectAdmitted(outcome).resolver.source, 'rule');
  assert.equal(rule.calls, 1);
});
