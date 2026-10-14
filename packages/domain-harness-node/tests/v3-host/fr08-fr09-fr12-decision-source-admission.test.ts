import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { JsonValue } from '@kaicreator/domain-harness/v2';
import {
  DecisionResolverError,
  PromotedArtifactRegistry,
  PromotedChildRuntime,
  createRegistryPromotedChildArtifactPort,
  createXStateHarnessMachineRunner,
  dynamicChildSlotKey,
  resolveDecision,
  type DecisionResolverHarnessConfig,
  type DecisionResolverPorts,
  type PromotedArtifactBody,
  type PromotedArtifactProducerInvalidationPort,
  type ResolvedDecision,
} from '@kaicreator/domain-harness';
import {
  authority,
  makeEnvelope,
  ref,
  sha256,
  validationFor,
} from '../../../domain-harness/tests/promoted-child/helpers.js';
import {
  HARNESS_PRODUCER,
  ScriptedModel,
  ScriptedRule,
  assertJsonEqual,
  finalResponse,
  makeInvocation,
  quoteResult,
  type QuoteDecisionResult,
} from '../../../domain-harness/tests/decision-resolver/helpers.js';
import { makeRequest, quoteEvent } from '../../../domain-harness/tests/admission/helpers.js';
import { openHostFixture, pinInstance } from './host-fixture.js';
import { NodeSqliteDynamicChildPinStore, NodeSqlitePromotedArtifactStore } from '../../src/store/node-sqlite-promoted-stores.js';
import {
  NodeSqliteExactSemanticCacheStore,
  NodeSqliteHarnessExecutionJournalStore,
} from '../../src/store/node-sqlite-execution-stores.js';
import { openAuthorityTestDatabase } from '../store/authority-test-helpers.js';

/**
 * #1003 T-D seam (A) — decision-source admission closure for the retained
 * FR08 general / FR09 / FR12 frozen rows (L1 evidence rows: rule→exact
 * cache→promoted→bounded fallback; approved child pinned before effects;
 * no-fresh-LLM fast path), physically on the assembled Node Build Host.
 *
 * Gap determination at baseline v0.8@a1cffa2 (docs tip 5fad3ea):
 * MISSING_PN_ONLY. The frozen ordering, cache currentness, promoted
 * pin/revocation and fail-closed behaviors are fully implemented by the
 * selected sources (`decision-resolver/resolver.ts`,
 * `semantic-cache/exact-semantic-cache.ts`, `promoted-child/*`,
 * `promoted-artifact/registry.ts`) and their logic P/N is complete in-memory
 * (decision-resolver tests, promoted-child tests) plus physical store P/N
 * (t022-promoted-stack V11/V12). The unproved accepted observable is the
 * COMPOSITION: a resolver-selected candidate — rule, exact-cache hit,
 * approved pinned promoted child, bounded Harness fallback — admitted
 * through the very same K central admission over real SQLite, with truthful
 * resolver evidence in the durable decision records, and the stale/revoked
 * negatives failing closed before any K effect. This file adds exactly that
 * composition witness; it adds no production authority, no second admission
 * path, and no new cache/promotion framework. t022-assembled-runtime V7/V10
 * admit hand-constructed resolved decisions only; t022-promoted-stack V12
 * resolves without K admission. Rule-plane zero-ModelPort admission through
 * the sealed v0.8 K/S path is separately witnessed by fr08-sd-nf05-physical
 * (#1051) and is not repeated here.
 */

const NOW = '2026-09-21T12:00:00.000Z';
const ARTIFACT_ID = 'subworkflow:quote-review';
const RULE_PRODUCER = ref('rule', 'rule:quote-rules', 'digest-rule:quote-rules:v1');

interface DecisionSourceStack {
  readonly registry: PromotedArtifactRegistry;
  readonly runtime: PromotedChildRuntime;
  readonly port: ReturnType<typeof createRegistryPromotedChildArtifactPort>;
  readonly pins: NodeSqliteDynamicChildPinStore;
  readonly cache: NodeSqliteExactSemanticCacheStore<QuoteDecisionResult>;
  readonly journal: NodeSqliteHarnessExecutionJournalStore;
  close(): void;
}

function tempDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `domain-harness-fr0812-${label}-`));
}

function openDecisionSourceStack(
  path: string,
  producerInvalidation?: PromotedArtifactProducerInvalidationPort,
): DecisionSourceStack {
  const { db, close } = openAuthorityTestDatabase(path);
  const promotedStore = new NodeSqlitePromotedArtifactStore(db);
  const pins = new NodeSqliteDynamicChildPinStore(db);
  const cache = new NodeSqliteExactSemanticCacheStore<QuoteDecisionResult>(db);
  const journal = new NodeSqliteHarnessExecutionJournalStore(db);
  const registry = new PromotedArtifactRegistry(
    promotedStore,
    sha256,
    ...(producerInvalidation === undefined ? [] : [producerInvalidation]),
  );
  const port = createRegistryPromotedChildArtifactPort(registry);
  const runtime = new PromotedChildRuntime(port, pins, sha256);
  let closed = false;
  return {
    registry,
    runtime,
    port,
    pins,
    cache,
    journal,
    close() {
      if (closed) return;
      closed = true;
      close();
    },
  };
}

async function promote(
  registry: PromotedArtifactRegistry,
  version: string,
  marker: string,
): Promise<PromotedArtifactBody> {
  const material = makeEnvelope({ events: ['QUOTE_PREPARED', `QUOTE_REVIEWED:${marker}`] });
  const targetAuthority = authority();
  const result = await registry.promote({
    artifactId: ARTIFACT_ID,
    version,
    validation: await validationFor(targetAuthority, material),
    authorityBinding: targetAuthority,
    semanticMaterial: material,
    promotion: {
      recordId: `promotion:${ARTIFACT_ID}:${version}`,
      authorityRef: `audit://promotion/${version}`,
      recordedAt: NOW,
    },
  });
  return result.body;
}

function promotedExecutor(calls: { count: number }) {
  return {
    async executeQuery(): Promise<JsonValue> {
      calls.count += 1;
      return { quote: quoteResult('approve', { amount: 42 }), price: 42 };
    },
  };
}

function harnessConfig(
  model: ScriptedModel,
  journal: NodeSqliteHarnessExecutionJournalStore,
): DecisionResolverHarnessConfig {
  return {
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
    journal,
    harnessProducerIdentity: HARNESS_PRODUCER,
  };
}

function decisionPorts(
  stack: DecisionSourceStack,
  rule: ScriptedRule,
): DecisionResolverPorts<QuoteDecisionResult> {
  return {
    rule,
    cacheStore: stack.cache,
    harnessRunner: createXStateHarnessMachineRunner(),
    promoted: {
      runtime: stack.runtime,
      artifactPort: stack.port,
      revocation: {
        readRevocation: (artifact: PromotedArtifactBody['identity']) =>
          stack.registry.readRevocation(artifact),
      },
    },
  };
}

/** Widen the resolver's typed result to the admission request's JsonValue plane. */
function asAdmissionResolved(resolved: ResolvedDecision<QuoteDecisionResult>): ResolvedDecision<JsonValue> {
  return { ...resolved, structuredDecision: resolved.structuredDecision as JsonValue };
}

function decisionEvidenceRecords(fixture: Awaited<ReturnType<typeof openHostFixture>>) {
  return fixture.authorities.evidence.records().filter((record) => record.sourceKind === 'decision');
}

/**
 * Durable resolver-source truth per durable control turn. The evidence store
 * returns records keyed/sorted by evidenceId, so assertions address turns by
 * their exact durableControlTurnId instead of relying on row order.
 */
function resolverSourceByTurn(fixture: Awaited<ReturnType<typeof openHostFixture>>): Map<string, string> {
  const byTurn = new Map<string, string>();
  for (const record of decisionEvidenceRecords(fixture)) {
    const turn = record.provenance.sourceExecution?.durableControlTurnId;
    const source = (record.payload as Record<string, JsonValue> | undefined)?.resolver;
    if (turn !== undefined && typeof source === 'string') byTurn.set(turn, source);
  }
  return byTurn;
}

function resolverSourceOf(
  fixture: Awaited<ReturnType<typeof openHostFixture>>,
  messageId: string,
): string {
  // durableControlTurnId components are URL-encoded (deriveDurableControlTurnId).
  const encodedSuffix = `:${encodeURIComponent(messageId)}`;
  const entry = [...resolverSourceByTurn(fixture).entries()].find(([turn]) => turn.endsWith(encodedSuffix));
  if (entry === undefined) assert.fail(`expected a decision record for ${messageId}`);
  return entry[1];
}

test('FR08-P/FR09-P/FR12-P: rule→exact-cache→promoted→bounded harness each admitted by K central admission over SQLite', async (t) => {
  const directory = tempDir('ordering');
  const stack = openDecisionSourceStack(join(directory, 'resolver.sqlite'));
  const fixture = await openHostFixture(join(directory, 'host.sqlite'));
  t.after(() => {
    stack.close();
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await pinInstance(fixture);

  const body = await promote(stack.registry, '1.0.0', 'quote');
  const executorCalls = { count: 0 };
  const model = new ScriptedModel([finalResponse('approve', { fallback: true })]);
  const ruleMatch = new ScriptedRule(
    { status: 'match', result: quoteResult('approve', { amount: 42 }) },
    RULE_PRODUCER,
  );
  const ruleMiss = new ScriptedRule({ status: 'no-match' }, RULE_PRODUCER);
  const dependencies = { artifacts: [HARNESS_PRODUCER, RULE_PRODUCER] };
  const promotedConfig = {
    selector: { kind: 'exact-digest' as const, artifact: body.identity },
    executor: promotedExecutor(executorCalls),
    journal: stack.journal,
  };

  /* ------------------ 1. deterministic rule source (FR12-P) -------------- */
  const ruleTurn = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:fr0812:1', dependencies, promoted: promotedConfig }),
    decisionPorts(stack, ruleMatch),
    sha256,
  );
  assert.equal(ruleTurn.source, 'rule');
  assert.equal(ruleTurn.freshModelCallCount, 0);
  assert.equal(ruleTurn.llmAvoided, true);
  assert.equal(ruleTurn.cacheDisposition.write, 'inserted');

  const first = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(ruleTurn),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:1' },
    }),
  );
  if (first.status !== 'admitted') assert.fail('expected rule-sourced turn admitted');
  assert.deepEqual(
    first.admitted.resolver,
    {
      source: 'rule',
      llmAvoided: true,
      freshModelCallCount: 0,
      cacheRead: 'disabled',
      cacheWrite: 'inserted',
      telemetryEventCount: 0,
    },
    'K resolver evidence records the deterministic rule truthfully',
  );
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(model.calls, 0);

  /* ------------------ 2. exact-cache reuse (FR08-P/FR12-P) --------------- */
  const cacheTurn = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:fr0812:2', dependencies, promoted: promotedConfig }),
    decisionPorts(stack, ruleMiss),
    sha256,
  );
  assert.equal(cacheTurn.source, 'exact-cache');
  assert.equal(cacheTurn.cacheDisposition.read, 'hit');
  assert.equal(cacheTurn.freshModelCallCount, 0);
  assert.equal(cacheTurn.llmAvoided, true);
  assert.equal(model.calls, 0, 'a cache hit never consults a model');
  assert.equal(executorCalls.count, 0, 'a cache hit never re-runs the child');

  const second = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(cacheTurn),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:2' },
    }),
  );
  if (second.status !== 'admitted') assert.fail('expected exact-cache-sourced turn admitted');
  assert.equal(second.admitted.resolver.source, 'exact-cache');
  assert.equal(second.admitted.resolver.cacheRead, 'hit');
  assert.equal(second.admitted.resolver.freshModelCallCount, 0);
  assert.equal(fixture.tools.calls.length, 2, 'an admitted cache hit still runs its authorized K effects');

  /* --------------- 3. approved pinned promoted child (FR09-P) ------------ */
  const promotedTurn = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:fr0812:3',
      dependencies,
      selectedInput: { sku: 'P-1', quantity: 7 },
      promoted: promotedConfig,
    }),
    decisionPorts(stack, ruleMiss),
    sha256,
  );
  assert.equal(promotedTurn.source, 'promoted-subworkflow');
  assert.equal(promotedTurn.freshModelCallCount, 0);
  assert.equal(promotedTurn.llmAvoided, true);
  assert.equal(executorCalls.count, 1);
  if (promotedTurn.provenance.promoted === undefined) assert.fail('expected promoted provenance');
  assert.deepEqual(promotedTurn.provenance.promoted.artifact, body.identity);
  assert.equal(
    promotedTurn.provenance.promoted.pin.artifact.contentDigest,
    body.identity.contentDigest,
    'the child ran under the exact pinned approved digest',
  );
  const childJournal = stack.journal.getRecords();
  assert.ok(childJournal.length > 0, 'the promoted child journaled its work');
  assert.ok(
    childJournal.every(
      (record) => record.identity.promotedChildContentDigest === body.identity.contentDigest,
    ),
    'every journaled child operation carries the exact pinned child digest (no digest drift)',
  );
  const pinnedSlot = await stack.pins.get(
    dynamicChildSlotKey(promotedTurn.provenance.promoted.pin.slot),
  );
  assert.equal(
    pinnedSlot?.artifact.contentDigest,
    body.identity.contentDigest,
    'the durable SQLite pin matches the approved artifact',
  );

  const third = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(promotedTurn),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:3' },
    }),
  );
  if (third.status !== 'admitted') assert.fail('expected promoted-sourced turn admitted');
  assert.equal(third.admitted.resolver.source, 'promoted-subworkflow');
  const promotedEvidence = decisionEvidenceRecords(fixture).at(-1);
  if (promotedEvidence === undefined) assert.fail('expected a decision evidence record');
  assert.deepEqual(
    promotedEvidence.provenance.producerArtifact,
    { kind: body.identity.kind, artifactId: body.identity.artifactId, contentDigest: body.identity.contentDigest },
    'the durable decision record carries the approved producer artifact identity',
  );

  /* ------------- 4. bounded Harness fallback, truthful model count -------- */
  const harnessTurn = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:fr0812:4',
      dependencies,
      selectedInput: { sku: 'P-1', quantity: 9 },
      harness: harnessConfig(model, stack.journal),
    }),
    decisionPorts(stack, ruleMiss),
    sha256,
  );
  assert.equal(harnessTurn.source, 'harness-machine');
  assert.equal(harnessTurn.freshModelCallCount, 1);
  assert.equal(harnessTurn.llmAvoided, false);
  assert.equal(model.calls, 1);

  const fourth = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(harnessTurn),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:4' },
    }),
  );
  if (fourth.status !== 'admitted') assert.fail('expected harness-sourced turn admitted');
  assert.equal(fourth.admitted.resolver.source, 'harness-machine');
  assert.equal(fourth.admitted.resolver.freshModelCallCount, 1);

  /* ---------------- frozen ordering witness in the durable K record ------- */
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:1'), 'rule');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:2'), 'exact-cache');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:3'), 'promoted-subworkflow');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:4'), 'harness-machine');
  assert.equal(resolverSourceByTurn(fixture).size, 4, 'one durable decision record per admitted source');
  assert.equal(fixture.authorities.admissionEffectJournal.getRecords().length, 4);
});

test('FR08-N: a dependency-revision drift is a cache miss that recomputes fresh — a stale entry is never served or admitted', async (t) => {
  const directory = tempDir('stale');
  const stack = openDecisionSourceStack(join(directory, 'resolver.sqlite'));
  const fixture = await openHostFixture(join(directory, 'host.sqlite'));
  t.after(() => {
    stack.close();
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await pinInstance(fixture);

  const model = new ScriptedModel([finalResponse('approve', { policy: 'r2' })]);
  const turnARule = new ScriptedRule(
    { status: 'match', result: quoteResult('approve', { policy: 'r1' }) },
    RULE_PRODUCER,
  );
  const ruleMiss = new ScriptedRule({ status: 'no-match' }, RULE_PRODUCER);
  const depsAt = (revision: string) => ({
    artifacts: [HARNESS_PRODUCER, RULE_PRODUCER],
    revisions: [{ sourceId: 'price-list', revision }],
  });

  // Seed the exact cache under dependency revision r1 through the rule source.
  const turnA = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:fr0812:s1',
      dependencies: depsAt('r1'),
    }),
    decisionPorts(stack, turnARule),
    sha256,
  );
  assert.equal(turnA.source, 'rule');
  assert.equal(turnA.cacheDisposition.write, 'inserted');
  const admittedA = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(turnA),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:s1' },
    }),
  );
  if (admittedA.status !== 'admitted') assert.fail('expected revision-r1 turn admitted');

  // Control: with the revision unchanged, the next rule-miss turn is served
  // by the exact cache — the r1 entry is live for its exact dependency set.
  const controlTurn = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:fr0812:s0',
      dependencies: depsAt('r1'),
    }),
    decisionPorts(stack, ruleMiss),
    sha256,
  );
  assert.equal(controlTurn.source, 'exact-cache');
  assert.equal(controlTurn.cacheDisposition.read, 'hit');
  const admittedControl = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(controlTurn),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:s0' },
    }),
  );
  if (admittedControl.status !== 'admitted') assert.fail('expected control turn admitted');

  // Same selected input, but the behaviorally relevant dependency revision
  // moved: the exact cache key changes, so the r1 entry cannot serve and the
  // bounded fallback recomputes a fresh r2 result.
  const turnB = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:fr0812:s2',
      dependencies: depsAt('r2'),
      harness: harnessConfig(model, stack.journal),
    }),
    decisionPorts(stack, ruleMiss),
    sha256,
  );
  assert.equal(turnB.source, 'harness-machine');
  assert.equal(turnB.cacheDisposition.read, 'miss');
  assert.equal(turnB.cacheDisposition.reason, 'not-found');
  // Null-prototype payloads from the canonical-JSON plane need JSON equality.
  assertJsonEqual(
    (turnB.structuredDecision as QuoteDecisionResult).decision.data,
    { policy: 'r2' },
  );
  assert.equal(model.calls, 1);
  assert.equal(turnARule.calls, 1, 'the earlier producer was never re-consulted');

  const admittedB = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(turnB),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:s2' },
    }),
  );
  if (admittedB.status !== 'admitted') assert.fail('expected revision-r2 turn admitted');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:s1'), 'rule');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:s0'), 'exact-cache');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:s2'), 'harness-machine');
});

test('FR08/09/12-N: a revoked promoted artifact fails the decision closed before any K admission — zero effect/journal/evidence delta and no cache replay bypass', async (t) => {
  const directory = tempDir('revoked');
  const invalidated: string[] = [];
  const producerInvalidation: PromotedArtifactProducerInvalidationPort = {
    async invalidateProducedResults(artifact) {
      invalidated.push(`${artifact.artifactId}@${artifact.contentDigest}`);
      await stack.cache.invalidateByProducer(artifact, 'promoted-artifact-revocation');
    },
  };
  const stack = openDecisionSourceStack(join(directory, 'resolver.sqlite'), producerInvalidation);
  const fixture = await openHostFixture(join(directory, 'host.sqlite'));
  t.after(() => {
    stack.close();
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await pinInstance(fixture);

  const body = await promote(stack.registry, '1.0.0', 'quote');
  const executorCalls = { count: 0 };
  const ruleMiss = new ScriptedRule({ status: 'no-match' }, RULE_PRODUCER);
  const promotedConfig = {
    selector: { kind: 'exact-digest' as const, artifact: body.identity },
    executor: promotedExecutor(executorCalls),
    journal: stack.journal,
  };
  const freshPorts = () => decisionPorts(stack, ruleMiss);

  // First resolution runs the child and caches its result under the exact key.
  const first = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:fr0812:r1',
      dependencies: { artifacts: [HARNESS_PRODUCER, RULE_PRODUCER] },
      selectedInput: { sku: 'P-1', quantity: 7 },
      promoted: promotedConfig,
    }),
    freshPorts(),
    sha256,
  );
  assert.equal(first.source, 'promoted-subworkflow');
  const admittedFirst = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(first),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:r1' },
    }),
  );
  if (admittedFirst.status !== 'admitted') assert.fail('expected pre-revocation turn admitted');

  const journalBefore = fixture.authorities.admissionEffectJournal.getRecords().length;
  const effectsBefore = fixture.tools.calls.length;
  const evidenceBefore = decisionEvidenceRecords(fixture).length;

  await stack.registry.revoke(body.identity, {
    recordId: 'revocation:fr0812',
    authorityRef: 'audit://revocation/fr0812',
    recordedAt: NOW,
    reason: 'unsafe-output',
  });
  assert.deepEqual(invalidated, [`${ARTIFACT_ID}@${body.identity.contentDigest}`]);

  // The revoked artifact with revocationPolicy=deny fails the resolution
  // closed: the invalidated cache cannot replay the old child result and no
  // new child work starts, so no admission request can even exist.
  await assert.rejects(
    () =>
      makeInvocation({
        durableControlTurnId: 'turn:fr0812:r2',
        dependencies: { artifacts: [HARNESS_PRODUCER, RULE_PRODUCER] },
        selectedInput: { sku: 'P-1', quantity: 7 },
        promoted: promotedConfig,
      }).then((invocation) => resolveDecision(invocation, freshPorts(), sha256)),
    (error: unknown) =>
      error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_PROMOTED_REVOKED_DENY',
    'a revoked promoted child fails closed instead of being admitted',
  );
  assert.equal(executorCalls.count, 1, 'a revoked artifact never starts child work');
  assert.equal(
    fixture.authorities.admissionEffectJournal.getRecords().length,
    journalBefore,
    'the refusal produced zero K effect-journal records',
  );
  assert.equal(fixture.tools.calls.length, effectsBefore, 'the refusal dispatched zero K effects');
  assert.equal(decisionEvidenceRecords(fixture).length, evidenceBefore, 'the refusal appended zero decision records');
});

test('FR08-N: a K-denied cache-hit candidate is final — no hidden resolver retry, no K effect, and the cache stays reusable', async (t) => {
  const directory = tempDir('finality');
  const stack = openDecisionSourceStack(join(directory, 'resolver.sqlite'));
  const fixture = await openHostFixture(join(directory, 'host.sqlite'));
  t.after(() => {
    stack.close();
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await pinInstance(fixture);

  const ruleMatch = new ScriptedRule(
    { status: 'match', result: quoteResult('approve', { amount: 42 }) },
    RULE_PRODUCER,
  );
  const ruleMiss = new ScriptedRule({ status: 'no-match' }, RULE_PRODUCER);
  const dependencies = { artifacts: [HARNESS_PRODUCER, RULE_PRODUCER] };

  // Seed the exact cache through the deterministic rule source.
  const seeding = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:fr0812:f1', dependencies }),
    decisionPorts(stack, ruleMatch),
    sha256,
  );
  assert.equal(seeding.source, 'rule');
  const admittedSeed = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(seeding),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:f1' },
    }),
  );
  if (admittedSeed.status !== 'admitted') assert.fail('expected seeding turn admitted');

  // The same decision served from cache, rejected by the parent authority:
  // the pinned Hard Invariant plane (event amount 150 > cap 100) denies the
  // turn; guard-plane finality is the same S7 property, witnessed separately
  // at admission.test.ts 'guard rejection is final'.
  const cached = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:fr0812:f2', dependencies }),
    decisionPorts(stack, ruleMiss),
    sha256,
  );
  assert.equal(cached.source, 'exact-cache');
  const effectsBefore = fixture.tools.calls.length;
  const journalBefore = fixture.authorities.admissionEffectJournal.getRecords().length;

  const denied = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(cached),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:f2' },
      event: quoteEvent(150),
    }),
  );
  if (denied.status !== 'denied') assert.fail('expected the invariant-violating turn denied');
  assert.equal(denied.denial.reason, 'hard-invariant');
  assert.equal(denied.denial.resolver.source, 'exact-cache');
  assert.equal(fixture.tools.calls.length, effectsBefore, 'a denied turn dispatches no effects');
  assert.equal(
    fixture.authorities.admissionEffectJournal.getRecords().length,
    journalBefore,
    'a denied turn journals no effect records',
  );
  const denialEvidence = decisionEvidenceRecords(fixture).at(-1);
  if (denialEvidence === undefined) assert.fail('expected a denial evidence record');
  assert.equal((denialEvidence.payload as Record<string, JsonValue>)?.status, 'denied');
  assert.equal((denialEvidence.payload as Record<string, JsonValue>)?.resolver, 'exact-cache');

  // S7 finality: the resolver is data — the denial re-consulted nothing.
  assert.equal(ruleMiss.calls, 1);

  // The denial did not poison the cache: the same cached candidate admits
  // unchanged on the next compliant turn without any resolver re-run.
  const recheck = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:fr0812:f3', dependencies }),
    decisionPorts(stack, ruleMiss),
    sha256,
  );
  assert.equal(recheck.source, 'exact-cache');
  assert.equal(ruleMiss.calls, 2, 'exactly one resolver pass per turn, never a hidden retry');
  const readmitted = await fixture.assembly.admitTurn(
    makeRequest({
      resolved: asAdmissionResolved(recheck),
      turn: { kind: 'message', sourceMessageId: 'msg:fr0812:f3' },
    }),
  );
  if (readmitted.status !== 'admitted') assert.fail('expected the cache candidate readmitted');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:f1'), 'rule');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:f2'), 'exact-cache');
  assert.equal(resolverSourceOf(fixture, 'msg:fr0812:f3'), 'exact-cache');
});
