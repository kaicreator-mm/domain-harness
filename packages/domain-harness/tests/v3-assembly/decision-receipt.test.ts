// v0.6 T006 (issue #550, frozen L2 C4 / A4): stable public Decision
// Resolution Receipt projected through the EXISTING runtime return and the
// EXISTING Runtime Observation stream.
//
// Focused deterministic coverage of the 10 issue scenarios:
//  1. an admitted resolveAndAdmitTurn turn (each resolver source: Rule /
//     Exact Cache / Promoted / HarnessMachine — plus the T005
//     declared-unavailable carried event) yields a stable typed public
//     receipt with the A4 fields and the correct source category;
//  2. an admission-denied turn yields a stable receipt with the bounded
//     denial category and no invented success/truth;
//  3. a T005 semantic-unavailable terminal yields a receipt with the bounded
//     unavailable category;
//  4. a resolver-failure terminal yields a receipt with the bounded failure
//     class — never a fabricated success (and the pre-declaration binding
//     failure is documented receipt absence);
//  5. receipts are projected through the EXISTING durable ordered Runtime
//     Observation stream (cursor read semantics preserved); observation
//     recording failure does not strengthen business truth — the turn
//     outcome is unchanged and the failure surfaces through the existing
//     secondary-channel observer;
//  6. receipts contain no model chain-of-thought / raw payload fields and no
//     mutation/replay surface (type-level + runtime shape checks);
//  7. receipt identity correlates exactly: decisionId + declarationDigest +
//     durableControlTurnId match the admission/journal identity;
//  8. legacy admitTurn and non-semantic paths remain behaviorally unchanged
//     (receipt support is additive only);
//  9. receipt projection is portable (no Node built-ins; pure JSON-safe TS);
// 10. repeated/duplicate turn submissions produce receipts that do not
//     contradict A8/A9 durability semantics (no duplicate-decision or
//     revision bypass via receipts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonicalJsonStringify, computeCanonicalJsonDigest } from '../../src/contracts/identity.js';
import type { CompiledArtifactIdentity } from '../../src/contracts/domain-data.js';
import type { JsonObject, JsonValue } from '../../src/contracts/json.js';
import type {
  CommandOutcomeSnapshot,
  DurableProcessDataSnapshot,
  ProcessedCommandTurnCommit,
  RuntimeStoreProcessCommandExtension,
} from '../../src/contracts/process-command.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import {
  deriveDurableControlTurnId,
  VolatileAdmissionEffectJournal,
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
  type SemanticDecisionUnavailableDisposition,
} from '../../src/v2/index.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/index.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';
import {
  createDomainRuntimeV3,
  DomainRuntimeV3Error,
  type ResolvedTurnAdmissionOutcome,
} from '../../src/runtime/create-domain-runtime-v3.js';
import type {
  ResolveAndAdmitTurnRequest,
  RuntimeHarnessDecisionTurnMaterial,
  RuntimePromotedDecisionTurnMaterial,
} from '../../src/runtime/decision-resolver-binding.js';
import {
  assertValidDecisionResolutionReceipt,
  classifyDecisionResolverFailure,
  deriveDecisionResolutionReceipt,
  isDecisionReceiptObservationStore,
  RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  runtimeObservationStreamKey,
  runtimePackageIdentityFromManifest,
  RuntimeObservationError,
  type DecisionReceiptResolverFailureClass,
  type DecisionResolutionReceipt,
  type RuntimeObservationRecord,
  type RuntimeObservationStreamRef,
} from '../../src/observation/index.js';
import { InMemoryObservationStore } from '../observation/in-memory-observation-store.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';
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
  readonly cachePolicy?: SemanticDecisionCachePolicy;
  readonly promotedReference?: SemanticDecisionPromotedReference;
  readonly unavailable?: SemanticDecisionUnavailableDisposition;
}

async function quoteDecisionDescriptor(overrides: DecisionOverrides = {}): Promise<CompiledSemanticDecisionDescriptor> {
  const body = {
    decisionId: overrides.decisionId ?? 'quote-decision',
    inputSelection: overrides.inputSelection ?? '$.order',
    resultSchema: QUOTE_RESULT_SCHEMA,
    allowedOutcomes: ['approve', 'reject'],
    allowedEventTypes: ['QUOTE_DECIDED'],
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
    domainVersion: '0.6.0-t006',
    packageId: 'pending',
    targetProfileId: 't006-receipt@1',
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
/* Receipt-capable v3 assembly fixture                                       */
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

/**
 * The T006 fixture store: the portable in-memory RuntimeObservationStore
 * (reused verbatim, including its record append/read machinery) plus the
 * frozen T-009 process-command extension members the v3 assembly requires.
 */
class ReceiptAssemblyStore extends InMemoryObservationStore implements RuntimeStoreProcessCommandExtension {
  async getProcessData(_target: WorkflowAddress): Promise<DurableProcessDataSnapshot | null> {
    return null;
  }
  async getCommandOutcome(_target: WorkflowAddress, _messageId: string): Promise<CommandOutcomeSnapshot | null> {
    return null;
  }
  async commitProcessedCommandTurn(_commit: ProcessedCommandTurnCommit): Promise<void> {
    throw new Error('commitProcessedCommandTurn is outside the receipt fixture surface');
  }
}

interface ReceiptFixture {
  readonly assembly: Awaited<ReturnType<typeof createDomainRuntimeV3>>;
  readonly store: ReceiptAssemblyStore;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly tools: ScriptedEffectTools;
  readonly packageId: string;
  readonly packageIdentity: ReturnType<typeof runtimePackageIdentityFromManifest>;
  readonly b1: GovernanceBaselineBody;
  readonly declaration: CompiledSemanticDecisionDescriptor;
  readonly receiptErrors: unknown[];
}

async function receiptFixture(
  decisions: readonly CompiledSemanticDecisionDescriptor[],
  overrides: { readonly observation?: boolean } = {},
): Promise<ReceiptFixture> {
  const b1 = await makeBaseline('B1', [CAP_INVARIANT]);
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const journal = new VolatileAdmissionEffectJournal();
  const tools = new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' });
  const compiledPackage = await successorPackage(decisions.length === 0 ? undefined : decisions);
  const expressionRuntime = new ExpressionRuntime();
  const store = new ReceiptAssemblyStore();
  const receiptErrors: unknown[] = [];
  const observation = overrides.observation === false ? undefined : { mode: 'enabled' as const };
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store,
    ...(observation === undefined ? {} : { observation }),
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
      evidence: new VolatileRuntimeEvidenceStore(),
      onEvidenceError: (error: unknown) => {
        receiptErrors.push(error);
      },
    },
  });
  return {
    assembly,
    store,
    journal,
    tools,
    packageId: compiledPackage.manifest.packageId,
    packageIdentity: runtimePackageIdentityFromManifest(compiledPackage.manifest),
    b1,
    declaration: decisions[0]!,
    receiptErrors,
  };
}

async function pinInstance(fixture: ReceiptFixture): Promise<void> {
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

function streamOf(fixture: ReceiptFixture): RuntimeObservationStreamRef {
  return {
    target,
    package: fixture.packageIdentity,
    epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  };
}

/** Read the full durable stream through the EXISTING cursor paging semantics. */
async function readAllRecords(fixture: ReceiptFixture): Promise<readonly RuntimeObservationRecord[]> {
  const records: RuntimeObservationRecord[] = [];
  let afterCursor: string | undefined;
  for (;;) {
    const page = await fixture.store.readObservations({
      stream: streamOf(fixture),
      ...(afterCursor === undefined ? {} : { afterCursor }),
      limit: 2,
    });
    records.push(...page.records);
    if (page.nextCursor === undefined) break;
    afterCursor = page.nextCursor;
  }
  return records;
}

async function readReceipts(fixture: ReceiptFixture): Promise<readonly DecisionResolutionReceipt[]> {
  const receipts: DecisionResolutionReceipt[] = [];
  for (const record of await readAllRecords(fixture)) {
    assert.equal(record.kind, 'DECISION_RECEIPT');
    assert.ok(record.decisionReceipt !== undefined, 'receipt records carry the decisionReceipt envelope field');
    receipts.push(record.decisionReceipt);
  }
  return receipts;
}

/* ------------------------------------------------------------------------ */
/* Turn builders (T004 fixture vocabulary)                                   */
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

function expectAdmitted(outcome: ResolvedTurnAdmissionOutcome): Extract<ResolvedTurnAdmissionOutcome, { status: 'admitted' }> {
  if (outcome.status !== 'admitted') assert.fail(`expected admitted outcome, got ${JSON.stringify(outcome)}`);
  return outcome;
}

function expectDenied(outcome: ResolvedTurnAdmissionOutcome): Extract<ResolvedTurnAdmissionOutcome, { status: 'denied' }> {
  if (outcome.status !== 'denied') assert.fail(`expected denied outcome, got ${JSON.stringify(outcome)}`);
  return outcome;
}

async function expectV3Failure(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof DomainRuntimeV3Error && error.code === code);
}

function resolverFixture() {
  const fixture = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', { via: 'harness' })]);
  return { ...fixture, model };
}

async function promotedPortsFor(fixture: ReceiptFixture): Promise<{
  readonly ports: DecisionResolverPromotedPorts;
  readonly material: RuntimePromotedDecisionTurnMaterial;
  readonly artifact: CompiledArtifactIdentity;
}> {
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
  return {
    ports: {
      runtime: promoted.runtime,
      artifactPort: promoted.port,
      revocation: { readRevocation: (artifact) => promoted.registry.readRevocation(artifact) },
    },
    material: {
      executor: { async executeQuery() { return { quote: quoteResult('approve', { amount: 42 }), price: 42 }; } },
      journal: new VolatileHarnessExecutionJournalStore(),
    },
    artifact: (promoted.body as unknown as { identity: CompiledArtifactIdentity }).identity,
  };
}

/* ------------------------------------------------------------------------ */
/* 1 — admitted receipts per resolver source carry the A4 fields             */
/* ------------------------------------------------------------------------ */

test('T006 1a: an admitted Rule turn yields a stable typed receipt with the A4 fields and the rule source category, durably projected', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const turn: ResolveAndAdmitTurnRequest['turn'] = { kind: 'message', sourceMessageId: 'msg:1a-rule' };
  const outcome = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn,
  })));
  const { receipt } = outcome;
  // A4 identity / correlation identity.
  assert.equal(receipt.decisionId, 'quote-decision');
  assert.equal(receipt.declarationDigest, fixture.declaration.declarationDigest);
  assert.equal(receipt.durableControlTurnId, deriveDurableControlTurnId(target, turn));
  assert.equal(receipt.durableControlTurnId, outcome.admitted.durableControlTurnId);
  // A4 outcome + source category + evidence facts.
  assert.equal(receipt.disposition, 'admitted');
  assert.equal(receipt.source, 'rule');
  assert.equal(receipt.freshModelCallCount, 0);
  assert.equal(receipt.llmAvoided, true);
  assert.equal(receipt.cacheRead, 'disabled');
  assert.equal(receipt.cacheWrite, 'skipped', 'an eligible-but-storeless cache policy reports its write disposition honestly');
  assert.equal(receipt.selectedArtifact, undefined);
  assert.equal(receipt.governanceBindingDigest, outcome.admitted.governanceBindingDigest);
  assert.equal(receipt.workflowTarget, target.workflowId);
  assert.equal(receipt.workflowInstanceId, workflowInstanceId);
  assert.equal(receipt.failure, undefined);
  // The typed public shape: the produced receipt IS the exported type.
  assertValidDecisionResolutionReceipt(receipt);
  const typed: DecisionResolutionReceipt = receipt;
  assert.equal(typed, receipt);
  // The receipt is durably projected through the EXISTING observation stream.
  const receipts = await readReceipts(fixture);
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0], receipt);
  assert.equal(fixture.tools.calls.length, 1, 'turn truth is unchanged: the effect ran exactly once');
});

test('T006 1b: an admitted Exact Cache turn yields the exact-cache source category with the cache/reuse disposition', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const cache = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();

  const seed = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'cache' })])),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn: { kind: 'message', sourceMessageId: 'msg:1b-seed' },
  })));
  assert.equal(seed.receipt.source, 'harness-machine');
  assert.equal(seed.receipt.freshModelCallCount, 1);
  assert.equal(seed.receipt.cacheRead, 'miss');
  assert.equal(seed.receipt.cacheWrite, 'inserted');

  const hit = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: makeFixture().runner },
    harness: harnessMaterial(new ScriptedModel([])),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn: { kind: 'message', sourceMessageId: 'msg:1b-hit' },
  })));
  assert.equal(hit.receipt.disposition, 'admitted');
  assert.equal(hit.receipt.source, 'exact-cache');
  assert.equal(hit.receipt.freshModelCallCount, 0);
  assert.equal(hit.receipt.llmAvoided, true);
  assert.equal(hit.receipt.cacheRead, 'hit');
  assert.equal(hit.receipt.cacheWrite, undefined, 'a cache reuse writes nothing');
  const receipts = await readReceipts(fixture);
  assert.equal(receipts.length, 2);
  assert.deepEqual(receipts[1], hit.receipt);
});

test('T006 1c: an admitted Promoted turn yields the promoted-subworkflow category with the selected promoted artifact identity', async () => {
  const declaration = await quoteDecisionDescriptor({
    promotedReference: { kind: 'version', artifactId: 'subworkflow:quote-review', version: '1.0.0' },
  });
  const fixture = await receiptFixture([declaration]);
  await pinInstance(fixture);
  const promoted = await promotedPortsFor(fixture);

  const outcome = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { promoted: promoted.ports },
    promoted: promoted.material,
    invokingArtifacts: [...allAvailableArtifacts()],
    applicabilityFacts: [ref('knowledge', 'ctx:b2b-quote')],
    turn: { kind: 'message', sourceMessageId: 'msg:1c-promoted' },
  })));
  const { receipt } = outcome;
  assert.equal(receipt.disposition, 'admitted');
  assert.equal(receipt.source, 'promoted-subworkflow');
  assert.equal(receipt.freshModelCallCount, 0);
  assert.equal(receipt.llmAvoided, true);
  assert.ok(receipt.selectedArtifact !== undefined, 'the selected promoted artifact identity is on the receipt');
  assert.deepEqual(
    receipt.selectedArtifact,
    { kind: promoted.artifact.kind, artifactId: promoted.artifact.artifactId, contentDigest: promoted.artifact.contentDigest },
  );
  const receipts = await readReceipts(fixture);
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0], receipt);
  // Identity-only projection: no child output/effect-intent payload leaks.
  assert.equal(JSON.stringify(receipt).includes('reserve'), false);
});

test('T006 1d: an admitted HarnessMachine turn yields the harness-machine category with fresh-model evidence', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const harness = resolverFixture();

  const outcome = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { harnessRunner: harness.runner },
    harness: harnessMaterial(harness.model),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn: { kind: 'message', sourceMessageId: 'msg:1d-harness' },
  })));
  const { receipt } = outcome;
  assert.equal(receipt.disposition, 'admitted');
  assert.equal(receipt.source, 'harness-machine');
  assert.equal(receipt.freshModelCallCount, 1);
  assert.equal(receipt.llmAvoided, false);
  assert.equal(harness.model.calls, 1);
  const receipts = await readReceipts(fixture);
  assert.deepEqual(receipts, [receipt]);
});

test('T006 1e: an admitted declared-unavailable event (T005 declared-event) yields its own source category with zero model calls', async () => {
  const declaration = await quoteDecisionDescriptor({
    unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'approve' },
  });
  const fixture = await receiptFixture([declaration]);
  await pinInstance(fixture);

  const outcome = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    turn: { kind: 'message', sourceMessageId: 'msg:1e-declared' },
  })));
  const { receipt } = outcome;
  assert.equal(receipt.disposition, 'admitted');
  assert.equal(receipt.source, 'declared-unavailable');
  assert.equal(receipt.freshModelCallCount, 0);
  assert.equal(receipt.llmAvoided, true);
  assert.equal(receipt.cacheRead, 'disabled');
  const receipts = await readReceipts(fixture);
  assert.deepEqual(receipts, [receipt]);
});

/* ------------------------------------------------------------------------ */
/* 2 — denial receipts carry the bounded denial category, never success      */
/* ------------------------------------------------------------------------ */

test('T006 2: an admission-denied turn yields a stable receipt with the bounded denial category and no invented success/truth', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);

  const outcome = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    event: quoteEvent(5000),
    turn: { kind: 'message', sourceMessageId: 'msg:2-denied' },
  })));
  const { receipt } = outcome;
  assert.equal(receipt.disposition, 'denied');
  assert.equal(receipt.source, 'rule');
  assert.deepEqual(receipt.failure, {
    kind: 'admission-denied',
    reason: 'hard-invariant',
    invariantId: 'inv:cap-100',
  });
  assert.notEqual(receipt.disposition, 'admitted', 'a denial never invents success');
  assert.equal(fixture.tools.calls.length, 0, 'no effect execution after denial');
  assert.equal(fixture.journal.getRecords().length, 0, 'no journal mutation after denial');
  const receipts = await readReceipts(fixture);
  assert.deepEqual(receipts, [receipt]);

  // A guard denial carries its guardId in the same bounded category.
  const guardDenied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
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
    turn: { kind: 'message', sourceMessageId: 'msg:2-guard' },
  })));
  assert.deepEqual(guardDenied.receipt.failure, {
    kind: 'admission-denied',
    reason: 'guard',
    guardId: 'guard:tiny',
    transitionKey: 'approve',
  });
});

/* ------------------------------------------------------------------------ */
/* 3 — T005 semantic-unavailable terminal yields its own receipt category    */
/* ------------------------------------------------------------------------ */

test('T006 3: the T005 semantic-unavailable terminal yields a receipt with the bounded unavailable category', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const turn: ResolveAndAdmitTurnRequest['turn'] = { kind: 'message', sourceMessageId: 'msg:3-unavailable' };

  await expectV3Failure(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      harness: harnessMaterial(new ScriptedModel([finalResponse('approve', {})])),
      turn,
    })),
    'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE',
  );
  const receipts = await readReceipts(fixture);
  assert.equal(receipts.length, 1, 'the unavailable terminal is observed by exactly one receipt');
  const receipt = receipts[0]!;
  assert.equal(receipt.disposition, 'semantic-unavailable');
  assert.deepEqual(receipt.failure, { kind: 'semantic-unavailable' });
  assert.equal(receipt.decisionId, 'quote-decision');
  assert.equal(receipt.declarationDigest, fixture.declaration.declarationDigest);
  assert.equal(receipt.durableControlTurnId, deriveDurableControlTurnId(target, turn));
  assert.equal(receipt.source, undefined, 'no resolution result reached admission, so no source category is invented');
  assert.equal(receipt.freshModelCallCount, undefined);
  // The typed terminal truth is unchanged: no effect, no journal record.
  assert.equal(fixture.tools.calls.length, 0);
  assert.equal(fixture.journal.getRecords().length, 0);
});

/* ------------------------------------------------------------------------ */
/* 4 — resolver-failure terminals yield bounded failure-class receipts       */
/* ------------------------------------------------------------------------ */

test('T006 4: a resolver-failure terminal yields a receipt with the bounded failure class — never a fabricated success', async () => {
  // (a) resolver schema violation after a rule result.
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const invalid = { decision: { outcome: 42 }, event: null } as unknown as QuoteDecisionResult;
  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'match', result: invalid }),
      resolver: { harnessRunner: resolverFixture().runner },
      turn: { kind: 'message', sourceMessageId: 'msg:4-schema' },
    })),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_SCHEMA_VIOLATION',
  );
  const schemaReceipts = await readReceipts(fixture);
  assert.equal(schemaReceipts.length, 1);
  assert.equal(schemaReceipts[0]!.disposition, 'resolver-failed');
  assert.deepEqual(schemaReceipts[0]!.failure, { kind: 'resolver-failure', failureClass: 'schema-violation' });
  assert.equal(fixture.tools.calls.length, 0);
  assert.equal(fixture.journal.getRecords().length, 0);

  // (b) post-declaration binding incompatibility.
  const incompatible = await receiptFixture([await quoteDecisionDescriptor({
    promotedReference: { kind: 'alias', artifactId: 'subworkflow:quote-review', alias: 'stable' },
  })]);
  await pinInstance(incompatible);
  await expectV3Failure(
    () => incompatible.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      turn: { kind: 'message', sourceMessageId: 'msg:4-binding' },
    })),
    'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
  );
  const bindingReceipts = await readReceipts(incompatible);
  assert.equal(bindingReceipts.length, 1);
  assert.deepEqual(bindingReceipts[0]!.failure, {
    kind: 'resolver-failure',
    failureClass: 'decision-binding-incompatible',
  });

  // (c) pre-declaration binding-unresolved failure: documented receipt
  // absence — no declaration identity exists to correlate, and the typed
  // fail-closed error is the surface.
  const unresolved = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(unresolved);
  await expectV3Failure(
    () => unresolved.assembly.resolveAndAdmitTurn(turnRequest({
      decisionId: 'no-such-decision',
      rule: new CapturingRule({ status: 'no-match' }),
      turn: { kind: 'message', sourceMessageId: 'msg:4-unresolved' },
    })),
    'RUNTIME_V3_DECISION_BINDING_UNRESOLVED',
  );
  assert.equal((await readReceipts(unresolved)).length, 0);

  // No failure receipt anywhere fabricates success.
  for (const receipt of [...schemaReceipts, ...bindingReceipts]) {
    assert.notEqual(receipt.disposition, 'admitted');
  }
});

/* ------------------------------------------------------------------------ */
/* 5 — projection rides the EXISTING durable stream; failures never rewrite  */
/*     truth                                                                 */
/* ------------------------------------------------------------------------ */

test('T006 5a: receipt records live in the existing durable ordered stream with contiguous sequences and working cursor paging', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  for (const messageId of ['msg:5a-1', 'msg:5a-2', 'msg:5a-3']) {
    expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
      turn: { kind: 'message', sourceMessageId: messageId },
    })));
  }
  const stream = streamOf(fixture);
  // Page one record at a time through the EXISTING cursor semantics.
  const page1 = await fixture.store.readObservations({ stream, limit: 1 });
  assert.equal(page1.records.length, 1);
  assert.equal(page1.records[0]!.kind, 'DECISION_RECEIPT');
  assert.equal(page1.records[0]!.sequence, 1);
  assert.ok(page1.nextCursor !== undefined);
  assert.equal(page1.gap, undefined);
  const page2 = await fixture.store.readObservations({ stream, afterCursor: page1.nextCursor, limit: 1 });
  assert.equal(page2.records[0]!.sequence, 2);
  const page3 = await fixture.store.readObservations({ stream, afterCursor: page2.nextCursor, limit: 1 });
  assert.equal(page3.records[0]!.sequence, 3);
  assert.equal(page3.highWatermark, 3);
  // A page that returned records always hands back the resume cursor; the
  // read after it is the explicit end-of-stream (empty, no cursor).
  assert.ok(page3.nextCursor !== undefined);
  const page4 = await fixture.store.readObservations({ stream, afterCursor: page3.nextCursor });
  assert.equal(page4.records.length, 0);
  assert.equal(page4.nextCursor, undefined);
  assert.equal(page4.highWatermark, 3);
  // Deterministic observation identity: exact stream key + exact sequence.
  assert.equal(page1.records[0]!.observationId, `${runtimeObservationStreamKey(stream)}#observation:1`);
  // The cursor from another stream never reads this one (substitution fails
  // closed with an explicit CURSOR_INVALID gap — unchanged semantics).
  const foreign = await fixture.store.readObservations({
    stream: { ...stream, epochId: '999' },
    afterCursor: page1.nextCursor,
  });
  assert.equal(foreign.records.length, 0);
  assert.equal(foreign.gap?.kind, 'CURSOR_INVALID');
});

test('T006 5b: observation recording failure never strengthens business truth — the turn outcome stands and the failure surfaces through the existing observer', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const turn: ResolveAndAdmitTurnRequest['turn'] = { kind: 'message', sourceMessageId: 'msg:5b' };

  fixture.store.failNextObservationAppend();
  const outcome = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn,
  })));
  // The admission outcome is UNCHANGED by the receipt failure.
  assert.equal(outcome.receipt.disposition, 'admitted');
  assert.equal(outcome.receipt.durableControlTurnId, deriveDurableControlTurnId(target, turn));
  assert.equal(fixture.tools.calls.length, 1, 'the effect still executed');
  assert.equal(fixture.journal.getRecords().length, 1, 'the effect is still journaled');
  // No new silent swallow: the projection error surfaced through the existing
  // secondary-channel observer semantics.
  assert.equal(fixture.receiptErrors.length, 1);
  assert.ok(fixture.receiptErrors[0] instanceof RuntimeObservationError);
  assert.equal((fixture.receiptErrors[0] as RuntimeObservationError).code, 'OBSERVATION_APPEND_FAILED');
  // The failed append left no durable trace — and allocated no sequence.
  assert.equal((await readReceipts(fixture)).length, 0);

  // The next receipt reuses the unwritten sequence: the stream stays contiguous.
  const second = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn: { kind: 'message', sourceMessageId: 'msg:5b-second' },
  })));
  const records = await readAllRecords(fixture);
  assert.equal(records.length, 1);
  assert.equal(records[0]!.sequence, 1, 'the failed append allocated no sequence');
  assert.deepEqual(records[0]!.decisionReceipt, second.receipt);
});

/* ------------------------------------------------------------------------ */
/* 6 — no chain-of-thought / payload / mutation-replay surface               */
/* ------------------------------------------------------------------------ */

test('T006 6: receipts expose a closed data-only shape — no model payloads, no chain-of-thought, no mutation/replay surface', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const outcome = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn: { kind: 'message', sourceMessageId: 'msg:6' },
  })));
  const receipt: DecisionResolutionReceipt = outcome.receipt;

  // Closed key allowlist: no payload/CoT/effect/mutation field can appear.
  const ALLOWED = new Set([
    'decisionId', 'declarationDigest', 'durableControlTurnId', 'disposition', 'source',
    'freshModelCallCount', 'llmAvoided', 'cacheRead', 'cacheWrite', 'selectedArtifact',
    'governanceBindingDigest', 'workflowTarget', 'workflowInstanceId', 'failure',
  ]);
  for (const key of Object.keys(receipt)) {
    assert.ok(ALLOWED.has(key), `receipt key "${key}" is inside the closed A4 allowlist`);
  }
  for (const forbidden of [
    'chainOfThought', 'reasoning', 'prompt', 'completion', 'messages', 'rawPayload', 'payload',
    'execute', 'apply', 'replay', 'commit', 'mutate', 'effects', 'output', 'then',
  ]) {
    assert.ok(!(forbidden in receipt), `receipt must not expose "${forbidden}"`);
  }
  // Data-only: JSON round-trip is lossless (no functions, no opaque handles).
  assert.deepEqual(JSON.parse(JSON.stringify(receipt)), receipt);
  // Canonical-JSON safe (portable pure data).
  assert.deepEqual(JSON.parse(canonicalJsonStringify(receipt as unknown as JsonValue)), receipt);
  // The validator accepts the produced receipt and rejects shape violations.
  assertValidDecisionResolutionReceipt(receipt);
  assert.throws(() => assertValidDecisionResolutionReceipt({ ...receipt, chainOfThought: 'secret' }), RuntimeObservationError);
  assert.throws(() => assertValidDecisionResolutionReceipt({ ...receipt, execute: () => undefined }), RuntimeObservationError);
  assert.throws(() => assertValidDecisionResolutionReceipt({ ...receipt, disposition: 'admitted-but-more' }), RuntimeObservationError);
  assert.throws(() => assertValidDecisionResolutionReceipt(null), RuntimeObservationError);
  // Unknown vocabulary cannot masquerade as failure categories.
  assert.throws(
    () => assertValidDecisionResolutionReceipt({
      ...receipt,
      disposition: 'denied',
      failure: { kind: 'admission-denied', reason: 'because' },
    }),
    RuntimeObservationError,
  );
  // The store-side capability is structural.
  assert.equal(isDecisionReceiptObservationStore(fixture.store), true);
  assert.equal(isDecisionReceiptObservationStore({}), false);
  // The durable record carries the identical bounded data.
  const receipts = await readReceipts(fixture);
  assert.deepEqual(receipts, [receipt]);
});

test('T006 6b: the failure-class mapping is bounded and total — unmapped errors stay honestly unknown', () => {
  const cases: readonly [unknown, DecisionReceiptResolverFailureClass][] = [
    [new DecisionResolverError('DECISION_RESOLVER_RULE_FAILED', 'x'), 'rule-failed'],
    [new DecisionResolverError('DECISION_RESOLVER_SCHEMA_VIOLATION', 'x'), 'schema-violation'],
    [new DecisionResolverError('DECISION_RESOLVER_PROMOTED_UNCONFIGURED', 'x'), 'promoted-unconfigured'],
    [new DecisionResolverError('DECISION_RESOLVER_PROMOTED_REVOKED_DENY', 'x'), 'promoted-revoked-deny'],
    [new DecisionResolverError('DECISION_RESOLVER_REVOCATION_RECORD_MISSING', 'x'), 'revocation-record-missing'],
    [new DecisionResolverError('DECISION_RESOLVER_HARNESS_UNCONFIGURED', 'x'), 'harness-unconfigured'],
    [new DecisionResolverError('DECISION_RESOLVER_HARNESS_FAILED', 'x'), 'harness-failed'],
    [new DomainRuntimeV3Error('RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE', 'x'), 'decision-binding-incompatible'],
    [new Error('plain'), 'unknown'],
    ['not-even-an-error', 'unknown'],
  ];
  for (const [error, expected] of cases) {
    assert.equal(classifyDecisionResolverFailure(error), expected);
  }
  // Derivation from a terminal produces the correlated identity verbatim.
  const receipt = deriveDecisionResolutionReceipt({
    decisionId: 'd',
    declarationDigest: 'digest',
    durableControlTurnId: 'turn',
    target,
    workflowInstanceId,
  }, { kind: 'resolver-failed', error: new Error('plain') });
  assert.deepEqual(receipt, {
    decisionId: 'd',
    declarationDigest: 'digest',
    durableControlTurnId: 'turn',
    disposition: 'resolver-failed',
    workflowTarget: target.workflowId,
    workflowInstanceId,
    failure: { kind: 'resolver-failure', failureClass: 'unknown' },
  });
});

/* ------------------------------------------------------------------------ */
/* 7 — identity correlates exactly with admission/journal identity           */
/* ------------------------------------------------------------------------ */

test('T006 7: receipt identity correlates exactly with the admission and journal identity for the same turn', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const harnessJournal = new VolatileHarnessExecutionJournalStore();
  const turn: ResolveAndAdmitTurnRequest['turn'] = { kind: 'message', sourceMessageId: 'msg:7-identity' };

  const outcome = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { harnessRunner: makeFixture().runner },
    harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'harness' })]), harnessJournal),
    dependencies: { artifacts: [HARNESS_PRODUCER] },
    turn,
  })));
  const expectedTurnId = deriveDurableControlTurnId(target, turn);
  assert.equal(outcome.receipt.durableControlTurnId, expectedTurnId);
  assert.equal(outcome.admitted.durableControlTurnId, expectedTurnId);
  assert.equal(outcome.receipt.declarationDigest, fixture.declaration.declarationDigest);
  assert.equal(outcome.receipt.decisionId, fixture.declaration.decisionId);
  // The journaled effect for the turn carries the SAME durable identity.
  const journalRecords = fixture.journal.getRecords();
  assert.equal(journalRecords.length, 1);
  assert.equal(journalRecords[0]!.durableControlTurnId, expectedTurnId);
  // The journaled harness work inside the decision carries the same durable
  // turn identity (the declaration content identity correlation is asserted
  // on the receipt above).
  for (const record of harnessJournal.getRecords()) {
    assert.equal(record.identity.slot.durableControlTurnId, expectedTurnId);
  }
  // The durable receipt record repeats the exact same identity triple.
  const [durable] = await readReceipts(fixture);
  assert.equal(durable!.durableControlTurnId, expectedTurnId);
  assert.equal(durable!.declarationDigest, outcome.receipt.declarationDigest);
  assert.equal(durable!.decisionId, outcome.receipt.decisionId);
});

/* ------------------------------------------------------------------------ */
/* 8 — legacy admitTurn / non-semantic paths unchanged                       */
/* ------------------------------------------------------------------------ */

test('T006 8: the legacy admitTurn path is behaviorally unchanged — no receipt field, no receipt records, additive-only surface', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);

  const outcome = await fixture.assembly.admitTurn({
    target,
    turn: { kind: 'message', sourceMessageId: 'msg:8-legacy' },
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
  });
  assert.equal(outcome.status, 'admitted');
  assert.equal('receipt' in outcome, false, 'the legacy return gains no receipt field');
  assert.equal((await readReceipts(fixture)).length, 0, 'legacy admission projects no receipt records');
  assert.equal(fixture.tools.calls.length, 1, 'legacy effect execution unchanged');
  assert.equal(fixture.receiptErrors.length, 0);

  // Non-semantic runtime path without the observation option: the receipt
  // still rides the resolveAndAdmitTurn RETURN (additive field), and no
  // stream projection is attempted.
  const plain = await receiptFixture([await quoteDecisionDescriptor()], { observation: false });
  await pinInstance(plain);
  const plainOutcome = expectAdmitted(await plain.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn: { kind: 'message', sourceMessageId: 'msg:8-plain' },
  })));
  assert.equal(plainOutcome.receipt.disposition, 'admitted');
  assert.equal(plainOutcome.receipt.source, 'rule');
  assert.equal((await plain.store.readObservations({ stream: streamOf(plain) })).highWatermark, 0);
});

/* ------------------------------------------------------------------------ */
/* 9 — portability                                                           */
/* ------------------------------------------------------------------------ */

test('T006 9: the receipt projection is portable — no Node built-ins, no host drivers, pure TypeScript data', async () => {
  const files = [
    new URL('../../src/observation/decision-receipt.ts', import.meta.url),
    new URL('../../src/observation/contracts.ts', import.meta.url),
    new URL('../../src/observation/index.ts', import.meta.url),
  ];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.equal(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]node:/u.test(text), false, `${file.pathname} must not import Node built-ins`);
    assert.equal(text.includes('better-sqlite3'), false, `${file.pathname} must not reach host drivers`);
    assert.equal(text.includes('expo-sqlite'), false, `${file.pathname} must not reach host drivers`);
    assert.equal(text.includes('xstate'), false, `${file.pathname} must not import XState`);
  }
});

/* ------------------------------------------------------------------------ */
/* 10 — duplicate submissions never contradict A8/A9 via receipts            */
/* ------------------------------------------------------------------------ */

test('T006 10: repeated/duplicate turn submissions produce receipts that do not contradict A8/A9 durability semantics', async () => {
  const fixture = await receiptFixture([await quoteDecisionDescriptor()]);
  await pinInstance(fixture);
  const turn: ResolveAndAdmitTurnRequest['turn'] = { kind: 'message', sourceMessageId: 'msg:10-dup' };

  const first = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn,
  })));
  assert.equal(first.admitted.effects[0]!.disposition, 'executed');

  // The exact same turn submission replays through the SAME admission path:
  // the durable effect authority returns the existing effect (idempotent
  // replay), and the second receipt records that terminal honestly.
  const second = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn,
  })));
  assert.equal(second.admitted.effects[0]!.disposition, 'replayed', 'A8/A9 idempotency is untouched by receipts');
  assert.equal(second.receipt.disposition, 'admitted');
  assert.equal(second.receipt.durableControlTurnId, first.receipt.durableControlTurnId, 'the deterministic turn identity is stable');

  // Receipts carry no effect fields at all — effect facts stay with the
  // existing journal/AdmittedEffectOutcome authority (no effect-completion
  // inference, no replay authority through receipts).
  for (const receipt of [first.receipt, second.receipt]) {
    assert.equal('effects' in receipt, false);
    assert.equal('effectCompletion' in receipt, false);
    assert.equal('replay' in receipt, false);
  }
  // Two durable receipt records exist — one per terminal — and neither
  // grants any authority: reading them back yields inert data only.
  const receipts = await readReceipts(fixture);
  assert.equal(receipts.length, 2);
  assert.deepEqual(receipts[0], first.receipt);
  assert.deepEqual(receipts[1], second.receipt);
  for (const record of await readAllRecords(fixture)) {
    for (const value of Object.values(record)) {
      assert.notEqual(typeof value, 'function', 'no receipt record value is executable');
    }
  }

  // A duplicate-shaped turn that violates the pinned hard invariants is
  // still denied — a receipt can never bypass admission authority.
  const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    event: quoteEvent(5000),
    turn: { kind: 'message', sourceMessageId: 'msg:10-violating' },
  })));
  assert.equal(denied.receipt.disposition, 'denied');
  assert.equal(
    fixture.tools.calls.length,
    1,
    'the replayed effect never re-executed the tool (A8/A9 idempotency), and the violating turn executed nothing',
  );
});
