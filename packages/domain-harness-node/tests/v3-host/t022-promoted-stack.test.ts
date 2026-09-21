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
} from '@kaicreator/domain-harness';
import {
  authority,
  invokingContext,
  makeEnvelope,
  makeSlot,
  sha256,
  validationFor,
} from '../../../domain-harness/tests/promoted-child/helpers.js';
import {
  HARNESS_PRODUCER,
  ScriptedModel,
  ScriptedRule,
  finalResponse,
  makeInvocation,
  quoteResult,
  type QuoteDecisionResult,
} from '../../../domain-harness/tests/decision-resolver/helpers.js';
import { NodeSqliteDynamicChildPinStore } from '../../src/store/node-sqlite-promoted-stores.js';
import { NodeSqlitePromotedArtifactStore } from '../../src/store/node-sqlite-promoted-stores.js';
import {
  NodeSqliteExactSemanticCacheStore,
  NodeSqliteHarnessExecutionJournalStore,
} from '../../src/store/node-sqlite-execution-stores.js';
import { openAuthorityTestDatabase } from '../store/authority-test-helpers.js';

const NOW = '2026-09-21T12:00:00.000Z';
const ARTIFACT_ID = 'subworkflow:quote-review';

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-promoted-'));
  return directory;
}

interface PromotedStack {
  readonly registry: PromotedArtifactRegistry;
  readonly runtime: PromotedChildRuntime;
  readonly port: ReturnType<typeof createRegistryPromotedChildArtifactPort>;
  readonly pins: NodeSqliteDynamicChildPinStore;
  readonly cache: NodeSqliteExactSemanticCacheStore<QuoteDecisionResult>;
  readonly journal: NodeSqliteHarnessExecutionJournalStore;
  close(): void;
}

function openPromotedStack(
  path: string,
  producerInvalidation?: PromotedArtifactProducerInvalidationPort,
): PromotedStack {
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
  // Distinct semantic material per version (the marker changes the emitted
  // event set, hence the candidate content digest) while the control/body
  // contract stays the compilable default envelope.
  const material = makeEnvelope({
    events: ['QUOTE_PREPARED', `QUOTE_REVIEWED:${marker}`],
  });
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

const noMatchRule = () => new ScriptedRule({ status: 'no-match' });

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

/**
 * T-022 V11: a dynamic child pin binds the exact promoted digest at
 * selection time; moving the alias afterwards never rebinds the pin, and a
 * recovered child — including after process reopen — reuses the pinned digest.
 */
test('T-022 V11: alias movement after a dynamic child pin never rebinds the pinned digest', async (t) => {
  const directory = tempDir();
  const path = join(directory, 'promoted.sqlite');
  const stack = openPromotedStack(path);
  t.after(() => {
    stack.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const v1 = await promote(stack.registry, '1.0.0', 'quote');
  await stack.registry.bindAlias({
    artifactId: ARTIFACT_ID,
    alias: 'stable',
    artifact: v1.identity,
    expectedRevision: 0,
  });

  const slot = makeSlot();
  const invoking = invokingContext();
  const session = await stack.runtime.beginFreshExecution({
    selector: { kind: 'alias', artifactId: ARTIFACT_ID, alias: 'stable', expectedRevision: 1 },
    slot,
    invoking,
    pinnedAt: NOW,
  });
  assert.equal(session.pin.artifact.contentDigest, v1.identity.contentDigest);
  const storedPin = await stack.pins.get(dynamicChildSlotKey(slot));
  assert.equal(storedPin?.artifact.contentDigest, v1.identity.contentDigest);

  // Promote a newer version and move the alias; the pin must stay on v1.
  const v2 = await promote(stack.registry, '1.1.0', 'quote-v2');
  assert.notEqual(v2.identity.contentDigest, v1.identity.contentDigest);
  await stack.registry.bindAlias({
    artifactId: ARTIFACT_ID,
    alias: 'stable',
    artifact: v2.identity,
    expectedRevision: 1,
  });
  const selected = await stack.registry.selectAlias({
    artifactId: ARTIFACT_ID,
    alias: 'stable',
    expectedAuthority: authority(),
  });
  assert.equal(
    selected.body.identity.contentDigest,
    v2.identity.contentDigest,
    'fresh selections see the moved alias',
  );

  const recovered = await stack.runtime.recoverExecution({ slot, invoking });
  assert.equal(
    recovered.pin.artifact.contentDigest,
    v1.identity.contentDigest,
    'recovery reuses the exact pinned digest, never the moved alias',
  );

  stack.close();
  const reopened = openPromotedStack(path);
  const recoveredAfterReopen = await reopened.runtime.recoverExecution({ slot, invoking });
  assert.equal(
    recoveredAfterReopen.pin.artifact.contentDigest,
    v1.identity.contentDigest,
    'the pinned digest survives process reopen',
  );
  reopened.close();
});

/**
 * T-022 V12: revocation through the PromotedArtifactRegistry drives the
 * producer-cache invalidation hook into the SQLite semantic cache, the
 * revocation record is durable across reopen, and the resolver fails closed
 * on the revoked artifact instead of serving it from cache or child work.
 */
test('T-022 V12: revocation invalidates the SQLite producer cache and stays durable', async (t) => {
  const directory = tempDir();
  const path = join(directory, 'promoted.sqlite');
  const invalidated: string[] = [];
  let stack!: PromotedStack;
  const producerInvalidation: PromotedArtifactProducerInvalidationPort = {
    async invalidateProducedResults(artifact) {
      invalidated.push(`${artifact.artifactId}@${artifact.contentDigest}`);
      await stack.cache.invalidateByProducer(artifact, 'promoted-artifact-revocation');
    },
  };
  stack = openPromotedStack(path, producerInvalidation);
  t.after(() => {
    stack.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const body = await promote(stack.registry, '1.0.0', 'quote');
  const executorCalls = { count: 0 };
  const promoted = {
    selector: { kind: 'exact-digest' as const, artifact: body.identity },
    executor: promotedExecutor(executorCalls),
    journal: stack.journal,
  };
  const revocation = {
    readRevocation: (artifact: PromotedArtifactBody['identity']) =>
      stack.registry.readRevocation(artifact),
  };
  const ports = (): DecisionResolverPorts<QuoteDecisionResult> => ({
    rule: noMatchRule(),
    cacheStore: stack.cache,
    harnessRunner: createXStateHarnessMachineRunner(),
    promoted: { runtime: stack.runtime, artifactPort: stack.port, revocation },
  });

  const first = await resolveDecision(
    await makeInvocation({
      promoted,
      harness: harnessConfig(new ScriptedModel([]), stack.journal),
    }),
    ports(),
    sha256,
  );
  assert.equal(first.source, 'promoted-subworkflow');
  assert.equal(executorCalls.count, 1);

  const cached = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:2',
      promoted,
      harness: harnessConfig(new ScriptedModel([]), stack.journal),
    }),
    ports(),
    sha256,
  );
  assert.equal(cached.source, 'exact-cache', 'the SQLite cache serves the second decision');
  assert.equal(executorCalls.count, 1, 'cache hit never re-runs the child');

  const record = await stack.registry.revoke(body.identity, {
    recordId: 'revocation:v12',
    authorityRef: 'audit://revocation/v12',
    recordedAt: NOW,
    reason: 'unsafe-output',
  });
  assert.equal(record.cachePolicy, 'invalidate-produced-results');
  assert.deepEqual(invalidated, [`${ARTIFACT_ID}@${body.identity.contentDigest}`]);

  await assert.rejects(
    () =>
      makeInvocation({
        durableControlTurnId: 'turn:3',
        promoted,
        harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), stack.journal),
      }).then((invocation) => resolveDecision(invocation, ports(), sha256)),
    (error: unknown) =>
      error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_PROMOTED_REVOKED_DENY',
    'with the producer cache invalidated, the revoked artifact fails closed',
  );
  assert.equal(executorCalls.count, 1, 'a revoked artifact never starts child work');

  assert.equal((await stack.registry.readRevocation(body.identity))?.recordId, 'revocation:v12');

  stack.close();
  const reopened = openPromotedStack(path);
  assert.equal(
    (await reopened.registry.readRevocation(body.identity))?.recordId,
    'revocation:v12',
    'the revocation record is durable across process reopen',
  );
  stack = reopened;
  await assert.rejects(
    () =>
      makeInvocation({
        durableControlTurnId: 'turn:4',
        promoted,
        harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), reopened.journal),
      }).then((invocation) => resolveDecision(invocation, ports(), sha256)),
    (error: unknown) =>
      error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_PROMOTED_REVOKED_DENY',
    'the invalidation and revocation survive reopen — no stale cache resurrection',
  );
  reopened.close();
});
